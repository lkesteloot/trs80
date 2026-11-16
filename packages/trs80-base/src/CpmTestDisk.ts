/**
 * A builder for small synthetic CP/M disks, for tests, as TrsdosTestDisk.ts is for TRSDOS. It makes a
 * writable DMK image in one of the layouts of CPM_VERIFIED_LAYOUTS, with a directory and files encoded by
 * the rules in "Montezuma Micro CP/M 2.2" and "CP/M" in FLOPPY_FORMATS.md. Montezuma's layouts have FORMAT's
 * own tracks, and the other systems' have plain tracks of the layout's shape. The encoding here is written out independently of Cpm.ts (so that a test can
 * check one against the other), and it's exported from the package only so that tests in this repo
 * can build disks; it isn't for real use.
 */

import type {CpmFormat} from "./Cpm.js";
import {type CpmVerifiedLayout, findPresetFormat, isMontezumaPreset} from "./CpmWriteGate.js";
import {getDmkTrackLength, makeBlankFloppy, makeDmkImage} from "./DmkBuilder.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, type FormattedTrack, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {
    buildFormattedTrack, getLayoutByteCount, getTrackByteCount, MONTEZUMA_256_TRACK_LAYOUT,
    MONTEZUMA_512_TRACK_LAYOUT, MONTEZUMA_SUPER_DATA_TRACK_LAYOUT, type TrackLayout,
} from "./TrackLayout.js";

// Bytes in a CP/M record and directory entry.
const RECORD_SIZE = 128;
const DIR_ENTRY_SIZE = 32;

// Fills unused directory entries and fresh sectors, and pads text files.
const UNUSED_USER = 0xE5;
const CTRL_Z = 0x1A;

// Bytes in a turn of an 8-inch double-density track, for the layouts that don't fit a 5.25-inch one.
const EIGHT_INCH_DOUBLE_DENSITY_TRACK_BYTES = 10416;

/**
 * The format entry that a preset is read with, which has what the layout's rows don't (the number of the first
 * sector, a shorter last sector, and reserved blocks).
 *
 * @throws if the table and CPM_FORMATS have drifted apart.
 */
function findTestFormat(layout: CpmVerifiedLayout): CpmFormat {
    const format = findPresetFormat(layout);
    if (format === undefined) {
        throw new Error(`No format for ${layout.id}`);
    }
    return format;
}

/**
 * The size in bytes of a physical sector of a layout, by its index among the track's sectors (from 0). The last
 * one is shorter in some formats.
 */
function testSectorSize(layout: CpmVerifiedLayout, format: CpmFormat, physicalIndex: number): number {
    const isLast = physicalIndex === layout.sectorsPerTrack - 1;
    return isLast && format.lastSectorSize !== undefined ? format.lastSectorSize : layout.sectorSize;
}

/**
 * The track layout of a Montezuma layout's sectors: FORMAT's own, measured (see "Track layouts by DOS" in
 * FLOPPY_FORMATS.md).
 */
function makeMontezumaTrackLayout(layout: CpmVerifiedLayout): TrackLayout {
    const found = [MONTEZUMA_256_TRACK_LAYOUT, MONTEZUMA_512_TRACK_LAYOUT, MONTEZUMA_SUPER_DATA_TRACK_LAYOUT].find(
        candidate => candidate.sectorCount === layout.sectorsPerTrack && candidate.sectorSize === layout.sectorSize);
    if (found === undefined) {
        throw new Error(`No Montezuma track layout of ${layout.sectorsPerTrack} sectors of ${layout.sectorSize} bytes`);
    }
    return found;
}

/**
 * The track layout of another system's layout: every track (the reserved ones too) has the layout's density, sector
 * size, and sector count, numbered from the format's first sector number and in physical order, since the skew is
 * the BIOS's. The gaps are plausible but not measured. A layout whose track doesn't fit a 5.25-inch drive's turn gets
 * an 8-inch one.
 */
function makePlainTrackLayout(layout: CpmVerifiedLayout, format: CpmFormat): TrackLayout {
    const single = layout.density === Density.SINGLE;
    const plain: TrackLayout = {
        ...MONTEZUMA_256_TRACK_LAYOUT,
        id: layout.id,
        description: `Test disk for ${layout.id}`,
        density: layout.density,
        sectorCount: layout.sectorsPerTrack,
        sectorSize: layout.sectorSize,
        firstSectorNumber: format.firstSectorNumber,
        leadGapLength: single ? 10 : 32,
        gap2Length: single ? 11 : 22,
        dataSyncLength: single ? 6 : 12,
        gap3Length: single ? 10 : 24,
        idSyncLength: single ? 6 : 12,
    };
    if (getLayoutByteCount(plain) > getTrackByteCount(layout.density)) {
        return {...plain, trackByteCount: EIGHT_INCH_DOUBLE_DENSITY_TRACK_BYTES};
    }
    return plain;
}

// What Montezuma's FORMAT leaves in the first sector of a system format that hasn't been SYSGENed: a boot sector
// that starts with code and says there's no CP/M on the disk. The code here is a stand-in, since only the way the
// sector isn't a directory matters. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
const BOOT_SECTOR_CODE_BYTE = 0x3E;
const BOOT_SECTOR_MESSAGE = "There is NO CP/M on this disk.";
const BOOT_SECTOR_MESSAGE_OFFSET = 0x40;

/**
 * A file to put on a test disk.
 */
export interface CpmTestFile {
    /**
     * The name, such as "HELLO.TXT" or "README".
     */
    name: string;

    /**
     * The file's bytes. They're padded with Ctrl-Z to whole records.
     */
    contents: Uint8Array;

    /**
     * The user number, 0 to 15. Defaults to 0.
     */
    user?: number | undefined;

    /**
     * Whether the file is read-only (R/O).
     */
    readOnly?: boolean | undefined;

    /**
     * Whether the file is a system file (SYS).
     */
    system?: boolean | undefined;
}

/**
 * Changes to the disk that makeCpmTestDisk() makes. The ones about Montezuma's system tracks (banner, noBootSector,
 * unformatSide1) are for Montezuma's presets only, and throw for the others.
 */
export interface CpmTestDiskOptions {
    /**
     * Cylinders in the image, if different from the layout's (for making disks that aren't a verified
     * layout). The block count follows.
     */
    cylinderCount?: number | undefined;

    /**
     * Sides in the image, if different from the layout's, as when a single-sided disk was imaged as
     * double-sided.
     */
    imageSideCount?: number | undefined;

    /**
     * Leave side 1 of every cylinder unformatted, as Montezuma's FORMAT does on a single-sided disk.
     * Only for an image with two sides.
     */
    unformatSide1?: boolean | undefined;

    /**
     * Text to put at the start of the first reserved sector, such as a BIOS banner. Needs a reserved track.
     */
    banner?: string | undefined;

    /**
     * Leave the first sector of a layout with reserved tracks as 0xE5, with no boot sector in it. By default it
     * has FORMAT's boot sector, so that it doesn't look like the start of a directory. A banner then goes in the
     * second sector, so that the first stays 0xE5.
     */
    noBootSector?: boolean | undefined;

    /**
     * Raw directory slots to write after the files, by slot number, each 32 bytes: for making bad
     * entries, or CP/M 3 ones.
     */
    rawEntries?: {slot: number, bytes: Uint8Array}[] | undefined;
}

/**
 * How many blocks the disk has, which is DSM + 1.
 */
export function cpmTestBlockCount(layout: CpmVerifiedLayout, cylinderCount: number = layout.cylinders): number {
    const format = findTestFormat(layout);
    let recordsPerTrack = 0;
    for (let i = 0; i < layout.sectorsPerTrack; i++) {
        recordsPerTrack += Math.floor(testSectorSize(layout, format, i)/RECORD_SIZE);
    }
    const dataTracks = cylinderCount*layout.sides - layout.reservedTracks;
    return Math.floor(dataTracks*recordsPerTrack*RECORD_SIZE/layout.blockSize);
}

/**
 * The physical sector index (from 0) of each logical sector on a track, with the sector after a
 * used one taken when wrapping lands on a used one, as cpmtools does.
 */
function skewTable(sectorsPerTrack: number, skew: number): number[] {
    const table: number[] = [];
    let physical = 0;
    for (let logical = 0; logical < sectorsPerTrack; logical++) {
        while (table.includes(physical)) {
            physical = (physical + 1) % sectorsPerTrack;
        }
        table.push(physical);
        physical = (physical + skew) % sectorsPerTrack;
    }
    return table;
}

/**
 * Where a record of the data area is on a Montezuma disk, written out independently of Cpm.ts.
 *
 * @param layout the disk's layout.
 * @param record the record's index in the data area, counted in 128-byte records from the first
 * data track.
 * @return the sector, and the record's byte offset in it.
 */
export function cpmTestRecordLocation(layout: CpmVerifiedLayout, record: number): {position: SectorPosition, offset: number} {
    const format = findTestFormat(layout);
    const table = skewTable(layout.sectorsPerTrack, layout.skew);

    // The records of a track in logical order, each with where it is.
    const locations: {physicalSector: number, offset: number}[] = [];
    for (const physicalSector of table) {
        const size = testSectorSize(layout, format, physicalSector);
        for (let offset = 0; offset + RECORD_SIZE <= size; offset += RECORD_SIZE) {
            locations.push({physicalSector, offset});
        }
    }

    const track = layout.reservedTracks + Math.floor(record/locations.length);
    const location = locations[record % locations.length];
    return {
        position: SectorPosition.make(Math.floor(track/layout.sides), track % layout.sides,
            format.firstSectorNumber + location.physicalSector),
        offset: location.offset,
    };
}

/**
 * Encode a file's directory entries by the rules in "CP/M" in FLOPPY_FORMATS.md.
 *
 * @param file the file.
 * @param blocks the blocks that hold its records, in order.
 * @param recordCount how many 128-byte records the file has.
 * @param wide whether pointers are 16 bits.
 * @param blockSize bytes in a block.
 * @return the 32-byte entries, in order.
 */
function encodeEntries(file: CpmTestFile, blocks: number[], recordCount: number, wide: boolean,
                       blockSize: number): Uint8Array[] {
    const extentMask = blockSize/(wide ? 2048 : 1024) - 1;
    const recordsPerEntry = (extentMask + 1)*128;
    const recordsPerBlock = blockSize/RECORD_SIZE;
    const pointerCount = wide ? 8 : 16;

    // Name and extension, upper case and padded with spaces.
    const [namePart, extensionPart = ""] = file.name.toUpperCase().split(".");
    const nameBytes = (namePart.padEnd(8, " ") + extensionPart.padEnd(3, " ")).split("").map(ch => ch.charCodeAt(0));
    if (file.readOnly === true) {
        nameBytes[8] |= 0x80;
    }
    if (file.system === true) {
        nameBytes[9] |= 0x80;
    }

    // A zero-length file is one entry with no records.
    const entryCount = Math.max(1, Math.ceil(recordCount/recordsPerEntry));
    const entries: Uint8Array[] = [];
    for (let k = 0; k < entryCount; k++) {
        const firstRecord = k*recordsPerEntry;
        const n = Math.min(recordCount, firstRecord + recordsPerEntry) - firstRecord;
        const lastLogicalExtent = n === 0 ? 0 : Math.floor((n - 1)/128);
        const extentNumber = k*(extentMask + 1) + lastLogicalExtent;

        const entry = new Uint8Array(DIR_ENTRY_SIZE);
        entry[0] = file.user ?? 0;
        entry.set(nameBytes, 1);
        entry[12] = extentNumber & 0x1F;
        entry[13] = 0;
        entry[14] = extentNumber >> 5;
        entry[15] = n - 128*lastLogicalExtent;
        const firstBlock = firstRecord/recordsPerBlock;
        const entryBlocks = blocks.slice(firstBlock, firstBlock + Math.ceil(n/recordsPerBlock));
        entryBlocks.forEach((block, i) => {
            if (wide) {
                entry[16 + 2*i] = block & 0xFF;
                entry[16 + 2*i + 1] = block >> 8;
            } else {
                entry[16 + i] = block;
            }
        });
        if (entryBlocks.length > pointerCount) {
            throw new Error("Too many blocks for an entry");
        }
        entries.push(entry);
    }

    return entries;
}

/**
 * Make a DMK disk in one of the presets, with files. Blocks are allocated lowest first (after the directory's, or
 * the format's reserved blocks) and directory slots in order, as the BDOS does, and the unused directory is 0xE5.
 *
 * @param layout the layout, such as one of CPM_VERIFIED_LAYOUTS.
 * @param files the files, in directory order.
 * @param options changes to the disk.
 * @throws if the files don't fit, the layout doesn't fit on a track, or options that only Montezuma's presets
 * support are given for another preset.
 */
export function makeCpmTestDisk(layout: CpmVerifiedLayout, files: CpmTestFile[],
                                options: CpmTestDiskOptions = {}): DmkFloppyDisk {

    const montezuma = isMontezumaPreset(layout);
    if (!montezuma && (options.banner !== undefined || options.noBootSector !== undefined ||
        options.unformatSide1 !== undefined)) {

        throw new Error(`Test disks in ${layout.id} don't support the banner, noBootSector, or unformatSide1 options`);
    }

    const format = findTestFormat(layout);
    const firstSectorNumber = format.firstSectorNumber;
    const blockSize = layout.blockSize;
    const dirEntryCount = layout.dirEntries;
    const dirBlockCount = Math.ceil(dirEntryCount*DIR_ENTRY_SIZE/blockSize);
    const cylinderCount = options.cylinderCount ?? layout.cylinders;
    const imageSideCount = options.imageSideCount ?? layout.sides;
    const trackLayout = montezuma ? makeMontezumaTrackLayout(layout) : makePlainTrackLayout(layout, format);

    let disk: DmkFloppyDisk | undefined;
    if (options.unformatSide1 === true) {
        const tracks: FormattedTrack[] = [];
        for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
            const track = buildFormattedTrack(trackLayout, new TrackPosition(cylinder, 0), imageSideCount);
            if (track === undefined) {
                throw new Error("Layout doesn't fit on a track");
            }
            tracks.push(track);
        }
        disk = makeDmkImage(tracks, cylinderCount, imageSideCount, getDmkTrackLength(trackLayout));
    } else {
        disk = makeBlankFloppy(trackLayout, cylinderCount, imageSideCount);
    }
    if (disk === undefined) {
        throw new Error("Can't make the test disk");
    }
    const floppy = disk;

    /**
     * Write bytes into a sector at an offset.
     */
    const writeBytes = (position: SectorPosition, offset: number, bytes: Uint8Array): void => {
        const sector = floppy.readSector(position);
        if (sector === undefined) {
            throw new Error("No sector " + position.key());
        }
        sector.data.set(bytes, offset);
        floppy.writeSector(position, sector);
    };

    if (montezuma && layout.reservedTracks > 0 && options.noBootSector !== true) {
        const firstSector = SectorPosition.make(0, 0, firstSectorNumber);
        writeBytes(firstSector, 0, new Uint8Array([BOOT_SECTOR_CODE_BYTE]));
        const message = new Uint8Array(BOOT_SECTOR_MESSAGE.split("").map(ch => ch.charCodeAt(0)));
        writeBytes(firstSector, BOOT_SECTOR_MESSAGE_OFFSET, message);
    }

    if (options.banner !== undefined) {
        const banner = new Uint8Array(options.banner.split("").map(ch => ch.charCodeAt(0)));
        const bannerSector = options.noBootSector === true ? firstSectorNumber + 1 : firstSectorNumber;
        writeBytes(SectorPosition.make(0, 0, bannerSector), 0, banner);
    }

    // The layout with the image's cylinder count.
    const wide = cpmTestBlockCount(layout, cylinderCount) > 256;
    // The format's reserved blocks, if its allocation bitmap reserves more than the directory's.
    const firstDataBlock = format.reservedBlockCount ?? dirBlockCount;
    const writeRecords = (firstRecord: number, bytes: Uint8Array): void => {
        for (let i = 0; i < bytes.length; i += RECORD_SIZE) {
            const {position, offset} = cpmTestRecordLocation(layout, firstRecord + i/RECORD_SIZE);
            writeBytes(position, offset, bytes.subarray(i, i + RECORD_SIZE));
        }
    };

    // Allocate and write the files.
    const dir = new Uint8Array(dirEntryCount*DIR_ENTRY_SIZE).fill(UNUSED_USER);
    let nextBlock = firstDataBlock;
    let nextSlot = 0;
    for (const file of files) {
        const recordCount = Math.ceil(file.contents.length/RECORD_SIZE);
        const padded = new Uint8Array(recordCount*RECORD_SIZE).fill(CTRL_Z);
        padded.set(file.contents);

        const blockCount = Math.ceil(recordCount*RECORD_SIZE/blockSize);
        const blocks: number[] = [];
        for (let i = 0; i < blockCount; i++) {
            blocks.push(nextBlock++);
        }
        if (nextBlock > cpmTestBlockCount(layout, cylinderCount)) {
            throw new Error("Test files don't fit on the disk");
        }

        const entries = encodeEntries(file, blocks, recordCount, wide, blockSize);
        if (nextSlot + entries.length > dirEntryCount) {
            throw new Error("Test files don't fit in the directory");
        }
        for (const entry of entries) {
            dir.set(entry, nextSlot++*DIR_ENTRY_SIZE);
        }

        const recordsPerBlock = blockSize/RECORD_SIZE;
        blocks.forEach((block, i) => {
            writeRecords(block*recordsPerBlock, padded.subarray(i*blockSize, (i + 1)*blockSize));
        });
    }

    for (const {slot, bytes} of options.rawEntries ?? []) {
        dir.set(bytes, slot*DIR_ENTRY_SIZE);
    }
    writeRecords(0, dir);

    return floppy;
}
