import {BasicDialect, TrsdosProtectionLevel} from "trs80-base";
import {createHardDisk, DiskSession} from "trs80-disk";
import {describe, expect, it} from "vitest";
import {
    addPlanned, attrib, choosePartition, format, formatDryRun, goToHistoryPosition, kill, label, planAddFiles, protect, redo, rename, repair,
    repairDryRun, revert, trim, trimDryRun, undo,
} from "./Actions.js";
import {getFileRows} from "./FileRows.js";
import {planExtraction} from "./Extracting.js";
import {TEMPLATES} from "./Templates.js";
import {makeBlankDisk, makeDiskWithFiles, textFile} from "./TestHelpers.js";
import {TrsdosFormatDos} from "trs80-base";

/**
 * The names of the files on the disk, as it shows them.
 */
function names(session: DiskSession): string[] {
    return getFileRows(session, false).map(row => row.fullName);
}

/** The add options with nothing special. */
const PLAIN_ADD = {ascii: false, binary: false, text: false, system: false, invisible: false, overwrite: false};

describe("Actions", () => {
    it("kills files, and undoes and redoes it", async () => {
        const disk = await makeDiskWithFiles();
        const session = disk.session;
        const {commandLine, result} = await kill(session, ["HELLO/BAS"]);
        expect(commandLine).to.equal("kill HELLO/BAS");
        expect(result).to.eql(["HELLO/BAS"]);
        expect(names(session)).to.eql(["PROG/CMD"]);

        expect(undo(session).commandLine).to.equal("undo");
        expect(names(session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
        expect(redo(session).result.labels).to.eql(["kill HELLO/BAS"]);
        expect(names(session)).to.eql(["PROG/CMD"]);
    });

    it("renames a file", async () => {
        const disk = await makeDiskWithFiles();
        const {commandLine} = await rename(disk.session, "HELLO/BAS", "BYE/BAS");
        expect(commandLine).to.equal("rename HELLO/BAS BYE/BAS");
        expect(names(disk.session)).to.eql(["BYE/BAS", "PROG/CMD"]);
        undo(disk.session);
        expect(names(disk.session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
    });

    it("changes attributes", async () => {
        const disk = await makeDiskWithFiles();
        const {commandLine, result} = await attrib(disk.session, ["PROG/CMD"], {invisible: true, protect: "EXEC"});
        expect(commandLine).to.equal("attrib PROG/CMD --invisible --protect EXEC");
        expect(result.files).to.eql(["PROG/CMD"]);
        const prog = getFileRows(disk.session, false).find(row => row.fullName === "PROG/CMD");
        expect(prog?.attributes?.invisible).to.equal(true);
        expect(prog?.attributes?.protectionLevel).to.equal(TrsdosProtectionLevel.EXEC);

        undo(disk.session);
        const after = getFileRows(disk.session, false).find(row => row.fullName === "PROG/CMD");
        expect(after?.attributes?.invisible).to.equal(false);
    });

    it("changes the label", async () => {
        const disk = await makeDiskWithFiles();
        const {commandLine, result} = await label(disk.session, {name: "NEWNAME"});
        expect(commandLine).to.equal("label --name NEWNAME");
        expect(result.name).to.equal("NEWNAME");
        undo(disk.session);
    });

    it("sets and clears write protection", async () => {
        const disk = await makeDiskWithFiles();
        const on = await protect(disk.session, true);
        expect(on.commandLine).to.equal("protect on");
        expect(on.result).to.equal(true);
        const before = disk.session.getHistory().entries.length;
        expect(before).to.be.greaterThan(0);
        undo(disk.session);
        expect(disk.session.getHistory().entries.length).to.equal(before);
        const off = await protect(disk.session, false);
        expect(off.commandLine).to.equal("protect off");
        expect(off.result).to.equal(false);
    });

    it("repairs, with a dry run that changes nothing", async () => {
        const disk = await makeDiskWithFiles();
        const options = {freeUnclaimed: true, fixProgramSizes: false, markMissingUsed: false};
        const positionBefore = disk.session.getHistory().position;
        const dry = repairDryRun(disk.session, options);
        expect(dry.commandLine).to.equal("repair --free-unclaimed");
        expect(dry.result.repaired).to.be.an("object");
        expect(disk.session.getHistory().position).to.equal(positionBefore);

        const real = await repair(disk.session, options);
        expect(real.commandLine).to.equal("repair --free-unclaimed");
        expect(real.result.damagedBefore).to.equal(false);
    });

    it("trims, with a dry run that changes nothing", async () => {
        const disk = await makeDiskWithFiles();
        const request = {cylinders: undefined, dropSide: false, force: false};
        const binaryBefore = new Uint8Array(disk.session.image.binary);
        const dry = trimDryRun(disk.session, request);
        expect(dry.commandLine).to.equal("trim");
        expect(dry.result).to.be.an("object");
        expect(new Uint8Array(disk.session.image.binary)).to.eql(binaryBefore);

        const real = await trim(disk.session, request);
        expect(real.commandLine).to.equal("trim");
        expect(real.result).to.be.an("object");
        expect(names(disk.session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
    });

    it("formats, and takes it back", async () => {
        const disk = await makeDiskWithFiles();
        const request = {
            format: {dos: TrsdosFormatDos.LDOS_5_3, cylinders: undefined, sides: undefined, density: undefined,
                model: undefined, name: "EMPTY", date: new Date(1990, 0, 2)},
            force: true,
        };
        const {commandLine} = await format(disk.session, request);
        expect(commandLine).to.equal("format ldos-5.3 --name EMPTY --date 1990-01-02 --force");
        expect(names(disk.session)).to.eql([]);
        undo(disk.session);
        expect(names(disk.session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
    });

    it("tries a format on a copy, and says what the engine would refuse", async () => {
        const disk = await makeDiskWithFiles();
        const request = {format: {dos: TrsdosFormatDos.LDOS_5_3, cylinders: undefined, sides: undefined,
            density: undefined, model: undefined, name: undefined, date: undefined}, force: true};

        // With force the dry run succeeds and changes nothing.
        const {commandLine} = formatDryRun(disk.session, request);
        expect(commandLine).to.equal("format ldos-5.3 --force");
        expect(names(disk.session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
        expect(disk.session.getHistory().entries.length).to.equal(1);

        // Without it, the disk's files stop the format, as they would for the real one.
        let message = "";
        try {
            formatDryRun(disk.session, {...request, force: false});
        } catch (e: any) {
            expect(e.name).to.equal("DiskError");
            message = e.message;
        }
        expect(message).to.contain("would erase 2 files");
        expect(names(disk.session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
    });

    it("reverts to the saved disk, and goes to a history position", async () => {
        const disk = await makeDiskWithFiles();
        const session = disk.session;
        session.markSaved();
        await kill(session, ["HELLO/BAS"]);
        await kill(session, ["PROG/CMD"]);
        expect(names(session)).to.eql([]);

        const back = goToHistoryPosition(session, session.getHistory().position - 2);
        expect(back.commandLine).to.equal("undo : undo");
        expect(back.result.labels).to.eql(["kill PROG/CMD", "kill HELLO/BAS"]);
        expect(names(session)).to.eql(["HELLO/BAS", "PROG/CMD"]);

        const forward = goToHistoryPosition(session, session.getHistory().position + 1);
        expect(forward.commandLine).to.equal("redo");
        expect(names(session)).to.eql(["PROG/CMD"]);

        const reverted = revert(session);
        expect(reverted.commandLine).to.equal("revert");
        expect(reverted.result).to.equal(true);
        expect(names(session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
        expect(revert(session).result).to.equal(false);
    });

    it("throws the engine's errors", async () => {
        const disk = await makeDiskWithFiles();
        let message = "";
        try {
            await kill(disk.session, ["NOPE/BAS"]);
        } catch (e: any) {
            expect(e.name).to.equal("DiskError");
            message = e.message;
        }
        expect(message).to.contain("NOPE/BAS");
        expect(disk.session.getHistory().entries.length).to.equal(1);
    });
});

describe("choosePartition", () => {
    /**
     * Make a hard disk session with two LDOS partitions.
     */
    function makeHardDisk(): DiskSession {
        const session = DiskSession.fromBinary("test.hdv", undefined, {templates: TEMPLATES});
        createHardDisk(session, {dos: TrsdosFormatDos.LDOS_5_3, heads: 2, cylinders: 200, partitions: 2, model: undefined,
            name: undefined, date: undefined, force: false});
        return session;
    }

    it("chooses a partition, with the command line and no history entry", () => {
        const session = makeHardDisk();
        expect(session.getPartitions().length).to.equal(2);
        const {commandLine} = choosePartition(session, 2);
        expect(commandLine).to.equal("partition 2");
        expect(session.selectedPartitionNumber).to.equal(2);
        expect(session.getHistory().entries).to.eql([]);
    });

    it("refuses a partition that isn't there, and a floppy", async () => {
        const session = makeHardDisk();
        expect(() => choosePartition(session, 3)).to.throw("There is no partition 3");
        const floppy = await makeBlankDisk();
        expect(() => choosePartition(floppy.session, 1)).to.throw("floppy");
    });
});

describe("planAddFiles and addPlanned", () => {
    it("plans from File objects", async () => {
        const disk = await makeBlankDisk();
        const plan = await planAddFiles(disk.session, [textFile("notes.txt", "hi\n"), textFile("a.bas", "10 END\n")],
            {...PLAIN_ADD, basic: BasicDialect.MODEL_4});
        expect(plan.map(item => item.name)).to.eql(["NOTES/TXT", "A/BAS"]);
        expect(plan.every(item => item.problem === undefined)).to.equal(true);
        expect(plan[0].source.label).to.equal("notes.txt");
        expect(plan[0].conversionMessages).to.eql(["Converted line endings of notes.txt."]);
        expect(plan[1].conversionMessages.length).to.be.greaterThan(0);
        // Planning changes nothing.
        expect(names(disk.session)).to.eql([]);
    });

    it("adds as one undoable step, with the command line", async () => {
        const disk = await makeBlankDisk();
        const options = {...PLAIN_ADD, system: true};
        const plan = await planAddFiles(disk.session, [textFile("notes.txt", "hi\n")], options);
        const {commandLine, result} = await addPlanned(disk.session, plan, options);
        expect(commandLine).to.equal("add notes.txt --system");
        expect(result.files.map(file => file.name)).to.eql(["NOTES/TXT"]);
        expect(getFileRows(disk.session, true).map(row => row.fullName)).to.contain("NOTES/TXT");
        expect(disk.session.getHistory().entries).to.eql(["add notes.txt --system"]);
        undo(disk.session);
        expect(names(disk.session)).to.eql([]);
    });

    it("reports an existing file, and replaces it with overwrite", async () => {
        const disk = await makeDiskWithFiles();
        const plan = await planAddFiles(disk.session, [textFile("hello.bas", "10 END\n")], PLAIN_ADD);
        expect(plan[0].existingName).to.equal("HELLO/BAS");
        let failed = false;
        try {
            await addPlanned(disk.session, plan, PLAIN_ADD);
        } catch (e: any) {
            failed = true;
            expect(e.message).to.contain("already on the disk");
        }
        expect(failed).to.equal(true);

        const overwrite = {...PLAIN_ADD, overwrite: true};
        const replan = await planAddFiles(disk.session, [textFile("hello.bas", "10 END\n")], overwrite);
        const {result} = await addPlanned(disk.session, replan, overwrite);
        expect(result.files[0].replaced).to.equal(true);
    });

    it("gives each file its own date with useFileDates, one add per day", async () => {
        const disk = await makeBlankDisk();
        const options = {...PLAIN_ADD, useFileDates: true};
        const files = [
            textFile("a.txt", "a\n", new Date(1999, 2, 4, 12).getTime()),
            textFile("b.txt", "b\n", new Date(2005, 6, 8, 12).getTime()),
            textFile("c.txt", "c\n", new Date(1999, 2, 4, 18).getTime()),
        ];
        const plan = await planAddFiles(disk.session, files, options);
        const {commandLine, result} = await addPlanned(disk.session, plan, options);
        expect(commandLine).to.equal("add a.txt c.txt --date 1999-03-04 : add b.txt --date 2005-07-08");
        expect(result.files.length).to.equal(3);

        const rows = getFileRows(disk.session, false);
        const yearOf = (name: string): number | undefined => rows.find(row => row.fullName === name)?.date?.getFullYear();
        expect(yearOf("A/TXT")).to.equal(1999);
        expect(yearOf("B/TXT")).to.equal(2005);
        expect(yearOf("C/TXT")).to.equal(1999);
        // One undoable step for all of it.
        expect(disk.session.getHistory().entries.length).to.equal(1);
        undo(disk.session);
        expect(names(disk.session)).to.eql([]);
    });

    it("uses one date for every file when it's given", async () => {
        const disk = await makeBlankDisk();
        const options = {...PLAIN_ADD, useFileDates: true, date: new Date(1985, 11, 25)};
        const plan = await planAddFiles(disk.session, [textFile("a.txt", "a\n"), textFile("b.txt", "b\n")], options);
        const {commandLine} = await addPlanned(disk.session, plan, options);
        expect(commandLine).to.equal("add a.txt b.txt --date 1985-12-25");
    });
});

describe("planExtraction", () => {
    it("names files as extract does", async () => {
        const disk = await makeDiskWithFiles();
        const rows = getFileRows(disk.session, false);
        const extra = [rows[0], rows[0], rows[1]];
        const plain = planExtraction(extra);
        expect(plain.map(file => file.path.join("/"))).to.eql(["HELLO.BAS", "HELLO.BAS (2)", "PROG.CMD"]);
        const lower = planExtraction(rows, {lowercase: true});
        expect(lower.map(file => file.path.join("/"))).to.eql(["hello.bas", "prog.cmd"]);
        expect(lower[1].bytes.length).to.equal(11);
    });
});
