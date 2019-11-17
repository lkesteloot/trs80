// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

"use strict";

define(["DisplaySamples", "AudioUtils", "Program"], function (DisplaySamples, AudioUtils, Program) {
    /**
     * @param {Float32Array} samples original samples from the tape.
     */
    class Tape {
        constructor(samples) {
            this.originalSamples = new DisplaySamples(samples);
            this.filteredSamples = new DisplaySamples(AudioUtils.filterSamples(samples, 500));
            this.programs = [];
        }

        /**
         * 
         * @param {Program} program 
         */
        addProgram(program) {
            this.programs.push(program);
        }
    }

    return Tape;
});