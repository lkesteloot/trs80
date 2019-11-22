// Interface for tape decoders.

import { TapeDecoderState } from "TapeDecoderState";
import { Tape } from "Tape";

export interface TapeDecoder {
    /**
     * The name of the decoder. An all-lower case string.
     */
    getName: () => string;

    /**
     * Handle the sample at "frame".
     */
    handleSample: (tape: Tape, frame: number) => void;

    /**
     * Get the state of the decoder. See the enum for valid state transitions.
     */
    getState(): () => TapeDecoderState;

    /**
     * Get the bytes of the decoded program. Only called if the state is FINISHED.
     */
    getProgram(): () => Uint8Array;
}
