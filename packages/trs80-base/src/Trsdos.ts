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
const DEBUG = true;

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
 * Converts a sector to a GAT object, or undefined if we don't think this is a GAT sector.
 */
function decodeGatInfo(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosGatInfo | undefined {
    // One byte for each track. Each bit is a granule, 0 means free and 1 means used.
    const gat = binary.subarray(0, geometry.numTracks());

    // Assume big endian.
    const password = (binary[0xCE] << 8) | binary[0xCF];
    const name = decodeAscii(binary.subarray(0xD0, 0xD8));
    const date = decodeAscii(binary.subarray(0xD8, 0xE0));
    const autoCommand = decodeAscii(binary.subarray(0xE0));

    // Implies that this is not a TRSDOS disk.
    if (name === undefined || date === undefined || autoCommand === undefined) {
        if (DEBUG) console.log("GAT: critical data is missing");
        return undefined;
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
    public readonly extents: TrsdosExtent[];

    constructor(flags: number, day: number, month: number, year: number, lastSectorSize: number, lrl: number,
                filename: string, updatePassword: number, accessPassword: number,
                sectorCount: number, extents: TrsdosExtent[]) {

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
     * @param version the version of TRSDOS, to help interpreting the flags.
     */
    public getFlagsString(version: TrsdosVersion): string {
        const parts: string[] = [];

        parts.push(trsdosProtectionLevelToString(this.getProtectionLevel(), version));
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
     * Return the size in bytes.
     */
    public getSize(): number {
        return this.sectorCount*BYTES_PER_SECTOR + this.lastSectorSize;
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
 * Decodes a directory entry from a 48-byte chunk, or undefined if the directory entry is empty.
 */
function decodeDirEntry(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosDirEntry | undefined {
    const flags = binary[0];
    // Check "active" bit. Setting this to zero is how files are deleted. Also check empty filename.
    if ((flags & 0x10) === 0 || binary[5] === 0) {
        return undefined;
    }

    const month = binary[1] & 0x0F;
    const day = isModel3(version) ? 0 : binary[2] >> 3;
    // binary[1] has a few extra bits we don't care about on Model 1/4.
    const year = isModel3(version) ? binary[2] + 1900 : (binary[2] & 0x07) + 1980;
    const lastSectorSize = binary[3];
    // Logical record length.
    const lrl = ((binary[4] - 1) & 0xFF) + 1; // 0 -> 256.
    const filename = decodeAscii(binary.subarray(5, 16));
    // Not sure how to convert these two into a number. Just use big endian.
    const updatePassword = (binary[16] << 8) | binary[17];
    const accessPassword = (binary[18] << 8) | binary[19];
    // Little endian.
    const sectorCount = (binary[21] << 8) | binary[20];
    const extentsCount = isModel3(version) ? 13 : 4;
    const extentsStart = 22;
    const extentsEnd = extentsStart + 2*extentsCount; // Two bytes per extent.
    const extents = decodeExtents(binary, extentsStart, extentsEnd, geometry, version, true);

    if (filename === undefined || extents === undefined) {
        // This signals empty directory, but really should imply a non-TRSDOS disk.
        return undefined;
    }

    return new TrsdosDirEntry(flags, day, month, year, lastSectorSize, lrl, filename, updatePassword,
        accessPassword, sectorCount, extents);
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
    public readFile(dirEntry: TrsdosDirEntry): Uint8Array {
        const sectors: Uint8Array[] = [];
        const geometry = this.disk.getGeometry();
        const sectorsPerTrack = geometry.lastTrack.numSectors();

        // Number of sectors left to read.
        let sectorCount = dirEntry.sectorCount + (dirEntry.lastSectorSize > 0 ? 1 : 0);
        for (const extent of dirEntry.extents) {
            console.log(sectorCount, extent);
            let trackNumber = extent.trackNumber;
            let trackGeometry = geometry.getTrackGeometry(trackNumber);
            const extentSectorCount = extent.granuleCount*this.sectorsPerGranule;
            let sectorNumber = trackGeometry.firstSector + extent.granuleOffset*this.sectorsPerGranule;
            for (let i = 0; i < extentSectorCount && sectorCount > 0; i++, sectorNumber++, sectorCount--) {
                console.log("    ", i, trackNumber, sectorNumber);
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

        // Clip last sector.
        if (sectors.length > 0 && dirEntry.lastSectorSize > 0) {
            console.log("Clipping to", dirEntry.lastSectorSize);
            sectors[sectors.length - 1] = sectors[sectors.length - 1].subarray(0, dirEntry.lastSectorSize);
        }

        return concatByteArrays(sectors);
    }
}

/**
 * Decode a TRSDOS diskette for a particular version, or return undefined if this does not look like such a diskette.
 */
export function decodeTrsdosVersion(disk: FloppyDisk, version: TrsdosVersion): Trsdos | undefined {
    const geometry = disk.getGeometry();
    const bootSector = disk.readSector(geometry.firstTrack.trackNumber,
        geometry.firstTrack.firstSide, geometry.firstTrack.firstSector);
    if (bootSector === undefined) {
        if (DEBUG) console.log("Can't read boot sector");
        return undefined;
    }
    let dirTrackNumber = bootSector.data[isModel3(version) ? 1 : 2] & 0x7F;
    if (!geometry.isValidTrackNumber(dirTrackNumber)) {
        if (DEBUG) console.log("Bad dir track: " + dirTrackNumber);
        return undefined;
    }

    // Decode Granule Allocation Table sector.
    const gatSector = disk.readSector(dirTrackNumber, geometry.lastTrack.firstSide, geometry.lastTrack.firstSector);
    if (gatSector === undefined) {
        if (DEBUG) console.log("Can't read GAT sector");
        return undefined;
    }
    const gatInfo = decodeGatInfo(gatSector.data, geometry, version);
    if (gatInfo === undefined) {
        if (DEBUG) console.log("Can't decode GAT");
        return undefined;
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
        if (DEBUG) console.log("GAT is invalid");
        return undefined;
    }

    const granulesPerCylinder = granulesPerTrack * sideCount;
    if (granulesPerCylinder < 2 || granulesPerCylinder > 8) {
        if (DEBUG) console.log("Invalid number of granules per cylinder: " + granulesPerCylinder);
        return undefined;
    }

    if (sectorsPerTrack % granulesPerTrack !== 0) {
        if (DEBUG) console.log(`Sectors per track ${sectorsPerTrack} is not a multiple of granules per track ${granulesPerTrack}`);
        return undefined;
    }

    if (!isModel3(version)) {
        if (geometry.lastTrack.density === Density.SINGLE && sectorsPerGranule !== 5 && sectorsPerGranule !== 8) {
            if (DEBUG) console.log("Invalid sectors per granule for single density: " + sectorsPerGranule);
            return undefined;
        }

        if (geometry.lastTrack.density === Density.DOUBLE && sectorsPerGranule !== 6 && sectorsPerGranule !== 10) {
            if (DEBUG) console.log("Invalid sectors per granule for double density: " + sectorsPerGranule);
            return undefined;
        }
    }

    // Decode Hash Index Table sector.
    const hitSector = disk.readSector(dirTrackNumber, geometry.lastTrack.firstSide,
        geometry.lastTrack.firstSector + 1);
    if (hitSector === undefined) {
        if (DEBUG) console.log("Can't read HIT sector");
        return undefined;
    }
    const hitInfo = decodeHitInfo(hitSector.data, geometry, version);
    if (hitInfo === undefined) {
        if (DEBUG) console.log("Can't decode HIT");
        return undefined;
    }

    // Decode directory entries.
    const dirEntries: TrsdosDirEntry[] = [];
    for (let side = 0; side < geometry.lastTrack.numSides(); side++) {
        for (let sectorIndex = 0; sectorIndex < geometry.lastTrack.numSectors(); sectorIndex++) {
            const sectorNumber = geometry.firstTrack.firstSector + sectorIndex;
            if (side === 0 && sectorIndex < 2) {
                // Skip GAT and HIT.
                continue;
            }

            const dirSector = disk.readSector(dirTrackNumber, numberToSide(side), sectorNumber);
            if (dirSector !== undefined) {
                if (isModel3(version)) {
                    const tandy = decodeAscii(dirSector.data.subarray(dirEntriesPerSector * dirEntryLength));
                    if (tandy !== EXPECTED_TANDY) {
                        console.error(`Expected "${EXPECTED_TANDY}", got "${tandy}"`);
                        return undefined;
                    }
                }
                for (let i = 0; i < dirEntriesPerSector; i++) {
                    if (!isModel3(version) && side === 0 && sectorIndex < 2 + 8 && i < 2) {
                        // Skip system files, the first two files in the first 8 sectors of the first side.
                        continue;
                    }
                    const dirEntryBinary = dirSector.data.subarray(i * dirEntryLength, (i + 1) * dirEntryLength);
                    const dirEntry = decodeDirEntry(dirEntryBinary, geometry, version);
                    if (dirEntry !== undefined) {
                        dirEntries.push(dirEntry);
                    }
                }
            }
        }
    }

    return new Trsdos(disk, version, sectorsPerGranule, gatInfo, hitInfo, dirEntries);
}

/**
 * Decode a TRSDOS diskette, or return undefined if this does not look like such a diskette.
 */
export function decodeTrsdos(disk: FloppyDisk): Trsdos | undefined {
    // Try each one in turn.
    let trsdos = decodeTrsdosVersion(disk, TrsdosVersion.MODEL_4);
    if (trsdos !== undefined) {
        return trsdos;
    }

    trsdos = decodeTrsdosVersion(disk, TrsdosVersion.MODEL_3);
    if (trsdos !== undefined) {
        return trsdos;
    }

    return decodeTrsdosVersion(disk, TrsdosVersion.MODEL_1);
}
