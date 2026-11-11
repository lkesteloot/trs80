import fs from "fs";
import os from "os";
import path from "path";
import {Readable} from "stream";
import {
    makeLdosTestHardDiskBinary, makeTrsdos23TestDisk, type LdosTestPartition, type TestFile,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {setColorLevel} from "../colors.js";
import {disk} from "./disk.js";
import {JSON_NEEDS_COMMANDS_MESSAGE} from "./DiskShell.js";
import type {
    AddResultJson, AttribChangeResultJson, AttribShowResultJson, CheckResultJson, CreateResultJson,
    DirResultJson, DiskCommandJson, DiskRunJson, ExtractResultJson, FreeResultJson, InfoResultJson,
    KillResultJson, LabelResultJson, ListResultJson, MapResultJson, PartitionListResultJson,
    PartitionSelectResultJson, RenameResultJson, SaveResultJson, UndoResultJson,
} from "./DiskJson.js";

const HELLO_TEXT = "10 PRINT \"HELLO\"\n20 GOTO 10\n";

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 2, granuleOffset: 0, granuleCount: 3}], size: 3000};
const KERNEL: TestFile = {name: "KERNEL/SYS", extents: [{lump: 8, granuleOffset: 0, granuleCount: 2}], size: 2000, system: true};

/**
 * Two cylinder-split partitions with a file in each.
 */
const TWO_PARTITIONS: LdosTestPartition[] = [
    {
        name: "ALPHA", cylinderOffset: 0, cylinderCount: 60, dirCylinder: 30,
        files: [{name: "ONE/TXT", contents: new TextEncoder().encode("FIRST PARTITION")}],
    },
    {
        name: "Beta", cylinderOffset: 60, cylinderCount: 60, dirCylinder: 30,
        files: [{name: "TWO/TXT", contents: new TextEncoder().encode("SECOND PARTITION")}],
    },
];

describe("disk --json", () => {
    let dir = "";
    let imagePathname = "";
    let hostPathname = "";

    beforeEach(() => {
        setColorLevel("off");
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-json-"));
        imagePathname = path.join(dir, "test.dmk");
        hostPathname = path.join(dir, "hello.bas");
        fs.writeFileSync(hostPathname, HELLO_TEXT);
        process.exitCode = undefined;
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        process.exitCode = undefined;
    });

    /**
     * Run the "disk" command with these words after the image, with --json before the commands (and after
     * any other options in the words), and return what it printed to the console, line by line.
     */
    async function runDiskText(image: string, ...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([image, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run "disk --json" on the image with these words (options, then commands), and return the one JSON
     * document that it printed. Fails if it printed anything else.
     */
    async function runJson(...words: string[]): Promise<DiskRunJson> {
        return runJsonOn(imagePathname, ...words);
    }

    /**
     * Like {@link runJson} but on any image.
     */
    async function runJsonOn(image: string, ...words: string[]): Promise<DiskRunJson> {
        const lines = await runDiskText(image, "--json", ...words);
        expect(lines.length).to.equal(1);
        expect(lines[0]).not.to.contain("\u001b");
        return JSON.parse(lines[0]) as DiskRunJson;
    }

    /**
     * The command at an index of a run, which must exist, with its result typed as asked.
     */
    function commandAt<T>(run: DiskRunJson, index: number, name: string): DiskCommandJson & {result: T} {
        const command = run.commands[index];
        expect(command.name).to.equal(name);
        expect(command.error).to.equal(undefined);
        return command as DiskCommandJson & {result: T};
    }

    /**
     * Run a function with standard input replaced by these bytes, and not a terminal.
     */
    async function withStdin<T>(text: string, f: () => Promise<T>): Promise<T> {
        const original = Object.getOwnPropertyDescriptor(process, "stdin")!;
        Object.defineProperty(process, "stdin", {value: Readable.from([Buffer.from(text)]), configurable: true});
        try {
            return await f();
        } finally {
            Object.defineProperty(process, "stdin", original);
        }
    }

    /**
     * Write a TRSDOS 2.3 test disk to the image file, as a JV1 image.
     */
    function makeJv1Image(files: TestFile[]): string {
        const pathname = path.join(dir, "test.jv1");
        fs.writeFileSync(pathname, makeTrsdos23TestDisk(files, {cylinderCount: 18}).binary);
        return pathname;
    }

    it("describes a chain of commands in one parseable document", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, ":", "dir", ":", "free", ":",
            "info", ":", "check", ":", "label", ":", "kill", "hello.bas", ":", "label", "--name", "NEWNAME");

        expect(run.image).to.equal(imagePathname);
        expect(run.error).to.equal(undefined);
        expect(run.wouldHaveChanged).to.equal(undefined);
        expect(run.warnings).to.eql([]);
        expect(run.commands.map(c => c.name)).to.eql(
            ["create", "add", "dir", "free", "info", "check", "label", "kill", "label"]);
        expect(run.commands[1].command).to.equal("add " + hostPathname);
        for (const command of run.commands) {
            expect(command.error).to.equal(undefined);
            expect(command.messages.length).to.be.greaterThan(0);
        }

        const created = commandAt<CreateResultJson>(run, 0, "create").result;
        expect(created.description).to.contain("LDOS 5.3");
        expect(created.replaced).to.equal(false);
        expect(created.systemDisk).to.equal(undefined);

        const added = commandAt<AddResultJson>(run, 1, "add").result;
        expect(added.files.length).to.equal(1);
        expect(added.files[0].host).to.equal(hostPathname);
        expect(added.files[0].name).to.equal("HELLO/BAS");
        expect(added.files[0].replaced).to.equal(false);
        expect(added.files[0].size).to.be.greaterThan(0);
        expect(added.files[0].conversions.length).to.be.greaterThan(0);

        const listing = commandAt<DirResultJson>(run, 2, "dir").result;
        expect(listing.os).to.equal("LDOS 5.3");
        expect(listing.files.map(f => f.name)).to.eql(["HELLO.BAS"]);
        expect(listing.files[0].contentType).to.equal("basicProgram");

        const free = commandAt<FreeResultJson>(run, 3, "free").result;
        expect(free.granuleBytes).to.equal(1536);
        expect(free.freeBytes).to.equal(free.freeGranules*free.granuleBytes);

        const info = commandAt<InfoResultJson>(run, 4, "info").result;
        expect(info.description).to.contain("1 file");
        expect(info.os?.name).to.equal("LDOS 5.3");
        expect(info.os?.fileCount).to.equal(1);
        expect(info.os?.trsdos?.dirLump).to.equal(20);
        expect(info.geometry?.cylinderCount).to.equal(40);
        expect(info.hardDiskGeometry).to.equal(undefined);
        expect(info.rules).to.equal("ldos-5");
        expect(info.writable).to.equal(true);
        expect(info.readOnlyReason).to.equal(undefined);
        expect(info.writeProtected).to.equal(false);
        expect(info.free).to.eql(free);
        expect(info.partitions).to.equal(undefined);

        const check = commandAt<CheckResultJson>(run, 5, "check").result;
        expect(check.findings).to.eql([]);
        expect(check.writable).to.equal(true);

        const label = commandAt<LabelResultJson>(run, 6, "label").result;
        expect(label.name).to.equal("DATADISK");
        expect(label.masterPassword).to.equal("PASSWORD");
        expect(label.masterPasswordHash).to.be.a("number");
        expect(label.autoCommand).to.equal("");
        expect(label.date).to.be.a("string");

        expect(commandAt<KillResultJson>(run, 7, "kill").result).to.eql({removed: ["HELLO/BAS"]});
        expect(commandAt<LabelResultJson>(run, 8, "label").result.name).to.equal("NEWNAME");

        // It was saved, and the text report of the save went to the top level and not to a command.
        expect(run.saved).to.equal(imagePathname);
        expect(fs.existsSync(imagePathname)).to.equal(true);
        expect(process.exitCode).to.equal(undefined);
    });

    it("leaves out the fields that don't apply", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "free");
        expect(Object.keys(run).sort()).to.eql(["commands", "image", "saved", "warnings"]);
        expect(Object.keys(run.commands[0]).sort()).to.eql(["command", "messages", "name", "result", "warnings"]);
    });

    it("prints no color codes, even when colors are on", async () => {
        setColorLevel("16m");
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, ":", "dir", ":", "check", ":",
            "map");
        // runJsonOn already checked the text for escape codes; the map is a floppy, so it worked.
        expect(run.commands.map(c => c.error)).to.eql([undefined, undefined, undefined, undefined, undefined]);
    });

    it("says where the changes were saved, and nothing if there were none", async () => {
        await runJson("create", "ldos-5.3");
        const before = fs.readFileSync(imagePathname);

        const unchanged = await runJson("dir");
        expect(unchanged.saved).to.equal(null);
        expect(fs.readFileSync(imagePathname)).to.eql(before);

        const output = path.join(dir, "out.dmk");
        const changed = await runJson("-o", output, "label", "--name", "OTHER");
        expect(changed.saved).to.equal(output);
        expect(fs.existsSync(output)).to.equal(true);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
    });

    it("records the save of the \"save\" and \"quit\" commands too", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "save", ":", "label", "--name", "AGAIN", ":", "quit",
            ":", "dir");
        expect(run.commands.map(c => c.name)).to.eql(["create", "save", "label", "quit"]);
        expect(commandAt<SaveResultJson>(run, 1, "save").result).to.eql({saved: imagePathname});
        expect(run.commands[3].result).to.equal(undefined);
        expect(run.commands[3].messages).to.eql(["Saved " + imagePathname + "."]);
        expect(run.saved).to.equal(imagePathname);
    });

    it("says that --dry-run would have changed the disk, and writes nothing", async () => {
        const run = await runJson("--dry-run", "create", "ldos-5.3");
        expect(run.saved).to.equal(null);
        expect(run.wouldHaveChanged).to.equal(true);
        expect(fs.existsSync(imagePathname)).to.equal(false);

        await runJson("create", "ldos-5.3");
        const unchanged = await runJson("--dry-run", "dir");
        expect(unchanged.wouldHaveChanged).to.equal(false);
        expect(unchanged.saved).to.equal(null);
    });

    it("records a failing command as the last one, with the exit code and no save", async () => {
        await runJson("create", "ldos-5.3");
        const before = fs.readFileSync(imagePathname);

        const run = await runJson("label", "--name", "CHANGED", ":", "free", ":", "kill", "NOSUCH.FIL", ":", "dir");
        expect(run.commands.map(c => c.name)).to.eql(["label", "free", "kill"]);
        const failed = run.commands[2];
        expect(failed.error).to.be.a("string");
        expect(failed.error).to.contain("NOSUCH");
        expect(failed.result).to.equal(undefined);
        expect(run.commands[0].error).to.equal(undefined);
        expect(run.error).to.equal(undefined);
        expect(run.saved).to.equal(null);
        expect(fs.readFileSync(imagePathname)).to.eql(before);
        expect(process.exitCode).to.equal(1);
    });

    it("puts a failure to open the image at the top, with no commands", async () => {
        const run = await runJsonOn(dir, "dir");
        expect(run.commands).to.eql([]);
        expect(run.error).to.contain("Can't open");
        expect(run.saved).to.equal(null);
        expect(process.exitCode).to.equal(1);
    });

    it("shows a file's contents in base64, with the listing", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, "--ascii", ":", "list",
            "hello.bas", ":", "list", "hello.bas", "--hex");
        const text = commandAt<ListResultJson>(run, 2, "list").result;
        expect(text.files.length).to.equal(1);
        expect(text.files[0].name).to.equal("HELLO.BAS");
        expect(text.files[0].kind).to.equal("text");
        expect(Buffer.from(text.files[0].contents, "base64").toString("latin1").replace(/\r/g, "\n"))
            .to.equal(HELLO_TEXT);
        expect(text.listing).to.eql(["10 PRINT \"HELLO\"", "20 GOTO 10"]);
        expect(run.commands[2].messages).to.eql(text.listing);

        const hex = commandAt<ListResultJson>(run, 3, "list").result;
        expect(hex.files[0].kind).to.equal("hex");
        expect(hex.files[0].contents).to.equal(text.files[0].contents);
    });

    it("lists a tokenized BASIC program as a listing", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, ":", "list", "hello.bas");
        const result = commandAt<ListResultJson>(run, 2, "list").result;
        expect(result.files[0].kind).to.equal("basic");
        expect(result.listing[0]).to.contain("PRINT");
        // The first byte of a tokenized program on a disk.
        expect(Buffer.from(result.files[0].contents, "base64")[0]).to.equal(0xFF);
    });

    it("refuses list --raw", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, ":", "list", "hello.bas", "--raw",
            ":", "dir");
        expect(run.commands.map(c => c.name)).to.eql(["create", "add", "list"]);
        expect(run.commands[2].error).to.equal("--raw writes bytes; --json already has them in base64");
        expect(process.exitCode).to.equal(1);
    });

    it("refuses boot", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "boot");
        expect(run.commands[1].name).to.equal("boot");
        expect(run.commands[1].error).to.equal("boot needs a terminal, so it can't be used with --json");
        expect(run.saved).to.equal(null);
        expect(process.exitCode).to.equal(1);
    });

    it("gives the map's cells with their kinds", async () => {
        const jv1 = makeJv1Image([HELLO, KERNEL]);
        const run = await runJsonOn(jv1, "map", "HELLO*");
        const map = commandAt<MapResultJson>(run, 0, "map").result;

        expect(map.cells.length).to.equal(map.totals.granuleCount);
        const kinds = new Set(map.cells.map(cell => cell.kind));
        expect([...kinds].sort()).to.eql(["boot", "directory", "file", "free", "other-file"]);
        expect(map.kindCounts["free"]).to.equal(map.totals.freeGranuleCount);
        expect(map.kindCounts["file"]).to.equal(3);
        expect(map.files.map(f => f.name)).to.include("HELLO/BAS");

        const helloIndex = map.files.findIndex(f => f.name === "HELLO/BAS");
        expect(helloIndex).to.be.greaterThan(-1);
        expect(map.files[helloIndex].granuleCount).to.equal(3);
        const helloCells = map.cells.filter(cell => cell.kind === "file");
        expect(helloCells.every(cell => cell.file === helloIndex)).to.equal(true);
        expect(helloCells.map(cell => cell.lump)).to.eql([2, 2, 3]);
        expect(map.cells.find(cell => cell.kind === "free")?.file).to.equal(undefined);
        expect(map.cells[0].sectors[0]).to.have.keys("cylinder", "side", "sector");
        expect(map.layout.sectorsPerTrack).to.be.greaterThan(0);
        expect(map.totals.granuleByteCount).to.equal(1280);
    });

    it("lists, selects, and describes the partitions of a hard disk", async () => {
        const hdv = path.join(dir, "test.hdv");
        fs.writeFileSync(hdv, makeLdosTestHardDiskBinary(TWO_PARTITIONS));

        const run = await runJsonOn(hdv, "partition", ":", "partition", "beta", ":", "dir", ":", "info");
        const listed = commandAt<PartitionListResultJson>(run, 0, "partition").result;
        expect(listed.partitions.length).to.equal(2);
        expect(listed.partitions.map(p => p.number)).to.eql([1, 2]);
        expect(listed.partitions.map(p => p.diskName)).to.eql(["ALPHA", "Beta"]);
        expect(listed.partitions[0].location).to.eql({cylinderOffset: 0, headOffset: 0, cylinderCount: 60, headCount: 2});
        expect(listed.partitions[1].location.cylinderOffset).to.equal(60);
        expect(listed.partitions.every(p => p.fileCount === 1 && p.writable && !p.selected)).to.equal(true);
        expect(listed.partitions[0].fileSystem).to.contain("DOS");

        expect(commandAt<PartitionSelectResultJson>(run, 1, "partition").result).to.eql({selected: 2});
        const dirResult = commandAt<DirResultJson>(run, 2, "dir").result;
        expect(dirResult.files.length).to.equal(1);
        expect(dirResult.files[0].name).to.contain("TWO");

        const info = commandAt<InfoResultJson>(run, 3, "info").result;
        expect(info.partitions?.map(p => p.selected)).to.eql([false, true]);
        expect(info.os?.name).to.contain("DOS");
        expect(info.os?.trsdos?.diskName).to.equal("Beta");
        expect(info.hardDiskGeometry?.cylinderCount).to.be.greaterThan(0);
        expect(info.geometry).to.equal(undefined);
        expect(info.free?.freeGranules).to.be.greaterThan(0);
    });

    it("describes a hard disk with no partition chosen without failing", async () => {
        const hdv = path.join(dir, "test.hdv");
        fs.writeFileSync(hdv, makeLdosTestHardDiskBinary(TWO_PARTITIONS));
        const run = await runJsonOn(hdv, "info");
        const info = commandAt<InfoResultJson>(run, 0, "info").result;
        expect(info.os).to.equal(null);
        expect(info.rules).to.equal(undefined);
        expect(info.free).to.equal(undefined);
        expect(info.partitions?.length).to.equal(2);
    });

    it("gives the attributes shown and the ones changed", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, ":", "attrib", "hello.bas", ":",
            "attrib", "hello.bas", "--invisible", "--protect", "read", "--password", "SECRET", "--date", "2005-03-04",
            ":", "attrib", "hello.bas", "--no-date", ":", "attrib", "hello.bas", "--password", "", ":",
            "attrib", "hello.bas");

        const first = commandAt<AttribShowResultJson>(run, 2, "attrib").result;
        expect(first.files.length).to.equal(1);
        expect(first.files[0].name).to.equal("HELLO/BAS");
        expect(first.files[0].protection.level).to.equal(0);
        expect(first.files[0].invisible).to.equal(false);
        expect(first.files[0].updatePassword).to.equal(false);
        expect(first.files[0].system).to.equal(false);

        const changed = commandAt<AttribChangeResultJson>(run, 3, "attrib").result;
        expect(changed.files).to.eql(["HELLO/BAS"]);
        expect(changed.changes).to.eql({
            invisible: true,
            protection: {level: 5, name: "READ"},
            updatePassword: "set",
            date: "2005-03-04",
        });

        expect(commandAt<AttribChangeResultJson>(run, 4, "attrib").result.changes).to.eql({date: null});
        expect(commandAt<AttribChangeResultJson>(run, 5, "attrib").result.changes).to.eql({updatePassword: "removed"});

        const last = commandAt<AttribShowResultJson>(run, 6, "attrib").result.files[0];
        expect(last.invisible).to.equal(true);
        expect(last.protection).to.eql({level: 5, name: "READ"});
        expect(last.updatePassword).to.equal(false);
        expect(last.date).to.equal(null);
    });

    it("gives the files that extract wrote, and rename's names, and undo", async () => {
        const outDir = path.join(dir, "out");
        const run = await runJson("create", "ldos-5.3", ":", "add", hostPathname, "--binary", ":", "rename",
            "hello.bas", "hi.bas", ":", "extract", "*", "--out-dir", outDir, ":", "undo", ":", "redo", ":", "undo",
            ":", "undo", ":", "undo", ":", "undo", ":", "revert");

        expect(commandAt<RenameResultJson>(run, 2, "rename").result).to.eql({from: "HELLO/BAS", to: "HI/BAS"});
        expect(commandAt<ExtractResultJson>(run, 3, "extract").result.files).to.eql([
            {name: "HI.BAS", path: path.join(outDir, "HI.BAS")},
        ]);
        expect(fs.readFileSync(path.join(outDir, "HI.BAS"), "latin1")).to.equal(HELLO_TEXT);

        // Extracting changes nothing on the disk, so the first undo takes back the rename.
        expect(commandAt<UndoResultJson>(run, 4, "undo").result).to.eql({command: "rename hello.bas hi.bas"});
        expect(commandAt<UndoResultJson>(run, 5, "redo").result).to.eql({command: "rename hello.bas hi.bas"});
        expect(commandAt<UndoResultJson>(run, 6, "undo").result.command).to.equal("rename hello.bas hi.bas");
        expect(commandAt<UndoResultJson>(run, 7, "undo").result.command).to.equal("add " + hostPathname + " --binary");
        expect(commandAt<UndoResultJson>(run, 8, "undo").result.command).to.equal("create ldos-5.3");
        expect(commandAt<UndoResultJson>(run, 9, "undo").result.command).to.equal(null);
        expect(run.commands[10].name).to.equal("revert");
        expect(run.commands[10].result).to.have.keys("reverted");
    });

    it("gives protect, format, and system disk results", async () => {
        const run = await runJson("create", "ldos-5.3", ":", "protect", ":", "protect", "on", ":", "protect", "on",
            ":", "format", "ldos-5.3", "--force", ":", "trim");
        expect(run.commands[1].result).to.eql({writeProtected: false});
        expect(run.commands[2].result).to.eql({writeProtected: true, changed: true});
        expect(run.commands[3].result).to.eql({writeProtected: true, changed: false});
        const formatted = commandAt<CreateResultJson>(run, 4, "format").result;
        expect(formatted.replaced).to.equal(true);
        expect(formatted.description).to.contain("LDOS 5.3");
        expect(run.commands[5].name).to.equal("trim");
        const trimResult = run.commands[5].result as {trimmed: boolean};
        expect(trimResult.trimmed).to.be.a("boolean");

        const system = await runJson("create", "trsdos-6.2", "--system", "--minimal", "--force");
        const created = commandAt<CreateResultJson>(system, 0, "create").result;
        expect(created.systemDisk?.description).to.contain("TRSDOS");
        expect(created.systemDisk?.removed).to.be.an("array");

    });

    it("gives the results of adding and deleting a partition", async () => {
        const hdv = path.join(dir, "blank.hdv");
        const run = await runJsonOn(hdv, "create", "--cylinders", "100", "--heads", "2", ":", "partition", "--add",
            "ldos-5.3", "--cylinders", "40", ":", "partition", "--delete", "1");
        expect(run.error).to.equal(undefined);
        const added = run.commands[1].result as {added: {number: number, diskName: string, location: {cylinderCount: number}}};
        expect(added.added.number).to.equal(1);
        expect(added.added.diskName).to.equal("HARDA");
        expect(added.added.location.cylinderCount).to.equal(40);
        expect(run.commands[2].result).to.eql({deleted: {number: 1, label: "partition 1 (HARDA)"}, renumbered: false});
        expect(run.saved).to.equal(hdv);
    });

    it("says what a failed repair or check found on a damaged disk", async () => {
        // A file whose granules the GAT doesn't mark used.
        const jv1 = makeJv1Image([HELLO]);
        const run = await runJsonOn(jv1, "check", ":", "repair");
        expect(run.commands.map(c => c.error)).to.eql([undefined, undefined]);
        const check = commandAt<CheckResultJson>(run, 0, "check").result;
        expect(check.writable).to.be.a("boolean");
        for (const finding of check.findings) {
            expect(["layout", "damage", "note"]).to.include(finding.severity);
            expect(finding.kind).to.match(/^[a-z-]+$/);
        }
        expect(run.commands[1].result).to.have.keys(
            "changes", "remaining", "freeableUnclaimedGranules", "fixablePrograms", "writable");
    });

    it("describes a script on standard input the same way", async () => {
        const script = "create ldos-5.3\nadd " + hostPathname + "\n\n# A comment.\ndir : free\nfree\n";
        const run = await withStdin(script, () => runJson());
        expect(run.commands.map(c => c.name)).to.eql(["create", "add", "dir", "free", "free"]);
        expect(run.saved).to.equal(imagePathname);
        expect(run.error).to.equal(undefined);
        expect(fs.existsSync(imagePathname)).to.equal(true);
    });

    it("stops a script at a failing line, and at a quit", async () => {
        const failing = await withStdin("create ldos-5.3\nkill NOPE.BAS\nfree\n", () => runJson());
        expect(failing.commands.map(c => c.name)).to.eql(["create", "kill"]);
        expect(failing.commands[1].error).to.contain("NOPE");
        expect(failing.error).to.equal(undefined);
        expect(failing.saved).to.equal(null);
        expect(process.exitCode).to.equal(1);
        expect(fs.existsSync(imagePathname)).to.equal(false);

        process.exitCode = undefined;
        const quit = await withStdin("create ldos-5.3\nquit\nfree\n", () => runJson());
        expect(quit.commands.map(c => c.name)).to.eql(["create", "quit"]);
        expect(quit.saved).to.equal(imagePathname);
    });

    it("puts a syntax error in a script line at the top, with its line number", async () => {
        const run = await withStdin("create ldos-5.3\nfrobnicate\nfree\n", () => runJson());
        expect(run.commands.map(c => c.name)).to.eql(["create"]);
        expect(run.error).to.match(/^Line 2: /);
        expect(run.saved).to.equal(null);
        expect(process.exitCode).to.equal(1);
    });

    it("refuses --json with no commands on a terminal, as text", async () => {
        const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
        Object.defineProperty(process.stdin, "isTTY", {value: true, configurable: true});
        try {
            await expect(disk([imagePathname, "--json"])).rejects.toThrow(JSON_NEEDS_COMMANDS_MESSAGE);
        } finally {
            if (original === undefined) {
                delete (process.stdin as {isTTY?: boolean}).isTTY;
            } else {
                Object.defineProperty(process.stdin, "isTTY", original);
            }
        }
    });

    it("leaves syntax errors on the command line as thrown errors, before anything runs", async () => {
        await expect(disk([imagePathname, "--json", "frobnicate"])).rejects.toThrow();
        expect(fs.existsSync(imagePathname)).to.equal(false);
    });

    it("captures help as lines", async () => {
        const run = await runJson("help", "dir");
        expect(run.commands[0].messages.length).to.be.greaterThan(1);
        expect(run.commands[0].result).to.equal(undefined);
    });

    it("has the same text output without --json as before", async () => {
        const lines = await runDiskText(imagePathname, "create", "ldos-5.3", ":", "add", hostPathname, ":", "free",
            ":", "label", "--name", "TEXT");
        expect(lines[0]).to.contain("Created " + imagePathname);
        expect(lines[1]).to.equal("Tokenized hello.bas.");
        expect(lines[2]).to.match(/^Added HELLO\/BAS \(\d+ bytes\)\.$/);
        expect(lines[3]).to.contain("KB free");
        expect(lines[4]).to.equal("Name is now TEXT.");
        expect(lines[5]).to.equal("Saved " + imagePathname + ".");
        expect(lines.length).to.equal(6);
    });
});
