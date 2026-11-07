/**
 * How a DOS's FORMAT lays out a track, and a builder that produces the bytes of such a track.
 * Together with DmkBuilder.ts this makes blank, formatted disk images. The layouts below were
 * measured on disks that the real DOSes formatted; see "Track layouts by DOS" in FLOPPY_FORMATS.md.
 */

import {assertNever, hi, lo} from "z80-base";
import {CRC_16_CCITT} from "./Crc16.js";
import {
    Density,
    FormattedTrack,
    SectorData,
    SectorPosition,
    TrackPosition,
} from "./FloppyDisk.js";
import {
    CRC_PRESET,
    DATA_ADDRESS_MARK,
    FM_GAP,
    ID_ADDRESS_MARK,
    MFM_GAP,
    MFM_SYNC,
    MFM_SYNC_COUNT,
} from "./TrackBytes.js";

/**
 * Bytes in a track at 300 rpm: 250 kbit/s in single density, 500 kbit/s in double density.
 * The emulator's controller uses the same numbers.
 */
export const SINGLE_DENSITY_TRACK_BYTES = 3125;
export const DOUBLE_DENSITY_TRACK_BYTES = 6250;

/**
 * The most sectors a DMK track can point to, and so the most that a blank image can have.
 */
const MAX_SECTORS_PER_TRACK = 64;

/**
 * Describes the tracks that one DOS's FORMAT writes in one density. Every track of a disk
 * has the same layout except for the cylinder, the side, and the order that the sectors
 * come in around the track.
 *
 * Each track is: the lead gap, then for every sector the ID sync zeros, the ID field
 * (with its three sync bytes first in double density), gap 2, the data sync zeros, the data
 * field (likewise), and gap 3. What's left over at the end of the track is more gap.
 * No layout writes an index address mark.
 */
export interface TrackLayout {
    /**
     * Short name for choosing the layout on a command line, like "ldos-dd".
     */
    id: string;

    /**
     * Words describing which DOS, model, and density this is for.
     */
    description: string;

    /**
     * Whether the track is written in FM (single density) or MFM (double density).
     */
    density: Density;

    /**
     * Sectors on each track.
     */
    sectorCount: number;

    /**
     * Bytes in each sector: 128, 256, 512, or 1024.
     */
    sectorSize: number;

    /**
     * The number of the lowest-numbered sector. The sectors are numbered consecutively from it.
     */
    firstSectorNumber: number;

    /**
     * How the sectors are interleaved on a track that starts with the first sector: the distance,
     * in positions around the track, between consecutive sector numbers. See makeInterleaveOrder().
     */
    interleaveStep: number;

    /**
     * How many positions along the interleave the start of each cylinder moves, compared with
     * the previous cylinder, on a disk with one side. This is the track-to-track skew, and it
     * lets the head step and then find the next sector without waiting for a whole turn.
     */
    cylinderSkew: number;

    /**
     * Like cylinderSkew, but for a disk with two sides.
     */
    twoSidedCylinderSkew: number;

    /**
     * How many positions further along the interleave side 1 starts than side 0 of the same
     * cylinder, on a disk with two sides.
     */
    sideSkew: number;

    /**
     * Gap bytes (0xFF in single density, 0x4E in double density) from the index to the sync
     * zeros of the first ID field.
     */
    leadGapLength: number;

    /**
     * Zero bytes before each ID field's address mark (or before its A1 bytes in double density).
     */
    idSyncLength: number;

    /**
     * Gap bytes between an ID field and the sync zeros of its data field.
     */
    gap2Length: number;

    /**
     * Zero bytes before each data field's address mark (or before its A1 bytes in double density).
     */
    dataSyncLength: number;

    /**
     * Gap bytes after each data field.
     */
    gap3Length: number;

    /**
     * The bytes that fresh sectors are filled with, repeated as many times as necessary.
     */
    fillPattern: number[];

    /**
     * Bytes that the format writes at the very end of each fresh sector, after the filler,
     * and in place of its last bytes. Empty for most DOSes.
     */
    sectorTail: number[];
}

/**
 * TRSDOS 2.3 on the Model I: ten 256-byte sectors in single density, numbered from 0 and
 * interleaved 0 5 1 6 2 7 3 8 4 9, the same on every cylinder. Measured on a disk the
 * DOS formatted.
 */
export const TRSDOS_23_TRACK_LAYOUT: TrackLayout = {
    id: "trsdos-2.3",
    description: "TRSDOS 2.3, Model I, single density",
    density: Density.SINGLE,
    sectorCount: 10,
    sectorSize: 256,
    firstSectorNumber: 0,
    interleaveStep: 2,
    cylinderSkew: 0,
    twoSidedCylinderSkew: 0,
    sideSkew: 0,
    leadGapLength: 14,
    idSyncLength: 6,
    gap2Length: 12,
    dataSyncLength: 6,
    gap3Length: 12,
    fillPattern: [0xE5],
    sectorTail: [],
};

/**
 * LDOS 5.3 and LS-DOS 6.3 in single density (Models I, III and 4): ten 256-byte sectors
 * numbered from 0, interleaved 0 5 1 6 2 7 3 8 4 9, with each cylinder starting seven
 * positions later than the previous one. Measured on disks both DOSes formatted.
 */
export const LDOS_SD_TRACK_LAYOUT: TrackLayout = {
    id: "ldos-sd",
    description: "LDOS 5.3 and LS-DOS 6.3, single density",
    density: Density.SINGLE,
    sectorCount: 10,
    sectorSize: 256,
    firstSectorNumber: 0,
    interleaveStep: 2,
    cylinderSkew: 7,
    twoSidedCylinderSkew: 8,
    sideSkew: 1,
    leadGapLength: 14,
    idSyncLength: 6,
    gap2Length: 12,
    dataSyncLength: 6,
    gap3Length: 14,
    fillPattern: [0xE5],
    sectorTail: [],
};

/**
 * LDOS 5.3 in double density, on the Model I and the Model III, which measured the same:
 * eighteen 256-byte sectors numbered from 0 with a 3:1 interleave, 0 6 12 1 7 13 2 8 14 and
 * so on, and each cylinder starting 13 positions later than the previous one. Filled with
 * 6D B6. (The Model I's 3:1 order, which LS-DOS lacks, was first read from FORMAT's code and
 * then confirmed on a disk it formatted.)
 */
export const LDOS_DD_TRACK_LAYOUT: TrackLayout = {
    id: "ldos-dd",
    description: "LDOS 5.3, Models I and III, double density",
    density: Density.DOUBLE,
    sectorCount: 18,
    sectorSize: 256,
    firstSectorNumber: 0,
    interleaveStep: 3,
    cylinderSkew: 13,
    twoSidedCylinderSkew: 14,
    sideSkew: 1,
    leadGapLength: 32,
    idSyncLength: 12,
    gap2Length: 22,
    dataSyncLength: 12,
    gap3Length: 24,
    fillPattern: [0x6D, 0xB6],
    sectorTail: [],
};

/**
 * LS-DOS 6.3 and TRSDOS 6.2 on the Model 4 in double density: eighteen 256-byte sectors
 * numbered from 0 with a 2:1 interleave, 0 9 1 10 2 11 and so on, and each cylinder starting
 * ten positions later than the previous one. Filled with 6D B6. The gaps are the same as
 * LDOS's. (One imaged disk, formatted on real hardware, has a shorter gap 3 and an index
 * mark; see "Track layouts by DOS" in FLOPPY_FORMATS.md.)
 */
export const LSDOS_DD_TRACK_LAYOUT: TrackLayout = {
    id: "lsdos-dd",
    description: "LS-DOS 6.3 and TRSDOS 6.2, Model 4, double density",
    density: Density.DOUBLE,
    sectorCount: 18,
    sectorSize: 256,
    firstSectorNumber: 0,
    interleaveStep: 2,
    cylinderSkew: 10,
    twoSidedCylinderSkew: 11,
    sideSkew: 1,
    leadGapLength: 32,
    idSyncLength: 12,
    gap2Length: 22,
    dataSyncLength: 12,
    gap3Length: 24,
    fillPattern: [0x6D, 0xB6],
    sectorTail: [],
};

/**
 * TRSDOS 1.3 on the Model III in double density: eighteen 256-byte sectors numbered from 1,
 * every cylinder the same, in the order 1 4 7 10 13 16 2 5 8 11 14 17 3 6 9 12 15 18. Fresh
 * sectors are 0xE5 ending in "(c) 1980 Tandy  ". Its ID sync is only 8 zeros and its lead
 * gap is 64 bytes.
 */
export const TRSDOS_13_TRACK_LAYOUT: TrackLayout = {
    id: "trsdos-1.3",
    description: "TRSDOS 1.3, Model III, double density",
    density: Density.DOUBLE,
    sectorCount: 18,
    sectorSize: 256,
    firstSectorNumber: 1,
    interleaveStep: 6,
    cylinderSkew: 0,
    twoSidedCylinderSkew: 0,
    sideSkew: 0,
    leadGapLength: 64,
    idSyncLength: 8,
    gap2Length: 22,
    dataSyncLength: 12,
    gap3Length: 24,
    fillPattern: [0xE5],
    sectorTail: Array.from("(c) 1980 Tandy  ", ch => ch.charCodeAt(0)),
};

/**
 * Every layout above, for looking one up by its id.
 */
export const ALL_TRACK_LAYOUTS: TrackLayout[] = [
    TRSDOS_23_TRACK_LAYOUT,
    LDOS_SD_TRACK_LAYOUT,
    LDOS_DD_TRACK_LAYOUT,
    LSDOS_DD_TRACK_LAYOUT,
    TRSDOS_13_TRACK_LAYOUT,
];

/**
 * Find a layout by its id, ignoring case.
 *
 * @return the layout, or undefined if there's none by that id.
 */
export function findTrackLayout(id: string): TrackLayout | undefined {
    const lowerId = id.toLowerCase();
    return ALL_TRACK_LAYOUTS.find(layout => layout.id === lowerId);
}

/**
 * Number the sectors of a track in the order that they pass under the head, for a given interleave.
 * Sector number k (counting from the first) goes in position k*step around the track; if that's
 * taken, in the next free position after it. A step of 2 on 10 sectors gives 0 5 1 6 2 7 3 8 4 9.
 *
 * @param count how many sectors.
 * @param firstNumber the number of the first sector.
 * @param step the distance in positions between consecutive sector numbers.
 * @return the sector numbers in physical order.
 */
export function makeInterleaveOrder(count: number, firstNumber: number, step: number): number[] {
    const positions: (number | undefined)[] = new Array<number | undefined>(count).fill(undefined);

    for (let k = 0; k < count; k++) {
        let position = (k*step) % count;
        while (positions[position] !== undefined) {
            position = (position + 1) % count;
        }
        positions[position] = firstNumber + k;
    }

    return positions.map(sectorNumber => sectorNumber ?? 0);
}

/**
 * The sector numbers of a track in physical order: the layout's interleave, rotated by how far
 * the track's cylinder and side have skewed it.
 *
 * @param layout the layout to follow.
 * @param trackPosition which track.
 * @param sideCount sides on the disk, which affects the skew.
 */
export function getTrackSectorOrder(layout: TrackLayout, trackPosition: TrackPosition, sideCount: number): number[] {
    const order = makeInterleaveOrder(layout.sectorCount, layout.firstSectorNumber, layout.interleaveStep);
    const twoSided = sideCount > 1;
    const cylinderSkew = twoSided ? layout.twoSidedCylinderSkew : layout.cylinderSkew;
    const sideSkew = twoSided ? trackPosition.side*layout.sideSkew : 0;
    const start = (trackPosition.cylinderNumber*cylinderSkew + sideSkew) % layout.sectorCount;

    return [...order.slice(start), ...order.slice(0, start)];
}

/**
 * The size code that an ID field stores for a sector size.
 */
function sectorSizeToCode(sectorSize: number): number {
    switch (sectorSize) {
        case 128: return 0;
        case 256: return 1;
        case 512: return 2;
        case 1024: return 3;
        default: throw new Error("Invalid sector size " + sectorSize);
    }
}

/**
 * The number of bytes in a track of this density.
 */
export function getTrackByteCount(density: Density): number {
    switch (density) {
        case Density.SINGLE: return SINGLE_DENSITY_TRACK_BYTES;
        case Density.DOUBLE: return DOUBLE_DENSITY_TRACK_BYTES;
        default: assertNever(density);
    }
}

/**
 * The bytes that a layout's sectors and gaps take up, through the gap after the last sector.
 * The layout fits on a track if this is no more than the track's length.
 */
export function getLayoutByteCount(layout: TrackLayout): number {
    const mfmSync = layout.density === Density.DOUBLE ? MFM_SYNC_COUNT : 0;

    // The ID field is the mark, four bytes, and the CRC. The data field is the mark, the data,
    // and the CRC.
    const sectorBytes = layout.idSyncLength + mfmSync + 7 +
        layout.gap2Length + layout.dataSyncLength + mfmSync + 1 + layout.sectorSize + 2 +
        layout.gap3Length;

    return layout.leadGapLength + layout.sectorCount*sectorBytes;
}

/**
 * Appends the bytes of a track, keeping the CRC of the field in progress.
 */
class TrackWriter {
    public readonly bytes: number[] = [];
    private readonly doubleDensity: boolean;
    private crc = CRC_PRESET;

    /**
     * @param density the density of the track being written.
     */
    constructor(density: Density) {
        this.doubleDensity = density === Density.DOUBLE;
    }

    /**
     * Append a run of the same byte.
     */
    public addRun(value: number, count: number): void {
        for (let i = 0; i < count; i++) {
            this.bytes.push(value);
        }
    }

    /**
     * Append the gap byte for the density, count times.
     */
    public addGap(count: number): void {
        this.addRun(this.doubleDensity ? MFM_GAP : FM_GAP, count);
    }

    /**
     * Append the zero bytes that precede an address mark, and in double density the three
     * sync bytes, which start the field's CRC. In single density the CRC starts at the mark.
     */
    public addSync(zeroCount: number): void {
        this.addRun(0x00, zeroCount);
        this.crc = CRC_PRESET;
        if (this.doubleDensity) {
            for (let i = 0; i < MFM_SYNC_COUNT; i++) {
                this.addCrcByte(MFM_SYNC);
            }
        }
    }

    /**
     * Append one byte, and include it in the field's CRC.
     */
    public addCrcByte(value: number): void {
        this.bytes.push(value);
        this.crc = CRC_16_CCITT.update(this.crc, value);
    }

    /**
     * Append the field's CRC, most significant byte first.
     */
    public addCrc(): void {
        this.bytes.push(hi(this.crc), lo(this.crc));
    }
}

/**
 * Make the bytes of one formatted track, as the controller would have written them with
 * its Write Track command, with real CRCs and the layout's filler in every sector.
 *
 * @param layout the layout to follow.
 * @param trackPosition which track this is. It determines the cylinder and side in the ID fields,
 * and the order of the sectors.
 * @param sideCount sides on the disk, which affects the sector order.
 * @return the track, padded with gap bytes to the standard length for its density, or
 * undefined if the layout doesn't fit on a track.
 */
export function buildFormattedTrack(layout: TrackLayout, trackPosition: TrackPosition,
                                    sideCount: number): FormattedTrack | undefined {

    const trackByteCount = getTrackByteCount(layout.density);
    const fits = getLayoutByteCount(layout) <= trackByteCount && layout.sectorCount <= MAX_SECTORS_PER_TRACK;
    if (!fits) {
        return undefined;
    }

    const sizeCode = sectorSizeToCode(layout.sectorSize);
    const data = makeSectorFill(layout);
    const writer = new TrackWriter(layout.density);
    const idamIndices: number[] = [];
    const sectors: SectorData[] = [];

    writer.addGap(layout.leadGapLength);
    for (const sectorNumber of getTrackSectorOrder(layout, trackPosition, sideCount)) {
        // ID field.
        writer.addSync(layout.idSyncLength);
        idamIndices.push(writer.bytes.length);
        writer.addCrcByte(ID_ADDRESS_MARK);
        writer.addCrcByte(trackPosition.cylinderNumber);
        writer.addCrcByte(trackPosition.side);
        writer.addCrcByte(sectorNumber);
        writer.addCrcByte(sizeCode);
        writer.addCrc();

        // Data field.
        writer.addGap(layout.gap2Length);
        writer.addSync(layout.dataSyncLength);
        writer.addCrcByte(DATA_ADDRESS_MARK);
        for (const value of data) {
            writer.addCrcByte(value);
        }
        writer.addCrc();
        writer.addGap(layout.gap3Length);

        const sectorData = new SectorData(new Uint8Array(data),
            new SectorPosition(trackPosition, sectorNumber), layout.density);
        sectorData.dataAddressMark = DATA_ADDRESS_MARK;
        sectors.push(sectorData);
    }
    writer.addGap(trackByteCount - writer.bytes.length);

    return {
        trackPosition,
        doubleDensity: layout.density === Density.DOUBLE,
        bytes: new Uint8Array(writer.bytes),
        idamIndices,
        sectors,
    };
}

/**
 * The data of a fresh sector in a layout: the filler pattern repeated, with the layout's tail
 * overwriting the end.
 */
function makeSectorFill(layout: TrackLayout): number[] {
    const data: number[] = [];
    for (let i = 0; i < layout.sectorSize; i++) {
        data.push(layout.fillPattern[i % layout.fillPattern.length]);
    }
    data.splice(layout.sectorSize - layout.sectorTail.length, layout.sectorTail.length, ...layout.sectorTail);

    return data;
}
