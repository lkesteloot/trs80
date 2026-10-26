import {
    CassetteSpeed, decodeBasicProgram, decodeTrs80File, encodeSystemProgram, parseBasicText, SystemProgramBuilder,
} from "trs80-base";
import {binaryAsCasFile} from "trs80-cassette";
import {describe, expect, it} from "vitest";
import {ToolError} from "../utils.js";
import {importHostFile, type ImportOptions} from "./DiskImport.js";

const DEFAULT_OPTIONS: ImportOptions = {ascii: false, binary: false};

/**
 * Make the bytes of text.
 */
function bytesOf(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/**
 * Make the text of bytes.
 */
function textOf(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

/**
 * A small system program that loads a few bytes at 0x5000 and starts there.
 */
function makeSystemProgram(): Uint8Array {
    const builder = new SystemProgramBuilder();
    builder.addBytes(0x5000, [0x3E, 0x2A, 0xC9]);
    return encodeSystemProgram("GAME", builder.getChunks(), 0x5000);
}

/**
 * Tokenize BASIC text the way the "convert" command does, through the file decoder.
 */
function convertTokenized(text: string): Uint8Array {
    const trs80File = decodeTrs80File(bytesOf(text), {filename: "x.bas"});
    expect(trs80File.className).to.equal("BasicProgram");
    return trs80File.binary;
}

describe("importHostFile", () => {
    const listing = "10 PRINT \"HELLO\"\n20 GOTO 10\n";

    it("tokenizes BASIC text with LF or CRLF line endings, as convert does", () => {
        const expected = convertTokenized(listing);
        for (const text of [listing, listing.replace(/\n/g, "\r\n"), listing.replace(/\n/g, "\r")]) {
            const result = importHostFile("/some/dir/hello.bas", bytesOf(text), DEFAULT_OPTIONS);
            expect(result.contents).to.eql(expected);
            expect(result.extension).to.equal(undefined);
            expect(result.messages).to.eql(["Tokenized hello.bas."]);
        }
    });

    it("keeps already tokenized BASIC as it is", () => {
        const tokenized = parseBasicText(listing) as Uint8Array;
        const result = importHostFile("hello.bas", tokenized, DEFAULT_OPTIONS);
        expect(result.contents).to.eql(tokenized);
        expect(result.messages).to.eql([]);
    });

    it("converts cassette-format BASIC to disk format", () => {
        const tokenized = parseBasicText(listing) as Uint8Array;
        const program = decodeBasicProgram(tokenized)!;
        const result = importHostFile("hello.bas", program.asCassetteBinary(), DEFAULT_OPTIONS);
        expect(result.contents).to.eql(tokenized);
        expect(result.messages).to.eql(["Converted hello.bas from cassette to disk format."]);
    });

    it("keeps BASIC text as text with CR line endings with --ascii", () => {
        const result = importHostFile("hello.bas", bytesOf("10 PRINT 1\r\n20 GOTO 10"),
            {ascii: true, binary: false});
        expect(textOf(result.contents)).to.equal("10 PRINT 1\r20 GOTO 10\r");
        expect(result.messages).to.eql([]);
    });

    it("turns tokenized BASIC into text with --ascii", () => {
        const tokenized = parseBasicText(listing) as Uint8Array;
        const result = importHostFile("hello.bas", tokenized, {ascii: true, binary: false});
        expect(textOf(result.contents)).to.equal("10 PRINT \"HELLO\"\r20 GOTO 10\r");
        expect(result.messages).to.eql(["Converted hello.bas to text."]);
    });

    it("names the file and line of a BASIC syntax error", () => {
        let error: unknown;
        try {
            importHostFile("bad.bas", bytesOf("10 PRINT 1\n20 PRINT 2\nGARBAGE\n40 END\n"), DEFAULT_OPTIONS);
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        const message = (error as ToolError).message;
        expect(message).to.include("bad.bas");
        expect(message).to.include("line 3");
        expect(message).to.include("--ascii");
        expect(message).to.include("--binary");
    });

    it("refuses a .bas file that is binary garbage", () => {
        expect(() => importHostFile("bad.bas", Uint8Array.from([0x80, 0x81, 0xC3, 0x28]), DEFAULT_OPTIONS))
            .to.throw(ToolError, "bad.bas");
    });

    it("converts a .3bn system program to a CMD program with the CMD extension", () => {
        const result = importHostFile("game.3bn", makeSystemProgram(), DEFAULT_OPTIONS);
        expect(result.extension).to.equal("CMD");
        expect(result.messages).to.eql(["Converted game.3bn to a CMD program."]);
        const cmd = decodeTrs80File(result.contents, {filename: "game.cmd"});
        expect(cmd.className).to.equal("CmdProgram");
    });

    it("converts a .cas system program to a CMD program", () => {
        const cas = binaryAsCasFile(makeSystemProgram(), CassetteSpeed.LOW);
        const result = importHostFile("game.cas", cas, DEFAULT_OPTIONS);
        expect(result.extension).to.equal("CMD");
        expect(decodeTrs80File(result.contents, {filename: "game.cmd"}).className).to.equal("CmdProgram");
    });

    it("converts a .cas BASIC program to tokenized BASIC with the BAS extension", () => {
        const tokenized = parseBasicText(listing) as Uint8Array;
        const program = decodeBasicProgram(tokenized)!;
        const cas = binaryAsCasFile(program.asCassetteBinary(), CassetteSpeed.LOW);
        const result = importHostFile("prog.cas", cas, DEFAULT_OPTIONS);
        expect(result.extension).to.equal("BAS");
        expect(result.contents).to.eql(tokenized);
    });

    it("refuses a .cas with several programs", () => {
        const system = binaryAsCasFile(makeSystemProgram(), CassetteSpeed.LOW);
        const both = new Uint8Array(system.length*2);
        both.set(system, 0);
        both.set(system, system.length);
        expect(() => importHostFile("two.cas", both, DEFAULT_OPTIONS)).to.throw(ToolError, /2 programs.*extract/);
    });

    it("refuses a .3bn file that isn't a system program", () => {
        expect(() => importHostFile("bad.3bn", Uint8Array.from([1, 2, 3, 4]), DEFAULT_OPTIONS))
            .to.throw(ToolError, "bad.3bn");
    });

    it("converts the line endings of text files", () => {
        for (const name of ["notes.txt", "PROG.ASM", "x.jcl", "x.doc", "x.hlp", "x.lst", "x.fix", "x.src"]) {
            const result = importHostFile(name, bytesOf("a\nb\r\nc\rd"), DEFAULT_OPTIONS);
            expect(textOf(result.contents)).to.equal("a\rb\rc\rd");
            expect(result.messages).to.eql(["Converted line endings of " + name + "."]);
            expect(result.extension).to.equal(undefined);
        }
    });

    it("says nothing about a text file that needs no conversion", () => {
        const result = importHostFile("notes.txt", bytesOf("a\rb\r"), DEFAULT_OPTIONS);
        expect(textOf(result.contents)).to.equal("a\rb\r");
        expect(result.messages).to.eql([]);
    });

    it("copies every file exactly with --binary", () => {
        const options = {ascii: false, binary: true};
        for (const [name, bytes] of [
            ["hello.bas", bytesOf(listing)], ["game.3bn", makeSystemProgram()], ["notes.txt", bytesOf("a\nb\n")],
        ] as [string, Uint8Array][]) {
            const result = importHostFile(name, bytes, options);
            expect(result.contents).to.eql(bytes);
            expect(result.extension).to.equal(undefined);
            expect(result.messages).to.eql([]);
        }
    });

    it("copies files with other extensions exactly", () => {
        const bytes = bytesOf("a\nb\r\n");
        for (const name of ["game.cmd", "data.dat", "readme.md", "noextension", "x.TXT.bak"]) {
            const result = importHostFile(name, bytes, DEFAULT_OPTIONS);
            expect(result.contents).to.eql(bytes);
            expect(result.messages).to.eql([]);
        }
    });

    it("refuses --ascii together with --binary", () => {
        expect(() => importHostFile("a.txt", bytesOf("x"), {ascii: true, binary: true})).to.throw(ToolError, "not both");
    });
});
