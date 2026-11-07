import fs from "fs";
import os from "os";
import path from "path";
import {BasicDialect, decodeBasicProgram, parseBasicText} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskSession} from "./DiskSession.js";

// What Model III and Model 4 BASIC store for PRINT.
const MODEL_III_PRINT = 0xB2;
const MODEL_4_PRINT = 0x91;

describe("disk commands and the two BASICs", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-basic-"));
        imagePathname = path.join(dir, "test.dmk");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Run the "disk" command on the test image with these words after it, and return what it printed.
     */
    async function runDisk(...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([imagePathname, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Make a host file in the temporary directory and return its pathname.
     */
    function makeHostFile(name: string, contents: string | Uint8Array): string {
        const pathname = path.join(dir, name);
        fs.writeFileSync(pathname, contents);
        return pathname;
    }

    /**
     * The bytes of the named file on the test image.
     */
    function fileBytes(name: string): Uint8Array {
        const inFile = DiskSession.open(imagePathname).getInputFiles(true).find(f => f.filename === name);
        if (inFile === undefined) {
            throw new Error("No file " + name);
        }
        return inFile.binary;
    }

    /**
     * The byte after the line number of the first line of a tokenized program: its first token.
     */
    function firstToken(binary: Uint8Array): number {
        // Header, next-line pointer, line number.
        return binary[5];
    }

    it("reports the BASIC of each DOS", async () => {
        const expected: [string, BasicDialect][] = [
            ["ldos-5.3", BasicDialect.MODEL_III],
            ["trsdos-1.3", BasicDialect.MODEL_III],
            ["trsdos-2.3", BasicDialect.MODEL_III],
            ["trsdos-6.2", BasicDialect.MODEL_4],
            ["lsdos-6.3", BasicDialect.MODEL_4],
        ];
        for (const [dos, dialect] of expected) {
            fs.rmSync(imagePathname, {force: true});
            await runDisk("create", dos);
            expect(DiskSession.open(imagePathname).getBasicDialect(), dos).to.equal(dialect);
        }
    });

    it("tokenizes BASIC text as Model 4 BASIC on an LS-DOS 6 disk and lists it back", async () => {
        await runDisk("create", "lsdos-6.3");
        const host = makeHostFile("greet.bas", "10 PRINT \"HI\"\n20 A=LEN(B$):GOTO 10\n");

        const lines = await runDisk("add", host);
        expect(lines[0]).to.equal("Tokenized greet.bas for Model 4 BASIC.");

        const stored = fileBytes("GREET.BAS");
        expect(firstToken(stored)).to.equal(MODEL_4_PRINT);
        expect(decodeBasicProgram(stored, BasicDialect.MODEL_4)?.asAscii()).to.equal(
            "10 PRINT \"HI\"\n20 A=LEN(B$):GOTO 10\n");

        expect(await runDisk("list", "GREET/BAS")).to.eql(["10 PRINT \"HI\"", "20 A=LEN(B$):GOTO 10"]);
    });

    it("tokenizes as Model 4 BASIC on a TRSDOS 6 disk too", async () => {
        await runDisk("create", "trsdos-6.2");
        await runDisk("add", makeHostFile("greet.bas", "10 PRINT 1\n"));
        expect(firstToken(fileBytes("GREET.BAS"))).to.equal(MODEL_4_PRINT);
    });

    it("tokenizes BASIC text as Model III BASIC on an LDOS 5 disk and lists it back", async () => {
        await runDisk("create", "ldos-5.3");
        const host = makeHostFile("greet.bas", "10 PRINT \"HI\"\n20 GOTO 10\n");

        const lines = await runDisk("add", host);
        expect(lines[0]).to.equal("Tokenized greet.bas.");

        const stored = fileBytes("GREET.BAS");
        expect(firstToken(stored)).to.equal(MODEL_III_PRINT);
        expect(await runDisk("list", "GREET/BAS")).to.eql(["10 PRINT \"HI\"", "20 GOTO 10"]);
    });

    it("lets --basic choose the BASIC for add and for list", async () => {
        await runDisk("create", "lsdos-6.3");
        await runDisk("add", makeHostFile("old.bas", "10 PRINT 1\n"), "--basic", "3");
        expect(firstToken(fileBytes("OLD.BAS"))).to.equal(MODEL_III_PRINT);

        await runDisk("add", makeHostFile("new.bas", "10 PRINT 1\n"), "--basic", "4");
        expect(firstToken(fileBytes("NEW.BAS"))).to.equal(MODEL_4_PRINT);

        // Read as the wrong BASIC, the Model III program shows something else for the byte.
        expect(await runDisk("list", "OLD/BAS", "--basic", "3")).to.eql(["10 PRINT 1"]);
        expect(await runDisk("list", "NEW/BAS", "--basic", "4")).to.eql(["10 PRINT 1"]);
        expect(await runDisk("list", "NEW/BAS", "--basic", "3")).to.not.eql(["10 PRINT 1"]);

        await expect(runDisk("add", makeHostFile("x.bas", "10 PRINT 1\n"), "--basic", "5"))
            .rejects.toThrow("Unknown BASIC");
        await expect(runDisk("list", "NEW/BAS", "--basic", "5")).rejects.toBeInstanceOf(ToolError);
    });

    it("lists a Model III program on a Model 4 disk as the Model III program that it is", async () => {
        await runDisk("create", "lsdos-6.3");
        // Tokenized for Model III, as a program from a Model III disk or a cassette would be.
        const model3 = parseBasicText("10 FOR I=1 TO 10:PRINT I:NEXT I\n20 GOTO 10", BasicDialect.MODEL_III) as Uint8Array;
        await runDisk("add", makeHostFile("old.bas", model3), "--binary");
        expect(await runDisk("list", "OLD/BAS")).to.eql(["10 FOR I=1 TO 10:PRINT I:NEXT I", "20 GOTO 10"]);
    });

    it("converts a tokenized Model III program that it adds to a Model 4 disk, and says so", async () => {
        await runDisk("create", "lsdos-6.3");
        const model3 = parseBasicText("10 FOR I=1 TO 10:PRINT I:NEXT I\n20 GOTO 10", BasicDialect.MODEL_III) as Uint8Array;

        const lines = await runDisk("add", makeHostFile("old.bas", model3));
        expect(lines[0]).to.equal("Converted old.bas from Model III to Model 4 BASIC tokens.");

        const stored = fileBytes("OLD.BAS");
        expect(decodeBasicProgram(stored, BasicDialect.MODEL_4)?.asAscii()).to.equal(
            "10 FOR I=1 TO 10:PRINT I:NEXT I\n20 GOTO 10\n");
    });

    it("keeps a tokenized Model 4 program that it adds to a Model 4 disk as it is", async () => {
        await runDisk("create", "lsdos-6.3");
        const model4 = parseBasicText("10 FOR I=1 TO 10:A=LEN(B$):NEXT I", BasicDialect.MODEL_4) as Uint8Array;

        const lines = await runDisk("add", makeHostFile("new.bas", model4));
        expect(lines[0]).to.match(/^Added NEW\/BAS/);
        expect(fileBytes("NEW.BAS")).to.eql(model4);
    });

    it("turns a tokenized Model 4 program into text with --ascii, reading it as Model 4 BASIC", async () => {
        await runDisk("create", "lsdos-6.3");
        const model4 = parseBasicText("10 A=LEN(B$):PRINT A", BasicDialect.MODEL_4) as Uint8Array;

        const lines = await runDisk("add", makeHostFile("new.bas", model4), "--ascii");
        expect(lines[0]).to.equal("Converted new.bas to text, reading its tokens as Model 4 BASIC.");
        expect(new TextDecoder().decode(fileBytes("NEW.BAS"))).to.equal("10 A=LEN(B$):PRINT A\r");
    });

    it("converts a program to the other BASIC when it's added to a Model III disk", async () => {
        await runDisk("create", "ldos-5.3");
        const model4 = parseBasicText("10 A=LEN(B$):PRINT A", BasicDialect.MODEL_4) as Uint8Array;

        const lines = await runDisk("add", makeHostFile("new.bas", model4));
        expect(lines[0]).to.equal("Converted new.bas from Model 4 to Model III BASIC tokens.");
        expect(decodeBasicProgram(fileBytes("NEW.BAS"))?.asAscii()).to.equal("10 A=LEN(B$):PRINT A\n");
    });
});
