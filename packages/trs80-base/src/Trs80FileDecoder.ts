import {BasicProgram, decodeBasicProgram, parseBasicText} from "./Basic.js";
import {Cassette, decodeCassette} from "./Cassette.js";
import {CmdProgram, decodeCmdProgram} from "./CmdProgram.js";
import {RawBinaryFile} from "./RawBinaryFile.js";
import {decodeJv1FloppyDisk, Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {decodeJv3FloppyDisk, Jv3FloppyDisk} from "./Jv3FloppyDisk.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {decodeSystemProgram, SystemProgram} from "./SystemProgram.js";
import {decodeScpFloppyDisk, ScpFloppyDisk} from "./ScpFloppyDisk.js";
import {decodeLevel1Program, Level1Program} from "./Level1Program.js";
import {decodeEdtasmFile, EdtasmFile} from "./EdtasmFile.js";

/**
 * All the possible programs we can decode.
 */
export type Trs80File = BasicProgram |
    Jv1FloppyDisk |
    Jv3FloppyDisk |
    DmkFloppyDisk |
    ScpFloppyDisk |
    Cassette |
    SystemProgram |
    CmdProgram |
    RawBinaryFile |
    Level1Program |
    EdtasmFile;

const CLASS_NAME_TO_EXTENSION = {
    BasicProgram: ".BAS",
    Cassette: ".CAS",
    CmdProgram: ".CMD",
    DmkFloppyDisk: ".DMK",
    ScpFloppyDisk: ".SCP",
    Jv1FloppyDisk: ".JV1",
    Jv3FloppyDisk: ".JV3",
    RawBinaryFile: ".BIN",
    SystemProgram: ".3BN",
    Level1Program: ".L1",
    EdtasmFile: ".ASM",
};

/**
 * Get the upper-case extension for the given file, including the period.
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
        filename = filename.substring(slash + 1);
    }

    // Look for extension.
    const dot = filename.lastIndexOf(".");

    // If the dot is at position 0, then it's just a hidden file, not an extension.
    return dot > 0 ? filename.substring(dot).toUpperCase() : "";
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
export function isFloppy(trs80File: Trs80File): trs80File is Jv1FloppyDisk | Jv3FloppyDisk | DmkFloppyDisk | ScpFloppyDisk {
    const className = trs80File.className;

    return className === "Jv1FloppyDisk" ||
        className === "Jv3FloppyDisk" ||
        className === "DmkFloppyDisk" ||
        className === "ScpFloppyDisk";
}

/**
 * Options for the {@link decodeTrs80File} function.
 */
interface DecodeTrs80FileOptions {
    // Optional filename, to help with the decoding. If missing or empty, the type will be
    // inferred entirely from the contents.
    filename?: string;

    // Whether to disassemble program files and include the disassembly in the annotations.
    disassemble?: boolean;
}

const DECODE_TRS80_FILE_OPTIONS_DEFAULTS: Required<DecodeTrs80FileOptions> = {
    filename: "",
    disassemble: false,
};

/**
 * Top-level decoder for any TRS-80 file.
 *
 * @param binary the bytes of the file.
 * @param options optional object to control decoding.
 */
export function decodeTrs80File(binary: Uint8Array, options?: DecodeTrs80FileOptions): Trs80File {
    const { filename, disassemble } = {
        ... DECODE_TRS80_FILE_OPTIONS_DEFAULTS,
        ... options,
    };
    let trs80File: Trs80File | undefined;
    const extension = getFilenameExtension(filename);

    if (extension === ".JV1") {
        return decodeJv1FloppyDisk(binary) ?? new RawBinaryFile(binary);
    }

    if (extension === ".JV3") {
        return decodeJv3FloppyDisk(binary);
    }

    if (extension === ".DSK") {
        return decodeDsk(binary) ?? new RawBinaryFile(binary);
    }

    if (extension === ".DMK") {
        return decodeDmkFloppyDisk(binary) ?? new RawBinaryFile(binary);
    }

    if (extension === ".SCP") {
        return decodeScpFloppyDisk(binary) ?? new RawBinaryFile(binary);
    }

    // "Model III BiNary" format, invented by George Phillips for trs80gp.
    // Rarely used as a stand-alone file, usually just embedded in .CAS files.
    if (extension === ".3BN") {
        return decodeSystemProgram(binary, disassemble) ?? new RawBinaryFile(binary);
    }

    if (extension === ".CMD") {
        return decodeCmdProgram(binary) ?? new RawBinaryFile(binary);
    }

    // Cassette decoding can be a bit too eager, so be more strict if we don't have the right extension.
    const strictCassetteDecoding = extension !== ".CAS";
    trs80File = decodeCassette(binary, strictCassetteDecoding, disassemble);
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

    trs80File = decodeLevel1Program(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeEdtasmFile(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    const basicBinary = parseBasicText(binary);
    if (basicBinary instanceof Uint8Array) {
        trs80File = decodeBasicProgram(basicBinary);
        if (trs80File !== undefined) {
            return trs80File;
        }
    }

    return new RawBinaryFile(binary);
}

/**
 * Decode a binary that originated on a cassette.
 */
export function decodeTrs80CassetteFile(binary: Uint8Array, disassemble: boolean): Trs80File {
    let trs80File: Trs80File | undefined;

    trs80File = decodeSystemProgram(binary, disassemble);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeBasicProgram(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeLevel1Program(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    trs80File = decodeEdtasmFile(binary);
    if (trs80File !== undefined) {
        return trs80File;
    }

    return new RawBinaryFile(binary);
}
