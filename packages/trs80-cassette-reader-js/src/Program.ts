
import {BitData} from "./BitData";
import {DisplaySamples} from "./DisplaySamples";
import {ByteData} from "./ByteData";

export class Program {
    public trackNumber: number;
    public copyNumber: number;
    public startFrame: number;
    public endFrame: number;
    public decoderName: string;
    public binary: Uint8Array;
    public bitData: BitData[];
    // Index by byte index in the "binary" array.
    public byteData: ByteData[];
    public reconstructedSamples: DisplaySamples;

    constructor(trackNumber: number, copyNumber: number, startFrame: number, endFrame: number,
                decoderName: string, binary: Uint8Array, bitData: BitData[], byteData: ByteData[],
                reconstructedSamples: Int16Array) {

        this.trackNumber = trackNumber;
        this.copyNumber = copyNumber;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.decoderName = decoderName;
        this.binary = binary;
        this.bitData = bitData;
        this.byteData = byteData;
        this.reconstructedSamples = new DisplaySamples(reconstructedSamples);
    }

    /**
     * Get a generic label for the program.
     */
    public getLabel(): string {
        return "Track " + this.trackNumber + ", copy " + this.copyNumber + ", " + this.decoderName;
    }

    /**
     * Get a generic short label for the program.
     */
    public getShortLabel(): string {
        return "T" + this.trackNumber + " C" + this.copyNumber;
    }

    /**
     * Whether this program is really too short to be a real recording.
     */
    public isTooShort(sampleRate: number): boolean {
        return this.endFrame - this.startFrame < sampleRate/10;
    }

    /**
     * Whether the binary represents a Basic program.
     */
    public isBasicProgram(): boolean {
        return this.binary != null &&
            this.binary.length >= 3 &&
            this.binary[0] === 0xD3 &&
            this.binary[1] === 0xD3 &&
            this.binary[2] === 0xD3;
    }

    /**
     * Whether the binary represents an EDTASM program.
     *
     * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/edtasm-file-format/
     */
    public isEdtasmProgram(): boolean {
        function isValidProgramNameChar(n: number) {
            return (n >= 0x41 && n <= 0x5A) || n === 0x20;
        }
        function isValidLineNumberChar(n: number) {
            return n >= 0xB0 && n <= 0xB9;
        }
        return this.binary != null &&
            this.binary.length >= 13 &&
            this.binary[0] === 0xD3 &&
            isValidProgramNameChar(this.binary[1]) &&
            isValidProgramNameChar(this.binary[2]) &&
            isValidProgramNameChar(this.binary[3]) &&
            isValidProgramNameChar(this.binary[4]) &&
            isValidProgramNameChar(this.binary[5]) &&
            isValidProgramNameChar(this.binary[6]) &&
            isValidLineNumberChar(this.binary[7]) &&
            isValidLineNumberChar(this.binary[8]) &&
            isValidLineNumberChar(this.binary[9]) &&
            isValidLineNumberChar(this.binary[10]) &&
            isValidLineNumberChar(this.binary[11]) &&
            this.binary[12] === 0x20;
    }
}
