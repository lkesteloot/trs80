import {describe, it, expect} from "vitest";
import {Density, FloppyDiskGeometry, SectorInfo, SectorPosition, TrackPosition} from "./FloppyDisk.js";

/**
 * One track to build: where it is, what density, and the sector numbers on it.
 */
interface TrackSpec {
    cylinder: number;
    side: number;
    sectorNumbers: number[];
    density?: Density;
}

/**
 * Makes a list of integers from first to last, inclusive.
 */
function range(first: number, last: number): number[] {
    const numbers: number[] = [];
    for (let i = first; i <= last; i++) {
        numbers.push(i);
    }
    return numbers;
}

/**
 * Makes the geometry of a disk from track specs. Every sector is 256 bytes, has a good ID CRC
 * (there's no CRC information at all), and is double density unless the track says otherwise.
 */
function makeGeometry(tracks: TrackSpec[]): FloppyDiskGeometry {
    const sectorInfos: SectorInfo[] = [];
    let cylinderCount = 0;
    let sideCount = 1;
    for (const track of tracks) {
        cylinderCount = Math.max(cylinderCount, track.cylinder + 1);
        sideCount = Math.max(sideCount, track.side + 1);
        for (const sectorNumber of track.sectorNumbers) {
            const position = new SectorPosition(new TrackPosition(track.cylinder, track.side), sectorNumber);
            sectorInfos.push(new SectorInfo(position, track.density ?? Density.DOUBLE, 256));
        }
    }
    return FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos)!;
}

/**
 * Makes side 0 tracks for cylinders 1 through 4 with the given sector numbers.
 */
function makeOtherTracks(sectorNumbers: number[]): TrackSpec[] {
    return range(1, 4).map(cylinder => ({cylinder, side: 0, sectorNumbers}));
}

describe("FloppyDiskGeometry expected sector ranges", () => {
    it("ignores stray IDs far outside the numbering", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [... range(0, 3), ... range(5, 9), 124, 125, 126]},
            ... makeOtherTracks(range(0, 9)),
        ]);
        const trackPosition = new TrackPosition(0, 0);
        const track = geometry.getTrack(trackPosition)!;
        expect(track.firstSectorNumber).to.eql(0);
        expect(track.lastSectorNumber).to.eql(126);
        expect(track.coreFirstSectorNumber).to.eql(0);
        expect(track.coreLastSectorNumber).to.eql(9);
        expect(track.sectorNumbers).to.eql([... range(0, 3), ... range(5, 9), 124, 125, 126]);
        expect(geometry.getExpectedSectorRange(trackPosition)).to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
    });

    it("returns undefined for a track that doesn't exist", () => {
        const geometry = makeGeometry([{cylinder: 0, side: 0, sectorNumbers: range(0, 9)}]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(5, 0))).to.eql(undefined);
    });

    it("ignores a stray 255 on a 0-17 track", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [... range(0, 15), 17, 255]},
            ... makeOtherTracks(range(0, 17)),
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(0, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 17});
    });

    it("ignores several junk extra IDs", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [... range(0, 18), 37, 73, 121, 238]},
            ... makeOtherTracks(range(1, 18)),
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(0, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 18});
        // The most common range among the other tracks is 1-18, and track 0's own 0 doesn't widen them.
        expect(geometry.getExpectedSectorRange(new TrackPosition(1, 0)))
            .to.eql({firstSectorNumber: 1, lastSectorNumber: 18});
    });

    it("ignores a lone extra ID a few numbers past the run", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(1, 18)},
            {cylinder: 1, side: 0, sectorNumbers: range(1, 18)},
            {cylinder: 2, side: 0, sectorNumbers: [... range(0, 18), 23]},
            {cylinder: 3, side: 0, sectorNumbers: range(1, 18)},
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 18});
    });

    it("reports a long run of missing sectors inside a damaged track", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 1, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 2, side: 0, sectorNumbers: [... range(0, 2), ... range(7, 9)]},
            {cylinder: 3, side: 0, sectorNumbers: range(0, 9)},
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
    });

    it("lets a boot track of the same density have its own layout", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [0, 1]},
            ... makeOtherTracks(range(0, 9)),
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(0, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 1});
    });

    it("reports the missing last sectors of a damaged track", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 1, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 2, side: 0, sectorNumbers: range(0, 6)},
            {cylinder: 3, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 4, side: 0, sectorNumbers: range(0, 9)},
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
    });

    it("keeps a side numbered differently from merging with the other side", () => {
        const tracks: TrackSpec[] = [];
        for (let cylinder = 0; cylinder < 5; cylinder++) {
            tracks.push({cylinder, side: 0, sectorNumbers: range(0, 9)});
            tracks.push({cylinder, side: 1, sectorNumbers: range(10, 19)});
        }
        const geometry = makeGeometry(tracks);
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 1)))
            .to.eql({firstSectorNumber: 10, lastSectorNumber: 19});
    });

    it("keeps a boot track with another density separate", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(0, 9), density: Density.SINGLE},
            ... makeOtherTracks(range(0, 17)),
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(0, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
        expect(geometry.getExpectedSectorRange(new TrackPosition(1, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 17});
    });

    it("computes the sector number groups for the whole disk", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [... range(0, 3), ... range(5, 9), 124, 125, 126]},
            ... makeOtherTracks(range(0, 9)),
        ]);
        expect(geometry.firstSectorNumber).to.eql(0);
        expect(geometry.lastSectorNumber).to.eql(126);
        expect(geometry.sectorNumberGroups.length).to.eql(1);
        expect(geometry.sectorNumberGroups[0].range).to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
        expect(geometry.sectorNumberGroups[0].trackPositions.map(position => position.key()))
            .to.eql(["0:0", "1:0", "2:0", "3:0", "4:0"]);
    });

    it("keeps a track numbered apart from its group to its own range", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(1, 18)},
            ... makeOtherTracks(range(1, 18)),
            {cylinder: 5, side: 0, sectorNumbers: range(129, 146)},
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(5, 0)))
            .to.eql({firstSectorNumber: 129, lastSectorNumber: 146});
        expect(geometry.getExpectedSectorRange(new TrackPosition(1, 0)))
            .to.eql({firstSectorNumber: 1, lastSectorNumber: 18});
        expect(geometry.sectorNumberGroups.length).to.eql(2);
    });

    it("gives a complete 0-17 track among 1-18 tracks its own group", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(1, 18)},
            ... makeOtherTracks(range(1, 18)),
            {cylinder: 5, side: 0, sectorNumbers: range(0, 17)},
        ]);
        expect(geometry.getExpectedSectorRange(new TrackPosition(5, 0)))
            .to.eql({firstSectorNumber: 0, lastSectorNumber: 17});
        expect(geometry.getExpectedSectorRange(new TrackPosition(2, 0)))
            .to.eql({firstSectorNumber: 1, lastSectorNumber: 18});
        expect(geometry.sectorNumberGroups.length).to.eql(2);
        const group = geometry.getSectorNumberGroup(new TrackPosition(5, 0))!;
        expect(group.trackPositions.map(position => position.key())).to.eql(["5:0"]);
        expect(group).not.to.equal(geometry.getSectorNumberGroup(new TrackPosition(1, 0)));
    });

    it("orders the groups by their first track", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: range(0, 9), density: Density.SINGLE},
            ... makeOtherTracks(range(1, 18)),
            {cylinder: 5, side: 0, sectorNumbers: range(129, 146)},
        ]);
        const groups = geometry.sectorNumberGroups;
        expect(groups.length).to.eql(3);
        expect(groups[0].range).to.eql({firstSectorNumber: 0, lastSectorNumber: 9});
        expect(groups[0].density).to.eql(Density.SINGLE);
        expect(groups[0].trackPositions.map(position => position.key())).to.eql(["0:0"]);
        expect(groups[1].range).to.eql({firstSectorNumber: 1, lastSectorNumber: 18});
        expect(groups[1].density).to.eql(Density.DOUBLE);
        expect(groups[1].trackPositions.map(position => position.key())).to.eql(["1:0", "2:0", "3:0", "4:0"]);
        expect(groups[2].range).to.eql({firstSectorNumber: 129, lastSectorNumber: 146});
        expect(groups[2].trackPositions.map(position => position.key())).to.eql(["5:0"]);
    });

    it("makes one group when both sides are numbered alike", () => {
        const tracks: TrackSpec[] = [];
        for (let cylinder = 0; cylinder < 3; cylinder++) {
            tracks.push({cylinder, side: 0, sectorNumbers: range(1, 10)});
            tracks.push({cylinder, side: 1, sectorNumbers: range(1, 10)});
        }
        const geometry = makeGeometry(tracks);
        expect(geometry.sectorNumberGroups.length).to.eql(1);
        expect(geometry.sectorNumberGroups[0].trackPositions.map(position => position.key()))
            .to.eql(["0:0", "0:1", "1:0", "1:1", "2:0", "2:1"]);
    });
});

/**
 * Makes the geometry of a disk with a boot track and two sector infos at the same position.
 *
 * @param firstHasData whether the first copy of the sector has a data field.
 * @param secondHasData whether the second copy of the sector has a data field.
 */
function makeDuplicateGeometry(firstHasData: boolean, secondHasData: boolean): FloppyDiskGeometry {
    const position = SectorPosition.make(0, 0, 3);
    const first = new SectorInfo(position, Density.DOUBLE, 256);
    first.hasDataField = firstHasData;
    const second = new SectorInfo(position, Density.DOUBLE, 256);
    second.hasDataField = secondHasData;
    return FloppyDiskGeometry.make(1, 1, [first, second])!;
}

describe("FloppyDiskGeometry duplicate sectors", () => {
    it("keeps an earlier sector with data over a later one without", () => {
        const geometry = makeDuplicateGeometry(true, false);
        expect(geometry.sectorMap.get("0:0:3")).to.equal(geometry.sectorInfos[0]);
    });

    it("replaces an earlier sector without data by a later one with", () => {
        const geometry = makeDuplicateGeometry(false, true);
        expect(geometry.sectorMap.get("0:0:3")).to.equal(geometry.sectorInfos[1]);
    });

    it("lets the later of two equal sectors win", () => {
        const geometry = makeDuplicateGeometry(true, true);
        expect(geometry.sectorMap.get("0:0:3")).to.equal(geometry.sectorInfos[1]);
    });
});

describe("FloppyDiskGeometry without a boot track", () => {
    it("has no boot track when nothing is on cylinder 0 side 0", () => {
        const geometry = makeGeometry(makeOtherTracks(range(1, 18)));
        expect(geometry.bootTrack).to.equal(undefined);
        expect(geometry.cylinder0Differs).to.equal(false);
        expect(geometry.homogeneous).to.equal(true);
        expect(geometry.modalDataDensity).to.equal(Density.DOUBLE);
        expect(geometry.modalDataSectorSize).to.equal(256);
        expect(geometry.modalDataSectorSpan).to.equal(18);
        expect(geometry.firstSectorNumber).to.equal(1);
        expect(geometry.lastSectorNumber).to.equal(18);
    });

    it("uses all tracks when only side 1 is present", () => {
        const geometry = makeGeometry([
            {cylinder: 1, side: 1, sectorNumbers: range(0, 9)},
            {cylinder: 2, side: 1, sectorNumbers: range(0, 9)},
        ]);
        expect(geometry.bootTrack).to.equal(undefined);
        expect(geometry.modalDataSectorSpan).to.equal(10);
        expect(geometry.homogeneous).to.equal(true);
    });

    it("is not homogeneous if the other tracks differ", () => {
        const geometry = makeGeometry([
            {cylinder: 1, side: 0, sectorNumbers: range(0, 9)},
            {cylinder: 2, side: 0, sectorNumbers: range(0, 17)},
        ]);
        expect(geometry.bootTrack).to.equal(undefined);
        expect(geometry.homogeneous).to.equal(false);
    });

    it("has no geometry when there are no sectors at all", () => {
        expect(FloppyDiskGeometry.make(0, 1, [])).to.equal(undefined);
    });
});
