import {decodeBasicProgram} from "./Basic";
import {decodeCassette} from "./Cassette";
import {decodeCmdProgram} from "./CmdProgram";
import {RawBinaryFile} from "./RawBinaryFile";
import {Trs80File} from "./Trs80File";

/**
 * Top-level decoder for any TRS-80 file.
 */
export function decodeTrs80File(binary: Uint8Array): Trs80File {
    let trs80File: Trs80File | undefined;

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
