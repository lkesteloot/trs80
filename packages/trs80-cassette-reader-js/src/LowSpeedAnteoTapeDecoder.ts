
// Low speed tape decode based on anteo's version.
// https://github.com/anteo

import {TapeDecoder} from "./TapeDecoder";
import {Tape} from "./Tape";
import {TapeDecoderState} from "./TapeDecoderState";
import {BitData} from "./BitData";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {BitType} from "./BitType";
import {WaveformAnnotation} from "./WaveformAnnotation";

const SYNC_BYTE = 0xA5;

// When not finding a pulse, what kind of audio we found.
enum NonPulse {
    NOISE, SILENCE,
}

class Pulse {
    public readonly value: number;
    public readonly frame: number;

    constructor(value: number, frame: number) {
        this.value = value;
        this.frame = frame;
    }
}

export class LowSpeedAnteoTapeDecoder implements TapeDecoder {
    private readonly tape: Tape;
    private readonly samples: Int16Array;
    // Distance between two clock pulses.
    private readonly period: number;
    private readonly halfPeriod: number;
    private readonly quarterPeriod: number;
    private state: TapeDecoderState = TapeDecoderState.UNDECIDED;
    private peakThreshold = 4000;

    constructor(tape: Tape) {
        this.tape = tape;
        if (true) {
            this.samples = this.tape.lowSpeedSamples.samplesList[0];
        } else {
            // Invert samples.
            const samples = this.tape.originalSamples.samplesList[0];
            this.samples = new Int16Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                this.samples[i] = -samples[i];
            }
        }
        this.period = Math.round(this.tape.sampleRate*0.002); // 2ms period.
        this.halfPeriod = Math.round(this.period / 2);
        this.quarterPeriod = Math.round(this.period / 4);
    }

    public findNextProgram(frame: number, annotations: WaveformAnnotation[]): Program | undefined {
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
    private proofPulseDistance(frame: number, annotations: WaveformAnnotation[]): boolean {
        const initialFrame = frame;

        console.log("Proofing starting at", frame, "with period", this.period);
        for (let i = 0; i < 200; i++) {
            const pulse = this.isPulseAt(frame);
            if (!(pulse instanceof Pulse)) {
                console.log("Did not find pulse at", frame);
                annotations.push(new WaveformAnnotation("Failed", initialFrame, frame));
                return false;
            }

            frame = pulse.frame + this.period;
        }
        console.log("Proof successful");
        // annotations.push(new WaveformAnnotation("P", initialFrame, frame - this.period));

        return true;
    }

    private loadData(startFrame: number, annotations: WaveformAnnotation[]): Program | undefined {
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
            if (bitResult === NonPulse.SILENCE) {
                // End of program.
                break;
            }
            if (bitResult === NonPulse.NOISE) {
                const nextFrame = frame + this.period;
                recentBits = (recentBits << 1) | 0;
                bitData.push(new BitData(nextFrame - this.quarterPeriod, nextFrame + this.period - this.quarterPeriod, BitType.BAD));
                frame = nextFrame;
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
                        annotations.push(new WaveformAnnotation("Sync", bitData[bitData.length - 8].startFrame, bitData[bitData.length - 1].endFrame));
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
    private readBit(frame: number, allowLateClockPulse: boolean): [boolean,number] | NonPulse {
        // Clock pulse is one period away.
        let clockPulse = this.isPulseAt(frame + this.period);
        // console.log("readbit", bit, dataPulse, clockPulse);
        if (!(clockPulse instanceof Pulse)) {
            if (allowLateClockPulse) {
                const [_, latePulse] = this.findNextPulse(frame + this.period, this.peakThreshold);
                if (latePulse === undefined || latePulse.frame > frame + this.period*3) {
                    // Failed to find late pulse.
                    return clockPulse;
                }

                clockPulse = latePulse;
            } else {
                return clockPulse;
            }
        }

        // Data pulse is half a period after the clock pulse.
        const dataPulse = this.isPulseAt(clockPulse.frame + this.halfPeriod);
        const bit = dataPulse instanceof Pulse;

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

        return [frame, new Pulse(maxValue, maxFrame)];
    }

    /**
     * Look for a pulse around frame, returning it found, otherwise undefined.
     */
    private isPulseAt(frame: number): Pulse | NonPulse {
        const distance = Math.round(this.period / 6);
        const pulseStart = frame - distance;
        const pulseEnd = frame + distance;
        if (pulseStart < 0 || pulseEnd >= this.samples.length) {
            return NonPulse.SILENCE;
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

        let span = maxValue - minValue;
        if (span > this.peakThreshold &&
            (this.samples[pulseStart] < maxValue - this.peakThreshold / 2 &&
                this.samples[pulseEnd] < maxValue - this.peakThreshold / 2) ||
            (this.samples[pulseStart] > minValue + this.peakThreshold / 2 &&
                this.samples[pulseEnd] > minValue + this.peakThreshold / 2)) {

            return new Pulse(maxValue, maxFrame);
        } else if (span > this.peakThreshold / 2) {
            return NonPulse.NOISE;
        } else {
            return NonPulse.SILENCE;
        }
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
