
// Interface for tape decoders.

import {BitData} from "./BitData.js";
import {TapeDecoderState} from "./TapeDecoderState.js";
import {ByteData} from "./ByteData.js";
import {Program} from "./Program.js";
import {WaveformAnnotation} from "./Annotations.js";

export interface TapeDecoder {
    /**
     * The name of the decoder.
     */
    getName(): string;

    /**
     * Whether this is a high speed (1500 baud) or low speed (500 baud) decoder.
     */
    isHighSpeed(): boolean;

    /**
     * Find the next program starting at "startFrame".
     *
     * @param startFrame where in the tape to start decoding.
     * @param waveformAnnotations the reader can optionally append to this array of annotations, to be displayed
     * in the waveform for debugging.
     *
     * @return the decoded program (with invalid track/copy numbers), or undefined if no program was found.
     * The caller can call getState() to figure out if decoding finished properly.
     */
    findNextProgram(startFrame: number, waveformAnnotations: WaveformAnnotation[]): Program | undefined;

    /**
     * Get the state of the decoder. See the enum for valid state transitions.
     */
    getState(): TapeDecoderState;

    /**
     * Get the bytes of the decoded program. Only called if the state is FINISHED.
     */
    getBinary(): Uint8Array;

    /**
     * Get the bit information for the decoded program. Only called if the state is FINISHED.
     */
    getBitData(): BitData[];

    /**
     * Get the byte information for the decoded program. Only called if the state is FINISHED.
     */
    getByteData(): ByteData[];

    /**
     * For testing, reads a sequence of bits.
     *
     * @param frame starting frame.
     * @return string of "0" and "1" bits, a list of waveform annotations, and a list of explanations.
     */
    readBits(frame: number): [string, WaveformAnnotation[], string[]];
}
