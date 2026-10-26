import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};
const SYSTEM: TestFile = {
    name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 500, system: true,
};

describe("disk mv", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-mv-"));
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
     * Run the "disk" command on the image with these words after the image, and return what it printed.
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
     * The names of the files on a disk, with system files if asked, in directory order.
     */
    function fileNames(pathname: string, includeSystemFiles = false): string[] {
        return DiskSession.open(pathname).getInputFiles(includeSystemFiles).map(f => f.filename);
    }

    /**
     * The contents of the named file on a disk.
     */
    function fileBytes(pathname: string, name: string): Uint8Array {
        const inFile = DiskSession.open(pathname).getInputFiles(true).find(f => f.filename === name);
        if (inFile === undefined) {
            throw new Error("No file " + name);
        }
        return inFile.binary;
    }

    /**
     * Run the "disk" command and return the error it fails with, failing the test if it doesn't.
     */
    async function runDiskExpectingError(...words: string[]): Promise<ToolError> {
        let error: unknown = undefined;
        try {
            await runDisk(...words);
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        return error as ToolError;
    }

    it("renames a file and saves it", async () => {
        makeImage([HELLO, WORLD]);
        const helloBytes = fileBytes(imagePathname, "HELLO.BAS");
        const worldBytes = fileBytes(imagePathname, "WORLD.BAS");

        const lines = await runDisk("mv", "HELLO/BAS", "GREET/TXT");
        expect(lines).to.eql(["Renamed HELLO/BAS to GREET/TXT.", "Saved " + imagePathname + "."]);

        expect(fileNames(imagePathname)).to.have.members(["GREET.TXT", "WORLD.BAS"]);
        expect(fileBytes(imagePathname, "GREET.TXT")).to.eql(helloBytes);
        expect(fileBytes(imagePathname, "WORLD.BAS")).to.eql(worldBytes);
    });

    it("ignores case and takes either separator", async () => {
        makeImage([HELLO, WORLD]);
        const lines = await runDisk("mv", "hello.bas", "greet/txt");
        expect(lines[0]).to.equal("Renamed HELLO/BAS to GREET/TXT.");
        expect(fileNames(imagePathname)).to.have.members(["GREET.TXT", "WORLD.BAS"]);
    });

    it("refuses a name that is in use, and saves nothing", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("mv", "HELLO/BAS", "world.bas");
        expect(error.message).to.equal("WORLD/BAS is already on the disk");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("refuses a file that isn't there", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("mv", "nosuch.bas", "GREET");
        expect(error.message).to.equal("No file on the disk is called NOSUCH/BAS");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("refuses a name that isn't a TRSDOS name", async () => {
        makeImage([HELLO]);
        const error = await runDiskExpectingError("mv", "HELLO/BAS", "1BAD");
        expect(error.message).to.include("isn't a TRSDOS file name");
        await expect(runDisk("mv", "HE*", "GREET")).rejects.toThrow(ToolError);
    });

    it("needs --system to rename a system file", async () => {
        makeImage([HELLO, SYSTEM]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("mv", "KERNEL/SYS", "CORE/SYS");
        expect(error.message).to.equal("KERNEL/SYS is a system file (use --system)");
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const lines = await runDisk("mv", "KERNEL/SYS", "CORE/SYS", "--system");
        expect(lines).to.eql(["Renamed KERNEL/SYS to CORE/SYS.", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname, true)).to.have.members(["HELLO.BAS", "BOOT.SYS", "DIR.SYS", "CORE.SYS"]);
    });

    it("never renames BOOT/SYS or DIR/SYS", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        const bootError = await runDiskExpectingError("mv", "BOOT/SYS", "OTHER/SYS", "--system");
        expect(bootError.message).to.match(/can't be renamed/);
        const dirError = await runDiskExpectingError("mv", "DIR/SYS", "OTHER/SYS", "--system");
        expect(dirError.message).to.match(/can't be renamed/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("works under its other names", async () => {
        for (const alias of ["ren", "rename", "move"]) {
            makeImage([HELLO, WORLD]);
            await runDisk(alias, "HELLO/BAS", "GREET/BAS");
            expect(fileNames(imagePathname)).to.have.members(["GREET.BAS", "WORLD.BAS"]);
        }
    });

    it("chains renames, each seeing the one before", async () => {
        makeImage([HELLO, WORLD]);
        const helloBytes = fileBytes(imagePathname, "HELLO.BAS");

        const lines = await runDisk("mv", "HELLO/BAS", "B/BAS", ":", "mv", "B/BAS", "C/BAS");
        expect(lines).to.eql(["Renamed HELLO/BAS to B/BAS.", "Renamed B/BAS to C/BAS.", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname)).to.have.members(["C.BAS", "WORLD.BAS"]);
        expect(fileBytes(imagePathname, "C.BAS")).to.eql(helloBytes);
    });

    it("shows the renamed file in a later dir in the chain", async () => {
        makeImage([HELLO, WORLD]);
        const lines = await runDisk("mv", "HELLO/BAS", "GREET/BAS", ":", "dir");
        const laterText = lines.slice(1).join("\n");
        expect(laterText).to.include("GREET");
        expect(laterText).to.not.include("HELLO");
    });

    it("needs exactly two names", async () => {
        makeImage([HELLO]);
        await expect(runDisk("mv", "HELLO/BAS")).rejects.toThrow(ToolError);
        await expect(runDisk("mv", "HELLO/BAS", "A", "B")).rejects.toThrow(ToolError);
    });
});
