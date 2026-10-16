import * as fs from "fs";
import type {ChalkInstance} from "chalk";
import chalk from "chalk";
import {
    decodeFloppyFileSystem,
    decodeTrs80File,
    Density,
    FloppyDirEntry,
    FloppyDiskGeometry,
    FloppyFileSystem,
    isFloppy,
    SectorNumberRange,
    SectorPosition,
    TrackGeometry,
    TrackPosition,
    Trs80Floppy,
} from "trs80-base";
import {toHexWord} from "z80-base";
import {hexdumpBinary} from "./hexdump.js";

const CHALK_FOR_LETTER: { [letter: string]: ChalkInstance } = {
    "-": chalk.dim,
    "?": chalk.red,
    "C": chalk.red,
    "X": chalk.yellow,
    "S": chalk.reset,
    "D": chalk.reset,
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
 * Handle the "sectors" command.
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

    console.log(title);

    if (!onlyShowBad) {
        printMap(file);
    }

    if (showContents || onlyShowBad) {
        const geometry = file.getGeometry();

        // Dump each sector.
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
                    const outsideExpected = !isUsualSectorNumber(expected, sectorNumber);
                    let header = `Cylinder ${cylinder}, side ${side}, sector ${sectorNumber}: `;

                    const sectorPosition = new SectorPosition(trackPosition, sectorNumber);
                    const sector = file.readSector(sectorPosition);
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

                    if (!onlyShowBad || (sector === undefined || sector.crcError)) {
                        console.log(header);

                        if (showContents && sector !== undefined) {
                            hexdumpBinary(sector.data, false, []);
                        }

                        if (onlyShowBad && fileSystem !== undefined) {
                            const files = fileSystem.getDirEntries(true);
                            let fileAtSector: FloppyDirEntry | undefined = undefined;
                            for (const file of files) {
                                const sectorPositions = fileSystem.getFileSectorPositions(file);
                                for (const filePosition of sectorPositions) {
                                    if (filePosition.equals(sectorPosition)) {
                                        fileAtSector = file;
                                        break;
                                    }
                                }
                                if (fileAtSector !== undefined) {
                                    break;
                                }
                            }

                            if (fileAtSector === undefined) {
                                console.log("There is no file at this sector.");
                            } else {
                                console.log("File at this sector: " + fileAtSector.getFilename("."));
                            }
                        }

                        console.log("");
                    }
                }
            }
        }
    }
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
            const color = CHALK_FOR_LETTER[legendLetter] ?? chalk.reset;
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
            const color = CHALK_FOR_LETTER[text] ?? chalk.reset;
            lineParts.push("".padEnd(columnWidth - text.length, " ") + color(text));
        }
        console.log(lineParts.join(""));
    }

    console.log("");
}
