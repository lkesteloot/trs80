/**
 * Makes smaller copies of floppy disk images by dropping tracks. Each image format rebuilds its own
 * binary (see trimDmkFloppyDisk(), trimJv1FloppyDisk() and trimJv3FloppyDisk()); this picks the right one.
 */

import {trimDmkFloppyDisk} from "./DmkBuilder.js";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {FloppyDisk} from "./FloppyDisk.js";
import {Jv1FloppyDisk, trimJv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {Jv3FloppyDisk, trimJv3FloppyDisk} from "./Jv3FloppyDisk.js";

/**
 * The image formats that {@link trimFloppy} can rebuild, for messages.
 */
export const TRIMMABLE_FLOPPY_FORMATS = "DMK, JV1 and JV3";

/**
 * Whether {@link trimFloppy} can rebuild a floppy's image format.
 */
export function canTrimFloppy(floppy: FloppyDisk): boolean {
    return floppy instanceof DmkFloppyDisk || floppy instanceof Jv1FloppyDisk || floppy instanceof Jv3FloppyDisk;
}

/**
 * Make a copy of a floppy image that keeps only the first cylinders and sides. The kept tracks are
 * copied unchanged, in the same image format. This does not look at the file system, so the caller must
 * know that what it drops is not needed.
 *
 * @param floppy the floppy to copy, which isn't changed.
 * @param cylinderCount the cylinders to keep, from cylinder 0. At least 1.
 * @param sideCount the sides to keep, from side 0: 1 or 2. (JV1 has only one, whatever is asked.)
 * @return the new floppy, or a string saying why it can't be made (the format can't be trimmed, or the
 * result wouldn't have any sectors).
 */
export function trimFloppy(floppy: FloppyDisk, cylinderCount: number, sideCount: number): FloppyDisk | string {
    let trimmed: FloppyDisk | undefined;
    if (floppy instanceof DmkFloppyDisk) {
        trimmed = trimDmkFloppyDisk(floppy, cylinderCount, sideCount);
    } else if (floppy instanceof Jv1FloppyDisk) {
        trimmed = trimJv1FloppyDisk(floppy, cylinderCount);
    } else if (floppy instanceof Jv3FloppyDisk) {
        trimmed = trimJv3FloppyDisk(floppy, cylinderCount, sideCount);
    } else {
        return "Trimming works on " + TRIMMABLE_FLOPPY_FORMATS + " images, not " + floppy.getDescription();
    }

    if (trimmed === undefined) {
        return "The trimmed image would have no sectors";
    }
    return trimmed;
}
