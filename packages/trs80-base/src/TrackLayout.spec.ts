import {describe, expect, it} from "vitest";
import {makeBlankFloppy, makeDmkImage} from "./DmkBuilder.js";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, FormattedTrack, SectorInfo, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {
    ALL_TRACK_LAYOUTS,
    buildFormattedTrack,
    DOUBLE_DENSITY_TRACK_BYTES,
    findTrackLayout,
    getLayoutByteCount,
    getTrackSectorOrder,
    LDOS_DD_TRACK_LAYOUT,
    LDOS_SD_TRACK_LAYOUT,
    LSDOS_DD_TRACK_LAYOUT,
    makeInterleaveOrder,
    SINGLE_DENSITY_TRACK_BYTES,
    TRSDOS_13_TRACK_LAYOUT,
    TRSDOS_23_TRACK_LAYOUT,
    TrackLayout,
} from "./TrackLayout.js";

/**
 * Make a blank disk or fail the test.
 */
function makeDisk(layout: TrackLayout, cylinderCount: number, sideCount: number): DmkFloppyDisk {
    const disk = makeBlankFloppy(layout, cylinderCount, sideCount);
    if (disk === undefined) {
        throw new Error("blank disk wasn't made for " + layout.id);
    }
    return disk;
}

/**
 * The sector numbers of a track of the disk in physical order.
 */
function physicalOrder(disk: DmkFloppyDisk, cylinder: number, side: number): number[] {
    const trackPosition = new TrackPosition(cylinder, side);
    return disk.getGeometry().sectorInfos
        .filter((info: SectorInfo) => info.sectorPosition.trackPosition.equals(trackPosition))
        .map((info: SectorInfo) => info.sectorPosition.sectorNumber);
}

/**
 * The bytes that a fresh sector of the layout should hold.
 */
function expectedFill(layout: TrackLayout): number[] {
    const data = Array.from({length: layout.sectorSize}, (_, i) => layout.fillPattern[i % layout.fillPattern.length]);
    data.splice(layout.sectorSize - layout.sectorTail.length, layout.sectorTail.length, ...layout.sectorTail);
    return data;
}

describe("makeInterleaveOrder", () => {
    it("makes the 2:1 order of ten sectors", () => {
        expect(makeInterleaveOrder(10, 0, 2)).to.eql([0, 5, 1, 6, 2, 7, 3, 8, 4, 9]);
    });

    it("makes the 3:1 order of eighteen sectors", () => {
        expect(makeInterleaveOrder(18, 0, 3)).to.eql([0, 6, 12, 1, 7, 13, 2, 8, 14, 3, 9, 15, 4, 10, 16, 5, 11, 17]);
    });

    it("numbers from the first number", () => {
        expect(makeInterleaveOrder(18, 1, 6)).to.eql([1, 4, 7, 10, 13, 16, 2, 5, 8, 11, 14, 17, 3, 6, 9, 12, 15, 18]);
    });
});

describe("TrackLayout", () => {
    for (const layout of ALL_TRACK_LAYOUTS) {
        for (const cylinderCount of [35, 40]) {
            for (const sideCount of [1, 2]) {
                it(`makes a good blank disk: ${layout.id}, ${cylinderCount} cylinders, ${sideCount} sides`, () => {
                    const disk = makeDisk(layout, cylinderCount, sideCount);
                    const geometry = disk.getGeometry();
                    const fill = expectedFill(layout);
                    const sectorNumbers = Array.from({length: layout.sectorCount}, (_, i) => layout.firstSectorNumber + i);

                    expect(geometry.cylinderCount).to.equal(cylinderCount);
                    expect(geometry.sideCount).to.equal(sideCount);
                    expect(geometry.sectorInfos.length).to.equal(cylinderCount*sideCount*layout.sectorCount);

                    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
                        for (let side = 0; side < sideCount; side++) {
                            const order = physicalOrder(disk, cylinder, side);
                            expect([...order].sort((a, b) => a - b)).to.eql(sectorNumbers);
                            expect(order).to.eql(getTrackSectorOrder(layout, new TrackPosition(cylinder, side), sideCount));
                        }
                    }

                    for (const info of geometry.sectorInfos) {
                        expect(info.density).to.equal(layout.density);
                        expect(info.sectorSize).to.equal(layout.sectorSize);
                        expect(info.crc?.idCrc.valid()).to.equal(true);
                        expect(info.crc?.dataCrc.valid()).to.equal(true);
                        expect(info.deleted).to.equal(false);

                        // The ID field says where the sector is.
                        const sectorData = disk.readSector(info.sectorPosition);
                        expect(sectorData).not.to.equal(undefined);
                        expect(sectorData?.sectorPosition.key()).to.equal(info.sectorPosition.key());
                        expect(Array.from(sectorData?.data ?? [])).to.eql(fill);
                    }
                });
            }
        }
    }

    it("keeps each layout inside a track", () => {
        for (const layout of ALL_TRACK_LAYOUTS) {
            const limit = layout.density === Density.SINGLE ? SINGLE_DENSITY_TRACK_BYTES : DOUBLE_DENSITY_TRACK_BYTES;
            expect(getLayoutByteCount(layout)).to.be.at.most(limit);
            const track = buildFormattedTrack(layout, new TrackPosition(0, 0), 1);
            expect(track?.bytes.length).to.equal(limit);
        }
    });

    it("finds layouts by id", () => {
        expect(findTrackLayout("LDOS-DD")).to.equal(LDOS_DD_TRACK_LAYOUT);
        expect(findTrackLayout("nonesuch")).to.equal(undefined);
    });

    it("has the measured sector order on one-sided LDOS double density", () => {
        const disk = makeDisk(LDOS_DD_TRACK_LAYOUT, 40, 1);
        expect(physicalOrder(disk, 0, 0)).to.eql([0, 6, 12, 1, 7, 13, 2, 8, 14, 3, 9, 15, 4, 10, 16, 5, 11, 17]);
        expect(physicalOrder(disk, 1, 0)).to.eql([10, 16, 5, 11, 17, 0, 6, 12, 1, 7, 13, 2, 8, 14, 3, 9, 15, 4]);
        expect(physicalOrder(disk, 2, 0).slice(0, 3)).to.eql([14, 3, 9]);
    });

    it("has the measured sector order on two-sided LDOS double density", () => {
        const disk = makeDisk(LDOS_DD_TRACK_LAYOUT, 40, 2);
        expect(physicalOrder(disk, 0, 1).slice(0, 4)).to.eql([6, 12, 1, 7]);
        expect(physicalOrder(disk, 1, 0).slice(0, 4)).to.eql([16, 5, 11, 17]);
        expect(physicalOrder(disk, 1, 1).slice(0, 4)).to.eql([5, 11, 17, 0]);
        expect(physicalOrder(disk, 39, 0).slice(0, 3)).to.eql([2, 8, 14]);
    });

    it("has the measured sector order on LS-DOS", () => {
        const oneSided = makeDisk(LSDOS_DD_TRACK_LAYOUT, 40, 1);
        expect(physicalOrder(oneSided, 0, 0).slice(0, 4)).to.eql([0, 9, 1, 10]);
        expect(physicalOrder(oneSided, 1, 0).slice(0, 4)).to.eql([5, 14, 6, 15]);
        expect(physicalOrder(oneSided, 6, 0).slice(0, 4)).to.eql([3, 12, 4, 13]);
        const twoSided = makeDisk(LSDOS_DD_TRACK_LAYOUT, 40, 2);
        expect(physicalOrder(twoSided, 1, 0).slice(0, 4)).to.eql([14, 6, 15, 7]);
        expect(physicalOrder(twoSided, 1, 1).slice(0, 4)).to.eql([6, 15, 7, 16]);
    });

    it("has the measured sector order on single density", () => {
        const ldos = makeDisk(LDOS_SD_TRACK_LAYOUT, 35, 1);
        expect(physicalOrder(ldos, 1, 0)).to.eql([8, 4, 9, 0, 5, 1, 6, 2, 7, 3]);
        const ldosTwoSided = makeDisk(LDOS_SD_TRACK_LAYOUT, 40, 2);
        expect(physicalOrder(ldosTwoSided, 0, 1).slice(0, 3)).to.eql([5, 1, 6]);
        expect(physicalOrder(ldosTwoSided, 1, 0).slice(0, 3)).to.eql([4, 9, 0]);
        const trsdos = makeDisk(TRSDOS_23_TRACK_LAYOUT, 35, 1);
        expect(physicalOrder(trsdos, 5, 0)).to.eql([0, 5, 1, 6, 2, 7, 3, 8, 4, 9]);
    });

    it("has TRSDOS 1.3's sectors numbered from 1 with no skew and a copyright at the end", () => {
        const disk = makeDisk(TRSDOS_13_TRACK_LAYOUT, 40, 1);
        expect(physicalOrder(disk, 7, 0)).to.eql([1, 4, 7, 10, 13, 16, 2, 5, 8, 11, 14, 17, 3, 6, 9, 12, 15, 18]);
        const data = disk.readSector(SectorPosition.make(3, 0, 5))?.data ?? new Uint8Array(0);
        expect(data[0]).to.equal(0xE5);
        expect(String.fromCharCode(...data.slice(240))).to.equal("(c) 1980 Tandy  ");
    });

    it("writes the standard marks and gaps of a double-density track", () => {
        const track = buildFormattedTrack(LDOS_DD_TRACK_LAYOUT, new TrackPosition(3, 0), 1);
        expect(track).not.to.equal(undefined);
        if (track === undefined) {
            return;
        }
        expect(track.doubleDensity).to.equal(true);
        expect(track.idamIndices.length).to.equal(18);
        // 32 gap bytes, 12 zeros, 3 sync bytes, then the first ID mark.
        expect(track.idamIndices[0]).to.equal(47);
        expect(Array.from(track.bytes.slice(0, 32)).every(b => b === 0x4E)).to.equal(true);
        expect(Array.from(track.bytes.slice(32, 44)).every(b => b === 0x00)).to.equal(true);
        expect(Array.from(track.bytes.slice(44, 48))).to.eql([0xA1, 0xA1, 0xA1, 0xFE]);
        expect(track.sectors.length).to.equal(18);
        expect(track.sectors[0].sectorPosition.trackPosition.key()).to.equal("3:0");
        // Pitch from one ID to the next.
        expect(track.idamIndices[1] - track.idamIndices[0]).to.equal(342);
    });

    it("writes a single-density track without sync bytes", () => {
        const track = buildFormattedTrack(LDOS_SD_TRACK_LAYOUT, new TrackPosition(0, 0), 1);
        expect(track?.doubleDensity).to.equal(false);
        expect(track?.idamIndices[0]).to.equal(20);
        expect(track?.idamIndices[1]).to.equal(20 + 304);
    });

    it("fails cleanly when the sectors don't fit", () => {
        const tooMany: TrackLayout = {...LDOS_DD_TRACK_LAYOUT, id: "too-many", sectorCount: 30};
        expect(getLayoutByteCount(tooMany)).to.be.greaterThan(DOUBLE_DENSITY_TRACK_BYTES);
        expect(buildFormattedTrack(tooMany, new TrackPosition(0, 0), 1)).to.equal(undefined);
        expect(makeBlankFloppy(tooMany, 35, 1)).to.equal(undefined);

        const tooBig: TrackLayout = {...LDOS_SD_TRACK_LAYOUT, id: "too-big", sectorSize: 1024, sectorCount: 5};
        expect(buildFormattedTrack(tooBig, new TrackPosition(0, 0), 1)).to.equal(undefined);
    });

    it("rejects counts that make no sense", () => {
        expect(makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, 0, 1)).to.equal(undefined);
        expect(makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, 35, 3)).to.equal(undefined);
    });

    it("can mix a single-density cylinder 0 with double-density data cylinders", () => {
        const disk = makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, 40, 2, {cylinder0Layout: LDOS_SD_TRACK_LAYOUT});
        expect(disk).not.to.equal(undefined);
        if (disk === undefined) {
            return;
        }
        for (const info of disk.getGeometry().sectorInfos) {
            const expected = info.sectorPosition.cylinderNumber === 0 ? Density.SINGLE : Density.DOUBLE;
            expect(info.density).to.equal(expected);
            expect(info.crc?.idCrc.valid()).to.equal(true);
            expect(info.crc?.dataCrc.valid()).to.equal(true);
        }
        expect(physicalOrder(disk, 0, 0)).to.have.length(10);
        expect(physicalOrder(disk, 1, 0)).to.have.length(18);
        expect(Array.from(disk.readSector(SectorPosition.make(0, 1, 3))?.data ?? [])[0]).to.equal(0xE5);
        expect(Array.from(disk.readSector(SectorPosition.make(1, 1, 3))?.data ?? []).slice(0, 2)).to.eql([0x6D, 0xB6]);
    });

    it("lets sectors be written and read back", () => {
        const disk = makeDisk(LDOS_DD_TRACK_LAYOUT, 35, 1);
        const position = SectorPosition.make(17, 0, 4);
        const sector = disk.readSector(position);
        if (sector === undefined) {
            throw new Error("missing sector");
        }
        sector.data.fill(0x42);
        disk.writeSector(position, sector);
        const info = disk.getGeometry().sectorMap.get(position.key());
        expect(info?.crc?.dataCrc.valid()).to.equal(true);
        expect(disk.readSector(position)?.data[100]).to.equal(0x42);
        expect(disk.readSector(SectorPosition.make(17, 0, 5))?.data[0]).to.equal(0x6D);
    });

    it("doesn't build an image with a track outside it", () => {
        const track = buildFormattedTrack(LDOS_DD_TRACK_LAYOUT, new TrackPosition(40, 0), 1);
        expect(track).not.to.equal(undefined);
        expect(makeDmkImage([track as FormattedTrack], 35, 1)).to.equal(undefined);
        const sideOne = buildFormattedTrack(LDOS_DD_TRACK_LAYOUT, new TrackPosition(0, 1), 2);
        expect(makeDmkImage([sideOne as FormattedTrack], 35, 1)).to.equal(undefined);
    });

    it("builds a DMK header that readers expect", () => {
        const disk = makeDisk(LDOS_DD_TRACK_LAYOUT, 40, 1);
        expect(disk.trackCount).to.equal(40);
        expect(disk.trackLength).to.equal(0x1900);
        expect(disk.flags).to.equal(0x10);
        expect(disk.isWriteProtected()).to.equal(false);
        expect(disk.binary.length).to.equal(16 + 40*0x1900);
        expect(makeDisk(LDOS_DD_TRACK_LAYOUT, 40, 2).flags).to.equal(0);
    });
});

describe("DmkFloppyDisk.formatTrack", () => {
    it("reformats a track of a built image", () => {
        const disk = makeDisk(LDOS_DD_TRACK_LAYOUT, 35, 1);
        const track = buildFormattedTrack(TRSDOS_13_TRACK_LAYOUT, new TrackPosition(4, 0), 1);
        expect(track).not.to.equal(undefined);
        expect(disk.formatTrack(track as FormattedTrack)).to.equal(true);
        expect(physicalOrder(disk, 4, 0)).to.eql([1, 4, 7, 10, 13, 16, 2, 5, 8, 11, 14, 17, 3, 6, 9, 12, 15, 18]);
        expect(physicalOrder(disk, 5, 0)).to.have.length(18);
        expect(disk.readSector(SectorPosition.make(4, 0, 18))?.data[0]).to.equal(0xE5);
        expect(disk.getGeometry().sectorMap.get(SectorPosition.make(4, 0, 18).key())?.crc?.dataCrc.valid()).to.equal(true);
    });

    it("doubles single-density bytes unless the header says not to", () => {
        const disk = makeDisk(LDOS_SD_TRACK_LAYOUT, 35, 1);
        const offset = 16 + 128;
        // The first byte of the lead gap, doubled.
        expect(disk.binary[offset]).to.equal(0xFF);
        expect(disk.binary[offset + 1]).to.equal(0xFF);
        // The first ID's mark is at stride 2: pointer is 128 + 2*20.
        expect(disk.binary[16]).to.equal(128 + 40);
        expect(disk.binary[17]).to.equal(0);
        expect(disk.binary[offset + 40]).to.equal(0xFE);
        expect(disk.binary[offset + 41]).to.equal(0xFE);
    });
});
