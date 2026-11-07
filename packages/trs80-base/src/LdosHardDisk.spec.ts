import {describe, expect, it} from "vitest";
import {decodeHdvHardDisk, HdvHardDisk} from "./HdvHardDisk.js";
import {findLdosPartitions, makeDirectoryNames} from "./LdosHardDisk.js";
import {
    ldosTestSector, makeBlankTestHdv, type ResolvedLdosTestPartition, resolveLdosTestPartition,
    writeLdosTestPartition,
} from "./LdosTestHardDisk.js";

/**
 * Describes a partition to write into an HDV, with every field filled in.
 */
type PartitionSpec = ResolvedLdosTestPartition;

const DEFAULT_SPEC: PartitionSpec = resolveLdosTestPartition({});

/**
 * Make an HDV of 0xE5 filler with the given geometry. The caller fills in the partitions.
 */
function makeBlankHdv(cylinderCount: number, headCount: number): Uint8Array {
    return makeBlankTestHdv(cylinderCount, headCount);
}

/**
 * The bytes of a sector of the partition, in the HDV.
 */
function logicalSector(binary: Uint8Array, diskHeads: number, spec: PartitionSpec, cylinder: number,
                       sector: number): Uint8Array {

    return ldosTestSector(binary, diskHeads, spec, cylinder, sector);
}

/**
 * Write an LDOS partition into the HDV, with BOOT/SYS, DIR/SYS and the file HELLO/TXT, whose text
 * is given.
 */
function writePartition(binary: Uint8Array, diskHeads: number, spec: PartitionSpec, fileText = "HELLO WORLD"): void {
    writeLdosTestPartition(binary, diskHeads, {
        ...spec,
        files: [{name: "HELLO/TXT", contents: new TextEncoder().encode(fileText)}],
    });
}

/**
 * Decode the HDV, which the tests make well-formed.
 */
function decodeHdv(binary: Uint8Array): HdvHardDisk {
    return decodeHdvHardDisk(binary)!;
}

describe("makeDirectoryNames", () => {
    it("keeps unique names as they are", () => {
        expect(makeDirectoryNames(["HARDA", "HARDB", "LDOS-513", "VOL_1"]))
            .to.eql(["HARDA", "HARDB", "LDOS-513", "VOL_1"]);
    });

    it("adds a suffix to a name that's already taken, ignoring case", () => {
        expect(makeDirectoryNames(["HARDA", "HARDA", "hardA", "HARDB"]))
            .to.eql(["HARDA", "HARDA-2", "hardA-3", "HARDB"]);
    });

    it("skips a suffix that another partition's name already has", () => {
        expect(makeDirectoryNames(["HARDA", "HARDA-2", "HARDA"])).to.eql(["HARDA", "HARDA-2", "HARDA-3"]);
    });

    it("replaces characters that aren't safe in a directory name", () => {
        expect(makeDirectoryNames(["MY DISK", "A/B", "V.1"])).to.eql(["MY_DISK", "A_B", "V_1"]);
    });

    it("names a partition PART when its name has no letter or digit", () => {
        expect(makeDirectoryNames(["", "...", "PART", ""])).to.eql(["PART", "PART-2", "PART-3", "PART-4"]);
    });
});

describe("findLdosPartitions", () => {
    it("finds partitions split by cylinder, with and without a media data block", () => {
        const binary = makeBlankHdv(80, 2);
        const first: PartitionSpec = {...DEFAULT_SPEC, name: "FIRST"};
        const second: PartitionSpec = {...DEFAULT_SPEC, name: "SECOND", cylinderOffset: 40, mediaData: false};
        writePartition(binary, 2, first);
        writePartition(binary, 2, second, "SECOND FILE");

        const partitions = findLdosPartitions(decodeHdv(binary));
        expect(partitions.length).to.equal(2);

        const [p1, p2] = partitions;
        expect([p1.partition.cylinderOffset, p1.partition.headOffset, p1.partition.cylinderCount,
            p1.partition.headCount]).to.eql([0, 0, 40, 2]);
        expect([p2.partition.cylinderOffset, p2.partition.headOffset, p2.partition.cylinderCount,
            p2.partition.headCount]).to.eql([40, 0, 40, 2]);
        expect(p1.trsdos.nameAndVersion).to.equal("LS-DOS 6.3");
        expect(p1.trsdos.dirLumpNumber).to.equal(20);
        expect(p1.trsdos.granulesPerLump).to.equal(8);
        expect(p1.trsdos.sectorsPerGranule).to.equal(8);

        const gatInfo = p2.trsdos.getGatInfo();
        expect(typeof gatInfo === "string" ? gatInfo : gatInfo.name).to.equal("SECOND");
        expect(p2.diskName).to.equal("SECOND");
        expect(p2.directoryName).to.equal("SECOND");

        for (const [partition, text] of [[p1, "HELLO WORLD"], [p2, "SECOND FILE"]] as const) {
            const entries = partition.trsdos.getDirEntries(false);
            expect(entries.map(entry => entry.getFilename("/"))).to.eql(["HELLO/TXT"]);
            expect(new TextDecoder().decode(partition.trsdos.readFile(entries[0]))).to.equal(text);
            expect(partition.trsdos.getDirEntries(true).map(entry => entry.getFilename("/")))
                .to.eql(["BOOT/SYS", "HELLO/TXT", "DIR/SYS"]);
        }
    });

    it("finds partitions split by head", () => {
        const binary = makeBlankHdv(40, 3);
        const specs = [0, 1, 2].map((head): PartitionSpec => ({
            ...DEFAULT_SPEC, headOffset: head, headCount: 1, cylinderCount: 40, dirCylinder: 10,
            name: "HEAD" + head,
        }));
        specs.forEach((spec, head) => writePartition(binary, 3, spec, "FILE " + head));

        const partitions = findLdosPartitions(decodeHdv(binary));
        expect(partitions.map(p => p.partition.headOffset)).to.eql([0, 1, 2]);
        expect(partitions.map(p => p.trsdos.sectorsPerGranule)).to.eql([4, 4, 4]);
        for (const [i, partition] of partitions.entries()) {
            const entries = partition.trsdos.getDirEntries(false);
            expect(new TextDecoder().decode(partition.trsdos.readFile(entries[0]))).to.equal("FILE " + i);
        }
    });

    it("finds nothing on a disk of filler", () => {
        expect(findLdosPartitions(decodeHdv(makeBlankHdv(40, 2)))).to.eql([]);
    });

    it("finds nothing without a GAT at the directory cylinder", () => {
        const binary = makeBlankHdv(80, 2);
        writePartition(binary, 2, DEFAULT_SPEC);
        // Point the boot sector at a cylinder with filler.
        logicalSector(binary, 2, DEFAULT_SPEC, 0, 0)[2] = 30;
        expect(findLdosPartitions(decodeHdv(binary))).to.eql([]);
    });

    it("requires a known DOS when there's no media data block", () => {
        const binary = makeBlankHdv(80, 2);
        // A NEWDOS/80 version byte.
        writePartition(binary, 2, {...DEFAULT_SPEC, mediaData: false, version: 0x82});
        expect(findLdosPartitions(decodeHdv(binary))).to.eql([]);
    });

    it("reads DOSPLUS 3 partitions, with a granule per track", () => {
        const binary = makeBlankHdv(80, 2);
        const spec: PartitionSpec = {...DEFAULT_SPEC, mediaData: false, version: 0x35, granulesPerCylinder: 2};
        writePartition(binary, 2, spec);
        // DOSPLUS leaves the granules per cylinder at 0, and its system partition's boot sector
        // starts F3 FE. Its directory cylinder can have the high bit set.
        logicalSector(binary, 2, spec, spec.dirCylinder, 0)[0xCD] = 0x00;
        logicalSector(binary, 2, spec, 0, 0).set([0xF3, 0xFE, spec.dirCylinder | 0x80]);

        const partitions = findLdosPartitions(decodeHdv(binary));
        expect(partitions.length).to.equal(1);
        const {trsdos} = partitions[0];
        expect(trsdos.nameAndVersion).to.equal("DOSPLUS 3.5");
        expect(trsdos.granulesPerLump).to.equal(2);
        expect(trsdos.sectorsPerGranule).to.equal(32);
        const entries = trsdos.getDirEntries(false);
        expect(new TextDecoder().decode(trsdos.readFile(entries[0]))).to.equal("HELLO WORLD");
    });

    it("skips a partition whose cylinders are doubled", () => {
        const binary = makeBlankHdv(80, 2);
        writePartition(binary, 2, DEFAULT_SPEC);
        // Set DBLBIT in FLAG2 of the media data block.
        logicalSector(binary, 2, DEFAULT_SPEC, DEFAULT_SPEC.dirCylinder, 0)[0xFA] |= 0x20;
        expect(findLdosPartitions(decodeHdv(binary))).to.eql([]);
    });

    it("skips a media data block that disagrees with the partition's position", () => {
        const binary = makeBlankHdv(80, 2);
        writePartition(binary, 2, DEFAULT_SPEC);
        logicalSector(binary, 2, DEFAULT_SPEC, DEFAULT_SPEC.dirCylinder, 0)[0xFB] = 7;
        expect(findLdosPartitions(decodeHdv(binary))).to.eql([]);
    });

    it("skips a partition that overlaps an earlier one", () => {
        const binary = makeBlankHdv(80, 2);
        writePartition(binary, 2, DEFAULT_SPEC);
        // A second partition at cylinder 10, which the first one covers.
        writePartition(binary, 2, {...DEFAULT_SPEC, cylinderOffset: 10, dirCylinder: 5, name: "INSIDE"});
        const partitions = findLdosPartitions(decodeHdv(binary));
        expect(partitions.length).to.equal(1);
        expect(partitions[0].partition.cylinderOffset).to.equal(0);
    });
});
