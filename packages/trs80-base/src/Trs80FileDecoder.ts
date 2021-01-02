import {decodeBasicProgram} from "./Basic";
import {decodeCassette} from "./Cassette";
import {decodeCmdProgram} from "./CmdProgram";
import {RawBinaryFile} from "./RawBinaryFile";
import {Trs80File} from "./Trs80File";
import {decodeJv1FloppyDisk} from "./Jv1FloppyDisk";

/**
 * Get the extension of the filename, including the dot, in upper case, or
 * an empty string if the filename does not contain an extension.
 */
function getExtension(filename: string): string {
    // Strip pathname, in case the filename has no dot but a path component does.
    // Not sure if we need to support backslash here.
    const slash = filename.lastIndexOf("/");
    if (slash >= 0) {
        filename = filename.substr(slash + 1);
    }

    // Look for extension.
    const dot = filename.lastIndexOf(".");

    // If the dot is at position 0, then it's just a hidden file, not an extension.
    return dot > 0 ? filename.substr(dot).toUpperCase() : "";
}

/**
 * Decode a file that's known to be a floppy disk, but not what kind specifically.
 */
function decodeDsk(binary: Uint8Array): Trs80File {
    // TODO see trs_disk.c:trs_disk_emutype()

    return decodeJv1FloppyDisk(binary);
}

/**
 * Top-level decoder for any TRS-80 file.
 *
 * @param binary the bytes of the file.
 * @param filename optional filename to help with detection.
 */
export function decodeTrs80File(binary: Uint8Array, filename: string | undefined): Trs80File {
    let trs80File: Trs80File | undefined;
    const extension = filename === undefined ? "" : getExtension(filename);

    if (extension === ".JV1") {
        return decodeJv1FloppyDisk(binary);
    }

    if (extension === ".DSK") {
        return decodeDsk(binary);
    }

    trs80File = decodeCassette(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeCmdProgram(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeBasicProgram(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    return new RawBinaryFile(binary);
}
