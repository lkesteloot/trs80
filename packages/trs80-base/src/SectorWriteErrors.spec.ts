import {describe, expect, it} from "vitest";
import {CRC_16_CCITT} from "./Crc16.js";
import {makeBlankFloppy} from "./DmkBuilder.js";
import {addDmkId} from "./DmkTestArtifacts.js";
import {Density, type FloppyDisk, SectorData, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {convertFloppy, FLOPPY_IMAGE_FORMATS, FloppyImageFormat, floppyImageFormatToString} from "./FloppyConvert.js";
import {TRSDOS_23_TRACK_LAYOUT} from "./TrackLayout.js";
import {CRC_PRESET} from "./TrackBytes.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

// Every writable floppy format refuses, with an error, a write that it can't make: to a sector the image
// doesn't have, of the wrong size, or to a write-protected image. A refusal that only logs a warning
// lets a caller think the write happened (see "Free space the image lacks" in FLOPPY_FORMATS.md).

/**
 * The same small TRSDOS 2.3 disk in a format, failing the test if it can't be made.
 */
function diskIn(format: FloppyImageFormat): FloppyDisk {
    const jv1 = makeTrsdos23TestDisk([]);
    if (format === FloppyImageFormat.JV1) {
        return jv1;
    }
    const disk = convertFloppy(jv1, format);
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    return disk;
}

/**
 * A sector's worth of data for a position.
 */
function sectorData(position: SectorPosition, length = 256): SectorData {
    return new SectorData(new Uint8Array(length).fill(0x42), position, Density.SINGLE);
}

describe("writeSector", () => {
    for (const format of FLOPPY_IMAGE_FORMATS) {
        const name = floppyImageFormatToString(format);

        describe(name, () => {
            it("writes a sector the image has", () => {
                const disk = diskIn(format);
                const position = SectorPosition.make(3, 0, 4);
                disk.writeSector(position, sectorData(position));
                expect(disk.readSector(position)?.data).to.eql(new Uint8Array(256).fill(0x42));
            });

            it("refuses a sector the image doesn't have", () => {
                const disk = diskIn(format);
                const before = disk.binary.slice();
                for (const position of [SectorPosition.make(3, 0, 30), SectorPosition.make(60, 0, 0)]) {
                    expect(() => disk.writeSector(position, sectorData(position))).to.throw(`no sector ${position.key()}`);
                }
                expect(disk.binary).to.eql(before);
            });

            it("refuses data of the wrong size", () => {
                const disk = diskIn(format);
                const position = SectorPosition.make(3, 0, 4);
                expect(() => disk.writeSector(position, sectorData(position, 100))).to.throw("size mismatch");
            });

            it("refuses a write-protected image", () => {
                const disk = diskIn(format);
                disk.setMountedWriteProtected(true);
                const position = SectorPosition.make(3, 0, 4);
                expect(() => disk.writeSector(position, sectorData(position))).to.throw("write protected");
            });
        });
    }

    it("refuses a DMK sector whose ID has no data field", () => {
        const floppy = makeBlankFloppy(TRSDOS_23_TRACK_LAYOUT, 5, 1);
        if (floppy === undefined) {
            throw new Error("Can't make the blank disk");
        }
        // An ID for sector 20 of cylinder 2, with a good CRC, near the end of the track, with nothing after it.
        const id = [0xFE, 2, 0, 20, 1];
        const crc = id.reduce((crc, byte) => CRC_16_CCITT.update(crc, byte), CRC_PRESET);
        const withId = addDmkId(floppy, new TrackPosition(2, 0), 3127, [...id, crc >> 8, crc & 0xFF], Density.SINGLE);
        const position = SectorPosition.make(2, 0, 20);
        expect(withId.hasSectorData(position)).to.equal(false);
        expect(() => withId.writeSector(position, sectorData(position))).to.throw("has no data field");
    });
});
