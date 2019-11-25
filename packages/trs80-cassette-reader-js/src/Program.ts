import {BitData} from "./BitData";

export class Program {
    trackNumber: number;
    copyNumber: number;
    startFrame: number;
    endFrame: number;
    binary: Uint8Array;
    bits: BitData[];

    constructor(trackNumber: number, copyNumber: number, startFrame: number, endFrame: number,
                binary: Uint8Array, bits: BitData[]) {

        this.trackNumber = trackNumber;
        this.copyNumber = copyNumber;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.binary = binary;
        this.bits = bits;
    }

    /**
     * Whether the binary represents a Basic program.
     */
    isProgram(): boolean {
        return this.binary != null &&
            this.binary.length >= 3 &&
            this.binary[0] == 0xD3 &&
            this.binary[1] == 0xD3 &&
            this.binary[2] == 0xD3;
    }
}
