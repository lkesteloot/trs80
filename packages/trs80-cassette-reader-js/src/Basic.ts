
// Tools for decoding Basic programs.

import { pad } from "./Utils";
import jss from './Jss'

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

// Stylesheet.
const BACKGROUND_COLOR = "var(--background)";
const STYLE = {
    error: {
        color: "var(--red)",
        "&$highlighted": {
            backgroundColor: "var(--red)",
            color: BACKGROUND_COLOR,
        },
    },
    lineNumber: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    punctuation: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    keyword: {
        color: "var(--blue)",
        "&$highlighted": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
    },
    regular: {
        color: "var(--foreground)",
        "&$highlighted": {
            backgroundColor: "var(--foreground)",
            color: BACKGROUND_COLOR,
        },
    },
    string: {
        color: "var(--orange)",
        "&$highlighted": {
            backgroundColor: "var(--orange)",
            color: BACKGROUND_COLOR,
        },
    },
    comment: {
        color: "var(--cyan)",
        "&$highlighted": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
    },
    selected: {
        backgroundColor: "var(--background-highlights)",
    },
    highlighted: {
        // Empty style that's referenced above as $highlighted.
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

/**
 * Get the token for the byte value, or undefined if the value does
 * not map to a token.
 */
export function getToken(c: number): string | undefined {
    return c >= 128 && c < 128 + TOKENS.length ? TOKENS[c - 128] : undefined;
}

/**
 * Decode a tokenized Basic program.
 * @param bytes tokenized program.
 * @param out div to write result into.
 * @return array of generated HTML elements, index by byte index.
 */
export function fromTokenized(bytes: Uint8Array, out: HTMLElement): HTMLElement[] {
    sheet.attach();
    const classes = sheet.classes;

    const b = new ByteReader(bytes);
    let state;
    const elements: HTMLElement[] = [];

    if (b.read() !== 0xD3 || b.read() !== 0xD3 || b.read() !== 0xD3) {
        add(out, "Basic: missing magic -- not a BASIC file.", classes.error);
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
            add(line, "[EOF in next line's address]", classes.error);
            break;
        }
        // Zero address indicates end of program.
        if (address === 0) {
            break;
        }

        // Read current line number.
        const lineNumber = b.readShort(false);
        if (lineNumber === EOF) {
            add(line, "[EOF in line number]", classes.error);
            break;
        }
        let e = add(line, lineNumber.toString(), classes.lineNumber);
        elements[b.addr() - 2] = e;
        e = add(line, " ", classes.regular);
        elements[b.addr() - 1] = e;

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
                e = add(line, ":", classes.punctuation);
                elements[b.addr() - 1] = e;
            } else if (c === REM && state === COLON) {
                state = COLON_REM;
            } else if (c === REMQUOT && state === COLON_REM) {
                e = add(line, "'", classes.comment);
                elements[b.addr() - 1] = e;
                state = RAW;
            } else if (c === ELSE && state === COLON) {
                e = add(line, "ELSE", classes.keyword);
                elements[b.addr() - 1] = e;
                state = NORMAL;
            } else {
                if (state === COLON || state === COLON_REM) {
                    e = add(line, ":", classes.punctuation);
                    elements[b.addr() - 1] = e;
                    if (state === COLON_REM) {
                        e = add(line, "REM", classes.comment);
                        elements[b.addr() - 1] = e;
                        state = RAW;
                    } else {
                        state = NORMAL;
                    }
                }

                switch (state) {
                    case NORMAL:
                        const token = getToken(c);
                        if (token !== undefined) {
                            e = add(line, token,
                                c === DATA || c === REM ? classes.comment
                                : token.length === 1 ? classes.punctuation
                                : classes.keyword);
                        } else {
                            e = add(line, ch, ch === '"' ? classes.string : classes.regular);
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
                            e = add(line, "\\n", classes.punctuation);
                        } else if (ch === "\\") {
                            e = add(line, "\\" + pad(c, 8, 3), classes.punctuation);
                        } else if (c >= 32 && c < 128) {
                            e = add(line, ch, classes.string);
                        } else {
                            e = add(line, "\\" + pad(c, 8, 3), classes.punctuation);
                        }
                        elements[b.addr() - 1] = e;
                        if (ch === '"') {
                            // End of string.
                            state = NORMAL;
                        }
                        break;

                    case RAW:
                        e = add(line, ch, classes.comment);
                        elements[b.addr() - 1] = e;
                        break;
                }
            }
        }
        if (c === EOF) {
            add(line, "[EOF in line]", classes.error);
            break;
        }

        // Deal with eaten tokens.
        if (state === COLON || state === COLON_REM) {
            e = add(line, ":", classes.punctuation);
            elements[b.addr() - 1] = e;
            if (state === COLON_REM) {
                e = add(line, "REM", classes.comment);
            }
            elements[b.addr() - 1] = e;
            /// state = NORMAL;
        }

        // Append last line.
        out.appendChild(line);
    }

    return elements;
}
