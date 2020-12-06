
// Tools for decoding Basic programs.

import {ByteReader, concatByteArrays, EOF} from "teamten-utils";

const BASIC_HEADER_BYTE = 0xD3;

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

/**
 * Get the token for the byte value, or undefined if the value does
 * not map to a token.
 */
export function getToken(c: number): string | undefined {
    return c >= 128 && c < 128 + TOKENS.length ? TOKENS[c - 128] : undefined;
}

/**
 * Generate a 3-character octal version of a number.
 */
function toOctal(n: number): string {
    return n.toString(8).padStart(3, "0");
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
    // Byte offset in "bytes" array, or undefined if this is an error message or otherwise not selectable.
    public offset: number | undefined;

    // Length of section in "bytes" array.
    public length: number = 1;

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
 * Adds the header bytes necessary for writing Basic cassettes.
 */
export function wrapBasic(bytes: Uint8Array): Uint8Array {
    // Add Basic header.
    const buffers = [
        new Uint8Array([BASIC_HEADER_BYTE, BASIC_HEADER_BYTE, BASIC_HEADER_BYTE]),
        bytes,
    ];
    return concatByteArrays(buffers);
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

    if (b.read() !== BASIC_HEADER_BYTE || b.read() !== BASIC_HEADER_BYTE || b.read() !== BASIC_HEADER_BYTE) {
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
        const lineNumberElement = new BasicElement(b.addr() - 2, lineNumber.toString(), ElementType.LINE_NUMBER);
        lineNumberElement.length = 2;
        elements.push(lineNumberElement);
        elements.push(new BasicElement(undefined, " ", ElementType.REGULAR));

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
                            : new BasicElement(b.addr() - 1,
                                ch, ch === '"' ? ElementType.STRING : ElementType.REGULAR));
                        if (c === DATA || c === REM) {
                            state = RAW;
                        } else if (ch === '"') {
                            state = STRING_LITERAL;
                        }
                        break;

                    case STRING_LITERAL:
                        let e: BasicElement;
                        if (ch === "\r") {
                            e = new BasicElement(b.addr() - 1, "\\n", ElementType.PUNCTUATION);
                        } else if (ch === "\\") {
                            e = new BasicElement(b.addr() - 1, "\\" + toOctal(c), ElementType.PUNCTUATION);
                        } else if (c >= 32 && c < 128) {
                            e = new BasicElement(b.addr() - 1, ch, ElementType.STRING);
                        } else {
                            e = new BasicElement(b.addr() - 1, "\\" + toOctal(c), ElementType.PUNCTUATION);
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
