/**
 * The loss report for converting a floppy to another image format: compares every sector of the source
 * disk with the converted one, and says what the new format couldn't hold. It works on decoded disks, so it
 * checks what the format can really read back, not what the writer meant to write. It also compares the
 * files that the disks' file systems find, which is the check that matters to a user.
 */

import {assertNever, toHexByte} from "z80-base";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {
    ConvertSector,
    ConvertTrack,
    isConvertSectorDeleted,
    readConvertTracks,
} from "./FloppyConvertModel.js";
import {densityToString, FloppyDisk, TrackPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem, type FloppyDirEntry, type FloppyFileSystem} from "./FloppyFileSystem.js";
import {HfeFloppyDisk} from "./HfeFloppyDisk.js";

/**
 * The ways that a converted disk can differ from its source.
 */
export enum FloppyDifferenceKind {
    /**
     * The source had a sector that the new image doesn't have.
     */
    MISSING_SECTOR,

    /**
     * The sector is there, but its data field is gone.
     */
    MISSING_DATA,

    /**
     * The sector's data differs.
     */
    DATA,

    /**
     * The sector's size differs.
     */
    SIZE,

    /**
     * The cylinder or side in the sector's ID field differs.
     */
    ID_FIELDS,

    /**
     * The sector is recorded in the other density.
     */
    DENSITY,

    /**
     * The sector is deleted in one and not in the other.
     */
    DELETED_MARK,

    /**
     * The exact data address mark differs (0xF8 to 0xFB), though both are deleted or both are not.
     */
    DATA_MARK,

    /**
     * The data CRC error is in one and not in the other.
     */
    DATA_CRC_ERROR,

    /**
     * The ID field's CRC is bad in one and not in the other. A sector whose ID has a bad CRC can't be
     * found by a controller, so a format that can't record that drops the sector.
     */
    ID_CRC_ERROR,

    /**
     * The sectors of a track pass under the head in a different order (the interleave). Not a loss: it
     * changes only how fast a real drive reads the track.
     */
    SECTOR_ORDER,

    /**
     * The new image has a sector that the source didn't, such as the filler that JV1 puts in a track
     * position that nothing was recorded in. Not a loss.
     */
    EXTRA_SECTOR,

    /**
     * The source stored raw track bytes, and the new image stores sectors, so the gaps, the sync bytes and
     * the exact positions of the sectors aren't kept. Not a loss by itself: what matters on a track
     * is the sectors, and the differences above say what happened to them.
     */
    TRACK_LAYOUT,
}

/**
 * A phrase for the kind of difference, such as "sectors missing", for a heading with a count.
 */
export function floppyDifferenceKindToString(kind: FloppyDifferenceKind): string {
    switch (kind) {
        case FloppyDifferenceKind.MISSING_SECTOR: return "sectors missing";
        case FloppyDifferenceKind.MISSING_DATA: return "sectors that lost their data field";
        case FloppyDifferenceKind.DATA: return "sectors with different data";
        case FloppyDifferenceKind.SIZE: return "sectors with a different size";
        case FloppyDifferenceKind.ID_FIELDS: return "sectors whose ID field cylinder or side changed";
        case FloppyDifferenceKind.DENSITY: return "sectors in a different density";
        case FloppyDifferenceKind.DELETED_MARK: return "sectors whose deleted data mark changed";
        case FloppyDifferenceKind.DATA_MARK: return "sectors whose exact data address mark changed";
        case FloppyDifferenceKind.DATA_CRC_ERROR: return "sectors whose data CRC error changed";
        case FloppyDifferenceKind.ID_CRC_ERROR: return "sectors whose ID field CRC error changed";
        case FloppyDifferenceKind.SECTOR_ORDER: return "tracks with their sectors in a different order";
        case FloppyDifferenceKind.EXTRA_SECTOR: return "sectors added";
        case FloppyDifferenceKind.TRACK_LAYOUT: return "tracks whose gaps and sync bytes are regenerated";
        default: assertNever(kind);
    }
}

/**
 * Whether a difference of this kind is information lost by the conversion. The others are noted but
 * don't stop a conversion.
 */
export function floppyDifferenceKindIsLoss(kind: FloppyDifferenceKind): boolean {
    switch (kind) {
        case FloppyDifferenceKind.MISSING_SECTOR:
        case FloppyDifferenceKind.MISSING_DATA:
        case FloppyDifferenceKind.DATA:
        case FloppyDifferenceKind.SIZE:
        case FloppyDifferenceKind.ID_FIELDS:
        case FloppyDifferenceKind.DENSITY:
        case FloppyDifferenceKind.DELETED_MARK:
        case FloppyDifferenceKind.DATA_MARK:
        case FloppyDifferenceKind.DATA_CRC_ERROR:
        case FloppyDifferenceKind.ID_CRC_ERROR:
            return true;

        case FloppyDifferenceKind.SECTOR_ORDER:
        case FloppyDifferenceKind.EXTRA_SECTOR:
        case FloppyDifferenceKind.TRACK_LAYOUT:
            return false;

        default:
            assertNever(kind);
    }
}

/**
 * One difference between the source and the converted disk.
 */
export interface FloppyDifference {
    kind: FloppyDifferenceKind;

    /**
     * The track it's on.
     */
    trackPosition: TrackPosition;

    /**
     * The sector, or undefined for a difference in a whole track.
     */
    sectorNumber: number | undefined;

    /**
     * What differs, in a few words, such as "data differs at byte 17".
     */
    detail: string;
}

/**
 * Everything that differs between a source disk and its conversion.
 */
export class FloppyComparison {
    /**
     * The differences, in track order.
     */
    public readonly differences: FloppyDifference[] = [];

    /**
     * The number of sectors in the source.
     */
    public sourceSectorCount = 0;

    /**
     * The number of sectors in the converted disk.
     */
    public resultSectorCount = 0;

    /**
     * The differences of each kind that occurred, in the order of the kinds.
     */
    public groupByKind(): {kind: FloppyDifferenceKind, differences: FloppyDifference[]}[] {
        const groups = new Map<FloppyDifferenceKind,FloppyDifference[]>();
        for (const difference of this.differences) {
            const group = groups.get(difference.kind);
            if (group === undefined) {
                groups.set(difference.kind, [difference]);
            } else {
                group.push(difference);
            }
        }

        return [... groups.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([kind, differences]) => ({kind, differences}));
    }

    /**
     * The differences that are information lost.
     */
    public getLosses(): FloppyDifference[] {
        return this.differences.filter(difference => floppyDifferenceKindIsLoss(difference.kind));
    }

    /**
     * Whether the conversion lost anything.
     */
    public hasLoss(): boolean {
        return this.differences.some(difference => floppyDifferenceKindIsLoss(difference.kind));
    }
}

/**
 * How good a copy of a sector is, for pairing up the sectors that share a number: a good ID matters most,
 * then having data.
 */
function sectorRank(sector: ConvertSector): number {
    return (sector.idCrcBad ? 0 : 2) + (sector.data !== undefined ? 1 : 0);
}

/**
 * Group a track's sectors by sector number, best copy of each first.
 */
function groupBySectorNumber(track: ConvertTrack | undefined): Map<number,ConvertSector[]> {
    const groups = new Map<number,ConvertSector[]>();
    for (const sector of track?.sectors ?? []) {
        const group = groups.get(sector.sectorNumber);
        if (group === undefined) {
            groups.set(sector.sectorNumber, [sector]);
        } else {
            group.push(sector);
        }
    }
    for (const group of groups.values()) {
        // The sort is stable, so equal copies stay in track order.
        group.sort((a, b) => sectorRank(b) - sectorRank(a));
    }
    return groups;
}

/**
 * The index of the first byte where two arrays differ, or -1 if they're the same.
 */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return i;
        }
    }
    return -1;
}

/**
 * Whether a disk is stored as raw track bytes or cells.
 */
function isRawFormat(disk: FloppyDisk): boolean {
    return disk instanceof DmkFloppyDisk || disk instanceof HfeFloppyDisk;
}

/**
 * Compare a source sector with the one that stands for it in the converted disk, and add what differs.
 */
function compareSectors(comparison: FloppyComparison, trackPosition: TrackPosition, source: ConvertSector,
                        result: ConvertSector): void {

    // Adds a difference for this sector.
    const add = (kind: FloppyDifferenceKind, detail: string): void => {
        comparison.differences.push({kind, trackPosition, sectorNumber: source.sectorNumber, detail});
    };

    if (source.size !== result.size) {
        add(FloppyDifferenceKind.SIZE, `size changed from ${source.size} to ${result.size} bytes`);
    }
    if (source.idCylinder !== result.idCylinder || source.idSide !== result.idSide) {
        add(FloppyDifferenceKind.ID_FIELDS, `ID field says cylinder ${source.idCylinder} side ${source.idSide}, ` +
            `now cylinder ${result.idCylinder} side ${result.idSide}`);
    }
    if (source.density !== result.density) {
        add(FloppyDifferenceKind.DENSITY, `${densityToString(source.density)} density became ` +
            `${densityToString(result.density)}`);
    }

    if (source.data !== undefined && result.data === undefined) {
        add(FloppyDifferenceKind.MISSING_DATA, "data field is gone");
    } else if (source.data === undefined && result.data !== undefined) {
        add(FloppyDifferenceKind.DATA, "had no data field, now has one");
    } else if (source.data !== undefined && result.data !== undefined) {
        if (source.size === result.size) {
            const index = firstDifference(source.data, result.data);
            if (index >= 0) {
                add(FloppyDifferenceKind.DATA, `data differs at byte ${index}`);
            }
        }

        const sourceDeleted = isConvertSectorDeleted(source);
        const resultDeleted = isConvertSectorDeleted(result);
        if (sourceDeleted !== resultDeleted) {
            add(FloppyDifferenceKind.DELETED_MARK, sourceDeleted ? "was deleted, now isn't" : "wasn't deleted, now is");
        } else if (source.dataAddressMark !== result.dataAddressMark) {
            add(FloppyDifferenceKind.DATA_MARK, `data address mark 0x${toHexByte(source.dataAddressMark)} became ` +
                `0x${toHexByte(result.dataAddressMark)}`);
        }
        if (source.dataCrcBad !== result.dataCrcBad) {
            add(FloppyDifferenceKind.DATA_CRC_ERROR, source.dataCrcBad ? "data CRC error is gone" : "data CRC error added");
        }
    }

    if (source.idCrcBad !== result.idCrcBad) {
        add(FloppyDifferenceKind.ID_CRC_ERROR, source.idCrcBad ? "ID CRC error is gone" : "ID CRC error added");
    }
}

/**
 * Compare one track of the source with the same track of the converted disk.
 */
function compareTracks(comparison: FloppyComparison, trackPosition: TrackPosition,
                       source: ConvertTrack, result: ConvertTrack | undefined, trackLayoutLost: boolean): void {

    const sourceGroups = groupBySectorNumber(source);
    const resultGroups = groupBySectorNumber(result);

    // The sectors that match, in matching order.
    const sourcePairs: ConvertSector[] = [];
    const resultPairs: ConvertSector[] = [];
    for (const [sectorNumber, sourceSectors] of sourceGroups.entries()) {
        const resultSectors = resultGroups.get(sectorNumber) ?? [];
        for (let i = 0; i < sourceSectors.length; i++) {
            const sourceSector = sourceSectors[i];
            if (i < resultSectors.length) {
                compareSectors(comparison, trackPosition, sourceSector, resultSectors[i]);
                sourcePairs.push(sourceSector);
                resultPairs.push(resultSectors[i]);
            } else if (sourceSector.idCrcBad) {
                comparison.differences.push({
                    kind: FloppyDifferenceKind.ID_CRC_ERROR,
                    trackPosition,
                    sectorNumber,
                    detail: "ID field has a bad CRC, so the sector was dropped",
                });
            } else {
                comparison.differences.push({
                    kind: FloppyDifferenceKind.MISSING_SECTOR,
                    trackPosition,
                    sectorNumber,
                    detail: "sector is missing",
                });
            }
        }
    }
    for (const [sectorNumber, resultSectors] of resultGroups.entries()) {
        const matched = sourceGroups.get(sectorNumber)?.length ?? 0;
        for (let i = matched; i < resultSectors.length; i++) {
            comparison.differences.push({
                kind: FloppyDifferenceKind.EXTRA_SECTOR,
                trackPosition,
                sectorNumber,
                detail: "sector was added",
            });
        }
    }

    // The order of the matched sectors around the track: the pair numbers in the order that each disk has them.
    if (result !== undefined && source.orderKnown && result.orderKnown) {
        const sourcePairNumbers = new Map(sourcePairs.map((sector, index) => [sector, index]));
        const resultPairNumbers = new Map(resultPairs.map((sector, index) => [sector, index]));
        const sourceOrder = source.sectors.filter(sector => sourcePairNumbers.has(sector))
            .map(sector => sourcePairNumbers.get(sector));
        const resultOrder = result.sectors.filter(sector => resultPairNumbers.has(sector))
            .map(sector => resultPairNumbers.get(sector));
        if (sourceOrder.some((value, index) => value !== resultOrder[index])) {
            comparison.differences.push({
                kind: FloppyDifferenceKind.SECTOR_ORDER,
                trackPosition,
                sectorNumber: undefined,
                detail: "sectors are in a different order",
            });
        }
    }

    if (trackLayoutLost) {
        comparison.differences.push({
            kind: FloppyDifferenceKind.TRACK_LAYOUT,
            trackPosition,
            sectorNumber: undefined,
            detail: "gaps and sync bytes are regenerated",
        });
    }
}

/**
 * Compare a floppy with its conversion to another image format, sector by sector. Every sector of the
 * source is looked up in the converted disk by its track and sector number (sectors that share a number
 * are paired best copy first) and compared on size, ID field, density, data, data address mark, and CRC
 * state. Sectors the converted disk has beyond those are noted, as is a different sector order. When the
 * source stores raw tracks and the result doesn't, each track is noted for its regenerated gaps.
 *
 * @param source the original floppy.
 * @param result the converted floppy, as decoded from the new image.
 */
export function compareFloppies(source: FloppyDisk, result: FloppyDisk): FloppyComparison {
    const comparison = new FloppyComparison();
    const sourceTracks = readConvertTracks(source);
    const resultTracks = readConvertTracks(result);
    const resultByKey = new Map(resultTracks.map(track => [track.trackPosition.key(), track]));
    const trackLayoutLost = isRawFormat(source) && !isRawFormat(result);

    for (const sourceTrack of sourceTracks) {
        comparison.sourceSectorCount += sourceTrack.sectors.length;
        const trackPosition = sourceTrack.trackPosition;
        compareTracks(comparison, trackPosition, sourceTrack, resultByKey.get(trackPosition.key()),
            trackLayoutLost);
        resultByKey.delete(trackPosition.key());
    }
    comparison.resultSectorCount = resultTracks.reduce((count, track) => count + track.sectors.length, 0);

    // Tracks that only the converted disk has.
    for (const resultTrack of resultByKey.values()) {
        for (const sector of resultTrack.sectors) {
            comparison.differences.push({
                kind: FloppyDifferenceKind.EXTRA_SECTOR,
                trackPosition: resultTrack.trackPosition,
                sectorNumber: sector.sectorNumber,
                detail: "sector was added",
            });
        }
    }

    return comparison;
}

/**
 * What differs between the files that two floppies' file systems find.
 */
export interface FileSystemComparison {
    /**
     * The source's file system, such as "LDOS 5.3.1", or undefined if we don't recognize one.
     */
    sourceName: string | undefined;

    /**
     * The converted disk's file system, or undefined if we don't recognize one.
     */
    resultName: string | undefined;

    /**
     * The number of files in the source, including system files.
     */
    fileCount: number;

    /**
     * What differs, one sentence for each: a different file system, files that are missing or were added,
     * and files whose size or contents differ. Empty if the files are identical.
     */
    differences: string[];
}

/**
 * Find the files that a disk's file system holds, with their contents.
 */
function readFiles(fileSystem: FloppyFileSystem): {name: string, size: number, contents: Uint8Array}[] {
    return fileSystem.getDirEntries(true).map((entry: FloppyDirEntry) => ({
        name: entry.getFilename("/"),
        size: entry.getSize(),
        contents: fileSystem.readFile(entry),
    }));
}

/**
 * Compare the files of two floppies, if the source has a file system we recognize: that every file
 * is on the converted disk with the same size and contents. This is the check that the conversion kept
 * what the user cares about.
 *
 * @param source the original floppy.
 * @param result the converted floppy.
 * @return the comparison, or undefined if the source has no recognized file system.
 */
export function compareFloppyFileSystems(source: FloppyDisk, result: FloppyDisk): FileSystemComparison | undefined {
    const sourceFileSystem = decodeFloppyFileSystem(source);
    if (sourceFileSystem === undefined) {
        return undefined;
    }
    const resultFileSystem = decodeFloppyFileSystem(result);

    const comparison: FileSystemComparison = {
        sourceName: sourceFileSystem.nameAndVersion,
        resultName: resultFileSystem?.nameAndVersion,
        fileCount: 0,
        differences: [],
    };

    const sourceFiles = readFiles(sourceFileSystem as FloppyFileSystem);
    comparison.fileCount = sourceFiles.length;
    if (resultFileSystem === undefined) {
        comparison.differences.push("The converted disk has no file system that we recognize.");
        return comparison;
    }
    if (comparison.sourceName !== comparison.resultName) {
        comparison.differences.push(`The file system is now ${comparison.resultName}, not ${comparison.sourceName}.`);
    }

    // Pair the files by name, in order, since a name can occur twice on a damaged disk.
    const resultFiles = readFiles(resultFileSystem as FloppyFileSystem);
    const remaining = new Map<string,typeof resultFiles>();
    for (const file of resultFiles) {
        const list = remaining.get(file.name);
        if (list === undefined) {
            remaining.set(file.name, [file]);
        } else {
            list.push(file);
        }
    }
    for (const file of sourceFiles) {
        const match = remaining.get(file.name)?.shift();
        if (match === undefined) {
            comparison.differences.push(`${file.name} is missing from the converted disk.`);
        } else if (match.size !== file.size || match.contents.length !== file.contents.length) {
            comparison.differences.push(`${file.name} changed size from ${file.size.toLocaleString()} to ` +
                `${match.size.toLocaleString()} bytes.`);
        } else {
            const index = firstDifference(file.contents, match.contents);
            if (index >= 0) {
                comparison.differences.push(`${file.name} has different contents, starting at byte ` +
                    `${index.toLocaleString()}.`);
            }
        }
    }
    for (const [name, list] of remaining.entries()) {
        for (let i = 0; i < list.length; i++) {
            comparison.differences.push(`${name} was added on the converted disk.`);
        }
    }

    return comparison;
}
