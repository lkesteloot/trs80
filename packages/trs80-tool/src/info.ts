import * as fs from "fs";
import * as path from "path";
import {pluralizeWithCount} from "./utils.js";
import {AudioFile, Decoder, Tape, WAV_INFO_TAGS, readWavFile } from "trs80-cassette";
import {Density, TrackGeometry, decodeTrs80File, decodeTrsdos, isFloppy } from "trs80-base";

/**
 * Return a list of strings for the metata from the audio file.
 */
function getWavFileMetadata(wavFile: AudioFile): string[] {
    const info: string[] = [];

    for (const [key, value] of wavFile.metadata.entries()) {
        const niceKey = WAV_INFO_TAGS.get(key);
        info.push(`${niceKey ?? key}: ${value}`);
    }

    return info;
}

/**
 * Print one-line string description of the input file, and more if verbose.
 */
function printInfoForFile(filename: string, verbose: boolean): void {
    const {base, ext} = path.parse(filename);

    let description: string;
    const verboseLines: string[] = [];
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log(filename + ": Can't open file: " + e.message);
        return;
    }

    if (ext.toLowerCase() == ".wav") {
        // Parse a cassette WAV file.
        const wavFile = readWavFile(buffer.buffer);
        if (verbose) {
            verboseLines.push(...getWavFileMetadata(wavFile));
        }
        const tape = new Tape(base, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        description = "Audio file with " + pluralizeWithCount(tape.programs.length, "file");
    } else {
        try {
            const trs80File = decodeTrs80File(buffer, filename);
            description = trs80File.getDescription();
            if (trs80File.error !== undefined) {
                description += " (" + trs80File.error + ")";
            } else {
                const GENERATE_BITCELLS_JS = false;
                if (GENERATE_BITCELLS_JS && trs80File.className === "ScpFloppyDisk") {
                    const bitcells = trs80File.tracks[1].revs[0].bitcells;
                    const parts: string[] = [];
                    parts.push("const bitcells = [\n");
                    for (const bitcell of bitcells) {
                        parts.push("    " + bitcell + ",\n");
                    }
                    parts.push("];\n");
                    fs.writeFileSync("bitcells/bitcells.js", parts.join(""));
                }

                if (isFloppy(trs80File)) {
                    const trsdos = decodeTrsdos(trs80File);
                    if (trsdos !== undefined) {
                        description += ", " + trsdos.getOperatingSystemName() + " " + trsdos.getVersion() +
                            " with " + pluralizeWithCount(trsdos.getDirEntries().length, "file");
                    }

                    if (verbose) {
                        function getTrackGeometryInfo(trackGeometry: TrackGeometry): string {
                            return [`sectors ${trackGeometry.firstSector} to ${trackGeometry.lastSector}`,
                                `sides ${trackGeometry.firstSide} to ${trackGeometry.lastSide}`,
                                `${trackGeometry.density === Density.SINGLE ? "single" : "double"} density`,
                                `${trackGeometry.sectorSize} bytes per sector`].join(", ");
                        }

                        const geometry = trs80File.getGeometry();
                        const firstTrack = geometry.firstTrack;
                        const lastTrack = geometry.lastTrack;
                        if (geometry.hasHomogenousGeometry()) {
                            verboseLines.push(`Tracks ${firstTrack.trackNumber} to ${lastTrack.trackNumber}, ` +
                                getTrackGeometryInfo(firstTrack));
                        } else {
                            verboseLines.push(
                                `Tracks ${firstTrack.trackNumber} to ${lastTrack.trackNumber}`,
                                `On track ${firstTrack.trackNumber}, ` + getTrackGeometryInfo(firstTrack),
                                `On remaining tracks, ` + getTrackGeometryInfo(lastTrack));
                        }

                        if (trsdos !== undefined) {
                            const gatInfo = trsdos.getGatInfo();
                            if (typeof gatInfo === "string") {
                                verboseLines.push("Error: " + gatInfo);
                            } else {
                                if (gatInfo.name !== "") {
                                    verboseLines.push("Floppy name: " + gatInfo.name);
                                }
                                if (gatInfo.date !== "") {
                                    verboseLines.push("Floppy date: " + gatInfo.date);
                                }
                                if (gatInfo.autoCommand !== "") {
                                    verboseLines.push("Auto command: " + gatInfo.autoCommand);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            if ("message" in e) {
                description = "Error (" + e.message + ")";
            } else {
                description = "Unknown error during decoding";
            }
        }
    }

    console.log(filename + ": " + description);
    for (const line of verboseLines) {
        console.log("    " + line);
    }
}

/**
 * Handle the "info" command.
 */
export function info(infiles: string[], verbose: boolean): void {
    for (const infile of infiles) {
        printInfoForFile(infile, verbose);
    }
}
