import {describe, expect, it} from "vitest";
import {CRC_16_CCITT} from "./Crc16.js";
import {decodeDmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {decodeJv1FloppyDisk, type Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {
    CRC_PRESET,
    DATA_ADDRESS_MARK,
    DELETED_DATA_ADDRESS_MARK,
    ID_ADDRESS_MARK,
    USER_DATA_ADDRESS_MARK_FA,
} from "./TrackBytes.js";
import {decodeTrsdos} from "./Trsdos.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

const BYTES_PER_SECTOR = 256;
const CYLINDER_COUNT = 35;

/**
 * Make a blank 35-cylinder JV1 disk.
 */
function makeJv1Disk(): Jv1FloppyDisk {
    const disk = decodeJv1FloppyDisk(new Uint8Array(CYLINDER_COUNT*10*BYTES_PER_SECTOR));
    if (disk === undefined) {
        throw new Error("blank JV1 didn't decode");
    }
    return disk;
}

/**
 * Make a tiny single-sided, single-density DMK disk with two cylinders of three sectors each
 * (numbered 0 to 2). On each track, sector 1 has the deleted data address mark and the others
 * the normal one, and every byte of sector n on cylinder c is c*16 + n.
 *
 * @param idSide the side that the sectors' ID fields name, which some disks have as 1 on side 0.
 */
function makeDmkDisk(idSide = 0): FloppyDisk {
    const trackLength = 0x0CC0;
    const headerSize = 128;
    const trackCount = 2;
    const binary = new Uint8Array(16 + trackCount*trackLength);
    binary[1] = trackCount;
    binary[2] = trackLength & 0xFF;
    binary[3] = trackLength >> 8;
    binary[4] = 0x10 | 0x40; // Single sided and single density (one byte per byte).

    for (let cylinder = 0; cylinder < trackCount; cylinder++) {
        const trackOffset = 16 + cylinder*trackLength;
        binary.fill(0xFF, trackOffset + headerSize, trackOffset + trackLength);
        let index = headerSize + 20;
        for (let sector = 0; sector < 3; sector++) {
            // Pointer to the ID address mark.
            binary[trackOffset + sector*2] = index & 0xFF;
            binary[trackOffset + sector*2 + 1] = index >> 8;

            const bytes: number[] = [ID_ADDRESS_MARK, cylinder, idSide, sector, 1];
            let crc = CRC_PRESET;
            for (const b of bytes) {
                crc = CRC_16_CCITT.update(crc, b);
            }
            bytes.push(crc >> 8, crc & 0xFF);
            bytes.push(... new Array<number>(17).fill(0xFF));

            crc = CRC_PRESET;
            const dam = sector === 1 ? DELETED_DATA_ADDRESS_MARK : DATA_ADDRESS_MARK;
            const dataBytes = [dam, ... new Array<number>(BYTES_PER_SECTOR).fill(cylinder*16 + sector)];
            for (const b of dataBytes) {
                crc = CRC_16_CCITT.update(crc, b);
            }
            bytes.push(... dataBytes, crc >> 8, crc & 0xFF);
            bytes.push(... new Array<number>(20).fill(0xFF));

            binary.set(bytes, trackOffset + index);
            index += bytes.length;
        }
    }

    const disk = decodeDmkFloppyDisk(binary, {requireBootTrack: true});
    if (disk === undefined) {
        throw new Error("DMK didn't decode");
    }
    return disk;
}

/**
 * A sector's worth of one byte value.
 */
function filled(value: number): Uint8Array {
    return new Uint8Array(BYTES_PER_SECTOR).fill(value);
}

describe("SectorOverlay", () => {
    it("reads the base until a sector is written", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        const position = SectorPosition.make(3, 0, 4);
        expect(overlay.hasChanges()).to.equal(false);
        expect(overlay.readSector(position)?.data).to.eql(filled(0));
        expect(overlay.getGeometry()).to.equal(disk.getGeometry());
        expect(overlay.hasSectorData(position)).to.equal(true);
        expect(overlay.hasSectorData(SectorPosition.make(3, 0, 40))).to.equal(false);
        expect(overlay.readSector(SectorPosition.make(3, 0, 40))).to.equal(undefined);
    });

    it("keeps the mark of a normal sector, and doesn't change the base until commit", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        const position = SectorPosition.make(5, 0, 2);
        overlay.writeSector(position, filled(0x42));

        expect(overlay.hasChanges()).to.equal(true);
        const read = overlay.readSector(position);
        expect(read?.data).to.eql(filled(0x42));
        expect(read?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
        expect(read?.deleted).to.equal(false);
        expect(read?.density).to.equal(Density.SINGLE);
        expect(read?.sectorSize).to.equal(BYTES_PER_SECTOR);
        expect(read?.crcError).to.equal(false);
        expect(read?.sectorPosition.equals(position)).to.equal(true);
        expect(disk.readSector(position)?.data).to.eql(filled(0));

        // Mutating what we read doesn't change the overlay.
        read!.data.fill(0x99);
        expect(overlay.readSector(position)?.data).to.eql(filled(0x42));
    });

    it("keeps the deleted mark of a directory sector", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        const position = SectorPosition.make(17, 0, 3);
        overlay.writeSector(position, filled(0x77));

        const read = overlay.readSector(position);
        expect(read?.data).to.eql(filled(0x77));
        expect(read?.deleted).to.equal(true);
        expect(read?.getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);

        overlay.commit();
        expect(disk.readSector(position)?.data).to.eql(filled(0x77));
        expect(disk.readSector(position)?.getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);
        expect(disk.readSector(position)?.deleted).to.equal(true);
    });

    it("keeps the last data when a sector is written twice", () => {
        const overlay = new SectorOverlay(makeJv1Disk());
        const position = SectorPosition.make(2, 0, 0);
        overlay.writeSector(position, filled(1));
        overlay.writeSector(position, filled(2));
        expect(overlay.readSector(position)?.data).to.eql(filled(2));
        expect(overlay.getChangedPositions().length).to.equal(1);
    });

    it("commits the changes to the base and then has none", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        const normal = SectorPosition.make(5, 0, 2);
        const directory = SectorPosition.make(17, 0, 0);
        overlay.writeSector(normal, filled(0x42));
        overlay.writeSector(directory, filled(0x43));
        overlay.commit();

        expect(overlay.hasChanges()).to.equal(false);
        expect(overlay.getChangedPositions()).to.eql([]);
        expect(disk.readSector(normal)?.data).to.eql(filled(0x42));
        expect(disk.readSector(normal)?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
        expect(disk.readSector(directory)?.data).to.eql(filled(0x43));
        expect(disk.readSector(directory)?.getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);
        expect(overlay.readSector(normal)?.data).to.eql(filled(0x42));
    });

    it("forgets the changes on discard", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        const position = SectorPosition.make(5, 0, 2);
        overlay.writeSector(position, filled(0x42));
        overlay.discard();

        expect(overlay.hasChanges()).to.equal(false);
        expect(overlay.readSector(position)?.data).to.eql(filled(0));
        overlay.commit();
        expect(disk.readSector(position)?.data).to.eql(filled(0));
    });

    it("lists the changed positions in disk order", () => {
        const overlay = new SectorOverlay(makeJv1Disk());
        overlay.writeSector(SectorPosition.make(17, 0, 1), filled(1));
        overlay.writeSector(SectorPosition.make(3, 0, 9), filled(1));
        overlay.writeSector(SectorPosition.make(17, 0, 0), filled(1));
        overlay.writeSector(SectorPosition.make(3, 0, 2), filled(1));
        expect(overlay.getChangedPositions().map(p => p.key())).to.eql(["3:0:2", "3:0:9", "17:0:0", "17:0:1"]);
    });

    it("refuses writes to missing sectors, of the wrong size, and to write-protected disks", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        expect(() => overlay.writeSector(SectorPosition.make(17, 0, 30), filled(0)))
            .to.throw("Can't write cylinder 17, side 0, sector 30: no such sector on the disk");
        expect(() => overlay.writeSector(SectorPosition.make(17, 0, 3), new Uint8Array(100)))
            .to.throw("Can't write cylinder 17, side 0, sector 3: the data is 100 bytes but the sector holds 256");
        disk.setMountedWriteProtected(true);
        expect(() => overlay.writeSector(SectorPosition.make(17, 0, 3), filled(0)))
            .to.throw("Can't write cylinder 17, side 0, sector 3: the disk is write-protected");
        expect(overlay.hasChanges()).to.equal(false);
    });

    it("sees an uncommitted change to the boot track", () => {
        const disk = makeJv1Disk();
        const overlay = new SectorOverlay(disk);
        expect(overlay.getBootTrackText()).to.not.contain("HELLO");
        const data = new Uint8Array(BYTES_PER_SECTOR);
        data.set(Array.from("HELLO", c => c.charCodeAt(0)), 10);
        overlay.writeSector(SectorPosition.make(0, 0, 3), data);
        expect(overlay.getBootTrackText()).to.contain("HELLO");
        expect(disk.getBootTrackText()).to.not.contain("HELLO");
        overlay.discard();
        expect(overlay.getBootTrackText()).to.not.contain("HELLO");
    });

    it("decodes a TRSDOS disk through the overlay like the disk itself", () => {
        const disk = makeTrsdos23TestDisk([
            {name: "HELLO/TXT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}]},
            {name: "WORLD/BAS", extents: [{lump: 6, granuleOffset: 0, granuleCount: 2}]},
        ]);
        const direct = decodeTrsdos(disk);
        const overlaid = decodeTrsdos(new SectorOverlay(disk));
        expect(direct).to.not.equal(undefined);
        expect(overlaid).to.not.equal(undefined);
        const names = (t: typeof direct) => t!.getDirEntries(false).map(e => e.getFilename("/"));
        expect(names(overlaid)).to.eql(names(direct));
        expect(names(overlaid)).to.eql(["HELLO/TXT", "WORLD/BAS"]);
    });

    describe("on a DMK disk", () => {
        it("keeps marks, and commits them back", () => {
            const disk = makeDmkDisk();
            const overlay = new SectorOverlay(disk);
            const normal = SectorPosition.make(1, 0, 2);
            const deleted = SectorPosition.make(1, 0, 1);
            expect(disk.readSector(deleted)?.getDataAddressMark()).to.equal(DELETED_DATA_ADDRESS_MARK);
            expect(disk.readSector(normal)?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);

            overlay.writeSector(normal, filled(0xA5));
            overlay.writeSector(deleted, filled(0x5A));
            expect(overlay.readSector(deleted)?.getDataAddressMark()).to.equal(DELETED_DATA_ADDRESS_MARK);
            expect(overlay.readSector(deleted)?.data).to.eql(filled(0x5A));
            expect(disk.readSector(deleted)?.data).to.eql(filled(0x10 + 1));

            overlay.commit();
            expect(disk.readSector(normal)?.data).to.eql(filled(0xA5));
            expect(disk.readSector(normal)?.getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
            expect(disk.readSector(normal)?.crcError).to.equal(false);
            expect(disk.readSector(deleted)?.data).to.eql(filled(0x5A));
            expect(disk.readSector(deleted)?.getDataAddressMark()).to.equal(DELETED_DATA_ADDRESS_MARK);
            expect(disk.readSector(deleted)?.deleted).to.equal(true);
        });

        it("commits to where a sector was written, not to the side its ID names", () => {
            // Side 0's sectors say side 1 in their IDs, as on some NEWDOS/80 1.0 disks.
            const disk = makeDmkDisk(1);
            const position = SectorPosition.make(1, 0, 2);
            expect(disk.readSector(position)?.sectorPosition.side).to.equal(1);
            const overlay = new SectorOverlay(disk);
            overlay.writeSector(position, filled(0xA5));
            expect(overlay.getChangedPositions().map(changed => changed.key())).to.eql([position.key()]);
            overlay.commit();
            expect(disk.readSector(position)?.data).to.eql(filled(0xA5));
        });

        it("refuses a missing sector and a write-protected disk", () => {
            const disk = makeDmkDisk();
            const overlay = new SectorOverlay(disk);
            expect(() => overlay.writeSector(SectorPosition.make(1, 0, 7), filled(0)))
                .to.throw("no such sector on the disk");
            disk.setMountedWriteProtected(true);
            expect(() => overlay.writeSector(SectorPosition.make(1, 0, 1), filled(0)))
                .to.throw("write-protected");
        });
    });
});
