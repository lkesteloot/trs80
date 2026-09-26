import * as fs from "fs";
import type {ChalkInstance} from "chalk";
import chalk from "chalk";
import {
    decodeTrs80File,
    decodeTrsdos,
    Density,
    isFloppy,
    numberToSide,
    SectorPosition,
    Side,
    TrackPosition,
    Trs80Floppy,
    TrsdosDirEntry
} from "trs80-base";
import {toHexWord} from "z80-base";
import {hexdumpBinary} from "./hexdump.js";

const CHALK_FOR_LETTER: { [letter: string]: ChalkInstance } = {
    "-": chalk.gray,
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
    const trsdos = decodeTrsdos(file);
    if (trsdos === undefined) {
        title += ", unknown operating system";
    } else {
        title += ", " + trsdos.getOperatingSystemName() + " " + trsdos.getVersion();
    }

    console.log(title);

    if (!onlyShowBad) {
        printMap(file);
    }

    if (showContents || onlyShowBad) {
        const geometry = file.getGeometry();

        // Dump each sector.
        for (let trackNumber = 0; trackNumber < geometry.cylinderCount; trackNumber++) {
            for (let sideNumber = 0; sideNumber < geometry.sideCount; sideNumber++) {
                const side = numberToSide(sideNumber) ?? Side.FRONT;
                const trackPosition = new TrackPosition(trackNumber, side);
                const trackGeometry = geometry.trackMap.get(trackPosition.key());
                if (trackGeometry === undefined) {
                    // No sectors at all on this track.
                    continue;
                }
                for (let sectorNumber = trackGeometry.firstSectorNumber; sectorNumber <= trackGeometry.lastSectorNumber; sectorNumber++) {
                    let header = `Side ${side}, track ${trackNumber}, sector ${sectorNumber}: `;

                    const sectorPosition = new SectorPosition(trackPosition, sectorNumber);
                    const sector = file.readSector(sectorPosition);
                    if (sector === undefined) {
                        header += "missing";
                    } else {
                        header += (sector.density === Density.SINGLE ? "single" : "double") + " density" +
                            (sector.deleted ? ", marked as deleted" : "");

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

                        if (onlyShowBad && trsdos !== undefined) {
                            const files = trsdos.getDirEntries(true);
                            let fileAtSector: TrsdosDirEntry | undefined = undefined;
                            for (const file of files) {
                                const sectorPositions = trsdos.getFileSectorPositions(file);
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
                                console.log("File at this sector: " + fileAtSector.getFilename("/"));
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
 * Print a map of the sectors on the disk.
 */
function printMap(file: Trs80Floppy) {
    const geometry = file.getGeometry();
    const usedLetters = new Set<string>();

    for (let sideNumber = 0; sideNumber < geometry.sideCount; sideNumber++) {
        const side = numberToSide(sideNumber) ?? Side.FRONT;

        // Print header.
        const sideName = side === Side.FRONT ? "Front" : "Back";
        const lineParts: string[] = [sideName.padStart(6, " ") + "  "];
        for (let sectorNumber = geometry.firstSectorNumber; sectorNumber <= geometry.lastSectorNumber; sectorNumber++) {
            lineParts.push(sectorNumber.toString().padStart(3, " "));
        }
        console.log(lineParts.join(""));

        // Print table content.
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            const trackPosition = new TrackPosition(cylinder, side);
            const trackGeometry = geometry.trackMap.get(trackPosition.key());
            const lineParts: string[] = [cylinder.toString().padStart(6, " ") + "  "];

            for (let sectorNumber = geometry.firstSectorNumber;
                 sectorNumber <= geometry.lastSectorNumber;
                 sectorNumber++) {

                let text: string;
                if (trackGeometry !== undefined &&
                    sectorNumber >= trackGeometry.firstSectorNumber &&
                    sectorNumber <= trackGeometry.lastSectorNumber) {

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
