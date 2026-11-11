import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {disk} from "./disk.js";
import {openDiskSession, sessionInputFiles} from "./DiskFiles.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};

describe("disk repair", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-repair-"));
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
     * Make a host file with this many bytes and return its pathname.
     */
    function makeHostFile(name: string, size: number): string {
        const pathname = path.join(dir, name);
        fs.writeFileSync(pathname, new Uint8Array(size).map((_, i) => (i*7 + 31) & 0xFF));
        return pathname;
    }

    it("fixes a disk that only repair may write, and the next command in the chain can write", async () => {
        // A file that uses a granule that the GAT says is free, and a wrong HIT byte.
        makeImage([HELLO, {...WORLD, hitByte: 0x55}], {gatFree: [{lump: 3, granule: 1}]});
        const hostPathname = makeHostFile("extra.txt", 700);

        await expect(runDisk("add", hostPathname, "--binary")).rejects.toThrow(/Can't write to this disk.*damaged/);
        const lines = await runDisk("repair", ":", "add", hostPathname, "--binary");
        expect(lines).to.eql([
            "Marked 1 granule used in the GAT for HELLO/BAS.",
            "Fixed the HIT byte of WORLD/BAS.",
            "The disk is now safe to write.",
            "Added EXTRA/TXT (700 bytes).",
            "Saved " + imagePathname + ".",
        ]);

        const session = openDiskSession(imagePathname);
        expect(session.getReadOnlyReason()).to.be.undefined;
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["HELLO.BAS", "WORLD.BAS", "EXTRA.TXT"]);
        expect(await runDisk("check")).to.eql(["No problems found.", "Safe to write."]);
    });

    it("finds a program that runs past its EOF byte, repairs it, and then finds nothing", async () => {
        // A load block of three bytes at 0x5200, then a transfer record, 11 bytes, with a size that ends inside the
        // transfer record.
        const program = new Uint8Array([0x01, 0x05, 0x00, 0x52, 0xAA, 0xBB, 0xCC, 0x02, 0x02, 0x00, 0x52]);
        makeImage([{name: "PROG/CMD", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}], size: 9, contents: program, data: 0xAA}]);

        const checkLines = await runDisk("check");
        expect(checkLines.join("\n")).to.contain("PROG/CMD's directory gives 9 bytes, but the program runs on 2 bytes");
        expect(checkLines.join("\n")).to.contain("Notes:");
        expect(checkLines[checkLines.length - 1]).to.eql("Safe to write.");

        // Plain repair changes nothing and mentions the option.
        const plain = await runDisk("repair");
        expect(plain.join("\n")).to.contain("1 program runs past its directory size: PROG/CMD. Use --fix-program-sizes to set its size.");
        expect(plain.join("\n")).not.to.contain("Set PROG/CMD's size");
        expect((await runDisk("check")).join("\n")).to.contain("PROG/CMD's directory gives 9 bytes");

        const repairLines = await runDisk("repair", "--fix-program-sizes");
        expect(repairLines[0]).to.eql("Set PROG/CMD's size to 11 bytes, the end of the program, from 9.");

        const after = await runDisk("check");
        expect(after.join("\n")).not.to.contain("PROG/CMD's directory gives");
        expect(after).to.eql(["No problems found.", "Safe to write."]);
    });

    it("says what is left when some damage can't be repaired, and the disk stays read-only", async () => {
        const one: TestFile = {name: "ONE/DAT", extents: [{lump: 6, granuleOffset: 0, granuleCount: 2}]};
        const two: TestFile = {name: "TWO/DAT", extents: [{lump: 6, granuleOffset: 1, granuleCount: 2}], hitByte: 0x77};
        makeImage([one, two]);

        const lines = await runDisk("repair");
        expect(lines.slice(0, 5)).to.eql([
            "Fixed the HIT byte of TWO/DAT.",
            "Not repaired:",
            "  ONE/DAT and TWO/DAT share 1 granule (cylinder 6, granule 1).",
            "    Shared granules can't be repaired automatically: extract the files you need, delete one of the " +
                "files that share, and add it again.",
            lines[4],
        ]);
        expect(lines[4]).to.match(/^The disk is still read-only: The file system is damaged \(1 problem\)/);
        expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");
    });

    it("says so when there is nothing to repair, and changes nothing", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("repair");
        expect(lines).to.eql(["Nothing to repair."]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("frees unclaimed granules only with --free-unclaimed", async () => {
        makeImage([HELLO], {gatUsed: [{lump: 8, granule: 0}, {lump: 8, granule: 1}]});
        const before = fs.readFileSync(imagePathname);

        const hint = await runDisk("repair");
        expect(hint).to.eql([
            "Nothing to repair.",
            "2 granules are marked used but no file claims them. Use --free-unclaimed to free them, unless a " +
                "program keeps data there.",
        ]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const freed = await runDisk("repair", "--free-unclaimed");
        expect(freed).to.eql([
            "Freed 2 granules that the GAT marked used and no file claims.",
            "Saved " + imagePathname + ".",
        ]);
        const granuleMap = openDiskSession(imagePathname).getGranuleMap();
        if (granuleMap === undefined || typeof granuleMap === "string") {
            throw new Error("No granule map");
        }
        expect(granuleMap.getUsedButUnclaimedGranules()).to.eql([]);
    });

    it("refuses a disk that can't be written for a reason other than damage, even with --force", async () => {
        // The disk says TRSDOS 2.x, so naming LDOS makes it read-only, as well as damaged.
        makeImage([HELLO, WORLD], {gatFree: [{lump: 5, granule: 0}]});
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("--dos", "ldos-5", "repair")).rejects.toThrow(/Can't repair this disk: .*TRSDOS/);
        await expect(runDisk("--dos", "ldos-5", "--force", "repair")).rejects.toThrow(/Can't repair this disk/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("can be undone", async () => {
        makeImage([HELLO, WORLD], {gatFree: [{lump: 5, granule: 0}]});
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("repair", ":", "undo");
        expect(lines).to.eql([
            "Marked 1 granule used in the GAT for WORLD/BAS.",
            "The disk is now safe to write.",
            "Undid \"repair\".",
        ]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });
});
