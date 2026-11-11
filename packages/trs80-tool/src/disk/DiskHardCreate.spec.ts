import fs from "fs";
import os from "os";
import path from "path";
import {
    decodeHdvHardDisk, findLdosPartitions, formatLdosPartition, makeBlankHdvHardDisk, makeTrsdos23TestDisk,
    TrsdosFormatDos,
} from "trs80-base";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ToolError} from "../utils.js";
import {disk} from "./disk.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {DiskSession} from "./DiskSession.js";
import {runDiskLine} from "./DiskShell.js";

const HEADER_SIZE = 256;

describe("disk create, partition --add and --delete, and format on hard disks", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-hdcreate-"));
        imagePathname = path.join(dir, "new.hdv");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

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
     * The partitions found on the saved image, as "NAME at cylinder/head cylindersxheads" strings.
     */
    function partitionsOnDisk(pathname = imagePathname): string[] {
        const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(pathname)))!;
        return findLdosPartitions(hardDisk).map(p => p.diskName + " at " + p.partition.cylinderOffset + "/" +
            p.partition.headOffset + " " + p.partition.cylinderCount + "x" + p.partition.headCount);
    }

    describe("create", () => {
        it("makes a blank disk with no partitions, with the default shape", async () => {
            const lines = await runDisk("create");
            expect(lines[0]).to.contain("a blank HDV hard disk, 840 cylinders, 6 heads, 39 MB, no partitions");
            expect(lines[lines.length - 1]).to.equal("Saved " + imagePathname + ".");

            const binary = new Uint8Array(fs.readFileSync(imagePathname));
            expect(binary.length).to.equal(HEADER_SIZE + 840*6*32*256);
            expect(binary[26]).to.equal(6);
            expect(binary[27]*256 + binary[28]).to.equal(840);
            expect(binary.subarray(HEADER_SIZE).every(byte => byte === 0)).to.equal(true);
            expect(partitionsOnDisk()).to.eql([]);

            // The listing shows only the free space.
            const listing = await runDisk("partition");
            expect(listing).to.eql(["     cylinders 0-839, heads 0-5  free (840 cylinders)"]);
        });

        it("takes the heads and cylinders", async () => {
            await runDisk("create", "--heads", "2", "--cylinders", "100");
            const binary = new Uint8Array(fs.readFileSync(imagePathname));
            expect(binary.length).to.equal(HEADER_SIZE + 100*2*32*256);
            expect(decodeHdvHardDisk(binary)!.getGeometry().headCount).to.equal(2);
        });

        it("makes the fewest partitions that keep each at 203 cylinders or fewer, and says how to configure the driver", async () => {
            const lines = await runDisk("create", "lsdos-6.3");
            expect(partitionsOnDisk()).to.eql([
                "HARDA at 0/0 168x6", "HARDB at 168/0 168x6", "HARDC at 336/0 168x6",
                "HARDD at 504/0 168x6", "HARDE at 672/0 168x6",
            ]);
            expect(lines[0]).to.contain("840 cylinders, 6 heads");
            expect(lines[0]).to.contain("5 partitions (LS-DOS 6.3)");
            const text = lines.join("\n");
            expect(text).to.contain("Configure the hard disk driver");
            expect(text).to.contain("Disk: 6 heads, 840 cylinders.");
            expect(text).to.contain("Partition 1 (HARDA): starting cylinder 0, 168 cylinders, starting head 0, 6 heads;");
            expect(text).to.contain("Partition 5 (HARDE): starting cylinder 672,");
            expect(text).to.contain("6 granules per cylinder of 32 sectors, directory on cylinder 84 of the partition.");
        });

        it("makes N equal partitions with --partitions, leaving the rest free", async () => {
            await runDisk("create", "lsdos-6.3", "--heads", "6", "--cylinders", "850", "--partitions", "6");
            expect(partitionsOnDisk()).to.eql([
                "HARDA at 0/0 141x6", "HARDB at 141/0 141x6", "HARDC at 282/0 141x6",
                "HARDD at 423/0 141x6", "HARDE at 564/0 141x6", "HARDF at 705/0 141x6",
            ]);
            const listing = await runDisk("partition");
            expect(listing.length).to.equal(7);
            expect(listing[6]).to.contain("cylinders 846-849, heads 0-5");
            expect(listing[6]).to.contain("free");
        });

        it("makes the six 140-cylinder partitions of the real LS-DOS samples, with their media data blocks", async () => {
            await runDisk("create", "lsdos-6.3", "--heads", "6", "--cylinders", "840", "--partitions", "6");
            const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
            const found = findLdosPartitions(hardDisk);
            expect(found.map(f => f.diskName)).to.eql(["HARDA", "HARDB", "HARDC", "HARDD", "HARDE", "HARDF"]);
            const gat = hardDisk.readSector(560 + 70, 0, 0)!;
            expect(Array.from(gat.subarray(0xF5))).to.eql([0x03, 0x52, 0x53, 0x48, 0x0E, 0x10, 0x30, 0x8B, 0xBF, 0xBF, 0x46]);
        });

        it("names the partition with --name and dates it with --date when there's one", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "1", "--cylinders", "100", "--name", "mydisk",
                "--date", "1983-05-01", "--model", "1");
            expect(partitionsOnDisk()).to.eql(["MYDISK at 0/0 100x1"]);
            const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
            const gat = hardDisk.readSector(50, 0, 0)!;
            expect(String.fromCharCode(...gat.subarray(0xD8, 0xE0))).to.equal("05/01/83");
            expect(hardDisk.binary[12]).to.equal(5);
            expect(hardDisk.binary[14]).to.equal(83);
            // The Model I's boot sector, with the directory cylinder (50) patched in.
            const model1Boot = hardDisk.readSector(0, 0, 0)!;
            expect(Array.from(model1Boot.subarray(0, 6))).to.eql([0x00, 0xFE, 50, 0xF3, 0x31, 0xE0]);
            await runDiskOn(path.join(dir, "model3.hdv"), "create", "ldos-5.3", "--heads", "1", "--cylinders", "100");
            const model3Disk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(path.join(dir, "model3.hdv"))))!;
            expect(Array.from(model3Disk.readSector(0, 0, 0)!.subarray(0, 6))).to.eql([0x00, 0xFE, 50, 0xF3, 0x3A, 0x02]);
        });

        it("refuses what doesn't apply to a hard disk, or doesn't make sense", async () => {
            const cases: [string[], string][] = [
                [["create", "ldos-5.3", "--sides", "2"], "--sides only applies to floppy images"],
                [["create", "ldos-5.3", "--density", "double"], "--density only applies to floppy images"],
                [["create", "ldos-5.3", "--system"], "--system only applies to floppy images"],
                [["create", "trsdos-6.2"], "trsdos-6.2 can't be formatted on a hard disk"],
                [["create", "trsdos-2.3"], "ldos-5.3 and lsdos-6.3"],
                [["create", "trsdos-1.3"], "can't be formatted on a hard disk"],
                [["create", "--partitions", "2"], "--partitions needs a DOS"],
                [["create", "--name", "ABC"], "--name needs a DOS"],
                [["create", "--heads", "9"], "1 to 8 heads"],
                [["create", "--heads", "0"], "1 to 8 heads"],
                [["create", "--cylinders", "1024"], "1 to 1023 cylinders"],
                [["create", "lsdos-6.3", "--cylinders", "20"], "at least 35"],
                [["create", "lsdos-6.3", "--cylinders", "300", "--partitions", "1"], "at most 203"],
                [["create", "lsdos-6.3", "--cylinders", "300", "--partitions", "9"], "at least 35"],
                [["create", "lsdos-6.3", "--partitions", "27", "--cylinders", "1000"], "from 1 to 26"],
                [["create", "lsdos-6.3", "--cylinders", "300", "--partitions", "2", "--name", "ABC"], "--name names one partition"],
            ];
            for (const [words, message] of cases) {
                const error = await runDiskExpectingError(...words);
                expect(error.message, words.join(" ")).to.contain(message);
                expect(fs.existsSync(imagePathname), words.join(" ")).to.equal(false);
            }
        });

        it("refuses --heads and --partitions on a floppy", async () => {
            const dmk = path.join(dir, "new.dmk");
            for (const option of ["--heads", "--partitions"]) {
                await expect(runDiskOn(dmk, "create", "ldos-5.3", option, "2")).rejects.toThrow(
                    option + " only applies to hard disk images");
            }
            expect(fs.existsSync(dmk)).to.equal(false);
        });

        it("replaces an existing disk only with --force", async () => {
            await runDisk("create", "--heads", "1", "--cylinders", "50");
            const error = await runDiskExpectingError("create", "--heads", "1", "--cylinders", "60");
            expect(error.message).to.contain("already has a disk; use --force");
            expect(fs.statSync(imagePathname).size).to.equal(HEADER_SIZE + 50*32*256);

            const lines = await runDisk("create", "--heads", "1", "--cylinders", "60", "--force");
            expect(lines[0]).to.equal("Replaced the disk in memory; nothing is saved until quit.");
            expect(fs.statSync(imagePathname).size).to.equal(HEADER_SIZE + 60*32*256);
        });
    });

    describe("partition --add", () => {
        it("adds partitions by cylinder with the defaults, selects each, and lists the free space", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "400");
            const lines = await runDisk("partition", "--add", "ldos-5.3", "--cylinders", "140", "--model", "3");
            expect(lines[0]).to.equal("Added partition 1, HARDA: cylinders 0-139, heads 0-3, LDOS 5.3, directory on cylinder 70.");
            expect(lines.join("\n")).to.contain("Partition 1 (HARDA): starting cylinder 0, 140 cylinders, " +
                "starting head 0, 4 heads;");
            expect(lines.join("\n")).to.contain("8 granules per cylinder of 16 sectors");

            // The default is the first free block, at most 203 cylinders.
            await runDisk("partition", "--add", "lsdos-6.3");
            await runDisk("partition", "--add", "lsdos-6.3");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 140x4", "HARDB at 140/0 203x4", "HARDC at 343/0 57x4"]);

            const listing = await runDisk("partition");
            expect(listing.length).to.equal(3);
            expect(listing[0]).to.contain("LDOS 5.3");
            expect(listing[1]).to.contain("cylinders 140-342, heads 0-3");
            expect(listing[2]).to.contain("LS-DOS 6.3");
        });

        it("selects the new partition, so that later commands work on it", async () => {
            const hostPathname = makeHostFile("DATA.BIN", 3000);
            const lines = await runDisk("create", "--heads", "2", "--cylinders", "200", ":",
                "partition", "--add", "lsdos-6.3", "--cylinders", "60", ":",
                "partition", "--add", "lsdos-6.3", "--cylinders", "60", ":",
                "add", hostPathname, "--binary", ":", "dir");
            expect(lines.some(line => line.startsWith("Added partition 2, HARDB"))).to.equal(true);
            expect(lines.some(line => line.startsWith("DATA.BIN") && line.includes("3,000"))).to.equal(true);

            // The file went to the second partition, and it's there after reopening.
            const second = DiskSession.open(imagePathname, {partition: "HARDB"});
            expect(second.getInputFiles(false).map(f => f.filename)).to.eql(["DATA.BIN"]);
            const first = DiskSession.open(imagePathname, {partition: "HARDA"});
            expect(first.getInputFiles(false)).to.eql([]);
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 60x2", "HARDB at 60/0 60x2"]);
        });

        it("adds partitions by head", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "203");
            const lines = await runDisk("partition", "--add", "lsdos-6.3", "--heads", "1");
            expect(lines[0]).to.equal("Added partition 1, HARDA: cylinders 0-202, head 0, LS-DOS 6.3, directory on cylinder 101.");
            expect(lines.join("\n")).to.contain("8 granules per cylinder of 4 sectors");

            await runDisk("partition", "--add", "ldos-5.3", "--heads", "1");
            await runDisk("partition", "--add", "lsdos-6.3", "--start-head", "3", "--name", "last");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 203x1", "HARDB at 0/1 203x1", "LAST at 0/3 203x1"]);

            // One head is free, and the free space is by head.
            const listing = await runDisk("partition");
            expect(listing[3]).to.contain("head 2");
            expect(listing[3]).to.contain("free (1 head)");

            // A two-head partition goes where two heads are free; here only one is.
            const error = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--heads", "2");
            expect(error.message).to.contain("no free space for 2 heads");
        });

        it("takes --start-cylinder and --granules, and names the next free letter", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "500");
            await runDisk("partition", "--add", "lsdos-6.3", "--start-cylinder", "100", "--cylinders", "50",
                "--name", "harda");
            // HARDA is taken, so the default name is HARDB.
            const lines = await runDisk("partition", "--add", "lsdos-6.3", "--start-cylinder", "200", "--cylinders", "50",
                "--granules", "4");
            expect(lines[0]).to.contain("Added partition 2, HARDB: cylinders 200-249");
            expect(lines.join("\n")).to.contain("4 granules per cylinder of 32 sectors");
        });

        it("refuses --granules that make granules of more than 32 sectors", async () => {
            await runDisk("create", "--heads", "6", "--cylinders", "100");
            const error = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--granules", "3");
            expect(error.message).to.contain("at most 32");
        });

        it("refuses the DOSes that hard disks don't have, and a missing DOS", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "100");
            for (const dos of ["trsdos-6.2", "trsdos-2.3", "trsdos-1.3"]) {
                const error = await runDiskExpectingError("partition", "--add", dos);
                expect(error.message, dos).to.contain("can't be formatted on a hard disk");
                expect(error.message, dos).to.eql(dos + " can't be formatted on a hard disk. The DOSes that " +
                    "work are ldos-5.3 and lsdos-6.3.");
            }
            // Only the DOSes that work are offered.
            const hardDiskDoses = /The DOSes are:\n  ldos-5\.3 .*\n  lsdos-6\.3 [^\n]*$/;
            const missing = await runDiskExpectingError("partition", "--add");
            expect(missing.message).to.contain("needs a DOS");
            expect(missing.message).to.match(hardDiskDoses);
            const unknown = await runDiskExpectingError("partition", "--add", "cpm");
            expect(unknown.message).to.match(hardDiskDoses);
            expect(partitionsOnDisk()).to.eql([]);
        });

        it("refuses sizes outside 35 to 203 cylinders", async () => {
            await runDisk("create", "--heads", "2", "--cylinders", "400");
            expect((await runDiskExpectingError("partition", "--add", "ldos-5.3", "--cylinders", "204")).message)
                .to.contain("35 to 203 cylinders");
            expect((await runDiskExpectingError("partition", "--add", "ldos-5.3", "--cylinders", "34")).message)
                .to.contain("35 to 203 cylinders");

            // A free block under 35 cylinders is no place for a default-size partition.
            await runDisk("partition", "--add", "ldos-5.3", "--cylinders", "203");
            await runDisk("partition", "--add", "ldos-5.3", "--cylinders", "170");
            const error = await runDiskExpectingError("partition", "--add", "ldos-5.3");
            expect(error.message).to.contain("no free block of 35 cylinders or more");
            expect(error.message).to.contain("cylinders 373-399");
        });

        it("refuses to overlap a partition", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "200", "--partitions", "2");
            const error = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--start-cylinder", "50",
                "--cylinders", "60");
            expect(error.message).to.contain("would overlap partition 1 (HARDA)");
            const inside = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--start-cylinder", "150");
            expect(inside.message).to.contain("would overlap partition 2 (HARDB)");
            const past = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--start-cylinder", "300");
            expect(past.message).to.contain("past the end of the disk");
            const long = await runDiskExpectingError("partition", "--add", "lsdos-6.3", "--start-cylinder", "190",
                "--cylinders", "100");
            expect(long.message).to.contain("don't fit");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 100x2", "HARDB at 100/0 100x2"]);
        });

        it("refuses to mix the two kinds of split", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "200");
            await runDisk("partition", "--add", "ldos-5.3", "--cylinders", "100");
            const byHead = await runDiskExpectingError("partition", "--add", "ldos-5.3", "--heads", "1");
            expect(byHead.message).to.contain("split by cylinder");
            expect(byHead.message).to.contain("mix the two kinds");

            await runDisk("create", "--heads", "4", "--cylinders", "200", "--force");
            await runDisk("partition", "--add", "ldos-5.3", "--heads", "1");
            const byCylinder = await runDiskExpectingError("partition", "--add", "ldos-5.3", "--cylinders", "100");
            expect(byCylinder.message).to.contain("split by head");
            expect(byCylinder.message).to.contain("mix the two kinds");
        });

        it("splits a disk of more than 203 cylinders by head over its first 203, as real disks do", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "400");
            await runDisk("partition", "--add", "ldos-5.3", "--heads", "1");
            await runDisk("partition", "--add", "ldos-5.3", "--heads", "1");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 203x1", "HARDB at 0/1 203x1"]);

            // The free space is the other heads over the same cylinders, and a new one must have those.
            const listing = await runDisk("partition");
            expect(listing[2]).to.contain("cylinders 0-202, heads 2-3  free (2 heads)");
            const wrong = await runDiskExpectingError("partition", "--add", "ldos-5.3", "--heads", "1", "--cylinders", "100");
            expect(wrong.message).to.contain("each have 203 cylinders");
        });

        it("lets the first partition by head have fewer cylinders, but no fewer than a partition has", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "100");
            await runDisk("partition", "--add", "ldos-5.3", "--heads", "1", "--cylinders", "50");
            await runDisk("partition", "--add", "ldos-5.3", "--heads", "2");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 50x1", "HARDB at 0/1 50x2"]);

            await runDisk("create", "--heads", "4", "--cylinders", "20", "--force");
            const small = await runDiskExpectingError("partition", "--add", "ldos-5.3", "--heads", "1");
            expect(small.message).to.contain("this disk has 20 cylinders");
        });

        it("refuses when the existing partitions follow neither kind of split, and says so in the listing", async () => {
            // A 2-head partition that doesn't use all the heads, and a partition on all heads that doesn't use
            // all the cylinders.
            const hardDisk = makeBlankHdvHardDisk({heads: 4, cylinders: 120});
            const options = {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 50, heads: 2};
            expect(formatLdosPartition(hardDisk, options)).to.equal(undefined);
            expect(formatLdosPartition(hardDisk, {...options, startCylinder: 60, heads: 4, cylinders: 40, name: "OTHER"}))
                .to.equal(undefined);
            fs.writeFileSync(imagePathname, hardDisk.binary);
            expect(partitionsOnDisk()).to.eql(["HARD at 0/0 50x2", "OTHER at 60/0 40x4"]);

            const error = await runDiskExpectingError("partition", "--add", "ldos-5.3");
            expect(error.message).to.contain("Can't work out the free space");
            const listing = await runDisk("partition");
            expect(listing.length).to.equal(3);
            expect(listing[2]).to.contain("neither a split by cylinder nor by head");
        });

        it("refuses to format over space that isn't blank, unless --force", async () => {
            await runDisk("create", "--heads", "2", "--cylinders", "100");
            // Put some data where the partition would go.
            const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
            hardDisk.writeSector(10, 1, 5, new Uint8Array(256).fill(0x5A));
            fs.writeFileSync(imagePathname, hardDisk.binary);

            const error = await runDiskExpectingError("partition", "--add", "ldos-5.3");
            expect(error.message).to.contain("isn't blank");
            expect(error.message).to.contain("use --force");
            expect(partitionsOnDisk()).to.eql([]);

            await runDisk("partition", "--add", "ldos-5.3", "--force");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 100x2"]);
        });

        it("can be undone", async () => {
            const session = DiskSession.open(imagePathname);
            await runLine(session, "create --heads 2 --cylinders 100");
            expect(session.getPartitions().length).to.equal(0);
            await runLine(session, "partition --add ldos-5.3 --cylinders 50");
            await runLine(session, "partition --add ldos-5.3 --cylinders 50");
            expect(session.getPartitions().length).to.equal(2);

            const undone = await runLine(session, "undo");
            expect(undone[0]).to.contain("partition ldos-5.3 --add --cylinders 50");
            expect(session.getPartitions().length).to.equal(1);
            await runLine(session, "redo");
            expect(session.getPartitions().length).to.equal(2);
            await runLine(session, "undo");
            await runLine(session, "undo");
            expect(session.getPartitions().length).to.equal(0);
            session.abort();
        });

        it("refuses a write-protected image without --force, and writes it with --force", async () => {
            const hardDisk = makeBlankHdvHardDisk({heads: 2, cylinders: 100});
            hardDisk.binary[7] = 0x80;
            fs.writeFileSync(imagePathname, hardDisk.binary);

            const error = await runDiskExpectingError("partition", "--add", "ldos-5.3");
            expect(error.message).to.contain("write-protect flag is set");
            expect(error.message).to.contain("--force");
            expect(partitionsOnDisk()).to.eql([]);

            await runDisk("partition", "--add", "ldos-5.3", "--force");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 100x2"]);
            // The saved image keeps its flag.
            expect(fs.readFileSync(imagePathname)[7]).to.equal(0x80);
        });

        it("refuses --add with --delete, and its options without --add", async () => {
            await runDisk("create", "--heads", "2", "--cylinders", "100");
            expect((await runDiskExpectingError("partition", "--add", "--delete", "ldos-5.3")).message)
                .to.contain("can't be used together");
            expect((await runDiskExpectingError("partition", "--cylinders", "50")).message)
                .to.contain("--cylinders only applies with --add");
            expect((await runDiskExpectingError("partition", "--force")).message)
                .to.contain("--force only applies with --add or --delete");
        });

        it("adds to a floppy's refusal and a missing disk", async () => {
            const floppy = path.join(dir, "floppy.jv1");
            fs.writeFileSync(floppy, makeTrsdos23TestDisk([]).binary);
            await expect(runDiskOn(floppy, "partition", "--add", "ldos-5.3")).rejects.toThrow("floppy, which has no partitions");
            await expect(runDisk("partition", "--add", "ldos-5.3")).rejects.toThrow("use \"create\" to make it");
        });
    });

    describe("partition --delete", () => {
        it("deletes the named partition, freeing its space and renumbering the rest", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "210", "--partitions", "3");
            const lines = await runDisk("partition", "--delete", "1");
            expect(lines[0]).to.equal("Deleted partition 1 (HARDA). Its space (cylinders 0-69, heads 0-1) is free. " +
                "The partitions after it are renumbered.");
            expect(partitionsOnDisk()).to.eql(["HARDB at 70/0 70x2", "HARDC at 140/0 70x2"]);

            const listing = await runDisk("partition");
            expect(listing.length).to.equal(3);
            expect(listing[0]).to.contain("HARDB");
            expect(listing[2]).to.contain("cylinders 0-69, heads 0-1  free");

            // The freed space is where the next partition goes, and gets the freed name.
            await runDisk("partition", "--add", "ldos-5.3");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 70x2", "HARDB at 70/0 70x2", "HARDC at 140/0 70x2"]);
        });

        it("deletes by name, ignoring case, and the last partition makes the disk empty", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "70");
            const lines = await runDisk("partition", "--delete", "harda");
            expect(lines[0]).to.contain("Deleted partition 1 (HARDA).");
            expect(lines[0]).not.to.contain("renumbered");
            expect(partitionsOnDisk()).to.eql([]);
            const binary = new Uint8Array(fs.readFileSync(imagePathname));
            expect(binary.subarray(HEADER_SIZE).every(byte => byte === 0)).to.equal(true);
        });

        it("deletes the selected partition when none is named, and deselects it", async () => {
            const session = DiskSession.open(imagePathname);
            await runLine(session, "create ldos-5.3 --heads 2 --cylinders 140 --partitions 2");
            expect(session.selectedPartitionNumber).to.equal(undefined);
            await runLine(session, "partition 2");
            expect(session.selectedPartitionNumber).to.equal(2);

            const lines = await runLine(session, "partition --delete");
            expect(lines[0]).to.contain("Deleted partition 2 (HARDB).");
            expect(session.getPartitions().length).to.equal(1);
            // One partition is left, which a disk uses without being told.
            expect(session.selectedPartitionNumber).to.equal(1);
            session.abort();
        });

        it("keeps another partition selected when the selected one isn't deleted", async () => {
            const session = DiskSession.open(imagePathname);
            await runLine(session, "create ldos-5.3 --heads 2 --cylinders 210 --partitions 3");
            await runLine(session, "partition 3");
            await runLine(session, "partition --delete 1");
            expect(session.getPartitions().length).to.equal(2);
            expect(session.selectedPartitionNumber).to.equal(2);
            expect(session.selectedPartitionName).to.equal("HARDC");
            session.abort();
        });

        it("says no partition is selected, when none is and none is named", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "140", "--partitions", "2");
            const error = await runDiskExpectingError("partition", "--delete");
            expect(error.message).to.contain("No partition is selected");
        });

        it("needs --force for a partition with files", async () => {
            const hostPathname = makeHostFile("A.DAT", 1000);
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "70", ":", "add", hostPathname, "--binary");
            const error = await runDiskExpectingError("partition", "--delete", "1");
            expect(error.message).to.equal("The partition 1 (HARDA) has 1 file; use --force to delete it.");
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 70x2"]);

            await runDisk("partition", "--delete", "1", "--force");
            expect(partitionsOnDisk()).to.eql([]);
        });
    });

    describe("format", () => {
        it("formats the chosen partition again in the same place, keeping its name", async () => {
            const hostPathname = makeHostFile("A.DAT", 4000);
            await runDisk("create", "lsdos-6.3", "--heads", "3", "--cylinders", "140", "--partitions", "2", ":",
                "partition", "2", ":", "add", hostPathname, "--binary");
            expect(DiskSession.open(imagePathname, {partition: "2"}).getInputFiles(false).length).to.equal(1);

            const error = await runDiskExpectingError("partition", "2", ":", "format");
            expect(error.message).to.contain("format would erase 1 file from partition 2 (HARDB)");
            expect(error.message).to.contain("--force");

            const lines = await runDisk("partition", "2", ":", "format", "--force");
            expect(lines.some(line => line.startsWith("Formatted partition 2 (HARDB) as an empty LS-DOS 6.3 partition"))).to.equal(true);
            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 70x3", "HARDB at 70/0 70x3"]);
            const second = DiskSession.open(imagePathname, {partition: "2"});
            expect(second.getInputFiles(false)).to.eql([]);
            expect(second.getFreeSpaceText()).to.contain("granules");
        });

        it("can change the DOS, name and date", async () => {
            await runDisk("create", "lsdos-6.3", "--heads", "1", "--cylinders", "100");
            const lines = await runDisk("format", "ldos-5.3", "--name", "newname", "--date", "1984-02-03", "--model", "1");
            expect(lines[0]).to.contain("as an empty LDOS 5.3 partition");
            const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
            const found = findLdosPartitions(hardDisk);
            expect(found.map(f => f.diskName)).to.eql(["NEWNAME"]);
            expect(found[0].trsdos.nameAndVersion).to.equal("LDOS 5.3");
            expect(String.fromCharCode(...hardDisk.readSector(50, 0, 0)!.subarray(0xD8, 0xE0))).to.equal("02/03/84");
        });

        it("keeps its granules per cylinder", async () => {
            await runDisk("create", "--heads", "4", "--cylinders", "100");
            await runDisk("partition", "--add", "lsdos-6.3", "--granules", "4");
            await runDisk("format");
            const hardDisk = decodeHdvHardDisk(new Uint8Array(fs.readFileSync(imagePathname)))!;
            expect(findLdosPartitions(hardDisk)[0].trsdos.granulesPerLump).to.equal(4);
        });

        it("refuses options that don't apply, DOSes that hard disks don't have, and no chosen partition", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "2", "--cylinders", "140", "--partitions", "2");
            expect((await runDiskExpectingError("format")).message).to.contain("2 partitions");
            for (const option of [["--cylinders", "80"], ["--sides", "2"], ["--density", "single"]]) {
                const error = await runDiskExpectingError("partition", "1", ":", "format", ...option);
                expect(error.message, option[0]).to.contain(option[0] + " doesn't apply to a hard disk");
            }
            const trsdos = await runDiskExpectingError("partition", "1", ":", "format", "trsdos-6.2");
            expect(trsdos.message).to.contain("can't be formatted on a hard disk");

            await runDisk("create", "--heads", "2", "--cylinders", "100", "--force");
            expect((await runDiskExpectingError("format")).message).to.contain("no partitions");
        });

        it("refuses a write-protected image without --force", async () => {
            await runDisk("create", "ldos-5.3", "--heads", "1", "--cylinders", "100");
            const binary = new Uint8Array(fs.readFileSync(imagePathname));
            binary[7] = 0x80;
            fs.writeFileSync(imagePathname, binary);

            const error = await runDiskExpectingError("format");
            expect(error.message).to.contain("write-protect");
            await runDisk("format", "--force");
        });
    });

    describe("save and reopen", () => {
        it("keeps the new partitions, and a file added to one", async () => {
            const hostPathname = makeHostFile("HELLO.BIN", 6000);
            await runDisk("create", "--heads", "2", "--cylinders", "200", ":",
                "partition", "--add", "lsdos-6.3", "--cylinders", "100", ":",
                "partition", "--add", "ldos-5.3", ":",
                "partition", "1", ":", "add", hostPathname, "--binary");

            expect(partitionsOnDisk()).to.eql(["HARDA at 0/0 100x2", "HARDB at 100/0 100x2"]);
            const reopened = DiskSession.open(imagePathname, {partition: "HARDA"});
            expect(reopened.getInputFiles(false).map(f => f.filename)).to.eql(["HELLO.BIN"]);
            expect(reopened.getInputFiles(false)[0].binary).to.eql(new Uint8Array(fs.readFileSync(hostPathname)));
            const dir = await runDisk("partition");
            expect(dir[0]).to.contain("1 file");
            expect(dir[1]).to.contain("0 files");
        });

        it("makes images that the library's blank disk reads back the same", async () => {
            await runDisk("create", "lsdos-6.3", "--heads", "1", "--cylinders", "100");
            const fromFile = new Uint8Array(fs.readFileSync(imagePathname));
            expect(fromFile.subarray(0, 3)).to.eql(new Uint8Array([0x56, 0xCB, 0x10]));
            expect(decodeHdvHardDisk(fromFile)!.getGeometry().cylinderCount).to.equal(100);
        });
    });
});
