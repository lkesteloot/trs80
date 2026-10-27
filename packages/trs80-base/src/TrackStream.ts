/**
 * A track as a sequence of bytes that each remember their density and whether they carry special clock
 * bits, and the code that makes one from a track's sectors. It's the common form that the DMK and HFE
 * writers encode: DMK stores each byte once (twice in single density), and HFE stores each as 16 or 32
 * cells. See "Writing the image formats" in FLOPPY_FORMATS.md.
 *
 * Time on a track is counted in slots of one double-density byte (16 cells). A double-density byte takes
 * one slot and a single-density byte takes two, so tracks with both densities line up the same way in DMK
 * and in HFE.
 */

import {hi, lo} from "z80-base";
import {CRC_16_CCITT} from "./Crc16.js";
import {
    ConvertSector,
    ConvertTrack,
    DiskSize,
    diskSizeSlotsPerTrack,
    sectorSizeToCode,
} from "./FloppyConvertModel.js";
import {Density} from "./FloppyDisk.js";
import {
    makeInterleaveOrder,
    TRSDOS_13_TRACK_LAYOUT,
    TRSDOS_23_TRACK_LAYOUT,
    LDOS_DD_TRACK_LAYOUT,
    type TrackLayout,
} from "./TrackLayout.js";
import {
    CRC_PRESET,
    FM_GAP,
    ID_ADDRESS_MARK,
    MFM_GAP,
    MFM_SYNC,
    MFM_SYNC_COUNT,
} from "./TrackBytes.js";

/**
 * How many slots (double-density byte times) a byte of the density takes on the track.
 */
export function slotsPerByte(density: Density): number {
    return density === Density.DOUBLE ? 1 : 2;
}

/**
 * The byte that fills the gaps in the density.
 */
export function gapByte(density: Density): number {
    return density === Density.DOUBLE ? MFM_GAP : FM_GAP;
}

/**
 * Where an ID address mark is in a track stream.
 */
export interface StreamIdMark {
    /**
     * The index in the stream of the 0xFE byte.
     */
    index: number;

    /**
     * The density of the ID field.
     */
    density: Density;
}

/**
 * The bytes of one track, in the order they go around it.
 */
export class TrackStream {
    /**
     * The data byte of each position.
     */
    public readonly values: number[] = [];

    /**
     * The density each byte is recorded in.
     */
    public readonly densities: Density[] = [];

    /**
     * Whether each byte has unusual clock bits: the three sync bytes before a double-density address mark
     * (an 0xA1 with a missing clock) and the address marks of single density (clock 0xC7 instead of
     * 0xFF). Nothing else has them.
     */
    public readonly specials: boolean[] = [];

    /**
     * The length of the stream in slots (see the top of this file).
     */
    public slotCount = 0;

    /**
     * Append one byte.
     */
    public push(value: number, density: Density, special = false): void {
        this.values.push(value);
        this.densities.push(density);
        this.specials.push(special);
        this.slotCount += slotsPerByte(density);
    }

    /**
     * Append the same ordinary byte several times.
     */
    public pushRun(value: number, count: number, density: Density): void {
        for (let i = 0; i < count; i++) {
            this.push(value, density);
        }
    }

    /**
     * Remove bytes from the end until the stream is no longer than a number of slots.
     */
    public truncateToSlots(maxSlots: number): void {
        while (this.slotCount > maxSlots && this.values.length > 0) {
            this.slotCount -= slotsPerByte(this.densities.pop()!);
            this.values.pop();
            this.specials.pop();
        }
    }

    /**
     * Append gap bytes of the density of the last byte (double density if there is none) until
     * the stream is exactly a number of slots. The stream must not already be longer.
     */
    public padToSlots(slots: number): void {
        const density = this.densities.length > 0 ? this.densities[this.densities.length - 1] : Density.DOUBLE;
        while (this.slotCount + slotsPerByte(density) <= slots) {
            this.push(gapByte(density), density);
        }
        // An odd slot left over after single-density bytes takes a double-density byte.
        while (this.slotCount < slots) {
            this.push(MFM_GAP, Density.DOUBLE);
        }
    }

    /**
     * Find the ID address marks: single-density bytes with the special clock bits that are 0xFE, and
     * double-density 0xFE bytes right after three special sync bytes.
     */
    public findIdMarks(): StreamIdMark[] {
        const marks: StreamIdMark[] = [];

        for (let i = 0; i < this.values.length; i++) {
            if (this.values[i] !== ID_ADDRESS_MARK) {
                continue;
            }
            if (this.densities[i] === Density.SINGLE) {
                if (this.specials[i]) {
                    marks.push({index: i, density: Density.SINGLE});
                }
            } else if (!this.specials[i] && i >= MFM_SYNC_COUNT) {
                let afterSync = true;
                for (let j = 1; j <= MFM_SYNC_COUNT; j++) {
                    afterSync = afterSync && this.specials[i - j] && this.densities[i - j] === Density.DOUBLE;
                }
                if (afterSync) {
                    marks.push({index: i, density: Density.DOUBLE});
                }
            }
        }

        return marks;
    }
}

/**
 * The gap lengths of a track layout, in bytes of the density.
 */
interface GapSet {
    /** Gap bytes from the index to the first ID field's sync. */
    leadGap: number;
    /** Zero bytes before an ID address mark (or before its three sync bytes). */
    idSync: number;
    /** Gap bytes between an ID field and its data field's sync. */
    gap2: number;
    /** Zero bytes before a data address mark (or before its three sync bytes). */
    dataSync: number;
    /** Gap bytes after a data field. */
    gap3: number;
}

/**
 * The layout for a track whose sectors have no known DOS: the one that trs80gp and George Phillips's tools
 * use when they turn a sector image into raw tracks.
 */
const GENERIC_GAPS: Map<Density, GapSet> = new Map([
    [Density.SINGLE, {leadGap: 40, idSync: 6, gap2: 11, dataSync: 6, gap3: 10}],
    [Density.DOUBLE, {leadGap: 60, idSync: 12, gap2: 22, dataSync: 12, gap3: 24}],
]);

/**
 * The shortest gaps we use, for a track that doesn't fit with the usual ones.
 */
const TIGHT_GAPS: Map<Density, GapSet> = new Map([
    [Density.SINGLE, {leadGap: 8, idSync: 4, gap2: 11, dataSync: 4, gap3: 4}],
    [Density.DOUBLE, {leadGap: 8, idSync: 8, gap2: 12, dataSync: 8, gap3: 8}],
]);

/**
 * The DOS layouts that a track's sectors can be matched to, to use the gaps that DOS's FORMAT wrote.
 * TRSDOS 2.3's and LDOS's single-density layouts differ only in gap 3 (12 and 14 bytes), and LDOS's and
 * LS-DOS's double-density layouts are alike, so one of each stands for them. The layouts are in
 * "Track layouts by DOS" in FLOPPY_FORMATS.md.
 */
const MATCHED_LAYOUTS: TrackLayout[] = [
    TRSDOS_23_TRACK_LAYOUT,
    LDOS_DD_TRACK_LAYOUT,
    TRSDOS_13_TRACK_LAYOUT,
];

/**
 * Find the DOS layout whose sectors (density, size, count, and numbers) are exactly this track's.
 */
function matchLayout(sectors: ConvertSector[]): TrackLayout | undefined {
    return MATCHED_LAYOUTS.find(layout => {
        if (sectors.length !== layout.sectorCount) {
            return false;
        }
        const numbers = new Set(sectors.map(sector => sector.sectorNumber));
        for (let i = 0; i < layout.sectorCount; i++) {
            if (!numbers.has(layout.firstSectorNumber + i)) {
                return false;
            }
        }
        return numbers.size === sectors.length &&
            sectors.every(sector => sector.density === layout.density && sector.size === layout.sectorSize);
    });
}

/**
 * The gaps of a DOS layout.
 */
function layoutGaps(layout: TrackLayout): GapSet {
    return {
        leadGap: layout.leadGapLength,
        idSync: layout.idSyncLength,
        gap2: layout.gap2Length,
        dataSync: layout.dataSyncLength,
        gap3: layout.gap3Length,
    };
}

/**
 * Whether we can store the sector in a raw track: its size has a size code.
 */
function canSynthesize(sector: ConvertSector): boolean {
    return sectorSizeToCode(sector.size) !== undefined && (sector.data === undefined || sector.data.length === sector.size);
}

/**
 * Append a CRC, most significant byte first, in the density, optionally made wrong.
 */
function pushCrc(stream: TrackStream, crc: number, density: Density, bad: boolean): void {
    const written = bad ? crc ^ 0x0001 : crc;
    stream.push(hi(written), density);
    stream.push(lo(written), density);
}

/**
 * Append a sector's ID field and data field, with the gaps around them, to the stream.
 */
function pushSector(stream: TrackStream, sector: ConvertSector, gaps: GapSet): void {
    const density = sector.density;
    const doubleDensity = density === Density.DOUBLE;
    const sizeCode = sectorSizeToCode(sector.size)!;
    const gap = gapByte(density);

    // Pushes the sync bytes of a double-density field and starts the CRC, which they are part of.
    const startField = (): number => {
        let crc = CRC_PRESET;
        if (doubleDensity) {
            for (let i = 0; i < MFM_SYNC_COUNT; i++) {
                stream.push(MFM_SYNC, density, true);
                crc = CRC_16_CCITT.update(crc, MFM_SYNC);
            }
        }
        return crc;
    };

    // ID field.
    stream.pushRun(0x00, gaps.idSync, density);
    let crc = startField();
    const idBytes = [ID_ADDRESS_MARK, sector.idCylinder, sector.idSide, sector.sectorNumber, sizeCode];
    idBytes.forEach((value, index) => {
        // In single density the address mark is the byte that has the special clock bits.
        stream.push(value, density, index === 0 && !doubleDensity);
        crc = CRC_16_CCITT.update(crc, value);
    });
    pushCrc(stream, crc, density, sector.idCrcBad);

    stream.pushRun(gap, gaps.gap2, density);

    if (sector.data !== undefined) {
        // Data field.
        stream.pushRun(0x00, gaps.dataSync, density);
        crc = startField();
        stream.push(sector.dataAddressMark, density, !doubleDensity);
        crc = CRC_16_CCITT.update(crc, sector.dataAddressMark);
        for (const value of sector.data) {
            stream.push(value, density);
            crc = CRC_16_CCITT.update(crc, value);
        }
        pushCrc(stream, crc, density, sector.dataCrcBad);
    }

    stream.pushRun(gap, gaps.gap3, density);
}

/**
 * Build the stream for the first sectors of a track with the given gaps.
 *
 * @param sectors the sectors in order.
 * @param count how many of them to include.
 * @param gapsFor chooses a sector's gaps.
 */
function buildStream(sectors: ConvertSector[], count: number, gapsFor: (sector: ConvertSector) => GapSet): TrackStream {
    const stream = new TrackStream();

    if (sectors.length > 0) {
        const first = sectors[0];
        stream.pushRun(gapByte(first.density), gapsFor(first).leadGap, first.density);
    }
    for (let i = 0; i < count; i++) {
        pushSector(stream, sectors[i], gapsFor(sectors[i]));
    }

    return stream;
}

/**
 * Put a track's sectors in the order to write them. A format that doesn't record the physical order (JV1)
 * gets TRSDOS 2.3's interleave when its sectors are TRSDOS 2.3's, and its numeric order otherwise. The
 * others keep their order.
 */
function orderSectors(track: ConvertTrack, sectors: ConvertSector[]): ConvertSector[] {
    if (track.orderKnown) {
        return sectors;
    }

    const layout = TRSDOS_23_TRACK_LAYOUT;
    if (matchLayout(sectors) !== layout) {
        return sectors;
    }

    const order = makeInterleaveOrder(layout.sectorCount, layout.firstSectorNumber, layout.interleaveStep);
    return order.map(number => sectors.find(sector => sector.sectorNumber === number)!);
}

/**
 * The result of synthesizing a track.
 */
export interface SynthesizedTrack {
    /**
     * The track's bytes, not padded to the length of the track.
     */
    stream: TrackStream;

    /**
     * The sectors that went into the stream, in order. A sector is left out if it has a size
     * that can't be recorded, or if the track ran out of room.
     */
    sectors: ConvertSector[];
}

/**
 * Make the raw track for a list of sectors, as a DOS's FORMAT would have written them: gaps, sync bytes,
 * ID fields and data fields with real CRCs (or deliberately wrong ones), in the order of the track. The
 * gaps are those of the DOS layout when the track's sectors are exactly that DOS's, and the generic ones
 * otherwise. If the sectors don't fit in a turn of the track, the gaps are shortened, and then the last
 * sectors are left out.
 *
 * @param track the track's sectors.
 * @param diskSize the size of the disk, which decides how long a turn is.
 */
export function synthesizeTrackStream(track: ConvertTrack, diskSize: DiskSize): SynthesizedTrack {
    const usable = track.sectors.filter(canSynthesize);
    const sectors = orderSectors(track, usable);
    const maxSlots = diskSizeSlotsPerTrack(diskSize);

    const layout = matchLayout(sectors);
    const layoutSet = layout === undefined ? undefined : layoutGaps(layout);
    // The gaps a sector usually has: its DOS's if the track matches one, else the generic ones.
    const usualGaps = (sector: ConvertSector): GapSet => layoutSet ?? GENERIC_GAPS.get(sector.density)!;
    // The shortest gaps we use.
    const tightGaps = (sector: ConvertSector): GapSet => TIGHT_GAPS.get(sector.density)!;

    for (const gapsFor of [usualGaps, tightGaps]) {
        const stream = buildStream(sectors, sectors.length, gapsFor);
        if (stream.slotCount <= maxSlots) {
            return {stream, sectors};
        }
    }

    // Keep as many sectors as fit with the tight gaps.
    for (let count = sectors.length - 1; count >= 0; count--) {
        const stream = buildStream(sectors, count, tightGaps);
        if (stream.slotCount <= maxSlots) {
            return {stream, sectors: sectors.slice(0, count)};
        }
    }

    return {stream: new TrackStream(), sectors: []};
}

/**
 * Whether all of a track's recordable sectors fit in a turn of a disk of the given size.
 */
export function trackFitsDiskSize(track: ConvertTrack, diskSize: DiskSize): boolean {
    return synthesizeTrackStream(track, diskSize).sectors.length === track.sectors.filter(canSynthesize).length;
}
