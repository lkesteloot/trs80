/**
 * Finds imaging artifacts on a floppy: sectors that the imager lost or cut short, and CRCs that a converter
 * made up. They look like damage, and still are damage to the image (the data isn't there, or can't be
 * checked), but they don't say the disk itself is damaged: reimaging may well read it cleanly. This only
 * labels them; it doesn't repair anything or change what may be written. The rules come from Ira
 * Goldklang's DMK repair work (GitHub issue #48) and were checked against real images; see "Imaging
 * artifacts that look like damage" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {compareSectorPositions, describeNumbers, describeTracks} from "./CopyProtection.js";
import {DmkFloppyDisk, TRACK_HEADER_SIZE} from "./DmkFloppyDisk.js";
import {Density, FloppyDisk, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {MFM_GAP} from "./TrackBytes.js";

/**
 * The kinds of imaging artifact that {@link findImagingArtifacts} recognizes.
 */
export enum ImagingArtifactKind {
    /**
     * The imager began reading the track after the first sector of the interleave had gone by (as cw2dmk
     * did before version 4.6.0), so that sector isn't in the image. DMK only.
     */
    READ_BEGAN_LATE,

    /**
     * The imager read exactly one revolution of tracks that were written longer than that, so the last
     * sector of each lost the end of its data and its CRC, which read as the imager's 4E filler. DMK only.
     */
    READ_ONE_REVOLUTION,

    /**
     * The stored data CRC is the CRC of the data with its low byte inverted, which a converter writes for a
     * sector that its source format marked bad. Any image format that stores CRCs.
     */
    CONVERTER_CRC_MARKER,
}

/**
 * A short lowercase name for a kind of artifact, such as "read began late".
 */
export function imagingArtifactKindToString(kind: ImagingArtifactKind): string {
    switch (kind) {
        case ImagingArtifactKind.READ_BEGAN_LATE:
            return "read began late";
        case ImagingArtifactKind.READ_ONE_REVOLUTION:
            return "read of one revolution";
        case ImagingArtifactKind.CONVERTER_CRC_MARKER:
            return "converter's CRC marker";
        default:
            assertNever(kind);
    }
}

/**
 * What a kind of artifact did to one sector, as a clause that can follow "Imaging artifact: ".
 */
export function describeSectorArtifact(kind: ImagingArtifactKind): string {
    switch (kind) {
        case ImagingArtifactKind.READ_BEGAN_LATE:
            return "the read of this track began late, after this sector had gone by, so it isn't in the image";
        case ImagingArtifactKind.READ_ONE_REVOLUTION:
            return "the read of this track stopped after one revolution, which cut off the end of this " +
                "sector's data and its CRC";
        case ImagingArtifactKind.CONVERTER_CRC_MARKER:
            return "the stored CRC is a converter's marker for a sector it couldn't read (the data's CRC with " +
                "its low byte inverted), so no CRC test applies";
        default:
            assertNever(kind);
    }
}

/**
 * One kind of imaging artifact on a floppy, with every sector it explains.
 */
export interface ImagingArtifact {
    readonly kind: ImagingArtifactKind;
    // A complete sentence or two for a person.
    readonly message: string;
    // The tracks involved, sorted by cylinder, then side.
    readonly tracks: readonly TrackPosition[];
    // The physical positions of the bad or missing sectors that the artifact explains, sorted.
    readonly sectors: readonly SectorPosition[];
}

// The fewest tracks of a density that give a typical position of the first ID.
const MIN_TYPICAL_TRACKS = 3;

// The fewest IDs on a track whose spacing we trust.
const MIN_IDS_FOR_SPACING = 3;

// A gap between two IDs this much wider than the track's usual spacing means a sector is missing there.
const MAX_SPACING_RATIO = 1.5;

// The fewest tracks that must stop at the same place before we call it a read of one revolution.
const MIN_ONE_REVOLUTION_TRACKS = 3;

// How far, in bytes, a track's end may be from the disk's usual end in a read of one revolution. A drive's
// speed varies by a fraction of a percent, which is a few dozen bytes.
const ONE_REVOLUTION_WINDOW = 64;

// The data CRC that a sector cut off by the end of the read has: the imager's filler.
const FILLER_CRC = (MFM_GAP << 8) | MFM_GAP;

// The bits that a converter inverts in the CRC of a sector it couldn't read.
const CONVERTER_CRC_MASK = 0x00FF;

// The most tracks whose sectors a message lists before saying "and N more tracks".
const MAX_TRACKS_IN_MESSAGE = 4;

/**
 * The median of some numbers, which must not be empty: the upper middle one if there are an even number.
 */
function median(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length/2)];
}

/**
 * Describes physical sector positions for a message, grouped by track, such as "sector 16 of cylinder
 * 36" or "sectors 0-9 of cylinder 17 and sector 1 of cylinder 18". The side is named only if the disk
 * has more than one, and a long list ends with "and N more tracks".
 */
function describeSectors(sectors: readonly SectorPosition[], sideCount: number): string {
    const numbersByTrack = new Map<string, {trackPosition: TrackPosition, numbers: number[]}>();
    for (const position of [...sectors].sort(compareSectorPositions)) {
        const key = position.trackPosition.key();
        const group = numbersByTrack.get(key);
        if (group === undefined) {
            numbersByTrack.set(key, {trackPosition: position.trackPosition, numbers: [position.sectorNumber]});
        } else {
            group.numbers.push(position.sectorNumber);
        }
    }
    const parts = [...numbersByTrack.values()].map(({trackPosition, numbers}) =>
        (numbers.length === 1 ? "sector " : "sectors ") + describeNumbers(numbers) +
        " of cylinder " + trackPosition.cylinderNumber + (sideCount > 1 ? " side " + trackPosition.side : ""));
    const shown = parts.slice(0, MAX_TRACKS_IN_MESSAGE);
    const hidden = parts.length - shown.length;
    if (hidden > 0) {
        shown.push(`${hidden} more ${hidden === 1 ? "track" : "tracks"}`);
    }
    return shown.length <= 1 ? shown.join("") : shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1];
}

/**
 * Describes a range of numbers, such as "275" or "256-275".
 */
function describeRange(numbers: number[]): string {
    const low = Math.min(...numbers);
    const high = Math.max(...numbers);
    return low === high ? low.toString() : `${low}-${high}`;
}

/**
 * One ID field of a DMK track with a good CRC, where it is in the track.
 */
interface DmkTrackId {
    // Bytes from the start of the track (after the pointer table) to the ID address mark, counting a
    // doubled single-density byte once, so the same for both densities.
    position: number;
    sectorNumber: number;
    density: Density;
}

/**
 * The ID fields of a DMK track that a controller would accept (good ID CRC), in the order they are on
 * the track.
 */
function dmkTrackIds(track: DmkFloppyDisk["tracks"][number]): DmkTrackId[] {
    return track.sectors
        .filter(sector => sector.hasValidIdCrc())
        .sort((a, b) => a.offset - b.offset)
        .map(sector => ({
            position: (sector.offset - TRACK_HEADER_SIZE)/sector.getByteStride(),
            sectorNumber: sector.getSectorNumber(),
            density: sector.density,
        }));
}

/**
 * Find the tracks whose read began late (see {@link ImagingArtifactKind.READ_BEGAN_LATE}). A track's
 * read began late when all of these hold:
 *
 * - Exactly one sector of the track's usual numbers is missing, and all the others are there once.
 * - The IDs are evenly spaced, so the missing sector wasn't between two of them.
 * - The first ID is at least half a spacing later than the typical first ID of the disk's tracks of that
 *   density, so a sector's slot is missing at the start of the track.
 * - The first ID is less than one spacing into the track, so the missing sector's ID would have been before
 *   the start of the read. This is what tells it from damage: a sector whose ID can't be read leaves the
 *   others where they were, but a late start moves them all earlier.
 */
function findReadsBeganLate(floppy: DmkFloppyDisk): ImagingArtifact | undefined {
    const geometry = floppy.getGeometry();

    // The IDs of every track that has enough of them, in one density.
    const trackIds = new Map<DmkFloppyDisk["tracks"][number], DmkTrackId[]>();
    for (const track of floppy.tracks) {
        const ids = dmkTrackIds(track);
        const oneDensity = ids.length >= MIN_IDS_FOR_SPACING && ids.every(id => id.density === ids[0].density);
        if (oneDensity) {
            trackIds.set(track, ids);
        }
    }

    const tracks: TrackPosition[] = [];
    const sectors: SectorPosition[] = [];
    const firstPositions: number[] = [];
    const typicalPositions: number[] = [];
    for (const [track, ids] of trackIds) {
        const density = ids[0].density;
        const sameDensityFirsts = [...trackIds.values()]
            .filter(other => other[0].density === density)
            .map(other => other[0].position);
        if (sameDensityFirsts.length < MIN_TYPICAL_TRACKS) {
            continue;
        }
        const typicalFirst = median(sameDensityFirsts);

        // Evenly spaced IDs.
        const gaps = ids.slice(1).map((id, i) => id.position - ids[i].position);
        const spacing = median(gaps);
        const evenlySpaced = Math.max(...gaps) <= spacing*MAX_SPACING_RATIO;
        if (!evenlySpaced) {
            continue;
        }

        // A first ID that is late, but less than one spacing into the track.
        const first = ids[0].position;
        const lateStart = first >= typicalFirst + spacing/2 && first < spacing;
        if (!lateStart) {
            continue;
        }

        // Exactly one usual sector missing, and the rest there once each.
        const range = geometry.getExpectedSectorRange(track.trackPosition);
        if (range === undefined) {
            continue;
        }
        const numbers = new Set(ids.map(id => id.sectorNumber));
        const allUsual = ids.every(id => id.sectorNumber >= range.firstSectorNumber &&
            id.sectorNumber <= range.lastSectorNumber);
        const usualCount = range.lastSectorNumber - range.firstSectorNumber + 1;
        const oneMissing = allUsual && numbers.size === ids.length && ids.length === usualCount - 1;
        if (!oneMissing) {
            continue;
        }
        let missing = range.firstSectorNumber;
        while (numbers.has(missing)) {
            missing++;
        }

        tracks.push(track.trackPosition);
        sectors.push(new SectorPosition(track.trackPosition, missing));
        firstPositions.push(first);
        typicalPositions.push(typicalFirst);
    }

    if (tracks.length === 0) {
        return undefined;
    }
    const one = sectors.length === 1;
    const message = `The read of ${describeTracks(tracks, geometry.sideCount)} began late, after the first ` +
        `sector of the interleave had gone by (as cw2dmk did before version 4.6.0), so ` +
        `${describeSectors(sectors, geometry.sideCount)} ${one ? "isn't" : "aren't"} in the image. The ` +
        `first ID is ${describeRange(firstPositions)} bytes into the track, where the disk's other tracks ` +
        `have theirs about ${describeRange(typicalPositions)} bytes in. The disk may well have ` +
        `${one ? "that sector" : "those sectors"}, which reimaging would show.`;
    return {
        kind: ImagingArtifactKind.READ_BEGAN_LATE,
        message,
        tracks,
        sectors: [...sectors].sort(compareSectorPositions),
    };
}

/**
 * A track whose last sector the end of the read may have cut off.
 */
interface CutTrack {
    trackPosition: TrackPosition;
    sectorPosition: SectorPosition;
    // Bytes from the start of the track to the end of the read: the last byte that isn't 4E filler, plus one.
    cut: number;
}

/**
 * Find the tracks that a read of exactly one revolution cut off (see
 * {@link ImagingArtifactKind.READ_ONE_REVOLUTION}). Such a read leaves every double-density track filled
 * with 4E from the same place to its end. A track's last sector was cut off when its data CRC failed,
 * the stored CRC is 4E 4E, and the filler starts inside its data. Then it's the imager's when at least
 * three tracks are cut that way within a few dozen bytes of each other, and no double-density track
 * of the disk has anything past that place.
 */
function findReadsOfOneRevolution(floppy: DmkFloppyDisk): ImagingArtifact | undefined {
    const binary = floppy.binary;
    const cutTracks: CutTrack[] = [];
    // Where each double-density track's bytes end, by the same measure.
    const ends: number[] = [];
    for (const track of floppy.tracks) {
        const ids = track.sectors.filter(sector => sector.hasValidIdCrc()).sort((a, b) => a.offset - b.offset);
        const doubleDensity = ids.length > 0 && ids.every(sector => sector.density === Density.DOUBLE);
        if (!doubleDensity) {
            continue;
        }

        // The end of the read: just past the last byte that isn't filler.
        let end = floppy.trackLength;
        while (end > TRACK_HEADER_SIZE && binary[track.offset + end - 1] === MFM_GAP) {
            end--;
        }
        ends.push(end - TRACK_HEADER_SIZE);

        const last = ids[ids.length - 1];
        if (last.dataIndex === undefined) {
            continue;
        }
        const dataStart = last.offset + last.dataIndex;
        const crcStart = dataStart + last.getSectorSize();
        const cutOff = last.getDataCrc() === FILLER_CRC && last.computeDataCrc() !== FILLER_CRC &&
            end > dataStart && end <= crcStart;
        if (cutOff) {
            cutTracks.push({
                trackPosition: track.trackPosition,
                sectorPosition: last.physicalSectorPosition,
                cut: end - TRACK_HEADER_SIZE,
            });
        }
    }

    if (cutTracks.length < MIN_ONE_REVOLUTION_TRACKS) {
        return undefined;
    }
    const usualCut = median(cutTracks.map(track => track.cut));
    const sameCut = cutTracks.filter(track => Math.abs(track.cut - usualCut) <= ONE_REVOLUTION_WINDOW);
    const nothingPast = ends.every(end => end <= usualCut + ONE_REVOLUTION_WINDOW);
    if (sameCut.length < MIN_ONE_REVOLUTION_TRACKS || !nothingPast) {
        return undefined;
    }

    const sideCount = floppy.getGeometry().sideCount;
    const tracks = sameCut.map(track => track.trackPosition);
    const message = `The read of every double-density track stopped after one revolution, ` +
        `${describeRange(sameCut.map(track => track.cut))} bytes into the track, and the tracks were written ` +
        `longer than that. So the last sector of ${describeTracks(tracks, sideCount)} lost the end of its ` +
        `data, and its CRC reads 4E 4E, the imager's filler. The disk may well have the whole sector, ` +
        `which reimaging would show.`;
    return {
        kind: ImagingArtifactKind.READ_ONE_REVOLUTION,
        message,
        tracks,
        sectors: sameCut.map(track => track.sectorPosition).sort(compareSectorPositions),
    };
}

/**
 * Find the sectors whose stored data CRC is a converter's marker (see
 * {@link ImagingArtifactKind.CONVERTER_CRC_MARKER}). By chance a bad CRC would be one only once in
 * 65,536 sectors.
 */
function findConverterCrcMarkers(floppy: FloppyDisk): ImagingArtifact | undefined {
    const geometry = floppy.getGeometry();
    const sectors: SectorPosition[] = [];
    const seen = new Set<string>();
    for (const info of geometry.sectorInfos) {
        const position = info.sectorPosition;
        const key = position.key();
        if (!info.hasValidIdCrc() || seen.has(key)) {
            continue;
        }
        seen.add(key);

        // The copy that reads use.
        const crc = floppy.readSector(position)?.crc?.dataCrc;
        const marker = crc !== undefined && !crc.valid() && (crc.written ^ crc.computed) === CONVERTER_CRC_MASK;
        if (marker) {
            sectors.push(position);
        }
    }

    if (sectors.length === 0) {
        return undefined;
    }
    const tracks = [...new Map(sectors.map(position => [position.trackPosition.key(), position.trackPosition]))
        .values()];
    const one = sectors.length === 1;
    const message = `The stored CRC of ${describeSectors(sectors, geometry.sideCount)} is the CRC of ` +
        `${one ? "its" : "their"} data with the low byte inverted, which a converter writes for a sector ` +
        `that its source marked bad. So the image was converted from another format, and no CRC test ` +
        `applies: the CRC doesn't say how much of the data is wrong.`;
    return {
        kind: ImagingArtifactKind.CONVERTER_CRC_MARKER,
        message,
        tracks: tracks.sort((a, b) => a.cylinderNumber - b.cylinderNumber || a.side - b.side),
        sectors: sectors.sort(compareSectorPositions),
    };
}

/**
 * Find the imaging artifacts on a floppy, at most one of each kind, in the order of
 * {@link ImagingArtifactKind}. A floppy with none may still have been imaged badly in some other way.
 */
export function findImagingArtifacts(floppy: FloppyDisk): ImagingArtifact[] {
    const found: (ImagingArtifact | undefined)[] = [];
    if (floppy instanceof DmkFloppyDisk) {
        found.push(findReadsBeganLate(floppy));
        found.push(findReadsOfOneRevolution(floppy));
    }
    found.push(findConverterCrcMarkers(floppy));
    return found.filter(artifact => artifact !== undefined);
}

/**
 * The kind of artifact that explains a sector, or undefined if none does.
 *
 * @param artifacts what {@link findImagingArtifacts} found.
 * @param position the sector's physical position.
 */
export function findSectorArtifactKind(artifacts: readonly ImagingArtifact[],
                                       position: SectorPosition): ImagingArtifactKind | undefined {

    return artifacts.find(artifact => artifact.sectors.some(sector => sector.equals(position)))?.kind;
}
