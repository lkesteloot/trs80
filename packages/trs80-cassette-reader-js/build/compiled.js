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
     * @param samples samples to filter.
     * @param size size of filter
     * @returns filtered samples.
     */
    function filterSamples(samples, size) {
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
    exports.filterSamples = filterSamples;
    function frameToTimestamp(frame) {
        const time = frame / exports.HZ;
        let ms = Math.floor(time * 1000);
        let sec = Math.floor(ms / 1000);
        ms -= sec * 1000;
        let min = Math.floor(sec / 60);
        sec -= min * 60;
        const hour = Math.floor(min / 60);
        min -= hour * 60;
        return hour + ":" + Utils_1.pad(min, 10, 2) + ":" + Utils_1.pad(sec, 10, 2) + "." + Utils_1.pad(ms, 10, 3) + " (frame " + frame + ")";
    }
    exports.frameToTimestamp = frameToTimestamp;
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
        "LEFT$", "RIGHT$", "MID$" // 0xF8
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
            let low = this.read();
            if (low === EOF) {
                return EOF;
            }
            let high = this.read();
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
        let e = document.createElement("span");
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
        let b = new ByteReader(bytes);
        let state;
        if (b.read() != 0xD3 || b.read() != 0xD3 || b.read() != 0xD3) {
            add(out, "Basic: missing magic -- not a BASIC file.", "error");
            return;
        }
        // One-byte ASCII program name. This is nearly always meaningless, so we do nothing with it.
        b.read();
        while (true) {
            let line = document.createElement("div");
            // Read the address of the next line. We ignore this (as does Basic when
            // loading programs), only using it to detect end of program. (In the real
            // Basic these are regenerated after loading.)
            let address = b.readShort(true);
            if (address === EOF) {
                add(line, "[EOF in next line's address]", "error");
                break;
            }
            // Zero address indicates end of program.
            if (address == 0) {
                break;
            }
            // Read current line number.
            let lineNumber = b.readShort(false);
            if (lineNumber === EOF) {
                add(line, "[EOF in line number]", "error");
                break;
            }
            add(line, lineNumber.toString() + " ", "line_number");
            // Read rest of line.
            let c; // Uint8 value.
            let ch; // String value.
            state = NORMAL;
            while ((c = b.read()) !== EOF && c !== 0) {
                ch = String.fromCharCode(c);
                // Detect the ":REM'" sequence (colon, REM, single quote), because
                // that translates to a single quote. Must be a backward-compatible
                // way to add a single quote as a comment.
                if (ch === ':' && state === NORMAL) {
                    state = COLON;
                }
                else if (ch === ':' && state === COLON) {
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
                    if (state == COLON || state == COLON_REM) {
                        add(line, ":", "punctuation");
                        if (state == COLON_REM) {
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
                                let token = TOKENS[c - 128];
                                add(line, token, c === DATA || c === REM ? "comment"
                                    : token.length === 1 ? "punctuation"
                                        : "keyword");
                            }
                            else {
                                add(line, ch, ch == '"' ? "string" : "regular");
                            }
                            if (c === DATA || c === REM) {
                                state = RAW;
                            }
                            else if (ch === '"') {
                                state = STRING_LITERAL;
                            }
                            break;
                        case STRING_LITERAL:
                            if (ch === '\r') {
                                add(line, "\\n", "punctuation");
                            }
                            else if (ch === '\\') {
                                add(line, "\\" + Utils_2.pad(c, 8, 3), "punctuation");
                            }
                            else if (c >= 32 && c < 128) {
                                add(line, ch, "string");
                            }
                            else {
                                add(line, "\\" + Utils_2.pad(c, 8, 3), "punctuation");
                            }
                            if (ch == '"') {
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
define("DisplaySamples", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class DisplaySamples {
        constructor(samples) {
            this.samplesList = [samples];
            this.filterDown();
        }
        filterDown() {
            // Sample down for quick display.
            while (this.samplesList[this.samplesList.length - 1].length > 1) {
                const samples = this.samplesList[this.samplesList.length - 1];
                const half = Math.ceil(samples.length / 2);
                const down = new Float32Array(half);
                for (let i = 0; i < half; i++) {
                    const j = i * 2;
                    down[i] = j == samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
                }
                this.samplesList.push(down);
            }
        }
    }
    exports.DisplaySamples = DisplaySamples;
});
/*
 * Copyright 2019 Lawrence Kesteloot
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
/*
 * Copyright 2019 Lawrence Kesteloot
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
define("Program", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Program {
        constructor(trackNumber, copyNumber, startFrame, endFrame, binary, bits) {
            this.trackNumber = trackNumber;
            this.copyNumber = copyNumber;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
            this.binary = binary;
            this.bits = bits;
        }
        /**
         * Whether the binary represents a Basic program.
         */
        isProgram() {
            return this.binary != null &&
                this.binary.length >= 3 &&
                this.binary[0] == 0xD3 &&
                this.binary[1] == 0xD3 &&
                this.binary[2] == 0xD3;
        }
    }
    exports.Program = Program;
});
// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.
define("Tape", ["require", "exports", "DisplaySamples", "AudioUtils"], function (require, exports, DisplaySamples_1, AudioUtils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Tape {
        /**
         * @param samples original samples from the tape.
         */
        constructor(samples) {
            this.originalSamples = new DisplaySamples_1.DisplaySamples(samples);
            this.filteredSamples = new DisplaySamples_1.DisplaySamples(AudioUtils_1.filterSamples(samples, 500));
            this.programs = [];
        }
        addProgram(program) {
            this.programs.push(program);
        }
    }
    exports.Tape = Tape;
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
define("LowSpeedTapeDecoder", ["require", "exports", "AudioUtils", "TapeDecoderState", "BitData", "BitType"], function (require, exports, AudioUtils_2, TapeDecoderState_1, BitData_1, BitType_1) {
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
    const END_OF_PROGRAM_SILENCE = AudioUtils_2.HZ / 10;
    /**
     * Number of consecutive zero bits we require in the header before we're pretty
     * sure this is a low speed program.
     */
    const MIN_HEADER_ZEROS = 6;
    class LowSpeedTapeDecoder {
        constructor() {
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
        }
        // For TapeDecoder interface:
        getName() {
            return "low speed";
        }
        // For TapeDecoder interface:
        handleSample(tape, frame) {
            const samples = tape.filteredSamples.samplesList[0];
            // Differentiate to accentuate a pulse. Pulse go positive, then negative,
            // with a space of PULSE_PEAK_DISTANCE, so subtracting those generates a large
            // positive value at the bottom of the pulse.
            const pulse = frame >= PULSE_PEAK_DISTANCE ? samples[frame - PULSE_PEAK_DISTANCE] - samples[frame] : 0;
            const timeDiff = frame - this.lastPulseFrame;
            const pulsing = timeDiff > PULSE_WIDTH && pulse >= this.pulseHeight / 3;
            // Keep track of the height of this pulse, to calibrate for the next one.
            if (timeDiff < PULSE_WIDTH) {
                this.pulseHeight = Math.max(this.pulseHeight, pulse);
            }
            if (this.state == TapeDecoderState_1.TapeDecoderState.DETECTED && timeDiff > END_OF_PROGRAM_SILENCE) {
                // End of program.
                this.state = TapeDecoderState_1.TapeDecoderState.FINISHED;
            }
            else if (pulsing) {
                const bit = timeDiff < BIT_DETERMINATOR;
                if (this.eatNextPulse) {
                    if (this.state == TapeDecoderState_1.TapeDecoderState.DETECTED && !bit && !this.lenientFirstBit) {
                        console.log("Warning: At bit of wrong value at " +
                            AudioUtils_2.frameToTimestamp(frame) + ", diff = " + timeDiff + ", last = " +
                            AudioUtils_2.frameToTimestamp(this.lastPulseFrame));
                        this.bits.push(new BitData_1.BitData(this.lastPulseFrame, frame, BitType_1.BitType.BAD));
                    }
                    else {
                        const lastBit = this.bits[this.bits.length - 1];
                        if (lastBit && lastBit.bitType === BitType_1.BitType.ONE && lastBit.endFrame === this.lastPulseFrame) {
                            lastBit.endFrame = frame;
                        }
                    }
                    this.eatNextPulse = false;
                    this.lenientFirstBit = false;
                }
                else {
                    // If we see a 1 in the header, reset the count. We want a bunch of consecutive zeros.
                    if (bit && this.state == TapeDecoderState_1.TapeDecoderState.UNDECIDED && this.detectedZeros < MIN_HEADER_ZEROS) {
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
                        if (this.state == TapeDecoderState_1.TapeDecoderState.UNDECIDED) {
                            // Haven't found end of header yet. Look for it, preceded by zeros.
                            if (this.recentBits == 0x000000A5) {
                                this.bitCount = 0;
                                // For some reason we don't get a clock after this last 1.
                                this.lenientFirstBit = true;
                                this.state = TapeDecoderState_1.TapeDecoderState.DETECTED;
                            }
                        }
                        else {
                            this.bitCount += 1;
                            if (this.bitCount == 8) {
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
        // For TapeDecoder interface:
        getState() {
            return this.state;
        }
        // For TapeDecoder interface:
        getProgram() {
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
// Uses tape decoders to work through the tape, finding programs and decoding them.
define("Decoder", ["require", "exports", "LowSpeedTapeDecoder", "TapeDecoderState", "Program", "AudioUtils"], function (require, exports, LowSpeedTapeDecoder_1, TapeDecoderState_2, Program_1, AudioUtils_3) {
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
                    new LowSpeedTapeDecoder_1.LowSpeedTapeDecoder(),
                ];
                const searchFrameStart = frame;
                let state = TapeDecoderState_2.TapeDecoderState.UNDECIDED;
                for (; frame < samples.length && (state == TapeDecoderState_2.TapeDecoderState.UNDECIDED || state == TapeDecoderState_2.TapeDecoderState.DETECTED); frame++) {
                    // Give the sample to all decoders in parallel.
                    let detectedIndex = -1;
                    for (let i = 0; i < tapeDecoders.length; i++) {
                        const tapeDecoder = tapeDecoders[i];
                        tapeDecoder.handleSample(this.tape, frame);
                        // See if it detected its encoding.
                        if (tapeDecoder.getState() != TapeDecoderState_2.TapeDecoderState.UNDECIDED) {
                            detectedIndex = i;
                        }
                    }
                    // If any has detected, keep only that one and kill the rest.
                    if (state == TapeDecoderState_2.TapeDecoderState.UNDECIDED) {
                        if (detectedIndex != -1) {
                            const tapeDecoder = tapeDecoders[detectedIndex];
                            // See how long it took to find it. A large gap means a new track.
                            const leadTime = (frame - searchFrameStart) / AudioUtils_3.HZ;
                            if (leadTime > 10 || programStartFrame == -1) {
                                trackNumber += 1;
                                copyNumber = 1;
                            }
                            programStartFrame = frame;
                            console.log("Decoder \"" + tapeDecoder.getName() + "\" detected " + trackNumber + "-" + copyNumber + " at " + AudioUtils_3.frameToTimestamp(frame) + " after " + leadTime.toFixed(3) + " seconds.");
                            // Throw away the other decoders.
                            tapeDecoders = [
                                tapeDecoder
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
                    case TapeDecoderState_2.TapeDecoderState.UNDECIDED:
                        console.log("Reached end of tape without finding track.");
                        break;
                    case TapeDecoderState_2.TapeDecoderState.DETECTED:
                        console.log("Reached end of tape while still reading track.");
                        break;
                    case TapeDecoderState_2.TapeDecoderState.ERROR:
                    case TapeDecoderState_2.TapeDecoderState.FINISHED:
                        if (state === TapeDecoderState_2.TapeDecoderState.ERROR) {
                            console.log("Decoder detected an error; skipping program.");
                        }
                        else {
                            console.log("Found end of program at " + AudioUtils_3.frameToTimestamp(frame) + ".");
                        }
                        const program = new Program_1.Program(trackNumber, copyNumber, programStartFrame, frame, tapeDecoders[0].getProgram(), tapeDecoders[0].getBits());
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
// UI for browsing a tape interactively.
define("TapeBrowser", ["require", "exports", "Utils", "Basic", "BitType"], function (require, exports, Utils_3, Basic_1, BitType_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class TapeBrowser {
        constructor(tape, originalCanvas, filteredCanvas, programText, tapeContents) {
            const self = this;
            this.tape = tape;
            this.originalCanvas = originalCanvas;
            this.filteredCanvas = filteredCanvas;
            this.programText = programText;
            this.tapeContents = tapeContents;
            this.displayWidth = originalCanvas.width;
            this.configureCanvas(originalCanvas);
            this.configureCanvas(filteredCanvas);
            // Display level in the tape's samplesList.
            this.displayLevel = this.computeFullFitLevel();
            // Visually centered sample (in level 0).
            this.centerSample = Math.floor(tape.originalSamples.samplesList[0].length / 2);
            // Configure zoom keys.
            document.onkeypress = function (event) {
                if (event.key === '=') {
                    self.zoomIn();
                    event.preventDefault();
                }
                if (event.key === '-') {
                    self.zoomOut();
                    event.preventDefault();
                }
            };
            // Update tape contents.
            this.updateTapeContents();
        }
        /**
         *
         * @param {HTMLCanvasElement} canvas
         */
        configureCanvas(canvas) {
            const self = this;
            let dragging = false;
            let dragInitialX = 0;
            let dragInitialCenterSample = 0;
            canvas.onmousedown = function (event) {
                dragging = true;
                dragInitialX = event.x;
                dragInitialCenterSample = self.centerSample;
                canvas.style.cursor = "grab";
            };
            canvas.onmouseup = function () {
                dragging = false;
                canvas.style.cursor = "auto";
            };
            canvas.onmousemove = function (event) {
                if (dragging) {
                    const dx = event.x - dragInitialX;
                    const mag = Math.pow(2, self.displayLevel);
                    self.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                    self.draw();
                }
            };
        }
        /**
         * Compute level to fit all the data.
         */
        computeFullFitLevel() {
            return this.computeFitLevel(this.tape.originalSamples.samplesList[0].length);
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
        draw() {
            this.drawInCanvas(this.originalCanvas, this.tape.originalSamples);
            this.drawInCanvas(this.filteredCanvas, this.tape.filteredSamples);
        }
        /**
         * @param {HTMLCanvasElement} canvas
         * @param {DisplaySamples} displaySamples
         */
        drawInCanvas(canvas, displaySamples) {
            const ctx = canvas.getContext('2d');
            const samplesList = displaySamples.samplesList;
            const width = canvas.width;
            const height = canvas.height;
            const samples = samplesList[this.displayLevel];
            const mag = Math.pow(2, this.displayLevel);
            const centerSample = Math.floor(this.centerSample / mag);
            const frameToX = function (i) {
                return Math.floor(width / 2) + (i - centerSample);
            };
            // Background.
            ctx.fillStyle = 'rgb(0, 0, 0)';
            ctx.fillRect(0, 0, width, height);
            // Compute viewing window in zoom space.
            const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
            const lastSample = Math.min(centerSample + width - 1, samples.length - 1);
            // Compute viewing window in original space.
            const firstOrigSample = Math.floor(firstSample * mag);
            const lastOrigSample = Math.ceil(lastSample * mag);
            // Whether we're zoomed in enough to draw and line and individual bits.
            const drawingLine = this.displayLevel < 3;
            // Programs.
            for (let program of this.tape.programs) {
                if (drawingLine) {
                    for (let bitInfo of program.bits) {
                        if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                            let x1 = frameToX(bitInfo.startFrame / mag);
                            let x2 = frameToX(bitInfo.endFrame / mag);
                            // console.log(bitInfo, x1, x2);
                            switch (bitInfo.bitType) {
                                case BitType_2.BitType.ZERO:
                                    ctx.fillStyle = 'rgb(50, 50, 50)';
                                    break;
                                case BitType_2.BitType.ONE:
                                    ctx.fillStyle = 'rgb(100, 100, 100)';
                                    break;
                                case BitType_2.BitType.START:
                                    ctx.fillStyle = 'rgb(20, 150, 20)';
                                    break;
                                case BitType_2.BitType.BAD:
                                    ctx.fillStyle = 'rgb(150, 20, 20)';
                                    break;
                            }
                            ctx.fillRect(x1, 0, x2 - x1 - 1, height);
                        }
                    }
                }
                else {
                    ctx.fillStyle = 'rgb(50, 50, 50)';
                    let x1 = frameToX(program.startFrame / mag);
                    let x2 = frameToX(program.endFrame / mag);
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
                    if (i == firstSample) {
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
        zoomIn() {
            if (this.displayLevel > 0) {
                this.displayLevel -= 1;
                this.draw();
            }
        }
        zoomOut() {
            if (this.displayLevel < this.tape.originalSamples.samplesList.length - 1) {
                this.displayLevel += 1;
                this.draw();
            }
        }
        zoomToBitData(bitData) {
            // Show a bit after a many bits before.
            const startFrame = bitData.startFrame - 1500;
            const endFrame = bitData.endFrame + 300;
            const sampleCount = endFrame - startFrame;
            // Find appropriate zoom.
            this.displayLevel = this.computeFitLevel(sampleCount);
            // Visually centered sample (in level 0).
            this.centerSample = Math.floor((startFrame + endFrame) / 2);
            this.draw();
        }
        showBinary(program) {
            this.showProgramText();
            const div = this.programText;
            this.clearElement(div);
            div.classList.add("binary");
            div.classList.remove("basic");
            const binary = program.binary;
            for (let addr = 0; addr < binary.length; addr += 16) {
                let line = document.createElement("div");
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
                    let c = binary[subAddr];
                    e = document.createElement("span");
                    if (c >= 32 && c < 127) {
                        e.classList.add("ascii");
                        e.innerText += String.fromCharCode(c);
                    }
                    else {
                        e.classList.add("ascii-unprintable");
                        e.innerText += '.';
                    }
                    line.appendChild(e);
                }
                div.appendChild(line);
            }
        }
        /**
         *
         * @param {Program} program
         */
        showBasic(program) {
            this.showProgramText();
            const div = this.programText;
            this.clearElement(div);
            div.classList.add("basic");
            div.classList.remove("binary");
            Basic_1.fromTokenized(program.binary, div);
        }
        showProgramText() {
            this.originalCanvas.style.display = "none";
            this.filteredCanvas.style.display = "none";
            this.programText.style.display = "block";
        }
        showCanvases() {
            this.originalCanvas.style.display = "block";
            this.filteredCanvas.style.display = "block";
            this.programText.style.display = "none";
        }
        updateTapeContents() {
            let self = this;
            let addRow = function (text, onClick) {
                let div = document.createElement("div");
                div.classList.add("tape_contents_row");
                div.innerText = text;
                if (onClick) {
                    div.onclick = onClick;
                }
                self.tapeContents.appendChild(div);
            };
            this.clearElement(this.tapeContents);
            for (let program of this.tape.programs) {
                addRow("Track " + program.trackNumber + ", copy " + program.copyNumber, function () {
                    self.showCanvases();
                });
                addRow("    Binary", function () {
                    self.showBinary(program);
                });
                if (program.isProgram()) {
                    addRow("    Basic", function () {
                        self.showBasic(program);
                    });
                }
                let count = 1;
                for (let bitData of program.bits) {
                    if (bitData.bitType == BitType_2.BitType.BAD) {
                        addRow("    Bit error " + count++, function () {
                            self.showCanvases();
                            self.zoomToBitData(bitData);
                        });
                    }
                }
            }
        }
        /**
         * Remove all children from element.
         *
         * @param {HTMLElement} e
         */
        clearElement(e) {
            while (e.firstChild) {
                e.removeChild(e.firstChild);
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
            const self = this;
            this.handleAudioBuffer = handleAudioBuffer;
            this.progressBar = dropProgress;
            dropZone.ondrop = function (ev) {
                self.dropHandler(ev);
            };
            dropZone.ondragover = function (ev) {
                dropZone.classList.add("hover");
                // Prevent default behavior (prevent file from being opened).
                ev.preventDefault();
            };
            dropZone.ondragleave = function () {
                dropZone.classList.remove("hover");
            };
            dropUpload.onchange = function () {
                if (dropUpload.files) {
                    const file = dropUpload.files[0];
                    if (file) {
                        self.handleDroppedFile(file);
                    }
                }
            };
            dropUpload.onprogress = function (event) {
                self.showProgress(event);
            };
            dropS3.forEach(node => {
                const button = node;
                button.onclick = function () {
                    const url = button.getAttribute("data-src");
                    const request = new XMLHttpRequest();
                    request.open('GET', url, true);
                    request.responseType = "arraybuffer";
                    request.onload = function () {
                        self.handleArrayBuffer(request.response);
                    };
                    request.onprogress = function (event) {
                        self.showProgress(event);
                    };
                    // For testing progress bar only:
                    /// request.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                    request.send();
                };
            });
        }
        handleDroppedFile(file) {
            let self = this;
            console.log("File " + file.name + " has size " + file.size);
            // We could use file.arrayBuffer() here, but as of writing it's buggy
            // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
            let fileReader = new FileReader();
            fileReader.addEventListener("loadend", function () {
                if (fileReader.result instanceof ArrayBuffer) {
                    self.handleArrayBuffer(fileReader.result);
                }
                else {
                    console.log("Error: Unexpected type for fileReader.result: " +
                        fileReader.result);
                }
            });
            fileReader.addEventListener("progress", function (event) {
                self.showProgress(event);
            });
            fileReader.readAsArrayBuffer(file);
        }
        showProgress(event) {
            this.progressBar.style.display = "block";
            this.progressBar.value = event.loaded;
            this.progressBar.max = event.total;
        }
        handleArrayBuffer(arrayBuffer) {
            let audioCtx = new window.AudioContext();
            audioCtx.decodeAudioData(arrayBuffer).then(this.handleAudioBuffer);
        }
        dropHandler(ev) {
            const self = this;
            // Prevent default behavior (Prevent file from being opened)
            ev.preventDefault();
            if (ev.dataTransfer) {
                if (ev.dataTransfer.items) {
                    // Use DataTransferItemList interface to access the files.
                    for (let i = 0; i < ev.dataTransfer.items.length; i++) {
                        // If dropped items aren't files, reject them
                        if (ev.dataTransfer.items[i].kind === 'file') {
                            const file = ev.dataTransfer.items[i].getAsFile();
                            if (file) {
                                self.handleDroppedFile(file);
                            }
                        }
                    }
                }
                else {
                    // Use DataTransfer interface to access the files.
                    for (let i = 0; i < ev.dataTransfer.files.length; i++) {
                        self.handleDroppedFile(ev.dataTransfer.files[i]);
                    }
                }
            }
        }
    }
    exports.Uploader = Uploader;
});
define("Main", ["require", "exports", "Tape", "TapeBrowser", "Uploader", "Decoder"], function (require, exports, Tape_1, TapeBrowser_1, Uploader_1, Decoder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function handleAudioBuffer(audioBuffer) {
        console.log("Audio is " + audioBuffer.duration + " seconds, " +
            audioBuffer.numberOfChannels + " channels, " +
            audioBuffer.sampleRate + " Hz");
        // TODO check that there's 1 channel and it's 48 kHz.
        const originalCanvas = document.getElementById("original_canvas");
        const filteredCanvas = document.getElementById("filtered_canvas");
        const programText = document.getElementById("program_text");
        const tapeContents = document.getElementById("tape_contents");
        const samples = audioBuffer.getChannelData(0);
        const tape = new Tape_1.Tape(samples);
        const decoder = new Decoder_1.Decoder(tape);
        decoder.decode();
        const tapeBrowser = new TapeBrowser_1.TapeBrowser(tape, originalCanvas, filteredCanvas, programText, tapeContents);
        tapeBrowser.draw();
        // Switch screens.
        const dropScreen = document.getElementById("drop_screen");
        const dataScreen = document.getElementById("data_screen");
        dropScreen.style.display = "none";
        dataScreen.style.display = "block";
    }
    function main() {
        const dropZone = document.getElementById("drop_zone");
        const dropUpload = document.getElementById("drop_upload");
        const dropS3 = document.querySelectorAll("#test_files button");
        const dropProgress = document.getElementById("drop_progress");
        new Uploader_1.Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
    }
    exports.main = main;
});
