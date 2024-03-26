import * as fs from "fs";
import * as path from "path";
import { expandFile } from "./InputFile.js";
import {pluralizeWithCount} from "./utils.js";
import {DEFAULT_SAMPLE_RATE, binaryAsCasFile, casAsAudio,
    concatAudio, writeWavFile } from "trs80-cassette";
import {Trs80File} from "trs80-base";
import { concatByteArrays } from "teamten-ts-utils";
import {disassemble} from "./disasm.js";

/**
 * Handle the "convert" command.
 *
 * @param inFilenames list of input filenames.
 * @param outFilename single output filename or directory.
 * @param baud optional new baud rate.
 * @param start optional start address of system file.
 * @param entryPoints additional entry points in binary.
 */
export function convert(inFilenames: string[], outFilename: string, baud: number | undefined,
                 start: number | "auto" | undefined, entryPoints: number[]): void {

    const outputIsDirectory = fs.existsSync(outFilename) && fs.statSync(outFilename).isDirectory();

    // Read all input files into an internal data structure, expanding archives like cassettes and floppies.
    const inFiles = inFilenames.flatMap(filename => expandFile(filename, false));

    // Update start address if requested.
    if (start !== undefined) {
        for (let i = 0; i < inFiles.length; i++) {
            const trs80File = inFiles[i].trs80File;
            let newTrs80File: Trs80File | undefined;

            if (trs80File.className === "SystemProgram") {
                if (start === "auto") {
                    if (trs80File.entryPointAddress === 0) {
                        const guessAddress = trs80File.guessEntryAddress();
                        if (guessAddress !== undefined) {
                            newTrs80File = trs80File.withEntryPointAddress(guessAddress);
                        }
                    }
                } else {
                    newTrs80File = trs80File.withEntryPointAddress(start);
                }
            }

            if (newTrs80File !== undefined) {
                inFiles[i].setFile(newTrs80File);
            }
        }
    }

    // If output is existing directory, put all input files there.
    if (outputIsDirectory) {
        for (const infile of inFiles) {
            const outpath = path.join(outFilename, infile.filename);
            const binary = infile.binary;
            fs.writeFileSync(outpath, binary);
            const date = infile.getDate();
            if (date !== undefined) {
                fs.utimesSync(outpath, date, date);
            }
            console.log("Wrote " + outpath + " (" +
                pluralizeWithCount(binary.length, "byte") +
                (infile.trs80File.error !== undefined ? ", " + infile.trs80File.error : "") + ")");
        }
    } else {
        // Output is a file. Its extension will help us determine how to convert the input files.
        const outExt = path.parse(outFilename).ext.toLowerCase();
        if (outExt === "") {
            console.log("No file extension on output file \"" + outFilename + "\", don't know how to convert");
            process.exit(1);
        }

        // See if input is a single file.
        if (inFiles.length === 1) {
            // Convert individual file.
            const infile = inFiles[0];
            const inName = path.parse(infile.filename).name;
            let outBinary: Uint8Array;
            let description: string;

            switch (infile.trs80File.className) {
                case "RawBinaryFile": {
                    const org = start === "auto" ? 0 : start ?? 0;
                    switch (outExt) {
                        case ".3bn": {
                            // Convert to system program.
                            const cmdProgram = infile.trs80File.toSystemProgram(inName.toUpperCase(), org);
                            outBinary = cmdProgram.binary;
                            description = cmdProgram.getDescription();
                            break;
                        }

                        case ".cmd": {
                            // Convert to CMD program.
                            const cmdProgram = infile.trs80File.toCmdProgram(inName.toUpperCase(), org);
                            outBinary = cmdProgram.binary;
                            description = cmdProgram.getDescription();
                            break;
                        }

                        default:
                            console.log("Can't convert a raw binary program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;
                }

                case "BasicProgram":
                    switch (outExt) {
                        case ".bas":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = "Basic file (tokenized)";
                            break;

                        case ".asc":
                            // Convert to ASCII.
                            outBinary = Buffer.from(infile.trs80File.asAscii());
                            description = "Basic file (plain text)";
                            break;

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.asCassetteBinary(), outBaud);
                            description = "Basic file in " + (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.asCassetteBinary(), outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = "Basic file in " + baud + " baud WAV file";
                            break;
                        }

                        default:
                            console.log("Can't convert a Basic program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "Jv1FloppyDisk":
                case "Jv3FloppyDisk":
                case "DmkFloppyDisk":
                case "ScpFloppyDisk":
                case "Cassette":
                    console.log("Files of type \"" + infile.trs80File.getDescription() + "\" are not yet supported");
                    process.exit(1);
                    break;

                case "SystemProgram":
                    switch (outExt) {
                        case ".3bn":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = infile.trs80File.getDescription();
                            break;

                        case ".cmd": {
                            // Convert to CMD program.
                            const cmdProgram = infile.trs80File.toCmdProgram(inName.toUpperCase());
                            outBinary = cmdProgram.binary;
                            description = cmdProgram.getDescription();
                            break;
                        }

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            description = infile.trs80File.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = infile.trs80File.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        case ".lst":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints, true);
                            break;

                        case ".asm":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints, false);
                            break;

                        default:
                            console.log("Can't convert a system program program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "CmdProgram":
                    switch (outExt) {
                        case ".cmd":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = infile.trs80File.getDescription();
                            break;

                        case ".3bn": {
                            // Convert to system program.
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            outBinary = systemProgram.binary;
                            description = systemProgram.getDescription();
                            break;
                        }

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            const sysBinary = systemProgram.binary;
                            outBinary = binaryAsCasFile(sysBinary, outBaud);
                            description = systemProgram.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            const sysBinary = systemProgram.binary;
                            const cas = binaryAsCasFile(sysBinary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = systemProgram.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        case ".lst":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints, true);
                            break;

                        case ".asm":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints, false);
                            break;

                        default:
                            console.log("Can't convert a CMD program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "Level1Program":
                    switch (outExt) {
                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = baud ?? infile.getBaud() ?? 250;
                            outBinary = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            description = infile.trs80File.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = baud ?? infile.getBaud() ?? 250;
                            const cas = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = infile.trs80File.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        default:
                            console.log("Can't convert an L1 program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "EdtasmFile":
                    switch (outExt) {
                        case ".asc":
                            outBinary = Buffer.from(infile.trs80File.asAscii());
                            description = "EDTASM file (plain text)";
                            break;

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            description = infile.trs80File.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = baud ?? infile.getBaud() ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = infile.trs80File.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        default:
                            console.log("Can't convert an ASM program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;
            }

            fs.writeFileSync(outFilename, outBinary);
            console.log("Wrote " + outFilename + ": " + description);
        } else {
            // Make archive.
            if (outExt === ".cas" || outExt === ".wav") {
                // Make the individual cas files and their baud rate.
                const outCasFiles: {cas: Uint8Array, baud: number}[] = [];
                for (const inFile of inFiles) {
                    // Convert to cassette format if necessary.
                    let outBinary: Uint8Array;
                    let description: string;
                    let preferredBaud = 500;
                    switch (inFile.trs80File.className) {
                        case "RawBinaryFile":
                        case "SystemProgram":
                        case "EdtasmFile":
                            // Keep as-is.
                            outBinary = inFile.trs80File.binary;
                            description = inFile.trs80File.getDescription();
                            break;
                        case "BasicProgram":
                            outBinary = inFile.trs80File.asCassetteBinary();
                            description = inFile.trs80File.getDescription();
                            break;
                        case "Jv1FloppyDisk":
                        case "Jv3FloppyDisk":
                        case "DmkFloppyDisk":
                        case "ScpFloppyDisk":
                        case "Cassette":
                            // Shouldn't happen, we split up archives.
                            console.log(`Can't put ${inFile.trs80File.getDescription()} into a ${outExt.toUpperCase()} file`);
                            process.exit(1);
                            break;
                        case "CmdProgram": {
                            // Convert to system program first.
                            const inName = path.parse(inFile.filename).name;
                            const systemProgram = inFile.trs80File.toSystemProgram(inName.toUpperCase());
                            outBinary = systemProgram.binary;
                            description = systemProgram.getDescription();
                            break;
                        }
                        case "Level1Program":
                            preferredBaud = 250;
                            outBinary = inFile.trs80File.binary;
                            description = inFile.trs80File.getDescription()
                            break;
                    }

                    const outBaud = baud ?? inFile.getBaud() ?? preferredBaud;
                    outCasFiles.push({cas: binaryAsCasFile(outBinary, outBaud), baud: outBaud});
                    console.log("In output file: " + description);
                }

                if (outExt === ".cas") {
                    fs.writeFileSync(outFilename, concatByteArrays(outCasFiles.map(outCas => outCas.cas)));
                    console.log("Wrote " + outFilename + ": CAS file with " +
                        pluralizeWithCount(outCasFiles.length, "file"));
                } else {
                    // outExt == ".wav"
                    const audioParts: Int16Array[] = [];

                    for (const outCas of outCasFiles) {
                        // One second of silence before each program.
                        audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));

                        // Convert program to audio.
                        audioParts.push(casAsAudio(outCas.cas, outCas.baud, DEFAULT_SAMPLE_RATE));

                        // One second of silence after each program.
                        audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));
                    }

                    const wavBinary = writeWavFile(concatAudio(audioParts), DEFAULT_SAMPLE_RATE);
                    fs.writeFileSync(outFilename, wavBinary);
                    console.log("Wrote " + outFilename + ": WAV file with " +
                        pluralizeWithCount(outCasFiles.length, "file"));
                }
            } else {
                // TODO handle floppy.
                console.log("Can't put multiple files into " + outExt.toUpperCase());
            }
        }
    }
}
