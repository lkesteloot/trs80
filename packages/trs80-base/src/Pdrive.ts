import {assertNever} from "z80-base";
import {SectorPosition, TrackPosition} from "./FloppyDisk.js";
import type {DiskVolume} from "./DiskVolume.js";
import {HARD_DISK_SECTORS_PER_TRACK} from "./HardDisk.js";

/**
 * Where a disk's PDRIVE settings came from.
 */
export enum PdriveSource {
    // The drive table that a NEWDOS/80 system disk carries in sector 2 of cylinder 0 (or of
    // cylinder 1, when cylinder 0's is blank). See "PDRIVE" in FLOPPY_FORMATS.md.
    TABLE,
    // Worked out from the layout we decoded the disk with, for disks with no valid table, such
    // as data disks.
    LAYOUT,
}

/**
 * Convert the enum to a string, the way the JSON output shows it.
 */
export function pdriveSourceToString(source: PdriveSource): string {
    switch (source) {
        case PdriveSource.TABLE:
            return "table";

        case PdriveSource.LAYOUT:
            return "layout";

        default:
            assertNever(source);
    }
}

/**
 * NEWDOS/80 PDRIVE settings for a disk: either read from the drive table on the disk, or worked out
 * from the layout we decoded it with. See "PDRIVE" in FLOPPY_FORMATS.md for the fields.
 *
 * The table describes how the drive was configured when the system disk was written, which isn't
 * always how the disk in the image is laid out. Only the table has the interface letter of TI and
 * the step rate (TSR), which leave no trace on the media, so those are missing from layout settings.
 */
export interface PdriveSettings {
    /** Where these came from. */
    source: PdriveSource;
    /**
     * Which cylinder's sector 2 the table was read from: 0 normally, or 1 if cylinder 0's was blank.
     * Missing for layout settings.
     */
    tableCylinder?: number;
    /** The interface letter of TI, "A" to "E". Missing for layout settings, or if the table sets no letter. */
    interfaceType?: string;
    /** Whether sector 1 is the lowest sector on each track: the I flag of TI. Always false for layout settings. */
    sectorOneLowest: boolean;
    /** Whether track 1 is the lowest track: the J flag of TI. Always false for layout settings. */
    trackOneLowest: boolean;
    /** Whether cylinder 0 is in the other density from the rest: the K flag of TI. */
    track0OtherDensity: boolean;
    /** Type of drive (TD): A, C, E, or G for 5", B, D, F, or H for 8". */
    driveType: string;
    /** Tracks formatted on the disk (TC), not counting cylinder 0 when it's in the other density. */
    trackCount: number;
    /** Sectors per track, counting both sides (SPT). */
    sectorsPerTrack: number;
    /** The track step rate code (TSR), 0 to 3 for 5, 10, 20, and 40 ms. Missing for layout settings. */
    stepRate?: number;
    /** Granules per lump (GPL). */
    granulesPerLump: number;
    /** The lump where the directory starts (DDSL). */
    dirStartLump: number;
    /** Granules in the directory (DDGA). */
    dirGranules: number;
    /** The number of lumps on the disk, which only the table records. Missing for layout settings. */
    lumpCount?: number;
}

/**
 * Show PDRIVE settings as PDRIVE takes them, such as "TI=A,TD=E,TC=40,SPT=18,TSR=3,GPL=2,DDSL=17,DDGA=2".
 * Settings from the layout have no TSR, and show TI only with its K flag, after a "?" for the
 * unknown interface letter: "TI=?K,TD=E,TC=43,SPT=18,GPL=2,DDSL=17,DDGA=2".
 */
export function pdriveSettingsToString(settings: PdriveSettings): string {
    const flags = (settings.sectorOneLowest ? "I" : "") +
        (settings.trackOneLowest ? "J" : "") +
        (settings.track0OtherDensity ? "K" : "");

    const fields: string[] = [];
    switch (settings.source) {
        case PdriveSource.TABLE:
            fields.push(`TI=${settings.interfaceType ?? "?"}${flags}`);
            break;

        case PdriveSource.LAYOUT:
            if (flags !== "") {
                fields.push(`TI=?${flags}`);
            }
            break;

        default:
            assertNever(settings.source);
    }
    fields.push(`TD=${settings.driveType}`,
        `TC=${settings.trackCount}`,
        `SPT=${settings.sectorsPerTrack}`);
    if (settings.stepRate !== undefined) {
        fields.push(`TSR=${settings.stepRate}`);
    }
    fields.push(`GPL=${settings.granulesPerLump}`,
        `DDSL=${settings.dirStartLump}`,
        `DDGA=${settings.dirGranules}`);
    return fields.join(",");
}

/**
 * Say where the settings came from, for showing after them, such as "from the drive table".
 */
export function pdriveSettingsSourceToString(settings: PdriveSettings): string {
    switch (settings.source) {
        case PdriveSource.TABLE:
            return settings.tableCylinder === 0 || settings.tableCylinder === undefined
                ? "from the drive table"
                : `from the drive table on cylinder ${settings.tableCylinder}`;

        case PdriveSource.LAYOUT:
            return "worked out from the layout";

        default:
            assertNever(settings.source);
    }
}

// The sector of cylinder 0 (side 0) that holds the drive table.
const PDRIVE_TABLE_SECTOR = 2;

/**
 * Whether the start of a sector is 0xE5 filler, the way a sector reads that was formatted but never written.
 */
function isBlankSector(data: Uint8Array): boolean {
    const BLANK_CHECK_LENGTH = 5;
    return data.length >= BLANK_CHECK_LENGTH && data.subarray(0, BLANK_CHECK_LENGTH).every(b => b === 0xE5);
}

/**
 * Read the drive-0 slot of the PDRIVE table that a NEWDOS/80 system disk carries in sector 2 of
 * cylinder 0, the way Matthew Reed's TRSTool decodes it. If that sector is blank, as it is on disks
 * whose cylinder 0 is in the other density, the table is read from cylinder 1 instead, which sets the
 * K flag. See "PDRIVE" in FLOPPY_FORMATS.md for the byte layout.
 *
 * @return the settings, or undefined if the sector can't be read, describes a hard disk, or doesn't look like a table:
 * its two copies of DDSL must agree, and TC, SPT, and GPL must be in range. Other DOSes' disks
 * (NEWDOS 2.1's, for one) have something else there, so this can't tell on its own which disks are
 * NEWDOS/80's; check the DOS first.
 */
export function readPdriveTable(disk: DiskVolume): PdriveSettings | undefined {
    let tableCylinder = 0;
    let data = disk.readSector(new SectorPosition(new TrackPosition(0, 0), PDRIVE_TABLE_SECTOR))?.data;
    if (data !== undefined && isBlankSector(data)) {
        tableCylinder = 1;
        data = disk.readSector(new SectorPosition(new TrackPosition(1, 0), PDRIVE_TABLE_SECTOR))?.data;
    }
    if (data === undefined || data.length < 16) {
        return undefined;
    }

    const dirStartLump = data[0];
    const lumpCount = data[1];
    const trackCount = data[3];
    const sectorsPerTrack = data[4];
    const granulesPerLump = data[5];
    const dirStartLumpCopy = data[8];
    const dirGranules = data[9];
    const stepRate = data[12];
    const interfaceBits = data[13];
    const flags = data[14];
    let driveTypeCode = data[15];

    const looksLikeTable = dirStartLump === dirStartLumpCopy &&
        trackCount >= 1 && trackCount <= 96 &&
        sectorsPerTrack >= 1 && sectorsPerTrack <= 72 &&
        granulesPerLump >= 1 && granulesPerLump <= 8;
    if (!looksLikeTable) {
        return undefined;
    }

    // A hard disk's slots set bit 6 of byte 13. A floppy written on a system whose drive 0 was a
    // hard disk carries that slot, which describes the hard disk's partition, not the floppy.
    const isHardDiskSlot = (interfaceBits & 0x40) !== 0;
    if (isHardDiskSlot) {
        return undefined;
    }

    // The interface letter is the lowest of bits 0 to 4 that's set.
    let interfaceType: string | undefined;
    for (let bit = 0; bit <= 4; bit++) {
        if ((interfaceBits & (1 << bit)) !== 0) {
            interfaceType = String.fromCharCode(0x41 + bit);
            break;
        }
    }

    // A table on cylinder 1 is on a double-density track, but some of these disks have their
    // drive marked as single density (TD=A), so TRSTool shows them as TD=E.
    if (tableCylinder === 1 && driveTypeCode === 0) {
        driveTypeCode = 4;
    }

    return {
        source: PdriveSource.TABLE,
        tableCylinder,
        ...(interfaceType === undefined ? {} : {interfaceType}),
        sectorOneLowest: (flags & 0x01) !== 0,
        trackOneLowest: (flags & 0x02) !== 0,
        track0OtherDensity: (flags & 0x04) !== 0 || tableCylinder === 1,
        driveType: String.fromCharCode(0x41 + (driveTypeCode & 0x07)),
        trackCount,
        sectorsPerTrack,
        stepRate,
        granulesPerLump,
        dirStartLump,
        dirGranules,
        lumpCount,
    };
}

/**
 * The number of 16-byte slots in a PDRIVE table, one for each of drives 0 to 9.
 */
const PDRIVE_SLOT_COUNT = 10;
const PDRIVE_SLOT_SIZE = 16;

/**
 * The bit of a slot's byte 13 that marks the slot as a hard disk's.
 */
const PDRIVE_HARD_DISK_BIT = 0x40;

/**
 * A slot of the PDRIVE table on a NEWDOS/80 hard disk, which describes one partition. Some bytes mean
 * something else than on a floppy. See "NEWDOS/80 on hard disks" in FLOPPY_FORMATS.md.
 */
export interface PdriveHardDiskSlot {
    /** The slot's index in the table, which is its drive number. */
    slot: number;
    /** The head that the partition is on (byte 6 ÷ 8). */
    head: number;
    /** The number of cylinders in the partition, from cylinder 0 (bytes 14 and 15, little-endian). */
    cylinderCount: number;
    /** Sectors per granule (byte 3, which is TC on a floppy). */
    sectorsPerGranule: number;
    /** Granules per lump (byte 5, GPL). */
    granulesPerLump: number;
    /** The number of lumps (byte 1), counting a partial last one. */
    lumpCount: number;
    /** The lump where FORMAT put the directory (byte 0, DDSL). The partition's boot sector has the real one. */
    dirStartLump: number;
}

/**
 * Read the slots of a NEWDOS/80 hard disk's PDRIVE table that describe its partitions, from sector 2 of
 * cylinder 0, head 0 (the start of the PDRIVE table on a floppy too). Slots that aren't for a hard disk
 * (bit 6 of byte 13 clear, or sectors per track other than 32), and slots whose fields are out of range,
 * are left out. A slot may name a head that was never formatted, so the caller must check the partition.
 * See "NEWDOS/80 on hard disks" in FLOPPY_FORMATS.md.
 *
 * @param readSector reads a sector of the disk by cylinder, head and sector, or returns undefined.
 * @return the hard disk slots, in table order.
 */
export function readPdriveHardDiskSlots(readSector: (cylinder: number, head: number, sector: number) => Uint8Array | undefined):
    PdriveHardDiskSlot[] {

    const data = readSector(0, 0, PDRIVE_TABLE_SECTOR);
    if (data === undefined || data.length < PDRIVE_SLOT_COUNT*PDRIVE_SLOT_SIZE) {
        return [];
    }

    const slots: PdriveHardDiskSlot[] = [];
    for (let slot = 0; slot < PDRIVE_SLOT_COUNT; slot++) {
        const bytes = data.subarray(slot*PDRIVE_SLOT_SIZE, (slot + 1)*PDRIVE_SLOT_SIZE);
        const dirStartLump = bytes[0];
        const lumpCount = bytes[1];
        const sectorsPerGranule = bytes[3];
        const sectorsPerTrack = bytes[4];
        const granulesPerLump = bytes[5];
        const headByte = bytes[6];
        const dirStartLumpCopy = bytes[8];
        const interfaceBits = bytes[13];
        const cylinderCount = bytes[14] | (bytes[15] << 8);

        const isHardDiskSlot = (interfaceBits & PDRIVE_HARD_DISK_BIT) !== 0 &&
            sectorsPerTrack === HARD_DISK_SECTORS_PER_TRACK;
        const inRange = dirStartLump === dirStartLumpCopy &&
            (headByte & 0x07) === 0 &&
            sectorsPerGranule >= 1 && sectorsPerGranule <= 32 &&
            granulesPerLump >= 1 && granulesPerLump <= 8 &&
            lumpCount >= 1 && dirStartLump < lumpCount &&
            cylinderCount >= 1;
        if (isHardDiskSlot && inRange) {
            slots.push({
                slot,
                head: headByte >> 3,
                cylinderCount,
                sectorsPerGranule,
                granulesPerLump,
                lumpCount,
                dirStartLump,
            });
        }
    }

    return slots;
}
