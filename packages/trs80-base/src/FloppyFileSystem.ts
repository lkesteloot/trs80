import {FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {DiskVolume} from "./DiskVolume.js";
import type {FloppyFileContents} from "./FileDamage.js";
import {decodeTrsdos, Trsdos} from "./Trsdos.js";
import {Cpm, decodeCpm} from "./Cpm.js";
import {decodeMicroDos, MicroDos} from "./MicroDos.js";
import {decodeModelIITrsdos, ModelIITrsdos} from "./ModelIITrsdos.js";
import {decodeTrsdosII, TrsdosII} from "./TrsdosII.js";
import {decodeUcsdPascal, UcsdPascal} from "./UcsdPascal.js";
import {decodeXenixTar, XenixTar} from "./XenixTar.js";

/**
 * A file on a floppy, whatever the operating system.
 */
export interface FloppyDirEntry {
    /**
     * The filename, with the given separator between the name and the extension
     * ("." for the host, "/" for TRSDOS). There's no separator if there's no extension.
     * On file systems with directories (Xenix tar), the name is a path whose directories
     * are separated by "/", as in "usr/bin/vi", whatever the extension separator.
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
    readonly disk: DiskVolume;

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
     * The contents of the file. Sectors that can't be read are zero-filled. This doesn't
     * report any damage to the file; use readFileWithDamage() for that.
     */
    readFile(dirEntry: T): Uint8Array;

    /**
     * The contents of the file, as with readFile(), along with a description of what was
     * wrong with it: sectors that couldn't be read or had CRC errors, and problems with its
     * directory entries.
     */
    readFileWithDamage(dirEntry: T): FloppyFileContents;
}

/**
 * Decode whichever file system the floppy has, or return undefined if we don't recognize one.
 *
 * @param disk the floppy.
 * @param cpmWholeRecords if true, CP/M files keep their whole 128-byte records instead of
 * ending text files at their first Ctrl-Z. See decodeCpm(). TRSDOS files aren't affected.
 */
export function decodeFloppyFileSystem(disk: FloppyDisk, cpmWholeRecords = false):
    Trsdos | Cpm | MicroDos | ModelIITrsdos | TrsdosII | UcsdPascal | XenixTar | undefined {

    // The Model II's TRSDOS-II and TRSDOS first: their structures are at known places and their
    // decoders are strict, while the TRSDOS decoder searches the whole disk and can find a
    // directory-like sector on their disks. Then TRSDOS, because CP/M disks don't fool its
    // decoder, but its disks could conceivably have something that looks like a CP/M directory.
    // Xenix tar, MicroDOS, and UCSD Pascal last: their data is at a fixed place, so we rely on
    // their decoders being strict.
    return decodeTrsdosII(disk) ??
        decodeModelIITrsdos(disk) ??
        decodeTrsdos(disk) ??
        decodeCpm(disk, cpmWholeRecords) ??
        decodeXenixTar(disk) ??
        decodeMicroDos(disk) ??
        decodeUcsdPascal(disk);
}
