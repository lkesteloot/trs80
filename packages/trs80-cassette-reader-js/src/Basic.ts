
// Tools for decoding Basic programs.

import { pad } from "./Utils";

// Starts at 0x80.
const TOKENS = [
    "END", "FOR", "RESET", "SET", "CLS", "CMD", "RANDOM", "NEXT", // 0x80
    "DATA", "INPUT", "DIM", "READ", "LET", "GOTO", "RUN", "IF", // 0x88
    "RESTORE", "GOSUB", "RETURN", "REM", "STOP", "ELSE", "TRON", "TROFF", // 0x90
    "DEFSTR", "DEFINT", "DEFSNG", "DEFDBL", "LINE", "EDIT", "ERROR", "RESUME", // 0x98
    "OUT", "ON", "OPEN", "FIELD", "GET", "PUT", "CLOSE", "LOAD", // 0xA0
    "MERGE", "NAME", "KILL", "LSET", "RSET", "SAVE", "SYSTEM", "LPRINT", // 0xA8
    "DEF", "POKE", "PRINT", "CONT", "LIST", "LLIST", "DELETE", "AUTO", // 0xB0
    "CLEAR", "CLOAD", "CSAVE", "NEW", "TAB(", "TO", "FN", "USING", // 0xB8
    "VARPTR", "USR", "ERL", "ERR", "STRING", "INSTR", "POINT", "TIME$", // 0xC0
    "MEM", "INKEY$", "THEN", "NOT", "STEP", "+", "-", "*", // 0xC8
    "/", "[", "AND", "OR", ">", "=", "<", "SGN", // 0xD0
    "INT", "ABS", "FRE", "INP", "POS", "SQR", "RND", "LOG", // 0xD8
    "EXP", "COS", "SIN", "TAN", "ATN", "PEEK", "CVI", "CVS", // 0xE0
    "CVD", "EOF", "LOC", "LOF", "MKI", "MKS$", "MKD$", "CINT", // 0xE8
    "CSNG", "CDBL", "FIX", "LEN", "STR$", "VAL", "ASC", "CHR$", // 0xF0
    "LEFT$", "RIGHT$", "MID$", // 0xF8
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
    private readonly b: Uint8Array;
    private pos: number;

    constructor(b: Uint8Array) {
        this.b = b;
        this.pos = 0;
    }

    /**
     * Return the next byte, or EOF on end of array.
     *
     * @returns {number}
     */
    public read(): number {
        return this.pos < this.b.length ? this.b[this.pos++] : EOF;
    }

    /**
     * Return the byte address of the next byte to be read.
     */
    public addr(): number {
        return this.pos;
    }

    /**
     * Reads a little-endian short (two-byte) integer.
     *
     * @param allowEofAfterFirstByte
     * @returns the integer, or EOF on end of file.
     */
    public readShort(allowEofAfterFirstByte: boolean): number {
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
function add(out: HTMLElement, text: string, className: string): HTMLElement {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
    return e;
}

/**
 * Decode a tokenized Basic program.
 * @param bytes tokenized program.
 * @param out div to write result into.
 * @return array of generated HTML elements, index by byte index.
 */
export function fromTokenized(bytes: Uint8Array, out: HTMLElement): HTMLElement[] {
    const b = new ByteReader(bytes);
    let state;
    const elements: HTMLElement[] = [];

    if (b.read() !== 0xD3 || b.read() !== 0xD3 || b.read() !== 0xD3) {
        add(out, "Basic: missing magic -- not a BASIC file.", "error");
        return elements;
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
        let e = add(line, lineNumber.toString(), "line_number");
        elements[b.addr() - 2] = e;
        elements[b.addr() - 1] = e;
        add(line, " ", "regular");

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
            } else if (ch === ":" && state === COLON) {
                e = add(line, ":", "punctuation");
                elements[b.addr() - 1] = e;
            } else if (c === REM && state === COLON) {
                state = COLON_REM;
            } else if (c === REMQUOT && state === COLON_REM) {
                e = add(line, "'", "comment");
                elements[b.addr() - 1] = e;
                state = RAW;
            } else if (c === ELSE && state === COLON) {
                e = add(line, "ELSE", "keyword");
                elements[b.addr() - 1] = e;
                state = NORMAL;
            } else {
                if (state === COLON || state === COLON_REM) {
                    e = add(line, ":", "punctuation");
                    elements[b.addr() - 1] = e;
                    if (state === COLON_REM) {
                        e = add(line, "REM", "comment");
                        elements[b.addr() - 1] = e;
                        state = RAW;
                    } else {
                        state = NORMAL;
                    }
                }

                switch (state) {
                    case NORMAL:
                        if (c >= 128 && c < 128 + TOKENS.length) {
                            const token = TOKENS[c - 128];
                            e = add(line, token,
                                c === DATA || c === REM ? "comment"
                                : token.length === 1 ? "punctuation"
                                : "keyword");
                        } else {
                            e = add(line, ch, ch === '"' ? "string" : "regular");
                        }
                        elements[b.addr() - 1] = e;

                        if (c === DATA || c === REM) {
                            state = RAW;
                        } else if (ch === '"') {
                            state = STRING_LITERAL;
                        }
                        break;

                    case STRING_LITERAL:
                        if (ch === "\r") {
                            e = add(line, "\\n", "punctuation");
                        } else if (ch === "\\") {
                            e = add(line, "\\" + pad(c, 8, 3), "punctuation");
                        } else if (c >= 32 && c < 128) {
                            e = add(line, ch, "string");
                        } else {
                            e = add(line, "\\" + pad(c, 8, 3), "punctuation");
                        }
                        elements[b.addr() - 1] = e;
                        if (ch === '"') {
                            // End of string.
                            state = NORMAL;
                        }
                        break;

                    case RAW:
                        e = add(line, ch, "comment");
                        elements[b.addr() - 1] = e;
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
            e = add(line, ":", "punctuation");
            elements[b.addr() - 1] = e;
            if (state === COLON_REM) {
                e = add(line, "REM", "comment");
            }
            elements[b.addr() - 1] = e;
            /// state = NORMAL;
        }

        // Append last line.
        out.appendChild(line);
    }

    return elements;
}
