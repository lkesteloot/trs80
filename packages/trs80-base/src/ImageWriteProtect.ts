import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {FloppyDisk} from "./FloppyDisk.js";
import {type HardDisk} from "./HardDisk.js";
import {HDV_WRITE_PROTECT_BIT, HDV_WRITE_PROTECT_OFFSET, HdvHardDisk} from "./HdvHardDisk.js";
import {HFE_WRITE_ALLOWED_OFFSET, HfeFloppyDisk} from "./HfeFloppyDisk.js";
import {ImdFloppyDisk} from "./ImdFloppyDisk.js";
import {Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {JV3_WRITE_PROTECT_OFFSET, Jv3FloppyDisk} from "./Jv3FloppyDisk.js";

/**
 * Where an image keeps its write-protect flag: the byte, and what to store there for each state.
 */
interface WriteProtectFlag {
    /** The offset of the byte in the image file. */
    offset: number;
    /** The bits of the byte that hold the flag. */
    mask: number;
    /** The value of those bits when the image is write-protected. */
    protectedValue: number;
    /** The value of those bits when it's writable. */
    writableValue: number;
}

/**
 * Find where the image keeps its write-protect flag.
 *
 * @return the flag, or a sentence saying why the image has none.
 */
function findWriteProtectFlag(image: FloppyDisk | HardDisk): WriteProtectFlag | string {
    if (image instanceof DmkFloppyDisk) {
        return {offset: 0, mask: 0xFF, protectedValue: 0xFF, writableValue: 0x00};
    }
    if (image instanceof Jv3FloppyDisk) {
        return {offset: JV3_WRITE_PROTECT_OFFSET, mask: 0xFF, protectedValue: 0x00, writableValue: 0xFF};
    }
    if (image instanceof HfeFloppyDisk) {
        return {offset: HFE_WRITE_ALLOWED_OFFSET, mask: 0xFF, protectedValue: 0x00, writableValue: 0xFF};
    }
    if (image instanceof HdvHardDisk) {
        return {offset: HDV_WRITE_PROTECT_OFFSET, mask: HDV_WRITE_PROTECT_BIT,
            protectedValue: HDV_WRITE_PROTECT_BIT, writableValue: 0x00};
    }
    if (image instanceof Jv1FloppyDisk) {
        return "JV1 images have no write-protect flag: the format is only the sectors, with no header to keep one in.";
    }
    if (image instanceof ImdFloppyDisk) {
        return "IMD images have no write-protect flag: the format doesn't define one.";
    }
    return `${image.className.replace(/(FloppyDisk|HardDisk)$/, "").toUpperCase()} images can't be written, ` +
        "so their write-protect flag can't be changed.";
}

/**
 * Whether the image file says it's write-protected, read from its bytes (and not from the decoded disk, whose
 * write protection may have been lifted in memory for a forced write).
 *
 * @return the flag's state, or a sentence saying why the image has no flag.
 */
export function getImageWriteProtectFlag(image: FloppyDisk | HardDisk): boolean | string {
    const flag = findWriteProtectFlag(image);
    if (typeof flag === "string") {
        return flag;
    }
    const value = image.binary[flag.offset] ?? 0;
    return (value & flag.mask) === flag.protectedValue;
}

/**
 * Make a copy of the image file with its write-protect flag set or cleared. Nothing else changes. For
 * formats whose decoder accepts other values in the flag byte (a JV3 byte that is neither 0x00 nor 0xFF),
 * the byte is replaced by the standard value.
 *
 * @param image the image to copy.
 * @param writeProtected whether the copy should be write-protected.
 * @return the copy's bytes, or a sentence saying why the image has no flag to set.
 */
export function withImageWriteProtectFlag(image: FloppyDisk | HardDisk, writeProtected: boolean): Uint8Array | string {
    const flag = findWriteProtectFlag(image);
    if (typeof flag === "string") {
        return flag;
    }
    const binary = new Uint8Array(image.binary);
    const value = writeProtected ? flag.protectedValue : flag.writableValue;
    binary[flag.offset] = ((binary[flag.offset] ?? 0) & ~flag.mask) | value;
    return binary;
}
