/**
 * Classes for reading CP/M diskettes. See "CP/M" in FLOPPY_FORMATS.md.
 *
 * Every CP/M lays out its directory and allocation the same way, but the disk doesn't record
 * the parameters (sector skew, reserved tracks, block size, directory size). They're in the
 * BIOS's disk parameter block, so we keep a table of known formats, try each one, and keep
 * the one whose directory makes the most sense.
 */

import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {FloppyDisk, FloppyDiskGeometry, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {makeSkewTable} from "./DiskUtils.js";

// Size of a directory entry.
const DIR_ENTRY_SIZE = 32;

// User byte of an unused directory entry.
const UNUSED_USER = 0xE5;

// Highest user number of a file.
const MAX_FILE_USER = 15;

// Highest user byte that we accept without counting it as a file: CP/M 3 uses 16-31 for
// passwords, 0x20 for the disk label, and 0x21 for date stamps.
const MAX_OTHER_USER = 0x21;

// CP/M's unit of file size.
const RECORD_SIZE = 128;

// Records in a logical extent, the unit of the extent number.
const RECORDS_PER_EXTENT = 128;

// The usual sizes of drives, in cylinders. An image that holds fewer cylinders than the disk had
// (it's truncated) is tried as each of these that's bigger than it, since the directory may
// point at blocks that the image doesn't hold.
const NOMINAL_CYLINDER_COUNTS = [35, 40, 80];

// Characters that can't be in a filename, besides control characters.
const BAD_FILENAME_CHARACTERS = "<>.,;:=?*[]";

// Ctrl-Z, which ends a CP/M text file.
const CTRL_Z = 0x1A;

// Extensions (upper case) of files that are binary, so we don't look for a Ctrl-Z in
// them. Programs, relocatable code, overlays, libraries, archives, databases, and indexes.
const BINARY_EXTENSIONS = new Set([
    "COM", "REL", "OVL", "OVR", "INT", "LBR", "ARC", "ARK", "DBF", "NDX", "CRL", "SPR", "PRL",
    "RSX", "IRL", "BIN",
]);

// Fraction of the bytes before the Ctrl-Z that must be text characters for us to clip there.
const MIN_TEXT_FRACTION = 0.95;

/**
 * How one BIOS lays out its disks. This is the part of the disk parameter block (DPB) that
 * the disk can't tell us. The rest (sectors per track, disk size) comes from the geometry.
 */
export interface CpmFormat {
    // Who made the BIOS, such as "Montezuma Micro" or "Lifeboat".
    readonly name: string;
    // Physical sector sizes this format uses.
    readonly sectorSizes: readonly number[];
    // Sectors per data track this format uses. Formats that share a sector size can
    // read the same directory with different skews, so this keeps each to its own disks.
    readonly sectorsPerTrack: readonly number[];
    // Number of the first sector on each track.
    readonly firstSectorNumber: number;
    // Distance between consecutive logical sectors on a track, as in cpmtools' "skew".
    readonly skew: number;
    // Possible numbers of reserved (system) tracks before the directory. Each side
    // of a double-sided disk is a track.
    readonly reservedTrackCounts: readonly number[];
    // Allocation block size in bytes.
    readonly blockSize: number;
    // Number of directory entries, which fill the first blocks.
    readonly dirEntryCount: number;
    // The size of the last physical sector on each data track (the highest-numbered one), when
    // it's shorter than the others, as on Montezuma's "Super Data" format. Absent means all
    // sectors are the same size (the geometry's modal size).
    readonly lastSectorSize?: number;
}

/**
 * The formats we know. To add one, get its DPB (from the BIOS, a manual, or a program such as
 * PROBE run on the real system), check it against real disks, and record it in
 * FLOPPY_FORMATS.md.
 */
export const CPM_FORMATS: readonly CpmFormat[] = [
    // Montezuma Micro CP/M 2.2 for the Model 4, verified against the DPB that PROBE printed
    // for each of its 12 formats. Double-sided disks alternate sides track by track. System
    // disks have 2 reserved tracks and data disks none. The 342K format of versions 1.42
    // and 1.44 reserves 4 tracks.
    {
        name: "Montezuma Micro",
        sectorSizes: [256, 512],
        sectorsPerTrack: [18, 10],
        firstSectorNumber: 1,
        skew: 2,
        reservedTrackCounts: [0, 2, 4],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // The format of Montezuma Micro versions 1.26 and 1.30, the same as the 170K and 350K
    // formats above but with skew 4, which was measured from the files. After the entry
    // above, because nothing else tells them apart when the directory reads either way.
    {
        name: "Montezuma Micro",
        sectorSizes: [256],
        sectorsPerTrack: [18],
        firstSectorNumber: 1,
        skew: 4,
        reservedTrackCounts: [2],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // Montezuma's extended 10 × 512 layout, but with the data tracks interleaved physically
    // and no skew in the BIOS, measured from the disks (see FLOPPY_FORMATS.md). The vendor is
    // unknown. After Montezuma's entry, so it wins only when skew 2 reads bad entries.
    {
        name: "Unknown vendor",
        sectorSizes: [512],
        sectorsPerTrack: [10],
        firstSectorNumber: 1,
        skew: 1,
        reservedTrackCounts: [2],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // Lifeboat CP/M 1.4 for the Model I, measured on telanoc's system disk. Single density,
    // 18 sectors of 128 bytes after 3 system tracks of 10 sectors of 256 bytes.
    {
        name: "Lifeboat",
        sectorSizes: [128],
        sectorsPerTrack: [18],
        firstSectorNumber: 1,
        skew: 4,
        reservedTrackCounts: [3],
        blockSize: 1024,
        dirEntryCount: 64,
    },
    // Holmes Engineering CP/M 2.2 for the Model I with the VID-80 board, verified against
    // the DPB that PROBE printed. Double density, 10 sectors of 512 bytes numbered from 0,
    // and no skew (measured from the files). AL0 reserves 4 blocks, twice what the directory
    // needs, because the system spills from track 0 into blocks 2 and 3.
    {
        name: "Holmes Engineering",
        sectorSizes: [512],
        sectorsPerTrack: [10],
        firstSectorNumber: 0,
        skew: 1,
        reservedTrackCounts: [1],
        blockSize: 1024,
        dirEntryCount: 64,
    },
    // Digital Research's CP/M Plus for the Model 4, sold by Radio Shack, measured from the
    // disks (see FLOPPY_FORMATS.md). Like Holmes, but with sectors numbered from 1. One system
    // track of 18 sectors of 256 bytes, then 8 sectors of 512 bytes with no skew.
    {
        name: "Digital Research",
        sectorSizes: [512],
        sectorsPerTrack: [8],
        firstSectorNumber: 1,
        skew: 1,
        reservedTrackCounts: [1],
        blockSize: 1024,
        dirEntryCount: 64,
    },
    // The standard 8" single-density format (IBM 3740): 26 sectors of 128 bytes on every
    // track, two system tracks, and skew 6, as on most 8" CP/M disks, the Model II's included.
    {
        name: "Standard 8-inch",
        sectorSizes: [128],
        sectorsPerTrack: [26],
        firstSectorNumber: 1,
        skew: 6,
        reservedTrackCounts: [2],
        blockSize: 1024,
        dirEntryCount: 64,
    },
    // Lifeboat and Aton CP/M for the Model II ("extended density"): 8 sectors of 1024 bytes
    // after the single-density cylinder 0, which with cylinder 1 makes two system tracks.
    // Double-sided disks have 192 entries.
    {
        name: "Lifeboat or Aton",
        sectorSizes: [1024],
        sectorsPerTrack: [8],
        firstSectorNumber: 1,
        skew: 3,
        reservedTrackCounts: [2],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // Pickles & Trout CP/M and Digital Research's CP/M Plus for the Model II: 16 sectors of
    // 512 bytes, interleaved physically, so no skew. Double-sided disks have 192 entries.
    {
        name: "Pickles & Trout",
        sectorSizes: [512],
        sectorsPerTrack: [16],
        firstSectorNumber: 1,
        skew: 1,
        reservedTrackCounts: [2],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // Montezuma Micro's "Super Data" format for 5¼" double density, measured from the disks
    // (see FLOPPY_FORMATS.md): five sectors of 1024 bytes and one of 512 on every track, since
    // six 1K sectors don't fit, for 5.5K a track. No reserved tracks, so 40 tracks make 220K.
    // Blocks don't start on sector boundaries.
    {
        name: "Montezuma Micro",
        sectorSizes: [1024],
        sectorsPerTrack: [6],
        lastSectorSize: 512,
        firstSectorNumber: 1,
        skew: 2,
        reservedTrackCounts: [0],
        blockSize: 2048,
        dirEntryCount: 128,
    },
];

/**
 * Decode a name or extension field: 7-bit ASCII (the high bits are attributes), padded with spaces.
 */
function decodeFilenameField(bytes: Uint8Array): string {
    return String.fromCharCode(... Array.from(bytes, b => b & 0x7F)).trimEnd();
}

/**
 * Whether a byte (ignoring bit 7, which WordStar sets on many characters) is a text
 * character: printable ASCII, tab, line feed, form feed, or carriage return.
 */
function isTextByte(byte: number): boolean {
    const ch = byte & 0x7F;
    return (ch >= 0x20 && ch <= 0x7E) || ch === 0x09 || ch === 0x0A || ch === 0x0C || ch === 0x0D;
}

/**
 * CP/M records sizes only in whole 128-byte records, and a text file ends at its first
 * Ctrl-Z (0x1A), with the rest of the last record as padding: more Ctrl-Zs, or whatever was
 * left in the program's buffer. This finds that end, returning the length to clip the file
 * to, or undefined if the file should keep its whole records.
 *
 * The extension and contents are both consulted, because clipping a binary file at a Ctrl-Z
 * that happens to be in its data would corrupt it. We clip only if all of these hold:
 *
 * 1. The extension isn't a known binary one (see BINARY_EXTENSIONS), and its second
 *    character isn't Q, Z, or Y, which mark squeezed, crunched, and LZH-compressed files
 *    (.DQC, .AZM, .PYT, .ZY).
 * 2. There's a Ctrl-Z. Let z be the index of the first one.
 * 3. The Ctrl-Z is near the end: in the last record, or in the second-to-last record with
 *    only Ctrl-Zs from there to the end of that record. The latter is Digital Research's own
 *    DUMP.ASM, whose Ctrl-Zs fill a record and whose directory counts one more record of stale
 *    data after it. A Ctrl-Z any earlier means a damaged file (one has a repeated block whose
 *    good text comes after an early Ctrl-Z), so we leave those whole. We can't require all
 *    the bytes after z to be Ctrl-Zs: TRANS.HLP has leftover text after its first one.
 * 4. At least 95% of the bytes before z are text (ignoring bit 7). In the regression collection
 *    real text files score 0.998 to 1.000, and WordStar's .DOK files, with bit 7 set on 11%
 *    to 17% of their bytes, pass once it's ignored. Binaries such as DUMP.COM and Lifeboat's
 *    BOOT.COM have a Ctrl-Z in their last record by chance (a random 128-byte record contains
 *    0x1A about 40% of the time), so this test is what keeps them whole. An empty prefix
 *    counts as text, so a file of only Ctrl-Zs clips to zero.
 *
 * @param data the file's whole records, so its length is a multiple of 128.
 * @param extension the file's extension, without the dot.
 * @returns the length to clip to (the index of the first Ctrl-Z), or undefined to keep the
 * whole records.
 */
export function findCpmTextEnd(data: Uint8Array, extension: string): number | undefined {
    // Binary extensions.
    const upperExtension = extension.toUpperCase();
    const isCompressed = upperExtension.length >= 2 && "QZY".includes(upperExtension.charAt(1));
    if (BINARY_EXTENSIONS.has(upperExtension) || isCompressed) {
        return undefined;
    }

    // Find the first Ctrl-Z.
    const z = data.indexOf(CTRL_Z);
    if (z === -1) {
        return undefined;
    }

    // It must be near the end.
    const inLastRecord = z >= data.length - RECORD_SIZE;
    let inPaddedPenultimateRecord = false;
    if (!inLastRecord && z >= data.length - 2*RECORD_SIZE) {
        // The rest of the record must be Ctrl-Zs.
        const recordEnd = data.length - RECORD_SIZE;
        inPaddedPenultimateRecord = data.subarray(z, recordEnd).every(byte => byte === CTRL_Z);
    }
    if (!inLastRecord && !inPaddedPenultimateRecord) {
        return undefined;
    }

    // What's before it must look like text.
    let textCount = 0;
    for (let i = 0; i < z; i++) {
        if (isTextByte(data[i])) {
            textCount += 1;
        }
    }
    if (z > 0 && textCount < z*MIN_TEXT_FRACTION) {
        return undefined;
    }

    return z;
}

/**
 * One directory entry, which holds up to 16K or 32K (or more) of a file: one or more
 * logical extents of 16K each.
 */
export class CpmExtent {
    public readonly user: number;
    public readonly name: string;
    public readonly extension: string;
    public readonly readOnly: boolean;
    public readonly system: boolean;
    public readonly archived: boolean;
    // Logical extent number of this entry's last 16K (from EX and S2).
    public readonly extentNumber: number;
    // Records used in this entry's last logical extent.
    public readonly recordCount: number;
    // Allocation blocks, without the zeros of unused pointers.
    public readonly blocks: number[];

    constructor(user: number, name: string, extension: string, readOnly: boolean, system: boolean,
                archived: boolean, extentNumber: number, recordCount: number, blocks: number[]) {

        this.user = user;
        this.name = name;
        this.extension = extension;
        this.readOnly = readOnly;
        this.system = system;
        this.archived = archived;
        this.extentNumber = extentNumber;
        this.recordCount = recordCount;
        this.blocks = blocks;
    }
}

/**
 * The size in bytes, a whole number of 128-byte records, that a file's extents record.
 * The extents must be in order of extent number.
 */
function computeRecordSize(extents: CpmExtent[]): number {
    const last = extents[extents.length - 1];
    return (last.extentNumber*RECORDS_PER_EXTENT + last.recordCount)*RECORD_SIZE;
}

/**
 * A file, made of one or more directory entries.
 */
export class CpmFile implements FloppyDirEntry {
    public readonly user: number;
    public readonly name: string;
    public readonly extension: string;
    // In order of extent number.
    public readonly extents: CpmExtent[];
    // Size in bytes of the text before the first Ctrl-Z, or undefined if we keep whole records.
    private readonly textSize: number | undefined;

    /**
     * @param extents the file's directory entries, in order of extent number.
     * @param textSize where to clip the file (see findCpmTextEnd()), or undefined to keep whole records.
     */
    constructor(extents: CpmExtent[], textSize: number | undefined) {
        const first = extents[0];
        this.user = first.user;
        this.name = first.name;
        this.extension = first.extension;
        this.extents = extents;
        this.textSize = textSize;
    }

    public getFilename(extensionSeparator: string): string {
        return this.extension === "" ? this.name : this.name + extensionSeparator + this.extension;
    }

    /**
     * The size in bytes that the directory records, which is a whole number of 128-byte
     * records. Text files end with a Ctrl-Z (0x1A) in the last record, so this is more than
     * their size as reported by getSize(), but it's how much of the disk the file owns.
     */
    public getRecordSize(): number {
        return computeRecordSize(this.extents);
    }

    /**
     * The size in bytes. For a file that looks like text this ends at the first Ctrl-Z (see
     * findCpmTextEnd()), and otherwise it's the whole records, as in getRecordSize().
     */
    public getSize(): number {
        return this.textSize ?? this.getRecordSize();
    }

    /**
     * CP/M 2.2 doesn't record dates.
     */
    public getDate(): Date | undefined {
        return undefined;
    }

    /**
     * Whether the file has the SYS attribute.
     */
    public isSystemFile(): boolean {
        return this.extents[0].system;
    }

    /**
     * Whether the file has the SYS attribute, which hides it from DIR.
     */
    public isHidden(): boolean {
        return this.isSystemFile();
    }

    /**
     * Whether the file has the R/O attribute.
     */
    public isReadOnly(): boolean {
        return this.extents[0].readOnly;
    }

    /**
     * The attributes, such as "R/O SYS", or an empty string if there are none.
     */
    public getAttributesString(): string {
        const first = this.extents[0];
        const parts: string[] = [];
        if (first.readOnly) {
            parts.push("R/O");
        }
        if (first.system) {
            parts.push("SYS");
        }
        if (first.archived) {
            parts.push("ARC");
        }
        return parts.join(" ");
    }

    /**
     * All the file's allocation blocks, in order.
     */
    public getBlocks(): number[] {
        return this.extents.flatMap(extent => extent.blocks);
    }
}

/**
 * How well a candidate layout explains the disk.
 */
export interface CpmEvaluation {
    // Directory entries that are consistent files.
    goodEntryCount: number;
    // Directory entries that can't be files under this layout.
    badEntryCount: number;
    // Blocks claimed more than once.
    duplicateBlockCount: number;
    // File sectors that aren't on the disk.
    missingSectorCount: number;
    // Higher is better; negative means "not this layout".
    score: number;
}

/**
 * Where a 128-byte record of a data track is: the number of its sector and its byte offset
 * within the sector.
 */
interface CpmRecordLocation {
    sectorNumber: number;
    offset: number;
}

/**
 * A CP/M diskette, as one candidate layout.
 */
export class Cpm implements FloppyFileSystem<CpmFile> {
    public readonly disk: FloppyDisk;
    public readonly geometry: FloppyDiskGeometry;
    public readonly format: CpmFormat;
    // Sides the file system uses, which may be fewer than the image has.
    public readonly allocationSides: number;
    public readonly reservedTrackCount: number;
    // Cylinders the file system assumes the disk has, which may be more than the image holds
    // if the image is truncated. Sectors past the end of the image read as missing.
    public readonly cylinderCount: number;
    public readonly sectorsPerTrack: number;
    // Size of the physical sectors, which for formats with a shorter last sector is the size of the others.
    public readonly sectorSize: number;
    // Number of 128-byte records on each data track.
    public readonly recordsPerTrack: number;
    // Number of 128-byte records in an allocation block.
    public readonly recordsPerBlock: number;
    // Physical sector index (from 0) of each logical sector on a track.
    public readonly skewTable: number[];
    // Where each record on a data track is, in logical order.
    private readonly recordLocations: CpmRecordLocation[];
    // Total blocks, including the directory's (DSM + 1).
    public readonly blockCount: number;
    // Whether directory entries hold 16-bit block numbers (8 of them) instead of 8-bit (16).
    public readonly wideBlockPointers: boolean;
    // Mask of the extent number bits that count logical extents within one entry (EXM).
    public readonly extentMask: number;
    public readonly dirBlockCount: number;
    public readonly nameAndVersion: string;
    // Files, from all users, in directory order.
    private readonly files: CpmFile[];
    public readonly evaluation: CpmEvaluation;
    // Whether files keep their whole 128-byte records, instead of ending text files at their Ctrl-Z.
    public readonly wholeRecords: boolean;

    /**
     * @param cylinderCount the cylinders to assume the disk has, which is the geometry's unless the
     * image is truncated.
     */
    constructor(disk: FloppyDisk, format: CpmFormat, allocationSides: number, reservedTrackCount: number,
                cylinderCount: number, wholeRecords: boolean) {

        this.disk = disk;
        this.wholeRecords = wholeRecords;
        this.geometry = disk.getGeometry();
        this.format = format;
        this.allocationSides = allocationSides;
        this.reservedTrackCount = reservedTrackCount;
        this.cylinderCount = cylinderCount;
        this.sectorsPerTrack = this.geometry.modalDataSectorSpan;
        this.sectorSize = this.geometry.modalDataSectorSize;
        this.skewTable = makeSkewTable(this.sectorsPerTrack, format.skew);

        // The sectors of a track in logical order, and from them where each record is. Blocks
        // needn't start on sector boundaries, so the BIOS addresses records.
        this.recordLocations = [];
        for (let logical = 0; logical < this.sectorsPerTrack; logical++) {
            const physical = this.skewTable[logical];
            const isLast = physical === this.sectorsPerTrack - 1;
            const size = isLast && format.lastSectorSize !== undefined ? format.lastSectorSize : this.sectorSize;
            const sectorNumber = format.firstSectorNumber + physical;
            for (let offset = 0; offset + RECORD_SIZE <= size; offset += RECORD_SIZE) {
                this.recordLocations.push({sectorNumber, offset});
            }
        }
        this.recordsPerTrack = this.recordLocations.length;
        this.recordsPerBlock = format.blockSize/RECORD_SIZE;

        const dataTrackCount = cylinderCount*allocationSides - reservedTrackCount;
        this.blockCount = Math.floor(dataTrackCount*this.recordsPerTrack*RECORD_SIZE/format.blockSize);
        this.wideBlockPointers = this.blockCount > 256;
        this.extentMask = format.blockSize/(this.wideBlockPointers ? 2048 : 1024) - 1;
        this.dirBlockCount = Math.ceil(format.dirEntryCount*DIR_ENTRY_SIZE/format.blockSize);
        this.nameAndVersion = format.name + " CP/M";

        const {files, evaluation} = this.readDirectory();
        this.files = files;
        this.evaluation = evaluation;
    }

    /**
     * Short description of this layout, for debugging.
     */
    public summary(): string {
        return `${this.format.name}, ${this.allocationSides} side(s), ${this.reservedTrackCount} reserved track(s)`;
    }

    /**
     * Compare two candidate layouts, with the best one first when sorting.
     */
    public compareTo(other: Cpm): number {
        const a = this.evaluation;
        const b = other.evaluation;
        if (a.score !== b.score) {
            return b.score - a.score;
        }
        // On a double-sided image of a single-sided disk, using side 1 loses sectors.
        if (a.missingSectorCount !== b.missingSectorCount) {
            return a.missingSectorCount - b.missingSectorCount;
        }
        // A truncated image can be read as any bigger drive size, and the readings often
        // agree on every file. Believe the image's own size when they do.
        const aIsImageSize = this.cylinderCount === this.geometry.cylinderCount;
        const bIsImageSize = other.cylinderCount === other.geometry.cylinderCount;
        if (aIsImageSize !== bIsImageSize) {
            return aIsImageSize ? -1 : 1;
        }
        // Small double-sided disks read the same directory either way, and their files
        // may all fit within blocks that both readings find. Unlike TRSDOS, CP/M has no
        // allocation map to tell us, so believe the image.
        return Math.abs(this.allocationSides - this.geometry.sideCount) -
            Math.abs(other.allocationSides - other.geometry.sideCount);
    }

    /**
     * Where a record of the data area is, which starts after the reserved tracks and is counted
     * in 128-byte records.
     */
    private recordLocation(record: number): {position: SectorPosition, offset: number} {
        const track = this.reservedTrackCount + Math.floor(record/this.recordsPerTrack);
        const location = this.recordLocations[record % this.recordsPerTrack];
        const position = SectorPosition.make(Math.floor(track/this.allocationSides), track % this.allocationSides,
            location.sectorNumber);
        return {position, offset: location.offset};
    }

    /**
     * The records of an allocation block, as indices into the data area.
     */
    private blockRecords(block: number): number[] {
        const records: number[] = [];
        for (let i = 0; i < this.recordsPerBlock; i++) {
            records.push(block*this.recordsPerBlock + i);
        }
        return records;
    }

    /**
     * The first recordSize bytes' worth of records of the blocks, which may stop partway
     * through the last block.
     */
    private fileRecords(blocks: number[], recordSize: number): number[] {
        return blocks
            .flatMap(block => this.blockRecords(block))
            .slice(0, Math.ceil(recordSize/RECORD_SIZE));
    }

    /**
     * Read records, zero-filling those whose sectors can't be read. Each sector is read once.
     *
     * @param records the records to read, as indices into the data area.
     * @param damage where to record sectors that are missing or have CRC errors (once each, in
     * the order they're first needed), or undefined to ignore them.
     */
    private readRecords(records: number[], damage: FileDamage | undefined): Uint8Array {
        const result = new Uint8Array(records.length*RECORD_SIZE);
        // Data of each sector read, or undefined if it's missing.
        const sectors = new Map<string, Uint8Array | undefined>();
        for (let i = 0; i < records.length; i++) {
            const {position, offset} = this.recordLocation(records[i]);
            const key = position.key();
            if (!sectors.has(key)) {
                const sector = this.disk.readSector(position);
                if (sector === undefined) {
                    damage?.missingSectors.push(position);
                    sectors.set(key, undefined);
                } else {
                    if (sector.crcError) {
                        damage?.crcErrorSectors.push(position);
                    }
                    sectors.set(key, sector.data);
                }
            }
            const data = sectors.get(key);
            if (data !== undefined) {
                result.set(data.subarray(offset, offset + RECORD_SIZE), i*RECORD_SIZE);
            }
        }
        return result;
    }

    /**
     * Decode a directory entry, returning undefined if it's not a file (unused, or a CP/M 3
     * label, date stamp, or password), and a string if it can't be valid under this layout.
     */
    private decodeDirEntry(bytes: Uint8Array): CpmExtent | undefined | string {
        const user = bytes[0];
        if (user === UNUSED_USER || (user > MAX_FILE_USER && user <= MAX_OTHER_USER)) {
            return undefined;
        }
        if (user > MAX_FILE_USER) {
            return `bad user number ${user}`;
        }

        // Name and extension.
        for (let i = 1; i < 12; i++) {
            const ch = bytes[i] & 0x7F;
            if (ch < 0x20 || ch === 0x7F || BAD_FILENAME_CHARACTERS.includes(String.fromCharCode(ch))) {
                return `bad filename character 0x${ch.toString(16)}`;
            }
        }
        const name = decodeFilenameField(bytes.subarray(1, 9));
        if (name === "" || name.startsWith(" ")) {
            return "bad filename";
        }
        const extension = decodeFilenameField(bytes.subarray(9, 12));

        // Extent number, low 5 bits in EX and the rest in S2.
        const ex = bytes[12];
        const s2 = bytes[14];
        const recordCount = bytes[15];
        if (ex > 0x1F || s2 > 0x3F) {
            return "bad extent number";
        }
        if (recordCount > RECORDS_PER_EXTENT) {
            return "bad record count";
        }
        const extentNumber = (s2 << 5) | ex;

        // Allocation blocks. Pointers are filled from the front.
        const blocks: number[] = [];
        const pointerSize = this.wideBlockPointers ? 2 : 1;
        let sawEnd = false;
        for (let i = 16; i < DIR_ENTRY_SIZE; i += pointerSize) {
            const block = this.wideBlockPointers ? bytes[i] | (bytes[i + 1] << 8) : bytes[i];
            if (block === 0) {
                sawEnd = true;
            } else if (sawEnd) {
                return "gap in block list";
            } else if (block < this.dirBlockCount || block >= this.blockCount) {
                return `block ${block} out of range`;
            } else {
                blocks.push(block);
            }
        }

        // The blocks must hold exactly the records that the entry says it has: all of
        // its earlier logical extents, and recordCount of its last.
        const recordsInEntry = (extentNumber & this.extentMask)*RECORDS_PER_EXTENT + recordCount;
        const expectedBlockCount = Math.ceil(recordsInEntry*RECORD_SIZE/this.format.blockSize);
        if (blocks.length !== expectedBlockCount) {
            return `has ${blocks.length} blocks for ${recordsInEntry} records`;
        }

        // Attributes are in the high bits of the extension.
        const readOnly = (bytes[9] & 0x80) !== 0;
        const system = (bytes[10] & 0x80) !== 0;
        const archived = (bytes[11] & 0x80) !== 0;

        return new CpmExtent(user, name, extension, readOnly, system, archived,
            extentNumber, recordCount, blocks);
    }

    /**
     * Where to clip a file with these extents (in order) to end its text, or undefined to
     * keep its whole records. This reads the file without recording damage, because it runs for
     * every candidate layout and most of them are wrong.
     */
    private findFileTextEnd(extents: CpmExtent[]): number | undefined {
        if (this.wholeRecords) {
            return undefined;
        }
        const recordSize = computeRecordSize(extents);
        const blocks = extents.flatMap(extent => extent.blocks);
        const data = this.readRecords(this.fileRecords(blocks, recordSize), undefined);
        return findCpmTextEnd(data.subarray(0, recordSize), extents[0].extension);
    }

    /**
     * Read the directory, group its entries into files, and evaluate how well this layout fits.
     */
    private readDirectory(): { files: CpmFile[], evaluation: CpmEvaluation } {
        // The directory fills the first blocks.
        const dirRecords: number[] = [];
        for (let block = 0; block < this.dirBlockCount; block++) {
            dirRecords.push(... this.blockRecords(block));
        }
        const dir = this.readRecords(dirRecords, undefined).subarray(0, this.format.dirEntryCount*DIR_ENTRY_SIZE);

        let goodEntryCount = 0;
        let badEntryCount = 0;
        const extentsByFile = new Map<string, CpmExtent[]>();
        for (let i = 0; i < this.format.dirEntryCount; i++) {
            const extent = this.decodeDirEntry(dir.subarray(i*DIR_ENTRY_SIZE, (i + 1)*DIR_ENTRY_SIZE));
            if (typeof extent === "string") {
                badEntryCount += 1;
            } else if (extent !== undefined) {
                goodEntryCount += 1;
                // Users have separate name spaces.
                const key = `${extent.user}:${extent.name}.${extent.extension}`;
                let extents = extentsByFile.get(key);
                if (extents === undefined) {
                    extents = [];
                    extentsByFile.set(key, extents);
                }
                extents.push(extent);
            }
        }

        const files = Array.from(extentsByFile.values(), extents => {
            extents.sort((a, b) => a.extentNumber - b.extentNumber);
            return new CpmFile(extents, this.findFileTextEnd(extents));
        });

        // Look for blocks claimed more than once, and file sectors that aren't on the disk.
        const usedBlocks = new Set<number>();
        let duplicateBlockCount = 0;
        let missingSectorCount = 0;
        for (const file of files) {
            for (const block of file.getBlocks()) {
                if (usedBlocks.has(block)) {
                    duplicateBlockCount += 1;
                }
                usedBlocks.add(block);
            }
            for (const position of this.getFileSectorPositions(file)) {
                if (!this.disk.hasSectorData(position)) {
                    missingSectorCount += 1;
                }
            }
        }

        // A blank directory doesn't count: freshly formatted disks of other operating
        // systems are filled with 0xE5 too.
        const score = goodEntryCount === 0 ? -1 : goodEntryCount - 2*badEntryCount - duplicateBlockCount;

        return {
            files,
            evaluation: {goodEntryCount, badEntryCount, duplicateBlockCount, missingSectorCount, score},
        };
    }

    public getDirEntries(includeSystemFiles: boolean): CpmFile[] {
        return this.files.filter(file => includeSystemFiles || !file.isSystemFile());
    }

    /**
     * Positions of the sectors that hold the file's whole records, which may stop partway
     * through its last block, in order of first use and without repeats. Blocks needn't
     * start on sector boundaries, so a sector can hold parts of several files, or of
     * several of one file's blocks. This doesn't depend on whether text files are clipped.
     */
    public getFileSectorPositions(file: CpmFile): SectorPosition[] {
        const positions: SectorPosition[] = [];
        const seen = new Set<string>();
        for (const record of this.fileRecords(file.getBlocks(), file.getRecordSize())) {
            const {position} = this.recordLocation(record);
            const key = position.key();
            if (!seen.has(key)) {
                seen.add(key);
                positions.push(position);
            }
        }
        return positions;
    }

    /**
     * The contents of the file, clipped at its Ctrl-Z if it looks like text, unless this
     * layout was decoded with whole records.
     */
    public readFile(file: CpmFile): Uint8Array {
        return this.readFileWithDamage(file).binary;
    }

    /**
     * The contents of the file, as with readFile(), and the sectors that were missing or had CRC errors.
     */
    public readFileWithDamage(file: CpmFile): FloppyFileContents {
        const damage = new FileDamage();
        const records = this.fileRecords(file.getBlocks(), file.getRecordSize());
        const binary = this.readRecords(records, damage).subarray(0, file.getSize());
        return {binary, damage};
    }
}

/**
 * Generate every layout to try on this disk. See decodeCpm() for wholeRecords.
 */
function generateCpmCandidates(disk: FloppyDisk, wholeRecords: boolean): Cpm[] {
    const geometry = disk.getGeometry();
    const candidates: Cpm[] = [];

    // The image's own size, then each bigger drive size, in case the image is truncated.
    const cylinderCounts = [geometry.cylinderCount,
        ... NOMINAL_CYLINDER_COUNTS.filter(count => count > geometry.cylinderCount)];

    for (const format of CPM_FORMATS) {
        if (!format.sectorSizes.includes(geometry.modalDataSectorSize) ||
            !format.sectorsPerTrack.includes(geometry.modalDataSectorSpan)) {
            continue;
        }

        // As with TRSDOS, the file system's sides are the DOS's, not the image's, so try
        // both: a double-sided disk may have been imaged single-sided. Read with two
        // sides, its side-1 sectors are reported missing instead of read from the wrong
        // cylinder.
        for (const allocationSides of [1, 2]) {
            for (const reservedTrackCount of format.reservedTrackCounts) {
                for (const cylinderCount of cylinderCounts) {
                    candidates.push(new Cpm(disk, format, allocationSides, reservedTrackCount,
                        cylinderCount, wholeRecords));
                }
            }
        }
    }

    return candidates;
}

/**
 * Decode a CP/M diskette, or return undefined if it doesn't look like one in a format we know.
 *
 * @param disk the floppy.
 * @param wholeRecords if true, every file keeps its whole 128-byte records. By default files that
 * look like text end at their first Ctrl-Z, in their size and in what readFile() returns
 * (see findCpmTextEnd()).
 */
export function decodeCpm(disk: FloppyDisk, wholeRecords = false): Cpm | undefined {
    const candidates = generateCpmCandidates(disk, wholeRecords);

    // Best first.
    candidates.sort((a, b) => a.compareTo(b));

    if (candidates.length === 0) {
        return undefined;
    }
    const best = candidates[0];
    return best.evaluation.score > 0 ? best : undefined;
}
