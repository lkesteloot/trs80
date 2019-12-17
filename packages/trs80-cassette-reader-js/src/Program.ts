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

import {BitData} from "./BitData";

export class Program {
    trackNumber: number;
    copyNumber: number;
    startFrame: number;
    endFrame: number;
    decoderName: string;
    binary: Uint8Array;
    bits: BitData[];

    constructor(trackNumber: number, copyNumber: number, startFrame: number, endFrame: number,
                decoderName: string, binary: Uint8Array, bits: BitData[]) {

        this.trackNumber = trackNumber;
        this.copyNumber = copyNumber;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.decoderName = decoderName;
        this.binary = binary;
        this.bits = bits;
    }

    /**
     * Whether the binary represents a Basic program.
     */
    isBasicProgram(): boolean {
        return this.binary != null &&
            this.binary.length >= 3 &&
            this.binary[0] == 0xD3 &&
            this.binary[1] == 0xD3 &&
            this.binary[2] == 0xD3;
    }
}
