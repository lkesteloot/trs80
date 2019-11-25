// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

import { DisplaySamples } from "DisplaySamples";
import { highPassFilter } from "AudioUtils";
import { Program } from "Program";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder";

export class Tape {
    originalSamples: DisplaySamples;
    filteredSamples: DisplaySamples;
    lowSpeedSamples: DisplaySamples;
    programs: Program[];

    /**
     * @param samples original samples from the tape.
     */
    constructor(samples: Float32Array) {
        this.originalSamples = new DisplaySamples(samples);
        this.filteredSamples = new DisplaySamples(highPassFilter(samples, 500));
        this.lowSpeedSamples = new DisplaySamples(LowSpeedTapeDecoder.filterSamples(this.filteredSamples.samplesList[0]));
        this.programs = [];
    }

    addProgram(program: Program) {
        this.programs.push(program);
    }
}
