import fs from "fs";
import os from "os";
import path from "path";
import {Density, makeTrsdos23TestDisk, type TestFile} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {parseFormatDosName} from "./DiskHelp.js";
import {DiskSession} from "./DiskSession.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};

/**
 * One DOS that "create" makes, with what is expected of the disk.
 */
interface DosCase {
    /** The value of --dos. */
    dos: string;
    /** The name that the disk's decoded file system has. The decoder can't tell TRSDOS 2.3 from other 2.x. */
    nameAndVersion: string;
    /** Whether the writer can add files to the DOS's disks (it can't yet for TRSDOS 1.3). */
    canAdd: boolean;
}

const DOS_CASES: DosCase[] = [
    {dos: "trsdos-2.3", nameAndVersion: "TRSDOS 2.x", canAdd: true},
    {dos: "trsdos-1.3", nameAndVersion: "TRSDOS 1.x", canAdd: false},
    {dos: "ldos-5.3", nameAndVersion: "LDOS 5.3", canAdd: true},
    {dos: "trsdos-6.2", nameAndVersion: "TRSDOS 6.2", canAdd: true},
    {dos: "lsdos-6.3", nameAndVersion: "LS-DOS 6.3", canAdd: true},
];

describe("disk create and format", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-create-"));
        imagePathname = path.join(dir, "new.dmk");
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
     * Run the "disk" command on the test image with these words after it, and return what it printed.
     */
    function runDisk(...words: string[]): Promise<string[]> {
        return runDiskOn(imagePathname, ...words);
    }

    /**
     * Run the "disk" command on the test image and return the error it fails with, failing the test if
     * it doesn't.
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

    for (const dosCase of DOS_CASES) {
        it(`creates a ${dosCase.nameAndVersion} disk that decodes by itself and has no files`, async () => {
            const lines = await runDisk("create", "--dos", dosCase.dos);
            expect(lines[0]).to.match(new RegExp("^Created " + imagePathname.replace(/\./g, "\\.") +
                ": Floppy disk \\(DMK\\), " + dosCase.nameAndVersion.replace(/\./g, "\\.") + ", 0 files, \\d+ KB free$"));
            expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");

            // Reopen it with no help from --dos.
            const session = DiskSession.open(imagePathname);
            expect(session.fileSystem?.nameAndVersion).to.eql(dosCase.nameAndVersion);
            expect(session.getInputFiles(false)).to.eql([]);
            expect(session.getReadOnlyReason()).to.eql(undefined);
        });

        it(`creates a ${dosCase.nameAndVersion} disk, then lists, checks, and adds a file in the same run`, async () => {
            const hostPathname = makeHostFile("data.bin", 3000);
            const words = ["create", "--dos", dosCase.dos, ":", "dir", ":", "free", ":", "check"];
            if (dosCase.canAdd) {
                words.push(":", "add", hostPathname, "--as", "DATA/BIN", ":", "dir");
            }
            const lines = await runDisk(...words);
            expect(lines.some(line => /^\d+ KB free \(\d+ granules? of [\d,]+ bytes( each)?\)$/.test(line))).to.eql(true);
            expect(lines).to.include("No files");
            expect(lines).to.include("Safe to write.");
            expect(lines.some(line => line.startsWith("Saved "))).to.eql(true);

            if (dosCase.canAdd) {
                expect(lines).to.include("Added DATA/BIN (3,000 bytes).");
                const session = DiskSession.open(imagePathname);
                expect(session.getInputFiles(false).map(f => f.filename)).to.eql(["DATA.BIN"]);
                const inputFile = session.getInputFiles(false)[0];
                expect(Array.from(inputFile.binary)).to.eql(Array.from(fs.readFileSync(hostPathname)));
            } else {
                // The writer doesn't write TRSDOS 1.3 disks yet, and says so.
                const error = await runDiskExpectingError("add", hostPathname);
                expect(error.message).to.eql("Adding files isn't supported yet on TRSDOS 1.3 disks");
            }
        });
    }

    it("uses the defaults: 40 cylinders, one side, double density, 35 cylinders for TRSDOS 2.3", async () => {
        await runDisk("create", "--dos", "ldos-5.3", "--date", "1983-05-09", "--name", "games");
        const lines = await runDisk("label");
        expect(lines.slice(0, 2)).to.eql(["Name: GAMES", "Date: 05/09/83"]);
        const floppy = DiskSession.open(imagePathname).floppy;
        const geometry = floppy.getGeometry();
        expect([geometry.cylinderCount, geometry.sideCount]).to.eql([40, 1]);
        expect(geometry.modalDataDensity).to.eql(Density.DOUBLE);

        const trsdos23Pathname = path.join(dir, "old.dmk");
        await runDiskOn(trsdos23Pathname, "create", "--dos", "trsdos-2.3");
        expect(DiskSession.open(trsdos23Pathname).floppy.getGeometry().cylinderCount).to.eql(35);
    });

    it("takes the cylinders, sides, density and model options", async () => {
        await runDisk("create", "--dos", "ldos-5.3", "--cylinders", "35", "--density", "single");
        let geometry = DiskSession.open(imagePathname).floppy.getGeometry();
        expect([geometry.cylinderCount, geometry.sideCount, geometry.modalDataDensity]).to.eql([35, 1, Density.SINGLE]);

        // Model 1 means single density for LDOS.
        await runDisk("create", "--dos", "ldos-5.3", "--model", "1", "--force");
        geometry = DiskSession.open(imagePathname).floppy.getGeometry();
        expect(geometry.modalDataDensity).to.eql(Density.SINGLE);
    });

    it("puts today's date on the disk by default, as FORMAT does", async () => {
        await runDisk("create", "--dos", "lsdos-6.3");
        const lines = await runDisk("label");
        const now = new Date();
        const twoDigits = (n: number) => n.toString().padStart(2, "0");
        // Allow for the date changing while the test runs.
        expect(lines[1]).to.match(/^Date: \d\d\/\d\d\/\d\d$/);
        expect(lines[1]).to.include("/" + twoDigits(now.getFullYear() % 100));
    });

    it("accepts the aliases of the DOS names", () => {
        expect(parseFormatDosName("ldos-5")).to.eql(parseFormatDosName("ldos-5.3"));
        expect(parseFormatDosName("LDOS")).to.eql(parseFormatDosName("ldos-5.3"));
        expect(parseFormatDosName("trsdos-6")).to.eql(parseFormatDosName("trsdos-6.2"));
        expect(parseFormatDosName("lsdos")).to.eql(parseFormatDosName("lsdos-6.3"));
        expect(parseFormatDosName("ls-dos-6")).to.eql(parseFormatDosName("lsdos-6.3"));
        expect(parseFormatDosName("trsdos-2")).to.eql(parseFormatDosName("trsdos-2.3"));
    });

    it("refuses an unknown DOS and lists the choices", async () => {
        const error = await runDiskExpectingError("create", "--dos", "cpm");
        expect(error.message).to.eql("Unknown DOS \"cpm\" for --dos. The choices are trsdos-2.3, trsdos-1.3, " +
            "ldos-5.3, trsdos-6.2, lsdos-6.3.");
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("refuses to create without --dos", async () => {
        const error = await runDiskExpectingError("create");
        expect(error.message).to.match(/needs --dos/);
    });

    it("refuses options the DOS can't do, and creates no file", async () => {
        expect((await runDiskExpectingError("create", "--dos", "trsdos-2.3", "--sides", "2")).message)
            .to.match(/formats only one side/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--cylinders", "200")).message)
            .to.match(/35 to 80 cylinders/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--cylinders", "x")).message)
            .to.match(/Invalid --cylinders/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--sides", "3")).message)
            .to.match(/Invalid --sides/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--density", "quad")).message)
            .to.match(/Invalid --density/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--model", "2")).message)
            .to.match(/Invalid --model/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--name", "1bad")).message)
            .to.match(/Invalid disk name/);
        expect((await runDiskExpectingError("create", "--dos", "ldos-5.3", "--date", "1983-02-30")).message)
            .to.match(/Invalid --date/);
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("accepts the global --dos option together with the command's own", async () => {
        const lines = await runDisk("--dos", "ldos-5", "create", "--dos", "lsdos-6.3");
        expect(lines[0]).to.include("LS-DOS 6.3");
    });

    it("refuses an existing disk without --force, and replaces it in memory with it", async () => {
        await runDisk("create", "--dos", "trsdos-2.3");
        const before = fs.readFileSync(imagePathname);
        const error = await runDiskExpectingError("create", "--dos", "ldos-5.3");
        expect(error.message).to.match(/already has a disk; use --force/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const lines = await runDisk("create", "--dos", "ldos-5.3", "--force");
        expect(lines[0]).to.eql("Replaced the disk in memory; nothing is saved until quit.");
        expect(lines[1]).to.include("LDOS 5.3");
        expect(DiskSession.open(imagePathname).fileSystem?.nameAndVersion).to.eql("LDOS 5.3");
    });

    it("refuses to create twice in one run without --force", async () => {
        const error = await runDiskExpectingError("create", "--dos", "ldos-5.3", ":", "create", "--dos", "lsdos-6.3");
        expect(error.message).to.match(/already has a disk/);
        // Nothing was saved, since a command failed.
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("refuses an image name that isn't DMK", async () => {
        for (const extension of [".jv1", ".jv3", ".dsk", ".hfe", ".imd"]) {
            const pathname = path.join(dir, "new" + extension);
            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "create", "--dos", "ldos-5.3");
            } catch (e) {
                error = e;
            }
            expect(error).to.be.instanceOf(ToolError);
            expect((error as ToolError).message).to.eql("create makes DMK images; name the file .dmk");
            expect(fs.existsSync(pathname)).to.eql(false);
        }
    });

    it("creates to the --output file, even when the image has another name", async () => {
        const inputPathname = path.join(dir, "missing.jv1");
        const outputPathname = path.join(dir, "out.dmk");
        await runDiskOn(inputPathname, "--output", outputPathname, "create", "--dos", "ldos-5.3");
        expect(fs.existsSync(inputPathname)).to.eql(false);
        expect(DiskSession.open(outputPathname).fileSystem?.nameAndVersion).to.eql("LDOS 5.3");
    });

    it("says that a missing image doesn't exist for every other command", async () => {
        for (const command of [["dir"], ["free"], ["check"], ["info"], ["save"], ["rm", "X"], ["add", "x"], ["label"],
            ["format", "--dos", "ldos-5.3"]]) {

            const error = await runDiskExpectingError(...command);
            expect(error.message).to.eql(imagePathname + " doesn't exist; use \"create\" to make it");
        }
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("lets help, quit and abort run with no disk, and saves nothing", async () => {
        expect((await runDisk("help")).length).to.be.greaterThan(3);
        expect(await runDisk("quit")).to.eql([]);
        expect(await runDisk("abort")).to.eql([]);
        expect(fs.existsSync(imagePathname)).to.eql(false);

        // A quit after a create saves the new disk.
        const lines = await runDisk("create", "--dos", "ldos-5.3", ":", "quit");
        expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");
        expect(fs.existsSync(imagePathname)).to.eql(true);
    });

    it("discards a created disk on abort", async () => {
        const lines = await runDisk("create", "--dos", "ldos-5.3", ":", "abort");
        expect(lines[lines.length - 1]).to.eql("Discarded the changes to " + imagePathname + ".");
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("still fails to open an existing file that isn't a disk image", async () => {
        const textPathname = path.join(dir, "notes.dmk");
        fs.writeFileSync(textPathname, "this is not a disk");
        let error: unknown = undefined;
        try {
            await runDiskOn(textPathname, "dir");
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(ToolError);
        expect((error as ToolError).message).to.match(/^Can't open/);
    });

    it("writes nothing with --dry-run", async () => {
        const lines = await runDisk("--dry-run", "create", "--dos", "ldos-5.3");
        expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + imagePathname + " would have changed.");
        expect(fs.existsSync(imagePathname)).to.eql(false);
        expect(fs.readdirSync(dir)).to.eql([]);
    });

    it("makes two-sided LDOS-line disks that pass the write gate and take files", async () => {
        const hostPathname = makeHostFile("data.bin", 500);
        // Adding a file verifies the whole disk, which takes a while, so each DOS gets one density.
        for (const [dos, density] of [["ldos-5.3", "single"], ["trsdos-6.2", "double"], ["lsdos-6.3", "double"]]) {
            const pathname = path.join(dir, dos + "-" + density + ".dmk");
            const lines = await runDiskOn(pathname, "create", "--dos", dos, "--sides", "2", "--density", density,
                "--cylinders", "35", ":", "add", hostPathname);
            expect(lines.some(line => line.includes("Read-only: "))).to.eql(false);
            const session = DiskSession.open(pathname);
            expect(session.floppy.getGeometry().sideCount).to.eql(2);
            expect(session.getReadOnlyReason()).to.eql(undefined);
            expect(session.getInputFiles(false).map(f => f.filename)).to.eql(["DATA.BIN"]);
        }
    }, 30000);

    describe("format", () => {
        /**
         * Write a TRSDOS 2.3 test disk with a file, as a JV1 image, and return its pathname.
         */
        function makeJv1Image(files: TestFile[]): string {
            const pathname = path.join(dir, "old.jv1");
            fs.writeFileSync(pathname, makeTrsdos23TestDisk(files).binary);
            return pathname;
        }

        it("refuses a disk with files without --force and counts them", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "--dos", "ldos-5.3", ":", "add", makeHostFile("a.bin", 100),
                makeHostFile("b.bin", 100));
            const before = fs.readFileSync(pathname);

            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "format");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.eql(
                "format would erase 2 files from the disk; use --force to go ahead");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("formats an empty disk without --force, keeping its DOS, size, and density", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "--dos", "trsdos-6.2", "--cylinders", "50", "--sides", "2",
                "--density", "single", "--name", "first");
            const lines = await runDiskOn(pathname, "format", "--name", "second");
            expect(lines[0]).to.eql("Replaced the disk in memory with a blank TRSDOS 6.2 disk; nothing is saved until quit.");

            const session = DiskSession.open(pathname);
            const geometry = session.floppy.getGeometry();
            expect([geometry.cylinderCount, geometry.sideCount, geometry.modalDataDensity]).to.eql([50, 2, Density.SINGLE]);
            expect(session.fileSystem?.nameAndVersion).to.eql("TRSDOS 6.2");
            expect((await runDiskOn(pathname, "--force", "label"))[0]).to.eql("Name: SECOND");
        });

        it("erases the files with --force and takes a different DOS and size", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "--dos", "ldos-5.3", ":", "add", makeHostFile("a.bin", 100));

            await runDiskOn(pathname, "format", "--force", "--dos", "lsdos-6.3", "--cylinders", "80");
            const session = DiskSession.open(pathname);
            expect(session.fileSystem?.nameAndVersion).to.eql("LS-DOS 6.3");
            expect(session.getInputFiles(false)).to.eql([]);
            expect(session.floppy.getGeometry().cylinderCount).to.eql(80);
        });

        it("can then add files in the same run", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "--dos", "ldos-5.3");
            await runDiskOn(pathname, "format", ":", "add", makeHostFile("a.bin", 100));
            expect(DiskSession.open(pathname).getInputFiles(false).map(f => f.filename)).to.eql(["A.BIN"]);
        });

        it("refuses to turn a JV1 image into a DMK one in place, and does it with -o", async () => {
            const pathname = makeJv1Image([]);
            const before = fs.readFileSync(pathname);
            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "format");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.eql(
                "format makes the image a DMK image; give -o NEW.dmk to save to a .dmk file instead");
            expect(fs.readFileSync(pathname)).to.eql(before);

            const outputPathname = path.join(dir, "formatted.dmk");
            await runDiskOn(pathname, "--output", outputPathname, "format");
            expect(fs.readFileSync(pathname)).to.eql(before);
            const session = DiskSession.open(outputPathname);
            expect(session.fileSystem?.nameAndVersion).to.eql("TRSDOS 2.x");
            expect(session.floppy.getGeometry().cylinderCount).to.eql(35);
        });

        it("counts the files of a JV1 image that has them", async () => {
            const pathname = makeJv1Image([HELLO]);
            const outputPathname = path.join(dir, "formatted.dmk");
            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "--output", outputPathname, "format");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.eql("format would erase 1 file from the disk; use --force to go ahead");

            await runDiskOn(pathname, "--output", outputPathname, "format", "--force");
            expect(DiskSession.open(outputPathname).getInputFiles(false)).to.eql([]);
        });

        it("writes nothing with --dry-run", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "--dos", "ldos-5.3");
            const before = fs.readFileSync(pathname);
            const lines = await runDiskOn(pathname, "--dry-run", "format", "--dos", "lsdos-6.3");
            expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + pathname + " would have changed.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("refuses an unknown DOS for format, listing the choices", async () => {
            const pathname = path.join(dir, "blank.dmk");
            await runDiskOn(pathname, "create", "--dos", "ldos-5.3");

            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "format", "--dos", "dosplus");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/Unknown DOS "dosplus" for --dos.*DOSPLUS disks can't be made yet/);
        });

        it("needs --dos and --force for a disk with no file system we recognize", async () => {
            const pathname = path.join(dir, "blank.jv1");
            fs.writeFileSync(pathname, new Uint8Array(35*10*256));
            const outputPathname = path.join(dir, "formatted.dmk");

            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "--output", outputPathname, "format");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/^format needs --dos NAME/);

            error = undefined;
            try {
                await runDiskOn(pathname, "--output", outputPathname, "format", "--dos", "trsdos-2.3");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/no file system that we recognize.*use --force/);

            await runDiskOn(pathname, "--output", outputPathname, "format", "--dos", "trsdos-2.3", "--force");
            expect(DiskSession.open(outputPathname).fileSystem?.nameAndVersion).to.eql("TRSDOS 2.x");
        });
    });
});
