/**
 * Builds DMK floppy disk images from formatted tracks, such as those made by TrackLayout.ts.
 */

import {hi, lo} from "z80-base";
import {decodeDmkFloppyDisk, DmkFloppyDisk, FILE_HEADER_SIZE, FLAG_SINGLE_SIDED, makeDmkTrackBlob} from "./DmkFloppyDisk.js";
import {FormattedTrack, TrackPosition} from "./FloppyDisk.js";
import {buildFormattedTrack, TrackLayout} from "./TrackLayout.js";

/**
 * The track length that new images use: 0x1900, the default of David Keil's emulator for a 5.25-inch
 * disk of either density. It includes the 128-byte table of ID pointers. Single-density tracks
 * are stored with doubled bytes, which fit. See "Image formats" in FLOPPY_FORMATS.md.
 */
export const DMK_TRACK_LENGTH = 0x1900;

/**
 * Most tracks a DMK file can hold per side.
 */
const MAX_CYLINDERS = 160;

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
    const validCounts = Number.isInteger(cylinderCount) && cylinderCount >= 1 && cylinderCount <= MAX_CYLINDERS &&
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
