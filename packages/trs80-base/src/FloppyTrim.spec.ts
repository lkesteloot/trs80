import {describe, expect, it} from "vitest";
import {makeBlankFloppy} from "./DmkBuilder.js";
import {DmkFloppyDisk, FILE_HEADER_SIZE, FLAG_SINGLE_SIDED} from "./DmkFloppyDisk.js";
import {Density, FloppyDisk, SectorData, SectorPosition} from "./FloppyDisk.js";
import {canTrimFloppy, trimFloppy} from "./FloppyTrim.js";
import {decodeJv1FloppyDisk, Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {decodeJv3FloppyDisk, Jv3FloppyDisk, trimJv3FloppyDisk} from "./Jv3FloppyDisk.js";
import {TRSDOS_23_TRACK_LAYOUT} from "./TrackLayout.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

/**
 * A byte that depends on where a sector is, so that sectors differ from each other.
 */
function fillByte(cylinder: number, side: number, sector: number): number {
    return (cylinder*31 + side*17 + sector*3 + 1) & 0xFF;
}

/**
 * Make a blank DMK disk of 256-byte single-density sectors and write a distinct byte into every sector.
 */
function makeDmkDisk(cylinders: number, sides: number): DmkFloppyDisk {
    const disk = makeBlankFloppy(TRSDOS_23_TRACK_LAYOUT, cylinders, sides);
    if (disk === undefined) {
        throw new Error("Couldn't make the DMK disk");
    }
    for (const sectorInfo of disk.getGeometry().sectorInfos) {
        const position = sectorInfo.sectorPosition;
        const value = fillByte(position.cylinderNumber, position.side, position.sectorNumber);
        disk.writeSector(position, new SectorData(new Uint8Array(256).fill(value), position, Density.SINGLE));
    }
    return disk;
}

/**
 * Make a JV3 image of 256-byte single-density sectors, (by default) 10 per track, with a distinct byte in each. The
 * image ends with the unused entries of its last directory block.
 */
function makeJv3Disk(cylinders: number, sides: number, sectorsPerTrack = 10): Jv3FloppyDisk {
    const entries: {cylinder: number, side: number, sector: number}[] = [];
    for (let cylinder = 0; cylinder < cylinders; cylinder++) {
        for (let side = 0; side < sides; side++) {
            for (let sector = 0; sector < sectorsPerTrack; sector++) {
                entries.push({cylinder, side, sector});
            }
        }
    }

    // Directory blocks of 2,901 entries each, a write-protect byte at the end of each, and the data after
    // each directory. Unused entries are free (0xFF) and the file ends after the last sector.
    const headerSize = 34*256;
    const recordCount = 2901;
    const blockCount = Math.ceil(entries.length/recordCount);
    const binary = new Uint8Array(blockCount*headerSize + entries.length*256);
    let blockOffset = 0;
    for (let block = 0; block < blockCount; block++) {
        const blockEntries = entries.slice(block*recordCount, (block + 1)*recordCount);
        binary.fill(0xFF, blockOffset, blockOffset + headerSize);
        blockEntries.forEach((entry, i) => {
            binary[blockOffset + i*3] = entry.cylinder;
            binary[blockOffset + i*3 + 1] = entry.sector;
            binary[blockOffset + i*3 + 2] = entry.side === 0 ? 0x00 : 0x10;
            const dataOffset = blockOffset + headerSize + i*256;
            binary.fill(fillByte(entry.cylinder, entry.side, entry.sector), dataOffset, dataOffset + 256);
        });
        blockOffset += headerSize + blockEntries.length*256;
    }
    const disk = decodeJv3FloppyDisk(binary, {requireBootTrack: true});
    if (disk === undefined) {
        throw new Error("Couldn't decode the JV3 disk");
    }
    return disk;
}

/**
 * Check that every sector within the kept cylinders and sides reads the same on both disks, and that
 * there are exactly that many sectors in the trimmed one.
 */
function expectKeptSectorsIdentical(original: FloppyDisk, trimmed: FloppyDisk, cylinders: number, sides: number): void {
    let keptCount = 0;
    for (const sectorInfo of original.getGeometry().sectorInfos) {
        const position = sectorInfo.sectorPosition;
        if (position.cylinderNumber < cylinders && position.side < sides) {
            keptCount++;
            const expected = original.readSector(position);
            const actual = trimmed.readSector(position);
            expect(actual?.data).to.eql(expected?.data);
            expect(actual?.getDataAddressMark()).to.equal(expected?.getDataAddressMark());
        }
    }
    expect(trimmed.getGeometry().sectorInfos.length).to.equal(keptCount);
    expect(trimmed.getGeometry().cylinderCount).to.equal(cylinders);
    expect(trimmed.getGeometry().sideCount).to.equal(sides);
}

describe("trimming a DMK image", () => {
    it("keeps the first cylinders byte for byte and updates the header", () => {
        const disk = makeDmkDisk(6, 2);
        const trimmed = trimFloppy(disk, 4, 2);
        expect(typeof trimmed).to.not.equal("string");
        const trimmedDisk = trimmed as DmkFloppyDisk;

        expectKeptSectorsIdentical(disk, trimmedDisk, 4, 2);
        expect(trimmedDisk.trackLength).to.equal(disk.trackLength);
        expect(trimmedDisk.binary[1]).to.equal(4);
        expect(trimmedDisk.binary[4] & FLAG_SINGLE_SIDED).to.equal(0);
        expect(trimmedDisk.binary.length).to.equal(FILE_HEADER_SIZE + 4*2*disk.trackLength);

        // The kept tracks are the same bytes.
        expect(trimmedDisk.binary.subarray(FILE_HEADER_SIZE)).to.eql(
            disk.binary.subarray(FILE_HEADER_SIZE, FILE_HEADER_SIZE + 4*2*disk.trackLength));
    });

    it("drops the second side and sets the single-sided flag", () => {
        const disk = makeDmkDisk(5, 2);
        const trimmedDisk = trimFloppy(disk, 5, 1) as DmkFloppyDisk;

        expectKeptSectorsIdentical(disk, trimmedDisk, 5, 1);
        expect(trimmedDisk.binary[1]).to.equal(5);
        expect(trimmedDisk.binary[4] & FLAG_SINGLE_SIDED).to.equal(FLAG_SINGLE_SIDED);
        expect(trimmedDisk.binary.length).to.equal(FILE_HEADER_SIZE + 5*disk.trackLength);

        // Side 0 of cylinder 3 is the 7th track of the original (cylinder 3, side 0) and the 4th now.
        const offset = (cylinder: number, sides: number) => FILE_HEADER_SIZE + cylinder*sides*disk.trackLength;
        expect(trimmedDisk.binary.subarray(offset(3, 1), offset(3, 1) + disk.trackLength)).to.eql(
            disk.binary.subarray(offset(3, 2), offset(3, 2) + disk.trackLength));
    });

    it("does both at once, and doesn't change the original", () => {
        const disk = makeDmkDisk(4, 2);
        const before = disk.binary.slice();
        const trimmedDisk = trimFloppy(disk, 2, 1) as DmkFloppyDisk;

        expectKeptSectorsIdentical(disk, trimmedDisk, 2, 1);
        expect(disk.binary).to.eql(before);
    });

    it("keeps everything when asked for more than there is", () => {
        const disk = makeDmkDisk(3, 1);
        const trimmedDisk = trimFloppy(disk, 10, 2) as DmkFloppyDisk;

        expect(trimmedDisk.binary).to.eql(disk.binary);
    });

    it("keeps the write-protect byte", () => {
        const binary = makeDmkDisk(3, 1).binary.slice();
        binary[0] = 0xFF;
        const protectedDisk = decodeTrs80File(binary, {filename: "disk.dmk"}) as DmkFloppyDisk;
        expect(protectedDisk.isWriteProtected()).to.equal(true);

        const trimmed = trimFloppy(protectedDisk, 2, 1) as DmkFloppyDisk;

        expect(trimmed.binary[0]).to.equal(0xFF);
        expect(trimmed.isWriteProtected()).to.equal(true);
    });

    it("refuses nonsense counts", () => {
        const disk = makeDmkDisk(3, 1);

        expect(typeof trimFloppy(disk, 0, 1)).to.equal("string");
        expect(typeof trimFloppy(disk, 1.5, 1)).to.equal("string");
        expect(typeof trimFloppy(disk, 2, 3)).to.equal("string");
    });
});

describe("trimming a JV1 image", () => {
    /**
     * Make a JV1 image with a distinct byte in each sector.
     */
    function makeJv1Disk(cylinders: number): Jv1FloppyDisk {
        const binary = new Uint8Array(cylinders*10*256);
        for (let cylinder = 0; cylinder < cylinders; cylinder++) {
            for (let sector = 0; sector < 10; sector++) {
                binary.fill(fillByte(cylinder, 0, sector), (cylinder*10 + sector)*256, (cylinder*10 + sector + 1)*256);
            }
        }
        const disk = decodeJv1FloppyDisk(binary);
        if (disk === undefined) {
            throw new Error("Couldn't decode the JV1 disk");
        }
        return disk;
    }

    it("keeps the first cylinders", () => {
        const disk = makeJv1Disk(40);
        const trimmed = trimFloppy(disk, 35, 1);

        expect(trimmed instanceof Jv1FloppyDisk).to.equal(true);
        expectKeptSectorsIdentical(disk, trimmed as FloppyDisk, 35, 1);
        expect((trimmed as FloppyDisk).binary).to.eql(disk.binary.subarray(0, 35*10*256));
    });

    it("ignores the sides to keep, since it has only one", () => {
        const disk = makeJv1Disk(5);
        const trimmed = trimFloppy(disk, 3, 2) as FloppyDisk;

        expectKeptSectorsIdentical(disk, trimmed, 3, 1);
    });
});

describe("trimming a JV3 image", () => {
    it("keeps the first cylinders and rewrites the directory", () => {
        const disk = makeJv3Disk(6, 1);
        const trimmed = trimFloppy(disk, 4, 1) as Jv3FloppyDisk;

        expect(trimmed instanceof Jv3FloppyDisk).to.equal(true);
        expectKeptSectorsIdentical(disk, trimmed, 4, 1);
        expect(trimmed.binary.length).to.equal(34*256 + 40*256);
    });

    it("drops the second side", () => {
        const disk = makeJv3Disk(3, 2);
        const trimmed = trimFloppy(disk, 3, 1) as Jv3FloppyDisk;

        expectKeptSectorsIdentical(disk, trimmed, 3, 1);
        expect(trimmed.binary.length).to.equal(34*256 + 30*256);
    });

    it("keeps the sectors' flags", () => {
        const disk = makeJv3Disk(2, 1);
        // Mark a sector deleted (single-density F8 mark) in the original image.
        const binary = disk.binary.slice();
        binary[2*3 + 2] = 0x60;
        const marked = decodeJv3FloppyDisk(binary, {requireBootTrack: true}) as Jv3FloppyDisk;
        const position = SectorPosition.make(0, 0, 2);
        expect(marked.readSector(position)?.deleted).to.equal(true);

        const trimmed = trimFloppy(marked, 1, 1) as Jv3FloppyDisk;

        expect(trimmed.readSector(position)?.deleted).to.equal(true);
        expect(trimmed.readSector(SectorPosition.make(0, 0, 3))?.deleted).to.equal(false);
    });

    it("keeps the write-protect byte", () => {
        const disk = makeJv3Disk(2, 1);
        const binary = disk.binary.slice();
        binary[2901*3] = 0x00;
        const marked = decodeJv3FloppyDisk(binary, {requireBootTrack: true}) as Jv3FloppyDisk;
        expect(marked.isWriteProtected()).to.equal(true);

        const trimmed = trimJv3FloppyDisk(marked, 1, 1);

        expect(trimmed?.isWriteProtected()).to.equal(true);
    });

    it("splits into more than one directory block when there are many sectors", () => {
        // 2,901 entries fit in a block. A 99-cylinder, two-sided, 16-sector disk has 3,168.
        const disk = makeJv3Disk(99, 2, 16);
        const trimmed = trimFloppy(disk, 99, 2) as Jv3FloppyDisk;

        expectKeptSectorsIdentical(disk, trimmed, 99, 2);
        expect(trimmed.binary.length).to.equal(2*34*256 + 3168*256);

        // And trimming it down to one block's worth.
        const smaller = trimFloppy(disk, 60, 1) as Jv3FloppyDisk;
        expectKeptSectorsIdentical(disk, smaller, 60, 1);
        expect(smaller.binary.length).to.equal(34*256 + 960*256);
    });
});

describe("trimFloppy", () => {
    it("recognizes the formats that it can trim", () => {
        expect(canTrimFloppy(makeDmkDisk(2, 1))).to.equal(true);
        expect(canTrimFloppy(makeJv3Disk(2, 1))).to.equal(true);
    });
});
