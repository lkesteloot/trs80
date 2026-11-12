import {describe, expect, it} from "vitest";
import {Density, SectorData, SectorPosition} from "./FloppyDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {decodeHdvHardDisk} from "./HdvHardDisk.js";
import {findLdosPartitions, type LdosPartition} from "./LdosHardDisk.js";
import {
    ldosTestSector, type LdosTestPartition, makeLdosTestHardDisk, makeLdosTestHardDiskBinary,
} from "./LdosTestHardDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdosHardDiskPartition, hashForFilename, TrsdosProtectionLevel} from "./Trsdos.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {checkTrsdos, TrsdosFindingKind} from "./TrsdosCheck.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {
    evaluateTrsdosWriteGate, hardDiskWriteProtectionMessage, TrsdosWriteAccess, TrsdosWriteBlockerKind,
    unsupportedLayoutMessage,
} from "./TrsdosWriteGate.js";
import {decodeTrsdosOnOverlay, TrsdosWriter} from "./TrsdosWriter.js";
import {chooseDirSlots} from "./TrsdosDirSlots.js";

const HEADER_SIZE = 256;
const SECTOR_SIZE = 256;

/**
 * A sector's data wrapped as a SectorData at a position, for HardDiskPartition.writeSector().
 */
function sectorData(position: SectorPosition, value: number): SectorData {
    return new SectorData(new Uint8Array(SECTOR_SIZE).fill(value), position, Density.DOUBLE);
}

/**
 * The offset in an HDV file of a physical sector.
 */
function offsetOf(headCount: number, cylinder: number, head: number, sector: number): number {
    return HEADER_SIZE + ((cylinder*headCount + head)*32 + sector)*SECTOR_SIZE;
}

/**
 * Parse a filename that the test knows is good.
 */
function name(text: string): TrsdosFilename {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * The indexes of the sectors that differ between two HDV files of the same size.
 */
function changedSectors(before: Uint8Array, after: Uint8Array): number[] {
    const changed: number[] = [];
    for (let offset = HEADER_SIZE; offset < before.length; offset += SECTOR_SIZE) {
        for (let i = 0; i < SECTOR_SIZE; i++) {
            if (before[offset + i] !== after[offset + i]) {
                changed.push((offset - HEADER_SIZE)/SECTOR_SIZE);
                break;
            }
        }
    }
    return changed;
}

describe("HdvHardDisk.writeSector", () => {
    it("writes at the offset of a head-split disk", () => {
        const disk = makeLdosTestHardDisk([{headOffset: 0, headCount: 1}, {headOffset: 1, headCount: 1}]);
        const data = new Uint8Array(SECTOR_SIZE).fill(0x5A);
        disk.writeSector(7, 1, 9, data);

        const offset = offsetOf(2, 7, 1, 9);
        expect(disk.binary.subarray(offset, offset + SECTOR_SIZE)).to.eql(data);
        expect(disk.readSector(7, 1, 9)).to.eql(data);
        // The neighbors are as they were.
        expect(disk.binary[offset - 1]).not.to.equal(0x5A);
        expect(disk.binary[offset + SECTOR_SIZE]).not.to.equal(0x5A);
    });

    it("writes at the offset of a cylinder-split disk, and tells the listeners", () => {
        const disk = makeLdosTestHardDisk([{cylinderOffset: 0}, {cylinderOffset: 40}]);
        const writes: number[] = [];
        disk.onWrite.subscribe(write => writes.push(write.offset));
        disk.writeSector(50, 1, 31, new Uint8Array(SECTOR_SIZE).fill(1));
        expect(writes).to.eql([offsetOf(2, 50, 1, 31)]);
    });

    it("copies the data, so that the caller can reuse its buffer", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const data = new Uint8Array(SECTOR_SIZE).fill(2);
        disk.writeSector(3, 0, 0, data);
        data.fill(9);
        expect(disk.readSector(3, 0, 0)![0]).to.equal(2);
    });

    it("refuses a sector that isn't on the disk or is the wrong size", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const data = new Uint8Array(SECTOR_SIZE);
        expect(() => disk.writeSector(40, 0, 0, data)).to.throw("doesn't hold that sector");
        expect(() => disk.writeSector(0, 2, 0, data)).to.throw("doesn't hold that sector");
        expect(() => disk.writeSector(0, 0, 32, data)).to.throw("doesn't hold that sector");
        expect(() => disk.writeSector(0, 0, 0, new Uint8Array(10))).to.throw("10 bytes");
    });

    it("refuses the sectors that a truncated image is missing", () => {
        // Cut the last head of the last cylinder, and a bit of the one before.
        const binary = makeLdosTestHardDiskBinary([{headCount: 2}], {truncateBytes: 33*SECTOR_SIZE});
        const disk = decodeHdvHardDisk(binary)!;
        const data = new Uint8Array(SECTOR_SIZE).fill(7);
        expect(() => disk.writeSector(39, 1, 0, data)).to.throw("doesn't hold that sector");
        expect(() => disk.writeSector(39, 0, 31, data)).to.throw("doesn't hold that sector");
        disk.writeSector(39, 0, 0, data);
        expect(disk.readSector(39, 0, 0)![0]).to.equal(7);
    });

    it("refuses to write a write-protected image, until the flag is cleared in memory", () => {
        const disk = makeLdosTestHardDisk([{}], {writeProtected: true});
        expect(disk.isWriteProtected()).to.equal(true);
        expect(() => disk.writeSector(0, 0, 0, new Uint8Array(SECTOR_SIZE))).to.throw("write-protected");

        disk.clearImageWriteProtected();
        expect(disk.isWriteProtected()).to.equal(false);
        disk.writeSector(0, 0, 0, new Uint8Array(SECTOR_SIZE).fill(4));
        // The header still says write-protected.
        expect(disk.binary[7] & 0x80).to.equal(0x80);
    });
});

describe("HardDiskPartition.writeSector", () => {
    it("writes where readSector reads, with a partition split by head", () => {
        const disk = makeLdosTestHardDisk([{headOffset: 0, headCount: 1}, {headOffset: 1, headCount: 1}]);
        const partition = new HardDiskPartition(disk, 0, 1, 40, 1);
        const position = SectorPosition.make(12, 0, 5);
        partition.writeSector(position, sectorData(position, 0x33));

        expect(disk.readSector(12, 1, 5)![0]).to.equal(0x33);
        expect(partition.readSector(position)!.data[0]).to.equal(0x33);
        // Head 0 is untouched.
        expect(disk.readSector(12, 0, 5)![0]).not.to.equal(0x33);
    });

    it("writes across heads and cylinders, with a partition split by cylinder", () => {
        const disk = makeLdosTestHardDisk([{cylinderOffset: 0}, {cylinderOffset: 40, headCount: 2}]);
        const partition = new HardDiskPartition(disk, 40, 0, 40, 2);
        // Logical sector 40 is physical sector 8 of head 1.
        const position = SectorPosition.make(3, 0, 40);
        partition.writeSector(position, sectorData(position, 0x44));

        const offset = offsetOf(2, 43, 1, 8);
        expect(disk.binary[offset]).to.equal(0x44);
        expect(ldosTestSector(disk.binary, 2, {cylinderOffset: 40, headOffset: 0}, 3, 40)[0]).to.equal(0x44);
    });

    it("refuses what readSector can't read, the wrong size, and a write-protected disk", () => {
        const disk = makeLdosTestHardDisk([{}], {writeProtected: true});
        const partition = new HardDiskPartition(disk, 0, 0, 40, 2);
        const outside = SectorPosition.make(40, 0, 0);
        const secondSide = SectorPosition.make(0, 1, 0);
        const inside = SectorPosition.make(1, 0, 0);
        expect(() => partition.writeSector(outside, sectorData(outside, 1))).to.throw("no such sector");
        expect(() => partition.writeSector(secondSide, sectorData(secondSide, 1))).to.throw("no such sector");
        expect(() => partition.writeSector(inside, new SectorData(new Uint8Array(100), inside, Density.DOUBLE)))
            .to.throw("100 bytes");
        expect(partition.isWriteProtected()).to.equal(true);
        expect(() => partition.writeSector(inside, sectorData(inside, 1))).to.throw("write-protected");
    });

    it("forgets the boot track text when cylinder 0 is written", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const partition = new HardDiskPartition(disk, 0, 0, 40, 2);
        const position = SectorPosition.make(0, 0, 10);
        const text = partition.getBootTrackText();
        expect(text).not.to.contain("HARDTEXT");

        const bytes = new Uint8Array(SECTOR_SIZE);
        bytes.set(new TextEncoder().encode("HARDTEXT"));
        partition.writeSector(position, new SectorData(bytes, position, Density.DOUBLE));
        expect(partition.getBootTrackText()).to.contain("HARDTEXT");
    });
});

describe("SectorOverlay over a hard disk partition", () => {
    it("holds changes until it commits them", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const partition = new HardDiskPartition(disk, 0, 0, 40, 2);
        const overlay = new SectorOverlay(partition);
        const position = SectorPosition.make(5, 0, 40);
        const before = new Uint8Array(disk.binary);

        overlay.writeSector(position, new Uint8Array(SECTOR_SIZE).fill(0x77));
        expect(overlay.readSector(position)!.data[0]).to.equal(0x77);
        expect(disk.binary).to.eql(before);

        overlay.commit();
        expect(disk.readSector(5, 1, 8)![0]).to.equal(0x77);
        expect(overlay.hasChanges()).to.equal(false);
    });

    it("leaves the disk alone when it discards", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const partition = new HardDiskPartition(disk, 0, 0, 40, 2);
        const overlay = new SectorOverlay(partition);
        const before = new Uint8Array(disk.binary);
        const position = SectorPosition.make(5, 0, 3);
        overlay.writeSector(position, new Uint8Array(SECTOR_SIZE).fill(0x77));
        overlay.discard();
        overlay.commit();
        expect(disk.binary).to.eql(before);
        expect(overlay.readSector(position)!.data[0]).not.to.equal(0x77);
    });

    it("refuses writes to a write-protected disk, at write and at commit", () => {
        const disk = makeLdosTestHardDisk([{}]);
        const partition = new HardDiskPartition(disk, 0, 0, 40, 2);
        const overlay = new SectorOverlay(partition);
        overlay.writeSector(SectorPosition.make(5, 0, 3), new Uint8Array(SECTOR_SIZE));

        // The protection comes on after the change was made.
        const protectedDisk = makeLdosTestHardDisk([{}], {writeProtected: true});
        const protectedOverlay = new SectorOverlay(new HardDiskPartition(protectedDisk, 0, 0, 40, 2));
        expect(() => protectedOverlay.writeSector(SectorPosition.make(5, 0, 3), new Uint8Array(SECTOR_SIZE)))
            .to.throw("write-protected");
    });

    it("refuses a sector that the image doesn't hold", () => {
        const binary = makeLdosTestHardDiskBinary([{headCount: 2}], {truncateBytes: 33*SECTOR_SIZE});
        const disk = decodeHdvHardDisk(binary)!;
        const overlay = new SectorOverlay(new HardDiskPartition(disk, 0, 0, 40, 2));
        expect(() => overlay.writeSector(SectorPosition.make(39, 0, 40), new Uint8Array(SECTOR_SIZE)))
            .to.throw("no such sector");
    });
});

describe("the write gate on partitions", () => {
    /**
     * Find the first partition of a disk made from the description.
     */
    function firstPartition(partition: LdosTestPartition, options = {}): LdosPartition {
        return findLdosPartitions(makeLdosTestHardDisk([partition], options))[0];
    }

    it("lets an LS-DOS 6 partition be written, by the TRSDOS 6 rules", () => {
        const found = firstPartition({version: 0x63});
        expect(found.trsdos.nameAndVersion).to.equal("LS-DOS 6.3");
        const gate = evaluateTrsdosWriteGate(found.trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.TRSDOS_6);
    });

    it("lets an LDOS 5 partition be written, by the LDOS 5 rules", () => {
        const found = firstPartition({version: 0x53, mediaData: true});
        expect(found.trsdos.nameAndVersion).to.equal("LDOS 5.3");
        const gate = evaluateTrsdosWriteGate(found.trsdos);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.LDOS_5);
    });

    it("lets a partition with fewer than eight granules per cylinder be written", () => {
        const found = firstPartition({granulesPerCylinder: 4});
        const gate = evaluateTrsdosWriteGate(found.trsdos);
        expect(gate.blockers).to.eql([]);
    });

    it("blocks a DOSPLUS 3 partition, which can't be forced", () => {
        const found = firstPartition({version: 0x35, mediaData: false, granulesPerCylinder: 2});
        expect(found.trsdos.nameAndVersion).to.equal("DOSPLUS 3.5");
        expect(unsupportedLayoutMessage(found.trsdos, undefined)).to.contain("DOSPLUS 3");
        const gate = evaluateTrsdosWriteGate(found.trsdos);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        const blocker = gate.blockers.find(b => b.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT);
        expect(blocker?.forceable).to.equal(false);
        expect(blocker?.message).to.contain("read-only");
    });

    it("blocks LDOS rules named as DOSPLUS on a partition", () => {
        const found = firstPartition({});
        const gate = evaluateTrsdosWriteGate(found.trsdos, TrsdosRuleSet.DOSPLUS);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(gate.blockers.some(b => b.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT && !b.forceable)).to.equal(true);
    });

    it("blocks a partition of a write-protected image, which can be forced", () => {
        const found = firstPartition({}, {writeProtected: true});
        const gate = evaluateTrsdosWriteGate(found.trsdos);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(gate.blockers.map(b => b.kind)).to.eql([TrsdosWriteBlockerKind.WRITE_PROTECTED]);
        expect(gate.blockers[0].forceable).to.equal(true);
        expect(hardDiskWriteProtectionMessage(found.partition.disk)).to.contain("write-protect flag");
    });

    it("blocks a partition with more cylinders than its GAT can record", () => {
        const found = firstPartition({cylinderCount: 203, dirCylinder: 101});
        expect(evaluateTrsdosWriteGate(found.trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);

        // Pretend that it has more.
        const trsdos = found.trsdos;
        const bigger = Object.create(trsdos, {lumpCount: {value: 210}});
        expect(unsupportedLayoutMessage(bigger, undefined)).to.contain("210 cylinders");
    });

    it("applies the same rules when the file system is decoded through an overlay", () => {
        const found = firstPartition({});
        const overlay = new SectorOverlay(found.partition);
        const trsdos = decodeTrsdosOnOverlay(overlay, found.trsdos)!;
        expect(unsupportedLayoutMessage(trsdos, undefined)).to.be.undefined;
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);
    });
});

describe("TrsdosWriter on a hard disk partition", () => {
    /**
     * A disk with two partitions split by cylinder, each with 8 granules of 8 sectors per cylinder. The
     * first has a file of its own.
     */
    function makeTwoPartitions() {
        const first: LdosTestPartition = {
            name: "FIRST", cylinderOffset: 0, cylinderCount: 60, dirCylinder: 30,
            files: [
                {name: "HELLO/TXT", contents: new TextEncoder().encode("HELLO WORLD")},
                {name: "OLD/DAT", contents: new Uint8Array(5000).map((_, i) => i & 0xFF)},
            ],
        };
        const second: LdosTestPartition = {
            name: "SECOND", cylinderOffset: 60, cylinderCount: 60, dirCylinder: 30,
            files: [{name: "OTHER/TXT", contents: new TextEncoder().encode("OTHER FILE")}],
        };
        const binary = makeLdosTestHardDiskBinary([first, second]);
        const disk = decodeHdvHardDisk(binary)!;
        const partitions = findLdosPartitions(disk);
        expect(partitions.length).to.equal(2);
        return {disk, partitions, before: new Uint8Array(binary)};
    }

    /**
     * Start a writer on a partition, over an overlay.
     */
    function startWriter(found: LdosPartition) {
        const overlay = new SectorOverlay(found.partition);
        const trsdos = decodeTrsdosOnOverlay(overlay, found.trsdos)!;
        const writer = new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_6);
        return {overlay, writer};
    }

    /**
     * The GAT sector of a partition, as it is on the disk now.
     */
    function gatOf(disk: Uint8Array, found: LdosPartition): Uint8Array {
        return ldosTestSector(disk, 2, found.partition, found.trsdos.dirLumpNumber, 0);
    }

    it("adds a file of more than 32 granules, kills, renames and sets attributes, changing only the right sectors", () => {
        const {disk, partitions, before} = makeTwoPartitions();
        const [first, second] = partitions;
        const big = new Uint8Array(100000).map((_, i) => (i*7) & 0xFF);

        const gatBefore = new Uint8Array(gatOf(disk.binary, first));
        const copyBefore = new Uint8Array(ldosTestSector(disk.binary, 2, first.partition, 0, 3));

        const {overlay, writer} = startWriter(first);
        const added = writer.addFile(name("BIG/DAT"), big);
        expect(added.size).to.equal(100000);
        writer.deleteFile(writer.findFile("OLD/DAT")!);
        writer.renameFile(writer.findFile("HELLO/TXT")!, name("GREET/TXT"));
        writer.setAttributes(writer.findFile("GREET/TXT")!, {protectionLevel: TrsdosProtectionLevel.READ, invisible: true});
        const newTrsdos = writer.flush();
        overlay.commit();

        // A file of 49 granules is more than one extent.
        const bigEntry = newTrsdos.findFile("BIG/DAT")!;
        expect([...newTrsdos.getFileExtents(bigEntry)].length).to.be.above(1);

        // Decoding again gives the files back exactly.
        const again = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[0].trsdos;
        expect(again.getDirEntries(false).map(entry => entry.getFilename("/")).sort()).to.eql(["BIG/DAT", "GREET/TXT"]);
        expect(again.readFile(again.findFile("BIG/DAT")!)).to.eql(big);
        expect(new TextDecoder().decode(again.readFile(again.findFile("GREET/TXT")!))).to.equal("HELLO WORLD");
        expect(again.findFile("GREET/TXT")!.getProtectionLevel()).to.equal(TrsdosProtectionLevel.READ);
        expect(again.findFile("GREET/TXT")!.isHidden()).to.equal(true);
        expect(checkTrsdos(again).findings.filter(f => f.kind !== TrsdosFindingKind.USED_BUT_UNCLAIMED)).to.eql([]);

        // The GAT's version, geometry and media data block, which no write has any business with.
        const gatAfter = gatOf(disk.binary, first);
        expect(gatAfter.subarray(0xCB)).to.eql(gatBefore.subarray(0xCB));
        // The GAT's bytes past the partition's cylinders are untouched too.
        expect(gatAfter.subarray(first.partition.cylinderCount, 0xCB))
            .to.eql(gatBefore.subarray(first.partition.cylinderCount, 0xCB));
        // The stale copy of the GAT in sector 3 isn't kept up to date.
        expect(ldosTestSector(disk.binary, 2, first.partition, 0, 3)).to.eql(copyBefore);
        expect(gatAfter).not.to.eql(copyBefore);

        // The other partition and the header are byte-identical.
        const secondStart = offsetOf(2, 60, 0, 0);
        expect(disk.binary.subarray(secondStart)).to.eql(before.subarray(secondStart));
        expect(disk.binary.subarray(0, HEADER_SIZE)).to.eql(before.subarray(0, HEADER_SIZE));
        // And the other partition still decodes the same.
        const secondAgain = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[1];
        expect(secondAgain.trsdos.getDirEntries(false).map(entry => entry.getFilename("/"))).to.eql(["OTHER/TXT"]);
        expect(second.trsdos.getDirEntries(false).length).to.equal(1);

        // Only the GAT, the HIT, directory sectors and granules of the new file changed.
        const dirCylinder = first.trsdos.dirLumpNumber;
        const dirSectorOffsets = new Set<number>();
        for (let s = 0; s < 64; s++) {
            const index = ((first.partition.cylinderOffset + dirCylinder)*2 + Math.floor(s/32))*32 + s % 32;
            dirSectorOffsets.add(index);
        }
        const bigGranules = new Set<number>();
        const bigExtents = [...newTrsdos.getFileExtents(bigEntry)].map(extent => ({
            lump: extent.cylinderNumber, granuleOffset: extent.granuleOffset, granuleCount: extent.granuleCount,
        }));
        for (const position of newTrsdos.getExtentSectorPositions(bigExtents)) {
            bigGranules.add((position.cylinderNumber*2 + Math.floor(position.sectorNumber/32))*32 + position.sectorNumber % 32);
        }
        for (const index of changedSectors(before, disk.binary)) {
            expect(dirSectorOffsets.has(index) || bigGranules.has(index), `sector ${index}`).to.equal(true);
        }
    });

    it("allocates a file past 32 granules in extents of up to 32, with granule offsets in a cylinder", () => {
        const {disk, partitions} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);
        // 128 granules of 8 sectors, which are four full extents.
        const contents = new Uint8Array(128*8*SECTOR_SIZE).fill(0xAB);
        writer.addFile(name("HUGE/DAT"), contents);
        const newTrsdos = writer.flush();
        overlay.commit();

        const extents = [...newTrsdos.getFileExtents(newTrsdos.findFile("HUGE/DAT")!)];
        expect(extents.reduce((sum, extent) => sum + extent.granuleCount, 0)).to.equal(128);
        expect(extents.length).to.equal(4);
        expect(extents.every(extent => extent.granuleCount <= 32)).to.equal(true);
        expect(extents.every(extent => extent.granuleOffset < 8)).to.equal(true);

        const again = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[0].trsdos;
        expect(again.readFile(again.findFile("HUGE/DAT")!)).to.eql(contents);
    });

    /**
     * The DECs of a file's primary entry and its extended entries, in chain order.
     */
    function chainDecs(trsdos: ReturnType<typeof decodeTrsdosOnOverlay> & {}, fileName: string): number[] {
        const directory = trsdos.getDirectory();
        const decs: number[] = [];
        for (let dirEntry = directory.files.find(file => file.getFilename("/") === fileName);
             dirEntry !== undefined; dirEntry = dirEntry.nextDirEntry) {

            const slot = directory.slots.find(candidate => candidate.dirEntry === dirEntry);
            expect(slot, `slot in the chain of ${fileName}`).to.not.equal(undefined);
            decs.push(slot!.hitIndex);
        }
        return decs;
    }

    it("puts a five-extent file's extended entry in its primary entry's directory sector", () => {
        const {disk, partitions} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);
        // 129 granules of 8 sectors need five extents, so a primary entry and one extended entry.
        const contents = new Uint8Array(129*8*SECTOR_SIZE).map((_, i) => (i*7) & 0xFF);
        writer.addFile(name("FIVE/DAT"), contents);
        const newTrsdos = writer.flush();
        overlay.commit();

        const decs = chainDecs(newTrsdos, "FIVE/DAT");
        expect(decs.length).to.equal(2);
        // The sector is the low five bits of a DEC. Both entries are in the lowest sector with two free slots.
        expect(decs[0] & 0x1F).to.equal(decs[1] & 0x1F);
        expect(decs[0]).to.not.equal(decs[1]);

        const again = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[0].trsdos;
        expect(again.readFile(again.findFile("FIVE/DAT")!)).to.eql(contents);
        const primary = again.findFile("FIVE/DAT")!;
        expect(primary.nextDirEntry).to.not.equal(undefined);
        const hit = again.getHitInfo();
        expect(typeof hit).to.equal("object");
        for (const dec of decs) {
            expect((hit as {hit: Uint8Array}).hit[dec]).to.equal(hashForFilename("FIVE    DAT"));
        }
    });

    it("puts a ten-extent file's three entries in one directory sector", () => {
        const {disk, partitions} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);
        // 320 granules of 8 sectors are ten full extents, so a primary entry and two extended entries.
        const contents = new Uint8Array(320*8*SECTOR_SIZE).map((_, i) => (i*13) & 0xFF);
        writer.addFile(name("TEN/DAT"), contents);
        const newTrsdos = writer.flush();
        overlay.commit();

        const decs = chainDecs(newTrsdos, "TEN/DAT");
        expect(decs.length).to.equal(3);
        expect(new Set(decs.map(dec => dec & 0x1F)).size).to.equal(1);
        expect(new Set(decs).size).to.equal(3);

        const again = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[0].trsdos;
        expect(again.readFile(again.findFile("TEN/DAT")!)).to.eql(contents);
    });

    it("refuses a multi-entry file when no directory sector has room for all its entries, changing nothing", () => {
        const {disk, partitions, before} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);

        // Slots are handed out in DEC order, entry by entry across the sectors, so filling all but one
        // slot per sector leaves exactly one free slot in every directory sector.
        const trsdos = partitions[0].trsdos;
        const hitInfo = trsdos.getHitInfo();
        expect(typeof hitInfo).to.equal("object");
        const freeMessage = chooseDirSlots(trsdos, TrsdosRuleSet.TRSDOS_6, (hitInfo as {hit: Uint8Array}).hit, 1000);
        const freeCount = Number(/there are (\d+) free/.exec(freeMessage as string)![1]);
        const sectorCount = [...trsdos.getDirSectors()].length;
        for (let i = 0; i < freeCount - sectorCount; i++) {
            writer.addFile(name(`F${i}/DAT`), new Uint8Array(10));
        }
        expect(() => writer.addFile(name("TEN/DAT"), new Uint8Array(129*8*SECTOR_SIZE)))
            .to.throw("too fragmented for a file this size");
        // A one-entry file still fits.
        writer.addFile(name("SMALL/DAT"), new Uint8Array(10));
        overlay.discard();
        expect(disk.binary).to.eql(before);
    });

    it("discards everything when the writer fails, leaving the disk unchanged", () => {
        const {disk, partitions, before} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);
        writer.addFile(name("A/DAT"), new Uint8Array(1000));
        expect(() => writer.addFile(name("A/DAT"), new Uint8Array(10))).to.throw();
        overlay.discard();
        expect(disk.binary).to.eql(before);
    });

    it("refuses a file that doesn't fit, and doesn't write", () => {
        const {disk, partitions, before} = makeTwoPartitions();
        const {overlay, writer} = startWriter(partitions[0]);
        // The partition has 480 granules of 2,048 bytes.
        expect(() => writer.addFile(name("TOO/BIG"), new Uint8Array(2_000_000))).to.throw();
        overlay.discard();
        expect(disk.binary).to.eql(before);
    });

    it("works on a partition split by head, with one granule per four sectors", () => {
        const binary = makeLdosTestHardDiskBinary([
            {headOffset: 0, headCount: 1, cylinderCount: 100, dirCylinder: 50, name: "H0"},
            {headOffset: 1, headCount: 1, cylinderCount: 100, dirCylinder: 50, name: "H1"},
        ]);
        const before = new Uint8Array(binary);
        const disk = decodeHdvHardDisk(binary)!;
        const second = findLdosPartitions(disk)[1];
        expect(second.trsdos.sectorsPerGranule).to.equal(4);

        const {overlay, writer} = startWriter(second);
        const contents = new Uint8Array(40000).map((_, i) => i & 0x7F);
        writer.addFile(name("DATA/BIN"), contents);
        writer.flush();
        overlay.commit();

        const again = findLdosPartitions(decodeHdvHardDisk(disk.binary)!)[1].trsdos;
        expect(again.readFile(again.findFile("DATA/BIN")!)).to.eql(contents);
        // Head 0 (the other partition) didn't change at all.
        for (let cylinder = 0; cylinder < 100; cylinder++) {
            const offset = offsetOf(2, cylinder, 0, 0);
            expect(disk.binary.subarray(offset, offset + 32*SECTOR_SIZE)).to.eql(before.subarray(offset, offset + 32*SECTOR_SIZE));
        }
    });

    it("sees no lockout table in a partition's GAT, even through an overlay", () => {
        // GAT byte 0x63 is cylinder 99's allocation, and a floppy's lockout table would have read it as the
        // lockout of cylinder 3.
        const binary = makeLdosTestHardDiskBinary([{cylinderCount: 150, dirCylinder: 75, headCount: 2}]);
        const found = findLdosPartitions(decodeHdvHardDisk(binary)!)[0];
        const overlay = new SectorOverlay(found.partition);
        const gatPosition = SectorPosition.make(75, 0, 0);
        const gat = new Uint8Array(overlay.readSector(gatPosition)!.data);
        gat[0x63] = 0xFF;
        overlay.writeSector(gatPosition, gat);

        const trsdos = decodeTrsdosOnOverlay(overlay, found.trsdos)!;
        const granuleMap = TrsdosGranuleMap.make(trsdos);
        if (typeof granuleMap === "string") {
            throw new Error(granuleMap);
        }
        expect(granuleMap.get(3, 0)!.lockedOut).to.equal(false);
        expect(granuleMap.get(3, 0)!.isFree()).to.equal(true);
        expect(granuleMap.get(99, 0)!.gatUsed).to.equal(true);
    });
});
