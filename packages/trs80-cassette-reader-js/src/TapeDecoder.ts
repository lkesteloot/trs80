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

// Interface for tape decoders.

import {BitData} from "./BitData";
import {Tape} from "./Tape";
import {TapeDecoderState} from "./TapeDecoderState";

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
