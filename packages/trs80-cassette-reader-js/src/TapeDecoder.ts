// Interface for tape decoders.

import {TapeDecoderState} from "./TapeDecoderState";
import {Tape} from "./Tape";
import {BitData} from "./BitData";

export interface TapeDecoder {
    /**
     * The name of the decoder. An all-lower case string.
     */
    getName(): string;

    /**
     * Handle the sample at "frame".
     */
    handleSample(tape: Tape, frame: number): void;

    /**
     * Get the state of the decoder. See the enum for valid state transitions.
     */
    getState(): TapeDecoderState;

    /**
     * Get the bytes of the decoded program. Only called if the state is FINISHED or ERROR.
     */
    getProgram(): Uint8Array;

    /**
     * Get the bits for the decoded program. Only called if the state is FINISHED or ERROR.
     */
    getBits(): BitData[];
}
