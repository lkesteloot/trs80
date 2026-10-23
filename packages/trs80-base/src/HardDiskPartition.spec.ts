import {describe, expect, it} from "vitest";
import {decodeHdvHardDisk, HdvHardDisk} from "./HdvHardDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {SectorPosition} from "./FloppyDisk.js";

const HEADER_SIZE = 256;

/**
 * Make an HDV with the given geometry. Each sector's first three bytes are its physical cylinder
 * (low byte), head, and sector, and the rest are 0xE5.
 */
function makeHdv(cylinderCount: number, headCount: number, truncateSectors = 0): HdvHardDisk {
    const sectorCount = cylinderCount*headCount*32 - truncateSectors;
    const binary = new Uint8Array(HEADER_SIZE + sectorCount*256);
    binary.fill(0xE5, HEADER_SIZE);
    binary.set([0x56, 0xCB, 0x10, 0x00, 1, 4, 0, 0, 0]);
    binary[29] = (headCount*32) & 0xFF;
    for (let i = 0; i < sectorCount; i++) {
        binary[HEADER_SIZE + i*256] = Math.floor(i/(headCount*32)) & 0xFF;
        binary[HEADER_SIZE + i*256 + 1] = Math.floor(i/32) % headCount;
        binary[HEADER_SIZE + i*256 + 2] = i % 32;
    }
    return decodeHdvHardDisk(binary)!;
}

describe("HardDiskPartition", () => {
    it("maps a partition split by head", () => {
        const disk = makeHdv(10, 8);
        const partition = new HardDiskPartition(disk, 2, 3, 6, 1);
        const geometry = partition.getGeometry();
        expect(geometry.cylinderCount).to.equal(6);
        expect(geometry.sideCount).to.equal(1);
        expect(geometry.modalDataSectorSpan).to.equal(32);
        expect(geometry.modalDataSectorSize).to.equal(256);

        // Logical cylinder 4 sector 7 is physical cylinder 6, head 3, sector 7.
        const sector = partition.readSector(SectorPosition.make(4, 0, 7))!;
        expect(Array.from(sector.data.subarray(0, 3))).to.eql([6, 3, 7]);
        expect(sector.data.length).to.equal(256);
    });

    it("maps a partition split by cylinder", () => {
        const disk = makeHdv(20, 2);
        const partition = new HardDiskPartition(disk, 10, 0, 10, 2);
        expect(partition.getGeometry().modalDataSectorSpan).to.equal(64);

        // Sector 40 is the 8th sector of the second head.
        const sector = partition.readSector(SectorPosition.make(3, 0, 40))!;
        expect(Array.from(sector.data.subarray(0, 3))).to.eql([13, 1, 8]);
        expect(Array.from(partition.readSector(SectorPosition.make(0, 0, 63))!.data.subarray(0, 3))).to.eql([10, 1, 31]);
    });

    it("doesn't read outside the partition", () => {
        const disk = makeHdv(20, 2);
        const partition = new HardDiskPartition(disk, 10, 0, 10, 2);
        for (const position of [
            SectorPosition.make(0, 0, 64),
            SectorPosition.make(10, 0, 0),
            SectorPosition.make(0, 1, 0),
            SectorPosition.make(0, 0, -1),
        ]) {
            expect(partition.readSector(position)).to.be.undefined;
            expect(partition.hasSectorData(position)).to.be.false;
        }
        expect(partition.hasSectorData(SectorPosition.make(9, 0, 63))).to.be.true;
    });

    it("has no sectors the image doesn't hold", () => {
        // The last cylinder has only its first 40 sectors.
        const disk = makeHdv(4, 2, 24);
        const partition = new HardDiskPartition(disk, 0, 0, 4, 2);
        expect(partition.hasSectorData(SectorPosition.make(3, 0, 39))).to.be.true;
        expect(partition.hasSectorData(SectorPosition.make(3, 0, 40))).to.be.false;
        expect(partition.readSector(SectorPosition.make(3, 0, 40))).to.be.undefined;
    });

    it("makes its first cylinder the boot track", () => {
        const disk = makeHdv(20, 2);
        const partition = new HardDiskPartition(disk, 10, 0, 10, 2);
        const bootTrack = partition.getGeometry().bootTrack!;
        expect(bootTrack.firstSectorNumber).to.equal(0);
        expect(bootTrack.lastSectorNumber).to.equal(63);
        expect(bootTrack.trackPosition.key()).to.equal("0:0");
        expect(partition.getBootTrackText().length).to.equal(64*256);
    });

    it("knows when partitions overlap", () => {
        const disk = makeHdv(20, 2);
        const first = new HardDiskPartition(disk, 0, 0, 10, 2);
        const second = new HardDiskPartition(disk, 10, 0, 10, 2);
        const byHead = new HardDiskPartition(disk, 0, 1, 20, 1);
        expect(first.overlaps(second)).to.be.false;
        expect(first.overlaps(byHead)).to.be.true;
        expect(second.overlaps(byHead)).to.be.true;
        expect(first.overlaps(first)).to.be.true;
    });

    it("describes where it is", () => {
        const disk = makeHdv(20, 2);
        expect(new HardDiskPartition(disk, 10, 0, 10, 2).describeLocation()).to.equal("cylinders 10-19, heads 0-1");
        expect(new HardDiskPartition(disk, 0, 1, 20, 1).describeLocation()).to.equal("cylinders 0-19, head 1");
    });
});
