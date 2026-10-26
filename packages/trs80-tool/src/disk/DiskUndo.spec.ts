import fs from "fs";
import os from "os";
import path from "path";
import {
    type DmkFloppyDisk, formatTrsdosDataDisk, makeBlankFloppy, makeTrsdos23TestDisk, type TestFile,
    TRSDOS_23_TRACK_LAYOUT, TrsdosFormatDos,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {disk} from "./disk.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {DiskSession, MAX_UNDO_STATES} from "./DiskSession.js";
import {runDiskLine} from "./DiskShell.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};

/** The size of a DMK file's header. */
const DMK_HEADER_SIZE = 16;

describe("disk undo, redo and revert", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-undo-"));
        imagePathname = path.join(dir, "test.jv1");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Write a TRSDOS 2.3 test disk to the image file.
     */
    function makeImage(files: TestFile[]): void {
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk(files).binary);
    }

    /**
     * Make a host file in the temporary directory with this many bytes, and return its pathname.
     */
    function makeHostFile(name: string, size: number): string {
        const pathname = path.join(dir, name);
        const contents = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            contents[i] = (i*7 + 31) & 0xFF;
        }
        fs.writeFileSync(pathname, contents);
        return pathname;
    }

    /**
     * Run one line of the shell on the session and return what it printed.
     */
    function run(session: DiskSession, line: string): string[] {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            runDiskLine(session, line, new DiskOptionValues());
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run the "disk" command on the image with these words after it, and return what it printed.
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
     * The names of the files on the session's disk, without system files, in directory order.
     */
    function fileNames(session: DiskSession): string[] {
        return session.getInputFiles(false).map(f => f.filename);
    }

    /**
     * The names of the files on a disk image on the host, without system files, in directory order.
     */
    function fileNamesOnHost(pathname: string): string[] {
        return fileNames(DiskSession.open(pathname));
    }

    it("undoes an add, leaving nothing to save", () => {
        makeImage([HELLO]);
        const hostPathname = makeHostFile("PROG.BAS", 500);
        const session = DiskSession.open(imagePathname);

        run(session, "add " + hostPathname + " --binary");
        expect(fileNames(session)).to.eql(["HELLO.BAS", "PROG.BAS"]);
        expect(session.hasChanges()).to.equal(true);

        const lines = run(session, "undo");
        expect(lines).to.eql(["Undid \"add " + hostPathname + " --binary\"."]);
        expect(fileNames(session)).to.eql(["HELLO.BAS"]);
        expect(session.hasChanges()).to.equal(false);
        expect(session.save()).to.equal(undefined);
    });

    it("undoes several changes in turn, and keeps changes that were not undone", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "label --name SECOND");
        expect(run(session, "undo")).to.eql(["Undid \"label --name SECOND\"."]);
        expect(fileNames(session)).to.eql(["WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(true);

        expect(run(session, "undo")).to.eql(["Undid \"rm HELLO.BAS\"."]);
        expect(fileNames(session)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(false);
    });

    it("redoes what was undone", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "undo");
        expect(session.hasChanges()).to.equal(false);

        expect(run(session, "redo")).to.eql(["Redid \"rm HELLO.BAS\"."]);
        expect(fileNames(session)).to.eql(["WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(true);

        // And undo again, to show that the redone change is on the undo stack.
        run(session, "undo");
        expect(fileNames(session)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
    });

    it("clears the redo stack when there is a new change after an undo", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "undo");
        run(session, "rm WORLD.BAS");
        expect(run(session, "redo")).to.eql(["Nothing to redo."]);
        expect(fileNames(session)).to.eql(["HELLO.BAS"]);
    });

    it("says there is nothing to undo, redo or revert, and isn't an error", () => {
        makeImage([HELLO]);
        const session = DiskSession.open(imagePathname);

        expect(run(session, "undo")).to.eql(["Nothing to undo."]);
        expect(run(session, "redo")).to.eql(["Nothing to redo."]);
        expect(run(session, "revert")).to.eql(["Nothing to revert: the disk is as last saved."]);
        expect(session.hasChanges()).to.equal(false);

        // Commands that change nothing aren't recorded, whether they print or fail.
        run(session, "dir");
        run(session, "label");
        expect(() => run(session, "rm NOSUCH.BAS")).to.throw();
        expect(run(session, "undo")).to.eql(["Nothing to undo."]);
    });

    it("doesn't record undo, redo and revert themselves", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "undo");
        run(session, "redo");
        run(session, "undo");
        // Had those been recorded, there would be more to undo than the one change.
        expect(run(session, "undo")).to.eql(["Nothing to undo."]);
        expect(run(session, "redo")).to.eql(["Redid \"rm HELLO.BAS\"."]);
        expect(run(session, "redo")).to.eql(["Nothing to redo."]);
    });

    it("quotes an argument with spaces in the command it names", () => {
        makeImage([HELLO]);
        const session = DiskSession.open(imagePathname);

        run(session, "label --auto \"BASIC RUN\\\"X\\\"\"");
        expect(run(session, "undo")[0]).to.match(/^Undid "label --auto "/);
    });

    it("undoes a create back to having no disk, and redoes it", () => {
        const missingPathname = path.join(dir, "new.dmk");
        const session = DiskSession.open(missingPathname);

        run(session, "create --dos ldos-5.3");
        expect(session.hasDisk()).to.equal(true);
        expect(session.hasChanges()).to.equal(true);

        expect(run(session, "undo")).to.eql(["Undid \"create --dos ldos-5.3\"."]);
        expect(session.hasDisk()).to.equal(false);
        expect(session.hasChanges()).to.equal(false);
        expect(session.fileSystem).to.equal(undefined);
        expect(session.save()).to.equal(undefined);

        expect(run(session, "redo")).to.eql(["Redid \"create --dos ldos-5.3\"."]);
        expect(session.hasDisk()).to.equal(true);
        expect(session.fileSystem?.nameAndVersion).to.match(/^LDOS/);
        expect(session.hasChanges()).to.equal(true);
        expect(session.save()).to.equal(missingPathname);
    });

    it("undoes a format back to the old image format", () => {
        makeImage([HELLO, WORLD]);
        const original = fs.readFileSync(imagePathname);
        // A format makes a DMK image, which it won't save under the name of a JV1 one.
        const session = DiskSession.open(imagePathname, { outputPathname: path.join(dir, "new.dmk") });
        expect(session.floppy.className).to.equal("Jv1FloppyDisk");

        run(session, "format --force");
        expect(session.floppy.className).to.equal("DmkFloppyDisk");
        expect(fileNames(session)).to.eql([]);

        run(session, "undo");
        expect(session.floppy.className).to.equal("Jv1FloppyDisk");
        expect(fileNames(session)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
        expect(session.floppy.binary).to.eql(new Uint8Array(original));
        expect(session.hasChanges()).to.equal(false);

        run(session, "redo");
        expect(session.floppy.className).to.equal("DmkFloppyDisk");
        expect(fileNames(session)).to.eql([]);
    });

    it("undoes a trim back to the untrimmed image", () => {
        const formatted: DmkFloppyDisk | string = formatTrsdosDataDisk({
            dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 40, sides: 1,
        });
        if (typeof formatted === "string") {
            throw new Error(formatted);
        }
        const blank = makeBlankFloppy(TRSDOS_23_TRACK_LAYOUT, 80, 1);
        if (blank === undefined) {
            throw new Error("Couldn't make the blank disk");
        }
        const binary = blank.binary.slice();
        binary.set(formatted.binary.subarray(DMK_HEADER_SIZE), DMK_HEADER_SIZE);
        const pathname = path.join(dir, "big.dmk");
        fs.writeFileSync(pathname, binary);

        const session = DiskSession.open(pathname);
        expect(session.floppy.getGeometry().cylinderCount).to.equal(80);

        run(session, "trim");
        expect(session.floppy.getGeometry().cylinderCount).to.equal(40);
        expect(session.hasChanges()).to.equal(true);

        run(session, "undo");
        expect(session.floppy.className).to.equal("DmkFloppyDisk");
        expect(session.floppy.getGeometry().cylinderCount).to.equal(80);
        expect(session.floppy.binary).to.eql(binary);
        expect(session.hasChanges()).to.equal(false);
    });

    it("reverts several changes at once, and the revert can be undone", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "label --name SECOND");
        run(session, "rm WORLD.BAS");
        expect(fileNames(session)).to.eql([]);

        expect(run(session, "revert")).to.eql(["Reverted to the disk as last saved."]);
        expect(fileNames(session)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(false);
        expect(run(session, "revert")).to.eql(["Nothing to revert: the disk is as last saved."]);

        expect(run(session, "undo")).to.eql(["Undid \"revert\"."]);
        expect(fileNames(session)).to.eql([]);
        expect(session.hasChanges()).to.equal(true);

        // The changes before the revert are still there to undo, one at a time.
        run(session, "undo");
        expect(fileNames(session)).to.eql(["WORLD.BAS"]);
    });

    it("reverts to the disk as last saved, not as opened", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        expect(run(session, "save")).to.eql(["Saved " + imagePathname + "."]);
        run(session, "rm WORLD.BAS");
        expect(fileNames(session)).to.eql([]);

        run(session, "revert");
        expect(fileNames(session)).to.eql(["WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(false);
        expect(fileNamesOnHost(imagePathname)).to.eql(["WORLD.BAS"]);
    });

    it("reverts a create of an image that never existed to having no disk", () => {
        const session = DiskSession.open(path.join(dir, "new.dmk"));

        run(session, "create --dos trsdos-2.3");
        run(session, "label --name SECOND");
        run(session, "revert");
        expect(session.hasDisk()).to.equal(false);
        expect(session.hasChanges()).to.equal(false);
    });

    it("counts the disk as changed again after undoing past a save", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "save");
        expect(session.hasChanges()).to.equal(false);

        run(session, "undo");
        expect(fileNames(session)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
        expect(session.hasChanges()).to.equal(true);

        // Redoing gets back to what is saved.
        run(session, "redo");
        expect(session.hasChanges()).to.equal(false);
    });

    it("saves the undone state on quit after a save and an undo", () => {
        makeImage([HELLO, WORLD]);
        const session = DiskSession.open(imagePathname);

        run(session, "rm HELLO.BAS");
        run(session, "save");
        expect(fileNamesOnHost(imagePathname)).to.eql(["WORLD.BAS"]);

        run(session, "undo");
        expect(run(session, "quit")).to.eql(["Saved " + imagePathname + "."]);
        expect(fileNamesOnHost(imagePathname)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
    });

    it("works in a chain of commands", async () => {
        makeImage([HELLO, WORLD]);

        const lines = await runDisk("rm", "HELLO.BAS", ":", "save", ":", "undo", ":", "dir");
        expect(lines.slice(0, 3)).to.eql(["Removed HELLO/BAS.", "Saved " + imagePathname + ".", "Undid \"rm HELLO.BAS\"."]);
        // The undone state is saved at the end of the chain.
        expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");
        expect(fileNamesOnHost(imagePathname)).to.eql(["HELLO.BAS", "WORLD.BAS"]);
    });

    it("saves nothing at the end of a chain that undoes everything", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("rm", "HELLO.BAS", ":", "undo");
        expect(lines).to.eql(["Removed HELLO/BAS.", "Undid \"rm HELLO.BAS\"."]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("keeps only the most recent states, dropping the oldest", () => {
        makeImage([HELLO]);
        const session = DiskSession.open(imagePathname);
        const changeCount = MAX_UNDO_STATES + 5;
        const nameOf = (i: number): string => "D" + String(i).padStart(3, "0");

        for (let i = 1; i <= changeCount; i++) {
            run(session, "label --name " + nameOf(i));
        }
        expect(run(session, "label")[0]).to.equal("Name: " + nameOf(changeCount));

        let undone = 0;
        while (run(session, "undo")[0] !== "Nothing to undo.") {
            undone++;
        }
        expect(undone).to.equal(MAX_UNDO_STATES);
        // The five oldest changes can't be undone, so the disk is left with the fifth name.
        expect(run(session, "label")[0]).to.equal("Name: " + nameOf(5));
        // The disk is still saved correctly, since it differs from what was opened.
        expect(session.hasChanges()).to.equal(true);

        // Everything undone can be redone.
        let redone = 0;
        while (run(session, "redo")[0] !== "Nothing to redo.") {
            redone++;
        }
        expect(redone).to.equal(MAX_UNDO_STATES);
        expect(run(session, "label")[0]).to.equal("Name: " + nameOf(changeCount));
    });

    it("reverts to the saved disk even after the history that reaches it was dropped", () => {
        makeImage([HELLO]);
        const session = DiskSession.open(imagePathname);

        for (let i = 1; i <= MAX_UNDO_STATES + 5; i++) {
            run(session, "label --name D" + String(i).padStart(3, "0"));
        }
        run(session, "revert");
        expect(session.hasChanges()).to.equal(false);
        expect(session.describe()).to.contain("1 file");
        expect(run(session, "label")[0]).to.not.match(/^Name: D/);
    });
});
