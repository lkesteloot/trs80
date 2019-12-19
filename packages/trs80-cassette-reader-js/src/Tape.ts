/*
 * Copyright 2019 Lawrence Kesteloot
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

import {highPassFilter} from "./AudioUtils";
import {DisplaySamples} from "./DisplaySamples";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder";
import {Program} from "./Program";

export class Tape {
    public originalSamples: DisplaySamples;
    public filteredSamples: DisplaySamples;
    public lowSpeedSamples: DisplaySamples;
    public programs: Program[];

    /**
     * @param samples original samples from the tape.
     */
    constructor(samples: Float32Array) {
        this.originalSamples = new DisplaySamples(samples);
        this.filteredSamples = new DisplaySamples(highPassFilter(samples, 500));
        this.lowSpeedSamples = new DisplaySamples(LowSpeedTapeDecoder.filterSamples(
            this.filteredSamples.samplesList[0]));
        this.programs = [];
    }

    public addProgram(program: Program) {
        this.programs.push(program);
    }
}
