import fs from "fs";
import os from "os";
import path from "path";
import {
    type DmkFloppyDisk, formatTrsdosDataDisk, LSDOS_DD_TRACK_LAYOUT, makeBlankFloppy, makeTrsdos23TestDisk,
    SectorData, SectorPosition, type TestFile, TRSDOS_23_TRACK_LAYOUT, type TrackLayout, TrsdosFormatDos,
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
     * Read back an image and return its file system's file names and contents, joined as "NAME=bytes".
     */
    function describeFiles(pathname: string): string[] {
        const session = openDiskSession(pathname);
        return sessionInputFiles(session, true).map(inputFile => inputFile.filename + "=" +
            Buffer.from(inputFile.binary).toString("hex").substring(0, 40) + "/" + inputFile.binary.length);
    }

    it("drops the cylinders past the file system's, keeping the files", async () => {
        const pathname = makeOversizedTrsdos23();
        const hostPathname = makeHostFile("data.bin", 3000);
        await runDiskOn(pathname, "add", hostPathname, "--as", "DATA/BIN");
        const before = describeFiles(pathname);
        const sizeBefore = fs.statSync(pathname).size;
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(80);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[0]).to.eql("Removed cylinders 40-79 (the file system uses 0-39).");
        expect(lines[lines.length - 1]).to.eql("Saved " + pathname + ".");
        const session = openDiskSession(pathname);
        expect(session.floppy.getGeometry().cylinderCount).to.eql(40);
        expect(fs.statSync(pathname).size).to.eql(sizeBefore/2 + DMK_HEADER_SIZE/2);
        expect(describeFiles(pathname)).to.eql(before);
        expect(session.getReadOnlyReason()).to.eql(undefined);
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["DATA.BIN"]);
    });

    it("says so and changes nothing when there's nothing to drop", async () => {
        const pathname = path.join(dir, "small.dmk");
        fs.writeFileSync(pathname, format(TrsdosFormatDos.TRSDOS_2_3, 40, 1).binary);
        const before = fs.readFileSync(pathname);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines).to.eql(["Nothing to trim: the image has no cylinders at the end that the disk doesn't use."]);
        expect(fs.readFileSync(pathname)).to.eql(before);
    });

    it("drops unreadable cylinders at the end", async () => {
        // TRSDOS 1.3 doesn't mark the cylinders past its end, so only the unformatted ones go.
        const pathname = path.join(dir, "tail.dmk");
        const formatted = format(TrsdosFormatDos.TRSDOS_1_3, 40, 1);
        const binary = new Uint8Array(formatted.binary.length + 5*formatted.trackLength);
        binary.set(formatted.binary);
        binary[1] = 45;
        fs.writeFileSync(pathname, binary);
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(45);

        const lines = await runDiskOn(pathname, "trim");

        expect(lines[0]).to.eql("Removed cylinders 40-44 (they have no readable sectors).");
        expect(openDiskSession(pathname).floppy.getGeometry().cylinderCount).to.eql(40);
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

        it("by default drops only unreadable cylinders", async () => {
            const pathname = makeBlankImage(40);
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "trim");

            expect(lines[0]).to.match(/^Nothing to trim/);
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

        it("trims a JV1 image", async () => {
            const pathname = makeOversizedJv1();
            const before = describeFiles(pathname);

            const lines = await runDiskOn(pathname, "trim");

            expect(lines[0]).to.eql("Removed cylinders 35-39 (the file system uses 0-34).");
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

            const lines = await runDiskOn(pathname, "trim");

            expect(lines[0]).to.eql("Removed cylinders 35-39 (the file system uses 0-34).");
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
            const pathname = makeOversizedTrsdos23();
            const before = fs.readFileSync(pathname);

            const lines = await runDiskOn(pathname, "--dry-run", "trim");

            expect(lines[0]).to.eql("Removed cylinders 40-79 (the file system uses 0-39).");
            expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + pathname + " would have changed.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("saves to the --output file and leaves the image alone", async () => {
            const pathname = makeOversizedTrsdos23();
            const before = fs.readFileSync(pathname);
            const outputPathname = path.join(dir, "small.dmk");

            await runDiskOn(pathname, "-o", outputPathname, "trim");

            expect(fs.readFileSync(pathname)).to.eql(before);
            expect(openDiskSession(outputPathname).floppy.getGeometry().cylinderCount).to.eql(40);
        });

        it("refuses a write-protected image unless forced", async () => {
            const pathname = makeOversizedTrsdos23();
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
            const pathname = makeOversizedTrsdos23();
            const hostPathname = makeHostFile("data.bin", 3000);

            const lines = await runDiskOn(pathname, "trim", ":", "add", hostPathname, "--as", "DATA/BIN", ":", "free");

            expect(lines[0]).to.eql("Removed cylinders 40-79 (the file system uses 0-39).");
            const session = openDiskSession(pathname);
            expect(session.floppy.getGeometry().cylinderCount).to.eql(40);
            expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["DATA.BIN"]);
        });
    });
});
