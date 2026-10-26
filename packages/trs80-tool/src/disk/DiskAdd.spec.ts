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

describe("disk add", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-add-"));
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
     * Make a host file in the temporary directory with a repeating pattern of this many bytes, and
     * return its pathname.
     */
    function makeHostFile(name: string, size: number, seed = 1): string {
        const pathname = path.join(dir, name);
        const contents = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            contents[i] = (i*7 + (i >> 8)*13 + seed*31) & 0xFF;
        }
        fs.writeFileSync(pathname, contents);
        return pathname;
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
     * The names of the files on a disk, without system files, in directory order.
     */
    function fileNames(pathname: string): string[] {
        return DiskSession.open(pathname).getInputFiles(false).map(f => f.filename);
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
     * The free granules of a disk.
     */
    function freeGranules(pathname: string): number {
        const granuleMap = DiskSession.open(pathname).getGranuleMap();
        if (granuleMap === undefined || typeof granuleMap === "string") {
            throw new Error("No granule map");
        }
        return granuleMap.getFreeGranuleCount();
    }

    it("adds a host file that reads back byte for byte", async () => {
        makeImage([HELLO, WORLD]);
        const hostPathname = makeHostFile("PROG.BAS", 1234);
        const freeBefore = freeGranules(imagePathname);
        const worldBytes = fileBytes(imagePathname, "WORLD.BAS");

        const lines = await runDisk("add", hostPathname);
        expect(lines).to.eql(["Added PROG/BAS (1,234 bytes).", "Saved " + imagePathname + "."]);

        expect(fileNames(imagePathname)).to.have.members(["HELLO.BAS", "WORLD.BAS", "PROG.BAS"]);
        expect(fileBytes(imagePathname, "PROG.BAS")).to.eql(new Uint8Array(fs.readFileSync(hostPathname)));
        expect(fileBytes(imagePathname, "WORLD.BAS")).to.eql(worldBytes);
        expect(freeGranules(imagePathname)).to.equal(freeBefore - 1);
    });

    it("adds files of several sizes, and they extract back exactly", async () => {
        makeImage([HELLO]);
        const sizes = [0, 100, 5000, 20000];
        const hostPathnames = sizes.map((size, i) => makeHostFile("F" + size + ".dat", size, i));

        const lines = await runDisk("add", ...hostPathnames);
        expect(lines.slice(0, 1)).to.eql(["Added F0/DAT (0 bytes)."]);
        expect(lines[1]).to.equal("Added F100/DAT (100 bytes).");

        sizes.forEach((size, i) => {
            expect(fileBytes(imagePathname, "F" + size + ".DAT")).to.eql(new Uint8Array(fs.readFileSync(hostPathnames[i])));
        });
        // The check finds nothing wrong.
        const checkLines = await runDisk("check");
        expect(checkLines).to.eql(["No problems found.", "Safe to write."]);
    });

    it("works under its other names, and with wildcards", async () => {
        makeImage([HELLO]);
        makeHostFile("a.txt", 10);
        makeHostFile("b.txt", 20);
        makeHostFile("c.txt", 30);

        await runDisk("put", path.join(dir, "a.txt"));
        await runDisk("import", path.join(dir, "[bc].txt"));

        expect(fileNames(imagePathname)).to.have.members(["HELLO.BAS", "A.TXT", "B.TXT", "C.TXT"]);
        expect(fileBytes(imagePathname, "C.TXT").length).to.equal(30);
    });

    it("names the file with --as", async () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("whatever.bin", 77);

        const lines = await runDisk("add", hostPathname, "--as", "game.cmd");
        expect(lines).to.eql(["Added GAME/CMD (77 bytes).", "Saved " + imagePathname + "."]);
        expect(fileBytes(imagePathname, "GAME.CMD").length).to.equal(77);
    });

    it("refuses --as with an invalid name or with two files, and changes nothing", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const a = makeHostFile("a.txt", 5);
        const b = makeHostFile("b.txt", 5);

        await expect(runDisk("add", a, b, "--as", "X")).rejects.toThrow("--as names one file, but 2 host files were given");
        await expect(runDisk("add", a, "--as", "1BAD")).rejects.toThrow("isn't a TRSDOS file name");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("changes a host name that isn't a TRSDOS name, and says so", async () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("hello-world.bas", 50);

        const lines = await runDisk("add", hostPathname);
        expect(lines).to.eql([
            "hello-world.bas will be HELLOWOR/BAS.", "Added HELLOWOR/BAS (50 bytes).", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname)).to.include("HELLOWOR.BAS");
    });

    it("refuses a host name it can't convert", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const hostPathname = makeHostFile("123.txt", 5);

        await expect(runDisk("add", hostPathname)).rejects.toThrow("Give one with --as");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("refuses a name that's on the disk, and changes nothing", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);
        const other = makeHostFile("other.txt", 10);
        const sub = path.join(dir, "sub");
        fs.mkdirSync(sub);
        const hostPathname = path.join(sub, "hello.bas");
        fs.writeFileSync(hostPathname, "10 PRINT");

        await expect(runDisk("add", other, hostPathname)).rejects.toThrow("HELLO/BAS is already on the disk");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("refuses two host files that would have the same name", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const a = makeHostFile("my-file.txt", 5);
        const b = makeHostFile("myfile.txt", 5);

        await expect(runDisk("add", a, b)).rejects.toThrow(/would both be MYFILE\/TXT/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("replaces a file with rm and add in one chain", async () => {
        makeImage([HELLO, WORLD]);
        const hostPathname = makeHostFile("hello.bas", 3000);

        const lines = await runDisk("rm", "HELLO/BAS", ":", "add", hostPathname);
        expect(lines).to.eql(["Removed HELLO/BAS.", "Added HELLO/BAS (3,000 bytes).", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname)).to.have.members(["HELLO.BAS", "WORLD.BAS"]);
        expect(fileBytes(imagePathname, "HELLO.BAS")).to.eql(new Uint8Array(fs.readFileSync(hostPathname)));
    });

    it("sets the system and invisible flags", async () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("kernel.sys", 40);

        await runDisk("add", hostPathname, "--system", "--invisible");

        const session = DiskSession.open(imagePathname);
        const names = session.getInputFiles(false).map(f => f.filename);
        expect(names).to.not.include("KERNEL.SYS");
        expect(session.getInputFiles(true).map(f => f.filename)).to.include("KERNEL.SYS");
    });

    it("warns that a TRSDOS 2.x disk doesn't store dates", async () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("dated.txt", 10);

        const lines = await runDisk("add", hostPathname, "--date", "1983-05-01");
        expect(lines.length).to.equal(3);
        expect(lines[0]).to.equal("Added DATED/TXT (10 bytes).");
        expect(lines[1]).to.include("TRSDOS 2.x disks don't store file dates");
        expect(lines[2]).to.equal("Saved " + imagePathname + ".");
        expect(fileNames(imagePathname)).to.include("DATED.TXT");
    });

    it("refuses a malformed date", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const hostPathname = makeHostFile("a.txt", 10);

        for (const bad of ["1983-02-30", "83-1-1", "1983/05/01", "May 1", "1983-13-01"]) {
            await expect(runDisk("add", hostPathname, "--date", bad)).rejects.toThrow(
                "Invalid --date \"" + bad + "\": use YYYY-MM-DD");
        }
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("refuses a missing host file and a directory", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("add", path.join(dir, "nosuch.txt"))).rejects.toThrow(/Can't read .*nosuch.txt/);
        await expect(runDisk("add", dir)).rejects.toThrow(/isn't a regular file/);
        await expect(runDisk("add", path.join(dir, "*.nosuch"))).rejects.toThrow(ToolError);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("leaves the image unchanged when the disk is full, even if earlier files fit", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const small = makeHostFile("small.txt", 10);
        const huge = makeHostFile("huge.dat", (freeGranules(imagePathname) + 1)*1280);

        await expect(runDisk("add", small, huge)).rejects.toThrow(/Can't add HUGE\/DAT: not enough room/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        expect(fileNames(imagePathname)).to.eql(["HELLO.BAS"]);
    });

    it("saves nothing when a later command in the chain fails", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);
        const hostPathname = makeHostFile("a.txt", 10);

        await expect(runDisk("add", hostPathname, ":", "rm", "NOSUCH")).rejects.toThrow(ToolError);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("sees the new file in later commands of the chain", async () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("a.txt", 10);

        const lines = await runDisk("add", hostPathname, ":", "dir");
        expect(lines.slice(1).join("\n")).to.include("A.TXT");
    });
});
