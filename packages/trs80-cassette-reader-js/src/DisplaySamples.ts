
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

export class DisplaySamples {
    samplesList: Float32Array[];

    constructor(samples: Float32Array) {
        this.samplesList = [samples];
        this.filterDown();
    }

    filterDown() {
        // Sample down for quick display.
        while (this.samplesList[this.samplesList.length - 1].length > 1) {
            const samples = this.samplesList[this.samplesList.length - 1];
            const half = Math.ceil(samples.length / 2);
            const down = new Float32Array(half);
            for (let i = 0; i < half; i++) {
                const j = i * 2;
                down[i] = j == samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
            }
            this.samplesList.push(down);
        }
    }
}
