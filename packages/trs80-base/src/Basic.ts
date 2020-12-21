
// Tools for decoding Basic programs.

import {ByteReader, concatByteArrays, EOF} from "teamten-ts-utils";
import {toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation";
import {Trs80File} from "./Trs80File";

const BASIC_TAPE_HEADER_BYTE = 0xD3;
const BASIC_HEADER_BYTE = 0xFF;

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
 * Class representing a Basic program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class BasicProgram extends Trs80File {
    public elements: BasicElement[];

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                elements: BasicElement[]) {

        super(binary, error, annotations);
        this.elements = elements;
    }

    public getDescription(): string {
        // Don't include filename, it's usually worthless.
        return "Basic program";
    }
}

/**
 * Adds the header bytes necessary for writing Basic cassettes.
 */
export function wrapBasic(bytes: Uint8Array): Uint8Array {
    // Add Basic header.
    const buffers = [
        new Uint8Array([BASIC_TAPE_HEADER_BYTE, BASIC_TAPE_HEADER_BYTE, BASIC_TAPE_HEADER_BYTE]),
        bytes,
    ];
    return concatByteArrays(buffers);
}

/**
 * Decode a tokenized Basic program.
 * @param bytes tokenized program. May be in tape format (D3 D3 D3 followed by a one-letter program
 * name) or not (FF).
 * @return the Basic program, or undefined if the header did not indicate that this was a Basic program.
 */
export function decodeBasicProgram(bytes: Uint8Array): BasicProgram | undefined {
    const b = new ByteReader(bytes);
    let state;
    let error: string | undefined;
    const annotations: ProgramAnnotation[] = [];

    // Map from byte address to BasicElement for that byte.
    const elements: BasicElement[] = [];

    const firstByte = b.read();
    if (firstByte === BASIC_TAPE_HEADER_BYTE) {
        if (b.read() !== BASIC_TAPE_HEADER_BYTE || b.read() !== BASIC_TAPE_HEADER_BYTE) {
            return undefined;
        }

        annotations.push(new ProgramAnnotation("Header", 0, b.addr()));

        // One-byte ASCII program name. This is nearly always meaningless, so we do nothing with it.
        b.read();
        annotations.push(new ProgramAnnotation("Name", b.addr() - 1, b.addr()));
    } else if (firstByte === BASIC_HEADER_BYTE) {
        // All good.
        annotations.push(new ProgramAnnotation("Header", 0, b.addr()));
    } else {
        return undefined;
    }

    while (true) {
        // Read the address of the next line. We ignore this (as does Basic when
        // loading programs), only using it to detect end of program. (In the real
        // Basic these are regenerated after loading.)
        const address = b.readShort(true);
        if (address === EOF) {
            error = "EOF in next line's address";
            break;
        }
        // Zero address indicates end of program.
        if (address === 0) {
            annotations.push(new ProgramAnnotation("End-of-program marker", b.addr() - 2, b.addr()));
            break;
        }
        annotations.push(new ProgramAnnotation(
            "Address of next line (0x" + toHexWord(address) + ")", b.addr() - 2, b.addr()));

        // Read current line number.
        const lineNumber = b.readShort(false);
        if (lineNumber === EOF) {
            error = "EOF in line number";
            break;
        }
        annotations.push(new ProgramAnnotation("Line number (" + lineNumber + ")", b.addr() - 2, b.addr()));
        const lineNumberElement = new BasicElement(b.addr() - 2, lineNumber.toString(), ElementType.LINE_NUMBER);
        lineNumberElement.length = 2;
        elements.push(lineNumberElement);
        elements.push(new BasicElement(undefined, " ", ElementType.REGULAR));

        // Read rest of line.
        const lineAddr = b.addr();
        const lineElementsIndex = elements.length;
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
            error = "EOF in line";
            annotations.push(new ProgramAnnotation("Partial line", lineAddr, b.addr()));
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

        const textLineParts: string[] = [];
        for (let i = lineElementsIndex; i < elements.length; i++) {
            textLineParts.push(elements[i].text);
        }
        let textLine = textLineParts.join("");
        if (textLine.length > 33) {
            textLine = textLine.substr(0, 30) + "...";
        }
        annotations.push(new ProgramAnnotation("Line: " + textLine, lineAddr, b.addr() - 1));
        annotations.push(new ProgramAnnotation("End-of-line marker", b.addr() - 1, b.addr()));
    }

    return new BasicProgram(bytes, error, annotations, elements);
}
