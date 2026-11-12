import {describe, expect, it} from "vitest";
import {findProtectionSigns} from "./CopyProtection.js";
import {makeBlankFloppy} from "./DmkBuilder.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk, TRACK_HEADER_SIZE} from "./DmkFloppyDisk.js";
import {
    addDmkId, cutDmkReads, setDmkConverterCrcMarker, setDmkSyncByte, startDmkReadLate,
} from "./DmkTestArtifacts.js";
import {Density, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {findImagingArtifacts, findSectorArtifactKind, ImagingArtifactKind} from "./ImagingArtifacts.js";
import {LSDOS_DD_TRACK_LAYOUT, TRSDOS_23_TRACK_LAYOUT, type TrackLayout} from "./TrackLayout.js";

const CYLINDERS = 10;

/**
 * A blank single-sided DMK disk of ten cylinders, formatted with the layout.
 */
function blank(layout: TrackLayout = LSDOS_DD_TRACK_LAYOUT): DmkFloppyDisk {
    const floppy = makeBlankFloppy(layout, CYLINDERS, 1);
    if (floppy === undefined) {
        throw new Error("Can't make the blank disk");
    }
    return floppy;
}

/**
 * The IDs of a track in the order they are on it: where each is (bytes from the start of the track, a
 * doubled single-density byte counting once) and its sector number.
 */
function trackIds(floppy: DmkFloppyDisk, cylinder: number): {position: number, sectorNumber: number}[] {
    const track = floppy.tracks.find(track => track.trackPosition.equals(new TrackPosition(cylinder, 0)))!;
    return [...track.sectors].sort((a, b) => a.offset - b.offset).map(sector => ({
        position: (sector.offset - TRACK_HEADER_SIZE)/sector.getByteStride(),
        sectorNumber: sector.getSectorNumber(),
    }));
}

/**
 * The kinds of the artifacts on a floppy.
 */
function kinds(floppy: DmkFloppyDisk): ImagingArtifactKind[] {
    return findImagingArtifacts(floppy).map(artifact => artifact.kind);
}

/**
 * Where the last sector's data field starts on a track, in bytes from the start of the track.
 */
function lastDataStart(floppy: DmkFloppyDisk, cylinder: number): number {
    const track = floppy.tracks.find(track => track.trackPosition.equals(new TrackPosition(cylinder, 0)))!;
    const last = [...track.sectors].sort((a, b) => a.offset - b.offset).at(-1)!;
    return last.offset + last.dataIndex! - TRACK_HEADER_SIZE;
}

/**
 * Spoil the CRC of one ID of a track, by changing its sector number, as damage does.
 *
 * @param floppy the image, which isn't changed.
 * @param cylinder the track's cylinder, on side 0.
 * @param index which ID, in the order they are on the track.
 */
function spoilId(floppy: DmkFloppyDisk, cylinder: number, index: number): DmkFloppyDisk {
    const track = floppy.tracks.find(track => track.trackPosition.equals(new TrackPosition(cylinder, 0)))!;
    const sector = [...track.sectors].sort((a, b) => a.offset - b.offset)[index];
    const binary = new Uint8Array(floppy.binary);
    binary[track.offset + sector.offset + 3*sector.getByteStride()] ^= 0x40;
    const decoded = decodeDmkFloppyDisk(binary, {requireBootTrack: false});
    if (decoded === undefined) {
        throw new Error("The damaged image doesn't decode");
    }
    return decoded;
}

describe("findImagingArtifacts", () => {
    it("finds nothing on a clean disk", () => {
        expect(kinds(blank())).to.eql([]);
        expect(kinds(blank(TRSDOS_23_TRACK_LAYOUT))).to.eql([]);
    });

    describe("a read that began late", () => {
        it("names the first sector of the interleave, whose ID went by before the read began", () => {
            const floppy = blank();
            const ids = trackIds(floppy, 3);
            // Lose the first ID, and move the others to less than one spacing into the track.
            const late = startDmkReadLate(floppy, new TrackPosition(3, 0), ids[0].position + 40);
            const artifacts = findImagingArtifacts(late);
            expect(artifacts.map(artifact => artifact.kind)).to.eql([ImagingArtifactKind.READ_BEGAN_LATE]);
            const missing = SectorPosition.make(3, 0, ids[0].sectorNumber);
            expect(artifacts[0].sectors).to.eql([missing]);
            expect(artifacts[0].tracks).to.eql([new TrackPosition(3, 0)]);
            expect(artifacts[0].message).to.contain(`sector ${ids[0].sectorNumber} of cylinder 3 isn't in the image`);
            expect(late.readSector(missing)).to.equal(undefined);
            expect(findSectorArtifactKind(artifacts, missing)).to.equal(ImagingArtifactKind.READ_BEGAN_LATE);
        });

        it("doesn't excuse a first sector whose ID can't be read, which leaves the others in place", () => {
            const floppy = blank();
            const ids = trackIds(floppy, 3);
            const damaged = spoilId(floppy, 3, 0);
            expect(damaged.readSector(SectorPosition.make(3, 0, ids[0].sectorNumber))).to.equal(undefined);
            expect(kinds(damaged)).to.eql([]);
        });

        it("doesn't excuse a read that began a little late but lost no sector", () => {
            const floppy = blank();
            const ids = trackIds(floppy, 3);
            const late = startDmkReadLate(floppy, new TrackPosition(3, 0), ids[0].position - 10);
            expect(kinds(late)).to.eql([]);
        });

        it("doesn't excuse a track that began late and also lost a sector in the middle", () => {
            const floppy = blank();
            const ids = trackIds(floppy, 3);
            const late = startDmkReadLate(floppy, new TrackPosition(3, 0), ids[0].position + 40);
            expect(kinds(late)).to.eql([ImagingArtifactKind.READ_BEGAN_LATE]);
            expect(kinds(spoilId(late, 3, 5))).to.eql([]);
        });
    });

    describe("a read of one revolution", () => {
        it("names the last sector of every track that the end of the read cut off", () => {
            const floppy = blank();
            const cut = lastDataStart(floppy, 1) + 200;
            const tracks = [1, 2, 3, 4].map(cylinder => new TrackPosition(cylinder, 0));
            const allCut = cutDmkReads(floppy, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => new TrackPosition(c, 0)), cut);
            const artifacts = findImagingArtifacts(allCut);
            expect(artifacts.map(artifact => artifact.kind)).to.eql([ImagingArtifactKind.READ_ONE_REVOLUTION]);
            expect(artifacts[0].sectors.length).to.equal(CYLINDERS);
            for (const track of tracks) {
                const last = trackIds(floppy, track.cylinderNumber).at(-1)!;
                const position = new SectorPosition(track, last.sectorNumber);
                expect(allCut.readSector(position)!.crc!.dataCrc.written).to.equal(0x4E4E);
                expect(findSectorArtifactKind(artifacts, position)).to.equal(ImagingArtifactKind.READ_ONE_REVOLUTION);
            }
            expect(artifacts[0].message).to.contain("its CRC reads 4E 4E");
        });

        it("needs three tracks cut at the same place", () => {
            const floppy = blank();
            const cut = lastDataStart(floppy, 1) + 200;
            const twoCut = cutDmkReads(floppy, [1, 2].map(cylinder => new TrackPosition(cylinder, 0)), cut);
            expect(kinds(twoCut)).to.eql([]);
        });

        it("doesn't excuse cut tracks when another track has bytes well past the cut", () => {
            const floppy = blank();
            const cut = lastDataStart(floppy, 1) + 100;
            const someCut = cutDmkReads(floppy, [1, 2, 3, 4].map(cylinder => new TrackPosition(cylinder, 0)), cut);
            // Track 5 is whole: its last sector's data and CRC run well past the cut.
            expect(kinds(someCut)).to.eql([]);
        });
    });

    describe("a converter's CRC marker", () => {
        it("names a sector whose stored CRC is the data's with its low byte inverted", () => {
            for (const layout of [LSDOS_DD_TRACK_LAYOUT, TRSDOS_23_TRACK_LAYOUT]) {
                const position = SectorPosition.make(4, 0, 2);
                const marked = setDmkConverterCrcMarker(blank(layout), position);
                expect(marked.readSector(position)!.crcError).to.equal(true);
                const artifacts = findImagingArtifacts(marked);
                expect(artifacts.map(artifact => artifact.kind)).to.eql([ImagingArtifactKind.CONVERTER_CRC_MARKER]);
                expect(artifacts[0].sectors).to.eql([position]);
                expect(artifacts[0].message).to.contain("sector 2 of cylinder 4");
            }
        });

        it("groups the sectors by track in its message", () => {
            let floppy = blank();
            for (const sectorNumber of [0, 1, 2, 3]) {
                floppy = setDmkConverterCrcMarker(floppy, SectorPosition.make(5, 0, sectorNumber));
            }
            floppy = setDmkConverterCrcMarker(floppy, SectorPosition.make(6, 0, 7));
            expect(findImagingArtifacts(floppy)[0].message).to.contain("sectors 0-3 of cylinder 5 and sector 7 of cylinder 6");
        });

        it("doesn't name other bad CRCs, such as the ones our converter writes", () => {
            const marked = setDmkConverterCrcMarker(blank(), SectorPosition.make(4, 0, 2), 0x0001);
            expect(marked.readSector(SectorPosition.make(4, 0, 2))!.crcError).to.equal(true);
            expect(kinds(marked)).to.eql([]);
        });
    });
});

describe("artifacts that the readers already ignore", () => {
    it("ignores a garbled ID decoded from past the index, with a bad CRC and no data", () => {
        const floppy = blank(TRSDOS_23_TRACK_LAYOUT);
        const before = floppy.getGeometry().getTrack(new TrackPosition(2, 0))!.sectorNumbers;
        const garbled = addDmkId(floppy, new TrackPosition(2, 0), 3127, [0xFE, 0x02, 0xDA, 0x37, 0x6F, 0xC5, 0x00],
            Density.SINGLE);
        expect(trackIds(garbled, 2).length).to.equal(trackIds(floppy, 2).length + 1);
        expect(garbled.getGeometry().getTrack(new TrackPosition(2, 0))!.sectorNumbers).to.eql(before);
        expect(findProtectionSigns(garbled, undefined)).to.eql([]);
        expect(kinds(garbled)).to.eql([]);
    });

    it("computes the CRC with 0xA1 sync bytes whatever the image stores", () => {
        const position = SectorPosition.make(3, 0, 5);
        for (const value of [0x14, 0x15, 0xA9]) {
            const odd = setDmkSyncByte(blank(), position, value);
            expect(odd.binary).not.to.eql(blank().binary);
            expect(odd.readSector(position)!.crcError).to.equal(false);
        }
    });
});
