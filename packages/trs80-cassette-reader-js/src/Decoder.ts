
// Uses tape decoders to work through the tape, finding programs and decoding them.

import {frameToTimestamp, HZ} from "./AudioUtils";
import {HighSpeedTapeDecoder} from "./HighSpeedTapeDecoder";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {TapeDecoder} from "./TapeDecoder";
import {TapeDecoderState} from "./TapeDecoderState";
import {encodeHighSpeed} from "./HighSpeedTapeEncoder";

export class Decoder {
    private tape: Tape;

    constructor(tape: Tape) {
        this.tape = tape;
    }

    public decode() {
        const samples = this.tape.filteredSamples.samplesList[0];
        let instanceNumber = 1;
        let trackNumber = 0;
        let copyNumber = 1;
        let frame = 0;
        let programStartFrame = -1;
        while (frame < samples.length) {
            console.log("--------------------------------------- " + instanceNumber);

            // Start out trying all decoders.
            let tapeDecoders: TapeDecoder[] = [
                new LowSpeedTapeDecoder(true),
                new LowSpeedTapeDecoder(false),
                new HighSpeedTapeDecoder(),
            ];

            const searchFrameStart = frame;
            let state = TapeDecoderState.UNDECIDED;
            for (; frame < samples.length &&
                 (state === TapeDecoderState.UNDECIDED || state === TapeDecoderState.DETECTED);
            frame++) {
                // Give the sample to all decoders in parallel.
                let detectedIndex = -1;
                for (let i = 0; i < tapeDecoders.length; i++) {
                    const tapeDecoder = tapeDecoders[i];

                    tapeDecoder.handleSample(this.tape, frame);

                    // See if it detected its encoding.
                    if (tapeDecoder.getState() !== TapeDecoderState.UNDECIDED) {
                        detectedIndex = i;
                    }
                }

                // If any has detected, keep only that one and kill the rest.
                if (state === TapeDecoderState.UNDECIDED) {
                    if (detectedIndex !== -1) {
                        const tapeDecoder = tapeDecoders[detectedIndex];

                        // See how long it took to find it. A large gap means a new track.
                        const leadTime = (frame - searchFrameStart) / HZ;
                        if (leadTime > 10 || programStartFrame === -1) {
                            trackNumber += 1;
                            copyNumber = 1;
                        }

                        programStartFrame = frame;
                        console.log("Decoder \"" + tapeDecoder.getName() + "\" detected " +
                                    trackNumber + "-" + copyNumber + " at " +
                                    frameToTimestamp(frame) + " after " +
                                    leadTime.toFixed(3) + " seconds.");

                        // Throw away the other decoders.
                        tapeDecoders = [
                            tapeDecoder,
                        ];

                        state = tapeDecoder.getState();
                    }
                } else {
                    // See if we should keep going.
                    state = tapeDecoders[0].getState();
                }
            }

            switch (state) {
                case TapeDecoderState.UNDECIDED:
                    console.log("Reached end of tape without finding track.");
                    break;

                case TapeDecoderState.DETECTED:
                    console.log("Reached end of tape while still reading track.");
                    break;

                case TapeDecoderState.ERROR:
                case TapeDecoderState.FINISHED:
                    if (state === TapeDecoderState.ERROR) {
                        console.log("Decoder detected an error; skipping program.");
                    } else {
                        console.log("Found end of program at " + frameToTimestamp(frame) + ".");
                    }
                    let binary = tapeDecoders[0].getBinary();
                    // Low-speed programs end in two 0x00, but high-speed programs
                    // end in three 0x00. Add the additional 0x00 since we're
                    // saving high-speed.
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

                    const program = new Program(trackNumber, copyNumber, programStartFrame, frame,
                        tapeDecoders[0].getName(), binary, tapeDecoders[0].getBits(),
                        encodeHighSpeed(highSpeedBytes));
                    if (!program.isTooShort()) {
                        this.tape.addProgram(program);
                    }
                    break;
            }

            copyNumber += 1;
            instanceNumber += 1;
        }
    }
}
