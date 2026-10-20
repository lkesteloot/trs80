import * as fs from "fs";
import {
    decodeFloppyFileSystem,
    decodeTrs80File,
    Density,
    FloppyDiskGeometry,
    FloppyFileSystem,
    isFloppy,
    SectorData,
    SectorNumberRange,
    SectorPosition,
    TrackGeometry,
    TrackPosition,
    Trs80Floppy,
} from "trs80-base";
import {toHexWord} from "z80-base";
import {colors, type Style} from "./colors.js";
import {hexdumpBinary} from "./hexdump.js";
import {captureLogs, type InfileJson, printInfilesJson, toBase64} from "./json.js";

const STYLE_FOR_LETTER: { [letter: string]: Style } = {
    "-": colors.muted,
    "?": colors.error,
    "C": colors.error,
    "X": colors.warning,
    "S": colors.plain,
    "D": colors.plain,
};

const LEGEND_FOR_LETTER: { [letter: string]: string } = {
    "-": "Not on track",
    "?": "Not found",
    "C": "CRC error",
    "X": "Deleted sector",
    "S": "Single density",
    "D": "Double density",
}

/**
 * A sector that the "sectors" command lists.
 */
interface SectorVisit {
    /** The position we looked for. */
    position: SectorPosition;
    /** The sector, or undefined if it's missing. */
    sector: SectorData | undefined;
    /** Whether the sector number is outside the usual numbers of its track. */
    outsideExpected: boolean;
}

/**
 * Whether the sector is missing or has a CRC error.
 */
function isBadSector(sector: SectorData | undefined): boolean {
    return sector === undefined || sector.crcError;
}

/**
 * Read every sector that the "sectors" command lists, in cylinder, side, and sector order: all of
 * the sector numbers that each track is expected to have (so that missing ones are reported) and
 * any stray ones that exist.
 */
function visitSectors(file: Trs80Floppy): SectorVisit[] {
    const visits: SectorVisit[] = [];
    const geometry = file.getGeometry();

    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        for (let side = 0; side < geometry.sideCount; side++) {
            const trackPosition = new TrackPosition(cylinder, side);
            const trackGeometry = geometry.getTrack(trackPosition);
            if (trackGeometry === undefined) {
                // No sectors at all on this track.
                continue;
            }
            const expected = geometry.getExpectedSectorRange(trackPosition);
            for (const sectorNumber of sectorNumbersToVisit(trackGeometry, expected)) {
                const position = new SectorPosition(trackPosition, sectorNumber);
                visits.push({
                    position,
                    sector: file.readSector(position),
                    outsideExpected: !isUsualSectorNumber(expected, sectorNumber),
                });
            }
        }
    }

    return visits;
}

/**
 * Find the files that use each sector of the disk. Two files can claim the same sector if the
 * disk is damaged (they're cross-linked).
 *
 * @param fileSystem the disk's file system, or undefined if it has none.
 * @return a map from the key of the sector's position (see SectorPosition.key()) to the names of
 * the files that use it, in directory order. Sectors that no file uses aren't in the map.
 */
function filesBySector(fileSystem: FloppyFileSystem | undefined): Map<string, string[]> {
    const map = new Map<string, string[]>();
    if (fileSystem === undefined) {
        return map;
    }

    for (const dirEntry of fileSystem.getDirEntries(true)) {
        const filename = dirEntry.getFilename(".");
        for (const position of fileSystem.getFileSectorPositions(dirEntry)) {
            const key = position.key();
            const filenames = map.get(key);
            if (filenames === undefined) {
                map.set(key, [filename]);
            } else if (!filenames.includes(filename)) {
                // A file can list a sector twice if it's cross-linked with itself.
                filenames.push(filename);
            }
        }
    }

    return map;
}

/**
 * Handle the "sectors" command. With onlyShowBad, prints nothing for a floppy without bad sectors.
 */
export function sectors(filename: string, showContents: boolean, onlyShowBad: boolean): void {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Decode the floppy.
    const file = decodeTrs80File(buffer, { filename });
    if (!isFloppy(file)) {
        console.log("Not a recognized floppy file: " + filename);
        return;
    }

    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        return;
    }

    let title = filename + ": " + file.getDescription();
    const fileSystem: FloppyFileSystem | undefined = decodeFloppyFileSystem(file);
    if (fileSystem === undefined) {
        title += ", unknown operating system";
    } else {
        title += ", " + fileSystem.nameAndVersion;
    }

    // The sectors to dump.
    let visits: SectorVisit[] = [];
    if (showContents || onlyShowBad) {
        visits = visitSectors(file);
        if (onlyShowBad) {
            visits = visits.filter(visit => isBadSector(visit.sector));

            // Don't mention the floppies that have nothing wrong, so that checking many shows only the problems.
            if (visits.length === 0) {
                return;
            }
        }
    }

    console.log(title);

    if (!onlyShowBad) {
        printMap(file);
    }

    const filenamesAtSector = onlyShowBad ? filesBySector(fileSystem) : new Map<string, string[]>();
    for (const {position, sector, outsideExpected} of visits) {
        let header = `Cylinder ${position.cylinderNumber}, side ${position.side}, sector ${position.sectorNumber}: `;

        if (sector === undefined) {
            header += "missing";
        } else {
            header += (sector.density === Density.SINGLE ? "single" : "double") + " density" +
                (sector.deleted ? ", marked as deleted" : "") +
                (outsideExpected ? ", outside the usual sector numbers" : "");

            if (sector.crcError) {
                header += ", CRC error";

                if (sector.crc !== undefined) {
                    const parts: string[] = [];
                    if (!sector.crc.idCrc.valid()) {
                        parts.push("ID " + toHexWord(sector.crc.idCrc.written) + " != " +
                            toHexWord(sector.crc.idCrc.computed));
                    }
                    if (!sector.crc.dataCrc.valid()) {
                        parts.push("data " + toHexWord(sector.crc.dataCrc.written) + " != " +
                            toHexWord(sector.crc.dataCrc.computed));
                    }
                    header += " (" + parts.join(", ") + ")";
                }
            }
        }

        console.log(header);

        if (showContents && sector !== undefined) {
            hexdumpBinary(sector.data, false, []);
        }

        if (onlyShowBad && fileSystem !== undefined) {
            const filenames = filenamesAtSector.get(position.key());
            if (filenames === undefined) {
                console.log("There is no file at this sector.");
            } else {
                console.log((filenames.length === 1 ? "File" : "Files") + " at this sector: " + filenames.join(", "));
            }
        }

        console.log("");
    }
}

/**
 * The JSON for one CRC (the ID field's or the data field's) of a sector.
 */
interface SectorCrcJson {
    /** The CRC as written on the floppy. */
    stored: number;
    /** The CRC as computed from the bytes that were read. */
    computed: number;
}

/**
 * The JSON for one sector. Which fields it has depends on whether the sector is missing.
 */
interface SectorJson {
    /** The cylinder of the position we looked for. */
    cylinder: number;
    /** The side of the position we looked for. */
    side: number;
    /** The sector number of the position we looked for. */
    sector: number;
    /** Whether the floppy has no readable sector at this position. The fields below are then missing. */
    missing: boolean;
    /** Whether the sector number is outside the usual sector numbers of its track (a copy protection scheme, perhaps). */
    outsideUsualNumbers: boolean;
    /** The names of the files that use this sector, in directory order. Usually zero or one; more if the disk is cross-linked. */
    files: string[];
    /** Present sectors only: "single" or "double". */
    density?: "single" | "double";
    /** Present sectors only: the length in bytes of the sector's data. */
    size?: number;
    /** Present sectors only: whether the data address mark says that the data is deleted. */
    deleted?: boolean;
    /** Present sectors only: the exact data address mark (0xF8 to 0xFB), if the image format records it. */
    dataAddressMark?: number;
    /** Present sectors only: whether there was a CRC error in the ID field or the data. */
    crcError?: boolean;
    /** Present sectors only, and only if the image format records the CRCs: the CRC of the ID field. */
    idCrc?: SectorCrcJson;
    /** Present sectors only, and only if the image format records the CRCs: the CRC of the data. */
    dataCrc?: SectorCrcJson;
    /** With "--contents", the sector's data in base64. Missing for missing sectors. */
    contents?: string;
}

/**
 * The JSON for one input file of "sectors --json".
 */
interface SectorsInfileJson extends InfileJson {
    /** A short description of the floppy image, such as "DMK floppy with 40 cylinders". Missing if the input had an error. */
    description?: string;
    /** The name and version of the floppy's operating system, or null if there's none we recognize. Missing if the input had an error. */
    os?: string | null;
    /** The sectors, in cylinder, side, and sector order. With "--bad", only those that are missing or have a CRC error. */
    sectors: SectorJson[];
}

/**
 * Convert one sector to JSON.
 */
function sectorToJson(visit: SectorVisit, filenames: string[], showContents: boolean): SectorJson {
    const {position, sector, outsideExpected} = visit;
    const json: SectorJson = {
        cylinder: position.cylinderNumber,
        side: position.side,
        sector: position.sectorNumber,
        missing: sector === undefined,
        outsideUsualNumbers: outsideExpected,
        files: filenames,
    };

    if (sector !== undefined) {
        json.density = sector.density === Density.SINGLE ? "single" : "double";
        json.size = sector.data.length;
        json.deleted = sector.deleted;
        if (sector.dataAddressMark !== undefined) {
            json.dataAddressMark = sector.dataAddressMark;
        }
        json.crcError = sector.crcError;
        if (sector.crc !== undefined) {
            json.idCrc = { stored: sector.crc.idCrc.written, computed: sector.crc.idCrc.computed };
            json.dataCrc = { stored: sector.crc.dataCrc.written, computed: sector.crc.dataCrc.computed };
        }
        if (showContents) {
            json.contents = toBase64(sector.data);
        }
    }

    return json;
}

/**
 * Read one input file and convert its sectors to JSON.
 *
 * @return the JSON, or undefined if onlyShowBad is set and the floppy has no bad sectors.
 */
function sectorsFileJson(filename: string, showContents: boolean, onlyShowBad: boolean):
    Omit<SectorsInfileJson, "warnings"> | undefined {

    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        return { infile: filename, sectors: [], error: "Can't open file: " + e.message };
    }

    const file = decodeTrs80File(buffer, { filename });
    if (!isFloppy(file)) {
        return { infile: filename, sectors: [], error: "Not a recognized floppy file" };
    }
    if (file.error !== undefined) {
        return { infile: filename, sectors: [], error: file.error };
    }

    const fileSystem = decodeFloppyFileSystem(file);
    let visits = visitSectors(file);
    if (onlyShowBad) {
        visits = visits.filter(visit => isBadSector(visit.sector));
        if (visits.length === 0) {
            return undefined;
        }
    }

    const filenamesAtSector = filesBySector(fileSystem);
    return {
        infile: filename,
        description: file.getDescription(),
        os: fileSystem === undefined ? null : fileSystem.nameAndVersion,
        sectors: visits.map(visit =>
            sectorToJson(visit, filenamesAtSector.get(visit.position.key()) ?? [], showContents)),
    };
}

/**
 * Handle the "sectors" command with "--json": print one JSON object for all the input files.
 * With onlyShowBad, floppies without bad sectors aren't in it.
 */
export function sectorsJson(filenames: string[], showContents: boolean, onlyShowBad: boolean): void {
    const infiles: SectorsInfileJson[] = [];
    for (const filename of filenames) {
        const {result, warnings} = captureLogs(() => sectorsFileJson(filename, showContents, onlyShowBad));
        if (result !== undefined) {
            infiles.push({ ...result, warnings });
        }
    }

    printInfilesJson(infiles);
}

/**
 * The sector numbers to look at on a track, in ascending order without duplicates: every number in
 * the track's expected range (so that missing ones are reported), plus every number that has a
 * sector with a good ID field (including stray ones outside the expected range).
 */
function sectorNumbersToVisit(trackGeometry: TrackGeometry, expected: SectorNumberRange | undefined): number[] {
    const sectorNumbers = new Set<number>(trackGeometry.sectorNumbers);
    if (expected !== undefined) {
        for (let sectorNumber = expected.firstSectorNumber; sectorNumber <= expected.lastSectorNumber; sectorNumber++) {
            sectorNumbers.add(sectorNumber);
        }
    }
    return [... sectorNumbers].sort((a, b) => a - b);
}

/**
 * Whether the sector number is within the track's expected range (the range of its sector number
 * group), or the track has no expected range.
 */
function isUsualSectorNumber(expected: SectorNumberRange | undefined, sectorNumber: number): boolean {
    return expected === undefined ||
        (sectorNumber >= expected.firstSectorNumber && sectorNumber <= expected.lastSectorNumber);
}

/**
 * A table of the sector map: the tracks on one side that share the same columns.
 */
interface MapTable {
    side: number;
    // The sector numbers to show, in ascending order. Not necessarily consecutive.
    columns: number[];
    // In cylinder order.
    trackPositions: TrackPosition[];
}

/**
 * Print a map of the sectors on the disk: one table for each side of each group of tracks that are
 * numbered alike (see FloppyDiskGeometry.sectorNumberGroups), with a column for every sector number
 * in the group's range. Then lists the cylinders with no sectors, and prints tables of the sectors
 * outside their tracks' usual numbers.
 */
function printMap(file: Trs80Floppy) {
    const geometry = file.getGeometry();
    const usedLetters = new Set<string>();

    // The tables of the groups, one per side.
    const groupTables: MapTable[] = [];
    for (const group of geometry.sectorNumberGroups) {
        const columns: number[] = [];
        for (let sectorNumber = group.range.firstSectorNumber; sectorNumber <= group.range.lastSectorNumber;
             sectorNumber++) {

            columns.push(sectorNumber);
        }
        // Group tracks are sorted by cylinder, so each side's tracks are too.
        const sides = [... new Set(group.trackPositions.map(trackPosition => trackPosition.side))];
        for (const side of sides) {
            groupTables.push({
                side,
                columns,
                trackPositions: group.trackPositions.filter(trackPosition => trackPosition.side === side),
            });
        }
    }
    // Order by first track, by cylinder and then side.
    groupTables.sort((a, b) =>
        a.trackPositions[0].cylinderNumber - b.trackPositions[0].cylinderNumber || a.side - b.side);
    for (const groupTable of groupTables) {
        printTable(file, groupTable.side, groupTable.columns, groupTable.trackPositions, false, usedLetters);
    }

    // Cylinders with no sectors, by side, and the stray tables, which are keyed by side and columns.
    const strayTables = new Map<string,MapTable>();
    let printedEmptyCylinders = false;
    for (let side = 0; side < geometry.sideCount; side++) {
        const emptyCylinders: number[] = [];
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            const trackPosition = new TrackPosition(cylinder, side);
            if (geometry.getTrack(trackPosition) === undefined) {
                emptyCylinders.push(cylinder);
                continue;
            }

            const columns = strayColumns(geometry, trackPosition);
            if (columns.length > 0) {
                const key = side + ":" + columns.join(",");
                let strayTable = strayTables.get(key);
                if (strayTable === undefined) {
                    strayTable = {side, columns, trackPositions: []};
                    strayTables.set(key, strayTable);
                }
                strayTable.trackPositions.push(trackPosition);
            }
        }

        if (emptyCylinders.length > 0) {
            const noun = emptyCylinders.length === 1 ? "cylinder" : "cylinders";
            console.log("Side " + side + " has no sectors on " + noun + " " + describeNumbers(emptyCylinders) + ".");
            printedEmptyCylinders = true;
        }
    }
    if (printedEmptyCylinders) {
        console.log("");
    }

    if (strayTables.size > 0) {
        console.log("Sectors outside the usual numbers:");
        console.log("");
        for (const strayTable of strayTables.values()) {
            printTable(file, strayTable.side, strayTable.columns, strayTable.trackPositions, true, usedLetters);
        }
    }

    if (usedLetters.size > 0) {
        const legendLetters = [...usedLetters.values()].sort();

        console.log("Legend:");
        for (const legendLetter of legendLetters) {
            const explanation = LEGEND_FOR_LETTER[legendLetter] ?? "Unknown";
            const color = STYLE_FOR_LETTER[legendLetter] ?? colors.plain;
            console.log("    " + color(legendLetter) + ": " + explanation);
        }
        console.log("");
    }
}

/**
 * Describes a list of numbers like "36-39, 41", collapsing runs of consecutive numbers.
 *
 * @param numbers the numbers in ascending order, without duplicates.
 */
function describeNumbers(numbers: number[]): string {
    const parts: string[] = [];
    let runStart = 0;
    for (let i = 1; i <= numbers.length; i++) {
        if (i === numbers.length || numbers[i] !== numbers[i - 1] + 1) {
            const first = numbers[runStart];
            const last = numbers[i - 1];
            parts.push(first === last ? first.toString() : first + "-" + last);
            runStart = i;
        }
    }
    return parts.join(", ");
}

/**
 * The sector numbers of a track that are outside its expected range (its stray sectors), in
 * ascending order.
 */
function strayColumns(geometry: FloppyDiskGeometry, trackPosition: TrackPosition): number[] {
    const trackGeometry = geometry.getTrack(trackPosition);
    const expected = geometry.getExpectedSectorRange(trackPosition);
    if (trackGeometry === undefined || expected === undefined) {
        return [];
    }

    return trackGeometry.sectorNumbers.filter(sectorNumber => !isUsualSectorNumber(expected, sectorNumber));
}

/**
 * Print one table of the sector map, with a row for each track and a letter for each sector
 * (see LEGEND_FOR_LETTER).
 *
 * @param columns the sector numbers to show, in ascending order.
 * @param showStrays whether to show sectors outside each track's expected range, rather than
 * marking them as not on the track.
 * @param usedLetters the letters printed so far, for the legend. Updated.
 */
function printTable(file: Trs80Floppy, side: number, columns: number[], trackPositions: TrackPosition[],
                    showStrays: boolean, usedLetters: Set<string>): void {

    const geometry = file.getGeometry();
    // Leave at least one space between three-digit sector numbers.
    const columnWidth = Math.max(3, Math.max(... columns).toString().length + 1);

    // Print header.
    const lineParts: string[] = ["Side " + side + "  "];
    for (const sectorNumber of columns) {
        lineParts.push(sectorNumber.toString().padStart(columnWidth, " "));
    }
    console.log(lineParts.join(""));

    // Print table content.
    for (const trackPosition of trackPositions) {
        const trackGeometry = geometry.getTrack(trackPosition);
        const expected = geometry.getExpectedSectorRange(trackPosition);
        const lineParts: string[] = [trackPosition.cylinderNumber.toString().padStart(6, " ") + "  "];

        for (const sectorNumber of columns) {
            const inExpected = expected !== undefined &&
                sectorNumber >= expected.firstSectorNumber &&
                sectorNumber <= expected.lastSectorNumber;
            const isStray = showStrays && trackGeometry !== undefined &&
                trackGeometry.sectorNumbers.includes(sectorNumber);
            let text: string;
            if (inExpected || isStray) {
                const sectorData = file.readSector(new SectorPosition(trackPosition, sectorNumber));
                if (sectorData === undefined) {
                    text = "?";
                } else if (sectorData.crcError) {
                    text = "C";
                } else if (sectorData.deleted) {
                    text = "X";
                } else if (sectorData.density === Density.SINGLE) {
                    text = "S";
                } else {
                    text = "D";
                }
            } else {
                text = "-";
            }

            usedLetters.add(text);
            const color = STYLE_FOR_LETTER[text] ?? colors.plain;
            lineParts.push("".padEnd(columnWidth - text.length, " ") + color(text));
        }
        console.log(lineParts.join(""));
    }

    console.log("");
}
