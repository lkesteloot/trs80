
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
    HorizontalLineAnnotation,
    PointAnnotation,
    ProgramAnnotation,
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
    public readonly explanation: string;
    public readonly waveformAnnotations: WaveformAnnotation[] = [];

    constructor(resultType: PulseResultType, value: number, frame: number, explanation: string) {
        this.resultType = resultType;
        this.value = value;
        this.frame = frame;
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
    private peakThreshold = 2000;

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

    public findNextProgram(frame: number, annotations: ProgramAnnotation[]): Program | undefined {
        while (true) {
            // console.log('-------------------------------------');
            const [_, pulse] = this.findNextPulse(frame, this.peakThreshold);
            if (pulse === undefined) {
                // Ran off the end of the tape.
                return undefined;
            }

            frame = pulse.frame;
            const success = this.proofPulseDistance(frame, annotations);
            if (success) {
                const program = this.loadData(frame, annotations);
                if (program != undefined && program.binary.length > 0) {
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
    private proofPulseDistance(frame: number, annotations: ProgramAnnotation[]): boolean {
        const initialFrame = frame;

        // console.log("Proofing starting at", frame, "with period", this.period);
        for (let i = 0; i < 200; i++) {
            const pulse = this.isPulseAt(frame);
            if (!(pulse instanceof Pulse)) {
                // console.log("Did not find pulse at", frame);
                annotations.push(new ProgramAnnotation("Failed", initialFrame, frame));
                return false;
            }

            frame = pulse.frame + this.period;
        }
        // console.log("Proof successful");
        // annotations.push(new WaveformAnnotation("P", initialFrame, frame - this.period));

        return true;
    }

    private loadData(startFrame: number, annotations: ProgramAnnotation[]): Program | undefined {
        let recentBits = 0;
        let frame = startFrame;
        let foundSyncByte = false;
        let bitCount = 0;
        let allowLateClockPulse = false;
        const bitData: BitData[] = [];
        const byteData: ByteData[] = [];
        const binary: number[] = [];

        while (true) {
            // console.log("recentBits", recentBits.toString(16).padStart(8, "0"), allowLateClockPulse, foundSyncByte);
            const bitResult = this.readBit(frame, allowLateClockPulse);
            allowLateClockPulse = false;
            if (bitResult === PulseResultType.SILENCE) {
                // End of program.
                break;
            }
            if (bitResult === PulseResultType.NOISE) {
                const nextFrame = frame + this.period;
                recentBits = (recentBits << 1) | 0;
                bitData.push(new BitData(nextFrame - this.quarterPeriod, nextFrame + this.period - this.quarterPeriod, BitType.BAD));
                frame = nextFrame;
            } else if (bitResult === PulseResultType.PULSE) {
                // Can't happen.
                throw new Error("read bit can't be PULSE");
            } else {
                const [bit, nextFrame] = bitResult;
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
                        annotations.push(new ProgramAnnotation("Sync", bitData[bitData.length - 8].startFrame, bitData[bitData.length - 1].endFrame));
                        foundSyncByte = true;
                        allowLateClockPulse = true;
                        bitCount = 0;
                    }
                }

                frame = nextFrame;
            }
        }

        /*
        if (frame === startFrame || !foundSyncByte) {
            // Didn't read any bits.
            annotations.push(new WaveformAnnotation("E", startFrame, frame));
            return undefined;
        }
        annotations.push(new WaveformAnnotation("" + foundSyncByte, startFrame, frame));
        */

        // Remove trailing BAD bits, they're probably just think after the last bit.
        while (bitData.length > 0 && bitData[bitData.length - 1].bitType === BitType.BAD) {
            bitData.splice(bitData.length - 1, 1);
        }

        return new Program(0, 0, startFrame, frame,
            this.getName(), this.numbersToBytes(binary), bitData, byteData);
    }

    /**
     * Read a bit at position "frame", which should be the position of the previous bit's clock pulse.
     * @return the value of the bit and the new position of the clock pulse, or NonPulse if a bit
     * couldn't be found.
     */
    private readBit(frame: number, allowLateClockPulse: boolean): [boolean,number] | PulseResultType {
        // Clock pulse is one period away.
        let clockPulse = this.isPulseAt(frame + this.period);
        // console.log("readbit", bit, dataPulse, clockPulse);
        if (clockPulse.resultType !== PulseResultType.PULSE) {
            if (allowLateClockPulse) {
                const [_, latePulse] = this.findNextPulse(frame + this.period, this.peakThreshold);
                if (latePulse === undefined || latePulse.frame > frame + this.period*3) {
                    // Failed to find late pulse.
                    return clockPulse.resultType;
                }

                clockPulse = latePulse;
            } else {
                return clockPulse.resultType;
            }
        }

        // Data pulse is half a period after the clock pulse.
        const dataPulse = this.isPulseAt(clockPulse.frame + this.halfPeriod);
        const bit = dataPulse.resultType === PulseResultType.PULSE;

        return [bit, clockPulse.frame];
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

        return [frame, new Pulse(PulseResultType.PULSE, maxValue, maxFrame, "")];
    }

    /**
     * Look for a pulse around frame.
     */
    public isPulseAt(frame: number, includeExplanation?: boolean): Pulse {
        const distance = Math.round(this.period / 6);
        const pulseStart = frame - distance;
        const pulseEnd = frame + distance;
        if (pulseStart < 0 || pulseEnd >= this.samples.length) {
            return new Pulse(PulseResultType.SILENCE, 0, 0, "too close to edge of audio");
        }

        // Find min and max around frame.
        let maxFrame = pulseStart;
        let minValue = this.samples[maxFrame];
        let maxValue = this.samples[maxFrame];
        for (let i = pulseStart; i <= pulseEnd; i++) {
            const value = this.samples[i];
            if (value < minValue) {
                minValue = value;
            }
            if (value > maxValue) {
                maxValue = value;
                maxFrame = i;
            }
        }

        const range = maxValue - minValue;

        const posPulseEndThreshold = maxValue - this.peakThreshold / 2;
        if (range > this.peakThreshold &&
            this.samples[pulseStart] < posPulseEndThreshold &&
            this.samples[pulseEnd] < posPulseEndThreshold) {

            const explanation = includeExplanation ?
                "Looked for pulse at " + withCommas(frame) + " and found it at " + withCommas(maxFrame) +
                ", which is within the search radius of " + withCommas(distance) + ". " +
                "Range " + withCommas(range) + " is greater than pulse threshold " + withCommas(this.peakThreshold) +
                ", start " + withCommas(this.samples[pulseStart]) + " < " + withCommas(posPulseEndThreshold) +
                ", and end " + withCommas(this.samples[pulseEnd]) + " < " + withCommas(posPulseEndThreshold) : "";
            let pulse = new Pulse(PulseResultType.PULSE, maxValue, maxFrame, explanation);
            if (includeExplanation) {
                pulse.waveformAnnotations.push(new PointAnnotation(pulse.frame, pulse.value));
                pulse.waveformAnnotations.push(new PointAnnotation(pulseStart, this.samples[pulseStart]));
                pulse.waveformAnnotations.push(new PointAnnotation(pulseEnd, this.samples[pulseEnd]));
                pulse.waveformAnnotations.push(new HorizontalLineAnnotation(posPulseEndThreshold));
                pulse.waveformAnnotations.push(new VerticalLineAnnotation(frame));
            }
            return pulse;
        }

        let negPulseEndThreshold = minValue + this.peakThreshold / 2;
        if (range > this.peakThreshold &&
            this.samples[pulseStart] > negPulseEndThreshold &&
            this.samples[pulseEnd] > negPulseEndThreshold) {

            const explanation = includeExplanation ?
                "Looked for pulse at " + withCommas(frame) + " and found it at " + withCommas(maxFrame) +
                ", which is within the search radius of " + withCommas(distance) + ". " +
                "Range " + withCommas(range) + " is greater than pulse threshold " + withCommas(this.peakThreshold) +
                ", start " + withCommas(this.samples[pulseStart]) + " > " + withCommas(negPulseEndThreshold) +
                ", and end " + withCommas(this.samples[pulseEnd]) + " > " + withCommas(negPulseEndThreshold) : "";
            // TODO should use minFrame, not maxFrame.
            return new Pulse(PulseResultType.PULSE, maxValue, maxFrame, explanation);
        }
        if (range > this.peakThreshold / 2) {
            const explanation = includeExplanation ? "Range " + range + " is less than pulse threshold " + withCommas(this.peakThreshold) +
                " but greater than noise threshold " + (this.peakThreshold / 2) : "";
            return new Pulse(PulseResultType.NOISE, 0, 0, explanation);
        }

        const explanation = includeExplanation ? "Range " + range + " is less than or equal to noise threshold " + (this.peakThreshold / 2) : "";
        return new Pulse(PulseResultType.SILENCE, 0, 0, explanation);
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
