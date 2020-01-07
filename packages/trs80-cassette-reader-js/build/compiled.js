define("Utils", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.pad = pad;
});
define("AudioUtils", ["require", "exports", "Utils"], function (require, exports, Utils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    // Expected HZ on tape.
    exports.HZ = 48000;
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
    exports.highPassFilter = highPassFilter;
    /**
     * @param frame the frame number to be described as a timestamp.
     * @param brief omit hour if zero, omit milliseconds and frame itself.
     */
    function frameToTimestamp(frame, brief) {
        const time = frame / exports.HZ;
        let ms = Math.floor(time * 1000);
        let sec = Math.floor(ms / 1000);
        ms -= sec * 1000;
        let min = Math.floor(sec / 60);
        sec -= min * 60;
        const hour = Math.floor(min / 60);
        min -= hour * 60;
        if (brief) {
            return (hour !== 0 ? hour + ":" + Utils_1.pad(min, 10, 2) : min) + ":" + Utils_1.pad(sec, 10, 2);
        }
        else {
            return hour + ":" + Utils_1.pad(min, 10, 2) + ":" + Utils_1.pad(sec, 10, 2) + "." + Utils_1.pad(ms, 10, 3) + " (frame " + frame + ")";
        }
    }
    exports.frameToTimestamp = frameToTimestamp;
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
    exports.concatAudio = concatAudio;
});
// Tools for decoding Basic programs.
define("Basic", ["require", "exports", "Utils"], function (require, exports, Utils_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
                                add(line, "\\" + Utils_2.pad(c, 8, 3), "punctuation");
                            }
                            else if (c >= 32 && c < 128) {
                                add(line, ch, "string");
                            }
                            else {
                                add(line, "\\" + Utils_2.pad(c, 8, 3), "punctuation");
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
    exports.fromTokenized = fromTokenized;
});
define("BitType", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    })(BitType = exports.BitType || (exports.BitType = {}));
});
define("BitData", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.BitData = BitData;
});
define("DisplaySamples", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.DisplaySamples = DisplaySamples;
});
// Enum for the state of a tape decoder.
define("TapeDecoderState", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    })(TapeDecoderState = exports.TapeDecoderState || (exports.TapeDecoderState = {}));
});
// Interface for tape decoders.
define("TapeDecoder", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("LowSpeedTapeDecoder", ["require", "exports", "AudioUtils", "BitData", "BitType", "TapeDecoderState"], function (require, exports, AudioUtils_1, BitData_1, BitType_1, TapeDecoderState_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    const END_OF_PROGRAM_SILENCE = AudioUtils_1.HZ / 10;
    /**
     * Number of consecutive zero bits we require in the header before we're pretty
     * sure this is a low speed program.
     */
    const MIN_HEADER_ZEROS = 6;
    class LowSpeedTapeDecoder {
        constructor(invert) {
            this.invert = invert;
            this.state = TapeDecoderState_1.TapeDecoderState.UNDECIDED;
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
            if (this.state === TapeDecoderState_1.TapeDecoderState.DETECTED && timeDiff > END_OF_PROGRAM_SILENCE) {
                // End of program.
                this.state = TapeDecoderState_1.TapeDecoderState.FINISHED;
            }
            else if (pulsing) {
                const bit = timeDiff < BIT_DETERMINATOR;
                if (this.pulseCount++ === 1000) {
                    // For debugging, forces a detection so we can inspect the bits.
                    /// this.state = TapeDecoderState.DETECTED;
                }
                if (this.eatNextPulse) {
                    if (this.state === TapeDecoderState_1.TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                        console.log("Warning: At bit of wrong value at " +
                            AudioUtils_1.frameToTimestamp(frame) + ", diff = " + timeDiff + ", last = " +
                            AudioUtils_1.frameToTimestamp(this.lastPulseFrame));
                        this.bits.push(new BitData_1.BitData(this.lastPulseFrame, frame, BitType_1.BitType.BAD));
                    }
                    else {
                        const lastBit = this.bits[this.bits.length - 1];
                        if (lastBit && lastBit.bitType === BitType_1.BitType.ONE && lastBit.endFrame === this.lastPulseFrame) {
                            // Merge with previous 1 bit.
                            lastBit.endFrame = frame;
                        }
                    }
                    this.eatNextPulse = false;
                    this.lenientFirstBit = false;
                }
                else {
                    // If we see a 1 in the header, reset the count. We want a bunch of consecutive zeros.
                    if (bit && this.state === TapeDecoderState_1.TapeDecoderState.UNDECIDED && this.detectedZeros < MIN_HEADER_ZEROS) {
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
                            this.bits.push(new BitData_1.BitData(this.lastPulseFrame, frame, bit ? BitType_1.BitType.ONE : BitType_1.BitType.ZERO));
                        }
                        if (this.state === TapeDecoderState_1.TapeDecoderState.UNDECIDED) {
                            // Haven't found end of header yet. Look for it, preceded by zeros.
                            if (this.recentBits === 0x000000A5) {
                                this.bitCount = 0;
                                // For some reason we don't get a clock after this last 1.
                                this.lenientFirstBit = true;
                                this.state = TapeDecoderState_1.TapeDecoderState.DETECTED;
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
    exports.LowSpeedTapeDecoder = LowSpeedTapeDecoder;
});
define("Program", ["require", "exports", "DisplaySamples"], function (require, exports, DisplaySamples_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Program {
        constructor(trackNumber, copyNumber, startFrame, endFrame, decoderName, binary, bits, reconstructedSamples) {
            this.trackNumber = trackNumber;
            this.copyNumber = copyNumber;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
            this.decoderName = decoderName;
            this.binary = binary;
            this.bits = bits;
            this.reconstructedSamples = new DisplaySamples_1.DisplaySamples(reconstructedSamples);
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
    exports.Program = Program;
});
// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.
define("Tape", ["require", "exports", "AudioUtils", "DisplaySamples", "LowSpeedTapeDecoder"], function (require, exports, AudioUtils_2, DisplaySamples_2, LowSpeedTapeDecoder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Tape {
        /**
         * @param name text to display (e.g., "LOAD80-Feb82-s1").
         * @param samples original samples from the tape.
         * @param sampleRate the number of samples per second.
         */
        constructor(name, samples, sampleRate) {
            this.name = name;
            this.originalSamples = new DisplaySamples_2.DisplaySamples(samples);
            this.filteredSamples = new DisplaySamples_2.DisplaySamples(AudioUtils_2.highPassFilter(samples, 500));
            this.lowSpeedSamples = new DisplaySamples_2.DisplaySamples(LowSpeedTapeDecoder_1.LowSpeedTapeDecoder.filterSamples(this.filteredSamples.samplesList[0]));
            this.sampleRate = sampleRate;
            this.programs = [];
        }
        addProgram(program) {
            this.programs.push(program);
        }
    }
    exports.Tape = Tape;
});
define("HighSpeedTapeDecoder", ["require", "exports", "AudioUtils", "BitData", "BitType", "TapeDecoderState"], function (require, exports, AudioUtils_3, BitData_2, BitType_2, TapeDecoderState_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    // What distance away from 0 counts as "positive" (or, when negative, "negative").
    const THRESHOLD = 500 / 32768.0;
    // If we go this many frames without any crossing, then we can assume we're done.
    const MIN_SILENCE_FRAMES = 1000;
    /**
     * Decodes high-speed (1500 baud) cassettes.
     */
    class HighSpeedTapeDecoder {
        constructor() {
            this.state = TapeDecoderState_2.TapeDecoderState.UNDECIDED;
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
                        if (this.state === TapeDecoderState_2.TapeDecoderState.DETECTED) {
                            this.bitCount += 1;
                            // Just got a start bit. Must be zero.
                            let bitType;
                            if (this.bitCount === 1) {
                                if (bit) {
                                    console.log("Bad start bit at byte " + this.programBytes.length + ", " +
                                        AudioUtils_3.frameToTimestamp(frame) + ", cycle size " + this.cycleSize + ".");
                                    this.state = TapeDecoderState_2.TapeDecoderState.ERROR;
                                    bitType = BitType_2.BitType.BAD;
                                }
                                else {
                                    bitType = BitType_2.BitType.START;
                                }
                            }
                            else {
                                bitType = bit ? BitType_2.BitType.ONE : BitType_2.BitType.ZERO;
                            }
                            this.bits.push(new BitData_2.BitData(frame - this.cycleSize, frame, bitType));
                            // Got enough bits for a byte (including the start bit).
                            if (this.bitCount === 9) {
                                this.programBytes.push(this.recentBits & 0xFF);
                                this.bitCount = 0;
                            }
                        }
                        else {
                            // Detect end of header.
                            if ((this.recentBits & 0xFFFF) === 0x557F) {
                                this.state = TapeDecoderState_2.TapeDecoderState.DETECTED;
                                // No start bit on first byte.
                                this.bitCount = 1;
                                this.recentBits = 0;
                            }
                        }
                    }
                    else if (this.state === TapeDecoderState_2.TapeDecoderState.DETECTED &&
                        this.programBytes.length > 0 && this.cycleSize > 66) {
                        // 1.5 ms gap, end of recording.
                        // TODO pull this out of zero crossing.
                        this.state = TapeDecoderState_2.TapeDecoderState.FINISHED;
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
            if (this.state === TapeDecoderState_2.TapeDecoderState.DETECTED && frame - this.lastCrossingFrame > MIN_SILENCE_FRAMES) {
                this.state = TapeDecoderState_2.TapeDecoderState.FINISHED;
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
    exports.HighSpeedTapeDecoder = HighSpeedTapeDecoder;
});
define("HighSpeedTapeEncoder", ["require", "exports", "AudioUtils"], function (require, exports, AudioUtils_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * Length of a zero bit, in samples.
     */
    const ZERO_LENGTH = Math.round(0.00072 * AudioUtils_4.HZ);
    /**
     * Length of a one bit, in samples.
     */
    const ONE_LENGTH = Math.round(0.00034 * AudioUtils_4.HZ);
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
    const LONG_ZERO = generateCycle(ZERO_LENGTH + AudioUtils_4.HZ / 1000);
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
        samplesList.push(new Float32Array(AudioUtils_4.HZ / 2));
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
        samplesList.push(new Float32Array(AudioUtils_4.HZ / 2));
        // Concatenate all samples.
        return AudioUtils_4.concatAudio(samplesList);
    }
    exports.encodeHighSpeed = encodeHighSpeed;
});
// Uses tape decoders to work through the tape, finding programs and decoding them.
define("Decoder", ["require", "exports", "AudioUtils", "HighSpeedTapeDecoder", "LowSpeedTapeDecoder", "Program", "TapeDecoderState", "HighSpeedTapeEncoder"], function (require, exports, AudioUtils_5, HighSpeedTapeDecoder_1, LowSpeedTapeDecoder_2, Program_1, TapeDecoderState_3, HighSpeedTapeEncoder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
                    new LowSpeedTapeDecoder_2.LowSpeedTapeDecoder(true),
                    new LowSpeedTapeDecoder_2.LowSpeedTapeDecoder(false),
                    new HighSpeedTapeDecoder_1.HighSpeedTapeDecoder(),
                ];
                const searchFrameStart = frame;
                let state = TapeDecoderState_3.TapeDecoderState.UNDECIDED;
                for (; frame < samples.length &&
                    (state === TapeDecoderState_3.TapeDecoderState.UNDECIDED || state === TapeDecoderState_3.TapeDecoderState.DETECTED); frame++) {
                    // Give the sample to all decoders in parallel.
                    let detectedIndex = -1;
                    for (let i = 0; i < tapeDecoders.length; i++) {
                        const tapeDecoder = tapeDecoders[i];
                        tapeDecoder.handleSample(this.tape, frame);
                        // See if it detected its encoding.
                        if (tapeDecoder.getState() !== TapeDecoderState_3.TapeDecoderState.UNDECIDED) {
                            detectedIndex = i;
                        }
                    }
                    // If any has detected, keep only that one and kill the rest.
                    if (state === TapeDecoderState_3.TapeDecoderState.UNDECIDED) {
                        if (detectedIndex !== -1) {
                            const tapeDecoder = tapeDecoders[detectedIndex];
                            // See how long it took to find it. A large gap means a new track.
                            const leadTime = (frame - searchFrameStart) / AudioUtils_5.HZ;
                            if (leadTime > 10 || programStartFrame === -1) {
                                trackNumber += 1;
                                copyNumber = 1;
                            }
                            programStartFrame = frame;
                            console.log("Decoder \"" + tapeDecoder.getName() + "\" detected " +
                                trackNumber + "-" + copyNumber + " at " +
                                AudioUtils_5.frameToTimestamp(frame) + " after " +
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
                    case TapeDecoderState_3.TapeDecoderState.UNDECIDED:
                        console.log("Reached end of tape without finding track.");
                        break;
                    case TapeDecoderState_3.TapeDecoderState.DETECTED:
                        console.log("Reached end of tape while still reading track.");
                        break;
                    case TapeDecoderState_3.TapeDecoderState.ERROR:
                    case TapeDecoderState_3.TapeDecoderState.FINISHED:
                        if (state === TapeDecoderState_3.TapeDecoderState.ERROR) {
                            console.log("Decoder detected an error; skipping program.");
                        }
                        else {
                            console.log("Found end of program at " + AudioUtils_5.frameToTimestamp(frame) + ".");
                        }
                        let binary = tapeDecoders[0].getBinary();
                        const program = new Program_1.Program(trackNumber, copyNumber, programStartFrame, frame, tapeDecoders[0].getName(), binary, tapeDecoders[0].getBits(), HighSpeedTapeEncoder_1.encodeHighSpeed(binary));
                        this.tape.addProgram(program);
                        break;
                }
                copyNumber += 1;
                instanceNumber += 1;
            }
        }
    }
    exports.Decoder = Decoder;
});
define("WaveformDisplay", ["require", "exports", "BitType"], function (require, exports, BitType_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
                                case BitType_3.BitType.ZERO:
                                    ctx.fillStyle = "rgb(50, 50, 50)";
                                    break;
                                case BitType_3.BitType.ONE:
                                    ctx.fillStyle = "rgb(100, 100, 100)";
                                    break;
                                case BitType_3.BitType.START:
                                    ctx.fillStyle = "rgb(20, 150, 20)";
                                    break;
                                case BitType_3.BitType.BAD:
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
    exports.WaveformDisplay = WaveformDisplay;
});
define("TapeBrowser", ["require", "exports", "AudioUtils", "Basic", "BitType", "Utils", "trs80-emulator", "WaveformDisplay"], function (require, exports, AudioUtils_6, Basic_1, BitType_4, Utils_3, trs80_emulator_1, WaveformDisplay_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * Generic cassette that reads from a Float32Array.
     */
    class Float32Cassette extends trs80_emulator_1.Cassette {
        constructor(samples, samplesPerSecond) {
            super();
            this.frame = 0;
            this.samples = samples;
            this.samplesPerSecond = samplesPerSecond;
        }
        readSample() {
            if (this.frame % this.samplesPerSecond === 0) {
                console.log("Reading tape at " + AudioUtils_6.frameToTimestamp(this.frame));
            }
            return this.frame < this.samples.length ? this.samples[this.frame++] : 0;
        }
    }
    /**
     * Implementation of Cassette that reads from our displayed data.
     */
    class TapeCassette extends Float32Cassette {
        constructor(tape, program) {
            const samples = tape.originalSamples.samplesList[0];
            // Start one second before the official program start, so that the machine
            // can detect the header.
            const begin = Math.max(0, program.startFrame - tape.sampleRate);
            // Go until one second after the detected end of our program.
            const end = Math.min(samples.length, program.endFrame + tape.sampleRate);
            super(samples.subarray(begin, end), tape.sampleRate);
        }
    }
    /**
     * Implementation of Cassette that reads from our high-speed reconstruction.
     */
    class ReconstructedCassette extends Float32Cassette {
        constructor(program) {
            super(program.reconstructedSamples.samplesList[0], AudioUtils_6.HZ);
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
            this.originalWaveformDisplay = new WaveformDisplay_1.WaveformDisplay();
            this.reconstructedWaveformDisplay = new WaveformDisplay_1.WaveformDisplay();
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
                e.innerText = Utils_3.pad(addr, 16, 4) + "  ";
                line.appendChild(e);
                // Hex.
                let subAddr;
                e = document.createElement("span");
                e.classList.add("hex");
                for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
                    e.innerText += Utils_3.pad(binary[subAddr], 16, 2) + " ";
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
            Basic_1.fromTokenized(program.binary, div);
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
                addRow(AudioUtils_6.frameToTimestamp(program.startFrame, true) + " to " +
                    AudioUtils_6.frameToTimestamp(program.endFrame, true) + " (" +
                    AudioUtils_6.frameToTimestamp(program.endFrame - program.startFrame, true) + ")", null);
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
                    // const trs80 = new Trs80(screen, new TapeCassette(this.tape, program));
                    const trs80 = new trs80_emulator_1.Trs80(screen, new ReconstructedCassette(program));
                    trs80.reset();
                    this.emulatorScreens.appendChild(screen);
                    addRow("    Emulator", () => {
                        this.showEmulator(screen, trs80);
                    });
                }
                let count = 1;
                for (const bitData of program.bits) {
                    if (bitData.bitType === BitType_4.BitType.BAD) {
                        addRow("    Bit error " + count++ + " (" + AudioUtils_6.frameToTimestamp(bitData.startFrame, true) + ")", () => {
                            this.showWaveforms();
                            this.originalWaveformDisplay.zoomToBitData(bitData);
                        });
                    }
                }
            }
        }
    }
    exports.TapeBrowser = TapeBrowser;
});
// Handles uploading WAV files and decoding them.
define("Uploader", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.Uploader = Uploader;
});
define("Main", ["require", "exports", "Decoder", "Tape", "TapeBrowser", "Uploader"], function (require, exports, Decoder_1, Tape_1, TapeBrowser_1, Uploader_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
        const tape = new Tape_1.Tape(nameFromPathname(pathname), samples, audioBuffer.sampleRate);
        const decoder = new Decoder_1.Decoder(tape);
        decoder.decode();
        const tapeBrowser = new TapeBrowser_1.TapeBrowser(tape, document.getElementById("zoom_in_button"), document.getElementById("zoom_out_button"), document.getElementById("waveforms"), document.getElementById("original_canvas"), document.getElementById("filtered_canvas"), document.getElementById("low_speed_canvas"), document.getElementById("program_text"), document.getElementById("emulator_screens"), document.getElementById("reconstructed_waveforms"), document.getElementById("reconstructed_canvas"), document.getElementById("tape_contents"));
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
        uploader = new Uploader_1.Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
    }
    exports.main = main;
});
