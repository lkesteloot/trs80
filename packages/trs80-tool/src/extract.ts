import fs from "fs";
import path from "path";
import {Archive, TrsdosFile, WavFile} from "./Archive.js";
import {decodeBasicProgram, decodeSystemProgram, trsdosProtectionLevelToString } from "trs80-base";
import { BitType } from "trs80-cassette";

/**
 * Handle the "extract" command. It's currently unused.
 */
export function extract(infile: string, outfile: string): void {
    const archive = new Archive(infile);
    if (archive.error !== undefined) {
        console.log(archive.error);
        process.exit(1);
    } else {
        // See if outfile is an existing directory.
        if (fs.existsSync(outfile) && fs.statSync(outfile).isDirectory()) {
            // Extract all files to this directory.
            for (const file of archive.files) {
                const binary = file.getBinary();
                const outPathname = path.join(outfile, file.filename);
                fs.writeFileSync(outPathname, binary);
                if (file.date !== undefined) {
                    fs.utimesSync(outPathname, file.date, file.date);
                }
                console.log("Extracted " + file.filename + " to " + outPathname);
            }
        } else {
            // Break apart outfile.
            const { base, ext } = path.parse(outfile);

            // See if it's a JSON file.
            if (ext.toLowerCase() === ".json") {
                // Output metadata to JSON file.
                const fullData: any = {
                    programs: [],
                    version: 1,
                };
                if (archive.tape !== undefined) {
                    fullData.sampleRate = archive.tape.sampleRate;
                }
                for (let i = 0; i < archive.files.length; i++) {
                    const file = archive.files[i];
                    const programData: any = {
                        name: file.filename,
                    };
                    fullData.programs.push(programData);

                    if (file instanceof WavFile) {
                        const program = file.program;

                        programData.trackNumber = program.trackNumber;
                        programData.copyNumber = program.copyNumber;
                        programData.startFrame = program.startFrame;
                        programData.endFrame = program.endFrame;
                        programData.speed = program.baud;
                        programData.length = program.binary.length;

                        // Decode various formats.
                        programData.type = "unknown";

                        // Analyze system program.
                        const fileBinary = file.getBinary();
                        const systemProgram = decodeSystemProgram(fileBinary);
                        if (systemProgram !== undefined) {
                            programData.type = "systemProgram";
                            programData.filename = systemProgram.filename;
                            programData.chunkCount = systemProgram.chunks.length;

                            // Check for checksum errors.
                            let checksumErrors = 0;
                            for (const chunk of systemProgram.chunks) {
                                if (!chunk.isChecksumValid()) {
                                    checksumErrors += 1;
                                }
                            }

                            programData.checksumErrorCount = checksumErrors;
                        }

                        // Label Basic program.
                        const basicProgram = decodeBasicProgram(fileBinary);
                        if (basicProgram !== undefined) {
                            programData.type = "basic";
                        }

                        // Warn about bit errors.
                        programData.errorCount = program.countBitErrors();
                        programData.errors = [];
                        for (const bitData of program.bitData) {
                            if (bitData.bitType === BitType.BAD) {
                                programData.errors.push(Math.round((bitData.startFrame + bitData.endFrame) / 2));
                            }
                        }

                        // See if it's a duplicate.
                        let isDuplicate = false;
                        for (let j = 0; j < i; j++) {
                            const otherProgram = (archive.files[j] as WavFile).program;
                            if (program.sameBinaryAs(otherProgram)) {
                                isDuplicate = true;
                                break;
                            }
                        }
                        programData.isDuplicate = isDuplicate;
                    }

                    if (file instanceof TrsdosFile) {
                        programData.date = file.file.getFullDateString();
                        programData.timestamp = file.file.getDate().getTime();
                        programData.protectionLevel = trsdosProtectionLevelToString(file.file.getProtectionLevel(),
                            file.trsdos.version);
                        programData.size = file.file.getSize();
                        programData.isSystemFile = file.file.isSystemFile();
                        programData.isExtendedEntry = file.file.isExtendedEntry();
                        programData.isHidden = file.file.isHidden();
                        programData.isActive = file.file.isActive();
                    }
                }

                fs.writeFileSync(outfile, JSON.stringify(fullData, undefined, 2));
                console.log("Generated " + outfile);
            } else {
                // Output file contents to file.
                const file = archive.getFileByFilename(base);
                if (file === undefined) {
                    // TODO: Look by name and different extension.
                    console.log("Can't find file " + base);
                } else {
                    const binary = file.getBinary();
                    fs.writeFileSync(outfile, binary);
                    if (file.date !== undefined) {
                        fs.utimesSync(outfile, file.date, file.date);
                    }
                    console.log("Extracted " + file.filename + " to " + outfile);
                }
            }
        }
    }
}
