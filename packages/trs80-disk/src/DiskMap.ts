import {
    findUnusableFreeGranules, SectorPosition, Trsdos, TrsdosGranuleMap, type TrsdosDirEntry, type TrsdosGranule,
} from "trs80-base";
import {assertNever} from "z80-base";
import {DiskError, DiskErrorKind} from "./DiskError.js";
import type {DiskSession} from "./DiskSession.js";
import {selectByPatterns, systemWildcardHint} from "./Patterns.js";
import {pluralizeWithCount} from "./Plural.js";

// The model behind the "map" command: where everything is on a TRSDOS-family disk, as data that a terminal
// or a web page can draw.

/**
 * The raw (8 + 3 characters) names of the system files that the map shows as the boot and directory
 * granules rather than as files.
 */
const BOOT_RAW_FILENAME = "BOOT    SYS";
const DIR_RAW_FILENAME = "DIR     SYS";

/**
 * What a granule shows in the map, which draws every sector of the granule the same way.
 */
export enum MapCellKind {
    /** Nothing uses the granule. */
    FREE,
    /** Nothing uses the granule, but the image doesn't fully hold it, so new files skip it. */
    NOT_ON_IMAGE,
    /** Nothing uses the granule, but it's past the disk's proven size, so new files never get it. */
    PAST_END,
    /** One file uses it, and the file is among those the user is looking at. */
    FILE,
    /** One file uses it, but the user asked about other files. */
    OTHER_FILE,
    /** The directory. */
    DIRECTORY,
    /** The boot sector's granule, or BOOT/SYS's. */
    BOOT,
    /** The lockout table says the granule can't be used. */
    LOCKED_OUT,
    /** Two or more files claim the granule. */
    SHARED,
    /** A file claims the granule, but the GAT says it's free, so the DOS would hand it out again. */
    CLAIMED_BUT_FREE,
    /** The GAT says the granule is used, but no file claims it. */
    UNCLAIMED,
}

/**
 * What a cell kind means, for the map's legend. A file's cells carry the file's name in the grid, so this
 * is only a generic phrase for it.
 */
export function mapCellKindToString(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return "free";
        case MapCellKind.NOT_ON_IMAGE:
            return "free in the GAT, but not fully on the image";
        case MapCellKind.PAST_END:
            return "free in the GAT, but past the disk's end";
        case MapCellKind.FILE:
            return "file";
        case MapCellKind.OTHER_FILE:
            return "other file";
        case MapCellKind.DIRECTORY:
            return "directory";
        case MapCellKind.BOOT:
            return "boot";
        case MapCellKind.LOCKED_OUT:
            return "locked out";
        case MapCellKind.SHARED:
            return "shared by two or more files";
        case MapCellKind.CLAIMED_BUT_FREE:
            return "claimed by a file but free in the GAT";
        case MapCellKind.UNCLAIMED:
            return "used in the GAT but claimed by no file";
        default:
            assertNever(kind);
    }
}

/**
 * Whether the kind of cell is a sign of a damaged file system.
 */
export function mapCellKindIsProblem(kind: MapCellKind): boolean {
    switch (kind) {
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return true;
        case MapCellKind.FREE:
        case MapCellKind.NOT_ON_IMAGE:
        case MapCellKind.PAST_END:
        case MapCellKind.FILE:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
        case MapCellKind.LOCKED_OUT:
            return false;
        default:
            assertNever(kind);
    }
}

/**
 * A file that the map shows in a color of its own, with its name.
 */
export interface MapFile {
    /** The directory entry. */
    dirEntry: TrsdosDirEntry;
    /** The position of the file in the list of files, which tells files apart. */
    index: number;
    /** The name shown in the map. */
    name: string;
    /**
     * The file's position in the sequence of colored files (0, 1, 2, ...), which a drawing maps to a color
     * of its palette (wrapping around when it runs out), or undefined for a file with no granules, which
     * gets no color.
     */
    colorIndex: number | undefined;
    /** The number of granules the file occupies. */
    granuleCount: number;
}

/**
 * How one granule is shown.
 */
export interface MapCell {
    /** The granule's lump (the cylinder, where lumps are cylinders). */
    lump: number;
    /** The granule's index within its lump. */
    granule: number;
    /** The physical positions of the granule's sectors, in order. */
    sectors: SectorPosition[];
    /** The kind of cell. */
    kind: MapCellKind;
    /** The file, for a FILE cell. */
    file: MapFile | undefined;
    /**
     * Every file whose directory entries claim the granule, in directory order, BOOT/SYS and DIR/SYS
     * included: one for a FILE cell, two or more (not counting those two) for a SHARED one.
     */
    owners: readonly TrsdosDirEntry[];
    /** The name written at the start of a run of these cells, or undefined for kinds that have none. */
    label: string | undefined;
    /** Tells apart cells that look the same, which are drawn as one run when they're next to each other. */
    identity: string;
}

/**
 * The shape of the disk's sectors, which a drawing lays out its grid by.
 */
export interface MapLayout {
    /** The number of sectors per track that the file system uses. */
    sectorsPerTrack: number;
    /** The number of the first sector on a track (0 or 1). */
    firstSectorNumber: number;
    /** The number of sides that the file system allocates on (1 or 2). */
    allocationSides: number;
    /** The number of sides in the image, which can be more than the file system uses. */
    imageSideCount: number;
    /** The last cylinder to show: the image's last, or a later one that a granule is on. */
    lastCylinder: number;
}

/**
 * The counts behind the map's totals line.
 */
export interface MapTotals {
    /** The number of granules on the disk. */
    granuleCount: number;
    /** The number of granules that new files could be given (see FreeSpace in DiskSession.ts). */
    freeGranuleCount: number;
    /** The number of granules that the GAT calls free but that the image doesn't fully hold. */
    notOnImageGranuleCount: number;
    /** The number of granules that the GAT calls free past the disk's proven size. */
    pastEndGranuleCount: number;
    /** The number of granules that the lockout table marks as unusable. */
    lockedOutGranuleCount: number;
    /** The number of bytes in the granules that new files could be given. */
    freeByteCount: number;
    /** The number of bytes in a granule. */
    granuleByteCount: number;
}

/**
 * Everything a drawing of the map needs, with no knowledge of TRSDOS.
 */
export interface DiskMapModel {
    /** One cell for each granule, in the granule map's order (by lump, then granule). */
    cells: MapCell[];
    /**
     * The files that have names and colors, in legend order: user files in directory order, then system
     * files. When the user named files by pattern this includes those with no granules.
     */
    files: MapFile[];
    /** Whether the user named files by pattern, so that the matching files are listed below the map. */
    hasSelection: boolean;
    /** How many cells there are of each kind, for the legend. A kind with none has no entry. */
    kindCounts: Map<MapCellKind, number>;
    /** The shape of the disk. */
    layout: MapLayout;
    /** The counts behind the totals. */
    totals: MapTotals;
}

/**
 * Whether the entry is BOOT/SYS or DIR/SYS, which the map shows as the boot and directory granules
 * rather than as files.
 */
export function isBootOrDirFile(dirEntry: TrsdosDirEntry): boolean {
    return dirEntry.rawFilename === BOOT_RAW_FILENAME || dirEntry.rawFilename === DIR_RAW_FILENAME;
}

/**
 * Decide what a granule shows. The checks run in order of importance: a problem shows over anything
 * else, then a file, then the disk's own structures.
 *
 * @param granule the granule.
 * @param mapFiles the files that have colors, by directory entry.
 * @param unusable the free granules that new files never get, and why.
 */
function classifyGranule(granule: TrsdosGranule, mapFiles: Map<TrsdosDirEntry, MapFile | undefined>,
                         unusable: Map<TrsdosGranule, MapCellKind>): { kind: MapCellKind, file: MapFile | undefined } {

    const realOwners = granule.owners.filter(owner => !isBootOrDirFile(owner));
    const hasBootOwner = granule.owners.some(owner => owner.rawFilename === BOOT_RAW_FILENAME);

    if (realOwners.length > 1) {
        return { kind: MapCellKind.SHARED, file: undefined };
    }
    if (granule.owners.length > 0 && !granule.gatUsed) {
        return { kind: MapCellKind.CLAIMED_BUT_FREE, file: undefined };
    }
    if (realOwners.length === 1) {
        const file = mapFiles.get(realOwners[0]);
        return file === undefined ? { kind: MapCellKind.OTHER_FILE, file: undefined } : { kind: MapCellKind.FILE, file };
    }
    if (granule.inDirectory) {
        return { kind: MapCellKind.DIRECTORY, file: undefined };
    }
    if (hasBootOwner) {
        return { kind: MapCellKind.BOOT, file: undefined };
    }
    if (granule.owners.length > 0) {
        // DIR/SYS outside the directory's range, which is unusual but not a problem for the file system.
        return { kind: MapCellKind.DIRECTORY, file: undefined };
    }
    if (granule.lockedOut) {
        return { kind: MapCellKind.LOCKED_OUT, file: undefined };
    }
    if (granule.gatUsed) {
        // The boot cylinder has granules that no file claims, on DOSes whose boot sector isn't a file.
        return { kind: granule.lump === 0 ? MapCellKind.BOOT : MapCellKind.UNCLAIMED, file: undefined };
    }
    return { kind: unusable.get(granule) ?? MapCellKind.FREE, file: undefined };
}

/**
 * The name to write at the start of a run of a kind of cell, or undefined if the kind has none. The directory
 * and boot granules take the name of the system file that owns them, if there is one.
 *
 * @param granule the granule.
 * @param cellKind what the granule shows.
 * @param file the file, for a FILE cell.
 */
function cellLabel(granule: TrsdosGranule, cellKind: MapCellKind, file: MapFile | undefined): string | undefined {
    switch (cellKind) {
        case MapCellKind.FILE:
            return file?.name;
        case MapCellKind.DIRECTORY: {
            const owner = granule.owners.find(owner => owner.rawFilename === DIR_RAW_FILENAME);
            return owner?.getFilename("/") ?? "directory";
        }
        case MapCellKind.BOOT: {
            const owner = granule.owners.find(owner => owner.rawFilename === BOOT_RAW_FILENAME);
            return owner?.getFilename("/") ?? "boot";
        }
        case MapCellKind.FREE:
        case MapCellKind.NOT_ON_IMAGE:
        case MapCellKind.PAST_END:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.LOCKED_OUT:
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return undefined;
        default:
            assertNever(cellKind);
    }
}

/**
 * Work out what a granule shows.
 *
 * @param trsdos the file system, which maps the granule to its sectors.
 * @param granule the granule.
 * @param mapFiles the files that have colors, by directory entry.
 * @param unusable the free granules that new files never get, and why.
 */
function makeMapCell(trsdos: Trsdos, granule: TrsdosGranule, mapFiles: Map<TrsdosDirEntry, MapFile | undefined>,
                     unusable: Map<TrsdosGranule, MapCellKind>): MapCell {
    const {kind, file} = classifyGranule(granule, mapFiles, unusable);
    const label = cellLabel(granule, kind, file);
    // Files are told apart by their position, everything else by its kind and name.
    const identity = kind + ":" + (file !== undefined ? file.index : label ?? "");
    const sectors = trsdos.getGranuleSectorPositions(granule.lump, granule.granule);
    return { lump: granule.lump, granule: granule.granule, sectors, kind, file, owners: [...granule.owners], label, identity };
}

/**
 * Give the files their colors. User files come first, in directory order, then system files; BOOT/SYS and
 * DIR/SYS have none, since the map shows them as the boot and directory granules.
 *
 * @param files the primary directory entries to give colors to (the selected ones), in directory order.
 * @param granuleCounts the number of granules each file occupies.
 * @return the files in legend order.
 */
function makeMapFiles(files: TrsdosDirEntry[], granuleCounts: Map<TrsdosDirEntry, number>): MapFile[] {
    const candidates = files.filter(file => !isBootOrDirFile(file));
    const ordered = [...candidates.filter(file => !file.isSystemFile()), ...candidates.filter(file => file.isSystemFile())];

    const mapFiles: MapFile[] = [];
    let nextColor = 0;
    for (const dirEntry of ordered) {
        const granuleCount = granuleCounts.get(dirEntry) ?? 0;
        const index = mapFiles.length;
        const name = dirEntry.getFilename("/");
        if (granuleCount === 0) {
            // It has no cells to draw. (It's still listed if the user named it.)
            mapFiles.push({ dirEntry, index, name, colorIndex: undefined, granuleCount });
            continue;
        }
        mapFiles.push({ dirEntry, index, name, colorIndex: nextColor, granuleCount });
        nextColor++;
    }

    return mapFiles;
}

/**
 * Make the model of a TRSDOS disk's map from its granule map.
 *
 * @param granuleMap the analysis of the disk. Its owners' entries are the files, in directory order.
 * @param files the directory entries to show, in directory order, as made for the granule map.
 * @param selected the files to give colors to, or undefined for all of them.
 */
export function makeDiskMapModel(granuleMap: TrsdosGranuleMap, files: TrsdosDirEntry[],
                                 selected: TrsdosDirEntry[] | undefined): DiskMapModel {

    const trsdos = granuleMap.trsdos;

    // How much of the disk each file occupies.
    const granuleCounts = new Map<TrsdosDirEntry, number>();
    for (const granule of granuleMap.granules) {
        for (const owner of granule.owners) {
            granuleCounts.set(owner, (granuleCounts.get(owner) ?? 0) + 1);
        }
    }

    // Files that have no cells don't get a color unless the user asked for them by pattern.
    const wanted = (selected ?? files).filter(file => selected !== undefined || (granuleCounts.get(file) ?? 0) > 0);
    const mapFiles = makeMapFiles(wanted, granuleCounts);
    const mapFilesByEntry = new Map<TrsdosDirEntry, MapFile | undefined>();
    for (const mapFile of mapFiles) {
        if (mapFile.granuleCount > 0) {
            mapFilesByEntry.set(mapFile.dirEntry, mapFile);
        }
    }

    // What every granule shows, and where its sectors are, using the DOS's own mapping.
    // The free granules that new files never get, by the writer's own tests.
    const {missing, pastEnd} = findUnusableFreeGranules(trsdos, granuleMap);
    const unusable = new Map<TrsdosGranule, MapCellKind>([
        ...missing.map(granule => [granule, MapCellKind.NOT_ON_IMAGE] as const),
        ...pastEnd.map(granule => [granule, MapCellKind.PAST_END] as const),
    ]);
    const cells = granuleMap.granules.map(granule => makeMapCell(trsdos, granule, mapFilesByEntry, unusable));
    const kindCounts = new Map<MapCellKind, number>();
    let lastCylinder = trsdos.geometry.cylinderCount - 1;
    for (const cell of cells) {
        kindCounts.set(cell.kind, (kindCounts.get(cell.kind) ?? 0) + 1);
        for (const position of cell.sectors) {
            lastCylinder = Math.max(lastCylinder, position.cylinderNumber);
        }
    }

    const layout: MapLayout = {
        sectorsPerTrack: trsdos.geometry.modalDataSectorSpan,
        firstSectorNumber: trsdos.firstSectorNumber,
        allocationSides: trsdos.allocationSides,
        imageSideCount: trsdos.geometry.sideCount,
        lastCylinder,
    };

    const granuleByteCount = trsdos.sectorsPerGranule*trsdos.geometry.modalDataSectorSize;
    const freeGranuleCount = granuleMap.getFreeGranuleCount() - missing.length - pastEnd.length;
    const totals: MapTotals = {
        granuleCount: granuleMap.granules.length,
        freeGranuleCount,
        notOnImageGranuleCount: missing.length,
        pastEndGranuleCount: pastEnd.length,
        lockedOutGranuleCount: granuleMap.granules.filter(granule => granule.lockedOut).length,
        freeByteCount: freeGranuleCount*granuleByteCount,
        granuleByteCount,
    };

    return { cells, files: mapFiles, hasSelection: selected !== undefined, kindCounts, layout, totals };
}

/**
 * Make the model of the map of the session's disk: check that it has a TRSDOS-family file system, analyze
 * its granules, and pick out the files that the patterns name.
 *
 * @param session the open disk.
 * @param patterns the patterns of the files to highlight, or empty for all of them.
 * @throws DiskError if the disk has no TRSDOS-family file system, the granule map can't be made, or a
 * pattern matches no file.
 */
export function buildDiskMap(session: DiskSession, patterns: string[]): DiskMapModel {
    const fileSystem = session.fileSystem;
    if (fileSystem === undefined) {
        throw new DiskError("Can't find a DOS directory on \"" + session.name + "\"");
    }
    if (!(fileSystem instanceof Trsdos)) {
        throw new DiskError("map works on TRSDOS-family disks, not " + fileSystem.nameAndVersion + " disks");
    }

    // Make our own map, from our own copy of the directory, so that the files are in directory order.
    const files = fileSystem.getDirEntries(true);
    const granuleMap = TrsdosGranuleMap.make(fileSystem, files);
    if (typeof granuleMap === "string") {
        throw new DiskError("Can't draw the map: " + granuleMap);
    }

    let selected: TrsdosDirEntry[] | undefined = undefined;
    if (patterns.length > 0) {
        const selection = selectByPatterns(files, patterns, {
            name: file => file.getFilename("."),
            hasDirectories: () => false,
            isSystem: file => file.isSystemFile(),
        }, false);
        if (selection.unmatchedPattern !== undefined) {
            throw new DiskError("No file on the disk matches \"" + selection.unmatchedPattern + "\"" +
                systemWildcardHint(selection.unmatchedOnlySystem), DiskErrorKind.NOT_FOUND);
        }
        selected = selection.selected;
    }

    return makeDiskMapModel(granuleMap, files, selected);
}

/**
 * The text of the map's totals line, such as "62 of 240 granules used, 178 free (222.5 KB)". The granules that
 * the GAT calls free but new files never get are counted apart, after the free ones, and not as used.
 */
export function totalsText(totals: MapTotals): string {
    const total = totals.granuleCount;
    const free = totals.freeGranuleCount;
    const notOnImage = totals.notOnImageGranuleCount;
    const pastEnd = totals.pastEndGranuleCount;
    const lockedOut = totals.lockedOutGranuleCount;
    const freeKb = totals.freeByteCount/1024;
    const used = total - free - notOnImage - pastEnd;
    return used.toLocaleString() + " of " + pluralizeWithCount(total, "granule") + " used, " +
        free.toLocaleString() + " free (" + freeKb.toLocaleString(undefined, { maximumFractionDigits: 1 }) +
        " KB)" +
        (notOnImage > 0 ? ", " + notOnImage.toLocaleString() + " free in the GAT but not fully on the image" : "") +
        (pastEnd > 0 ? ", " + pastEnd.toLocaleString() + " free in the GAT but past the disk's end" : "") +
        (lockedOut > 0 ? ", " + lockedOut.toLocaleString() + " locked out" : "") +
        ". A granule is " + pluralizeWithCount(totals.granuleByteCount, "byte") + ".";
}
