import {clampToInt16} from "./AudioUtils";
import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {WaveformAnnotation} from "./WaveformAnnotation";

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
     * @param sampleRate number of samples per second in the recording.
     * @returns filtered samples.
     */
    public static filterSamples(samples: Int16Array, sampleRate: number): Int16Array {
        const out = new Int16Array(samples.length);

        // Number of samples between the top of the pulse and the bottom of it. Each pulse
        // lasts 125µs, so assume the distance between crest and trough is 125µs.
        const pulseWidth = Math.round(125e-6*sampleRate);

        if (false) {
            for (let i = 0; i < samples.length; i++) {
                // Differentiate to accentuate a pulse. Pulse go positive, then negative,
                // with a space of pulseWidth, so subtracting those generates a large
                // positive value at the bottom of the pulse.
                const newSample = i >= pulseWidth ? samples[i - pulseWidth] - samples[i] : 0;
                out[i] = clampToInt16(newSample);
            }
        } else {
            // Convolution with a pulse similar to what the original should have looked like (125 µs pulse
            // up, then 125 µs pulse down).
            let posSum = 0;
            let negSum = 0;
            let denom = pulseWidth*2;

            for (let i = 0; i < samples.length; i++) {
                let aheadSample = i + pulseWidth >= samples.length ? 0 : samples[i + pulseWidth];
                let nowSample = samples[i];
                let behindSample = i - pulseWidth < 0 ? 0 : samples[i - pulseWidth];

                posSum += nowSample - behindSample;
                negSum += aheadSample - nowSample;

                out[i] = clampToInt16((posSum - negSum)/denom);
            }
        }

        return out;
    }

    private readonly tape: Tape;
    private readonly invert: boolean;
    private readonly pulseWidth: number;
    private readonly bitDeterminator: number;
    private readonly endOfProgramSilence: number;
    private state: TapeDecoderState;
    private readonly programBytes: number[] = [];
    private lastPulseFrame: number;
    private eatNextPulse: boolean;
    private bitCount: number;
    private recentBits: number;
    private lenientFirstBit: boolean;
    private detectedZeros: number;
    private pulseHeight: number;
    private readonly bitData: BitData[];
    private readonly byteData: ByteData[] = [];
    private pulseCount: number;

    constructor(tape: Tape, invert: boolean) {
        this.tape = tape;
        this.invert = invert;
        this.state = TapeDecoderState.UNDECIDED;
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
        this.bitData = [];
        this.pulseCount = 0;

        // Number of samples between start of pulse detection and end of pulse. Once
        // we detect a pulse, we ignore this number of samples.
        // TODO make tape.sampleRate-sensitive.
        this.pulseWidth = 22;
        // Number of samples that determines a zero (longer) or one (shorter) bit.
        // TODO make tape.sampleRate-sensitive.
        this.bitDeterminator = 68;
        // Number of quiet samples that would indicate the end of the program.
        this.endOfProgramSilence = tape.sampleRate / 10;
    }

    public getName(): string {
        return "Low speed" + (this.invert ? " (Inv)" : "");
    }

    public findNextProgram(startFrame: number, annotations: WaveformAnnotation[]): Program | undefined {
        const samples = this.tape.lowSpeedSamples.samplesList[0];
        let programStartFrame = -1;

        for (let frame = startFrame; frame < samples.length; frame++) {
            this.handleSample(frame);
            if (this.state === TapeDecoderState.DETECTED && programStartFrame === -1) {
                programStartFrame = frame;
            }
            if (this.state === TapeDecoderState.FINISHED && programStartFrame !== -1) {
                return new Program(0, 0, programStartFrame, frame, this.getName(),
                    this.getBinary(), this.getBitData(), this.getByteData());
            }
        }

        return undefined;
    }

    private handleSample(frame: number) {
        const samples = this.tape.lowSpeedSamples.samplesList[0];
        const pulse = this.invert ? -samples[frame] : samples[frame];

        const timeDiff = frame - this.lastPulseFrame;
        const pulsing: boolean = timeDiff > this.pulseWidth && pulse >= this.pulseHeight / 3;

        // Keep track of the height of this pulse, to calibrate for the next one.
        if (timeDiff < this.pulseWidth) {
            this.pulseHeight = Math.max(this.pulseHeight, pulse);
        }

        if (this.state === TapeDecoderState.DETECTED && timeDiff > this.endOfProgramSilence) {
            // End of program.
            this.state = TapeDecoderState.FINISHED;
        } else if (pulsing) {
            const bit: boolean = timeDiff < this.bitDeterminator;
            if (this.pulseCount++ === 1000) {
                // For debugging, forces a detection so we can inspect the bits.
                /// this.state = TapeDecoderState.DETECTED;
            }
            if (this.eatNextPulse) {
                if (this.state === TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                    this.bitData.push(new BitData(this.lastPulseFrame, frame, BitType.BAD));
                } else {
                    const lastBit = this.bitData[this.bitData.length - 1];
                    if (lastBit && lastBit.bitType === BitType.ONE && lastBit.endFrame === this.lastPulseFrame) {
                        // Merge with previous 1 bit.
                        lastBit.endFrame = frame;
                    }
                    const lastByte = this.byteData[this.byteData.length - 1];
                    if (lastByte && lastByte.endFrame === this.lastPulseFrame) {
                        // Adjust last bit.
                        lastByte.endFrame = frame;
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
                        this.bitData.push(new BitData(this.lastPulseFrame, frame, bit ? BitType.ONE : BitType.ZERO));
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
                            let byteValue = this.recentBits & 0xFF;
                            this.programBytes.push(byteValue);
                            this.byteData.push(new ByteData(byteValue, this.bitData[this.bitData.length - 8].startFrame, frame));
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

    public getBitData(): BitData[] {
        return this.bitData;
    }

    public getByteData(): ByteData[] {
        return this.byteData;
    }
}
