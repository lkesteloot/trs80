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
                    const outsideExpected = !isUsualSectorNumber(geometry, expected, sectorNumber);
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
 * Whether the sector number is within the track's expected range and within the disk's columns
 * (the expected ranges of the tracks numbered like the rest of the disk). A track numbered apart
 * from the rest, such as a copy-protection track, has its own expected range but falls outside
 * the columns, so all of its sectors count as strays.
 */
function isUsualSectorNumber(geometry: FloppyDiskGeometry, expected: SectorNumberRange | undefined,
                             sectorNumber: number): boolean {

    return (expected === undefined ||
            (sectorNumber >= expected.firstSectorNumber && sectorNumber <= expected.lastSectorNumber)) &&
        sectorNumber >= geometry.expectedFirstSectorNumber && sectorNumber <= geometry.expectedLastSectorNumber;
}

/**
 * A table of sectors that the main map can't show, for tracks on one side that share the same
 * columns.
 */
interface StrayTable {
    side: number;
    // The sector numbers to show, in ascending order. Not necessarily consecutive.
    columns: number[];
    trackPositions: TrackPosition[];
}

/**
 * Print a map of the sectors on the disk: one table per side, with a column for every sector
 * number that the disk usually has, then tables of the sectors outside those numbers.
 */
function printMap(file: Trs80Floppy) {
    const geometry = file.getGeometry();
    const usedLetters = new Set<string>();
    const mainColumns: number[] = [];
    for (let sectorNumber = geometry.expectedFirstSectorNumber;
         sectorNumber <= geometry.expectedLastSectorNumber; sectorNumber++) {

        mainColumns.push(sectorNumber);
    }
    // Map from side and columns to the table of tracks with those strays.
    const strayTables = new Map<string,StrayTable>();

    for (let side = 0; side < geometry.sideCount; side++) {
        const trackPositions: TrackPosition[] = [];
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            const trackPosition = new TrackPosition(cylinder, side);
            trackPositions.push(trackPosition);

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
        printTable(file, side, mainColumns, trackPositions, false, usedLetters);
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
 * The sector numbers of a track that the main map can't show, in ascending order: its stray
 * sectors, plus any part of its expected range outside the main map's columns (as with a track
 * numbered apart from the rest of the disk), so that sectors missing from it are shown too.
 */
function strayColumns(geometry: FloppyDiskGeometry, trackPosition: TrackPosition): number[] {
    const trackGeometry = geometry.getTrack(trackPosition);
    const expected = geometry.getExpectedSectorRange(trackPosition);
    if (trackGeometry === undefined || expected === undefined) {
        return [];
    }

    const columns = new Set<number>(trackGeometry.sectorNumbers.filter(sectorNumber =>
        !isUsualSectorNumber(geometry, expected, sectorNumber)));
    for (let sectorNumber = expected.firstSectorNumber; sectorNumber <= expected.lastSectorNumber; sectorNumber++) {
        if (sectorNumber < geometry.expectedFirstSectorNumber || sectorNumber > geometry.expectedLastSectorNumber) {
            columns.add(sectorNumber);
        }
    }
    return [... columns].sort((a, b) => a - b);
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
