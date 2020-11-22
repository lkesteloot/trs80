
// Low speed tape decode based on anteo's version.
// https://github.com/anteo

import {TapeDecoder} from "./TapeDecoder";
import {Tape} from "./Tape";
import {TapeDecoderState} from "./TapeDecoderState";
import {BitData} from "./BitData";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {BitType} from "./BitType";
import {
    HorizontalLineAnnotation, LabelAnnotation,
    PointAnnotation,
    VerticalLineAnnotation,
    WaveformAnnotation
} from "./Annotations";
import {withCommas} from "./Utils";

const SYNC_BYTE = 0xA5;

// When not finding a pulse, what kind of audio we found.
export enum PulseResultType {
    // Pulse found.
    PULSE,
    // No pulse found but there was audio there. Could be a mis-read.
    NOISE,
    // Mostly just silence.
    SILENCE,
}

// Result of a pulse detection.
export class Pulse {
    public readonly resultType: PulseResultType;
    public readonly value: number;
    public readonly frame: number;
    public readonly range: number;
    public readonly explanation: string;
    public readonly waveformAnnotations: WaveformAnnotation[] = [];

    constructor(resultType: PulseResultType, value: number, frame: number, range: number, explanation: string) {
        this.resultType = resultType;
        this.value = value;
        this.frame = frame;
        this.range = range;
        this.explanation = explanation;
    }
}

export class LowSpeedAnteoTapeDecoder implements TapeDecoder {
    private readonly samples: Int16Array;
    // Distance between two clock pulses.
    private readonly period: number;
    private readonly halfPeriod: number;
    private readonly quarterPeriod: number;
    private state: TapeDecoderState = TapeDecoderState.UNDECIDED;
    private peakThreshold = 1000;

    constructor(tape: Tape) {
        const samples = tape.lowSpeedSamples.samplesList[0];
        if (true) {
            this.samples = samples;
        } else {
            // Invert samples.
            this.samples = new Int16Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                this.samples[i] = -samples[i];
            }
        }
        this.period = Math.round(tape.sampleRate*0.002); // 2ms period.
        this.halfPeriod = Math.round(this.period / 2);
        this.quarterPeriod = Math.round(this.period / 4);
    }

    public findNextProgram(frame: number, waveformAnnotations: WaveformAnnotation[]): Program | undefined {
        while (true) {
            const [_, pulse] = this.findNextPulse(frame, this.peakThreshold);
            if (pulse === undefined) {
                // Ran off the end of the tape.
                return undefined;
            }

            frame = pulse.frame;
            const success = this.proofPulseDistance(frame, waveformAnnotations);
            if (success) {
                const program = this.loadData(frame, waveformAnnotations);
                if (program.binary.length > 0) {
                    return program;
                }
            }

            // Jump forward 1/10 second.
            frame += this.period*50;
        }
    }

    /**
     * Verifies that we have pulses every period starting at frame.
     */
    private proofPulseDistance(frame: number, waveformAnnotations: WaveformAnnotation[]): boolean {
        for (let i = 0; i < 200; i++) {
            // We expect a pulse every period.
            const expectedPulse = this.isPulseAt(frame);
            if (expectedPulse.resultType !== PulseResultType.PULSE) {
                return false;
            }

            // And no pulse in between, which would indicate a "1" bit.
            const expectedNoPulse = this.isPulseAt(frame + this.halfPeriod);
            if (expectedNoPulse.resultType === PulseResultType.PULSE) {
                return false;
            }

            frame = expectedPulse.frame + this.period;
        }

        return true;
    }

    /**
     * Load the program starting at the start frame.
     */
    private loadData(startFrame: number, waveformAnnotations: WaveformAnnotation[]): Program {
        // We want a sequence of 0 bit followed by the sync byte, so initialize our recent bits to
        // all ones so that if we happen to land at the beginning of a sync byte (preceded by
        // non-zeros) we don't wrongly detect it. Force all these 1s to get flushed out by
        // real zeros.
        let recentBits = 0xFFFFFFFF;
        let frame = startFrame;
        let foundSyncByte = false;
        let bitCount = 0;
        let allowLateClockPulse = false;
        const bitData: BitData[] = [];
        const byteData: ByteData[] = [];
        const binary: number[] = [];

        while (true) {
            const [bit, clockPulse, dataPulse] = this.readBit(frame, allowLateClockPulse);
            allowLateClockPulse = false;
            if (clockPulse.resultType === PulseResultType.SILENCE) {
                // End of program.
                break;
            }
            if (clockPulse.resultType === PulseResultType.NOISE) {
                const nextFrame = frame + this.period;
                recentBits = (recentBits << 1) | 0;
                bitData.push(new BitData(nextFrame - this.quarterPeriod, nextFrame + this.period - this.quarterPeriod, BitType.BAD));
                frame = nextFrame;
            } else {
                const nextFrame = clockPulse.frame;
                recentBits = (recentBits << 1) | (bit ? 1 : 0);
                bitData.push(new BitData(nextFrame - this.quarterPeriod, nextFrame + this.period - this.quarterPeriod,
                    bit ? BitType.ONE : BitType.ZERO));

                if (foundSyncByte) {
                    bitCount += 1;
                    if (bitCount === 8) {
                        const byteValue = recentBits & 0xFF;
                        binary.push(byteValue);
                        byteData.push(new ByteData(byteValue, bitData[bitData.length - 8].startFrame, bitData[bitData.length - 1].endFrame));
                        bitCount = 0;
                    }
                } else {
                    if (recentBits === SYNC_BYTE) {
                        waveformAnnotations.push(new LabelAnnotation("Sync", bitData[bitData.length - 8].startFrame, bitData[bitData.length - 1].endFrame, false));
                        foundSyncByte = true;
                        allowLateClockPulse = true;
                        bitCount = 0;
                    }
                }

                frame = nextFrame;
                this.peakThreshold = Math.round(clockPulse.range/4);
            }
        }

        // Remove trailing BAD bits, they're probably just junk after the last bit.
        while (bitData.length > 0 && bitData[bitData.length - 1].bitType === BitType.BAD) {
            bitData.splice(bitData.length - 1, 1);
        }

        return new Program(0, 0, startFrame, frame,
            this.getName(), this.numbersToBytes(binary), bitData, byteData);
    }

    /**
     * Read a bit at position "frame", which should be the position of the previous bit's clock pulse.
     * @return the value of the bit, the clock pulse, and the data pulse.
     */
    private readBit(frame: number, allowLateClockPulse: boolean, includeExplanation?: boolean): [boolean,Pulse,Pulse] {
        // Clock pulse is one period away.
        let clockPulse = this.isPulseAt(frame + this.period, includeExplanation);
        if (clockPulse.resultType !== PulseResultType.PULSE) {
            if (allowLateClockPulse) {
                const [_, latePulse] = this.findNextPulse(frame + this.period, this.peakThreshold);
                if (latePulse === undefined || latePulse.frame > frame + this.period*3) {
                    // Failed to find late pulse.
                    return [false, clockPulse, clockPulse];
                }

                clockPulse = latePulse;
            } else {
                return [false, clockPulse, clockPulse];
            }
        }

        // Data pulse is half a period after the clock pulse.
        const dataPulse = this.isPulseAt(clockPulse.frame + this.halfPeriod, includeExplanation);
        const bit = dataPulse.resultType === PulseResultType.PULSE;

        return [bit, clockPulse, dataPulse];
    }

    /**
     * Read a sequence of bits (the characters "0" and "1"). Frame is the position of the previous clock bit.
     * This is for testing.
     */
    public readBits(frame: number): [string, WaveformAnnotation[], string[]] {
        let bits = "";
        const waveformAnnotation: WaveformAnnotation[] = [];
        const explanations: string[] = [];

        waveformAnnotation.push(new LabelAnnotation("Previous", frame, frame, true));

        while (true) {
            const expectedNextFrame = frame + this.period;

            const [bit, clockPulse, dataPulse] = this.readBit(frame, false, true);

            if (clockPulse.resultType === PulseResultType.NOISE || clockPulse.resultType === PulseResultType.SILENCE) {
                const left = expectedNextFrame - this.quarterPeriod;
                const right = expectedNextFrame + this.period - this.quarterPeriod;
                waveformAnnotation.push(new LabelAnnotation(clockPulse.resultType === PulseResultType.NOISE ? "Noise" : "Silence",
                    left, right, true));

                if (clockPulse.explanation !== "") {
                    explanations.push(clockPulse.explanation);
                }
                waveformAnnotation.push(... clockPulse.waveformAnnotations);

                break;
            }

            const bitChar = bit ? "1" : "0";
            bits += bitChar;

            if (clockPulse.explanation !== "") {
                explanations.push(clockPulse.explanation);
            }
            if (dataPulse.explanation !== "") {
                explanations.push(dataPulse.explanation);
            }
            waveformAnnotation.push(... clockPulse.waveformAnnotations);
            waveformAnnotation.push(... dataPulse.waveformAnnotations);

            const nextFrame = clockPulse.frame;
            const left = nextFrame - this.quarterPeriod;
            const right = nextFrame + this.period - this.quarterPeriod;
            waveformAnnotation.push(new LabelAnnotation(bitChar, left, right, true));

            frame = nextFrame;
            this.peakThreshold = Math.round(clockPulse.range/4);
        }

        return [bits, waveformAnnotation, explanations];
    }

    /**
     * Converts an array of numbers to an array of bytes of those numbers.
     */
    private numbersToBytes(numbers: number[]): Uint8Array {
        const bytes = new Uint8Array(numbers.length);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = numbers[i];
        }
        return bytes;
    }

    /**
     * Look for the next pulse in the samples, starting at frame.
     * @return the frame at the end of the pulse, and an optional pulse if one was found. If one was not
     * found, then the frame ran off the end of the audio.
     */
    private findNextPulse(frame: number, threshold: number): [number, Pulse | undefined] {
        // Look for next position above the threshold.
        while (frame < this.samples.length && this.samples[frame] < threshold) {
            frame++;
        }
        if (frame >= this.samples.length) {
            return [frame, undefined];
        }

        // Look for next position below the threshold. Keep track of peak value.
        let maxValue = -32769;
        let maxFrame = -1;
        while (frame < this.samples.length && this.samples[frame] >= threshold) {
            if (this.samples[frame] > maxValue) {
                maxValue = this.samples[frame];
                maxFrame = frame;
            }
            frame++;
        }
        if (frame >= this.samples.length) {
            return [frame, undefined];
        }

        if (maxFrame === -1) {
            throw new Error("Didn't find peak");
        }

        return [frame, new Pulse(PulseResultType.PULSE, maxValue, maxFrame, threshold, "")];
    }

    /**
     * Look for a pulse around frame.
     */
    public isPulseAt(frame: number, includeExplanation?: boolean): Pulse {
        const distance = Math.round(this.period / 6);
        const pulseStart = Math.max(frame - distance, 0);
        const pulseEnd = Math.min(frame + distance, this.samples.length - 1);

        // Find min and max around frame.
        let maxFrame = pulseStart;
        let minFrame = pulseStart;
        let minValue = this.samples[maxFrame];
        let maxValue = this.samples[maxFrame];
        for (let i = pulseStart; i <= pulseEnd; i++) {
            const value = this.samples[i];
            if (value < minValue) {
                minValue = value;
                minFrame = i;
            }
            if (value > maxValue) {
                maxValue = value;
                maxFrame = i;
            }
        }

        const range = maxValue - minValue;
        let pulseEndOffset = this.peakThreshold / 4;
        const posPulseEndThreshold = maxValue - pulseEndOffset;
        const negPulseEndThreshold = minValue + pulseEndOffset;
        const annotations: WaveformAnnotation[] = [];

        if (range > this.peakThreshold) {
            if (includeExplanation) {
                annotations.push(new PointAnnotation(pulseStart, this.samples[pulseStart]));
                annotations.push(new PointAnnotation(pulseEnd, this.samples[pulseEnd]));
                annotations.push(new HorizontalLineAnnotation(posPulseEndThreshold, pulseStart, pulseEnd));
                annotations.push(new HorizontalLineAnnotation(negPulseEndThreshold, pulseStart, pulseEnd));
            }

            if (this.samples[pulseStart] < posPulseEndThreshold &&
                this.samples[pulseEnd] < posPulseEndThreshold) {

                const explanation = includeExplanation ?
                    "Looked for pulse at " + withCommas(frame) + " and found it at " + withCommas(maxFrame) +
                    ", which is within the search radius of " + withCommas(distance) + ". " +
                    "Range " + withCommas(range) + " is greater than pulse threshold " + withCommas(this.peakThreshold) +
                    ", start " + withCommas(this.samples[pulseStart]) + " < " + withCommas(posPulseEndThreshold) +
                    ", and end " + withCommas(this.samples[pulseEnd]) + " < " + withCommas(posPulseEndThreshold) + "." : "";
                let pulse = new Pulse(PulseResultType.PULSE, maxValue, maxFrame, range, explanation);
                if (includeExplanation) {
                    pulse.waveformAnnotations.push(new PointAnnotation(pulse.frame, pulse.value));
                    pulse.waveformAnnotations.push(new VerticalLineAnnotation(frame));
                    pulse.waveformAnnotations.push(... annotations);
                }
                return pulse;
            }

            if (this.samples[pulseStart] > negPulseEndThreshold &&
                this.samples[pulseEnd] > negPulseEndThreshold) {

                const explanation = includeExplanation ?
                    "Looked for pulse at " + withCommas(frame) + " and found it at " + withCommas(minFrame) +
                    ", which is within the search radius of " + withCommas(distance) + ". " +
                    "Range " + withCommas(range) + " is greater than pulse threshold " + withCommas(this.peakThreshold) +
                    ", start " + withCommas(this.samples[pulseStart]) + " > " + withCommas(negPulseEndThreshold) +
                    ", and end " + withCommas(this.samples[pulseEnd]) + " > " + withCommas(negPulseEndThreshold) + "." : "";
                const pulse = new Pulse(PulseResultType.PULSE, minValue, minFrame, range, explanation);
                if (includeExplanation) {
                    pulse.waveformAnnotations.push(new PointAnnotation(pulse.frame, pulse.value));
                    pulse.waveformAnnotations.push(new VerticalLineAnnotation(frame));
                    pulse.waveformAnnotations.push(... annotations);
                }
                return pulse;
            }

            const explanation = includeExplanation ? "Range " + range + " is greater than pulse threshold " + withCommas(this.peakThreshold) +
                " but the sides don't pull away enough." : "";
            const pulse = new Pulse(PulseResultType.NOISE, 0, 0, 0, explanation);
            pulse.waveformAnnotations.push(... annotations);
            return pulse;
        }

        const noiseThreshold = this.peakThreshold / 2;
        if (range > noiseThreshold) {
            const explanation = includeExplanation ? "Range " + range + " is less than pulse threshold " + withCommas(this.peakThreshold) +
                " but greater than noise threshold " + noiseThreshold + "." : "";
            const pulse = new Pulse(PulseResultType.NOISE, 0, 0, 0, explanation);
            pulse.waveformAnnotations.push(... annotations);
            return pulse;
        }

        const explanation = includeExplanation ? "Range " + range + " is less than or equal to noise threshold " + noiseThreshold + "." : "";
        let pulse = new Pulse(PulseResultType.SILENCE, 0, 0, 0, explanation);
        pulse.waveformAnnotations.push(... annotations);
        return pulse;
    }

    getBinary(): Uint8Array {
        return new Uint8Array(0);
    }

    getBitData(): BitData[] {
        return [];
    }

    getByteData(): ByteData[] {
        return [];
    }

    getName(): string {
        return "Low speed (Anteo)";
    }

    getState(): TapeDecoderState {
        return this.state;
    }
}
