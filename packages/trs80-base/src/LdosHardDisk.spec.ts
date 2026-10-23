import {describe, expect, it} from "vitest";
import {decodeHdvHardDisk, HdvHardDisk} from "./HdvHardDisk.js";
import {findLdosPartitions, makeDirectoryNames} from "./LdosHardDisk.js";
import {hashForFilename} from "./Trsdos.js";

const HEADER_SIZE = 256;
const SECTORS_PER_TRACK = 32;

/**
 * Make an HDV of 0xE5 filler with the given geometry. The caller fills in the partitions.
 */
function makeBlankHdv(cylinderCount: number, headCount: number): Uint8Array {
    const binary = new Uint8Array(HEADER_SIZE + cylinderCount*headCount*SECTORS_PER_TRACK*256);
    binary.fill(0xE5, HEADER_SIZE);
    binary.set([0x56, 0xCB, 0x10, 0x00, 1, 4, 0, 0, 0]);
    binary[29] = (headCount*SECTORS_PER_TRACK) & 0xFF;
    return binary;
}

/**
 * Describes a partition to write into an HDV.
 */
interface PartitionSpec {
    cylinderOffset: number;
    headOffset: number;
    cylinderCount: number;
    headCount: number;
    granulesPerCylinder: number;
    // Relative to the partition.
    dirCylinder: number;
    name: string;
    // The byte at GAT 0xCB.
    version: number;
    // Whether to write the media data block.
    mediaData: boolean;
    // The text of the partition's one user file, HELLO/TXT.
    fileText: string;
}

const DEFAULT_SPEC: PartitionSpec = {
    cylinderOffset: 0,
    headOffset: 0,
    cylinderCount: 40,
    headCount: 2,
    granulesPerCylinder: 8,
    dirCylinder: 20,
    name: "TESTPART",
    version: 0x63,
    mediaData: true,
    fileText: "HELLO WORLD",
};

/**
 * The bytes of sector "sector" of logical cylinder "cylinder" of the partition, in the HDV. This
 * deliberately doesn't use HardDiskPartition, which is being tested.
 */
function logicalSector(binary: Uint8Array, diskHeads: number, spec: PartitionSpec, cylinder: number,
                       sector: number): Uint8Array {

    const physicalCylinder = spec.cylinderOffset + cylinder;
    const head = spec.headOffset + Math.floor(sector/SECTORS_PER_TRACK);
    const index = (physicalCylinder*diskHeads + head)*SECTORS_PER_TRACK + sector % SECTORS_PER_TRACK;
    return binary.subarray(HEADER_SIZE + index*256, HEADER_SIZE + (index + 1)*256);
}

/**
 * Writes the text into the bytes, padded with spaces on the right.
 */
function writePadded(bytes: Uint8Array, offset: number, text: string, length: number): void {
    for (let i = 0; i < length; i++) {
        bytes[offset + i] = i < text.length ? text.charCodeAt(i) : 0x20;
    }
}

/**
 * Writes a directory entry for a file into a directory sector.
 */
function writeDirEntry(sector: Uint8Array, entryIndex: number, flags: number, filename: string,
                       sectorCount: number, lastSectorSize: number, extents: [number, number][]): void {

    const entry = sector.subarray(entryIndex*32, (entryIndex + 1)*32);
    entry.fill(0);
    entry[0] = flags;
    entry[1] = 3;
    entry[2] = (15 << 3) | 2;
    entry[3] = lastSectorSize;
    entry[4] = 0;
    writePadded(entry, 5, filename, 11);
    // The blank password hash.
    entry.set([0x96, 0x42, 0x96, 0x42], 16);
    entry[20] = sectorCount & 0xFF;
    entry[21] = sectorCount >> 8;
    entry.fill(0xFF, 22, 32);
    extents.forEach(([cylinder, granuleByte], i) => {
        entry[22 + i*2] = cylinder;
        entry[23 + i*2] = granuleByte;
    });
}

/**
 * Write an LDOS partition into the HDV: a boot sector, a GAT, a HIT, and directory entries for BOOT/SYS,
 * DIR/SYS, and a one-granule file HELLO/TXT.
 */
function writePartition(binary: Uint8Array, diskHeads: number, spec: PartitionSpec): void {
    const span = spec.headCount*SECTORS_PER_TRACK;
    const sectorsPerGranule = span/spec.granulesPerCylinder;
    const sector = (cylinder: number, s: number) => logicalSector(binary, diskHeads, spec, cylinder, s);

    sector(0, 0).set([0x00, 0xFE, spec.dirCylinder]);

    const gat = sector(spec.dirCylinder, 0);
    gat.fill(0);
    gat[0] = 0x01;
    gat[spec.dirCylinder] = 0xFF;
    gat[spec.dirCylinder + 1] = 0x01;
    gat[0xCB] = spec.version;
    gat[0xCC] = spec.cylinderCount - 35;
    gat[0xCD] = (spec.granulesPerCylinder - 1) | 0x80;
    writePadded(gat, 0xD0, spec.name, 8);
    writePadded(gat, 0xD8, "01/01/90", 8);
    if (spec.mediaData) {
        gat.set([0x03, 0x52, 0x53, 0x48], 0xF5);
        gat[0xF9] = 0x0C | (spec.cylinderOffset >> 8);
        gat[0xFA] = 0x10 | spec.headOffset;
        gat[0xFB] = spec.cylinderOffset & 0xFF;
        gat[0xFC] = spec.cylinderCount - 1;
        gat[0xFD] = ((spec.headCount - 1) << 5) | (SECTORS_PER_TRACK - 1);
        gat[0xFE] = ((spec.granulesPerCylinder - 1) << 5) | (sectorsPerGranule - 1);
        gat[0xFF] = spec.dirCylinder;
    }

    // The first directory entry sector is logical sector 2, after the GAT and the HIT.
    const firstEntrySector = sector(spec.dirCylinder, 2);
    const secondEntrySector = sector(spec.dirCylinder, 3);
    firstEntrySector.fill(0);
    secondEntrySector.fill(0);
    writeDirEntry(firstEntrySector, 0, 0x58, "BOOT    SYS", 1, 0, [[0, 0]]);
    writeDirEntry(secondEntrySector, 0, 0x58, "DIR     SYS", span, 0,
        [[spec.dirCylinder, spec.granulesPerCylinder - 1]]);
    writeDirEntry(firstEntrySector, 2, 0x10, "HELLO   TXT", 1, spec.fileText.length, [[spec.dirCylinder + 1, 0]]);

    const hit = sector(spec.dirCylinder, 1);
    hit.fill(0);
    hit[0] = hashForFilename("BOOT    SYS");
    hit[1] = hashForFilename("DIR     SYS");
    hit[(2 << 5) | 0] = hashForFilename("HELLO   TXT");

    const fileSector = sector(spec.dirCylinder + 1, 0);
    for (let i = 0; i < spec.fileText.length; i++) {
        fileSector[i] = spec.fileText.charCodeAt(i);
    }
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
        const first: PartitionSpec = {...DEFAULT_SPEC, name: "FIRST", fileText: "HELLO WORLD"};
        const second: PartitionSpec = {...DEFAULT_SPEC, name: "SECOND", cylinderOffset: 40, mediaData: false,
            fileText: "SECOND FILE"};
        writePartition(binary, 2, first);
        writePartition(binary, 2, second);

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
            name: "HEAD" + head, fileText: "FILE " + head,
        }));
        for (const spec of specs) {
            writePartition(binary, 3, spec);
        }

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
