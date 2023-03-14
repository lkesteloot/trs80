/**
 * Classes for handling TRSDOS diskettes.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/zaps-and-patches/#guidedtour
 * http://www.manmrk.net/tutorials/TRS80/Software/ldos/trs80/doc/prgguide.pdf
 * https://www.tim-mann.org/trs80/doc/ld51man3.pdf
 */

import {concatByteArrays} from "teamten-ts-utils";
import {Density, FloppyDisk, FloppyDiskGeometry, numberToSide, Side} from "./FloppyDisk.js";
import {toHexByte} from "z80-base";

// Print extra debugging information.
const DEBUG = false;

// Whether to check the high bits of the GAT table entries. I keep seeing floppies with wrong values
// here, so disabling this. Those bits were probably not accessed anyway, so it's probably not out of
// spec to be wrong.
const CHECK_GAT_HIGH_BITS = false;

// Apparently this is constant in TRSDOS.
const BYTES_PER_SECTOR = 256;

// Copyright in the last 16 bytes of each directory sector, for Model III TRSDOS.
const EXPECTED_TANDY = "(c) 1980 Tandy";

// Password value that means "no password".
const NO_PASSWORD = 0xEF5C;

// Password value for "PASSWORD".
const PASSWORD = 0xD38F;

// Various TRSDOS versions, labeled after the model they were made for.
enum TrsdosVersion {
    MODEL_1,  // TRSDOS 2.3
    MODEL_3,  // TRSDOS 1.3
    MODEL_4,  // TRSDOS 6 or LDOS
}

/**
 * Convert the enum to a string.
 */
function trsdosVersionToString(trsdosVersion: TrsdosVersion): string {
    switch (trsdosVersion) {
        case TrsdosVersion.MODEL_1:
            return "Model I";

        case TrsdosVersion.MODEL_3:
            return "Model III";

        case TrsdosVersion.MODEL_4:
            return "Model 4";
    }
}

/**
 * Represents the position of a directory entry.
 */
class DirEntryPosition {
    // Zero-based sector index into the directory track. Sector 0 is GAT, 1 is HIT.
    public readonly sectorIndex: number;
    // Zero-based index of the directory entry into the sector.
    public readonly dirEntryIndex: number;

    constructor(sectorIndex: number, dirEntryIndex: number) {
        this.sectorIndex = sectorIndex;
        this.dirEntryIndex = dirEntryIndex;
    }

    /**
     * Make a string that represents this object, to us as a key in a Map.
     */
    public asKey(): string {
        return this.sectorIndex + "," + this.dirEntryIndex;
    }
}

/**
 * The Model III version of TRSDOS is pretty different than the Model I and 4 version.
 */
function isModel3(version: TrsdosVersion): version is TrsdosVersion.MODEL_3 {
    return version === TrsdosVersion.MODEL_3;
}

/**
 * Decodes binary into an ASCII string. Returns undefined if any non-ASCII value is
 * found in the string, where "ASCII" is defined as being in the range 32 to 126 inclusive.
 */
function decodeAscii(binary: Uint8Array, trim: boolean = true): string | undefined {
    const parts: string[] = [];

    for (const b of binary) {
        if (b === 0x0D || b === 0x00) {
            // Auto command ends with carriage return, but also support nul.
            break;
        }
        if (b < 32 || b >= 127) {
            return undefined;
        }

        parts.push(String.fromCodePoint(b));
    }

    let s = parts.join("");

    if (trim) {
        s = s.trim();
    }

    return s;
}

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
 */
export function trsdosProtectionLevelToString(level: TrsdosProtectionLevel, version: TrsdosVersion): string {
    switch (level) {
        case TrsdosProtectionLevel.FULL:
            return "FULL";
        case TrsdosProtectionLevel.REMOVE:
            return isModel3(version) ? "REMOVE" : "KILL";
        case TrsdosProtectionLevel.RENAME:
            return "RENAME";
        case TrsdosProtectionLevel.WRITE:
            return isModel3(version) ? "WRITE" : "UNUSED";
        case TrsdosProtectionLevel.UPDATE:
            return isModel3(version) ? "UPDATE" : "WRITE";
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
 * @param geometry the disk geometry, for error checking.
 * @param version version of TRSDOS.
 * @param trackFirst whether the track comes first or second.
 */
function decodeExtents(binary: Uint8Array, begin: number, end: number,
                       geometry: FloppyDiskGeometry,
                       version: TrsdosVersion,
                       trackFirst: boolean): TrsdosExtent[] | undefined {

    const extents: TrsdosExtent[] = [];

    for (let i = begin; i < end; i += 2) {
        if (binary[i] === 0xFF && binary[i + 1] === 0xFF) {
            break;
        }

        const trackNumber = binary[trackFirst ? i : i + 1];
        const granuleByte = binary[trackFirst ? i + 1 : i];
        const granuleOffset = granuleByte >> 5;
        const granuleCount = (granuleByte & 0x1F) + (isModel3(version) ? 0 : 1);

        if (!geometry.isValidTrackNumber(trackNumber)) {
            // Not a TRSDOS disk.
            if (DEBUG) console.log("Invalid extent: ", i, trackNumber, granuleByte, granuleOffset, granuleCount)
            return undefined;
        }

        extents.push(new TrsdosExtent(trackNumber, granuleOffset, granuleCount));
    }

    return extents;
}

/**
 * The Granule Allocation Table sector info.
 */
export class TrsdosGatInfo {
    // One byte for every track. Each bit indicates a free (0) or used (1) granule, with bit 0 corresponding
    // to first granule in track, etc. In Model 1/4, higher bits are 1, in Model 3 they're zero.
    public readonly gat: Uint8Array;

    // All models:
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

    /**
     * Check various things about the GAT to see if it's valid.
     */
    public isValid(granulesPerTrack: number, version: TrsdosVersion): boolean {
        if (CHECK_GAT_HIGH_BITS) {
            // The mask for the unused bits in the GAT, and the value we expect to see there.
            const mask = (0xFF << granulesPerTrack) & 0xFF;
            const expectedValue = isModel3(version) ? 0x00 : mask;

            // Top bits don't map to anything, so must be zero (Model 3) or one (Model 1/4).
            let trackNumber = 0;
            for (const g of this.gat) {
                // Skip the first track, I don't think it actually stores granules (it's the boot sector, etc.).
                if (trackNumber !== 0 && (g & mask) !== expectedValue) {
                    if (DEBUG) console.log("GAT: high bits are not correct: 0x" + toHexByte(g) +
                        " track " + trackNumber + " with " + granulesPerTrack + " granules per track");
                    return false;
                }
                trackNumber += 1;
            }
        }

        return true;
    }
}

/**
 * Extra info for TRSDOS 1 and 4.
 */
export class Trsdos14GatInfo extends TrsdosGatInfo {
    // Encoded in hex, e.g., 0x51 means LDOS 5.1.
    public readonly osVersion: number;
    public readonly cylinderCount: number;
    public readonly granulesPerTrack: number;
    public readonly sideCount: number;
    public readonly density: Density;

    constructor(gat: Uint8Array, password: number, name: string, date: string, autoCommand: string,
                osVersion: number, cylinderCount: number, granulesPerTrack: number,
                sideCount: number, density: Density) {

        super(gat, password, name, date, autoCommand);
        this.osVersion = osVersion;
        this.cylinderCount = cylinderCount;
        this.granulesPerTrack = granulesPerTrack;
        this.sideCount = sideCount;
        this.density = density;
    }
}

/**
 * Converts a sector to a GAT object, or a string with an error if we don't think this is a GAT sector.
 */
function decodeGatInfo(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosGatInfo | string {
    // One byte for each track. Each bit is a granule, 0 means free and 1 means used.
    const gat = binary.subarray(0, geometry.numTracks());

    // Assume big endian.
    const password = (binary[0xCE] << 8) | binary[0xCF];
    const name = decodeAscii(binary.subarray(0xD0, 0xD8));
    const date = decodeAscii(binary.subarray(0xD8, 0xE0));

    // This is only before version 6. At 6 they moved this elsewhere and put other things here that we ignore.
    const autoCommand = decodeAscii(binary.subarray(0xE0));

    // Implies that this is not a TRSDOS disk.
    if (name === undefined) {
        return "name is missing";
    }
    if (date === undefined) {
        return "date is missing";
    }
    if (autoCommand === undefined) {
        return "auto command is missing";
    }

    if (isModel3(version)) {
        return new TrsdosGatInfo(gat, password, name, date, autoCommand);
    } else {
        // Additional fields for Model 1 and 4.
        const osVersion = binary[0xCB];
        const cylinderCount = binary[0xCC] + 35;
        const flags = binary[0xCD];
        // Docs say granules per cylinder, but VTK treats this as granules per track.
        const granulesPerTrack = (flags & 0x07) + 1;
        const sideCount = (flags & 0x20) !== 0 ? 2 : 1;
        const density = (flags & 0x40) !== 0 ? Density.DOUBLE : Density.SINGLE;
        // TODO data disks only reserve 2 entries for system files, not 16. But I don't know which two!
        const isDataDisk = osVersion === 0x60 && (flags & 0x80) !== 0;

        return new Trsdos14GatInfo(gat, password, name, date, autoCommand,
            osVersion, cylinderCount, granulesPerTrack, sideCount, density);
    }
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
 * Decode the Hash Index Table sector, or undefined if we don't think this is a TRSDOS disk.
 */
function decodeHitInfo(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosHitInfo | undefined {
    // One byte for each file.
    const hit = binary.subarray(0, isModel3(version) ? 80 : 256);

    // There are 16 extents to read for the system files.
    const systemFiles = isModel3(version)
        ? decodeExtents(binary, 0xE0, binary.length, geometry, version, false)
        : [];
    if (systemFiles === undefined) {
        if (DEBUG) console.log("Extents in HIT are invalid");
        return undefined;
    }

    return new TrsdosHitInfo(hit, systemFiles);
}

/**
 * Single (valid) directory entry for a file.
 */
export class TrsdosDirEntry {
    public readonly version: TrsdosVersion;
    public readonly flags: number;
    public readonly day: number;
    public readonly month: number;
    public readonly year: number;
    public readonly lastSectorSize: number;
    // Logical record length.
    public readonly lrl: number;
    public readonly rawFilename: string;
    public readonly updatePassword: number;
    public readonly accessPassword: number;
    // This is the number of *full* sectors. It doesn't include a possible
    // additional partial sector of "lastSectorSize" bytes.
    public readonly sectorCount: number;
    // HIT entry of the extended directory entry, if any.
    public readonly nextHit: number | undefined;
    // Link to next (extended) directory entry.
    public nextDirEntry: TrsdosDirEntry | undefined = undefined;
    public readonly extents: TrsdosExtent[];

    constructor(version: TrsdosVersion, flags: number, day: number, month: number, year: number,
                lastSectorSize: number, lrl: number,
                filename: string, updatePassword: number, accessPassword: number,
                sectorCount: number, nextHit: number | undefined, extents: TrsdosExtent[]) {

        this.version = version;
        this.flags = flags;
        this.day = day;
        this.month = month;
        this.year = year;
        this.lastSectorSize = lastSectorSize;
        this.lrl = lrl;
        this.rawFilename = filename;
        this.updatePassword = updatePassword;
        this.accessPassword = accessPassword;
        this.sectorCount = sectorCount;
        this.nextHit = nextHit;
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
     * Whether this is an extended entry (as opposed to primary entry). Each entry has a limited
     * number of extents extents, so subsequent extents are stored in extended entries.
     */
    public isExtendedEntry(): boolean {
        return (this.flags & 0x80) !== 0;
    }

    /**
     * Get a user-visible string version of the flags.
     */
    public getFlagsString(): string {
        const parts: string[] = [];

        parts.push(trsdosProtectionLevelToString(this.getProtectionLevel(), this.version));
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
        return this.rawFilename.substr(0, 8).trim();
    }

    /**
     * Get the extension of the filename.
     */
    public getExtension(): string {
        return this.rawFilename.substr(8).trim();
    }

    /**
     * Get the full filename (without the internal spaces of the raw filename). If the
     * file has an extension, it will be preceded by the specified separator.
     */
    public getFilename(extensionSeparator: string): string {
        const extension = this.getExtension();
        return this.getBasename() + (extension === "" ? "" : extensionSeparator + extension);
    }

    /**
     * Return the size of the file in bytes.
     */
    public getSize(): number {
        let size = this.sectorCount*BYTES_PER_SECTOR + this.lastSectorSize;

        // On model 1/4, the last sector size byte represents the size of the last sector. On model 3 it's
        // in addition to the sector count.
        if (!isModel3(this.version) && this.lastSectorSize > 0) {
            size -= BYTES_PER_SECTOR;
        }

        return size;
    }

    /**
     * Return the date in MM/YY format.
     */
    public getDateString(): string {
        return this.month.toString().padStart(2, "0") + "/" +  (this.year - 1900).toString().padStart(2, "0");
    }

    /**
     * Return the date in DD/MM/YYYY format, where the day might be blank if missing.
     */
    public getFullDateString(): string {
        return (this.day === 0 ? "   " : this.day.toString().padStart(2, "0") + "/") +
            (this.month === 0 ? "   " : this.month.toString().padStart(2, "0") + "/") +
            this.year.toString();
    }

    /**
     * Return the date as an object.
     */
    public getDate(): Date {
        if (this.day === undefined) {
            return new Date(this.year, this.month - 1);
        } else {
            return new Date(this.year, this.month - 1, this.day);
        }
    }
}

/**
 * Decodes a directory entry from a 32- or 48-byte chunk, or undefined if the directory entry is empty.
 */
function decodeDirEntry(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosDirEntry | undefined {
    const flags = binary[0];

    const month = binary[1] & 0x0F;
    // binary[1] has a few extra bits on Model 1/4 that we don't care about.

    // Date info.
    const day = isModel3(version) ? 0 : binary[2] >> 3;
    const year = isModel3(version) ? binary[2] + 1900 : (binary[2] & 0x07) + 1980;

    // Number of bytes on last sector.
    const lastSectorSize = binary[3];

    // Logical record length.
    const lrl = ((binary[4] - 1) & 0xFF) + 1; // 0 -> 256.

    const filename = decodeAscii(binary.subarray(5, 16));
    // Not sure how to convert these two into a number. Just use big endian.
    const updatePassword = (binary[16] << 8) | binary[17];
    const accessPassword = (binary[18] << 8) | binary[19];

    // Number of sectors in the file. Little endian.
    const sectorCount = (binary[21] << 8) | binary[20];

    // Number of extents listed in the directory entry.
    const extentsCount = isModel3(version) ? 13 : 4;

    // Byte offsets.
    const extentsStart = 22;
    const extentsEnd = extentsStart + 2*extentsCount; // Two bytes per extent.
    const extents = decodeExtents(binary, extentsStart, extentsEnd, geometry, version, true);

    // On model 1/4 bytes 30 and 31 point to extended directory entry, if any.
    const nextHit = !isModel3(version) && binary[30] === 0xFE ? binary[31] : undefined;

    if (filename === undefined || extents === undefined) {
        // This signals empty directory, but really should imply a non-TRSDOS disk.
        return undefined;
    }

    return new TrsdosDirEntry(version, flags, day, month, year, lastSectorSize, lrl, filename, updatePassword,
        accessPassword, sectorCount, nextHit, extents);
}

/**
 * A decoded TRSDOS diskette.
 */
export class Trsdos {
    public readonly disk: FloppyDisk;
    public readonly version: TrsdosVersion;
    public readonly sectorsPerGranule: number;
    public readonly gatInfo: TrsdosGatInfo;
    public readonly hitInfo: TrsdosHitInfo;
    public readonly dirEntries: TrsdosDirEntry[];

    constructor(disk: FloppyDisk, version: TrsdosVersion, sectorsPerGranule: number,
                gatInfo: TrsdosGatInfo,
                hitInfo: TrsdosHitInfo, dirEntries: TrsdosDirEntry[]) {

        this.disk = disk;
        this.version = version;
        this.sectorsPerGranule = sectorsPerGranule;
        this.gatInfo = gatInfo;
        this.hitInfo = hitInfo;
        this.dirEntries = dirEntries;
    }

    /**
     * Guess the name of the operating system.
     */
    public getOperatingSystemName(): string {
        if (this.gatInfo instanceof Trsdos14GatInfo && (this.gatInfo.osVersion & 0xF0) === 0x50) {
            return "LDOS";
        } else {
            return "TRSDOS";
        }
    }

    /**
     * Return a string for the version of TRSDOS or LDOS this is. There's some guesswork here!
     */
    public getVersion(): string {
        if (this.gatInfo instanceof Trsdos14GatInfo) {
            const osVersion = this.gatInfo.osVersion;
            return (osVersion >> 4) + "." + (osVersion & 0x0F);
        } else {
            // Probably Model III, guess 1.3.
            return "1.3";
        }
    }

    /**
     * Read the binary for a file on the diskette.
     */
    public readFile(firstDirEntry: TrsdosDirEntry): Uint8Array {
        const sectors: Uint8Array[] = [];
        const geometry = this.disk.getGeometry();
        const sectorsPerTrack = geometry.lastTrack.numSectors();

        // Number of sectors left to read.
        const fileSize = firstDirEntry.getSize();
        let sectorCount = Math.ceil(fileSize / BYTES_PER_SECTOR);

        // Loop through all the directory entries for this file.
        let dirEntry: TrsdosDirEntry | undefined = firstDirEntry;
        while (dirEntry !== undefined) {
            for (const extent of dirEntry.extents) {
                let trackNumber = extent.trackNumber;
                let trackGeometry = geometry.getTrackGeometry(trackNumber);
                const extentSectorCount = extent.granuleCount * this.sectorsPerGranule;
                let sectorNumber = trackGeometry.firstSector + extent.granuleOffset * this.sectorsPerGranule;
                for (let i = 0; i < extentSectorCount && sectorCount > 0; i++, sectorNumber++, sectorCount--) {
                    if (sectorNumber > trackGeometry.lastSector) {
                        // Move to the next track.
                        trackNumber += 1;
                        trackGeometry = geometry.getTrackGeometry(trackNumber);
                        sectorNumber = trackGeometry.firstSector;
                    }
                    // TODO not sure how to handle side here. I think sectors just continue off the end, so
                    // we should really be doing everything with cylinders in this routine, and have twice
                    // as many max sectors if double-sided.
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
                        sectors.push(sector.data);
                    }
                }
            }

            // Follow the linked list of directory entries.
            dirEntry = dirEntry.nextDirEntry;
        }

        // All sectors.
        const binary = concatByteArrays(sectors);

        // Clip to size. In principle this is cheap because it's a view.
        return binary.subarray(0, fileSize);
    }
}

/**
 * Maps an index into the HIT (zero-based) to its sector index and dir entry index.
 */
function hitNumberToDirEntry(hitIndex: number, version: TrsdosVersion, dirEntriesPerSector: number): DirEntryPosition {
    let sectorIndex: number;
    let dirEntryIndex: number;

    if (isModel3(version)) {
        // These are laid out continuously.
        sectorIndex = hitIndex / dirEntriesPerSector + 2;
        dirEntryIndex = hitIndex % dirEntriesPerSector;
    } else {
        // These are laid out in chunks of 32 to make decoding easier.
        sectorIndex = (hitIndex & 0x1F) + 2;
        dirEntryIndex = hitIndex >> 5;
    }

    return new DirEntryPosition(sectorIndex, dirEntryIndex);
}

/**
 * Decode a TRSDOS diskette for a particular version, or return an error string if this does
 * not look like such a diskette.
 */
export function decodeTrsdosVersion(disk: FloppyDisk, version: TrsdosVersion): Trsdos | string {
    const geometry = disk.getGeometry();
    const bootSector = disk.readSector(geometry.firstTrack.trackNumber,
        geometry.firstTrack.firstSide, geometry.firstTrack.firstSector);
    if (bootSector === undefined) {
        return "Can't read boot sector";
    }
    let dirTrackNumber = bootSector.data[isModel3(version) ? 1 : 2] & 0x7F;
    if (!geometry.isValidTrackNumber(dirTrackNumber)) {
        return "Invalid directory track number (" + dirTrackNumber + ")";
    }

    // Decode Granule Allocation Table sector.
    const gatSector = disk.readSector(dirTrackNumber, geometry.lastTrack.firstSide, geometry.lastTrack.firstSector);
    if (gatSector === undefined) {
        return "Can't read GAT sector";
    }
    const gatInfo = decodeGatInfo(gatSector.data, geometry, version);
    if (typeof gatInfo === "string") {
        return "Can't decode GAT (" + gatInfo + ")";
    }

    const sideCount = geometry.lastTrack.numSides();
    const sectorsPerTrack = geometry.lastTrack.numSectors();

    let dirEntryLength: number;
    let sectorsPerGranule: number;
    let granulesPerTrack: number;
    if (isModel3(version)) {
        dirEntryLength = 48;
        sectorsPerGranule = geometry.lastTrack.density === Density.SINGLE ? 2 : 3;
        granulesPerTrack = Math.floor(sectorsPerTrack / sectorsPerGranule);
    } else {
        if (!(gatInfo instanceof Trsdos14GatInfo)) {
            throw new Error("GAT must be Model 1/4 object");
        }

        dirEntryLength = 32;
        if (sideCount !== gatInfo.sideCount) {
            // Sanity check.
            if (DEBUG) console.log(`Warning: Media sides ${sideCount} doesn't match GAT sides ${gatInfo.sideCount}`);
            // But don't fail loading, keep using media sides.
        }
        granulesPerTrack = version === TrsdosVersion.MODEL_1
            ? geometry.lastTrack.density === Density.SINGLE ? 2 : 3
            : gatInfo.granulesPerTrack;
        sectorsPerGranule = Math.floor(sectorsPerTrack / granulesPerTrack);
    }

    const dirEntriesPerSector = Math.floor(geometry.lastTrack.sectorSize / dirEntryLength);

    if (!gatInfo.isValid(granulesPerTrack, version)) {
        return "GAT is invalid";
    }

    const granulesPerCylinder = granulesPerTrack * sideCount;
    if (granulesPerCylinder < 2 || granulesPerCylinder > 8) {
        return "Invalid number of granules per cylinder: " + granulesPerCylinder;
    }

    if (sectorsPerTrack % granulesPerTrack !== 0) {
        return `Sectors per track ${sectorsPerTrack} is not a multiple of granules per track ${granulesPerTrack}`;
    }

    if (!isModel3(version)) {
        if (geometry.lastTrack.density === Density.SINGLE && sectorsPerGranule !== 5 && sectorsPerGranule !== 8) {
            return "Invalid sectors per granule for single density: " + sectorsPerGranule;
        }

        if (geometry.lastTrack.density === Density.DOUBLE && sectorsPerGranule !== 6 && sectorsPerGranule !== 10) {
            return "Invalid sectors per granule for double density: " + sectorsPerGranule;
        }
    }

    // Decode Hash Index Table sector.
    const hitSector = disk.readSector(dirTrackNumber, geometry.lastTrack.firstSide,
        geometry.lastTrack.firstSector + 1);
    if (hitSector === undefined) {
        return "Can't read HIT sector";
    }
    const hitInfo = decodeHitInfo(hitSector.data, geometry, version);
    if (hitInfo === undefined) {
        return "Can't decode HIT";
    }

    // Map from position of directory entry to its actual entry. The key is the asKey() result
    // of DirEntryPosition.
    const dirEntries = new Map<string, TrsdosDirEntry>();

    // Decode directory entries.
    for (let side = 0; side < geometry.lastTrack.numSides(); side++) {
        for (let sectorIndex = 0; sectorIndex < geometry.lastTrack.numSectors(); sectorIndex++) {
            const sectorNumber = geometry.firstTrack.firstSector + sectorIndex;
            if (side === 0 && sectorIndex < 2) {
                // Skip GAT and HIT.
                continue;
            }

            const dirSector = disk.readSector(dirTrackNumber, numberToSide(side), sectorNumber);
            if (dirSector !== undefined) {
                // Sanity check Model III entry.
                if (isModel3(version)) {
                    const tandy = decodeAscii(dirSector.data.subarray(dirEntriesPerSector * dirEntryLength));
                    if (tandy !== EXPECTED_TANDY) {
                        return `Expected "${EXPECTED_TANDY}", got "${tandy}"`;
                    }
                }
                for (let i = 0; i < dirEntriesPerSector; i++) {
                    const dirEntryBinary = dirSector.data.subarray(i * dirEntryLength, (i + 1) * dirEntryLength);
                    const dirEntry = decodeDirEntry(dirEntryBinary, geometry, version);
                    if (dirEntry !== undefined) {
                        if (!dirEntry.isExtendedEntry() && dirEntry.isSystemFile() && dirEntry.isActive()) {
                            // Skip system files.
                            continue;
                        }
                        dirEntries.set(new DirEntryPosition(sectorIndex, i).asKey(), dirEntry);
                    }
                }
            }
        }
    }

    // Keep only good entries (active and not extensions to other entries).
    const goodDirEntries = Array.from(dirEntries.values()).filter(d => d.isActive() && !d.isExtendedEntry());

    // Look up continuations by sector/index and update original entries.
    for (const dirEntry of dirEntries.values()) {
        if (dirEntry.nextHit !== undefined) {
            const position = hitNumberToDirEntry(dirEntry.nextHit, version, dirEntriesPerSector);
            const nextDirEntry = dirEntries.get(position.asKey());
            if (nextDirEntry !== undefined) {
                dirEntry.nextDirEntry = nextDirEntry;
            }
        }
    }

    return new Trsdos(disk, version, sectorsPerGranule, gatInfo, hitInfo, goodDirEntries);
}

/**
 * Decode a TRSDOS diskette, or return undefined if this does not look like such a diskette.
 */
export function decodeTrsdos(disk: FloppyDisk): Trsdos | undefined {
    // Try each one in turn.
    const trsdosVersions = [TrsdosVersion.MODEL_4, TrsdosVersion.MODEL_3, TrsdosVersion.MODEL_1];
    for (const trsdosVersion of trsdosVersions) {
        let trsdos = decodeTrsdosVersion(disk, trsdosVersion);
        if (typeof trsdos !== "string") {
            return trsdos;
        }
        if (DEBUG) {
            console.log("Can't decode as " + trsdosVersionToString(trsdosVersion) + " operating system: " + trsdos);
        }
    }

    return undefined;
}
