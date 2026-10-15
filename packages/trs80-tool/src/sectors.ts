import * as fs from "fs";
import type {ChalkInstance} from "chalk";
import chalk from "chalk";
import {
    decodeFloppyFileSystem,
    decodeTrs80File,
    Density,
    FloppyDirEntry,
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
                    const outsideExpected = expected !== undefined &&
                        (sectorNumber < expected.firstSectorNumber || sectorNumber > expected.lastSectorNumber);
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
 * Print a map of the sectors on the disk.
 */
function printMap(file: Trs80Floppy) {
    const geometry = file.getGeometry();
    const usedLetters = new Set<string>();
    const firstColumn = geometry.expectedFirstSectorNumber;
    const lastColumn = geometry.expectedLastSectorNumber;
    // Lines describing the sectors outside each track's expected range.
    const strayLines: string[] = [];

    for (let side = 0; side < geometry.sideCount; side++) {
        // Print header.
        const lineParts: string[] = ["Side " + side + "  "];
        for (let sectorNumber = firstColumn; sectorNumber <= lastColumn; sectorNumber++) {
            lineParts.push(sectorNumber.toString().padStart(3, " "));
        }
        console.log(lineParts.join(""));

        // Print table content.
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            const trackPosition = new TrackPosition(cylinder, side);
            const trackGeometry = geometry.getTrack(trackPosition);
            const lineParts: string[] = [cylinder.toString().padStart(6, " ") + "  "];

            const expected = geometry.getExpectedSectorRange(trackPosition);

            if (trackGeometry !== undefined && expected !== undefined) {
                const strays = trackGeometry.sectorNumbers.filter(sectorNumber =>
                    sectorNumber < expected.firstSectorNumber || sectorNumber > expected.lastSectorNumber);
                if (strays.length > 0) {
                    const descriptions = strays.map(sectorNumber => {
                        const sectorData = file.readSector(new SectorPosition(trackPosition, sectorNumber));
                        return sectorNumber + (sectorData?.crcError ? " (CRC error)" : "");
                    });
                    strayLines.push(`    Cylinder ${cylinder}, side ${side}: ${descriptions.join(", ")}`);
                }
            }

            for (let sectorNumber = firstColumn; sectorNumber <= lastColumn; sectorNumber++) {
                let text: string;
                if (expected !== undefined &&
                    sectorNumber >= expected.firstSectorNumber &&
                    sectorNumber <= expected.lastSectorNumber) {

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
                lineParts.push("".padEnd(3 - text.length, " ") + color(text));
            }
            console.log(lineParts.join(""));
        }

        console.log("");
    }

    if (strayLines.length > 0) {
        console.log("Sectors outside the usual numbers:");
        for (const strayLine of strayLines) {
            console.log(strayLine);
        }
        console.log("");
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
