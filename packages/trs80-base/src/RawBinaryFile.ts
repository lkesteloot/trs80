import {AbstractTrs80File} from "./Trs80File";

/**
 * File when we don't recognize the type.
 */
export class RawBinaryFile extends AbstractTrs80File {
    public readonly className = "RawBinaryFile";

    constructor(binary: Uint8Array) {
        super(binary, undefined, []);
    }

    public getDescription(): string {
        return "Unknown file";
    }
}
