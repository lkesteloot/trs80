import {getImageWriteProtectFlag, withImageWriteProtectFlag} from "trs80-base";
import {DiskError} from "./DiskError.js";
import {DiskSession} from "./DiskSession.js";

// The operations on the disk image as a whole, rather than on the files in it.

/**
 * Get the image's write-protect flag, the one an emulator or a floppy emulator honors, as the tab on a
 * real floppy does.
 *
 * @param session the session.
 * @returns the flag, or a sentence saying why the image's format has none.
 */
export function getWriteProtect(session: DiskSession): boolean | string {
    return getImageWriteProtectFlag(session.image);
}

/**
 * Set the image's write-protect flag, as one change.
 *
 * @param session the session.
 * @param writeProtected the new value of the flag.
 * @returns whether the flag changed: false (and nothing is changed) if it already had that value.
 * @throws DiskError if the image's format has no flag or can't write it.
 */
export function setWriteProtect(session: DiskSession, writeProtected: boolean): boolean {
    const image = session.image;
    const current = getImageWriteProtectFlag(image);
    if (typeof current === "string") {
        throw new DiskError(current);
    }
    if (current === writeProtected) {
        return false;
    }

    const binary = withImageWriteProtectFlag(image, writeProtected);
    if (typeof binary === "string") {
        throw new DiskError(binary);
    }
    session.replaceImageBinary(binary);
    return true;
}
