import {decodeCassette} from "./Cassette";
import {decodeCmdProgram} from "./CmdProgram";
import {RawBinaryFile} from "./RawBinaryFile";

/**
 * Interface for the decoded TRS-80 files.
 */
export interface Trs80File {
    /**
     * The binary representing just this one file.
     */
    binary: Uint8Array;

    /**
     * Error encountered while decoding, if any.
     */
    error: string | undefined;

    /**
     * Brief description (e.g., "Basic program").
     */
    getDescription(): string;
}

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

    return new RawBinaryFile(binary);
}
