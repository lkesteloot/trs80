(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global.trs80CassetteReader = {}));
}(this, (function (exports) { 'use strict';

    /**
     * Convert a number to a string.
     *
     * @param n number to convert
     * @param base base of the number
     * @param size zero-pad to this many digits
     */
    function pad(n, base, size) {
        let s = n.toString(base);
        if (base === 16) {
            // I prefer upper case hex.
            s = s.toUpperCase();
        }
        while (s.length < size) {
            s = "0" + s;
        }
        return s;
    }

    // Expected HZ on tape.
    const HZ = 48000;
    /**
     * Simple high-pass filter.
     *
     * @param samples samples to filter.
     * @param size size of filter
     * @returns filtered samples.
     */
    function highPassFilter(samples, size) {
        const out = new Float32Array(samples.length);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i];
            if (i >= size) {
                sum -= samples[i - size];
            }
            // Subtract out the average of the last "size" samples (to estimate local DC component).
            out[i] = samples[i] - sum / size;
        }
        return out;
    }
    /**
     * @param frame the frame number to be described as a timestamp.
     * @param brief omit hour if zero, omit milliseconds and frame itself.
     */
    function frameToTimestamp(frame, brief) {
        const time = frame / HZ;
        let ms = Math.floor(time * 1000);
        let sec = Math.floor(ms / 1000);
        ms -= sec * 1000;
        let min = Math.floor(sec / 60);
        sec -= min * 60;
        const hour = Math.floor(min / 60);
        min -= hour * 60;
        if (brief) {
            return (hour !== 0 ? hour + ":" + pad(min, 10, 2) : min) + ":" + pad(sec, 10, 2);
        }
        else {
            return hour + ":" + pad(min, 10, 2) + ":" + pad(sec, 10, 2) + "." + pad(ms, 10, 3) + " (frame " + frame + ")";
        }
    }
    /**
     * Concatenate a list of audio samples into one.
     */
    function concatAudio(samplesList) {
        const length = samplesList.reduce((sum, samples) => sum + samples.length, 0);
        const allSamples = new Float32Array(length);
        let offset = 0;
        for (const samples of samplesList) {
            allSamples.set(samples, offset);
            offset += samples.length;
        }
        return allSamples;
    }

    /**
     * Information about one particular bit (its position and status).
     */
    class BitData {
        /**
         * Create an object representing a bit.
         *
         * @param startFrame the first frame, inclusive.
         * @param endFrame the last frame, inclusive.
         * @param bitType what kind of bit it is.
         */
        constructor(startFrame, endFrame, bitType) {
            this.startFrame = startFrame;
            this.endFrame = endFrame;
            this.bitType = bitType;
        }
    }

    /**
     * Information about a particular bit.
     */
    var BitType;
    (function (BitType) {
        /**
         * Represents a numerical zero (0).
         */
        BitType[BitType["ZERO"] = 0] = "ZERO";
        /**
         * Represents a numerical one (1).
         */
        BitType[BitType["ONE"] = 1] = "ONE";
        /**
         * Represents a start bit in a byte.
         */
        BitType[BitType["START"] = 2] = "START";
        /**
         * Represents an undecoded bit.
         */
        BitType[BitType["BAD"] = 3] = "BAD";
    })(BitType || (BitType = {}));

    // Enum for the state of a tape decoder.
    var TapeDecoderState;
    (function (TapeDecoderState) {
        /**
         * Decoder must start in UNDECIDED state.
         */
        TapeDecoderState[TapeDecoderState["UNDECIDED"] = 0] = "UNDECIDED";
        /**
         * Go from UNDECIDED to DETECTED once it's sure that the encoding is its own. This usually
         * happens at the end of the header.
         */
        TapeDecoderState[TapeDecoderState["DETECTED"] = 1] = "DETECTED";
        /**
         * Go from DETECTED to ERROR if an error is found (e.g., missing start bit).
         * Once in the ERROR state, the decoder won't be called again.
         */
        TapeDecoderState[TapeDecoderState["ERROR"] = 2] = "ERROR";
        /**
         * Go from DETECTED to FINISHED once the program is fully read.
         * Once in the FINISHED state, the decoder won't be given any more samples.
         */
        TapeDecoderState[TapeDecoderState["FINISHED"] = 3] = "FINISHED";
    })(TapeDecoderState || (TapeDecoderState = {}));

    // What distance away from 0 counts as "positive" (or, when negative, "negative").
    const THRESHOLD = 500 / 32768.0;
    // If we go this many frames without any crossing, then we can assume we're done.
    const MIN_SILENCE_FRAMES = 1000;
    /**
     * Decodes high-speed (1500 baud) cassettes.
     */
    class HighSpeedTapeDecoder {
        constructor() {
            this.state = TapeDecoderState.UNDECIDED;
            this.programBytes = [];
            this.oldSign = 0;
            this.cycleSize = 0;
            this.recentBits = 0;
            this.bitCount = 0;
            this.lastCrossingFrame = 0;
            this.bits = [];
        }
        getName() {
            return "high speed";
        }
        handleSample(tape, frame) {
            const samples = tape.lowSpeedSamples.samplesList[0];
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
                            // Just got a start bit. Must be zero.
                            let bitType;
                            if (this.bitCount === 1) {
                                if (bit) {
                                    console.log("Bad start bit at byte " + this.programBytes.length + ", " +
                                        frameToTimestamp(frame) + ", cycle size " + this.cycleSize + ".");
                                    this.state = TapeDecoderState.ERROR;
                                    bitType = BitType.BAD;
                                }
                                else {
                                    bitType = BitType.START;
                                }
                            }
                            else {
                                bitType = bit ? BitType.ONE : BitType.ZERO;
                            }
                            this.bits.push(new BitData(frame - this.cycleSize, frame, bitType));
                            // Got enough bits for a byte (including the start bit).
                            if (this.bitCount === 9) {
                                this.programBytes.push(this.recentBits & 0xFF);
                                this.bitCount = 0;
                            }
                        }
                        else {
                            // Detect end of header.
                            if ((this.recentBits & 0xFFFF) === 0x557F) {
                                this.state = TapeDecoderState.DETECTED;
                                // No start bit on first byte.
                                this.bitCount = 1;
                                this.recentBits = 0;
                            }
                        }
                    }
                    else if (this.state === TapeDecoderState.DETECTED &&
                        this.programBytes.length > 0 && this.cycleSize > 66) {
                        // 1.5 ms gap, end of recording.
                        // TODO pull this out of zero crossing.
                        this.state = TapeDecoderState.FINISHED;
                    }
                    // End of cycle, start a new one.
                    this.cycleSize = 0;
                }
            }
            else {
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
        getState() {
            return this.state;
        }
        getBinary() {
            const bytes = new Uint8Array(this.programBytes.length);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = this.programBytes[i];
            }
            return bytes;
        }
        getBits() {
            return this.bits;
        }
    }

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
    class LowSpeedTapeDecoder {
        constructor(invert) {
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
        /**
         * Differentiating filter to accentuate pulses.
         *
         * @param samples samples to filter.
         * @returns filtered samples.
         */
        static filterSamples(samples) {
            const out = new Float32Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                // Differentiate to accentuate a pulse. Pulse go positive, then negative,
                // with a space of PULSE_PEAK_DISTANCE, so subtracting those generates a large
                // positive value at the bottom of the pulse.
                out[i] = i >= PULSE_PEAK_DISTANCE ? samples[i - PULSE_PEAK_DISTANCE] - samples[i] : 0;
            }
            return out;
        }
        getName() {
            return "low speed";
        }
        handleSample(tape, frame) {
            const samples = tape.lowSpeedSamples.samplesList[0];
            const pulse = this.invert ? -samples[frame] : samples[frame];
            const timeDiff = frame - this.lastPulseFrame;
            const pulsing = timeDiff > PULSE_WIDTH && pulse >= this.pulseHeight / 3;
            // Keep track of the height of this pulse, to calibrate for the next one.
            if (timeDiff < PULSE_WIDTH) {
                this.pulseHeight = Math.max(this.pulseHeight, pulse);
            }
            if (this.state === TapeDecoderState.DETECTED && timeDiff > END_OF_PROGRAM_SILENCE) {
                // End of program.
                this.state = TapeDecoderState.FINISHED;
            }
            else if (pulsing) {
                const bit = timeDiff < BIT_DETERMINATOR;
                if (this.pulseCount++ === 1000) ;
                if (this.eatNextPulse) {
                    if (this.state === TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                        console.log("Warning: At bit of wrong value at " +
                            frameToTimestamp(frame) + ", diff = " + timeDiff + ", last = " +
                            frameToTimestamp(this.lastPulseFrame));
                        this.bits.push(new BitData(this.lastPulseFrame, frame, BitType.BAD));
                    }
                    else {
                        const lastBit = this.bits[this.bits.length - 1];
                        if (lastBit && lastBit.bitType === BitType.ONE && lastBit.endFrame === this.lastPulseFrame) {
                            // Merge with previous 1 bit.
                            lastBit.endFrame = frame;
                        }
                    }
                    this.eatNextPulse = false;
                    this.lenientFirstBit = false;
                }
                else {
                    // If we see a 1 in the header, reset the count. We want a bunch of consecutive zeros.
                    if (bit && this.state === TapeDecoderState.UNDECIDED && this.detectedZeros < MIN_HEADER_ZEROS) {
                        // Still not in header. Reset count.
                        this.detectedZeros = 0;
                    }
                    else {
                        if (bit) {
                            this.eatNextPulse = true;
                        }
                        else {
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
                        }
                        else {
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
        getState() {
            return this.state;
        }
        getBinary() {
            const bytes = new Uint8Array(this.programBytes.length);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = this.programBytes[i];
            }
            return bytes;
        }
        getBits() {
            return this.bits;
        }
    }

    /**
     * Samples that are pre-filtered so we can display them zoomed out quickly.
     */
    class DisplaySamples {
        constructor(samples) {
            this.samplesList = [samples];
            this.filterDown();
        }
        /**
         * Sample down for quick display.
         */
        filterDown() {
            while (this.samplesList[this.samplesList.length - 1].length > 1) {
                const samples = this.samplesList[this.samplesList.length - 1];
                const half = Math.ceil(samples.length / 2);
                const down = new Float32Array(half);
                for (let i = 0; i < half; i++) {
                    const j = i * 2;
                    down[i] = j === samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
                }
                this.samplesList.push(down);
            }
        }
    }

    class Program {
        constructor(trackNumber, copyNumber, startFrame, endFrame, decoderName, binary, bits, reconstructedSamples) {
            this.trackNumber = trackNumber;
            this.copyNumber = copyNumber;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
            this.decoderName = decoderName;
            this.binary = binary;
            this.bits = bits;
            this.reconstructedSamples = new DisplaySamples(reconstructedSamples);
        }
        /**
         * Whether the binary represents a Basic program.
         */
        isBasicProgram() {
            return this.binary != null &&
                this.binary.length >= 3 &&
                this.binary[0] === 0xD3 &&
                this.binary[1] === 0xD3 &&
                this.binary[2] === 0xD3;
        }
    }

    /**
     * Length of a zero bit, in samples.
     */
    const ZERO_LENGTH = Math.round(0.00072 * HZ);
    /**
     * Length of a one bit, in samples.
     */
    const ONE_LENGTH = Math.round(0.00034 * HZ);
    /**
     * Samples representing a zero bit.
     */
    const ZERO = generateCycle(ZERO_LENGTH);
    /**
     * Samples representing a one bit.
     */
    const ONE = generateCycle(ONE_LENGTH);
    /**
     * Samples representing a long zero bit. This is the first start bit
     * after the end of the header. It's 1 ms longer than a regular zero.
     */
    const LONG_ZERO = generateCycle(ZERO_LENGTH + HZ / 1000);
    /**
     * The final cycle in the entire waveform, which is necessary
     * to force that last negative-to-positive transition (and interrupt).
     * We could just use a simple half cycle here, but it's nicer to do
     * something like the original analog.
     */
    const FINAL_HALF_CYCLE = generateFinalHalfCycle(ZERO_LENGTH * 3, ZERO);
    /**
     * Generate one cycle of a sine wave.
     * @param length number of samples in the full cycle.
     * @return audio samples for one cycle.
     */
    function generateCycle(length) {
        const audio = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            const t = 2 * Math.PI * i / length;
            // -0.5 to 0.5, matches recorded audio.
            audio[i] = Math.sin(t) / 2;
        }
        return audio;
    }
    /**
     * Generate a half cycle that fades off to zero instead of coming down hard to zero.
     *
     * @param length number of samples to generate.
     * @param previousBit the previous cycle, so we copy the ending slope.
     */
    function generateFinalHalfCycle(length, previousBit) {
        // Copy the slope of the end of the zero bit.
        const slope = previousBit[previousBit.length - 1] - previousBit[previousBit.length - 2];
        // Points on the Bezier.
        const x1 = 0;
        const y1 = 0;
        const y2 = 1.0;
        const x2 = (y2 - y1 + x1 * slope) / slope;
        const x3 = length / 2;
        const y3 = 0;
        const x4 = length - 1;
        const y4 = 0;
        // Generated audio;
        const audio = new Float32Array(length);
        // Go through Bezier in small steps.
        let position = 0;
        for (let i = 0; i <= 128; i++) {
            const t = i / 128.0;
            // Compute Bezier value.
            const x12 = x1 + (x2 - x1) * t;
            const y12 = y1 + (y2 - y1) * t;
            const x23 = x2 + (x3 - x2) * t;
            const y23 = y2 + (y3 - y2) * t;
            const x34 = x3 + (x4 - x3) * t;
            const y34 = y3 + (y4 - y3) * t;
            const x123 = x12 + (x23 - x12) * t;
            const y123 = y12 + (y23 - y12) * t;
            const x234 = x23 + (x34 - x23) * t;
            const y234 = y23 + (y34 - y23) * t;
            const x1234 = x123 + (x234 - x123) * t;
            const y1234 = y123 + (y234 - y123) * t;
            // Draw a crude horizontal line from the previous point.
            const newPosition = Math.min(Math.floor(x1234), length - 1);
            while (position <= newPosition) {
                audio[position] = y1234;
                position += 1;
            }
        }
        // Finish up anything left.
        while (position <= length - 1) {
            audio[position] = 0;
            position += 1;
        }
        return audio;
    }
    /**
     * Adds the byte "b" to the samples list, most significant bit first.
     * @param samplesList list of samples we're adding to.
     * @param b byte to generate.
     */
    function addByte(samplesList, b) {
        // MSb first.
        for (let i = 7; i >= 0; i--) {
            if ((b & (1 << i)) != 0) {
                samplesList.push(ONE);
            }
            else {
                samplesList.push(ZERO);
            }
        }
    }
    /**
     * Encode the sequence of bytes as an array of audio samples for high-speed (1500 baud) cassettes.
     */
    function encodeHighSpeed(bytes) {
        // List of samples.
        const samplesList = [];
        // Start with half a second of silence.
        samplesList.push(new Float32Array(HZ / 2));
        // Header of 0x55.
        for (let i = 0; i < 256; i++) {
            addByte(samplesList, 0x55);
        }
        // End of header.
        addByte(samplesList, 0x7F);
        // Write program.
        let firstStartBit = true;
        for (const b of bytes) {
            // Start bit.
            if (firstStartBit) {
                samplesList.push(LONG_ZERO);
                firstStartBit = false;
            }
            else {
                samplesList.push(ZERO);
            }
            addByte(samplesList, b);
        }
        // Finish off the last cycle, so that it generates an interrupt.
        samplesList.push(FINAL_HALF_CYCLE);
        // End with half a second of silence.
        samplesList.push(new Float32Array(HZ / 2));
        // Concatenate all samples.
        return concatAudio(samplesList);
    }

    // Uses tape decoders to work through the tape, finding programs and decoding them.
    class Decoder {
        constructor(tape) {
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
                let tapeDecoders = [
                    new LowSpeedTapeDecoder(true),
                    new LowSpeedTapeDecoder(false),
                    new HighSpeedTapeDecoder(),
                ];
                const searchFrameStart = frame;
                let state = TapeDecoderState.UNDECIDED;
                for (; frame < samples.length &&
                    (state === TapeDecoderState.UNDECIDED || state === TapeDecoderState.DETECTED); frame++) {
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
                    }
                    else {
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
                        }
                        else {
                            console.log("Found end of program at " + frameToTimestamp(frame) + ".");
                        }
                        let binary = tapeDecoders[0].getBinary();
                        const program = new Program(trackNumber, copyNumber, programStartFrame, frame, tapeDecoders[0].getName(), binary, tapeDecoders[0].getBits(), encodeHighSpeed(binary));
                        this.tape.addProgram(program);
                        break;
                }
                copyNumber += 1;
                instanceNumber += 1;
            }
        }
    }

    // Represents a recorded tape, with its audio samples,
    class Tape {
        /**
         * @param name text to display (e.g., "LOAD80-Feb82-s1").
         * @param samples original samples from the tape.
         * @param sampleRate the number of samples per second.
         */
        constructor(name, samples, sampleRate) {
            this.name = name;
            this.originalSamples = new DisplaySamples(samples);
            this.filteredSamples = new DisplaySamples(highPassFilter(samples, 500));
            this.lowSpeedSamples = new DisplaySamples(LowSpeedTapeDecoder.filterSamples(this.filteredSamples.samplesList[0]));
            this.sampleRate = sampleRate;
            this.programs = [];
        }
        addProgram(program) {
            this.programs.push(program);
        }
    }

    // Tools for decoding Basic programs.
    // Starts at 0x80.
    const TOKENS = [
        "END", "FOR", "RESET", "SET", "CLS", "CMD", "RANDOM", "NEXT",
        "DATA", "INPUT", "DIM", "READ", "LET", "GOTO", "RUN", "IF",
        "RESTORE", "GOSUB", "RETURN", "REM", "STOP", "ELSE", "TRON", "TROFF",
        "DEFSTR", "DEFINT", "DEFSNG", "DEFDBL", "LINE", "EDIT", "ERROR", "RESUME",
        "OUT", "ON", "OPEN", "FIELD", "GET", "PUT", "CLOSE", "LOAD",
        "MERGE", "NAME", "KILL", "LSET", "RSET", "SAVE", "SYSTEM", "LPRINT",
        "DEF", "POKE", "PRINT", "CONT", "LIST", "LLIST", "DELETE", "AUTO",
        "CLEAR", "CLOAD", "CSAVE", "NEW", "TAB(", "TO", "FN", "USING",
        "VARPTR", "USR", "ERL", "ERR", "STRING", "INSTR", "POINT", "TIME$",
        "MEM", "INKEY$", "THEN", "NOT", "STEP", "+", "-", "*",
        "/", "[", "AND", "OR", ">", "=", "<", "SGN",
        "INT", "ABS", "FRE", "INP", "POS", "SQR", "RND", "LOG",
        "EXP", "COS", "SIN", "TAN", "ATN", "PEEK", "CVI", "CVS",
        "CVD", "EOF", "LOC", "LOF", "MKI", "MKS$", "MKD$", "CINT",
        "CSNG", "CDBL", "FIX", "LEN", "STR$", "VAL", "ASC", "CHR$",
        "LEFT$", "RIGHT$", "MID$",
    ];
    const REM = 0x93;
    const DATA = 0x88;
    const REMQUOT = 0xFB;
    const ELSE = 0x95;
    const EOF = -1;
    /**
     * Parser state.
     */
    // Normal part of line.
    const NORMAL = 0;
    // Inside string literal.
    const STRING_LITERAL = 1;
    // After REM or DATA statement to end of line.
    const RAW = 2;
    // Just ate a colon.
    const COLON = 3;
    // Just ate a colon and a REM.
    const COLON_REM = 4;
    class ByteReader {
        constructor(b) {
            this.b = b;
            this.pos = 0;
        }
        /**
         * Return the next byte, or EOF on end of array.
         *
         * @returns {number}
         */
        read() {
            return this.pos < this.b.length ? this.b[this.pos++] : EOF;
        }
        /**
         * Reads a little-endian short (two-byte) integer.
         *
         * @param allowEofAfterFirstByte
         * @returns the integer, or EOF on end of file.
         */
        readShort(allowEofAfterFirstByte) {
            const low = this.read();
            if (low === EOF) {
                return EOF;
            }
            const high = this.read();
            if (high === EOF) {
                return allowEofAfterFirstByte ? low : EOF;
            }
            return low + high * 256;
        }
    }
    /**
     *
     * @param out the enclosing element to add to.
     * @param text the text to add.
     * @param className the name of the class for the item.
     */
    function add(out, text, className) {
        const e = document.createElement("span");
        e.innerText = text;
        e.classList.add(className);
        out.appendChild(e);
    }
    /**
     * Decode a tokenized Basic program.
     * @param bytes tokenized program.
     * @param out div to write result into.
     */
    function fromTokenized(bytes, out) {
        const b = new ByteReader(bytes);
        let state;
        if (b.read() !== 0xD3 || b.read() !== 0xD3 || b.read() !== 0xD3) {
            add(out, "Basic: missing magic -- not a BASIC file.", "error");
            return;
        }
        // One-byte ASCII program name. This is nearly always meaningless, so we do nothing with it.
        b.read();
        while (true) {
            const line = document.createElement("div");
            // Read the address of the next line. We ignore this (as does Basic when
            // loading programs), only using it to detect end of program. (In the real
            // Basic these are regenerated after loading.)
            const address = b.readShort(true);
            if (address === EOF) {
                add(line, "[EOF in next line's address]", "error");
                break;
            }
            // Zero address indicates end of program.
            if (address === 0) {
                break;
            }
            // Read current line number.
            const lineNumber = b.readShort(false);
            if (lineNumber === EOF) {
                add(line, "[EOF in line number]", "error");
                break;
            }
            add(line, lineNumber.toString() + " ", "line_number");
            // Read rest of line.
            let c; // Uint8 value.
            let ch; // String value.
            state = NORMAL;
            while (true) {
                c = b.read();
                if (c === EOF || c === 0) {
                    break;
                }
                ch = String.fromCharCode(c);
                // Detect the ":REM'" sequence (colon, REM, single quote), because
                // that translates to a single quote. Must be a backward-compatible
                // way to add a single quote as a comment.
                if (ch === ":" && state === NORMAL) {
                    state = COLON;
                }
                else if (ch === ":" && state === COLON) {
                    add(line, ":", "punctuation");
                }
                else if (c === REM && state === COLON) {
                    state = COLON_REM;
                }
                else if (c === REMQUOT && state === COLON_REM) {
                    add(line, "'", "comment");
                    state = RAW;
                }
                else if (c === ELSE && state === COLON) {
                    add(line, "ELSE", "keyword");
                    state = NORMAL;
                }
                else {
                    if (state === COLON || state === COLON_REM) {
                        add(line, ":", "punctuation");
                        if (state === COLON_REM) {
                            add(line, "REM", "comment");
                            state = RAW;
                        }
                        else {
                            state = NORMAL;
                        }
                    }
                    switch (state) {
                        case NORMAL:
                            if (c >= 128 && c < 128 + TOKENS.length) {
                                const token = TOKENS[c - 128];
                                add(line, token, c === DATA || c === REM ? "comment"
                                    : token.length === 1 ? "punctuation"
                                        : "keyword");
                            }
                            else {
                                add(line, ch, ch === '"' ? "string" : "regular");
                            }
                            if (c === DATA || c === REM) {
                                state = RAW;
                            }
                            else if (ch === '"') {
                                state = STRING_LITERAL;
                            }
                            break;
                        case STRING_LITERAL:
                            if (ch === "\r") {
                                add(line, "\\n", "punctuation");
                            }
                            else if (ch === "\\") {
                                add(line, "\\" + pad(c, 8, 3), "punctuation");
                            }
                            else if (c >= 32 && c < 128) {
                                add(line, ch, "string");
                            }
                            else {
                                add(line, "\\" + pad(c, 8, 3), "punctuation");
                            }
                            if (ch === '"') {
                                // End of string.
                                state = NORMAL;
                            }
                            break;
                        case RAW:
                            add(line, ch, "comment");
                            break;
                    }
                }
            }
            if (c === EOF) {
                add(line, "[EOF in line]", "error");
                break;
            }
            // Deal with eaten tokens.
            if (state === COLON || state === COLON_REM) {
                add(line, ":", "punctuation");
                if (state === COLON_REM) {
                    add(line, "REM", "comment");
                }
                /// state = NORMAL;
            }
            out.appendChild(line);
        }
    }

    /**
     * Interface for fetching cassette audio data. We make this a concrete
     * class because rollup.js can't handle exported interfaces.
     */
    class Cassette {
        constructor() {
            /**
             * The number of samples per second that this audio represents.
             */
            this.samplesPerSecond = 44100;
        }
        /**
         * Called when the motor starts.
         */
        onMotorStart() {
            // Optional function.
        }
        /**
         * Read the next sample. Must be in the range -1 to 1. If we try to read off
         * the end of the cassette, just return zero.
         */
        readSample() {
            return 0;
        }
        /**
         * Called when the motor stops.
         */
        onMotorStop() {
            // Optional function.
        }
    }

    // Various utility functions.
    /**
     * Convert a number to hex and zero-pad to the specified number of hex digits.
     */
    function toHex(value, digits) {
        let s = value.toString(16).toUpperCase();
        while (s.length < digits) {
            s = "0" + s;
        }
        return s;
    }
    /**
     * Return the high byte of a word.
     */
    function hi(value) {
        return (value >> 8) & 0xFF;
    }
    /**
     * Return the low byte of a word.
     */
    function lo(value) {
        return value & 0xFF;
    }
    /**
     * Create a word from a high and low byte.
     */
    function word(highByte, lowByte) {
        return ((highByte & 0xFF) << 8) | (lowByte & 0xFF);
    }
    /**
     * Increment a byte.
     */
    function inc8(value) {
        return add8(value, 1);
    }
    /**
     * Increment a word.
     */
    function inc16(value) {
        return add16(value, 1);
    }
    /**
     * Decrement a byte.
     */
    function dec8(value) {
        return sub8(value, 1);
    }
    /**
     * Decrement a word.
     */
    function dec16(value) {
        return sub16(value, 1);
    }
    /**
     * Add two bytes together.
     */
    function add8(a, b) {
        return (a + b) & 0xFF;
    }
    /**
     * Add two words together.
     */
    function add16(a, b) {
        return (a + b) & 0xFFFF;
    }
    /**
     * Subtract two bytes.
     */
    function sub8(a, b) {
        return (a - b) & 0xFF;
    }
    /**
     * Subtract two words.
     */
    function sub16(a, b) {
        return (a - b) & 0xFFFF;
    }
    /**
     * Convert a byte to a signed number (e.g., 0xff to -1).
     */
    function signedByte(value) {
        return value >= 128 ? value - 256 : value;
    }

    /**
     * All registers in a Z80.
     */
    class RegisterSet {
        constructor() {
            // External state:
            this.af = 0;
            this.bc = 0;
            this.de = 0;
            this.hl = 0;
            this.afPrime = 0;
            this.bcPrime = 0;
            this.dePrime = 0;
            this.hlPrime = 0;
            this.ix = 0;
            this.iy = 0;
            this.sp = 0;
            this.pc = 0;
            // Internal state:
            this.memptr = 0;
            this.i = 0;
            this.r = 0; // Low 7 bits of R.
            this.r7 = 0; // Bit 7 of R.
            this.iff1 = 0;
            this.iff2 = 0;
            this.im = 0;
            this.halted = 0;
        }
        get a() {
            return hi(this.af);
        }
        set a(value) {
            this.af = word(value, this.f);
        }
        get f() {
            return lo(this.af);
        }
        set f(value) {
            this.af = word(this.a, value);
        }
        get b() {
            return hi(this.bc);
        }
        set b(value) {
            this.bc = word(value, this.c);
        }
        get c() {
            return lo(this.bc);
        }
        set c(value) {
            this.bc = word(this.b, value);
        }
        get d() {
            return hi(this.de);
        }
        set d(value) {
            this.de = word(value, this.e);
        }
        get e() {
            return lo(this.de);
        }
        set e(value) {
            this.de = word(this.d, value);
        }
        get h() {
            return hi(this.hl);
        }
        set h(value) {
            this.hl = word(value, this.l);
        }
        get l() {
            return lo(this.hl);
        }
        set l(value) {
            this.hl = word(this.h, value);
        }
        get ixh() {
            return hi(this.ix);
        }
        set ixh(value) {
            this.ix = word(value, this.ixl);
        }
        get ixl() {
            return lo(this.ix);
        }
        set ixl(value) {
            this.ix = word(this.ixh, value);
        }
        get iyh() {
            return hi(this.iy);
        }
        set iyh(value) {
            this.iy = word(value, this.iyl);
        }
        get iyl() {
            return lo(this.iy);
        }
        set iyl(value) {
            this.iy = word(this.iyh, value);
        }
        /**
         * Combine the two R parts together.
         */
        get rCombined() {
            return (this.r7 & 0x80) | (this.r & 0xF7);
        }
    }

    /**
     * The flag bits in the F register.
     */
    var Flag;
    (function (Flag) {
        /**
         * Carry and borrow. Indicates that the addition or subtraction did not
         * fit in the register.
         */
        Flag[Flag["C"] = 1] = "C";
        /**
         * Set if the last operation was a subtraction.
         */
        Flag[Flag["N"] = 2] = "N";
        /**
         * Parity: Indicates that the result has an even number of bits set.
         */
        Flag[Flag["P"] = 4] = "P";
        /**
         * Overflow: Indicates that two's complement does not fit in register.
         */
        Flag[Flag["V"] = 4] = "V";
        /**
         * Undocumented bit, but internal state can leak into it.
         */
        Flag[Flag["X3"] = 8] = "X3";
        /**
         * Half carry: Carry from bit 3 to bit 4 during BCD operations.
         */
        Flag[Flag["H"] = 16] = "H";
        /**
         * Undocumented bit, but internal state can leak into it.
         */
        Flag[Flag["X5"] = 32] = "X5";
        /**
         * Set if value is zero.
         */
        Flag[Flag["Z"] = 64] = "Z";
        /**
         * Set of value is negative.
         */
        Flag[Flag["S"] = 128] = "S";
    })(Flag || (Flag = {}));

    // Do not modify. This file is generated by GenerateOpcodes.ts.
    // Tables for computing flags after an operation.
    const halfCarryAddTable = [0, Flag.H, Flag.H, Flag.H, 0, 0, 0, Flag.H];
    const halfCarrySubTable = [0, 0, Flag.H, 0, Flag.H, 0, Flag.H, Flag.H];
    const overflowAddTable = [0, 0, 0, Flag.V, Flag.V, 0, 0, 0];
    const overflowSubTable = [0, Flag.V, 0, 0, 0, 0, Flag.V, 0];
    /**
     * Fetch an instruction for decode.
     */
    function fetchInstruction(z80) {
        z80.incTStateCount(4);
        const inst = z80.readByteInternal(z80.regs.pc);
        z80.regs.pc = (z80.regs.pc + 1) & 0xFFFF;
        z80.regs.r = (z80.regs.r + 1) & 0xFF;
        return inst;
    }
    /**
     * Decode the "CB" prefix (bit instructions).
     */
    function decodeCB(z80) {
        const inst = fetchInstruction(z80);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x00: { // rlc b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x01: { // rlc c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x02: { // rlc d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x03: { // rlc e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x04: { // rlc h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x05: { // rlc l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x06: { // rlc (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x07: { // rlc a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x08: { // rrc b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x09: { // rrc c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x0A: { // rrc d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x0B: { // rrc e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x0C: { // rrc h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x0D: { // rrc l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x0E: { // rrc (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x0F: { // rrc a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x10: { // rl b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x11: { // rl c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x12: { // rl d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x13: { // rl e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x14: { // rl h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x15: { // rl l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x16: { // rl (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x17: { // rl a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x18: { // rr b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x19: { // rr c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x1A: { // rr d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x1B: { // rr e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x1C: { // rr h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x1D: { // rr l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x1E: { // rr (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x1F: { // rr a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x20: { // sla b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x21: { // sla c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x22: { // sla d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x23: { // sla e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x24: { // sla h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x25: { // sla l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x26: { // sla (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x27: { // sla a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x28: { // sra b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x29: { // sra c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x2A: { // sra d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x2B: { // sra e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x2C: { // sra h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x2D: { // sra l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x2E: { // sra (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x2F: { // sra a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x30: { // sll b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x31: { // sll c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x32: { // sll d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x33: { // sll e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x34: { // sll h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x35: { // sll l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x36: { // sll (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x37: { // sll a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x38: { // srl b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.b = value;
                break;
            }
            case 0x39: { // srl c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.c = value;
                break;
            }
            case 0x3A: { // srl d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.d = value;
                break;
            }
            case 0x3B: { // srl e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.e = value;
                break;
            }
            case 0x3C: { // srl h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.h = value;
                break;
            }
            case 0x3D: { // srl l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.l = value;
                break;
            }
            case 0x3E: { // srl (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x3F: { // srl a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.regs.a = value;
                break;
            }
            case 0x40: { // bit 0,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x41: { // bit 0,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x42: { // bit 0,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x43: { // bit 0,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x44: { // bit 0,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x45: { // bit 0,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x46: { // bit 0,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x47: { // bit 0,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x48: { // bit 1,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x49: { // bit 1,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4A: { // bit 1,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4B: { // bit 1,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4C: { // bit 1,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4D: { // bit 1,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4E: { // bit 1,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x4F: { // bit 1,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x50: { // bit 2,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x51: { // bit 2,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x52: { // bit 2,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x53: { // bit 2,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x54: { // bit 2,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x55: { // bit 2,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x56: { // bit 2,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x57: { // bit 2,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x58: { // bit 3,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x59: { // bit 3,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5A: { // bit 3,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5B: { // bit 3,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5C: { // bit 3,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5D: { // bit 3,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5E: { // bit 3,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x5F: { // bit 3,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x60: { // bit 4,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x61: { // bit 4,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x62: { // bit 4,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x63: { // bit 4,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x64: { // bit 4,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x65: { // bit 4,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x66: { // bit 4,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x67: { // bit 4,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x68: { // bit 5,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x69: { // bit 5,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6A: { // bit 5,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6B: { // bit 5,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6C: { // bit 5,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6D: { // bit 5,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6E: { // bit 5,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x6F: { // bit 5,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x70: { // bit 6,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x71: { // bit 6,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x72: { // bit 6,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x73: { // bit 6,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x74: { // bit 6,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x75: { // bit 6,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x76: { // bit 6,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x77: { // bit 6,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x78: { // bit 7,b
                const value = z80.regs.b;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x79: { // bit 7,c
                const value = z80.regs.c;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7A: { // bit 7,d
                const value = z80.regs.d;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7B: { // bit 7,e
                const value = z80.regs.e;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7C: { // bit 7,h
                const value = z80.regs.h;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7D: { // bit 7,l
                const value = z80.regs.l;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7E: { // bit 7,(hl)
                const value = z80.readByte(z80.regs.hl);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x7F: { // bit 7,a
                const value = z80.regs.a;
                const hiddenValue = value;
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x80: { // res 0,b
                z80.regs.b &= 0xFE;
                break;
            }
            case 0x81: { // res 0,c
                z80.regs.c &= 0xFE;
                break;
            }
            case 0x82: { // res 0,d
                z80.regs.d &= 0xFE;
                break;
            }
            case 0x83: { // res 0,e
                z80.regs.e &= 0xFE;
                break;
            }
            case 0x84: { // res 0,h
                z80.regs.h &= 0xFE;
                break;
            }
            case 0x85: { // res 0,l
                z80.regs.l &= 0xFE;
                break;
            }
            case 0x86: { // res 0,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xFE);
                break;
            }
            case 0x87: { // res 0,a
                z80.regs.a &= 0xFE;
                break;
            }
            case 0x88: { // res 1,b
                z80.regs.b &= 0xFD;
                break;
            }
            case 0x89: { // res 1,c
                z80.regs.c &= 0xFD;
                break;
            }
            case 0x8A: { // res 1,d
                z80.regs.d &= 0xFD;
                break;
            }
            case 0x8B: { // res 1,e
                z80.regs.e &= 0xFD;
                break;
            }
            case 0x8C: { // res 1,h
                z80.regs.h &= 0xFD;
                break;
            }
            case 0x8D: { // res 1,l
                z80.regs.l &= 0xFD;
                break;
            }
            case 0x8E: { // res 1,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xFD);
                break;
            }
            case 0x8F: { // res 1,a
                z80.regs.a &= 0xFD;
                break;
            }
            case 0x90: { // res 2,b
                z80.regs.b &= 0xFB;
                break;
            }
            case 0x91: { // res 2,c
                z80.regs.c &= 0xFB;
                break;
            }
            case 0x92: { // res 2,d
                z80.regs.d &= 0xFB;
                break;
            }
            case 0x93: { // res 2,e
                z80.regs.e &= 0xFB;
                break;
            }
            case 0x94: { // res 2,h
                z80.regs.h &= 0xFB;
                break;
            }
            case 0x95: { // res 2,l
                z80.regs.l &= 0xFB;
                break;
            }
            case 0x96: { // res 2,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xFB);
                break;
            }
            case 0x97: { // res 2,a
                z80.regs.a &= 0xFB;
                break;
            }
            case 0x98: { // res 3,b
                z80.regs.b &= 0xF7;
                break;
            }
            case 0x99: { // res 3,c
                z80.regs.c &= 0xF7;
                break;
            }
            case 0x9A: { // res 3,d
                z80.regs.d &= 0xF7;
                break;
            }
            case 0x9B: { // res 3,e
                z80.regs.e &= 0xF7;
                break;
            }
            case 0x9C: { // res 3,h
                z80.regs.h &= 0xF7;
                break;
            }
            case 0x9D: { // res 3,l
                z80.regs.l &= 0xF7;
                break;
            }
            case 0x9E: { // res 3,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xF7);
                break;
            }
            case 0x9F: { // res 3,a
                z80.regs.a &= 0xF7;
                break;
            }
            case 0xA0: { // res 4,b
                z80.regs.b &= 0xEF;
                break;
            }
            case 0xA1: { // res 4,c
                z80.regs.c &= 0xEF;
                break;
            }
            case 0xA2: { // res 4,d
                z80.regs.d &= 0xEF;
                break;
            }
            case 0xA3: { // res 4,e
                z80.regs.e &= 0xEF;
                break;
            }
            case 0xA4: { // res 4,h
                z80.regs.h &= 0xEF;
                break;
            }
            case 0xA5: { // res 4,l
                z80.regs.l &= 0xEF;
                break;
            }
            case 0xA6: { // res 4,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xEF);
                break;
            }
            case 0xA7: { // res 4,a
                z80.regs.a &= 0xEF;
                break;
            }
            case 0xA8: { // res 5,b
                z80.regs.b &= 0xDF;
                break;
            }
            case 0xA9: { // res 5,c
                z80.regs.c &= 0xDF;
                break;
            }
            case 0xAA: { // res 5,d
                z80.regs.d &= 0xDF;
                break;
            }
            case 0xAB: { // res 5,e
                z80.regs.e &= 0xDF;
                break;
            }
            case 0xAC: { // res 5,h
                z80.regs.h &= 0xDF;
                break;
            }
            case 0xAD: { // res 5,l
                z80.regs.l &= 0xDF;
                break;
            }
            case 0xAE: { // res 5,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xDF);
                break;
            }
            case 0xAF: { // res 5,a
                z80.regs.a &= 0xDF;
                break;
            }
            case 0xB0: { // res 6,b
                z80.regs.b &= 0xBF;
                break;
            }
            case 0xB1: { // res 6,c
                z80.regs.c &= 0xBF;
                break;
            }
            case 0xB2: { // res 6,d
                z80.regs.d &= 0xBF;
                break;
            }
            case 0xB3: { // res 6,e
                z80.regs.e &= 0xBF;
                break;
            }
            case 0xB4: { // res 6,h
                z80.regs.h &= 0xBF;
                break;
            }
            case 0xB5: { // res 6,l
                z80.regs.l &= 0xBF;
                break;
            }
            case 0xB6: { // res 6,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0xBF);
                break;
            }
            case 0xB7: { // res 6,a
                z80.regs.a &= 0xBF;
                break;
            }
            case 0xB8: { // res 7,b
                z80.regs.b &= 0x7F;
                break;
            }
            case 0xB9: { // res 7,c
                z80.regs.c &= 0x7F;
                break;
            }
            case 0xBA: { // res 7,d
                z80.regs.d &= 0x7F;
                break;
            }
            case 0xBB: { // res 7,e
                z80.regs.e &= 0x7F;
                break;
            }
            case 0xBC: { // res 7,h
                z80.regs.h &= 0x7F;
                break;
            }
            case 0xBD: { // res 7,l
                z80.regs.l &= 0x7F;
                break;
            }
            case 0xBE: { // res 7,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value & 0x7F);
                break;
            }
            case 0xBF: { // res 7,a
                z80.regs.a &= 0x7F;
                break;
            }
            case 0xC0: { // set 0,b
                z80.regs.b |= 0x01;
                break;
            }
            case 0xC1: { // set 0,c
                z80.regs.c |= 0x01;
                break;
            }
            case 0xC2: { // set 0,d
                z80.regs.d |= 0x01;
                break;
            }
            case 0xC3: { // set 0,e
                z80.regs.e |= 0x01;
                break;
            }
            case 0xC4: { // set 0,h
                z80.regs.h |= 0x01;
                break;
            }
            case 0xC5: { // set 0,l
                z80.regs.l |= 0x01;
                break;
            }
            case 0xC6: { // set 0,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x01);
                break;
            }
            case 0xC7: { // set 0,a
                z80.regs.a |= 0x01;
                break;
            }
            case 0xC8: { // set 1,b
                z80.regs.b |= 0x02;
                break;
            }
            case 0xC9: { // set 1,c
                z80.regs.c |= 0x02;
                break;
            }
            case 0xCA: { // set 1,d
                z80.regs.d |= 0x02;
                break;
            }
            case 0xCB: { // set 1,e
                z80.regs.e |= 0x02;
                break;
            }
            case 0xCC: { // set 1,h
                z80.regs.h |= 0x02;
                break;
            }
            case 0xCD: { // set 1,l
                z80.regs.l |= 0x02;
                break;
            }
            case 0xCE: { // set 1,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x02);
                break;
            }
            case 0xCF: { // set 1,a
                z80.regs.a |= 0x02;
                break;
            }
            case 0xD0: { // set 2,b
                z80.regs.b |= 0x04;
                break;
            }
            case 0xD1: { // set 2,c
                z80.regs.c |= 0x04;
                break;
            }
            case 0xD2: { // set 2,d
                z80.regs.d |= 0x04;
                break;
            }
            case 0xD3: { // set 2,e
                z80.regs.e |= 0x04;
                break;
            }
            case 0xD4: { // set 2,h
                z80.regs.h |= 0x04;
                break;
            }
            case 0xD5: { // set 2,l
                z80.regs.l |= 0x04;
                break;
            }
            case 0xD6: { // set 2,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x04);
                break;
            }
            case 0xD7: { // set 2,a
                z80.regs.a |= 0x04;
                break;
            }
            case 0xD8: { // set 3,b
                z80.regs.b |= 0x08;
                break;
            }
            case 0xD9: { // set 3,c
                z80.regs.c |= 0x08;
                break;
            }
            case 0xDA: { // set 3,d
                z80.regs.d |= 0x08;
                break;
            }
            case 0xDB: { // set 3,e
                z80.regs.e |= 0x08;
                break;
            }
            case 0xDC: { // set 3,h
                z80.regs.h |= 0x08;
                break;
            }
            case 0xDD: { // set 3,l
                z80.regs.l |= 0x08;
                break;
            }
            case 0xDE: { // set 3,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x08);
                break;
            }
            case 0xDF: { // set 3,a
                z80.regs.a |= 0x08;
                break;
            }
            case 0xE0: { // set 4,b
                z80.regs.b |= 0x10;
                break;
            }
            case 0xE1: { // set 4,c
                z80.regs.c |= 0x10;
                break;
            }
            case 0xE2: { // set 4,d
                z80.regs.d |= 0x10;
                break;
            }
            case 0xE3: { // set 4,e
                z80.regs.e |= 0x10;
                break;
            }
            case 0xE4: { // set 4,h
                z80.regs.h |= 0x10;
                break;
            }
            case 0xE5: { // set 4,l
                z80.regs.l |= 0x10;
                break;
            }
            case 0xE6: { // set 4,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x10);
                break;
            }
            case 0xE7: { // set 4,a
                z80.regs.a |= 0x10;
                break;
            }
            case 0xE8: { // set 5,b
                z80.regs.b |= 0x20;
                break;
            }
            case 0xE9: { // set 5,c
                z80.regs.c |= 0x20;
                break;
            }
            case 0xEA: { // set 5,d
                z80.regs.d |= 0x20;
                break;
            }
            case 0xEB: { // set 5,e
                z80.regs.e |= 0x20;
                break;
            }
            case 0xEC: { // set 5,h
                z80.regs.h |= 0x20;
                break;
            }
            case 0xED: { // set 5,l
                z80.regs.l |= 0x20;
                break;
            }
            case 0xEE: { // set 5,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x20);
                break;
            }
            case 0xEF: { // set 5,a
                z80.regs.a |= 0x20;
                break;
            }
            case 0xF0: { // set 6,b
                z80.regs.b |= 0x40;
                break;
            }
            case 0xF1: { // set 6,c
                z80.regs.c |= 0x40;
                break;
            }
            case 0xF2: { // set 6,d
                z80.regs.d |= 0x40;
                break;
            }
            case 0xF3: { // set 6,e
                z80.regs.e |= 0x40;
                break;
            }
            case 0xF4: { // set 6,h
                z80.regs.h |= 0x40;
                break;
            }
            case 0xF5: { // set 6,l
                z80.regs.l |= 0x40;
                break;
            }
            case 0xF6: { // set 6,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x40);
                break;
            }
            case 0xF7: { // set 6,a
                z80.regs.a |= 0x40;
                break;
            }
            case 0xF8: { // set 7,b
                z80.regs.b |= 0x80;
                break;
            }
            case 0xF9: { // set 7,c
                z80.regs.c |= 0x80;
                break;
            }
            case 0xFA: { // set 7,d
                z80.regs.d |= 0x80;
                break;
            }
            case 0xFB: { // set 7,e
                z80.regs.e |= 0x80;
                break;
            }
            case 0xFC: { // set 7,h
                z80.regs.h |= 0x80;
                break;
            }
            case 0xFD: { // set 7,l
                z80.regs.l |= 0x80;
                break;
            }
            case 0xFE: { // set 7,(hl)
                const value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.hl, value | 0x80);
                break;
            }
            case 0xFF: { // set 7,a
                z80.regs.a |= 0x80;
                break;
            }
            default:
                console.log("Unhandled opcode in CB: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the "DD" prefix (IX instructions).
     */
    function decodeDD(z80) {
        const inst = fetchInstruction(z80);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x09: { // add ix,bc
                let value;
                z80.incTStateCount(7);
                value = z80.regs.bc;
                let result = z80.regs.ix + value;
                const lookup = (((z80.regs.ix & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.ix);
                z80.regs.ix = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x19: { // add ix,de
                let value;
                z80.incTStateCount(7);
                value = z80.regs.de;
                let result = z80.regs.ix + value;
                const lookup = (((z80.regs.ix & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.ix);
                z80.regs.ix = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x21: { // ld ix,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.ix = value;
                break;
            }
            case 0x22: { // ld (nnnn),ix
                let value;
                value = z80.regs.ix;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x23: { // inc ix
                let value;
                value = z80.regs.ix;
                value = inc16(value);
                z80.regs.ix = value;
                break;
            }
            case 0x24: { // inc ixh
                let value;
                value = z80.regs.ixh;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.ixh = value;
                break;
            }
            case 0x25: { // dec ixh
                let value;
                value = z80.regs.ixh;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.ixh = value;
                break;
            }
            case 0x26: { // ld ixh,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.ixh = value;
                break;
            }
            case 0x29: { // add ix,ix
                let value;
                z80.incTStateCount(7);
                value = z80.regs.ix;
                let result = z80.regs.ix + value;
                const lookup = (((z80.regs.ix & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.ix);
                z80.regs.ix = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x2A: { // ld ix,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.ix = value;
                break;
            }
            case 0x2B: { // dec ix
                let value;
                value = z80.regs.ix;
                value = dec16(value);
                z80.regs.ix = value;
                break;
            }
            case 0x2C: { // inc ixl
                let value;
                value = z80.regs.ixl;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.ixl = value;
                break;
            }
            case 0x2D: { // dec ixl
                let value;
                value = z80.regs.ixl;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.ixl = value;
                break;
            }
            case 0x2E: { // ld ixl,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.ixl = value;
                break;
            }
            case 0x34: { // inc (ix+dd)
                let value;
                const offset = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = add16(z80.regs.ix, signedByte(offset));
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x35: { // dec (ix+dd)
                let value;
                const offset = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = add16(z80.regs.ix, signedByte(offset));
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x36: { // ld (ix+dd),nn
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x39: { // add ix,sp
                let value;
                z80.incTStateCount(7);
                value = z80.regs.sp;
                let result = z80.regs.ix + value;
                const lookup = (((z80.regs.ix & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.ix);
                z80.regs.ix = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x44: { // ld b,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.b = value;
                break;
            }
            case 0x45: { // ld b,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.b = value;
                break;
            }
            case 0x46: { // ld b,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.b = value;
                break;
            }
            case 0x4C: { // ld c,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.c = value;
                break;
            }
            case 0x4D: { // ld c,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.c = value;
                break;
            }
            case 0x4E: { // ld c,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.c = value;
                break;
            }
            case 0x54: { // ld d,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.d = value;
                break;
            }
            case 0x55: { // ld d,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.d = value;
                break;
            }
            case 0x56: { // ld d,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.d = value;
                break;
            }
            case 0x5C: { // ld e,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.e = value;
                break;
            }
            case 0x5D: { // ld e,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.e = value;
                break;
            }
            case 0x5E: { // ld e,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.e = value;
                break;
            }
            case 0x60: { // ld ixh,b
                let value;
                value = z80.regs.b;
                z80.regs.ixh = value;
                break;
            }
            case 0x61: { // ld ixh,c
                let value;
                value = z80.regs.c;
                z80.regs.ixh = value;
                break;
            }
            case 0x62: { // ld ixh,d
                let value;
                value = z80.regs.d;
                z80.regs.ixh = value;
                break;
            }
            case 0x63: { // ld ixh,e
                let value;
                value = z80.regs.e;
                z80.regs.ixh = value;
                break;
            }
            case 0x64: { // ld ixh,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.ixh = value;
                break;
            }
            case 0x65: { // ld ixh,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.ixh = value;
                break;
            }
            case 0x66: { // ld h,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.h = value;
                break;
            }
            case 0x67: { // ld ixh,a
                let value;
                value = z80.regs.a;
                z80.regs.ixh = value;
                break;
            }
            case 0x68: { // ld ixl,b
                let value;
                value = z80.regs.b;
                z80.regs.ixl = value;
                break;
            }
            case 0x69: { // ld ixl,c
                let value;
                value = z80.regs.c;
                z80.regs.ixl = value;
                break;
            }
            case 0x6A: { // ld ixl,d
                let value;
                value = z80.regs.d;
                z80.regs.ixl = value;
                break;
            }
            case 0x6B: { // ld ixl,e
                let value;
                value = z80.regs.e;
                z80.regs.ixl = value;
                break;
            }
            case 0x6C: { // ld ixl,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.ixl = value;
                break;
            }
            case 0x6D: { // ld ixl,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.ixl = value;
                break;
            }
            case 0x6E: { // ld l,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.l = value;
                break;
            }
            case 0x6F: { // ld ixl,a
                let value;
                value = z80.regs.a;
                z80.regs.ixl = value;
                break;
            }
            case 0x70: { // ld (ix+dd),b
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.b;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x71: { // ld (ix+dd),c
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.c;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x72: { // ld (ix+dd),d
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.d;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x73: { // ld (ix+dd),e
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.e;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x74: { // ld (ix+dd),h
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.h;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x75: { // ld (ix+dd),l
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.l;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x77: { // ld (ix+dd),a
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.a;
                z80.regs.memptr = (z80.regs.ix + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x7C: { // ld a,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.a = value;
                break;
            }
            case 0x7D: { // ld a,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.a = value;
                break;
            }
            case 0x7E: { // ld a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a = value;
                break;
            }
            case 0x84: { // add a,ixh
                let value;
                value = z80.regs.ixh;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x85: { // add a,ixl
                let value;
                value = z80.regs.ixl;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x86: { // add a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8C: { // adc a,ixh
                let value;
                value = z80.regs.ixh;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8D: { // adc a,ixl
                let value;
                value = z80.regs.ixl;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8E: { // adc a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x94: { // sub a,ixh
                let value;
                value = z80.regs.ixh;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x95: { // sub a,ixl
                let value;
                value = z80.regs.ixl;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x96: { // sub a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9C: { // sbc a,ixh
                let value;
                value = z80.regs.ixh;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9D: { // sbc a,ixl
                let value;
                value = z80.regs.ixl;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9E: { // sbc a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xA4: { // and a,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA5: { // and a,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA6: { // and a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xAC: { // xor a,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAD: { // xor a,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAE: { // xor a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB4: { // or a,ixh
                let value;
                value = z80.regs.ixh;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB5: { // or a,ixl
                let value;
                value = z80.regs.ixl;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB6: { // or a,(ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xBC: { // cp ixh
                let value;
                value = z80.regs.ixh;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBD: { // cp ixl
                let value;
                value = z80.regs.ixl;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBE: { // cp (ix+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.ix + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xCB: { // shift ddcb
                decodeDDCB(z80);
                break;
            }
            case 0xE1: { // pop ix
                z80.regs.ix = z80.popWord();
                break;
            }
            case 0xE3: { // ex (sp),ix
                const rightValue = z80.regs.ix;
                const leftValueL = z80.readByte(z80.regs.sp);
                const leftValueH = z80.readByte(inc16(z80.regs.sp));
                z80.incTStateCount(1);
                z80.writeByte(inc16(z80.regs.sp), hi(rightValue));
                z80.writeByte(z80.regs.sp, lo(rightValue));
                z80.incTStateCount(2);
                z80.regs.memptr = word(leftValueH, leftValueL);
                z80.regs.ix = word(leftValueH, leftValueL);
                break;
            }
            case 0xE5: { // push ix
                z80.pushWord(z80.regs.ix);
                break;
            }
            case 0xE9: { // jp ix
                z80.regs.pc = z80.regs.ix;
                break;
            }
            case 0xF9: { // ld sp,ix
                let value;
                value = z80.regs.ix;
                z80.regs.sp = value;
                break;
            }
            default:
                console.log("Unhandled opcode in DD: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the "DDCB" prefix (IX bit instructions).
     */
    function decodeDDCB(z80) {
        z80.incTStateCount(3);
        const offset = z80.readByteInternal(z80.regs.pc);
        z80.regs.memptr = add16(z80.regs.ix, signedByte(offset));
        z80.regs.pc = inc16(z80.regs.pc);
        z80.incTStateCount(3);
        const inst = z80.readByteInternal(z80.regs.pc);
        z80.incTStateCount(2);
        z80.regs.pc = inc16(z80.regs.pc);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x00: { // ld b,rlc
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x01: { // ld c,rlc
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x02: { // ld d,rlc
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x03: { // ld e,rlc
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x04: { // ld h,rlc
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x05: { // ld l,rlc
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x06: { // rlc (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x07: { // ld a,rlc
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x08: { // ld b,rrc
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x09: { // ld c,rrc
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x0A: { // ld d,rrc
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x0B: { // ld e,rrc
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x0C: { // ld h,rrc
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x0D: { // ld l,rrc
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x0E: { // rrc (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x0F: { // ld a,rrc
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x10: { // ld b,rl
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x11: { // ld c,rl
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x12: { // ld d,rl
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x13: { // ld e,rl
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x14: { // ld h,rl
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x15: { // ld l,rl
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x16: { // rl (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x17: { // ld a,rl
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x18: { // ld b,rr
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x19: { // ld c,rr
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x1A: { // ld d,rr
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x1B: { // ld e,rr
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x1C: { // ld h,rr
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x1D: { // ld l,rr
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x1E: { // rr (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x1F: { // ld a,rr
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x20: { // ld b,sla
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x21: { // ld c,sla
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x22: { // ld d,sla
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x23: { // ld e,sla
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x24: { // ld h,sla
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x25: { // ld l,sla
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x26: { // sla (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x27: { // ld a,sla
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x28: { // ld b,sra
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x29: { // ld c,sra
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x2A: { // ld d,sra
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x2B: { // ld e,sra
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x2C: { // ld h,sra
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x2D: { // ld l,sra
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x2E: { // sra (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x2F: { // ld a,sra
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x30: { // ld b,sll
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x31: { // ld c,sll
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x32: { // ld d,sll
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x33: { // ld e,sll
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x34: { // ld h,sll
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x35: { // ld l,sll
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x36: { // sll (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x37: { // ld a,sll
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x38: { // ld b,srl
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x39: { // ld c,srl
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x3A: { // ld d,srl
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x3B: { // ld e,srl
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x3C: { // ld h,srl
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x3D: { // ld l,srl
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x3E: { // srl (ix+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x3F: { // ld a,srl
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x40:
            case 0x41:
            case 0x42:
            case 0x43:
            case 0x44:
            case 0x45:
            case 0x46:
            case 0x47: { // bit 0,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x48:
            case 0x49:
            case 0x4A:
            case 0x4B:
            case 0x4C:
            case 0x4D:
            case 0x4E:
            case 0x4F: { // bit 1,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x50:
            case 0x51:
            case 0x52:
            case 0x53:
            case 0x54:
            case 0x55:
            case 0x56:
            case 0x57: { // bit 2,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x58:
            case 0x59:
            case 0x5A:
            case 0x5B:
            case 0x5C:
            case 0x5D:
            case 0x5E:
            case 0x5F: { // bit 3,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x60:
            case 0x61:
            case 0x62:
            case 0x63:
            case 0x64:
            case 0x65:
            case 0x66:
            case 0x67: { // bit 4,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x68:
            case 0x69:
            case 0x6A:
            case 0x6B:
            case 0x6C:
            case 0x6D:
            case 0x6E:
            case 0x6F: { // bit 5,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x70:
            case 0x71:
            case 0x72:
            case 0x73:
            case 0x74:
            case 0x75:
            case 0x76:
            case 0x77: { // bit 6,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x78:
            case 0x79:
            case 0x7A:
            case 0x7B:
            case 0x7C:
            case 0x7D:
            case 0x7E:
            case 0x7F: { // bit 7,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x80: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x81: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x82: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x83: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x84: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x85: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x86: { // res 0,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFE);
                break;
            }
            case 0x87: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x88: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x89: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x8A: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x8B: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x8C: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x8D: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x8E: { // res 1,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFD);
                break;
            }
            case 0x8F: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x90: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x91: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x92: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x93: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x94: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x95: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x96: { // res 2,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFB);
                break;
            }
            case 0x97: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x98: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x99: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x9A: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x9B: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x9C: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x9D: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x9E: { // res 3,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xF7);
                break;
            }
            case 0x9F: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xA0: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xA1: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xA2: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xA3: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xA4: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xA5: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xA6: { // res 4,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xEF);
                break;
            }
            case 0xA7: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xA8: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xA9: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xAA: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xAB: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xAC: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xAD: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xAE: { // res 5,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xDF);
                break;
            }
            case 0xAF: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xB0: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xB1: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xB2: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xB3: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xB4: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xB5: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xB6: { // res 6,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xBF);
                break;
            }
            case 0xB7: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xB8: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xB9: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xBA: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xBB: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xBC: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xBD: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xBE: { // res 7,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0x7F);
                break;
            }
            case 0xBF: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xC0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xC1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xC2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xC3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xC4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xC5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xC6: { // set 0,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x01);
                break;
            }
            case 0xC7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xC8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xC9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xCA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xCB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xCC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xCD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xCE: { // set 1,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x02);
                break;
            }
            case 0xCF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xD0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xD1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xD2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xD3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xD4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xD5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xD6: { // set 2,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x04);
                break;
            }
            case 0xD7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xD8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xD9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xDA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xDB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xDC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xDD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xDE: { // set 3,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x08);
                break;
            }
            case 0xDF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xE0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xE1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xE2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xE3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xE4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xE5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xE6: { // set 4,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x10);
                break;
            }
            case 0xE7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xE8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xE9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xEA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xEB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xEC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xED: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xEE: { // set 5,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x20);
                break;
            }
            case 0xEF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xF0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xF1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xF2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xF3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xF4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xF5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xF6: { // set 6,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x40);
                break;
            }
            case 0xF7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xF8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xF9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xFA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xFB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xFC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xFD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xFE: { // set 7,(ix+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x80);
                break;
            }
            case 0xFF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            default:
                console.log("Unhandled opcode in DDCB: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the "ED" prefix (extended instructions).
     */
    function decodeED(z80) {
        const inst = fetchInstruction(z80);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x40: { // in b,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.b = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.b];
                break;
            }
            case 0x41: { // out (c),b
                z80.writePort(z80.regs.bc, z80.regs.b);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x42: { // sbc hl,bc
                let value;
                z80.incTStateCount(7);
                value = z80.regs.bc;
                let result = z80.regs.hl - value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result -= 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | Flag.N | overflowSubTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarrySubTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x43: { // ld (nnnn),bc
                let value;
                value = z80.regs.bc;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x44:
            case 0x4C:
            case 0x54:
            case 0x5C:
            case 0x64:
            case 0x6C:
            case 0x74:
            case 0x7C: { // neg
                const value = z80.regs.a;
                z80.regs.a = 0;
                const diff = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                z80.regs.a = diff;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= z80.sz53Table[z80.regs.a];
                z80.regs.f = f;
                break;
            }
            case 0x45:
            case 0x4D:
            case 0x55:
            case 0x5D:
            case 0x65:
            case 0x6D:
            case 0x75:
            case 0x7D: { // retn
                z80.regs.iff1 = z80.regs.iff2;
                z80.regs.pc = z80.popWord();
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0x46:
            case 0x4E:
            case 0x66:
            case 0x6E: { // im 0
                z80.regs.im = 0;
                break;
            }
            case 0x47: { // ld i,a
                let value;
                value = z80.regs.a;
                z80.regs.i = value;
                break;
            }
            case 0x48: { // in c,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.c = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.c];
                break;
            }
            case 0x49: { // out (c),c
                z80.writePort(z80.regs.bc, z80.regs.c);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x4A: { // adc hl,bc
                let value;
                z80.incTStateCount(7);
                value = z80.regs.bc;
                let result = z80.regs.hl + value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result += 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | overflowAddTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarryAddTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x4B: { // ld bc,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.bc = value;
                break;
            }
            case 0x4F: { // ld r,a
                let value;
                value = z80.regs.a;
                z80.regs.r = value;
                break;
            }
            case 0x50: { // in d,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.d = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.d];
                break;
            }
            case 0x51: { // out (c),d
                z80.writePort(z80.regs.bc, z80.regs.d);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x52: { // sbc hl,de
                let value;
                z80.incTStateCount(7);
                value = z80.regs.de;
                let result = z80.regs.hl - value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result -= 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | Flag.N | overflowSubTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarrySubTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x53: { // ld (nnnn),de
                let value;
                value = z80.regs.de;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x56:
            case 0x76: { // im 1
                z80.regs.im = 1;
                break;
            }
            case 0x57: { // ld a,i
                let value;
                value = z80.regs.i;
                z80.regs.a = value;
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53Table[z80.regs.a] | (z80.regs.iff2 ? Flag.V : 0);
                break;
            }
            case 0x58: { // in e,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.e = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.e];
                break;
            }
            case 0x59: { // out (c),e
                z80.writePort(z80.regs.bc, z80.regs.e);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x5A: { // adc hl,de
                let value;
                z80.incTStateCount(7);
                value = z80.regs.de;
                let result = z80.regs.hl + value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result += 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | overflowAddTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarryAddTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x5B: { // ld de,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.de = value;
                break;
            }
            case 0x5E:
            case 0x7E: { // im 2
                z80.regs.im = 2;
                break;
            }
            case 0x5F: { // ld a,r
                let value;
                z80.incTStateCount(1);
                value = z80.regs.rCombined;
                z80.regs.a = value;
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53Table[z80.regs.a] | (z80.regs.iff2 ? Flag.V : 0);
                break;
            }
            case 0x60: { // in h,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.h = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.h];
                break;
            }
            case 0x61: { // out (c),h
                z80.writePort(z80.regs.bc, z80.regs.h);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x62: { // sbc hl,hl
                let value;
                z80.incTStateCount(7);
                value = z80.regs.hl;
                let result = z80.regs.hl - value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result -= 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | Flag.N | overflowSubTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarrySubTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x63: { // ld (nnnn),hl
                let value;
                value = z80.regs.hl;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x67: { // rrd
                const tmp = z80.readByte(z80.regs.hl);
                z80.incTStateCount(4);
                z80.writeByte(z80.regs.hl, ((z80.regs.a << 4) | (tmp >> 4)) & 0xFF);
                z80.regs.a = (z80.regs.a & 0xF0) | (tmp & 0x0F);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.a];
                z80.regs.memptr = inc16(z80.regs.hl);
                break;
            }
            case 0x68: { // in l,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.l = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.l];
                break;
            }
            case 0x69: { // out (c),l
                z80.writePort(z80.regs.bc, z80.regs.l);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x6A: { // adc hl,hl
                let value;
                z80.incTStateCount(7);
                value = z80.regs.hl;
                let result = z80.regs.hl + value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result += 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | overflowAddTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarryAddTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x6B: { // ld hl,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.hl = value;
                break;
            }
            case 0x6F: { // rld
                const tmp = z80.readByte(z80.regs.hl);
                z80.incTStateCount(4);
                z80.writeByte(z80.regs.hl, ((tmp << 4) | (z80.regs.a & 0x0F)) & 0xFF);
                z80.regs.a = (z80.regs.a & 0xF0) | (tmp >> 4);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.a];
                z80.regs.memptr = inc16(z80.regs.hl);
                break;
            }
            case 0x70: { // in f,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.f = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.f];
                break;
            }
            case 0x71: { // out (c),0
                z80.writePort(z80.regs.bc, 0x00);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x72: { // sbc hl,sp
                let value;
                z80.incTStateCount(7);
                value = z80.regs.sp;
                let result = z80.regs.hl - value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result -= 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | Flag.N | overflowSubTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarrySubTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x73: { // ld (nnnn),sp
                let value;
                value = z80.regs.sp;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x78: { // in a,(c)
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.a = z80.readPort(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0x79: { // out (c),a
                z80.writePort(z80.regs.bc, z80.regs.a);
                z80.regs.memptr = inc16(z80.regs.bc);
                break;
            }
            case 0x7A: { // adc hl,sp
                let value;
                z80.incTStateCount(7);
                value = z80.regs.sp;
                let result = z80.regs.hl + value;
                if ((z80.regs.f & Flag.C) !== 0) {
                    result += 1;
                }
                const lookup = (((z80.regs.hl & 0x8800) >> 11) |
                    ((value & 0x8800) >> 10) |
                    ((result & 0x8800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = ((result & 0x10000) !== 0 ? Flag.C : 0) | overflowAddTable[lookup >> 4] | ((result >> 8) & (Flag.X3 | Flag.X5 | Flag.S)) | halfCarryAddTable[lookup & 0x07] | (result !== 0 ? 0 : Flag.Z);
                break;
            }
            case 0x7B: { // ld sp,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.sp = value;
                break;
            }
            case 0xA0: { // ldi
                let value = z80.readByte(z80.regs.hl);
                z80.writeByte(z80.regs.de, value);
                z80.incTStateCount(2);
                z80.regs.bc = dec16(z80.regs.bc);
                value = add16(value, z80.regs.a);
                z80.regs.f = (z80.regs.f & (Flag.C | Flag.Z | Flag.S)) | (z80.regs.bc !== 0 ? Flag.V : 0) | (value & Flag.X3) | ((value & 0x02) !== 0 ? Flag.X5 : 0);
                z80.regs.hl = inc16(z80.regs.hl);
                z80.regs.de = inc16(z80.regs.de);
                break;
            }
            case 0xA1: { // cpi
                const value = z80.readByte(z80.regs.hl);
                let diff = (z80.regs.a - value) & 0xFF;
                const lookup = ((z80.regs.a & 0x08) >> 3) | ((value & 0x08) >> 2) | ((diff & 0x08) >> 1);
                z80.incTStateCount(5);
                z80.regs.bc = dec16(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | (z80.regs.bc !== 0 ? Flag.V : 0) | Flag.N | halfCarrySubTable[lookup] | (diff !== 0 ? 0 : Flag.Z) | (diff & Flag.S);
                if ((z80.regs.f & Flag.H) !== 0)
                    diff = dec8(diff);
                z80.regs.f |= (diff & Flag.X3) | (((diff & 0x02) !== 0) ? Flag.X5 : 0);
                z80.regs.memptr = inc16(z80.regs.memptr);
                z80.regs.hl = inc16(z80.regs.hl);
                break;
            }
            case 0xA2: { // ini
                z80.incTStateCount(1);
                const value = z80.readPort(z80.regs.bc);
                z80.writeByte(z80.regs.hl, value);
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.b = dec8(z80.regs.b);
                const other = inc8(add8(value, z80.regs.c));
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                z80.regs.hl = inc16(z80.regs.hl);
                break;
            }
            case 0xA3: { // outi
                z80.incTStateCount(1);
                const value = z80.readByte(z80.regs.hl);
                z80.regs.b = dec8(z80.regs.b);
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.writePort(z80.regs.bc, value);
                z80.regs.hl = inc16(z80.regs.hl);
                const other = add8(value, z80.regs.l);
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                break;
            }
            case 0xA8: { // ldd
                let value = z80.readByte(z80.regs.hl);
                z80.writeByte(z80.regs.de, value);
                z80.incTStateCount(2);
                z80.regs.bc = dec16(z80.regs.bc);
                value = add16(value, z80.regs.a);
                z80.regs.f = (z80.regs.f & (Flag.C | Flag.Z | Flag.S)) | (z80.regs.bc !== 0 ? Flag.V : 0) | (value & Flag.X3) | ((value & 0x02) !== 0 ? Flag.X5 : 0);
                z80.regs.hl = dec16(z80.regs.hl);
                z80.regs.de = dec16(z80.regs.de);
                break;
            }
            case 0xA9: { // cpd
                const value = z80.readByte(z80.regs.hl);
                let diff = (z80.regs.a - value) & 0xFF;
                const lookup = ((z80.regs.a & 0x08) >> 3) | ((value & 0x08) >> 2) | ((diff & 0x08) >> 1);
                z80.incTStateCount(5);
                z80.regs.bc = dec16(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | (z80.regs.bc !== 0 ? Flag.V : 0) | Flag.N | halfCarrySubTable[lookup] | (diff !== 0 ? 0 : Flag.Z) | (diff & Flag.S);
                if ((z80.regs.f & Flag.H) !== 0)
                    diff = dec8(diff);
                z80.regs.f |= (diff & Flag.X3) | (((diff & 0x02) !== 0) ? Flag.X5 : 0);
                z80.regs.memptr = dec16(z80.regs.memptr);
                z80.regs.hl = dec16(z80.regs.hl);
                break;
            }
            case 0xAA: { // ind
                z80.incTStateCount(1);
                const value = z80.readPort(z80.regs.bc);
                z80.writeByte(z80.regs.hl, value);
                z80.regs.memptr = dec16(z80.regs.bc);
                z80.regs.b = dec8(z80.regs.b);
                const other = dec8(add8(value, z80.regs.c));
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                z80.regs.hl = dec16(z80.regs.hl);
                break;
            }
            case 0xAB: { // outd
                z80.incTStateCount(1);
                const value = z80.readByte(z80.regs.hl);
                z80.regs.b = dec8(z80.regs.b);
                z80.regs.memptr = dec16(z80.regs.bc);
                z80.writePort(z80.regs.bc, value);
                z80.regs.hl = dec16(z80.regs.hl);
                const other = add8(value, z80.regs.l);
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                break;
            }
            case 0xB0: { // ldir
                let value = z80.readByte(z80.regs.hl);
                z80.writeByte(z80.regs.de, value);
                z80.incTStateCount(2);
                z80.regs.bc = dec16(z80.regs.bc);
                value = add16(value, z80.regs.a);
                z80.regs.f = (z80.regs.f & (Flag.C | Flag.Z | Flag.S)) | (z80.regs.bc !== 0 ? Flag.V : 0) | (value & Flag.X3) | ((value & 0x02) !== 0 ? Flag.X5 : 0);
                if (z80.regs.bc !== 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                    z80.regs.memptr = add16(z80.regs.pc, 1);
                }
                z80.regs.hl = inc16(z80.regs.hl);
                z80.regs.de = inc16(z80.regs.de);
                break;
            }
            case 0xB1: { // cpir
                const value = z80.readByte(z80.regs.hl);
                let diff = (z80.regs.a - value) & 0xFF;
                const lookup = ((z80.regs.a & 0x08) >> 3) | ((value & 0x08) >> 2) | ((diff & 0x08) >> 1);
                z80.incTStateCount(5);
                z80.regs.bc = dec16(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | (z80.regs.bc !== 0 ? Flag.V : 0) | Flag.N | halfCarrySubTable[lookup] | (diff !== 0 ? 0 : Flag.Z) | (diff & Flag.S);
                if ((z80.regs.f & Flag.H) !== 0)
                    diff = dec8(diff);
                z80.regs.f |= (diff & Flag.X3) | (((diff & 0x02) !== 0) ? Flag.X5 : 0);
                if ((z80.regs.f & (Flag.V | Flag.Z)) === Flag.V) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                    z80.regs.memptr = add16(z80.regs.pc, 1);
                }
                else {
                    z80.regs.memptr = inc16(z80.regs.memptr);
                }
                z80.regs.hl = inc16(z80.regs.hl);
                break;
            }
            case 0xB2: { // inir
                z80.incTStateCount(1);
                const value = z80.readPort(z80.regs.bc);
                z80.writeByte(z80.regs.hl, value);
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.regs.b = dec8(z80.regs.b);
                const other = inc8(add8(value, z80.regs.c));
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                if (z80.regs.b > 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                }
                z80.regs.hl = inc16(z80.regs.hl);
                break;
            }
            case 0xB3: { // otir
                z80.incTStateCount(1);
                const value = z80.readByte(z80.regs.hl);
                z80.regs.b = dec8(z80.regs.b);
                z80.regs.memptr = inc16(z80.regs.bc);
                z80.writePort(z80.regs.bc, value);
                z80.regs.hl = inc16(z80.regs.hl);
                const other = add8(value, z80.regs.l);
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                if (z80.regs.b > 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                }
                break;
            }
            case 0xB8: { // lddr
                let value = z80.readByte(z80.regs.hl);
                z80.writeByte(z80.regs.de, value);
                z80.incTStateCount(2);
                z80.regs.bc = dec16(z80.regs.bc);
                value = add16(value, z80.regs.a);
                z80.regs.f = (z80.regs.f & (Flag.C | Flag.Z | Flag.S)) | (z80.regs.bc !== 0 ? Flag.V : 0) | (value & Flag.X3) | ((value & 0x02) !== 0 ? Flag.X5 : 0);
                if (z80.regs.bc !== 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                    z80.regs.memptr = add16(z80.regs.pc, 1);
                }
                z80.regs.hl = dec16(z80.regs.hl);
                z80.regs.de = dec16(z80.regs.de);
                break;
            }
            case 0xB9: { // cpdr
                const value = z80.readByte(z80.regs.hl);
                let diff = (z80.regs.a - value) & 0xFF;
                const lookup = ((z80.regs.a & 0x08) >> 3) | ((value & 0x08) >> 2) | ((diff & 0x08) >> 1);
                z80.incTStateCount(5);
                z80.regs.bc = dec16(z80.regs.bc);
                z80.regs.f = (z80.regs.f & Flag.C) | (z80.regs.bc !== 0 ? Flag.V : 0) | Flag.N | halfCarrySubTable[lookup] | (diff !== 0 ? 0 : Flag.Z) | (diff & Flag.S);
                if ((z80.regs.f & Flag.H) !== 0)
                    diff = dec8(diff);
                z80.regs.f |= (diff & Flag.X3) | (((diff & 0x02) !== 0) ? Flag.X5 : 0);
                if ((z80.regs.f & (Flag.V | Flag.Z)) === Flag.V) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                    z80.regs.memptr = add16(z80.regs.pc, 1);
                }
                else {
                    z80.regs.memptr = dec16(z80.regs.memptr);
                }
                z80.regs.hl = dec16(z80.regs.hl);
                break;
            }
            case 0xBA: { // indr
                z80.incTStateCount(1);
                const value = z80.readPort(z80.regs.bc);
                z80.writeByte(z80.regs.hl, value);
                z80.regs.memptr = dec16(z80.regs.bc);
                z80.regs.b = dec8(z80.regs.b);
                const other = dec8(add8(value, z80.regs.c));
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                if (z80.regs.b > 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                }
                z80.regs.hl = dec16(z80.regs.hl);
                break;
            }
            case 0xBB: { // otdr
                z80.incTStateCount(1);
                const value = z80.readByte(z80.regs.hl);
                z80.regs.b = dec8(z80.regs.b);
                z80.regs.memptr = dec16(z80.regs.bc);
                z80.writePort(z80.regs.bc, value);
                z80.regs.hl = dec16(z80.regs.hl);
                const other = add8(value, z80.regs.l);
                z80.regs.f = (value & 0x80 ? Flag.N : 0) | (other < value ? Flag.H | Flag.C : 0) | (z80.parityTable[(other & 0x07) ^ z80.regs.b] ? Flag.P : 0) | z80.sz53Table[z80.regs.b];
                if (z80.regs.b > 0) {
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, -2);
                }
                break;
            }
            default:
                console.log("Unhandled opcode in ED: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the "FD" prefix (IY instructions).
     */
    function decodeFD(z80) {
        const inst = fetchInstruction(z80);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x09: { // add iy,bc
                let value;
                z80.incTStateCount(7);
                value = z80.regs.bc;
                let result = z80.regs.iy + value;
                const lookup = (((z80.regs.iy & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.iy);
                z80.regs.iy = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x19: { // add iy,de
                let value;
                z80.incTStateCount(7);
                value = z80.regs.de;
                let result = z80.regs.iy + value;
                const lookup = (((z80.regs.iy & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.iy);
                z80.regs.iy = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x21: { // ld iy,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.iy = value;
                break;
            }
            case 0x22: { // ld (nnnn),iy
                let value;
                value = z80.regs.iy;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x23: { // inc iy
                let value;
                value = z80.regs.iy;
                value = inc16(value);
                z80.regs.iy = value;
                break;
            }
            case 0x24: { // inc iyh
                let value;
                value = z80.regs.iyh;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.iyh = value;
                break;
            }
            case 0x25: { // dec iyh
                let value;
                value = z80.regs.iyh;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.iyh = value;
                break;
            }
            case 0x26: { // ld iyh,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.iyh = value;
                break;
            }
            case 0x29: { // add iy,iy
                let value;
                z80.incTStateCount(7);
                value = z80.regs.iy;
                let result = z80.regs.iy + value;
                const lookup = (((z80.regs.iy & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.iy);
                z80.regs.iy = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x2A: { // ld iy,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.iy = value;
                break;
            }
            case 0x2B: { // dec iy
                let value;
                value = z80.regs.iy;
                value = dec16(value);
                z80.regs.iy = value;
                break;
            }
            case 0x2C: { // inc iyl
                let value;
                value = z80.regs.iyl;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.iyl = value;
                break;
            }
            case 0x2D: { // dec iyl
                let value;
                value = z80.regs.iyl;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.iyl = value;
                break;
            }
            case 0x2E: { // ld iyl,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.iyl = value;
                break;
            }
            case 0x34: { // inc (iy+dd)
                let value;
                const offset = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = add16(z80.regs.iy, signedByte(offset));
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x35: { // dec (iy+dd)
                let value;
                const offset = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = add16(z80.regs.iy, signedByte(offset));
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x36: { // ld (iy+dd),nn
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x39: { // add iy,sp
                let value;
                z80.incTStateCount(7);
                value = z80.regs.sp;
                let result = z80.regs.iy + value;
                const lookup = (((z80.regs.iy & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.iy);
                z80.regs.iy = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x44: { // ld b,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.b = value;
                break;
            }
            case 0x45: { // ld b,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.b = value;
                break;
            }
            case 0x46: { // ld b,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.b = value;
                break;
            }
            case 0x4C: { // ld c,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.c = value;
                break;
            }
            case 0x4D: { // ld c,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.c = value;
                break;
            }
            case 0x4E: { // ld c,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.c = value;
                break;
            }
            case 0x54: { // ld d,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.d = value;
                break;
            }
            case 0x55: { // ld d,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.d = value;
                break;
            }
            case 0x56: { // ld d,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.d = value;
                break;
            }
            case 0x5C: { // ld e,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.e = value;
                break;
            }
            case 0x5D: { // ld e,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.e = value;
                break;
            }
            case 0x5E: { // ld e,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.e = value;
                break;
            }
            case 0x60: { // ld iyh,b
                let value;
                value = z80.regs.b;
                z80.regs.iyh = value;
                break;
            }
            case 0x61: { // ld iyh,c
                let value;
                value = z80.regs.c;
                z80.regs.iyh = value;
                break;
            }
            case 0x62: { // ld iyh,d
                let value;
                value = z80.regs.d;
                z80.regs.iyh = value;
                break;
            }
            case 0x63: { // ld iyh,e
                let value;
                value = z80.regs.e;
                z80.regs.iyh = value;
                break;
            }
            case 0x64: { // ld iyh,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.iyh = value;
                break;
            }
            case 0x65: { // ld iyh,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.iyh = value;
                break;
            }
            case 0x66: { // ld h,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.h = value;
                break;
            }
            case 0x67: { // ld iyh,a
                let value;
                value = z80.regs.a;
                z80.regs.iyh = value;
                break;
            }
            case 0x68: { // ld iyl,b
                let value;
                value = z80.regs.b;
                z80.regs.iyl = value;
                break;
            }
            case 0x69: { // ld iyl,c
                let value;
                value = z80.regs.c;
                z80.regs.iyl = value;
                break;
            }
            case 0x6A: { // ld iyl,d
                let value;
                value = z80.regs.d;
                z80.regs.iyl = value;
                break;
            }
            case 0x6B: { // ld iyl,e
                let value;
                value = z80.regs.e;
                z80.regs.iyl = value;
                break;
            }
            case 0x6C: { // ld iyl,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.iyl = value;
                break;
            }
            case 0x6D: { // ld iyl,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.iyl = value;
                break;
            }
            case 0x6E: { // ld l,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.l = value;
                break;
            }
            case 0x6F: { // ld iyl,a
                let value;
                value = z80.regs.a;
                z80.regs.iyl = value;
                break;
            }
            case 0x70: { // ld (iy+dd),b
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.b;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x71: { // ld (iy+dd),c
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.c;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x72: { // ld (iy+dd),d
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.d;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x73: { // ld (iy+dd),e
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.e;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x74: { // ld (iy+dd),h
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.h;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x75: { // ld (iy+dd),l
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.l;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x77: { // ld (iy+dd),a
                const dd = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let value;
                value = z80.regs.a;
                z80.regs.memptr = (z80.regs.iy + signedByte(dd)) & 0xFFFF;
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x7C: { // ld a,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.a = value;
                break;
            }
            case 0x7D: { // ld a,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.a = value;
                break;
            }
            case 0x7E: { // ld a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a = value;
                break;
            }
            case 0x84: { // add a,iyh
                let value;
                value = z80.regs.iyh;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x85: { // add a,iyl
                let value;
                value = z80.regs.iyl;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x86: { // add a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8C: { // adc a,iyh
                let value;
                value = z80.regs.iyh;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8D: { // adc a,iyl
                let value;
                value = z80.regs.iyl;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8E: { // adc a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x94: { // sub a,iyh
                let value;
                value = z80.regs.iyh;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x95: { // sub a,iyl
                let value;
                value = z80.regs.iyl;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x96: { // sub a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9C: { // sbc a,iyh
                let value;
                value = z80.regs.iyh;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9D: { // sbc a,iyl
                let value;
                value = z80.regs.iyl;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9E: { // sbc a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xA4: { // and a,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA5: { // and a,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA6: { // and a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xAC: { // xor a,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAD: { // xor a,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAE: { // xor a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB4: { // or a,iyh
                let value;
                value = z80.regs.iyh;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB5: { // or a,iyl
                let value;
                value = z80.regs.iyl;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB6: { // or a,(iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xBC: { // cp iyh
                let value;
                value = z80.regs.iyh;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBD: { // cp iyl
                let value;
                value = z80.regs.iyl;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBE: { // cp (iy+dd)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = (z80.regs.iy + signedByte(value)) & 0xFFFF;
                value = z80.readByte(z80.regs.memptr);
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xCB: { // shift fdcb
                decodeFDCB(z80);
                break;
            }
            case 0xE1: { // pop iy
                z80.regs.iy = z80.popWord();
                break;
            }
            case 0xE3: { // ex (sp),iy
                const rightValue = z80.regs.iy;
                const leftValueL = z80.readByte(z80.regs.sp);
                const leftValueH = z80.readByte(inc16(z80.regs.sp));
                z80.incTStateCount(1);
                z80.writeByte(inc16(z80.regs.sp), hi(rightValue));
                z80.writeByte(z80.regs.sp, lo(rightValue));
                z80.incTStateCount(2);
                z80.regs.memptr = word(leftValueH, leftValueL);
                z80.regs.iy = word(leftValueH, leftValueL);
                break;
            }
            case 0xE5: { // push iy
                z80.pushWord(z80.regs.iy);
                break;
            }
            case 0xE9: { // jp iy
                z80.regs.pc = z80.regs.iy;
                break;
            }
            case 0xF9: { // ld sp,iy
                let value;
                value = z80.regs.iy;
                z80.regs.sp = value;
                break;
            }
            default:
                console.log("Unhandled opcode in FD: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the "FDCB" prefix (IY bit instructions).
     */
    function decodeFDCB(z80) {
        z80.incTStateCount(3);
        const offset = z80.readByteInternal(z80.regs.pc);
        z80.regs.memptr = add16(z80.regs.iy, signedByte(offset));
        z80.regs.pc = inc16(z80.regs.pc);
        z80.incTStateCount(3);
        const inst = z80.readByteInternal(z80.regs.pc);
        z80.incTStateCount(2);
        z80.regs.pc = inc16(z80.regs.pc);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x00: { // ld b,rlc
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x01: { // ld c,rlc
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x02: { // ld d,rlc
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x03: { // ld e,rlc
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x04: { // ld h,rlc
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x05: { // ld l,rlc
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x06: { // rlc (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | (value >> 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x07: { // ld a,rlc
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | (value >> 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x08: { // ld b,rrc
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x09: { // ld c,rrc
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x0A: { // ld d,rrc
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x0B: { // ld e,rrc
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x0C: { // ld h,rrc
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x0D: { // ld l,rrc
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x0E: { // rrc (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value >> 1) | (value << 7)) & 0xFF;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x0F: { // ld a,rrc
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value >> 1) | (value << 7)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x10: { // ld b,rl
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x11: { // ld c,rl
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x12: { // ld d,rl
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x13: { // ld e,rl
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x14: { // ld h,rl
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x15: { // ld l,rl
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x16: { // rl (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x17: { // ld a,rl
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | ((z80.regs.f & Flag.C) !== 0 ? 1 : 0)) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x18: { // ld b,rr
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x19: { // ld c,rr
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x1A: { // ld d,rr
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x1B: { // ld e,rr
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x1C: { // ld h,rr
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x1D: { // ld l,rr
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x1E: { // rr (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x1F: { // ld a,rr
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x20: { // ld b,sla
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x21: { // ld c,sla
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x22: { // ld d,sla
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x23: { // ld e,sla
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x24: { // ld h,sla
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x25: { // ld l,sla
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x26: { // sla (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value << 1) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x27: { // ld a,sla
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value << 1) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x28: { // ld b,sra
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x29: { // ld c,sra
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x2A: { // ld d,sra
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x2B: { // ld e,sra
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x2C: { // ld h,sra
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x2D: { // ld l,sra
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x2E: { // sra (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = (value & 0x80) | (value >> 1);
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x2F: { // ld a,sra
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = (value & 0x80) | (value >> 1);
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x30: { // ld b,sll
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x31: { // ld c,sll
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x32: { // ld d,sll
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x33: { // ld e,sll
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x34: { // ld h,sll
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x35: { // ld l,sll
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x36: { // sll (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = ((value << 1) | 0x01) & 0xFF;
                z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x37: { // ld a,sll
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = ((value << 1) | 0x01) & 0xFF;
                    z80.regs.f = ((oldValue & 0x80) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x38: { // ld b,srl
                z80.regs.b = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.b;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.b = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x39: { // ld c,srl
                z80.regs.c = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.c;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.c = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x3A: { // ld d,srl
                z80.regs.d = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.d;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.d = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x3B: { // ld e,srl
                z80.regs.e = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.e;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.e = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x3C: { // ld h,srl
                z80.regs.h = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.h;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.h = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x3D: { // ld l,srl
                z80.regs.l = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.l;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.l = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x3E: { // srl (iy+dd)
                let value;
                value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                const oldValue = value;
                value = value >> 1;
                z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                z80.writeByte(z80.regs.memptr, value);
                break;
            }
            case 0x3F: { // ld a,srl
                z80.regs.a = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                {
                    let value;
                    value = z80.regs.a;
                    const oldValue = value;
                    value = value >> 1;
                    z80.regs.f = ((oldValue & 0x01) !== 0 ? Flag.C : 0) | z80.sz53pTable[value];
                    z80.regs.a = value;
                }
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x40:
            case 0x41:
            case 0x42:
            case 0x43:
            case 0x44:
            case 0x45:
            case 0x46:
            case 0x47: { // bit 0,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x01) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x48:
            case 0x49:
            case 0x4A:
            case 0x4B:
            case 0x4C:
            case 0x4D:
            case 0x4E:
            case 0x4F: { // bit 1,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x02) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x50:
            case 0x51:
            case 0x52:
            case 0x53:
            case 0x54:
            case 0x55:
            case 0x56:
            case 0x57: { // bit 2,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x04) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x58:
            case 0x59:
            case 0x5A:
            case 0x5B:
            case 0x5C:
            case 0x5D:
            case 0x5E:
            case 0x5F: { // bit 3,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x08) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x60:
            case 0x61:
            case 0x62:
            case 0x63:
            case 0x64:
            case 0x65:
            case 0x66:
            case 0x67: { // bit 4,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x10) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x68:
            case 0x69:
            case 0x6A:
            case 0x6B:
            case 0x6C:
            case 0x6D:
            case 0x6E:
            case 0x6F: { // bit 5,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x20) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x70:
            case 0x71:
            case 0x72:
            case 0x73:
            case 0x74:
            case 0x75:
            case 0x76:
            case 0x77: { // bit 6,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x40) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                z80.regs.f = f;
                break;
            }
            case 0x78:
            case 0x79:
            case 0x7A:
            case 0x7B:
            case 0x7C:
            case 0x7D:
            case 0x7E:
            case 0x7F: { // bit 7,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                const hiddenValue = hi(z80.regs.memptr);
                z80.incTStateCount(1);
                let f = (z80.regs.f & Flag.C) | Flag.H | (hiddenValue & (Flag.X3 | Flag.X5));
                if ((value & 0x80) === 0) {
                    f |= Flag.P | Flag.Z;
                }
                if ((value & 0x80) !== 0) {
                    f |= Flag.S;
                }
                z80.regs.f = f;
                break;
            }
            case 0x80: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x81: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x82: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x83: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x84: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x85: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x86: { // res 0,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFE);
                break;
            }
            case 0x87: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFE;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x88: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x89: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x8A: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x8B: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x8C: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x8D: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x8E: { // res 1,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFD);
                break;
            }
            case 0x8F: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFD;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x90: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x91: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x92: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x93: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x94: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x95: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x96: { // res 2,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xFB);
                break;
            }
            case 0x97: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xFB;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0x98: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0x99: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0x9A: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0x9B: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0x9C: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0x9D: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0x9E: { // res 3,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xF7);
                break;
            }
            case 0x9F: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xF7;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xA0: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xA1: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xA2: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xA3: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xA4: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xA5: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xA6: { // res 4,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xEF);
                break;
            }
            case 0xA7: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xEF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xA8: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xA9: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xAA: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xAB: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xAC: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xAD: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xAE: { // res 5,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xDF);
                break;
            }
            case 0xAF: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xDF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xB0: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xB1: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xB2: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xB3: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xB4: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xB5: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xB6: { // res 6,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0xBF);
                break;
            }
            case 0xB7: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0xBF;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xB8: { // ld b,res
                z80.regs.b = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xB9: { // ld c,res
                z80.regs.c = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xBA: { // ld d,res
                z80.regs.d = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xBB: { // ld e,res
                z80.regs.e = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xBC: { // ld h,res
                z80.regs.h = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xBD: { // ld l,res
                z80.regs.l = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xBE: { // res 7,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value & 0x7F);
                break;
            }
            case 0xBF: { // ld a,res
                z80.regs.a = z80.readByte(z80.regs.memptr) & 0x7F;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xC0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xC1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xC2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xC3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xC4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xC5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xC6: { // set 0,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x01);
                break;
            }
            case 0xC7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x01;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xC8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xC9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xCA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xCB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xCC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xCD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xCE: { // set 1,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x02);
                break;
            }
            case 0xCF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x02;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xD0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xD1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xD2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xD3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xD4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xD5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xD6: { // set 2,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x04);
                break;
            }
            case 0xD7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x04;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xD8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xD9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xDA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xDB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xDC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xDD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xDE: { // set 3,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x08);
                break;
            }
            case 0xDF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x08;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xE0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xE1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xE2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xE3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xE4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xE5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xE6: { // set 4,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x10);
                break;
            }
            case 0xE7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x10;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xE8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xE9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xEA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xEB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xEC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xED: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xEE: { // set 5,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x20);
                break;
            }
            case 0xEF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x20;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xF0: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xF1: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xF2: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xF3: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xF4: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xF5: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xF6: { // set 6,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x40);
                break;
            }
            case 0xF7: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x40;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            case 0xF8: { // ld b,set
                z80.regs.b = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.b);
                break;
            }
            case 0xF9: { // ld c,set
                z80.regs.c = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.c);
                break;
            }
            case 0xFA: { // ld d,set
                z80.regs.d = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.d);
                break;
            }
            case 0xFB: { // ld e,set
                z80.regs.e = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.e);
                break;
            }
            case 0xFC: { // ld h,set
                z80.regs.h = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.h);
                break;
            }
            case 0xFD: { // ld l,set
                z80.regs.l = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.l);
                break;
            }
            case 0xFE: { // set 7,(iy+dd)
                const value = z80.readByte(z80.regs.memptr);
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, value | 0x80);
                break;
            }
            case 0xFF: { // ld a,set
                z80.regs.a = z80.readByte(z80.regs.memptr) | 0x80;
                z80.incTStateCount(1);
                z80.writeByte(z80.regs.memptr, z80.regs.a);
                break;
            }
            default:
                console.log("Unhandled opcode in FDCB: " + toHex(inst, 2));
                break;
        }
    }
    /**
     * Decode the base (un-prefixed) instructions.
     */
    function decode(z80) {
        const inst = fetchInstruction(z80);
        switch (inst) {
            // The content of this switch is auto-generated by GenerateOpcodes.ts.
            case 0x00: { // nop
                break;
            }
            case 0x01: { // ld bc,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.bc = value;
                break;
            }
            case 0x02: { // ld (bc),a
                let value;
                value = z80.regs.a;
                z80.regs.memptr = word(z80.regs.a, inc16(z80.regs.bc));
                z80.writeByte(z80.regs.bc, value);
                break;
            }
            case 0x03: { // inc bc
                let value;
                value = z80.regs.bc;
                value = inc16(value);
                z80.regs.bc = value;
                break;
            }
            case 0x04: { // inc b
                let value;
                value = z80.regs.b;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.b = value;
                break;
            }
            case 0x05: { // dec b
                let value;
                value = z80.regs.b;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.b = value;
                break;
            }
            case 0x06: { // ld b,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.b = value;
                break;
            }
            case 0x07: { // rlca
                const oldA = z80.regs.a;
                z80.regs.a = ((z80.regs.a >> 7) | (z80.regs.a << 1)) & 0xFF;
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | (z80.regs.a & (Flag.X3 | Flag.X5)) | ((oldA & 0x80) !== 0 ? Flag.C : 0);
                break;
            }
            case 0x08: { // ex af,af'
                const rightValue = z80.regs.afPrime;
                z80.regs.afPrime = z80.regs.af;
                z80.regs.af = rightValue;
                break;
            }
            case 0x09: { // add hl,bc
                let value;
                z80.incTStateCount(7);
                value = z80.regs.bc;
                let result = z80.regs.hl + value;
                const lookup = (((z80.regs.hl & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x0A: { // ld a,(bc)
                let value;
                z80.regs.memptr = inc16(z80.regs.bc);
                value = z80.readByte(z80.regs.bc);
                z80.regs.a = value;
                break;
            }
            case 0x0B: { // dec bc
                let value;
                value = z80.regs.bc;
                value = dec16(value);
                z80.regs.bc = value;
                break;
            }
            case 0x0C: { // inc c
                let value;
                value = z80.regs.c;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.c = value;
                break;
            }
            case 0x0D: { // dec c
                let value;
                value = z80.regs.c;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.c = value;
                break;
            }
            case 0x0E: { // ld c,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.c = value;
                break;
            }
            case 0x0F: { // rrca
                const oldA = z80.regs.a;
                z80.regs.a = ((z80.regs.a >> 1) | (z80.regs.a << 7)) & 0xFF;
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | (z80.regs.a & (Flag.X3 | Flag.X5)) | ((oldA & 0x01) !== 0 ? Flag.C : 0);
                break;
            }
            case 0x10: { // djnz offset
                z80.incTStateCount(1);
                z80.regs.b = dec8(z80.regs.b);
                if (z80.regs.b !== 0) {
                    const offset = z80.readByte(z80.regs.pc);
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                    z80.regs.pc = inc16(z80.regs.pc);
                    z80.regs.memptr = z80.regs.pc;
                }
                else {
                    z80.incTStateCount(3);
                    z80.regs.pc = inc16(z80.regs.pc);
                }
                break;
            }
            case 0x11: { // ld de,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.de = value;
                break;
            }
            case 0x12: { // ld (de),a
                let value;
                value = z80.regs.a;
                z80.regs.memptr = word(z80.regs.a, inc16(z80.regs.de));
                z80.writeByte(z80.regs.de, value);
                break;
            }
            case 0x13: { // inc de
                let value;
                value = z80.regs.de;
                value = inc16(value);
                z80.regs.de = value;
                break;
            }
            case 0x14: { // inc d
                let value;
                value = z80.regs.d;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.d = value;
                break;
            }
            case 0x15: { // dec d
                let value;
                value = z80.regs.d;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.d = value;
                break;
            }
            case 0x16: { // ld d,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.d = value;
                break;
            }
            case 0x17: { // rla
                const oldA = z80.regs.a;
                z80.regs.a = ((z80.regs.a << 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x01 : 0)) & 0xFF;
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | (z80.regs.a & (Flag.X3 | Flag.X5)) | ((oldA & 0x80) !== 0 ? Flag.C : 0);
                break;
            }
            case 0x18: { // jr offset
                const offset = z80.readByte(z80.regs.pc);
                z80.incTStateCount(5);
                z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0x19: { // add hl,de
                let value;
                z80.incTStateCount(7);
                value = z80.regs.de;
                let result = z80.regs.hl + value;
                const lookup = (((z80.regs.hl & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x1A: { // ld a,(de)
                let value;
                z80.regs.memptr = inc16(z80.regs.de);
                value = z80.readByte(z80.regs.de);
                z80.regs.a = value;
                break;
            }
            case 0x1B: { // dec de
                let value;
                value = z80.regs.de;
                value = dec16(value);
                z80.regs.de = value;
                break;
            }
            case 0x1C: { // inc e
                let value;
                value = z80.regs.e;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.e = value;
                break;
            }
            case 0x1D: { // dec e
                let value;
                value = z80.regs.e;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.e = value;
                break;
            }
            case 0x1E: { // ld e,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.e = value;
                break;
            }
            case 0x1F: { // rra
                const oldA = z80.regs.a;
                z80.regs.a = (z80.regs.a >> 1) | ((z80.regs.f & Flag.C) !== 0 ? 0x80 : 0);
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | (z80.regs.a & (Flag.X3 | Flag.X5)) | ((oldA & 0x01) !== 0 ? Flag.C : 0);
                break;
            }
            case 0x20: { // jr nz,offset
                if ((z80.regs.f & Flag.Z) === 0) {
                    const offset = z80.readByte(z80.regs.pc);
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                    z80.regs.pc = inc16(z80.regs.pc);
                    z80.regs.memptr = z80.regs.pc;
                }
                else {
                    z80.incTStateCount(3);
                    z80.regs.pc = inc16(z80.regs.pc);
                }
                break;
            }
            case 0x21: { // ld hl,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.hl = value;
                break;
            }
            case 0x22: { // ld (nnnn),hl
                let value;
                value = z80.regs.hl;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(addr, lo(value));
                addr = inc16(addr);
                z80.regs.memptr = addr;
                z80.writeByte(addr, hi(value));
                break;
            }
            case 0x23: { // inc hl
                let value;
                value = z80.regs.hl;
                value = inc16(value);
                z80.regs.hl = value;
                break;
            }
            case 0x24: { // inc h
                let value;
                value = z80.regs.h;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.h = value;
                break;
            }
            case 0x25: { // dec h
                let value;
                value = z80.regs.h;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.h = value;
                break;
            }
            case 0x26: { // ld h,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.h = value;
                break;
            }
            case 0x27: { // daa
                let value = 0;
                let carry = z80.regs.f & Flag.C;
                if ((z80.regs.f & Flag.H) !== 0 || ((z80.regs.a & 0x0F) > 9)) {
                    value = 6; // Skip over hex digits in lower nybble.
                }
                if (carry !== 0 || z80.regs.a > 0x99) {
                    value |= 0x60; // Skip over hex digits in upper nybble.
                }
                if (z80.regs.a > 0x99) {
                    carry = Flag.C;
                }
                if ((z80.regs.f & Flag.N) !== 0) {
                    let result = sub16(z80.regs.a, value);
                    const lookup = (((z80.regs.a & 0x88) >> 3) |
                        ((value & 0x88) >> 2) |
                        ((result & 0x88) >> 1)) & 0xFF;
                    z80.regs.a = result & 0xFF;
                    z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                }
                else {
                    let result = add16(z80.regs.a, value);
                    const lookup = (((z80.regs.a & 0x88) >> 3) |
                        ((value & 0x88) >> 2) |
                        ((result & 0x88) >> 1)) & 0xFF;
                    z80.regs.a = result & 0xFF;
                    z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                }
                z80.regs.f = (z80.regs.f & ~(Flag.C | Flag.P)) | carry | z80.parityTable[z80.regs.a];
                break;
            }
            case 0x28: { // jr z,offset
                if ((z80.regs.f & Flag.Z) !== 0) {
                    const offset = z80.readByte(z80.regs.pc);
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                    z80.regs.pc = inc16(z80.regs.pc);
                    z80.regs.memptr = z80.regs.pc;
                }
                else {
                    z80.incTStateCount(3);
                    z80.regs.pc = inc16(z80.regs.pc);
                }
                break;
            }
            case 0x29: { // add hl,hl
                let value;
                z80.incTStateCount(7);
                value = z80.regs.hl;
                let result = z80.regs.hl + value;
                const lookup = (((z80.regs.hl & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x2A: { // ld hl,(nnnn)
                let value;
                let addr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                addr = word(z80.readByte(z80.regs.pc), addr);
                z80.regs.pc = inc16(z80.regs.pc);
                value = z80.readByte(addr);
                z80.regs.memptr = inc16(addr);
                value = word(z80.readByte(z80.regs.memptr), value);
                z80.regs.hl = value;
                break;
            }
            case 0x2B: { // dec hl
                let value;
                value = z80.regs.hl;
                value = dec16(value);
                z80.regs.hl = value;
                break;
            }
            case 0x2C: { // inc l
                let value;
                value = z80.regs.l;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.l = value;
                break;
            }
            case 0x2D: { // dec l
                let value;
                value = z80.regs.l;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.l = value;
                break;
            }
            case 0x2E: { // ld l,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.l = value;
                break;
            }
            case 0x2F: { // cpl
                z80.regs.a ^= 0xFF;
                z80.regs.f = (z80.regs.f & (Flag.C | Flag.P | Flag.Z | Flag.S)) | (z80.regs.a & (Flag.X3 | Flag.X5)) | Flag.N | Flag.H;
                break;
            }
            case 0x30: { // jr nc,offset
                if ((z80.regs.f & Flag.C) === 0) {
                    const offset = z80.readByte(z80.regs.pc);
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                    z80.regs.pc = inc16(z80.regs.pc);
                    z80.regs.memptr = z80.regs.pc;
                }
                else {
                    z80.incTStateCount(3);
                    z80.regs.pc = inc16(z80.regs.pc);
                }
                break;
            }
            case 0x31: { // ld sp,nnnn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.sp = value;
                break;
            }
            case 0x32: { // ld (nnnn),a
                let value;
                value = z80.regs.a;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.regs.a, inc16(value));
                z80.writeByte(value, z80.regs.a);
                break;
            }
            case 0x33: { // inc sp
                let value;
                value = z80.regs.sp;
                value = inc16(value);
                z80.regs.sp = value;
                break;
            }
            case 0x34: { // inc (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x35: { // dec (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.incTStateCount(1);
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x36: { // ld (hl),nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x37: { // scf
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | Flag.C | (z80.regs.a & (Flag.X3 | Flag.X5));
                break;
            }
            case 0x38: { // jr c,offset
                if ((z80.regs.f & Flag.C) !== 0) {
                    const offset = z80.readByte(z80.regs.pc);
                    z80.incTStateCount(5);
                    z80.regs.pc = add16(z80.regs.pc, signedByte(offset));
                    z80.regs.pc = inc16(z80.regs.pc);
                    z80.regs.memptr = z80.regs.pc;
                }
                else {
                    z80.incTStateCount(3);
                    z80.regs.pc = inc16(z80.regs.pc);
                }
                break;
            }
            case 0x39: { // add hl,sp
                let value;
                z80.incTStateCount(7);
                value = z80.regs.sp;
                let result = z80.regs.hl + value;
                const lookup = (((z80.regs.hl & 0x0800) >> 11) |
                    ((value & 0x0800) >> 10) |
                    ((result & 0x0800) >> 9)) & 0xFF;
                z80.regs.memptr = inc16(z80.regs.hl);
                z80.regs.hl = result & 0xFFFF;
                z80.regs.f = (z80.regs.f & (Flag.V | Flag.Z | Flag.S)) | ((result & 0x10000) !== 0 ? Flag.C : 0) | ((result >> 8) & (Flag.X3 | Flag.X5)) | halfCarryAddTable[lookup];
                break;
            }
            case 0x3A: { // ld a,(nnnn)
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                value = word(z80.readByte(z80.regs.pc), value);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = inc16(value);
                value = z80.readByte(value);
                z80.regs.a = value;
                break;
            }
            case 0x3B: { // dec sp
                let value;
                value = z80.regs.sp;
                value = dec16(value);
                z80.regs.sp = value;
                break;
            }
            case 0x3C: { // inc a
                let value;
                value = z80.regs.a;
                value = inc8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x80 ? Flag.V : 0) | ((value & 0x0F) !== 0 ? 0 : Flag.H) | z80.sz53Table[value];
                z80.regs.a = value;
                break;
            }
            case 0x3D: { // dec a
                let value;
                value = z80.regs.a;
                const oldValue = value;
                value = dec8(value);
                z80.regs.f = (z80.regs.f & Flag.C) | (value === 0x7F ? Flag.V : 0) | ((oldValue & 0x0F) !== 0 ? 0 : Flag.H) | Flag.N | z80.sz53Table[value];
                z80.regs.a = value;
                break;
            }
            case 0x3E: { // ld a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.a = value;
                break;
            }
            case 0x3F: { // ccf
                z80.regs.f = (z80.regs.f & (Flag.P | Flag.Z | Flag.S)) | ((z80.regs.f & Flag.C) !== 0 ? Flag.H : Flag.C) | (z80.regs.a & (Flag.X3 | Flag.X5));
                break;
            }
            case 0x40: { // ld b,b
                let value;
                value = z80.regs.b;
                z80.regs.b = value;
                break;
            }
            case 0x41: { // ld b,c
                let value;
                value = z80.regs.c;
                z80.regs.b = value;
                break;
            }
            case 0x42: { // ld b,d
                let value;
                value = z80.regs.d;
                z80.regs.b = value;
                break;
            }
            case 0x43: { // ld b,e
                let value;
                value = z80.regs.e;
                z80.regs.b = value;
                break;
            }
            case 0x44: { // ld b,h
                let value;
                value = z80.regs.h;
                z80.regs.b = value;
                break;
            }
            case 0x45: { // ld b,l
                let value;
                value = z80.regs.l;
                z80.regs.b = value;
                break;
            }
            case 0x46: { // ld b,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.b = value;
                break;
            }
            case 0x47: { // ld b,a
                let value;
                value = z80.regs.a;
                z80.regs.b = value;
                break;
            }
            case 0x48: { // ld c,b
                let value;
                value = z80.regs.b;
                z80.regs.c = value;
                break;
            }
            case 0x49: { // ld c,c
                let value;
                value = z80.regs.c;
                z80.regs.c = value;
                break;
            }
            case 0x4A: { // ld c,d
                let value;
                value = z80.regs.d;
                z80.regs.c = value;
                break;
            }
            case 0x4B: { // ld c,e
                let value;
                value = z80.regs.e;
                z80.regs.c = value;
                break;
            }
            case 0x4C: { // ld c,h
                let value;
                value = z80.regs.h;
                z80.regs.c = value;
                break;
            }
            case 0x4D: { // ld c,l
                let value;
                value = z80.regs.l;
                z80.regs.c = value;
                break;
            }
            case 0x4E: { // ld c,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.c = value;
                break;
            }
            case 0x4F: { // ld c,a
                let value;
                value = z80.regs.a;
                z80.regs.c = value;
                break;
            }
            case 0x50: { // ld d,b
                let value;
                value = z80.regs.b;
                z80.regs.d = value;
                break;
            }
            case 0x51: { // ld d,c
                let value;
                value = z80.regs.c;
                z80.regs.d = value;
                break;
            }
            case 0x52: { // ld d,d
                let value;
                value = z80.regs.d;
                z80.regs.d = value;
                break;
            }
            case 0x53: { // ld d,e
                let value;
                value = z80.regs.e;
                z80.regs.d = value;
                break;
            }
            case 0x54: { // ld d,h
                let value;
                value = z80.regs.h;
                z80.regs.d = value;
                break;
            }
            case 0x55: { // ld d,l
                let value;
                value = z80.regs.l;
                z80.regs.d = value;
                break;
            }
            case 0x56: { // ld d,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.d = value;
                break;
            }
            case 0x57: { // ld d,a
                let value;
                value = z80.regs.a;
                z80.regs.d = value;
                break;
            }
            case 0x58: { // ld e,b
                let value;
                value = z80.regs.b;
                z80.regs.e = value;
                break;
            }
            case 0x59: { // ld e,c
                let value;
                value = z80.regs.c;
                z80.regs.e = value;
                break;
            }
            case 0x5A: { // ld e,d
                let value;
                value = z80.regs.d;
                z80.regs.e = value;
                break;
            }
            case 0x5B: { // ld e,e
                let value;
                value = z80.regs.e;
                z80.regs.e = value;
                break;
            }
            case 0x5C: { // ld e,h
                let value;
                value = z80.regs.h;
                z80.regs.e = value;
                break;
            }
            case 0x5D: { // ld e,l
                let value;
                value = z80.regs.l;
                z80.regs.e = value;
                break;
            }
            case 0x5E: { // ld e,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.e = value;
                break;
            }
            case 0x5F: { // ld e,a
                let value;
                value = z80.regs.a;
                z80.regs.e = value;
                break;
            }
            case 0x60: { // ld h,b
                let value;
                value = z80.regs.b;
                z80.regs.h = value;
                break;
            }
            case 0x61: { // ld h,c
                let value;
                value = z80.regs.c;
                z80.regs.h = value;
                break;
            }
            case 0x62: { // ld h,d
                let value;
                value = z80.regs.d;
                z80.regs.h = value;
                break;
            }
            case 0x63: { // ld h,e
                let value;
                value = z80.regs.e;
                z80.regs.h = value;
                break;
            }
            case 0x64: { // ld h,h
                let value;
                value = z80.regs.h;
                z80.regs.h = value;
                break;
            }
            case 0x65: { // ld h,l
                let value;
                value = z80.regs.l;
                z80.regs.h = value;
                break;
            }
            case 0x66: { // ld h,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.h = value;
                break;
            }
            case 0x67: { // ld h,a
                let value;
                value = z80.regs.a;
                z80.regs.h = value;
                break;
            }
            case 0x68: { // ld l,b
                let value;
                value = z80.regs.b;
                z80.regs.l = value;
                break;
            }
            case 0x69: { // ld l,c
                let value;
                value = z80.regs.c;
                z80.regs.l = value;
                break;
            }
            case 0x6A: { // ld l,d
                let value;
                value = z80.regs.d;
                z80.regs.l = value;
                break;
            }
            case 0x6B: { // ld l,e
                let value;
                value = z80.regs.e;
                z80.regs.l = value;
                break;
            }
            case 0x6C: { // ld l,h
                let value;
                value = z80.regs.h;
                z80.regs.l = value;
                break;
            }
            case 0x6D: { // ld l,l
                let value;
                value = z80.regs.l;
                z80.regs.l = value;
                break;
            }
            case 0x6E: { // ld l,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.l = value;
                break;
            }
            case 0x6F: { // ld l,a
                let value;
                value = z80.regs.a;
                z80.regs.l = value;
                break;
            }
            case 0x70: { // ld (hl),b
                let value;
                value = z80.regs.b;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x71: { // ld (hl),c
                let value;
                value = z80.regs.c;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x72: { // ld (hl),d
                let value;
                value = z80.regs.d;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x73: { // ld (hl),e
                let value;
                value = z80.regs.e;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x74: { // ld (hl),h
                let value;
                value = z80.regs.h;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x75: { // ld (hl),l
                let value;
                value = z80.regs.l;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x76: { // halt
                z80.regs.halted = 1;
                z80.regs.pc = dec16(z80.regs.pc);
                break;
            }
            case 0x77: { // ld (hl),a
                let value;
                value = z80.regs.a;
                z80.writeByte(z80.regs.hl, value);
                break;
            }
            case 0x78: { // ld a,b
                let value;
                value = z80.regs.b;
                z80.regs.a = value;
                break;
            }
            case 0x79: { // ld a,c
                let value;
                value = z80.regs.c;
                z80.regs.a = value;
                break;
            }
            case 0x7A: { // ld a,d
                let value;
                value = z80.regs.d;
                z80.regs.a = value;
                break;
            }
            case 0x7B: { // ld a,e
                let value;
                value = z80.regs.e;
                z80.regs.a = value;
                break;
            }
            case 0x7C: { // ld a,h
                let value;
                value = z80.regs.h;
                z80.regs.a = value;
                break;
            }
            case 0x7D: { // ld a,l
                let value;
                value = z80.regs.l;
                z80.regs.a = value;
                break;
            }
            case 0x7E: { // ld a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.a = value;
                break;
            }
            case 0x7F: { // ld a,a
                let value;
                value = z80.regs.a;
                z80.regs.a = value;
                break;
            }
            case 0x80: { // add a,b
                let value;
                value = z80.regs.b;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x81: { // add a,c
                let value;
                value = z80.regs.c;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x82: { // add a,d
                let value;
                value = z80.regs.d;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x83: { // add a,e
                let value;
                value = z80.regs.e;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x84: { // add a,h
                let value;
                value = z80.regs.h;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x85: { // add a,l
                let value;
                value = z80.regs.l;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x86: { // add a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x87: { // add a,a
                let value;
                value = z80.regs.a;
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x88: { // adc a,b
                let value;
                value = z80.regs.b;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x89: { // adc a,c
                let value;
                value = z80.regs.c;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8A: { // adc a,d
                let value;
                value = z80.regs.d;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8B: { // adc a,e
                let value;
                value = z80.regs.e;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8C: { // adc a,h
                let value;
                value = z80.regs.h;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8D: { // adc a,l
                let value;
                value = z80.regs.l;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8E: { // adc a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x8F: { // adc a,a
                let value;
                value = z80.regs.a;
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x90: { // sub a,b
                let value;
                value = z80.regs.b;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x91: { // sub a,c
                let value;
                value = z80.regs.c;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x92: { // sub a,d
                let value;
                value = z80.regs.d;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x93: { // sub a,e
                let value;
                value = z80.regs.e;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x94: { // sub a,h
                let value;
                value = z80.regs.h;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x95: { // sub a,l
                let value;
                value = z80.regs.l;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x96: { // sub a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x97: { // sub a,a
                let value;
                value = z80.regs.a;
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x98: { // sbc a,b
                let value;
                value = z80.regs.b;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x99: { // sbc a,c
                let value;
                value = z80.regs.c;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9A: { // sbc a,d
                let value;
                value = z80.regs.d;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9B: { // sbc a,e
                let value;
                value = z80.regs.e;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9C: { // sbc a,h
                let value;
                value = z80.regs.h;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9D: { // sbc a,l
                let value;
                value = z80.regs.l;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9E: { // sbc a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0x9F: { // sbc a,a
                let value;
                value = z80.regs.a;
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xA0: { // and a,b
                let value;
                value = z80.regs.b;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA1: { // and a,c
                let value;
                value = z80.regs.c;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA2: { // and a,d
                let value;
                value = z80.regs.d;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA3: { // and a,e
                let value;
                value = z80.regs.e;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA4: { // and a,h
                let value;
                value = z80.regs.h;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA5: { // and a,l
                let value;
                value = z80.regs.l;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA6: { // and a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA7: { // and a,a
                let value;
                value = z80.regs.a;
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xA8: { // xor a,b
                let value;
                value = z80.regs.b;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xA9: { // xor a,c
                let value;
                value = z80.regs.c;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAA: { // xor a,d
                let value;
                value = z80.regs.d;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAB: { // xor a,e
                let value;
                value = z80.regs.e;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAC: { // xor a,h
                let value;
                value = z80.regs.h;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAD: { // xor a,l
                let value;
                value = z80.regs.l;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAE: { // xor a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xAF: { // xor a,a
                let value;
                value = z80.regs.a;
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB0: { // or a,b
                let value;
                value = z80.regs.b;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB1: { // or a,c
                let value;
                value = z80.regs.c;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB2: { // or a,d
                let value;
                value = z80.regs.d;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB3: { // or a,e
                let value;
                value = z80.regs.e;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB4: { // or a,h
                let value;
                value = z80.regs.h;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB5: { // or a,l
                let value;
                value = z80.regs.l;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB6: { // or a,(hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB7: { // or a,a
                let value;
                value = z80.regs.a;
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xB8: { // cp b
                let value;
                value = z80.regs.b;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xB9: { // cp c
                let value;
                value = z80.regs.c;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBA: { // cp d
                let value;
                value = z80.regs.d;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBB: { // cp e
                let value;
                value = z80.regs.e;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBC: { // cp h
                let value;
                value = z80.regs.h;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBD: { // cp l
                let value;
                value = z80.regs.l;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBE: { // cp (hl)
                let value;
                value = z80.readByte(z80.regs.hl);
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xBF: { // cp a
                let value;
                value = z80.regs.a;
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xC0: { // ret nz
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.Z) === 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xC1: { // pop bc
                z80.regs.bc = z80.popWord();
                break;
            }
            case 0xC2: { // jp nz,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.Z) === 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xC3: { // jp nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.pc = z80.regs.memptr;
                break;
            }
            case 0xC4: { // call nz,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.Z) === 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xC5: { // push bc
                z80.pushWord(z80.regs.bc);
                break;
            }
            case 0xC6: { // add a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let result = add16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xC7: { // rst 00
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0000;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xC8: { // ret z
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.Z) !== 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xC9: { // ret
                z80.incTStateCount(1);
                z80.regs.pc = z80.popWord();
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xCA: { // jp z,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.Z) !== 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xCB: { // shift cb
                decodeCB(z80);
                break;
            }
            case 0xCC: { // call z,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.Z) !== 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xCD: { // call nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = z80.regs.memptr;
                break;
            }
            case 0xCE: { // adc a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let result = add16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = inc16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | halfCarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xCF: { // rst 8
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0008;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xD0: { // ret nc
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.C) === 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xD1: { // pop de
                z80.regs.de = z80.popWord();
                break;
            }
            case 0xD2: { // jp nc,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.C) === 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xD3: { // out (nn),a
                const port = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.regs.a, inc8(port));
                z80.writePort(word(z80.regs.a, port), z80.regs.a);
                break;
            }
            case 0xD4: { // call nc,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.C) === 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xD5: { // push de
                z80.pushWord(z80.regs.de);
                break;
            }
            case 0xD6: { // sub a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let result = sub16(z80.regs.a, value);
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xD7: { // rst 10
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0010;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xD8: { // ret c
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.C) !== 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xD9: { // exx
                let tmp;
                tmp = z80.regs.bc;
                z80.regs.bc = z80.regs.bcPrime;
                z80.regs.bcPrime = tmp;
                tmp = z80.regs.de;
                z80.regs.de = z80.regs.dePrime;
                z80.regs.dePrime = tmp;
                tmp = z80.regs.hl;
                z80.regs.hl = z80.regs.hlPrime;
                z80.regs.hlPrime = tmp;
                break;
            }
            case 0xDA: { // jp c,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.C) !== 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xDB: { // in a,(nn)
                const port = word(z80.regs.a, z80.readByte(z80.regs.pc));
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.a = z80.readPort(port);
                z80.regs.memptr = inc16(port);
                break;
            }
            case 0xDC: { // call c,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.C) !== 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xDD: { // shift dd
                decodeDD(z80);
                break;
            }
            case 0xDE: { // sbc a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                let result = sub16(z80.regs.a, value);
                if ((z80.regs.f & Flag.C) !== 0) {
                    result = dec16(result);
                }
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((result & 0x88) >> 1)) & 0xFF;
                z80.regs.a = result & 0xFF;
                z80.regs.f = (((result & 0x100) !== 0) ? Flag.C : 0) | Flag.N | halfCarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | z80.sz53Table[z80.regs.a];
                break;
            }
            case 0xDF: { // rst 18
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0018;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xE0: { // ret po
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.P) === 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xE1: { // pop hl
                z80.regs.hl = z80.popWord();
                break;
            }
            case 0xE2: { // jp po,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.P) === 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xE3: { // ex (sp),hl
                const rightValue = z80.regs.hl;
                const leftValueL = z80.readByte(z80.regs.sp);
                const leftValueH = z80.readByte(inc16(z80.regs.sp));
                z80.incTStateCount(1);
                z80.writeByte(inc16(z80.regs.sp), hi(rightValue));
                z80.writeByte(z80.regs.sp, lo(rightValue));
                z80.incTStateCount(2);
                z80.regs.memptr = word(leftValueH, leftValueL);
                z80.regs.hl = word(leftValueH, leftValueL);
                break;
            }
            case 0xE4: { // call po,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.P) === 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xE5: { // push hl
                z80.pushWord(z80.regs.hl);
                break;
            }
            case 0xE6: { // and nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.a &= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                z80.regs.f |= Flag.H;
                break;
            }
            case 0xE7: { // rst 20
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0020;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xE8: { // ret pe
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.P) !== 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xE9: { // jp hl
                z80.regs.pc = z80.regs.hl;
                break;
            }
            case 0xEA: { // jp pe,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.P) !== 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xEB: { // ex de,hl
                const rightValue = z80.regs.hl;
                z80.regs.hl = z80.regs.de;
                z80.regs.de = rightValue;
                break;
            }
            case 0xEC: { // call pe,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.P) !== 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xED: { // shift ed
                decodeED(z80);
                break;
            }
            case 0xEE: { // xor a,nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.a ^= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xEF: { // rst 28
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0028;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xF0: { // ret p
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.S) === 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xF1: { // pop af
                z80.regs.af = z80.popWord();
                break;
            }
            case 0xF2: { // jp p,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.S) === 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xF3: { // di
                z80.regs.iff1 = 0;
                z80.regs.iff2 = 0;
                break;
            }
            case 0xF4: { // call p,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.S) === 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xF5: { // push af
                z80.pushWord(z80.regs.af);
                break;
            }
            case 0xF6: { // or nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.a |= value;
                z80.regs.f = z80.sz53pTable[z80.regs.a];
                break;
            }
            case 0xF7: { // rst 30
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0030;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            case 0xF8: { // ret m
                z80.incTStateCount(1);
                if ((z80.regs.f & Flag.S) !== 0) {
                    z80.regs.pc = z80.popWord();
                    z80.regs.memptr = z80.regs.pc;
                }
                break;
            }
            case 0xF9: { // ld sp,hl
                let value;
                value = z80.regs.hl;
                z80.regs.sp = value;
                break;
            }
            case 0xFA: { // jp m,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.S) !== 0) {
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xFB: { // ei
                z80.regs.iff1 = 1;
                z80.regs.iff2 = 1;
                break;
            }
            case 0xFC: { // call m,nnnn
                z80.regs.memptr = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                z80.regs.memptr = word(z80.readByte(z80.regs.pc), z80.regs.memptr);
                z80.regs.pc = inc16(z80.regs.pc);
                if ((z80.regs.f & Flag.S) !== 0) {
                    z80.pushWord(z80.regs.pc);
                    z80.regs.pc = z80.regs.memptr;
                }
                break;
            }
            case 0xFD: { // shift fd
                decodeFD(z80);
                break;
            }
            case 0xFE: { // cp nn
                let value;
                value = z80.readByte(z80.regs.pc);
                z80.regs.pc = inc16(z80.regs.pc);
                const diff = (z80.regs.a - value) & 0xFFFF;
                const lookup = (((z80.regs.a & 0x88) >> 3) |
                    ((value & 0x88) >> 2) |
                    ((diff & 0x88) >> 1)) & 0xFF;
                let f = Flag.N;
                if ((diff & 0x100) != 0)
                    f |= Flag.C;
                if (diff == 0)
                    f |= Flag.Z;
                f |= halfCarrySubTable[lookup & 0x07];
                f |= overflowSubTable[lookup >> 4];
                f |= value & (Flag.X3 | Flag.X5);
                f |= diff & Flag.S;
                z80.regs.af = word(z80.regs.a, f);
                break;
            }
            case 0xFF: { // rst 38
                z80.incTStateCount(1);
                z80.pushWord(z80.regs.pc);
                z80.regs.pc = 0x0038;
                z80.regs.memptr = z80.regs.pc;
                break;
            }
            default:
                console.log("Unhandled opcode " + toHex(inst, 2));
                break;
        }
    }

    /**
     * Emulated Z80 processor.
     */
    class Z80 {
        constructor(hal) {
            /**
             * Full set of registers.
             */
            this.regs = new RegisterSet();
            /**
             * Tables for computing flags. Public so that the decoding function
             * can access them.
             */
            this.sz53Table = []; /* The S, Z, 5 and 3 bits of the index */
            this.parityTable = []; /* The parity of the lookup value */
            this.sz53pTable = []; /* OR the above two tables together */
            this.hal = hal;
            this.initTables();
        }
        /**
         * Reset the Z80 to a known state.
         */
        reset() {
            this.regs = new RegisterSet();
        }
        /**
         * Execute one instruction.
         */
        step() {
            decode(this);
        }
        /**
         * Increment the clock count.
         */
        incTStateCount(count) {
            this.hal.tStateCount += count;
        }
        /**
         * Interrupt the CPU with a maskable interrupt
         */
        maskableInterrupt() {
            if (this.regs.iff1 !== 0) {
                this.interrupt(true);
            }
        }
        /**
         * Interrupt the CPU with a non-maskable interrupt
         */
        nonMaskableInterrupt() {
            this.interrupt(false);
        }
        /**
         * Read a byte from memory, taking as many clock cycles as necessary.
         */
        readByte(address) {
            this.incTStateCount(3);
            return this.readByteInternal(address);
        }
        /**
         * Reads a word at the specified address. Reads the low byte first.
         */
        readWord(address) {
            const lowByte = this.readByte(address);
            const highByte = this.readByte(address + 1);
            return word(highByte, lowByte);
        }
        /**
         * Read a byte from memory (not affecting clock).
         */
        readByteInternal(address) {
            return this.hal.readMemory(address);
        }
        /**
         * Write a byte to memory, taking as many clock cycles as necessary.
         */
        writeByte(address, value) {
            this.incTStateCount(3);
            this.writeByteInternal(address, value);
        }
        /**
         * Write a byte to memory (not affecting clock).
         */
        writeByteInternal(address, value) {
            this.hal.writeMemory(address, value);
        }
        /**
         * Write a byte to a port, taking as many clock cycles as necessary.
         */
        writePort(address, value) {
            this.incTStateCount(1);
            this.hal.writePort(address, value);
            this.incTStateCount(3);
        }
        /**
         * Read a byte from a port, taking as many clock cycles as necessary.
         */
        readPort(address) {
            this.incTStateCount(1);
            const value = this.hal.readPort(address);
            this.incTStateCount(3);
            return value;
        }
        /**
         * Push a word on the stack.
         */
        pushWord(value) {
            this.pushByte(hi(value));
            this.pushByte(lo(value));
        }
        /**
         * Push a byte on the stack.
         */
        pushByte(value) {
            this.regs.sp = (this.regs.sp - 1) & 0xFFFF;
            this.writeByte(this.regs.sp, value);
        }
        /**
         * Pop a word from the stack.
         */
        popWord() {
            const lowByte = this.popByte();
            const highByte = this.popByte();
            return word(highByte, lowByte);
        }
        /**
         * Pop a byte from the stack.
         */
        popByte() {
            const value = this.readByte(this.regs.sp);
            this.regs.sp = inc16(this.regs.sp);
            return value;
        }
        /**
         * Process either kind of interrupt. If maskable, assumes that
         * the mask has already been checked.
         */
        interrupt(maskable) {
            if (this.regs.halted) {
                // Skip past HALT instruction.
                this.regs.pc++;
                this.regs.halted = 0;
            }
            this.incTStateCount(7);
            this.regs.r += 1;
            this.regs.iff1 = 0;
            this.regs.iff2 = 0;
            this.pushWord(this.regs.pc);
            if (maskable) {
                switch (this.regs.im) {
                    case 0:
                    case 1:
                        this.regs.pc = 0x0038;
                        break;
                    case 2: {
                        // The LSB here is taken from the data bus, so it's
                        // unpredictable. We use 0xFF but any value would do.
                        const address = word(this.regs.i, 0xFF);
                        this.regs.pc = this.readWord(address);
                        break;
                    }
                    default:
                        throw new Error("Unknown im mode " + this.regs.im);
                }
            }
            else {
                this.regs.pc = 0x0066;
            }
        }
        initTables() {
            for (let i = 0; i < 0x100; i++) {
                this.sz53Table.push(i & (Flag.X3 | Flag.X5 | Flag.S));
                let bits = i;
                let parity = 0;
                for (let bit = 0; bit < 8; bit++) {
                    parity ^= bits & 1;
                    bits >>= 1;
                }
                this.parityTable.push(parity ? 0 : Flag.P);
                this.sz53pTable.push(this.sz53Table[i] | this.parityTable[i]);
            }
            this.sz53Table[0] |= Flag.Z;
            this.sz53pTable[0] |= Flag.Z;
        }
    }

    var css = `

.trs80-emulator {
    display: inline-block;
    padding: 10px;
    background-color: #334843;
    border-radius: 8px;
    /* Pack the lines tightly: */
    line-height: 1px;
}

.trs80-emulator span {
    display: inline-block;
    white-space: pre;
    width: 8px;
    height: 24px;
    background-position: 0 0; /* Blank */
    background-repeat: no-repeat;
}

.trs80-emulator-expanded span {
    width: 16px;
}

.trs80-emulator-expanded .trs80-emulator-odd-column {
    display: none;
}

/* Put this at the bottom to make it easier to edit the text above. */
.trs80-emulator span {
    /* Generate with "base64 font.png". */
    background-image: url("data:image/png;base64,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");
}
`;

    // Handle keyboard mapping. The TRS-80 Model III keyboard has keys in different
    // places, so we must occasionally fake a Shift key being up or down when it's
    // really not.
    const BEGIN_ADDR = 0x3800;
    const END_ADDR = BEGIN_ADDR + 256;
    const KEY_DELAY_CLOCK_CYCLES = 50000;
    // Whether to force a Shift key, and how.
    var ShiftState;
    (function (ShiftState) {
        ShiftState[ShiftState["NEUTRAL"] = 0] = "NEUTRAL";
        ShiftState[ShiftState["FORCE_DOWN"] = 1] = "FORCE_DOWN";
        ShiftState[ShiftState["FORCE_UP"] = 2] = "FORCE_UP";
    })(ShiftState || (ShiftState = {}));
    // For each ASCII character or key we keep track of how to trigger it.
    class KeyInfo {
        constructor(byteIndex, bitNumber, shiftForce) {
            this.byteIndex = byteIndex;
            this.bitNumber = bitNumber;
            this.shiftForce = shiftForce;
        }
    }
    // A queued-up key.
    class KeyActivity {
        constructor(keyInfo, isPressed) {
            this.keyInfo = keyInfo;
            this.isPressed = isPressed;
        }
    }
    // Map from ASCII or special key to the info of which byte and bit it's mapped
    // to, and whether to force Shift.
    const keyMap = new Map();
    // http://www.trs-80.com/trs80-zaps-internals.htm#keyboard13
    keyMap.set("@", new KeyInfo(0, 0, ShiftState.FORCE_UP));
    keyMap.set("A", new KeyInfo(0, 1, ShiftState.FORCE_DOWN));
    keyMap.set("B", new KeyInfo(0, 2, ShiftState.FORCE_DOWN));
    keyMap.set("C", new KeyInfo(0, 3, ShiftState.FORCE_DOWN));
    keyMap.set("D", new KeyInfo(0, 4, ShiftState.FORCE_DOWN));
    keyMap.set("E", new KeyInfo(0, 5, ShiftState.FORCE_DOWN));
    keyMap.set("F", new KeyInfo(0, 6, ShiftState.FORCE_DOWN));
    keyMap.set("G", new KeyInfo(0, 7, ShiftState.FORCE_DOWN));
    keyMap.set("H", new KeyInfo(1, 0, ShiftState.FORCE_DOWN));
    keyMap.set("I", new KeyInfo(1, 1, ShiftState.FORCE_DOWN));
    keyMap.set("J", new KeyInfo(1, 2, ShiftState.FORCE_DOWN));
    keyMap.set("K", new KeyInfo(1, 3, ShiftState.FORCE_DOWN));
    keyMap.set("L", new KeyInfo(1, 4, ShiftState.FORCE_DOWN));
    keyMap.set("M", new KeyInfo(1, 5, ShiftState.FORCE_DOWN));
    keyMap.set("N", new KeyInfo(1, 6, ShiftState.FORCE_DOWN));
    keyMap.set("O", new KeyInfo(1, 7, ShiftState.FORCE_DOWN));
    keyMap.set("P", new KeyInfo(2, 0, ShiftState.FORCE_DOWN));
    keyMap.set("Q", new KeyInfo(2, 1, ShiftState.FORCE_DOWN));
    keyMap.set("R", new KeyInfo(2, 2, ShiftState.FORCE_DOWN));
    keyMap.set("S", new KeyInfo(2, 3, ShiftState.FORCE_DOWN));
    keyMap.set("T", new KeyInfo(2, 4, ShiftState.FORCE_DOWN));
    keyMap.set("U", new KeyInfo(2, 5, ShiftState.FORCE_DOWN));
    keyMap.set("V", new KeyInfo(2, 6, ShiftState.FORCE_DOWN));
    keyMap.set("W", new KeyInfo(2, 7, ShiftState.FORCE_DOWN));
    keyMap.set("X", new KeyInfo(3, 0, ShiftState.FORCE_DOWN));
    keyMap.set("Y", new KeyInfo(3, 1, ShiftState.FORCE_DOWN));
    keyMap.set("Z", new KeyInfo(3, 2, ShiftState.FORCE_DOWN));
    keyMap.set("a", new KeyInfo(0, 1, ShiftState.FORCE_UP));
    keyMap.set("b", new KeyInfo(0, 2, ShiftState.FORCE_UP));
    keyMap.set("c", new KeyInfo(0, 3, ShiftState.FORCE_UP));
    keyMap.set("d", new KeyInfo(0, 4, ShiftState.FORCE_UP));
    keyMap.set("e", new KeyInfo(0, 5, ShiftState.FORCE_UP));
    keyMap.set("f", new KeyInfo(0, 6, ShiftState.FORCE_UP));
    keyMap.set("g", new KeyInfo(0, 7, ShiftState.FORCE_UP));
    keyMap.set("h", new KeyInfo(1, 0, ShiftState.FORCE_UP));
    keyMap.set("i", new KeyInfo(1, 1, ShiftState.FORCE_UP));
    keyMap.set("j", new KeyInfo(1, 2, ShiftState.FORCE_UP));
    keyMap.set("k", new KeyInfo(1, 3, ShiftState.FORCE_UP));
    keyMap.set("l", new KeyInfo(1, 4, ShiftState.FORCE_UP));
    keyMap.set("m", new KeyInfo(1, 5, ShiftState.FORCE_UP));
    keyMap.set("n", new KeyInfo(1, 6, ShiftState.FORCE_UP));
    keyMap.set("o", new KeyInfo(1, 7, ShiftState.FORCE_UP));
    keyMap.set("p", new KeyInfo(2, 0, ShiftState.FORCE_UP));
    keyMap.set("q", new KeyInfo(2, 1, ShiftState.FORCE_UP));
    keyMap.set("r", new KeyInfo(2, 2, ShiftState.FORCE_UP));
    keyMap.set("s", new KeyInfo(2, 3, ShiftState.FORCE_UP));
    keyMap.set("t", new KeyInfo(2, 4, ShiftState.FORCE_UP));
    keyMap.set("u", new KeyInfo(2, 5, ShiftState.FORCE_UP));
    keyMap.set("v", new KeyInfo(2, 6, ShiftState.FORCE_UP));
    keyMap.set("w", new KeyInfo(2, 7, ShiftState.FORCE_UP));
    keyMap.set("x", new KeyInfo(3, 0, ShiftState.FORCE_UP));
    keyMap.set("y", new KeyInfo(3, 1, ShiftState.FORCE_UP));
    keyMap.set("z", new KeyInfo(3, 2, ShiftState.FORCE_UP));
    keyMap.set("0", new KeyInfo(4, 0, ShiftState.FORCE_UP));
    keyMap.set("1", new KeyInfo(4, 1, ShiftState.FORCE_UP));
    keyMap.set("2", new KeyInfo(4, 2, ShiftState.FORCE_UP));
    keyMap.set("3", new KeyInfo(4, 3, ShiftState.FORCE_UP));
    keyMap.set("4", new KeyInfo(4, 4, ShiftState.FORCE_UP));
    keyMap.set("5", new KeyInfo(4, 5, ShiftState.FORCE_UP));
    keyMap.set("6", new KeyInfo(4, 6, ShiftState.FORCE_UP));
    keyMap.set("7", new KeyInfo(4, 7, ShiftState.FORCE_UP));
    keyMap.set("8", new KeyInfo(5, 0, ShiftState.FORCE_UP));
    keyMap.set("9", new KeyInfo(5, 1, ShiftState.FORCE_UP));
    keyMap.set("`", new KeyInfo(4, 0, ShiftState.FORCE_DOWN)); // Simulate Shift-0.
    keyMap.set("!", new KeyInfo(4, 1, ShiftState.FORCE_DOWN));
    keyMap.set("\"", new KeyInfo(4, 2, ShiftState.FORCE_DOWN));
    keyMap.set("#", new KeyInfo(4, 3, ShiftState.FORCE_DOWN));
    keyMap.set("$", new KeyInfo(4, 4, ShiftState.FORCE_DOWN));
    keyMap.set("%", new KeyInfo(4, 5, ShiftState.FORCE_DOWN));
    keyMap.set("&", new KeyInfo(4, 6, ShiftState.FORCE_DOWN));
    keyMap.set("'", new KeyInfo(4, 7, ShiftState.FORCE_DOWN));
    keyMap.set("(", new KeyInfo(5, 0, ShiftState.FORCE_DOWN));
    keyMap.set(")", new KeyInfo(5, 1, ShiftState.FORCE_DOWN));
    keyMap.set(":", new KeyInfo(5, 2, ShiftState.FORCE_UP));
    keyMap.set(";", new KeyInfo(5, 3, ShiftState.FORCE_UP));
    keyMap.set(",", new KeyInfo(5, 4, ShiftState.FORCE_UP));
    keyMap.set("-", new KeyInfo(5, 5, ShiftState.FORCE_UP));
    keyMap.set(".", new KeyInfo(5, 6, ShiftState.FORCE_UP));
    keyMap.set("/", new KeyInfo(5, 7, ShiftState.FORCE_UP));
    keyMap.set("*", new KeyInfo(5, 2, ShiftState.FORCE_DOWN));
    keyMap.set("+", new KeyInfo(5, 3, ShiftState.FORCE_DOWN));
    keyMap.set("<", new KeyInfo(5, 4, ShiftState.FORCE_DOWN));
    keyMap.set("=", new KeyInfo(5, 5, ShiftState.FORCE_DOWN));
    keyMap.set(">", new KeyInfo(5, 6, ShiftState.FORCE_DOWN));
    keyMap.set("?", new KeyInfo(5, 7, ShiftState.FORCE_DOWN));
    keyMap.set("Enter", new KeyInfo(6, 0, ShiftState.NEUTRAL));
    keyMap.set("Tab", new KeyInfo(6, 1, ShiftState.NEUTRAL)); // Clear
    keyMap.set("Escape", new KeyInfo(6, 2, ShiftState.NEUTRAL)); // Break
    keyMap.set("ArrowUp", new KeyInfo(6, 3, ShiftState.NEUTRAL));
    keyMap.set("ArrowDown", new KeyInfo(6, 4, ShiftState.NEUTRAL));
    keyMap.set("ArrowLeft", new KeyInfo(6, 5, ShiftState.NEUTRAL));
    keyMap.set("Backspace", new KeyInfo(6, 5, ShiftState.NEUTRAL)); // Left arrow
    keyMap.set("ArrowRight", new KeyInfo(6, 6, ShiftState.NEUTRAL));
    keyMap.set(" ", new KeyInfo(6, 7, ShiftState.NEUTRAL));
    keyMap.set("Shift", new KeyInfo(7, 0, ShiftState.NEUTRAL));
    class Keyboard {
        constructor() {
            // We queue up keystrokes so that we don't overwhelm the ROM polling routines.
            this.keyQueue = [];
            // Whether browser keys should be intercepted.
            this.interceptKeys = false;
            this.keyProcessMinClock = 0;
            // 8 bytes, each a bitfield of keys currently pressed.
            this.keys = new Uint8Array(8);
            this.shiftForce = ShiftState.NEUTRAL;
        }
        static isInRange(address) {
            return address >= BEGIN_ADDR && address < END_ADDR;
        }
        // Release all keys.
        clearKeyboard() {
            this.keys.fill(0);
            this.shiftForce = ShiftState.NEUTRAL;
        }
        // Read a byte from the keyboard memory bank. This is an odd system where
        // bits in the address map to the various bytes, and you can read the OR'ed
        // addresses to read more than one byte at a time. This isn't used by the
        // ROM, I don't think. For the last byte we fake the Shift key if necessary.
        readKeyboard(addr, clock) {
            addr -= BEGIN_ADDR;
            let b = 0;
            // Dequeue if necessary.
            if (clock > this.keyProcessMinClock) {
                const keyWasPressed = this.processKeyQueue();
                if (keyWasPressed) {
                    this.keyProcessMinClock = clock + KEY_DELAY_CLOCK_CYCLES;
                }
            }
            // OR together the various bytes.
            for (let i = 0; i < this.keys.length; i++) {
                let keys = this.keys[i];
                if ((addr & (1 << i)) !== 0) {
                    if (i === 7) {
                        // Modify keys based on the shift force.
                        switch (this.shiftForce) {
                            case ShiftState.NEUTRAL:
                                // Nothing.
                                break;
                            case ShiftState.FORCE_UP:
                                // On the Model III the first two bits are left and right shift,
                                // though we don't handle the right shift anywhere.
                                keys &= ~0x03;
                                break;
                            case ShiftState.FORCE_DOWN:
                                keys |= 0x01;
                                break;
                        }
                    }
                    b |= keys;
                }
            }
            return b;
        }
        // Enqueue a key press or release.
        keyEvent(key, isPressed) {
            // Look up the key info.
            const keyInfo = keyMap.get(key);
            if (keyInfo === undefined) {
                console.log("Unknown key \"" + key + "\"");
            }
            else {
                // Append key to queue.
                this.keyQueue.push(new KeyActivity(keyInfo, isPressed));
            }
        }
        // Convert keys on the keyboard to ASCII letters or special strings like "Enter".
        configureKeyboard() {
            // Handle a key event by mapping it and sending it to the emulator.
            const keyEvent = (event, isPressed) => {
                // Don't do anything if we're not active.
                if (!this.interceptKeys) {
                    return;
                }
                // Don't send to virtual computer if a text input field is selected.
                // if ($(document.activeElement).attr("type") === "text") {
                //     return;
                // }
                // Don't interfere with browser keys.
                if (event.metaKey || event.ctrlKey) {
                    return;
                }
                const key = event.key;
                if (key !== "") {
                    this.keyEvent(key, isPressed);
                    event.preventDefault();
                }
            };
            const body = document.getElementsByTagName("body")[0];
            body.addEventListener("keydown", (event) => keyEvent(event, true));
            body.addEventListener("keyup", (event) => keyEvent(event, false));
            body.addEventListener("paste", (event) => {
                if (event.clipboardData) {
                    const pastedText = event.clipboardData.getData("text/plain");
                    if (pastedText) {
                        for (let ch of pastedText) {
                            if (ch === "\n" || ch === "\r") {
                                ch = "Enter";
                            }
                            this.keyEvent(ch, true);
                            this.keyEvent(ch, false);
                        }
                    }
                }
                event.preventDefault();
            });
        }
        // Dequeue the next key and set its bit. Return whether a key was processed.
        processKeyQueue() {
            const keyActivity = this.keyQueue.shift();
            if (keyActivity === undefined) {
                return false;
            }
            this.shiftForce = keyActivity.keyInfo.shiftForce;
            const bit = 1 << keyActivity.keyInfo.bitNumber;
            if (keyActivity.isPressed) {
                this.keys[keyActivity.keyInfo.byteIndex] |= bit;
            }
            else {
                this.keys[keyActivity.keyInfo.byteIndex] &= ~bit;
            }
            return true;
        }
    }

    const model3Rom = `
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
`;

    // IRQs
    const CASSETTE_RISE_IRQ_MASK = 0x01;
    const CASSETTE_FALL_IRQ_MASK = 0x02;
    const TIMER_IRQ_MASK = 0x04;
    const CASSETTE_IRQ_MASKS = CASSETTE_RISE_IRQ_MASK | CASSETTE_FALL_IRQ_MASK;
    // NMIs
    const RESET_NMI_MASK = 0x20;
    // Timer.
    const TIMER_HZ = 30;
    const ROM_SIZE = 14 * 1024;
    const RAM_START = 16 * 1024;
    const SCREEN_ADDRESS = 15 * 1024;
    // https://en.wikipedia.org/wiki/TRS-80#Model_III
    const CLOCK_HZ = 2030000;
    const INITIAL_CLICKS_PER_TICK = 2000;
    const CSS_PREFIX = "trs80-emulator";
    const CASSETTE_THRESHOLD = 5000 / 32768.0;
    // State of the cassette hardware. We don't support writing.
    var CassetteState;
    (function (CassetteState) {
        CassetteState[CassetteState["CLOSE"] = 0] = "CLOSE";
        CassetteState[CassetteState["READ"] = 1] = "READ";
        CassetteState[CassetteState["FAIL"] = 2] = "FAIL";
    })(CassetteState || (CassetteState = {}));
    // Value of wave in audio: negative, neutral (around zero), or positive.
    var CassetteValue;
    (function (CassetteValue) {
        CassetteValue[CassetteValue["NEGATIVE"] = 0] = "NEGATIVE";
        CassetteValue[CassetteValue["NEUTRAL"] = 1] = "NEUTRAL";
        CassetteValue[CassetteValue["POSITIVE"] = 2] = "POSITIVE";
    })(CassetteValue || (CassetteValue = {}));
    function isScreenAddress(address) {
        return address >= SCREEN_ADDRESS && address < SCREEN_ADDRESS + 1024;
    }
    /**
     * HAL for the TRS-80 Model III.
     */
    class Trs80 {
        constructor(parentNode, cassette) {
            this.tStateCount = 0;
            this.memory = new Uint8Array(64 * 1024);
            this.keyboard = new Keyboard();
            this.modeImage = 0x80;
            // Which IRQs should be handled.
            this.irqMask = 0;
            // Which IRQs have been requested by the hardware.
            this.irqLatch = 0;
            // Which NMIs should be handled.
            this.nmiMask = 0;
            // Which NMIs have been requested by the hardware.
            this.nmiLatch = 0;
            // Whether we've seen this NMI and handled it.
            this.nmiSeen = false;
            this.previousTimerClock = 0;
            this.z80 = new Z80(this);
            this.clocksPerTick = INITIAL_CLICKS_PER_TICK;
            this.startTime = Date.now();
            this.started = false;
            // Internal state of the cassette controller.
            // Whether the motor is running.
            this.cassetteMotorOn = false;
            // State machine.
            this.cassetteState = CassetteState.CLOSE;
            // Internal register state.
            this.cassetteValue = CassetteValue.NEUTRAL;
            this.cassetteLastNonZeroValue = CassetteValue.NEUTRAL;
            this.cassetteFlipFlop = false;
            // When we turned on the motor (started reading the file) and how many samples
            // we've read since then.
            this.cassetteMotorOnClock = 0;
            this.cassetteSamplesRead = 0;
            this.cassetteRiseInterruptCount = 0;
            this.cassetteFallInterruptCount = 0;
            // Make our own sub-node that we have control over.
            const node = document.createElement("div");
            parentNode.appendChild(node);
            this.node = node;
            this.cassette = cassette;
            this.memory.fill(0);
            const raw = window.atob(model3Rom);
            for (let i = 0; i < raw.length; i++) {
                this.memory[i] = raw.charCodeAt(i);
            }
            this.tStateCount = 0;
            this.keyboard.configureKeyboard();
            this.configureNode();
            this.configureStyle();
        }
        reset() {
            this.setIrqMask(0);
            this.setNmiMask(0);
            this.resetCassette();
            this.keyboard.clearKeyboard();
            this.setTimerInterrupt(false);
            this.z80.reset();
        }
        /**
         * Start the CPU and intercept browser keys.
         */
        start() {
            if (!this.started) {
                this.keyboard.interceptKeys = true;
                this.scheduleNextTick();
                this.started = true;
            }
        }
        /**
         * Stop the CPU and no longer intercept browser keys.
         */
        stop() {
            if (this.started) {
                this.keyboard.interceptKeys = false;
                this.cancelTickTimeout();
                this.started = false;
            }
        }
        // Set the mask for IRQ (regular) interrupts.
        setIrqMask(irqMask) {
            this.irqMask = irqMask;
        }
        // Set the mask for non-maskable interrupts. (Yes.)
        setNmiMask(nmiMask) {
            // Reset is always allowed:
            this.nmiMask = nmiMask | RESET_NMI_MASK;
            this.updateNmiSeen();
        }
        step() {
            this.z80.step();
            // Handle non-maskable interrupts.
            if ((this.nmiLatch & this.nmiMask) !== 0 && !this.nmiSeen) {
                this.z80.nonMaskableInterrupt();
                this.nmiSeen = true;
                // Simulate the reset button being released. TODO
                // this.resetButtonInterrupt(false);
            }
            // Handle interrupts.
            if ((this.irqLatch & this.irqMask) !== 0) {
                this.z80.maskableInterrupt();
            }
            // Set off a timer interrupt.
            if (this.tStateCount > this.previousTimerClock + Trs80.TIMER_CYCLES) {
                this.handleTimer();
                this.previousTimerClock = this.tStateCount;
            }
            // Update cassette state.
            this.updateCassette();
        }
        contendMemory(address) {
            // Ignore.
        }
        contendPort(address) {
            // Ignore.
        }
        readMemory(address) {
            if (address < ROM_SIZE || address >= RAM_START || isScreenAddress(address)) {
                return this.memory[address];
            }
            else if (address === 0x37E8) {
                // Printer. 0x30 = Printer selected, ready, with paper, not busy.
                return 0x30;
            }
            else if (Keyboard.isInRange(address)) {
                // Keyboard.
                return this.keyboard.readKeyboard(address, this.tStateCount);
            }
            else {
                // Unmapped memory.
                console.log("Reading from unmapped memory at 0x" + toHex(address, 4));
                return 0xFF;
            }
        }
        readPort(address) {
            const port = address & 0xFF;
            let value;
            switch (port) {
                case 0xE0:
                    // IRQ latch read.
                    value = ~this.irqLatch & 0xFF;
                    break;
                case 0xE4:
                    // NMI latch read.
                    value = ~this.nmiLatch & 0xFF;
                    break;
                case 0xEC:
                case 0xED:
                case 0xEE:
                case 0xEF:
                    // Acknowledge timer.
                    this.setTimerInterrupt(false);
                    value = 0xFF;
                    break;
                case 0xF0:
                    // No diskette.
                    value = 0xFF;
                    break;
                case 0xFF:
                    // Cassette and various flags.
                    value = (this.modeImage & 0x7E) | this.getCassetteByte();
                    break;
                default:
                    console.log("Reading from unknown port 0x" + toHex(lo(address), 2));
                    return 0;
            }
            // console.log("Reading 0x" + toHex(value, 2) + " from port 0x" + toHex(lo(address), 2));
            return value;
        }
        writePort(address, value) {
            const port = address & 0xFF;
            switch (port) {
                case 0xE0:
                    // Set interrupt mask.
                    this.setIrqMask(value);
                    break;
                case 0xE4:
                case 0xE5:
                case 0xE6:
                case 0xE7:
                    // Set NMI state.
                    this.setNmiMask(value);
                    break;
                case 0xEC:
                case 0xED:
                case 0xEE:
                case 0xEF:
                    // Various controls.
                    this.modeImage = value;
                    this.setCassetteMotor((value & 0x02) !== 0);
                    // TODO
                    // this.setExpandedCharacters((value & 0x04) !== 0);
                    break;
                case 0xF0:
                    // Disk command.
                    // TODO
                    // this.writeDiskCommand(value)
                    break;
                case 0xF4:
                case 0xF5:
                case 0xF6:
                case 0xF7:
                    // Disk select.
                    // TODO
                    // this.writeDiskSelect(value)
                    break;
                case 0xFC:
                case 0xFD:
                case 0xFE:
                case 0xFF:
                    if ((value & 0x20) !== 0) {
                        // Model III Micro Labs graphics card.
                        console.log("Sending 0x" + toHex(value, 2) + " to Micro Labs graphics card");
                    }
                    else {
                        // Do cassette emulation.
                        this.putCassetteByte(value & 0x03);
                    }
                    break;
                default:
                    console.log("Writing 0x" + toHex(value, 2) + " to unknown port 0x" + toHex(port, 2));
                    return;
            }
            // console.log("Wrote 0x" + toHex(value, 2) + " to port 0x" + toHex(port, 2));
        }
        writeMemory(address, value) {
            if (address < ROM_SIZE) {
                console.log("Warning: Writing to ROM location 0x" + toHex(address, 4));
            }
            else {
                if (address >= 15360 && address < 16384) {
                    const chList = this.node.getElementsByClassName(CSS_PREFIX + "-c" + address);
                    if (chList.length > 0) {
                        const ch = chList[0];
                        // It'd be nice to put the character there so that copy-and-paste works.
                        /// ch.innerText = String.fromCharCode(value);
                        for (let i = 0; i < ch.classList.length; i++) {
                            const className = ch.classList[i];
                            if (className.startsWith(CSS_PREFIX + "-char-")) {
                                ch.classList.remove(className);
                                // There should only be one.
                                break;
                            }
                        }
                        ch.classList.add(CSS_PREFIX + "-char-" + value);
                    }
                }
                else if (address < RAM_START) {
                    console.log("Writing to unmapped memory at 0x" + toHex(address, 4));
                }
                this.memory[address] = value;
            }
        }
        // Reset cassette edge interrupts.
        cassetteClearInterrupt() {
            this.irqLatch &= ~CASSETTE_IRQ_MASKS;
        }
        // Check whether the software has enabled these interrupts.
        cassetteInterruptsEnabled() {
            return (this.irqMask & CASSETTE_IRQ_MASKS) !== 0;
        }
        // Reset whether we've seen this NMI interrupt if the mask and latch no longer overlap.
        updateNmiSeen() {
            if ((this.nmiLatch & this.nmiMask) === 0) {
                this.nmiSeen = false;
            }
        }
        configureNode() {
            if (this.node.classList.contains(CSS_PREFIX)) {
                // Already configured.
                return;
            }
            this.node.classList.add(CSS_PREFIX);
            this.node.classList.add(CSS_PREFIX + "-narrow");
            for (let offset = 0; offset < 1024; offset++) {
                const address = SCREEN_ADDRESS + offset;
                const c = document.createElement("span");
                c.classList.add(CSS_PREFIX + "-c" + address);
                if (offset % 2 === 0) {
                    c.classList.add(CSS_PREFIX + "-even-column");
                }
                else {
                    c.classList.add(CSS_PREFIX + "-odd-column");
                }
                c.innerText = " ";
                this.node.appendChild(c);
                // Newlines.
                if (offset % 64 === 63) {
                    this.node.appendChild(document.createElement("br"));
                }
            }
        }
        configureStyle() {
            const styleId = CSS_PREFIX + "-style";
            if (document.getElementById(styleId) !== null) {
                // Already created.
                return;
            }
            // Image is 512x480
            // 10 rows of glyphs, but last two are different page.
            // Use first 8 rows.
            // 32 chars across (32*8 = 256)
            // For thin font:
            //     256px wide.
            //     Chars are 8px wide (256/32 = 8)
            //     Chars are 24px high (480/2/10 = 24), with doubled rows.
            const lines = [];
            for (let ch = 0; ch < 256; ch++) {
                lines.push(`.${CSS_PREFIX}-narrow .${CSS_PREFIX}-char-${ch} { background-position: ${-(ch % 32) * 8}px ${-Math.floor(ch / 32) * 24}px; }`);
                lines.push(`.${CSS_PREFIX}-expanded .${CSS_PREFIX}-char-${ch} { background-position: ${-(ch % 32) * 16}px ${-Math.floor(ch / 32 + 10) * 24}px; }`);
            }
            const node = document.createElement("style");
            node.id = styleId;
            node.innerHTML = css + "\n\n" + lines.join("\n");
            document.head.appendChild(node);
        }
        /**
         * Run a certain number of CPU instructions and schedule another tick.
         */
        tick() {
            for (let i = 0; i < this.clocksPerTick; i++) {
                this.step();
            }
            this.scheduleNextTick();
        }
        /**
         * Figure out how many CPU cycles we should optimally run and how long
         * to wait until scheduling it, then schedule it to be run later.
         */
        scheduleNextTick() {
            let delay;
            if (this.cassetteMotorOn || this.keyboard.keyQueue.length > 4) {
                // Go fast if we're accessing the cassette or pasting.
                this.clocksPerTick = 100000;
                delay = 0;
            }
            else {
                // Delay to match original clock speed.
                const now = Date.now();
                const actualElapsed = now - this.startTime;
                const expectedElapsed = this.tStateCount * 1000 / CLOCK_HZ;
                let behind = expectedElapsed - actualElapsed;
                if (behind < -100 || behind > 100) {
                    // We're too far behind or ahead. Catch up artificially.
                    this.startTime = now - expectedElapsed;
                    behind = 0;
                }
                delay = Math.round(Math.max(0, behind));
                if (delay === 0) {
                    // Delay too short, do more each tick.
                    this.clocksPerTick = Math.min(this.clocksPerTick + 100, 10000);
                }
                else if (delay > 1) {
                    // Delay too long, do less each tick.
                    this.clocksPerTick = Math.max(this.clocksPerTick - 100, 100);
                }
            }
            // console.log(this.clocksPerTick, delay);
            this.cancelTickTimeout();
            this.tickHandle = window.setTimeout(() => {
                this.tickHandle = undefined;
                this.tick();
            }, delay);
        }
        /**
         * Stop the tick timeout, if it's running.
         */
        cancelTickTimeout() {
            if (this.tickHandle !== undefined) {
                window.clearTimeout(this.tickHandle);
                this.tickHandle = undefined;
            }
        }
        // Set or reset the timer interrupt.
        setTimerInterrupt(state) {
            if (state) {
                this.irqLatch |= TIMER_IRQ_MASK;
            }
            else {
                this.irqLatch &= ~TIMER_IRQ_MASK;
            }
        }
        // What to do when the hardware timer goes off.
        handleTimer() {
            this.setTimerInterrupt(true);
        }
        // Reset the controller to a known state.
        resetCassette() {
            this.setCassetteState(CassetteState.CLOSE);
        }
        // Get a byte from the I/O port.
        getCassetteByte() {
            // If the motor's running, and we're reading a byte, then get into read mode.
            if (this.cassetteMotorOn) {
                this.setCassetteState(CassetteState.READ);
            }
            // Clear any interrupt that may have triggered this read.
            this.cassetteClearInterrupt();
            // Cassette owns bits 0 and 7.
            let b = 0;
            if (this.cassetteFlipFlop) {
                b |= 0x80;
            }
            if (this.cassetteLastNonZeroValue === CassetteValue.POSITIVE) {
                b |= 0x01;
            }
            return b;
        }
        // Write to the cassette port. We don't support writing tapes, but this is used
        // for 500-baud reading to trigger the next analysis of the tape.
        putCassetteByte(b) {
            if (this.cassetteMotorOn) {
                if (this.cassetteState === CassetteState.READ) {
                    this.updateCassette();
                    this.cassetteFlipFlop = false;
                }
            }
        }
        // Kick off the reading process when doing 1500-baud reads.
        kickOffCassette() {
            if (this.cassetteMotorOn &&
                this.cassetteState === CassetteState.CLOSE &&
                this.cassetteInterruptsEnabled()) {
                // Kick off the process.
                this.cassetteRiseInterrupt();
                this.cassetteFallInterrupt();
            }
        }
        // Turn the motor on or off.
        setCassetteMotor(cassetteMotorOn) {
            if (cassetteMotorOn !== this.cassetteMotorOn) {
                if (cassetteMotorOn) {
                    this.cassetteFlipFlop = false;
                    this.cassetteLastNonZeroValue = CassetteValue.NEUTRAL;
                    // Waits a second before kicking off the cassette.
                    // TODO this should be in CPU cycles, not browser cycles.
                    setTimeout(() => this.kickOffCassette(), 1000);
                }
                else {
                    this.setCassetteState(CassetteState.CLOSE);
                }
                this.cassetteMotorOn = cassetteMotorOn;
                if (cassetteMotorOn) {
                    this.cassette.onMotorStart();
                }
                else {
                    this.cassette.onMotorStop();
                }
            }
        }
        // Read some of the cassette to see if we should be triggering a rise/fall interrupt.
        updateCassette() {
            if (this.cassetteMotorOn && this.setCassetteState(CassetteState.READ) >= 0) {
                // See how many samples we should have read by now.
                const samplesToRead = Math.round((this.tStateCount - this.cassetteMotorOnClock) *
                    this.cassette.samplesPerSecond / CLOCK_HZ);
                // Catch up.
                while (this.cassetteSamplesRead < samplesToRead) {
                    const sample = this.cassette.readSample();
                    this.cassetteSamplesRead++;
                    // Convert to state, where neutral is some noisy in-between state.
                    let cassetteValue = CassetteValue.NEUTRAL;
                    if (sample > CASSETTE_THRESHOLD) {
                        cassetteValue = CassetteValue.POSITIVE;
                    }
                    else if (sample < -CASSETTE_THRESHOLD) {
                        cassetteValue = CassetteValue.NEGATIVE;
                    }
                    // See if we've changed value.
                    if (cassetteValue !== this.cassetteValue) {
                        if (cassetteValue === CassetteValue.POSITIVE) {
                            // Positive edge.
                            this.cassetteFlipFlop = true;
                            this.cassetteRiseInterrupt();
                        }
                        else if (cassetteValue === CassetteValue.NEGATIVE) {
                            // Negative edge.
                            this.cassetteFlipFlop = true;
                            this.cassetteFallInterrupt();
                        }
                        this.cassetteValue = cassetteValue;
                        if (cassetteValue !== CassetteValue.NEUTRAL) {
                            this.cassetteLastNonZeroValue = cassetteValue;
                        }
                    }
                }
            }
        }
        // Returns 0 if the state was changed, 1 if it wasn't, and -1 on error.
        setCassetteState(newState) {
            const oldCassetteState = this.cassetteState;
            // See if we're changing anything.
            if (oldCassetteState === newState) {
                return 1;
            }
            // Once in error, everything will fail until we close.
            if (oldCassetteState === CassetteState.FAIL && newState !== CassetteState.CLOSE) {
                return -1;
            }
            // Change things based on new state.
            switch (newState) {
                case CassetteState.READ:
                    this.openCassetteFile();
                    break;
            }
            // Update state.
            this.cassetteState = newState;
            return 0;
        }
        // Open file, get metadata, and get read to read the tape.
        openCassetteFile() {
            // TODO open/rewind cassette?
            // Reset the clock.
            this.cassetteMotorOnClock = this.tStateCount;
            this.cassetteSamplesRead = 0;
        }
        // Saw a positive edge on cassette.
        cassetteRiseInterrupt() {
            this.cassetteRiseInterruptCount++;
            this.irqLatch = (this.irqLatch & ~CASSETTE_RISE_IRQ_MASK) |
                (this.irqMask & CASSETTE_RISE_IRQ_MASK);
        }
        // Saw a negative edge on cassette.
        cassetteFallInterrupt() {
            this.cassetteFallInterruptCount++;
            this.irqLatch = (this.irqLatch & ~CASSETTE_FALL_IRQ_MASK) |
                (this.irqMask & CASSETTE_FALL_IRQ_MASK);
        }
    }
    Trs80.TIMER_CYCLES = CLOCK_HZ / TIMER_HZ;

    /**
     * An individual waveform to be displayed.
     */
    class Waveform {
        constructor(canvas, samples) {
            this.canvas = canvas;
            this.samples = samples;
        }
    }
    /**
     * Displays a list of different waveforms, synchronizing their pan and zoom.
     */
    class WaveformDisplay {
        constructor() {
            this.displayWidth = 0;
            this.displayLevel = 0; // Initialized in zoomToFitAll()
            this.centerSample = 0; // Initialized in zoomToFitAll()
            this.waveforms = [];
            this.programs = [];
        }
        /**
         * Add a waveform to display.
         */
        addWaveform(canvas, samples) {
            const displayWidth = canvas.width;
            if (this.displayWidth === 0) {
                this.displayWidth = displayWidth;
            }
            else if (this.displayWidth !== displayWidth) {
                throw new Error("Widths of the canvases must match");
            }
            this.waveforms.push(new Waveform(canvas, samples));
            this.configureCanvas(canvas);
        }
        replaceSamples(canvas, samples) {
            for (const waveform of this.waveforms) {
                if (waveform.canvas === canvas) {
                    waveform.samples = samples;
                    return;
                }
            }
            throw new Error("canvas not found when replacing waveform");
        }
        /**
         * Add a program to highlight in the waveform.
         */
        addProgram(program) {
            this.programs.push(program);
        }
        /**
         * Configure the mouse events in the canvas.
         */
        configureCanvas(canvas) {
            let dragging = false;
            let dragInitialX = 0;
            let dragInitialCenterSample = 0;
            canvas.onmousedown = (event) => {
                dragging = true;
                dragInitialX = event.x;
                dragInitialCenterSample = this.centerSample;
                canvas.style.cursor = "grab";
            };
            canvas.onmouseup = () => {
                dragging = false;
                canvas.style.cursor = "auto";
            };
            canvas.onmousemove = (event) => {
                if (dragging) {
                    const dx = event.x - dragInitialX;
                    const mag = Math.pow(2, this.displayLevel);
                    this.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                    this.draw();
                }
            };
        }
        /**
         * Draw all the waveforms.
         */
        draw() {
            for (const waveform of this.waveforms) {
                this.drawInCanvas(waveform.canvas, waveform.samples);
            }
        }
        /**
         * Compute fit level to fit the specified number of samples.
         *
         * @param sampleCount number of samples we want to display.
         */
        computeFitLevel(sampleCount) {
            let displayLevel = Math.ceil(Math.log2(sampleCount / this.displayWidth));
            displayLevel = Math.max(displayLevel, 0);
            displayLevel = Math.min(displayLevel, sampleCount - 1);
            return displayLevel;
        }
        /**
         * @param {HTMLCanvasElement} canvas
         * @param {DisplaySamples} displaySamples
         */
        drawInCanvas(canvas, displaySamples) {
            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            // Background.
            ctx.fillStyle = "rgb(0, 0, 0)";
            ctx.fillRect(0, 0, width, height);
            if (displaySamples === undefined) {
                return;
            }
            const samplesList = displaySamples.samplesList;
            const samples = samplesList[this.displayLevel];
            const mag = Math.pow(2, this.displayLevel);
            const centerSample = Math.floor(this.centerSample / mag);
            const frameToX = (i) => Math.floor(width / 2) + (i - centerSample);
            // Compute viewing window in zoom space.
            const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
            const lastSample = Math.min(centerSample + width - 1, samples.length - 1);
            // Compute viewing window in original space.
            const firstOrigSample = Math.floor(firstSample * mag);
            const lastOrigSample = Math.ceil(lastSample * mag);
            // Whether we're zoomed in enough to draw and line and individual bits.
            const drawingLine = this.displayLevel < 3;
            // Programs.
            for (const program of this.programs) {
                if (drawingLine) {
                    for (const bitInfo of program.bits) {
                        if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                            const x1 = frameToX(bitInfo.startFrame / mag);
                            const x2 = frameToX(bitInfo.endFrame / mag);
                            // console.log(bitInfo, x1, x2);
                            switch (bitInfo.bitType) {
                                case BitType.ZERO:
                                    ctx.fillStyle = "rgb(50, 50, 50)";
                                    break;
                                case BitType.ONE:
                                    ctx.fillStyle = "rgb(100, 100, 100)";
                                    break;
                                case BitType.START:
                                    ctx.fillStyle = "rgb(20, 150, 20)";
                                    break;
                                case BitType.BAD:
                                    ctx.fillStyle = "rgb(150, 20, 20)";
                                    break;
                            }
                            ctx.fillRect(x1, 0, x2 - x1 - 1, height);
                        }
                    }
                }
                else {
                    ctx.fillStyle = "rgb(50, 50, 50)";
                    const x1 = frameToX(program.startFrame / mag);
                    const x2 = frameToX(program.endFrame / mag);
                    ctx.fillRect(x1, 0, x2 - x1, height);
                }
            }
            ctx.strokeStyle = "rgb(255, 255, 255)";
            if (drawingLine) {
                ctx.beginPath();
            }
            for (let i = firstSample; i <= lastSample; i++) {
                const value = samples[i];
                const x = frameToX(i);
                const y = value * height / 2;
                if (drawingLine) {
                    if (i === firstSample) {
                        ctx.moveTo(x, height / 2 - y);
                    }
                    else {
                        ctx.lineTo(x, height / 2 - y);
                    }
                }
                else {
                    ctx.beginPath();
                    ctx.moveTo(x, height / 2 - y);
                    ctx.lineTo(x, height / 2 + y);
                    ctx.stroke();
                }
            }
            if (drawingLine) {
                ctx.stroke();
            }
        }
        /**
         * Zoom in one level.
         */
        zoomIn() {
            if (this.displayLevel > 0) {
                this.displayLevel -= 1;
                this.draw();
            }
        }
        /**
         * Zoom out one level.
         */
        zoomOut() {
            if (this.waveforms.length > 0 &&
                this.waveforms[0].samples !== undefined &&
                this.displayLevel < this.waveforms[0].samples.samplesList.length - 1) {
                this.displayLevel += 1;
                this.draw();
            }
        }
        /**
         * Zoom to fit a particular bit.
         */
        zoomToBitData(bitData) {
            // Show a bit after a many bits before.
            const startFrame = bitData.startFrame - 1500;
            const endFrame = bitData.endFrame + 300;
            this.zoomToFit(startFrame, endFrame);
        }
        /**
         * Zoom to fit a range of samples.
         */
        zoomToFit(startFrame, endFrame) {
            const sampleCount = endFrame - startFrame;
            // Find appropriate zoom.
            this.displayLevel = this.computeFitLevel(sampleCount);
            // Visually centered sample (in level 0).
            this.centerSample = Math.floor((startFrame + endFrame) / 2);
            this.draw();
        }
        /**
         * Zoom to fit all samples.
         */
        zoomToFitAll() {
            if (this.waveforms.length > 0 && this.waveforms[0].samples !== undefined) {
                this.zoomToFit(0, this.waveforms[0].samples.samplesList[0].length);
            }
        }
    }

    /**
     * Generic cassette that reads from a Float32Array.
     */
    class Float32Cassette extends Cassette {
        constructor(samples, samplesPerSecond, progressBar) {
            super();
            this.frame = 0;
            this.samples = samples;
            this.samplesPerSecond = samplesPerSecond;
            this.progressBar = progressBar;
            this.progressBar.max = this.samples.length;
        }
        onMotorStart() {
            this.progressBar.style.display = "block";
        }
        readSample() {
            if (this.frame % this.samplesPerSecond === 0) {
                console.log("Reading tape at " + frameToTimestamp(this.frame));
            }
            if (this.frame % Math.floor(this.samplesPerSecond / 10) === 0) {
                this.progressBar.value = this.frame;
            }
            return this.frame < this.samples.length ? this.samples[this.frame++] : 0;
        }
        onMotorStop() {
            this.progressBar.style.display = "none";
        }
    }
    /**
     * Implementation of Cassette that reads from our high-speed reconstruction.
     */
    class ReconstructedCassette extends Float32Cassette {
        constructor(program, progressBar) {
            super(program.reconstructedSamples.samplesList[0], HZ, progressBar);
        }
    }
    /**
     * Remove all children from element.
     */
    function clearElement(e) {
        while (e.firstChild) {
            e.removeChild(e.firstChild);
        }
    }
    /**
     * UI for browsing a tape interactively.
     */
    class TapeBrowser {
        constructor(tape, zoomInButton, zoomOutButton, waveforms, originalCanvas, filteredCanvas, lowSpeedCanvas, programText, emulatorScreens, reconstructedWaveforms, reconstructedCanvas, tapeContents) {
            this.originalWaveformDisplay = new WaveformDisplay();
            this.reconstructedWaveformDisplay = new WaveformDisplay();
            this.tape = tape;
            this.waveforms = waveforms;
            this.programText = programText;
            this.emulatorScreens = emulatorScreens;
            this.reconstructedWaveforms = reconstructedWaveforms;
            this.reconstructedCanvas = reconstructedCanvas;
            this.tapeContents = tapeContents;
            this.originalWaveformDisplay.addWaveform(originalCanvas, tape.originalSamples);
            this.originalWaveformDisplay.addWaveform(filteredCanvas, tape.filteredSamples);
            this.originalWaveformDisplay.addWaveform(lowSpeedCanvas, tape.lowSpeedSamples);
            this.tape.programs.forEach(program => this.originalWaveformDisplay.addProgram(program));
            this.originalWaveformDisplay.zoomToFitAll();
            this.currentWaveformDisplay = this.originalWaveformDisplay;
            this.reconstructedWaveformDisplay.addWaveform(this.reconstructedCanvas);
            zoomInButton.onclick = () => this.originalWaveformDisplay.zoomIn();
            zoomOutButton.onclick = () => this.originalWaveformDisplay.zoomOut();
            // Configure zoom keys.
            document.onkeypress = (event) => {
                if (event.key === "=" && this.currentWaveformDisplay !== undefined) {
                    this.currentWaveformDisplay.zoomIn();
                    event.preventDefault();
                }
                if (event.key === "-" && this.currentWaveformDisplay !== undefined) {
                    this.currentWaveformDisplay.zoomOut();
                    event.preventDefault();
                }
            };
            // Update left-side panel.
            this.updateTapeContents();
            this.currentWaveformDisplay.draw();
        }
        showBinary(program) {
            this.showProgramText();
            const div = this.programText;
            clearElement(div);
            div.classList.add("binary");
            div.classList.remove("basic");
            const binary = program.binary;
            for (let addr = 0; addr < binary.length; addr += 16) {
                const line = document.createElement("div");
                let e = document.createElement("span");
                e.classList.add("address");
                e.innerText = pad(addr, 16, 4) + "  ";
                line.appendChild(e);
                // Hex.
                let subAddr;
                e = document.createElement("span");
                e.classList.add("hex");
                for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
                    e.innerText += pad(binary[subAddr], 16, 2) + " ";
                }
                for (; subAddr < addr + 16; subAddr++) {
                    e.innerText += "   ";
                }
                e.innerText += "  ";
                line.appendChild(e);
                // ASCII.
                for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
                    const c = binary[subAddr];
                    e = document.createElement("span");
                    if (c >= 32 && c < 127) {
                        e.classList.add("ascii");
                        e.innerText += String.fromCharCode(c);
                    }
                    else {
                        e.classList.add("ascii-unprintable");
                        e.innerText += ".";
                    }
                    line.appendChild(e);
                }
                div.appendChild(line);
            }
        }
        showBasic(program) {
            this.showProgramText();
            const div = this.programText;
            clearElement(div);
            div.classList.add("basic");
            div.classList.remove("binary");
            fromTokenized(program.binary, div);
        }
        showEmulator(screen, trs80) {
            this.showEmulatorScreens();
            // Show just this screen.
            this.emulatorScreens.querySelectorAll(":scope > div")
                .forEach((e) => e.style.display = e === screen ? "block" : "none");
            // Start the machine.
            this.stopTrs80();
            trs80.start();
            this.startedTrs80 = trs80;
        }
        stopTrs80() {
            if (this.startedTrs80 !== undefined) {
                this.startedTrs80.stop();
                this.startedTrs80 = undefined;
            }
        }
        showProgramText() {
            this.stopTrs80();
            this.waveforms.style.display = "none";
            this.programText.style.display = "block";
            this.emulatorScreens.style.display = "none";
            this.reconstructedWaveforms.style.display = "none";
            this.currentWaveformDisplay = undefined;
        }
        showWaveforms() {
            this.stopTrs80();
            this.waveforms.style.display = "block";
            this.programText.style.display = "none";
            this.emulatorScreens.style.display = "none";
            this.reconstructedWaveforms.style.display = "none";
            this.currentWaveformDisplay = this.originalWaveformDisplay;
        }
        showEmulatorScreens() {
            this.waveforms.style.display = "none";
            this.programText.style.display = "none";
            this.emulatorScreens.style.display = "block";
            this.reconstructedWaveforms.style.display = "none";
            this.currentWaveformDisplay = undefined;
        }
        showReconstructedWaveforms(program) {
            this.stopTrs80();
            this.waveforms.style.display = "none";
            this.programText.style.display = "none";
            this.emulatorScreens.style.display = "none";
            this.reconstructedWaveforms.style.display = "block";
            this.currentWaveformDisplay = this.reconstructedWaveformDisplay;
            this.reconstructedWaveformDisplay.replaceSamples(this.reconstructedCanvas, program.reconstructedSamples);
            this.reconstructedWaveformDisplay.zoomToFitAll();
        }
        updateTapeContents() {
            const addRow = (text, onClick) => {
                const div = document.createElement("div");
                div.classList.add("tape_contents_row");
                div.innerText = text;
                if (onClick != null) {
                    div.classList.add("selectable_row");
                    div.onclick = onClick;
                }
                this.tapeContents.appendChild(div);
            };
            clearElement(this.tapeContents);
            this.stopTrs80();
            clearElement(this.emulatorScreens);
            addRow(this.tape.name, () => {
                this.showWaveforms();
                this.originalWaveformDisplay.zoomToFitAll();
            });
            for (const program of this.tape.programs) {
                addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName, null);
                addRow(frameToTimestamp(program.startFrame, true) + " to " +
                    frameToTimestamp(program.endFrame, true) + " (" +
                    frameToTimestamp(program.endFrame - program.startFrame, true) + ")", null);
                addRow("    Waveforms", () => {
                    this.showWaveforms();
                    this.originalWaveformDisplay.zoomToFit(program.startFrame, program.endFrame);
                });
                addRow("    Binary", () => {
                    this.showBinary(program);
                });
                addRow("    Reconstructed", () => {
                    this.showReconstructedWaveforms(program);
                });
                if (program.isBasicProgram()) {
                    addRow("    Basic", () => {
                        this.showBasic(program);
                    });
                    const screen = document.createElement("div");
                    screen.style.display = "none";
                    const progressBar = document.createElement("progress");
                    progressBar.style.display = "none";
                    // const trs80 = new Trs80(screen, new TapeCassette(this.tape, program));
                    const trs80 = new Trs80(screen, new ReconstructedCassette(program, progressBar));
                    trs80.reset();
                    this.emulatorScreens.appendChild(screen);
                    this.emulatorScreens.appendChild(progressBar);
                    addRow("    Emulator", () => {
                        this.showEmulator(screen, trs80);
                    });
                }
                let count = 1;
                for (const bitData of program.bits) {
                    if (bitData.bitType === BitType.BAD) {
                        addRow("    Bit error " + count++ + " (" + frameToTimestamp(bitData.startFrame, true) + ")", () => {
                            this.showWaveforms();
                            this.originalWaveformDisplay.zoomToBitData(bitData);
                        });
                    }
                }
            }
        }
    }

    // Handles uploading WAV files and decoding them.
    class Uploader {
        /**
         * @param dropZone any element where files can be dropped.
         * @param dropUpload file type input element.
         * @param dropS3 buttons to upload from S3.
         * @param dropProgress progress bar for loading large files.
         * @param handleAudioBuffer callback with AudioBuffer parameter.
         */
        constructor(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer) {
            this.handleAudioBuffer = handleAudioBuffer;
            this.progressBar = dropProgress;
            dropZone.ondrop = (ev) => this.dropHandler(ev);
            dropZone.ondragover = (ev) => {
                dropZone.classList.add("hover");
                // Prevent default behavior (prevent file from being opened).
                ev.preventDefault();
            };
            dropZone.ondragleave = () => dropZone.classList.remove("hover");
            dropUpload.onchange = () => {
                if (dropUpload.files) {
                    const file = dropUpload.files[0];
                    if (file) {
                        this.handleDroppedFile(file);
                    }
                }
            };
            dropUpload.onprogress = (event) => this.showProgress(event);
            dropS3.forEach((node) => {
                const button = node;
                button.onclick = () => {
                    const url = button.getAttribute("data-src");
                    const request = new XMLHttpRequest();
                    request.open("GET", url, true);
                    request.responseType = "arraybuffer";
                    request.onload = () => this.handleArrayBuffer(url, request.response);
                    request.onprogress = (event) => this.showProgress(event);
                    // For testing progress bar only:
                    /// request.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                    request.send();
                };
            });
        }
        reset() {
            this.progressBar.style.display = "none";
        }
        handleDroppedFile(file) {
            console.log("File " + file.name + " has size " + file.size);
            // We could use file.arrayBuffer() here, but as of writing it's buggy
            // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
            const fileReader = new FileReader();
            fileReader.addEventListener("loadend", () => {
                if (fileReader.result instanceof ArrayBuffer) {
                    this.handleArrayBuffer(file.name, fileReader.result);
                }
                else {
                    console.log("Error: Unexpected type for fileReader.result: " +
                        fileReader.result);
                }
            });
            fileReader.addEventListener("progress", (event) => this.showProgress(event));
            fileReader.readAsArrayBuffer(file);
        }
        showProgress(event) {
            this.progressBar.style.display = "block";
            this.progressBar.value = event.loaded;
            this.progressBar.max = event.total;
        }
        handleArrayBuffer(pathname, arrayBuffer) {
            const audioCtx = new window.AudioContext();
            audioCtx.decodeAudioData(arrayBuffer).then((b) => this.handleAudioBuffer(pathname, b));
        }
        dropHandler(ev) {
            // Prevent default behavior (Prevent file from being opened)
            ev.preventDefault();
            if (ev.dataTransfer) {
                if (ev.dataTransfer.items) {
                    // Use DataTransferItemList interface to access the files.
                    for (const item of ev.dataTransfer.items) {
                        // If dropped items aren't files, reject them
                        if (item.kind === "file") {
                            const file = item.getAsFile();
                            if (file) {
                                this.handleDroppedFile(file);
                            }
                        }
                    }
                }
                else {
                    // Use DataTransfer interface to access the files.
                    for (const file of ev.dataTransfer.files) {
                        this.handleDroppedFile(file);
                    }
                }
            }
        }
    }

    const dropZone = document.getElementById("drop_zone");
    const dropUpload = document.getElementById("drop_upload");
    const dropS3 = document.querySelectorAll("#test_files button");
    const dropProgress = document.getElementById("drop_progress");
    let uploader;
    function nameFromPathname(pathname) {
        let name = pathname;
        // Keep only last component.
        let pos = name.lastIndexOf("/");
        if (pos >= 0) {
            name = name.substr(pos + 1);
        }
        // Remove extension.
        pos = name.lastIndexOf(".");
        if (pos >= 0) {
            name = name.substr(0, pos);
        }
        return name;
    }
    function handleAudioBuffer(pathname, audioBuffer) {
        console.log("Audio is " + audioBuffer.duration + " seconds, " +
            audioBuffer.numberOfChannels + " channels, " +
            audioBuffer.sampleRate + " Hz");
        // TODO check that there's 1 channel.
        const samples = audioBuffer.getChannelData(0);
        const tape = new Tape(nameFromPathname(pathname), samples, audioBuffer.sampleRate);
        const decoder = new Decoder(tape);
        decoder.decode();
        const tapeBrowser = new TapeBrowser(tape, document.getElementById("zoom_in_button"), document.getElementById("zoom_out_button"), document.getElementById("waveforms"), document.getElementById("original_canvas"), document.getElementById("filtered_canvas"), document.getElementById("low_speed_canvas"), document.getElementById("program_text"), document.getElementById("emulator_screens"), document.getElementById("reconstructed_waveforms"), document.getElementById("reconstructed_canvas"), document.getElementById("tape_contents"));
        // Switch screens.
        const dropScreen = document.getElementById("drop_screen");
        const dataScreen = document.getElementById("data_screen");
        dropScreen.style.display = "none";
        dataScreen.style.display = "block";
        const loadAnotherButton = document.getElementById("load_another_button");
        loadAnotherButton.onclick = () => {
            dropScreen.style.display = "block";
            dataScreen.style.display = "none";
            if (uploader !== undefined) {
                uploader.reset();
            }
        };
    }
    function main() {
        uploader = new Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
    }

    exports.main = main;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
