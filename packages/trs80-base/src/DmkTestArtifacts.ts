/**
 * Makes DMK images with imaging artifacts, for tests: the ones that ImagingArtifacts.ts recognizes (reads
 * that began late, reads of one revolution, converters' CRC markers), and two that the readers already
 * ignore (garbled IDs decoded from past the index, and sync bytes stored as something other than 0xA1).
 * Each function returns a changed copy and leaves the image it's given alone.
 */

import {decodeDmkFloppyDisk, DmkFloppyDisk, TRACK_HEADER_SIZE} from "./DmkFloppyDisk.js";
import {Density, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {MFM_GAP} from "./TrackBytes.js";

// A pointer in a DMK track's table: the offset bits, and the flag for a double-density ID.
const POINTER_OFFSET_MASK = 0x3FFF;
const POINTER_DOUBLE_DENSITY = 0x8000;

/**
 * The image's track at a position, failing the test if it has none.
 */
function findTrack(floppy: DmkFloppyDisk, trackPosition: TrackPosition): DmkFloppyDisk["tracks"][number] {
    const track = floppy.tracks.find(track => track.trackPosition.equals(trackPosition));
    if (track === undefined) {
        throw new Error("No track " + trackPosition.key());
    }
    return track;
}

/**
 * The sector of the image's track at a physical position, failing the test if there's none.
 */
function findSector(floppy: DmkFloppyDisk, position: SectorPosition): DmkFloppyDisk["tracks"][number]["sectors"][number] {
    const sector = findTrack(floppy, position.trackPosition).sectors
        .find(sector => sector.getSectorNumber() === position.sectorNumber);
    if (sector === undefined) {
        throw new Error("No sector " + position.key());
    }
    return sector;
}

/**
 * Decode a changed image, failing the test if it doesn't.
 */
function redecode(binary: Uint8Array): DmkFloppyDisk {
    const decoded = decodeDmkFloppyDisk(binary, {requireBootTrack: false});
    if (decoded === undefined) {
        throw new Error("The changed image doesn't decode");
    }
    return decoded;
}

/**
 * Read a track's table of ID pointers, up to its first empty entry.
 */
function readPointers(binary: Uint8Array, trackOffset: number): number[] {
    const pointers: number[] = [];
    for (let i = 0; i < TRACK_HEADER_SIZE; i += 2) {
        const pointer = binary[trackOffset + i] | (binary[trackOffset + i + 1] << 8);
        if (pointer === 0) {
            break;
        }
        pointers.push(pointer);
    }
    return pointers;
}

/**
 * Write a track's table of ID pointers, zeroing the rest of it.
 */
function writePointers(binary: Uint8Array, trackOffset: number, pointers: number[]): void {
    binary.fill(0, trackOffset, trackOffset + TRACK_HEADER_SIZE);
    pointers.forEach((pointer, i) => {
        binary[trackOffset + 2*i] = pointer & 0xFF;
        binary[trackOffset + 2*i + 1] = pointer >> 8;
    });
}

/**
 * Make the read of a double-density track begin late, as cw2dmk did before version 4.6.0: the track's
 * bytes move toward its start, the first ones are lost, and the end is filled with 4E. IDs that are lost,
 * or whose sync bytes are, lose their pointers.
 *
 * @param floppy the image.
 * @param trackPosition the track to change.
 * @param shift how many bytes the read began late.
 */
export function startDmkReadLate(floppy: DmkFloppyDisk, trackPosition: TrackPosition, shift: number): DmkFloppyDisk {
    const binary = new Uint8Array(floppy.binary);
    const trackOffset = findTrack(floppy, trackPosition).offset;
    const start = trackOffset + TRACK_HEADER_SIZE;
    const end = trackOffset + floppy.trackLength;
    binary.copyWithin(start, start + shift, end);
    binary.fill(MFM_GAP, end - shift, end);

    // Three sync bytes before each mark.
    const pointers = readPointers(binary, trackOffset)
        .map(pointer => pointer - shift)
        .filter(pointer => (pointer & POINTER_OFFSET_MASK) >= TRACK_HEADER_SIZE + 3);
    writePointers(binary, trackOffset, pointers);
    return redecode(binary);
}

/**
 * Make the read of some tracks stop early, as a read of one revolution does: fill each with 4E from a
 * place to its end.
 *
 * @param floppy the image.
 * @param trackPositions the tracks to change.
 * @param cut where the read stops, in bytes from the start of the track (after the pointer table).
 */
export function cutDmkReads(floppy: DmkFloppyDisk, trackPositions: TrackPosition[], cut: number): DmkFloppyDisk {
    const binary = new Uint8Array(floppy.binary);
    for (const trackPosition of trackPositions) {
        const trackOffset = findTrack(floppy, trackPosition).offset;
        binary.fill(MFM_GAP, trackOffset + TRACK_HEADER_SIZE + cut, trackOffset + floppy.trackLength);
    }
    return redecode(binary);
}

/**
 * Give a sector a converter's CRC marker: change its first data byte, then store the CRC of the data with
 * its low byte inverted.
 *
 * @param floppy the image.
 * @param position the sector's physical position.
 * @param crcMask what to invert in the stored CRC: 0x00FF for the marker, anything else for other bad CRCs.
 */
export function setDmkConverterCrcMarker(floppy: DmkFloppyDisk, position: SectorPosition,
                                         crcMask = 0x00FF): DmkFloppyDisk {

    const sector = findSector(floppy, position);
    const dataIndex = sector.dataIndex;
    if (dataIndex === undefined) {
        throw new Error("No data in sector " + position.key());
    }
    const stride = sector.getByteStride();
    const at = (index: number) => sector.track.offset + sector.offset + index*stride;

    // Garble the data, and find its CRC.
    const garbled = new Uint8Array(floppy.binary);
    for (let i = 0; i < stride; i++) {
        garbled[at(dataIndex) + i] ^= 0x55;
    }
    const computed = findSector(redecode(garbled), position).computeDataCrc();
    if (computed === undefined) {
        throw new Error("No data CRC");
    }

    const written = computed ^ crcMask;
    const crcIndex = dataIndex + sector.getSectorSize();
    for (let i = 0; i < stride; i++) {
        garbled[at(crcIndex) + i] = written >> 8;
        garbled[at(crcIndex + 1) + i] = written & 0xFF;
    }
    return redecode(garbled);
}

/**
 * Add an ID field, with no data field after it, at a place on a track, and a pointer to it at the end
 * of the table, the way an imager records a garbled ID decoded from past the index.
 *
 * @param floppy the image.
 * @param trackPosition the track to change.
 * @param position where the ID address mark goes, in bytes from the start of the track (after the pointer
 * table), counting a doubled single-density byte once.
 * @param idBytes the ID field: the address mark, then the cylinder, side, sector, size code and two CRC bytes.
 * @param density the ID's density.
 */
export function addDmkId(floppy: DmkFloppyDisk, trackPosition: TrackPosition, position: number, idBytes: number[],
                         density: Density): DmkFloppyDisk {

    const binary = new Uint8Array(floppy.binary);
    const trackOffset = findTrack(floppy, trackPosition).offset;
    const doubleDensity = density === Density.DOUBLE;
    const stride = doubleDensity ? 1 : 2;
    const offset = TRACK_HEADER_SIZE + position*stride;
    idBytes.forEach((byte, i) => {
        for (let j = 0; j < stride; j++) {
            binary[trackOffset + offset + i*stride + j] = byte;
        }
    });
    const pointers = readPointers(binary, trackOffset);
    pointers.push(offset | (doubleDensity ? POINTER_DOUBLE_DENSITY : 0));
    writePointers(binary, trackOffset, pointers);
    return redecode(binary);
}

/**
 * Store something other than 0xA1 as the first of the three sync bytes before a double-density sector's ID,
 * as some imagers do.
 *
 * @param floppy the image.
 * @param position the sector's physical position.
 * @param value the byte to store.
 */
export function setDmkSyncByte(floppy: DmkFloppyDisk, position: SectorPosition, value: number): DmkFloppyDisk {
    const sector = findSector(floppy, position);
    const binary = new Uint8Array(floppy.binary);
    binary[sector.track.offset + sector.offset - 3] = value;
    return redecode(binary);
}
