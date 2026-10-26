import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile, type TrsdosWriter} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskSession, DiskWritePurpose} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};
const NOTES: TestFile = {
    name: "NOTES/TXT",
    extents: [{lump: 12, granuleOffset: 0, granuleCount: 1}, {lump: 14, granuleOffset: 1, granuleCount: 1}],
};
const SYSTEM: TestFile = {
    name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 500, system: true,
};

/**
 * Delete HELLO/BAS with the writer.
 */
function removeHello(writer: TrsdosWriter): void {
    const dirEntry = writer.findFile("HELLO/BAS");
    if (dirEntry === undefined) {
        throw new Error("No HELLO/BAS");
    }
    writer.deleteFile(dirEntry);
}

describe("disk rm", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-rm-"));
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
     * The free granules of a disk.
     */
    function freeGranules(pathname: string): number {
        const granuleMap = DiskSession.open(pathname).getGranuleMap();
        if (granuleMap === undefined || typeof granuleMap === "string") {
            throw new Error("No granule map");
        }
        return granuleMap.getFreeGranuleCount();
    }

    it("removes one file, frees its granules, and leaves the others alone", async () => {
        makeImage([HELLO, WORLD, NOTES]);
        const worldBytes = fileBytes(imagePathname, "WORLD.BAS");
        const notesBytes = fileBytes(imagePathname, "NOTES.TXT");
        const freeBefore = freeGranules(imagePathname);

        const lines = await runDisk("rm", "HELLO/BAS");
        expect(lines).to.eql(["Removed HELLO/BAS.", "Saved " + imagePathname + "."]);

        expect(fileNames(imagePathname)).to.eql(["WORLD.BAS", "NOTES.TXT"]);
        expect(fileBytes(imagePathname, "WORLD.BAS")).to.eql(worldBytes);
        expect(fileBytes(imagePathname, "NOTES.TXT")).to.eql(notesBytes);
        expect(freeGranules(imagePathname)).to.equal(freeBefore + 2);
    });

    it("matches wildcards and lowercase names with a dot, and removes a file once", async () => {
        makeImage([HELLO, WORLD, NOTES]);
        const lines = await runDisk("rm", "*.bas", "hello.bas");
        expect(lines).to.eql(["Removed HELLO/BAS.", "Removed WORLD/BAS.", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname)).to.eql(["NOTES.TXT"]);

        makeImage([HELLO, WORLD, NOTES]);
        await runDisk("rm", "hello.bas");
        expect(fileNames(imagePathname)).to.eql(["WORLD.BAS", "NOTES.TXT"]);
    });

    it("works under its other names", async () => {
        for (const alias of ["del", "delete", "kill", "remove"]) {
            makeImage([HELLO, WORLD]);
            await runDisk(alias, "HELLO/BAS");
            expect(fileNames(imagePathname)).to.eql(["WORLD.BAS"]);
        }
    });

    it("removes nothing if any pattern matches no file", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        let error: unknown = undefined;
        try {
            await runDisk("rm", "HELLO/BAS", "NOSUCH/BAS");
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        expect((error as ToolError).message).to.equal("No file on the disk matches \"NOSUCH/BAS\"");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("leaves the session unchanged when the change fails partway", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);
        expect(() => session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            removeHello(writer);
            throw new ToolError("Something else went wrong");
        })).to.throw(ToolError, "Something else went wrong");
        expect(session.hasChanges()).to.equal(false);
        expect(session.getInputFiles(false).length).to.equal(2);
    });

    it("removes a system file by name, but no wildcard reaches it", async () => {
        makeImage([HELLO, SYSTEM]);
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("rm", "KERNEL/S*")).rejects.toThrow(
            "No file on the disk matches \"KERNEL/S*\" (wildcards don't match system files, so name the file)");
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        // The "*" pattern doesn't reach it either.
        await runDisk("rm", "*");
        expect(fileNames(imagePathname, true)).to.have.members(["BOOT.SYS", "DIR.SYS", "KERNEL.SYS"]);

        makeImage([HELLO, SYSTEM]);
        const lines = await runDisk("rm", "KERNEL/SYS");
        expect(lines).to.eql(["Removed KERNEL/SYS.", "Saved " + imagePathname + "."]);
        expect(fileNames(imagePathname, true)).to.have.members(["HELLO.BAS", "BOOT.SYS", "DIR.SYS"]);
    });

    it("never removes BOOT/SYS or DIR/SYS", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("rm", "BOOT/SYS")).rejects.toThrow(/can't be deleted/);
        await expect(runDisk("rm", "DIR/SYS")).rejects.toThrow(/can't be deleted/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("saves nothing when a later command in the chain fails", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("rm", "HELLO/BAS", ":", "rm", "NOSUCH")).rejects.toThrow(ToolError);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        expect(fileNames(imagePathname)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
    });

    it("sees the removal in later commands of the chain", async () => {
        makeImage([HELLO, WORLD]);
        const freeBefore = freeGranules(imagePathname);
        const lines = await runDisk("rm", "HELLO/BAS", ":", "dir", ":", "free");
        expect(lines.slice(0, 1)).to.eql(["Removed HELLO/BAS."]);
        const laterText = lines.slice(1).join("\n");
        expect(laterText).to.not.include("HELLO");
        expect(laterText).to.include("WORLD");
        expect(freeGranules(imagePathname)).to.equal(freeBefore + 2);
    });

    it("writes only the --output file", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);
        const outputPathname = path.join(dir, "out.jv1");

        await runDisk("-o", outputPathname, "rm", "HELLO/BAS");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        expect(fileNames(outputPathname)).to.eql(["WORLD.BAS"]);
    });

    it("writes nothing with --dry-run", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);
        const outputPathname = path.join(dir, "out.jv1");

        const lines = await runDisk("--dry-run", "-o", outputPathname, "rm", "HELLO/BAS");
        expect(lines).to.eql(["Removed HELLO/BAS.",
            "Not saved (--dry-run): " + outputPathname + " would have changed."]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        expect(fs.existsSync(outputPathname)).to.equal(false);
    });

    it("refuses a disk with a problem, and --force removes anyway", async () => {
        // A file that uses a granule that the GAT says is free.
        makeImage([HELLO, WORLD], { gatFree: [{lump: 5, granule: 0}] });
        const before = fs.readFileSync(imagePathname);

        await expect(runDisk("rm", "HELLO/BAS")).rejects.toThrow(/Can't write to this disk.*--force/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const lines = await runDisk("--force", "rm", "HELLO/BAS");
        expect(lines[0]).to.match(/^.*Writing anyway \(--force\)/);
        expect(fileNames(imagePathname)).to.eql(["WORLD.BAS"]);
    });

    it("refuses a write-protected image, and --force writes it anyway", () => {
        makeImage([HELLO, WORLD]);

        const refused = DiskSession.open(imagePathname);
        refused.floppy.setMountedWriteProtected(true);
        expect(() => refused.changeTrsdos(DiskWritePurpose.CHANGE, writer => removeHello(writer)))
            .to.throw(ToolError, /write-protected.*--force/);
        expect(refused.hasChanges()).to.equal(false);

        const forced = DiskSession.open(imagePathname, { force: true });
        forced.floppy.setMountedWriteProtected(true);
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            forced.changeTrsdos(DiskWritePurpose.CHANGE, writer => removeHello(writer));
        } finally {
            spy.mockRestore();
        }
        expect(forced.hasChanges()).to.equal(true);
        expect(forced.getInputFiles(false).map(f => f.filename)).to.eql(["WORLD.BAS"]);
    });

    it("refuses a file system that isn't TRSDOS-family", async () => {
        // Blank: no file system.
        fs.writeFileSync(imagePathname, new Uint8Array(35*10*256));
        await expect(runDisk("rm", "HELLO/BAS")).rejects.toThrow(ToolError);
    });
});
