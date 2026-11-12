import * as fs from "fs";
import * as path from "path";
import { expandFile } from "./InputFile.js";
import {pluralizeWithCount, ToolError} from "./utils.js";
import {DEFAULT_SAMPLE_RATE, binaryAsCasFile, casAsAudio,
    concatAudio, writeWavFile } from "trs80-cassette";
import {
    CassetteSpeed, decodeTrs80File, floppyImageFormatFromExtension, isFloppy, Trs80File, Trs80Floppy,
    hiResScreenFormatToString, whyNotHiResScreen,
} from "trs80-base";
import {convertFloppyFile} from "./convertDisk.js";
import {encodeBlackAndWhitePng} from "./png.js";
import { concatByteArrays } from "teamten-ts-utils";

/**
 * Handle the "convert" command.
 *
 * @param inFilenames list of input filenames.
 * @param outFilename single output filename.
 * @param speed optional new cassette speed.
 * @param start optional start address of system file.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of ending
 * text files at their Ctrl-Z.
 * @param force whether to write a floppy image even if the new format can't hold everything on the disk.
 */
export function convert(inFilenames: string[], outFilename: string, speed: CassetteSpeed | undefined,
                 start: number | "auto" | undefined, includeSystemFiles: boolean,
                 cpmWholeRecords: boolean, force: boolean): void {

    const outStat = fs.statSync(outFilename, { throwIfNoEntry: false });
    const outputIsDirectory = outStat !== undefined && outStat.isDirectory();
    if (outputIsDirectory) {
        throw new ToolError("\"" + outFilename + "\" is a directory. " +
            "Use \"trs80-tool extract\" to extract the files from a floppy or cassette into a directory.");
    }

    // Floppy images convert to other floppy images as a whole, not file by file.
    const outExtension = path.parse(outFilename).ext.toLowerCase();
    if (convertDisk(inFilenames, outFilename, outExtension, force)) {
        return;
    }

    // Read all input files into an internal data structure, expanding archives like cassettes and floppies.
    const inFiles = inFilenames.flatMap(filename => expandFile(filename, includeSystemFiles, cpmWholeRecords));

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

    // Output is a file. Its extension will help us determine how to convert the input files.
    const outExt = path.parse(outFilename).ext.toLowerCase();
    if (outExt === "") {
        throw new ToolError("No file extension on output file \"" + outFilename + "\", don't know how to convert");
    }

    // See if input is a single file.
    if (inFiles.length === 1) {
        // Convert individual file.
        const infile = inFiles[0];
        const inName = path.parse(infile.filename).name;
        const resolvedSpeed = speed ?? infile.getSpeed() ?? CassetteSpeed.LOW;
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

                    case ".png": {
                        // Only hi-res screens make pictures, so say why this isn't one.
                        const inExtension = path.parse(infile.filename).ext.toUpperCase();
                        const reason = whyNotHiResScreen(infile.binary, inExtension) ??
                            "it isn't a hi-res screen";
                        throw new ToolError("Can't convert " + infile.filename + " to PNG: " + reason);
                    }

                    default:
                        throw new ToolError("Can't convert a raw binary program to " + outExt.toUpperCase());
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
                        outBinary = binaryAsCasFile(infile.trs80File.asCassetteBinary(), resolvedSpeed);
                        description = "Basic file in " + resolvedSpeed.name + " speed CAS file";
                        break;
                    }

                    case ".wav": {
                        // Encode in WAV file.
                        const cas = binaryAsCasFile(infile.trs80File.asCassetteBinary(), resolvedSpeed);
                        const audio = casAsAudio(cas, resolvedSpeed, DEFAULT_SAMPLE_RATE);
                        outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                        description = "Basic file in " + resolvedSpeed.nominalBaud + " baud WAV file";
                        break;
                    }

                    default:
                        throw new ToolError("Can't convert a Basic program to " + outExt.toUpperCase());
                }
                break;

            case "Jv1FloppyDisk":
            case "Jv3FloppyDisk":
            case "DmkFloppyDisk":
            case "ScpFloppyDisk":
            case "HfeFloppyDisk":
            case "ImdFloppyDisk":
            case "HdvHardDisk":
            case "Cassette":
            case "BootSector":
                throw new ToolError("Files of type \"" + infile.trs80File.getDescription() + "\" are not yet supported");

            case "HiResScreen": {
                const screen = infile.trs80File;
                switch (outExt) {
                    case ".png":
                        outBinary = encodeBlackAndWhitePng(screen.width, screen.height, screen.bitmap);
                        description = screen.width + "x" + screen.height + " PNG of a hi-res screen (" +
                            hiResScreenFormatToString(screen.format) + ")";
                        break;

                    default:
                        throw new ToolError("Can't convert a hi-res screen to " + outExt.toUpperCase() +
                            "; it can only be converted to PNG");
                }
                break;
            }

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
                        outBinary = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        description = infile.trs80File.getDescription() + " in " +
                            resolvedSpeed.name + " speed CAS file";
                        break;
                    }

                    case ".wav": {
                        // Encode in WAV file.
                        const cas = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        const audio = casAsAudio(cas, resolvedSpeed, DEFAULT_SAMPLE_RATE);
                        outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                        description = infile.trs80File.getDescription() + " in " + resolvedSpeed.nominalBaud +
                            " baud WAV file";
                        break;
                    }

                    default:
                        throw new ToolError("Can't convert a system program program to " + outExt.toUpperCase());
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
                        const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                        const sysBinary = systemProgram.binary;
                        outBinary = binaryAsCasFile(sysBinary, resolvedSpeed);
                        description = systemProgram.getDescription() + " in " +
                            resolvedSpeed.name + " speed CAS file";
                        break;
                    }

                    case ".wav": {
                        // Encode in WAV file.
                        const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                        const sysBinary = systemProgram.binary;
                        const cas = binaryAsCasFile(sysBinary, resolvedSpeed);
                        const audio = casAsAudio(cas, resolvedSpeed, DEFAULT_SAMPLE_RATE);
                        outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                        description = systemProgram.getDescription() + " in " +
                            resolvedSpeed.nominalBaud + " baud WAV file";
                        break;
                    }

                    default:
                        throw new ToolError("Can't convert a CMD program to " + outExt.toUpperCase());
                }
                break;

            case "Level1Program":
                switch (outExt) {
                    case ".cas": {
                        // Encode in CAS file.
                        outBinary = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        description = infile.trs80File.getDescription() + " in " +
                            resolvedSpeed.name + " speed CAS file";
                        break;
                    }

                    case ".wav": {
                        // Encode in WAV file.
                        const cas = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        const audio = casAsAudio(cas, resolvedSpeed, DEFAULT_SAMPLE_RATE);
                        outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                        description = infile.trs80File.getDescription() + " in " +
                            resolvedSpeed.nominalBaud + " baud WAV file";
                        break;
                    }

                    default:
                        throw new ToolError("Can't convert an L1 program to " + outExt.toUpperCase());
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
                        outBinary = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        description = infile.trs80File.getDescription() + " in " +
                            resolvedSpeed.name + " speed CAS file";
                        break;
                    }

                    case ".wav": {
                        // Encode in WAV file.
                        const cas = binaryAsCasFile(infile.trs80File.binary, resolvedSpeed);
                        const audio = casAsAudio(cas, resolvedSpeed, DEFAULT_SAMPLE_RATE);
                        outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                        description = infile.trs80File.getDescription() + " in " +
                            resolvedSpeed.nominalBaud + " baud WAV file";
                        break;
                    }

                    default:
                        throw new ToolError("Can't convert an ASM program to " + outExt.toUpperCase());
                }
                break;
        }

        fs.writeFileSync(outFilename, outBinary);
        console.log("Wrote " + outFilename + ": " + description);
    } else {
        // Make archive.
        if (outExt === ".cas" || outExt === ".wav") {
            // Make the individual cas files and their baud rate.
            const outCasFiles: {cas: Uint8Array, speed: CassetteSpeed}[] = [];
            for (const inFile of inFiles) {
                // Convert to cassette format if necessary.
                let outBinary: Uint8Array;
                let description: string;
                let preferredSpeed = CassetteSpeed.LOW;
                switch (inFile.trs80File.className) {
                    case "RawBinaryFile":
                    case "SystemProgram":
                    case "EdtasmFile":
                    case "HiResScreen":
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
                    case "HfeFloppyDisk":
                    case "ImdFloppyDisk":
                    case "HdvHardDisk":
                    case "Cassette":
                    case "BootSector":
                        // Shouldn't happen, we split up archives.
                        throw new ToolError(`Can't put ${inFile.trs80File.getDescription()} into a ${outExt.toUpperCase()} file`);
                    case "CmdProgram": {
                        // Convert to system program first.
                        const inName = path.parse(inFile.filename).name;
                        const systemProgram = inFile.trs80File.toSystemProgram(inName.toUpperCase());
                        outBinary = systemProgram.binary;
                        description = systemProgram.getDescription();
                        break;
                    }
                    case "Level1Program":
                        preferredSpeed = CassetteSpeed.VERY_LOW;
                        outBinary = inFile.trs80File.binary;
                        description = inFile.trs80File.getDescription()
                        break;
                }

                const resolvedSpeed = speed ?? inFile.getSpeed() ?? preferredSpeed;
                outCasFiles.push({
                    cas: binaryAsCasFile(outBinary, resolvedSpeed),
                    speed: resolvedSpeed,
                });
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
                    audioParts.push(casAsAudio(outCas.cas, outCas.speed, DEFAULT_SAMPLE_RATE));

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

/**
 * Handle a conversion that involves a floppy image format on the output: a floppy image to another image
 * format, or the refusal to make a floppy image from anything else. Does nothing for other conversions,
 * including a floppy to a cassette, which expands the floppy into its files as it always did.
 *
 * @param inFilenames the input filenames.
 * @param outFilename the output filename.
 * @param outExtension the output filename's extension, with its dot, in lower case.
 * @param force whether to write the new image even if it differs from the original.
 * @return whether the conversion was handled, by converting the floppy or throwing.
 * @throws ToolError if the conversion is refused or fails.
 */
function convertDisk(inFilenames: string[], outFilename: string, outExtension: string, force: boolean): boolean {
    const outFormat = floppyImageFormatFromExtension(outExtension);
    const outIsFloppy = outFormat !== undefined || outExtension === ".dsk";
    if (!outIsFloppy) {
        return false;
    }

    // A single input might be a floppy image.
    let floppy: Trs80Floppy | undefined = undefined;
    if (inFilenames.length === 1 && path.parse(inFilenames[0]).ext.toLowerCase() !== ".wav") {
        let binary: Uint8Array;
        try {
            binary = fs.readFileSync(inFilenames[0]);
        } catch (e: any) {
            throw new ToolError("Can't open \"" + inFilenames[0] + "\": " + e.message);
        }
        const trs80File = decodeTrs80File(binary, {filename: inFilenames[0]});
        floppy = isFloppy(trs80File) ? trs80File : undefined;
    }

    if (floppy === undefined) {
        throw new ToolError("Can't convert to the floppy image \"" + outFilename + "\": only another floppy " +
            "image can be converted to one. Use \"trs80-tool disk\" to make a floppy and put files on it.");
    }
    if (outFormat === undefined) {
        throw new ToolError("\".dsk\" doesn't say which kind of floppy image to write: " +
            "use .jv1 or .jv3 (or .dmk, .hfe, or .imd)");
    }

    convertFloppyFile(floppy, inFilenames[0], outFilename, outFormat, force);
    return true;
}
