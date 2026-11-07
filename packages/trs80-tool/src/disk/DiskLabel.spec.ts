import fs from "fs";
import os from "os";
import path from "path";
import {makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};

/**
 * The offset in a JV1 image of the system information sector, which is cylinder 0, sector 2.
 */
const SYSINFO_OFFSET = 2*256;

describe("disk label", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-label-"));
        imagePathname = path.join(dir, "test.jv1");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Write a test disk to the image file, optionally with a TRSDOS 6 system information sector.
     *
     * @param sysInfo whether to put in cylinder 0, sector 2 the beginning of a system information sector
     * (DOS version 6.2, a system disk) with an empty AUTO command.
     */
    function makeImage(sysInfo = false): void {
        const binary = makeTrsdos23TestDisk([HELLO]).binary;
        if (sysInfo) {
            binary[SYSINFO_OFFSET] = 0x62;
            binary[SYSINFO_OFFSET + 0x20] = 0x0D;
            binary[SYSINFO_OFFSET + 0xC0] = 0xFF;
        }
        fs.writeFileSync(imagePathname, binary);
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

    it("shows the information and changes nothing when no option is given", async () => {
        makeImage();
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("label");
        expect(lines).to.eql([
            "Name: TESTDISK",
            "Date: 10/25/26",
            "Master password: PASSWORD",
            "AUTO command: none",
        ]);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("shows the information of a disk under rules that it can't be written by", async () => {
        makeImage();
        // TRSDOS 1.3 rules can't change this disk's information, but showing it needs no write.
        const lines = await runDisk("--dos", "trsdos-1.3", "label");
        expect(lines[0]).to.eql("Name: TESTDISK");
    });

    it("changes the name, date, password and AUTO command, and says what changed", async () => {
        makeImage();

        const lines = await runDisk("label", "--name", "games", "--date", "1983-05-09", "--password", "secret",
            "--auto", 'BASIC RUN"MENU"');
        expect(lines).to.eql([
            'Name is now GAMES. Date is now 05/09/83. Master password is changed. AUTO command is now BASIC RUN"MENU".',
            "Saved " + imagePathname + ".",
        ]);

        const shown = await runDisk("label");
        expect(shown.slice(0, 2)).to.eql(["Name: GAMES", "Date: 05/09/83"]);
        expect(shown[2]).to.match(/^Master password: set \(hash 0x[0-9A-F]{4}\)$/);
        expect(shown[3]).to.eql('AUTO command: BASIC RUN"MENU"');
    });

    it("changes one field and leaves the others", async () => {
        makeImage();

        const lines = await runDisk("label", "--name", "ONLY");
        expect(lines[0]).to.eql("Name is now ONLY.");
        expect(await runDisk("label")).to.eql([
            "Name: ONLY",
            "Date: 10/25/26",
            "Master password: PASSWORD",
            "AUTO command: none",
        ]);
    });

    it("blanks the password, and removes the AUTO command", async () => {
        makeImage();
        await runDisk("label", "--auto", "DIR");
        expect((await runDisk("label"))[3]).to.eql("AUTO command: DIR");

        const lines = await runDisk("label", "--password", "", "--no-auto");
        expect(lines[0]).to.eql("Master password is now blank. AUTO command is removed.");
        const shown = await runDisk("label");
        expect(shown[2]).to.eql("Master password: blank");
        expect(shown[3]).to.eql("AUTO command: none");
    });

    it("refuses a bad value and saves nothing", async () => {
        makeImage();
        const before = fs.readFileSync(imagePathname);

        expect((await runDiskExpectingError("label", "--name", "WAYTOOLONGNAME")).message).to.contain("up to 8 characters");
        expect((await runDiskExpectingError("label", "--name", "OK", "--date", "1983-02-30")).message)
            .to.contain("Invalid --date");
        expect((await runDiskExpectingError("label", "--date", "2020-01-01")).message)
            .to.contain("can't store the year 2020");
        expect((await runDiskExpectingError("label", "--password", "not valid")).message).to.contain("Invalid password");
        expect((await runDiskExpectingError("label", "--auto", "DIR", "--no-auto")).message)
            .to.contain("Use either --auto or --no-auto");
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("keeps the AUTO command of TRSDOS 6 in the system information sector", async () => {
        makeImage(true);
        const before = fs.readFileSync(imagePathname);

        const lines = await runDisk("--dos", "trsdos-6", "--force", "label", "--auto", "do startup/jcl");
        // The first line is the warning about forcing the write.
        expect(lines).to.contain("AUTO command is now do startup/jcl.");

        const after = fs.readFileSync(imagePathname);
        const sysInfoText = Buffer.from(after.subarray(SYSINFO_OFFSET + 0x20, SYSINFO_OFFSET + 0x20 + 16)).toString("latin1");
        expect(sysInfoText).to.eql("do startup/jcl\r\0");
        // Only that sector's AUTO area changed.
        const changedOffsets = Array.from(after.keys()).filter(i => after[i] !== before[i]);
        expect(Math.min(...changedOffsets)).to.eql(SYSINFO_OFFSET + 0x20);
        expect(Math.max(...changedOffsets)).to.eql(SYSINFO_OFFSET + 0x20 + 14);

        const shown = await runDisk("--dos", "trsdos-6", "--force", "label");
        expect(shown[3]).to.eql("AUTO command: do startup/jcl");
    });

    it("says when a TRSDOS 6 disk has no system information sector", async () => {
        makeImage();
        const shown = await runDisk("--dos", "trsdos-6", "--force", "label");
        expect(shown[3]).to.eql("AUTO command: unknown (the disk has no system information sector)");

        const error = await runDiskExpectingError("--dos", "trsdos-6", "--force", "label", "--auto", "DIR");
        expect(error.message).to.contain("no system information sector");
    });
});
