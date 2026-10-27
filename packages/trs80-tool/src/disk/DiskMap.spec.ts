import fs from "fs";
import os from "os";
import path from "path";
import {formatTrsdosDataDisk, makeTrsdos23TestDisk, TrsdosFormatDos, type TestDiskOptions, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {disk} from "./disk.js";
import type {ParsedDiskCommand} from "./DiskCommandParser.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {MAP_COMMAND} from "./DiskMap.js";
import type {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 2, granuleOffset: 0, granuleCount: 3}], size: 3000};
const WORLD: TestFile = {name: "WORLD/BAS", extents: [{lump: 5, granuleOffset: 1, granuleCount: 1}], size: 300};
const KERNEL: TestFile = {name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 2000, system: true};

describe("disk map", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        setColorLevel("off");
        setTerminalWidth(80);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-map-"));
        imagePathname = path.join(dir, "test.jv1");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        delete (process.stdout as any).columns;
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
     * Pretend that stdout is a terminal of this width.
     */
    function setTerminalWidth(columns: number): void {
        Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true, writable: true });
    }

    it("draws the grid and the legend, user files before system files", async () => {
        makeImage([HELLO, WORLD, KERNEL]);
        expect(await runDisk("map")).to.eql([
            "          0         1         2         3",
            "cylinder  01234567890123456789012345678901234",
            "granule 0 B.AA....E........D.................",
            "granule 1 ..A..C..E........D.................",
            "",
            "A  HELLO/BAS   3 granules  3,000 bytes",
            "C  WORLD/BAS   1 granule     300 bytes",
            "E  KERNEL/SYS  2 granules  2,000 bytes  system",
            "",
            ". free   D directory   B boot",
            "9 of 70 granules used, 61 free (76.3 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("never uses a symbol that means something else for a file", async () => {
        // The 2nd and 4th letters would be B and D, which are boot and directory.
        const files: TestFile[] = [];
        for (let i = 0; i < 5; i++) {
            files.push({name: "F" + i + "/DAT", extents: [{lump: 2 + i, granuleOffset: 0, granuleCount: 1}], size: 100});
        }
        makeImage(files);
        expect(await runDisk("map")).to.eql([
            "          0         1         2         3",
            "cylinder  01234567890123456789012345678901234",
            "granule 0 B.ACEFG..........D.................",
            "granule 1 .................D.................",
            "",
            // The legend is in two columns, filled down the first and then the second.
            "A  F0/DAT  1 granule   100 bytes   F  F3/DAT  1 granule   100 bytes",
            "C  F1/DAT  1 granule   100 bytes   G  F4/DAT  1 granule   100 bytes",
            "E  F2/DAT  1 granule   100 bytes",
            "",
            ". free   D directory   B boot",
            "8 of 70 granules used, 62 free (77.5 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("splits into blocks that fit the terminal", async () => {
        makeImage([HELLO, WORLD, KERNEL]);
        setTerminalWidth(30);
        expect(await runDisk("map")).to.eql([
            "          0         1",
            "cylinder  01234567890123456789",
            "granule 0 B.AA....E........D..",
            "granule 1 ..A..C..E........D..",
            "",
            "          2         3",
            "cylinder  012345678901234",
            "granule 0 ...............",
            "granule 1 ...............",
            "",
            "A  HELLO/BAS   3 granules  3,000 bytes",
            "C  WORLD/BAS   1 granule     300 bytes",
            "E  KERNEL/SYS  2 granules  2,000 bytes  system",
            "",
            ". free   D directory   B boot",
            "9 of 70 granules used, 61 free (76.3 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("shows only the files that patterns match, and the rest as o", async () => {
        makeImage([HELLO, WORLD, KERNEL]);
        expect(await runDisk("map", "HELLO*", "KERNEL/SYS")).to.eql([
            "          0         1         2         3",
            "cylinder  01234567890123456789012345678901234",
            "granule 0 B.AA....C........D.................",
            "granule 1 ..A..o..C........D.................",
            "",
            "A  HELLO/BAS   3 granules  3,000 bytes",
            "C  KERNEL/SYS  2 granules  2,000 bytes  system",
            "",
            ". free   D directory   B boot   o other file",
            "9 of 70 granules used, 61 free (76.3 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("doesn't let a wildcard match a system file, and says when nothing matches", async () => {
        makeImage([HELLO, WORLD, KERNEL]);
        await expect(runDisk("map", "KERN*")).rejects.toThrow(
            "No file on the disk matches \"KERN*\" (wildcards don't match system files, so name the file)");
        await expect(runDisk("map", "NOPE")).rejects.toThrow("No file on the disk matches \"NOPE\"");
    });

    it("shows damage in its own symbols", async () => {
        // HELLO's first granule is free in the GAT, KERNEL runs into WORLD's granule, a granule is used by nothing,
        // and a cylinder is locked out.
        const kernel = {...KERNEL, extents: [{lump: 4, granuleOffset: 1, granuleCount: 3}]};
        makeImage([HELLO, WORLD, kernel],
            {gatUsed: [{lump: 20, granule: 1}], gatFree: [{lump: 2, granule: 0}], lockedOut: [30]});
        expect(await runDisk("map")).to.eql([
            "          0         1         2         3",
            "cylinder  01234567890123456789012345678901234",
            "granule 0 B.?A.E...........D............x....",
            "granule 1 ..A.E!...........D..u.........x....",
            "",
            "A  HELLO/BAS   3 granules  3,000 bytes",
            "C  WORLD/BAS   1 granule     300 bytes",
            "E  KERNEL/SYS  3 granules  2,000 bytes  system",
            "",
            ". free   D directory   B boot   x locked out   ! shared by two or more files (1)",
            "? claimed by a file but free in the GAT (1)",
            "u used in the GAT but claimed by no file (1)",
            "12 of 70 granules used, 58 free (72.5 KB), 2 locked out. A granule is 1,280 bytes.",
        ]);
    });

    it("draws a TRSDOS 1.3 disk with a file added", async () => {
        const blank = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 40, sides: 1});
        if (typeof blank === "string") {
            throw new Error(blank);
        }
        imagePathname = path.join(dir, "model3.dmk");
        fs.writeFileSync(imagePathname, blank.binary);
        const hostPathname = path.join(dir, "data.bin");
        fs.writeFileSync(hostPathname, new Uint8Array(3000).fill(0x41));
        await runDisk("add", hostPathname, "--binary");

        // 40 cylinders of 6 granules, the boot granule, the directory in the middle, and the new file after the boot granule.
        expect(await runDisk("map")).to.eql([
            "          0         1         2         3",
            "cylinder  0123456789012345678901234567890123456789",
            "granule 0 B................D......................",
            "granule 1 A................D......................",
            "granule 2 A................D......................",
            "granule 3 A................D......................",
            "granule 4 A................D......................",
            "granule 5 .................D......................",
            "",
            "A  DATA/BIN  4 granules  3,000 bytes",
            "",
            ". free   D directory   B boot",
            "11 of 240 granules used, 229 free (171.8 KB). A granule is 768 bytes.",
        ]);
    });

    it("refuses a disk that isn't TRSDOS-family", async () => {
        const session = {
            fileSystem: {nameAndVersion: "CP/M 2.2"}, pathname: "cpm.dmk",
        } as unknown as DiskSession;
        const command = {name: "map", spec: MAP_COMMAND.spec, args: [], options: new DiskOptionValues()} as unknown as ParsedDiskCommand;
        expect(() => MAP_COMMAND.run(session, command, new DiskOptionValues())).toThrow(
            "map works on TRSDOS-family disks, not CP/M 2.2 disks");
    });
});
