import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeTrs80File, formatTrsdosDataDisk, gunzipBytes, gzipBytes, parseBasicText, TrsdosFormatDos,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {convert} from "./convert.js";
import {disk} from "./disk/disk.js";
import {openDiskSession, sessionInputFiles} from "./disk/DiskFiles.js";
import {extractOneInputFile} from "./extract.js";
import {expandContainer} from "./InputFile.js";
import {loadUncompressedFile, ToolError, writeOutputFile} from "./utils.js";

describe("gzipped files", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-gzip-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * The pathname of a name in the temporary directory.
     */
    function pathOf(name: string): string {
        return path.join(dir, name);
    }

    /**
     * The bytes of a plain LS-DOS 6.3 DMK image.
     */
    function makeDmkBytes(): Uint8Array {
        const floppy = formatTrsdosDataDisk({dos: TrsdosFormatDos.LSDOS_6_3, cylinders: 35, sides: 1});
        if (typeof floppy === "string") {
            throw new Error("Format failed: " + floppy);
        }
        return floppy.binary;
    }

    /**
     * Read a file from the temporary directory.
     */
    function readBytes(pathname: string): Uint8Array {
        return new Uint8Array(fs.readFileSync(pathname));
    }

    /**
     * Run "convert" with one input and swallow what it prints.
     */
    function runConvert(inFilename: string, outFilename: string): void {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            convert([inFilename], outFilename, undefined, undefined, false, false, false);
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run the "disk" command on an image with these words after it, and return what it printed.
     */
    async function runDisk(imagePathname: string, ...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([imagePathname, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * The names of the files on a disk image, without system files.
     */
    function fileNames(pathname: string): string[] {
        return sessionInputFiles(openDiskSession(pathname), false).map(f => f.filename);
    }

    it("writeOutputFile compresses for a .gz name and otherwise writes plain bytes", () => {
        const bytes = new Uint8Array(500).fill(42);

        writeOutputFile(pathOf("a.bin.gz"), bytes);
        expect(readBytes(pathOf("a.bin.gz"))[0]).to.equal(0x1F);
        expect(Array.from(gunzipBytes(readBytes(pathOf("a.bin.gz"))))).to.eql(Array.from(bytes));

        writeOutputFile(pathOf("b.bin"), bytes);
        expect(Array.from(readBytes(pathOf("b.bin")))).to.eql(Array.from(bytes));
    });

    it("loadUncompressedFile decompresses by name and reports a bad .gz", () => {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        fs.writeFileSync(pathOf("good.bin.gz"), gzipBytes(bytes));
        fs.writeFileSync(pathOf("bad.bin.gz"), bytes);
        fs.writeFileSync(pathOf("plain.bin"), bytes);

        expect(Array.from(loadUncompressedFile(pathOf("good.bin.gz")) as Uint8Array)).to.eql(Array.from(bytes));
        expect(Array.from(loadUncompressedFile(pathOf("plain.bin")) as Uint8Array)).to.eql(Array.from(bytes));
        const message = loadUncompressedFile(pathOf("bad.bin.gz"));
        expect(message).to.be.a("string");
        expect(message).to.contain("not a valid gzip file");
    });

    it("converts a Basic program to a compressed name, and back to a plain one", () => {
        const tokenized = parseBasicText("10 PRINT \"HI\"\n");
        if (typeof tokenized === "string") {
            throw new Error(tokenized);
        }
        fs.writeFileSync(pathOf("in.bas"), tokenized);

        runConvert(pathOf("in.bas"), pathOf("out.bas.gz"));
        expect(Array.from(gunzipBytes(readBytes(pathOf("out.bas.gz"))))).to.eql(Array.from(tokenized));

        runConvert(pathOf("out.bas.gz"), pathOf("back.bas"));
        expect(Array.from(readBytes(pathOf("back.bas")))).to.eql(Array.from(tokenized));
    });

    it("converts a floppy image from and to compressed names", () => {
        fs.writeFileSync(pathOf("a.dmk"), makeDmkBytes());

        runConvert(pathOf("a.dmk"), pathOf("b.jv3.gz"));
        const jv3 = decodeTrs80File(readBytes(pathOf("b.jv3.gz")), {filename: "b.jv3.gz"});
        expect(jv3.className).to.equal("Jv3FloppyDisk");
        // It's compressed on disk.
        expect(() => gunzipBytes(readBytes(pathOf("b.jv3.gz")))).to.not.throw();

        runConvert(pathOf("b.jv3.gz"), pathOf("c.dmk"));
        expect(decodeTrs80File(readBytes(pathOf("c.dmk")), {filename: "c.dmk"}).className).to.equal("DmkFloppyDisk");
    });

    it("edits a compressed image in place and leaves it compressed", async () => {
        const image = pathOf("test.dmk.gz");
        fs.writeFileSync(image, gzipBytes(makeDmkBytes()));
        const host = pathOf("hello.dat");
        fs.writeFileSync(host, new Uint8Array(300).fill(65));

        await runDisk(image, "add", host, "--binary");
        expect(() => gunzipBytes(readBytes(image))).to.not.throw();
        expect(fileNames(image)).to.eql(["HELLO.DAT"]);

        await runDisk(image, "rm", "HELLO/DAT");
        expect(() => gunzipBytes(readBytes(image))).to.not.throw();
        expect(fileNames(image)).to.eql([]);
    });

    it("makes a new compressed image with create", async () => {
        const image = pathOf("new.dmk.gz");
        await runDisk(image, "create", "ldos-5.3");
        const file = decodeTrs80File(gunzipBytes(readBytes(image)), {filename: "new.dmk"});
        expect(file.className).to.equal("DmkFloppyDisk");
    });

    it("adds a compressed host file under its name without .gz, decompressed", async () => {
        const image = pathOf("test.dmk");
        fs.writeFileSync(image, makeDmkBytes());
        const contents = new Uint8Array(400).map((_, i) => i & 0xFF);
        fs.writeFileSync(pathOf("hello.bas.gz"), gzipBytes(contents));

        await runDisk(image, "add", pathOf("hello.bas.gz"), "--binary");
        expect(fileNames(image)).to.eql(["HELLO.BAS"]);
        const inFile = sessionInputFiles(openDiskSession(image), false)[0];
        expect(Array.from(inFile.binary.subarray(0, contents.length))).to.eql(Array.from(contents));
    });

    it("refuses to add a .gz host file that isn't gzip", async () => {
        const image = pathOf("test.dmk");
        fs.writeFileSync(image, makeDmkBytes());
        fs.writeFileSync(pathOf("bad.bas.gz"), new Uint8Array(100).fill(1));

        await expect(runDisk(image, "add", pathOf("bad.bas.gz"), "--binary")).rejects.toThrow(ToolError);
    });

    it("extract --as compresses for a .gz name", async () => {
        const image = pathOf("test.dmk");
        fs.writeFileSync(image, makeDmkBytes());
        const host = pathOf("notes.txt");
        fs.writeFileSync(host, "Hello there.\r");
        await runDisk(image, "add", host, "--binary");

        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            extractOneInputFile(expandContainer(image, false, false), image, pathOf("out.txt.gz"), ["NOTES/TXT"], false);
        } finally {
            spy.mockRestore();
        }
        expect(Array.from(gunzipBytes(readBytes(pathOf("out.txt.gz"))))).to.eql(Array.from(readBytes(host)));
    });
});
