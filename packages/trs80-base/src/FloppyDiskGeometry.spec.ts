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

    it("computes the columns for the whole disk", () => {
        const geometry = makeGeometry([
            {cylinder: 0, side: 0, sectorNumbers: [... range(0, 3), ... range(5, 9), 124, 125, 126]},
            ... makeOtherTracks(range(0, 9)),
        ]);
        expect(geometry.firstSectorNumber).to.eql(0);
        expect(geometry.lastSectorNumber).to.eql(126);
        expect(geometry.expectedFirstSectorNumber).to.eql(0);
        expect(geometry.expectedLastSectorNumber).to.eql(9);
    });
});
