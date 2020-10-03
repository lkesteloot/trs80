
// Interface for tape decoders.

import {BitData} from "./BitData";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {WaveformAnnotation} from "./WaveformAnnotation";

export interface TapeDecoder {
    /**
     * The name of the decoder. An all-lower case string.
     */
    getName(): string;

    /**
     * Find the next program starting at "startFrame".
     *
     * @param startFrame where in the tape to start decoding.
     * @param annotations the reader can optionally append this this array of annotations, to be displayed
     * in the waveform for debugging.
     *
     * @return the decoded program (with invalid track/copy numbers), or undefined if no program was found.
     * The caller can call getState() to figure out if decoding finished properly.
     */
    findNextProgram(startFrame: number, annotations: WaveformAnnotation[]): Program | undefined;

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
}
