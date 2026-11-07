import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeTrs80File, formatTrsdosDataDisk, makeTrsdos23TestDisk, Trs80File, TrsdosFormatDos,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {convert} from "./convert.js";
import {ToolError} from "./utils.js";

describe("convert a floppy image", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-convert-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Write a TRSDOS 2.3 JV1 image holding one file, and return its pathname.
     */
    function makeJv1(): string {
        const disk = makeTrsdos23TestDisk([{name: "HELLO/TXT",
            extents: [{lump: 1, granuleOffset: 0, granuleCount: 2}], size: 1000}]);
        const pathname = path.join(dir, "in.jv1");
        fs.writeFileSync(pathname, disk.binary);
        return pathname;
    }

    /**
     * Write a double-density LS-DOS 6.3 DMK image, and return its pathname.
     */
    function makeDmk(): string {
        const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 35, sides: 1});
        if (typeof disk === "string") {
            throw new Error("Format failed: " + disk);
        }
        const pathname = path.join(dir, "in.dmk");
        fs.writeFileSync(pathname, disk.binary);
        return pathname;
    }

    /**
     * Run "convert" with one input and return what it printed.
     */
    function run(inFilename: string, outFilename: string, force = false): string[] {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            convert([inFilename], outFilename, undefined, undefined, false, false, force);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run "convert" and return the error it fails with, failing the test if it doesn't.
     */
    function runExpectingError(inFilename: string, outFilename: string, force = false): ToolError {
        let error: unknown = undefined;
        try {
            run(inFilename, outFilename, force);
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        return error as ToolError;
    }

    /**
     * Read and decode a file that "convert" wrote.
     */
    function decode(pathname: string): Trs80File {
        return decodeTrs80File(new Uint8Array(fs.readFileSync(pathname)), {filename: pathname});
    }

    it("converts to every format and says that nothing was lost", () => {
        const inFilename = makeDmk();
        for (const [extension, className] of [[".hfe", "HfeFloppyDisk"], [".jv3", "Jv3FloppyDisk"],
            [".imd", "ImdFloppyDisk"], [".dmk", "DmkFloppyDisk"]]) {

            const outFilename = path.join(dir, "out" + extension);
            const output = run(inFilename, outFilename);
            expect(decode(outFilename).className).to.equal(className);
            expect(output[output.length - 1]).to.equal(
                `Wrote ${outFilename}: ${extension.substring(1).toUpperCase()} floppy, 35 cylinders, 1 side, 630 sectors; nothing lost.`);
        }
    });

    it("converts a JV1 image to the other formats", () => {
        const inFilename = makeJv1();
        for (const extension of [".dmk", ".jv3", ".hfe"]) {
            const outFilename = path.join(dir, "out" + extension);
            const output = run(inFilename, outFilename);
            expect(output[output.length - 1]).to.contain("nothing lost");
            expect(decode(outFilename).className).to.not.equal("RawBinaryFile");
        }
    });

    it("explains what a format can't hold and doesn't write unless forced", () => {
        const inFilename = makeJv1();
        const outFilename = path.join(dir, "out.imd");

        // IMD records that the directory is deleted but not that its mark is 0xFA.
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        let error: unknown = undefined;
        let printed = "";
        try {
            convert([inFilename], outFilename, undefined, undefined, false, false, false);
        } catch (e) {
            error = e;
        } finally {
            printed = spy.mock.calls.map(args => args.join(" ")).join("\n");
            spy.mockRestore();
        }
        expect(printed).to.contain("IMD can't hold everything on this disk");
        expect(printed).to.contain("10 sectors whose exact data address mark changed");
        expect(printed).to.contain("cylinder 17 side 0 sector 0: data address mark 0xFA became 0xF8");
        expect(error).to.be.instanceOf(ToolError);
        expect((error as ToolError).message).to.contain("Use --force");
        expect(fs.existsSync(outFilename)).to.equal(false);

        const output = run(inFilename, outFilename, true);
        expect(fs.existsSync(outFilename)).to.equal(true);
        expect(output[output.length - 1]).to.contain("written anyway");
        expect(decode(outFilename).className).to.equal("ImdFloppyDisk");
    });

    it("says when a format can't hold the disk at all", () => {
        const error = runExpectingError(makeDmk(), path.join(dir, "out.jv1"));
        expect(error.message).to.contain("JV1 holds only single-density");
        expect(fs.existsSync(path.join(dir, "out.jv1"))).to.equal(false);
    });

    it("won't guess between JV1 and JV3 for .dsk", () => {
        const error = runExpectingError(makeJv1(), path.join(dir, "out.dsk"));
        expect(error.message).to.contain("use .jv1 or .jv3");
    });

    it("won't make a floppy image from something else", () => {
        const basic = path.join(dir, "in.bas");
        fs.writeFileSync(basic, new Uint8Array([0xFF, 0x00, 0x00]));
        const error = runExpectingError(basic, path.join(dir, "out.dmk"));
        expect(error.message).to.contain("only another floppy image can be converted to one");
    });

    it("won't overwrite the input", () => {
        const inFilename = makeDmk();
        const error = runExpectingError(inFilename, path.join(dir, ".", "in.dmk"));
        expect(error.message).to.contain("same file");
    });
});
