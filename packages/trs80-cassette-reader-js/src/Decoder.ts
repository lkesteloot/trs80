// Uses tape decoders to work through the tape, finding programs and decoding them.

import { Tape } from "Tape";
import { LowSpeedTapeDecoder } from "LowSpeedTapeDecoder";
import { TapeDecoderState } from "TapeDecoderState";
import { Program } from "Program";
import { HZ, frameToTimestamp } from "AudioUtils";
import {TapeDecoder} from "./TapeDecoder";

export class Decoder {
    tape: Tape;

    constructor(tape: Tape) {
        this.tape = tape;
    }

    decode() {
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
                new LowSpeedTapeDecoder(),
                //       new HighSpeedTapeDecoder()
            ];

            const searchFrameStart = frame;
            let state = TapeDecoderState.UNDECIDED;
            for (; frame < samples.length && (state == TapeDecoderState.UNDECIDED || state == TapeDecoderState.DETECTED); frame++) {
                // Give the sample to all decoders in parallel.
                let detectedIndex = -1;
                for (let i = 0; i < tapeDecoders.length; i++) {
                    const tapeDecoder = tapeDecoders[i];

                    tapeDecoder.handleSample(this.tape, frame);

                    // See if it detected its encoding.
                    if (tapeDecoder.getState() != TapeDecoderState.UNDECIDED) {
                        detectedIndex = i;
                    }
                }

                // If any has detected, keep only that one and kill the rest.
                if (state == TapeDecoderState.UNDECIDED) {
                    if (detectedIndex != -1) {
                        const tapeDecoder = tapeDecoders[detectedIndex];

                        // See how long it took to find it. A large gap means a new track.
                        const leadTime = (frame - searchFrameStart) / HZ;
                        if (leadTime > 10 || programStartFrame == -1) {
                            trackNumber += 1;
                            copyNumber = 1;
                        }

                        programStartFrame = frame;
                        console.log("Decoder \"" + tapeDecoder.getName() + "\" detected " + trackNumber + "-" + copyNumber + " at " + frameToTimestamp(frame) + " after " + leadTime.toFixed(3) + " seconds.");

                        // Throw away the other decoders.
                        tapeDecoders = [
                            tapeDecoder
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
                    const program = new Program(trackNumber, copyNumber, programStartFrame, frame, tapeDecoders[0].getProgram());
                    this.tape.addProgram(program);
                    break;
            }

            copyNumber += 1;
            instanceNumber += 1;
        }
    }
}
