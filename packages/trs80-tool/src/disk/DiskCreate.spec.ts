import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeFloppyFileSystem, Density, makeTrsdos23TestDisk, SectorPosition, type TestFile, TrsdosFormatDos,
    trsdosFormatDosCliName,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {parseFormatDosName} from "./DiskHelp.js";
import {DiskSession} from "./DiskSession.js";
import {
    describeSystemDiskTemplate, getDataDiskBootSectors, loadSystemDiskTemplate, SYSTEM_DISK_TEMPLATES,
    type SystemDiskTemplate,
} from "./DiskTemplates.js";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};

/**
 * One DOS that "create" makes, with what is expected of the disk.
 */
interface DosCase {
    /** The DOS argument of create. */
    dos: string;
    /** The name that the disk's decoded file system has. The decoder can't tell TRSDOS 2.3 from other 2.x. */
    nameAndVersion: string;
}

const DOS_CASES: DosCase[] = [
    {dos: "trsdos-2.3", nameAndVersion: "TRSDOS 2.x"},
    {dos: "trsdos-1.3", nameAndVersion: "TRSDOS 1.x"},
    {dos: "ldos-5.3", nameAndVersion: "LDOS 5.3"},
    {dos: "trsdos-6.2", nameAndVersion: "TRSDOS 6.2"},
    {dos: "lsdos-6.3", nameAndVersion: "LS-DOS 6.3"},
];

/**
 * One data disk whose boot sectors should be the DOS's own.
 */
interface BootSectorCase {
    /** The words after "create" that choose the DOS and density. */
    words: string[];
    /** The DOS. */
    dos: TrsdosFormatDos;
    /** The disk's density. */
    density: Density;
    /** The sector numbers that the boot sectors are in, on cylinder 0 side 0. */
    sectors: number[];
    /** The offset in the first boot sector of the directory cylinder, which the formatter patches. */
    directoryCylinderOffset: number;
}

const BOOT_SECTOR_CASES: BootSectorCase[] = [
    {words: ["trsdos-2.3"], dos: TrsdosFormatDos.TRSDOS_2_3, density: Density.SINGLE, sectors: [0],
        directoryCylinderOffset: 2},
    {words: ["trsdos-1.3"], dos: TrsdosFormatDos.TRSDOS_1_3, density: Density.DOUBLE, sectors: [1, 2],
        directoryCylinderOffset: 1},
    {words: ["ldos-5.3", "--model", "1"], dos: TrsdosFormatDos.LDOS_5_3, density: Density.SINGLE,
        sectors: [0, 1], directoryCylinderOffset: 2},
    {words: ["ldos-5.3", "--model", "3"], dos: TrsdosFormatDos.LDOS_5_3, density: Density.DOUBLE,
        sectors: [0, 1], directoryCylinderOffset: 2},
    {words: ["trsdos-6.2"], dos: TrsdosFormatDos.TRSDOS_6_2, density: Density.DOUBLE, sectors: [0, 1],
        directoryCylinderOffset: 2},
    {words: ["lsdos-6.3"], dos: TrsdosFormatDos.LSDOS_6_3, density: Density.DOUBLE, sectors: [0, 1],
        directoryCylinderOffset: 2},
];

/**
 * What a system disk template's file system calls itself, such as "LDOS 5.3.1": unlike a data disk
 * we make, it has the DOS's banner, which names the release.
 */
function templateNameAndVersion(template: SystemDiskTemplate): string {
    return describeSystemDiskTemplate(template).replace(/ system disk for the Model \d$/, "");
}

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
            const lines = await runDisk("create", dosCase.dos);
            expect(lines[0]).to.match(new RegExp("^Created " + imagePathname.replace(/\./g, "\\.") +
                ": Floppy disk \\(DMK\\), " + dosCase.nameAndVersion.replace(/\./g, "\\.") + ", 0 files, \\d+ KB free$"));
            expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");

            // Reopen it with no help from the global --dos.
            const session = DiskSession.open(imagePathname);
            expect(session.fileSystem?.nameAndVersion).to.eql(dosCase.nameAndVersion);
            expect(session.getInputFiles(false)).to.eql([]);
            expect(session.getReadOnlyReason()).to.eql(undefined);
        });

        it(`creates a ${dosCase.nameAndVersion} disk, then lists, checks, and adds a file in the same run`, async () => {
            const hostPathname = makeHostFile("data.bin", 3000);
            const words = ["create", dosCase.dos, ":", "dir", ":", "free", ":", "check",
                ":", "add", hostPathname, "--as", "DATA/BIN", ":", "dir"];
            const lines = await runDisk(...words);
            expect(lines.some(line => /^\d+ KB free \(\d+ granules? of [\d,]+ bytes( each)?\)$/.test(line))).to.eql(true);
            expect(lines).to.include("No files");
            expect(lines).to.include("Safe to write.");
            expect(lines.some(line => line.startsWith("Saved "))).to.eql(true);

            expect(lines).to.include("Added DATA/BIN (3,000 bytes).");
            const session = DiskSession.open(imagePathname);
            expect(session.getInputFiles(false).map(f => f.filename)).to.eql(["DATA.BIN"]);
            const inputFile = session.getInputFiles(false)[0];
            expect(Array.from(inputFile.binary)).to.eql(Array.from(fs.readFileSync(hostPathname)));
        });
    }

    it("uses the defaults: 40 cylinders, one side, double density, 35 cylinders for TRSDOS 2.3", async () => {
        await runDisk("create", "ldos-5.3", "--date", "1983-05-09", "--name", "games");
        const lines = await runDisk("label");
        expect(lines.slice(0, 2)).to.eql(["Name: GAMES", "Date: 05/09/83"]);
        const floppy = DiskSession.open(imagePathname).floppy;
        const geometry = floppy.getGeometry();
        expect([geometry.cylinderCount, geometry.sideCount]).to.eql([40, 1]);
        expect(geometry.modalDataDensity).to.eql(Density.DOUBLE);

        const trsdos23Pathname = path.join(dir, "old.dmk");
        await runDiskOn(trsdos23Pathname, "create", "trsdos-2.3");
        expect(DiskSession.open(trsdos23Pathname).floppy.getGeometry().cylinderCount).to.eql(35);
    });

    it("takes the cylinders, sides, density and model options", async () => {
        await runDisk("create", "ldos-5.3", "--cylinders", "35", "--density", "single");
        let geometry = DiskSession.open(imagePathname).floppy.getGeometry();
        expect([geometry.cylinderCount, geometry.sideCount, geometry.modalDataDensity]).to.eql([35, 1, Density.SINGLE]);

        // Model 1 means single density for LDOS.
        await runDisk("create", "ldos-5.3", "--model", "1", "--force");
        geometry = DiskSession.open(imagePathname).floppy.getGeometry();
        expect(geometry.modalDataDensity).to.eql(Density.SINGLE);
    });

    it("puts today's date on the disk by default, as FORMAT does", async () => {
        await runDisk("create", "lsdos-6.3");
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
        const error = await runDiskExpectingError("create", "cpm");
        expect(error.message).to.eql("Unknown DOS \"cpm\". The DOSes are:\n" +
            "  trsdos-2.3  TRSDOS 2.3, Model I\n" +
            "  trsdos-1.3  TRSDOS 1.3, Model III\n" +
            "  ldos-5.3    LDOS 5.3, Model I (--model 1) or Model III (the default)\n" +
            "  trsdos-6.2  TRSDOS 6.2, Model 4\n" +
            "  lsdos-6.3   LS-DOS 6.3, Model 4");
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("refuses to create without a DOS, and lists the choices", async () => {
        const error = await runDiskExpectingError("create");
        expect(error.message).to.match(/^create needs a DOS to make the disk for\. The DOSes are:\n  trsdos-2\.3  TRSDOS 2\.3, Model I\n/);
        expect(error.message).to.contain("  lsdos-6.3   LS-DOS 6.3, Model 4");
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("no longer takes --dos as an option", async () => {
        const error = await runDiskExpectingError("create", "--dos", "ldos-5.3");
        expect(error.message).to.match(/^create: unknown option '--dos'/);
    });

    it("refuses options the DOS can't do, and creates no file", async () => {
        expect((await runDiskExpectingError("create", "trsdos-2.3", "--sides", "2")).message)
            .to.match(/formats only one side/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--cylinders", "200")).message)
            .to.match(/35 to 80 cylinders/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--cylinders", "x")).message)
            .to.match(/Invalid --cylinders/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--sides", "3")).message)
            .to.match(/Invalid --sides/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--density", "quad")).message)
            .to.match(/Invalid --density/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--model", "2")).message)
            .to.match(/Invalid --model/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--name", "1bad")).message)
            .to.match(/Invalid disk name/);
        expect((await runDiskExpectingError("create", "ldos-5.3", "--date", "1983-02-30")).message)
            .to.match(/Invalid --date/);
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("accepts the global --dos option together with the DOS to create", async () => {
        const lines = await runDisk("--dos", "ldos-5", "create", "lsdos-6.3");
        expect(lines[0]).to.include("LS-DOS 6.3");
    });

    it("refuses an existing disk without --force, and replaces it in memory with it", async () => {
        await runDisk("create", "trsdos-2.3");
        const before = fs.readFileSync(imagePathname);
        const error = await runDiskExpectingError("create", "ldos-5.3");
        expect(error.message).to.match(/already has a disk; use --force/);
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const lines = await runDisk("create", "ldos-5.3", "--force");
        expect(lines[0]).to.eql("Replaced the disk in memory; nothing is saved until quit.");
        expect(lines[1]).to.include("LDOS 5.3");
        expect(DiskSession.open(imagePathname).fileSystem?.nameAndVersion).to.eql("LDOS 5.3");
    });

    it("refuses to create twice in one run without --force", async () => {
        const error = await runDiskExpectingError("create", "ldos-5.3", ":", "create", "lsdos-6.3");
        expect(error.message).to.match(/already has a disk/);
        // Nothing was saved, since a command failed.
        expect(fs.existsSync(imagePathname)).to.eql(false);
    });

    it("refuses an image name that isn't DMK", async () => {
        for (const extension of [".jv1", ".jv3", ".dsk", ".hfe", ".imd"]) {
            const pathname = path.join(dir, "new" + extension);
            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "create", "ldos-5.3");
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
        await runDiskOn(inputPathname, "--output", outputPathname, "create", "ldos-5.3");
        expect(fs.existsSync(inputPathname)).to.eql(false);
        expect(DiskSession.open(outputPathname).fileSystem?.nameAndVersion).to.eql("LDOS 5.3");
    });

    it("says that a missing image doesn't exist for every other command", async () => {
        for (const command of [["dir"], ["free"], ["check"], ["info"], ["save"], ["rm", "X"], ["add", "x"], ["label"],
            ["format", "ldos-5.3"]]) {

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
        const lines = await runDisk("create", "ldos-5.3", ":", "quit");
        expect(lines[lines.length - 1]).to.eql("Saved " + imagePathname + ".");
        expect(fs.existsSync(imagePathname)).to.eql(true);
    });

    it("discards a created disk on abort", async () => {
        const lines = await runDisk("create", "ldos-5.3", ":", "abort");
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
        const lines = await runDisk("--dry-run", "create", "ldos-5.3");
        expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + imagePathname + " would have changed.");
        expect(fs.existsSync(imagePathname)).to.eql(false);
        expect(fs.readdirSync(dir)).to.eql([]);
    });

    it("makes two-sided LDOS-line disks that pass the write gate and take files", async () => {
        const hostPathname = makeHostFile("data.bin", 500);
        // Adding a file verifies the whole disk, which takes a while, so each DOS gets one density.
        for (const [dos, density] of [["ldos-5.3", "single"], ["trsdos-6.2", "double"], ["lsdos-6.3", "double"]]) {
            const pathname = path.join(dir, dos + "-" + density + ".dmk");
            const lines = await runDiskOn(pathname, "create", dos, "--sides", "2", "--density", density,
                "--cylinders", "35", ":", "add", hostPathname);
            expect(lines.some(line => line.includes("Read-only: "))).to.eql(false);
            const session = DiskSession.open(pathname);
            expect(session.floppy.getGeometry().sideCount).to.eql(2);
            expect(session.getReadOnlyReason()).to.eql(undefined);
            expect(session.getInputFiles(false).map(f => f.filename)).to.eql(["DATA.BIN"]);
        }
    });

    for (const bootCase of BOOT_SECTOR_CASES) {
        it(`gives a ${bootCase.words.join(" ")} disk the DOS's own boot sectors`, async () => {
            await runDisk("create", ...bootCase.words);
            const floppy = DiskSession.open(imagePathname).floppy;

            const bundled = getDataDiskBootSectors(bootCase.dos, bootCase.density);
            expect(bundled).to.not.eql(undefined);
            expect(bundled?.length).to.eql(bootCase.sectors.length);
            bootCase.sectors.forEach((sectorNumber, i) => {
                const actual = floppy.readSector(SectorPosition.make(0, 0, sectorNumber))?.data;
                expect(actual).to.not.eql(undefined);
                const expected = new Uint8Array(bundled![i]);
                // The formatter patches in the directory cylinder (and nothing else), since the bundled sectors
                // may come from a disk of another size. The LDOS line keeps it in both boot sectors.
                expected[bootCase.directoryCylinderOffset] = actual![bootCase.directoryCylinderOffset];
                expect(Array.from(actual!)).to.eql(Array.from(expected));
            });
        });
    }

    it("has boot sectors for the combinations we measured and none for the others", () => {
        expect(getDataDiskBootSectors(TrsdosFormatDos.LDOS_5_3, Density.SINGLE)).to.not.eql(undefined);
        expect(getDataDiskBootSectors(TrsdosFormatDos.LDOS_5_3, Density.DOUBLE)).to.not.eql(undefined);
        expect(getDataDiskBootSectors(TrsdosFormatDos.LSDOS_6_3, Density.SINGLE)).to.eql(undefined);
        expect(getDataDiskBootSectors(TrsdosFormatDos.TRSDOS_6_2, Density.SINGLE)).to.eql(undefined);
    });

    it("still makes a disk where we have no boot sectors of the DOS's own", async () => {
        await runDisk("create", "lsdos-6.3", "--density", "single");
        expect(DiskSession.open(imagePathname).fileSystem?.nameAndVersion).to.eql("LS-DOS 6.3");
    });

    describe("--system", () => {
        /**
         * The words of "create" that choose a system disk.
         */
        function systemWords(template: SystemDiskTemplate): string[] {
            return ["create", trsdosFormatDosCliName(template.dos), "--model", String(template.model), "--system"];
        }

        for (const template of SYSTEM_DISK_TEMPLATES) {
            const description = describeSystemDiskTemplate(template);

            it(`copies the ${description}`, async () => {
                const lines = await runDisk(...systemWords(template));
                expect(lines[0]).to.match(/^Created .*: Floppy disk \(DMK\), /);
                expect(lines.some(line => line.startsWith("Copied from the " + description + " ("))).to.eql(true);
                expect(lines.some(line => line.includes("Read-only: "))).to.eql(false);

                const templateFloppy = loadSystemDiskTemplate(template);
                const templateFileSystem = decodeFloppyFileSystem(templateFloppy);
                expect(templateFileSystem?.nameAndVersion).to.eql(templateNameAndVersion(template));

                const session = DiskSession.open(imagePathname);
                expect(session.fileSystem?.nameAndVersion).to.eql(templateNameAndVersion(template));
                expect(session.getReadOnlyReason()).to.eql(undefined);
                expect(session.floppy.isWriteProtected()).to.eql(false);
                // Exactly what the template has.
                const names = session.fileSystem!.getDirEntries(true).map(dirEntry => dirEntry.getFilename("/"));
                const templateNames = templateFileSystem!.getDirEntries(true).map(dirEntry => dirEntry.getFilename("/"));
                expect(names).to.eql(templateNames);
            });

            it(`makes a minimal ${description} with only system files, which then takes a file`, async () => {
                const hostPathname = makeHostFile("small.bin", 300);
                const lines = await runDisk(...systemWords(template), "--minimal", ":", "add", hostPathname, "--as",
                    "SMALL/BIN");
                expect(lines).to.include("Added SMALL/BIN (300 bytes).");
                expect(lines.some(line => line.startsWith("Copied from the " + description))).to.eql(true);
                expect(lines.some(line => /--minimal/.test(line))).to.eql(true);

                const session = DiskSession.open(imagePathname);
                expect(session.fileSystem?.nameAndVersion).to.eql(templateNameAndVersion(template));
                expect(session.getReadOnlyReason()).to.eql(undefined);
                const dirEntries = session.fileSystem!.getDirEntries(true)
                    .filter(dirEntry => dirEntry.getFilename("/") !== "SMALL/BIN");
                expect(dirEntries.every(dirEntry => dirEntry.isSystemFile())).to.eql(true);
                const templateCount = decodeFloppyFileSystem(loadSystemDiskTemplate(template))!.getDirEntries(true).length;
                expect(dirEntries.length).to.be.at.most(templateCount);
                // Whatever was removed is named in the output.
                const removedCount = templateCount - dirEntries.length;
                expect(lines.some(line => line.includes(removedCount === 0 ? "No files to remove" :
                    "Removed " + removedCount + (removedCount === 1 ? " file" : " files")))).to.eql(true);
            });
        }

        it("changes the name and date of the copy", async () => {
            const template = SYSTEM_DISK_TEMPLATES.find(t => t.dos === TrsdosFormatDos.LDOS_5_3 && t.model === 3)!;
            await runDisk(...systemWords(template), "--name", "mydisk", "--date", "1983-05-09");
            const lines = await runDisk("label");
            expect(lines.slice(0, 2)).to.eql(["Name: MYDISK", "Date: 05/09/83"]);
        });

        it("chooses LDOS 5.3's Model I disk for --model 1 and the Model III disk otherwise", async () => {
            await runDisk("create", "ldos-5.3", "--model", "1", "--system");
            expect(DiskSession.open(imagePathname).floppy.getGeometry().modalDataDensity).to.eql(Density.SINGLE);
            await runDisk("create", "ldos-5.3", "--system", "--force");
            expect(DiskSession.open(imagePathname).floppy.getGeometry().modalDataDensity).to.eql(Density.DOUBLE);
        });

        it("refuses a shape that differs from the system disk's, and makes no file", async () => {
            const lsdos = SYSTEM_DISK_TEMPLATES.find(t => t.dos === TrsdosFormatDos.LSDOS_6_3)!;
            const cylinders = loadSystemDiskTemplate(lsdos).getGeometry().cylinderCount;

            const cylindersError = await runDiskExpectingError(...systemWords(lsdos), "--cylinders", String(cylinders + 5));
            expect(cylindersError.message).to.match(new RegExp("^The LS-DOS 6\\.3\\.1 system disk for the Model 4 is " +
                cylinders + " cylinders, (single|double)-sided, (single|double) density, so create --system can't use " +
                "--cylinders " + (cylinders + 5) + "$"));

            const densityError = await runDiskExpectingError(...systemWords(lsdos), "--density", "single");
            expect(densityError.message).to.match(/can't use --density single$/);

            expect(fs.existsSync(imagePathname)).to.eql(false);
        });

        it("accepts a shape that matches the system disk's", async () => {
            const lsdos = SYSTEM_DISK_TEMPLATES.find(t => t.dos === TrsdosFormatDos.LSDOS_6_3)!;
            const geometry = loadSystemDiskTemplate(lsdos).getGeometry();
            await runDisk(...systemWords(lsdos), "--cylinders", String(geometry.cylinderCount),
                "--sides", String(geometry.sideCount), "--density",
                geometry.modalDataDensity === Density.SINGLE ? "single" : "double");
            expect(fs.existsSync(imagePathname)).to.eql(true);
        });

        it("refuses --minimal without --system", async () => {
            const error = await runDiskExpectingError("create", "ldos-5.3", "--minimal");
            expect(error.message).to.eql("--minimal only applies with --system");
        });

        it("lists each DOS's name and what it makes in the help for create and format", async () => {
            const expected = [
                "  trsdos-2.3  TRSDOS 2.3, Model I",
                "  trsdos-1.3  TRSDOS 1.3, Model III",
                "  ldos-5.3    LDOS 5.3, Model I (--model 1) or Model III (the default)",
                "  trsdos-6.2  TRSDOS 6.2, Model 4",
                "  lsdos-6.3   LS-DOS 6.3, Model 4",
            ];
            for (const command of ["create", "format"]) {
                const lines = await runDisk("help", command);
                for (const line of expected) {
                    expect(lines).to.include(line);
                }
            }
            const help = (await runDisk("help", "create")).join("\n");
            expect(help).to.contain("Usage: create [options] [DOS]");
            expect(help).not.to.contain("other spellings");
            expect(help).not.to.contain("--dos");
        });
    });

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
            await runDiskOn(pathname, "create", "ldos-5.3", ":", "add", makeHostFile("a.bin", 100),
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
            await runDiskOn(pathname, "create", "trsdos-6.2", "--cylinders", "50", "--sides", "2",
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
            await runDiskOn(pathname, "create", "ldos-5.3", ":", "add", makeHostFile("a.bin", 100));

            await runDiskOn(pathname, "format", "lsdos-6.3", "--force", "--cylinders", "80");
            const session = DiskSession.open(pathname);
            expect(session.fileSystem?.nameAndVersion).to.eql("LS-DOS 6.3");
            expect(session.getInputFiles(false)).to.eql([]);
            expect(session.floppy.getGeometry().cylinderCount).to.eql(80);
        });

        it("can then add files in the same run", async () => {
            const pathname = path.join(dir, "old.dmk");
            await runDiskOn(pathname, "create", "ldos-5.3");
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
            await runDiskOn(pathname, "create", "ldos-5.3");
            const before = fs.readFileSync(pathname);
            const lines = await runDiskOn(pathname, "--dry-run", "format", "lsdos-6.3");
            expect(lines[lines.length - 1]).to.eql("Not saved (--dry-run): " + pathname + " would have changed.");
            expect(fs.readFileSync(pathname)).to.eql(before);
        });

        it("refuses an unknown DOS for format, listing the choices", async () => {
            const pathname = path.join(dir, "blank.dmk");
            await runDiskOn(pathname, "create", "ldos-5.3");

            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "format", "dosplus");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/Unknown DOS "dosplus" .*DOSPLUS disks can't be made yet.*The DOSes are/s);
        });

        it("needs a DOS and --force for a disk with no file system we recognize", async () => {
            const pathname = path.join(dir, "blank.jv1");
            fs.writeFileSync(pathname, new Uint8Array(35*10*256));
            const outputPathname = path.join(dir, "formatted.dmk");

            let error: unknown = undefined;
            try {
                await runDiskOn(pathname, "--output", outputPathname, "format");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/^format needs a DOS to format for.*The DOSes are:\n  trsdos-2\.3/s);

            error = undefined;
            try {
                await runDiskOn(pathname, "--output", outputPathname, "format", "trsdos-2.3");
            } catch (e) {
                error = e;
            }
            expect((error as ToolError).message).to.match(/no file system that we recognize.*use --force/);

            await runDiskOn(pathname, "--output", outputPathname, "format", "trsdos-2.3", "--force");
            expect(DiskSession.open(outputPathname).fileSystem?.nameAndVersion).to.eql("TRSDOS 2.x");
        });
    });
});
