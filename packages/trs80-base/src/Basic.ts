
// Tools for decoding Level 2 Basic programs.

import {ByteReader, concatByteArrays, EOF} from "teamten-ts-utils";
import {assertNever, hi, lo, toHexWord} from "z80-base";
import {BasicDialect} from "./BasicDialect.js";
import {
    MODEL_4_BASIC_FIRST_PLAIN_CODE, MODEL_4_BASIC_FUNCTION_PREFIX, MODEL_4_BASIC_KEYWORDS, MODEL_4_BASIC_REMQUOT,
} from "./Model4BasicTokens.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {AbstractTrs80File} from "./Trs80File.js";

// There are two types of headers. Basic programs on cassette start with
// three D3 bytes followed by one name byte. Basic programs on floppy disk
// start with a single FF byte.
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

// Model 4 BASIC's tokens that a program needs to treat specially. The rest are in Model4BasicTokens.ts.
const MODEL_4_REM = 0x8F;
const MODEL_4_DATA = 0x84;
const MODEL_4_ELSE = 0xA2;
const MODEL_4_PRINT = 0x91;

// Model 4 BASIC follows every WHILE with a hidden "+" token (an operator that does nothing before the
// expression), which listings leave out.
const MODEL_4_WHILE = 0xB4;
const MODEL_4_PLUS = 0xF3;

// The Model 4 tokens that a line number can follow, which the tokenizer then stores as a line-number
// constant (see below). A number after GOTO or GOSUB can be the first of a comma-separated list, as in ON...GOTO.
const MODEL_4_GOTO = 0x89;
const MODEL_4_GOSUB = 0x8D;
const MODEL_4_THEN = 0xD0;
const MODEL_4_RESTORE = 0x8C;
const MODEL_4_RESUME = 0xA9;
const MODEL_4_RUN = 0x8A;
const MODEL_4_LIST = 0x93;
const MODEL_4_LLIST = 0x9E;
const MODEL_4_DELETE = 0xAA;
const MODEL_4_EDIT = 0xA7;
const MODEL_4_AUTO = 0xAB;
const MODEL_4_RENUM = 0xAC;
// ERL is followed by a comparison and then the line number: IF ERL=100.
const MODEL_4_ERL = 0xD7;
const MODEL_4_RELATIONAL_OPERATORS = [0xF0, 0xF1, 0xF2];
const MAX_LINE_NUMBER = 65529;

// Model 4 BASIC stores most numbers in a program as a prefix byte and the value, as GW-BASIC does. See
// BASIC_FORMATS.md.
const MODEL_4_OCTAL_CONSTANT = 0x0B; // Two bytes.
const MODEL_4_HEX_CONSTANT = 0x0C; // Two bytes.
const MODEL_4_LINE_NUMBER = 0x0E; // Two bytes, unsigned.
const MODEL_4_BYTE_CONSTANT = 0x0F; // One byte, 10 to 255.
const MODEL_4_FIRST_DIGIT_CONSTANT = 0x11; // 0x11 is 0, up to 0x1A for 9.
const MODEL_4_LAST_DIGIT_CONSTANT = 0x1A;
const MODEL_4_INTEGER_CONSTANT = 0x1C; // Two bytes, signed.
const MODEL_4_SINGLE_CONSTANT = 0x1D; // Four bytes.
const MODEL_4_DOUBLE_CONSTANT = 0x1F; // Eight bytes.

/**
 * What a dialect of Basic does differently from the others, apart from the names of its tokens.
 */
interface BasicDialectSpec {
    /** The token for REM. */
    readonly remToken: number;
    /** The token for DATA. */
    readonly dataToken: number;
    /** The token for ELSE. */
    readonly elseToken: number;
    /** The token that follows ":" and REM to make an apostrophe comment. */
    readonly remQuoteToken: number;
    /**
     * Whether a colon goes before every ELSE that the tokenizer stores, even one that already has a colon in the
     * text. (If not, only an ELSE with no colon before it gets one.)
     */
    readonly colonBeforeEveryElse: boolean;
}

/**
 * Get the special tokens of a dialect.
 */
function getDialectSpec(dialect: BasicDialect): BasicDialectSpec {
    switch (dialect) {
        case BasicDialect.MODEL_III:
            return {remToken: REM, dataToken: DATA, elseToken: ELSE, remQuoteToken: REMQUOT, colonBeforeEveryElse: false};
        case BasicDialect.MODEL_4:
            return {
                remToken: MODEL_4_REM,
                dataToken: MODEL_4_DATA,
                elseToken: MODEL_4_ELSE,
                remQuoteToken: MODEL_4_BASIC_REMQUOT,
                colonBeforeEveryElse: true,
            };
        default:
            assertNever(dialect);
    }
}

// The length of Model 4 BASIC's longest keyword, to know how much of a line to compare.
const MODEL_4_LONGEST_KEYWORD = Math.max(...MODEL_4_BASIC_KEYWORDS.map(keyword => keyword.name.length));

// Model 4 token names by byte, for plain tokens, and by function code (the byte after the 0xFF prefix,
// minus 0x80) for functions. Where two spellings share a code, the first in the table is the one we show.
const MODEL_4_PLAIN_TOKEN_NAMES = new Map<number, string>();
const MODEL_4_FUNCTION_TOKEN_NAMES = new Map<number, string>();
for (const keyword of MODEL_4_BASIC_KEYWORDS) {
    const names = keyword.code >= MODEL_4_BASIC_FIRST_PLAIN_CODE ? MODEL_4_PLAIN_TOKEN_NAMES :
        MODEL_4_FUNCTION_TOKEN_NAMES;
    if (!names.has(keyword.code)) {
        names.set(keyword.code, keyword.name);
    }
}

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
 * not map to a token. For Model 4 BASIC this only knows the one-byte tokens (see
 * {@link decodeModel4Token} for the others).
 *
 * @param c the byte.
 * @param dialect the Basic that the byte is from.
 */
export function getToken(c: number, dialect: BasicDialect = BasicDialect.MODEL_III): string | undefined {
    switch (dialect) {
        case BasicDialect.MODEL_III:
            return c >= FIRST_TOKEN && c < FIRST_TOKEN + TOKENS.length ? TOKENS[c - FIRST_TOKEN] : undefined;
        case BasicDialect.MODEL_4:
            return MODEL_4_PLAIN_TOKEN_NAMES.get(c);
        default:
            assertNever(dialect);
    }
}

/**
 * A token or constant that Model 4 BASIC stored in a program.
 */
interface DecodedToken {
    /** What to show for it in a listing. */
    text: string;

    /** How many bytes it takes in the program, including the first. */
    length: number;

    /** Whether it's a keyword or operator (as opposed to a number). */
    isKeyword: boolean;
}

/**
 * Show a floating-point number the way Model 4 BASIC lists one in a program: rounded to the number of
 * significant digits that the precision shows (6 for single, 16 for double), with no leading zero on a fraction, and
 * with an exponent (the letter "E" for single precision and "D" for double) when the number is too big (a
 * whole part of more digits than that) or too small (more than a few decimal places). Otherwise a double has a
 * "#" after it, and a single that's a whole number has a "!", so that they read back as the same kind of
 * number.
 *
 * @param value the number.
 * @param isDouble whether it's double precision.
 */
function formatModel4Float(value: number, isDouble: boolean): string {
    const digits = isDouble ? 16 : 6;
    // How many places after the decimal point a small number can take before BASIC uses an exponent.
    const maxPlaces = isDouble ? 16 : 7;
    const fixedSuffix = isDouble ? "#" : "!";
    const exponentLetter = isDouble ? "D" : "E";

    const sign = value < 0 ? "-" : "";
    if (value === 0) {
        return "0" + fixedSuffix;
    }

    // Split into the significant digits and a power of ten, such as "1.23457e+3".
    const parts = Math.abs(value).toExponential(digits - 1).split("e");
    const power = parseInt(parts[1], 10);
    const mantissaDigits = parts[0].replace(".", "").replace(/0+$/, "");

    const places = power < 0 ? -power - 1 + mantissaDigits.length : 0;
    if (power >= digits || places > maxPlaces) {
        const fraction = mantissaDigits.length > 1 ? "." + mantissaDigits.substring(1) : "";
        const exponent = (power < 0 ? "-" : "+") + Math.abs(power).toString().padStart(2, "0");
        return sign + mantissaDigits[0] + fraction + exponentLetter + exponent;
    }

    if (power < 0) {
        return sign + "." + "0".repeat(-power - 1) + mantissaDigits + (isDouble ? "#" : "");
    }

    if (mantissaDigits.length <= power + 1) {
        return sign + mantissaDigits.padEnd(power + 1, "0") + fixedSuffix;
    }

    return sign + mantissaDigits.substring(0, power + 1) + "." + mantissaDigits.substring(power + 1) +
        (isDouble ? "#" : "");
}

/**
 * Decode one of Model 4 BASIC's single-precision constants, which are in Microsoft's binary format: three
 * mantissa bytes, low first, with the sign in the top bit of the last, then the exponent.
 *
 * @param bytes the four bytes.
 * @return the value.
 */
function decodeModel4Single(bytes: number[]): number {
    const exponent = bytes[3];
    if (exponent === 0) {
        return 0;
    }

    // The leading 1 of the mantissa isn't stored, and the sign takes its place.
    const mantissa = ((bytes[2] & 0x7F) | 0x80) * 65536 + bytes[1] * 256 + bytes[0];
    const magnitude = mantissa / 0x1000000 * Math.pow(2, exponent - 128);
    return (bytes[2] & 0x80) !== 0 ? -magnitude : magnitude;
}

/**
 * Decode one of Model 4 BASIC's double-precision constants, the same format as {@link decodeModel4Single}
 * but with seven mantissa bytes.
 *
 * @param bytes the eight bytes.
 * @return the value, rounded to what a JavaScript number can hold.
 */
function decodeModel4Double(bytes: number[]): number {
    const exponent = bytes[7];
    if (exponent === 0) {
        return 0;
    }

    // Numbers are exact up to 2^53, and the low bits that we lose are below what a double can show anyway.
    let mantissa = (bytes[6] & 0x7F) | 0x80;
    for (let i = 5; i >= 0; i--) {
        mantissa = mantissa * 256 + bytes[i];
    }
    const magnitude = mantissa / Math.pow(2, 56) * Math.pow(2, exponent - 128);
    return (bytes[6] & 0x80) !== 0 ? -magnitude : magnitude;
}

/**
 * Split a positive number into a mantissa in [0.5, 1) and a power of two, so that it's mantissa * 2^exponent.
 */
function splitModel4Float(magnitude: number): {mantissa: number, exponent: number} {
    let exponent = Math.floor(Math.log2(magnitude)) + 1;
    let mantissa = magnitude / Math.pow(2, exponent);
    // The logarithm can be off by one at the edges.
    while (mantissa >= 1) {
        mantissa /= 2;
        exponent++;
    }
    while (mantissa < 0.5) {
        mantissa *= 2;
        exponent--;
    }
    return {mantissa, exponent};
}

/**
 * Encode a number as one of Model 4 BASIC's single-precision constants (the opposite of
 * {@link decodeModel4Single}), rounded to the nearest value that it can hold.
 *
 * @param value the number.
 * @return the four bytes, or undefined if the number is too big or too small for single precision.
 */
function encodeModel4Single(value: number): number[] | undefined {
    if (value === 0) {
        return [0, 0, 0, 0];
    }

    const {mantissa, exponent} = splitModel4Float(Math.abs(value));
    let bits = Math.round(mantissa * 0x1000000);
    let power = exponent;
    if (bits >= 0x1000000) {
        bits /= 2;
        power++;
    }
    const biasedExponent = power + 128;
    if (biasedExponent < 1 || biasedExponent > 255) {
        return undefined;
    }

    const sign = value < 0 ? 0x80 : 0;
    return [bits & 0xFF, (bits >> 8) & 0xFF, ((bits >> 16) & 0x7F) | sign, biasedExponent];
}

/**
 * Encode a number as one of Model 4 BASIC's double-precision constants (the opposite of
 * {@link decodeModel4Double}). A JavaScript number has 53 bits of mantissa to the 56 of BASIC's, so the
 * lowest three bits are zero.
 *
 * @param value the number.
 * @return the eight bytes, or undefined if the number is too big or too small for the format.
 */
function encodeModel4Double(value: number): number[] | undefined {
    if (value === 0) {
        return [0, 0, 0, 0, 0, 0, 0, 0];
    }

    const {mantissa, exponent} = splitModel4Float(Math.abs(value));
    let bits = Math.round(mantissa * Math.pow(2, 53)) * 8;
    let power = exponent;
    if (bits >= Math.pow(2, 56)) {
        bits /= 2;
        power++;
    }
    const biasedExponent = power + 128;
    if (biasedExponent < 1 || biasedExponent > 255) {
        return undefined;
    }

    const bytes: number[] = [];
    for (let i = 0; i < 7; i++) {
        bytes.push(bits % 256);
        bits = Math.floor(bits / 256);
    }
    if (value < 0) {
        bytes[6] |= 0x80;
    } else {
        bytes[6] &= 0x7F;
    }
    bytes.push(biasedExponent);
    return bytes;
}

/**
 * Encode a whole number from 0 to 32767 as one of Model 4 BASIC's integer constants: one byte for a digit, two
 * for 10 to 255, three for the rest.
 */
function encodeModel4Integer(value: number): number[] {
    if (value < 10) {
        return [MODEL_4_FIRST_DIGIT_CONSTANT + value];
    } else if (value < 256) {
        return [MODEL_4_BYTE_CONSTANT, value];
    } else {
        return [MODEL_4_INTEGER_CONSTANT, lo(value), hi(value)];
    }
}

/**
 * Decode the Model 4 BASIC token or constant that starts with a byte, whose following bytes (if any)
 * are the next ones to be read. Doesn't consume anything.
 *
 * @param b the program, positioned just after the first byte.
 * @param c the first byte.
 * @return the token, or undefined if the byte isn't the start of one (or the program ends in the middle
 * of it).
 */
function decodeModel4Token(b: ByteReader, c: number): DecodedToken | undefined {
    // The bytes after the first, or undefined if there aren't that many.
    const following = (count: number): number[] | undefined => {
        const bytes: number[] = [];
        for (let i = 0; i < count; i++) {
            const next = b.peek(i);
            if (next === EOF) {
                return undefined;
            }
            bytes.push(next);
        }
        return bytes;
    };

    if (c === MODEL_4_BASIC_FUNCTION_PREFIX) {
        const next = b.peek(0);
        const name = next >= MODEL_4_BASIC_FIRST_PLAIN_CODE ?
            MODEL_4_FUNCTION_TOKEN_NAMES.get(next - MODEL_4_BASIC_FIRST_PLAIN_CODE) : undefined;
        return name === undefined ? undefined : {text: name, length: 2, isKeyword: true};
    }

    const name = MODEL_4_PLAIN_TOKEN_NAMES.get(c);
    if (name !== undefined) {
        // The hidden operator after WHILE is part of it.
        const length = c === MODEL_4_WHILE && b.peek(0) === MODEL_4_PLUS ? 2 : 1;
        return {text: name, length, isKeyword: true};
    }

    if (c >= MODEL_4_FIRST_DIGIT_CONSTANT && c <= MODEL_4_LAST_DIGIT_CONSTANT) {
        return {text: (c - MODEL_4_FIRST_DIGIT_CONSTANT).toString(), length: 1, isKeyword: false};
    }

    let bytes: number[] | undefined;
    switch (c) {
        case MODEL_4_OCTAL_CONSTANT:
            bytes = following(2);
            return bytes === undefined ? undefined :
                {text: "&O" + (bytes[0] + bytes[1] * 256).toString(8), length: 3, isKeyword: false};

        case MODEL_4_HEX_CONSTANT:
            bytes = following(2);
            return bytes === undefined ? undefined :
                {text: "&H" + (bytes[0] + bytes[1] * 256).toString(16).toUpperCase(), length: 3, isKeyword: false};

        case MODEL_4_LINE_NUMBER:
            bytes = following(2);
            return bytes === undefined ? undefined :
                {text: (bytes[0] + bytes[1] * 256).toString(), length: 3, isKeyword: false};

        case MODEL_4_BYTE_CONSTANT:
            bytes = following(1);
            return bytes === undefined ? undefined : {text: bytes[0].toString(), length: 2, isKeyword: false};

        case MODEL_4_INTEGER_CONSTANT: {
            bytes = following(2);
            if (bytes === undefined) {
                return undefined;
            }
            const value = bytes[0] + bytes[1] * 256;
            return {text: (value >= 0x8000 ? value - 0x10000 : value).toString(), length: 3, isKeyword: false};
        }

        case MODEL_4_SINGLE_CONSTANT:
            bytes = following(4);
            return bytes === undefined ? undefined :
                {text: formatModel4Float(decodeModel4Single(bytes), false), length: 5, isKeyword: false};

        case MODEL_4_DOUBLE_CONSTANT:
            bytes = following(8);
            return bytes === undefined ? undefined :
                {text: formatModel4Float(decodeModel4Double(bytes), true), length: 9, isKeyword: false};

        default:
            return undefined;
    }
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

    /**
     * Get the element's text so that it will display properly in "Another Man's Treasure" font.
     *
     * https://www.kreativekorp.com/software/fonts/trs80.shtml
     */
    public asAnotherMansTreasure(): string {
        if (this.elementType === ElementType.STRING) {
            const parts: string[] = [];

            // Convert non-ASCII to the right value for our font.
            for (const ch of this.text) {
                let c = ch.charCodeAt(0);
                if (c < 32 || c >= 127) {
                    c += 0xE000;
                }
                parts.push(String.fromCodePoint(c));
            }

            return parts.join("");
        } else {
            return this.text;
        }
    }

    /**
     * Get the element's text so that it will display properly in ASCII.
     */
    public asAscii(): string {
        if (this.elementType === ElementType.STRING) {
            const parts: string[] = [];

            for (const ch of this.text) {
                const c = ch.charCodeAt(0);

                if (ch === "\r") {
                    parts.push("\\r");
                } else if (c >= 32 && c < 128 && ch !== "\\") {
                    parts.push(ch);
                } else {
                    parts.push("\\" + toOctal(c));
                }
            }

            return parts.join("");
        } else {
            return this.text;
        }
    }
}

/**
 * Class representing a Basic program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class BasicProgram extends AbstractTrs80File {
    public readonly className = "BasicProgram";
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

    /**
     * Generate a plain ASCII version of the Basic program.
     */
    public asAscii(): string {
        const parts: string[] = [];

        for (const basicElement of this.elements) {
            if (parts.length > 0 && basicElement.elementType === ElementType.LINE_NUMBER) {
                parts.push("\n");
            }

            parts.push(basicElement.text);
        }

        parts.push("\n");

        return parts.join("");
    }

    /**
     * Get a version of the binary that's appropriate for cassette. This will
     * have the D3 header instead of the FF header.
     */
    public asCassetteBinary(): Uint8Array {
        if (this.binary.length >= 4 &&
            this.binary[0] === BASIC_TAPE_HEADER_BYTE &&
            this.binary[1] === BASIC_TAPE_HEADER_BYTE &&
            this.binary[2] === BASIC_TAPE_HEADER_BYTE) {

            // Already in cassette format.
            return this.binary;
        }

        if (this.binary.length >= 1 &&
            this.binary[0] === BASIC_HEADER_BYTE) {

            // In floppy format. Convert to cassette format.
            return concatByteArrays([
                new Uint8Array([
                    BASIC_TAPE_HEADER_BYTE,
                    BASIC_TAPE_HEADER_BYTE,
                    BASIC_TAPE_HEADER_BYTE,
                    0x65]),
                this.binary.slice(1)]);
        }

        // Unknown format. Return as-is.
        return this.binary;
    }
}

/**
 * Set the one-letter Basic name in the binary to the first letter of the name.
 *
 * @return a new array with the modified name.
 */
export function setBasicName(bytes: Uint8Array, name: string): Uint8Array {
    if (name === "") {
        // Pick anything.
        name = "A";
    }

    // Make a copy for modifying.
    const newName = new Uint8Array(bytes);

    if (newName[0] === BASIC_TAPE_HEADER_BYTE &&
        newName[1] === BASIC_TAPE_HEADER_BYTE &&
        newName[2] === BASIC_TAPE_HEADER_BYTE &&
        newName.length > 3) {

        newName[3] = name.charCodeAt(0);
    } else if (newName[0] === BASIC_HEADER_BYTE &&
        newName.length > 1) {

        // This type of header does not have a name byte.
    }

    return newName;
}

/**
 * Decode the token or constant that starts with a byte, for the dialect.
 *
 * @param b the program, positioned just after the byte. Not advanced.
 * @param c the byte.
 * @param dialect the Basic that tokenized the program.
 * @return the token, or undefined if the byte is just a character.
 */
function decodeToken(b: ByteReader, c: number, dialect: BasicDialect): DecodedToken | undefined {
    switch (dialect) {
        case BasicDialect.MODEL_III: {
            const name = getToken(c, dialect);
            return name === undefined ? undefined : {text: name, length: 1, isKeyword: true};
        }

        case BasicDialect.MODEL_4:
            return decodeModel4Token(b, c);

        default:
            assertNever(dialect);
    }
}

/**
 * Decode a tokenized Basic program.
 * @param binary tokenized program. May be in tape format (D3 D3 D3 followed by a one-letter program
 * name) or not (FF).
 * @param dialect the Basic that tokenized the program. The header can't say.
 * @return the Basic program, or undefined if the header did not indicate that this was a Basic program.
 */
export function decodeBasicProgram(binary: Uint8Array, dialect: BasicDialect = BasicDialect.MODEL_III):
    BasicProgram | undefined {

    const spec = getDialectSpec(dialect);
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
                if (b.peek(0) === spec.elseToken) {
                    // :ELSE gets translated to just ELSE, probably because an old version
                    // of Basic only supported ELSE after a colon.
                    b.read(); // ELSE
                    elements.push(new BasicElement(colonAddr, "ELSE", ElementType.KEYWORD, b.addr() - colonAddr));
                } else if (b.peek(0) === spec.remToken && b.peek(1) === spec.remQuoteToken) {
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
                        const token = decodeToken(b, c, dialect);
                        if (token !== undefined) {
                            // Skip what follows the first byte.
                            const tokenAddr = b.addr() - 1;
                            for (let i = 1; i < token.length; i++) {
                                b.read();
                            }
                            elements.push(new BasicElement(tokenAddr, token.text,
                                !token.isKeyword ? ElementType.REGULAR
                                    : c === spec.dataToken || c === spec.remToken ? ElementType.COMMENT
                                    : token.text.length === 1 ? ElementType.PUNCTUATION
                                    : ElementType.KEYWORD,
                                token.length));
                        } else {
                            elements.push(new BasicElement(b.addr() - 1,
                                ch, ch === '"' ? ElementType.STRING : ElementType.REGULAR));
                        }
                        if (c === spec.remToken) {
                            state = ParserState.REM;
                        } else if (c === spec.dataToken) {
                            state = ParserState.DATA;
                        } else if (ch === '"') {
                            preStringState = state;
                            state = ParserState.STRING;
                        }
                        break;

                    case ParserState.STRING:
                        // Put the real value in the string. Code displaying can use the methods of
                        // BasicElement to convert it before printing.
                        elements.push(new BasicElement(b.addr() - 1, ch, ElementType.STRING));
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
 * Count the bytes of a decoded program's code (outside strings, comments and DATA) that are not any token
 * of the dialect it was decoded for. A program decoded for the wrong dialect usually has some: the
 * dialects give different meanings to the bytes from 0x80 up.
 */
function countUnknownTokens(program: BasicProgram): number {
    let count = 0;
    for (const element of program.elements) {
        if (element.elementType === ElementType.REGULAR && element.text.length === 1 &&
            element.text.charCodeAt(0) >= FIRST_TOKEN) {

            count++;
        }
    }
    return count;
}

/**
 * Work out which Basic a tokenized program is for, when its bytes say. The program is decoded for each
 * dialect, and a dialect is possible if the decoding has no error and no byte that isn't one of its tokens.
 * Many programs fit both (a short one that uses only the tokens that the dialects share) or neither (one for
 * a Basic with extra keywords), and then the bytes don't say.
 *
 * @param binary the tokenized program.
 * @return the one dialect that fits, or undefined if none or several do, or the bytes aren't a program.
 */
export function guessBasicDialect(binary: Uint8Array): BasicDialect | undefined {
    // Every dialect, which a new one must be added to.
    const dialects = [BasicDialect.MODEL_III, BasicDialect.MODEL_4];

    const possible: BasicDialect[] = [];
    for (const dialect of dialects) {
        const program = decodeBasicProgram(binary, dialect);
        if (program !== undefined && program.error === undefined && countUnknownTokens(program) === 0) {
            possible.push(dialect);
        }
    }

    return possible.length === 1 ? possible[0] : undefined;
}

/**
 * Whether the tokenizer expects a line number next. Model 4 BASIC stores the line numbers that statements refer to as
 * a constant of three bytes (see decodeModel4Token()), and its interpreter doesn't accept them as text.
 */
enum LineNumberMode {
    /** Not expecting one. */
    NONE,
    /** After GOTO, THEN and the like: one line number, if a number follows. */
    LINE,
    /** After GOTO and GOSUB: a line number, and more of them after commas (as in ON X GOTO 10,20,30). */
    LIST,
    /** After ERL: a comparison and then a line number. */
    ERL,
}

/**
 * The keyword at a position in a line of Basic text.
 */
interface KeywordMatch {
    /** The bytes that the keyword is stored as in a program. */
    bytes: number[];

    /** How many characters of the text the keyword takes. */
    length: number;
}

/**
 * Parser for a single line of Basic code.
 */
class BasicParser {
    private readonly line: string;
    private readonly spec: BasicDialectSpec;
    private readonly dialect: BasicDialect;
    private readonly result: number[] = [];
    public lineNumber: number | undefined = undefined;
    private pos = 0;
    // What the line number constants of Model 4 BASIC need to know about the tokens just before.
    private lineNumberMode = LineNumberMode.NONE;
    // Whether the last character was part of a variable name, so that digits after it are part of the name.
    private inName = false;

    /**
     * @param line the line of Basic text, with its line number.
     * @param dialect the Basic to tokenize it for.
     */
    constructor(line: string, dialect: BasicDialect) {
        // Only trim the start, spaces at the end should be kept.
        this.line = line.trimStart();
        this.dialect = dialect;
        this.spec = getDialectSpec(dialect);
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

            // Model 4 BASIC wants the line numbers that follow GOTO and the like as constants.
            if (this.lineNumberMode !== LineNumberMode.NONE) {
                const mode = this.lineNumberMode;
                const isComparison = ch === 0x3C || ch === 0x3E || ch === 0x3D;
                if (mode === LineNumberMode.ERL && (BasicParser.isWhitespace(ch) || isComparison)) {
                    // Keep waiting for the number: copy the space, or let the comparison become a token.
                    if (!isComparison) {
                        this.result.push(ch);
                        this.pos++;
                        continue;
                    }
                } else {
                    this.lineNumberMode = LineNumberMode.NONE;
                    const wasNumber = this.pushLineNumbers(mode === LineNumberMode.LIST);
                    if (wasNumber) {
                        continue;
                    }
                }
            }

            // Handle single-quote comment.
            if (ch === SINGLE_QUOTE) {
                // Single quote is the start of a comment, but it's encoded in a backward-compatible
                // way with several tokens.
                this.result.push(COLON, this.spec.remToken, this.spec.remQuoteToken);
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
                const keyword = this.readToken();
                if (keyword === undefined) {
                    // Model 4 BASIC stores numbers (not in names) as constants, not text.
                    const startsNumber = BasicParser.isDigit(ch) || ch === 0x2E || ch === 0x26;
                    if (this.dialect === BasicDialect.MODEL_4 && startsNumber && !this.inName && this.pushNumber()) {
                        this.inName = false;
                        continue;
                    }

                    // Just a regular letter.
                    this.result.push(ch);
                    this.pos++;
                    this.inName = BasicParser.isLetter(ch) || (this.inName && BasicParser.isDigit(ch));
                } else {
                    this.inName = false;
                    const token = keyword.bytes[0];

                    // Prefix ELSE with colon for backward compatibility.
                    if (token === this.spec.elseToken &&
                        (this.spec.colonBeforeEveryElse || this.result[this.result.length - 1] !== COLON)) {

                        this.result.push(COLON);
                    }

                    this.result.push(...keyword.bytes);
                    this.pos += keyword.length;
                    if (this.dialect === BasicDialect.MODEL_4 && token === MODEL_4_WHILE) {
                        this.result.push(MODEL_4_PLUS);
                    }
                    // The comparison after ERL doesn't end the wait for the line number.
                    const keepWaiting = this.lineNumberMode === LineNumberMode.ERL &&
                        MODEL_4_RELATIONAL_OPERATORS.includes(token);
                    if (!keepWaiting) {
                        this.lineNumberMode = this.lineNumberModeAfter(token);
                    }

                    if (token === this.spec.remToken) {
                        // We're done, copy the rest of the line.
                        break;
                    }

                    if (token === this.spec.dataToken) {
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
     * What a line number can do after a token, for the dialect.
     *
     * @param token the first byte of the token that was just stored.
     */
    private lineNumberModeAfter(token: number): LineNumberMode {
        switch (this.dialect) {
            case BasicDialect.MODEL_III:
                // This Basic reads its line numbers as text.
                return LineNumberMode.NONE;

            case BasicDialect.MODEL_4:
                switch (token) {
                    case MODEL_4_GOTO:
                    case MODEL_4_GOSUB:
                        return LineNumberMode.LIST;
                    case MODEL_4_THEN:
                    case MODEL_4_ELSE:
                    case MODEL_4_RESTORE:
                    case MODEL_4_RESUME:
                    case MODEL_4_RUN:
                    case MODEL_4_LIST:
                    case MODEL_4_LLIST:
                    case MODEL_4_DELETE:
                    case MODEL_4_EDIT:
                    case MODEL_4_AUTO:
                    case MODEL_4_RENUM:
                        return LineNumberMode.LINE;
                    case MODEL_4_ERL:
                        return LineNumberMode.ERL;
                    default:
                        return LineNumberMode.NONE;
                }

            default:
                assertNever(this.dialect);
        }
    }

    /**
     * If a line number comes next (after any spaces), copy it, as a Model 4 line-number constant, and advance
     * past it. If the line number can be the start of a list, do the same for each number after a comma.
     *
     * @param isList whether a comma continues the list.
     * @return whether there was a number. If not, nothing was copied.
     */
    private pushLineNumbers(isList: boolean): boolean {
        let wasNumber = false;

        while (true) {
            let numberPos = this.pos;
            while (numberPos < this.line.length && BasicParser.isWhitespace(this.line.charCodeAt(numberPos))) {
                numberPos++;
            }
            if (numberPos >= this.line.length || !BasicParser.isDigit(this.line.charCodeAt(numberPos))) {
                return wasNumber;
            }

            // Copy the spaces, then the number.
            while (this.pos < numberPos) {
                this.result.push(this.line.charCodeAt(this.pos++));
            }
            const digitsPos = this.pos;
            const lineNumber = this.readNumber() as number;
            if (lineNumber > MAX_LINE_NUMBER) {
                // Not a line number that BASIC could find; leave it as text for it to complain about.
                for (let i = digitsPos; i < this.pos; i++) {
                    this.result.push(this.line.charCodeAt(i));
                }
            } else {
                this.result.push(MODEL_4_LINE_NUMBER, lo(lineNumber), hi(lineNumber));
            }
            wasNumber = true;

            if (!isList) {
                return true;
            }

            // Continue after a comma, copying it and any spaces around it.
            let commaPos = this.pos;
            while (commaPos < this.line.length && BasicParser.isWhitespace(this.line.charCodeAt(commaPos))) {
                commaPos++;
            }
            if (commaPos >= this.line.length || this.line.charAt(commaPos) !== ",") {
                return true;
            }
            while (this.pos <= commaPos) {
                this.result.push(this.line.charCodeAt(this.pos++));
            }
        }
    }

    /**
     * If we're at a keyword, return it, else return undefined. Does not advance past the keyword. The first
     * keyword in the dialect's table that matches wins.
     */
    private readToken(): KeywordMatch | undefined {
        switch (this.dialect) {
            case BasicDialect.MODEL_III:
                for (let i = 0; i < TOKENS.length; i++) {
                    const token = TOKENS[i];
                    if (token === this.line.substr(this.pos, token.length).toUpperCase()) {
                        return {bytes: [FIRST_TOKEN + i], length: token.length};
                    }
                }
                return undefined;

            case BasicDialect.MODEL_4: {
                // A question mark is a shortcut for PRINT.
                if (this.line.charAt(this.pos) === "?") {
                    return {bytes: [MODEL_4_PRINT], length: 1};
                }
                const upperRest = this.line.substring(this.pos, this.pos + MODEL_4_LONGEST_KEYWORD).toUpperCase();
                for (const keyword of MODEL_4_BASIC_KEYWORDS) {
                    if (upperRest.startsWith(keyword.name)) {
                        const bytes = keyword.code >= MODEL_4_BASIC_FIRST_PLAIN_CODE ? [keyword.code] :
                            [MODEL_4_BASIC_FUNCTION_PREFIX, keyword.code + MODEL_4_BASIC_FIRST_PLAIN_CODE];
                        return {bytes, length: keyword.name.length};
                    }
                }
                return undefined;
            }

            default:
                assertNever(this.dialect);
        }
    }

    /**
     * If a number starts here (digits, a decimal point, &H or &O), copy it as one of Model 4 BASIC's constants and
     * advance past it. A number that has no such constant (such as one that's too big) is left as text for BASIC to
     * deal with.
     *
     * BASIC picks the kind of constant like this: a whole number from 0 to 32767 (with no exponent or type
     * character) is an integer, one with an E exponent or a ! is single precision, one with a D exponent or a # is
     * double precision, and any other number is single if it has no more than six digits, and double if it has more.
     *
     * @return whether a constant was copied. If not, nothing was.
     */
    private pushNumber(): boolean {
        const rest = this.line.substring(this.pos);

        // &H and &O take any number of digits (none is zero), and a bare & takes octal digits.
        const radixMatch = /^&(?:([H])([0-9A-F]*)|([O]?)([0-7]*))/i.exec(rest);
        if (rest.charAt(0) === "&") {
            if (radixMatch === null) {
                return false;
            }
            const isHex = radixMatch[1] !== undefined;
            const digits = isHex ? radixMatch[2] : radixMatch[4];
            const hasPrefix = isHex || radixMatch[3] !== "";
            if (digits === "" && !hasPrefix) {
                // Just an ampersand.
                return false;
            }
            const value = digits === "" ? 0 : parseInt(digits, isHex ? 16 : 8);
            if (value > 0xFFFF) {
                return false;
            }
            this.result.push(isHex ? MODEL_4_HEX_CONSTANT : MODEL_4_OCTAL_CONSTANT, lo(value), hi(value));
            this.pos += radixMatch[0].length;
            return true;
        }

        const match = /^(\d*)(?:\.(\d*))?(?:([ED])([+-]?\d+))?([!#%]?)/i.exec(rest);
        if (match === null) {
            return false;
        }
        const wholeDigits = match[1];
        const hasPoint = match[2] !== undefined;
        const fractionDigits = match[2] ?? "";
        if (wholeDigits === "" && fractionDigits === "") {
            // Nothing but a point or an exponent.
            return false;
        }
        const exponentLetter = match[3]?.toUpperCase();
        const typeCharacter = match[5];

        const text = wholeDigits + (hasPoint ? "." + fractionDigits : "") +
            (exponentLetter === undefined ? "" : "E" + match[4]);
        const value = Number(text === "." ? "0" : text);
        const significantDigits = (wholeDigits + fractionDigits).replace(/^0+/, "").length;
        const isWholeNumber = !hasPoint && exponentLetter === undefined;

        let bytes: number[] | undefined;
        if (isWholeNumber && (typeCharacter === "" || typeCharacter === "%") && value <= 32767) {
            bytes = encodeModel4Integer(value);
        } else if (typeCharacter === "#" || exponentLetter === "D") {
            bytes = encodeModel4Double(value);
            if (bytes !== undefined) {
                bytes.unshift(MODEL_4_DOUBLE_CONSTANT);
            }
        } else if (typeCharacter === "!" || exponentLetter === "E" || significantDigits <= 6) {
            bytes = encodeModel4Single(value);
            if (bytes !== undefined) {
                bytes.unshift(MODEL_4_SINGLE_CONSTANT);
            }
        } else {
            bytes = encodeModel4Double(value);
            if (bytes !== undefined) {
                bytes.unshift(MODEL_4_DOUBLE_CONSTANT);
            }
        }
        if (bytes === undefined) {
            return false;
        }

        this.result.push(...bytes);
        // The type character is part of the constant, and BASIC drops a % that doesn't make an integer.
        this.pos += match[0].length;
        return true;
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
     * Whether the ASCII value is an upper-case or lower-case letter.
     */
    private static isLetter(ch: number): boolean {
        return (ch >= 0x41 && ch < 0x5B) || (ch >= 0x61 && ch < 0x7B);
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
 * @param text the program's text, as bytes or a string.
 * @param dialect the Basic to tokenize the program for.
 * @return the binary or an error.
 */
export function parseBasicText(text: string | Uint8Array, dialect: BasicDialect = BasicDialect.MODEL_III):
    Uint8Array | string {

    // Decode from binary if possible.
    if (text instanceof Uint8Array) {
        const decoder = new TextDecoder("utf-8", {
            // Throw an exception if there's a decoding error. This will help us catch
            // binaries that aren't actually text. Might cause problems for programs
            // that contain graphics characters in strings.
            fatal: true,
        });
        try {
            text = decoder.decode(text);
        } catch (e) {
            return "Binary cannot be decoded into text";
        }
    }

    // Split into lines. Only trim the start, spaces at the end should be kept.
    const lines = text.split(/[\n\r]+/)
        .map((line) => line.trimStart())
        .filter((line) => line !== "");

    const binaryParts: Uint8Array[] = [];

    binaryParts.push(new Uint8Array([BASIC_HEADER_BYTE]));

    // Parse each line.
    let lineNumber: number | undefined;
    for (const line of lines) {
        const parser = new BasicParser(line, dialect);
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
