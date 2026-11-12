/**
 * Makes DMK images with tracks past the disk's end, as imagers leave them, for tests of what a trim may
 * drop: re-reads of an earlier cylinder, unformatted tracks, and blank tracks formatted like the disk (or
 * like another cylinder of it, as an earlier format leaves them).
 */

import {makeBlankFloppy} from "./DmkBuilder.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk} from "./DmkFloppyDisk.js";
import type {TrackLayout} from "./TrackLayout.js";

/**
 * The size of a DMK file's header.
 */
const DMK_HEADER_SIZE = 16;

/**
 * One track to add past the end of a test image.
 */
export type TestTailTrack =
    /** The raw track of an earlier cylinder (on the same side), IDs and all, as an imager's re-read gives it. */
    {kind: "reRead", cylinder: number} |
    /** No IDs at all. */
    {kind: "unformatted"} |
    /**
     * Formatted by the layout, holding its filler, with IDs naming the track's own cylinder, or idCylinder
     * if given (which may be past the image's end).
     */
    {kind: "blank", idCylinder?: number};

/**
 * Add cylinders to the end of a DMK image.
 *
 * @param floppy the image, which the new one copies.
 * @param cylinders the tracks of each new cylinder, one per side of the image.
 * @param layout the layout of the "blank" tracks, which should be the image's.
 * @return the longer image.
 */
export function appendDmkTestTracks(floppy: DmkFloppyDisk, cylinders: TestTailTrack[][], layout: TrackLayout): DmkFloppyDisk {
    const geometry = floppy.getGeometry();
    const sideCount = geometry.sideCount;
    const oldCylinders = floppy.binary[1];
    const newCylinders = oldCylinders + cylinders.length;
    const trackLength = floppy.trackLength;
    const trackOffset = (cylinder: number, side: number) => DMK_HEADER_SIZE + (cylinder*sideCount + side)*trackLength;

    const blankCylinders = Math.max(newCylinders,
        ...cylinders.flat().map(track => track.kind === "blank" && track.idCylinder !== undefined ? track.idCylinder + 1 : 0));
    const blank = makeBlankFloppy(layout, blankCylinders, sideCount);
    if (blank === undefined || blank.trackLength !== trackLength) {
        throw new Error("Can't make blank tracks of the image's length");
    }

    const binary = new Uint8Array(DMK_HEADER_SIZE + newCylinders*sideCount*trackLength);
    binary.set(floppy.binary.subarray(0, DMK_HEADER_SIZE + oldCylinders*sideCount*trackLength));
    binary[1] = newCylinders;
    cylinders.forEach((tracks, i) => {
        const cylinder = oldCylinders + i;
        if (tracks.length !== sideCount) {
            throw new Error("Need one track per side");
        }
        tracks.forEach((track, side) => {
            const to = trackOffset(cylinder, side);
            switch (track.kind) {
                case "reRead":
                    binary.copyWithin(to, trackOffset(track.cylinder, side), trackOffset(track.cylinder, side) + trackLength);
                    break;
                case "unformatted":
                    break;
                case "blank": {
                    const from = trackOffset(track.idCylinder ?? cylinder, side);
                    binary.set(blank.binary.subarray(from, from + trackLength), to);
                    break;
                }
            }
        });
    });

    const decoded = decodeDmkFloppyDisk(binary, {requireBootTrack: true});
    if (decoded === undefined) {
        throw new Error("The extended image doesn't decode");
    }
    return decoded;
}
