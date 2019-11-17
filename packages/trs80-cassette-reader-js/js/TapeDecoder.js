// Interface for tape decoders.

"use strict";

define(["TapeDecoderState"], function (TapeDecoderState) {
    class TapeDecoder {
        /**
         * The name of the decoder. An all-lower case string.
         * 
         * @returns {string} the name of the decoder.
         */
        getName() {
        }

        /**
         * Handle the sample at "frame".
         * 
         * @param {Tape} tape
         * @param {number} frame
         */
        handleSample(tape, frame) {
        }

        /**
         * Get the state of the decoder. See the enum for valid state transitions.
         * 
         * @returns {TapeDecoderState}
         */
        getState() {
        }

        /**
         * Get the bytes of the decoded program. Only called if the state is FINISHED.
         * 
         * @returns {Uint8Array}
         */
        getProgram() {
        }
    }
});