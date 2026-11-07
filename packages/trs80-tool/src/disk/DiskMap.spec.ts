import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeTrsdos, formatTrsdosDataDisk, makeTrsdos23TestDisk, Trsdos, TrsdosFormatDos, TrsdosGranuleMap,
    type TestDiskOptions, type TestFile,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {disk} from "./disk.js";
import type {ParsedDiskCommand} from "./DiskCommandParser.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {drawGranuleMap, MAP_COMMAND} from "./DiskMap.js";
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

    /**
     * Keep the ruler, the lines that show anything but free sectors, and everything after the grid, so that a test
     * of a big disk can name the part it cares about.
     *
     * @param lines the output of the map command.
     * @param gutterWidth the width of the cylinder and side columns.
     * @param rulerLineCount the number of lines of ruler.
     */
    function withoutFreeLines(lines: string[], gutterWidth: number, rulerLineCount: number): string[] {
        const gridEnd = lines.indexOf("");
        return lines.filter((line, i) => i < rulerLineCount || i >= gridEnd || /[^\s·│]/.test(line.slice(gutterWidth)));
    }

    it("draws a line for each cylinder and a cell for each sector, with names and granule ends", async () => {
        makeImage([HELLO, WORLD, KERNEL], {cylinderCount: 18});
        expect(await runDisk("map")).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9",
            "  0  BOOT/SYS ─────│·  ·  ·  ·  · │",
            "  1  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  2  HELLO/BAS ────│──────────────│",
            "  3  HELLO/BAS ────│·  ·  ·  ·  · │",
            "  4  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  5  ·  ·  ·  ·  · │WORLD/BAS ────│",
            "  6  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  7  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  8  KERNEL/SYS ───│──────────────│",
            "  9  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 10  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 11  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 12  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 13  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 14  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 15  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 16  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 17  DIR/SYS ──────│──────────────│",
            "",
            "· free",
            "9 of 36 granules used, 27 free (33.8 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("shows only the files that patterns match, and the rest as plain runs", async () => {
        makeImage([HELLO, WORLD, KERNEL], {cylinderCount: 18});
        expect(await runDisk("map", "HELLO*", "KERNEL/SYS")).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9",
            "  0  BOOT/SYS ─────│·  ·  ·  ·  · │",
            "  1  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  2  HELLO/BAS ────│──────────────│",
            "  3  HELLO/BAS ────│·  ·  ·  ·  · │",
            "  4  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  5  ·  ·  ·  ·  · │──────────────│",
            "  6  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  7  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  8  KERNEL/SYS ───│──────────────│",
            "  9  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 10  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 11  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 12  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 13  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 14  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 15  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 16  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 17  DIR/SYS ──────│──────────────│",
            "",
            "HELLO/BAS   3 granules  3,000 bytes",
            "KERNEL/SYS  2 granules  2,000 bytes  system",
            "",
            "· free   ─ other file",
            "9 of 36 granules used, 27 free (33.8 KB). A granule is 1,280 bytes.",
        ]);
    });

    it("lists a matched file that has no granules, since it isn't in the grid", async () => {
        makeImage([HELLO, {name: "EMPTY/DAT", extents: [], size: 0}], {cylinderCount: 18});
        expect(await runDisk("map", "EMPTY/DAT")).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9",
            "  0  BOOT/SYS ─────│·  ·  ·  ·  · │",
            "  1  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  2  ──────────────│──────────────│",
            "  3  ──────────────│·  ·  ·  ·  · │",
            "  4  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  5  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  6  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  7  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  8  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  9  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 10  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 11  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 12  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 13  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 14  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 15  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 16  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 17  DIR/SYS ──────│──────────────│",
            "",
            "EMPTY/DAT  0 granules  0 bytes",
            "",
            "· free   ─ other file",
            "6 of 36 granules used, 30 free (37.5 KB). A granule is 1,280 bytes.",
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
            {cylinderCount: 32, gatUsed: [{lump: 20, granule: 1}], gatFree: [{lump: 2, granule: 0}], lockedOut: [30]});
        expect(await runDisk("map")).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9",
            "  0  BOOT/SYS ─────│·  ·  ·  ·  · │",
            "  1  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  2  ??????????????│HELLO/BAS ────│",
            "  3  HELLO/BAS ────│·  ·  ·  ·  · │",
            "  4  ·  ·  ·  ·  · │KERNEL/SYS ───│",
            "  5  KERNEL/SYS ───│!!!!!!!!!!!!!!│",
            "  6  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  7  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  8  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "  9  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 10  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 11  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 12  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 13  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 14  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 15  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 16  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 17  DIR/SYS ──────│──────────────│",
            " 18  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 19  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 20  ·  ·  ·  ·  · │uuuuuuuuuuuuuu│",
            " 21  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 22  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 23  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 24  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 25  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 26  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 27  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 28  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 29  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            " 30  xxxxxxxxxxxxxx│xxxxxxxxxxxxxx│",
            " 31  ·  ·  ·  ·  · │·  ·  ·  ·  · │",
            "",
            "· free   x locked out   ! shared by two or more files (1)",
            "? claimed by a file but free in the GAT (1)",
            "u used in the GAT but claimed by no file (1)",
            "12 of 64 granules used, 52 free (65 KB), 2 locked out. A granule is 1,280 bytes.",
        ]);
    });

    it("draws a double-sided disk with a line for each side, and repeats a name only on a new cylinder", async () => {
        const blank = formatTrsdosDataDisk({dos: TrsdosFormatDos.LDOS_5_3, cylinders: 35, sides: 2});
        if (typeof blank === "string") {
            throw new Error(blank);
        }
        imagePathname = path.join(dir, "ldos.dmk");
        fs.writeFileSync(imagePathname, blank.binary);
        const hostPathname = path.join(dir, "data.bin");
        fs.writeFileSync(hostPathname, new Uint8Array(9000).fill(0x41));
        await runDisk("add", hostPathname, "--binary");

        // Granules are 6 sectors of 18 per track, three to a side. The file starts after the boot granule, runs
        // off the end of side 0 onto side 1 (no new name there), and on to the next cylinder (a new name).
        expect(withoutFreeLines(await runDisk("map"), 11, 1)).to.eql([
            "cyl  side   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17",
            "  0  0     BOOT/SYS ────────│DATA/BIN ────────│─────────────────│",
            "     1     ─────────────────│─────────────────│─────────────────│",
            "  1  0     DATA/BIN ────────│·  ·  ·  ·  ·  · │·  ·  ·  ·  ·  · │",
            " 17  0     DIR/SYS ─────────│─────────────────│─────────────────│",
            "     1     ─────────────────│─────────────────│─────────────────│",
            "",
            "· free",
            "13 of 210 granules used, 197 free (295.5 KB). A granule is 1,536 bytes.",
        ]);
    });

    it("uses narrower cells and a ruler of two lines when the wide cells don't fit", async () => {
        const blank = formatTrsdosDataDisk({dos: TrsdosFormatDos.LDOS_5_3, cylinders: 35, sides: 2});
        if (typeof blank === "string") {
            throw new Error(blank);
        }
        imagePathname = path.join(dir, "ldos.dmk");
        fs.writeFileSync(imagePathname, blank.binary);
        const hostPathname = path.join(dir, "data.bin");
        fs.writeFileSync(hostPathname, new Uint8Array(9000).fill(0x41));
        await runDisk("add", hostPathname, "--binary");

        // 11 columns of gutter and 18 sectors: 65 wide, so 60 columns forces two-character cells.
        setTerminalWidth(60);
        expect((await runDisk("map")).slice(0, 6)).to.eql([
            "                               1",
            "cyl  side  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7",
            "  0  0     BOOT/SYS ──│DATA/BIN ──│───────────│",
            "     1     ───────────│───────────│───────────│",
            "  1  0     DATA/BIN ──│· · · · · ·│· · · · · ·│",
            "     1     · · · · · ·│· · · · · ·│· · · · · ·│",
        ]);
    });

    it("draws a TRSDOS 1.3 disk, where a long name covers the bars inside its run and is cut short in a small one", async () => {
        const blank = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 40, sides: 1});
        if (typeof blank === "string") {
            throw new Error(blank);
        }
        imagePathname = path.join(dir, "model3.dmk");
        fs.writeFileSync(imagePathname, blank.binary);
        const bigPathname = path.join(dir, "BIGFILE.TXT");
        fs.writeFileSync(bigPathname, new Uint8Array(3000).fill(0x41));
        const smallPathname = path.join(dir, "SMALLONE.TXT");
        fs.writeFileSync(smallPathname, new Uint8Array(600).fill(0x42));
        await runDisk("add", bigPathname, "--binary");
        await runDisk("add", smallPathname, "--binary");

        // Granules are 3 sectors, so 9 characters, and the 12-character names don't fit in one.
        expect((await runDisk("map")).slice(0, 2)).to.eql([
            "cyl   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18",
            "  0  boot ───│BIGFILE/TXT ─────│────────│────────│SMALLONE│",
        ]);
    });

    it("says so when the image has a side that the file system doesn't use", () => {
        const blank = formatTrsdosDataDisk({dos: TrsdosFormatDos.LDOS_5_3, cylinders: 35, sides: 2});
        if (typeof blank === "string") {
            throw new Error(blank);
        }
        const decoded = decodeTrsdos(blank);
        if (decoded === undefined) {
            throw new Error("Didn't decode as TRSDOS");
        }

        // Read the same disk as if the DOS used only side 0, with lumps of 3 granules.
        const oneSide = new Trsdos(decoded.disk, decoded.geometry, decoded.version, 1, 3, decoded.sectorsPerGranule,
            decoded.dirLumpNumber, 3, 0);
        const granuleMap = TrsdosGranuleMap.make(oneSide);
        if (typeof granuleMap === "string") {
            throw new Error(granuleMap);
        }

        const lines = drawGranuleMap(granuleMap, oneSide.getDirEntries(true), undefined, 80);
        expect(lines.slice(0, 3)).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17",
            "  0  BOOT/SYS ────────│·  ·  ·  ·  ·  · │·  ·  ·  ·  ·  · │",
            "  1  ·  ·  ·  ·  ·  · │·  ·  ·  ·  ·  · │·  ·  ·  ·  ·  · │",
        ]);
        expect(lines).to.include("The image has 2 sides, but the file system uses only 1.");
    });

    it("marks a cylinder that no granule covers", () => {
        // The test disk read as if the file system started on cylinder 1, with the directory on its lump 16.
        const standard = decodeTrsdos(makeTrsdos23TestDisk([HELLO], {cylinderCount: 18}));
        if (standard === undefined) {
            throw new Error("Didn't decode as TRSDOS");
        }
        const shifted = new Trsdos(standard.disk, standard.geometry, standard.version, 1, 2, 5, 16, 2, 1);
        const granuleMap = TrsdosGranuleMap.make(shifted);
        if (typeof granuleMap === "string") {
            throw new Error(granuleMap);
        }

        const lines = drawGranuleMap(granuleMap, shifted.getDirEntries(true), undefined, 80);
        expect(lines.slice(0, 3)).to.eql([
            "cyl   0  1  2  3  4  5  6  7  8  9",
            "  0  not in the file system",
            "  1  BOOT/SYS ─────│·  ·  ·  ·  · │",
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
