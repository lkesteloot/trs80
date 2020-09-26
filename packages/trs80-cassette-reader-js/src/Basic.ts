
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
 * Type of Basic element, for syntax highlighting.
 */
export enum ElementType {
    ERROR,
    LINE_NUMBER,
    PUNCTUATION,
    KEYWORD,
    REGULAR,
    STRING,
    COMMENT,
}

/**
 * Piece of a Basic program (token, character, line number).
 */
export class BasicElement {
    // Byte offset in "bytes" array, or undefined if this is an error message.
    public offset: number | undefined;

    // Text of element.
    public text: string;

    // Type of element (line number, token, string literal, etc.).
    public elementType: ElementType;

    constructor(offset: number | undefined, text: string, elementType: ElementType) {
        this.offset = offset;
        this.text = text;
        this.elementType = elementType;
    }
}


/**
 * Decode a tokenized Basic program.
 * @param bytes tokenized program.
 * @return array of generated BasicElements, index by byte index.
 */
export function fromTokenized(bytes: Uint8Array): BasicElement[] {
    const b = new ByteReader(bytes);
    let state;

    // Map from byte address to BasicElement for that byte.
    const elements: BasicElement[] = [];

    if (b.read() !== 0xD3 || b.read() !== 0xD3 || b.read() !== 0xD3) {
        elements.push(new BasicElement(undefined, "Basic: missing magic -- not a BASIC file.", ElementType.ERROR));
        return elements;
    }

    // One-byte ASCII program name. This is nearly always meaningless, so we do nothing with it.
    b.read();

    while (true) {
        // Read the address of the next line. We ignore this (as does Basic when
        // loading programs), only using it to detect end of program. (In the real
        // Basic these are regenerated after loading.)
        const address = b.readShort(true);
        if (address === EOF) {
            elements.push(new BasicElement(undefined, "[EOF in next line's address]", ElementType.ERROR));
            break;
        }
        // Zero address indicates end of program.
        if (address === 0) {
            break;
        }

        // Read current line number.
        const lineNumber = b.readShort(false);
        if (lineNumber === EOF) {
            elements.push(new BasicElement(undefined, "[EOF in line number]", ElementType.ERROR));
            break;
        }
        elements.push(new BasicElement(b.addr() - 2, lineNumber.toString(), ElementType.LINE_NUMBER));
        elements.push(new BasicElement(b.addr() - 1, " ", ElementType.REGULAR));

        // Read rest of line.
        let c; // Uint8 value.
        let ch; // String value.
        let colonAddr = 0;
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
                colonAddr = b.addr() - 1;
            } else if (ch === ":" && state === COLON) {
                elements.push(new BasicElement(colonAddr, ":", ElementType.PUNCTUATION));
                colonAddr = b.addr() - 1;
            } else if (c === REM && state === COLON) {
                state = COLON_REM;
                colonAddr = 0;
            } else if (c === REMQUOT && state === COLON_REM) {
                elements.push(new BasicElement(b.addr() - 1, "'", ElementType.COMMENT));
                state = RAW;
            } else if (c === ELSE && state === COLON) {
                elements.push(new BasicElement(b.addr() - 1, "ELSE", ElementType.KEYWORD));
                state = NORMAL;
                colonAddr = 0;
            } else {
                if (state === COLON || state === COLON_REM) {
                    elements.push(new BasicElement(colonAddr, ":", ElementType.PUNCTUATION));
                    if (state === COLON_REM) {
                        elements.push(new BasicElement(b.addr() - 1, "REM", ElementType.COMMENT));
                        state = RAW;
                    } else {
                        state = NORMAL;
                    }
                    colonAddr = 0;
                }

                switch (state) {
                    case NORMAL:
                        const token = getToken(c);
                        elements.push(token !== undefined
                            ? new BasicElement(b.addr() - 1, token,
                                c === DATA || c === REM ? ElementType.COMMENT
                                    : token.length === 1 ? ElementType.PUNCTUATION
                                    : ElementType.KEYWORD)
                            : new BasicElement(b.addr() - 1, ch, ch === '"' ? ElementType.STRING : ElementType.REGULAR));
                        if (c === DATA || c === REM) {
                            state = RAW;
                        } else if (ch === '"') {
                            state = STRING_LITERAL;
                        }
                        break;

                    case STRING_LITERAL:
                        var e: BasicElement;
                        if (ch === "\r") {
                            e = new BasicElement(b.addr() - 1, "\\n", ElementType.PUNCTUATION);
                        } else if (ch === "\\") {
                            e = new BasicElement(b.addr() - 1, "\\" + pad(c, 8, 3), ElementType.PUNCTUATION);
                        } else if (c >= 32 && c < 128) {
                            e = new BasicElement(b.addr() - 1, ch, ElementType.STRING);
                        } else {
                            e = new BasicElement(b.addr() - 1, "\\" + pad(c, 8, 3), ElementType.PUNCTUATION);
                        }
                        elements.push(e);
                        if (ch === '"') {
                            // End of string.
                            state = NORMAL;
                        }
                        break;

                    case RAW:
                        elements.push(new BasicElement(b.addr() - 1, ch, ElementType.COMMENT));
                        break;
                }
            }
        }
        if (c === EOF) {
            elements.push(new BasicElement(undefined, "[EOF in line]", ElementType.ERROR));
            break;
        }

        // Deal with eaten tokens.
        if (state === COLON || state === COLON_REM) {
            elements.push(new BasicElement(colonAddr, ":", ElementType.PUNCTUATION));
            if (state === COLON_REM) {
                elements.push(new BasicElement(b.addr() - 1, "REM", ElementType.COMMENT));
            }
            /// state = NORMAL;
            /// colonAddr = 0;
        }
    }

    return elements;
}

/**
 * Render an array of Basic elements to a DIV.
 *
 * @return array of the elements added, with the index being the offset into the original bytes array.
 */
export function toDiv(basicElements: BasicElement[], out: HTMLElement): HTMLElement[] {
    sheet.attach();
    const classes = sheet.classes;

    // Map from byte address to HTML element for that byte.
    const elements: HTMLElement[] = [];

    let line = document.createElement("div");
    out.appendChild(line);

    for (const basicElement of basicElements) {
        let className: string;

        switch (basicElement.elementType) {
            case ElementType.ERROR:
                className = classes.error;
                break;
            case ElementType.LINE_NUMBER:
                className = classes.lineNumber;
                line = document.createElement("div");
                out.appendChild(line);
                break;
            case ElementType.PUNCTUATION:
                className = classes.punctuation;
                break;
            case ElementType.KEYWORD:
                className = classes.keyword;
                break;
            case ElementType.REGULAR:
            default:
                className = classes.regular;
                break;
            case ElementType.STRING:
                className = classes.string;
                break;
            case ElementType.COMMENT:
                className = classes.comment;
                break;
        }

        const e = add(line, basicElement.text, className);
        if (basicElement.offset !== undefined) {
            elements[basicElement.offset] = e;
        }
    }

    return elements;
}
