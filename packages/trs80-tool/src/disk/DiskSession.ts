import fs from "fs";
import {
    decodeFloppyFileSystem, decodeTrs80File, evaluateTrsdosWriteGate, FloppyDisk, isFloppy, isHardDisk, type KnownFloppyFileSystem, Trsdos,
    TrsdosGranuleMap, TrsdosWriteAccess, type TrsdosWriteGate,
} from "trs80-base";
import {assertNever} from "z80-base";
import {floppyInputFiles, InputFile} from "../InputFile.js";
import {pluralizeWithCount, ToolError, writeFileAtomically} from "../utils.js";

/**
 * The free space on a TRSDOS-family disk in whole KB, rounded down, such as "23 KB free".
 */
function freeKilobytesText(granuleMap: TrsdosGranuleMap): string {
    return Math.floor(granuleMap.getFreeByteCount()/1024).toLocaleString() + " KB free";
}

/**
 * How a session saves its changes. These come from the global options of the "disk" command.
 */
export interface DiskSessionOptions {
    /** Where to save changes instead of the image (--output), or undefined to replace the image. */
    outputPathname?: string | undefined;
    /** Whether to never write anything, which wins over outputPathname (--dry-run). */
    dryRun?: boolean | undefined;
}

/**
 * The open disk that every "disk" command works on. Commands change the in-memory floppy, and the
 * session writes the result once at the end (or when the user says "save"), so a chain of commands
 * either all takes effect or none of it does.
 */
export class DiskSession {
    /** The host pathname of the image. */
    public readonly pathname: string;
    /** The decoded floppy. */
    public readonly floppy: FloppyDisk;
    /** The DOS on the floppy, or undefined if we didn't recognize one. */
    public readonly fileSystem: KnownFloppyFileSystem | undefined;
    /** Cache for getGranuleMap(), null until the first call (undefined is a valid result). */
    private granuleMap: TrsdosGranuleMap | string | undefined | null = null;
    /** Cache for getWriteGate(), null until the first call (undefined is a valid result). */
    private writeGate: TrsdosWriteGate | undefined | null = null;
    /** Where the next save goes: the image, or the --output file (and then wherever the last save went). */
    private savePathname: string;
    /** Whether saving is pretended (--dry-run). */
    private readonly dryRun: boolean;
    /** Whether the floppy has been written since the last save. */
    private changed = false;
    /** Whether abort() was called, so that nothing is saved. */
    private aborted = false;

    /**
     * Use DiskSession.open() instead.
     */
    private constructor(pathname: string, floppy: FloppyDisk, fileSystem: KnownFloppyFileSystem | undefined,
                        options: DiskSessionOptions) {

        this.pathname = pathname;
        this.floppy = floppy;
        this.fileSystem = fileSystem;
        this.savePathname = options.outputPathname ?? pathname;
        this.dryRun = options.dryRun ?? false;
        floppy.onWrite.subscribe(() => {
            this.changed = true;
        });
    }

    /**
     * Read and decode a floppy image. A floppy whose file system we don't recognize still opens,
     * since commands that work on the image itself don't need one.
     *
     * @param pathname the host pathname of the image.
     * @param options where and whether to save changes.
     * @throws ToolError if the file can't be read, isn't a TRS-80 file we can decode, or isn't a floppy.
     */
    public static open(pathname: string, options: DiskSessionOptions = {}): DiskSession {
        let binary: Uint8Array;
        try {
            binary = fs.readFileSync(pathname);
        } catch (e: any) {
            throw new ToolError("Can't open \"" + pathname + "\": " + e.message);
        }

        const trs80File = decodeTrs80File(binary, { filename: pathname });
        if (trs80File.error !== undefined) {
            throw new ToolError("Can't open \"" + pathname + "\": " + trs80File.error);
        }
        if (isHardDisk(trs80File)) {
            throw new ToolError("Can't open \"" + pathname + "\": the disk command doesn't handle hard disks yet");
        }
        if (!isFloppy(trs80File)) {
            throw new ToolError("Can't open \"" + pathname + "\": it's not a floppy image");
        }

        return new DiskSession(pathname, trs80File, decodeFloppyFileSystem(trs80File), options);
    }

    /**
     * Whether the floppy has been changed since it was opened or last saved.
     */
    public hasChanges(): boolean {
        return this.changed;
    }

    /**
     * Write the floppy's bytes to where the changes go (the image, or the --output file), if there are changes.
     * The write replaces the whole file at once, so a failure leaves the old file. After this, later saves go
     * to the same file. With --dry-run this writes nothing and the changes stay pending.
     *
     * @returns the pathname written, or undefined if nothing was written because there were no changes
     * (or because of --dry-run).
     * @throws ToolError if the file can't be written.
     */
    public save(): string | undefined {
        if (!this.changed || this.dryRun) {
            return undefined;
        }

        try {
            writeFileAtomically(this.savePathname, this.floppy.binary);
        } catch (e: any) {
            throw new ToolError("Can't save \"" + this.savePathname + "\": " + (e.message ?? String(e)));
        }
        this.changed = false;

        return this.savePathname;
    }

    /**
     * Save the changes and say so, or with --dry-run say what would have been saved (and forget the changes).
     * Does nothing after abort().
     *
     * @param announceNoChanges whether to say so when there's nothing to save, as the "save" command does.
     * @throws ToolError if the file can't be written.
     */
    public saveAndReport(announceNoChanges: boolean): void {
        if (this.aborted) {
            return;
        }

        if (!this.changed) {
            if (announceNoChanges) {
                console.log("No changes to save.");
            }
        } else if (this.dryRun) {
            console.log("Not saved (--dry-run): " + this.savePathname + " would have changed.");
            this.changed = false;
        } else {
            const savedPathname = this.save();
            console.log("Saved " + savedPathname + ".");
        }
    }

    /**
     * Give up on the changes: nothing is saved from now on, including at the end of the run.
     *
     * @returns the pathname whose changes were discarded, or undefined if there were none.
     */
    public abort(): string | undefined {
        const discardedPathname = this.changed ? this.savePathname : undefined;
        this.aborted = true;
        this.changed = false;

        return discardedPathname;
    }

    /**
     * The files on the disk, as input files so that commands can reuse the listing and extraction code.
     *
     * @param includeSystemFiles whether to include system files.
     * @throws ToolError if the disk has no file system we recognize.
     */
    public getInputFiles(includeSystemFiles: boolean): InputFile[] {
        if (this.fileSystem === undefined) {
            throw new ToolError("Can't find a DOS directory on \"" + this.pathname + "\"");
        }

        return floppyInputFiles(this.fileSystem, includeSystemFiles);
    }

    /**
     * How every granule of a TRSDOS-family disk is used. It's computed on the first call and then kept.
     *
     * @returns the map, a string saying why one can't be made, or undefined if the disk has no
     * file system or its file system isn't TRSDOS-family.
     */
    public getGranuleMap(): TrsdosGranuleMap | string | undefined {
        if (this.granuleMap === null) {
            this.granuleMap = this.fileSystem instanceof Trsdos ? TrsdosGranuleMap.make(this.fileSystem) : undefined;
        }

        return this.granuleMap;
    }

    /**
     * Whether the TRSDOS-family file system on the disk is safe to write, and why not. It's computed on
     * the first call and then kept.
     *
     * @returns the gate, or undefined if the disk has no file system or its file system isn't TRSDOS-family.
     */
    public getWriteGate(): TrsdosWriteGate | undefined {
        if (this.writeGate === null) {
            this.writeGate = this.fileSystem instanceof Trsdos ? evaluateTrsdosWriteGate(this.fileSystem) : undefined;
        }

        return this.writeGate;
    }

    /**
     * Why the disk's file system can't be written, in one or more sentences, or undefined if it can.
     */
    public getReadOnlyReason(): string | undefined {
        if (this.fileSystem === undefined) {
            return "No file system was found on the disk.";
        }
        const gate = this.getWriteGate();
        if (gate === undefined) {
            return "Writing " + this.fileSystem.nameAndVersion + " disks isn't supported.";
        }
        switch (gate.access) {
            case TrsdosWriteAccess.WRITABLE:
                return undefined;
            case TrsdosWriteAccess.REPAIR_ONLY:
            case TrsdosWriteAccess.READ_ONLY:
                return gate.blockers.map(blocker => blocker.message).join(" ");
            default:
                assertNever(gate.access);
        }
    }

    /**
     * The space available for new files, such as "112 KB free (90 granules of 1,280 bytes each)".
     *
     * @throws ToolError if the disk has no file system, if its file system isn't TRSDOS-family, or
     * if the granule map can't be made.
     */
    public getFreeSpaceText(): string {
        if (this.fileSystem === undefined) {
            throw new ToolError("Can't find a DOS directory on \"" + this.pathname + "\"");
        }
        const granuleMap = this.getGranuleMap();
        if (granuleMap === undefined) {
            throw new ToolError("Free space isn't known for " + this.fileSystem.nameAndVersion + " disks yet");
        }
        if (typeof granuleMap === "string") {
            throw new ToolError("Can't find the free space: " + granuleMap);
        }

        const trsdos = granuleMap.trsdos;
        const granuleBytes = trsdos.sectorsPerGranule*trsdos.geometry.modalDataSectorSize;
        const freeGranules = granuleMap.getFreeGranuleCount();
        return freeKilobytesText(granuleMap) + " (" +
            pluralizeWithCount(freeGranules, "granule") + " of " + granuleBytes.toLocaleString() + " bytes" +
            (freeGranules === 1 ? "" : " each") + ")";
    }

    /**
     * A one-line summary of the disk, such as "disk.dmk: Floppy disk (DMK), TRSDOS 2.3, 12 files, 23 KB free".
     */
    public describe(): string {
        let description = this.pathname + ": " + this.floppy.getDescription();
        if (this.fileSystem === undefined) {
            description += ", no file system found";
        } else {
            // Users don't care about system files.
            description += ", " + this.fileSystem.nameAndVersion + ", " +
                pluralizeWithCount(this.fileSystem.getDirEntries(false).length, "file");

            // The free space is only known for some file systems, and not if the GAT is unreadable.
            const granuleMap = this.getGranuleMap();
            if (granuleMap !== undefined && typeof granuleMap !== "string") {
                description += ", " + freeKilobytesText(granuleMap);
            }
        }

        return description;
    }
}
