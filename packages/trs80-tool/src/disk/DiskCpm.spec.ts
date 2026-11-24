import fs from "fs";
import os from "os";
import path from "path";
import {
    CPM_VERIFIED_LAYOUTS, Cpm, cpmTestRecordLocation, type CpmTestFile, type CpmVerifiedLayout, type CpmTestDiskOptions,
    findCpmVerifiedLayout, makeCpmTestDisk, setDmkConverterCrcMarker,
} from "trs80-base";
import {DiskSession} from "trs80-disk";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {disk} from "./disk.js";
import {openDiskSession, saveAndReport} from "./DiskFiles.js";
import type {
    AttribChangeResultJson, AttribShowResultJson, BlockFreeResultJson, DiskCommandJson, DiskRunJson, FreeResultJson,
    KillResultJson, RenameResultJson,
} from "./DiskJson.js";

/**
 * The verified layout with a name.
 */
function layoutNamed(name: string): CpmVerifiedLayout {
    const layout = CPM_VERIFIED_LAYOUTS.find(layout => layout.name === name);
    if (layout === undefined) {
        throw new Error("No layout " + name);
    }
    return layout;
}

/**
 * Bytes that differ along the file, so that a misplaced record shows.
 */
function pattern(length: number, seed: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*31 + seed + (i >> 7)*5) & 0xFF);
}

const STANDARD = layoutNamed("Standard system");

// A banner on the reserved tracks that names a Montezuma BIOS that didn't use skew 4, so that the disks of these
// tests don't have a layout doubt, which is what a disk from a real BIOS has.
const BANNER = "Model 4 64K System CP/M 2.2 v2.32";
const ENCODER = new TextEncoder();

/**
 * The files that most tests start with. A.TXT is text with a Ctrl-Z, B.BIN is binary, C.TXT is a system file,
 * and D.DAT is bigger. There are enough of them, spread over enough blocks, that removing one or two leaves
 * the layout unambiguous (a disk with one tiny file reads equally well several ways).
 */
function standardFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: ENCODER.encode("Hello, world.\r\nSecond line.\r\n\x1A")},
        {name: "B.BIN", contents: pattern(3000, 2)},
        {name: "C.TXT", contents: ENCODER.encode("System file.\r\n\x1A"), system: true},
        {name: "D.DAT", contents: pattern(5000, 3)},
    ];
}

describe("disk commands on a CP/M disk", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-cpm-"));
        imagePathname = path.join(dir, "test.dmk");
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
        process.exitCode = undefined;
    });

    /**
     * Write a test disk to the image file.
     */
    function makeImage(files: CpmTestFile[] = standardFiles(), layout = STANDARD, options: CpmTestDiskOptions = {}): void {
        fs.writeFileSync(imagePathname, makeCpmTestDisk(layout, files, {banner: BANNER, ...options}).binary);
    }

    /**
     * Write a host file and return its pathname.
     */
    function hostFile(name: string, contents: Uint8Array | string): string {
        const pathname = path.join(dir, name);
        fs.writeFileSync(pathname, contents);
        return pathname;
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
     * Run "disk --json" with these words and return the one JSON document that it printed.
     */
    async function runJson(...words: string[]): Promise<DiskRunJson> {
        const lines = await runDisk("--json", ...words);
        expect(lines.length).to.equal(1);
        return JSON.parse(lines[0]) as DiskRunJson;
    }

    /**
     * The command at an index of a run, with its result typed as asked.
     */
    function commandAt<T>(run: DiskRunJson, index: number, name: string): DiskCommandJson & {result: T} {
        const command = run.commands[index];
        expect(command.name).to.equal(name);
        expect(command.error).to.equal(undefined);
        return command as DiskCommandJson & {result: T};
    }

    /**
     * The CP/M file system on the image file.
     */
    function openCpm(): Cpm {
        const fileSystem = openDiskSession(imagePathname).fileSystem;
        if (!(fileSystem instanceof Cpm)) {
            throw new Error("Not CP/M");
        }
        return fileSystem;
    }

    /**
     * The names of the files on the image, in directory order, with the system file as well.
     */
    function fileNames(): string[] {
        return openCpm().getDirEntries(true).map(file => file.getFilename("."));
    }

    /**
     * The contents of the named file on the image (clipped at a text file's Ctrl-Z).
     */
    function fileBytes(name: string): Uint8Array {
        const cpm = openCpm();
        const file = cpm.getDirEntries(true).find(file => file.getFilename(".") === name);
        if (file === undefined) {
            throw new Error("No file " + name);
        }
        return cpm.readFile(file);
    }

    describe("kill", () => {
        it("removes files, in text and JSON, and leaves the others alone", async () => {
            makeImage();
            const bBytes = fileBytes("B.BIN");
            const lines = await runDisk("kill", "A.TXT");
            expect(lines).to.eql(["Removed A.TXT.", "Saved " + imagePathname + "."]);
            expect(fileNames()).to.eql(["B.BIN", "C.TXT", "D.DAT"]);
            expect(fileBytes("B.BIN")).to.eql(bBytes);

            makeImage();
            const run = await runJson("kill", "*.BIN", "a.txt");
            expect(commandAt<KillResultJson>(run, 0, "kill").result).to.eql({removed: ["A.TXT", "B.BIN"]});
            expect(run.saved).to.equal(imagePathname);
            expect(fileNames()).to.eql(["C.TXT", "D.DAT"]);
        });

        it("removes nothing if a pattern matches no file, and no wildcard reaches a system file", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("kill", "A.TXT", "NOSUCH.TXT")).rejects.toThrow("No file on the disk matches \"NOSUCH.TXT\"");
            await expect(runDisk("kill", "C.*")).rejects.toThrow(/wildcards don't match system files/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            await runDisk("kill", "C.TXT");
            expect(fileNames()).to.eql(["A.TXT", "B.BIN", "D.DAT"]);
        });

        it("refuses a name that belongs to files of several users", async () => {
            makeImage([...standardFiles(), {name: "A.TXT", contents: pattern(10, 4), user: 3}]);
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("kill", "A.TXT")).rejects.toThrow("user 0 and user 3");
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            // A name that only one user has is fine, and the other user's file isn't touched.
            await runDisk("kill", "B.BIN");
            expect(fileNames()).to.eql(["A.TXT", "C.TXT", "D.DAT", "A.TXT"]);
        });

        it("saves when the last file is killed, and the empty disk is recognized when opened again", async () => {
            makeImage();
            const lines = await runDisk("kill", "A.TXT", "B.BIN", "C.TXT", "D.DAT");
            expect(lines).to.include("Saved " + imagePathname + ".");
            expect(fileNames()).to.eql([]);
            expect(openCpm().getDirEntries(true)).to.eql([]);
            const layout = findCpmVerifiedLayout(openCpm());
            expect(layout?.id).to.equal("mm-system");
        });

        it("refuses to save when the last file is killed on a disk that wouldn't be recognized empty, and leaves the " +
            "image alone", async () => {
            // With no boot sector, track 0's first sector looks like a directory, which a system format's never does.
            makeImage(standardFiles(), STANDARD, {noBootSector: true});
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("kill", "A.TXT", "B.BIN", "C.TXT", "D.DAT")).rejects.toThrow(
                /Can't save: when it's opened again, this empty disk wouldn't be recognized as mm-system. Give --cpm-format mm-system, or add a file first/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });

        it("says in a dry run that the save would fail", async () => {
            makeImage(standardFiles(), STANDARD, {noBootSector: true});
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("--dry-run", "kill", "A.TXT", "B.BIN", "C.TXT", "D.DAT", "D.DAT")).rejects.toThrow(
                /Can't save: when it's opened again, this empty disk/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });

        it("lets a chain kill the last file and add another, and saves", async () => {
            makeImage();
            const host = hostFile("new.txt", "Brand new.\n");
            const lines = await runDisk("kill", "A.TXT", "B.BIN", "C.TXT", "D.DAT", ":", "add", host);
            expect(lines).to.include("Saved " + imagePathname + ".");
            expect(fileNames()).to.eql(["NEW.TXT"]);
            expect(fileBytes("NEW.TXT")).to.eql(ENCODER.encode("Brand new.\r\n"));
        });
    });

    describe("rename", () => {
        it("renames a file in text and JSON and keeps its attributes", async () => {
            makeImage();
            const lines = await runDisk("rename", "c.txt", "newname.xyz");
            expect(lines).to.eql(["Renamed C.TXT to NEWNAME.XYZ.", "Saved " + imagePathname + "."]);
            expect(fileNames()).to.eql(["A.TXT", "B.BIN", "NEWNAME.XYZ", "D.DAT"]);
            const renamed = openCpm().getDirEntries(true)[2];
            expect(renamed.isSystemFile()).to.equal(true);

            makeImage();
            const run = await runJson("mv", "A.TXT", "Z.TXT");
            expect(commandAt<RenameResultJson>(run, 0, "rename").result).to.eql({from: "A.TXT", to: "Z.TXT"});
            expect(fileNames()).to.eql(["Z.TXT", "B.BIN", "C.TXT", "D.DAT"]);
        });

        it("refuses a name that another file has, a bad name, and a missing file", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("rename", "A.TXT", "B.BIN")).rejects.toThrow("B.BIN is already on the disk");
            await expect(runDisk("rename", "A.TXT", "BAD?.TXT")).rejects.toThrow(/isn't a CP\/M file name/);
            await expect(runDisk("rename", "A.TXT", "TOOLONGNAME.TXT")).rejects.toThrow(/longer than 8 characters/);
            await expect(runDisk("rename", "NOSUCH.TXT", "X.TXT")).rejects.toThrow("No file on the disk is called NOSUCH.TXT");
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });
    });

    describe("attrib", () => {
        it("shows the attributes, in text and JSON", async () => {
            makeImage();
            const lines = await runDisk("attrib", "*");
            expect(lines).to.eql(["A.TXT: no attributes", "B.BIN: no attributes", "D.DAT: no attributes"]);

            const run = await runJson("attrib", "A.TXT", "C.TXT");
            const files = commandAt<AttribShowResultJson>(run, 0, "attrib").result.files;
            expect(files).to.eql([
                {name: "A.TXT", protection: {level: 0, name: "FULL"}, invisible: false, system: false, readOnly: false,
                    updatePassword: false, accessPassword: false, date: null},
                {name: "C.TXT", protection: {level: 0, name: "FULL"}, invisible: true, system: true, readOnly: false,
                    updatePassword: false, accessPassword: false, date: null},
            ]);
        });

        it("sets and clears R/O and SYS, in text and JSON", async () => {
            makeImage();
            const lines = await runDisk("attrib", "B.BIN", "--read-only", "--system");
            expect(lines[0]).to.equal("Changed B.BIN: system, read-only.");
            const b = openCpm().getDirEntries(true).find(file => file.getFilename(".") === "B.BIN")!;
            expect(b.getAttributesString()).to.equal("R/O SYS");

            const run = await runJson("attrib", "B.BIN", "--no-read-only", "--visible");
            const result = commandAt<AttribChangeResultJson>(run, 0, "attrib").result;
            expect(result).to.eql({files: ["B.BIN"], changes: {invisible: false, readOnly: false}});
            const cleared = openCpm().getDirEntries(true).find(file => file.getFilename(".") === "B.BIN")!;
            expect(cleared.getAttributesString()).to.equal("");
        });

        it("refuses contradictory options and what CP/M doesn't have", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("attrib", "A.TXT", "--invisible", "--no-system")).rejects.toThrow(/both mean SYS/);
            await expect(runDisk("attrib", "A.TXT", "--protect", "READ")).rejects.toThrow(/CP\/M 2.2 has no protection levels/);
            await expect(runDisk("attrib", "A.TXT", "--password", "SECRET")).rejects.toThrow(/don't apply to CP\/M/);
            await expect(runDisk("attrib", "A.TXT", "--date", "2001-02-03")).rejects.toThrow(/don't apply to CP\/M/);
            await expect(runDisk("attrib", "A.TXT", "--read-only", "--no-read-only")).rejects.toThrow(/either --read-only or/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });
    });

    describe("add", () => {
        it("adds a text file as CR LF with a Ctrl-Z, and says what it did", async () => {
            makeImage();
            const host = hostFile("notes.txt", "one\ntwo\r\nthree");
            const lines = await runDisk("add", host);
            expect(lines).to.eql(["Converted line endings of notes.txt.", "Added NOTES.TXT (16 bytes).",
                "Saved " + imagePathname + "."]);
            expect(fileBytes("NOTES.TXT")).to.eql(ENCODER.encode("one\r\ntwo\r\nthree"));
            // The reader ends a text file at its Ctrl-Z, and the directory has the whole record.
            const notes = openCpm().getDirEntries(true).find(file => file.getFilename(".") === "NOTES.TXT")!;
            expect(notes.getRecordSize()).to.equal(128);
        });

        it("copies binary files and .cas files as they are, and tokenized .bas files too", async () => {
            makeImage();
            const data = pattern(5000, 9);
            const tokenized = Uint8Array.from([0xFF, 0x01, 0x02, 0x03]);
            const cassette = Uint8Array.from([0x55, 0x55, 0x55, 0xA5, 0x01]);
            const run = await runJson("add", hostFile("data.bin", data), hostFile("prog.bas", tokenized),
                hostFile("tape.cas", cassette));
            const result = commandAt<{files: {name: string, size: number, replaced: boolean}[]}>(run, 0, "add").result;
            expect(result.files.map(file => [file.name, file.size, file.replaced])).to.eql(
                [["DATA.BIN", 5000, false], ["PROG.BAS", 4, false], ["TAPE.CAS", 5, false]]);
            expect(fileBytes("DATA.BIN").subarray(0, 5000)).to.eql(data);
            expect(fileBytes("PROG.BAS").subarray(0, 4)).to.eql(tokenized);
            expect(fileBytes("TAPE.CAS").subarray(0, 5)).to.eql(cassette);
        });

        it("skips a file that's too big with --keep-going, and adds the small one", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            const huge = hostFile("huge.dat", new Uint8Array(2*1024*1024));
            const small = hostFile("small.dat", "x");

            await expect(runDisk("add", huge, small)).rejects.toThrow(/; use --keep-going to add the others$/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            const lines = await runDisk("add", huge, small, "--keep-going");
            expect(lines[0]).to.equal("Added SMALL.DAT (1 byte).");
            expect(lines[1]).to.match(/^There's no room for HUGE\.DAT: .*; skipped it\.$/);
            expect(fileBytes("SMALL.DAT")).to.eql(ENCODER.encode("x"));
            expect(fileNames()).not.to.include("HUGE.DAT");
        });

        it("treats a .bas file that isn't tokenized as text", async () => {
            makeImage();
            await runDisk("add", hostFile("prog.bas", "10 PRINT \"HI\"\n20 END\n"));
            expect(fileBytes("PROG.BAS")).to.eql(ENCODER.encode("10 PRINT \"HI\"\r\n20 END\r\n"));
        });

        it("names files from the host name or --as, with --system", async () => {
            makeImage();
            const lines = await runDisk("add", hostFile("my-long_name123.dat", "x"), "--as", "out.dat", "--system");
            expect(lines[0]).to.equal("Added OUT.DAT (1 byte).");
            const added = openCpm().getDirEntries(true).find(file => file.getFilename(".") === "OUT.DAT")!;
            expect(added.isSystemFile()).to.equal(true);

            // Characters that TRSDOS drops are kept, and the rest are dropped.
            const converted = await runDisk("add", hostFile("1-up v2!.t_t", "y"));
            expect(converted[0]).to.equal("1-up v2!.t_t will be 1-UPV2!.T_T.");
        });

        it("refuses a name that's already there unless --overwrite, which keeps the attributes", async () => {
            makeImage();
            const host = hostFile("a.txt", "Replacement\n");
            await expect(runDisk("add", host)).rejects.toThrow("A.TXT is already on the disk (use --overwrite to replace it)");

            await runDisk("attrib", "A.TXT", "--read-only");
            const lines = await runDisk("add", host, "--overwrite");
            expect(lines).to.include("Replaced A.TXT (14 bytes).");
            const replaced = openCpm().getDirEntries(true).find(file => file.getFilename(".") === "A.TXT")!;
            expect(replaced.isReadOnly()).to.equal(true);
            expect(fileBytes("A.TXT")).to.eql(ENCODER.encode("Replacement\r\n"));
        });

        it("refuses --ascii and --date, and adds nothing", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            const host = hostFile("b.txt", "text\n");
            await expect(runDisk("add", host, "--ascii")).rejects.toThrow(/--ascii doesn't apply to CP\/M/);
            await expect(runDisk("add", host, "--date", "2001-02-03")).rejects.toThrow(/--date doesn't apply to CP\/M/);
            await expect(runDisk("add", host, "--as", "bad name.txt")).rejects.toThrow(/isn't a CP\/M file name/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });

        it("fails when the disk is full, and changes nothing", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("add", hostFile("big.bin", new Uint8Array(300*1024)))).rejects.toThrow(/no room/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });
    });

    describe("free", () => {
        it("counts blocks, in text and JSON, and counts what a new file takes", async () => {
            makeImage();
            // 85 blocks, of which 2 hold the directory, A.TXT takes 1, B.BIN 2, C.TXT 1, and D.DAT 3.
            const lines = await runDisk("free");
            expect(lines).to.eql(["152 KB free (76 blocks of 2,048 bytes each)"]);

            const run = await runJson("free");
            const free = commandAt<FreeResultJson>(run, 0, "free").result as BlockFreeResultJson;
            expect(free).to.eql({unit: "block", freeBlocks: 76, blockBytes: 2048, freeBytes: 76*2048, missingBlocks: 0});

            await runDisk("add", hostFile("big.bin", new Uint8Array(3*2048)));
            const after = (commandAt<FreeResultJson>(await runJson("free"), 0, "free").result) as BlockFreeResultJson;
            expect(after.freeBlocks).to.equal(73);
        });
    });

    describe("a layout that stops being detectable", () => {
        it("lets the session kill all but one file on a damaged disk, refuses the save, and allows it after an undo", async () => {
            // A bad entry (-2) outweighs the one good entry that's left, so a fresh open of what's left wouldn't find CP/M at all.
            const bad = (slot: number): {slot: number, bytes: Uint8Array} => {
                const bytes = new Uint8Array(32);
                bytes.set(Array.from("BAD     TXT", c => c.charCodeAt(0)), 1);
                bytes[12] = 0xFF;
                return {slot, bytes};
            };
            makeImage(standardFiles(), STANDARD, {rawEntries: [bad(20)]});
            const before = fs.readFileSync(imagePathname);
            const session = openDiskSession(imagePathname, {force: true, warn: () => {}});
            await session.runUndoable("kill", () => {
                session.changeCpm(0, writer => {
                    for (const file of writer.getFiles().filter(file => file.getFilename(".") !== "D.DAT")) {
                        writer.deleteFile(file);
                    }
                });
            });
            expect(session.fileSystem!.getDirEntries(true).map(file => file.getFilename("."))).to.eql(["D.DAT"]);
            expect(session.getSaveBlocker()).to.match(/^Can't save: when it's opened again, this disk wouldn't be recognized/);
            expect(() => saveAndReport(session, false)).to.throw(/wouldn't be recognized as .* with its current layout/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            session.undo();
            expect(session.getSaveBlocker()).to.equal(undefined);
            expect(session.hasChanges()).to.equal(false);
        });

        it("doesn't let a doubt that a change leaves block the next command", () => {
            // No banner, and a first file of text long enough that reading with skew 4 finds bad entries, so the
            // layout isn't in doubt until that file is gone.
            const text = ENCODER.encode("Hello, world.\r\n".repeat(70));
            makeImage([{name: "L.TXT", contents: text}, {name: "B.BIN", contents: pattern(3000, 2)},
                {name: "D.DAT", contents: pattern(5000, 3)}], STANDARD, {banner: ""});
            const session = openDiskSession(imagePathname);
            expect(session.getReadOnlyReason()).to.equal(undefined);

            session.changeCpm(0, writer => writer.replaceFile(writer.getFiles()[0], pattern(100, 7)));
            // Clear what's left of the old text in its block, which the wrong skew read as bad entries. This is a
            // stand-in for a disk that never had such text there.
            for (let record = 2*16; record < 3*16; record++) {
                const {position, offset} = cpmTestRecordLocation(STANDARD, record);
                const sector = session.floppy.readSector(position)!;
                sector.data.fill(0xE5, offset, offset + 128);
                session.floppy.writeSector(position, sector);
            }
            expect(session.getSaveBlocker()).to.equal(undefined);
            // Without --force, the next command goes ahead.
            expect(session.getReadOnlyReason()).to.equal(undefined);
            session.changeCpm(0, writer => writer.renameFile(writer.getFiles()[0], {name: "NEXT", extension: "BIN"}));
            expect(session.fileSystem!.getDirEntries(true).map(file => file.getFilename("."))).to.include("NEXT.BIN");

            // Opened afresh, the same image is in doubt.
            const fresh = DiskSession.fromBinary("fresh.dmk", new Uint8Array(session.image.binary));
            expect(fresh.getReadOnlyReason()).to.contain("equally well");
        });
    });

    describe("free with a damaged block", () => {
        it("counts a free block with a CRC error apart", async () => {
            // Block 20 holds no file, and one of its sectors has a CRC error.
            const image = setDmkConverterCrcMarker(makeCpmTestDisk(STANDARD, standardFiles(), {banner: BANNER}),
                cpmTestRecordLocation(STANDARD, 20*16).position);
            fs.writeFileSync(imagePathname, image.binary);
            const lines = await runDisk("free");
            expect(lines).to.eql(["150 KB free (75 blocks of 2,048 bytes each); 1 more block looks free but has a sector " +
                "that is missing or bad"]);
            const free = commandAt<FreeResultJson>(await runJson("free"), 0, "free").result as BlockFreeResultJson;
            expect(free.freeBlocks).to.equal(75);
            expect(free.missingBlocks).to.equal(1);
        });
    });

    describe("refusals", () => {
        it("refuses an unsupported layout", async () => {
            makeImage(standardFiles(), STANDARD, {cylinderCount: 35});
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("kill", "A.TXT")).rejects.toThrow(/isn't supported yet/);
            await expect(runDisk("--force", "kill", "A.TXT")).rejects.toThrow(/isn't supported yet/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });

        it("refuses a damaged directory, and --force writes anyway", async () => {
            const bad = new Uint8Array(32);
            bad.set(Array.from("BAD     TXT", c => c.charCodeAt(0)), 1);
            bad[12] = 0xFF;
            makeImage([...standardFiles(), {name: "D.TXT", contents: pattern(10, 4)}, {name: "E.TXT", contents: pattern(10, 5)}],
                STANDARD, {rawEntries: [{slot: 9, bytes: bad}]});
            const before = fs.readFileSync(imagePathname);

            await expect(runDisk("kill", "A.TXT")).rejects.toThrow(/Can't write to this disk.*directory is damaged.*--force/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);

            const lines = await runDisk("--force", "kill", "A.TXT");
            expect(lines[0]).to.match(/Writing anyway \(--force\)/);
            expect(fileNames()).to.eql(["B.BIN", "C.TXT", "D.DAT", "D.TXT", "E.TXT"]);
        });

        it("refuses label, repair, and the TRSDOS-only commands", async () => {
            makeImage();
            const before = fs.readFileSync(imagePathname);
            await expect(runDisk("label")).rejects.toThrow("CP/M 2.2 disks have no name or date.");
            await expect(runDisk("label", "--name", "X")).rejects.toThrow("CP/M 2.2 disks have no name or date.");
            await expect(runDisk("repair")).rejects.toThrow("Repairing CP/M disks isn't supported.");
            expect(fs.readFileSync(imagePathname)).to.eql(before);
        });

        it("writes a write-protected image only with --force", () => {
            makeImage();
            const refused = openDiskSession(imagePathname);
            refused.floppy.setMountedWriteProtected(true);
            expect(() => refused.changeCpm(0, writer => writer.deleteFile(writer.getFiles()[0])))
                .to.throw(/write-protected.*--force/);
            expect(refused.hasChanges()).to.equal(false);

            const forced = openDiskSession(imagePathname, {force: true, warn: () => {}});
            forced.floppy.setMountedWriteProtected(true);
            forced.changeCpm(0, writer => writer.deleteFile(writer.getFiles()[0]));
            expect(forced.hasChanges()).to.equal(true);
            expect(forced.fileSystem!.getDirEntries(true).length).to.equal(3);
        });
    });

    describe("a session", () => {
        /**
         * Open the image as a session that keeps the layout across changes, the way "disk" does.
         */
        function open(): DiskSession {
            return openDiskSession(imagePathname);
        }

        it("keeps a CP/M file system when the last file is killed, undone, and redone", async () => {
            makeImage(standardFiles(), STANDARD, {noBootSector: true});
            const session = open();
            await session.runUndoable("kill all", () => {
                session.changeCpm(0, writer => writer.getFiles().forEach(file => writer.deleteFile(file)));
            });
            expect(session.fileSystem).to.be.instanceOf(Cpm);
            expect(session.fileSystem!.getDirEntries(true)).to.eql([]);
            expect(session.getSaveBlocker()).to.contain("this empty disk wouldn't be recognized as mm-system");
            // It's still writable.
            expect(session.getReadOnlyReason()).to.equal(undefined);

            session.undo();
            expect(session.fileSystem).to.be.instanceOf(Cpm);
            expect(session.fileSystem!.getDirEntries(true).length).to.equal(4);
            expect(session.getSaveBlocker()).to.equal(undefined);

            session.redo();
            expect(session.fileSystem).to.be.instanceOf(Cpm);
            expect(session.fileSystem!.getDirEntries(true).length).to.equal(0);
            expect(session.getSaveBlocker()).to.contain("this empty disk wouldn't be recognized as mm-system");

            // Revert goes back to the disk as opened.
            expect(session.revert()).to.equal(true);
            expect(session.fileSystem!.getDirEntries(true).length).to.equal(4);
        });

        it("saves an empty disk that is recognized as blank, and reads it back", async () => {
            makeImage();
            const session = open();
            session.changeCpm(0, writer => writer.getFiles().forEach(file => writer.deleteFile(file)));
            expect(session.hasChanges()).to.equal(true);
            expect(session.getSaveBlocker()).to.equal(undefined);

            saveAndReport(session, false);
            expect(session.hasChanges()).to.equal(false);
            expect(fileNames()).to.eql([]);
            expect(findCpmVerifiedLayout(openCpm())?.id).to.equal("mm-system");
        });

        it("refuses to save an empty disk that isn't recognized, leaves the image alone, and saves once a file is " +
            "added", async () => {
            makeImage(standardFiles(), STANDARD, {noBootSector: true});
            const before = fs.readFileSync(imagePathname);
            const session = open();
            session.changeCpm(0, writer => writer.getFiles().forEach(file => writer.deleteFile(file)));
            expect(session.hasChanges()).to.equal(true);

            expect(() => saveAndReport(session, false)).to.throw(/Can't save: when it's opened again, this empty disk/);
            expect(() => session.save(() => {})).to.throw(/Give --cpm-format mm-system, or add a file first/);
            expect(fs.readFileSync(imagePathname)).to.eql(before);
            expect(session.hasChanges()).to.equal(true);

            session.changeCpm(0, writer => writer.addFile({name: "NEW", extension: "TXT"}, pattern(10, 3)));
            expect(session.getSaveBlocker()).to.equal(undefined);
            saveAndReport(session, false);
            expect(session.hasChanges()).to.equal(false);
            expect(fileNames()).to.eql(["NEW.TXT"]);
        });
    });
});
