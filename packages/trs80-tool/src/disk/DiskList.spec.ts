import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {looksLikeText, textLines} from "./DiskList.js";

const SYSTEM: TestFile = {
    name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 1}], size: 40, system: true, data: 0xE5,
};
const DATA: TestFile = {
    name: "DATA/BIN", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 20, data: 0xE5,
};

/**
 * The bytes of a string, one per character.
 */
function bytesOf(text: string): Uint8Array {
    return Uint8Array.from(text, ch => ch.charCodeAt(0));
}

describe("looksLikeText", () => {
    it("accepts printable text with any line endings, and padding", () => {
        expect(looksLikeText(bytesOf("HELLO\rWORLD\r"))).to.be.true;
        expect(looksLikeText(bytesOf("HELLO\r\nWORLD\n\tx"))).to.be.true;
        expect(looksLikeText(bytesOf("HELLO\r\x1A\x1A\x1A"))).to.be.true;
        expect(looksLikeText(bytesOf("HELLO\r\0\0\0\0"))).to.be.true;
        expect(looksLikeText(new Uint8Array(0))).to.be.true;
    });

    it("tolerates a few odd bytes but not many", () => {
        expect(looksLikeText(bytesOf("a".repeat(39) + "\x80"))).to.be.true;
        expect(looksLikeText(bytesOf("a".repeat(30) + "\x80\x81\x82\x83"))).to.be.false;
    });

    it("rejects anything with a NUL inside, and files of only padding", () => {
        expect(looksLikeText(bytesOf("HELLO\0WORLD"))).to.be.false;
        expect(looksLikeText(new Uint8Array(100))).to.be.false;
        expect(looksLikeText(bytesOf("\x1A\x1A"))).to.be.false;
        expect(looksLikeText(Uint8Array.from([0xFF, 0x0E, 0x3F, 0x0A, 0x00, 0x8E, 0x00, 0x00, 0x00]))).to.be.false;
    });
});

describe("textLines", () => {
    it("splits on CR, CRLF, and LF, dropping the padding and the empty line after the last terminator", () => {
        expect(textLines(bytesOf("A\rB\r\nC\nD\r\x1A\x1A"))).to.eql(["A", "B", "C", "D"]);
        expect(textLines(bytesOf("A\r\rB"))).to.eql(["A", "", "B"]);
        expect(textLines(new Uint8Array(0))).to.eql([]);
    });

    it("replaces unprintable bytes", () => {
        expect(textLines(bytesOf("A\x1B[0m\x80\tB"))).to.eql(["A.[0m.\tB"]);
    });
});

describe("disk list", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-list-"));
        imagePathname = path.join(dir, "test.jv1");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Write a test disk to the image file.
     */
    function makeImage(files: TestFile[], options: TestDiskOptions = {}): void {
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk(files, options).binary);
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
     * Run the "disk" command on the image with these words after the image, and return what it printed with
     * console.log, and the bytes that it wrote directly to standard output.
     */
    async function runDiskFull(...words: string[]): Promise<{ lines: string[], written: Uint8Array }> {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const chunks: Uint8Array[] = [];
        const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            chunks.push(typeof chunk === "string" ? bytesOf(chunk) : chunk);
            return true;
        });
        try {
            await disk([imagePathname, ...words]);
            return {
                lines: logSpy.mock.calls.map(args => args.join(" ")),
                written: Buffer.concat(chunks),
            };
        } finally {
            writeSpy.mockRestore();
            logSpy.mockRestore();
        }
    }

    /**
     * Run the "disk" command and return what it printed with console.log.
     */
    async function runDisk(...words: string[]): Promise<string[]> {
        return (await runDiskFull(...words)).lines;
    }

    /**
     * Make an image holding a Basic program (HELLO/BAS), a text file (NOTES/TXT), and a binary (DATA/BIN),
     * adding the first two from the host.
     */
    async function makeMixedImage(): Promise<void> {
        makeImage([DATA, SYSTEM]);
        const hello = makeHostFile("hello.bas", "10 PRINT \"HELLO\"\n20 GOTO 10\n");
        const notes = makeHostFile("notes.txt", "First line\nSecond line\n");
        await runDisk("add", hello, notes);
    }

    it("lists a Basic program as source", async () => {
        await makeMixedImage();
        expect(await runDisk("list", "HELLO/BAS")).to.eql(["10 PRINT \"HELLO\"", "20 GOTO 10"]);
    });

    it("lists a text file as lines", async () => {
        await makeMixedImage();
        expect(await runDisk("list", "NOTES/TXT")).to.eql(["First line", "Second line"]);
    });

    it("dumps a binary file in hex", async () => {
        await makeMixedImage();
        const lines = await runDisk("list", "DATA/BIN");
        expect(lines.length).to.be.greaterThan(0);
        expect(lines[0]).to.contain("0000");
        expect(lines.join("\n")).to.contain("E5 E5 E5");
    });

    it("dumps in hex with --hex whatever the file is", async () => {
        await makeMixedImage();
        const lines = await runDisk("list", "NOTES/TXT", "--hex");
        expect(lines[0]).to.contain("0000");
        expect(lines.join("\n")).to.contain("46 69 72 73 74");
        expect(lines.join("\n")).to.not.contain("Second line\n");
    });

    it("writes the unchanged bytes of the file with --raw", async () => {
        await makeMixedImage();
        const notes = await runDiskFull("list", "NOTES/TXT", "--raw");
        expect(notes.lines).to.eql([]);
        expect(notes.written).to.eql(bytesOf("First line\rSecond line\r"));

        // The tokenized Basic, not the listing.
        const hello = await runDiskFull("list", "HELLO/BAS", "--raw");
        expect(hello.written[0]).to.equal(0xFF);
        expect(hello.lines).to.eql([]);

        const data = await runDiskFull("list", "DATA/BIN", "--raw");
        expect(data.written).to.eql(new Uint8Array(20).fill(0xE5));
    });

    it("doesn't take --hex with --raw", async () => {
        await makeMixedImage();
        await expect(runDisk("list", "DATA/BIN", "--hex", "--raw")).rejects.toThrow("Use either --hex or --raw");
    });

    it("works under its other names", async () => {
        await makeMixedImage();
        for (const alias of ["type", "cat"]) {
            expect(await runDisk(alias, "NOTES/TXT")).to.eql(["First line", "Second line"]);
        }
    });

    it("matches names with a dot, lowercase, and wildcards", async () => {
        await makeMixedImage();
        expect(await runDisk("list", "notes.txt")).to.eql(["First line", "Second line"]);
        expect(await runDisk("list", "NOTES*")).to.eql(["First line", "Second line"]);
    });

    it("says so when no file matches", async () => {
        await makeMixedImage();
        await expect(runDisk("list", "NOPE/BAS")).rejects.toThrow("No file on the disk matches \"NOPE/BAS\"");
        await expect(runDisk("list", "NOPE/BAS")).rejects.toBeInstanceOf(ToolError);
    });

    it("shows each file under a header when a pattern matches several", async () => {
        await makeMixedImage();
        await runDisk("add", makeHostFile("more.txt", "Third\n"));
        expect(await runDisk("list", "*.TXT")).to.eql([
            "==> NOTES.TXT <==", "First line", "Second line",
            "",
            "==> MORE.TXT <==", "Third",
        ]);

        // A single match has no header.
        expect(await runDisk("list", "MORE*")).to.eql(["Third"]);
    });

    it("needs --system to list a system file", async () => {
        await makeMixedImage();
        await expect(runDisk("list", "KERNEL/SYS")).rejects.toThrow(
            "No file on the disk matches \"KERNEL/SYS\", but a system file does (use --system)");
        const lines = await runDisk("list", "KERNEL/SYS", "--system");
        expect(lines[0]).to.contain("0000");
    });

    it("doesn't change the disk", async () => {
        await makeMixedImage();
        const before = fs.readFileSync(imagePathname);
        const lines = await runDisk("list", "NOTES/TXT");
        expect(lines).to.eql(["First line", "Second line"]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("sends the output to the pager when stdout is a terminal", async () => {
        await makeMixedImage();
        const pagedPathname = path.join(dir, "paged.txt");
        const oldPager = process.env.TRS80_TOOL_PAGER;
        const oldIsTTY = process.stdout.isTTY;
        process.env.TRS80_TOOL_PAGER = "cat > " + JSON.stringify(pagedPathname);
        process.stdout.isTTY = true;
        try {
            const lines = await runDisk("list", "NOTES/TXT");
            expect(lines).to.eql([]);
            expect(fs.readFileSync(pagedPathname, "latin1")).to.equal("First line\nSecond line\n");
        } finally {
            process.stdout.isTTY = oldIsTTY;
            if (oldPager === undefined) {
                delete process.env.TRS80_TOOL_PAGER;
            } else {
                process.env.TRS80_TOOL_PAGER = oldPager;
            }
        }
    });
});
