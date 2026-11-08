/**
 * Conversion to and from DMK for the converter: turning a DMK track into a {@link TrackStream}, and
 * building a whole DMK image from streams. A DMK source that is written as DMK doesn't come through here;
 * its file is copied. See "Writing the image formats" in FLOPPY_FORMATS.md.
 */

import {hi, lo} from "z80-base";
import {DiskSize} from "./FloppyConvertModel.js";
import {decodeDmkFloppyDisk, DMK_MAX_CYLINDERS, DmkFloppyDisk, FILE_HEADER_SIZE, FLAG_SINGLE_SIDED} from "./DmkFloppyDisk.js";
import {Density, TrackPosition} from "./FloppyDisk.js";
import {ID_ADDRESS_MARK, MFM_SYNC, MFM_SYNC_COUNT} from "./TrackBytes.js";
import {gapByte, slotsPerByte, TrackStream} from "./TrackStream.js";

/**
 * The size of the table of pointers to ID address marks at the start of each track.
 */
const TRACK_HEADER_SIZE = 128;

/**
 * Most pointers a track's table can hold.
 */
const MAX_POINTERS = TRACK_HEADER_SIZE/2;

/**
 * The bit of a pointer that says its ID field is double density.
 */
const POINTER_DOUBLE_DENSITY = 0x8000;

/**
 * The longest track a DMK can have, which is all that the pointers' 14-bit offsets reach.
 */
const DMK_MAX_TRACK_LENGTH = 0x4000;

/**
 * The DMK track length for a disk size: 0x1900 for 5.25 inch (6,272 bytes after the table, a little
 * more than one turn), and 0x2940 for 8 inch, which is the largest that David Keil's description allows.
 */
export function dmkTrackLength(diskSize: DiskSize): number {
    return diskSize === DiskSize.FIVE_INCH ? 0x1900 : 0x2940;
}

/**
 * Where a sector's fields are in a DMK track, in bytes from the start of the track (the table
 * included).
 */
interface SectorRegion {
    /** Offset of the ID address mark. */
    idamOffset: number;
    /** Offset just after the sector's last field. */
    endOffset: number;
    /** Offset of the data address mark, if there is a data field. */
    damOffset: number | undefined;
    density: Density;
    /** The distance between consecutive bytes. */
    stride: number;
}

/**
 * Make the stream for a DMK track by walking its bytes at the right stride for the density of each
 * sector, so a track with both densities keeps its timing. Each sector owns the bytes from the end
 * of the previous one's fields (so the gap before a sector is in the sector's density), and the last
 * one owns the rest of the track. The bytes that make up the address marks get their special clock
 * flags, which DMK doesn't store: the three sync bytes before a double-density mark are forced to
 * 0xA1, because some imagers store something else there.
 *
 * @param disk the DMK image.
 * @param trackPosition which track.
 * @return the stream, or undefined if the track has no sectors.
 */
export function dmkTrackToStream(disk: DmkFloppyDisk, trackPosition: TrackPosition): TrackStream | undefined {
    const dmkTrack = disk.tracks.find(track => track.trackPosition.equals(trackPosition));
    if (dmkTrack === undefined) {
        return undefined;
    }

    // The sectors in the order they are on the track. A pointer that doesn't leave room for a
    // sync and an ID field in the track is junk. A sector that starts inside the previous one's fields
    // (copy protection writes IDs inside data fields) has no region of its own, but its marks still
    // get their special clock bits, so that a controller finds it.
    const binary = disk.binary;
    const regions: SectorRegion[] = [];
    const singleSpecials = new Set<number>();
    const doubleSpecials = new Set<number>();
    const sorted = [... dmkTrack.sectors].sort((a, b) => a.offset - b.offset);
    for (const sector of sorted) {
        const stride = sector.getByteStride();
        const doubleDensity = sector.density === Density.DOUBLE;
        const firstPossible = TRACK_HEADER_SIZE + (doubleDensity ? MFM_SYNC_COUNT : 0);
        if (sector.offset < firstPossible) {
            continue;
        }

        // Imagers leave pointers to bytes that aren't ID address marks, or to a 0xFE inside a data field.
        // Those are not sectors on the track, and giving them marks would change the data they're in.
        // A real ID field has a good CRC, or in double density at least two sync bytes before it.
        const binaryOffset = dmkTrack.offset + sector.offset;
        const syncBefore = doubleDensity && binary[binaryOffset - 1] === MFM_SYNC && binary[binaryOffset - 2] === MFM_SYNC;
        const plausible = binary[binaryOffset] === ID_ADDRESS_MARK && (sector.hasValidIdCrc() || syncBefore);
        if (!plausible) {
            continue;
        }

        let endOffset: number;
        let damOffset: number | undefined = undefined;
        if (sector.dataIndex !== undefined) {
            damOffset = sector.offset + (sector.dataIndex - 1)*stride;
            endOffset = sector.offset + (sector.dataIndex + sector.getSectorSize() + 2)*stride;
        } else {
            endOffset = sector.offset + 7*stride;
        }

        // The bytes with special clock bits: the three sync bytes before each double-density mark, or the
        // single-density mark itself.
        for (const mark of damOffset === undefined ? [sector.offset] : [sector.offset, damOffset]) {
            if (doubleDensity) {
                for (let j = 1; j <= MFM_SYNC_COUNT; j++) {
                    doubleSpecials.add(mark - j*stride);
                }
            } else {
                singleSpecials.add(mark);
            }
        }

        const previousEnd = regions.length > 0 ? regions[regions.length - 1].endOffset : 0;
        if (sector.offset >= previousEnd) {
            regions.push({idamOffset: sector.offset, endOffset, damOffset, density: sector.density, stride});
        }
    }
    if (regions.length === 0) {
        return undefined;
    }

    const trackEnd = disk.trackLength;
    const stream = new TrackStream();
    let boundary = TRACK_HEADER_SIZE;
    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const doubleDensity = region.density === Density.DOUBLE;
        const specials = doubleDensity ? doubleSpecials : singleSpecials;

        // Start no earlier than the end of the previous region, so that the ID address mark is on this
        // region's grid of bytes. Stop where the next region starts, which is just after this one's fields,
        // lined up the same way, or at the end of the track.
        const start = boundary + (region.idamOffset - boundary) % region.stride;
        let stop = trackEnd;
        if (i + 1 < regions.length) {
            const next = regions[i + 1];
            stop = region.endOffset + (next.idamOffset - region.endOffset) % next.stride;
        }
        for (let offset = start; offset + region.stride <= stop; offset += region.stride) {
            const special = specials.has(offset);
            // The sync bytes are always 0xA1, whatever the imager stored.
            stream.push(special && doubleDensity ? MFM_SYNC : binary[dmkTrack.offset + offset], region.density, special);
        }
        boundary = stop;
    }

    return stream;
}

/**
 * Lay out a stream as a DMK track: the table of pointers to ID address marks, then the bytes (each
 * single-density byte twice), then gap bytes to the end of the track.
 *
 * @param stream the track's bytes.
 * @param trackLength the DMK track length, which includes the table.
 * @return the track, and how many of the stream's ID address marks didn't get a pointer because their
 * ID field doesn't fit in the track or the table is full.
 */
export function makeDmkTrackFromStream(stream: TrackStream, trackLength: number): {blob: Uint8Array, droppedIds: number} {
    const blob = new Uint8Array(trackLength);

    // Where each byte goes, in bytes from the start of the track.
    const offsets: number[] = [];
    let offset = TRACK_HEADER_SIZE;
    for (let i = 0; i < stream.values.length; i++) {
        offsets.push(offset);
        const stride = slotsPerByte(stream.densities[i]);
        for (let j = 0; j < stride && offset + j < trackLength; j++) {
            blob[offset + j] = stream.values[i];
        }
        offset += stride;
    }

    // Gap bytes up to the end of the track.
    const lastDensity = stream.densities.length > 0 ? stream.densities[stream.densities.length - 1] : Density.DOUBLE;
    for (let i = Math.min(offset, trackLength); i < trackLength; i++) {
        blob[i] = gapByte(lastDensity);
    }

    // The pointers. The ID field is the mark and six more bytes.
    let pointerCount = 0;
    let droppedIds = 0;
    for (const mark of stream.findIdMarks()) {
        const stride = slotsPerByte(mark.density);
        const idOffset = offsets[mark.index];
        if (pointerCount === MAX_POINTERS || idOffset + 7*stride > trackLength) {
            droppedIds++;
            continue;
        }
        const pointer = idOffset | (mark.density === Density.DOUBLE ? POINTER_DOUBLE_DENSITY : 0);
        blob[pointerCount*2] = lo(pointer);
        blob[pointerCount*2 + 1] = hi(pointer);
        pointerCount++;
    }

    return {blob, droppedIds};
}

/**
 * Build a DMK image from the streams of its tracks and decode it.
 *
 * @param streams the stream of each track that has one, by the key of its position.
 * @param diskSize decides the track length, which is longer if a stream needs it.
 * @param writeProtected whether to set the header's write-protect byte.
 * @return the image, or undefined if there are no tracks, the cylinders are too many for a DMK, or the
 * result doesn't decode.
 */
export function buildDmkImage(streams: Map<string,TrackStream>, diskSize: DiskSize,
                              writeProtected: boolean): DmkFloppyDisk | undefined {

    // The size of the image comes from the tracks that have streams.
    let cylinderCount = 0;
    let sideCount = 1;
    for (const key of streams.keys()) {
        const [cylinder, side] = key.split(":").map(Number);
        cylinderCount = Math.max(cylinderCount, cylinder + 1);
        sideCount = Math.max(sideCount, side + 1);
    }
    if (cylinderCount === 0 || cylinderCount > DMK_MAX_CYLINDERS || sideCount > 2) {
        return undefined;
    }

    // The usual length, or longer if a track is: a track from an HFE can have a sector that crosses the index.
    let trackLength = dmkTrackLength(diskSize);
    for (const stream of streams.values()) {
        trackLength = Math.max(trackLength, TRACK_HEADER_SIZE + stream.slotCount);
    }
    trackLength = Math.min(Math.ceil(trackLength/16)*16, DMK_MAX_TRACK_LENGTH);
    const binary = new Uint8Array(FILE_HEADER_SIZE + cylinderCount*sideCount*trackLength);
    binary[0] = writeProtected ? 0xFF : 0x00;
    binary[1] = cylinderCount;
    binary[2] = lo(trackLength);
    binary[3] = hi(trackLength);
    binary[4] = sideCount === 1 ? FLAG_SINGLE_SIDED : 0;

    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        for (let side = 0; side < sideCount; side++) {
            const stream = streams.get(new TrackPosition(cylinder, side).key());
            if (stream !== undefined) {
                const {blob} = makeDmkTrackFromStream(stream, trackLength);
                binary.set(blob, FILE_HEADER_SIZE + (cylinder*sideCount + side)*trackLength);
            }
        }
    }

    return decodeDmkFloppyDisk(binary, {requireBootTrack: false});
}
