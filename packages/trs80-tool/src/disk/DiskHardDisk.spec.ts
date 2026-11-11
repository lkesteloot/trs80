import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeHdvHardDisk, findLdosPartitions, ldosTestSector, type LdosTestHardDiskOptions, type LdosTestPartition,
    makeBlankTestHdv, makeLdosTestHardDiskBinary, makeTrsdos23TestDisk,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {DiskSession} from "trs80-disk";
import {makeDiskPrompt, runDiskLine} from "./DiskShell.js";
import {openDiskSession, saveDiskSession, sessionInputFiles} from "./DiskFiles.js";

const HEADER_SIZE = 256;

/**
 * Two cylinder-split partitions with a file in each. Both have their directory on cylinder 30.
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

describe("disk on hard disk images", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-hd-"));
        imagePathname = path.join(dir, "test.hdv");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Write a hard disk image with these partitions to the image file.
     */
    function makeImage(partitions: LdosTestPartition[], options: LdosTestHardDiskOptions = {}): void {
        fs.writeFileSync(imagePathname, makeLdosTestHardDiskBinary(partitions, options));
    }

    /**
     * Make a host file in the temporary directory with this many bytes, and return its pathname.
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
     * Run one line of the shell on the session and return what it printed.
     */
    async function runLine(session: DiskSession, line: string): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await runDiskLine(session, line, new DiskOptionValues());
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * The names of the files (without system files) of a partition of the image on the host.
     */
    function fileNames(pathname: string, partition: string): string[] {
        return sessionInputFiles(openDiskSession(pathname, {partition}), false).map(f => f.filename);
    }

    /**
     * The contents of the named file of a partition of the image on the host.
     */
    function fileBytes(pathname: string, partition: string, name: string): Uint8Array {
        const inFile = sessionInputFiles(openDiskSession(pathname, {partition}), true).find(f => f.filename === name);
        if (inFile === undefined) {
            throw new Error("No file " + name);
        }
        return inFile.binary;
    }

    it("selects the only partition by itself, and chains add and dir", async () => {
        makeImage([{name: "ONLY"}]);
        const hostPathname = makeHostFile("DATA.BIN", 5000);

        const lines = await runDisk("add", hostPathname, "--binary", ":", "dir");
        expect(lines[0]).to.equal("Added DATA/BIN (5,000 bytes).");
        expect(lines.some(line => line.startsWith("DATA.BIN") && line.includes("5,000"))).to.equal(true);
        expect(lines[lines.length - 1]).to.equal("Saved " + imagePathname + ".");

        // Reopened, the file is there and reads back.
        expect(fileNames(imagePathname, "1")).to.eql(["HELLO.TXT", "DATA.BIN"]);
        expect(fileBytes(imagePathname, "1", "DATA.BIN")).to.eql(new Uint8Array(fs.readFileSync(hostPathname)));
        // The image is still the same size, with the same header.
        expect(fs.statSync(imagePathname).size).to.equal(
            HEADER_SIZE + 40*2*32*256);
    });

    it("refuses a command that needs a partition when there are several, and says how to choose", async () => {
        makeImage(TWO_PARTITIONS);
        const error = await runDisk("dir").then(() => undefined, (e: unknown) => e);
        expect(error).to.be.instanceOf(ToolError);
        const message = (error as ToolError).message;
        expect(message).to.contain("2 partitions");
        expect(message).to.contain("ALPHA");
        expect(message).to.contain("Beta");
        expect(message).to.contain("--partition");
        expect(message).to.contain("\"partition\" command");
        // Nothing was written.
        expect(new Uint8Array(fs.readFileSync(imagePathname))).to.eql(makeLdosTestHardDiskBinary(TWO_PARTITIONS));
    });

    it("chooses a partition with --partition, by number or by name ignoring case", async () => {
        makeImage(TWO_PARTITIONS);
        const byNumber = await runDisk("--partition", "2", "dir");
        expect(byNumber.some(line => line.startsWith("TWO.TXT"))).to.equal(true);
        expect(byNumber.some(line => line.startsWith("ONE.TXT"))).to.equal(false);
        const byName = await runDisk("--partition", "BETA", "dir");
        expect(byName.some(line => line.startsWith("TWO.TXT"))).to.equal(true);
        const first = await runDisk("--partition", "alpha", "dir");
        expect(first.some(line => line.startsWith("ONE.TXT"))).to.equal(true);
    });

    it("rejects a --partition that names nothing, and on a floppy", async () => {
        makeImage(TWO_PARTITIONS);
        await expect(runDisk("--partition", "3", "dir")).rejects.toThrow("There is no partition 3");
        await expect(runDisk("--partition", "GAMMA", "dir")).rejects.toThrow("No partition is named \"GAMMA\"");

        imagePathname = path.join(dir, "floppy.jv1");
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk([]).binary);
        await expect(runDisk("--partition", "1", "dir")).rejects.toThrow("--partition only applies to hard disks");
    });

    it("lists the partitions, and the partition command selects one for the later commands", async () => {
        makeImage(TWO_PARTITIONS);
        const lines = await runDisk("partition");
        expect(lines.length).to.equal(2);
        expect(lines[0]).to.contain("ALPHA");
        expect(lines[0]).to.contain("cylinders 0-59");
        expect(lines[0]).to.contain("LS-DOS 6.3");
        expect(lines[0]).to.contain("1 file");
        expect(lines[0]).to.contain("writable");
        expect(lines[1]).to.contain("Beta");

        const hostPathname = makeHostFile("NEW.DAT", 3000);
        const chained = await runDisk("partition", "beta", ":", "add", hostPathname, "--binary", ":", "dir");
        expect(chained[0]).to.equal("Working on partition 2 (Beta).");
        expect(fileNames(imagePathname, "2")).to.eql(["TWO.TXT", "NEW.DAT"]);
        expect(fileNames(imagePathname, "1")).to.eql(["ONE.TXT"]);
    });

    it("changes only the chosen partition's sectors on the host", async () => {
        makeImage(TWO_PARTITIONS);
        const before = new Uint8Array(fs.readFileSync(imagePathname));
        await runDisk("--partition", "1", "add", makeHostFile("A.DAT", 9000), "--binary");
        const after = new Uint8Array(fs.readFileSync(imagePathname));

        expect(after.length).to.equal(before.length);
        expect(after.subarray(0, HEADER_SIZE)).to.eql(before.subarray(0, HEADER_SIZE));
        const secondStart = HEADER_SIZE + 60*2*32*256;
        expect(after.subarray(secondStart)).to.eql(before.subarray(secondStart));
        expect(after.subarray(HEADER_SIZE, secondStart)).not.to.eql(before.subarray(HEADER_SIZE, secondStart));
    });

    it("keeps the stale GAT copy in sector 3 as it was", async () => {
        makeImage(TWO_PARTITIONS);
        const copyOf = (binary: Uint8Array) => new Uint8Array(ldosTestSector(binary, 2, {cylinderOffset: 0, headOffset: 0}, 0, 3));
        const before = copyOf(new Uint8Array(fs.readFileSync(imagePathname)));
        await runDisk("--partition", "1", "add", makeHostFile("A.DAT", 9000), "--binary", ":", "kill", "one/txt");
        expect(copyOf(new Uint8Array(fs.readFileSync(imagePathname)))).to.eql(before);
    });

    it("renames, kills and sets attributes on a partition", async () => {
        makeImage(TWO_PARTITIONS);
        const lines = await runDisk("--partition", "Beta", "rename", "two/txt", "second/txt", ":", "attrib", "second/txt",
            "--invisible", ":", "check", ":", "kill", "second/txt");
        expect(lines).to.include("Renamed TWO/TXT to SECOND/TXT.");
        expect(lines).to.include("Removed SECOND/TXT.");
        expect(lines).to.include("Safe to write.");
        expect(fileNames(imagePathname, "2")).to.eql([]);
        expect(fileNames(imagePathname, "1")).to.eql(["ONE.TXT"]);
    });

    it("saves and reopens, and a second session sees the same files", async () => {
        makeImage([{}]);
        const session = openDiskSession(imagePathname);
        await runLine(session, "add " + JSON.stringify(makeHostFile("X.DAT", 700)) + " --binary");
        expect(session.hasChanges()).to.equal(true);
        expect(saveDiskSession(session)).to.equal(imagePathname);
        expect(session.hasChanges()).to.equal(false);

        const reopened = openDiskSession(imagePathname);
        expect(sessionInputFiles(reopened, false).map(f => f.filename)).to.eql(["HELLO.TXT", "X.DAT"]);
    });

    it("undoes and redoes a change, and reverts, without losing the chosen partition", async () => {
        makeImage(TWO_PARTITIONS);
        const original = new Uint8Array(fs.readFileSync(imagePathname));
        const session = openDiskSession(imagePathname, {partition: "2"});

        await runLine(session, "add " + JSON.stringify(makeHostFile("X.DAT", 700)) + " --binary");
        const changed = new Uint8Array(session.image.binary);
        expect(changed).not.to.eql(original);

        expect(await runLine(session, "undo")).to.eql(["Undid \"add " + makeHostFile("X.DAT", 700) + " --binary\"."]);
        expect(new Uint8Array(session.image.binary)).to.eql(original);
        expect(session.hasChanges()).to.equal(false);
        expect(session.selectedPartitionNumber).to.equal(2);
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["TWO.TXT"]);

        await runLine(session, "redo");
        expect(new Uint8Array(session.image.binary)).to.eql(changed);
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["TWO.TXT", "X.DAT"]);

        await runLine(session, "revert");
        expect(new Uint8Array(session.image.binary)).to.eql(original);
        expect(session.selectedPartitionName).to.equal("Beta");
    });

    it("undo across a switch of partition restores the right bytes", async () => {
        makeImage(TWO_PARTITIONS);
        const original = new Uint8Array(fs.readFileSync(imagePathname));
        const session = openDiskSession(imagePathname, {partition: "1"});
        await runLine(session, "add " + JSON.stringify(makeHostFile("A.DAT", 700)) + " --binary");
        await runLine(session, "partition 2");
        await runLine(session, "add " + JSON.stringify(makeHostFile("B.DAT", 700)) + " --binary");
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["TWO.TXT", "B.DAT"]);

        // The undo takes back the second partition's file, and the selection stays on partition 2.
        await runLine(session, "undo");
        expect(session.selectedPartitionNumber).to.equal(2);
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["TWO.TXT"]);
        await runLine(session, "partition 1");
        expect(sessionInputFiles(session, false).map(f => f.filename)).to.eql(["ONE.TXT", "A.DAT"]);
        await runLine(session, "undo");
        expect(new Uint8Array(session.image.binary)).to.eql(original);
    });

    it("writes the --output file and leaves the image alone", async () => {
        makeImage([{}]);
        const original = new Uint8Array(fs.readFileSync(imagePathname));
        const outputPathname = path.join(dir, "out.hdv");

        const lines = await runDisk("-o", outputPathname, "add", makeHostFile("X.DAT", 700), "--binary");
        expect(lines[lines.length - 1]).to.equal("Saved " + outputPathname + ".");
        expect(new Uint8Array(fs.readFileSync(imagePathname))).to.eql(original);
        expect(fileNames(outputPathname, "1")).to.eql(["HELLO.TXT", "X.DAT"]);
    });

    it("writes nothing with --dry-run", async () => {
        makeImage([{}]);
        const original = new Uint8Array(fs.readFileSync(imagePathname));
        const lines = await runDisk("--dry-run", "add", makeHostFile("X.DAT", 700), "--binary");
        expect(lines[lines.length - 1]).to.contain("Not saved (--dry-run)");
        expect(new Uint8Array(fs.readFileSync(imagePathname))).to.eql(original);
    });

    it("refuses the floppy-only commands on a hard disk", async () => {
        makeImage([{}]);
        for (const command of ["map", "trim", "boot"]) {
            await expect(runDisk(command), command).rejects.toThrow(command + " works on floppy images, not hard disks");
        }
        const session = openDiskSession(imagePathname);
        expect(() => session.floppy).toThrow("works on floppy images, not hard disks");
    });

    it("says there are no partitions on a floppy", async () => {
        imagePathname = path.join(dir, "floppy.jv1");
        fs.writeFileSync(imagePathname, makeTrsdos23TestDisk([]).binary);
        await expect(runDisk("partition")).rejects.toThrow("floppy, which has no partitions");
    });

    it("refuses to write a write-protected image, but writes it with --force and keeps its flag", async () => {
        makeImage([{}], {writeProtected: true});
        await expect(runDisk("add", makeHostFile("X.DAT", 700), "--binary")).rejects.toThrow("write-protect flag");
        expect(fileNames(imagePathname, "1")).to.eql(["HELLO.TXT"]);

        const lines = await runDisk("--force", "add", makeHostFile("X.DAT", 700), "--binary");
        expect(lines.some(line => line.includes("Writing anyway (--force)"))).to.equal(true);
        expect(fileNames(imagePathname, "1")).to.eql(["HELLO.TXT", "X.DAT"]);
        expect(fs.readFileSync(imagePathname)[7] & 0x80).to.equal(0x80);
    });

    it("refuses to write a DOSPLUS 3 partition and says it is read-only, but reads it", async () => {
        makeImage([{version: 0x35, mediaData: false, granulesPerCylinder: 2}]);
        await expect(runDisk("add", makeHostFile("X.DAT", 700), "--binary")).rejects.toThrow("DOSPLUS 3 hard disk partitions are read-only");
        const lines = await runDisk("dir");
        expect(lines.some(line => line.startsWith("HELLO.TXT"))).to.equal(true);
        const partitions = await runDisk("partition");
        expect(partitions[0]).to.contain("read-only");
    });

    it("opens a hard disk that has no partitions we recognize, and says so", async () => {
        fs.writeFileSync(imagePathname, makeBlankTestHdv(40, 2));
        const info = await runDisk("info");
        expect(info[0]).to.contain("no LDOS, LS-DOS or DOSPLUS partitions found");
        await expect(runDisk("dir")).rejects.toThrow("Can't find an LDOS, LS-DOS or DOSPLUS partition");
        // The listing has only the free space, which is all of the disk.
        expect(await runDisk("partition")).to.eql(["     cylinders 0-39, heads 0-1  free (40 cylinders)"]);
    });

    it("describes the disk and the selected partition in info", async () => {
        makeImage(TWO_PARTITIONS);
        const unselected = await runDisk("info");
        expect(unselected[0]).to.contain("2 partitions");
        expect(unselected.join("\n")).to.contain("No partition is selected");

        const selected = await runDisk("--partition", "2", "info");
        const text = selected.join("\n");
        expect(text).to.contain("partition 2 (Beta)");
        expect(text).to.contain("Disk name: Beta");
        expect(text).to.contain("Directory cylinder: 30");
        expect(text).to.contain("Granules per cylinder: 8");
        expect(text).to.contain("Writable: yes");
    });

    it("names the selected partition in the prompt", async () => {
        expect(makeDiskPrompt(undefined)).to.equal(">");
        expect(makeDiskPrompt("HARDA")).to.equal("HARDA>");

        makeImage(TWO_PARTITIONS);
        const session = openDiskSession(imagePathname);
        expect(session.selectedPartitionName).to.equal(undefined);
        await runLine(session, "partition 2");
        expect(makeDiskPrompt(session.selectedPartitionName)).to.equal("Beta>");
    });

    it("decodes the hard disk the same way the top-level commands do", () => {
        makeImage(TWO_PARTITIONS);
        const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
        expect(findLdosPartitions(hardDisk).map(p => p.diskName)).to.eql(["ALPHA", "Beta"]);
    });
});
