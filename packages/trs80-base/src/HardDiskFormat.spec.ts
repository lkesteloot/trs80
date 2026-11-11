import {describe, expect, it} from "vitest";
import {SectorPosition} from "./FloppyDisk.js";
import {
    defaultGranulesPerCylinder, erasePartition, formatLdosPartition, type LdosPartitionOptions, makeBlankHdvHardDisk,
} from "./HardDiskFormat.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {decodeHdvHardDisk, type HdvHardDisk} from "./HdvHardDisk.js";
import {findLdosPartitions} from "./LdosHardDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {hashTrsdosPassword} from "./Trsdos.js";
import {parseTrsdosFilename} from "./TrsdosFilename.js";
import {TrsdosFormatDos} from "./TrsdosFormat.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {decodeTrsdosOnOverlay, TrsdosWriter} from "./TrsdosWriter.js";

const HEADER_SIZE = 256;
const SECTOR_SIZE = 256;

/**
 * A fixed date, so that the tests' GAT dates are known.
 */
const DATE = new Date(2026, 10, 8);
const DATE_TEXT = "11/08/26";

/**
 * Make a blank disk for a test.
 */
function makeDisk(heads: number, cylinders: number): HdvHardDisk {
    return makeBlankHdvHardDisk({heads, cylinders, date: DATE});
}

/**
 * Format a partition that the test knows is good, with a fixed date.
 */
function format(disk: HdvHardDisk, options: LdosPartitionOptions): void {
    const message = formatLdosPartition(disk, {date: DATE, ...options});
    expect(message).to.equal(undefined);
}

/**
 * The partition's logical sector, as a copy.
 */
function read(partition: HardDiskPartition, cylinder: number, sector: number): Uint8Array {
    return new Uint8Array(partition.readSector(SectorPosition.make(cylinder, 0, sector))!.data);
}

/**
 * The bytes of a string.
 */
function ascii(text: string): number[] {
    return Array.from(text, c => c.charCodeAt(0));
}

describe("makeBlankHdvHardDisk", () => {
    it("makes a full-size image with the header's fields", () => {
        const disk = makeDisk(6, 840);
        const binary = disk.binary;
        expect(binary.length).to.equal(HEADER_SIZE + 840*6*32*SECTOR_SIZE);

        expect(Array.from(binary.subarray(0, 3))).to.eql([0x56, 0xCB, 0x10]);
        expect(binary[4]).to.equal(1);
        expect(binary[5]).to.equal(4);
        expect(binary[6]).to.equal(0);
        expect(binary[7]).to.equal(0);
        expect(binary[8]).to.equal(0);
        expect(binary[11]).to.equal(0);
        expect(Array.from(binary.subarray(12, 15))).to.eql([11, 8, 126]);
        expect(binary[26]).to.equal(6);
        expect(binary[27]).to.equal(840 >> 8);
        expect(binary[28]).to.equal(840 & 0xFF);
        expect(binary[29]).to.equal(192);
        expect(binary[30]).to.equal(8);
        expect(binary[31]).to.equal(1);

        let sum = 0;
        for (let i = 0; i < 32; i++) {
            if (i !== 3) {
                sum += binary[i];
            }
        }
        expect(binary[3]).to.equal((sum & 0xFF) ^ 0x4C);

        // Everything after the header is zero.
        expect(binary.subarray(HEADER_SIZE).every(byte => byte === 0)).to.equal(true);
    });

    it("decodes as the same disk, and the header's cylinder count is the one asked for", () => {
        const disk = makeDisk(4, 203);
        const decoded = decodeHdvHardDisk(new Uint8Array(disk.binary))!;
        expect(decoded.getGeometry().cylinderCount).to.equal(203);
        expect(decoded.getGeometry().headCount).to.equal(4);
        expect(disk.getGeometry()).to.eql(decoded.getGeometry());
        expect(disk.isWriteProtected()).to.equal(false);
        expect(findLdosPartitions(disk)).to.eql([]);
    });

    it("writes 0 for the sectors per cylinder of an 8-head disk, and the high bits of the cylinders", () => {
        const disk = makeDisk(8, 1023);
        expect(disk.binary[29]).to.equal(0);
        expect(disk.binary[27]).to.equal(3);
        expect(disk.binary[28]).to.equal(255);
        expect(disk.getGeometry().headCount).to.equal(8);
        expect(disk.getGeometry().cylinderCount).to.equal(1023);
    });

    it("refuses heads and cylinders out of range", () => {
        expect(() => makeDisk(0, 100)).to.throw("1 to 8 heads");
        expect(() => makeDisk(9, 100)).to.throw("1 to 8 heads");
        expect(() => makeDisk(2, 0)).to.throw("1 to 1023 cylinders");
        expect(() => makeDisk(2, 1024)).to.throw("1 to 1023 cylinders");
        expect(() => makeDisk(2.5, 100)).to.throw("heads");
    });
});

describe("defaultGranulesPerCylinder", () => {
    it("follows the rule for 1 to 8 heads", () => {
        const expected = [
            // heads, granules per cylinder, sectors per granule.
            [1, 8, 4], [2, 8, 8], [3, 6, 16], [4, 8, 16], [5, 5, 32], [6, 6, 32], [7, 7, 32], [8, 8, 32],
        ];
        for (const [heads, granulesPerCylinder, sectorsPerGranule] of expected) {
            expect(defaultGranulesPerCylinder(heads)).to.eql({granulesPerCylinder, sectorsPerGranule});
        }
    });
});

describe("formatLdosPartition", () => {
    it("writes a 1-head LS-DOS partition at head 2 the way the real formatter does", () => {
        const disk = makeDisk(4, 203);
        format(disk, {
            dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 2, cylinders: 203, heads: 1, name: "m4lsdosc",
        });

        const partition = new HardDiskPartition(disk, 0, 2, 203, 1);
        const gat = read(partition, 101, 0);
        expect(Array.from(gat.subarray(0xCB, 0xD0))).to.eql([0x63, 0xA8, 0x8F, 0xE0, 0x42]);
        expect(Array.from(gat.subarray(0xD0, 0xD8))).to.eql(ascii("M4LSDOSC"));
        expect(Array.from(gat.subarray(0xD8, 0xE0))).to.eql(ascii(DATE_TEXT));
        expect(gat.subarray(0xE0, 0xF5).every(byte => byte === 0)).to.equal(true);
        expect(Array.from(gat.subarray(0xF5))).to.eql([0x03, 0x52, 0x53, 0x48, 0x0C, 0x12, 0x00, 0xCA, 0x1F, 0xE3, 0x65]);

        // The allocation bytes: free everywhere, the boot granule and the directory cylinder used,
        // and nothing past the partition's end.
        expect(gat[0]).to.equal(0x01);
        expect(gat[1]).to.equal(0x00);
        expect(gat[101]).to.equal(0xFF);
        expect(gat[202]).to.equal(0x00);

        // The password hash that the default gives.
        expect(hashTrsdosPassword("PASSWORD")).to.equal(0x42E0);
    });

    it("writes a 6-head LS-DOS partition at cylinder 560 with the media data block of the real ones", () => {
        const disk = makeDisk(6, 840);
        format(disk, {
            dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 560, startHead: 0, cylinders: 140, heads: 6, name: "HARDD",
        });

        const partition = new HardDiskPartition(disk, 560, 0, 140, 6);
        const gat = read(partition, 70, 0);
        expect(Array.from(gat.subarray(0xF5))).to.eql([0x03, 0x52, 0x53, 0x48, 0x0E, 0x10, 0x30, 0x8B, 0xBF, 0xBF, 0x46]);
        expect(gat[0xCC]).to.equal(0x69);
        expect(gat[0xCD]).to.equal(0x8D);
        // 6 granules per cylinder, so the two high bits of each free byte are set.
        expect(gat[1]).to.equal(0xC0);
    });

    it("writes the system information sector, GAT copy, HIT and system entries", () => {
        const disk = makeDisk(2, 60);
        format(disk, {dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 0, cylinders: 60, heads: 2, name: "ABC"});
        const partition = new HardDiskPartition(disk, 0, 0, 60, 2);

        const systemInfo = read(partition, 0, 2);
        expect(systemInfo[0]).to.equal(0x63);
        expect(Array.from(systemInfo.subarray(0x10, 0x18))).to.eql(ascii("ABC     "));
        expect(systemInfo.subarray(1, 0x10).every(byte => byte === 0)).to.equal(true);
        expect(systemInfo.subarray(0x18).every(byte => byte === 0)).to.equal(true);

        // The copy of the GAT is the GAT.
        expect(read(partition, 0, 3)).to.eql(read(partition, 30, 0));

        const hit = read(partition, 30, 1);
        expect(Array.from(hit.subarray(0, 3))).to.eql([0xA2, 0xC4, 0x00]);
        expect(hit.subarray(2).every(byte => byte === 0)).to.equal(true);

        const bootSys = read(partition, 30, 2);
        expect(bootSys[0]).to.equal(0x5E);
        expect(Array.from(bootSys.subarray(5, 16))).to.eql(ascii("BOOT    SYS"));
        expect(Array.from(bootSys.subarray(16, 32))).to.eql(
            [0xF6, 0x37, 0, 0, 5, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        expect(bootSys.subarray(32).every(byte => byte === 0)).to.equal(true);

        const dirSys = read(partition, 30, 3);
        expect(dirSys[0]).to.equal(0x5D);
        expect(Array.from(dirSys.subarray(5, 16))).to.eql(ascii("DIR     SYS"));
        // 2 heads is 64 sectors, and DIR/SYS says 34; 8 granules per cylinder, the whole cylinder.
        expect(Array.from(dirSys.subarray(16, 32))).to.eql(
            [0xF6, 0x37, 0, 0, 34, 0, 30, 7, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        expect(read(partition, 30, 4).every(byte => byte === 0)).to.equal(true);
    });

    it("writes LDOS 5.3's version, hashes and no name in the system information sector", () => {
        const disk = makeDisk(1, 100);
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 100, heads: 1});
        const partition = new HardDiskPartition(disk, 0, 0, 100, 1);

        const systemInfo = read(partition, 0, 2);
        expect(systemInfo[0]).to.equal(0x53);
        expect(systemInfo.subarray(1).every(byte => byte === 0)).to.equal(true);
        const gat = read(partition, 50, 0);
        expect(gat[0xCB]).to.equal(0x53);
        expect(Array.from(gat.subarray(0xD0, 0xD8))).to.eql(ascii("HARD    "));
        // 1 head is 32 sectors: 34 limits to 32.
        const bootSys = read(partition, 50, 2);
        expect(Array.from(bootSys.subarray(16, 20))).to.eql([0xAE, 0x01, 0, 0]);
        expect(read(partition, 50, 3)[20]).to.equal(32);
    });

    it("clears every sector of the partition first, but nothing outside it", () => {
        const disk = makeDisk(2, 80);
        // Stale data inside and outside of the partition at cylinders 10-49, head 0.
        for (let cylinder = 0; cylinder < 80; cylinder++) {
            for (let head = 0; head < 2; head++) {
                for (let sector = 0; sector < 32; sector++) {
                    disk.writeSector(cylinder, head, sector, new Uint8Array(SECTOR_SIZE).fill(0x6D));
                }
            }
        }
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 10, startHead: 0, cylinders: 40, heads: 1});

        // Inside: a sector that the formatter doesn't write is zero. Outside: it's untouched.
        expect(disk.readSector(30, 0, 10)!.every(byte => byte === 0)).to.equal(true);
        expect(disk.readSector(10, 0, 31)!.every(byte => byte === 0)).to.equal(true);
        expect(disk.readSector(30, 1, 10)!.every(byte => byte === 0x6D)).to.equal(true);
        expect(disk.readSector(9, 0, 0)!.every(byte => byte === 0x6D)).to.equal(true);
        expect(disk.readSector(50, 0, 0)!.every(byte => byte === 0x6D)).to.equal(true);
    });

    it("uses the DOS's boot sectors, patched with the directory cylinder, or makes its own", () => {
        const disk = makeDisk(1, 80);
        const first = new Uint8Array(SECTOR_SIZE).fill(0x11);
        const second = new Uint8Array(SECTOR_SIZE).fill(0x22);
        format(disk, {
            dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 40, heads: 1,
            bootSectors: [first, second],
        });
        expect(Array.from(disk.readSector(0, 0, 0)!.subarray(0, 4))).to.eql([0x11, 0x11, 20, 0x11]);
        expect(Array.from(disk.readSector(0, 0, 1)!.subarray(0, 4))).to.eql([0x22, 0x22, 20, 0x22]);
        // The caller's sectors weren't changed.
        expect(first[2]).to.equal(0x11);

        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 40, startHead: 0, cylinders: 40, heads: 1});
        const synthetic = disk.readSector(40, 0, 0)!;
        expect(Array.from(synthetic.subarray(0, 3))).to.eql([0x00, 0xFE, 20]);
        expect(disk.readSector(40, 0, 1)).to.eql(synthetic);
    });

    it("is found by findLdosPartitions with the layout it was given, split by cylinder", () => {
        const disk = makeDisk(6, 420);
        format(disk, {dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 0, cylinders: 140, heads: 6, name: "HARDA"});
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 140, startHead: 0, cylinders: 140, heads: 6, name: "HARDB"});
        format(disk, {dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 280, startHead: 0, cylinders: 140, heads: 6, name: "HARDC"});

        const found = findLdosPartitions(disk);
        expect(found.map(f => f.diskName)).to.eql(["HARDA", "HARDB", "HARDC"]);
        expect(found.map(f => f.partition.cylinderOffset)).to.eql([0, 140, 280]);
        for (const {partition, trsdos} of found) {
            expect(partition.cylinderCount).to.equal(140);
            expect(partition.headCount).to.equal(6);
            expect(partition.headOffset).to.equal(0);
            expect(trsdos.dirLumpNumber).to.equal(70);
            expect(trsdos.granulesPerLump).to.equal(6);
            expect(trsdos.sectorsPerGranule).to.equal(32);
            expect(trsdos.getDirEntries(false)).to.eql([]);
        }
        expect(found[0].trsdos.nameAndVersion).to.equal("LS-DOS 6.3");
        expect(found[1].trsdos.nameAndVersion).to.equal("LDOS 5.3");
    });

    it("is found by findLdosPartitions split by head", () => {
        const disk = makeDisk(4, 203);
        for (let head = 0; head < 4; head++) {
            format(disk, {
                dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: head, cylinders: 203, heads: 1,
                name: "HEAD" + head,
            });
        }

        const found = findLdosPartitions(disk);
        expect(found.map(f => f.diskName)).to.eql(["HEAD0", "HEAD1", "HEAD2", "HEAD3"]);
        expect(found.map(f => f.partition.headOffset)).to.eql([0, 1, 2, 3]);
        for (const {partition, trsdos} of found) {
            expect(partition.cylinderOffset).to.equal(0);
            expect(partition.cylinderCount).to.equal(203);
            expect(partition.headCount).to.equal(1);
            expect(trsdos.dirLumpNumber).to.equal(101);
            expect(trsdos.granulesPerLump).to.equal(8);
        }
    });

    it("lets TrsdosWriter add a file, which reads back", () => {
        const disk = makeDisk(2, 60);
        format(disk, {dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 0, cylinders: 60, heads: 2});
        const found = findLdosPartitions(disk)[0];

        const contents = new Uint8Array(20000).map((_, i) => (i*7 + 3) & 0xFF);
        const filename = parseTrsdosFilename("DATA/BIN");
        if (typeof filename === "string") {
            throw new Error(filename);
        }
        const overlay = new SectorOverlay(found.partition);
        const trsdos = decodeTrsdosOnOverlay(overlay, found.trsdos)!;
        const writer = new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_6);
        writer.addFile(filename, contents);
        writer.flush();
        overlay.commit();

        const again = findLdosPartitions(disk)[0].trsdos;
        expect(again.getDirEntries(false).map(entry => entry.getFilename("/"))).to.eql(["DATA/BIN"]);
        expect(again.readFile(again.findFile("DATA/BIN")!)).to.eql(contents);
    });

    it("refuses what it can't do, and writes nothing", () => {
        const disk = makeDisk(4, 203);
        const before = new Uint8Array(disk.binary);
        const base: LdosPartitionOptions = {
            dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 100, heads: 2,
        };
        const refusals: [Partial<LdosPartitionOptions>, string][] = [
            [{dos: TrsdosFormatDos.TRSDOS_2_3},
                "trsdos-2.3 can't be formatted on a hard disk. The DOSes that work are ldos-5.3 and lsdos-6.3."],
            [{dos: TrsdosFormatDos.TRSDOS_1_3}, "can't be formatted on a hard disk"],
            [{dos: TrsdosFormatDos.TRSDOS_6_2}, "can't be formatted on a hard disk"],
            [{cylinders: 34}, "35 to 203 cylinders"],
            [{cylinders: 204}, "35 to 203 cylinders"],
            [{heads: 0}, "1 to 8 heads"],
            [{heads: 9}, "1 to 8 heads"],
            [{startCylinder: 1024}, "starts at a cylinder"],
            [{startCylinder: 150}, "doesn't fit"],
            [{startHead: 3}, "doesn't fit"],
            [{granulesPerCylinder: 0}, "granules"],
            [{granulesPerCylinder: 9}, "granules"],
            [{granulesPerCylinder: 5}, "a divisor of 64"],
            // 4 heads in 1 granule would be 128 sectors.
            [{heads: 4, granulesPerCylinder: 2}, "at most 32"],
            [{name: "1ABC"}, "Invalid disk name"],
            [{name: "TOOLONGNAME"}, "Invalid disk name"],
            [{masterPassword: "bad pass"}, "Invalid password"],
            [{bootSectors: [new Uint8Array(256)]}, "2 boot sectors"],
            [{bootSectors: [new Uint8Array(256), new Uint8Array(100)]}, "256 bytes"],
        ];
        for (const [change, text] of refusals) {
            const message = formatLdosPartition(disk, {...base, ...change});
            expect(message, JSON.stringify(change)).to.be.a("string");
            expect(message, JSON.stringify(change)).to.contain(text);
        }
        expect(new Uint8Array(disk.binary)).to.eql(before);
    });

    it("refuses a write-protected disk", () => {
        const disk = makeDisk(1, 60);
        disk.binary[7] = 0x80;
        const protectedDisk = decodeHdvHardDisk(disk.binary)!;
        const message = formatLdosPartition(protectedDisk, {
            dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 40, heads: 1,
        });
        expect(message).to.contain("write-protected");
    });

    it("accepts the granules per cylinder of Tandy's installer", () => {
        const disk = makeDisk(4, 100);
        format(disk, {
            dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 0, cylinders: 100, heads: 4,
            granulesPerCylinder: 8,
        });
        const found = findLdosPartitions(disk)[0];
        expect(found.trsdos.granulesPerLump).to.equal(8);
        expect(found.trsdos.sectorsPerGranule).to.equal(16);

        format(disk, {
            dos: TrsdosFormatDos.LSDOS_6_3, startCylinder: 0, startHead: 0, cylinders: 100, heads: 4,
            granulesPerCylinder: 4,
        });
        const again = findLdosPartitions(disk)[0];
        expect(again.trsdos.granulesPerLump).to.equal(4);
        expect(again.trsdos.sectorsPerGranule).to.equal(32);
    });
});

describe("erasePartition", () => {
    it("zeros the partition so that it's no longer found, and leaves its neighbors", () => {
        const disk = makeDisk(2, 120);
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 60, heads: 2, name: "ONE"});
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 60, startHead: 0, cylinders: 60, heads: 2, name: "TWO"});
        expect(findLdosPartitions(disk).length).to.equal(2);

        const [first] = findLdosPartitions(disk);
        erasePartition(first.partition);

        const found = findLdosPartitions(disk);
        expect(found.map(f => f.diskName)).to.eql(["TWO"]);
        const binary = disk.binary;
        const firstEnd = HEADER_SIZE + 60*2*32*SECTOR_SIZE;
        expect(binary.subarray(HEADER_SIZE, firstEnd).every(byte => byte === 0)).to.equal(true);
    });

    it("throws on a write-protected disk", () => {
        const disk = makeDisk(1, 60);
        format(disk, {dos: TrsdosFormatDos.LDOS_5_3, startCylinder: 0, startHead: 0, cylinders: 40, heads: 1});
        disk.binary[7] = 0x80;
        const protectedDisk = decodeHdvHardDisk(disk.binary)!;
        const partition = new HardDiskPartition(protectedDisk, 0, 0, 40, 1);
        expect(() => erasePartition(partition)).to.throw("write-protected");
    });
});
