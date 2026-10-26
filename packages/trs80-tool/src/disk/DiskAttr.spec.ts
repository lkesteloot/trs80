import fs from "fs";
import os from "os";
import path from "path";
import {hashTrsdosPassword, makeTrsdos23TestDisk, type TestDiskOptions, type TestFile, Trsdos, type TrsdosDirEntry} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}], size: 300};
const NOTES: TestFile = {name: "NOTES/TXT", extents: [{lump: 6, granuleOffset: 0, granuleCount: 1}], size: 100};
const SYSTEM: TestFile = {
    name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 500, system: true,
};

describe("disk attr", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-attr-"));
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

    /**
     * The directory entry of the named file (such as "HELLO/BAS") as it is on the saved image.
     */
    function getEntry(name: string): TrsdosDirEntry {
        const trsdos = DiskSession.open(imagePathname).fileSystem;
        if (!(trsdos instanceof Trsdos)) {
            throw new Error("Not TRSDOS");
        }
        const dirEntry = trsdos.findFile(name);
        if (dirEntry === undefined) {
            throw new Error("No file " + name);
        }
        return dirEntry;
    }

    it("shows the attributes and changes nothing when no attribute is given", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("attr", "*");
        expect(lines).to.eql(["HELLO/BAS: protection FULL", "WORLD/BAS: protection FULL"]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("makes files invisible and visible again", async () => {
        makeImage([HELLO, WORLD]);

        const lines = await runDisk("attr", "HELLO/BAS", "--invisible");
        expect(lines).to.eql(["Changed HELLO/BAS: invisible.", "Saved " + imagePathname + "."]);
        expect(getEntry("HELLO/BAS").isHidden()).to.eql(true);
        expect(getEntry("WORLD/BAS").isHidden()).to.eql(false);

        const shown = await runDisk("attr", "*");
        expect(shown[0]).to.equal("HELLO/BAS: protection FULL, invisible");

        const lines2 = await runDisk("attr", "hello.bas", "--visible");
        expect(lines2[0]).to.equal("Changed HELLO/BAS: visible.");
        expect(getEntry("HELLO/BAS").isHidden()).to.eql(false);
    });

    it("sets the protection level by name or number, case-insensitively", async () => {
        makeImage([HELLO]);

        const lines = await runDisk("attr", "HELLO/BAS", "--protect", "read");
        expect(lines[0]).to.equal("Changed HELLO/BAS: protection READ.");
        expect(getEntry("HELLO/BAS").getProtectionLevel()).to.equal(5);

        // This disk uses the LDOS names, where 4 is WRITE.
        const lines2 = await runDisk("attr", "HELLO/BAS", "--protect=4");
        expect(lines2[0]).to.equal("Changed HELLO/BAS: protection WRITE.");
        expect(getEntry("HELLO/BAS").getProtectionLevel()).to.equal(4);

        const lines3 = await runDisk("attr", "HELLO/BAS", "--protect", "Kill");
        expect(lines3[0]).to.equal("Changed HELLO/BAS: protection KILL.");
        expect(getEntry("HELLO/BAS").getProtectionLevel()).to.equal(1);
    });

    it("lists the valid levels for an unknown name, and saves nothing", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "HELLO/BAS", "--protect", "bogus");
        expect(error.message).to.equal("Invalid --protect \"bogus\": use one of FULL (0), KILL (1), RENAME (2), " +
            "WRITE (4), READ (5), EXEC (6), NO_ACCESS (7) (or a number 0 to 7)");
        const numberError = await runDiskExpectingError("attr", "HELLO/BAS", "--protect", "9");
        expect(numberError.message).to.include("Invalid --protect \"9\"");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("sets and removes the passwords", async () => {
        makeImage([HELLO]);

        const lines = await runDisk("attr", "HELLO/BAS", "--password", "boss", "--access-password", "open");
        expect(lines[0]).to.equal("Changed HELLO/BAS: update password set, access password set.");
        expect(getEntry("HELLO/BAS").updatePassword).to.equal(hashTrsdosPassword("BOSS"));
        expect(getEntry("HELLO/BAS").accessPassword).to.equal(hashTrsdosPassword("OPEN"));

        const shown = await runDisk("attr", "HELLO/BAS");
        expect(shown).to.eql(["HELLO/BAS: protection FULL, update password, access password"]);

        const lines2 = await runDisk("attr", "HELLO/BAS", "--password=", "--access-password", "");
        expect(lines2[0]).to.equal("Changed HELLO/BAS: update password removed, access password removed.");
        expect(getEntry("HELLO/BAS").updatePassword).to.equal(hashTrsdosPassword(""));
        expect(getEntry("HELLO/BAS").accessPassword).to.equal(hashTrsdosPassword(""));
    });

    it("refuses a password the DOS wouldn't accept", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "HELLO/BAS", "--password", "9lives");
        expect(error.message).to.include("Invalid password \"9lives\"");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("changes several attributes of several files at once", async () => {
        makeImage([HELLO, WORLD, NOTES]);

        const lines = await runDisk("attr", "*.BAS", "NOTES/TXT", "--invisible", "--protect", "exec", "--password", "boss");
        expect(lines).to.eql([
            "Changed HELLO/BAS: invisible, protection EXEC, update password set.",
            "Changed WORLD/BAS: invisible, protection EXEC, update password set.",
            "Changed NOTES/TXT: invisible, protection EXEC, update password set.",
            "Saved " + imagePathname + ".",
        ]);
        for (const name of ["HELLO/BAS", "WORLD/BAS", "NOTES/TXT"]) {
            expect(getEntry(name).isHidden()).to.eql(true);
            expect(getEntry(name).getProtectionLevel()).to.equal(6);
        }
    });

    it("needs every pattern to match, and saves nothing otherwise", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "HELLO/BAS", "NOSUCH/*", "--invisible");
        expect(error.message).to.equal("No file on the disk matches \"NOSUCH/*\"");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        await expect(runDisk("attr", "NOSUCH/*")).rejects.toThrow("No file on the disk matches");
    });

    it("needs --include-system to match system files", async () => {
        makeImage([HELLO, SYSTEM]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "KERNEL/SYS", "--invisible");
        expect(error.message).to.equal(
            "No file on the disk matches \"KERNEL/SYS\", but a system file does (use --include-system)");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        // A pattern that matches a user file doesn't touch the system file.
        const lines = await runDisk("attr", "*", "--invisible");
        expect(lines).to.eql(["Changed HELLO/BAS: invisible.", "Saved " + imagePathname + "."]);
        expect(getEntry("KERNEL/SYS").isHidden()).to.eql(false);

        const lines2 = await runDisk("attr", "KERNEL/SYS", "--invisible", "--include-system");
        expect(lines2[0]).to.equal("Changed KERNEL/SYS: invisible.");
        expect(getEntry("KERNEL/SYS").isHidden()).to.eql(true);

        const shown = await runDisk("attr", "KERNEL/SYS", "--include-system");
        expect(shown).to.eql(["KERNEL/SYS: protection FULL, invisible, system"]);
    });

    it("sets and clears the system flag", async () => {
        makeImage([HELLO]);

        const lines = await runDisk("attr", "HELLO/BAS", "--system");
        expect(lines[0]).to.equal("Changed HELLO/BAS: system.");
        expect(getEntry("HELLO/BAS").isSystemFile()).to.eql(true);

        const lines2 = await runDisk("attr", "HELLO/BAS", "--no-system", "--include-system");
        expect(lines2[0]).to.equal("Changed HELLO/BAS: user file.");
        expect(getEntry("HELLO/BAS").isSystemFile()).to.eql(false);
    });

    it("never changes BOOT/SYS or DIR/SYS between system and user file", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "BOOT/SYS", "--no-system", "--include-system");
        expect(error.message).to.equal("BOOT/SYS can't become a user file: the DOS needs it as it is");
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        // Other attributes are fine.
        const lines = await runDisk("attr", "BOOT/SYS", "--include-system", "--password", "boss");
        expect(lines[0]).to.equal("Changed BOOT/SYS: update password set.");
    });

    it("refuses a date on a DOS that doesn't store dates", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        const error = await runDiskExpectingError("attr", "HELLO/BAS", "--date", "1983-05-01");
        expect(error.message).to.equal("Can't set the date of HELLO/BAS: TRSDOS 2.x disks don't store file dates");
        const noDateError = await runDiskExpectingError("attr", "HELLO/BAS", "--no-date");
        expect(noDateError.message).to.include("disks don't store file dates");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("sets and removes a date on a DOS that stores dates", async () => {
        makeImage([HELLO]);

        // The test disk says it's TRSDOS 2.x, so make it write by LDOS 5's rules.
        const lines = await runDisk("--dos", "ldos-5", "--force", "attr", "HELLO/BAS", "--date", "1983-05-01");
        expect(lines).to.include("Changed HELLO/BAS: date 1983-05-01.");
        expect(getEntry("HELLO/BAS").getDate()).to.eql(new Date(1983, 4, 1));
        const shown = await runDisk("attr", "HELLO/BAS");
        expect(shown).to.eql(["HELLO/BAS: protection FULL, date 01/05/1983"]);

        const lines2 = await runDisk("--dos", "ldos-5", "--force", "attr", "HELLO/BAS", "--no-date");
        expect(lines2).to.include("Changed HELLO/BAS: no date.");
        expect(getEntry("HELLO/BAS").month).to.equal(0);
        expect(await runDisk("attr", "HELLO/BAS")).to.eql(["HELLO/BAS: protection FULL"]);
    });

    it("refuses a malformed date", async () => {
        makeImage([HELLO]);
        for (const bad of ["1983-5-1", "1983-02-30", "tomorrow"]) {
            await expect(runDisk("attr", "HELLO/BAS", "--date", bad)).rejects.toThrow(
                "Invalid --date \"" + bad + "\": use YYYY-MM-DD");
        }
    });

    it("refuses options that contradict each other", async () => {
        makeImage([HELLO]);
        const before = fs.readFileSync(imagePathname);

        expect((await runDiskExpectingError("attr", "HELLO/BAS", "--invisible", "--visible")).message)
            .to.equal("Use either --invisible or --visible, not both");
        expect((await runDiskExpectingError("attr", "HELLO/BAS", "--system", "--no-system")).message)
            .to.equal("Use either --system or --no-system, not both");
        expect((await runDiskExpectingError("attr", "HELLO/BAS", "--date", "1983-05-01", "--no-date")).message)
            .to.equal("Use either --date or --no-date, not both");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("needs at least one pattern", async () => {
        makeImage([HELLO]);
        await expect(runDisk("attr", "--invisible")).rejects.toThrow(ToolError);
    });

    it("works under its other name", async () => {
        makeImage([HELLO]);
        const lines = await runDisk("attrib", "HELLO/BAS", "--invisible");
        expect(lines[0]).to.equal("Changed HELLO/BAS: invisible.");
    });

    it("saves nothing when a later file is refused", async () => {
        makeImage([HELLO, WORLD]);
        const before = fs.readFileSync(imagePathname);

        // BOOT/SYS is refused after HELLO/BAS (in directory order) has been changed in memory.
        const error = await runDiskExpectingError("attr", "*", "BOOT/SYS", "--include-system", "--no-system");
        expect(error.message).to.include("can't become a user file");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("sees an earlier command's changes in a chain", async () => {
        makeImage([HELLO, WORLD]);
        const lines = await runDisk("mv", "HELLO/BAS", "GREET/BAS", ":", "attr", "GREET/BAS", "--protect", "read");
        expect(lines).to.eql(["Renamed HELLO/BAS to GREET/BAS.", "Changed GREET/BAS: protection READ.",
            "Saved " + imagePathname + "."]);
        expect(getEntry("GREET/BAS").getProtectionLevel()).to.equal(5);
    });
});
