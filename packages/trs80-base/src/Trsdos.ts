/**
 * Classes for handling TRSDOS diskettes.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/zaps-and-patches/#guidedtour
 * http://www.manmrk.net/tutorials/TRS80/Software/ldos/trs80/doc/prgguide.pdf
 * https://www.tim-mann.org/trs80/doc/ld51man3.pdf
 */

import {concatByteArrays} from "teamten-ts-utils";
import {BYTES_PER_SECTOR, Density, FloppyDisk, FloppyDiskGeometry, SectorPosition,} from "./FloppyDisk.js";
import {toHexByte, word} from "z80-base";
import {TRS80_BASE_LOGGER} from "trs80-logger";
import {CmdLoadBlockChunk, decodeCmdProgram} from "./CmdProgram.js";

// Copyright in the last 16 bytes of each directory sector, for Model III TRSDOS.
const EXPECTED_TANDY = "(c) 1980 Tandy";

// Whether to check that the Tandy string appears in at least some directory sectors.
const CHECK_EXPECTED_TANDY = true;

// Password value that means "no password".
const NO_PASSWORD = 0xEF5C;

// Password value for "PASSWORD".
const PASSWORD = 0xD38F;

// Name of a disk whose DOS we can't tell.
const UNKNOWN_DOS = "Unknown DOS";

/**
 * Banners that system disks' system files carry, each turned into a name and version. See
 * "Identifying the DOS" in FLOPPY_FORMATS.md.
 */
const SYSTEM_BANNERS: {pattern: RegExp, name: (m: RegExpMatchArray) => string}[] = [
    // MultiDOS's version byte and banners are unreliable, so leave its version off.
    {pattern: /MULTIDOS|Cosmopolitan Electronics/, name: () => "MultiDOS"},
    {pattern: /NEWDOS80[^\n]{0,60}?VERSION (\d\.\d)/i, name: m => `NEWDOS/80 v${m[1]}`},
    // NEWDOS/80 v2 draws its name in graphics characters; only the rest is text.
    {pattern: /APPARAT, INC\.[\s\S]{0,60}?VERSION (\d\.[\dX])/, name: m => `NEWDOS/80 v${m[1]}`},
    // NEWDOS 2.2 (NEWDOS+) says it this way.
    {pattern: /NEWDOS - VERSION (\d\.\d)/, name: m => `NEWDOS ${m[1]}`},
    {pattern: /NEWDOS - DISK OPERATING SYSTEM - VER (\d\.\d)/, name: m => `NEWDOS ${m[1]}`},
    {pattern: /DBLDOS - DISK OPERATING SYSTEM - VER (\d\.\d+)/, name: m => `DoubleDOS ${m[1]}`},
    {pattern: /VTOS - VIRTUAL TECHNOLOGY'S OPERATING SYSTEM - VER (\d\.\d(?:\.\d)?)/, name: m => `VTOS ${m[1]}`},
    {pattern: /DOS ?PLUS IV/, name: () => "DOSPLUS IV"},
    // DOSPLUS 3.5 says "3.50" but writes 0x35 at 0xCB; use the shorter form for both.
    {pattern: /DOS ?PLUS\b[^\n]{0,50}?(\d\.\d+[a-z]?(?:\.\d+)?)/, name: m => `DOSPLUS ${m[1].replace(/^(\d\.\d)0$/, "$1")}`},
    // "VER 5.1.4", "Ver 5.1.4", "VER. 5.0.1" (the Lobo edition), and "VER 513/R".
    {pattern: /L ?D ?O ?S - [^\n]{0,60}?VER\.? ?(\d)\.?(\d)\.?(\d)/i, name: m => `LDOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /LS-DOS 0?(\d)\.0?(\d)\.0?(\d)/, name: m => `LS-DOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /TRSDOS 0?(6)\.0?(\d)\.0?(\d)/, name: m => `TRSDOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /TRSDOS - DISK OPERATING SYSTEM -? ?VER (\d\.\d[A-Z]?)/, name: m => `TRSDOS ${m[1]}`},
];

/**
 * Bytes as Latin-1 text, one character per byte, for searching for strings.
 */
function bytesToText(bytes: Uint8Array): string {
    let text = "";
    for (const b of bytes) {
        text += String.fromCharCode(b);
    }
    return text;
}

/**
 * Negate each character (256 minus its code), the way TRSDOS 2.x and VTOS store their banners.
 */
function negateText(text: string): string {
    let negated = "";
    for (let i = 0; i < text.length; i++) {
        negated += String.fromCharCode((256 - text.charCodeAt(i)) & 0xFF);
    }
    return negated;
}

// Rotate an 8-bit byte left, putting bit 7 into bit 0.
function rotateByteLeft(x: number): number {
    // Make integer.
    x |= 0;

    // Rotate left.
    const highBitSet = (x & 0x80) !== 0;
    return ((x << 1) | (highBitSet ? 1 : 0)) & 0xFF;
}

/**
 * Compute the number of lumps on a floppy, given the geometry and lump parameters.
 */
function computeLumpCount(geometry: FloppyDiskGeometry, firstDataCylinder: number,
                          sectorsPerCylinder: number, sectorsPerLump: number) {

    const dataCylindersCount = geometry.cylinderCount - firstDataCylinder;
    return Math.floor(dataCylindersCount * sectorsPerCylinder / sectorsPerLump);
}

interface Evaluation {
    /**
     * Integer score for this evaluation. A higher score is better. Evaluations with negative scores
     * are disqualified completely.
     */
    score: number;
    /**
     * The reason for the score (one line).
     */
    reason: string;
}

function evaluationToString(evaluation: Evaluation): string {
    return `${evaluation.score} (${evaluation.reason})`;
}

/**
 * The 2.3 family's 16-bit hash of a blank password (eight spaces), which is what a
 * directory entry holds when the file has no password. See "Password hashes" in
 * FLOPPY_FORMATS.md for the algorithm. TRSDOS 1.3 hashes differently.
 */
export const TRSDOS_BLANK_PASSWORD_HASH = 0x4296;

/**
 * The 2.3 family's 16-bit hash of "PASSWORD", TRSDOS's default master password, which
 * is what most GATs hold.
 */
export const TRSDOS_DEFAULT_PASSWORD_HASH = 0x42E0;

// DEC of DIR/SYS's fixed directory slot in the 2.3 family.
const DIR_SYS_HIT_INDEX = 0x01;
// What old Model I disks store in that HIT slot instead of DIR/SYS's real hash (0xC4).
const OLD_DIR_SYS_HASH = 0x2C;

/**
 * Whether a HIT byte is the wrong hash that old Model I disks store for DIR/SYS. The
 * NEWDOS/80 manual (section 5.6.2) documents the bug, and every TRSDOS 2.x disk we have
 * shows it. Accept it only in DIR/SYS's own slot, so that it's as specific as a real match.
 */
function isOldDirSysHash(version: TrsdosVersion, hitIndex: number, rawFilename: string, hitHash: number): boolean {
    return version === TrsdosVersion.V2_3 &&
        hitIndex === DIR_SYS_HIT_INDEX &&
        rawFilename === "DIR     SYS" &&
        hitHash === OLD_DIR_SYS_HASH;
}

/**
 * Compute the one-byte HIT hash for an 11-letter filename. Use spaces to fill in
 * the file or extension if necessary (e.g., "FOO     BAS").
 *
 * Based on the assembly code in TRSDOS:
 *
 * https://www.trs-80.com/wordpress/dos-trsdos-v2-3-disassembled/model-i-trsdos-sys2-sys/#509BH
 */
function hashForFilename(filename: string): number {
    let hash = 0;

    // 8 characters for base name, 3 for extension.
    for (let i = 0; i < 11; i++) {
        // Use space if too short.
        const n = i < filename.length ? filename.charCodeAt(i) : 32;

        // XOR in the new byte, then rotate left.
        hash = rotateByteLeft(n ^ hash);
    }

    // Don't let it be 0, that means "no file".
    if (hash === 0) {
        hash = 1;
    }

    return hash;
}

// Various TRSDOS versions. All other TRS-80 DOS formats are variants of one of these.
export enum TrsdosVersion {
    V2_3,  // TRSDOS 2.3
    V1_3,  // TRSDOS 1.3
}

/**
 * Convert the enum to a string.
 */
export function trsdosVersionToString(trsdosVersion: TrsdosVersion): string {
    switch (trsdosVersion) {
        case TrsdosVersion.V2_3:
            return "Model I";

        case TrsdosVersion.V1_3:
            return "Model III";
    }
}

/**
 * The number of bytes in each directory entry for this version.
 */
function getDirEntryLength(version: TrsdosVersion): number {
    switch (version) {
        case TrsdosVersion.V2_3:
            return 32;

        case TrsdosVersion.V1_3:
            return 48;
    }
}

/**
 * Return the number of the first sector on a track for this version. This might not apply to the very
 * first track if it's a dual-boot disk.
 */
function getFirstSectorNumber(version: TrsdosVersion): number {
    return version === TrsdosVersion.V1_3 ? 1 : 0;
}

/**
 * Represents the position of a directory entry.
 */
class DirEntryPosition {
    // Zero-based sector index into the directory lump, after the GAT and HIT.
    public readonly sectorIndex: number;
    // Zero-based index of the directory entry into the sector.
    public readonly dirEntryIndex: number;

    constructor(sectorIndex: number, dirEntryIndex: number) {
        this.sectorIndex = sectorIndex;
        this.dirEntryIndex = dirEntryIndex;
    }

    /**
     * Make a string that represents this object, to use as a key in a Map.
     */
    public key(): string {
        return this.sectorIndex + ":" + this.dirEntryIndex;
    }
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
    FULL = 0,
    REMOVE = 1,
    RENAME = 2,
    WRITE = 3,
    UPDATE = 4,
    READ = 5,
    EXEC = 6,
    NO_ACCESS = 7,
}

/**
 * Gets the string version of the protection level enum.
 */
export function trsdosProtectionLevelToString(level: TrsdosProtectionLevel, version: TrsdosVersion): string {
    switch (level) {
        case TrsdosProtectionLevel.FULL:
            return "FULL";
        case TrsdosProtectionLevel.REMOVE:
            return version === TrsdosVersion.V1_3 ? "REMOVE" : "KILL";
        case TrsdosProtectionLevel.RENAME:
            return "RENAME";
        case TrsdosProtectionLevel.WRITE:
            return version === TrsdosVersion.V1_3 ? "WRITE" : "UNUSED";
        case TrsdosProtectionLevel.UPDATE:
            return version === TrsdosVersion.V1_3 ? "UPDATE" : "WRITE";
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
 * A contiguous number of granules for storing part of a file. The extent starts at the specified location
 * (cylinder and granule) and continues for the specified number of granules, wrapping to side 1 if possible,
 * then advancing to the next cylinder.
 */
export class TrsdosExtent {
    public readonly cylinderNumber: number;
    public readonly granuleOffset: number;
    public readonly granuleCount: number;

    constructor(cylinderNumber: number, granuleOffset: number, granuleCount: number) {
        this.cylinderNumber = cylinderNumber;
        this.granuleOffset = granuleOffset;
        this.granuleCount = granuleCount;
    }

    public toString(): string {
        return `Extent[${this.cylinderNumber}:${this.granuleOffset}:${this.granuleCount}]`;
    }
}

/**
 * Decode an array of extents.
 *
 * @param binary bytes we'll be pulling the extents from.
 * @param begin index of first extent in binary.
 * @param end index past last extent in binary.
 * @param geometry the disk geometry, for error checking.
 * @param version version of TRSDOS.
 * @param cylinderFirst whether the cylinder comes first or second (the other being the granule byte).
 * @return the decoded extents, or an error message if any cylinder was out of bounds.
 */
function decodeExtents(binary: Uint8Array, begin: number, end: number,
                       geometry: FloppyDiskGeometry,
                       version: TrsdosVersion,
                       cylinderFirst: boolean): TrsdosExtent[] | string {

    const extents: TrsdosExtent[] = [];
    const granuleCountBasis = version === TrsdosVersion.V1_3 ? 0 : 1;

    for (let i = begin; i < end; i += 2) {
        // 0xFF means end of extents, 0xFE means extension pointer to another directory entry. Either
        // way we're done reading these extends.
        // TODO that's for cylinderFirst, not sure about !cylinderFirst.
        if (binary[i] === 0xFF || binary[i] === 0xFE) {
            break;
        }

        const cylinderNumber = binary[cylinderFirst ? i : i + 1];
        const granuleByte = binary[cylinderFirst ? i + 1 : i];
        const granuleOffset = granuleByte >> 5;
        const granuleCount = granuleCountBasis + (granuleByte & 0x1F);

        if (cylinderNumber >= geometry.cylinderCount && false) { // TODO these are lumps, can't compare to cylinders.
            // Not a TRSDOS disk.
            return "Invalid extent: index " + i + ", cylinder " + cylinderNumber +
                ", granuleByte 0x" + toHexByte(granuleByte) + ", offset " +
                granuleOffset + ", count " + granuleCount + ", cylinder first " + cylinderFirst;
        }

        extents.push(new TrsdosExtent(cylinderNumber, granuleOffset, granuleCount));
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

    // Lock out table, one byte per track. These are per-track, not per-granule.
    // 0xFF means locked out, 0xFC means available.
    public readonly lockOut: Uint8Array;

    // All models:
    public readonly password: number;
    public readonly name: string;
    public readonly date: string;
    public readonly autoCommand: string;

    // Encoded in hex, e.g., 0x51 means LDOS 5.1.
    public readonly osVersion: number;

    // For LDOS only:
    public readonly cylinderCount: number;
    public readonly granulesPerTrack: number;
    public readonly sideCount: number;
    public readonly density: Density;

    constructor(gat: Uint8Array, lockOut: Uint8Array,
                password: number, name: string, date: string, autoCommand: string,
                osVersion: number, cylinderCount: number, granulesPerTrack: number,
                sideCount: number, density: Density) {

        this.gat = gat;
        this.lockOut = lockOut;
        this.password = password;
        this.name = name;
        this.date = date;
        this.autoCommand = autoCommand;
        this.osVersion = osVersion;
        this.cylinderCount = cylinderCount;
        this.granulesPerTrack = granulesPerTrack;
        this.sideCount = sideCount;
        this.density = density;
    }

    /**
     * Whether every lump's unused high bits hold what the DOS writes there: set in the 2.3
     * family and NEWDOS/80, clear in TRSDOS 1.3. This pins down the granules per lump, but some
     * formatters leave the bits clear and a damaged GAT fails it, so it's a preference among
     * candidates, not a requirement.
     */
    public hasValidHighBits(granulesPerLump: number, lumpCount: number, version: TrsdosVersion): boolean {
        // The mask for the unused bits in the GAT, and the value we expect to see there.
        const mask = (0xFF << granulesPerLump) & 0xFF;
        const expectedValue = version === TrsdosVersion.V1_3 ? 0x00 : mask;

        for (let lump = 0; lump < lumpCount; lump++) {
            // The GAT holds at most a sector's worth of lumps, so a candidate with more is wrong.
            const g = this.gat[lump];
            if (g === undefined) {
                return false;
            }
            if ((g & mask) !== expectedValue) {
                TRS80_BASE_LOGGER.trace("GAT: high bits are not correct: 0x" + toHexByte(g) +
                    " lump " + lump + " with " + granulesPerLump + " granules per lump");
                return false;
            }
        }

        return true;
    }
}

/**
 * Converts a sector to a GAT object, or a string with an error if we don't think this is a GAT sector.
 */
function decodeGatInfo(binary: Uint8Array, lumpCount: number,
                       geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosGatInfo | string {

    // Its fields run to the end of a 256-byte sector. Disks with smaller sectors (CP/M's 128,
    // for example) aren't any of these DOSes, and reading past the end would give undefined bytes.
    if (binary.length < BYTES_PER_SECTOR) {
        return `sector has only ${binary.length} bytes`;
    }

    // One byte for each lump. Each bit is a granule, 0 means free and 1 means used.
    const gat = binary.subarray(0, lumpCount);

    // Lock out table, one byte per track. These are per-track, not per-granule.
    // 0xFF means locked out, 0xFC means available.
    const lockOut = binary.subarray(0x60, 0x60 + geometry.cylinderCount);

    // Little endian, like every password hash.
    const password = word(binary[0xCF], binary[0xCE]);
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

    // Additional fields for Model 1.
    const osVersion = binary[0xCB];

    // Additional fields for LDOS.
    const cylinderCount = binary[0xCC] + 35;
    const flags = binary[0xCD];
    const granulesPerTrack = (flags & 0x07) + 1;
    const sideCount = (flags & 0x20) !== 0 ? 2 : 1;
    const density = (flags & 0x40) !== 0 ? Density.DOUBLE : Density.SINGLE;
    // TODO data disks only reserve 2 entries for system files, not 16. But I don't know which two!
    const isDataDisk = osVersion === 0x60 && (flags & 0x80) !== 0;

    return new TrsdosGatInfo(gat, lockOut, password, name, date, autoCommand,
        osVersion, cylinderCount, granulesPerTrack, sideCount, density);
}

/**
 * The Hash Allocation Table sector info.
 */
export class TrsdosHitInfo {
    // 80 bytes for Model III, 256 bytes for Models 1 and 4:
    public readonly hit: Uint8Array;
    // Model III only:
    public readonly systemFiles: TrsdosExtent[];

    constructor(hit: Uint8Array, systemFiles: TrsdosExtent[]) {
        this.hit = hit;
        this.systemFiles = systemFiles;
    }
}

/**
 * Decode the Hash Index Table sector, or an error message if we don't think this is a TRSDOS disk.
 */
function decodeHitInfo(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosHitInfo | string {
    // One byte for each file.
    const hit = binary.subarray(0, version === TrsdosVersion.V1_3 ? 80 : 256);

    // There are 16 extents to read for the system files.
    const systemFiles = version === TrsdosVersion.V1_3
        ? decodeExtents(binary, 0xE0, binary.length, geometry, version, false)
        : [];
    if (typeof systemFiles === "string") {
        return "system files: " + systemFiles;
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
    // Logical record length. I think this is unused.
    public readonly lrl: number;
    public readonly rawFilename: string;
    public readonly updatePassword: number;
    public readonly accessPassword: number;
    // This is the number of *full* sectors. It doesn't include a possible
    // additional partial sector of "lastSectorSize" bytes.
    public readonly sectorCount: number;
    // Directory entry code of the primary directory entry, if any.
    public readonly prevDec: number | undefined;
    // Directory entry code of the extended directory entry, if any.
    public readonly nextDec: number | undefined;
    // Link to previous (primary) directory entry.
    public prevDirEntry: TrsdosDirEntry | undefined = undefined;
    // Link to next (extended) directory entry.
    public nextDirEntry: TrsdosDirEntry | undefined = undefined;
    public readonly extents: TrsdosExtent[];

    constructor(version: TrsdosVersion, flags: number, day: number, month: number, year: number,
                lastSectorSize: number, lrl: number,
                filename: string, updatePassword: number, accessPassword: number,
                sectorCount: number,
                prevDec: number | undefined,
                nextDec: number | undefined,
                extents: TrsdosExtent[]) {

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
        this.prevDec = prevDec;
        this.nextDec = nextDec;
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
     * number of extents, so subsequent extents are stored in extended entries.
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
        return this.rawFilename.substring(0, 8).trim();
    }

    /**
     * Get the extension of the filename.
     */
    public getExtension(): string {
        return this.rawFilename.substring(8).trim();
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
        if (this.version !== TrsdosVersion.V1_3 && this.lastSectorSize > 0) {
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
 * Decodes a directory entry from a 32- or 48-byte chunk, undefined if the directory entry is not active,
 * or a decoding error.
 */
function decodeDirEntry(binary: Uint8Array, geometry: FloppyDiskGeometry, version: TrsdosVersion): TrsdosDirEntry | undefined | string {
    const flags = binary[0];
    if ((flags & 0x10) === 0) { // TODO merge with isActive().
        // Don't parse an inactive entry, it might be corrupted.
        return undefined;
    }

    // DEC to previous entry, if we're an extended entry.
    const prevDec = (flags & 0x80) !== 0 ? binary[1] : undefined;

    // Date.
    const month = binary[1] & 0x0F;
    // binary[1] has a few extra bits on Model 1/4 that we don't care about.

    // Date info.
    const day = version === TrsdosVersion.V1_3 ? 0 : binary[2] >> 3;
    const year = version === TrsdosVersion.V1_3 ? binary[2] + 1900 : (binary[2] & 0x07) + 1980;

    // Number of bytes on last sector.
    const lastSectorSize = binary[3];

    // Logical record length.
    const lrl = ((binary[4] - 1) & 0xFF) + 1; // 0 -> 256.

    const filename = decodeAscii(binary.subarray(5, 16));
    if (filename === undefined) {
        return "can't decode directory entry filename";
    }

    // Password hashes, little endian.
    const updatePassword = word(binary[17], binary[16]);
    const accessPassword = word(binary[19], binary[18]);

    // Number of sectors in the file. Little endian.
    const sectorCount = word(binary[21], binary[20]);

    // Number of extents listed in the directory entry.
    const extentsCount = version === TrsdosVersion.V1_3 ? 13 : 5;

    // Byte offsets.
    const extentsStart = 22;
    const extentsEnd = extentsStart + 2*extentsCount; // Two bytes per extent.
    const extents = decodeExtents(binary, extentsStart, extentsEnd, geometry, version, true);
    if (typeof extents === "string") {
        // Not a TRSDOS disk.
        return extents;
    }

    // On model 1/4 bytes 30 and 31 point to extended directory entry, if any.
    const nextDec = !(version === TrsdosVersion.V1_3) && binary[30] === 0xFE ? binary[31] : undefined;

    return new TrsdosDirEntry(version, flags, day, month, year, lastSectorSize, lrl, filename, updatePassword,
        accessPassword, sectorCount, prevDec, nextDec, extents);
}

/**
 * A TRSDOS diskette.
 *
 * We access physical disks with (cylinder,side,sector number) tuples. This would work for TRSDOS too,
 * except that NEWDOS/80 introduced the concept of "lumps" to replace cylinders. They did this
 * to solve the problem of having 5-sector granules on double-density disks. This size worked
 * on single-density disks (10 sectors per track), but on double-density disks (18 sectors per track)
 * the track or cylinder was no longer a multiple of 5 sectors. TRSDOS 1.3 (Model III) solved this problem
 * by changing the size of the granule, LDOS solved it by making the granule size configurable in
 * the GAT, and NEWDOS/80 solved it by keeping 5-sector granules but using logical cylinders (called
 * "lumps") that didn't match up with physical ones.
 *
 * Since the lump model is flexible enough to also model physical cylinders, we use it in the
 * Trsdos class as our logical sector position. We model the floppy as having a continuous sequence
 * of sectors, starting with cylinder 0, side 0, first sector, continuing through the end of that track,
 * flipping to side 1 if it's used by the DOS on that disk, then going back to side 0 on the next cylinder.
 * (On NEWDOS/80 disks, the first cylinder is skipped if its density or sector count differs from the rest
 * of the disk, which makes it bootable by the Model I ROM. In the other DOSes a lump is always a physical
 * cylinder, so nothing is skipped.)
 *
 * The position of sectors is then logically described with (lump,granule,sector index) tuples. Note that
 * here the sector is an _index_ (0-based) within the granule, whereas the physical tuple above uses
 * sector _numbers_, which are labels recorded in the sector IDAM. (The latter are zero-based on TRSDOS 2.3-based
 * systems and 1-based on TRSDOS 1.3-based systems.)
 *
 * See the {@link Trsdos.logicalToPhysical} method for the mapping from logical to physical sectors.
 */
export class Trsdos {
    public readonly disk: FloppyDisk;
    public readonly geometry: FloppyDiskGeometry;
    public readonly version: TrsdosVersion;
    public readonly allocationSides: number;
    public readonly granulesPerLump: number;
    public readonly sectorsPerGranule: number;
    public readonly dirLumpNumber: number;
    public readonly granulesPerDir: number;
    public readonly firstDataCylinder: number;
    // Derived fields:
    public readonly dirEntryLength: number;
    public readonly dirEntriesPerSector: number;
    public readonly sectorsPerLump: number;
    public readonly sectorsPerCylinder: number;
    public readonly lumpCount: number;
    public readonly lumpTerm: string;
    /**
     * An integer score estimating whether we think this is a valid TRSDOS disk and configuration.
     * Negative scores mean that we're pretty sure this isn't a TRSDOS disk. Higher scores are better.
     */
    public readonly evaluation: Evaluation;
    /**
     * Whether the GAT's unused high bits are what the DOS writes there, given this candidate's
     * granules per lump. See "Evidence that turned out to be reliable" in FLOPPY_FORMATS.md.
     */
    public readonly gatPassesStrictCheck: boolean;
    /**
     * Name and version of the DOS that wrote the disk, such as "LDOS 5.1.4" or "NEWDOS/80 v2.0", or
     * "Unknown DOS" when the disk doesn't say. Only decoded for candidates that aren't disqualified,
     * because it reads the system files.
     */
    public readonly nameAndVersion: string;

    constructor(
        disk: FloppyDisk,
        geometry: FloppyDiskGeometry,
        version: TrsdosVersion,
        allocationSides: number,
        granulesPerLump: number,
        sectorsPerGranule: number,
        dirLumpNumber: number,
        granulesPerDir: number,
        firstDataCylinder: number) {

        this.disk = disk;
        this.geometry = geometry;
        this.version = version;
        this.allocationSides = allocationSides;
        this.granulesPerLump = granulesPerLump;
        this.sectorsPerGranule = sectorsPerGranule;
        this.dirLumpNumber = dirLumpNumber;
        this.granulesPerDir = granulesPerDir;
        this.firstDataCylinder = firstDataCylinder;

        this.dirEntryLength = getDirEntryLength(version);
        this.dirEntriesPerSector = Math.floor(geometry.modalDataSectorSize / this.dirEntryLength);
        this.sectorsPerLump = this.sectorsPerGranule * this.granulesPerLump;
        this.sectorsPerCylinder = geometry.modalDataSectorSpan*this.allocationSides;
        this.lumpCount = computeLumpCount(geometry, firstDataCylinder, this.sectorsPerCylinder, this.sectorsPerLump);
        this.lumpTerm = this.sectorsPerLump === geometry.modalDataSectorSpan * this.allocationSides && this.firstDataCylinder === 0
            ? "cylinder" : "lump";

        this.evaluation = this.evaluate();
        const gatInfo = this.getGatInfo();
        this.gatPassesStrictCheck = typeof gatInfo !== "string" &&
            gatInfo.hasValidHighBits(this.granulesPerLump, this.lumpCount, this.version);
        this.nameAndVersion = this.evaluation.score >= 0 ? this.decodeNameAndVersion() : UNKNOWN_DOS;
    }

    /**
     * Compare this candidate interpretation of the disk with another, for sorting best first:
     * negative if this one is better, positive if the other is, zero if they're equally good.
     * Each rule below only applies when all the rules before it are tied.
     */
    public compareTo(other: Trsdos): number {
        // A negative score means "not this", so a disqualified candidate sorts after every
        // candidate that isn't, whatever else it has going for it.
        const thisDisqualified = this.evaluation.score < 0;
        const otherDisqualified = other.evaluation.score < 0;
        if (thisDisqualified !== otherDisqualified) {
            return thisDisqualified ? 1 : -1;
        }

        // A GAT whose unused high bits are what the DOS writes there is strong evidence that
        // the granules per lump are right, which hash hits can't tell us (they come from the
        // directory, not the allocation). Passing sorts first.
        if (this.gatPassesStrictCheck !== other.gatPassesStrictCheck) {
            return this.gatPassesStrictCheck ? -1 : 1;
        }

        // Hash hits minus misses and impossible extents. Higher sorts first.
        if (this.evaluation.score !== other.evaluation.score) {
            return other.evaluation.score - this.evaluation.score;
        }

        // When nothing above tells one side from two, nothing on the disk uses side 1: it's
        // double-sided media used single-sided, and side 1 may be left over from an earlier
        // format. Fewer sides sort first.
        if (this.allocationSides !== other.allocationSides) {
            return this.allocationSides - other.allocationSides;
        }

        // Same for the directory: if the rest of its lump adds nothing, the directory doesn't
        // extend there (DOSPLUS keeps it on side 0 of the directory cylinder, and a NEWDOS/80
        // directory can be smaller than its lump). A directory that doesn't fill its lump
        // sorts first. Among sizes that don't, the generators' order (smallest first) decides.
        const thisDirFillsLump = this.granulesPerDir === this.granulesPerLump;
        const otherDirFillsLump = other.granulesPerDir === other.granulesPerLump;
        if (thisDirFillsLump !== otherDirFillsLump) {
            return thisDirFillsLump ? 1 : -1;
        }

        return 0;
    }

    /**
     * Compute an integer score estimating whether we think this is a valid TRSDOS disk and configuration.
     * Negative scores mean that we're pretty sure this isn't a TRSDOS disk. Higher scores are better.
     */
    private evaluate(): Evaluation {
        const gatInfo = this.getGatInfo();
        if (typeof gatInfo === "string") {
            return { score: -1, reason: gatInfo };
        }

        // Check directory sectors for magic string.
        if (CHECK_EXPECTED_TANDY && this.version === TrsdosVersion.V1_3) {
            let totalDirSectors = 0;
            let dirSectorsWithTandy = 0;

            for (const { dirPosition } of this.getDirSectors()) {
                const dirSector = this.disk.readSector(dirPosition);
                if (dirSector !== undefined) {
                    totalDirSectors += 1;

                    // Just past the last entry.
                    const tandyIndex = this.dirEntriesPerSector * this.dirEntryLength;
                    const tandy = decodeAscii(dirSector.data.subarray(tandyIndex));
                    if (tandy === EXPECTED_TANDY) {
                        dirSectorsWithTandy += 1;
                    }
                }
            }

            if (totalDirSectors < 5) {
                return { score: -1, reason: `Too few directory sectors (${totalDirSectors})` };
            }

            // I've seen floppies missing this in some sectors, so as long as at least half
            // the sectors have it, we can be pretty sure that this was at least originally
            // a Model 3 disk.
            if (dirSectorsWithTandy < totalDirSectors / 2) {
                return { score: -1, reason: `Got "${EXPECTED_TANDY}" on too few sectors (${dirSectorsWithTandy} of ${totalDirSectors})` };
            }
        }

        // Make sure HIT can be read and parsed.
        const hitInfo = this.getHitInfo();
        if (typeof hitInfo === "string") {
            return { score: -1, reason: hitInfo };
        }

        let hashHits = 0;
        let hashMisses = 0;
        // Extents that start past the end of their lump or of the disk, which no DOS writes.
        // Reading a double-sided disk single-sided makes every file that starts on side 1
        // look like this.
        let badExtents = 0;

        // console.log(`--- Computing score for track ${this.dirCylinderNumber}`)

        for (const { sectorIndex, dirPosition } of this.getDirSectors()) {
            const dirSector = this.disk.readSector(dirPosition);
            if (dirSector !== undefined) {
                for (let i = 0; i < this.dirEntriesPerSector; i++) {
                    const dirEntryBinary = dirSector.data.subarray(i * this.dirEntryLength, (i + 1) * this.dirEntryLength);
                    const dirEntry = decodeDirEntry(dirEntryBinary, this.geometry, this.version);
                    // console.log({side, sectorIndex, i, filename: dirEntry?.getFilename("/"), system: dirEntry?.isSystemFile()});
                    if (typeof dirEntry === "string") {
                        // Not a TRSDOS disk.
                        return {score: -1, reason: dirEntry};
                    }
                    if (dirEntry !== undefined) {
                        // Don't record deleted entries.
                        const computedHash = hashForFilename(dirEntry.rawFilename);
                        const index = this.dirEntryToHitNumber(sectorIndex, i);
                        const hitHash = hitInfo.hit[index];
                        // console.log(`Comparing hits at ${side}:${sectorIndex}:${i} = ${index}: ${computedHash} vs. ${hitHash} ${dirEntry.rawFilename}`);
                        if (computedHash === hitHash || isOldDirSysHash(this.version, index, dirEntry.rawFilename, hitHash)) {
                            hashHits += 1;
                        } else {
                            hashMisses += 1;
                        }
                        for (const extent of dirEntry.extents) {
                            if (extent.granuleOffset >= this.granulesPerLump || extent.cylinderNumber >= this.lumpCount) {
                                badExtents += 1;
                            }
                        }
                        // DIR/SYS is the file that holds the directory, so if there is one, it must
                        // start at our directory lump. Otherwise we're reading some other layout
                        // that happens to reach the same sectors, or a leftover directory.
                        if (dirEntry.getFilename("/") === "DIR/SYS" && dirEntry.extents.length > 0 &&
                            dirEntry.extents[0].cylinderNumber !== this.dirLumpNumber) {

                            return { score: -1, reason: `DIR/SYS is on lump ${dirEntry.extents[0].cylinderNumber}, not the directory's lump` };
                        }
                    }
                }
            }
        }

        if (this.version === TrsdosVersion.V2_3 && hashHits < 2) {
            // Even blank disks have DIR/SYS and BOOT/SYS.
            return { score: -1, reason: "Didn't find required system files" };
        }

        const score = hashHits - hashMisses - badExtents;
        const reason = `${hashHits} hash hits, ${hashMisses} hash misses, ${badExtents} bad extents`;

        return { score, reason };
    }

    public summary(): string {
        return `${trsdosVersionToString(this.version)}, dir on ${this.lumpTerm} ${this.dirLumpNumber}, ${this.granulesPerLump} granules per ${this.lumpTerm}, ${this.allocationSides} sides`;
    }

    /**
     * Map a directory sector and dir entry index to an index into the HIT (zero-based).
     */
    private dirEntryToHitNumber(sectorIndex: number,
                                dirEntryIndex: number): number {

        switch (this.version) {
            case TrsdosVersion.V2_3:
                // If you change this, update hitNumberToDirEntry().
                return (dirEntryIndex << 5) | sectorIndex;

            case TrsdosVersion.V1_3:
                // If you change this, update hitNumberToDirEntry().
                return sectorIndex * this.dirEntriesPerSector + dirEntryIndex;
        }
    }

    /**
     * Map an index into the HIT (zero-based) to its sector index and dir entry index.
     */
    private hitNumberToDirEntry(hitIndex: number): DirEntryPosition {
        let sectorIndex: number;
        let dirEntryIndex: number;

        switch (this.version) {
            case TrsdosVersion.V2_3:
                // The hit index has format IIISSSSS where III is the index within
                // the sector (0-7, Model 1 has 8 dir entries per sector), and SSSSS
                // is the sector index. The sector index starts after the GAT
                // and HIT sectors.

                // Also, entry indexes 0 and 1 are reserved for system files.
                // Entry 0 on sector index 0 is BOOT/SYS, followed by entry 0 on
                // sector index 1 (DIR/SYS), entry 0 on sector index 2 (SYS0/SYS), and
                // so on, wrapping back to entry 1 on sector index 0 (SYS6/SYS).
                // The algorithm that looks for empty HIT entries when creating
                // a new file (0x50AB in SYS2/SYS) does not even consider entries
                // 0 and 1 of each sector. This leaves 48 possible HIT entries
                // for user files: 6 entries per sector, times 8 sectors (10
                // sectors per track minus 2 for HIT and GAT).

                // Note that the sectorIndex variable is in the range [0,31], but
                // disks can have 18 sectors per side (when double density), for a total
                // of 36, minus 2 for GAT and HIT. The last two sectors of side 1 can't
                // be reached and LDOS leaves them empty.

                // If you change this, update dirEntryToHitNumber().
                sectorIndex = hitIndex & 0x1F;
                dirEntryIndex = hitIndex >> 5;
                break;

            case TrsdosVersion.V1_3:
                // These are laid out continuously.
                // If you change this, update dirEntryToHitNumber().
                sectorIndex = Math.floor(hitIndex / this.dirEntriesPerSector);
                dirEntryIndex = hitIndex % this.dirEntriesPerSector;
                break;
        }

        return new DirEntryPosition(sectorIndex, dirEntryIndex);
    }

    /**
     * Convert a lump-based sector position to a physical track-based sector position.
     *
     * The granule and sectorOffsets are not checked against bounds, so (for example), the sectorOffset could
     * extend past the end of the granule, and it would do the right thing (in case the caller wants to
     * think of terms of lumps and sectors, not granules).
     */
    private logicalToPhysical(lumpNumber: number, granule: number, sectorOffset: number, debug: boolean = false): SectorPosition {
        // Global index into the whole floppy (perhaps excluding cylinder 0). This starts at the first sector
        // of the first data cylinder, continues for every sector on that track, goes to the second side of
        // that cylinder (if the DOS is using side 1 on this floppy), then on to the next cylinder.
        const globalSectorIndex = lumpNumber*this.sectorsPerLump + granule*this.sectorsPerGranule + sectorOffset;

        const cylinderNumber = this.firstDataCylinder + Math.floor(globalSectorIndex / this.sectorsPerCylinder);
        const cylinderSectorIndex = globalSectorIndex % this.sectorsPerCylinder;

        const sectorsPerTrack = this.geometry.modalDataSectorSpan;
        const side = Math.floor(cylinderSectorIndex / sectorsPerTrack);
        const sectorNumber = getFirstSectorNumber(this.version) + cylinderSectorIndex % sectorsPerTrack;

        const sectorPosition = SectorPosition.make(cylinderNumber, side, sectorNumber);
        if (debug) {
            // TODO remove.
            console.log(`${lumpNumber}:${granule}:${sectorOffset} -> ${sectorPosition.key()}`);
        }
        return sectorPosition;
    }

    public getGatInfo(): TrsdosGatInfo | string {
        // Should we decide this by the first sector in the geometry, or the sector we know is first in the version?
        // Probably the latter, to help reject badly-guessed disks.
        const gatPosition = this.logicalToPhysical(this.dirLumpNumber, 0, 0);
        const gatSector = this.disk.readSector(gatPosition);
        if (gatSector === undefined) {
            return "Can't read GAT sector";
        }
        const gatInfo = decodeGatInfo(gatSector.data, this.lumpCount, this.geometry, this.version);
        if (typeof gatInfo === "string") {
            return "Can't decode GAT (" + gatInfo + ")";
        }

        return gatInfo;
    }

    /**
     * Get the HIT information for the disk, or an error message (which typically implies that this
     * is not a TRSDOS disk).
     */
    public getHitInfo(): TrsdosHitInfo | string {
        // Decode Hash Index Table sector.
        const hitPosition = this.logicalToPhysical(this.dirLumpNumber, 0, 1);
        const hitSector = this.disk.readSector(hitPosition);
        if (hitSector === undefined) {
            return "Can't read HIT sector";
        }
        const hitInfo = decodeHitInfo(hitSector.data, this.geometry, this.version);
        if (typeof hitInfo === "string") {
            return "Can't decode HIT: " + hitInfo;
        }

        return hitInfo;
    }

    /**
     * Generate all sectors on the directory lump that holds directory entries.
     */
    public *getDirSectors(): Generator<{ sectorIndex: number, dirPosition: SectorPosition }> {
        // Skip GAT and HIT.
        const gatHitSectorCount = 2;
        const sectorCount = this.granulesPerDir*this.sectorsPerGranule - gatHitSectorCount;
        for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex++) {
            if (this.version === TrsdosVersion.V2_3 && sectorIndex >= 32) {
                // Inaccessible, the sector index is stored in 5 bits.
                continue;
            }

            const dirPosition = this.logicalToPhysical(this.dirLumpNumber, 0, sectorIndex + gatHitSectorCount);
            yield {sectorIndex, dirPosition};
        }
    }

    /**
     * Read all active directory entries in the directory.
     */
    public getDirEntries(includeSystemFiles: boolean): TrsdosDirEntry[] {
        // Map from position of directory entry to its actual entry. The key is the asKey() result
        // of DirEntryPosition.
        const dirEntries = new Map<string, TrsdosDirEntry>();

        // Decode directory entries.
        for (const { sectorIndex, dirPosition } of this.getDirSectors()) {
            const dirSector = this.disk.readSector(dirPosition);
            if (dirSector !== undefined) {
                for (let i = 0; i < this.dirEntriesPerSector; i++) {
                    const dirEntryBinary = dirSector.data.subarray(i * this.dirEntryLength, (i + 1) * this.dirEntryLength);
                    const dirEntry = decodeDirEntry(dirEntryBinary, this.geometry, this.version);
                    // console.log({side, sectorIndex, i, filename: dirEntry?.getFilename("/"), system: dirEntry?.isSystemFile()});
                    if (typeof dirEntry === "string") {
                        // TODO what to do with this error? Abort this method?
                    } else if (dirEntry !== undefined) {
                        // Don't record deleted entries.
                        dirEntries.set(new DirEntryPosition(sectorIndex, i).key(), dirEntry);
                    }
                }
            }
        }

        // Look up continuations by sector/index and update original entries.
        for (const dirEntry of dirEntries.values()) {
            if (dirEntry.prevDec !== undefined) {
                const position = this.hitNumberToDirEntry(dirEntry.prevDec);
                const prevDirEntry = dirEntries.get(position.key());
                if (prevDirEntry !== undefined) {
                    dirEntry.prevDirEntry = prevDirEntry;
                }
            }
            if (dirEntry.nextDec !== undefined) {
                const position = this.hitNumberToDirEntry(dirEntry.nextDec);
                const nextDirEntry = dirEntries.get(position.key());
                if (nextDirEntry !== undefined) {
                    dirEntry.nextDirEntry = nextDirEntry;
                }
            }
        }

        if (2 > 3) {
            // Find extended entries, for debugging. TODO remove.
            for (const dirEntry of dirEntries.values()) {
                if (dirEntry.isExtendedEntry()) {
                    console.log("extended entry", dirEntry);
                }
            }
        }

        // Remove the extended entries and possibly the system files.
        return [...dirEntries.values()]
            .filter(d => !d.isExtendedEntry() && (includeSystemFiles || !d.isSystemFile()));
    }

    /**
     * Filename must be in TRSDOS format ("FOO/CMD").
     */
    public findFile(filename: string): TrsdosDirEntry | undefined {
        // TODO make this more efficient, maybe pass in filter.
        const entries = this.getDirEntries(true);
        for (const entry of entries) {
            if (entry.getFilename("/") === filename) {
                return entry;
            }
        }

        return undefined;
    }

    /**
     * Decide the name and version of the DOS that wrote the disk, from what the disk says about
     * itself.
     */
    private decodeNameAndVersion(): string {
        const gatInfo = this.getGatInfo();
        if (typeof gatInfo === "string") {
            return UNKNOWN_DOS;
        }

        const bootTrack = this.disk.getBootTrackText();

        // Model III TRSDOS names its version on the boot track.
        if (this.version === TrsdosVersion.V1_3) {
            const match = bootTrack.match(/version (1\.\d)/);
            return match === null ? "TRSDOS 1.x" : `TRSDOS ${match[1]}`;
        }

        // A banner only counts if its DOS could have written this layout: lumps that aren't whole
        // cylinders are NEWDOS/80's, MultiDOS's and DoubleDOS's. (A NEWDOS/80 disk can carry
        // another DOS's system files, which then can't boot it.)
        const banner = this.findSystemBanner();
        if (banner !== undefined && (this.lumpTerm === "cylinder" || /^(NEWDOS\/80|MultiDOS|DoubleDOS)/.test(banner))) {
            return banner;
        }

        // MultiDOS 1.4 through 1.7 boot sectors start with 3B FE, and their data disks have
        // nothing else to go on.
        if (/MULTIDOS|Cosmopolitan|C\.E\.C\.|\(c\) CEC/.test(bootTrack) || this.bootSectorStartsWith(0x3B, 0xFE)) {
            return "MultiDOS";
        }
        if (bootTrack.includes("ULTRADOS")) {
            const match = bootTrack.match(/ULTRADOS DISK OPERATING SYSTEM VERSION (\d\.\d)/);
            if (match !== null) {
                return `UltraDOS ${match[1]}`;
            }
            // Some UltraDOS disks have "U" and the version in ASCII at 0xCB-0xCD ("U41").
            const version = this.getGatText(0xCC, 0xCE);
            return /^\d\d$/.test(version) ? `UltraDOS ${version[0]}.${version[1]}` : "UltraDOS";
        }
        if (bootTrack.includes("RAPIDOS")) {
            const match = bootTrack.match(/Version (\d\.\d)/);
            return match === null ? "RAPIDOS" : `RAPIDOS ${match[1]}`;
        }
        // This formatter writes 0x31 to 0x34 at 0xCB, like DOSPLUS, but isn't DOSPLUS.
        if (bootTrack.includes("Not A System Disk")) {
            return UNKNOWN_DOS;
        }

        const osVersion = gatInfo.osVersion;
        switch (osVersion) {
            case 0x00:
                return this.hasTrsdos23BBootSector() ? "TRSDOS 2.3B" : UNKNOWN_DOS;
            case 0x20:
                return "TRSDOS 2.0";
            case 0x21:
                // TRSDOS 2.1 through 2.3 all write 0x21, as do their derivatives NEWDOS 2.1 and
                // DoubleDOS, whose system disks are named by their banners.
                return "TRSDOS 2.x";
            case 0x30:
                return "VTOS 3.0";
            case 0x31: case 0x32: case 0x33: case 0x34: case 0x35:
                return `DOSPLUS 3.${osVersion & 0x0F}`;
            case 0x40:
                // Written by VTOS 4.0, DOSPLUS 4.0, and DOSPLUS 3.4a.
                if (bootTrack.includes("VTOS")) {
                    return "VTOS 4.0";
                }
                return bootTrack.includes("DOSPLUS") ? "DOSPLUS" : UNKNOWN_DOS;
            case 0x51: case 0x53:
                // NEWDOS 3.0 also writes 0x53; its system disks are named by their banner.
                return `LDOS 5.${osVersion & 0x0F}`;
            case 0x60:
                // DOSPLUS IV writes the TRSDOS 6 GAT.
                return bootTrack.includes("DOSPLUS") ? "DOSPLUS IV" : "TRSDOS 6.0";
            case 0x61: case 0x62:
                return `TRSDOS 6.${osVersion & 0x0F}`;
            case 0x63:
                return "LS-DOS 6.3";
            case 0x80:
                return "NEWDOS/80 v1.0";
            case 0x82:
                return "NEWDOS/80 v2.0";
            default:
                // Among others: 0x50 and 0x22 (Kim Watt's utility disks, not LDOS 5.0 or
                // TRSDOS 2.2), 0x55 (UltraDOS's "U"), and 0xFC.
                return UNKNOWN_DOS;
        }
    }

    /**
     * Search the text of the system files for a banner in SYSTEM_BANNERS, returning the name and
     * version it gives, or undefined if there isn't one.
     */
    private findSystemBanner(): string | undefined {
        const texts: string[] = [];
        for (const dirEntry of this.getDirEntries(true)) {
            if (dirEntry.getExtension().toUpperCase() === "SYS") {
                const text = this.getProgramText(this.readFileData(dirEntry, false));
                texts.push(text, negateText(text));
            }
        }

        for (const banner of SYSTEM_BANNERS) {
            for (const text of texts) {
                const match = text.match(banner.pattern);
                if (match !== null) {
                    return banner.name(match);
                }
            }
        }

        return undefined;
    }

    /**
     * The bytes a program loads, as Latin-1 text. Strings in a CMD file can straddle the headers
     * of its load records, so join the records' data. Other files are taken as is.
     */
    private getProgramText(binary: Uint8Array): string {
        const cmdProgram = decodeCmdProgram(binary);
        const loadBlocks = cmdProgram?.chunks.filter((chunk): chunk is CmdLoadBlockChunk =>
            chunk instanceof CmdLoadBlockChunk) ?? [];
        return loadBlocks.length > 0
            ? loadBlocks.map(chunk => bytesToText(chunk.loadData)).join("")
            : bytesToText(binary);
    }

    /**
     * Bytes [begin, end) of the GAT sector as Latin-1 text, or an empty string if it can't be read.
     */
    private getGatText(begin: number, end: number): string {
        const gatSector = this.disk.readSector(this.logicalToPhysical(this.dirLumpNumber, 0, 0));
        return gatSector === undefined ? "" : bytesToText(gatSector.data.subarray(begin, end));
    }

    /**
     * Whether the boot sector starts with these bytes.
     */
    private bootSectorStartsWith(...bytes: number[]): boolean {
        const bootSector = this.disk.readSector(this.geometry.bootTrack.firstSectorPosition());
        return bootSector !== undefined && bytes.every((b, i) => bootSector.data[i] === b);
    }

    /**
     * Whether the boot sector loads SYS0/SYS from cylinder 0 sector 5 the way only TRSDOS 2.3B's
     * does (LD D,0; LD E,5), rather than through the directory.
     */
    private hasTrsdos23BBootSector(): boolean {
        const bootSector = this.disk.readSector(this.geometry.bootTrack.firstSectorPosition());
        if (bootSector === undefined) {
            return false;
        }
        const data = bootSector.data;
        for (let i = 0; i + 3 < data.length; i++) {
            if (data[i] === 0x16 && data[i + 1] === 0x00 && data[i + 2] === 0x1E && data[i + 3] === 0x05) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the position of all the sectors of the file.
     */
    public getFileSectorPositions(firstDirEntry: TrsdosDirEntry): SectorPosition[] {
        const sectorPositions: SectorPosition[] = [];

        // Number of sectors left to read.
        // TODO aren't sector sizes not fixed?
        const sectorsInFile = Math.ceil(firstDirEntry.getSize() / BYTES_PER_SECTOR);

        // Loop through all the directory entries for this file.
        // Corrupt directories can have entries that point to each other, so don't revisit any.
        const visitedDirEntries = new Set<TrsdosDirEntry>();
        let dirEntry: TrsdosDirEntry | undefined = firstDirEntry;
        while (dirEntry !== undefined && !visitedDirEntries.has(dirEntry)) {
            visitedDirEntries.add(dirEntry);
            for (const extent of dirEntry.extents) {
                const sectorCount = extent.granuleCount * this.sectorsPerGranule;
                for (let i = 0; i < sectorCount && sectorPositions.length < sectorsInFile; i++) {
                    sectorPositions.push(this.logicalToPhysical(extent.cylinderNumber, extent.granuleOffset, i));
                }
            }

            // Follow the linked list of directory entries.
            dirEntry = dirEntry.nextDirEntry;
        }

        // BOOT/SYS claims whole granules of the boot track, but on disks whose boot track is formatted
        // with fewer sectors than the others (single density on a double-density disk), the sectors
        // past the end of the track were never formatted. They aren't missing, they don't exist.
        if (firstDirEntry.getFilename("/") === "BOOT/SYS") {
            const bootTrack = this.geometry.bootTrack;
            return sectorPositions.filter(sectorPosition =>
                !sectorPosition.trackPosition.equals(bootTrack.trackPosition) ||
                sectorPosition.sectorNumber <= bootTrack.lastSectorNumber);
        }

        return sectorPositions;
    }

    /**
     * Read the binary for a file on the diskette.
     */
    public readFile(firstDirEntry: TrsdosDirEntry): Uint8Array {
        return this.readFileData(firstDirEntry, true);
    }

    /**
     * Read the binary for a file on the diskette, optionally warning about sectors that are
     * missing or have CRC errors.
     */
    private readFileData(firstDirEntry: TrsdosDirEntry, warn: boolean): Uint8Array {
        const sectors: Uint8Array[] = [];
        const sectorPositions = this.getFileSectorPositions(firstDirEntry);

        for (const sectorPosition of sectorPositions) {
            const sector = this.disk.readSector(sectorPosition);
            if (sector === undefined) {
                if (warn) {
                    TRS80_BASE_LOGGER.warn(`Sector couldn't be read ${sectorPosition.key()}`);
                }
                // Keep the rest of the file in place.
                sectors.push(new Uint8Array(this.geometry.modalDataSectorSize));
            } else {
                if (sector.crcError && warn) {
                    TRS80_BASE_LOGGER.warn("Sector has CRC error");
                }
                sectors.push(sector.data);
            }
        }

        // All sectors.
        const binary = concatByteArrays(sectors);

        // Clip to size. In principle this is cheap because it's a view.
        return binary.subarray(0, firstDirEntry.getSize());
    }

    /**
     * Write the binary for a file on the diskette.
     *
     * @param binary the bytes to write to the file.
     * @param filename TRSDOS filename, with a slash for the extension ("FOO/CMD").
     * @return a string if an error occurred.
     */
    public writeFile(binary: Uint8Array, filename: string): string | undefined {
        const entry = this.findFile(filename);
        if (entry !== undefined) {
            return `The file "${filename}" already exists; delete it first`;
        }

        return undefined;
    }
}

/**
 * Why a particular TRSDOS version was rejected when decoding a diskette.
 */
export interface TrsdosRejection {
    version: TrsdosVersion;
    reason: string;
}

function generateTrsdos23Candidates(disk: FloppyDisk): Trsdos[] {
    const candidates: Trsdos[] = [];

    const version = TrsdosVersion.V2_3;
    const geometry = disk.getGeometry();
    const sectorsPerTrack = geometry.modalDataSectorSpan;
    const density = geometry.modalDataDensity;
    const granulesPerTrack = density === Density.SINGLE ? 2 : 3;
    const sectorsPerGranule = Math.floor(sectorsPerTrack / granulesPerTrack);

    // Allocation sides are the DOS's, not the image's: double-sided media can be used
    // single-sided, and a double-sided disk can be imaged single-sided. Try both and let
    // the evaluation decide. Don't clamp to geometry.sideCount: on a double-sided disk
    // imaged single-sided, reading one side silently pulls the wrong cylinder's data into
    // every file that continues onto side 1, where reading two honestly reports those
    // sectors as missing.
    for (const allocationSides of [1, 2]) {
        const granulesPerLump = granulesPerTrack * allocationSides;

        // LDOS puts directory entries on both sides of the directory cylinder, DOSPLUS
        // only on side 0.
        const granulesPerDirOptions = allocationSides === 1 ? [granulesPerLump] : [granulesPerTrack, granulesPerLump];

        for (const granulesPerDir of granulesPerDirOptions) {
            for (let dirLumpNumber = 0; dirLumpNumber < geometry.cylinderCount; dirLumpNumber++) {
                candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
                    dirLumpNumber, granulesPerDir, 0));
            }
        }
    }

    return candidates;
}

function generateTrsdos13Candidates(disk: FloppyDisk): Trsdos[] {
    const candidates: Trsdos[] = [];

    const version = TrsdosVersion.V1_3;
    const geometry = disk.getGeometry();
    const allocationSides = 1; // TRSDOS 1.3 only supported single-sided disks, so ignore geometry here.
    const density = geometry.modalDataDensity;
    const sectorsPerGranule = density === Density.SINGLE ? 2 : 3;
    const granulesPerLump = Math.floor(geometry.modalDataSectorSpan / sectorsPerGranule) * allocationSides;

    for (let dirLumpNumber = 0; dirLumpNumber < geometry.cylinderCount; dirLumpNumber++) {
        candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
            dirLumpNumber, granulesPerLump, 0));
    }

    return candidates;
}

function generateNewdos80Candidates(disk: FloppyDisk): Trsdos[] {
    const candidates: Trsdos[] = [];

    const version = TrsdosVersion.V2_3;
    const geometry = disk.getGeometry();
    const sectorsPerGranule = 5;
    const firstDataCylinder = geometry.cylinder0Differs ? 1 : 0;

    // As with the 2.3 family, allocation sides are the DOS's, so try both, and don't clamp
    // to geometry.sideCount (see generateTrsdos23Candidates()).
    for (const allocationSides of [1, 2]) {
        for (let granulesPerLump = 2; granulesPerLump <= 8; granulesPerLump++) {
            const sectorsPerLump = granulesPerLump * sectorsPerGranule;
            const sectorsPerCylinder = geometry.modalDataSectorSpan*allocationSides;
            const lumpCount = computeLumpCount(geometry, firstDataCylinder, sectorsPerCylinder, sectorsPerLump);

            // The directory needn't fill its lump (with GPL=6 it can be 3 granules), and reading
            // the rest of the lump as entries hits file data and rejects the candidate.
            // NEWDOS/80 records the size in HIT byte 0x1F, but trying every size is simpler, and
            // compareTo() prefers a directory that doesn't fill its lump.
            for (let granulesPerDir = 2; granulesPerDir <= granulesPerLump; granulesPerDir++) {
                for (let dirLumpNumber = 0; dirLumpNumber < lumpCount; dirLumpNumber++) {
                    candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
                        dirLumpNumber, granulesPerDir, firstDataCylinder));
                }
            }
        }
    }

    return candidates;
}

/**
 * Decode a TRSDOS diskette, or return undefined if this does not look like such a diskette.
 */
export function decodeTrsdos(disk: FloppyDisk): Trsdos | undefined {
    // return decodeTrsdosWithRejections(disk).trsdos;

    const candidates: Trsdos[] = [
        ... generateTrsdos23Candidates(disk),
        ... generateTrsdos13Candidates(disk),
        ... generateNewdos80Candidates(disk),
    ];

    // Best first.
    candidates.sort((a, b) => a.compareTo(b));

    if (false) {
        for (const trsdos of candidates) {
            if (trsdos.evaluation.score >= 0 || true) {
                console.log(`${trsdos.summary()} has ${evaluationToString(trsdos.evaluation)}`);
            }
        }
    }

    if (candidates.length > 0 && candidates[0].evaluation.score >= 0) {
        return candidates[0];
    } else {
        return undefined;
    }
}

/**
 * Decode a TRSDOS diskette, also returning why each version tried before the successful
 * one (or all versions, if none succeeded) was rejected.
 */
export function decodeTrsdosWithRejections(disk: FloppyDisk): {
    trsdos: Trsdos | undefined,
    rejections: TrsdosRejection[],
} {
    const trsdos = decodeTrsdos(disk);
    return { trsdos, rejections: [] };
}
