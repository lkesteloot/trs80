// Uses tape decoders to work through the tape, finding programs and decoding them.

"use strict";

define(["Tape", "LowSpeedTapeDecoder", "TapeDecoderState", "AudioUtils", "Program"], function (Tape, LowSpeedTapeDecoder, TapeDecoderState, AudioUtils, Program) {
    class Decoder {
        /**
         * 
         * @param {Tape} tape 
         */
        constructor(tape) {
            this.tape = tape;
        }

        decode() {
            var samples = this.tape.originalSamples.samplesList[0];
            var instanceNumber = 1;
            var trackNumber = 0;
            var copyNumber = 1;
            var frame = 0;
            var programStartFrame = -1;
            while (frame < samples.length) {
                console.log("--------------------------------------- " + instanceNumber);

                // Start out trying all decoders.
                var tapeDecoders = [
                    new LowSpeedTapeDecoder(),
                    //       new HighSpeedTapeDecoder()
                ];

                var searchFrameStart = frame;
                var state = TapeDecoderState.UNDECIDED;
                for (; frame < samples.length && (state == TapeDecoderState.UNDECIDED || state == TapeDecoderState.DETECTED); frame++) {
                    // Give the sample to all decoders in parallel.
                    var detectedIndex = -1;
                    for (var i = 0; i < tapeDecoders.length; i++) {
                        var tapeDecoder = tapeDecoders[i];

                        tapeDecoder.handleSample(this.tape, frame);

                        // See if it detected its encoding.
                        if (tapeDecoder.getState() != TapeDecoderState.UNDECIDED) {
                            detectedIndex = i;
                        }
                    }

                    // If any has detected, keep only that one and kill the rest.
                    if (state == TapeDecoderState.UNDECIDED) {
                        if (detectedIndex != -1) {
                            var tapeDecoder = tapeDecoders[detectedIndex];

                            // See how long it took to find it. A large gap means a new track.
                            var leadTime = (frame - searchFrameStart) / AudioUtils.HZ;
                            if (leadTime > 10 || programStartFrame == -1) {
                                trackNumber += 1;
                                copyNumber = 1;
                            }

                            programStartFrame = frame;
                            console.log("Decoder \"" + tapeDecoder.getName() + "\" detected " + trackNumber + "-" + copyNumber + " at " + AudioUtils.frameToTimestamp(frame) + " after " + leadTime.toFixed(3) + " seconds.");

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
                        console.log("Decoder detected an error; skipping program.");
                        var program = new Program(trackNumber, copyNumber, programStartFrame, tapeDecoders[0].getProgram());
                        this.tape.addProgram(program);
                        break;

                    case TapeDecoderState.FINISHED:
                        console.log("Found end of program at " + AudioUtils.frameToTimestamp(frame) + ".");
                        program = new Program(trackNumber, copyNumber, programStartFrame, tapeDecoders[0].getProgram());
                        this.tape.addProgram(program);
                        break;
                }

                copyNumber += 1;
                instanceNumber += 1;
            }
        }
    }

    return Decoder;
});