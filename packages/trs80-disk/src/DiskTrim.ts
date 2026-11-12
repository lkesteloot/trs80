import {
    analyzeFloppyTail, canTrimFloppy, decodeFloppyFileSystem, describeTailKeepReason, findProtectionSigns,
    findReReadCylinder, findTrsdosCylinderUse, type FloppyDisk, type FloppyFileSystem, type FloppyTail,
    isProtectionSign, type KnownFloppyFileSystem, type ProtectionSign, ProtectionSignKind, protectionSignKindToString,
    sectorsReadTheSame, type TailCylinder, TailTrackKind, Trsdos, TrackPosition, trimFloppy, TRIMMABLE_FLOPPY_FORMATS,
} from "trs80-base";
import {assertNever} from "z80-base";
import {DiskError, DiskErrorKind} from "./DiskError.js";
import {DiskSession} from "./DiskSession.js";
import {pluralizeWithCount} from "./Plural.js";

// The operation behind the "trim" command: drop an image's unused tracks.

/**
 * The most file names to list in a refusal.
 */
const MAX_NAMES_LISTED = 5;

/**
 * What the file system does with one cylinder of the image.
 */
interface CylinderUse {
    /** The files (or "the directory") that have data on the cylinder, each at most once. */
    claimedBy: string[];
    /** Whether the cylinder has space that the file system could still hand out. Only known for TRSDOS. */
    hasFreeSpace: boolean;
}

/**
 * What the disk's file system does with every cylinder of the image.
 */
interface CylinderAnalysis {
    /** One entry for every cylinder of the image, in order. */
    cylinders: CylinderUse[];
    /** The files that have data on side 1 or higher. Only known where the file system isn't TRSDOS-family. */
    sideOneNames: string[];
    /** The TRSDOS-family file system, or undefined if the disk has none (or another family's). */
    trsdos: Trsdos | undefined;
}

/**
 * Describe a range of cylinders for the user, such as "cylinder 40" or "cylinders 40-79".
 *
 * @param first the first cylinder.
 * @param last the last cylinder, at least first.
 */
function cylinderRangeText(first: number, last: number): string {
    return first === last ? "cylinder " + first : "cylinders " + first + "-" + last;
}

/**
 * Join some file names for a message, leaving out the rest of a long list.
 */
function namesText(names: string[]): string {
    const shown = names.slice(0, MAX_NAMES_LISTED).join(", ");
    return names.length > MAX_NAMES_LISTED ? shown + " and " + (names.length - MAX_NAMES_LISTED).toLocaleString() + " more" : shown;
}

/**
 * Add a name to a list if it's not already there.
 */
function addName(names: string[], name: string): void {
    if (!names.includes(name)) {
        names.push(name);
    }
}

/**
 * Work out what a TRSDOS-family file system uses on each cylinder, from its granule map (see
 * findTrsdosCylinderUse() in trs80-base).
 *
 * @param session the session, whose disk has a TRSDOS-family file system.
 * @param trsdos the file system.
 * @param cylinders the per-cylinder records to fill in.
 * @throws DiskError if the granule map can't be made.
 */
function analyzeTrsdosCylinders(session: DiskSession, trsdos: Trsdos, cylinders: CylinderUse[]): void {
    const granuleMap = session.getGranuleMap();
    if (granuleMap === undefined || typeof granuleMap === "string") {
        throw new DiskError("Can't tell which cylinders the file system uses" +
            (typeof granuleMap === "string" ? ": " + granuleMap : ""));
    }

    findTrsdosCylinderUse(trsdos, granuleMap, cylinders.length).forEach((use, cylinder) => {
        cylinders[cylinder].claimedBy.push(...use.claimedBy);
        cylinders[cylinder].hasFreeSpace = use.hasFreeSpace;
    });
}

/**
 * Work out which cylinders (and whether side 1) the files of another family's file system use.
 *
 * @param fileSystem the file system.
 * @param cylinders the per-cylinder records to fill in.
 * @param sideOneNames the list to add the files that have data on side 1 or higher to.
 */
function analyzeGenericCylinders(fileSystem: KnownFloppyFileSystem, cylinders: CylinderUse[], sideOneNames: string[]): void {
    // Every file system implements the same interface, but the union of their entry types doesn't
    // match it as a whole.
    const generic = fileSystem as FloppyFileSystem;
    for (const dirEntry of generic.getDirEntries(true)) {
        const name = dirEntry.getFilename("/");
        for (const position of generic.getFileSectorPositions(dirEntry)) {
            const cylinder = position.cylinderNumber;
            if (cylinder >= 0 && cylinder < cylinders.length) {
                addName(cylinders[cylinder].claimedBy, name);
            }
            if (position.side >= 1) {
                addName(sideOneNames, name);
            }
        }
    }
}

/**
 * Work out what the file system uses on every cylinder of the image.
 *
 * @param session the session.
 * @throws DiskError if the disk has a TRSDOS-family file system that we can't analyze.
 */
function analyzeCylinders(session: DiskSession): CylinderAnalysis {
    const geometry = session.floppy.getGeometry();
    const cylinders: CylinderUse[] = [];
    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        cylinders.push({claimedBy: [], hasFreeSpace: false});
    }

    const sideOneNames: string[] = [];
    const fileSystem = session.fileSystem;
    let trsdos: Trsdos | undefined = undefined;
    if (fileSystem instanceof Trsdos) {
        trsdos = fileSystem;
        analyzeTrsdosCylinders(session, trsdos, cylinders);
    } else if (fileSystem !== undefined) {
        analyzeGenericCylinders(fileSystem, cylinders, sideOneNames);
    }

    return {cylinders, sideOneNames, trsdos};
}

/**
 * One past the highest cylinder that satisfies a test, or 1 if none does (cylinder 0 is always kept).
 */
function endOfCylinders(cylinders: CylinderUse[], test: (use: CylinderUse) => boolean): number {
    let end = 1;
    cylinders.forEach((use, cylinder) => {
        if (test(use)) {
            end = cylinder + 1;
        }
    });
    return end;
}

/**
 * Whether a sector's data is filler: the same byte throughout, or the same two bytes alternating, which
 * is how the DOSes' FORMAT fills new sectors (see "Leftovers from earlier formats" in FLOPPY_FORMATS.md).
 */
function isFillerSector(data: Uint8Array): boolean {
    for (let i = 2; i < data.length; i++) {
        if (data[i] !== data[i - 2]) {
            return false;
        }
    }
    return true;
}

/**
 * Find the cylinders in a range of the image that hold sectors whose data isn't filler.
 *
 * @param floppy the floppy.
 * @param isDropped says whether a track is among those being dropped.
 * @return the cylinder numbers, in order.
 */
function findCylindersWithData(floppy: FloppyDisk, isDropped: (cylinder: number, side: number) => boolean): number[] {
    const cylinders = new Set<number>();
    for (const sectorInfo of floppy.getGeometry().sectorInfos) {
        const trackPosition = sectorInfo.sectorPosition.trackPosition;
        if (isDropped(trackPosition.cylinderNumber, trackPosition.side)) {
            const sectorData = floppy.readSector(sectorInfo.sectorPosition);
            if (sectorData !== undefined && !isFillerSector(sectorData.data)) {
                cylinders.add(trackPosition.cylinderNumber);
            }
        }
    }
    return [...cylinders].sort((a, b) => a - b);
}

/**
 * What trimDisk() decided to keep and why.
 */
interface TrimPlan {
    /** The cylinders to keep, from cylinder 0. */
    keepCylinders: number;
    /** The sides to keep, from side 0. */
    keepSides: number;
    /** Why cylinders are dropped, or undefined if none are. */
    cylindersReason: TrimCylindersReason | undefined;
    /** What to tell the user about what's dropped, one sentence each. Empty if nothing is. */
    removed: string[];
    /** Why cylinders past the disk's end were kept, one sentence each. Only for a plain trim. */
    kept: string[];
    /** For a plain trim, what's past the disk's end. */
    tail: FloppyTail | undefined;
}

/**
 * Describe what a dropped cylinder past the disk's end holds, such as "re-read cylinder 39" or "unformatted".
 */
function describeDroppedCylinder(tailCylinder: TailCylinder): string {
    const kinds = new Set(tailCylinder.tracks.map(track => track.kind));
    const named = new Set(tailCylinder.tracks.map(track => track.namedCylinder).filter(cylinder => cylinder !== undefined));
    if (kinds.size === 1 && kinds.has(TailTrackKind.UNFORMATTED)) {
        return "unformatted";
    }
    if (kinds.size === 1 && kinds.has(TailTrackKind.RE_READ) && named.size === 1) {
        return "re-read cylinder " + [...named][0];
    }
    return "re-reads and unformatted tracks";
}

/**
 * Group consecutive cylinders that are described the same way, such as 40 and 41 as "re-read cylinder 39".
 *
 * @param cylinders the cylinders, in order.
 * @param describe what to say about each.
 * @return the groups' first and last cylinders and descriptions, in order.
 */
function groupCylinders(cylinders: TailCylinder[], describe: (tailCylinder: TailCylinder) => string):
    {first: number, last: number, text: string}[] {

    const groups: {first: number, last: number, text: string}[] = [];
    for (const tailCylinder of cylinders) {
        const text = describe(tailCylinder);
        const last = groups[groups.length - 1];
        if (last !== undefined && last.text === text && last.last === tailCylinder.cylinder - 1) {
            last.last = tailCylinder.cylinder;
        } else {
            groups.push({first: tailCylinder.cylinder, last: tailCylinder.cylinder, text});
        }
    }
    return groups;
}

/**
 * Decide how many cylinders to keep when the user didn't say: only an unbroken run at the end of the
 * image that the DOS's records put past the disk's end, and that holds nothing but re-reads of earlier
 * cylinders and unformatted tracks, with no sign of copy protection (see analyzeFloppyTail() in trs80-base).
 *
 * @param session the session.
 * @param signs the disk's protection signs.
 * @return the count to keep, what to say about the dropped cylinders (undefined if none are), why the
 * others past the disk's end were kept, and the analysis.
 */
function chooseDefaultCylinders(session: DiskSession, signs: ProtectionSign[]):
    {keep: number, removed: string | undefined, kept: string[], tail: FloppyTail} {

    const floppy = session.floppy;
    const geometry = floppy.getGeometry();
    const granuleMap = session.getGranuleMap();
    const tail = analyzeFloppyTail(floppy, session.fileSystem, signs,
        granuleMap === undefined || typeof granuleMap === "string" ? undefined : granuleMap);

    const keptCylinders = tail.cylinders.filter(tailCylinder => tailCylinder.cylinder < tail.dropFrom);
    const kept = groupCylinders(keptCylinders,
        tailCylinder => describeTailKeepReason(tail, tailCylinder, geometry.sideCount))
        .map(group => "Kept " + cylinderRangeText(group.first, group.last) + ": " + group.text + ".");

    let removed: string | undefined = undefined;
    if (tail.size !== undefined && tail.dropFrom < geometry.cylinderCount) {
        const dropped = tail.cylinders.filter(tailCylinder => tailCylinder.cylinder >= tail.dropFrom);
        const groups = groupCylinders(dropped, describeDroppedCylinder);
        const what = groups.length === 1 ? groups[0].text : groups.map(group =>
            (group.first === group.last ? group.first : group.first + "-" + group.last) + " " + group.text).join(", ");
        removed = "Removed " + cylinderRangeText(tail.dropFrom, geometry.cylinderCount - 1) + " (past the disk's " +
            tail.size.cylinderCount + " cylinders, from " + tail.size.source + "; " + what + ").";
    }

    return {keep: tail.dropFrom, removed, kept, tail};
}

/**
 * Whether a sign says something about a track that dropping it would destroy. A re-read's IDs naming the
 * cylinder it re-reads don't: dropping the copy leaves the original.
 */
function signConcernsTrack(floppy: FloppyDisk, sign: ProtectionSign, trackPosition: TrackPosition): boolean {
    if (!sign.tracks.some(track => track.equals(trackPosition))) {
        return false;
    }
    return !(sign.kind === ProtectionSignKind.FOREIGN_CYLINDER_IDS && findReReadCylinder(floppy, trackPosition) !== undefined);
}

/**
 * Refuse to drop tracks that show signs of copy protection, or any track of a disk with a sign that
 * isn't about particular tracks, even with --force: a trimmed copy of a protected disk wouldn't work.
 *
 * @param floppy the disk.
 * @param signs its protection signs.
 * @param isDropped says whether a track is among those being dropped.
 * @param what what's being dropped, for the message, such as "cylinders 40-79".
 * @throws DiskError if a sign is on a dropped track.
 */
function checkDroppedProtection(floppy: FloppyDisk, signs: ProtectionSign[],
                                isDropped: (cylinder: number, side: number) => boolean, what: string): void {

    const geometry = floppy.getGeometry();
    const found: ProtectionSign[] = signs.filter(sign => isProtectionSign(sign) && sign.tracks.length === 0);
    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        for (let side = 0; side < geometry.sideCount; side++) {
            if (!isDropped(cylinder, side)) {
                continue;
            }
            const trackPosition = new TrackPosition(cylinder, side);
            for (const sign of signs) {
                if (!found.includes(sign) && signConcernsTrack(floppy, sign, trackPosition)) {
                    found.push(sign);
                }
            }
        }
    }
    if (found.length > 0) {
        throw new DiskError("Can't drop " + what + ": the disk shows signs of copy protection there (" +
            found.map(sign => protectionSignKindToString(sign.kind)).join(", ") + "), and trim never drops " +
            "those, even with --force. " + found.map(sign => sign.message).join(" "));
    }
}

/**
 * Check that dropping cylinders the user asked for doesn't cut into the file system, and decide how many
 * to keep. Files on a dropped cylinder always refuse. On a TRSDOS-family disk, free space on one refuses
 * unless forced. Elsewhere, data that isn't filler refuses unless forced (that's checked later, once the
 * sides are known).
 *
 * @param analysis what the file system uses.
 * @param requested the number of cylinders to keep, from --cylinders.
 * @param force whether the user gave --force.
 * @return the number of cylinders to keep, which is the image's if it has no more than were asked for.
 * @throws DiskError if the file system needs a dropped cylinder.
 */
function checkRequestedCylinders(analysis: CylinderAnalysis, requested: number, force: boolean): number {
    const cylinders = analysis.cylinders;
    if (requested >= cylinders.length) {
        return cylinders.length;
    }

    // Files and the directory on the dropped cylinders.
    const names: string[] = [];
    let firstClaimed = -1;
    let lastClaimed = -1;
    for (let cylinder = requested; cylinder < cylinders.length; cylinder++) {
        const claimedBy = cylinders[cylinder].claimedBy;
        for (const name of claimedBy) {
            addName(names, name);
        }
        if (claimedBy.length > 0) {
            firstClaimed = firstClaimed === -1 ? cylinder : firstClaimed;
            lastClaimed = cylinder;
        }
    }

    const fileSystemEnd = analysis.trsdos === undefined ? undefined :
        endOfCylinders(cylinders, use => use.claimedBy.length > 0 || use.hasFreeSpace);
    const covers = fileSystemEnd === undefined ? "" : "the file system covers cylinders 0-" + (fileSystemEnd - 1) + ", and ";
    if (names.length > 0) {
        throw new DiskError("Can't keep only " + pluralizeWithCount(requested, "cylinder") + ": " + covers +
            namesText(names) + " " + (names.length === 1 ? "is" : "are") + " on " +
            cylinderRangeText(firstClaimed, lastClaimed) + ".");
    }
    if (fileSystemEnd !== undefined && requested < fileSystemEnd && !force) {
        throw new DiskError("Can't keep only " + pluralizeWithCount(requested, "cylinder") +
            ": the file system covers cylinders 0-" + (fileSystemEnd - 1) + ", so " +
            cylinderRangeText(requested, fileSystemEnd - 1) + " would be free space that it expects to have. " +
            "Use --force to drop it anyway.");
    }

    return requested;
}

/**
 * Check that the file system doesn't use side 1 or higher, which --side 0 would drop.
 *
 * @param analysis what the file system uses.
 * @throws DiskError if it does.
 */
function checkSideDrop(analysis: CylinderAnalysis): void {
    if (analysis.trsdos !== undefined && analysis.trsdos.allocationSides >= 2) {
        throw new DiskError("Can't drop side 1: the file system allocates on both sides.");
    }
    if (analysis.sideOneNames.length > 0) {
        throw new DiskError("Can't drop side 1: " + namesText(analysis.sideOneNames) + " " +
            (analysis.sideOneNames.length === 1 ? "has" : "have") + " data on it.");
    }
}

/**
 * Compare the trimmed image with the original and say what's different about it, other than what was
 * dropped. The kept sectors must read the same, and the file system must decode the same way with the
 * same files that read the same.
 *
 * @param session the session, whose disk is still the original.
 * @param trimmed the trimmed image.
 * @param keepCylinders the cylinders that were kept.
 * @param keepSides the sides that were kept.
 * @return a description of the first difference, or undefined if there is none.
 */
function findTrimDifference(session: DiskSession, trimmed: FloppyDisk, keepCylinders: number, keepSides: number): string | undefined {
    const original = session.floppy;
    const trimmedGeometry = trimmed.getGeometry();
    if (trimmedGeometry.cylinderCount > keepCylinders || trimmedGeometry.sideCount > keepSides) {
        return "it has more cylinders or sides than were kept";
    }

    for (const sectorInfo of original.getGeometry().sectorInfos) {
        const position = sectorInfo.sectorPosition;
        if (position.cylinderNumber < keepCylinders && position.side < keepSides &&
            !sectorsReadTheSame(original.readSector(position), trimmed.readSector(position))) {

            return "sector " + position.key() + " reads differently";
        }
    }

    const oldFileSystem = session.fileSystem;
    const newFileSystem = decodeFloppyFileSystem(trimmed);
    if (oldFileSystem === undefined) {
        return newFileSystem === undefined ? undefined : "it has a file system (" + newFileSystem.nameAndVersion + ") that the original didn't";
    }
    if (newFileSystem === undefined) {
        return "the file system (" + oldFileSystem.nameAndVersion + ") isn't recognized";
    }
    if (oldFileSystem.constructor !== newFileSystem.constructor || oldFileSystem.nameAndVersion !== newFileSystem.nameAndVersion) {
        return "the file system reads as " + newFileSystem.nameAndVersion + " instead of " + oldFileSystem.nameAndVersion;
    }

    if (oldFileSystem instanceof Trsdos && newFileSystem instanceof Trsdos) {
        // The count of lumps legitimately changes when the image had cylinders that the file system didn't use.
        const layoutFields = [
            "version", "allocationSides", "granulesPerLump", "sectorsPerGranule", "dirLumpNumber",
            "granulesPerDir", "firstDataCylinder", "hitIgnored",
        ] as const;
        for (const field of layoutFields) {
            if (oldFileSystem[field] !== newFileSystem[field]) {
                return "the file system's " + field + " reads as " + newFileSystem[field] + " instead of " + oldFileSystem[field];
            }
        }
    }

    const oldGeneric = oldFileSystem as FloppyFileSystem;
    const newGeneric = newFileSystem as FloppyFileSystem;
    const oldEntries = oldGeneric.getDirEntries(true);
    const newEntries = newGeneric.getDirEntries(true);
    if (oldEntries.length !== newEntries.length) {
        return "the disk has " + pluralizeWithCount(newEntries.length, "file") + " instead of " + oldEntries.length.toLocaleString();
    }
    for (let i = 0; i < oldEntries.length; i++) {
        const name = oldEntries[i].getFilename("/");
        if (newEntries[i].getFilename("/") !== name) {
            return "the file " + name + " is now " + newEntries[i].getFilename("/");
        }
        const oldContents = oldGeneric.readFile(oldEntries[i]);
        const newContents = newGeneric.readFile(newEntries[i]);
        if (oldContents.length !== newContents.length || !oldContents.every((value, j) => value === newContents[j])) {
            return name + " reads differently";
        }
    }

    return undefined;
}

/**
 * Decide what to drop, from the requested options and what the file system uses.
 *
 * @param session the session.
 * @param requestedCylinders the number of cylinders to keep that the user asked for, or undefined.
 * @param dropSide whether the user asked to drop side 1.
 * @param force whether the user gave --force.
 * @throws DiskError if the options would drop something that's needed.
 */
function makePlan(session: DiskSession, requestedCylinders: number | undefined, dropSide: boolean, force: boolean): TrimPlan {
    const floppy = session.floppy;
    const geometry = floppy.getGeometry();
    const analysis = analyzeCylinders(session);
    const signs = findProtectionSigns(floppy, session.fileSystem);
    const removed: string[] = [];
    let kept: string[] = [];
    let tail: FloppyTail | undefined = undefined;

    // Cylinders.
    let keepCylinders: number;
    let reason: TrimCylindersReason | undefined = undefined;
    if (requestedCylinders === undefined) {
        if (dropSide) {
            // The user asked for a particular thing, so don't do the other.
            keepCylinders = geometry.cylinderCount;
        } else {
            const choice = chooseDefaultCylinders(session, signs);
            keepCylinders = choice.keep;
            kept = choice.kept;
            tail = choice.tail;
            if (choice.removed !== undefined) {
                reason = TrimCylindersReason.PAST_DISK_END;
                removed.push(choice.removed);
            }
        }
    } else {
        keepCylinders = checkRequestedCylinders(analysis, requestedCylinders, force);
        if (keepCylinders < geometry.cylinderCount) {
            reason = TrimCylindersReason.REQUESTED;
            checkDroppedProtection(floppy, signs, cylinder => cylinder >= keepCylinders,
                cylinderRangeText(keepCylinders, geometry.cylinderCount - 1));
            removed.push("Removed " + cylinderRangeText(keepCylinders, geometry.cylinderCount - 1) + ".");
        }
    }

    // Sides.
    let keepSides = geometry.sideCount;
    if (dropSide && geometry.sideCount > 1) {
        checkSideDrop(analysis);
        checkDroppedProtection(floppy, signs, (_cylinder, side) => side >= 1, "side 1");
        keepSides = 1;
    }

    // Outside the TRSDOS family, we can't tell what the file system covers, so go by whether
    // what's dropped is blank. A file on a dropped track has already refused.
    const explicit = requestedCylinders !== undefined || dropSide;
    if (explicit && analysis.trsdos === undefined && !force) {
        const cylindersWithData = findCylindersWithData(floppy,
            (cylinder, side) => cylinder >= keepCylinders || side >= keepSides);
        if (cylindersWithData.length > 0) {
            const why = session.fileSystem === undefined ? "the disk has no file system that we recognize" :
                "the " + session.fileSystem.nameAndVersion + " file system doesn't use them";
            throw new DiskError("The tracks to drop hold data that isn't filler, on " +
                cylinderRangeText(cylindersWithData[0], cylindersWithData[cylindersWithData.length - 1]) +
                ", and " + why + ". Use --force to drop them anyway.");
        }
    }

    if (keepSides < geometry.sideCount) {
        removed.push("Removed side 1.");
    }

    return {keepCylinders, keepSides, cylindersReason: keepCylinders < geometry.cylinderCount ? reason : undefined,
        removed, kept, tail};
}

/**
 * Why trimDisk() had nothing to trim.
 */
export enum TrimNothingReason {
    /** Side 1 was to be dropped, but the image has only one side. */
    ONE_SIDE,
    /** A number of cylinders was asked for, but the image has no more than that. */
    CYLINDERS,
    /** The image has no cylinders past the end that the DOS's records give the disk. */
    UNUSED,
    /** The image has cylinders past the disk's end, but none that can be proven to hold nothing the disk needs. */
    KEPT,
    /** The DOS's records don't prove where the disk ends, so nothing past it can be dropped. */
    SIZE_UNPROVEN,
}

/**
 * Why trimDisk() dropped cylinders.
 */
export enum TrimCylindersReason {
    /** The user asked for fewer cylinders. */
    REQUESTED,
    /**
     * The dropped cylinders are past the end that the DOS's records give the disk, and hold only
     * re-reads of earlier cylinders and unformatted tracks.
     */
    PAST_DISK_END,
}

/**
 * What trimDisk() did when it trimmed the image.
 */
export interface TrimDoneResult {
    trimmed: true;
    /** What was dropped, one sentence each. */
    removed: string[];
    /** Why cylinders past the disk's end were kept, one sentence each. */
    kept: string[];
    /** Why cylinders were dropped, or undefined if none were. */
    cylindersReason: TrimCylindersReason | undefined;
    /** The image's cylinders before. */
    oldCylinderCount: number;
    /** The image's cylinders after. */
    newCylinderCount: number;
    /** The image's sides before. */
    oldSideCount: number;
    /** The image's sides after. */
    newSideCount: number;
    /** The image's size in bytes before. */
    oldSize: number;
    /** The image's size in bytes after. */
    newSize: number;
}

/**
 * What trimDisk() did when it had nothing to trim.
 */
export interface TrimNothingResult {
    trimmed: false;
    reason: TrimNothingReason;
    /** The image's cylinders. */
    cylinderCount: number;
    /** Why cylinders past the disk's end were kept, one sentence each. Empty unless the reason is KEPT. */
    kept: string[];
    /** The disk's cylinders by its DOS's records, if they prove a size. */
    diskCylinderCount: number | undefined;
    /** Where the disk's size comes from, such as "GAT byte 0xCC", if it's proven. */
    diskSizeSource: string | undefined;
    /** Why the DOS's records don't prove the disk's size, as a clause, if the reason is SIZE_UNPROVEN. */
    unproven: string | undefined;
}

/**
 * What trimDisk() did: nothing, or the new, smaller image.
 */
export type TrimResult = TrimNothingResult | TrimDoneResult;

/**
 * Rebuild the image without the tracks that nothing needs, and replace the session's disk with it, so that
 * the change is saved like any other. With no options, drops only cylinders at the end that the DOS's own
 * records put past the disk's end and that hold nothing but re-reads of earlier cylinders and unformatted
 * tracks (see analyzeFloppyTail() in trs80-base), and says why it kept the others. With a number of
 * cylinders or dropSide, drops what was asked for, but refuses if a file (or, on TRSDOS, the file
 * system's own space) is there, or, where we can't tell, if the tracks hold data that isn't filler
 * (unless forced). Either way it refuses to drop a track that shows signs of copy protection, even when
 * forced. The result must decode as the same file system with the same files, or nothing changes. Works
 * on DMK, JV1 and JV3 images.
 *
 * @param session the session, whose disk is a floppy.
 * @param options what to drop.
 * @param options.cylinders the number of cylinders to keep, or undefined to choose.
 * @param options.dropSide whether to drop side 1, keeping only side 0.
 * @param options.force whether to drop tracks that hold data we can't prove is unused, or trim a
 * write-protected image.
 * @throws DiskError if the request is invalid, or would drop something that's needed.
 */
export function trimDisk(session: DiskSession, options: {cylinders: number | undefined, dropSide: boolean, force: boolean}): TrimResult {
    const {cylinders: requestedCylinders, dropSide, force} = options;
    if (requestedCylinders === 0) {
        throw new DiskError("Invalid --cylinders \"0\": a disk needs at least 1");
    }

    const floppy = session.floppy;
    if (!canTrimFloppy(floppy)) {
        throw new DiskError("trim works on " + TRIMMABLE_FLOPPY_FORMATS + " images, not on " + floppy.getDescription());
    }

    const geometry = floppy.getGeometry();
    const plan = makePlan(session, requestedCylinders, dropSide, force);
    if (plan.removed.length === 0) {
        let reason: TrimNothingReason;
        if (dropSide && geometry.sideCount === 1) {
            reason = TrimNothingReason.ONE_SIDE;
        } else if (requestedCylinders !== undefined) {
            reason = TrimNothingReason.CYLINDERS;
        } else if (plan.tail === undefined || plan.tail.size === undefined) {
            reason = TrimNothingReason.SIZE_UNPROVEN;
        } else if (plan.tail.cylinders.length === 0) {
            reason = TrimNothingReason.UNUSED;
        } else {
            reason = TrimNothingReason.KEPT;
        }
        return {
            trimmed: false, reason, cylinderCount: geometry.cylinderCount, kept: plan.kept,
            diskCylinderCount: plan.tail?.size?.cylinderCount, diskSizeSource: plan.tail?.size?.source,
            unproven: plan.tail?.unproven,
        };
    }

    if (floppy.isWriteProtected() && !force) {
        throw new DiskError("The image is write-protected; use --force to trim it anyway.", DiskErrorKind.WRITE_PROTECTED);
    }

    const trimmed = trimFloppy(floppy, plan.keepCylinders, plan.keepSides);
    if (typeof trimmed === "string") {
        throw new DiskError(trimmed + "; nothing was changed.");
    }
    const difference = findTrimDifference(session, trimmed, plan.keepCylinders, plan.keepSides);
    if (difference !== undefined) {
        throw new DiskError("Trimming would change the disk (" + difference + "), so nothing was changed.");
    }

    const oldSize = floppy.binary.length;
    session.setFloppy(trimmed);
    return {
        trimmed: true,
        removed: plan.removed,
        kept: plan.kept,
        cylindersReason: plan.cylindersReason,
        oldCylinderCount: geometry.cylinderCount,
        newCylinderCount: plan.keepCylinders,
        oldSideCount: geometry.sideCount,
        newSideCount: plan.keepSides,
        oldSize,
        newSize: trimmed.binary.length,
    };
}
