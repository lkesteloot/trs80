import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {LabelAnnotation, WaveformAnnotation} from "./Annotations";

// What distance away from 0 counts as "positive" (or, when negative, "negative").
const THRESHOLD = 500/32768.0;

// If we go this many frames without any crossing, then we can assume we're done.
const MIN_SILENCE_FRAMES = 1000;

/**
 * Decodes high-speed (1500 baud) cassettes.
 */
export class HighSpeedTapeDecoder implements TapeDecoder {
    private readonly tape: Tape;
    private state: TapeDecoderState = TapeDecoderState.UNDECIDED;
    private readonly programBytes: number[] = [];
    private readonly bits: BitData[] = [];
    private readonly byteData: ByteData[] = [];

    constructor(tape: Tape) {
        this.tape = tape;
    }

    public getName(): string {
        return "High speed";
    }

    public findNextProgram(startFrame: number, waveformAnnotations: WaveformAnnotation[]): Program | undefined {
        const samples = this.tape.filteredSamples.samplesList[0];
        let programStartFrame: number | undefined = undefined;
        let oldSign = 0;
        let lastCrossingFrame = 0;
        let bitCount = 0;
        let cycleSize: number | undefined = undefined;
        let recentBits = 0;

        for (let frame = startFrame; frame < samples.length; frame++) {
            const sample = samples[frame];
            const newSign = sample > THRESHOLD ? 1 : sample < -THRESHOLD ? -1 : 0;

            // Detect zero-crossing.
            if (oldSign !== 0 && newSign !== 0 && oldSign !== newSign) {
                // Crossed the horizontal axis.
                lastCrossingFrame = frame;

                // Detect positive edge. That's the end of the cycle.
                if (newSign === 1) {
                    // Only consider cycles in the right range of periods. We allow up to 100 samples
                    // to handle the long zero bit right after the sync byte.
                    if (cycleSize !== undefined && cycleSize > 7 && cycleSize < 100) {
                        // Long cycle is "0", short cycle is "1".
                        const bit = cycleSize < 22;

                        // Bits are MSb to LSb.
                        recentBits = (recentBits << 1) | (bit ? 1 : 0);
                        bitCount += 1;

                        let bitType: BitType;
                        if (bitCount === 1 && this.state === TapeDecoderState.DETECTED) {
                            // Just got a start bit. Must be zero.
                            bitType = bit ? BitType.BAD : BitType.START;
                        } else {
                            bitType = bit ? BitType.ONE : BitType.ZERO;
                        }
                        this.bits.push(new BitData(frame - cycleSize, frame, bitType));

                        // If we're in the program, add the bit to our stream.
                        if (this.state === TapeDecoderState.DETECTED) {
                            // Got enough bits for a byte (including the start bit).
                            if (bitCount === 9) {
                                let byteValue = recentBits & 0xFF;
                                this.programBytes.push(byteValue);
                                this.byteData.push(new ByteData(byteValue,
                                    this.bits[this.bits.length - 8].startFrame,
                                    this.bits[this.bits.length - 1].endFrame));
                                bitCount = 0;
                            }
                        } else {
                            // Detect end of header.
                            if ((recentBits & 0xFFFFFFFF) === 0x5555557F) {
                                this.state = TapeDecoderState.DETECTED;

                                bitCount = 0;
                                recentBits = 0;
                                programStartFrame = frame;

                                waveformAnnotations.push(new LabelAnnotation("Sync",
                                    this.bits[this.bits.length - 8].startFrame,
                                    this.bits[this.bits.length - 1].endFrame,
                                    false));
                            }
                        }
                    } else if (this.state === TapeDecoderState.DETECTED) {
                        // Invalid bit length after program is detected. End reading. For a good recording
                        // this probably just the end of the recording.
                        this.state = TapeDecoderState.FINISHED;
                    }

                    // End of cycle, start a new one.
                    cycleSize = 0;
                } else {
                    // Negative edge. Nothing to do, we're part-way through a cycle.
                }
            } else {
                // Continue current cycle.
                if (cycleSize !== undefined) {
                    cycleSize += 1;
                }
            }

            if (newSign !== 0) {
                oldSign = newSign;
            }

            if (this.state === TapeDecoderState.DETECTED && frame - lastCrossingFrame > MIN_SILENCE_FRAMES) {
                this.state = TapeDecoderState.FINISHED;
            }
            if (this.state === TapeDecoderState.FINISHED && programStartFrame !== undefined) {
                return new Program(0, 0, programStartFrame, frame, this.getName(),
                    this.getBinary(), this.getBitData(), this.getByteData());
            }
        }

        // Ran off the end of the cassette. Here we could maybe return a partial program, if that would be useful.
        return undefined;
    }

    /**
     * Read a sequence of bits (the characters "0" and "1"). This is for testing.
     */
    public readBits(frame: number): [string, WaveformAnnotation[], string[]] {
        return ["", [], []];
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
        return this.bits;
    }

    public getByteData(): ByteData[] {
        return this.byteData;
    }
}
