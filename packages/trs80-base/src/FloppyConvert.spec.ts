import {describe, expect, it} from "vitest";
import {buildDmkImage} from "./DmkConvert.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {
    compareFloppies,
    compareFloppyFileSystems,
    FloppyDifferenceKind,
    floppyDifferenceKindIsLoss,
    floppyDifferenceKindToString,
} from "./FloppyCompare.js";
import {
    convertFloppy,
    FLOPPY_IMAGE_FORMATS,
    FloppyImageFormat,
    floppyImageFormatExtension,
    floppyImageFormatFromExtension,
    floppyImageFormatOf,
    floppyImageFormatToString,
} from "./FloppyConvert.js";
import {ConvertSector, ConvertTrack, DiskSize, readConvertTracks} from "./FloppyConvertModel.js";
import {Density, FloppyDisk, SectorData, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {decodeHfeFloppyDisk, HfeFloppyDisk} from "./HfeFloppyDisk.js";
import {ImdFloppyDisk} from "./ImdFloppyDisk.js";
import {
    DATA_ADDRESS_MARK,
    DELETED_DATA_ADDRESS_MARK,
    USER_DATA_ADDRESS_MARK_FA,
} from "./TrackBytes.js";
import {gapByte, synthesizeTrackStream, TrackStream} from "./TrackStream.js";
import {makeBlankFloppy} from "./DmkBuilder.js";
import {formatTrsdosDataDisk, TrsdosFormatDos} from "./TrsdosFormat.js";
import {LDOS_DD_TRACK_LAYOUT, LDOS_SD_TRACK_LAYOUT} from "./TrackLayout.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

/**
 * The date in the IMD headers that the tests make, so that two conversions of the same disk are alike.
 */
const TEST_DATE = new Date(2026, 9, 26, 12, 30, 45);

/**
 * Convert, failing the test if the format can't hold the disk.
 */
function convert(source: FloppyDisk, format: FloppyImageFormat): FloppyDisk {
    const result = convertFloppy(source, format, {date: TEST_DATE});
    if (typeof result === "string") {
        throw new Error("Conversion to " + floppyImageFormatToString(format) + " failed: " + result);
    }
    return result;
}

/**
 * The kinds of loss that converting a disk would report, as sorted names.
 */
function lossKinds(source: FloppyDisk, result: FloppyDisk): string[] {
    return compareFloppies(source, result).getLosses().map(difference => FloppyDifferenceKind[difference.kind]);
}

/**
 * A formatted LS-DOS 6.3 data disk (double density, 18 sectors of 256 bytes) as a DMK.
 */
function makeDoubleDensityDisk(cylinders = 40, sides = 2): DmkFloppyDisk {
    const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.LSDOS_6_3, cylinders, sides, name: "TESTDISK",
        date: new Date(2026, 0, 1)});
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    return disk;
}

/**
 * A formatted TRSDOS 2.3 data disk (single density, 10 sectors of 256 bytes, one side) as a DMK.
 */
function makeSingleDensityDisk(): DmkFloppyDisk {
    const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_2_3, cylinders: 35, sides: 1,
        date: new Date(2026, 0, 1), bootSectors: [new Uint8Array(256)]});
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    return disk;
}

/**
 * A disk like a Model I doubler's: single density on cylinder 0 and double density after it.
 */
function makeMixedDensityDisk(): DmkFloppyDisk {
    const disk = makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, 12, 1, {cylinder0Layout: LDOS_SD_TRACK_LAYOUT});
    if (disk === undefined) {
        throw new Error("Mixed disk wasn't made");
    }
    return disk;
}

/**
 * Make a sector for a hand-built track.
 */
function makeSector(sectorNumber: number, fill: number, extras: Partial<ConvertSector> = {}): ConvertSector {
    const size = extras.size ?? 256;
    return {
        idCylinder: 0,
        idSide: 0,
        sectorNumber,
        density: Density.DOUBLE,
        size,
        data: new Uint8Array(size).fill(fill),
        dataAddressMark: DATA_ADDRESS_MARK,
        idCrcBad: false,
        dataCrcBad: false,
        ... extras,
    };
}

/**
 * Make a DMK image from hand-built tracks, laid out as the converter lays out sectors. The tracks'
 * sectors get the ID cylinder and side of the track unless the test says otherwise.
 */
function makeDmkFromTracks(tracks: ConvertTrack[], diskSize = DiskSize.FIVE_INCH): DmkFloppyDisk {
    const streams = new Map<string,TrackStream>();
    for (const track of tracks) {
        for (const sector of track.sectors) {
            if (sector.idCylinder === 0 && sector.idSide === 0) {
                sector.idCylinder = track.trackPosition.cylinderNumber;
                sector.idSide = track.trackPosition.side;
            }
        }
        streams.set(track.trackPosition.key(), synthesizeTrackStream(track, diskSize).stream);
    }
    const disk = buildDmkImage(streams, diskSize, false);
    if (disk === undefined) {
        throw new Error("DMK wasn't built");
    }
    return disk;
}

/**
 * A one-track hand-built disk, as a DMK.
 */
function makeOneTrackDisk(sectors: ConvertSector[]): DmkFloppyDisk {
    return makeDmkFromTracks([{trackPosition: new TrackPosition(0, 0), sectors, orderKnown: true}]);
}

/**
 * Read the one sector, failing the test if it's missing.
 */
function readSector(disk: FloppyDisk, cylinder: number, side: number, sector: number): SectorData {
    const sectorData = disk.readSector(SectorPosition.make(cylinder, side, sector));
    if (sectorData === undefined) {
        throw new Error(`Missing sector ${cylinder}/${side}/${sector}`);
    }
    return sectorData;
}

/**
 * A one-sector disk whose track is longer than a turn, with the sector starting just before the end of the
 * turn so that its data crosses the index, as imagers of real drives produce.
 */
function makeIndexCrossingDisk(): DmkFloppyDisk {
    const sector = makeSector(3, 0x5A, {idCylinder: 0, idSide: 0});
    const stream = new TrackStream();
    stream.pushRun(gapByte(Density.DOUBLE), 5990, Density.DOUBLE);
    const sectorStream = synthesizeTrackStream(
        {trackPosition: new TrackPosition(0, 0), sectors: [sector], orderKnown: true}, DiskSize.FIVE_INCH).stream;
    sectorStream.values.forEach((value, index) => stream.push(value, sectorStream.densities[index], sectorStream.specials[index]));
    expect(stream.slotCount).to.be.greaterThan(6250);

    const disk = buildDmkImage(new Map([["0:0", stream]]), DiskSize.FIVE_INCH, false);
    if (disk === undefined) {
        throw new Error("DMK wasn't built");
    }
    return disk;
}

/**
 * Check that a DMK that went through an HFE has the original's tracks, cut to the HFE's turn of 6,250 slots:
 * the same header but for the track length, and the same bytes in each track up to the end of the turn.
 */
function expectSameTracksInTurn(original: DmkFloppyDisk, back: DmkFloppyDisk): void {
    expect(compareFloppies(original, back).differences).to.eql([]);
    expect(back.trackLength).to.equal(128 + 6250);
    expect(back.trackCount).to.equal(original.trackCount);
    const trackCount = (original.binary.length - 16)/original.trackLength;
    for (let track = 0; track < trackCount; track++) {
        const originalStart = 16 + track*original.trackLength;
        const backStart = 16 + track*back.trackLength;
        expect(back.binary.subarray(backStart, backStart + back.trackLength))
            .to.eql(original.binary.subarray(originalStart, originalStart + back.trackLength));
    }
}

/**
 * Change the turns of an HFE's tracks, as an imager records them: each track's entry in the track list (block
 * 1) gives the length of both sides, and the reader takes the turn from it. A turn can grow only to the end of
 * the track's last block (12,544 bytes a side at 5.25 inch), whose unwritten part is blank.
 *
 * @param hfe a one-sided HFE.
 * @param sideBytes the length of a side for each cylinder.
 */
function withHfeTurns(hfe: FloppyDisk, sideBytes: (cylinder: number) => number): HfeFloppyDisk {
    const binary = hfe.binary.slice();
    const cylinderCount = binary[9];
    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        const length = 2*sideBytes(cylinder);
        binary[512 + cylinder*4 + 2] = length & 0xFF;
        binary[512 + cylinder*4 + 3] = length >> 8;
    }
    const disk = decodeHfeFloppyDisk(binary, {requireBootTrack: false});
    if (disk === undefined) {
        throw new Error("HFE didn't decode");
    }
    return disk;
}

describe("floppy image formats", () => {
    it("names formats and their extensions", () => {
        expect(FLOPPY_IMAGE_FORMATS.map(floppyImageFormatToString)).to.eql(["DMK", "JV1", "JV3", "HFE", "IMD"]);
        expect(FLOPPY_IMAGE_FORMATS.map(floppyImageFormatExtension)).to.eql([".dmk", ".jv1", ".jv3", ".hfe", ".imd"]);
        expect(floppyImageFormatFromExtension(".HFE")).to.equal(FloppyImageFormat.HFE);
        expect(floppyImageFormatFromExtension(".jv3")).to.equal(FloppyImageFormat.JV3);
        // Ambiguous between JV1 and JV3.
        expect(floppyImageFormatFromExtension(".dsk")).to.equal(undefined);
        expect(floppyImageFormatFromExtension(".bas")).to.equal(undefined);
    });

    it("identifies the format of a decoded disk", () => {
        const dmk = makeSingleDensityDisk();
        expect(floppyImageFormatOf(dmk)).to.equal(FloppyImageFormat.DMK);
        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.IMD, FloppyImageFormat.JV3, FloppyImageFormat.JV1]) {
            expect(floppyImageFormatOf(convert(dmk, format))).to.equal(format);
        }
    });
});

describe("convertFloppy", () => {
    it("copies a disk converted to its own format", () => {
        const dmk = makeSingleDensityDisk();
        for (const format of FLOPPY_IMAGE_FORMATS) {
            const disk = format === FloppyImageFormat.DMK ? dmk : convert(dmk, format);
            const copy = convert(disk, format);
            expect(copy).to.not.equal(disk);
            expect(copy.binary).to.eql(disk.binary);
            expect(floppyImageFormatOf(copy)).to.equal(format);
        }
    });

    it("makes an HFE with the header and track layout of real images", () => {
        const hfe = convert(makeSingleDensityDisk(), FloppyImageFormat.HFE);
        expect(hfe).to.be.instanceOf(HfeFloppyDisk);
        const binary = hfe.binary;
        expect(String.fromCharCode(... binary.subarray(0, 8))).to.equal("HXCPICFE");
        // Revision 0, 35 tracks, 1 side, MFM, 250 kbit/s, 300 rpm, generic Shugart DD, then 0xFF unused.
        expect(Array.from(binary.subarray(8, 18))).to.eql([0, 35, 1, 0, 250, 0, 0x2C, 0x01, 7, 0xFF]);
        // Track list at block 1, write allowed, single step.
        expect(Array.from(binary.subarray(18, 22))).to.eql([1, 0, 0xFF, 0xFF]);
        expect(binary[100]).to.equal(0xFF);
        // The first track is at block 2, 12,500 bytes a side, which is 25,000 bytes in both.
        expect(Array.from(binary.subarray(512, 520))).to.eql([2, 0, 0xA8, 0x61, 0x33, 0, 0xA8, 0x61]);
        expect(binary.length).to.equal((2 + 35*49)*512);
    });

    it("turns single-density bytes into 32 cells and double density into 16", () => {
        // A single density track, every byte of which is cells.
        const sd = convert(makeSingleDensityDisk(), FloppyImageFormat.HFE) as HfeFloppyDisk;
        const dd = convert(makeDoubleDensityDisk(), FloppyImageFormat.HFE) as HfeFloppyDisk;
        expect(sd.tracks[0].cellCount()).to.equal(100000);
        expect(dd.tracks[0].cellCount()).to.equal(100000);
        expect(sd.getGeometry().modalDataDensity).to.equal(Density.SINGLE);
        expect(dd.getGeometry().modalDataDensity).to.equal(Density.DOUBLE);
    });

    it("keeps the bytes of tracks when converting between DMK and HFE", () => {
        for (const dmk of [makeDoubleDensityDisk(), makeSingleDensityDisk(), makeMixedDensityDisk()]) {
            const hfe = convert(dmk, FloppyImageFormat.HFE);
            expect(compareFloppies(dmk, hfe).differences).to.eql([]);
            const back = convert(hfe, FloppyImageFormat.DMK) as DmkFloppyDisk;
            expectSameTracksInTurn(dmk, back);
        }
    });

    it("converts a double-density, two-sided disk between every format that can hold it", () => {
        const dmk = makeDoubleDensityDisk(35, 2);
        const formats = [FloppyImageFormat.DMK, FloppyImageFormat.JV3, FloppyImageFormat.HFE, FloppyImageFormat.IMD];
        const disks = formats.map(format => convert(dmk, format));
        for (const from of disks) {
            for (const format of formats) {
                const to = convert(from, format);
                expect(compareFloppies(dmk, to).getLosses()).to.eql([]);
                if (format === FloppyImageFormat.DMK) {
                    // The files are the same too, which is slow to check.
                    expect(compareFloppyFileSystems(dmk, to)?.differences).to.eql([]);
                }
            }
        }

        // Sectors in their physical order are kept through every format.
        for (const disk of disks) {
            expect(readConvertTracks(disk)[5].sectors.map(sector => sector.sectorNumber))
                .to.eql(readConvertTracks(dmk)[5].sectors.map(sector => sector.sectorNumber));
        }
    });

    it("refuses to put a double-density disk in a JV1", () => {
        const result = convertFloppy(makeDoubleDensityDisk(), FloppyImageFormat.JV1);
        expect(result).to.be.a("string");
        expect(result).to.contain("ten 256-byte sectors");
    });

    it("converts a single-density disk to every format", () => {
        const jv1 = makeTrsdos23TestDisk([{name: "HELLO/TXT",
            extents: [{lump: 1, granuleOffset: 0, granuleCount: 2}], size: 1000}]);
        expect(floppyImageFormatOf(jv1)).to.equal(FloppyImageFormat.JV1);
        for (const format of FLOPPY_IMAGE_FORMATS) {
            const result = convert(jv1, format);
            expect(floppyImageFormatOf(result)).to.equal(format);
            const comparison = compareFloppies(jv1, result);
            // IMD can't record the directory's 0xFA mark, only that it's deleted.
            const expectedLosses = format === FloppyImageFormat.IMD ? ["DATA_MARK"] : [];
            expect(new Set(lossKinds(jv1, result))).to.eql(new Set(expectedLosses));
            expect(comparison.getLosses().length).to.equal(format === FloppyImageFormat.IMD ? 10 : 0);
            expect(compareFloppyFileSystems(jv1, result)?.differences).to.eql([]);
        }
    });

    it("interleaves the sectors of a JV1 disk like TRSDOS 2.3 when making raw tracks", () => {
        const jv1 = makeTrsdos23TestDisk([]);
        const dmk = convert(jv1, FloppyImageFormat.DMK);
        const order = readConvertTracks(dmk)[3].sectors.map(sector => sector.sectorNumber);
        expect(order).to.eql([0, 5, 1, 6, 2, 7, 3, 8, 4, 9]);
        // The order isn't a difference, because JV1 doesn't say.
        expect(compareFloppies(jv1, dmk).differences).to.eql([]);
    });

    it("round-trips JV3 and IMD files byte for byte", () => {
        const dmk = makeDoubleDensityDisk();
        for (const format of [FloppyImageFormat.JV3, FloppyImageFormat.IMD]) {
            const first = convert(dmk, format);
            const second = convert(convert(first, FloppyImageFormat.DMK), format);
            expect(second.binary).to.eql(first.binary);
        }
    });

    it("round-trips JV1 files byte for byte", () => {
        const jv1 = makeTrsdos23TestDisk([]);
        const back = convert(convert(jv1, FloppyImageFormat.HFE), FloppyImageFormat.JV1);
        expect(back.binary).to.eql(jv1.binary);
    });

    it("keeps single density on cylinder 0 and double density after it", () => {
        const dmk = makeMixedDensityDisk();
        for (const format of [FloppyImageFormat.JV3, FloppyImageFormat.HFE, FloppyImageFormat.IMD]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            const geometry = result.getGeometry();
            expect(geometry.cylinder0Differs).to.equal(true);
            expect(geometry.getTrack(new TrackPosition(0, 0))?.modalDensity).to.equal(Density.SINGLE);
            expect(geometry.getTrack(new TrackPosition(5, 0))?.modalDensity).to.equal(Density.DOUBLE);
        }
    });
});

describe("tracks from imagers", () => {
    it("continues a sector that crosses the index at the start of the HFE track", () => {
        const dmk = makeIndexCrossingDisk();
        expect(dmk.trackLength).to.be.greaterThan(0x1900);
        expect(readSector(dmk, 0, 0, 3).data.every(value => value === 0x5A)).to.equal(true);

        const hfe = convert(dmk, FloppyImageFormat.HFE) as HfeFloppyDisk;
        expect(hfe.tracks[0].cellCount()).to.equal(100000);
        expect(compareFloppies(dmk, hfe).getLosses()).to.eql([]);
        expect(readSector(hfe, 0, 0, 3).crcError).to.equal(false);

        // And back, with a track long enough to hold the sector without wrapping it, which is longer than
        // the HFE's turn.
        const back = convert(hfe, FloppyImageFormat.DMK) as DmkFloppyDisk;
        expect(back.trackLength).to.be.greaterThan(128 + 6250);
        expect(compareFloppies(dmk, back).getLosses()).to.eql([]);
    });

    it("makes a DMK track as long as the usual turn of an HFE", () => {
        // A Model I/III dual-boot disk: a single-density sector 0 and a double-density sector 1 on cylinder 0,
        // then five single-density sectors of 512 bytes on each track.
        const tracks: ConvertTrack[] = [{trackPosition: new TrackPosition(0, 0), orderKnown: true, sectors: [
            makeSector(0, 0x10, {density: Density.SINGLE}),
            makeSector(1, 0x11),
        ]}];
        for (let cylinder = 1; cylinder < 6; cylinder++) {
            tracks.push({trackPosition: new TrackPosition(cylinder, 0), orderKnown: true,
                sectors: [0, 1, 2, 3, 4].map(sector =>
                    makeSector(sector, cylinder*16 + sector, {density: Density.SINGLE, size: 512}))});
        }
        const hfe = convert(makeDmkFromTracks(tracks), FloppyImageFormat.HFE);

        // Turns of 12,476 to 12,484 bytes a side (6,238 to 6,242 slots), with a longer track 0.
        const sides = [12544, 12480, 12476, 12484, 12478, 12482];
        const imaged = withHfeTurns(hfe, cylinder => sides[cylinder]);
        expect(imaged.tracks.map(track => track.cellCount()/16)).to.eql([6272, 6240, 6238, 6242, 6239, 6241]);

        // The median turn (with six, the upper of the middle two), not the longest, and not rounded up to a
        // multiple of 16.
        const dmk = convert(imaged, FloppyImageFormat.DMK) as DmkFloppyDisk;
        expect(dmk.trackLength).to.equal(128 + 6241);
        expect(compareFloppies(imaged, dmk).getLosses()).to.eql([]);
        expect(readSector(dmk, 0, 0, 0).density).to.equal(Density.SINGLE);
        expect(readSector(dmk, 0, 0, 1).density).to.equal(Density.DOUBLE);
        expect(readSector(dmk, 0, 0, 1).data.every(value => value === 0x11)).to.equal(true);
        expect(readSector(dmk, 5, 0, 4).data.every(value => value === 5*16 + 4)).to.equal(true);

        // A track made from sectors has no turn, so it gets the usual length.
        expect((convert(convert(imaged, FloppyImageFormat.JV3), FloppyImageFormat.DMK) as DmkFloppyDisk).trackLength)
            .to.equal(0x1900);
    });

    it("gives no marks to pointers that aren't ID fields", () => {
        const sectors = [makeSector(0, 0xFE), makeSector(1, 0xFE)];
        const dmk = makeOneTrackDisk(sectors);
        const binary = dmk.binary.slice();

        // Add pointers to bytes inside the data of the first sector: one to a 0xFE, which is the sector's data, and
        // one to a byte that isn't. The table is ascending, so they go between the two real ones.
        const pointers = [binary[16], binary[17], binary[18], binary[19]];
        const firstOffset = pointers[0] | ((pointers[1] & 0x3F) << 8);
        const junk1 = firstOffset + 60;
        const junk2 = firstOffset + 100;
        binary.set([pointers[0], pointers[1], junk1 & 0xFF, 0x80 | (junk1 >> 8), junk2 & 0xFF, 0x80 | (junk2 >> 8),
            pointers[2], pointers[3]], 16);
        const withJunk = decodeDmkFloppyDisk(binary, {requireBootTrack: false})!;
        expect(withJunk.getGeometry().sectorInfos).to.have.length(4);

        const hfe = convert(withJunk, FloppyImageFormat.HFE);
        // The data of the real sectors is untouched, and only the junk is not kept.
        expect(readSector(hfe, 0, 0, 0).data.every(value => value === 0xFE)).to.equal(true);
        expect(readSector(hfe, 0, 0, 1).data.every(value => value === 0xFE)).to.equal(true);
        expect(compareFloppies(withJunk, hfe).getLosses().map(difference => FloppyDifferenceKind[difference.kind]))
            .to.eql(["ID_CRC_ERROR", "ID_CRC_ERROR"]);
    });

    it("reads a sector number that repeats in both densities the same in HFE as in DMK", () => {
        // A dual-boot track, with the same sector number in single and double density.
        const dmk = makeOneTrackDisk([
            makeSector(1, 0x11, {density: Density.SINGLE}),
            makeSector(2, 0x12, {density: Density.SINGLE}),
            makeSector(1, 0x21),
            makeSector(2, 0x22),
        ]);
        const hfe = convert(dmk, FloppyImageFormat.HFE);
        expect(compareFloppies(dmk, hfe).getLosses()).to.eql([]);
        for (const sectorNumber of [1, 2]) {
            expect(readSector(hfe, 0, 0, sectorNumber).data[0]).to.equal(readSector(dmk, 0, 0, sectorNumber).data[0]);
            expect(readSector(hfe, 0, 0, sectorNumber).density).to.equal(Density.DOUBLE);
        }

        // JV3 can't hold two sectors with the same position.
        const jv3 = convert(dmk, FloppyImageFormat.JV3);
        expect(lossKinds(dmk, jv3)).to.eql(["MISSING_SECTOR", "MISSING_SECTOR"]);
    });

    it("leaves out sector numbers that JV3 can't hold", () => {
        const dmk = makeOneTrackDisk([makeSector(1, 0x11), makeSector(40, 0x22), makeSector(129, 0x33)]);
        const jv3 = convert(dmk, FloppyImageFormat.JV3);
        expect(jv3.getGeometry().sectorInfos.map(info => info.sectorPosition.sectorNumber)).to.eql([1]);
        expect(compareFloppies(dmk, jv3).getLosses().map(difference => difference.sectorNumber)).to.eql([40, 129]);
    });
});

describe("loss kinds", () => {
    it("have names, and only the information they lose count as losses", () => {
        const kinds = Object.values(FloppyDifferenceKind).filter(value => typeof value === "number") as FloppyDifferenceKind[];
        expect(kinds).to.have.length(13);
        for (const kind of kinds) {
            expect(floppyDifferenceKindToString(kind)).to.not.equal("");
        }
        expect(kinds.filter(floppyDifferenceKindIsLoss).map(kind => FloppyDifferenceKind[kind]))
            .to.not.include.members(["SECTOR_ORDER", "EXTRA_SECTOR", "TRACK_LAYOUT"]);
    });
});

describe("what a format can't hold", () => {
    it("keeps both densities on one track in DMK, HFE and JV3 but not IMD", () => {
        const dmk = makeOneTrackDisk([
            makeSector(1, 0x11, {density: Density.SINGLE, size: 128}),
            makeSector(2, 0x22, {density: Density.SINGLE, size: 128}),
            makeSector(3, 0x33),
            makeSector(4, 0x44),
            makeSector(5, 0x55),
        ]);
        expect(dmk.getGeometry().trackMap.get("0:0")?.mixedDensity).to.equal(true);

        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.JV3]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            expect(readSector(result, 0, 0, 2).density).to.equal(Density.SINGLE);
            expect(readSector(result, 0, 0, 4).density).to.equal(Density.DOUBLE);
        }
        const hfeBack = convert(convert(dmk, FloppyImageFormat.HFE), FloppyImageFormat.DMK) as DmkFloppyDisk;
        expectSameTracksInTurn(dmk, hfeBack);

        // IMD keeps the more common density of the track.
        const imd = convert(dmk, FloppyImageFormat.IMD);
        const comparison = compareFloppies(dmk, imd);
        expect(comparison.getLosses().map(difference => difference.kind))
            .to.eql([FloppyDifferenceKind.MISSING_SECTOR, FloppyDifferenceKind.MISSING_SECTOR]);
        expect(comparison.getLosses().map(difference => difference.sectorNumber)).to.eql([1, 2]);
    });

    it("keeps deleted marks, except for JV1 away from the directory cylinder", () => {
        const dmk = makeDmkFromTracks([
            {trackPosition: new TrackPosition(3, 0), orderKnown: true, sectors: [
                makeSector(0, 0x10, {density: Density.SINGLE, dataAddressMark: DELETED_DATA_ADDRESS_MARK}),
                makeSector(1, 0x11, {density: Density.SINGLE, dataAddressMark: USER_DATA_ADDRESS_MARK_FA}),
                makeSector(2, 0x12, {density: Density.SINGLE}),
            ]},
        ]);

        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.JV3]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            expect(readSector(result, 3, 0, 0).getDataAddressMark()).to.equal(DELETED_DATA_ADDRESS_MARK);
            expect(readSector(result, 3, 0, 1).getDataAddressMark()).to.equal(USER_DATA_ADDRESS_MARK_FA);
            expect(readSector(result, 3, 0, 2).getDataAddressMark()).to.equal(DATA_ADDRESS_MARK);
        }

        // IMD keeps whether it's deleted, not which deleted mark.
        const imd = convert(dmk, FloppyImageFormat.IMD);
        expect(readSector(imd, 3, 0, 1).deleted).to.equal(true);
        expect(compareFloppies(dmk, imd).getLosses().map(difference => FloppyDifferenceKind[difference.kind]))
            .to.eql(["DATA_MARK"]);

        // JV1 has the 0xFA mark on cylinder 17 only, so these (on cylinder 3) are normal. The track has
        // only three sectors, so the other cylinder 3 sectors are added.
        const jv1 = convert(dmk, FloppyImageFormat.JV1);
        expect(readSector(jv1, 3, 0, 0).deleted).to.equal(false);
        const comparison = compareFloppies(dmk, jv1);
        expect(comparison.getLosses().map(difference => FloppyDifferenceKind[difference.kind]))
            .to.eql(["DELETED_MARK", "DELETED_MARK"]);
        expect(comparison.differences.filter(difference => difference.kind === FloppyDifferenceKind.EXTRA_SECTOR))
            .to.have.length(37);
    });

    it("keeps CRC errors in DMK, HFE, JV3 and IMD, but not JV1", () => {
        const dmk = makeOneTrackDisk([
            makeSector(0, 0x10, {density: Density.SINGLE, size: 256}),
            makeSector(1, 0x11, {density: Density.SINGLE, size: 256, dataCrcBad: true}),
        ]);
        expect(readSector(dmk, 0, 0, 1).crcError).to.equal(true);

        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.JV3, FloppyImageFormat.IMD]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            expect(readSector(result, 0, 0, 1).crcError).to.equal(true);
            expect(readSector(result, 0, 0, 0).crcError).to.equal(false);
        }

        const jv1 = convert(dmk, FloppyImageFormat.JV1);
        expect(lossKinds(dmk, jv1)).to.eql(["DATA_CRC_ERROR"]);
    });

    it("keeps sectors with bad ID CRCs in DMK and HFE only", () => {
        const dmk = makeOneTrackDisk([
            makeSector(0, 0x10),
            makeSector(1, 0x11, {idCrcBad: true}),
            makeSector(2, 0x12),
        ]);

        const hfe = convert(dmk, FloppyImageFormat.HFE);
        expect(compareFloppies(dmk, hfe).getLosses()).to.eql([]);

        for (const format of [FloppyImageFormat.JV3, FloppyImageFormat.IMD]) {
            const result = convert(dmk, format);
            expect(lossKinds(dmk, result)).to.eql(["ID_CRC_ERROR"]);
            expect(result.getGeometry().sectorInfos.map(info => info.sectorPosition.sectorNumber)).to.eql([0, 2]);
        }
    });

    it("keeps IDs that disagree with their position in DMK, HFE and IMD, but not JV3", () => {
        // A MultiDOS-style side 1 whose sectors say they are on side 0, and a sector with another cylinder.
        const dmk = makeDmkFromTracks([
            {trackPosition: new TrackPosition(2, 1), orderKnown: true, sectors: [
                makeSector(0, 0x10, {idCylinder: 2, idSide: 0}),
                makeSector(1, 0x11, {idCylinder: 9, idSide: 0}),
            ]},
        ]);

        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.IMD]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            expect(readSector(result, 2, 1, 1).sectorPosition.key()).to.equal("9:0:1");
        }

        const jv3 = convert(dmk, FloppyImageFormat.JV3);
        expect(lossKinds(dmk, jv3)).to.eql(["ID_FIELDS", "ID_FIELDS"]);
    });

    it("keeps IDs with no data in DMK and IMD only", () => {
        const dmk = makeOneTrackDisk([
            makeSector(0, 0x10),
            makeSector(1, 0x11, {data: undefined}),
            makeSector(2, 0x12),
        ]);
        expect(dmk.readSector(SectorPosition.make(0, 0, 1))).to.equal(undefined);

        const imd = convert(dmk, FloppyImageFormat.IMD);
        expect(compareFloppies(dmk, imd).getLosses()).to.eql([]);
        expect((imd as ImdFloppyDisk).tracks[0].sectors.map(sector => sector.hasData())).to.eql([true, false, true]);

        // HFE needs the data mark to see the ID, and JV3 has no entry without data.
        for (const format of [FloppyImageFormat.HFE, FloppyImageFormat.JV3]) {
            const result = convert(dmk, format);
            expect(lossKinds(dmk, result)).to.eql(["MISSING_SECTOR"]);
        }
    });

    it("drops duplicate sector numbers that JV3 can't hold", () => {
        const dmk = makeOneTrackDisk([makeSector(0, 0x10), makeSector(0, 0x11), makeSector(1, 0x12)]);
        const jv3 = convert(dmk, FloppyImageFormat.JV3);
        expect(lossKinds(dmk, jv3)).to.eql(["MISSING_SECTOR"]);
        expect(readSector(jv3, 0, 0, 0).data[0]).to.equal(0x10);

        const imd = convert(dmk, FloppyImageFormat.IMD);
        expect(compareFloppies(dmk, imd).getLosses()).to.eql([]);
    });

    it("keeps different sector sizes on a track in an IMD size table", () => {
        const dmk = makeOneTrackDisk([
            makeSector(0, 0x10, {size: 128}),
            makeSector(1, 0x11, {size: 1024}),
            makeSector(2, 0x12, {size: 512}),
        ]);
        for (const format of [FloppyImageFormat.IMD, FloppyImageFormat.JV3, FloppyImageFormat.HFE]) {
            const result = convert(dmk, format);
            expect(compareFloppies(dmk, result).getLosses()).to.eql([]);
            expect(readSector(result, 0, 0, 1).data.length).to.equal(1024);
        }
    });

    it("reports what raw tracks lose when going to a sector format", () => {
        const dmk = makeDoubleDensityDisk(35, 1);
        const jv3 = convert(dmk, FloppyImageFormat.JV3);
        const comparison = compareFloppies(dmk, jv3);
        expect(comparison.hasLoss()).to.equal(false);
        const groups = comparison.groupByKind();
        expect(groups.map(group => group.kind)).to.eql([FloppyDifferenceKind.TRACK_LAYOUT]);
        expect(groups[0].differences.length).to.equal(35);

        // Nothing for the other direction.
        expect(compareFloppies(jv3, dmk).differences).to.eql([]);
    });

    it("reports a file system difference when file contents differ", () => {
        const jv1 = makeTrsdos23TestDisk([{name: "HELLO/TXT",
            extents: [{lump: 1, granuleOffset: 0, granuleCount: 2}], size: 1000}]);
        const dmk = convert(jv1, FloppyImageFormat.DMK);
        expect(compareFloppyFileSystems(jv1, dmk)).to.not.equal(undefined);
        expect(compareFloppyFileSystems(jv1, dmk)?.fileCount).to.equal(3);
        expect(compareFloppyFileSystems(jv1, dmk)?.differences).to.eql([]);

        // Change a byte of the file in the copy.
        const sector = readSector(dmk, 1, 0, 0);
        sector.data[5] ^= 0xFF;
        dmk.writeSector(sector.sectorPosition, sector);
        const comparison = compareFloppyFileSystems(jv1, dmk);
        expect(comparison?.differences).to.eql(["HELLO/TXT has different contents, starting at byte 5."]);
    });

    it("returns nothing to compare for a disk with no file system", () => {
        const blank = makeBlankFloppy(LDOS_SD_TRACK_LAYOUT, 5, 1)!;
        expect(compareFloppyFileSystems(blank, blank)).to.equal(undefined);
    });
});

describe("8-inch disks", () => {
    it("uses the larger track and the 500 kbit/s rate", () => {
        // 26 double-density sectors of 256 bytes need more than a 5.25-inch turn.
        const sectors = Array.from({length: 26}, (_, i) => makeSector(i + 1, i));
        const dmk = makeDmkFromTracks([{trackPosition: new TrackPosition(0, 0), orderKnown: true, sectors}],
            DiskSize.EIGHT_INCH);
        expect(dmk.trackLength).to.equal(0x2940);

        const imd = convert(dmk, FloppyImageFormat.IMD) as ImdFloppyDisk;
        expect(imd.tracks[0].mode).to.equal(3);
        const hfe = convert(imd, FloppyImageFormat.HFE) as HfeFloppyDisk;
        expect(hfe.binary[12] | (hfe.binary[13] << 8)).to.equal(500);
        expect(hfe.binary[14] | (hfe.binary[15] << 8)).to.equal(360);
        expect(compareFloppies(imd, hfe).getLosses()).to.eql([]);
        const jv3 = convert(imd, FloppyImageFormat.JV3);
        const back = convert(jv3, FloppyImageFormat.DMK) as DmkFloppyDisk;
        expect(back.trackLength).to.equal(0x2940);
        expect(compareFloppies(dmk, back).getLosses()).to.eql([]);
    });
});
