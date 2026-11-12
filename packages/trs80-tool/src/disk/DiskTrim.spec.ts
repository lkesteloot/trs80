import fs from "fs";
import os from "os";
import path from "path";
import {
    appendDmkTestTracks, decodeFloppyFileSystem, type DmkFloppyDisk, formatTrsdosDataDisk, LSDOS_DD_TRACK_LAYOUT,
    makeBlankFloppy, makeTrsdos23TestDisk, SectorData, SectorPosition, type TestFile, type TestTailTrack,
    TRSDOS_23_TRACK_LAYOUT, type TrackLayout, Trsdos, TrsdosFormatDos, USER_DATA_ADDRESS_MARK_F9,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {openDiskSession, sessionInputFiles} from "./DiskFiles.js";

/** The size of a DMK file's header. */
const DMK_HEADER_SIZE = 16;

/** A file for the JV1 disk to hold. */
const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};

describe("disk trim", () => {
    let dir = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-trim-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Make a host file in the temporary directory with a repeating pattern of this many bytes, and
     * return its pathname.
     */
    function makeHostFile(name: string, size: number): string {
        const pathname = path.join(dir, name);
        const contents = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            contents[i] = (i*7 + (i >> 8)*13 + 31) & 0xFF;
        }
        fs.writeFileSync(pathname, contents);
        return pathname;
    }

    /**
     * Run the "disk" command on the given image with these words after it, and return what it printed.
     */
    async function runDiskOn(pathname: string, ...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([pathname, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run the "disk" command on the given image and return the error it fails with, failing the test if
     * it doesn't.
     */
    async function runDiskExpectingError(pathname: string, ...words: string[]): Promise<ToolError> {
        let error: unknown = undefined;
        try {
            await runDiskOn(pathname, ...words);
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        return error as ToolError;
    }

    /**
     * Format a DMK disk, failing the test if the options are refused.
     */
    function format(dos: TrsdosFormatDos, cylinders: number, sides: number): DmkFloppyDisk {
        const floppy = formatTrsdosDataDisk({dos, cylinders, sides});
        if (typeof floppy === "string") {
            throw new Error("Format failed: " + floppy);
        }
        return floppy;
    }

    /**
     * Make the image of a formatted disk that has more cylinders than the file system uses: the formatted
     * tracks, then tracks formatted by the same layout and holding filler, as an imager or a larger drive
     * leaves them.
     */
    function extendWithBlankTracks(formatted: DmkFloppyDisk, layout: TrackLayout, totalCylinders: number): Uint8Array {
        const sides = formatted.getGeometry().sideCount;
        const blank = makeBlankFloppy(layout, totalCylinders, sides);
        if (blank === undefined) {
            throw new Error("Couldn't make the blank disk");
        }
        const binary = blank.binary.slice();
        binary.set(formatted.binary.subarray(DMK_HEADER_SIZE), DMK_HEADER_SIZE);
        return binary;
    }

    /**
     * Write a TRSDOS 2.3 image of 40 formatted cylinders in an 80-cylinder DMK file, and return its pathname.
     */
    function makeOversizedTrsdos23(): string {
        const pathname = path.join(dir, "big.dmk");
        const formatted = format(TrsdosFormatDos.TRSDOS_2_3, 40, 1);
        fs.writeFileSync(pathname, extendWithBlankTracks(formatted, TRSDOS_23_TRACK_LAYOUT, 80));
        return pathname;
    }

    /**
     * Write a TRSDOS 2.3 image of 40 formatted cylinders followed by these single-sided cylinders, and return
     * its pathname.
     *
     * @param tail the cylinders after the disk's 40.
     * @param change a change to make to the formatted disk before the tail is added.
     */
    function makeTrsdos23WithTail(tail: TestTailTrack[], change: (floppy: DmkFloppyDisk) => void = () => {}): string {
        const pathname = path.join(dir, "tail.dmk");
        const formatted = format(TrsdosFormatDos.TRSDOS_2_3, 40, 1);
        change(formatted);
        const floppy = appendDmkTestTracks(formatted, tail.map(track => [track]), TRSDOS_23_TRACK_LAYOUT);
        fs.writeFileSync(pathname, floppy.binary);
        return pathname;
    }

    /**
     * Write a TRSDOS 2.3 image of 40 cylinders whose last is read twice more, as an imager whose drive
     * couldn't step any further leaves it, and return its pathname.
     */
    function makeTrsdos23WithReReads(): string {
        return makeTrsdos23WithTail([{kind: "reRead", cylinder: 39}, {kind: "reRead", cylinder: 39}]);
    }

    /**
     * Give sector 3 of cylinder 39 the 0xF9 data mark, a sign of copy protection.
     */
    function markCylinder39(floppy: DmkFloppyDisk): void {
        const position = SectorPosition.make(39, 0, 3);
        const sector = floppy.readSector(position);
        if (sector === undefined) {
            throw new Error("No sector");
        }
        const marked = new SectorData(sector.data, position, sector.density);
        marked.dataAddressMark = USER_DATA_ADDRESS_MARK_F9;
        floppy.writeSector(position, marked);
    }

    /**
     * Read back an image and return its file system's file names and contents, joined as "NAME=bytes".
     */
    function describeFiles(pathname: string): string[] {
        const session = openDiskSession(pathname);
        return sessionInputFiles(session, true).map(inputFile => inputFile.filename + "=" +
            Buffer.from(inputFile.binary).toString("hex").substring(0, 40) + "/" + inputFile.binary.length);
    }

    it("drops re-reads past the disk's end, keeping the files", async () => {
        const pathname = makeTrsdos23WithReReads();
        const hostPathname = makeHostFile("data.bin", 3000);
        await runDiskOn(pathname, "add", hostPathname, "--as", "DATA/BIN");
        const before = describeFiles(pathname);
        const sizeBefore = fs.statSync(pathname).size;
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(42);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[0]).to.eql("Removed cylinders 40-41 (past the disk's 40 cylinders, from the GAT; re-read cylinder 39).");
        expect(lines[lines.length - 1]).to.eql("Saved " + pathname + ".");
        const session = openDiskSession(pathname);
        expect(session.floppy.getGeometry().cylinderCount).to.eql(40);
        expect(fs.statSync(pathname).size).to.eql(DMK_HEADER_SIZE + (sizeBefore - DMK_HEADER_SIZE)*40/42);
        expect(describeFiles(pathname)).to.eql(before);
        expect(session.getReadOnlyReason()).to.eql(undefined);
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["DATA.BIN"]);
    });

    it("says so and changes nothing when there's nothing to drop", async () => {
        const pathname = path.join(dir, "small.dmk");
        fs.writeFileSync(pathname, format(TrsdosFormatDos.TRSDOS_2_3, 40, 1).binary);
        const before = fs.readFileSync(pathname);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines).to.eql(["Nothing to trim: the image has no cylinders past the disk's 40 cylinders (from the GAT)."]);
        expect(fs.readFileSync(pathname)).to.eql(before);
    });

    it("drops unformatted cylinders at the end", async () => {
        // TRSDOS 1.3 doesn't mark the cylinders past its end, so only the unformatted ones go.
        const pathname = path.join(dir, "tail.dmk");
        const formatted = format(TrsdosFormatDos.TRSDOS_1_3, 40, 1);
        const binary = new Uint8Array(formatted.binary.length + 5*formatted.trackLength);
        binary.set(formatted.binary);
        binary[1] = 45;
        fs.writeFileSync(pathname, binary);
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(45);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[0]).to.eql("Removed cylinders 40-44 (past the disk's 40 cylinders, from TRSDOS 1.x's fixed size; " +
            "unformatted).");
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(40);
    });

    it("says what each dropped cylinder was", async () => {
        const pathname = makeTrsdos23WithTail([{kind: "reRead", cylinder: 39}, {kind: "unformatted"}]);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[0]).to.eql("Removed cylinders 40-41 (past the disk's 40 cylinders, from the GAT; " +
            "40 re-read cylinder 39, 41 unformatted).");
    });

    it("leaves an unused tail in the disk's own format alone", async () => {
        const pathname = makeTrsdos23WithTail([{kind: "blank"}, {kind: "blank"}, {kind: "blank"}]);
        const before = fs.readFileSync(pathname);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines).to.eql([
            "Nothing to trim: no cylinder past the disk's 40 cylinders (from the GAT) is provably outside the disk.",
            "Kept cylinders 40-42: it's formatted like the rest of the disk, and an unused tail in the disk's own " +
            "format is left alone.",
        ]);
        expect(fs.readFileSync(pathname)).to.eql(before);
    });

    it("drops only an unbroken run to the end, and says why it kept the rest", async () => {
        const pathname = makeTrsdos23WithTail([{kind: "unformatted"}, {kind: "blank"}, {kind: "reRead", cylinder: 41}]);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines.slice(0, 3)).to.eql([
            "Removed cylinder 42 (past the disk's 40 cylinders, from the GAT; re-read cylinder 41).",
            "Kept cylinder 40: a later cylinder is kept, and only an unbroken run to the end of the image is dropped.",
            "Kept cylinder 41: it's formatted like the rest of the disk, and an unused tail in the disk's own format " +
            "is left alone.",
        ]);
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(42);
    });

    it("keeps a tail of 7 or more cylinders", async () => {
        const pathname = makeTrsdos23WithTail(Array.from({length: 7}, () => ({kind: "unformatted"} as const)));
        const before = fs.readFileSync(pathname);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[1]).to.eql("Kept cylinders 40-46: the image has 7 cylinders past the disk's end, and a tail " +
            "of 7 or more wants a person to look at it.");
        expect(fs.readFileSync(pathname)).to.eql(before);
    });

    it("drops nothing when the DOS's records don't prove where the disk ends", async () => {
        const pathname = path.join(dir, "ldos.dmk");
        const formatted = format(TrsdosFormatDos.LSDOS_6_3, 40, 1);
        // GAT byte 0xCC says 38 cylinders, but the media block says 40.
        const trsdos = decodeFloppyFileSystem(formatted);
        if (!(trsdos instanceof Trsdos)) {
            throw new Error("Not a TRSDOS-family disk");
        }
        const gatPosition = trsdos.getGatPosition();
        const gat = formatted.readSector(gatPosition);
        if (gat === undefined) {
            throw new Error("No GAT");
        }
        const data = gat.data.slice();
        data[0xCC] = 3;
        formatted.writeSector(gatPosition, new SectorData(data, gatPosition, gat.density));
        const floppy = appendDmkTestTracks(formatted, [[{kind: "unformatted"}]], LSDOS_DD_TRACK_LAYOUT);
        fs.writeFileSync(pathname, floppy.binary);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines).to.eql(["Nothing to trim: the DOS's records don't prove where the disk ends (GAT byte 0xCC " +
            "says 38 cylinders, but the media block says 40)."]);
    });

    describe("copy protection", () => {
        it("keeps a cylinder that shows signs of copy protection", async () => {
            const pathname = makeTrsdos23WithTail([{kind: "reRead", cylinder: 39}], markCylinder39);
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "trim");

            expect(lines[1]).to.eql("Kept cylinder 40: it shows signs of copy protection (F9 data marks).");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("refuses to drop it when asked to, even with --force", async () => {
            const pathname = makeTrsdos23WithTail([{kind: "reRead", cylinder: 39}], markCylinder39);
            const before = fs.readFileSync(pathname);

            const error = await runDiskExpectingError(pathname, "trim", "--cylinders", "40", "--force");

            expect(error.message).to.match(/^Can't drop cylinder 40: the disk shows signs of copy protection there \(F9 data marks\), and trim never drops those, even with --force\./);
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("drops the copy of a cylinder whose IDs name another, which isn't protection", async () => {
            const pathname = makeTrsdos23WithReReads();

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "40");

            expect(lines[0]).to.eql("Removed cylinders 40-41.");
        });
    });

    describe("--cylinders", () => {
        it("keeps the cylinders asked for", async () => {
            const pathname = makeOversizedTrsdos23();

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "40");

            expect(lines[0]).to.eql("Removed cylinders 40-79.");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(40);
        });

        it("refuses to cut into the directory, naming it", async () => {
            const pathname = makeOversizedTrsdos23();
            const before = fs.readFileSync(pathname);

            const error = await runDiskExpectingError(pathname, "trim", "--cylinders", "10");

            expect(error.message).to.eql("Can't keep only 10 cylinders: the file system covers cylinders 0-39, " +
                "and DIR/SYS is on cylinder 17.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("refuses to cut off a file, naming it", async () => {
            const pathname = makeOversizedTrsdos23();
            const hostPathname = makeHostFile("data.bin", 3000);
            // The file starts in the free granule of cylinder 0 and goes on into cylinder 1.
            await runDiskOn(pathname, "add", hostPathname, "--as", "DATA/BIN");

            const error = await runDiskExpectingError(pathname, "trim", "--cylinders", "1");

            expect(error.message).to.eql("Can't keep only 1 cylinder: the file system covers cylinders 0-39, " +
                "and DATA/BIN, DIR/SYS are on cylinders 1-17.");
        });

        it("refuses to drop free space unless forced", async () => {
            const pathname = makeOversizedTrsdos23();

            const error = await runDiskExpectingError(pathname, "trim", "--cylinders", "39");
            expect(error.message).to.contain("the file system covers cylinders 0-39");
            expect(error.message).to.contain("Use --force");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(80);

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "39", "--force");
            expect(lines[0]).to.eql("Removed cylinders 39-79.");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(39);
        });

        it("says so when the image has no more than that", async () => {
            const pathname = makeOversizedTrsdos23();
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "80");

            expect(lines).to.eql(["Nothing to trim: the image has only 80 cylinders."]);
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("rejects bad numbers", async () => {
            const pathname = makeOversizedTrsdos23();

            expect((await runDiskExpectingError(pathname, "trim", "--cylinders", "0")).message).to.match(/needs at least 1/);
            expect((await runDiskExpectingError(pathname, "trim", "--cylinders", "lots")).message).to.match(/^Invalid --cylinders/);
        });
    });

    describe("--side", () => {
        /**
         * Write an LS-DOS image made for one side but imaged with a second (blank) side, and return its pathname.
         */
        function makeTwoSidedImageOfOneSidedDisk(): string {
            const pathname = path.join(dir, "two-sided.dmk");
            const formatted = format(TrsdosFormatDos.LSDOS_6_3, 40, 1);
            const blank = makeBlankFloppy(LSDOS_DD_TRACK_LAYOUT, 40, 2);
            if (blank === undefined) {
                throw new Error("Couldn't make the blank disk");
            }
            // Interleave the formatted tracks with the blank second side.
            const binary = blank.binary.slice();
            const trackLength = formatted.trackLength;
            for (let cylinder = 0; cylinder < 40; cylinder++) {
                const from = DMK_HEADER_SIZE + cylinder*trackLength;
                binary.set(formatted.binary.subarray(from, from + trackLength), DMK_HEADER_SIZE + cylinder*2*trackLength);
            }
            fs.writeFileSync(pathname, binary);
            return pathname;
        }

        it("drops a blank second side that the file system doesn't use", async () => {
            const pathname = makeTwoSidedImageOfOneSidedDisk();
            const hostPathname = makeHostFile("data.bin", 3000);
            await runDiskOn(pathname, "add", hostPathname, "--as", "DATA/BIN");
            const before = describeFiles(pathname);
            expect(openDiskSession(pathname).floppy.getGeometry().sideCount).to.eql(2);

            const lines = await runDiskOn(pathname, "trim", "--side", "0");

            expect(lines[0]).to.eql("Removed side 1.");
            const session = openDiskSession(pathname);
            expect(session.floppy.getGeometry().sideCount).to.eql(1);
            expect(session.floppy.getGeometry().cylinderCount).to.eql(40);
            expect(describeFiles(pathname)).to.eql(before);
        });

        it("doesn't touch the cylinders when only the side is asked for", async () => {
            const pathname = path.join(dir, "both.dmk");
            const formatted = format(TrsdosFormatDos.LSDOS_6_3, 40, 1);
            // The same two-sided image, with 5 more cylinders.
            const big = makeBlankFloppy(LSDOS_DD_TRACK_LAYOUT, 45, 2);
            if (big === undefined) {
                throw new Error("Couldn't make the blank disk");
            }
            const binary = big.binary.slice();
            for (let cylinder = 0; cylinder < 40; cylinder++) {
                const from = DMK_HEADER_SIZE + cylinder*formatted.trackLength;
                binary.set(formatted.binary.subarray(from, from + formatted.trackLength),
                    DMK_HEADER_SIZE + cylinder*2*formatted.trackLength);
            }
            fs.writeFileSync(pathname, binary);

            const lines = await runDiskOn(pathname, "trim", "--side", "0");

            expect(lines[0]).to.eql("Removed side 1.");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(45);
        });

        it("refuses when the file system uses both sides", async () => {
            const pathname = path.join(dir, "ds.dmk");
            fs.writeFileSync(pathname, format(TrsdosFormatDos.LSDOS_6_3, 40, 2).binary);
            const before = fs.readFileSync(pathname);

            const error = await runDiskExpectingError(pathname, "trim", "--side", "0");

            expect(error.message).to.eql("Can't drop side 1: the file system allocates on both sides.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("says so on a one-sided image", async () => {
            const pathname = path.join(dir, "ss.jv1");
            fs.writeFileSync(pathname, makeTrsdos23TestDisk([HELLO]).binary);

            const lines = await runDiskOn(pathname, "trim", "--side", "0");

            expect(lines).to.eql(["Nothing to trim: the image has only one side."]);
        });

        it("rejects other sides", async () => {
            const pathname = makeOversizedTrsdos23();

            expect((await runDiskExpectingError(pathname, "trim", "--side", "1")).message).to.match(/^Invalid --side "1"/);
        });
    });

    describe("a disk with no file system", () => {
        /**
         * Write a blank DMK disk with no file system to the temporary directory, after letting the caller
         * change it, and return its pathname.
         */
        function makeBlankImage(cylinders: number, change: (floppy: DmkFloppyDisk) => void = () => {}): string {
            const pathname = path.join(dir, "blank.dmk");
            const floppy = makeBlankFloppy(TRSDOS_23_TRACK_LAYOUT, cylinders, 1);
            if (floppy === undefined) {
                throw new Error("Couldn't make the blank disk");
            }
            change(floppy);
            fs.writeFileSync(pathname, floppy.binary);
            return pathname;
        }

        it("drops cylinders that hold only filler", async () => {
            const pathname = makeBlankImage(40);

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "35");

            expect(lines[0]).to.eql("Removed cylinders 35-39.");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(35);
        });

        it("refuses to drop data unless forced", async () => {
            const pathname = makeBlankImage(40, floppy => {
                const position = SectorPosition.make(37, 0, 4);
                floppy.writeSector(position, new SectorData(new Uint8Array(256).fill(0).map((_, i) => i), position,
                    floppy.getGeometry().modalDataDensity));
            });

            const error = await runDiskExpectingError(pathname, "trim", "--cylinders", "35");
            expect(error.message).to.eql("The tracks to drop hold data that isn't filler, on cylinder 37, " +
                "and the disk has no file system that we recognize. Use --force to drop them anyway.");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(40);

            await runDiskOn(pathname, "trim", "--cylinders", "35", "--force");
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(35);
        });

        it("drops nothing by default", async () => {
            const pathname = makeBlankImage(40);
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "trim");

            expect(lines).to.eql(["Nothing to trim: the DOS's records don't prove where the disk ends " +
                "(the disk has no file system that we recognize)."]);
            expect(fs.readFileSync(pathname)).to.eql(before);
        });
    });

    describe("other image formats", () => {
        /**
         * Write a JV1 TRSDOS 2.3 disk of 40 cylinders, whose last 5 are locked out, and return its pathname.
         */
        function makeOversizedJv1(): string {
            const pathname = path.join(dir, "big.jv1");
            fs.writeFileSync(pathname, makeTrsdos23TestDisk([HELLO], {
                cylinderCount: 40,
                lockedOut: [35, 36, 37, 38, 39],
            }).binary);
            return pathname;
        }

        it("keeps a JV1 image's tail, which is formatted like the disk", async () => {
            const pathname = makeOversizedJv1();

            const lines = await runDiskOn(pathname, "trim");

            expect(lines).to.eql([
                "Nothing to trim: no cylinder past the disk's 35 cylinders (from TRSDOS 2.x's fixed size) is " +
                "provably outside the disk.",
                "Kept cylinders 35-39: it's formatted like the rest of the disk, and an unused tail in the disk's own " +
                "format is left alone.",
            ]);
        });

        it("trims a JV1 image", async () => {
            const pathname = makeOversizedJv1();
            const before = describeFiles(pathname);

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "35");

            expect(lines[0]).to.eql("Removed cylinders 35-39.");
            const session = openDiskSession(pathname);
            expect(session.floppy.getDescription()).to.eql("Floppy disk (JV1)");
            expect(session.floppy.getGeometry().cylinderCount).to.eql(35);
            expect(fs.statSync(pathname).size).to.eql(35*10*256);
            expect(describeFiles(pathname)).to.eql(before);
        });

        it("trims a JV3 image", async () => {
            // Convert the JV1 disk to JV3: a directory of 3-byte entries, then the sectors in the same order.
            const jv1 = fs.readFileSync(makeOversizedJv1());
            const jv3 = new Uint8Array(34*256 + jv1.length);
            jv3.fill(0xFF, 0, 34*256);
            for (let i = 0; i < jv1.length/256; i++) {
                const cylinder = Math.floor(i/10);
                jv3[i*3] = cylinder;
                jv3[i*3 + 1] = i % 10;
                // Single density, 256 bytes, and the directory cylinder's sectors have the F8-family mark that JV1 implies.
                jv3[i*3 + 2] = cylinder === 17 ? 0x20 : 0x00;
            }
            jv3.set(jv1, 34*256);
            const pathname = path.join(dir, "big.jv3");
            fs.writeFileSync(pathname, jv3);
            const before = describeFiles(pathname);
            expect(openDiskSession(pathname).floppy.getDescription()).to.eql("Floppy disk (JV3)");

            const lines = await runDiskOn(pathname, "trim", "--cylinders", "35");

            expect(lines[0]).to.eql("Removed cylinders 35-39.");
            const session = openDiskSession(pathname);
            expect(session.floppy.getDescription()).to.eql("Floppy disk (JV3)");
            expect(session.floppy.getGeometry().cylinderCount).to.eql(35);
            expect(fs.statSync(pathname).size).to.eql(34*256 + 35*10*256);
            expect(describeFiles(pathname)).to.eql(before);
        });

        it("refuses other formats", async () => {
            // A tiny IMD image: one 256-byte sector on cylinder 0.
            const header = Array.from("IMD 1.18: 14/10/2026 12:00:00\r\n", ch => ch.charCodeAt(0));
            const imd = new Uint8Array([...header, 0x1A, 5, 0, 0, 1, 1, 1, 1, ...new Array(256).fill(0xE5)]);
            const pathname = path.join(dir, "disk.imd");
            fs.writeFileSync(pathname, imd);

            const error = await runDiskExpectingError(pathname, "trim");

            expect(error.message).to.eql("trim works on DMK, JV1 and JV3 images, not on Floppy disk (IMD)");
        });
    });

    describe("saving", () => {
        it("writes nothing with --dry-run", async () => {
            const pathname = makeTrsdos23WithReReads();
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "--dry-run", "trim");

            expect(lines[0]).to.eql("Removed cylinders 40-41 (past the disk's 40 cylinders, from the GAT; re-read cylinder 39).");
            expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + pathname + " would have changed.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("saves to the --output file and leaves the image alone", async () => {
            const pathname = makeTrsdos23WithReReads();
            const before = fs.readFileSync(pathname);
            const outputPathname = path.join(dir, "small.dmk");

            await runDiskOn(pathname, "-o", outputPathname, "trim");

            expect(fs.readFileSync(pathname)).to.eql(before);
            expect(openDiskSession(outputPathname).floppy.getGeometry().cylinderCount).to.eql(40);
        });

        it("refuses a write-protected image unless forced", async () => {
            const pathname = makeTrsdos23WithReReads();
            const binary = fs.readFileSync(pathname);
            binary[0] = 0xFF;
            fs.writeFileSync(pathname, binary);

            const error = await runDiskExpectingError(pathname, "trim");
            expect(error.message).to.eql("The image is write-protected; use --force to trim it anyway.");
            expect(fs.readFileSync(pathname)).to.eql(binary);

            await runDiskOn(pathname, "trim", "--force");
            const trimmed = fs.readFileSync(pathname);
            expect(trimmed[0]).to.eql(0xFF);
            expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(40);
        });

        it("lets later commands in the same run use the trimmed disk", async () => {
            const pathname = makeTrsdos23WithReReads();
            const hostPathname = makeHostFile("data.bin", 3000);

            const lines = await runDiskOn(pathname, "trim", ":", "add", hostPathname, "--as", "DATA/BIN", ":", "free");

            expect(lines[0]).to.eql("Removed cylinders 40-41 (past the disk's 40 cylinders, from the GAT; re-read cylinder 39).");
            const session = openDiskSession(pathname);
            expect(session.floppy.getGeometry().cylinderCount).to.eql(40);
            expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["DATA.BIN"]);
        });
    });
});
