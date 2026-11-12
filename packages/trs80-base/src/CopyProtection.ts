/**
 * Finds the signs of copy protection on a floppy: sectors, tracks and directory structures that no
 * DOS's FORMAT or BACKUP writes, and that protection schemes are known to. Each sign is evidence, not
 * proof: protection that lives in the file system or in timing leaves none of these, so a disk with no
 * signs isn't necessarily unprotected. The rules and the scheme numbers come from Ira Goldklang's
 * classification of the trs-80.com archive; see "Copy protection signs" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {Density, FloppyDisk, SectorInfo, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import type {FloppyFileSystem} from "./FloppyFileSystem.js";
import {Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {USER_DATA_ADDRESS_MARK_F9, USER_DATA_ADDRESS_MARK_FA} from "./TrackBytes.js";
import {Trsdos, TrsdosVersion} from "./Trsdos.js";

/**
 * What a sign says about the disk.
 */
export enum ProtectionVerdict {
    // The disk is copy protected by a program's own scheme.
    PROTECTED,
    // The disk is copy protected by a scheme that comes with its DOS.
    DOS_PROTECTED,
    // Protection schemes do this, but so do ordinary disks now and then.
    POSSIBLE,
    // Looks like protection but isn't, such as a DOS's own FORMAT output. Reported so that the
    // oddity is explained.
    INFO,
}

/**
 * The verdict as a phrase for a person, such as "copy protected".
 */
export function protectionVerdictToString(verdict: ProtectionVerdict): string {
    switch (verdict) {
        case ProtectionVerdict.PROTECTED:
            return "copy protected";
        case ProtectionVerdict.DOS_PROTECTED:
            return "DOS copy protected";
        case ProtectionVerdict.POSSIBLE:
            return "possibly copy protected";
        case ProtectionVerdict.INFO:
            return "not protection";
        default:
            assertNever(verdict);
    }
}

/**
 * The kinds of signs, most selective first. A report lists its signs in this order.
 */
export enum ProtectionSignKind {
    // Cylinder 0 has IDs numbered 124-127, VTOS 3.0's mini-sectors.
    VTOS_MINI_SECTORS,
    // Cylinder 0 has a single good sector 124 of 0xE5 filler, which VTOS 4.0's FORMAT writes.
    VTOS_FORMAT_SECTOR,
    // Cylinder 40 is Tandy's protection track, with the TRS-80 Protection Utility's code in sectors 144-146.
    TANDY_PROTECTION_CODE,
    // Cylinder 40 is Tandy's protection track, with a program's data in sectors 129-143.
    TANDY_OVERLAYS,
    // Cylinder 40 is Tandy's protection track with deleted marks and only the filler: a protected
    // master's track whose code is gone.
    TANDY_TRACK_EMPTY,
    // Cylinder 40 is Tandy's protection track with normal marks and only the filler: TRSDOS 1.1's FORMAT output.
    TANDY_TRACK_FORMAT,
    // TRSDOS 1.x's limited-backup count is set, and files are marked to be dropped when it runs out.
    TRSDOS_LIMITED_BACKUPS,
    // Files are marked for limited backups, but the count is unlimited.
    TRSDOS_LIMITED_BACKUPS_UNSET,
    // Every sector of a track is numbered outside the disk's usual numbers.
    TRACK_NUMBERED_OUTSIDE,
    // A full track has one to three sectors numbered outside the disk's usual numbers.
    RENUMBERED_SECTORS,
    // Two or more tracks each have the same sector number twice in the same density.
    DUPLICATE_SECTOR_NUMBERS,
    // A track other than cylinder 0 has both single- and double-density sectors.
    MIXED_DENSITY_TRACK,
    // An ID field has a size code above 3.
    LARGE_SIZE_CODE,
    // A track has 30 or more double-density 256-byte IDs, so some are inside other sectors' data.
    HIDDEN_SECTORS,
    // Half or more of a track's sectors have IDs that name another cylinder.
    FOREIGN_CYLINDER_IDS,
    // Single-density sectors have the 0xF9 data address mark, which only the Model I's controller writes.
    F9_MARKS,
    // Single-density sectors outside the directory have the 0xFA data address mark.
    FA_MARKS,
    // The boot sector or DIR/SYS puts the directory somewhere other than where it was found.
    DIRECTORY_MISMATCH,
}

/**
 * A short name for the kind of sign, such as "renumbered sectors".
 */
export function protectionSignKindToString(kind: ProtectionSignKind): string {
    switch (kind) {
        case ProtectionSignKind.VTOS_MINI_SECTORS:
            return "VTOS mini-sectors";
        case ProtectionSignKind.VTOS_FORMAT_SECTOR:
            return "VTOS 4.0 FORMAT sector";
        case ProtectionSignKind.TANDY_PROTECTION_CODE:
            return "Tandy protection code";
        case ProtectionSignKind.TANDY_OVERLAYS:
            return "Tandy track overlays";
        case ProtectionSignKind.TANDY_TRACK_EMPTY:
            return "empty Tandy protection track";
        case ProtectionSignKind.TANDY_TRACK_FORMAT:
            return "TRSDOS 1.1 FORMAT track";
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS:
            return "TRSDOS limited backups";
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET:
            return "unlimited TRSDOS backups";
        case ProtectionSignKind.TRACK_NUMBERED_OUTSIDE:
            return "renumbered track";
        case ProtectionSignKind.RENUMBERED_SECTORS:
            return "renumbered sectors";
        case ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS:
            return "duplicate sector numbers";
        case ProtectionSignKind.MIXED_DENSITY_TRACK:
            return "mixed-density track";
        case ProtectionSignKind.LARGE_SIZE_CODE:
            return "size code above 3";
        case ProtectionSignKind.HIDDEN_SECTORS:
            return "hidden sectors";
        case ProtectionSignKind.FOREIGN_CYLINDER_IDS:
            return "IDs naming another cylinder";
        case ProtectionSignKind.F9_MARKS:
            return "F9 data marks";
        case ProtectionSignKind.FA_MARKS:
            return "FA data marks";
        case ProtectionSignKind.DIRECTORY_MISMATCH:
            return "directory mismatch";
        default:
            assertNever(kind);
    }
}

/**
 * What a kind of sign says about the disk.
 */
export function protectionSignKindVerdict(kind: ProtectionSignKind): ProtectionVerdict {
    switch (kind) {
        case ProtectionSignKind.VTOS_MINI_SECTORS:
        case ProtectionSignKind.TANDY_PROTECTION_CODE:
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS:
            return ProtectionVerdict.DOS_PROTECTED;
        case ProtectionSignKind.TANDY_OVERLAYS:
        case ProtectionSignKind.TRACK_NUMBERED_OUTSIDE:
        case ProtectionSignKind.RENUMBERED_SECTORS:
        case ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS:
        case ProtectionSignKind.MIXED_DENSITY_TRACK:
        case ProtectionSignKind.LARGE_SIZE_CODE:
        case ProtectionSignKind.HIDDEN_SECTORS:
            return ProtectionVerdict.PROTECTED;
        case ProtectionSignKind.FOREIGN_CYLINDER_IDS:
        case ProtectionSignKind.F9_MARKS:
        case ProtectionSignKind.FA_MARKS:
        case ProtectionSignKind.DIRECTORY_MISMATCH:
            return ProtectionVerdict.POSSIBLE;
        case ProtectionSignKind.VTOS_FORMAT_SECTOR:
        case ProtectionSignKind.TANDY_TRACK_EMPTY:
        case ProtectionSignKind.TANDY_TRACK_FORMAT:
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET:
            return ProtectionVerdict.INFO;
        default:
            assertNever(kind);
    }
}

/**
 * The schemes that a kind of sign has been seen with, as the trs-80.com archive's register numbers
 * them (such as "S-101"). Possibly empty.
 */
export function protectionSignKindSchemes(kind: ProtectionSignKind): string[] {
    switch (kind) {
        case ProtectionSignKind.VTOS_MINI_SECTORS:
            return ["S-101"];
        case ProtectionSignKind.TANDY_PROTECTION_CODE:
            return ["S-005"];
        case ProtectionSignKind.TANDY_OVERLAYS:
            return ["S-006"];
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS:
            return ["S-102"];
        case ProtectionSignKind.TRACK_NUMBERED_OUTSIDE:
            return ["S-010", "S-012", "S-018", "S-022", "S-023", "S-025", "S-027"];
        case ProtectionSignKind.RENUMBERED_SECTORS:
            return ["S-026", "S-028", "S-029", "S-030", "S-032"];
        case ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS:
            return ["S-015", "S-021"];
        case ProtectionSignKind.MIXED_DENSITY_TRACK:
            return ["S-024", "S-034"];
        case ProtectionSignKind.LARGE_SIZE_CODE:
            return ["S-008", "S-009", "S-011"];
        case ProtectionSignKind.HIDDEN_SECTORS:
            return ["S-031"];
        case ProtectionSignKind.FOREIGN_CYLINDER_IDS:
            return ["S-003", "S-017", "S-018", "S-019", "S-024", "S-033"];
        case ProtectionSignKind.F9_MARKS:
            return ["S-016", "S-017"];
        case ProtectionSignKind.FA_MARKS:
            return ["S-023"];
        case ProtectionSignKind.VTOS_FORMAT_SECTOR:
        case ProtectionSignKind.TANDY_TRACK_EMPTY:
        case ProtectionSignKind.TANDY_TRACK_FORMAT:
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET:
        case ProtectionSignKind.DIRECTORY_MISMATCH:
            return [];
        default:
            assertNever(kind);
    }
}

/**
 * The scheme that a kind of sign identifies by itself, such as "VTOS 3.0's copy protection", or
 * undefined if the sign is seen with several schemes (or with none).
 */
export function protectionSignKindSchemeName(kind: ProtectionSignKind): string | undefined {
    switch (kind) {
        case ProtectionSignKind.VTOS_MINI_SECTORS:
            return "VTOS 3.0's copy protection";
        case ProtectionSignKind.TANDY_PROTECTION_CODE:
            return "TRS-80 Protection Utility";
        case ProtectionSignKind.TANDY_OVERLAYS:
            return "Tandy's protection track with program overlays";
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS:
            return "TRSDOS 1.x limited backups";
        case ProtectionSignKind.HIDDEN_SECTORS:
            return "sectors hidden in other sectors' data";
        case ProtectionSignKind.VTOS_FORMAT_SECTOR:
        case ProtectionSignKind.TANDY_TRACK_EMPTY:
        case ProtectionSignKind.TANDY_TRACK_FORMAT:
        case ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET:
        case ProtectionSignKind.TRACK_NUMBERED_OUTSIDE:
        case ProtectionSignKind.RENUMBERED_SECTORS:
        case ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS:
        case ProtectionSignKind.MIXED_DENSITY_TRACK:
        case ProtectionSignKind.LARGE_SIZE_CODE:
        case ProtectionSignKind.FOREIGN_CYLINDER_IDS:
        case ProtectionSignKind.F9_MARKS:
        case ProtectionSignKind.FA_MARKS:
        case ProtectionSignKind.DIRECTORY_MISMATCH:
            return undefined;
        default:
            assertNever(kind);
    }
}

/**
 * One sign of copy protection on a floppy.
 */
export interface ProtectionSign {
    readonly kind: ProtectionSignKind;
    // From the kind; see protectionSignKindVerdict().
    readonly verdict: ProtectionVerdict;
    // The archive's numbers for the schemes this sign has been seen with. See protectionSignKindSchemes().
    readonly schemes: readonly string[];
    // The scheme the sign identifies by itself, if it does. See protectionSignKindSchemeName().
    readonly schemeName: string | undefined;
    // A complete sentence for a person.
    readonly message: string;
    // The tracks involved, sorted by cylinder, then side. Possibly empty.
    readonly tracks: readonly TrackPosition[];
    // The physical positions of the sectors involved, sorted. Possibly empty (the sign is about whole
    // tracks, or about the directory).
    readonly sectors: readonly SectorPosition[];
}

/**
 * Whether the sign counts as protection (anything but {@link ProtectionVerdict.INFO}).
 */
export function isProtectionSign(sign: ProtectionSign): boolean {
    return sign.verdict !== ProtectionVerdict.INFO;
}

/**
 * Whether any of the signs counts as protection, including the possible ones. This is the question to
 * ask before changing a disk in a way that would destroy protection, such as dropping tracks.
 */
export function hasProtectionSigns(signs: readonly ProtectionSign[]): boolean {
    return signs.some(isProtectionSign);
}

/**
 * Make a sign of a kind, filling in what comes from the kind.
 */
function makeSign(kind: ProtectionSignKind, message: string, tracks: TrackPosition[],
                  sectors: SectorPosition[]): ProtectionSign {

    return {
        kind,
        verdict: protectionSignKindVerdict(kind),
        schemes: protectionSignKindSchemes(kind),
        schemeName: protectionSignKindSchemeName(kind),
        message,
        tracks: [...tracks].sort(compareTracks),
        sectors: [...sectors].sort(compareSectors),
    };
}

/**
 * Orders tracks by cylinder, then side.
 */
function compareTracks(a: TrackPosition, b: TrackPosition): number {
    return a.cylinderNumber - b.cylinderNumber || a.side - b.side;
}

/**
 * Orders sector positions by track, then sector number.
 */
function compareSectors(a: SectorPosition, b: SectorPosition): number {
    return compareTracks(a.trackPosition, b.trackPosition) || a.sectorNumber - b.sectorNumber;
}

/**
 * Describes a list of numbers like "36-39, 41", collapsing runs of consecutive numbers.
 *
 * @param numbers the numbers, in any order, possibly repeated.
 */
function describeNumbers(numbers: number[]): string {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const parts: string[] = [];
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i] !== sorted[i - 1] + 1) {
            const first = sorted[runStart];
            const last = sorted[i - 1];
            parts.push(first === last ? first.toString() : first + "-" + last);
            runStart = i;
        }
    }
    return parts.join(", ");
}

/**
 * Describes tracks for a message, such as "cylinder 5" or "cylinders 3-7 on side 0 and 3 on side 1".
 * The side is named only if the disk has more than one.
 */
function describeTracks(tracks: TrackPosition[], sideCount: number): string {
    const sides = [...new Set(tracks.map(track => track.side))].sort((a, b) => a - b);
    const parts = sides.map(side => {
        const cylinders = tracks.filter(track => track.side === side).map(track => track.cylinderNumber);
        const text = describeNumbers(cylinders);
        return sideCount > 1 ? text + " on side " + side : text;
    });
    const plural = tracks.length > 1;
    return (plural ? "cylinders " : "cylinder ") + parts.join(" and ");
}

/**
 * Whether a sector of Tandy's protection track holds only the filler that TRSDOS 1.x's FORMAT
 * writes: 0xE5, ending in "(c) 19..." at 0xF0 (or more 0xE5, or spaces).
 */
function isTandyFiller(data: Uint8Array): boolean {
    if (data.length !== 256) {
        return false;
    }
    const bodyIsFiller = data.subarray(0, 0xF0).every(b => b === 0xE5);
    if (!bodyIsFiller) {
        return false;
    }
    const tail = data.subarray(0xF0);
    const copyright = String.fromCharCode(...tail).startsWith("(c) 19");
    return copyright || tail.every(b => b === 0xE5) || tail.every(b => b === 0x20);
}

/**
 * The sector numbers that a track of this disk can use without being odd: 0 to 18, or to the end of
 * the range of the disk's most common numbering if that goes further (as an 8" disk's does).
 */
function usualSectorNumberLimit(floppy: FloppyDisk): number {
    const geometry = floppy.getGeometry();
    let limit = 18;
    let mostTracks = 0;
    for (const group of geometry.sectorNumberGroups) {
        if (group.trackPositions.length > mostTracks) {
            mostTracks = group.trackPositions.length;
            limit = Math.max(18, group.range.lastSectorNumber);
        }
    }
    return limit;
}

/**
 * The tracks that a file system can allocate: its cylinders on its allocation sides.
 */
interface FileSystemTracks {
    cylinderCount: number;
    sideCount: number;
}

/**
 * The tracks that the file system can allocate, or undefined if we can't tell (no file system, or one
 * outside the TRSDOS family). Tracks past them are often left from an earlier format, or are an
 * imager's reads past the end of the disk.
 */
function fileSystemTracks(fileSystem: FloppyFileSystem | undefined): FileSystemTracks | undefined {
    if (!(fileSystem instanceof Trsdos) || fileSystem.lumpCount === 0) {
        return undefined;
    }
    const lastGranule = fileSystem.getGranuleSectorPositions(fileSystem.lumpCount - 1, fileSystem.granulesPerLump - 1);
    if (lastGranule.length === 0) {
        return undefined;
    }
    return {
        cylinderCount: Math.max(...lastGranule.map(position => position.cylinderNumber)) + 1,
        sideCount: fileSystem.allocationSides,
    };
}

// The ID fields of each floppy's tracks that a controller would accept (good ID CRC), with or
// without data, by track key. Every ID is in the list, including repeated sector numbers.
const goodIdsCache = new WeakMap<FloppyDisk, Map<string, SectorInfo[]>>();

/**
 * The ID fields of a track that a controller would accept (good ID CRC), with or without data, in
 * the order the image lists them.
 */
function goodIds(floppy: FloppyDisk, trackPosition: TrackPosition): SectorInfo[] {
    let byTrack = goodIdsCache.get(floppy);
    if (byTrack === undefined) {
        byTrack = new Map();
        for (const info of floppy.getGeometry().sectorInfos) {
            if (!info.hasValidIdCrc()) {
                continue;
            }
            const key = info.sectorPosition.trackPosition.key();
            const list = byTrack.get(key);
            if (list === undefined) {
                byTrack.set(key, [info]);
            } else {
                list.push(info);
            }
        }
        goodIdsCache.set(floppy, byTrack);
    }
    return byTrack.get(trackPosition.key()) ?? [];
}

/**
 * Look for VTOS's mini-sectors on cylinder 0: IDs numbered 124-127. VTOS 3.0 writes them with
 * deliberate CRC errors as its protection. VTOS 4.0's FORMAT writes a single good sector 124 of 0xE5
 * filler, which isn't protection.
 */
function findVtosMiniSectors(floppy: FloppyDisk, signs: ProtectionSign[]): void {
    const geometry = floppy.getGeometry();
    for (let side = 0; side < geometry.sideCount; side++) {
        const trackPosition = new TrackPosition(0, side);
        const ids = goodIds(floppy, trackPosition).filter(info =>
            info.sectorPosition.sectorNumber >= 0x7C && info.sectorPosition.sectorNumber <= 0x7F);
        if (ids.length === 0) {
            continue;
        }
        const positions = ids.map(info => info.sectorPosition);
        const numbers = describeNumbers(positions.map(position => position.sectorNumber));
        const where = "Cylinder 0" + (geometry.sideCount > 1 ? " side " + side : "");

        // VTOS 4.0's FORMAT output.
        const sector = floppy.readSector(positions[0]);
        const formatSector = ids.length === 1 && positions[0].sectorNumber === 0x7C && sector !== undefined &&
            !sector.crcError && sector.data.every(b => b === 0xE5);
        if (formatSector) {
            signs.push(makeSign(ProtectionSignKind.VTOS_FORMAT_SECTOR,
                where + " has a single good sector 124 of 0xE5 filler, which VTOS 4.0's FORMAT writes.",
                [trackPosition], positions));
        } else {
            signs.push(makeSign(ProtectionSignKind.VTOS_MINI_SECTORS,
                where + " has IDs numbered " + numbers + ", VTOS 3.0's copy-protection mini-sectors.",
                [trackPosition], positions));
        }
    }
}

/**
 * Look for Tandy's protection track: cylinder 40 numbered 129-146 (see "Tandy's protection track" in
 * FLOPPY_FORMATS.md), and say what's on it.
 *
 * @return the track, if it's there, so that the other checks can skip it.
 */
function findTandyTrack(floppy: FloppyDisk, signs: ProtectionSign[]): TrackPosition | undefined {
    const trackPosition = new TrackPosition(40, 0);
    const ids = goodIds(floppy, trackPosition).filter(info =>
        info.sectorPosition.sectorNumber >= 0x81 && info.sectorPosition.sectorNumber <= 0x92);
    const sectors = [...new Set(ids.map(info => info.sectorPosition.sectorNumber))]
        .map(sectorNumber => floppy.readSector(new SectorPosition(trackPosition, sectorNumber)))
        .filter(sector => sector !== undefined);
    if (sectors.length < 12) {
        return undefined;
    }

    const positions = sectors.map(sector => new SectorPosition(trackPosition, sector.sectorPosition.sectorNumber));
    const codeSectors = sectors.filter(sector => sector.sectorPosition.sectorNumber >= 0x90 && !isTandyFiller(sector.data));
    const overlaySectors = sectors.filter(sector => sector.sectorPosition.sectorNumber < 0x90 && !isTandyFiller(sector.data));
    const deletedMarks = sectors.some(sector => sector.deleted);
    const describe = (list: typeof sectors) => describeNumbers(list.map(sector => sector.sectorPosition.sectorNumber));
    if (codeSectors.length > 0) {
        signs.push(makeSign(ProtectionSignKind.TANDY_PROTECTION_CODE,
            "Cylinder 40 is Tandy's protection track, with the TRS-80 Protection Utility's code in sectors " +
            describe(codeSectors) + ".", [trackPosition], positions));
    } else if (overlaySectors.length > 0) {
        signs.push(makeSign(ProtectionSignKind.TANDY_OVERLAYS,
            "Cylinder 40 is Tandy's protection track, with program data in sectors " +
            describe(overlaySectors) + ".", [trackPosition], positions));
    } else if (deletedMarks) {
        signs.push(makeSign(ProtectionSignKind.TANDY_TRACK_EMPTY,
            "Cylinder 40 is Tandy's protection track with deleted marks but only filler: a protected master's " +
            "track whose code is gone, so it protects nothing as it stands.", [trackPosition], positions));
    } else {
        signs.push(makeSign(ProtectionSignKind.TANDY_TRACK_FORMAT,
            "Cylinder 40 has Tandy's protection-track layout with normal marks and only filler, which " +
            "TRSDOS 1.1's FORMAT writes.", [trackPosition], positions));
    }
    return trackPosition;
}

/**
 * The signs that are about one track at a time, collected over the whole disk. Each kind becomes one
 * sign naming all the tracks that show it.
 */
class TrackSigns {
    public readonly outsideTracks: TrackPosition[] = [];
    public readonly outsideSectors: SectorPosition[] = [];
    public readonly renumberedTracks: TrackPosition[] = [];
    public readonly renumberedSectors: SectorPosition[] = [];
    public readonly duplicateTracks: TrackPosition[] = [];
    public readonly duplicateSectors: SectorPosition[] = [];
    public readonly mixedDensityTracks: TrackPosition[] = [];
    public readonly largeSizeCodeTracks: TrackPosition[] = [];
    public readonly largeSizeCodeSectors: SectorPosition[] = [];
    public readonly largeSizeCodes = new Set<number>();
    public readonly hiddenTracks: TrackPosition[] = [];
    public readonly foreignTracks: TrackPosition[] = [];
    public readonly f9Sectors: SectorPosition[] = [];
    public readonly faSectors: SectorPosition[] = [];
}

// The most sectors of a full track that can be numbered outside the usual numbers for the track to
// count as renumbered.
const MAX_RENUMBERED_SECTORS = 3;

/**
 * Look at one track for the signs that are about tracks, and add them to the collection.
 *
 * @param usualLimit the highest sector number that isn't odd (see usualSectorNumberLimit()).
 * @param usualSpan the disk's usual number of sectors per track (its modal sector span).
 * @param fsTracks the tracks the file system can allocate, if known.
 * @param marksAreEvidence whether the image records data address marks as written.
 * @param directoryCylinder the cylinder that the directory is on, where 0xFA marks are normal, if known.
 */
function checkTrack(floppy: FloppyDisk, trackPosition: TrackPosition, usualLimit: number, usualSpan: number,
                    fsTracks: FileSystemTracks | undefined, marksAreEvidence: boolean,
                    directoryCylinder: number | undefined, found: TrackSigns): void {

    const cylinder = trackPosition.cylinderNumber;
    const ids = goodIds(floppy, trackPosition);
    if (ids.length === 0) {
        return;
    }
    const sectorNumbers = [...new Set(ids.map(info => info.sectorPosition.sectorNumber))];
    const positionOf = (sectorNumber: number) => new SectorPosition(trackPosition, sectorNumber);

    // Whether the file system can allocate this track. Past it, odd tracks are usually left from an
    // earlier format of the diskette, or are an imager's reads past the end.
    const insideFileSystem = fsTracks === undefined ||
        (cylinder < fsTracks.cylinderCount && trackPosition.side < fsTracks.sideCount);

    // Numbering. A renumbered track has only one or a few odd numbers; more is a layout of its own, such
    // as the 26 sectors of an 8" disk's cylinder 0. VTOS's mini-sectors on cylinder 0 are reported by findVtosMiniSectors(), and a whole
    // renumbered cylinder 0 isn't one we've seen.
    const isVtosMiniSector = (sectorNumber: number) => cylinder === 0 && sectorNumber >= 0x7C && sectorNumber <= 0x7F;
    const outside = sectorNumbers.filter(sectorNumber => sectorNumber > usualLimit && !isVtosMiniSector(sectorNumber));
    if (cylinder > 0 && outside.length === sectorNumbers.length && sectorNumbers.length >= 5) {
        found.outsideTracks.push(trackPosition);
        found.outsideSectors.push(...outside.map(positionOf));
    } else if (outside.length > 0 && outside.length <= MAX_RENUMBERED_SECTORS && sectorNumbers.length >= 8) {
        found.renumberedTracks.push(trackPosition);
        found.renumberedSectors.push(...outside.map(positionOf));
    }

    // The same number twice in the same density. A copy without data is often an imager's re-read of
    // the track's first sector at its end, so only copies with data count.
    const seen = new Set<string>();
    const duplicates = new Set<number>();
    for (const info of ids) {
        if (!info.hasData()) {
            continue;
        }
        const key = info.density + ":" + info.sectorPosition.sectorNumber;
        if (seen.has(key)) {
            duplicates.add(info.sectorPosition.sectorNumber);
        }
        seen.add(key);
    }
    if (duplicates.size > 0) {
        found.duplicateTracks.push(trackPosition);
        found.duplicateSectors.push(...[...duplicates].map(positionOf));
    }

    // Both densities on a data track. Cylinder 0 often mixes them on Model I doubler and dual-boot disks,
    // and a later format over an earlier one leaves both past the file system.
    const densities = new Set(ids.map(info => info.density));
    if (cylinder > 0 && insideFileSystem && densities.size > 1) {
        found.mixedDensityTracks.push(trackPosition);
    }

    // Size codes the 179x reads as their low two bits.
    const large = ids.filter(info => info.sizeCode !== undefined && info.sizeCode > 3);
    if (large.length > 0) {
        found.largeSizeCodeTracks.push(trackPosition);
        found.largeSizeCodeSectors.push(...large.map(info => info.sectorPosition));
        for (const info of large) {
            found.largeSizeCodes.add(info.sizeCode as number);
        }
    }

    // More 256-byte double-density IDs than fit on a 5.25" track, so some are in other sectors' data.
    // An 8" disk fits 30 (and LS-DOS formats them so), so it must also be well past the disk's usual count.
    const doubleDensityIds = ids.filter(info => info.density === Density.DOUBLE && info.sectorSize === 256);
    if (doubleDensityIds.length >= 30 && doubleDensityIds.length*2 >= usualSpan*3) {
        found.hiddenTracks.push(trackPosition);
    }

    // The sectors as read, which say what their IDs and marks are.
    const sectors = sectorNumbers
        .map(sectorNumber => floppy.readSector(positionOf(sectorNumber)))
        .filter(sector => sector !== undefined);

    // IDs naming another cylinder, inside the file system's tracks.
    const foreign = sectors.filter(sector => sector.sectorPosition.cylinderNumber !== cylinder);
    if (insideFileSystem && sectors.length > 0 && foreign.length*2 >= sectors.length) {
        found.foreignTracks.push(trackPosition);
    }

    // Single-density data marks besides FB and F8, which only the Model I's controller writes. In
    // double density they're misreads. 0xFA is normal on the directory cylinder of TRSDOS 2.x-era
    // disks, and on cylinder 0 of VTOS's.
    if (marksAreEvidence) {
        for (const sector of sectors) {
            if (sector.density !== Density.SINGLE) {
                continue;
            }
            const position = positionOf(sector.sectorPosition.sectorNumber);
            const mark = sector.dataAddressMark;
            if (mark === USER_DATA_ADDRESS_MARK_F9) {
                found.f9Sectors.push(position);
            } else if (mark === USER_DATA_ADDRESS_MARK_FA && cylinder !== 0 && cylinder !== directoryCylinder) {
                found.faSectors.push(position);
            }
        }
    }
}

/**
 * Turn the per-track findings into signs, in the order of the kinds.
 */
function trackSignsToSigns(found: TrackSigns, sideCount: number, usualLimit: number, signs: ProtectionSign[]): void {
    const tracksOf = (sectors: SectorPosition[]) => {
        const map = new Map<string, TrackPosition>();
        for (const sector of sectors) {
            map.set(sector.trackPosition.key(), sector.trackPosition);
        }
        return [...map.values()];
    };
    const describe = (tracks: TrackPosition[]) => describeTracks(tracks, sideCount);
    const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

    if (found.outsideTracks.length > 0) {
        signs.push(makeSign(ProtectionSignKind.TRACK_NUMBERED_OUTSIDE,
            capitalize(describe(found.outsideTracks)) + " numbered " +
            describeNumbers(found.outsideSectors.map(sector => sector.sectorNumber)) +
            ", outside the usual 0-" + usualLimit + ".", found.outsideTracks, found.outsideSectors));
    }
    if (found.renumberedTracks.length > 0) {
        signs.push(makeSign(ProtectionSignKind.RENUMBERED_SECTORS,
            capitalize(describe(found.renumberedTracks)) + (found.renumberedTracks.length === 1 ? " has" : " have") +
            (found.renumberedSectors.length === 1 ? " a sector" : " sectors") + " numbered " +
            describeNumbers(found.renumberedSectors.map(sector => sector.sectorNumber)) +
            " among the usual 0-" + usualLimit + ".", found.renumberedTracks, found.renumberedSectors));
    }
    // One damaged track can have a duplicate; protection puts them on several.
    if (found.duplicateTracks.length >= 2) {
        signs.push(makeSign(ProtectionSignKind.DUPLICATE_SECTOR_NUMBERS,
            capitalize(describe(found.duplicateTracks)) + " have the same sector number twice in the same density.",
            found.duplicateTracks, found.duplicateSectors));
    }
    if (found.mixedDensityTracks.length > 0) {
        signs.push(makeSign(ProtectionSignKind.MIXED_DENSITY_TRACK,
            capitalize(describe(found.mixedDensityTracks)) + (found.mixedDensityTracks.length === 1 ? " has" : " have") +
            " both single- and double-density sectors, which no DOS's FORMAT writes.", found.mixedDensityTracks, []));
    }
    if (found.largeSizeCodeTracks.length > 0) {
        const codes = [...found.largeSizeCodes].sort((a, b) => a - b)
            .map(code => "0x" + code.toString(16).toUpperCase().padStart(2, "0"));
        signs.push(makeSign(ProtectionSignKind.LARGE_SIZE_CODE,
            capitalize(describe(found.largeSizeCodeTracks)) + (found.largeSizeCodeTracks.length === 1 ? " has" : " have") +
            " IDs with size code " + codes.join(", ") + ", above the usual 0-3.",
            found.largeSizeCodeTracks, found.largeSizeCodeSectors));
    }
    if (found.hiddenTracks.length > 0) {
        signs.push(makeSign(ProtectionSignKind.HIDDEN_SECTORS,
            capitalize(describe(found.hiddenTracks)) + (found.hiddenTracks.length === 1 ? " has" : " have") +
            " 30 or more double-density IDs, more than fit, so some are inside other sectors' data.",
            found.hiddenTracks, []));
    }
    if (found.foreignTracks.length > 0) {
        signs.push(makeSign(ProtectionSignKind.FOREIGN_CYLINDER_IDS,
            capitalize(describe(found.foreignTracks)) + (found.foreignTracks.length === 1 ? " has" : " have") +
            " IDs naming another cylinder on half or more of the sectors.", found.foreignTracks, []));
    }
    if (found.f9Sectors.length > 0) {
        const tracks = tracksOf(found.f9Sectors);
        signs.push(makeSign(ProtectionSignKind.F9_MARKS,
            capitalize(describe(tracks)) + (tracks.length === 1 ? " has " : " have ") + found.f9Sectors.length +
            " single-density " + (found.f9Sectors.length === 1 ? "sector" : "sectors") +
            " with the 0xF9 data mark, which only the Model I's controller writes.", tracks, found.f9Sectors));
    }
    if (found.faSectors.length > 0) {
        const tracks = tracksOf(found.faSectors);
        signs.push(makeSign(ProtectionSignKind.FA_MARKS,
            capitalize(describe(tracks)) + (tracks.length === 1 ? " has " : " have ") + found.faSectors.length +
            " single-density " + (found.faSectors.length === 1 ? "sector" : "sectors") +
            " outside the directory with the 0xFA data mark.", tracks, found.faSectors));
    }
}

/**
 * Look for TRSDOS 1.x's limited backups: files with bit 5 of their entry's first byte set, which
 * BACKUP drops when the boot sector's count runs out (see "Which DOSes share a layout" in
 * FLOPPY_FORMATS.md). The count is boot byte 0x22, or on TRSDOS 1.1, whose loader is a byte longer
 * and has its JP (HL) there, the word at 0xFC; 0xFF (0xFFFF) means unlimited.
 */
function findLimitedBackups(floppy: FloppyDisk, trsdos: Trsdos, signs: ProtectionSign[]): void {
    if (trsdos.version !== TrsdosVersion.V1_3) {
        return;
    }
    const limitedFiles = trsdos.getDirEntries(true).filter(dirEntry => dirEntry.hasBackupLimitation());
    if (limitedFiles.length === 0) {
        return;
    }
    const bootTrack = floppy.getGeometry().bootTrack;
    if (bootTrack === undefined) {
        return;
    }
    const bootPosition = bootTrack.firstSectorPosition();
    const bootSector = floppy.readSector(bootPosition);
    if (bootSector === undefined || bootSector.data.length < 0x100) {
        return;
    }
    const data = bootSector.data;
    const isTrsdos11Loader = data[0x22] === 0xE9;
    const unlimited = isTrsdos11Loader ? data[0xFC] === 0xFF && data[0xFD] === 0xFF : data[0x22] === 0xFF;
    const count = isTrsdos11Loader ? data[0xFC] | (data[0xFD] << 8) : data[0x22];
    const names = limitedFiles.map(dirEntry => dirEntry.getFilename("/")).join(", ");
    const files = limitedFiles.length === 1 ? "file " + names + " is" : "files " + names + " are";
    if (unlimited) {
        signs.push(makeSign(ProtectionSignKind.TRSDOS_LIMITED_BACKUPS_UNSET,
            "The " + files + " marked for limited backups, but the boot sector's backup count is unlimited.",
            [], [bootPosition]));
    } else {
        signs.push(makeSign(ProtectionSignKind.TRSDOS_LIMITED_BACKUPS,
            "The boot sector allows " + count + (count === 1 ? " backup" : " backups") + ", after which BACKUP drops the " +
            files.replace(/ (is|are)$/, "") + ".", [], [bootPosition]));
    }
}

/**
 * Look for a directory that's somewhere other than where the boot sector or DIR/SYS says: a moved
 * directory with a decoy where it used to be (see "Disks worth remembering" in FLOPPY_FORMATS.md), or
 * a disk read in a different density than it was written. Only on the 2.3 family where a lump is a
 * cylinder, since boot byte 2 is a lump number on NEWDOS/80-style disks, and only 2.3-family boot
 * sectors (byte 1 0xFE) have it.
 */
function findDirectoryMismatch(floppy: FloppyDisk, trsdos: Trsdos, signs: ProtectionSign[]): void {
    if (trsdos.version !== TrsdosVersion.V2_3 || !trsdos.lumpsAreCylinders) {
        return;
    }
    const directoryCylinder = trsdos.dirLumpNumber;
    const reasons: string[] = [];

    const bootTrack = floppy.getGeometry().bootTrack;
    const bootSector = bootTrack === undefined ? undefined : floppy.readSector(bootTrack.firstSectorPosition());
    if (bootSector !== undefined && bootSector.data[1] === 0xFE) {
        // No 2.3-family directory is on cylinder 0, so a 0 there comes from some other boot sector,
        // such as a dual-boot disk's.
        const bootCylinder = bootSector.data[2] & 0x7F;
        if (bootCylinder !== 0 && bootCylinder !== directoryCylinder) {
            reasons.push("the boot sector says cylinder " + bootCylinder);
        }
    }

    const dirSys = trsdos.getDirEntries(true).find(dirEntry => dirEntry.getFilename("/") === "DIR/SYS");
    if (dirSys !== undefined && dirSys.extents.length > 0) {
        const dirSysCylinder = dirSys.extents[0].cylinderNumber;
        if (dirSysCylinder !== directoryCylinder) {
            reasons.push("DIR/SYS says cylinder " + dirSysCylinder);
        }
    }

    if (reasons.length > 0) {
        signs.push(makeSign(ProtectionSignKind.DIRECTORY_MISMATCH,
            "The directory is on cylinder " + directoryCylinder + ", but " + reasons.join(" and ") + ".",
            [], []));
    }
}

/**
 * Find the signs of copy protection on a floppy.
 *
 * @param floppy the disk.
 * @param fileSystem the disk's file system, if it has one we read. Some signs are about the file
 * system, and others need it to tell protection from what the DOS normally writes.
 * @return the signs, most selective first (in the order of {@link ProtectionSignKind}). Empty if
 * there are none, which doesn't prove that the disk is unprotected. Use {@link hasProtectionSigns}
 * to ask whether any of them counts as protection.
 */
export function findProtectionSigns(floppy: FloppyDisk, fileSystem: FloppyFileSystem | undefined): ProtectionSign[] {
    const signs: ProtectionSign[] = [];
    const geometry = floppy.getGeometry();
    const trsdos = fileSystem instanceof Trsdos ? fileSystem : undefined;

    findVtosMiniSectors(floppy, signs);
    const tandyTrack = findTandyTrack(floppy, signs);
    if (trsdos !== undefined) {
        findLimitedBackups(floppy, trsdos, signs);
    }

    // JV1 can't record data marks: its reader makes up the directory's.
    const marksAreEvidence = !(floppy instanceof Jv1FloppyDisk);
    const directoryCylinder = trsdos?.getGatPosition().cylinderNumber;
    const usualLimit = usualSectorNumberLimit(floppy);
    const usualSpan = geometry.modalDataSectorSpan;
    const fsTracks = fileSystemTracks(fileSystem);
    const found = new TrackSigns();
    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        for (let side = 0; side < geometry.sideCount; side++) {
            const trackPosition = new TrackPosition(cylinder, side);
            const isTandyTrack = tandyTrack !== undefined && tandyTrack.equals(trackPosition);
            if (!isTandyTrack) {
                checkTrack(floppy, trackPosition, usualLimit, usualSpan, fsTracks, marksAreEvidence,
                    directoryCylinder, found);
            }
        }
    }
    trackSignsToSigns(found, geometry.sideCount, usualLimit, signs);

    if (trsdos !== undefined) {
        findDirectoryMismatch(floppy, trsdos, signs);
    }

    // Already in kind order except for the file-system signs, so sort to be sure. The sort is stable.
    signs.sort((a, b) => a.kind - b.kind);
    return signs;
}
