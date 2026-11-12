/**
 * Conversion to and from HFE for the converter: decoding a track's cell stream into a {@link TrackStream},
 * encoding a stream back into cells, and building a whole HFE image. An HFE source that is written as HFE
 * doesn't come through here; its file is copied. See "Writing the image formats" in FLOPPY_FORMATS.md.
 */

import {hi, lo} from "z80-base";
import {DiskSize, diskSizeSlotsPerTrack} from "./FloppyConvertModel.js";
import {Density, TrackPosition} from "./FloppyDisk.js";
import {
    BLOCK_SIZE,
    cellsPerByte,
    decodeHfeFloppyDisk,
    FM_DATA_CLOCK,
    FM_MARK_CLOCK,
    fmByteCells,
    HFE_V1_MAGIC,
    HfeFloppyDisk,
    MFM_CELLS_PER_BYTE,
    mfmByteCells,
    SIDE_BLOCK_SIZE,
} from "./HfeFloppyDisk.js";
import {MFM_SYNC, MFM_SYNC_COUNT} from "./TrackBytes.js";
import {gapByte, slotsPerByte, TrackStream} from "./TrackStream.js";

/**
 * The most cylinders that one block of track list entries holds. We write one block.
 */
export const HFE_MAX_CYLINDERS = BLOCK_SIZE/4;

/**
 * The index of the clock cell that an 0xA1 sync byte lacks, among its 16 cells. The cells alternate
 * clock and data, and the sixth clock is the one left out (see the 0x4489 pattern in HfeFloppyDisk.ts).
 */
const SYNC_MISSING_CLOCK_CELL = 10;

/**
 * Where a sector's fields are in a side's cell stream.
 */
interface CellRegion {
    /** Cell index of the start of the ID mark (including the sync bytes in double density). */
    idStart: number;
    /** Cell index of the start of the data mark, including the sync bytes. */
    damStart: number;
    /** Cell index just after the data field's CRC. */
    end: number;
    density: Density;
}

/**
 * Decode a track side's cell stream into bytes. Every sector owns the cells from the end of the previous
 * sector's data field (so the gap before a sector is read in the sector's density) through its own data
 * CRC; the cells after the last sector are read in its density. The bytes are laid on a grid that starts at
 * each address mark, so tracks with both densities stay aligned, and the cells that don't fill a byte
 * are dropped. The address marks get their special clock flags. A sector whose data crosses the index
 * continues past the end of the turn, so the stream can be a little longer than the track.
 *
 * @param disk the HFE image.
 * @param trackPosition which track.
 * @return the stream, or undefined if the track has no sectors.
 */
export function hfeTrackToStream(disk: HfeFloppyDisk, trackPosition: TrackPosition): TrackStream | undefined {
    const hfeTrack = disk.tracks.find(track => track.trackPosition.equals(trackPosition));
    if (hfeTrack === undefined || hfeTrack.sectors.length === 0) {
        return undefined;
    }
    const cells = hfeTrack.readStream(disk.binary);

    // Where each sector's fields are. The data mark is the byte before the data, and in double
    // density has three sync bytes before it.
    const regions: CellRegion[] = hfeTrack.sectors.map(sector => {
        const byteCells = cellsPerByte(sector.density);
        const syncCells = sector.density === Density.DOUBLE ? MFM_SYNC_COUNT*byteCells : 0;
        return {
            idStart: sector.start,
            damStart: sector.dataBegin - byteCells - syncCells,
            end: sector.dataBegin + (sector.getLength() + 2)*byteCells,
            density: sector.density,
        };
    }).sort((a, b) => a.idStart - b.idStart);

    const stream = new TrackStream();
    stream.turnSlots = Math.floor(hfeTrack.cellCount()/MFM_CELLS_PER_BYTE);
    const length = cells.length;

    // Push the bytes of cells [from, to) in a density, on a grid that ends at "to" if "anchorEnd" and
    // starts at "from" otherwise. Cells past the end of the stream are the start of the track again, so only
    // the fields of a sector, which continue across the index, can go past it.
    const pushBytes = (from: number, to: number, density: Density, anchorEnd: boolean, mayWrap = false): void => {
        const byteCells = cellsPerByte(density);
        const count = Math.max(0, Math.floor(((mayWrap ? to : Math.min(to, length)) - from)/byteCells));
        const start = anchorEnd ? to - count*byteCells : from;
        for (let i = 0; i < count; i++) {
            stream.push(cells.readByte(start + i*byteCells, density), density);
        }
    };

    // Push a sync-and-mark, or a single-density mark, starting at a cell. Returns the cell after it.
    const pushMark = (start: number, density: Density): number => {
        const byteCells = cellsPerByte(density);
        let position = start;
        if (density === Density.DOUBLE) {
            for (let i = 0; i < MFM_SYNC_COUNT; i++) {
                stream.push(MFM_SYNC, density, true);
                position += byteCells;
            }
            stream.push(cells.readByte(position, density), density);
        } else {
            stream.push(cells.readByte(position, density), density, true);
        }
        return position + byteCells;
    };

    let previousEnd = 0;
    for (const region of regions) {
        if (region.idStart < previousEnd) {
            // Inside the previous sector, so it's a false mark.
            continue;
        }

        // The gap before the sector, then the ID mark and the fields up to the data mark, then
        // the data mark and the data.
        pushBytes(previousEnd, region.idStart, region.density, true);
        const idEnd = pushMark(region.idStart, region.density);
        if (region.damStart >= idEnd) {
            pushBytes(idEnd, region.damStart, region.density, false, true);
            const damEnd = pushMark(region.damStart, region.density);
            pushBytes(damEnd, region.end, region.density, false, true);
        }
        previousEnd = Math.max(region.end, idEnd);
    }
    if (regions.length > 0) {
        pushBytes(previousEnd, length, regions[regions.length - 1].density, false);
    }

    return stream;
}

/**
 * Encode a stream as cells, one per bit, with the first cell in the least significant bit of the first
 * byte as HFE stores them. The stream must already be the length of a track side.
 *
 * @param stream the bytes, whose length in slots is the length of the track side.
 * @return the cells, packed into bytes.
 */
export function encodeStreamCells(stream: TrackStream): Uint8Array {
    const cells = new Uint8Array(stream.slotCount*MFM_CELLS_PER_BYTE/8);

    // Each MFM clock cell depends on the data bit before it. Before the first byte that's the last bit of
    // the track, which comes just before it in the next turn.
    let previousDataBit = stream.values.length > 0 ? stream.values[stream.values.length - 1] & 1 : 0;
    let cellIndex = 0;
    for (let i = 0; i < stream.values.length; i++) {
        const value = stream.values[i];
        let byteCells: number[];
        if (stream.densities[i] === Density.SINGLE) {
            byteCells = fmByteCells(value, stream.specials[i] ? FM_MARK_CLOCK : FM_DATA_CLOCK);
        } else {
            byteCells = mfmByteCells(value, previousDataBit);
            if (stream.specials[i]) {
                // A sync byte is an ordinary MFM byte but for one missing clock.
                byteCells[SYNC_MISSING_CLOCK_CELL] = 0;
            }
        }
        previousDataBit = value & 1;

        for (const cell of byteCells) {
            if (cell === 1) {
                cells[cellIndex >> 3] |= 1 << (cellIndex & 7);
            }
            cellIndex++;
        }
    }

    return cells;
}

/**
 * Make a stream fit in one turn of a track. A stream from an imager can be longer than a turn, as DMK tracks
 * often are, and the part past the turn is the same track passing the index again. A sector that starts
 * before the end of the turn and runs past it is a sector whose data crosses the index, so its excess is
 * moved to the start of the track, where it continues, as long as it doesn't run into the first sector.
 * Everything else past the turn is dropped. Changes the stream.
 *
 * @param stream the stream to shorten.
 * @param slots the number of slots in a turn.
 */
export function fitStreamToTurn(stream: TrackStream, slots: number): void {
    if (stream.slotCount <= slots) {
        return;
    }

    // The first byte that starts at or after the end of the turn.
    let firstExcess = 0;
    let position = 0;
    while (firstExcess < stream.values.length && position < slots) {
        position += slotsPerByte(stream.densities[firstExcess]);
        firstExcess++;
    }

    // The farthest end of a sector that starts in the turn, and the first mark of any sector.
    const marks = stream.findIdMarks();
    let excessEnd = firstExcess;
    let startPosition = 0;
    let firstMarkIndex = stream.values.length;
    const positions: number[] = [];
    for (let i = 0; i < stream.values.length; i++) {
        positions.push(startPosition);
        startPosition += slotsPerByte(stream.densities[i]);
    }
    for (const mark of marks) {
        firstMarkIndex = Math.min(firstMarkIndex, mark.index);
        if (positions[mark.index] < slots) {
            excessEnd = Math.max(excessEnd, stream.sectorEndIndex(mark.index));
        }
    }
    excessEnd = Math.min(excessEnd, stream.values.length);

    // The leading bytes that the excess replaces: as many slots as the excess has, and not the first sync.
    let excessSlots = 0;
    for (let i = firstExcess; i < excessEnd; i++) {
        excessSlots += slotsPerByte(stream.densities[i]);
    }
    const leadLimit = firstMarkIndex - MFM_SYNC_COUNT;
    let replaced = 0;
    let replacedSlots = 0;
    while (replaced < Math.min(firstExcess, leadLimit) && replacedSlots < excessSlots) {
        replacedSlots += slotsPerByte(stream.densities[replaced]);
        replaced++;
    }

    // The excess bytes that fit in what was replaced, then what is left of the start of the track.
    const values: number[] = [];
    const densities: Density[] = [];
    const specials: boolean[] = [];
    let slotsUsed = 0;
    for (let i = firstExcess; i < excessEnd && slotsUsed + slotsPerByte(stream.densities[i]) <= replacedSlots; i++) {
        values.push(stream.values[i]);
        densities.push(stream.densities[i]);
        specials.push(stream.specials[i]);
        slotsUsed += slotsPerByte(stream.densities[i]);
    }
    for (; slotsUsed < replacedSlots; slotsUsed++) {
        values.push(gapByte(Density.DOUBLE));
        densities.push(Density.DOUBLE);
        specials.push(false);
    }
    for (let i = replaced; i < firstExcess; i++) {
        values.push(stream.values[i]);
        densities.push(stream.densities[i]);
        specials.push(stream.specials[i]);
    }

    stream.values.splice(0, stream.values.length, ...values);
    stream.densities.splice(0, stream.densities.length, ...densities);
    stream.specials.splice(0, stream.specials.length, ...specials);
    stream.slotCount = densities.reduce((count, density) => count + slotsPerByte(density), 0);
}

/**
 * HFE header fields for a disk size: the bit rate in kbit/s, and the rotation speed.
 */
function headerRates(diskSize: DiskSize): {bitRate: number, rpm: number} {
    return diskSize === DiskSize.FIVE_INCH ? {bitRate: 250, rpm: 300} : {bitRate: 500, rpm: 360};
}

/**
 * The generic Shugart double-density interface mode, which HxC's own DMK conversion and the images made on
 * real TRS-80 hardware use.
 */
const GENERIC_SHUGART_DD_MODE = 7;

/**
 * Build an HFE (version 1) image from the streams of its tracks and decode it. Every track is exactly one
 * turn long, 12,500 bytes a side at 5.25 inch, which the firmware of Gotek drives needs for the
 * index pulses to come at the right rate. Both sides are interleaved in 256-byte halves of 512-byte
 * blocks. A side with no stream is filled with 0xAA, which decodes as no sectors in either encoding.
 *
 * @param streams the stream of each track that has one, by the key of its position. They are shortened
 * to a turn if they're longer.
 * @param diskSize decides the track length and the header's rates.
 * @param writeProtected whether to clear the header's write-allowed byte.
 * @return the image, or undefined if there are no tracks, there are too many cylinders for one block of
 * the track list, or the result doesn't decode.
 */
export function buildHfeImage(streams: Map<string,TrackStream>, diskSize: DiskSize,
                              writeProtected: boolean): HfeFloppyDisk | undefined {

    let cylinderCount = 0;
    let sideCount = 1;
    for (const key of streams.keys()) {
        const [cylinder, side] = key.split(":").map(Number);
        cylinderCount = Math.max(cylinderCount, cylinder + 1);
        sideCount = Math.max(sideCount, side + 1);
    }
    if (cylinderCount === 0 || cylinderCount > HFE_MAX_CYLINDERS || sideCount > 2) {
        return undefined;
    }

    const slots = diskSizeSlotsPerTrack(diskSize);
    const sideBytes = slots*MFM_CELLS_PER_BYTE/8;
    const trackLength = sideBytes*2;
    const blocksPerTrack = Math.ceil(sideBytes/SIDE_BLOCK_SIZE);
    // The header is block 0 and the track list is block 1.
    const firstTrackBlock = 2;

    // Everything not written is 0xFF in the header, and 0xAA (blank) in the tracks.
    const binary = new Uint8Array((firstTrackBlock + cylinderCount*blocksPerTrack)*BLOCK_SIZE);
    binary.fill(0xFF, 0, firstTrackBlock*BLOCK_SIZE);
    binary.fill(0xAA, firstTrackBlock*BLOCK_SIZE);

    // The header.
    const {bitRate, rpm} = headerRates(diskSize);
    for (let i = 0; i < HFE_V1_MAGIC.length; i++) {
        binary[i] = HFE_V1_MAGIC.charCodeAt(i);
    }
    binary[8] = 0;
    binary[9] = cylinderCount;
    binary[10] = sideCount;
    // The encoding is MFM even for single-density disks, as on images made by other tools.
    binary[11] = 0;
    binary[12] = lo(bitRate);
    binary[13] = hi(bitRate);
    binary[14] = lo(rpm);
    binary[15] = hi(rpm);
    binary[16] = GENERIC_SHUGART_DD_MODE;
    binary[18] = 1;
    binary[19] = 0;
    binary[20] = writeProtected ? 0x00 : 0xFF;

    // The track list, then the tracks.
    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        const block = firstTrackBlock + cylinder*blocksPerTrack;
        const entry = BLOCK_SIZE + cylinder*4;
        binary[entry] = lo(block);
        binary[entry + 1] = hi(block);
        binary[entry + 2] = lo(trackLength);
        binary[entry + 3] = hi(trackLength);

        for (let side = 0; side < sideCount; side++) {
            const stream = streams.get(new TrackPosition(cylinder, side).key());
            if (stream === undefined) {
                continue;
            }

            fitStreamToTurn(stream, slots);
            stream.truncateToSlots(slots);
            stream.padToSlots(slots);
            const cells = encodeStreamCells(stream);
            for (let i = 0; i < sideBytes; i++) {
                const offset = block*BLOCK_SIZE + Math.floor(i/SIDE_BLOCK_SIZE)*BLOCK_SIZE +
                    side*SIDE_BLOCK_SIZE + i%SIDE_BLOCK_SIZE;
                binary[offset] = cells[i];
            }
        }
    }

    return decodeHfeFloppyDisk(binary, {requireBootTrack: false});
}
