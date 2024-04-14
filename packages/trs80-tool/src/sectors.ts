import * as fs from "fs";
import chalk from "chalk";
import {Density, Side, decodeTrs80File, isFloppy, numberToSide } from "trs80-base";
import { toHexWord } from "z80-base";
import { hexdumpBinary } from "./hexdump.js";

/**
 * Handle the "sectors" command.
 */
export function sectors(filename: string, showContents: boolean): void {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Decode the floppy.
    const file = decodeTrs80File(buffer, filename);
    if (!isFloppy(file)) {
        console.log("Not a recognized floppy file: " + filename);
        return;
    }

    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        return;
    }

    console.log(filename + ": " + file.getDescription());

    const geometry = file.getGeometry();
    const minSectorNumber = Math.min(geometry.firstTrack.firstSector, geometry.lastTrack.firstSector);
    const maxSectorNumber = Math.max(geometry.firstTrack.lastSector, geometry.lastTrack.lastSector);

    const usedLetters = new Set<string>();

    const CHALK_FOR_LETTER: { [letter: string]: chalk.Chalk } = {
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

    for (let sideNumber = 0; sideNumber < geometry.numSides(); sideNumber++) {
        const side = numberToSide(sideNumber);
        const sideName = side === Side.FRONT ? "Front" : "Back";
        const lineParts: string[] = [sideName.padStart(6, " ") + "  "];
        for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
            lineParts.push(sectorNumber.toString().padStart(3, " "));
        }
        console.log(lineParts.join(""));

        for (let trackNumber = geometry.firstTrack.trackNumber; trackNumber <= geometry.lastTrack.trackNumber; trackNumber++) {
            const trackGeometry = geometry.getTrackGeometry(trackNumber);
            const lineParts: string[] = [trackNumber.toString().padStart(6, " ") + "  "];

            for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
                let text: string;
                if (trackGeometry.isValidSectorNumber(sectorNumber)) {
                    const sectorData = file.readSector(trackNumber, side, sectorNumber);
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

    if (showContents) {
        // Dump each sector.
        for (let trackNumber = geometry.firstTrack.trackNumber; trackNumber <= geometry.lastTrack.trackNumber; trackNumber++) {
            const trackGeometry = geometry.getTrackGeometry(trackNumber);
            for (const side of trackGeometry.sides()) {
                for (let sectorNumber = trackGeometry.firstSector; sectorNumber <= trackGeometry.lastSector; sectorNumber++) {
                    let header = `Side ${side}, track ${trackNumber}, sector ${sectorNumber}: `;

                    const sector = file.readSector(trackNumber, side, sectorNumber);
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
                    console.log(header);

                    if (sector !== undefined) {
                        hexdumpBinary(sector.data, false, []);
                    }

                    console.log("");
                }
            }
        }
    }
}
