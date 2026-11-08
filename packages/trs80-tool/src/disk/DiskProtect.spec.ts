import fs from "fs";
import os from "os";
import path from "path";
import {
    convertFloppy, decodeTrs80File, floppyImageFormatFromExtension, isFloppy, makeLdosTestHardDiskBinary, makeTrsdos23TestDisk,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {disk} from "./disk.js";

describe("disk protect", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-protect-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

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
     * Make a host file in the temporary directory and return its pathname.
     */
    function makeHostFile(name: string, contents: string): string {
        const pathname = path.join(dir, name);
        fs.writeFileSync(pathname, contents);
        return pathname;
    }

    /**
     * Make an LDOS data disk at this pathname, in the format its extension names.
     */
    async function makeFloppy(imagePathname: string): Promise<void> {
        const dmkPathname = path.join(dir, "made.dmk");
        await runDisk(dmkPathname, "create", "ldos-5.3");
        if (imagePathname.endsWith(".dmk")) {
            fs.renameSync(dmkPathname, imagePathname);
            return;
        }
        const dmk = decodeTrs80File(new Uint8Array(fs.readFileSync(dmkPathname)), {filename: dmkPathname});
        fs.rmSync(dmkPathname);
        if (!isFloppy(dmk)) {
            throw new Error("create didn't make a floppy");
        }
        const format = floppyImageFormatFromExtension(path.extname(imagePathname));
        if (format === undefined) {
            throw new Error("Unknown format: " + imagePathname);
        }
        const converted = convertFloppy(dmk, format);
        if (typeof converted === "string") {
            throw new Error(converted);
        }
        fs.writeFileSync(imagePathname, converted.binary);
    }

    it("turns the flag on and off in DMK, JV3 and HFE floppies", async () => {
        for (const extension of [".dmk", ".jv3", ".hfe"]) {
            const imagePathname = path.join(dir, "test" + extension);
            await makeFloppy(imagePathname);
            const original = new Uint8Array(fs.readFileSync(imagePathname));

            expect((await runDisk(imagePathname, "protect"))[0], extension).to.equal("The image isn't write-protected.");
            expect((await runDisk(imagePathname, "protect", "on"))[0]).to.equal("The image is now write-protected.");
            expect((await runDisk(imagePathname, "protect"))[0]).to.equal("The image is write-protected.");
            expect((await runDisk(imagePathname, "protect", "ON"))[0]).to.equal("The image is already write-protected.");

            // Exactly one byte changed.
            const changed = new Uint8Array(fs.readFileSync(imagePathname));
            const differences = changed.filter((byte, i) => byte !== original[i]).length;
            expect(differences).to.equal(1);

            // The flag keeps files from being changed, until it's cleared.
            const hello = makeHostFile("hello.txt", "HELLO");
            await expect(runDisk(imagePathname, "add", hello)).rejects.toThrow("write-protect");
            expect((await runDisk(imagePathname, "protect", "off"))[0]).to.equal("The image is now writable.");
            expect(new Uint8Array(fs.readFileSync(imagePathname))).to.eql(original);
            await runDisk(imagePathname, "add", hello);
        }
    });

    it("turns the flag on and off in an HDV hard disk, keeping the partition", async () => {
        const imagePathname = path.join(dir, "test.hdv");
        fs.writeFileSync(imagePathname, makeLdosTestHardDiskBinary([
            {name: "ALPHA", cylinderOffset: 0, cylinderCount: 60, dirCylinder: 30, files: []},
        ]));
        expect((await runDisk(imagePathname, "protect", "on"))[0]).to.equal("The image is now write-protected.");
        expect(fs.readFileSync(imagePathname)[7] & 0x80).to.equal(0x80);
        expect(await runDisk(imagePathname, "protect", "off", ":", "dir")).to.include("The image is now writable.");
        expect(fs.readFileSync(imagePathname)[7] & 0x80).to.equal(0);
    });

    it("undoes a change to the flag", async () => {
        const imagePathname = path.join(dir, "test.dmk");
        await runDisk(imagePathname, "create", "ldos-5.3");
        await runDisk(imagePathname, "protect", "on", ":", "undo");
        expect((await runDisk(imagePathname, "protect"))[0]).to.equal("The image isn't write-protected.");
    });

    it("explains why a JV1 image has no flag", async () => {
        const imagePathname = path.join(dir, "test.jv1");
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk([]).binary);
        expect((await runDisk(imagePathname, "protect"))[0]).to.contain("JV1 images have no write-protect flag");
        await expect(runDisk(imagePathname, "protect", "on")).rejects.toThrow("JV1 images have no write-protect flag");
        await expect(runDisk(imagePathname, "protect", "maybe")).rejects.toThrow("Use \"protect on\" or \"protect off\"");
    });
});
