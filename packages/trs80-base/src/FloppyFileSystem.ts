import {FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {decodeTrsdos, Trsdos} from "./Trsdos.js";
import {Cpm, decodeCpm} from "./Cpm.js";
import {decodeMicroDos, MicroDos} from "./MicroDos.js";

/**
 * A file on a floppy, whatever the operating system.
 */
export interface FloppyDirEntry {
    /**
     * The filename, with the given separator between the name and the extension
     * ("." for the host, "/" for TRSDOS). There's no separator if there's no extension.
     */
    getFilename(extensionSeparator: string): string;

    /**
     * The size of the file in bytes.
     */
    getSize(): number;

    /**
     * The file's date, or undefined if the operating system doesn't record one.
     */
    getDate(): Date | undefined;

    /**
     * Whether this is part of the operating system rather than a user file.
     */
    isSystemFile(): boolean;

    /**
     * Whether the operating system leaves this file out of directory listings.
     */
    isHidden(): boolean;
}

/**
 * The file system on a floppy, whatever the operating system. The directory entries
 * passed in must come from this file system's getDirEntries().
 */
export interface FloppyFileSystem<T extends FloppyDirEntry = FloppyDirEntry> {
    readonly disk: FloppyDisk;

    /**
     * Name and version of the operating system, such as "LDOS 5.3.1".
     */
    readonly nameAndVersion: string;

    /**
     * Every file on the disk, optionally leaving out the operating system's own.
     */
    getDirEntries(includeSystemFiles: boolean): T[];

    /**
     * The position of every sector of the file, in order.
     */
    getFileSectorPositions(dirEntry: T): SectorPosition[];

    /**
     * The contents of the file. Sectors that can't be read are zero-filled.
     */
    readFile(dirEntry: T): Uint8Array;
}

/**
 * Decode whichever file system the floppy has, or return undefined if we don't recognize one.
 *
 * @param disk the floppy.
 * @param cpmWholeRecords if true, CP/M files keep their whole 128-byte records instead of
 * ending text files at their first Ctrl-Z. See decodeCpm(). TRSDOS files aren't affected.
 */
export function decodeFloppyFileSystem(disk: FloppyDisk, cpmWholeRecords = false): Trsdos | Cpm | MicroDos | undefined {
    // TRSDOS first, because CP/M disks don't fool its decoder, but its disks could
    // conceivably have something that looks like a CP/M directory. MicroDOS last: its directory is
    // at a fixed place, so we rely on its decoder being strict.
    return decodeTrsdos(disk) ?? decodeCpm(disk, cpmWholeRecords) ?? decodeMicroDos(disk);
}
