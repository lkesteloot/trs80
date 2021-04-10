
// Uses tape decoders to work through the tape, finding programs and decoding them.

import {HighSpeedTapeDecoder} from "./HighSpeedTapeDecoder.js";
import {Program} from "./Program.js";
import {Tape} from "./Tape.js";
import {TapeDecoder} from "./TapeDecoder.js";
import {encodeHighSpeed, wrapHighSpeed} from "./HighSpeedTapeEncoder.js";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder.js";
import {encodeLowSpeed, wrapLowSpeed} from "./LowSpeedTapeEncoder.js";

class Transition {
    public candidate: Program;
    public isStart: boolean;
    public frame: number;

    constructor(candidate: Program, isStart: boolean, frame: number) {
        this.candidate = candidate;
        this.isStart = isStart;
        this.frame = frame;
    }
}

/**
 * Uses various decoders to decode an audio file.
 */
export class Decoder {
    private readonly tape: Tape;

    constructor(tape: Tape) {
        this.tape = tape;
    }

    /**
     * Decode the tape, populating the tape's "programs" array.
     */
    public decode() {
        // All decoders we're interested in. We use factories because they're created
        // multiple times, once for each program found.
        let tapeDecoderFactories: (() => TapeDecoder)[] = [
            () => new LowSpeedTapeDecoder(this.tape, 250),
            () => new LowSpeedTapeDecoder(this.tape, 500),
            () => new LowSpeedTapeDecoder(this.tape, 1000),
            () => new HighSpeedTapeDecoder(this.tape),
        ];

        // All programs we detect.
        const candidates: Program[] = [];

        // Clear all annotations.
        this.tape.waveformAnnotations.splice(0, this.tape.waveformAnnotations.length);

        // Try each decoder, feeding it the whole tape.
        for (const tapeDecoderFactory of tapeDecoderFactories) {
            let startFrame = 0;

            while (true) {
                const tapeDecoder = tapeDecoderFactory();
                const program = tapeDecoder.findNextProgram(startFrame, this.tape.waveformAnnotations);
                if (program === undefined) {
                    break;
                }
                candidates.push(program);
                startFrame = Math.round(program.endFrame + this.tape.sampleRate*0.01);
            }
        }

        // Make a sorted list of start/end of candidates.
        const transitions: Transition[] = [];
        for (const candidate of candidates) {
            transitions.push(new Transition(candidate, true, candidate.startFrame));
            transitions.push(new Transition(candidate, false, candidate.endFrame));
        }
        transitions.sort((a, b) => a.frame - b.frame);

        // Go through them, keeping track of which candidates are active, and deleting
        // clearly bad candidates (those completely nested in others).
        candidates.splice(0, candidates.length);
        const activeCandidates: Program[] = [];
        for (const transition of transitions) {
            // See if this new one is nested in an active one.
            if (transition.isStart) {
                let keepCandidate = true;
                for (const candidate of activeCandidates) {
                    if (transition.candidate.isNestedIn(candidate, this.tape.sampleRate * 0.1)) {
                        keepCandidate = false;
                        break;
                    }
                }

                if (keepCandidate) {
                    activeCandidates.push(transition.candidate);
                    candidates.push(transition.candidate);
                }
            } else {
                const index = activeCandidates.indexOf(transition.candidate);
                if (index !== -1) {
                    activeCandidates.splice(index, 1);
                }
            }
        }

        // Sort programs by tape order.
        candidates.sort((a, b) => a.startFrame - b.startFrame);

        // Convert remaining candidates to programs.
        let trackNumber = 0;
        let copyNumber = 0;
        let endOfLastProgram = 0;
        for (const candidate of candidates) {
            // Skip very short programs, they're mis-detects.
            if (candidate.endFrame - candidate.startFrame > this.tape.sampleRate / 10) {
                // See how long it took to find it. A large gap means a new track.
                const leadTime = (candidate.startFrame - endOfLastProgram) / this.tape.sampleRate;
                if (trackNumber === 0 || leadTime > 5) {
                    trackNumber++;
                    copyNumber = 1;
                } else {
                    copyNumber += 1;
                }
                candidate.trackNumber = trackNumber;
                candidate.copyNumber = copyNumber;
                candidate.setReconstructedSamples(this.reencode(candidate.binary));
                this.tape.addProgram(candidate);

                endOfLastProgram = candidate.endFrame;
            }
        }
    }

    /**
     * Re-encodes a binary as a clean low-speed audio.
     */
    private reencode(binary: Uint8Array): Int16Array {
        // Here we could re-encode in either low speed or high speed. Do low speed so that
        // the audio is usable on a Model I.
        if (true) { // TODO fix this
            return encodeLowSpeed(wrapLowSpeed(binary), this.tape.sampleRate);
        } else {
            // Low-speed programs end in two 0x00, but high-speed programs
            // end in three 0x00. Add the additional 0x00 since we're
            // saving high-speed.
            // Note: I think that's true of Basic programs, but maybe not of other programs.
            let highSpeedBytes;
            if (binary.length >= 3 &&
                binary[binary.length - 1] === 0x00 &&
                binary[binary.length - 2] === 0x00 &&
                binary[binary.length - 3] !== 0x00) {

                highSpeedBytes = new Uint8Array(binary.length + 1);
                highSpeedBytes.set(binary);
                highSpeedBytes[highSpeedBytes.length - 1] = 0x00;
            } else {
                highSpeedBytes = binary;
            }

            return encodeHighSpeed(wrapHighSpeed(highSpeedBytes), this.tape.sampleRate);
        }
    }
}
