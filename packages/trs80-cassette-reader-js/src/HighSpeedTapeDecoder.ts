import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";
import {ByteData} from "./ByteData";
import {Program} from "./Program";
import {LabelAnnotation, WaveformAnnotation} from "./Annotations";

// What distance away from 0 counts as "positive" (or, when negative, "negative").
const THRESHOLD = 500;

/**
 * Decodes high-speed (1500 baud) cassettes.
 */
export class HighSpeedTapeDecoder implements TapeDecoder {
    private readonly tape: Tape;
    private readonly lengthMultiplier: number;
    private state: TapeDecoderState = TapeDecoderState.UNDECIDED;
    private readonly programBytes: number[] = [];
    private readonly bits: BitData[] = [];
    private readonly byteData: ByteData[] = [];

    constructor(tape: Tape) {
        this.tape = tape;

        // Our "number of samples" comparisons assume 44100 Hz, so adjust for that.
        this.lengthMultiplier = tape.sampleRate/44100;
    }

    public getName(): string {
        return "1500 baud";
    }

    public isHighSpeed(): boolean {
        return true;
    }

    public findNextProgram(startFrame: number, waveformAnnotations: WaveformAnnotation[]): Program | undefined {
        const samples = this.tape.filteredSamples.samplesList[0];
        let programStartFrame: number | undefined = undefined;
        let bitCount = 0;
        let recentBits = 0;

        while (this.state !== TapeDecoderState.FINISHED) {
            const bitInfo = this.findBit(samples, startFrame);
            if (bitInfo === undefined) {
                // Ran off the end of the cassette.
                this.state = TapeDecoderState.FINISHED;
            } else {
                const [crossing, bit] = bitInfo;
                if (bit === undefined) {
                    // Bad bit. If we've not started decoding yet, then it's noise we ignore. Otherwise it indicates
                    // the end of the recording.
                    if (this.state === TapeDecoderState.DETECTED) {
                        this.state = TapeDecoderState.FINISHED;
                    }
                } else {
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
                    this.bits.push(new BitData(startFrame, crossing, bitType));

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
                            programStartFrame = startFrame;

                            waveformAnnotations.push(new LabelAnnotation("Sync",
                                this.bits[this.bits.length - 8].startFrame,
                                this.bits[this.bits.length - 1].endFrame,
                                false));
                        }
                    }
                }

                startFrame = crossing;
            }
        }

        if (programStartFrame === undefined) {
            return undefined;
        }

        return new Program(0, 0, programStartFrame, startFrame, this, 1500,
            this.getBinary(), this.getBitData(), this.getByteData());
    }

    /**
     * Find the next bit, starting at the positive crossing of the end of the previous bit. Returns
     * the positive crossing at the end of this bit, and the value of the bit. The bit is undefined
     * if the length was too short or too long. Returns undefined if we ran off the end of the tape.
     */
    private findBit(samples: Int16Array, startFrame: number): [number, boolean | undefined] | undefined {
        const crossing = this.findPositiveCrossing(samples, startFrame);
        if (crossing === undefined) {
            // Ran off the end of the cassette.
            return undefined;
        }

        const cycleSize = crossing - startFrame;
        if (cycleSize > 7*this.lengthMultiplier && cycleSize < 100*this.lengthMultiplier) {
            // Long cycle is "0", short cycle is "1".
            const bit = cycleSize < 22*this.lengthMultiplier;

            return [crossing, bit];
        } else {
            return [crossing, undefined];
        }
    }

    /**
     * Find the next positive crossing, starting at startFrame. If none is found, returns undefined.
     */
    private findPositiveCrossing(samples: Int16Array, startFrame: number): number | undefined {
        let oldSign = 0;

        for (let frame = startFrame; frame < samples.length; frame++) {
            const sample = samples[frame];
            const newSign = sample > THRESHOLD ? 1 : sample < -THRESHOLD ? -1 : 0;

            if (oldSign === -1 && newSign === 1) {
                // Positive edge.
                return frame;
            }

            if (newSign !== 0) {
                oldSign = newSign;
            }
        }

        return undefined;
    }

    /**
     * Read a sequence of bits (the characters "0" and "1"). This is for testing.
     */
    public readBits(frame: number): [string, WaveformAnnotation[], string[]] {
        const samples = this.tape.filteredSamples.samplesList[0];
        let bits = "";
        const waveformAnnotation: WaveformAnnotation[] = [];
        const explanations: string[] = [];
        let firstBit = true;

        while (true) {
            const bitInfo = this.findBit(samples, frame);
            if (bitInfo === undefined) {
                // Ran off the end of the cassette.
                break;
            } else {
                const [crossing, bit] = bitInfo;
                if (bit === undefined) {
                    waveformAnnotation.push(new LabelAnnotation("Bad", frame, crossing, true));
                    if (bits.length !== 0) {
                        break;
                    }
                } else {
                    if (firstBit) {
                        waveformAnnotation.push(new LabelAnnotation("Ign", frame, crossing, true));
                        firstBit = false;
                    } else {
                        const bitChar = bit ? "1" : "0";
                        waveformAnnotation.push(new LabelAnnotation(bitChar, frame, crossing, true));
                        bits += bitChar;
                    }
                }

                frame = crossing;
            }
        }

        return [bits, waveformAnnotation, explanations];

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
