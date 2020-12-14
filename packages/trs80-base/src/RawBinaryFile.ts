import {Trs80File} from "./Trs80File";

/**
 * File when we don't recognize the type.
 */
export class RawBinaryFile implements Trs80File {
    public binary: Uint8Array;
    public error = undefined;

    constructor(binary: Uint8Array) {
        this.binary = binary;
    }

    public getDescription(): string {
        return "Unknown file";
    }
}
