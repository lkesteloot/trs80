import {BitData} from "./BitData.js";
import {DisplaySamples} from "./DisplaySamples.js";
import {ByteData} from "./ByteData.js";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {BitType} from "./BitType.js";
import {TapeDecoder} from "./TapeDecoder.js";
import {encodeHighSpeed, wrapHighSpeed} from "./HighSpeedTapeEncoder.js";
import {encodeLowSpeed, wrapLowSpeed} from "./LowSpeedTapeEncoder.js";
import {DEFAULT_SAMPLE_RATE, writeWavFile} from "./WavFile.js";
import {ProgramAnnotation, isEdtasmProgram} from "trs80-base";

/**
 * Get the binary wrapped in a CAS.
 */
export function binaryAsCasFile(binary: Uint8Array, baud: number): Uint8Array {
    return baud >= 1500 ? wrapHighSpeed(binary) : wrapLowSpeed(binary);
}

/**
 * Get the audio for a CAS binary (not including the WAV header).
 */
export function casAsAudio(cas: Uint8Array, baud: number, sampleRate: number): Int16Array {
    return baud === 1500
        ? encodeHighSpeed(cas, sampleRate)
        : encodeLowSpeed(cas, sampleRate, baud);
}

/**
 * Represents a program on a tape.
 */
export class Program {
    public trackNumber: number;
    public copyNumber: number;
    public startFrame: number;
    public endFrame: number;
    public decoder: TapeDecoder;
    public readonly baud: number;
    public binary: Uint8Array;
    public bitData: BitData[];
    // Index by byte index in the "binary" array.
    public byteData: ByteData[];
    // Annotation that can be used by specialized reader.
    public annotations: ProgramAnnotation[] | undefined;
    public reconstructedSamples: DisplaySamples | undefined;
    public name: string = "";
    public notes: string = "";
    public screenshot: string = "";
    public readonly onName = new SimpleEventDispatcher<string>();
    public readonly onNotes = new SimpleEventDispatcher<string>();
    public readonly onScreenshot = new SimpleEventDispatcher<string>();

    constructor(trackNumber: number, copyNumber: number, startFrame: number, endFrame: number,
                decoder: TapeDecoder, baud: number, binary: Uint8Array, bitData: BitData[], byteData: ByteData[]) {

        this.trackNumber = trackNumber;
        this.copyNumber = copyNumber;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.decoder = decoder;
        this.baud = baud;
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
        return "Track " + this.trackNumber + ", copy " + this.copyNumber + ", " + this.decoder.getName();
    }

    /**
     * Get a generic short label for the program.
     */
    public getShortLabel(): string {
        return "T" + this.trackNumber + " C" + this.copyNumber;
    }

    /**
     * Returns a filename-like string for this program, without an extension.
     */
    public getPseudoFilename(): string {
        return "T" + this.trackNumber + "-C" + this.copyNumber;
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
     */
    public isEdtasmProgram(): boolean {
        return isEdtasmProgram(this.binary);
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
     * @param baud the baud rate, or undefined to use the original. 1500 is considered high speed,
     * anything below that is considered low speed.
     */
    public asCasFile(baud?: number): Uint8Array {
        if (baud === undefined) {
            baud = this.decoder.isHighSpeed() ? 1500 : 500;
        }
        return binaryAsCasFile(this.binary, baud);
    }

    /**
     * Return just the audio portion of a WAV file for this program.
     *
     * @param baud the output baud rate, or undefined to use the original.
     */
    public asAudio(baud?: number): Int16Array {
        if (baud === undefined) {
            baud = this.decoder.isHighSpeed() ? 1500 : 500;
        }
        return casAsAudio(this.asCasFile(baud), baud, DEFAULT_SAMPLE_RATE);
    }

    /**
     * Return a .wav file version of the binary.
     */
    public asWavFile(): Uint8Array {
        return writeWavFile(this.asAudio(), DEFAULT_SAMPLE_RATE);
    }

    /**
     * Whether this program is strictly nested in the other program, with margin to spare.
     */
    public isNestedIn(candidate: Program, marginFrames: number): boolean {
        // Full nested, but also with margin on at least one side.
        return this.startFrame > candidate.startFrame &&
            this.endFrame < candidate.endFrame &&
            (this.startFrame > candidate.startFrame + marginFrames ||
                this.endFrame < candidate.endFrame - marginFrames);
    }

    /**
     * Return the number of bit errors we've found. This is not super cheap, cache if you need it a lot.
     */
    public countBitErrors(): number {
        let count = 0;

        for (const bitData of this.bitData) {
            if (bitData.bitType === BitType.BAD) {
                count += 1;
            }
        }

        return count;
    }
}
