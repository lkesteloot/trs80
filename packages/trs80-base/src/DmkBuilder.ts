/**
 * Builds DMK floppy disk images from formatted tracks, such as those made by TrackLayout.ts.
 */

import {hi, lo} from "z80-base";
import {decodeDmkFloppyDisk, DMK_MAX_CYLINDERS, DmkFloppyDisk, FILE_HEADER_SIZE, FLAG_SINGLE_SIDED, makeDmkTrackBlob} from "./DmkFloppyDisk.js";
import {FormattedTrack, TrackPosition} from "./FloppyDisk.js";
import {buildFormattedTrack, TrackLayout} from "./TrackLayout.js";

/**
 * The track length that new images use: 0x1900, the default of David Keil's emulator for a 5.25-inch
 * disk of either density. It includes the 128-byte table of ID pointers. Single-density tracks
 * are stored with doubled bytes, which fit. See "Image formats" in FLOPPY_FORMATS.md.
 */
export const DMK_TRACK_LENGTH = 0x1900;

/**
 * Build a DMK image from formatted tracks, and decode it.
 *
 * @param tracks the tracks to store, in any order. A cylinder and side with no track is stored
 * unformatted, with no ID fields.
 * @param cylinderCount cylinders in the image.
 * @param sideCount sides in the image, 1 or 2. One side sets the header's single-sided flag.
 * @return the image, writable and not write-protected, or undefined if the arguments are out
 * of range, a track is outside the image or won't fit in a DMK track, or the result has no
 * sectors at all.
 */
export function makeDmkImage(tracks: FormattedTrack[], cylinderCount: number, sideCount: number): DmkFloppyDisk | undefined {
    const validCounts = Number.isInteger(cylinderCount) && cylinderCount >= 1 && cylinderCount <= DMK_MAX_CYLINDERS &&
        (sideCount === 1 || sideCount === 2);
    if (!validCounts) {
        return undefined;
    }

    const binary = new Uint8Array(FILE_HEADER_SIZE + cylinderCount*sideCount*DMK_TRACK_LENGTH);
    binary[0] = 0x00; // Not write-protected.
    binary[1] = cylinderCount;
    binary[2] = lo(DMK_TRACK_LENGTH);
    binary[3] = hi(DMK_TRACK_LENGTH);
    binary[4] = sideCount === 1 ? FLAG_SINGLE_SIDED : 0;

    // Lay the tracks out in the file in DMK's order.
    const tracksByKey = new Map<string,FormattedTrack>();
    for (const track of tracks) {
        const position = track.trackPosition;
        const inImage = position.cylinderNumber < cylinderCount && position.side < sideCount;
        if (!inImage) {
            return undefined;
        }
        tracksByKey.set(position.key(), track);
    }
    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        for (let side = 0; side < sideCount; side++) {
            const offset = FILE_HEADER_SIZE + (cylinder*sideCount + side)*DMK_TRACK_LENGTH;
            const track = tracksByKey.get(new TrackPosition(cylinder, side).key());
            if (track === undefined) {
                // Unformatted: a zero pointer table and zero bytes, which is what the array already has.
                continue;
            }

            const {trackBytes, pointerCount} = makeDmkTrackBlob(track, DMK_TRACK_LENGTH, false);
            if (pointerCount < track.idamIndices.length) {
                // Some of the track doesn't fit, or there are too many sectors for the table.
                return undefined;
            }
            binary.set(trackBytes, offset);
        }
    }

    return decodeDmkFloppyDisk(binary, {requireBootTrack: false});
}

/**
 * Where makeBlankFloppy() gets each track's layout.
 */
export interface BlankFloppyOptions {
    /**
     * The layout for cylinder 0, if it differs from the rest of the disk. Model I LDOS system
     * disks, for example, are single density on cylinder 0 and double density elsewhere.
     */
    cylinder0Layout?: TrackLayout | undefined;
}

/**
 * Make a blank DMK disk with every track formatted the way a DOS's FORMAT would, with filler in
 * every sector. There's no file system on it.
 *
 * @param layout the layout of every track (but see options).
 * @param cylinderCount cylinders on the disk.
 * @param sideCount sides on the disk, 1 or 2.
 * @param options optional per-cylinder differences.
 * @return the disk, or undefined if a layout doesn't fit on a track or the counts are out of range.
 */
export function makeBlankFloppy(layout: TrackLayout, cylinderCount: number, sideCount: number,
                                options: BlankFloppyOptions = {}): DmkFloppyDisk | undefined {

    const tracks: FormattedTrack[] = [];
    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        const trackLayout = cylinder === 0 ? options.cylinder0Layout ?? layout : layout;
        for (let side = 0; side < sideCount; side++) {
            const track = buildFormattedTrack(trackLayout, new TrackPosition(cylinder, side), sideCount);
            if (track === undefined) {
                return undefined;
            }
            tracks.push(track);
        }
    }

    return makeDmkImage(tracks, cylinderCount, sideCount);
}

/**
 * Make a copy of a DMK image that keeps only some of its tracks, such as the first 40 cylinders of an
 * 80-cylinder image, or only the front side. The kept tracks are copied byte for byte, so their
 * contents and the track length are the same; only the header changes, with the new cylinder count
 * and the single-sided flag if only one side is left. Nothing here knows about file systems, so the
 * caller decides what's safe to drop.
 *
 * @param disk the image to copy. It isn't changed.
 * @param cylinderCount the cylinders to keep, from cylinder 0.
 * @param sideCount the sides to keep, from side 0: 1 or 2. Asking for more than the image has keeps
 * what it has.
 * @return the new image, writable as the original was (a write-protect byte is copied), or undefined
 * if the arguments are out of range, or none of the kept tracks is in the file, or the result doesn't
 * decode.
 */
export function trimDmkFloppyDisk(disk: DmkFloppyDisk, cylinderCount: number, sideCount: number): DmkFloppyDisk | undefined {
    const validCounts = Number.isInteger(cylinderCount) && cylinderCount >= 1 &&
        (sideCount === 1 || sideCount === 2);
    if (!validCounts) {
        return undefined;
    }

    // Where each track that the file has starts, by cylinder and side.
    const trackOffsets = new Map<string,number>();
    for (const track of disk.tracks) {
        trackOffsets.set(track.trackPosition.key(), track.offset);
    }

    // The new layout, in DMK's order: all sides of cylinder 0, then of cylinder 1, and so on.
    const oldSideCount = (disk.flags & FLAG_SINGLE_SIDED) !== 0 ? 1 : 2;
    const newSideCount = Math.min(oldSideCount, sideCount);
    const newCylinderCount = Math.min(disk.trackCount, cylinderCount);
    const sourceOffsets: (number | undefined)[] = [];
    for (let cylinder = 0; cylinder < newCylinderCount; cylinder++) {
        for (let side = 0; side < newSideCount; side++) {
            sourceOffsets.push(trackOffsets.get(new TrackPosition(cylinder, side).key()));
        }
    }

    // Leave off the tracks at the end that the original didn't have, as some writers do. A missing
    // track before the last one present stays as an unformatted one, so that the others keep their places.
    let slotCount = sourceOffsets.length;
    while (slotCount > 0 && sourceOffsets[slotCount - 1] === undefined) {
        slotCount--;
    }
    if (slotCount === 0) {
        return undefined;
    }

    const trackLength = disk.trackLength;
    const binary = new Uint8Array(FILE_HEADER_SIZE + slotCount*trackLength);
    binary.set(disk.binary.subarray(0, FILE_HEADER_SIZE));
    binary[1] = newCylinderCount;
    if (newSideCount === 1) {
        binary[4] |= FLAG_SINGLE_SIDED;
    }
    for (let i = 0; i < slotCount; i++) {
        const sourceOffset = sourceOffsets[i];
        if (sourceOffset !== undefined) {
            binary.set(disk.binary.subarray(sourceOffset, sourceOffset + trackLength), FILE_HEADER_SIZE + i*trackLength);
        }
    }

    return decodeDmkFloppyDisk(binary, {requireBootTrack: false});
}
