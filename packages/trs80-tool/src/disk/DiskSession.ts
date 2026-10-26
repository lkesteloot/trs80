import fs from "fs";
import {
    decodeFloppyFileSystem, decodeTrs80File, decodeTrsdos, evaluateTrsdosWriteGate, FloppyDisk, isFloppy,
    isHardDisk, type KnownFloppyFileSystem, SectorOverlay, Trsdos, TrsdosGranuleMap, type TrsdosRuleSet, TrsdosWriteAccess,
    TrsdosWriteError, type TrsdosWriteGate, TrsdosWriter,
} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {floppyInputFiles, InputFile} from "../InputFile.js";
import {pluralizeWithCount, ToolError, writeFileAtomically} from "../utils.js";

/**
 * The free space on a TRSDOS-family disk in whole KB, rounded down, such as "23 KB free".
 */
function freeKilobytesText(granuleMap: TrsdosGranuleMap): string {
    return Math.floor(granuleMap.getFreeByteCount()/1024).toLocaleString() + " KB free";
}

/**
 * Why a command wants to write to the disk, which decides whether a damaged file system blocks it.
 */
export enum DiskWritePurpose {
    /** An ordinary change, such as removing or adding a file. Damage blocks it. */
    CHANGE,

    /** A repair of damage, which may write to a file system that is damaged but otherwise sound. */
    REPAIR,
}

/**
 * The result of {@link decideWrite}.
 */
export type DiskWriteDecision =
    /** The write may go ahead. The warning, if any, should be shown first (the write was forced). */
    { allowed: true, warning: string | undefined } |
    /** The write may not go ahead, for the reason in the error message. */
    { allowed: false, error: string };

/**
 * Decide whether a command may write to a disk. (Exported for tests.)
 *
 * @param gate the write gate of the disk's TRSDOS-family file system, or undefined if the file
 * system is some other family.
 * @param fileSystemName the name and version of the disk's file system, for the message when the gate is
 * undefined.
 * @param purpose why the command wants to write.
 * @param force whether the user gave --force, which overrides every blocker that is forceable.
 */
export function decideWrite(gate: TrsdosWriteGate | undefined, fileSystemName: string, purpose: DiskWritePurpose,
                            force: boolean): DiskWriteDecision {

    if (gate === undefined) {
        return { allowed: false, error: "Writing " + fileSystemName + " disks isn't supported." };
    }

    switch (gate.access) {
        case TrsdosWriteAccess.WRITABLE:
            return { allowed: true, warning: undefined };
        case TrsdosWriteAccess.REPAIR_ONLY:
            switch (purpose) {
                case DiskWritePurpose.REPAIR:
                    return { allowed: true, warning: undefined };
                case DiskWritePurpose.CHANGE:
                    break;
                default:
                    assertNever(purpose);
            }
            break;
        case TrsdosWriteAccess.READ_ONLY:
            break;
        default:
            assertNever(gate.access);
    }

    // Something stands in the way. Only --force can get past it, and only if all of it can be forced.
    const messages = gate.blockers.map(blocker => blocker.message).join(" ");
    const allForceable = gate.blockers.every(blocker => blocker.forceable);
    if (force && allForceable) {
        return { allowed: true, warning: "Writing anyway (--force): " + messages };
    }

    return {
        allowed: false,
        error: "Can't write to this disk: " + messages + (allForceable ? " Use --force to write anyway." : ""),
    };
}

/**
 * How a session saves its changes. These come from the global options of the "disk" command.
 */
export interface DiskSessionOptions {
    /** Where to save changes instead of the image (--output), or undefined to replace the image. */
    outputPathname?: string | undefined;
    /** Whether to never write anything, which wins over outputPathname (--dry-run). */
    dryRun?: boolean | undefined;
    /** The DOS whose rules to write by (--dos), or undefined to go by what the disk says. */
    ruleSet?: TrsdosRuleSet | undefined;
    /** Whether to write despite blockers that can be overridden (--force). */
    force?: boolean | undefined;
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
    /** The DOS on the floppy, or undefined if we didn't recognize one. Decoded again after each change. */
    private currentFileSystem: KnownFloppyFileSystem | undefined;
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
    /** The DOS rules the user named (--dos), or undefined. */
    private readonly ruleSet: TrsdosRuleSet | undefined;
    /** Whether the user allows overriding blockers (--force). */
    private readonly force: boolean;
    /** Whether requireWritable() has already shown the warning about forcing. */
    private forceWarningShown = false;

    /**
     * Use DiskSession.open() instead.
     */
    private constructor(pathname: string, floppy: FloppyDisk, fileSystem: KnownFloppyFileSystem | undefined,
                        options: DiskSessionOptions) {

        this.pathname = pathname;
        this.floppy = floppy;
        this.currentFileSystem = fileSystem;
        this.savePathname = options.outputPathname ?? pathname;
        this.dryRun = options.dryRun ?? false;
        this.ruleSet = options.ruleSet;
        this.force = options.force ?? false;
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
     * @throws ToolError if the file can't be read, isn't a TRS-80 file we can decode, isn't a floppy, or
     * if options.ruleSet is given and the file system isn't TRSDOS-family.
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

        const fileSystem = decodeFloppyFileSystem(trs80File);
        if (options.ruleSet !== undefined && !(fileSystem instanceof Trsdos)) {
            throw new ToolError("--dos only applies to TRSDOS-family disks");
        }

        return new DiskSession(pathname, trs80File, fileSystem, options);
    }

    /**
     * The DOS on the floppy, or undefined if we didn't recognize one. After a change to the
     * disk this is a new object, so don't hold on to the old one.
     */
    public get fileSystem(): KnownFloppyFileSystem | undefined {
        return this.currentFileSystem;
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
     * Whether the TRSDOS-family file system on the disk is safe to write, and why not, going by the rules of
     * the DOS the user named (--dos) if any. It's computed on the first call and then kept.
     *
     * @returns the gate, or undefined if the disk has no file system or its file system isn't TRSDOS-family.
     */
    public getWriteGate(): TrsdosWriteGate | undefined {
        if (this.writeGate === null) {
            this.writeGate = this.fileSystem instanceof Trsdos ? evaluateTrsdosWriteGate(this.fileSystem, this.ruleSet) : undefined;
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
     * Check that a command may write to the disk, before it changes anything. With --force, blockers that
     * can be overridden don't stop it, and a warning saying so is printed (the first time only).
     *
     * @param purpose why the command wants to write.
     * @throws ToolError if the disk has no file system, or the write isn't allowed.
     */
    public requireWritable(purpose: DiskWritePurpose): void {
        if (this.fileSystem === undefined) {
            throw new ToolError("Can't find a DOS directory on \"" + this.pathname + "\"");
        }

        const decision = decideWrite(this.getWriteGate(), this.fileSystem.nameAndVersion, purpose, this.force);
        if (!decision.allowed) {
            throw new ToolError(decision.error);
        }
        if (decision.warning !== undefined && !this.forceWarningShown) {
            console.log(colors.warning(decision.warning));
            this.forceWarningShown = true;
        }
    }

    /**
     * Change the disk's TRSDOS-family file system. The change is made through a {@link TrsdosWriter} on a
     * {@link SectorOverlay}, so it is all or nothing: the writer verifies the result, and only then are the
     * changed sectors written to the in-memory floppy, which counts as a change to be saved. Afterwards the
     * file system is decoded again, so {@link fileSystem} and the caches reflect the new disk.
     *
     * @param purpose why the command wants to write, which decides whether the disk's state allows it.
     * @param change makes the changes with the writer. If it makes none then nothing is written.
     * @throws ToolError if the disk can't be written, or the writer refuses or can't verify the change, in
     * which case the disk is unchanged.
     */
    public changeTrsdos(purpose: DiskWritePurpose, change: (writer: TrsdosWriter) => void): void {
        this.requireWritable(purpose);
        this.clearWriteProtection();

        const sessionTrsdos = this.currentFileSystem;
        if (!(sessionTrsdos instanceof Trsdos)) {
            // requireWritable() has already refused anything that isn't TRSDOS-family.
            throw new ToolError("Writing " + (sessionTrsdos?.nameAndVersion ?? "this") + " disks isn't supported.");
        }

        const overlay = new SectorOverlay(this.floppy);
        let committed = false;
        try {
            const trsdos = decodeTrsdos(overlay);
            if (trsdos === undefined || !DiskSession.sameLayout(sessionTrsdos, trsdos)) {
                throw new ToolError("Can't change this disk: it doesn't decode the same way when it is prepared for writing.");
            }

            const writer = new TrsdosWriter(trsdos);
            change(writer);
            if (writer.hasChanges()) {
                writer.flush();
                overlay.commit();
                committed = true;
            }
        } catch (e) {
            overlay.discard();
            if (e instanceof TrsdosWriteError) {
                throw new ToolError(e.message);
            }
            throw e;
        }

        if (committed) {
            this.currentFileSystem = decodeFloppyFileSystem(this.floppy);
            this.granuleMap = null;
            this.writeGate = null;
            if (!(this.currentFileSystem instanceof Trsdos)) {
                // The writer verified the change, so this shouldn't happen. But the floppy in memory
                // has already changed, so make sure that nothing saves it.
                this.abort();
                throw new ToolError("After the change, the disk's file system isn't recognized, so nothing " +
                    "will be saved.");
            }
        }
    }

    /**
     * Let the floppy be written. The gate lets a write-protected image through only with --force, and
     * then it's the user's call, so clear the write-protect state in memory. The image's own flag stays
     * in its header, so the saved image is still marked write-protected. Formats that can't be written at
     * all stay write-protected, and the write fails with that message.
     */
    private clearWriteProtection(): void {
        this.floppy.setMountedWriteProtected(false);
        this.floppy.clearImageWriteProtected();
    }

    /**
     * Whether two decodings of the same disk have the same layout, using the fields that
     * {@link TrsdosWriter} checks after a change.
     */
    private static sameLayout(a: Trsdos, b: Trsdos): boolean {
        return a.version === b.version &&
            a.allocationSides === b.allocationSides &&
            a.granulesPerLump === b.granulesPerLump &&
            a.sectorsPerGranule === b.sectorsPerGranule &&
            a.dirLumpNumber === b.dirLumpNumber &&
            a.granulesPerDir === b.granulesPerDir &&
            a.firstDataCylinder === b.firstDataCylinder &&
            a.hitIgnored === b.hitIgnored &&
            a.lumpCount === b.lumpCount;
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
