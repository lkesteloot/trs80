import fs from "fs";
import os from "os";
import path from "path";
import {
    BasicDialect, CassetteSpeed, decodeTrs80File, encodeSystemProgram, makeLdosTestHardDiskBinary, makeTrsdos23TestDisk, parseBasicText,
    SystemProgramBuilder,
} from "trs80-base";
import {binaryAsCasFile} from "trs80-cassette";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {disk} from "./disk.js";
import {openDiskSession, sessionInputFiles} from "./DiskFiles.js";
import type {DiskRunJson, ImportResultJson} from "./DiskJson.js";

/** A program that doesn't care which BASIC it's for. */
const HELLO_TEXT = "10 PRINT \"HELLO\"\n20 GOTO 10\n";

/**
 * A file to put on a source disk.
 */
interface SourceFile {
    /** The host name, whose extension decides how "add" converts it. */
    name: string;
    /** The contents. */
    contents: Uint8Array | string;
    /** Other options for "add", such as "--system". */
    args?: string[];
}

/**
 * A bunch of bytes that no conversion would leave alone, and that depends on the size and seed.
 */
function patternBytes(size: number, seed: number): Uint8Array {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        bytes[i] = (i*7 + (i >> 8)*13 + seed*31) & 0xFF;
    }
    return bytes;
}

describe("disk import", () => {
    let dir = "";
    let dstPathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-import-"));
        dstPathname = path.join(dir, "dst.dmk");
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        process.exitCode = undefined;
    });

    /**
     * Run the "disk" command on an image with these words after the image, and return what it printed.
     */
    async function runDiskOn(image: string, ...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([image, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run the "disk" command on the destination image.
     */
    function runDisk(...words: string[]): Promise<string[]> {
        return runDiskOn(dstPathname, ...words);
    }

    /**
     * Make an image in the temporary directory with files on it, by creating it and adding the host files, and
     * return its pathname.
     *
     * @param name the image's file name, such as "src.dmk".
     * @param dos the DOS to create, such as "ldos-5.3".
     * @param files the files to add, in order.
     * @param date the date to record on the files, or undefined for none.
     * @param createArgs more options for "create", such as "--cylinders", "80".
     */
    async function makeSource(name: string, dos: string, files: SourceFile[], date?: string,
                              createArgs: string[] = []): Promise<string> {
        const pathname = path.join(dir, name);
        const words = ["create", dos, ...createArgs];
        for (const file of files) {
            const hostPathname = path.join(dir, "host-" + file.name);
            fs.writeFileSync(hostPathname, file.contents);
            words.push(":", "add", hostPathname, "--as", file.name.replace(/\.(?=[^.]*$)/, "/"),
                ...(date === undefined ? [] : ["--date", date]), ...(file.args ?? []));
        }
        await runDiskOn(pathname, ...words);
        return pathname;
    }

    /**
     * The input files on an image, system files included.
     */
    function filesOf(pathname: string) {
        return sessionInputFiles(openDiskSession(pathname), true);
    }

    /**
     * The names of the files on an image, without its system files, in directory order.
     */
    function fileNames(pathname: string): string[] {
        return sessionInputFiles(openDiskSession(pathname), false).map(f => f.filename);
    }

    /**
     * The contents of the named file on an image.
     */
    function fileBytes(pathname: string, name: string): Uint8Array {
        const inFile = filesOf(pathname).find(f => f.filename === name);
        if (inFile === undefined) {
            throw new Error("No file " + name);
        }
        return inFile.binary;
    }

    /**
     * Make a blank TRSDOS 1.3 destination image.
     */
    async function makeDestination(dos = "trsdos-1.3"): Promise<void> {
        await runDisk("create", dos);
    }

    /**
     * Run "disk --json" on the destination with these words, and return the one JSON document.
     */
    async function runJson(...words: string[]): Promise<DiskRunJson> {
        const lines = await runDisk("--json", ...words);
        return JSON.parse(lines.join("\n")) as DiskRunJson;
    }

    it("copies the files with the same bytes and dates to a new TRSDOS 1.3 disk", async () => {
        const a = patternBytes(1234, 1);
        const b = patternBytes(5000, 2);
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "A.DAT", contents: a}, {name: "B.DAT", contents: b},
        ], "1985-03-04");

        const lines = await runDisk("create", "trsdos-1.3", ":", "import", src);
        expect(lines).to.include("Added A/DAT (1,234 bytes).");
        expect(lines).to.include("Added B/DAT (5,000 bytes).");
        // The name needs no explanation.
        expect(lines.some(line => line.includes("will be"))).to.equal(false);

        expect(fileNames(dstPathname).filter(name => name.endsWith(".DAT"))).to.eql(["A.DAT", "B.DAT"]);
        expect(fileBytes(dstPathname, "A.DAT")).to.eql(a);
        expect(fileBytes(dstPathname, "B.DAT")).to.eql(b);
        // TRSDOS 1.3 keeps the month and year.
        const date = filesOf(dstPathname).find(f => f.filename === "A.DAT")!.getDate()!;
        expect(date.getFullYear()).to.equal(1985);
        expect(date.getMonth()).to.equal(2);
    });

    it("works from a JV1 image", async () => {
        const src = path.join(dir, "src.jv1");
        fs.writeFileSync(src, makeTrsdos23TestDisk([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000},
        ]).binary);
        await makeDestination();

        await runDisk("import", src);
        expect(fileBytes(dstPathname, "HELLO.BAS")).to.eql(fileBytes(src, "HELLO.BAS"));
        expect(fileBytes(dstPathname, "HELLO.BAS").length).to.equal(1000);
    });

    it("selects files with patterns, and a pattern that matches nothing is an error that changes nothing", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "ONE.TXT", contents: "1"}, {name: "TWO.TXT", contents: "2"}, {name: "THREE.DAT", contents: "3"},
        ]);
        await makeDestination();
        const before = fs.readFileSync(dstPathname);

        await expect(runDisk("import", src, "*.DAT", "NOPE*")).rejects.toThrow(/No file in .* matches "NOPE\*"/);
        expect(fs.readFileSync(dstPathname)).to.eql(before);

        await runDisk("import", src, "T*/TXT", "THREE.DAT");
        expect(fileNames(dstPathname).filter(name => !name.startsWith("BOOT"))).to.eql(["TWO.TXT", "THREE.DAT"]);
    });

    it("skips system files with no patterns and with a wildcard, but copies one that's named", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "USER.DAT", contents: "u"}, {name: "KERNEL.SYS", contents: "k", args: ["--system"]},
        ]);
        await makeDestination();

        const lines = await runDisk("import", src);
        expect(lines.join("\n")).to.not.include("KERNEL");
        expect(filesOf(dstPathname).some(f => f.filename === "KERNEL.SYS")).to.equal(false);

        await expect(runDisk("import", src, "KERN*")).rejects.toThrow(/wildcards don't match system files/);
        await runDisk("import", src, "*", "--overwrite");
        expect(filesOf(dstPathname).some(f => f.filename === "KERNEL.SYS")).to.equal(false);

        await runDisk("import", src, "KERNEL.SYS", "--overwrite");
        const kernel = filesOf(dstPathname).find(f => f.filename === "KERNEL.SYS")!;
        expect(kernel.isSystemFile()).to.equal(true);
    });

    it("sets the system and invisible flags with --system and --invisible, and keeps invisible files invisible", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "PLAIN.DAT", contents: "p"}, {name: "HIDDEN.DAT", contents: "h", args: ["--invisible"]},
        ]);
        await makeDestination();

        await runDisk("import", src, "*.DAT");
        const plain = filesOf(dstPathname).find(f => f.filename === "PLAIN.DAT")!;
        const hidden = filesOf(dstPathname).find(f => f.filename === "HIDDEN.DAT")!;
        expect(plain.isSystemFile()).to.equal(false);
        expect((<any>plain).dirEntry.isHidden()).to.equal(false);
        expect((<any>hidden).dirEntry.isHidden()).to.equal(true);

        await runDisk("import", src, "PLAIN.DAT", "--system", "--invisible", "--overwrite");
        const changed = filesOf(dstPathname).find(f => f.filename === "PLAIN.DAT")!;
        expect(changed.isSystemFile()).to.equal(true);
        expect((<any>changed).dirEntry.isHidden()).to.equal(true);
    });

    it("refuses a name that's already on the disk without --overwrite, and replaces it with it", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "A.DAT", contents: patternBytes(300, 1)}, {name: "B.DAT", contents: patternBytes(300, 2)},
        ]);
        await makeDestination();
        const old = path.join(dir, "old.dat");
        fs.writeFileSync(old, "old");
        await runDisk("add", old, "--as", "B/DAT");
        const before = fs.readFileSync(dstPathname);

        await expect(runDisk("import", src)).rejects.toThrow("B/DAT is already on the disk (use --overwrite to replace it)");
        expect(fs.readFileSync(dstPathname)).to.eql(before);

        const lines = await runDisk("import", src, "--overwrite");
        expect(lines).to.include("Added A/DAT (300 bytes).");
        expect(lines).to.include("Replaced B/DAT (300 bytes).");
        expect(fileBytes(dstPathname, "B.DAT")).to.eql(patternBytes(300, 2));
    });

    describe("with too little room", () => {
        let src = "";

        beforeEach(async () => {
            // Three files that fit on the source, but only two of which fit on a small TRSDOS 1.3 disk.
            src = await makeSource("big.dmk", "ldos-5.3", [
                {name: "A.DAT", contents: patternBytes(60000, 1)},
                {name: "B.DAT", contents: patternBytes(60000, 2)},
                {name: "C.DAT", contents: patternBytes(60000, 3)},
            ], undefined, ["--cylinders", "80"]);
            await runDisk("create", "trsdos-1.3", "--cylinders", "35");
        });

        it("copies nothing without --keep-going", async () => {
            const before = fs.readFileSync(dstPathname);

            await expect(runDisk("import", src)).rejects.toThrow(/not enough room.*; use --keep-going to copy the others$/);
            expect(fs.readFileSync(dstPathname)).to.eql(before);
        });

        it("copies the files that fit with --keep-going, and reports the others as skipped", async () => {
            const lines = await runDisk("import", src, "--keep-going");
            expect(lines).to.include("Added A/DAT (60,000 bytes).");
            expect(lines).to.include("Added B/DAT (60,000 bytes).");
            expect(lines.some(line => line.startsWith("Can't add C/DAT: ") && line.endsWith("; skipped it."))).to.equal(true);
            expect(fileNames(dstPathname).filter(name => name.endsWith(".DAT"))).to.eql(["A.DAT", "B.DAT"]);
            expect(fileBytes(dstPathname, "B.DAT")).to.eql(patternBytes(60000, 2));
            // The disk is still sound.
            const checkLines = await runDisk("check");
            expect(checkLines[checkLines.length - 1]).to.equal("Safe to write.");
        });

        it("gives the skipped files in the JSON, and the command still succeeds", async () => {
            const run = await runJson("import", src, "--keep-going");
            expect(run.error).to.equal(undefined);
            const result = run.commands[0].result as ImportResultJson;
            expect(result.source).to.equal(src);
            expect(result.files.map(f => f.from)).to.eql(["A.DAT", "B.DAT"]);
            expect(result.skipped.length).to.equal(1);
            expect(result.skipped[0].from).to.equal("C.DAT");
            expect(result.skipped[0].problem).to.be.a("string");
            expect(run.saved).to.be.a("string");
        });

        it("is taken back whole by one undo", async () => {
            const before = fs.readFileSync(dstPathname);

            const lines = await runDisk("import", src, "--keep-going", ":", "undo");
            expect(lines.some(line => line.startsWith("Undid \"import "))).to.equal(true);
            expect(fs.readFileSync(dstPathname)).to.eql(before);
        });
    });

    it("skips a file whose name is on the disk with --keep-going, and copies the rest", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "A.DAT", contents: "a"}, {name: "B.DAT", contents: "b"}, {name: "C.DAT", contents: "c"},
        ]);
        await makeDestination();
        const old = path.join(dir, "old.dat");
        fs.writeFileSync(old, "old");
        await runDisk("add", old, "--as", "B/DAT");

        const lines = await runDisk("import", src, "--keep-going");
        expect(lines).to.include("B/DAT is already on the disk (use --overwrite to replace it); skipped it.");
        expect(lines).to.include("Added A/DAT (1 byte).");
        expect(fileBytes(dstPathname, "B.DAT")).to.eql(new TextEncoder().encode("old"));
        expect(fileBytes(dstPathname, "C.DAT")).to.eql(new TextEncoder().encode("c"));
    });

    describe("converting BASIC", () => {
        it("converts a program between Model III and Model 4 BASIC, but not with --binary or a non-BASIC file", async () => {
            const src = await makeSource("src.dmk", "ldos-5.3", [
                {name: "HELLO.BAS", contents: HELLO_TEXT}, {name: "DATA.DAT", contents: HELLO_TEXT},
            ]);
            const helloBinary = fileBytes(src, "HELLO.BAS");
            const dataBinary = fileBytes(src, "DATA.DAT");
            await makeDestination("lsdos-6.3");

            const lines = await runDisk("import", src, "*.BAS", "*.DAT");
            expect(lines).to.include("Converted HELLO.BAS from Model III to Model 4 BASIC tokens.");
            expect(lines.filter(line => line.startsWith("Converted"))).to.eql(
                ["Converted HELLO.BAS from Model III to Model 4 BASIC tokens."]);
            const program = decodeTrs80File(fileBytes(dstPathname, "HELLO.BAS"), {basicDialect: BasicDialect.MODEL_4});
            expect(program.className).to.equal("BasicProgram");
            if (program.className === "BasicProgram") {
                expect(program.asAscii()).to.equal(HELLO_TEXT);
            }
            expect(fileBytes(dstPathname, "DATA.DAT")).to.eql(dataBinary);

            await runDisk("kill", "HELLO.BAS");
            const binaryLines = await runDisk("import", src, "*.BAS", "--binary");
            expect(binaryLines.some(line => line.startsWith("Converted"))).to.equal(false);
            expect(fileBytes(dstPathname, "HELLO.BAS")).to.eql(helloBinary);
        });

        it("doesn't convert when both disks run the same BASIC", async () => {
            const src = await makeSource("src.dmk", "ldos-5.3", [{name: "HELLO.BAS", contents: HELLO_TEXT}]);
            await makeDestination("trsdos-1.3");

            const lines = await runDisk("import", src);
            expect(lines.some(line => line.startsWith("Converted"))).to.equal(false);
            expect(fileBytes(dstPathname, "HELLO.BAS")).to.eql(fileBytes(src, "HELLO.BAS"));
        });
    });

    it("converts the BASIC program in a CAS file to tokenized disk BASIC", async () => {
        const tokenized = parseBasicText(HELLO_TEXT, BasicDialect.MODEL_III) as Uint8Array;
        // The cassette form: three 0xD3 bytes and a one-letter name, then the program.
        const tape = new Uint8Array([0xD3, 0xD3, 0xD3, 0x41, ...tokenized.slice(1)]);
        const cas = path.join(dir, "prog.cas");
        fs.writeFileSync(cas, binaryAsCasFile(tape, CassetteSpeed.LOW));
        await makeDestination();

        const lines = await runDisk("import", cas);
        expect(lines.some(line => line.startsWith("Converted T1.BAS from cassette to disk format"))).to.equal(true);
        expect(lines.some(line => line.startsWith("Added T1/BAS"))).to.equal(true);
        expect(fileBytes(dstPathname, "T1.BAS")).to.eql(tokenized);
    });

    it("converts a system program in a CAS file to a CMD program, and --binary doesn't", async () => {
        const builder = new SystemProgramBuilder();
        builder.addBytes(0x5000, [0x3E, 0x2A, 0xC9]);
        const cas = path.join(dir, "game.cas");
        fs.writeFileSync(cas, binaryAsCasFile(encodeSystemProgram("GAME", builder.getChunks(), 0x5000), CassetteSpeed.LOW));
        await makeDestination();

        const lines = await runDisk("import", cas);
        expect(lines).to.include("Converted T1.3BN to a CMD program.");
        expect(fileNames(dstPathname).some(name => name === "T1.CMD")).to.equal(true);
    });

    it("says that a file that isn't a container isn't one, and points to add", async () => {
        await makeDestination();
        const notes = path.join(dir, "notes.txt");
        fs.writeFileSync(notes, "just some notes\n");
        const before = fs.readFileSync(dstPathname);

        await expect(runDisk("import", notes)).rejects.toThrow(
            /Can't import from ".*notes\.txt": it's not a floppy image, hard disk image, CAS file, or WAV file \(to copy a host file onto the disk, use "add"\)/);
        expect(fs.readFileSync(dstPathname)).to.eql(before);
    });

    it("renames the one selected file with --as, and refuses it with two", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "A.DAT", contents: "a"}, {name: "B.DAT", contents: "b"},
        ]);
        await makeDestination();

        await expect(runDisk("import", src, "*.DAT", "--as", "NEW/DAT")).rejects.toThrow(/--as names one file/);
        expect(fileNames(dstPathname).some(name => name.endsWith(".DAT"))).to.equal(false);

        await runDisk("import", src, "A.DAT", "--as", "NEW/DAT");
        expect(fileNames(dstPathname).filter(name => name.endsWith(".DAT"))).to.eql(["NEW.DAT"]);
    });

    it("is taken back by undo, even with --keep-going and several files", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [
            {name: "A.DAT", contents: "a"}, {name: "B.DAT", contents: "b"}, {name: "C.DAT", contents: "c"},
        ]);
        await makeDestination();
        const before = fs.readFileSync(dstPathname);

        const lines = await runDisk("import", src, "--keep-going", ":", "undo");
        expect(lines.some(line => line.startsWith("Undid \"import "))).to.equal(true);
        expect(fs.readFileSync(dstPathname)).to.eql(before);
    });

    it("gives the result in JSON, with the name in the image as \"from\"", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [{name: "HELLO.BAS", contents: HELLO_TEXT}]);
        await makeDestination("lsdos-6.3");

        const run = await runJson("import", src);
        const command = run.commands[0];
        expect(command.name).to.equal("import");
        const result = command.result as ImportResultJson;
        expect(result.source).to.equal(src);
        expect(result.skipped).to.eql([]);
        expect(result.files.length).to.equal(1);
        expect(result.files[0].from).to.equal("HELLO.BAS");
        expect(result.files[0].name).to.equal("HELLO.BAS");
        expect(result.files[0].replaced).to.equal(false);
        expect(result.files[0].size).to.be.greaterThan(0);
        expect(result.files[0].conversions).to.eql(["Converted HELLO.BAS from Model III to Model 4 BASIC tokens."]);
    });

    it("says there's nothing to import, and changes nothing, if the image has only system files", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", []);
        await makeDestination();
        const before = fs.readFileSync(dstPathname);

        const lines = await runDisk("import", src);
        expect(lines[0]).to.equal("No files to import from \"" + src + "\".");
        expect(fs.readFileSync(dstPathname)).to.eql(before);
    });

    it("refuses two files from different hard disk partitions that would have the same name", async () => {
        const hardDisk = path.join(dir, "hard.hdv");
        fs.writeFileSync(hardDisk, makeLdosTestHardDiskBinary([
            {
                name: "ALPHA", cylinderOffset: 0, cylinderCount: 60, dirCylinder: 30,
                files: [{name: "SAME/TXT", contents: new TextEncoder().encode("first")}],
            },
            {
                name: "BETA", cylinderOffset: 60, cylinderCount: 60, dirCylinder: 30,
                files: [{name: "SAME/TXT", contents: new TextEncoder().encode("second")}],
            },
        ]));
        await makeDestination();
        const before = fs.readFileSync(dstPathname);

        await expect(runDisk("import", hardDisk)).rejects.toThrow(
            /"ALPHA\/SAME\.TXT" and "BETA\/SAME\.TXT" would both be SAME\/TXT on the disk/);
        expect(fs.readFileSync(dstPathname)).to.eql(before);

        // Naming one imports it under its plain name.
        await runDisk("import", hardDisk, "BETA/SAME.TXT");
        expect(new TextDecoder().decode(fileBytes(dstPathname, "SAME.TXT"))).to.equal("second");
    });

    it("leaves off the dates that the target DOS can't store, without a warning", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [{name: "A.DAT", contents: "a"}], "1985-03-04");
        await runDisk("create", "trsdos-6.2");

        const lines = await runDisk("import", src);
        expect(lines).to.include("Added A/DAT (1 byte).");
        expect(lines.some(line => /date/i.test(line))).to.equal(false);
        // TRSDOS 6 does store a date, so this one went in.
        expect(filesOf(dstPathname).find(f => f.filename === "A.DAT")!.getDate()!.getFullYear()).to.equal(1985);

        // A date that the DOS can't hold is left off too, rather than being an error.
        const late = await makeSource("late.dmk", "ldos-5.3", [{name: "B.DAT", contents: "b"}], "2005-03-04");
        const lateLines = await runDisk("import", late);
        expect(lateLines).to.include("Added B/DAT (1 byte).");
        expect(filesOf(dstPathname).find(f => f.filename === "B.DAT")!.getDate()).to.equal(undefined);
    });

    it("records the date from --date instead of the files' own", async () => {
        const src = await makeSource("src.dmk", "ldos-5.3", [{name: "A.DAT", contents: "a"}], "1985-03-04");
        await makeDestination();

        await runDisk("import", src, "--date", "1983-07-01");
        const date = filesOf(dstPathname).find(f => f.filename === "A.DAT")!.getDate()!;
        expect(date.getFullYear()).to.equal(1983);
        expect(date.getMonth()).to.equal(6);
    });
});
