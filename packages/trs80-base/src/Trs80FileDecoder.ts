import {BasicProgram, decodeBasicProgram} from "./Basic.js";
import {Cassette, decodeCassette} from "./Cassette.js";
import {CmdProgram, decodeCmdProgram} from "./CmdProgram.js";
import {RawBinaryFile} from "./RawBinaryFile.js";
import {decodeJv1FloppyDisk, Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {decodeJv3FloppyDisk, Jv3FloppyDisk} from "./Jv3FloppyDisk.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {decodeSystemProgram, SystemProgram} from "./SystemProgram.js";

/**
 * All the possible programs we can decode.
 */
export type Trs80File = BasicProgram |
    Jv1FloppyDisk |
    Jv3FloppyDisk |
    DmkFloppyDisk |
    Cassette |
    SystemProgram |
    CmdProgram |
    RawBinaryFile;

const CLASS_NAME_TO_EXTENSION = {
    BasicProgram: ".BAS",
    Cassette: ".CAS",
    CmdProgram: ".CMD",
    DmkFloppyDisk: ".DMK",
    Jv1FloppyDisk: ".JV1",
    Jv3FloppyDisk: ".JV3",
    RawBinaryFile: ".BIN",
    SystemProgram: ".3BN",
};

/**
 * Get the upper-case extension for the given file.
 */
export function getTrs80FileExtension(trs80File: Trs80File): string {
    return CLASS_NAME_TO_EXTENSION[trs80File.className] ?? ".BIN";
}

/**
 * Get the extension of the filename, including the dot, in upper case, or
 * an empty string if the filename does not contain an extension.
 */
function getFilenameExtension(filename: string): string {
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
function decodeDsk(binary: Uint8Array): Trs80File | undefined {
    // TODO see trs_disk.c:trs_disk_emutype()
    // TODO see DiskDrive.cpp:Dectect_JV1, etc.

    let trs80File: Trs80File | undefined;

    trs80File = decodeDmkFloppyDisk(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeJv1FloppyDisk(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeJv3FloppyDisk(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    return undefined;
}

/**
 * Whether the Trs80File object is one of the floppy disk types.
 */
export function isFloppy(trs80File: Trs80File): trs80File is Jv1FloppyDisk | Jv3FloppyDisk | DmkFloppyDisk {
    const className = trs80File.className;

    return className === "Jv1FloppyDisk" ||
        className === "Jv3FloppyDisk" ||
        className === "DmkFloppyDisk";
}

/**
 * Top-level decoder for any TRS-80 file.
 *
 * @param binary the bytes of the file.
 * @param filename optional filename to help with detection.
 */
export function decodeTrs80File(binary: Uint8Array, filename: string | undefined): Trs80File {
    let trs80File: Trs80File | undefined;
    const extension = filename === undefined ? "" : getFilenameExtension(filename);

    if (extension === ".JV1") {
        return decodeJv1FloppyDisk(binary) ?? new RawBinaryFile(binary);
    }

    if (extension === ".DSK") {
        return decodeDsk(binary) ?? new RawBinaryFile(binary);
    }

    if (extension === ".DMK") {
        return decodeDmkFloppyDisk(binary) ?? new RawBinaryFile(binary);
    }

    // "Model III BiNary" format, invented by George Phillips for trs80gp.
    // Rarely used as a stand-alone file, usually just embedded in .CAS files.
    if (extension === ".3BN") {
        return decodeSystemProgram(binary) ?? new RawBinaryFile(binary);
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

/**
 * Decode a binary that originated on a cassette.
 */
export function decodeTrs80CassetteFile(binary: Uint8Array): Trs80File {
    let trs80File: Trs80File | undefined;

    trs80File = decodeSystemProgram(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeBasicProgram(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    return new RawBinaryFile(binary);
}
