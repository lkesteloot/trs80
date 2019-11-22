
import { HZ, frameToTimestamp } from "AudioUtils";
import { TapeDecoderState } from "TapeDecoderState";

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

export class LowSpeedTapeDecoder {
    state: TapeDecoderState;
    programBytes: number[];
    lastPulseFrame: number;
    eatNextPulse: boolean;
    bitCount: number;
    recentBits: number;
    lenientFirstBit: boolean;
    detectedZeros: number;
    pulseHeight: number;

    constructor() {
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
        // Recent history of bits, for debugging.
        /// private final BitHistory mHistory = new BitHistory(10);
    }

    // For TapeDecoder interface:
    getName() {
        return "low speed";
    }

    // For TapeDecoder interface:
    handleSample(tape, frame) {
        var samples = tape.filteredSamples.samplesList[0];

        // Differentiate to accentuate a pulse. Pulse go positive, then negative,
        // with a space of PULSE_PEAK_DISTANCE, so subtracting those generates a large
        // positive value at the bottom of the pulse.
        var pulse = frame >= PULSE_PEAK_DISTANCE ? samples[frame - PULSE_PEAK_DISTANCE] - samples[frame] : 0;

        var timeDiff = frame - this.lastPulseFrame;
        var pulsing = timeDiff > PULSE_WIDTH && pulse >= this.pulseHeight / 3;

        // Keep track of the height of this pulse, to calibrate for the next one.
        if (timeDiff < PULSE_WIDTH) {
            this.pulseHeight = Math.max(this.pulseHeight, pulse);
        }

        if (this.state == TapeDecoderState.DETECTED && timeDiff > END_OF_PROGRAM_SILENCE) {
            // End of program.
            this.state = TapeDecoderState.FINISHED;
        } else if (pulsing) {
            var bit = timeDiff < BIT_DETERMINATOR;
            if (this.eatNextPulse) {
                if (this.state == TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                    console.log("Warning: At bit of wrong value at " +
                        frameToTimestamp(frame) + ", diff = " + timeDiff + ", last = " +
                        frameToTimestamp(this.lastPulseFrame));
                    //mHistory.add(new BitData(this.lastPulseFrame, frame, BitType.BAD));
                    //results.addBadSection(mHistory);
                }
                this.eatNextPulse = false;
                this.lenientFirstBit = false;
            } else {
                // If we see a 1 in the header, reset the count. We want a bunch of consecutive zeros.
                if (bit && this.state == TapeDecoderState.UNDECIDED && this.detectedZeros < MIN_HEADER_ZEROS) {
                    // Still not in header. Reset count.
                    this.detectedZeros = 0;
                } else {
                    if (bit) {
                        this.eatNextPulse = true;
                    } else {
                        this.detectedZeros += 1;
                    }
                    this.recentBits = (this.recentBits << 1) | (bit ? 1 : 0);
                    //mHistory.add(new BitData(this.lastPulseFrame, frame, bit ? BitType.ONE : BitType.ZERO));
                    if (this.state == TapeDecoderState.UNDECIDED) {
                        // Haven't found end of header yet. Look for it, preceded by zeros.
                        if (this.recentBits == 0x000000A5) {
                            this.bitCount = 0;
                            // For some reason we don't get a clock after this last 1.
                            this.lenientFirstBit = true;
                            this.state = TapeDecoderState.DETECTED;
                        }
                    } else {
                        this.bitCount += 1;
                        if (this.bitCount == 8) {
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

    // For TapeDecoder interface:
    getState() {
        return this.state;
    }

    // For TapeDecoder interface:
    getProgram() {
        var bytes = new Uint8Array(this.programBytes.length);
        for (var i = 0; i < bytes.length; i++) {
            bytes[i] = this.programBytes[i];
        }
        return bytes;
    }
}
