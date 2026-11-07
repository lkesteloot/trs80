import {describe, expect, it} from "vitest";
import {BasicDialect, basicDialectToString, parseBasicDialect} from "./BasicDialect.js";
import {decodeBasicProgram, getToken, guessBasicDialect, parseBasicText} from "./Basic.js";
import {MODEL_4_BASIC_KEYWORDS} from "./Model4BasicTokens.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

/**
 * A short program that Model 4 BASIC tokenized and saved: a hex constant, a line-number constant, DATA, and a
 * few functions, as it was on the disk (ending with the zero pointer after line 100).
 */
const MODEL_4_PROGRAM_BYTES = new Uint8Array([
    0xFF, 0x5F, 0x80, 0x05, 0x00, 0x92, 0x2C, 0x0C, 0x01, 0xE0, 0x3A, 0xAE, 0x20, 0x44, 0xF4, 0x5A, 0x3A, 0x89,
    0x20, 0x0E, 0x64, 0x00, 0x00, 0x8A, 0x80, 0x0A, 0x00, 0x84, 0x20, 0x31, 0x37, 0x2C, 0x30, 0x30, 0x2C, 0x32,
    0x30, 0x2C, 0x31, 0x34, 0x2C, 0x31, 0x2C, 0x33, 0x33, 0x2C, 0x31, 0x2C, 0x32, 0x32, 0x34, 0x2C, 0x36, 0x32,
    0x2C, 0x38, 0x35, 0x2C, 0x32, 0x33, 0x39, 0x2C, 0x32, 0x30, 0x31, 0x00, 0xC2, 0x80, 0x1E, 0x00, 0x41, 0xF1,
    0xFF, 0x97, 0x28, 0xDD, 0x28, 0x41, 0x24, 0x29, 0xF3, 0x13, 0x29, 0xF5, 0x1C, 0x00, 0x01, 0xF3, 0xFF, 0x97,
    0x28, 0xDD, 0x28, 0x41, 0x24, 0x29, 0xF3, 0x12, 0x29, 0x3A, 0x98, 0x20, 0x41, 0xF3, 0x12, 0x2C, 0x53, 0x3A,
    0x98, 0x20, 0x41, 0xF3, 0x13, 0x2C, 0x54, 0x3A, 0xB6, 0x20, 0x41, 0x3A, 0x8E, 0x00, 0xE3, 0x80, 0x64, 0x00,
    0x82, 0x20, 0x58, 0xF1, 0x11, 0x20, 0xCF, 0x20, 0x0F, 0x0B, 0x3A, 0x87, 0x20, 0x41, 0x3A, 0x41, 0x24, 0xF1,
    0x41, 0x24, 0xF3, 0xFF, 0x96, 0x28, 0x41, 0x29, 0x3A, 0x83, 0x00, 0x00, 0x00,
]);

/**
 * What {@link MODEL_4_PROGRAM_BYTES} lists as.
 */
const MODEL_4_PROGRAM_TEXT =
    "5 CLEAR,&HE001:DEFINT D-Z:GOTO 100\n" +
    "10 DATA 17,00,20,14,1,33,1,224,62,85,239,201\n" +
    "30 A=PEEK(VARPTR(A$)+2)*256+PEEK(VARPTR(A$)+1):POKE A+1,S:POKE A+2,T:CALL A:RETURN\n" +
    "100 FOR X=0 TO 11:READ A:A$=A$+CHR$(A):NEXT\n";

/**
 * A tiny program that Model 4 BASIC tokenized and saved, with a PRINT @ and 2-byte integer constants.
 */
const MODEL_4_HELLO_BYTES = new Uint8Array([
    0xFF, 0x4F, 0x80, 0x0A, 0x00, 0x9F, 0x00, 0x65, 0x80, 0x14, 0x00, 0x91, 0x20, 0x40, 0x20, 0x1C, 0xA0, 0x02,
    0x2C, 0x20, 0x22, 0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x21, 0x22, 0x00, 0x00, 0x00,
]);

/**
 * Tokenize text for a dialect, expecting no error.
 */
function tokenize(text: string, dialect: BasicDialect): Uint8Array {
    const binary = parseBasicText(text, dialect);
    expect(typeof binary).to.not.equal("string");
    return binary as Uint8Array;
}

/**
 * The tokenized bytes of the one line of a program, without the 0xFF header, the next-line pointer, the line number,
 * or the end-of-program marker.
 */
function lineBody(binary: Uint8Array): number[] {
    // Header (1), pointer (2), line number (2), then the body ending in a nul, then the end marker (2).
    return Array.from(binary.slice(5, binary.length - 2));
}

/**
 * Decode a one-line Model 4 program (line 10) whose line is the given bytes, and list it.
 */
function listModel4Line(body: number[]): string {
    // Header, pointer, line number 10, the body, a nul, and the end marker.
    const binary = new Uint8Array([0xFF, 0xFF, 0xFF, 10, 0, ...body, 0, 0, 0]);
    const program = decodeBasicProgram(binary, BasicDialect.MODEL_4)!;
    expect(program.error).to.equal(undefined);
    return program.asAscii();
}

describe("BasicDialect", () => {
    it("names and parses dialects", () => {
        expect(basicDialectToString(BasicDialect.MODEL_III)).to.equal("Model III");
        expect(basicDialectToString(BasicDialect.MODEL_4)).to.equal("Model 4");
        expect(parseBasicDialect("3")).to.equal(BasicDialect.MODEL_III);
        expect(parseBasicDialect("Model4")).to.equal(BasicDialect.MODEL_4);
        expect(parseBasicDialect("5")).to.equal(undefined);
    });
});

describe("Model III Basic", () => {
    it("is the default", () => {
        const binary = parseBasicText("10 PRINT \"HI\"") as Uint8Array;
        expect(Array.from(binary)).to.eql([0xFF, 0xFF, 0xFF, 10, 0, 0xB2, 0x20, 0x22, 0x48, 0x49, 0x22, 0, 0, 0]);
        expect(decodeBasicProgram(binary)?.asAscii()).to.equal("10 PRINT \"HI\"\n");
        expect(getToken(0xB2)).to.equal("PRINT");
        expect(getToken(0xB2, BasicDialect.MODEL_III)).to.equal("PRINT");
    });

    it("round trips every token", () => {
        for (let c = 0x80; c <= 0xFA; c++) {
            const name = getToken(c)!;
            expect(name).to.not.equal(undefined);
            // REM, ELSE and "[" have their own rules (ELSE gets a colon, and "[" isn't tokenized as itself).
            if (name === "REM" || name === "ELSE" || name === "[") {
                continue;
            }
            const binary = tokenize("10 " + name, BasicDialect.MODEL_III);
            expect(decodeBasicProgram(binary)?.asAscii()).to.equal("10 " + name + "\n");
        }
    });
});

describe("Model 4 Basic", () => {
    it("decodes a program that Model 4 Basic saved", () => {
        const program = decodeBasicProgram(MODEL_4_PROGRAM_BYTES, BasicDialect.MODEL_4)!;
        expect(program.error).to.equal(undefined);
        expect(program.asAscii()).to.equal(MODEL_4_PROGRAM_TEXT);

        const hello = decodeBasicProgram(MODEL_4_HELLO_BYTES, BasicDialect.MODEL_4)!;
        expect(hello.error).to.equal(undefined);
        expect(hello.asAscii()).to.equal("10 CLS\n20 PRINT @ 672, \"HELLO!\"\n");
    });

    it("decodes with the wrong dialect without failing, but differently", () => {
        const program = decodeBasicProgram(MODEL_4_PROGRAM_BYTES, BasicDialect.MODEL_III)!;
        expect(program.asAscii()).to.not.equal(MODEL_4_PROGRAM_TEXT);
    });

    it("tokenizes keywords, functions, operators, and special forms", () => {
        const check = (text: string, expected: number[]) => {
            expect(lineBody(tokenize(text, BasicDialect.MODEL_4))).to.eql(expected);
        };

        // PRINT is plain; LEN( is a function, with the 0xFF prefix; = is 0xF1.
        check("10 PRINT", [0x91, 0]);
        check("10 A=LEN(B$)", [0x41, 0xF1, 0xFF, 0x92, 0x28, 0x42, 0x24, 0x29, 0]);
        // Lower case is converted outside strings.
        check("10 print \"a\"", [0x91, 0x20, 0x22, 0x61, 0x22, 0]);
        // ? is PRINT.
        check("10 ?1", [0x91, 0x12, 0]);
        // An apostrophe is :REM ' (0x3A 0x8F 0xDC), and the rest of the line is kept.
        check("10 X=1 ' GOTO", [0x58, 0xF1, 0x12, 0x20, 0x3A, 0x8F, 0xDC, 0x20, 0x47, 0x4F, 0x54, 0x4F, 0]);
        // ELSE gets a colon before it, even if the text has one.
        check("10 IF A THEN PRINT ELSE END", [0x8B, 0x20, 0x41, 0x20, 0xD0, 0x20, 0x91, 0x20, 0x3A, 0xA2, 0x20, 0x81, 0]);
        check("10 IF A THEN PRINT:ELSE END", [0x8B, 0x20, 0x41, 0x20, 0xD0, 0x20, 0x91, 0x3A, 0x3A, 0xA2, 0x20, 0x81, 0]);
        // WHILE gets a hidden + after it, which a listing leaves out.
        check("10 WHILE A<5", [0xB4, 0xF3, 0x20, 0x41, 0xF2, 0x16, 0]);
        // REM and DATA keep their text as it is.
        check("10 rem hello print", [0x8F, 0x20, 0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x70, 0x72, 0x69, 0x6E, 0x74, 0]);
        check("10 DATA a,print:PRINT", [0x84, 0x20, 0x61, 0x2C, 0x70, 0x72, 0x69, 0x6E, 0x74, 0x3A, 0x91, 0]);
        // The first match in BASIC's table wins: DEFSTR over DEF, INPUT over INP, GO TO as GOTO.
        check("10 DEFSTR", [0xAD, 0]);
        check("10 INPUT", [0x85, 0]);
        check("10 GO TO 5", [0x89, 0x20, 0x0E, 5, 0, 0]);
    });

    it("tokenizes the line numbers that statements refer to as 3-byte constants", () => {
        const check = (text: string, expected: number[]) => {
            expect(lineBody(tokenize(text, BasicDialect.MODEL_4))).to.eql(expected);
        };

        // GOTO, GOSUB, THEN and ELSE (which gets a colon), with no space, and line 0.
        check("10 GOTO100", [0x89, 0x0E, 100, 0, 0]);
        check("10 ON ERROR GOTO 0", [0x95, 0x20, 0xA8, 0x20, 0x89, 0x20, 0x0E, 0, 0, 0]);
        check("10 IF A THEN 20 ELSE 300", [0x8B, 0x20, 0x41, 0x20, 0xD0, 0x20, 0x0E, 20, 0, 0x20, 0x3A, 0xA2, 0x20,
            0x0E, 0x2C, 0x01, 0]);
        // A list after ON, with spaces around the commas, ending at the first thing that isn't one.
        check("10 ON A GOSUB 20 , 30,40:X=5", [0x95, 0x20, 0x41, 0x20, 0x8D, 0x20, 0x0E, 20, 0, 0x20, 0x2C, 0x20,
            0x0E, 30, 0, 0x2C, 0x0E, 40, 0, 0x3A, 0x58, 0xF1, 0x16, 0]);
        // Only GOTO and GOSUB take a list, and only one number follows THEN.
        check("10 IF A THEN 20,30", [0x8B, 0x20, 0x41, 0x20, 0xD0, 0x20, 0x0E, 20, 0, 0x2C, 0x0F, 30, 0]);
        // Not a number after it: nothing special.
        check("10 IF A THEN PRINT 5", [0x8B, 0x20, 0x41, 0x20, 0xD0, 0x20, 0x91, 0x20, 0x16, 0]);
        check("10 RESUME NEXT", [0xA9, 0x20, 0x83, 0]);
        check("10 RESTORE 50", [0x8C, 0x20, 0x0E, 50, 0, 0]);
        // ERL compared with a line number, which can be on either side of the spaces and comparison.
        check("10 IF ERL = 1000 THEN 5", [0x8B, 0x20, 0xD7, 0x20, 0xF1, 0x20, 0x0E, 0xE8, 0x03, 0x20, 0xD0, 0x20,
            0x0E, 5, 0, 0]);
        check("10 IF ERL<>7 THEN PRINT", [0x8B, 0x20, 0xD7, 0xF2, 0xF0, 0x0E, 7, 0, 0x20, 0xD0, 0x20, 0x91, 0]);
        // Other numbers are the other constants, and a line number that's too big stays as text.
        check("10 A=5:GOTO 65530", [0x41, 0xF1, 0x16, 0x3A, 0x89, 0x20, 0x36, 0x35, 0x35, 0x33, 0x30, 0]);
        // Inside a string or a comment it's text.
        check("10 PRINT \"GOTO 5\"", [0x91, 0x20, 0x22, 0x47, 0x4F, 0x54, 0x4F, 0x20, 0x35, 0x22, 0]);
    });

    it("tokenizes numbers as the constants that BASIC stores", () => {
        const check = (text: string, expected: number[]) => {
            expect(lineBody(tokenize(text, BasicDialect.MODEL_4))).to.eql(expected);
        };

        // Integers: a digit, a byte, two bytes, and a type character that is dropped.
        check("10 A=0:B=9:C=10:D=255:E=256:F=32767", [
            0x41, 0xF1, 0x11, 0x3A, 0x42, 0xF1, 0x1A, 0x3A, 0x43, 0xF1, 0x0F, 10, 0x3A, 0x44, 0xF1, 0x0F, 255, 0x3A,
            0x45, 0xF1, 0x1C, 0x00, 0x01, 0x3A, 0x46, 0xF1, 0x1C, 0xFF, 0x7F, 0]);
        check("10 A=5%", [0x41, 0xF1, 0x16, 0]);
        // Digits in a name are part of the name.
        check("10 A1=5:B2C=7", [0x41, 0x31, 0xF1, 0x16, 0x3A, 0x42, 0x32, 0x43, 0xF1, 0x18, 0]);
        // Single precision: too big for an integer, a fraction, a ! or an E exponent, and up to six digits.
        check("10 A=32768", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x00, 0x90, 0]);
        check("10 A=65536", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x00, 0x91, 0]);
        check("10 A=100000", [0x41, 0xF1, 0x1D, 0x00, 0x50, 0x43, 0x91, 0]);
        check("10 A=.5", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x00, 0x80, 0]);
        check("10 A=1.5", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x40, 0x81, 0]);
        check("10 A=1.5%", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x40, 0x81, 0]);
        check("10 A=5!", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x20, 0x83, 0]);
        check("10 A=5.", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x20, 0x83, 0]);
        check("10 A=0.5E0", [0x41, 0xF1, 0x1D, 0x00, 0x00, 0x00, 0x80, 0]);
        // Double precision: a D exponent, a #, or more than six digits.
        const oneAndAHalf = [0x1F, 0, 0, 0, 0, 0, 0, 0x40, 0x81];
        check("10 A=1.5D0", [0x41, 0xF1, ...oneAndAHalf, 0]);
        check("10 A=1.5#", [0x41, 0xF1, ...oneAndAHalf, 0]);
        check("10 A=1.500000", [0x41, 0xF1, ...oneAndAHalf, 0]);
        check("10 A=3.14159265358979", [0x41, 0xF1, 0x1F, 0x88, 0x68, 0x21, 0xA2, 0xDA, 0x0F, 0x49, 0x82, 0]);
        // Hex and octal, where no digits is zero, and a bare & is octal.
        check("10 A=&HFF:B=&O17:C=&17:D=&HG", [
            0x41, 0xF1, 0x0C, 0xFF, 0x00, 0x3A, 0x42, 0xF1, 0x0B, 15, 0x00, 0x3A, 0x43, 0xF1, 0x0B, 15, 0x00, 0x3A,
            0x44, 0xF1, 0x0C, 0x00, 0x00, 0x47, 0]);
        // Numbers in DATA, REM and strings are text.
        check("10 DATA 1.5,2:REM 3 \"4\"", [0x84, 0x20, 0x31, 0x2E, 0x35, 0x2C, 0x32, 0x3A, 0x8F, 0x20, 0x33, 0x20,
            0x22, 0x34, 0x22, 0]);
    });

    it("round trips numbers through the tokenizer and the decoder", () => {
        const text = "10 A=0:B=9:C=10:D=255:E=256:F=32767:G=32768!:H=.5:I=1.5:J=1E+10:K=.0000125:L=1.5D-5#\n" +
            "20 M=&HFF:N=&O17:O=3.141592653589793#:P=100000#:Q=-5\n";
        // 1.5D-5# isn't a reasonable number to write, so list what the decoder makes of it.
        const first = decodeBasicProgram(tokenize(text, BasicDialect.MODEL_4), BasicDialect.MODEL_4)!.asAscii();
        const second = decodeBasicProgram(tokenize(first, BasicDialect.MODEL_4), BasicDialect.MODEL_4)!.asAscii();
        expect(second).to.equal(first);
        expect(first).to.contain("A=0:B=9:C=10:D=255:E=256:F=32767:G=32768!:H=.5:I=1.5:J=1E+10:K=.0000125");
        expect(first).to.contain("M=&HFF:N=&O17:O=3.141592653589793#:P=100000#:Q=-5");
    });

    it("round trips every keyword through the tokenizer and the decoder", () => {
        for (const keyword of MODEL_4_BASIC_KEYWORDS) {
            const binary = tokenize("10 " + keyword.name, BasicDialect.MODEL_4);
            const program = decodeBasicProgram(binary, BasicDialect.MODEL_4)!;
            expect(program.error).to.equal(undefined);
            // "GO TO" and GOTO share a token, and GOTO is what the decoder shows.
            const expected = keyword.name === "GO TO" ? "GOTO" : keyword.name;
            expect(program.asAscii()).to.equal("10 " + expected + "\n");
        }
    });

    it("gives a code to every keyword without clashes", () => {
        const names = new Map<number, string[]>();
        for (const keyword of MODEL_4_BASIC_KEYWORDS) {
            names.set(keyword.code, [...(names.get(keyword.code) ?? []), keyword.name]);
        }
        for (const [code, sharing] of names) {
            // The one pair that shares a code is the two spellings of GOTO.
            if (sharing.length > 1) {
                expect(sharing, "code " + code.toString(16)).to.eql(["GOTO", "GO TO"]);
            }
        }
    });

    it("round trips a whole program's text", () => {
        const text = MODEL_4_PROGRAM_TEXT.replace(/\n10 DATA.*\n/, "\n");
        const binary = tokenize(text, BasicDialect.MODEL_4);
        expect(decodeBasicProgram(binary, BasicDialect.MODEL_4)!.asAscii()).to.equal(text);
    });

    it("decodes the constants that BASIC stores", () => {
        // Digits 0 to 9, a byte, an integer (with nul bytes in it, which don't end the line), and a line number.
        expect(listModel4Line([0x11, 0x20, 0x1A, 0x20, 0x0F, 0xFF, 0x20, 0x1C, 0x00, 0x01, 0x20, 0x0E, 0x00, 0x7D]))
            .to.equal("10 0 9 255 256 32000\n");
        // A negative integer constant, and octal and hex.
        expect(listModel4Line([0x1C, 0x00, 0x80, 0x20, 0x0B, 0x08, 0x00, 0x20, 0x0C, 0xFF, 0x00]))
            .to.equal("10 -32768 &O10 &HFF\n");
    });

    it("decodes single and double precision constants", () => {
        // Single precision: 0.5, 100, 10, 1234.5, 3.14159274 (shown to six digits), 0.003, and some that need an
        // exponent: 1E10, and 1.5E-7 (a 1E-7 takes no more than seven places, but this takes eight).
        expect(listModel4Line([0x1D, 0x00, 0x00, 0x00, 0x80])).to.equal("10 .5\n");
        expect(listModel4Line([0x1D, 0x00, 0x00, 0x48, 0x87])).to.equal("10 100!\n");
        expect(listModel4Line([0x1D, 0x00, 0x00, 0x20, 0x84])).to.equal("10 10!\n");
        expect(listModel4Line([0x1D, 0x00, 0x50, 0x1A, 0x8B])).to.equal("10 1234.5\n");
        expect(listModel4Line([0x1D, 0xDB, 0x0F, 0x49, 0x82])).to.equal("10 3.14159\n");
        expect(listModel4Line([0x1D, 0xA6, 0x9B, 0x44, 0x78])).to.equal("10 .003\n");
        expect(listModel4Line([0x1D, 0xF9, 0x02, 0x15, 0xA2])).to.equal("10 1E+10\n");
        expect(listModel4Line([0x1D, 0x17, 0xB7, 0x51, 0x70])).to.equal("10 .0000125\n");
        expect(listModel4Line([0x1D, 0xB0, 0x0F, 0x21, 0x6A])).to.equal("10 1.5E-07\n");
        expect(listModel4Line([0x1D, 0x95, 0xBF, 0x56, 0x69])).to.equal("10 .0000001\n");
        expect(listModel4Line([0x1D, 0xF3, 0x1F, 0x4F, 0x70])).to.equal("10 1.23456E-05\n");
        expect(listModel4Line([0x1D, 0x00, 0x20, 0x71, 0x91])).to.equal("10 123456!\n");
        expect(listModel4Line([0x1D, 0x00, 0x24, 0x74, 0x94])).to.equal("10 1E+06\n");
        expect(listModel4Line([0x1D, 0x38, 0xB4, 0x16, 0x95])).to.equal("10 1.23457E+06\n");
        // A negative one, and zero.
        expect(listModel4Line([0x1D, 0x00, 0x00, 0xC8, 0x87])).to.equal("10 -100!\n");
        expect(listModel4Line([0x1D, 0x00, 0x00, 0x00, 0x00])).to.equal("10 0!\n");

        // Double precision: seven mantissa bytes with the sign in the top bit, then the exponent.
        expect(listModel4Line([0x1F, 0, 0, 0, 0, 0, 0, 0, 0x82])).to.equal("10 2#\n");
        expect(listModel4Line([0x1F, 0, 0, 0xA0, 0x31, 0xA9, 0x5F, 0x63, 0xB2])).to.equal("10 1000000000000000#\n");
        expect(listModel4Line([0x1F, 0x20, 0x2E, 0xAD, 0x75, 0x51, 0x71, 0x2F, 0xB6]))
            .to.equal("10 1.234567890123457D+16\n");
        expect(listModel4Line([0x1F, 0, 0, 0, 0, 0, 0, 0x80, 0x81])).to.equal("10 -1#\n");
        expect(listModel4Line([0x1F, 0xD0, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0x4C, 0x7D])).to.equal("10 .1#\n");
        expect(listModel4Line([0x1F, 0xC0, 0x68, 0x21, 0xA2, 0xDA, 0x0F, 0x49, 0x82])).to.equal("10 3.141592653589793#\n");
    });

    it("leaves the hidden + after WHILE out of a listing, and keeps a real one", () => {
        expect(listModel4Line([0xB4, 0xF3, 0x20, 0x41, 0xF2, 0x35])).to.equal("10 WHILE A<5\n");
        expect(listModel4Line([0xB4, 0xF3, 0xF3, 0x41])).to.equal("10 WHILE+A\n");
        expect(listModel4Line([0xB4, 0x20, 0x41])).to.equal("10 WHILE A\n");
    });

    it("shows a token it doesn't know as the byte", () => {
        const binary = new Uint8Array([0xFF, 0xFF, 0xFF, 10, 0, 0xE6, 0, 0, 0, 0]);
        const program = decodeBasicProgram(binary, BasicDialect.MODEL_4)!;
        expect(program.asAscii()).to.equal("10 æ\n");
    });

    it("reports a constant that the file ends in the middle of", () => {
        const binary = new Uint8Array([0xFF, 0xFF, 0xFF, 10, 0, 0x1C, 0x00]);
        const program = decodeBasicProgram(binary, BasicDialect.MODEL_4)!;
        expect(program.error).to.not.equal(undefined);
    });

    it("is chosen by decodeTrs80File's option", () => {
        const model4 = decodeTrs80File(MODEL_4_HELLO_BYTES, {filename: "HELLO", basicDialect: BasicDialect.MODEL_4});
        expect(model4.className).to.equal("BasicProgram");
        expect(model4.className === "BasicProgram" ? model4.asAscii() : "").to.contain("PRINT @ 672");

        const defaulted = decodeTrs80File(MODEL_4_HELLO_BYTES, {filename: "HELLO"});
        expect(defaulted.className === "BasicProgram" ? defaulted.asAscii() : "").to.not.contain("PRINT @ 672");

        // Text is tokenized for the dialect too.
        const text = new TextEncoder().encode("10 PRINT 1\n");
        const tokenized = decodeTrs80File(text, {filename: "X.BAS", basicDialect: BasicDialect.MODEL_4});
        expect(tokenized.className).to.equal("BasicProgram");
        expect(Array.from(tokenized.binary).slice(5, 7)).to.eql([0x91, 0x20]);
    });
});

describe("guessBasicDialect", () => {
    it("tells a Model 4 program with its own tokens from a Model III one", () => {
        expect(guessBasicDialect(MODEL_4_PROGRAM_BYTES)).to.equal(BasicDialect.MODEL_4);

        const model3 = tokenize("10 FOR I=1 TO 10:PRINT I:NEXT I\n20 GOTO 10", BasicDialect.MODEL_III);
        expect(guessBasicDialect(model3)).to.equal(BasicDialect.MODEL_III);
    });

    it("says nothing when both or neither fit, or it's not a program", () => {
        // A program that is all REM is the same bytes in both.
        expect(guessBasicDialect(tokenize("10 REM HELLO", BasicDialect.MODEL_4))).to.equal(undefined);
        expect(guessBasicDialect(new Uint8Array([1, 2, 3]))).to.equal(undefined);
    });
});
