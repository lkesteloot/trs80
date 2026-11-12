import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
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

describe("convert a hi-res screen", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-convert-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Read a one-bit grayscale PNG's size and pixels, checking every chunk's CRC.
     *
     * @return the size, and a function that says whether a pixel is white.
     */
    function readPng(pathname: string): {width: number, height: number, isWhite: (x: number, y: number) => boolean} {
        const png = new Uint8Array(fs.readFileSync(pathname));
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        expect(Array.from(png.subarray(0, 8))).to.eql([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        let width = 0;
        let height = 0;
        const idat: Uint8Array[] = [];
        let offset = 8;
        while (offset < png.length) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
            const data = png.subarray(offset + 8, offset + 8 + length);
            expect(view.getUint32(offset + 8 + length)).to.equal(zlib.crc32(png.subarray(offset + 4, offset + 8 + length)));
            if (type === "IHDR") {
                width = view.getUint32(offset + 8);
                height = view.getUint32(offset + 12);
                // One bit per pixel, grayscale, not interlaced.
                expect([data[8], data[9], data[12]]).to.eql([1, 0, 0]);
            } else if (type === "IDAT") {
                idat.push(data);
            }
            offset += 12 + length;
        }
        const raw = zlib.inflateSync(Buffer.concat(idat));
        const stride = width/8 + 1;
        expect(raw.length).to.equal(stride*height);
        return {
            width,
            height,
            isWhite: (x, y) => {
                // Each row starts with its filter type, which must be "None" for this simple reader.
                expect(raw[y*stride]).to.equal(0);
                return (raw[y*stride + 1 + Math.floor(x/8)] & (0x80 >> (x % 8))) !== 0;
            },
        };
    }

    /**
     * Run "convert" with one input and return what it printed.
     */
    function run(inFilename: string, outFilename: string): string {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            convert([inFilename], outFilename, undefined, undefined, false, false, false);
            return spy.mock.calls.map(args => args.join(" ")).join("\n");
        } finally {
            spy.mockRestore();
        }
    }

    it("writes a Model 4 screen's pixels to a PNG, lit pixels white and each row twice", () => {
        const screen = new Uint8Array(19200);
        screen[0] = 0x80;               // (0, 0)
        screen[80*100 + 2] = 0x10;      // (19, 100)
        screen[19199] = 0x01;           // (639, 239)
        const inFilename = path.join(dir, "PICTURE.HR");
        fs.writeFileSync(inFilename, screen);
        const outFilename = path.join(dir, "picture.png");
        expect(run(inFilename, outFilename)).to.equal(
            `Wrote ${outFilename}: 640x480 PNG of a hi-res screen (Model 4)`);

        const png = readPng(outFilename);
        expect([png.width, png.height]).to.eql([640, 480]);
        const lit: string[] = [];
        for (let y = 0; y < png.height; y++) {
            for (let x = 0; x < png.width; x++) {
                if (png.isWhite(x, y)) {
                    lit.push(x + "," + y);
                }
            }
        }
        expect(lit).to.eql(["0,0", "0,1", "19,200", "19,201", "639,478", "639,479"]);
    });

    it("explains a .HR file of the wrong size", () => {
        const inFilename = path.join(dir, "FONT.HR");
        fs.writeFileSync(inFilename, new Uint8Array(1024));
        let error: unknown = undefined;
        try {
            run(inFilename, path.join(dir, "font.png"));
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        expect((error as ToolError).message).to.equal("Can't convert FONT.HR to PNG: a hi-res screen in a " +
            ".HR file is 19,200 bytes (Model 4) or 12,288 bytes (Model III), but this file is 1,024 bytes");
        expect(fs.existsSync(path.join(dir, "font.png"))).to.be.false;
    });
});
