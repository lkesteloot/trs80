/**
 * Classes for reading CP/M diskettes. See "CP/M" in FLOPPY_FORMATS.md.
 *
 * Every CP/M lays out its directory and allocation the same way, but the disk doesn't record
 * the parameters (sector skew, reserved tracks, block size, directory size). They're in the
 * BIOS's disk parameter block, so we keep a table of known formats, try each one, and keep
 * the one whose directory makes the most sense.
 */

import {concatByteArrays} from "teamten-ts-utils";
import {TRS80_BASE_LOGGER} from "trs80-logger";
import {FloppyDisk, FloppyDiskGeometry, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";

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

// Characters that can't be in a filename, besides control characters.
const BAD_FILENAME_CHARACTERS = "<>.,;:=?*[]";

/**
 * How one BIOS lays out its disks. This is the part of the disk parameter block (DPB) that
 * the disk can't tell us. The rest (sectors per track, disk size) comes from the geometry.
 */
export interface CpmFormat {
    // Who made the BIOS, such as "Montezuma Micro" or "Lifeboat".
    readonly name: string;
    // Physical sector sizes this format uses.
    readonly sectorSizes: readonly number[];
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
        firstSectorNumber: 1,
        skew: 4,
        reservedTrackCounts: [2],
        blockSize: 2048,
        dirEntryCount: 128,
    },
    // Lifeboat CP/M 1.4 for the Model I, measured on telanoc's system disk. Single density,
    // 18 sectors of 128 bytes after 3 system tracks of 10 sectors of 256 bytes.
    {
        name: "Lifeboat",
        sectorSizes: [128],
        firstSectorNumber: 1,
        skew: 4,
        reservedTrackCounts: [3],
        blockSize: 1024,
        dirEntryCount: 64,
    },
];

/**
 * Make a CP/M sector translation table: the physical sector index (from 0) of each
 * logical sector on a track, the way cpmtools does.
 */
function makeSkewTable(sectorsPerTrack: number, skew: number): number[] {
    const table: number[] = [];
    const used = new Set<number>();
    let physical = 0;
    for (let logical = 0; logical < sectorsPerTrack; logical++) {
        // Wrapping can land on a used sector, so take the next free one.
        while (used.has(physical)) {
            physical = (physical + 1) % sectorsPerTrack;
        }
        table.push(physical);
        used.add(physical);
        physical = (physical + skew) % sectorsPerTrack;
    }
    return table;
}

/**
 * Decode a name or extension field: 7-bit ASCII (the high bits are attributes), padded with spaces.
 */
function decodeFilenameField(bytes: Uint8Array): string {
    return String.fromCharCode(... Array.from(bytes, b => b & 0x7F)).trimEnd();
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
 * A file, made of one or more directory entries.
 */
export class CpmFile implements FloppyDirEntry {
    public readonly user: number;
    public readonly name: string;
    public readonly extension: string;
    // In order of extent number.
    public readonly extents: CpmExtent[];

    constructor(extents: CpmExtent[]) {
        const first = extents[0];
        this.user = first.user;
        this.name = first.name;
        this.extension = first.extension;
        this.extents = extents;
    }

    public getFilename(extensionSeparator: string): string {
        return this.extension === "" ? this.name : this.name + extensionSeparator + this.extension;
    }

    /**
     * The size in bytes, which is a whole number of 128-byte records. Text files end
     * with a Ctrl-Z (0x1A) in the last record.
     */
    public getSize(): number {
        const last = this.extents[this.extents.length - 1];
        return (last.extentNumber*RECORDS_PER_EXTENT + last.recordCount)*RECORD_SIZE;
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
 * A CP/M diskette, as one candidate layout.
 */
export class Cpm implements FloppyFileSystem<CpmFile> {
    public readonly disk: FloppyDisk;
    public readonly geometry: FloppyDiskGeometry;
    public readonly format: CpmFormat;
    // Sides the file system uses, which may be fewer than the image has.
    public readonly allocationSides: number;
    public readonly reservedTrackCount: number;
    public readonly sectorsPerTrack: number;
    public readonly sectorSize: number;
    public readonly sectorsPerBlock: number;
    // Physical sector index (from 0) of each logical sector on a track.
    public readonly skewTable: number[];
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

    constructor(disk: FloppyDisk, format: CpmFormat, allocationSides: number, reservedTrackCount: number) {
        this.disk = disk;
        this.geometry = disk.getGeometry();
        this.format = format;
        this.allocationSides = allocationSides;
        this.reservedTrackCount = reservedTrackCount;
        this.sectorsPerTrack = this.geometry.modalDataSectorSpan;
        this.sectorSize = this.geometry.modalDataSectorSize;
        this.sectorsPerBlock = format.blockSize / this.sectorSize;
        this.skewTable = makeSkewTable(this.sectorsPerTrack, format.skew);
        const dataTrackCount = this.geometry.cylinderCount*allocationSides - reservedTrackCount;
        this.blockCount = Math.floor(dataTrackCount*this.sectorsPerTrack*this.sectorSize/format.blockSize);
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
        // Small double-sided disks read the same directory either way, and their files
        // may all fit within blocks that both readings find. Unlike TRSDOS, CP/M has no
        // allocation map to tell us, so believe the image.
        return Math.abs(this.allocationSides - this.geometry.sideCount) -
            Math.abs(other.allocationSides - other.geometry.sideCount);
    }

    /**
     * Physical position of a sector of the data area, which starts after the reserved tracks
     * and is counted in physical sectors.
     */
    private dataSectorPosition(sectorIndex: number): SectorPosition {
        const track = this.reservedTrackCount + Math.floor(sectorIndex / this.sectorsPerTrack);
        const sectorOnTrack = this.skewTable[sectorIndex % this.sectorsPerTrack];
        return SectorPosition.make(Math.floor(track / this.allocationSides), track % this.allocationSides,
            this.format.firstSectorNumber + sectorOnTrack);
    }

    /**
     * Physical positions of the sectors of an allocation block.
     */
    private blockSectorPositions(block: number): SectorPosition[] {
        const positions: SectorPosition[] = [];
        for (let i = 0; i < this.sectorsPerBlock; i++) {
            positions.push(this.dataSectorPosition(block*this.sectorsPerBlock + i));
        }
        return positions;
    }

    /**
     * Read sectors, zero-filling those that can't be read. Without warnings, this doesn't
     * try to read sectors that aren't there, so that the disk doesn't warn either.
     */
    private readSectors(positions: SectorPosition[], warn: boolean): Uint8Array {
        return concatByteArrays(positions.map(position => {
            const sector = warn || this.disk.hasSectorData(position) ? this.disk.readSector(position) : undefined;
            if (sector === undefined) {
                if (warn) {
                    TRS80_BASE_LOGGER.warn(`Sector couldn't be read ${position.key()}`);
                }
                return new Uint8Array(this.sectorSize);
            }
            if (sector.crcError && warn) {
                TRS80_BASE_LOGGER.warn("Sector has CRC error");
            }
            return sector.data;
        }));
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
     * Read the directory, group its entries into files, and evaluate how well this layout fits.
     */
    private readDirectory(): { files: CpmFile[], evaluation: CpmEvaluation } {
        // The directory fills the first blocks.
        const dirPositions: SectorPosition[] = [];
        for (let block = 0; block < this.dirBlockCount; block++) {
            dirPositions.push(... this.blockSectorPositions(block));
        }
        const dir = this.readSectors(dirPositions, false);

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

        const files = Array.from(extentsByFile.values(), extents =>
            new CpmFile(extents.sort((a, b) => a.extentNumber - b.extentNumber)));

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
     * Positions of the sectors that hold the file's data, which may stop partway through
     * its last block.
     */
    public getFileSectorPositions(file: CpmFile): SectorPosition[] {
        const sectorCount = Math.ceil(file.getSize() / this.sectorSize);
        return file.getBlocks()
            .flatMap(block => this.blockSectorPositions(block))
            .slice(0, sectorCount);
    }

    public readFile(file: CpmFile): Uint8Array {
        return this.readSectors(this.getFileSectorPositions(file), true).subarray(0, file.getSize());
    }
}

/**
 * Generate every layout to try on this disk.
 */
function generateCpmCandidates(disk: FloppyDisk): Cpm[] {
    const geometry = disk.getGeometry();
    const candidates: Cpm[] = [];

    for (const format of CPM_FORMATS) {
        if (!format.sectorSizes.includes(geometry.modalDataSectorSize)) {
            continue;
        }

        // As with TRSDOS, the file system's sides are the DOS's, not the image's, so try
        // both: a double-sided disk may have been imaged single-sided. Read with two
        // sides, its side-1 sectors are reported missing instead of read from the wrong
        // cylinder.
        for (const allocationSides of [1, 2]) {
            for (const reservedTrackCount of format.reservedTrackCounts) {
                candidates.push(new Cpm(disk, format, allocationSides, reservedTrackCount));
            }
        }
    }

    return candidates;
}

/**
 * Decode a CP/M diskette, or return undefined if it doesn't look like one in a format we know.
 */
export function decodeCpm(disk: FloppyDisk): Cpm | undefined {
    const candidates = generateCpmCandidates(disk);

    // Best first.
    candidates.sort((a, b) => a.compareTo(b));

    if (candidates.length === 0) {
        return undefined;
    }
    const best = candidates[0];
    return best.evaluation.score > 0 ? best : undefined;
}
