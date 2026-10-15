import * as fs from "fs";
import * as path from "path";
import {pluralizeWithCount} from "./utils.js";
import {infoJson} from "./report.js";
import {pagerYield} from "./pager.js";
import {AudioFile, Decoder, readWavFile, Tape, WAV_INFO_TAGS} from "trs80-cassette";
import {
    Cpm, decodeFloppyFileSystem, decodeTrs80File, densityToString, isFloppy, MicroDos, modelIITrsdosLayoutToString,
    ModelIITrsdos, TrackGeometry, Trsdos, TrsdosII, UcsdPascal, XenixTar} from "trs80-base";

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
        const wavFile = readWavFile(buffer);
        if (verbose) {
            verboseLines.push(...getWavFileMetadata(wavFile));
        }
        const tape = new Tape(base, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        description = "Audio file with " + pluralizeWithCount(tape.programs.length, "file");
    } else {
        try {
            const trs80File = decodeTrs80File(buffer, { filename });
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
                    const fileSystem = decodeFloppyFileSystem(trs80File);
                    if (fileSystem !== undefined) {
                        // Users don't care about system files.
                        description += ", " + fileSystem.nameAndVersion +
                            " with " + pluralizeWithCount(fileSystem.getDirEntries(false).length, "file");
                    }

                    if (verbose) {
                        function getTrackGeometryInfo(trackGeometry: TrackGeometry): string {
                            return [`sectors ${trackGeometry.firstSectorNumber} to ${trackGeometry.lastSectorNumber}`,
                                `${densityToString(trackGeometry.modalDensity)} density`,
                                `${trackGeometry.modalSectorSize} bytes per sector`].join(", ");
                        }

                        const geometry = trs80File.getGeometry();
                        if (geometry.homogeneous) {
                            verboseLines.push(
                                `${pluralizeWithCount(geometry.cylinderCount, "cylinder")}, ` +
                                `${pluralizeWithCount(geometry.sideCount, "side")}`,
                                `On every track, ` + getTrackGeometryInfo(geometry.bootTrack));
                        } else {
                            verboseLines.push(
                                `${pluralizeWithCount(geometry.cylinderCount, "cylinder")}, ` +
                                `${pluralizeWithCount(geometry.sideCount, "side")}`,
                                `On the boot track, ` + getTrackGeometryInfo(geometry.bootTrack),
                                `On most other tracks, ` + [`${geometry.modalDataSectorSpan} sectors`,
                                    `${densityToString(geometry.modalDataDensity)} density`,
                                    `${geometry.modalDataSectorSize} bytes per sector`].join(", "));
                        }

                        if (fileSystem instanceof Trsdos) {
                            const trsdos = fileSystem;
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
                                if (trsdos.allocationSides < geometry.sideCount) {
                                    verboseLines.push("Only uses side 0");
                                }
                                verboseLines.push(`Directory ${trsdos.lumpTerm}: ${trsdos.dirLumpNumber}`);
                                verboseLines.push(`Sectors per granule: ${trsdos.sectorsPerGranule}`);
                                verboseLines.push(`Granules per ${trsdos.lumpTerm}: ${trsdos.granulesPerLump}`);
                            }
                        } else if (fileSystem instanceof Cpm) {
                            const cpm = fileSystem;
                            if (cpm.allocationSides < geometry.sideCount) {
                                verboseLines.push("Only uses side 0");
                            }
                            if (cpm.cylinderCount !== geometry.cylinderCount) {
                                verboseLines.push(`Cylinders: ${cpm.cylinderCount} (the image has ${geometry.cylinderCount})`);
                            }
                            verboseLines.push(`Reserved tracks: ${cpm.reservedTrackCount}`);
                            verboseLines.push(`Sector skew: ${cpm.format.skew}`);
                            verboseLines.push(`Block size: ${cpm.format.blockSize} bytes`);
                            verboseLines.push(`Blocks: ${cpm.blockCount}`);
                            verboseLines.push(`Directory entries: ${cpm.format.dirEntryCount}`);
                        } else if (fileSystem instanceof MicroDos) {
                            verboseLines.push("Directory: sectors 20-29");
                        } else if (fileSystem instanceof UcsdPascal) {
                            const ucsdPascal = fileSystem;
                            verboseLines.push("Volume name: " + ucsdPascal.volumeName);
                            verboseLines.push(`First track: ${ucsdPascal.format.firstTrack}`);
                            verboseLines.push(`Interleave: ${ucsdPascal.format.interleave}`);
                            verboseLines.push(`Track skew: ${ucsdPascal.format.trackSkew}`);
                            verboseLines.push(`Blocks: ${ucsdPascal.blockCount}`);
                        } else if (fileSystem instanceof ModelIITrsdos) {
                            const modelIITrsdos = fileSystem;
                            if (modelIITrsdos.diskName !== undefined && modelIITrsdos.diskName !== "") {
                                verboseLines.push("Floppy name: " + modelIITrsdos.diskName);
                            }
                            verboseLines.push("Layout: " + modelIITrsdosLayoutToString(modelIITrsdos.layout));
                            verboseLines.push(`Directory cylinder: ${modelIITrsdos.dirCylinder}`);
                            if (modelIITrsdos.rejectedEntryCount > 0) {
                                verboseLines.push("Unusable directory entries: " + modelIITrsdos.rejectedEntryCount);
                            }
                        } else if (fileSystem instanceof TrsdosII) {
                            const trsdosII = fileSystem;
                            if (trsdosII.diskName !== "") {
                                verboseLines.push("Floppy name: " + trsdosII.diskName);
                            }
                            const version = trsdosII.nameAndVersion.replace(/^TRSDOS-II ?/, "");
                            if (version !== "") {
                                verboseLines.push("Version: " + version);
                            }
                            verboseLines.push(`Sides used: ${trsdosII.sideCount}`);
                            verboseLines.push(`Granules: ${trsdosII.granuleCount}`);
                            if (trsdosII.subdirectories.length > 0) {
                                verboseLines.push("Subdirectories: " + trsdosII.subdirectories.join(", "));
                            }
                        } else if (fileSystem instanceof XenixTar) {
                            const xenixTar = fileSystem;
                            verboseLines.push(`Archive members listed as files: ${xenixTar.files.length}`);
                            verboseLines.push(`Archive members skipped (directories, links, devices): ` +
                                xenixTar.skippedMemberCount);
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
export async function info(infiles: string[], verbose: boolean, json: boolean): Promise<void> {
    if (json) {
        infoJson(infiles);
        return;
    }

    for (const infile of infiles) {
        printInfoForFile(infile, verbose);
        await pagerYield();
    }
}
