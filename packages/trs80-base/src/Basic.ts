
// Tools for decoding Basic programs.

import {ByteReader, concatByteArrays, EOF} from "teamten-ts-utils";
import {hi, lo, toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation";
import {Trs80File} from "./Trs80File";

export const BASIC_TAPE_HEADER_BYTE = 0xD3;
export const BASIC_HEADER_BYTE = 0xFF;

const FIRST_TOKEN = 0x80;
const TOKENS = [
    "END", "FOR", "RESET", "SET", "CLS", "CMD", "RANDOM", "NEXT", // 0x80
    "DATA", "INPUT", "DIM", "READ", "LET", "GOTO", "RUN", "IF", // 0x88
    "RESTORE", "GOSUB", "RETURN", "REM", "STOP", "ELSE", "TRON", "TROFF", // 0x90
    "DEFSTR", "DEFINT", "DEFSNG", "DEFDBL", "LINE", "EDIT", "ERROR", "RESUME", // 0x98
    "OUT", "ON", "OPEN", "FIELD", "GET", "PUT", "CLOSE", "LOAD", // 0xA0
    "MERGE", "NAME", "KILL", "LSET", "RSET", "SAVE", "SYSTEM", "LPRINT", // 0xA8
    "DEF", "POKE", "PRINT", "CONT", "LIST", "LLIST", "DELETE", "AUTO", // 0xB0
    "CLEAR", "CLOAD", "CSAVE", "NEW", "TAB(", "TO", "FN", "USING", // 0xB8
    "VARPTR", "USR", "ERL", "ERR", "STRING$", "INSTR", "POINT", "TIME$", // 0xC0
    "MEM", "INKEY$", "THEN", "NOT", "STEP", "+", "-", "*", // 0xC8
    "/", "[", "AND", "OR", ">", "=", "<", "SGN", // 0xD0
    "INT", "ABS", "FRE", "INP", "POS", "SQR", "RND", "LOG", // 0xD8
    "EXP", "COS", "SIN", "TAN", "ATN", "PEEK", "CVI", "CVS", // 0xE0
    "CVD", "EOF", "LOC", "LOF", "MKI$", "MKS$", "MKD$", "CINT", // 0xE8
    "CSNG", "CDBL", "FIX", "LEN", "STR$", "VAL", "ASC", "CHR$", // 0xF0
    "LEFT$", "RIGHT$", "MID$", // 0xF8
];
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;
const COLON = 0x3A;
const REM = 0x93;
const DATA = 0x88;
const REMQUOT = 0xFB;
const ELSE = 0x95;

/**
 * Parser state.
 */
enum ParserState {
    // Normal part of line.
    NORMAL,
    // Inside string literal.
    STRING,
    // After REM token to end of line.
    REM,
    // After DATA token to end of statement.
    DATA,
}

/**
 * Get the token for the byte value, or undefined if the value does
 * not map to a token.
 */
export function getToken(c: number): string | undefined {
    return c >= FIRST_TOKEN && c < FIRST_TOKEN + TOKENS.length ? TOKENS[c - FIRST_TOKEN] : undefined;
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
    // Byte offset in "bytes" array, or undefined if this is an error message or otherwise
    // not selectable, such as the space between line numbers and the rest of the line.
    public offset: number | undefined;

    // Length of section in "binary" array.
    public length: number;

    // Text of element.
    public text: string;

    // Type of element (line number, token, string literal, etc.).
    public elementType: ElementType;

    constructor(offset: number | undefined, text: string, elementType: ElementType, length: number = 1) {
        this.offset = offset;
        this.length = length;
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
 * @param binary tokenized program. May be in tape format (D3 D3 D3 followed by a one-letter program
 * name) or not (FF).
 * @return the Basic program, or undefined if the header did not indicate that this was a Basic program.
 */
export function decodeBasicProgram(binary: Uint8Array): BasicProgram | undefined {
    const b = new ByteReader(binary);
    let state: ParserState;
    let preStringState = ParserState.NORMAL;
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
        elements.push(new BasicElement(b.addr() - 2, lineNumber.toString(), ElementType.LINE_NUMBER, 2));
        elements.push(new BasicElement(undefined, " ", ElementType.REGULAR));

        // Read rest of line.
        const lineAddr = b.addr();
        const lineElementsIndex = elements.length;
        let c; // Uint8 value.
        let ch; // String value.
        state = ParserState.NORMAL;
        while (true) {
            c = b.read();
            if (c === EOF || c === 0) {
                break;
            }
            ch = String.fromCharCode(c);

            // Special handling of sequences of characters that start with a colon.
            if (ch === ":" && state === ParserState.NORMAL) {
                const colonAddr = b.addr() - 1;
                if (b.peek(0) === ELSE) {
                    // :ELSE gets translated to just ELSE, probably because an old version
                    // of Basic only supported ELSE after a colon.
                    b.read(); // ELSE
                    elements.push(new BasicElement(colonAddr, "ELSE", ElementType.KEYWORD, b.addr() - colonAddr));
                } else if (b.peek(0) === REM && b.peek(1) === REMQUOT) {
                    // Detect the ":REM'" sequence (colon, REM, single quote), because
                    // that translates to a single quote. Must be a backward-compatible
                    // way to add a single quote as a comment.
                    b.read(); // REM
                    b.read(); // REMQUOT
                    elements.push(new BasicElement(colonAddr, "'", ElementType.COMMENT, b.addr() - colonAddr));
                    state = ParserState.REM;
                } else {
                    elements.push(new BasicElement(colonAddr, ":", ElementType.PUNCTUATION));
                }
            } else {
                switch (state) {
                    case ParserState.NORMAL:
                        const token = getToken(c);
                        elements.push(token !== undefined
                            ? new BasicElement(b.addr() - 1, token,
                                c === DATA || c === REM ? ElementType.COMMENT
                                    : token.length === 1 ? ElementType.PUNCTUATION
                                    : ElementType.KEYWORD)
                            : new BasicElement(b.addr() - 1,
                                ch, ch === '"' ? ElementType.STRING : ElementType.REGULAR));
                        if (c === REM) {
                            state = ParserState.REM;
                        } else if (c === DATA) {
                            state = ParserState.DATA;
                        } else if (ch === '"') {
                            preStringState = state;
                            state = ParserState.STRING;
                        }
                        break;

                    case ParserState.STRING:
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
                            state = preStringState;
                        }
                        break;

                    case ParserState.REM:
                        elements.push(new BasicElement(b.addr() - 1, ch, ElementType.COMMENT));
                        break;

                    case ParserState.DATA:
                        let elementType = ElementType.COMMENT;
                        if (ch === ":") {
                            elementType = ElementType.PUNCTUATION;
                            state = ParserState.NORMAL;
                        }
                        if (ch === '"') {
                            elementType = ElementType.STRING;
                            preStringState = state;
                            state = ParserState.STRING;
                        }
                        elements.push(new BasicElement(b.addr() - 1, ch, elementType));
                        break;
                }
            }
        }
        if (c === EOF) {
            error = "EOF in line";
            annotations.push(new ProgramAnnotation("Partial line", lineAddr, b.addr()));
            break;
        }

        const textLineParts: string[] = [];
        for (let i = lineElementsIndex; i < elements.length; i++) {
            textLineParts.push(elements[i].text);
        }
        let textLine = textLineParts.join("").replace(/[\n\r]+/, " ");
        if (textLine.length > 33) {
            textLine = textLine.substr(0, 30) + "...";
        }
        annotations.push(new ProgramAnnotation("Line: " + textLine, lineAddr, b.addr() - 1));
        annotations.push(new ProgramAnnotation("End-of-line marker", b.addr() - 1, b.addr()));
    }

    return new BasicProgram(binary, error, annotations, elements);
}

/**
 * Parser for a single line of Basic code.
 */
class BasicParser {
    private readonly line: string;
    private readonly result: number[] = [];
    public lineNumber: number | undefined = undefined;
    private pos = 0;

    constructor(line: string) {
        // Only trim the start, spaces at the end should be kept.
        this.line = line.trimStart();
    }

    /**
     * Parse the line, returning the binary for it or an error. The binary includes
     * the line number and the terminating nul, but not the "next-line" pointer.
     */
    public parse(): Uint8Array | string {
        // Parse line number.
        this.lineNumber = this.readNumber();
        if (this.lineNumber === undefined) {
            return "Missing line number: " + this.line;
        }

        this.result.push(lo(this.lineNumber));
        this.result.push(hi(this.lineNumber));

        // We only trim at the start, so there could be only spaces here, but that's not allowed.
        if (this.line.substr(this.pos).trim() === "") {
            return "Empty line " + this.lineNumber;
        }

        // Skip single optional whitespace
        if (this.pos < this.line.length && BasicParser.isWhitespace(this.line.charCodeAt(this.pos))) {
            this.pos++;
        }

        while (this.pos < this.line.length) {
            let ch = this.line.charCodeAt(this.pos);

            // Lower case anything outside of strings.
            if (ch >= 0x61 && ch < 0x61 + 26) {
                ch -= 0x20;
            }

            // Handle single-quote comment.
            if (ch === SINGLE_QUOTE) {
                // Single quote is the start of a comment, but it's encoded in a backward-compatible
                // way with several tokens.
                this.result.push(COLON, REM, REMQUOT);
                this.pos++;
                // We're done, copy the rest of the line.
                break;
            }

            // Handle string.
            if (ch === DOUBLE_QUOTE) {
                this.result.push(ch);
                this.pos++;
                while (this.pos < this.line.length) {
                    ch = this.line.charCodeAt(this.pos++);
                    this.result.push(ch);
                    if (ch === DOUBLE_QUOTE) {
                        break;
                    }
                }
            } else {
                // See if it should be a token.
                const token = this.readToken();
                if (token === undefined) {
                    // Just a regular letter.
                    this.result.push(ch);
                    this.pos++;
                } else {
                    // Prefix ELSE with colon for backward compatibility.
                    if (token === ELSE && this.result[this.result.length - 1] !== COLON) {
                        this.result.push(COLON);
                    }

                    this.result.push(token);
                    this.pos += TOKENS[token - FIRST_TOKEN].length;

                    if (token === REM) {
                        // We're done, copy the rest of the line.
                        break;
                    }

                    if (token === DATA) {
                        // Copy to end of statement.
                        let inString = false;
                        while (this.pos < this.line.length) {
                            ch = this.line.charCodeAt(this.pos);
                            if (ch === DOUBLE_QUOTE) {
                                inString = !inString;
                            } else if (ch === COLON && !inString) {
                                break;
                            }
                            this.result.push(ch);
                            this.pos++;
                        }
                    }
                }
            }
        }

        // Copy rest of line (for comments).
        while (this.pos < this.line.length) {
            this.result.push(this.line.charCodeAt(this.pos++));
        }

        // End-of-line marker.
        this.result.push(0);

        return new Uint8Array(this.result);
    }

    /**
     * If we're at a token, return it, else return undefined. Does not advance past the token.
     */
    private readToken(): number | undefined {
        for (let i = 0; i < TOKENS.length; i++) {
            const token = TOKENS[i];
            if (token === this.line.substr(this.pos, token.length).toUpperCase()) {
                return FIRST_TOKEN + i;
            }
        }

        return undefined;
    }

    /**
     * Reads a decimal number and advances past it, or returns undefined if not at a number.
     */
    private readNumber(): number | undefined {
        let n: number | undefined;

        while (this.pos < this.line.length && BasicParser.isDigit(this.line.charCodeAt(this.pos))) {
            if (n === undefined) {
                n = 0;
            }

            n = n*10 + this.line.charCodeAt(this.pos) - 0x30;

            this.pos++;
        }

        return n;
    }

    /**
     * Whether the ASCII value is whitespace.
     */
    private static isWhitespace(ch: number): boolean {
        return ch === 0x20 || ch === 0x09;
    }

    /**
     * Whether the ASCII value is a digit.
     */
    private static isDigit(ch: number): boolean {
        return ch >= 0x30 && ch < 0x3A;
    }
}

/**
 * Parse a Basic program into a binary with the initial 0xFF header.
 *
 * @return the binary or an error.
 */
export function parseBasicText(text: string): Uint8Array | string {
    // Split into lines. Only trim the start, spaces at the end should be kept.
    const lines = text.split(/[\n\r]+/)
        .map((line) => line.trimStart())
        .filter((line) => line !== "");

    const binaryParts: Uint8Array[] = [];

    binaryParts.push(new Uint8Array([BASIC_HEADER_BYTE]));

    // Parse each line.
    let lineNumber: number | undefined;
    for (const line of lines) {
        const parser = new BasicParser(line);
        const binary = parser.parse();
        if (typeof binary === "string") {
            return binary;
        }

        // Make sure line numbers are consecutive.
        if (lineNumber !== undefined && parser.lineNumber !== undefined && parser.lineNumber <= lineNumber) {
            return "Line " + parser.lineNumber + " is out of order";
        }
        lineNumber = parser.lineNumber;

        // Push next-line pointer. Can be anything as long as it's not 0x0000,
        // it'll get fixed up later.
        binaryParts.push(new Uint8Array([0xFF, 0xFF]));
        binaryParts.push(binary);
    }

    // End-of-program marker.
    binaryParts.push(new Uint8Array([0x00, 0x00]));

    return concatByteArrays(binaryParts);
}
