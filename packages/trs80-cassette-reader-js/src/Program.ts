
import {BitData} from "./BitData";
import {DisplaySamples} from "./DisplaySamples";
import {ByteData} from "./ByteData";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {isSystemProgram} from "./SystemProgram";
import {WaveformAnnotation} from "./WaveformAnnotation";

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
    // Annotation that can be used by specialized reader.
    public annotations: WaveformAnnotation[] | undefined;
    public reconstructedSamples: DisplaySamples | undefined;
    public name: string = "";
    public notes: string = "";
    public screenshot: string = "";
    public readonly onName = new SimpleEventDispatcher<string>();
    public readonly onNotes = new SimpleEventDispatcher<string>();
    public readonly onScreenshot = new SimpleEventDispatcher<string>();

    constructor(trackNumber: number, copyNumber: number, startFrame: number, endFrame: number,
                decoderName: string, binary: Uint8Array, bitData: BitData[], byteData: ByteData[]) {

        this.trackNumber = trackNumber;
        this.copyNumber = copyNumber;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.decoderName = decoderName;
        this.binary = binary;
        this.bitData = bitData;
        this.byteData = byteData;
    }

    /**
     * Set the high-speed samples reconstructed from the binary.
     */
    public setReconstructedSamples(reconstructedSamples: Int16Array): void {
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
     * Set the name of the program, as set by the user.
     */
    public setName(name: string): void {
        if (name !== this.name) {
            this.name = name;
            this.onName.dispatch(name);
        }
    }

    /**
     * Set the notes for the program, as set by the user.
     */
    public setNotes(notes: string): void {
        if (notes !== this.notes) {
            this.notes = notes;
            this.onNotes.dispatch(notes);
        }
    }

    /**
     * Set the screenshot for the program.
     */
    public setScreenshot(screenshot: string): void {
        if (screenshot !== this.screenshot) {
            this.screenshot = screenshot;
            this.onScreenshot.dispatch(screenshot);
        }
    }

    /**
     * Get a representative timestamp for this program, in seconds.
     */
    public getTimestamp(sampleRate: number): number {
        return (this.startFrame + this.endFrame)/2/sampleRate;
    }

    /**
     * Whether the given timestamp (in seconds) could apply to this program.
     */
    public isForTimestamp(timestamp: number, sampleRate: number): boolean {
        const startTimestamp = this.startFrame/sampleRate;
        const endTimestamp = this.endFrame/sampleRate;

        return startTimestamp <= timestamp && timestamp <= endTimestamp;
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

    /**
     * Whether this is a program that can be loaded with the SYSTEM command.
     *
     * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/
     */
    public isSystemProgram(): boolean {
        return isSystemProgram(this.binary);
    }

    /**
     * Whether these two programs have the same binaries.
     */
    public sameBinaryAs(other: Program): boolean {
        if (this.binary.length !== other.binary.length) {
            return false;
        }

        for (let i = 0; i < this.binary.length; i++) {
            if (this.binary[i] !== other.binary[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Return a .cas file version of the binary.
     *
     * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/
     */
    public asCasFile(): Uint8Array {
        // 256 zero bytes, 0xA5 byte, binary contents, then two zero bytes.
        const cas = new Uint8Array(this.binary.length + 256 + 1 + 2);

        // Don't need to explicitly fill in the zeros.
        cas[256] = 0xA5;
        cas.set(this.binary, 257);

        return cas;
    }
}
