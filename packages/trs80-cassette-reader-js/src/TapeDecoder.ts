
// Interface for tape decoders.

import {BitData} from "./BitData";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";

export interface TapeDecoder {
    /**
     * The name of the decoder. An all-lower case string.
     */
    getName(): string;

    /**
     * Find the next program starting at "startFrame".
     *
     * @return the decoded program (with invalid track/copy numbers), or undefined if no program was found.
     * The caller can call getState() to figure out if decoding finished properly.
     */
    findNextProgram(startFrame: number): Program | undefined;

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
