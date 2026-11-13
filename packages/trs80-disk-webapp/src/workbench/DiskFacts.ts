import {densityToString, floppyImageFormatOf, floppyImageFormatToString} from "trs80-base";
import {buildDiskMap, DiskError, type DiskSession, type MapFile} from "trs80-disk";

/**
 * The facts about a disk that the header's chips and the inspector show.
 */
export interface DiskFacts {
    /** The DOS and version, such as "LDOS 5.3.1", or "No file system found". */
    dos: string;
    /** The image format, such as "DMK" or "HDV". */
    format: string;
    /** The shape, such as "40 cylinders × 1 side", or undefined for a hard disk. */
    shape: string | undefined;
    /** The density, such as "double density", or undefined if it isn't known. */
    density: string | undefined;
}

/**
 * Whether the disk is a hard disk image with several partitions and none chosen, so that it has no file system
 * to show yet (asking the session for it would throw).
 *
 * @param session the disk's session.
 */
export function needsPartitionChoice(session: DiskSession): boolean {
    return session.isHardDisk() && session.selectedPartitionNumber === undefined &&
        session.getPartitions().length > 1;
}

/**
 * Gather the facts about a session's disk, using the engine's and trs80-base's own descriptions.
 *
 * @param session the disk's session.
 */
export function getDiskFacts(session: DiskSession): DiskFacts {
    const partitionCount = session.isHardDisk() ? session.getPartitions().length : 0;
    if (needsPartitionChoice(session)) {
        return {dos: partitionCount + " partitions", format: "HDV", shape: undefined, density: undefined};
    }

    const fileSystem = session.fileSystem;
    const dos = fileSystem === undefined ? "No file system found" : fileSystem.nameAndVersion;
    if (session.isHardDisk()) {
        return {dos, format: "HDV", shape: undefined, density: undefined};
    }

    const floppy = session.floppy;
    const imageFormat = floppyImageFormatOf(floppy);
    const format = imageFormat !== undefined ? floppyImageFormatToString(imageFormat) : floppy.getDescription();
    const geometry = floppy.getGeometry();
    const cylinders = geometry.cylinderCount;
    const sides = geometry.sideCount;
    const shape = cylinders + " cylinder" + (cylinders === 1 ? "" : "s") + " × " + sides + " side" +
        (sides === 1 ? "" : "s");
    const density = geometry.modalDataDensity === undefined ? undefined :
        densityToString(geometry.modalDataDensity).toLowerCase() + " density";
    return {dos, format, shape, density};
}

/**
 * The colors given to files, in order, as the mockup has them. A file's color is the one at its index in the
 * map's legend, wrapping around.
 */
const FILE_COLORS = [
    "#268bd2", "#2aa198", "#859900", "#b58900", "#cb4b16", "#d33682", "#6c71c4",
    "#3f9b70", "#a0682c", "#5d88b8", "#a35fa6", "#2f7f8f", "#7a8f1f", "#c25a5a",
];

/**
 * One file's share of the disk, for the space bar and the colored swatches.
 */
export interface FileShare {
    /** The file's name as the disk shows it. */
    name: string;
    /** The granules it uses. */
    granules: number;
    /** Its color. */
    color: string;
}

/**
 * How a disk's space is used.
 */
export interface SpaceUse {
    /** Each file that uses space, in the map's legend order. */
    files: FileShare[];
    /** The granules on the disk. */
    totalGranules: number;
    /** The granules that new files could get. */
    freeGranules: number;
    /** The bytes in a granule. */
    granuleBytes: number;
    /** The bytes that new files could get. */
    freeBytes: number;
    /** The granules used by what isn't a listed file: boot, the directory, and anything else. */
    otherGranules: number;
}

/**
 * Work out how a disk's space is used, from the engine's map model.
 *
 * @param session the disk's session.
 * @returns the use, or undefined if the disk has no TRSDOS-family file system or its map can't be made.
 */
export function getSpaceUse(session: DiskSession): SpaceUse | undefined {
    if (needsPartitionChoice(session)) {
        return undefined;
    }

    let model;
    try {
        model = buildDiskMap(session, []);
    } catch (e) {
        if (e instanceof DiskError) {
            return undefined;
        }
        throw e;
    }

    const files: FileShare[] = [];
    let fileGranules = 0;
    for (const file of model.files) {
        if (file.colorIndex === undefined || file.granuleCount === 0) {
            continue;
        }
        files.push({name: file.name, granules: file.granuleCount, color: fileColor(file)});
        fileGranules += file.granuleCount;
    }

    const totals = model.totals;
    const otherGranules = Math.max(0, totals.granuleCount - totals.freeGranuleCount - totals.notOnImageGranuleCount -
        totals.pastEndGranuleCount - fileGranules);
    return {
        files,
        totalGranules: totals.granuleCount,
        freeGranules: totals.freeGranuleCount,
        granuleBytes: totals.granuleByteCount,
        freeBytes: totals.freeByteCount,
        otherGranules,
    };
}

/**
 * The color of a file in the map's legend.
 */
function fileColor(file: MapFile): string {
    return FILE_COLORS[(file.colorIndex ?? 0) % FILE_COLORS.length];
}
