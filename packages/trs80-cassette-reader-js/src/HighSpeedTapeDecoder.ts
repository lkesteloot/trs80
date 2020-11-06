import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {WaveformAnnotation} from "./Annotations";

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
    private programBytes: number[] = [];
    private oldSign: number = 0;
    private cycleSize: number = 0;
    private recentBits: number = 0;
    private bitCount: number = 0;
    private lastCrossingFrame: number = 0;
    private bits: BitData[] = [];
    private readonly byteData: ByteData[] = [];

    constructor(tape: Tape) {
        this.tape = tape;
    }

    public getName(): string {
        return "High speed";
    }

    public findNextProgram(startFrame: number, waveformAnnotationnnotations: WaveformAnnotation[]): Program | undefined {
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
        const sample = samples[frame];

        const newSign = sample > THRESHOLD ? 1 : sample < -THRESHOLD ? -1 : 0;

        // Detect zero-crossing.
        if (this.oldSign !== 0 && newSign !== 0 && this.oldSign !== newSign) {
            this.lastCrossingFrame = frame;

            // Detect positive edge. That's the end of the cycle.
            if (this.oldSign === -1) {
                // Only consider cycles in the right range of periods.
                if (this.cycleSize > 7 && this.cycleSize < 44) {
                    // Long cycle is "0", short cycle is "1".
                    const bit = this.cycleSize < 22;

                    // Bits are MSb to LSb.
                    this.recentBits = (this.recentBits << 1) | (bit ? 1 : 0);

                    // If we're in the program, add the bit to our stream.
                    if (this.state === TapeDecoderState.DETECTED) {
                        this.bitCount += 1;

                        let bitType: BitType;
                        if (this.bitCount === 1) {
                            // Just got a start bit. Must be zero.
                            if (bit) {
                                bitType = BitType.BAD;
                            } else {
                                bitType = BitType.START;
                            }
                        } else {
                            bitType = bit ? BitType.ONE : BitType.ZERO;
                        }
                        this.bits.push(new BitData(frame - this.cycleSize, frame, bitType));

                        // Got enough bits for a byte (including the start bit).
                        if (this.bitCount === 9) {
                            this.programBytes.push(this.recentBits & 0xFF);
                            this.bitCount = 0;
                        }
                    } else {
                        // Detect end of header.
                        if ((this.recentBits & 0xFFFFFFFF) === 0x5555557F) {
                            this.state = TapeDecoderState.DETECTED;

                            // No start bit on first byte.
                            this.bitCount = 1;
                            this.recentBits = 0;
                        }
                    }
                } else if (this.state === TapeDecoderState.DETECTED &&
                           this.programBytes.length > 0 && this.cycleSize > 66) {
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

        if (newSign !== 0) {
            this.oldSign = newSign;
        }

        if (this.state === TapeDecoderState.DETECTED && frame - this.lastCrossingFrame > MIN_SILENCE_FRAMES) {
            this.state = TapeDecoderState.FINISHED;
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
        return this.bits;
    }

    public getByteData(): ByteData[] {
        return this.byteData;
    }
}
