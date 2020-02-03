
// Interface for tape decoders.

import {BitData} from "./BitData";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";

export interface TapeDecoder {
    /**
     * The name of the decoder. An all-lower case string.
     */
    getName(): string;

    /**
     * Handle the sample at "frame".
     */
    handleSample(frame: number): void;

    /**
     * Get the state of the decoder. See the enum for valid state transitions.
     */
    getState(): TapeDecoderState;

    /**
     * Get the bytes of the decoded program. Only called if the state is FINISHED or ERROR.
     */
    getBinary(): Uint8Array;

    /**
     * Get the bit information for the decoded program. Only called if the state is FINISHED or ERROR.
     */
    getBitData(): BitData[];

    /**
     * Get the byte information for the decoded program. Only called if the state is FINISHED or ERROR.
     */
    getByteData(): ByteData[];
}
