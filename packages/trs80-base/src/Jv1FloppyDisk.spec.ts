import {describe, expect, it} from "vitest";
import {Density, SectorData, SectorPosition} from "./FloppyDisk.js";
import {decodeJv1FloppyDisk, Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {DATA_ADDRESS_MARK, USER_DATA_ADDRESS_MARK_FA} from "./TrackBytes.js";

const BYTES_PER_SECTOR = 256;
const CYLINDER_COUNT = 35;

/**
 * Make a blank 35-cylinder JV1 disk.
 */
function makeDisk(): Jv1FloppyDisk {
    const disk = decodeJv1FloppyDisk(new Uint8Array(CYLINDER_COUNT*10*BYTES_PER_SECTOR));
    if (disk === undefined) {
        throw new Error("blank JV1 didn't decode");
    }
    return disk;
}

/**
 * Write a sector of the given byte with the given data address mark.
 */
function writeSector(disk: Jv1FloppyDisk, position: SectorPosition, value: number, mark: number): void {
    const sectorData = new SectorData(new Uint8Array(BYTES_PER_SECTOR).fill(value), position, Density.SINGLE);
    sectorData.dataAddressMark = mark;
    disk.writeSector(position, sectorData);
}

describe("Jv1FloppyDisk", () => {
    it("marks the directory cylinder deleted", () => {
        const disk = makeDisk();
        expect(disk.readSector(SectorPosition.make(17, 0, 3))?.getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);
        expect(disk.readSector(SectorPosition.make(16, 0, 3))?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
    });

    it("remembers the data address marks it was written with", () => {
        const disk = makeDisk();

        // A directory elsewhere, as LDOS might put it.
        const elsewhere = SectorPosition.make(20, 0, 0);
        writeSector(disk, elsewhere, 0x55, USER_DATA_ADDRESS_MARK_FA);
        const read = disk.readSector(elsewhere);
        expect(read?.data[0]).to.equal(0x55);
        expect(read?.deleted).to.equal(true);
        expect(read?.getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);

        // A normal sector on the usual directory cylinder.
        const onSeventeen = SectorPosition.make(17, 0, 1);
        writeSector(disk, onSeventeen, 0xAA, DATA_ADDRESS_MARK);
        expect(disk.readSector(onSeventeen)?.deleted).to.equal(false);
        expect(disk.readSector(onSeventeen)?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
    });
});
