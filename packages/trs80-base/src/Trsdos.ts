/**
 * Classes for handling TRSDOS diskettes.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/zaps-and-patches/#guidedtour
 * http://www.manmrk.net/tutorials/TRS80/Software/ldos/trs80/doc/prgguide.pdf
 */

import {concatByteArrays} from "teamten-ts-utils";
import {FloppyDisk, Side} from "./FloppyDisk";

// Number of bytes per dir entry in the sector.
const DIR_ENTRY_LENGTH = 48;

// Apparently this is 3, but somewhere else I read 6.
const SECTORS_PER_GRANULE = 3;

// The number of sectors on each track, numbered 1 to 18.
const SECTORS_PER_TRACK = 18;

// Copyright in the last 16 bytes of each directory sector.
const EXPECTED_TANDY = "(c) 1980 Tandy";

// For converting ASCII in binary code to strings. This defaults to UTF-8. They
// don't support ASCII directly, but we don't expect non-ASCII letter.s
const TEXT_DECODER = new TextDecoder();

// Password value that means "no password".
const NO_PASSWORD = 0xEF5C;

// Password value for "PASSWORD".
const PASSWORD = 0xD38F;

/**
 * Lowest three bits of the directory entry's flag.
 */
export enum TrsdosProtectionLevel {
    // Keep this values in this order, they match the bit values (0 to 7).
    FULL,
    REMOVE,
    RENAME,
    WRITE,
    UPDATE,
    READ,
    EXEC,
    NO_ACCESS,
}

/**
 * Gets the string version of the protection level enum.
 * @param level
 */
function trsdosProtectionLevelToString(level: TrsdosProtectionLevel): string {
    switch (level) {
        case TrsdosProtectionLevel.FULL:
            return "FULL";
        case TrsdosProtectionLevel.REMOVE:
            return "REMOVE";
        case TrsdosProtectionLevel.RENAME:
            return "RENAME";
        case TrsdosProtectionLevel.WRITE:
            return "WRITE";
        case TrsdosProtectionLevel.UPDATE:
            return "UPDATE";
        case TrsdosProtectionLevel.READ:
            return "READ";
        case TrsdosProtectionLevel.EXEC:
            return "EXEC";
        case TrsdosProtectionLevel.NO_ACCESS:
            return "NO_ACCESS";
        default:
            return "UNKNOWN";
    }
}

/**
 * A contiguous number of sectors for storing part of a file.
 */
export class TrsdosExtent {
    public readonly trackNumber: number;
    public readonly granuleOffset: number;
    public readonly granuleCount: number;

    constructor(trackNumber: number, granuleOffset: number, granuleCount: number) {
        this.trackNumber = trackNumber;
        this.granuleOffset = granuleOffset;
        this.granuleCount = granuleCount;
    }
}

/**
 * Decode an array of extents.
 *
 * @param binary byte we'll be pulling the extents from.
 * @param begin index of first extent in binary.
 * @param end index past last extent in binary.
 * @param trackFirst whether the track comes first or second.
 */
function decodeExtents(binary: Uint8Array, begin: number, end: number, trackFirst: boolean) {
    const extents: TrsdosExtent[] = [];

    for (let i = begin; i < end; i += 2) {
        if (binary[i] === 0xFF && binary[i + 1] === 0xFF) {
            break;
        }

        const trackNumber = binary[trackFirst ? i : i + 1];
        const granuleByte = binary[trackFirst ? i + 1 : i];
        const granuleOffset = granuleByte >> 5;
        const granuleCount = granuleByte & 0x1F;

        extents.push(new TrsdosExtent(trackNumber, granuleOffset, granuleCount));
    }

    return extents;
}

/**
 * The Granule Allocation Table sector info.
 */
export class TrsdosGatInfo {
    public readonly gat: Uint8Array;
    public readonly password: number;
    public readonly name: string;
    public readonly date: string;
    public readonly autoCommand: string;

    constructor(gat: Uint8Array, password: number, name: string, date: string, autoCommand: string) {
        this.gat = gat;
        this.password = password;
        this.name = name;
        this.date = date;
        this.autoCommand = autoCommand;
    }
}

/**
 * Converts a sector to a GAT object.
 */
function decodeGatInfo(binary: Uint8Array): TrsdosGatInfo {
    // One byte for each track.
    const gat = binary.subarray(0, 40);
    // Assume big endian.
    const password = (binary[0xCE] << 8) | binary[0xCF];
    const name = TEXT_DECODER.decode(binary.subarray(0xD0, 0xD8)).trim();
    const date = TEXT_DECODER.decode(binary.subarray(0xD8, 0xE0)).trim();
    const autoCommand = binary[0xE0] === 0x0D ? "" : TEXT_DECODER.decode(binary.subarray(0xE0)).trim();

    return new TrsdosGatInfo(gat, password, name, date, autoCommand);
}

/**
 * The Hash Allocation Table sector info.
 */
export class TrsdosHitInfo {
    public readonly hit: Uint8Array;
    public readonly systemFiles: TrsdosExtent[];

    constructor(hit: Uint8Array, systemFiles: TrsdosExtent[]) {
        this.hit = hit;
        this.systemFiles = systemFiles;
    }
}

/**
 * Decode the Hash Index Table sector.
 */
function decodeHitInfo(binary: Uint8Array): TrsdosHitInfo {
    // One byte for each file.
    const hit = binary.subarray(0, 80);
    const systemFiles = decodeExtents(binary, 0xE0, binary.length, false);

    return new TrsdosHitInfo(hit, systemFiles);
}

/**
 * Single (valid) directory entry for a file.
 */
export class TrsdosDirEntry {
    public readonly flags: number;
    public readonly month: number;
    public readonly year: number;
    public readonly eof: number;
    // Logical record length.
    public readonly lrl: number;
    public readonly filename: string;
    public readonly updatePassword: number;
    public readonly accessPassword: number;
    public readonly sectorCount: number;
    public readonly extents: TrsdosExtent[];

    constructor(flags: number, month: number, year: number, eof: number, lrl: number,
                filename: string, updatePassword: number, accessPassword: number,
                sectorCount: number, extents: TrsdosExtent[]) {

        this.flags = flags;
        this.month = month;
        this.year = year;
        this.eof = eof;
        this.lrl = lrl;
        this.filename = filename;
        this.updatePassword = updatePassword;
        this.accessPassword = accessPassword;
        this.sectorCount = sectorCount;
        this.extents = extents;
    }

    /**
     * Get the protection level for the file.
     */
    public getProtectionLevel(): TrsdosProtectionLevel {
        return (this.flags & 0x07) as TrsdosProtectionLevel;
    }

    /**
     * Whether the file is hidden in a directory listing.
     */
    public isHidden(): boolean {
        return (this.flags & 0x08) !== 0;
    }

    /**
     * Whether the file has an entry in the HIT table. This bit is set to 0 when
     * deleting a file.
     */
    public isActive(): boolean {
        return (this.flags & 0x10) !== 0;
    }

    /**
     * Whether there should be limitations to how many times you can copy this file.
     * Other docs (maybe for LDOS) say that this indicates "Partitioned Data Set".
     */
    public hasBackupLimitation(): boolean {
        return (this.flags & 0x20) !== 0;
    }

    /**
     * Whether this is a system file (as opposed to user file).
     */
    public isSystemFile(): boolean {
        return (this.flags & 0x40) !== 0;
    }

    /**
     * Whether this is an extended entry (as opposed to primary entry). Each entry can
     * only encode four extents, so subsequent extents are stored in extended entries.
     * TODO this says max four extents, but we have space for 13 extents in the binary.
     */
    public isExtendedEntry(): boolean {
        return (this.flags & 0x80) !== 0;
    }

    public getFlagsString(): string {
        const parts: string[] = [];

        parts.push(trsdosProtectionLevelToString(this.getProtectionLevel()));
        if (this.isHidden()) {
            parts.push("hidden");
        }
        if (!this.isActive()) {
            // Should never happen.
            parts.push("inactive");
        }
        if (this.hasBackupLimitation()) {
            parts.push("limits");
        }
        if (this.isSystemFile()) {
            parts.push("system");
        }
        if (this.isExtendedEntry()) {
            parts.push("extended");
        }

        return "[" + parts.join(",") + "]";
    }

    /**
     * Get the basename (part before the period) of the filename.
     */
    public getBasename(): string {
        return this.filename.substr(0, 8).trim();
    }

    /**
     * Get the extension of the filename, including the period. If the filename
     * has no extension, returns an empty string.
     */
    public getExtension(): string {
        const extension = this.filename.substr(8).trim();
        return extension === "" ? "" : "." + extension;
    }

    /**
     * Get a modern filename in the format of "foo.ext" or just "foo" if no extension is specified.
     */
    public getModernFilename(): string {
        return this.getBasename() + this.getExtension();
    }
}

/**
 * Decodes a directory entry from a 48-byte chunk, or undefined if the directory entry is empty.
 */
function decodeDirEntry(binary: Uint8Array): TrsdosDirEntry | undefined {
    const flags = binary[0];
    // Check "active" bit. Setting this to zero is how files are deleted. Also check empty filename.
    if ((flags & 0x10) === 0 || binary[5] === 0) {
        return undefined;
    }

    const month = binary[1];
    const year = binary[2];
    const eof = ((binary[3] - 1) & 0xFF) + 1; // 0 -> 256.
    const lrl = ((binary[4] - 1) & 0xFF) + 1; // 0 -> 256.
    const filename = TEXT_DECODER.decode(binary.subarray(5, 16)).trim();
    // Not sure how to convert these two into a number. Just use big endian.
    const updatePassword = (binary[16] << 8) | binary[17];
    const accessPassword = (binary[18] << 8) | binary[19];
    // Little endian.
    const sectorCount = (binary[21] << 8) | binary[20];
    const extents = decodeExtents(binary, 22, binary.length, true);

    return new TrsdosDirEntry(flags, month, year, eof, lrl, filename, updatePassword,
        accessPassword, sectorCount, extents);
}

/**
 * A decoded TRSDOS diskette.
 */
export class Trsdos {
    public readonly disk: FloppyDisk;
    public readonly gatInfo: TrsdosGatInfo;
    public readonly hitInfo: TrsdosHitInfo;
    public readonly dirEntries: TrsdosDirEntry[];

    constructor(disk: FloppyDisk, gatInfo: TrsdosGatInfo,
                hitInfo: TrsdosHitInfo, dirEntries: TrsdosDirEntry[]) {

        this.disk = disk;
        this.gatInfo = gatInfo;
        this.hitInfo = hitInfo;
        this.dirEntries = dirEntries;
    }

    /**
     * Read the binary for a file on the diskette.
     */
    public readFile(dirEntry: TrsdosDirEntry): Uint8Array {
        const parts: Uint8Array[] = [];

        console.log("---------- " + dirEntry.getModernFilename());

        let sectorCount = dirEntry.sectorCount;
        for (const extent of dirEntry.extents) {
            let trackNumber = extent.trackNumber;
            let sectorNumber = extent.granuleOffset*SECTORS_PER_GRANULE + 1;
            for (let i = 0;
                 i < extent.granuleCount*SECTORS_PER_GRANULE && sectorCount > 0;
                 i++, sectorNumber++, sectorCount--) {

                if (sectorNumber > SECTORS_PER_TRACK) {
                    // Move to the next track.
                    sectorNumber -= SECTORS_PER_TRACK;
                    trackNumber += 1;
                }
                console.log(`About to read ${trackNumber}, ${sectorNumber}`);
                const sector = this.disk.readSector(trackNumber, Side.FRONT, sectorNumber);
                if (sector === undefined) {
                    console.log(`Sector couldn't be read ${trackNumber}, ${sectorNumber}`);
                    // TODO
                } else {
                    // TODO check deleted?
                    if (sector.crcError) {
                        console.log("Sector has CRC error");
                    }
                    if (sector.deleted) {
                        // console.log("Sector " + sectorNumber + " is deleted");
                    }
                    parts.push(sector.data);
                }
            }
        }

        // Clip last sector.
        if (parts.length > 0) {
            console.log("Clipping from " + parts[parts.length - 1].length + " to " + dirEntry.eof);
            parts[parts.length - 1] = parts[parts.length - 1].subarray(0, dirEntry.eof);
        }

        return concatByteArrays(parts);
    }
}

/**
 * Decode a TRSDOS diskette, or return undefined if this does not look like such a diskette.
 */
export function decodeTrsdos(disk: FloppyDisk): Trsdos | undefined {
    const gatSector = disk.readSector(17, Side.FRONT, 1);
    if (gatSector === undefined || gatSector.deleted) {
        return undefined;
    }
    const gatInfo = decodeGatInfo(gatSector.data);
    const hitSector = disk.readSector(17, Side.FRONT, 2);
    if (hitSector === undefined || hitSector.deleted) {
        return undefined;
    }
    const hitInfo = decodeHitInfo(hitSector.data);

    const dirEntries: TrsdosDirEntry[] = [];
    for (let k = 0; k < 16; k++) {
        const dirSector = disk.readSector(17, Side.FRONT, k + 3);
        if (dirSector !== undefined) {
            const tandy = TEXT_DECODER.decode(dirSector.data.subarray(5*DIR_ENTRY_LENGTH)).trim();
            if (tandy !== EXPECTED_TANDY) {
                console.error(`Expected "${EXPECTED_TANDY}", got "${tandy}"`);
                // return undefined?
            }
            for (let j = 0; j < 5; j++) {
                const dirEntry = decodeDirEntry(dirSector.data.subarray(j*DIR_ENTRY_LENGTH, (j + 1)*DIR_ENTRY_LENGTH));
                if (dirEntry !== undefined) {
                    dirEntries.push(dirEntry);
                }
            }
        }
    }

    return new Trsdos(disk, gatInfo, hitInfo, dirEntries);
}
