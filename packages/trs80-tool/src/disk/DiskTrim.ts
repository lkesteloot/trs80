import {
    canTrimFloppy, decodeFloppyFileSystem, type FloppyDisk, type FloppyFileSystem, type KnownFloppyFileSystem,
    SectorData, Trsdos, TrackPosition, trimFloppy, TRIMMABLE_FLOPPY_FORMATS,
} from "trs80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {parseCountOption} from "./DiskCommandParser.js";
import {DiskSession} from "trs80-disk";

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
    /** Whether any track of the cylinder has a sector that we can read. */
    readable: boolean;
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
 * Work out what a TRSDOS-family file system uses on each cylinder, from its granule map: which granules
 * files and the directory own, and which are free. A granule that the GAT says is used but that nothing
 * owns (including the lockout table's "beyond the end" entries) counts as neither.
 *
 * @param session the session, whose disk has a TRSDOS-family file system.
 * @param trsdos the file system.
 * @param cylinders the per-cylinder records to fill in.
 * @throws ToolError if the granule map can't be made.
 */
function analyzeTrsdosCylinders(session: DiskSession, trsdos: Trsdos, cylinders: CylinderUse[]): void {
    const granuleMap = session.getGranuleMap();
    if (granuleMap === undefined || typeof granuleMap === "string") {
        throw new ToolError("Can't tell which cylinders the file system uses" +
            (typeof granuleMap === "string" ? ": " + granuleMap : ""));
    }

    for (const granule of granuleMap.granules) {
        // A granule is a run of sectors, and normally sits within one cylinder, but be careful.
        const firstSectorIndex = granule.lump*trsdos.sectorsPerLump + granule.granule*trsdos.sectorsPerGranule;
        const lastSectorIndex = firstSectorIndex + trsdos.sectorsPerGranule - 1;
        const firstCylinder = trsdos.firstDataCylinder + Math.floor(firstSectorIndex/trsdos.sectorsPerCylinder);
        const lastCylinder = trsdos.firstDataCylinder + Math.floor(lastSectorIndex/trsdos.sectorsPerCylinder);

        for (let cylinder = firstCylinder; cylinder <= lastCylinder && cylinder < cylinders.length; cylinder++) {
            const use = cylinders[cylinder];
            for (const owner of granule.owners) {
                addName(use.claimedBy, owner.getFilename("/"));
            }
            if (granule.inDirectory && granule.owners.length === 0) {
                // Normally DIR/SYS owns these granules, but a disk can be damaged.
                addName(use.claimedBy, "the directory");
            }
            if (granule.isFree()) {
                use.hasFreeSpace = true;
            }
        }
    }
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
 * @throws ToolError if the disk has a TRSDOS-family file system that we can't analyze.
 */
function analyzeCylinders(session: DiskSession): CylinderAnalysis {
    const geometry = session.floppy.getGeometry();
    const cylinders: CylinderUse[] = [];
    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        let readable = false;
        for (let side = 0; side < geometry.sideCount; side++) {
            readable ||= geometry.trackMap.has(new TrackPosition(cylinder, side).key());
        }
        cylinders.push({claimedBy: [], hasFreeSpace: false, readable});
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
 * What the command decided to keep and why.
 */
interface TrimPlan {
    /** The cylinders to keep, from cylinder 0. */
    keepCylinders: number;
    /** The sides to keep, from side 0. */
    keepSides: number;
    /** What to tell the user about what's dropped, one sentence each. Empty if nothing is. */
    removed: string[];
}

/**
 * Decide how many cylinders to keep when the user didn't say: the cylinders the file system uses, less
 * any at the end that can't be read. A cylinder with a file on it is never dropped.
 *
 * @param analysis what the file system uses.
 * @return the count to keep, and the reason for dropping the rest (undefined if nothing is dropped).
 */
function chooseDefaultCylinders(analysis: CylinderAnalysis): {keep: number, reason: string | undefined} {
    const cylinders = analysis.cylinders;
    const claimedEnd = endOfCylinders(cylinders, use => use.claimedBy.length > 0);
    const readableEnd = endOfCylinders(cylinders, use => use.readable);
    const fileSystemEnd = analysis.trsdos === undefined ? undefined :
        endOfCylinders(cylinders, use => use.claimedBy.length > 0 || use.hasFreeSpace);

    const keep = Math.min(cylinders.length, Math.max(claimedEnd, Math.min(fileSystemEnd ?? Infinity, readableEnd)));
    let reason: string | undefined = undefined;
    if (keep < cylinders.length) {
        reason = keep === fileSystemEnd ? "the file system uses 0-" + (keep - 1) : "they have no readable sectors";
    }

    return {keep, reason};
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
 * @throws ToolError if the file system needs a dropped cylinder.
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
        throw new ToolError("Can't keep only " + pluralizeWithCount(requested, "cylinder") + ": " + covers +
            namesText(names) + " " + (names.length === 1 ? "is" : "are") + " on " +
            cylinderRangeText(firstClaimed, lastClaimed) + ".");
    }
    if (fileSystemEnd !== undefined && requested < fileSystemEnd && !force) {
        throw new ToolError("Can't keep only " + pluralizeWithCount(requested, "cylinder") +
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
 * @throws ToolError if it does.
 */
function checkSideDrop(analysis: CylinderAnalysis): void {
    if (analysis.trsdos !== undefined && analysis.trsdos.allocationSides >= 2) {
        throw new ToolError("Can't drop side 1: the file system allocates on both sides.");
    }
    if (analysis.sideOneNames.length > 0) {
        throw new ToolError("Can't drop side 1: " + namesText(analysis.sideOneNames) + " " +
            (analysis.sideOneNames.length === 1 ? "has" : "have") + " data on it.");
    }
}

/**
 * Whether two sectors read the same: data, deleted state and data address mark.
 */
function sectorsMatch(a: SectorData | undefined, b: SectorData | undefined): boolean {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    if (a.data.length !== b.data.length || a.deleted !== b.deleted || a.getDataAddressMark() !== b.getDataAddressMark()) {
        return false;
    }
    return a.data.every((value, i) => value === b.data[i]);
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
            !sectorsMatch(original.readSector(position), trimmed.readSector(position))) {

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
 * Decide what to drop, from the command's options and what the file system uses.
 *
 * @param session the session.
 * @param requestedCylinders the number from --cylinders, or undefined.
 * @param dropSide whether --side 0 was given.
 * @param force whether the user gave --force.
 * @throws ToolError if the options would drop something that's needed.
 */
function makePlan(session: DiskSession, requestedCylinders: number | undefined, dropSide: boolean, force: boolean): TrimPlan {
    const floppy = session.floppy;
    const geometry = floppy.getGeometry();
    const analysis = analyzeCylinders(session);
    const removed: string[] = [];

    // Cylinders.
    let keepCylinders: number;
    let reason: string | undefined = undefined;
    if (requestedCylinders === undefined) {
        if (dropSide) {
            // The user asked for a particular thing, so don't do the other.
            keepCylinders = geometry.cylinderCount;
        } else {
            ({keep: keepCylinders, reason} = chooseDefaultCylinders(analysis));
        }
    } else {
        keepCylinders = checkRequestedCylinders(analysis, requestedCylinders, force);
    }

    // Sides.
    let keepSides = geometry.sideCount;
    if (dropSide && geometry.sideCount > 1) {
        checkSideDrop(analysis);
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
            throw new ToolError("The tracks to drop hold data that isn't filler, on " +
                cylinderRangeText(cylindersWithData[0], cylindersWithData[cylindersWithData.length - 1]) +
                ", and " + why + ". Use --force to drop them anyway.");
        }
    }

    if (keepCylinders < geometry.cylinderCount) {
        const dropped = cylinderRangeText(keepCylinders, geometry.cylinderCount - 1);
        removed.push("Removed " + dropped + (reason === undefined ? "" : " (" + reason + ")") + ".");
    }
    if (keepSides < geometry.sideCount) {
        removed.push("Removed side 1.");
    }

    return {keepCylinders, keepSides, removed};
}

/**
 * The "trim" command: drop an image's unused tracks.
 */
export const TRIM_COMMAND: DiskCommand = {
    spec: {
        name: "trim",
        aliases: [],
        args: "",
        summary: "drop the cylinders (or side 1) that the disk doesn't use from the image",
        options: [
            {
                name: "--cylinders",
                valueName: "N",
                description: "keep cylinders 0 to N-1 (default: drop those past the file system's, " +
                    "and unreadable ones at the end)",
            },
            {
                name: "--side",
                valueName: "0",
                description: "drop side 1, keeping only side 0 (refused if the file system uses both)",
            },
            {
                name: "--force",
                valueName: undefined,
                description: "drop tracks that hold data we can't prove is unused, or trim a write-protected image",
            },
        ],
    },

    endsSession: false,
    floppyOnly: true,

    /**
     * Rebuild the image without the tracks that nothing needs, and replace the session's disk with it, so that
     * the change is saved like any other (and --dry-run and -o apply). With no options, drops the cylinders past the
     * ones the file system uses, and unreadable ones at the end. With --cylinders N or --side 0, drops what was asked
     * for, but refuses if a file (or, on TRSDOS, the file system's own space) is there, or, where we can't tell,
     * if the tracks hold data that isn't filler (unless --force). The result must decode as the same file system with
     * the same files, or nothing changes. Works on DMK, JV1 and JV3 images.
     */
    run(session, command, globalOptions) {
        const options = command.options;
        const requestedCylinders = parseCountOption(options, "--cylinders");
        if (requestedCylinders === 0) {
            throw new ToolError("Invalid --cylinders \"0\": a disk needs at least 1");
        }
        const sideText = options.getString("--side");
        if (sideText !== undefined && sideText !== "0") {
            throw new ToolError("Invalid --side \"" + sideText + "\": only 0 is supported, which drops side 1");
        }
        const dropSide = sideText !== undefined;
        const force = options.has("--force") || globalOptions.has("--force");

        const floppy = session.floppy;
        if (!canTrimFloppy(floppy)) {
            throw new ToolError("trim works on " + TRIMMABLE_FLOPPY_FORMATS + " images, not on " + floppy.getDescription());
        }

        const geometry = floppy.getGeometry();
        const plan = makePlan(session, requestedCylinders, dropSide, force);
        if (plan.removed.length === 0) {
            if (dropSide && geometry.sideCount === 1) {
                console.log("Nothing to trim: the image has only one side.");
            } else if (requestedCylinders !== undefined) {
                console.log("Nothing to trim: the image has only " + pluralizeWithCount(geometry.cylinderCount, "cylinder") + ".");
            } else {
                console.log("Nothing to trim: the image has no cylinders at the end that the disk doesn't use.");
            }
            return;
        }

        if (floppy.isWriteProtected() && !force) {
            throw new ToolError("The image is write-protected; use --force to trim it anyway.");
        }

        const trimmed = trimFloppy(floppy, plan.keepCylinders, plan.keepSides);
        if (typeof trimmed === "string") {
            throw new ToolError(trimmed + "; nothing was changed.");
        }
        const difference = findTrimDifference(session, trimmed, plan.keepCylinders, plan.keepSides);
        if (difference !== undefined) {
            throw new ToolError("Trimming would change the disk (" + difference + "), so nothing was changed.");
        }

        const oldSize = floppy.binary.length;
        session.setFloppy(trimmed);
        for (const message of plan.removed) {
            console.log(message);
        }
        console.log("The image is now " + pluralizeWithCount(trimmed.binary.length, "byte") + ", from " +
            oldSize.toLocaleString() + "; nothing is saved until quit.");
    },
};
