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

import {frameToTimestamp} from "AudioUtils";
import {TapeDecoderState} from "TapeDecoderState";
import {Tape} from "Tape";
import {TapeDecoder} from "./TapeDecoder";
import {BitData} from "./BitData";
import {BitType} from "./BitType";

// What distance away from 0 counts as "positive" (or, when negative, "negative").
const THRESHOLD = 500/32768.0;

// If we go this many frames without any crossing, then we can assume we're done.
const MIN_SILENCE_FRAMES = 1000;

/**
 * Decodes high-speed (1500 baud) cassettes.
 */
export class HighSpeedTapeDecoder implements TapeDecoder {
    state: TapeDecoderState = TapeDecoderState.UNDECIDED;
    programBytes: number[] = [];
    oldSign: number = 0;
    cycleSize: number = 0;
    recentBits: number = 0;
    bitCount: number = 0;
    lastCrossingFrame: number = 0;
    bits: BitData[] = [];

    // For TapeDecoder interface:
    getName(): string {
        return "high speed";
    }

    handleSample(tape: Tape, frame: number) {
        const samples = tape.lowSpeedSamples.samplesList[0];
        const sample = samples[frame];

        const newSign = sample > THRESHOLD ? 1 : sample < -THRESHOLD ? -1 : 0;

        // Detect zero-crossing.
        if (this.oldSign != 0 && newSign != 0 && this.oldSign != newSign) {
            this.lastCrossingFrame = frame;

            // Detect positive edge. That's the end of the cycle.
            if (this.oldSign == -1) {
                // Only consider cycles in the right range of periods.
                if (this.cycleSize > 7 && this.cycleSize < 44) {
                    // Long cycle is "0", short cycle is "1".
                    let bit = this.cycleSize < 22;

                    // Bits are MSb to LSb.
                    this.recentBits = (this.recentBits << 1) | (bit ? 1 : 0);

                    // If we're in the program, add the bit to our stream.
                    if (this.state == TapeDecoderState.DETECTED) {
                        this.bitCount += 1;

                        // Just got a start bit. Must be zero.
                        let bitType: BitType;
                        if (this.bitCount == 1) {
                            if (bit) {
                                console.log("Bad start bit at byte " + this.programBytes.length + ", " +
                                    frameToTimestamp(frame) + ", cycle size " + this.cycleSize + ".");
                                this.state = TapeDecoderState.ERROR;
                                bitType = BitType.BAD;
                            } else {
                                bitType = BitType.START;
                            }
                        } else {
                            bitType = bit ? BitType.ONE : BitType.ZERO;
                        }
                        this.bits.push(new BitData(frame - this.cycleSize, frame, bitType));

                        // Got enough bits for a byte (including the start bit).
                        if (this.bitCount == 9) {
                            this.programBytes.push(this.recentBits & 0xFF);
                            this.bitCount = 0;
                        }
                    } else {
                        // Detect end of header.
                        if ((this.recentBits & 0xFFFF) == 0x557F) {
                            this.state = TapeDecoderState.DETECTED;

                            // No start bit on first byte.
                            this.bitCount = 1;
                            this.recentBits = 0;
                        }
                    }
                } else if (this.state == TapeDecoderState.DETECTED && this.programBytes.length > 0 && this.cycleSize > 66) {
                    // 1.5 ms gap, end of recording.
                    // TODO pull this out of zero crossing.
                    this.state = TapeDecoderState.FINISHED;
                }

                // End of cycle, start a new one.
                this.cycleSize = 0;
            }
        } else {
            // Continue current cycle.
            this.cycleSize += 1;
        }

        if (newSign != 0) {
            this.oldSign = newSign;
        }

        if (this.state == TapeDecoderState.DETECTED && frame - this.lastCrossingFrame > MIN_SILENCE_FRAMES) {
            this.state = TapeDecoderState.FINISHED;
        }
    }

    getState() {
        return this.state;
    }

    getProgram() {
        const bytes = new Uint8Array(this.programBytes.length);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = this.programBytes[i];
        }
        return bytes;
    }

    getBits(): BitData[] {
        return this.bits;
    }
}
