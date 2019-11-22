// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

import { DisplaySamples } from "DisplaySamples";
import { filterSamples } from "AudioUtils";
import { Program } from "Program";

export class Tape {
    originalSamples: DisplaySamples;
    filteredSamples: DisplaySamples;
    programs: Program[];

    /**
     * @param samples original samples from the tape.
     */
    constructor(samples: Float32Array) {
        this.originalSamples = new DisplaySamples(samples);
        this.filteredSamples = new DisplaySamples(filterSamples(samples, 500));
        this.programs = [];
    }

    addProgram(program: Program) {
        this.programs.push(program);
    }
}
