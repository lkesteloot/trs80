import fs from "fs";
import {decodeFloppyFileSystem, decodeTrs80File, FloppyDisk, isFloppy, isHardDisk} from "trs80-base";
import {floppyInputFiles, InputFile} from "../InputFile.js";
import {pluralizeWithCount, ToolError} from "../utils.js";

/**
 * The open disk that every "disk" command works on. For now it's read-only; later it will
 * hold in-memory changes and save them.
 */
export class DiskSession {
    /** The host pathname of the image. */
    public readonly pathname: string;
    /** The decoded floppy. */
    public readonly floppy: FloppyDisk;
    /** The DOS on the floppy, or undefined if we didn't recognize one. */
    public readonly fileSystem: ReturnType<typeof decodeFloppyFileSystem>;

    /**
     * Use DiskSession.open() instead.
     */
    private constructor(pathname: string, floppy: FloppyDisk, fileSystem: ReturnType<typeof decodeFloppyFileSystem>) {
        this.pathname = pathname;
        this.floppy = floppy;
        this.fileSystem = fileSystem;
    }

    /**
     * Read and decode a floppy image. A floppy whose file system we don't recognize still opens,
     * since commands that work on the image itself don't need one.
     *
     * @param pathname the host pathname of the image.
     * @throws ToolError if the file can't be read, isn't a TRS-80 file we can decode, or isn't a floppy.
     */
    public static open(pathname: string): DiskSession {
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

        return new DiskSession(pathname, trs80File, decodeFloppyFileSystem(trs80File));
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
     * A one-line summary of the disk, such as "disk.dmk: Floppy disk (DMK), TRSDOS 2.3, 12 files".
     */
    public describe(): string {
        let description = this.pathname + ": " + this.floppy.getDescription();
        if (this.fileSystem === undefined) {
            description += ", no file system found";
        } else {
            // Users don't care about system files.
            description += ", " + this.fileSystem.nameAndVersion + ", " +
                pluralizeWithCount(this.fileSystem.getDirEntries(false).length, "file");
        }

        return description;
    }
}
