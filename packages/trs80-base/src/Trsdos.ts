/**
 * Classes for handling TRSDOS diskettes.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/zaps-and-patches/#guidedtour
 * http://www.manmrk.net/tutorials/TRS80/Software/ldos/trs80/doc/prgguide.pdf
 * https://www.tim-mann.org/trs80/doc/ld51man3.pdf
 */

import {concatByteArrays} from "teamten-ts-utils";
import {BYTES_PER_SECTOR, Density, SectorPosition} from "./FloppyDisk.js";
import type {DiskVolume, VolumeGeometry} from "./DiskVolume.js";
import {assertNever, toHexByte, word} from "z80-base";
import {TRS80_BASE_LOGGER} from "z80-logger";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {CmdLoadBlockChunk, decodeCmdProgram} from "./CmdProgram.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {bytesToText} from "./DiskUtils.js";

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
    // W. S. and D. S. Sands's extensions of NEWDOS/80 v2.0, which keep its disk format, so only
    // their system disks can be told apart. Must come before NEWDOS/80's banners, which they keep.
    {pattern: /a NewDos ?(86|90) SYSTEM disk/i, name: m => `NEWDOS/${m[1]}`},
    {pattern: /NEWDOS80[^\n]{0,60}?VERSION (\d\.\d)/i, name: m => `NEWDOS/80 v${m[1]}`},
    // NEWDOS/80 v2 draws its name in graphics characters; only the rest is text.
    {pattern: /APPARAT, INC\.[\s\S]{0,60}?VERSION (\d\.[\dX])/, name: m => `NEWDOS/80 v${m[1]}`},
    // NEWDOS 2.2 (NEWDOS+) says it this way.
    {pattern: /NEWDOS - VERSION (\d\.\d)/, name: m => `NEWDOS ${m[1]}`},
    {pattern: /NEWDOS - DISK OPERATING SYSTEM - VER (\d\.\d)/, name: m => `NEWDOS ${m[1]}`},
    {pattern: /DBLDOS - DISK OPERATING SYSTEM - VER (\d\.\d+)/, name: m => `DoubleDOS ${m[1]}`},
    {pattern: /VTOS - VIRTUAL TECHNOLOGY'S OPERATING SYSTEM - VER (\d\.\d(?:\.\d)?)/, name: m => `VTOS ${m[1]}`},
    {pattern: /DOS ?PLUS IV/, name: () => "DOSPLUS IV"},
    // The Model II's, by MicroPower: "DosPLUS II - Series A.00".
    {pattern: /DosPLUS II - Series ([A-Z]\.\d+)/, name: m => `DOSPLUS II ${m[1]}`},
    // DOSPLUS 3.5 says "3.50" but writes 0x35 at 0xCB; use the shorter form for both.
    {pattern: /DOS ?PLUS\b[^\n]{0,50}?(\d\.\d+[a-z]?(?:\.\d+)?)/, name: m => `DOSPLUS ${m[1].replace(/^(\d\.\d)0$/, "$1")}`},
    // "VER 5.1.4", "Ver 5.1.4", "VER. 5.0.1" (the Lobo edition), and "VER 513/R".
    {pattern: /L ?D ?O ?S - [^\n]{0,60}?VER\.? ?(\d)\.?(\d)\.?(\d)/i, name: m => `LDOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /LS-DOS 0?(\d)\.0?(\d)\.0?(\d)/, name: m => `LS-DOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /TRSDOS 0?(6)\.0?(\d)\.0?(\d)/, name: m => `TRSDOS ${m[1]}.${m[2]}.${m[3]}`},
    {pattern: /TRSDOS - DISK OPERATING SYSTEM -? ?VER (\d\.\d[A-Z]?)/, name: m => `TRSDOS ${m[1]}`},
];

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
function computeLumpCount(geometry: VolumeGeometry, firstDataCylinder: number,
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
 * The raw 11-character name that the 2.3 family puts in the system file at a given DEC,
 * or undefined for any other DEC. BOOT/SYS is at 0x00, DIR/SYS at 0x01, SYS0-SYS5 at
 * 0x02-0x07, SYS6-SYS13 at 0x20-0x27, SYS14-SYS21 at 0x40-0x47 (NEWDOS/80 v2), and
 * SYS22-SYS29 at 0x60-0x67 (NEWDOS/90). See "The HIT" in FLOPPY_FORMATS.md.
 */
function trsdos23SystemFilename(hitIndex: number): string | undefined {
    const row = hitIndex >> 5;
    const column = hitIndex & 0x1F;
    if (row > 3 || column > 7) {
        return undefined;
    }

    if (row === 0 && column === 0) {
        return "BOOT    SYS";
    }
    if (row === 0 && column === 1) {
        return "DIR     SYS";
    }

    const n = row*8 + column - 2;
    return ("SYS" + n).padEnd(8, " ") + "SYS";
}

/**
 * Whether a raw filename is entirely spaces.
 */
function isBlankFilename(rawFilename: string): boolean {
    return rawFilename.trim() === "";
}

/**
 * Try to recover the name of a system file whose name was overwritten with spaces. A
 * one-byte hash can't recover a name, but it can confirm the one name that the DOS would
 * have put in that slot: the standard system filename for the entry's DEC, if its hash
 * (or DIR/SYS's old wrong hash) matches the HIT byte. Returns undefined if the entry isn't
 * a blank-named primary system entry on a 2.3 family disk, or if the hash doesn't confirm
 * the name.
 */
function reconstructBlankFilename(version: TrsdosVersion, hitIndex: number, hitHash: number,
                                  dirEntry: TrsdosDirEntry): string | undefined {

    if (version !== TrsdosVersion.V2_3 || dirEntry.isExtendedEntry() || !dirEntry.isSystemFile() ||
        !isBlankFilename(dirEntry.rawFilename)) {

        return undefined;
    }

    const name = trsdos23SystemFilename(hitIndex);
    if (name === undefined) {
        return undefined;
    }

    if (hashForFilename(name) === hitHash || isOldDirSysHash(version, hitIndex, name, hitHash)) {
        return name;
    }

    return undefined;
}

/**
 * Compute the one-byte HIT hash for an 11-letter filename. Use spaces to fill in
 * the file or extension if necessary (e.g., "FOO     BAS").
 *
 * Based on the assembly code in TRSDOS:
 *
 * https://www.trs-80.com/wordpress/dos-trsdos-v2-3-disassembled/model-i-trsdos-sys2-sys/#509BH
 */
export function hashForFilename(filename: string): number {
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
    // Tandy's Model I TRSDOS 2.7DD/2.8 (and 2.7SD): 1.3's geometry with 32-byte entries. See
    // "Which DOSes share a layout" in FLOPPY_FORMATS.md.
    V2_7,
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

        case TrsdosVersion.V2_7:
            return "Model I 2.7";

        default:
            assertNever(trsdosVersion);
    }
}

/**
 * The number of bytes in each directory entry for this version.
 */
function getDirEntryLength(version: TrsdosVersion): number {
    switch (version) {
        case TrsdosVersion.V2_3:
        case TrsdosVersion.V2_7:
            return 32;

        case TrsdosVersion.V1_3:
            return 48;

        default:
            assertNever(version);
    }
}

/**
 * Return the number of the first sector on a track for this version. This might not apply to the very
 * first track if it's a dual-boot disk.
 */
function getFirstSectorNumber(version: TrsdosVersion): number {
    switch (version) {
        case TrsdosVersion.V2_3:
            return 0;

        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            return 1;

        default:
            assertNever(version);
    }
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
 * Decode the GAT's disk name or date. Like decodeAscii(), but it also accepts the TRS-80's
 * graphics characters (0x80-0xBF), which NEWDOS/80 lets the user type in a disk name, and shows
 * them as ".". Returns undefined if any other byte isn't printable ASCII.
 */
function decodeGatText(binary: Uint8Array): string | undefined {
    const graphicsFree = binary.map(b => b >= 0x80 && b < 0xC0 ? 0x2E : b);
    return decodeAscii(graphicsFree);
}

/**
 * Decode the GAT's AUTO command, which ends at 0x0D, 0x00, 0x03 (DOSPLUS 3.x), 0xFF (filler), or
 * the end of the sector. Other bytes outside printable ASCII are shown as ".".
 */
function decodeAutoCommand(binary: Uint8Array): string {
    const parts: string[] = [];

    for (const b of binary) {
        if (b === 0x0D || b === 0x00 || b === 0x03 || b === 0xFF) {
            break;
        }

        parts.push(b >= 32 && b < 127 ? String.fromCodePoint(b) : ".");
    }

    return parts.join("").trim();
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
    // The names of the levels that differ between the Model I (2.3) and Model II (1.3) lineages.
    // TRSDOS 2.7 descends from Model II TRSDOS like 1.3 does, so we use 1.3's names for it, but
    // we haven't confirmed that 2.7 itself uses them.
    let useModel2Names: boolean;
    switch (version) {
        case TrsdosVersion.V2_3:
            useModel2Names = false;
            break;

        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            useModel2Names = true;
            break;

        default:
            assertNever(version);
    }

    switch (level) {
        case TrsdosProtectionLevel.FULL:
            return "FULL";
        case TrsdosProtectionLevel.REMOVE:
            return useModel2Names ? "REMOVE" : "KILL";
        case TrsdosProtectionLevel.RENAME:
            return "RENAME";
        case TrsdosProtectionLevel.WRITE:
            return useModel2Names ? "WRITE" : "UNUSED";
        case TrsdosProtectionLevel.UPDATE:
            return useModel2Names ? "UPDATE" : "WRITE";
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
 * Decode a directory entry's extents, each a cylinder byte and then a granule byte.
 *
 * @param binary bytes we'll be pulling the extents from.
 * @param begin index of first extent in binary.
 * @param end index past last extent in binary.
 * @param geometry the disk geometry, for error checking.
 * @param version version of TRSDOS.
 * @return the decoded extents, or an error message if any cylinder was out of bounds.
 */
function decodeExtents(binary: Uint8Array, begin: number, end: number,
                       geometry: VolumeGeometry,
                       version: TrsdosVersion): TrsdosExtent[] | string {

    const extents: TrsdosExtent[] = [];
    let granuleCountBasis: number;
    switch (version) {
        case TrsdosVersion.V2_3:
            granuleCountBasis = 1;
            break;

        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            granuleCountBasis = 0;
            break;

        default:
            assertNever(version);
    }

    for (let i = begin; i < end; i += 2) {
        // 0xFF means end of extents, 0xFE means extension pointer to another directory entry. Either
        // way we're done reading these extends.
        if (binary[i] === 0xFF || binary[i] === 0xFE) {
            break;
        }

        const cylinderNumber = binary[i];
        const granuleByte = binary[i + 1];
        const granuleOffset = granuleByte >> 5;
        const granuleCount = granuleCountBasis + (granuleByte & 0x1F);

        if (cylinderNumber >= geometry.cylinderCount && false) { // TODO these are lumps, can't compare to cylinders.
            // Not a TRSDOS disk.
            return "Invalid extent: index " + i + ", cylinder " + cylinderNumber +
                ", granuleByte 0x" + toHexByte(granuleByte) + ", offset " +
                granuleOffset + ", count " + granuleCount;
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
     * family and NEWDOS/80, clear in TRSDOS 1.3 and 2.7. This pins down the granules per lump, but some
     * formatters leave the bits clear and a damaged GAT fails it, so it's a preference among
     * candidates, not a requirement.
     */
    public hasValidHighBits(granulesPerLump: number, lumpCount: number, version: TrsdosVersion): boolean {
        // The mask for the unused bits in the GAT, and the value we expect to see there.
        const mask = (0xFF << granulesPerLump) & 0xFF;
        let expectedValue: number;
        switch (version) {
            case TrsdosVersion.V2_3:
                expectedValue = mask;
                break;

            case TrsdosVersion.V1_3:
            case TrsdosVersion.V2_7:
                expectedValue = 0x00;
                break;

            default:
                assertNever(version);
        }

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
                       geometry: VolumeGeometry, version: TrsdosVersion): TrsdosGatInfo | string {

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
    const name = decodeGatText(binary.subarray(0xD0, 0xD8));
    // Some formatters leave the date as the 0xFF filler of an unused field.
    const dateBinary = binary.subarray(0xD8, 0xE0);
    const date = dateBinary.every(b => b === 0xFF) ? "" : decodeGatText(dateBinary);

    // This is only before version 6. At 6 they moved this elsewhere and put other things here that we ignore.
    // Most DOSes end it with 0x0D, but DOSPLUS 3.x ends it with 0x03, and some disks leave the
    // 0xFF filler of an unused field. It's what the user typed, which can include control
    // characters (clear screen, or a line feed between commands), so it isn't evidence either way.
    const autoCommand = decodeAutoCommand(binary.subarray(0xE0));

    // Implies that this is not a TRSDOS disk.
    if (name === undefined) {
        return "name is missing";
    }
    if (date === undefined) {
        return "date is missing";
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
 * The number of system file slots in a TRSDOS 1.3 HIT sector, SYS0 through SYS14.
 */
const TRSDOS13_SYSTEM_FILE_COUNT = 15;

/**
 * The Hash Allocation Table sector info.
 */
export class TrsdosHitInfo {
    // 80 bytes for Model III, 128 bytes for Model I 2.7, 256 bytes for Models 1 and 4:
    public readonly hit: Uint8Array;
    // TRSDOS 1.3 only: the extent of each system file, indexed by its number (SYS0, SYS1, ...),
    // undefined where there's none. Empty for the other versions.
    public readonly systemFiles: (TrsdosExtent | undefined)[];

    constructor(hit: Uint8Array, systemFiles: (TrsdosExtent | undefined)[]) {
        this.hit = hit;
        this.systemFiles = systemFiles;
    }
}

/**
 * Decode the extents of TRSDOS 1.3's system files, which have no directory entries. The HIT sector
 * holds one two-byte extent for each at 0xE0, granule byte first, with 0xFF 0xFF for a missing file,
 * and the slot after the last holds 0xFF 0xFF. See "TRSDOS 1.3 system files" in FLOPPY_FORMATS.md.
 */
function decodeTrsdos13SystemFiles(binary: Uint8Array): (TrsdosExtent | undefined)[] {
    const systemFiles: (TrsdosExtent | undefined)[] = [];

    for (let i = 0; i < TRSDOS13_SYSTEM_FILE_COUNT; i++) {
        const granuleByte = binary[0xE0 + 2*i];
        const cylinderNumber = binary[0xE0 + 2*i + 1];
        const missing = granuleByte === 0xFF && cylinderNumber === 0xFF;
        // As in 1.3's directory entries, the count isn't less one.
        systemFiles.push(missing ? undefined : new TrsdosExtent(cylinderNumber, granuleByte >> 5, granuleByte & 0x1F));
    }

    return systemFiles;
}

/**
 * Decode the Hash Index Table sector.
 */
function decodeHitInfo(binary: Uint8Array, version: TrsdosVersion): TrsdosHitInfo {
    // One byte for each file.
    let hitLength: number;
    let systemFiles: (TrsdosExtent | undefined)[];
    switch (version) {
        case TrsdosVersion.V2_3:
            hitLength = 256;
            systemFiles = [];
            break;

        case TrsdosVersion.V1_3:
            hitLength = 80;
            systemFiles = decodeTrsdos13SystemFiles(binary);
            break;

        case TrsdosVersion.V2_7:
            // Up to 16 entry sectors of 8 entries. The rest of the sector holds a table we don't decode.
            hitLength = 128;
            systemFiles = [];
            break;

        default:
            assertNever(version);
    }
    const hit = binary.subarray(0, hitLength);

    return new TrsdosHitInfo(hit, systemFiles);
}

/**
 * Single (valid) directory entry for a file.
 */
export class TrsdosDirEntry implements FloppyDirEntry {
    public readonly version: TrsdosVersion;
    public readonly flags: number;
    public readonly day: number;
    public readonly month: number;
    // Undefined if the file has no date, as with system files on TRSDOS 1.3 (which have no
    // directory entries) and on LDOS 5.3 and LS-DOS 6.3. See decodeDirEntry().
    public readonly year: number | undefined;
    // The time of day, only on LDOS 5.3 and LS-DOS 6.3 disks. See decodeDirEntry().
    public readonly hour: number | undefined;
    public readonly minute: number | undefined;
    public readonly lastSectorSize: number;
    // Logical record length. I think this is unused.
    public readonly lrl: number;
    public readonly rawFilename: string;
    // Undefined for TRSDOS 1.3's system files, which have no directory entries.
    public readonly updatePassword: number | undefined;
    // Undefined when the entry's bytes hold an LDOS 5.3 or LS-DOS 6.3 time stamp instead.
    public readonly accessPassword: number | undefined;
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

    constructor(version: TrsdosVersion, flags: number, day: number, month: number, year: number | undefined,
                hour: number | undefined, minute: number | undefined,
                lastSectorSize: number, lrl: number,
                filename: string, updatePassword: number | undefined, accessPassword: number | undefined,
                sectorCount: number,
                prevDec: number | undefined,
                nextDec: number | undefined,
                extents: TrsdosExtent[]) {

        this.version = version;
        this.flags = flags;
        this.day = day;
        this.month = month;
        this.year = year;
        this.hour = hour;
        this.minute = minute;
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
     * Return a copy of this entry with a different name and everything else the same. The
     * prev/next entry links are not copied, since they're set later.
     */
    public withRawFilename(rawFilename: string): TrsdosDirEntry {
        return new TrsdosDirEntry(this.version, this.flags, this.day, this.month, this.year,
            this.hour, this.minute, this.lastSectorSize, this.lrl, rawFilename, this.updatePassword, this.accessPassword,
            this.sectorCount, this.prevDec, this.nextDec, this.extents);
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

        // On model 1/4, the last sector size byte represents the size of the last sector, which is
        // counted in the sector count. On model 3 (and 2.7) it's in addition to the sector count.
        let lastSectorIsCounted: boolean;
        switch (this.version) {
            case TrsdosVersion.V2_3:
                lastSectorIsCounted = true;
                break;

            case TrsdosVersion.V1_3:
            case TrsdosVersion.V2_7:
                lastSectorIsCounted = false;
                break;

            default:
                assertNever(this.version);
        }
        if (lastSectorIsCounted && this.lastSectorSize > 0) {
            size -= BYTES_PER_SECTOR;
        }

        return size;
    }

    /**
     * Return the date in DD/MM/YYYY format, where the day might be blank if missing, followed by
     * the time in HH:MM format if the entry has one. Empty if the file has no date.
     */
    public getFullDateString(): string {
        if (this.year === undefined) {
            return "";
        }
        return (this.day === 0 ? "   " : this.day.toString().padStart(2, "0") + "/") +
            (this.month === 0 ? "   " : this.month.toString().padStart(2, "0") + "/") +
            this.year.toString() +
            (this.hour === undefined || this.minute === undefined ? "" :
                " " + this.hour.toString().padStart(2, "0") + ":" + this.minute.toString().padStart(2, "0"));
    }

    /**
     * Return the date (and time, if known) as an object, or undefined if the file has no date.
     * A missing month or day (zero) becomes the first, so that a year-only date is January 1 of
     * that year rather than rolling back into the previous one.
     */
    public getDate(): Date | undefined {
        if (this.year === undefined) {
            return undefined;
        }
        const month = this.month === 0 ? 1 : this.month;
        const day = this.day === 0 ? 1 : this.day;
        return new Date(this.year, month - 1, day, this.hour ?? 0, this.minute ?? 0);
    }
}

/**
 * Decodes a directory entry from a 32- or 48-byte chunk, undefined if the directory entry is not active,
 * or a decoding error.
 *
 * @param hitHash the entry's HIT byte, or undefined if unknown. Used to tell a primary entry with
 * its extended-entry bit set from a real extended entry.
 * @param hasTimeStamps whether the disk is an LDOS 5.3 or LS-DOS 6.3 disk, whose entries can
 * hold a time stamp in place of the access password.
 */
function decodeDirEntry(binary: Uint8Array, geometry: VolumeGeometry, version: TrsdosVersion,
                        hitHash: number | undefined, hasTimeStamps: boolean): TrsdosDirEntry | undefined | string {

    let flags = binary[0];
    if ((flags & 0x10) === 0) { // TODO merge with isActive().
        // Don't parse an inactive entry, it might be corrupted.
        return undefined;
    }

    const filename = decodeAscii(binary.subarray(5, 16));
    if (filename === undefined) {
        return "can't decode directory entry filename";
    }

    // Some MultiDOS disks set the extended-entry bit on every entry, presumably to hide the
    // files from DIR and COPY, though the DOS still finds them through the HIT. An extended
    // entry has no name of its own, and its HIT byte is its primary entry's hash, so an entry
    // whose own non-blank name matches its HIT byte is a primary entry.
    const isPrimaryWithExtendedBit = version === TrsdosVersion.V2_3 && (flags & 0x80) !== 0 &&
        hitHash !== undefined && filename.trim() !== "" && hashForFilename(filename) === hitHash;
    if (isPrimaryWithExtendedBit) {
        flags &= 0x7F;
    }

    // DEC to previous entry, if we're an extended entry.
    const prevDec = (flags & 0x80) !== 0 ? binary[1] : undefined;

    // Date.
    const month = binary[1] & 0x0F;
    // binary[1] has a few extra bits on Model 1/4 that we don't care about.

    // Date info.
    let day: number;
    // Undefined for no date.
    let year: number | undefined;
    switch (version) {
        case TrsdosVersion.V2_3:
            day = binary[2] >> 3;
            year = (binary[2] & 0x07) + 1980;
            break;

        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            // No day, and the year is the whole byte minus 1900.
            day = 0;
            year = binary[2] + 1900;
            break;

        default:
            assertNever(version);
    }

    // Number of bytes on last sector.
    const lastSectorSize = binary[3];

    // Logical record length.
    const lrl = ((binary[4] - 1) & 0xFF) + 1; // 0 -> 256.

    // Password hashes, little endian.
    const updatePassword = word(binary[17], binary[16]);
    let accessPassword: number | undefined = word(binary[19], binary[18]);

    // LDOS 5.3 and LS-DOS 6.3 replace the access password with a time stamp, big endian: bits
    // 15-11 the hour, bits 10-5 the minute, and bits 4-0 the year minus 1980, whose low three bits
    // repeat byte 2's. An entry that still has the blank password hash is in the old style, with
    // only a date; COPY and BACKUP convert those. See "Time stamps (LDOS 5.3 and LS-DOS 6.3)" in
    // FLOPPY_FORMATS.md.
    let hour: number | undefined = undefined;
    let minute: number | undefined = undefined;
    if (hasTimeStamps && (flags & 0x40) !== 0) {
        // Some system files keep something other than a time stamp here, which can look like one.
        // Nobody needs their dates, so leave them undated rather than risk a wrong date.
        year = undefined;
    } else if (hasTimeStamps && accessPassword !== TRSDOS_BLANK_PASSWORD_HASH) {
        const timeStamp = word(binary[18], binary[19]);
        const stampHour = timeStamp >> 11;
        const stampMinute = (timeStamp >> 5) & 0x3F;
        const stampYear = timeStamp & 0x1F;
        // A few files keep a password hash here, or a time whose year doesn't match byte 2's.
        const isTimeStamp = month >= 1 && month <= 12 && stampHour < 24 && stampMinute < 60 &&
            (stampYear & 0x07) === (binary[2] & 0x07);
        if (isTimeStamp) {
            hour = stampHour;
            minute = stampMinute;
            year = 1980 + stampYear;
            accessPassword = undefined;
        }
    }

    // Number of sectors in the file. Little endian.
    const sectorCount = word(binary[21], binary[20]);

    // Number of extents listed in the directory entry.
    let extentsCount: number;
    switch (version) {
        case TrsdosVersion.V2_3:
        case TrsdosVersion.V2_7:
            extentsCount = 5;
            break;

        case TrsdosVersion.V1_3:
            extentsCount = 13;
            break;

        default:
            assertNever(version);
    }

    // Byte offsets.
    const extentsStart = 22;
    const extentsEnd = extentsStart + 2*extentsCount; // Two bytes per extent.
    const extents = decodeExtents(binary, extentsStart, extentsEnd, geometry, version);
    if (typeof extents === "string") {
        // Not a TRSDOS disk.
        return extents;
    }

    // On model 1/4 (and 2.7) bytes 30 and 31 point to extended directory entry, if any.
    let hasNextDecLink: boolean;
    switch (version) {
        case TrsdosVersion.V2_3:
        case TrsdosVersion.V2_7:
            hasNextDecLink = true;
            break;

        case TrsdosVersion.V1_3:
            hasNextDecLink = false;
            break;

        default:
            assertNever(version);
    }
    const nextDec = hasNextDecLink && binary[30] === 0xFE ? binary[31] : undefined;

    return new TrsdosDirEntry(version, flags, day, month, year, hour, minute, lastSectorSize, lrl, filename,
        updatePassword, accessPassword, sectorCount, prevDec, nextDec, extents);
}

/**
 * The NEWDOS/80 PDRIVE settings that read a disk the way we decoded it, worked out from its layout
 * rather than read from the disk. See "PDRIVE" in FLOPPY_FORMATS.md. The interface letter of TI and
 * the step rate (TSR) leave no trace on the disk, so they're not here.
 */
export interface PdriveSettings {
    /** Whether the data area skips cylinder 0, which is in the other density from the rest: the K flag of TI. */
    track0OtherDensity: boolean;
    /** Type of drive (TD): A, C, E, or G for 5", B, D, F, or H for 8". */
    driveType: string;
    /** Cylinders in the image (TC), not counting a skipped cylinder 0. */
    trackCount: number;
    /** Sectors per track, counting both sides (SPT). */
    sectorsPerTrack: number;
    /** Granules per lump (GPL). */
    granulesPerLump: number;
    /** The lump where the directory starts (DDSL). */
    dirStartLump: number;
    /** Granules in the directory (DDGA). */
    dirGranules: number;
}

/**
 * Show PDRIVE settings as PDRIVE takes them, such as "TI=?K,TD=E,TC=43,SPT=18,GPL=2,DDSL=17,DDGA=2".
 * TI only appears with its K flag, after a "?" for the unknown interface letter.
 */
export function pdriveSettingsToString(settings: PdriveSettings): string {
    const fields: string[] = [];
    if (settings.track0OtherDensity) {
        fields.push("TI=?K");
    }
    fields.push(`TD=${settings.driveType}`,
        `TC=${settings.trackCount}`,
        `SPT=${settings.sectorsPerTrack}`,
        `GPL=${settings.granulesPerLump}`,
        `DDSL=${settings.dirStartLump}`,
        `DDGA=${settings.dirGranules}`);
    return fields.join(",");
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
export class Trsdos implements FloppyFileSystem<TrsdosDirEntry> {
    public readonly disk: DiskVolume;
    public readonly geometry: VolumeGeometry;
    public readonly version: TrsdosVersion;
    public readonly allocationSides: number;
    public readonly granulesPerLump: number;
    public readonly sectorsPerGranule: number;
    public readonly dirLumpNumber: number;
    public readonly granulesPerDir: number;
    public readonly firstDataCylinder: number;
    /**
     * Whether this candidate reads the directory without its HIT, because the HIT sector holds
     * something else (see decodeTrsdos()). Every entry in use is then a file, and entries count
     * as evidence by decoding cleanly rather than by matching their hashes.
     */
    public readonly hitIgnored: boolean;
    // Derived fields:
    public readonly dirEntryLength: number;
    public readonly dirEntriesPerSector: number;
    public readonly sectorsPerLump: number;
    public readonly sectorsPerCylinder: number;
    public readonly lumpCount: number;
    /**
     * Whether a lump is exactly a physical cylinder (both allocated sides), as in every DOS but
     * NEWDOS/80, and in NEWDOS/80 when its settings happen to line up with the cylinders.
     */
    public readonly lumpsAreCylinders: boolean;
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
     * Whether the GAT says this is an LDOS 5.3 or LS-DOS 6.3 disk, whose directory entries
     * can hold a time stamp in place of the access password. NEWDOS 3.0 also writes 0x53 there, but
     * its entries fail the checks in decodeDirEntry().
     */
    public readonly hasTimeStamps: boolean;
    /**
     * Name and version of the DOS that wrote the disk, such as "LDOS 5.1.4" or "NEWDOS/80 v2.0", or
     * "Unknown DOS" when the disk doesn't say. Only decoded for candidates that aren't disqualified,
     * because it reads the system files.
     */
    public readonly nameAndVersion: string;

    constructor(
        disk: DiskVolume,
        geometry: VolumeGeometry,
        version: TrsdosVersion,
        allocationSides: number,
        granulesPerLump: number,
        sectorsPerGranule: number,
        dirLumpNumber: number,
        granulesPerDir: number,
        firstDataCylinder: number,
        hitIgnored = false) {

        this.disk = disk;
        this.geometry = geometry;
        this.version = version;
        this.allocationSides = allocationSides;
        this.granulesPerLump = granulesPerLump;
        this.sectorsPerGranule = sectorsPerGranule;
        this.dirLumpNumber = dirLumpNumber;
        this.granulesPerDir = granulesPerDir;
        this.firstDataCylinder = firstDataCylinder;
        this.hitIgnored = hitIgnored;

        this.dirEntryLength = getDirEntryLength(version);
        this.dirEntriesPerSector = Math.floor(geometry.modalDataSectorSize / this.dirEntryLength);
        this.sectorsPerLump = this.sectorsPerGranule * this.granulesPerLump;
        this.sectorsPerCylinder = geometry.modalDataSectorSpan*this.allocationSides;
        this.lumpCount = computeLumpCount(geometry, firstDataCylinder, this.sectorsPerCylinder, this.sectorsPerLump);
        this.lumpsAreCylinders = this.sectorsPerLump === this.sectorsPerCylinder && this.firstDataCylinder === 0;
        this.lumpTerm = this.lumpsAreCylinders ? "cylinder" : "lump";

        // Before evaluate(), which decodes the directory.
        const gatInfo = this.getGatInfo();
        this.hasTimeStamps = this.version === TrsdosVersion.V2_3 && typeof gatInfo !== "string" &&
            (gatInfo.osVersion === 0x53 || gatInfo.osVersion === 0x63);
        this.evaluation = this.evaluate();
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

        // A GAT made for few granules per lump also passes the strict check for more, because the
        // DOS sets every bit past its last granule, and the hashes and directory sectors are the
        // same when the directory starts at the same sector. But then the extra granules would be
        // allocated in every lump without any file using them. Fewer granules per lump sort first.
        if (this.granulesPerLump !== other.granulesPerLump) {
            return this.granulesPerLump - other.granulesPerLump;
        }

        // As with sides, for the directory: if the rest of its lump adds nothing, the directory doesn't
        // extend there (DOSPLUS keeps it on side 0 of the directory cylinder, and a NEWDOS/80
        // directory can be smaller than its lump). A directory that doesn't fill its lump
        // sorts first. Among sizes that don't, and among those that fill or run past it, the
        // generators' order (smallest first) decides.
        const thisDirFillsLump = this.granulesPerDir >= this.granulesPerLump;
        const otherDirFillsLump = other.granulesPerDir >= other.granulesPerLump;
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

        // Whether at least half the directory sectors carry Tandy's filler string, which marks a
        // 1.3 directory even when it holds no files.
        let hasTandyFiller = false;

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
            // a Model 3 disk. Disks written by other tools and DOSes have other filler (zeros,
            // spaces, their own notices), so without it the hashes must vouch for the layout.
            hasTandyFiller = dirSectorsWithTandy >= totalDirSectors / 2;
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
        // Reachable entries by DEC, and the extended entries (FXDEs) with their HIT bytes. An
        // FXDE has no name, and its HIT byte is the hash of the file it continues, so it can
        // only be checked once we've seen that file's primary entry.
        const entriesByDec = new Map<number, TrsdosDirEntry>();
        const extendedEntries: { dirEntry: TrsdosDirEntry, hitHash: number | undefined }[] = [];
        // Whether DIR/SYS's extent names our directory lump, which is how a candidate that
        // ignores the HIT shows that it's reading the real directory.
        let dirSysConfirmsDir = false;

        // console.log(`--- Computing score for track ${this.dirCylinderNumber}`)

        for (const { sectorIndex, dirPosition } of this.getDirSectors()) {
            const dirSector = this.disk.readSector(dirPosition);
            if (dirSector !== undefined) {
                for (let i = 0; i < this.dirEntriesPerSector; i++) {
                    const dirEntryBinary = dirSector.data.subarray(i * this.dirEntryLength, (i + 1) * this.dirEntryLength);
                    const index = this.dirEntryToHitNumber(sectorIndex, i);
                    const hitHash = this.hitIgnored ? undefined : hitInfo.hit[index];
                    let dirEntry = decodeDirEntry(dirEntryBinary, this.geometry, this.version, hitHash, this.hasTimeStamps);
                    // console.log({side, sectorIndex, i, filename: dirEntry?.getFilename("/"), system: dirEntry?.isSystemFile()});
                    if (typeof dirEntry === "string") {
                        // A slot marked in use whose name or extents are garbage isn't a file. Count
                        // it as a miss rather than rejecting the candidate, since real directories
                        // have these too; a wrong candidate still loses by reading mostly garbage.
                        // As elsewhere, a slot the HIT doesn't list is no evidence either way.
                        if (hitHash !== 0) {
                            hashMisses += 1;
                        }
                        continue;
                    }
                    if (dirEntry !== undefined) {
                        // Don't record deleted entries.
                        // An entry with an empty HIT slot is a leftover the DOS can't reach, not a
                        // file, so it's no evidence either way, and its extents can be anything.
                        if (hitHash === 0) {
                            continue;
                        }
                        // A blank name has no hash to check. Some disks have the names of their
                        // system entries overwritten with spaces but keep the HIT bytes. If the
                        // slot's standard system name matches the HIT byte, restore it and count
                        // it as a hit like any other. If not, the entry is neither a hit nor a
                        // miss, since we can't check a hash against a missing name.
                        let nameMissing = false;
                        if (!dirEntry.isExtendedEntry() && isBlankFilename(dirEntry.rawFilename)) {
                            const reconstructedName = hitHash === undefined ? undefined :
                                reconstructBlankFilename(this.version, index, hitHash, dirEntry);
                            if (reconstructedName !== undefined) {
                                dirEntry = dirEntry.withRawFilename(reconstructedName);
                            } else {
                                nameMissing = true;
                            }
                        }
                        const computedHash = hashForFilename(dirEntry.rawFilename);
                        entriesByDec.set(index, dirEntry);
                        // console.log(`Comparing hits at ${side}:${sectorIndex}:${i} = ${index}: ${computedHash} vs. ${hitHash} ${dirEntry.rawFilename}`);
                        if (dirEntry.isExtendedEntry()) {
                            extendedEntries.push({dirEntry, hitHash});
                        } else if (!nameMissing) {
                            // Without the HIT, an entry that decodes is all the evidence there is.
                            if (hitHash === undefined || computedHash === hitHash ||
                                isOldDirSysHash(this.version, index, dirEntry.rawFilename, hitHash)) {
                                hashHits += 1;
                            } else {
                                hashMisses += 1;
                            }
                        }
                        for (const extent of dirEntry.extents) {
                            if (extent.granuleOffset >= this.granulesPerLump || extent.cylinderNumber >= this.lumpCount) {
                                badExtents += 1;
                            }
                        }
                        // DIR/SYS is the file that holds the directory, so if there is one, it must
                        // start at our directory lump. Otherwise we're reading some other layout
                        // that happens to reach the same sectors, or a leftover directory. Only in
                        // the 2.3 family: Tandy's 1.3 and 2.7 write no DIR/SYS, and a disk in the
                        // 1.3 layout made by another tool can have one that points anywhere.
                        if (this.version === TrsdosVersion.V2_3 &&
                            dirEntry.getFilename("/") === "DIR/SYS" && dirEntry.extents.length > 0 &&
                            dirEntry.extents[0].cylinderNumber !== this.dirLumpNumber) {

                            return { score: -1, reason: `DIR/SYS is on lump ${dirEntry.extents[0].cylinderNumber}, not the directory's lump` };
                        }
                        if (dirEntry.getFilename("/") === "DIR/SYS" && dirEntry.extents.length > 0) {
                            dirSysConfirmsDir = true;
                        }
                    }
                }
            }
        }

        // An FXDE is a hit if its HIT byte is the hash of the primary entry that its chain of
        // back links leads to.
        // Without the HIT, it's a hit if the chain leads to a primary entry at all.
        for (const { dirEntry, hitHash } of extendedEntries) {
            const primary = this.findPrimaryEntry(dirEntry, entriesByDec);
            if (primary !== undefined && (hitHash === undefined || hashForFilename(primary.rawFilename) === hitHash)) {
                hashHits += 1;
            } else {
                hashMisses += 1;
            }
        }

        // Entries that merely decode are weak evidence: any sector of file data with a few bytes
        // in the right places would do. So without the HIT, DIR/SYS must say where the directory is.
        if (this.hitIgnored && !dirSysConfirmsDir) {
            return { score: -1, reason: "Without the HIT, DIR/SYS must confirm the directory's lump" };
        }

        // Whether the hashes clearly favor this layout. Without Tandy's filler, the 1.3 layout needs
        // this: reading a TRSDOS 2.7DD directory (32-byte entries) as 1.3 lines up one entry by chance.
        // The 2.7 layout has no filler to fall back on, and no system files in its directory.
        const hashesVouch = hashHits > 0 && hashHits >= 2*hashMisses;
        switch (this.version) {
            case TrsdosVersion.V2_3:
                if (hashHits < 2) {
                    // Even blank disks have DIR/SYS and BOOT/SYS.
                    return { score: -1, reason: "Didn't find required system files" };
                }
                break;

            case TrsdosVersion.V1_3:
                if (!hasTandyFiller && !hashesVouch) {
                    return { score: -1, reason: `No "${EXPECTED_TANDY}" filler, and hashes don't vouch for the layout` };
                }
                break;

            case TrsdosVersion.V2_7:
                if (!hashesVouch) {
                    return { score: -1, reason: "Hashes don't vouch for the layout" };
                }
                break;

            default:
                assertNever(this.version);
        }

        // Files whose extents hold fewer sectors than their size needs. Reading a disk with granules
        // that are too small (5 sectors where the DOS used 6) shortens every file that ends in the
        // last sector of its last granule, while the directory and hashes stay just as valid.
        let shortFiles = 0;
        for (const dirEntry of this.getDirEntries(true)) {
            const sectorsInFile = Math.ceil(dirEntry.getSize() / BYTES_PER_SECTOR);
            if (this.getExtentSectorCount(dirEntry) < sectorsInFile) {
                shortFiles += 1;
            }
        }

        const score = hashHits - hashMisses - badExtents - shortFiles;
        const reason = `${hashHits} hash hits, ${hashMisses} hash misses, ${badExtents} bad extents, ${shortFiles} short files`;

        return { score, reason };
    }

    /**
     * Follow an extended entry's back links (each FXDE holds the DEC of the entry it extends)
     * to the file's primary entry. Returns undefined if a link leads to an entry that isn't in
     * the map or the links loop.
     */
    private findPrimaryEntry(dirEntry: TrsdosDirEntry, entriesByDec: Map<number, TrsdosDirEntry>): TrsdosDirEntry | undefined {
        let entry: TrsdosDirEntry | undefined = dirEntry;
        // Bounds the walk, since a garbage directory can link in a loop.
        for (let i = 0; i <= entriesByDec.size && entry !== undefined; i++) {
            if (!entry.isExtendedEntry()) {
                return entry;
            }
            entry = entry.prevDec === undefined ? undefined : entriesByDec.get(entry.prevDec);
        }

        return undefined;
    }

    public summary(): string {
        return `${trsdosVersionToString(this.version)}, dir on ${this.lumpTerm} ${this.dirLumpNumber}, ${this.granulesPerLump} granules per ${this.lumpTerm}, ${this.allocationSides} sides`;
    }

    /**
     * The NEWDOS/80 PDRIVE settings that read this disk as we decoded it, or undefined if its lumps
     * are cylinders. Those disks may well be NEWDOS/80's, but any DOS's settings will read them, so
     * PDRIVE isn't what decides it. Going by the layout rather than the DOS's name means this works
     * on data disks too, which don't say what wrote them.
     */
    public getPdriveSettings(): PdriveSettings | undefined {
        if (this.lumpsAreCylinders) {
            return undefined;
        }

        // The drive types for 5" disks, and the most sectors per side that one holds; more
        // means 8". See the sector table in FLOPPY_FORMATS.md.
        const sectorsPerSide = this.geometry.modalDataSectorSpan;
        const doubleSided = this.allocationSides === 2;
        let driveType: string;
        let maxFiveInchSectors: number;
        const density = this.geometry.modalDataDensity;
        switch (density) {
            case Density.SINGLE:
                driveType = doubleSided ? "C" : "A";
                maxFiveInchSectors = 10;
                break;
            case Density.DOUBLE:
                driveType = doubleSided ? "G" : "E";
                maxFiveInchSectors = 18;
                break;
            default:
                assertNever(density);
        }
        if (sectorsPerSide > maxFiveInchSectors) {
            // The 8" letters follow each 5" one.
            driveType = String.fromCharCode(driveType.charCodeAt(0) + 1);
        }

        return {
            track0OtherDensity: this.firstDataCylinder === 1,
            driveType,
            trackCount: this.geometry.cylinderCount - this.firstDataCylinder,
            sectorsPerTrack: this.sectorsPerCylinder,
            granulesPerLump: this.granulesPerLump,
            dirStartLump: this.dirLumpNumber,
            dirGranules: this.granulesPerDir,
        };
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
            case TrsdosVersion.V2_7:
                // Dense, with no reserved slots. If you change this, update hitNumberToDirEntry().
                return sectorIndex * this.dirEntriesPerSector + dirEntryIndex;

            default:
                assertNever(this.version);
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
            case TrsdosVersion.V2_7:
                // These are laid out continuously.
                // If you change this, update dirEntryToHitNumber().
                sectorIndex = Math.floor(hitIndex / this.dirEntriesPerSector);
                dirEntryIndex = hitIndex % this.dirEntriesPerSector;
                break;

            default:
                assertNever(this.version);
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
        return decodeHitInfo(hitSector.data, this.version);
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
     * Read all active directory entries in the directory. An entry whose HIT slot is empty isn't
     * active even if its in-use bit is set: the DOS finds files through the HIT, so it can't reach
     * the entry, which is left over from an earlier directory. Disks made by copying a directory
     * sector have these, often with the same names as live files.
     */
    public getDirEntries(includeSystemFiles: boolean): TrsdosDirEntry[] {
        // Map from position of directory entry to its actual entry. The key is the asKey() result
        // of DirEntryPosition.
        const dirEntries = new Map<string, TrsdosDirEntry>();
        // Without a readable HIT, or when ignoring it, assume it lists every entry.
        const hitInfo = this.hitIgnored ? "ignored" : this.getHitInfo();
        // Count of entries whose names are still blank, for naming them.
        let blankCount = 0;

        // Decode directory entries.
        for (const { sectorIndex, dirPosition } of this.getDirSectors()) {
            const dirSector = this.disk.readSector(dirPosition);
            if (dirSector !== undefined) {
                for (let i = 0; i < this.dirEntriesPerSector; i++) {
                    const dirEntryBinary = dirSector.data.subarray(i * this.dirEntryLength, (i + 1) * this.dirEntryLength);
                    const hitIndex = this.dirEntryToHitNumber(sectorIndex, i);
                    const hitHash = typeof hitInfo === "string" ? undefined : hitInfo.hit[hitIndex];
                    let dirEntry = decodeDirEntry(dirEntryBinary, this.geometry, this.version, hitHash, this.hasTimeStamps);
                    // console.log({side, sectorIndex, i, filename: dirEntry?.getFilename("/"), system: dirEntry?.isSystemFile()});
                    if (typeof dirEntry === "string") {
                        // TODO what to do with this error? Abort this method?
                    } else if (dirEntry !== undefined) {
                        // Don't record deleted entries, or ones the HIT doesn't list.
                        const unreachable =typeof hitInfo !== "string" && hitInfo.hit[hitIndex] === 0;
                        if (!unreachable) {
                            // Entries with blank names (see evaluate()): restore a system file's name
                            // if its slot and HIT byte confirm it. Name any other one BLANK<n>, since a
                            // blank name extracts as "_" and two of them would overwrite each other.
                            // Do this before the entry goes in the map so that the linking below uses
                            // the renamed objects. No warning here, since this method is called often.
                            if (!dirEntry.isExtendedEntry() && isBlankFilename(dirEntry.rawFilename)) {
                                const reconstructedName = typeof hitInfo === "string" ? undefined :
                                    reconstructBlankFilename(this.version, hitIndex, hitInfo.hit[hitIndex], dirEntry);
                                if (reconstructedName !== undefined) {
                                    dirEntry = dirEntry.withRawFilename(reconstructedName);
                                } else {
                                    blankCount += 1;
                                    dirEntry = dirEntry.withRawFilename(("BLANK" + blankCount).padEnd(11, " "));
                                }
                            }
                            dirEntries.set(new DirEntryPosition(sectorIndex, i).key(), dirEntry);
                        }
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

        // TRSDOS 1.3's system files aren't in the directory.
        const trsdos13SystemFiles = typeof hitInfo === "string" ? [] :
            this.getTrsdos13SystemFiles(hitInfo, [...dirEntries.values()]);

        // Remove the extended entries and possibly the system files.
        return [...trsdos13SystemFiles, ...dirEntries.values()]
            .filter(d => !d.isExtendedEntry() && (includeSystemFiles || !d.isSystemFile()));
    }

    /**
     * Make directory entries for TRSDOS 1.3's system files, whose extents are in the HIT sector
     * rather than the directory, named SYS0/SYS through SYS14/SYS by their slots. Empty for the
     * other versions. Skips slots whose extents can't be right (no granules, past the disk or the
     * lump, or in the directory), and clips each extent where the next system file or the directory
     * begins, because Tandy's system disks give SYS3 three granules where it has one. Also skips a
     * system file that shares a granule with a file in the directory, whose entry the HIT vouches
     * for: the HIT's table outlives the system files on disks that were written over. See "TRSDOS
     * 1.3 system files" in FLOPPY_FORMATS.md.
     *
     * @param dirEntries the files in the directory.
     */
    private getTrsdos13SystemFiles(hitInfo: TrsdosHitInfo, dirEntries: TrsdosDirEntry[]): TrsdosDirEntry[] {
        // The first granule of the directory and of each system file, counting from the start of the disk.
        const dirStart = this.dirLumpNumber*this.granulesPerLump;
        const dirEnd = dirStart + this.granulesPerDir;
        const starts = new Map<number, number>();
        for (let i = 0; i < hitInfo.systemFiles.length; i++) {
            const extent = hitInfo.systemFiles[i];
            if (extent !== undefined && extent.granuleCount > 0 &&
                extent.granuleOffset < this.granulesPerLump && extent.cylinderNumber < this.lumpCount) {

                const start = extent.cylinderNumber*this.granulesPerLump + extent.granuleOffset;
                if (start < dirStart || start >= dirEnd) {
                    starts.set(i, start);
                }
            }
        }

        // The granules of the files in the directory.
        const usedGranules = new Set<number>();
        for (const dirEntry of dirEntries) {
            for (const extent of dirEntry.extents) {
                const start = extent.cylinderNumber*this.granulesPerLump + extent.granuleOffset;
                for (let granule = start; granule < start + extent.granuleCount; granule++) {
                    usedGranules.add(granule);
                }
            }
        }

        const boundaries = [dirStart, ...starts.values()];
        const systemFiles: TrsdosDirEntry[] = [];
        for (const [i, start] of starts) {
            const extent = hitInfo.systemFiles[i] as TrsdosExtent;
            const end = Math.min(start + extent.granuleCount, ...boundaries.filter(boundary => boundary > start));
            let overlapsDirFile = false;
            for (let granule = start; granule < end; granule++) {
                if (usedGranules.has(granule)) {
                    overlapsDirFile = true;
                }
            }
            if (overlapsDirFile) {
                continue;
            }

            const granuleCount = end - start;
            const filename = ("SYS" + i).padEnd(8, " ") + "SYS";
            // In use, system, and invisible, like the 2.3 family's system files, with no date or passwords.
            const flags = 0x58;
            systemFiles.push(new TrsdosDirEntry(this.version, flags, 0, 0, undefined, undefined, undefined,
                0, 256, filename, undefined, undefined, granuleCount*this.sectorsPerGranule, undefined, undefined,
                [new TrsdosExtent(extent.cylinderNumber, extent.granuleOffset, granuleCount)]));
        }

        return systemFiles;
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
     * The contents of the sectors on lump 1 (cylinder 1, since a lump is a cylinder in the layouts
     * that use this), as text with one character per byte. Tandy's 2.7DD/2.8 puts its version banner
     * there, in the second stage of its boot loader.
     */
    private getFirstDataCylinderText(): string {
        let text = "";
        for (let sectorOffset = 0; sectorOffset < this.sectorsPerLump; sectorOffset++) {
            const sectorPosition = this.logicalToPhysical(1, 0, sectorOffset);
            const data = this.disk.readSector(sectorPosition)?.data;
            if (data !== undefined) {
                text += bytesToText(data);
            }
        }

        return text;
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

        switch (this.version) {
            case TrsdosVersion.V2_3:
                // Check the many DOSes that use this layout below.
                break;

            case TrsdosVersion.V1_3: {
                // Model III TRSDOS names its version on the boot track.
                const match = bootTrack.match(/version (1\.\d)/);
                return match === null ? "TRSDOS 1.x" : `TRSDOS ${match[1]}`;
            }

            case TrsdosVersion.V2_7: {
                // System disks name their version, such as "TRSDOS version 2.7DD", "2.7SD" or "2.8.0".
                // The text isn't on the single-density boot track (cylinder 0) but on cylinder 1.
                const match = this.getFirstDataCylinderText().match(/TRSDOS version (2\.\d[\w.]*)/);
                return match === null ? "TRSDOS 2.7" : `TRSDOS ${match[1]}`;
            }

            default:
                assertNever(this.version);
        }

        // A banner only counts if its DOS could have written this layout: lumps that aren't whole
        // cylinders are NEWDOS/80's (and so NEWDOS/86's and /90's), MultiDOS's and DoubleDOS's. (A
        // NEWDOS/80 disk can carry another DOS's system files, which then can't boot it.)
        const banner = this.findSystemBanner();
        if (banner !== undefined && (this.lumpTerm === "cylinder" || /^(NEWDOS\/(80|86|90)|MultiDOS|DoubleDOS)/.test(banner))) {
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
                const text = this.getProgramText(this.readFileData(dirEntry, undefined));
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
     * Whether the boot sector starts with these bytes. False if the disk has no boot track.
     */
    private bootSectorStartsWith(...bytes: number[]): boolean {
        const bootTrack = this.geometry.bootTrack;
        if (bootTrack === undefined) {
            return false;
        }
        const bootSector = this.disk.readSector(bootTrack.firstSectorPosition());
        return bootSector !== undefined && bytes.every((b, i) => bootSector.data[i] === b);
    }

    /**
     * Whether the boot sector loads SYS0/SYS from cylinder 0 sector 5 the way only TRSDOS 2.3B's
     * does (LD D,0; LD E,5), rather than through the directory. False if the disk has no boot track.
     */
    private hasTrsdos23BBootSector(): boolean {
        const bootTrack = this.geometry.bootTrack;
        if (bootTrack === undefined) {
            return false;
        }
        const bootSector = this.disk.readSector(bootTrack.firstSectorPosition());
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
     * Generate the extents of a file, following its chain of extended directory entries.
     */
    private *getFileExtents(firstDirEntry: TrsdosDirEntry): Generator<TrsdosExtent> {
        // Corrupt directories can have entries that point to each other, so don't revisit any.
        const visitedDirEntries = new Set<TrsdosDirEntry>();
        let dirEntry: TrsdosDirEntry | undefined = firstDirEntry;
        while (dirEntry !== undefined && !visitedDirEntries.has(dirEntry)) {
            visitedDirEntries.add(dirEntry);
            yield* dirEntry.extents;

            // Follow the linked list of directory entries.
            dirEntry = dirEntry.nextDirEntry;
        }
    }

    /**
     * The number of sectors that a file's extents hold, which may be more or fewer than its size needs.
     */
    private getExtentSectorCount(firstDirEntry: TrsdosDirEntry): number {
        let sectorCount = 0;
        for (const extent of this.getFileExtents(firstDirEntry)) {
            sectorCount += extent.granuleCount * this.sectorsPerGranule;
        }
        return sectorCount;
    }

    /**
     * Get the position of all the sectors of the file.
     */
    public getFileSectorPositions(firstDirEntry: TrsdosDirEntry): SectorPosition[] {
        const sectorPositions: SectorPosition[] = [];

        // Number of sectors left to read.
        // TODO aren't sector sizes not fixed?
        const sectorsInFile = Math.ceil(firstDirEntry.getSize() / BYTES_PER_SECTOR);

        for (const extent of this.getFileExtents(firstDirEntry)) {
            const sectorCount = extent.granuleCount * this.sectorsPerGranule;
            for (let i = 0; i < sectorCount && sectorPositions.length < sectorsInFile; i++) {
                sectorPositions.push(this.logicalToPhysical(extent.cylinderNumber, extent.granuleOffset, i));
            }
        }

        // BOOT/SYS claims whole granules of the boot track, but on disks whose boot track is formatted
        // with fewer sectors than the others (single density on a double-density disk), the sectors
        // past the end of the track were never formatted. They aren't missing, they don't exist.
        // MultiDOS calls its boot file DOS/SYS. If the disk has no boot track at all, those sectors
        // are missing from the image, so we don't filter them.
        const filename = firstDirEntry.getFilename("/");
        const bootTrack = this.geometry.bootTrack;
        if (bootTrack !== undefined && (filename === "BOOT/SYS" || filename === "DOS/SYS")) {
            return sectorPositions.filter(sectorPosition =>
                !sectorPosition.trackPosition.equals(bootTrack.trackPosition) ||
                sectorPosition.sectorNumber <= bootTrack.lastSectorNumber);
        }

        return sectorPositions;
    }

    /**
     * Read the binary for a file on the diskette. This doesn't report damage; see readFileWithDamage().
     */
    public readFile(firstDirEntry: TrsdosDirEntry): Uint8Array {
        return this.readFileWithDamage(firstDirEntry).binary;
    }

    /**
     * Read the binary for a file on the diskette, and report what's wrong with it: sectors that
     * are missing or have CRC errors, and broken chains of directory entries.
     */
    public readFileWithDamage(firstDirEntry: TrsdosDirEntry): FloppyFileContents {
        const damage = new FileDamage();
        const binary = this.readFileData(firstDirEntry, damage);
        this.checkDirectoryChain(firstDirEntry, damage);
        return {binary, damage};
    }

    /**
     * Check a file's chain of directory entries, recording problems in the damage: a link to an
     * entry that doesn't exist, or a loop. This doesn't compare the extents with the file's size,
     * because too many intact files have fewer sectors than their size says (see FLOPPY_TODO.md).
     */
    private checkDirectoryChain(firstDirEntry: TrsdosDirEntry, damage: FileDamage): void {
        const visitedDirEntries = new Set<TrsdosDirEntry>();
        let dirEntry: TrsdosDirEntry | undefined = firstDirEntry;
        while (dirEntry !== undefined) {
            if (visitedDirEntries.has(dirEntry)) {
                damage.directoryErrors.push("directory entries form a loop");
                break;
            }
            visitedDirEntries.add(dirEntry);

            if (dirEntry.nextDec !== undefined && dirEntry.nextDirEntry === undefined) {
                damage.directoryErrors.push("missing extended directory entry");
                break;
            }
            dirEntry = dirEntry.nextDirEntry;
        }
    }

    /**
     * Read the binary for a file on the diskette, optionally recording sectors that are
     * missing or have CRC errors.
     *
     * @param firstDirEntry the file's first directory entry.
     * @param damage where to record damage, or undefined to ignore it.
     */
    private readFileData(firstDirEntry: TrsdosDirEntry, damage: FileDamage | undefined): Uint8Array {
        const sectors: Uint8Array[] = [];
        const sectorPositions = this.getFileSectorPositions(firstDirEntry);

        for (const sectorPosition of sectorPositions) {
            const sector = this.disk.readSector(sectorPosition);
            if (sector === undefined) {
                damage?.missingSectors.push(sectorPosition);
                // Keep the rest of the file in place.
                sectors.push(new Uint8Array(this.geometry.modalDataSectorSize));
            } else {
                if (sector.crcError) {
                    damage?.crcErrorSectors.push(sectorPosition);
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

        // TODO actually write the file.
        return "Writing files isn't implemented";
    }
}

// Sectors on a Model II double-density track under LS-DOS and DOSPLUS II.
const MODEL_II_DOUBLE_DENSITY_SECTORS_PER_TRACK = 30;
// DOSPLUS II's granules per track there, of 5 sectors each (its manual, page 104).
const DOSPLUS_II_GRANULES_PER_TRACK = 6;

/**
 * Generate the candidates for the TRSDOS 2.3 family, where a lump is a cylinder. See decodeTrsdos()
 * for hitIgnored.
 */
function generateTrsdos23Candidates(disk: DiskVolume, hitIgnored: boolean): Trsdos[] {
    const candidates: Trsdos[] = [];

    const geometry = disk.getGeometry();
    const sectorsPerTrack = geometry.modalDataSectorSpan;
    const density = geometry.modalDataDensity;

    // Most DOSes use 2 granules per track in single density and 3 in double, but DOSPLUS II
    // uses six 5-sector granules on the Model II's 30-sector tracks, so try that there too; the
    // strict GAT check tells them apart. Trying every count that divides the track would be
    // wrong: 8 granules per lump leave no unused GAT bits, so any GAT passes the check (see
    // "Granules per track without the GAT header" in FLOPPY_FORMATS.md).
    const granulesPerTrackOptions = [density === Density.SINGLE ? 2 : 3];
    if (sectorsPerTrack === MODEL_II_DOUBLE_DENSITY_SECTORS_PER_TRACK) {
        granulesPerTrackOptions.push(DOSPLUS_II_GRANULES_PER_TRACK);
    }

    for (const granulesPerTrack of granulesPerTrackOptions) {
        candidates.push(... generateTrsdos23CandidatesWithGranules(disk, granulesPerTrack, hitIgnored));
    }

    return candidates;
}

/**
 * Generate the candidates for the TRSDOS 2.3 family with a given number of granules per track.
 * See decodeTrsdos() for hitIgnored.
 */
function generateTrsdos23CandidatesWithGranules(disk: DiskVolume, granulesPerTrack: number,
                                                hitIgnored: boolean): Trsdos[] {

    const candidates: Trsdos[] = [];

    const version = TrsdosVersion.V2_3;
    const geometry = disk.getGeometry();
    const sectorsPerTrack = geometry.modalDataSectorSpan;
    const sectorsPerGranule = Math.floor(sectorsPerTrack / granulesPerTrack);

    // Allocation sides are the DOS's, not the image's: double-sided media can be used
    // single-sided, and a double-sided disk can be imaged single-sided. Try both and let
    // the evaluation decide. Don't clamp to geometry.sideCount: on a double-sided disk
    // imaged single-sided, reading one side silently pulls the wrong cylinder's data into
    // every file that continues onto side 1, where reading two honestly reports those
    // sectors as missing.
    for (const allocationSides of [1, 2]) {
        // A GAT byte, and an extent's granule field, can't address more than 8 granules.
        if (granulesPerTrack * allocationSides > 8) {
            continue;
        }
        const granulesPerLump = granulesPerTrack * allocationSides;

        // LDOS puts directory entries on both sides of the directory cylinder, DOSPLUS
        // only on side 0.
        const granulesPerDirOptions = allocationSides === 1 ? [granulesPerLump] : [granulesPerTrack, granulesPerLump];

        for (const granulesPerDir of granulesPerDirOptions) {
            for (let dirLumpNumber = 0; dirLumpNumber < geometry.cylinderCount; dirLumpNumber++) {
                candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
                    dirLumpNumber, granulesPerDir, 0, hitIgnored));
            }
        }
    }

    return candidates;
}

function generateTrsdos13Candidates(disk: DiskVolume): Trsdos[] {
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

/**
 * Generate the candidates for Tandy's Model I TRSDOS 2.7DD/2.8 layout: 1.3's geometry (sectors
 * numbered from 1, granules of 2 sectors in single density and 3 in double, one side, a lump
 * is a cylinder) with 2.3-style 32-byte entries. Every cylinder is a possible directory.
 */
function generateTrsdos27Candidates(disk: DiskVolume): Trsdos[] {
    const candidates: Trsdos[] = [];

    const version = TrsdosVersion.V2_7;
    const geometry = disk.getGeometry();
    const allocationSides = 1;
    const density = geometry.modalDataDensity;
    const sectorsPerGranule = density === Density.SINGLE ? 2 : 3;
    const granulesPerLump = Math.floor(geometry.modalDataSectorSpan / sectorsPerGranule) * allocationSides;

    for (let dirLumpNumber = 0; dirLumpNumber < geometry.cylinderCount; dirLumpNumber++) {
        candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
            dirLumpNumber, granulesPerLump, 0));
    }

    return candidates;
}

/**
 * The size of the directory in 5-sector granules according to the candidate's HIT, if it reads as a
 * NEWDOS/80 HIT, or undefined if it doesn't. Byte 0x1F holds the number of directory sectors beyond
 * 10 (0, 5, 10, 15 or 20; see "HIT sector" in FLOPPY_FORMATS.md), and the directory must also reach
 * every sector that the HIT lists an entry in. Some disks list entries past what byte 0x1F says.
 */
function getNewdos80GranulesPerDir(candidate: Trsdos): number | undefined {
    const hitInfo = candidate.getHitInfo();
    if (typeof hitInfo === "string") {
        return undefined;
    }

    const hit = hitInfo.hit;
    const extraSectors = hit[0x1F];
    if (extraSectors % 5 !== 0 || extraSectors > 20) {
        return undefined;
    }

    // Including the GAT and HIT.
    let sectorCount = 10 + extraSectors;
    for (let hitIndex = 0; hitIndex < hit.length; hitIndex++) {
        if (hitIndex !== 0x1F && hit[hitIndex] !== 0) {
            // The low five bits are the entry sector, counted after the GAT and HIT.
            sectorCount = Math.max(sectorCount, (hitIndex & 0x1F) + 3);
        }
    }

    // At most 6 granules (28 entry sectors).
    const granulesPerDir = Math.ceil(sectorCount / 5);
    return granulesPerDir <= 6 ? granulesPerDir : undefined;
}

/**
 * Generate the candidates for NEWDOS/80-style lumps of 5-sector granules. See decodeTrsdos()
 * for hitIgnored.
 */
function generateNewdos80Candidates(disk: DiskVolume, hitIgnored: boolean): Trsdos[] {
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
                    const candidate = new Trsdos(disk, geometry, version, allocationSides, granulesPerLump, sectorsPerGranule,
                        dirLumpNumber, granulesPerDir, firstDataCylinder, hitIgnored);
                    candidates.push(candidate);

                    // The directory can also run past its lump, since its size (DDGA, 2 to 6 granules)
                    // doesn't depend on GPL. Try that size only when the HIT asks for it, rather than
                    // every size, which would read many more sectors that aren't there.
                    if (granulesPerDir === 2 && !hitIgnored) {
                        const largerGranulesPerDir = getNewdos80GranulesPerDir(candidate);
                        if (largerGranulesPerDir !== undefined && largerGranulesPerDir > granulesPerLump) {
                            candidates.push(new Trsdos(disk, geometry, version, allocationSides, granulesPerLump,
                                sectorsPerGranule, dirLumpNumber, largerGranulesPerDir, firstDataCylinder));
                        }
                    }
                }
            }
        }
    }

    return candidates;
}

/**
 * Decode a TRSDOS diskette, or return undefined if this does not look like such a diskette.
 *
 * If no candidate passes, try the 2.3-family layouts again ignoring the HIT. Some disks have a
 * valid directory whose HIT sector holds something else (a copy of a file sector), so no hash
 * matches. Such a reading needs DIR/SYS to name its directory lump, and a GAT that passes the
 * strict check, since entries that merely decode are weak evidence.
 */
export function decodeTrsdos(disk: DiskVolume): Trsdos | undefined {
    // Every DOS of these families uses 256-byte sectors. Other sizes are other systems (TRSDOS-II,
    // Xenix and CP/M use 512), where a candidate can still find something that reads as a directory.
    if (disk.getGeometry().modalDataSectorSize !== BYTES_PER_SECTOR) {
        return undefined;
    }

    const best = findBestCandidate([
        ... generateTrsdos23Candidates(disk, false),
        ... generateTrsdos13Candidates(disk),
        ... generateTrsdos27Candidates(disk),
        ... generateNewdos80Candidates(disk, false),
    ]);
    if (best !== undefined) {
        return best;
    }

    const hitIgnoredCandidates = [
        ... generateTrsdos23Candidates(disk, true),
        ... generateNewdos80Candidates(disk, true),
    ].filter(candidate => candidate.gatPassesStrictCheck);
    const bestIgnoringHit = findBestCandidate(hitIgnoredCandidates);
    if (bestIgnoringHit !== undefined) {
        TRS80_BASE_LOGGER.warn("The HIT doesn't match the directory, so it was read without it");
    }
    return bestIgnoringHit;
}

/**
 * Decode the file system in a partition of a hard disk, whose directory cylinder the caller found
 * from the partition's boot sector. A partition is a disk with one side, whose tracks are as long
 * as all its heads together, so this reads it as the 2.3 family with a lump per cylinder, and the
 * granules per cylinder the partition's GAT gives. The floppy layouts (2 or 3 granules per track,
 * Tandy's older DOSes, NEWDOS/80's lumps) don't apply, so they aren't tried. See "Hard disk images"
 * in FLOPPY_FORMATS.md.
 *
 * As with a floppy, if the HIT doesn't match the directory, it tries again without the HIT.
 *
 * @param volume the partition.
 * @param dirCylinder the directory's cylinder, relative to the partition.
 * @param granulesPerCylinder the number of granules in each cylinder.
 * @return the decoded file system, or undefined if this doesn't look like one.
 */
export function decodeTrsdosHardDiskPartition(volume: DiskVolume, dirCylinder: number,
                                              granulesPerCylinder: number): Trsdos | undefined {

    const geometry = volume.getGeometry();
    const sectorsPerCylinder = geometry.modalDataSectorSpan;
    if (geometry.modalDataSectorSize !== BYTES_PER_SECTOR ||
        granulesPerCylinder < 1 || granulesPerCylinder > 8 ||
        sectorsPerCylinder % granulesPerCylinder !== 0 ||
        dirCylinder < 0 || dirCylinder >= geometry.cylinderCount) {

        return undefined;
    }

    const sectorsPerGranule = sectorsPerCylinder / granulesPerCylinder;
    const makeCandidate = (hitIgnored: boolean) => new Trsdos(volume, geometry, TrsdosVersion.V2_3, 1,
        granulesPerCylinder, sectorsPerGranule, dirCylinder, granulesPerCylinder, 0, hitIgnored);

    const best = findBestCandidate([makeCandidate(false)]);
    if (best !== undefined) {
        return best;
    }

    const hitIgnoredCandidate = makeCandidate(true);
    const bestIgnoringHit = hitIgnoredCandidate.gatPassesStrictCheck ?
        findBestCandidate([hitIgnoredCandidate]) : undefined;
    if (bestIgnoringHit !== undefined) {
        TRS80_BASE_LOGGER.warn("The HIT doesn't match the directory, so it was read without it");
    }
    return bestIgnoringHit;
}

/**
 * The best of the candidates, or undefined if none passes.
 */
function findBestCandidate(candidates: Trsdos[]): Trsdos | undefined {
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
