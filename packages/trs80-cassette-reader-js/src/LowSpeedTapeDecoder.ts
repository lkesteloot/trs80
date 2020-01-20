
import {frameToTimestamp, HZ} from "./AudioUtils";
import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";

/**
 * Number of samples between the top of the pulse and the bottom of it.
 */
const PULSE_PEAK_DISTANCE = 7;
/**
 * Number of samples between start of pulse detection and end of pulse. Once
 * we detect a pulse, we ignore this number of samples.
 */
const PULSE_WIDTH = 22;
/**
 * Number of samples that determines a zero (longer) or one (shorter) bit.
 */
const BIT_DETERMINATOR = 68;
/**
 * Number of quiet samples that would indicate the end of the program.
 */
const END_OF_PROGRAM_SILENCE = HZ / 10;
/**
 * Number of consecutive zero bits we require in the header before we're pretty
 * sure this is a low speed program.
 */
const MIN_HEADER_ZEROS = 6;

export class LowSpeedTapeDecoder implements TapeDecoder {
    /**
     * Differentiating filter to accentuate pulses.
     *
     * @param samples samples to filter.
     * @returns filtered samples.
     */
    public static filterSamples(samples: Float32Array): Float32Array {
        const out = new Float32Array(samples.length);

        for (let i = 0; i < samples.length; i++) {
            // Differentiate to accentuate a pulse. Pulse go positive, then negative,
            // with a space of PULSE_PEAK_DISTANCE, so subtracting those generates a large
            // positive value at the bottom of the pulse.
            out[i] = i >= PULSE_PEAK_DISTANCE ? samples[i - PULSE_PEAK_DISTANCE] - samples[i] : 0;
        }

        return out;
    }

    private invert: boolean;
    private state: TapeDecoderState;
    private programBytes: number[];
    private lastPulseFrame: number;
    private eatNextPulse: boolean;
    private bitCount: number;
    private recentBits: number;
    private lenientFirstBit: boolean;
    private detectedZeros: number;
    private pulseHeight: number;
    private bits: BitData[];
    private pulseCount: number;

    constructor(invert: boolean) {
        this.invert = invert;
        this.state = TapeDecoderState.UNDECIDED;
        this.programBytes = [];
        // The frame where we last detected a pulse.
        this.lastPulseFrame = 0;
        this.eatNextPulse = false;
        this.bitCount = 0;
        this.recentBits = 0;
        this.lenientFirstBit = false;
        this.detectedZeros = 0;
        // Height of the previous pulse. We set each pulse's threshold
        // to 1/3 of the previous pulse's height.
        this.pulseHeight = 0;
        this.bits = [];
        this.pulseCount = 0;
    }

    public getName(): string {
        return "Low speed";
    }

    public handleSample(tape: Tape, frame: number) {
        const samples = tape.lowSpeedSamples.samplesList[0];
        const pulse = this.invert ? -samples[frame] : samples[frame];

        const timeDiff = frame - this.lastPulseFrame;
        const pulsing: boolean = timeDiff > PULSE_WIDTH && pulse >= this.pulseHeight / 3;

        // Keep track of the height of this pulse, to calibrate for the next one.
        if (timeDiff < PULSE_WIDTH) {
            this.pulseHeight = Math.max(this.pulseHeight, pulse);
        }

        if (this.state === TapeDecoderState.DETECTED && timeDiff > END_OF_PROGRAM_SILENCE) {
            // End of program.
            this.state = TapeDecoderState.FINISHED;
        } else if (pulsing) {
            const bit: boolean = timeDiff < BIT_DETERMINATOR;
            if (this.pulseCount++ === 1000) {
                // For debugging, forces a detection so we can inspect the bits.
                /// this.state = TapeDecoderState.DETECTED;
            }
            if (this.eatNextPulse) {
                if (this.state === TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                    console.log("Warning: At bit of wrong value at " +
                        frameToTimestamp(frame) + ", diff = " + timeDiff + ", last = " +
                        frameToTimestamp(this.lastPulseFrame));
                    this.bits.push(new BitData(this.lastPulseFrame, frame, BitType.BAD));
                } else {
                    const lastBit = this.bits[this.bits.length - 1];
                    if (lastBit && lastBit.bitType === BitType.ONE && lastBit.endFrame === this.lastPulseFrame) {
                        // Merge with previous 1 bit.
                        lastBit.endFrame = frame;
                    }
                }
                this.eatNextPulse = false;
                this.lenientFirstBit = false;
            } else {
                // If we see a 1 in the header, reset the count. We want a bunch of consecutive zeros.
                if (bit && this.state === TapeDecoderState.UNDECIDED && this.detectedZeros < MIN_HEADER_ZEROS) {
                    // Still not in header. Reset count.
                    this.detectedZeros = 0;
                } else {
                    if (bit) {
                        this.eatNextPulse = true;
                    } else {
                        this.detectedZeros += 1;
                    }
                    this.recentBits = (this.recentBits << 1) | (bit ? 1 : 0);
                    if (this.lastPulseFrame !== 0) {
                        this.bits.push(new BitData(this.lastPulseFrame, frame, bit ? BitType.ONE : BitType.ZERO));
                    }
                    if (this.state === TapeDecoderState.UNDECIDED) {
                        // Haven't found end of header yet. Look for it, preceded by zeros.
                        if (this.recentBits === 0x000000A5) {
                            this.bitCount = 0;
                            // For some reason we don't get a clock after this last 1.
                            this.lenientFirstBit = true;
                            this.state = TapeDecoderState.DETECTED;
                        }
                    } else {
                        this.bitCount += 1;
                        if (this.bitCount === 8) {
                            this.programBytes.push(this.recentBits & 0xFF);
                            this.bitCount = 0;
                        }
                    }
                }
            }
            this.lastPulseFrame = frame;
            this.pulseHeight = 0;
        }
    }

    public getState() {
        return this.state;
    }

    public getBinary() {
        const bytes = new Uint8Array(this.programBytes.length);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = this.programBytes[i];
        }
        return bytes;
    }

    public getBits(): BitData[] {
        return this.bits;
    }
}
