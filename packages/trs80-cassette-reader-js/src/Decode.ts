import * as fs from "fs";
import * as path from "path";
import {DEFAULT_SAMPLE_RATE, readWavFile, writeWavFile} from "./WavFile";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";
import * as program from "commander";
import {concatByteArrays} from "./Utils";
import {concatAudio, frameToTimestamp, makeSilence} from "./AudioUtils";
import * as pkg from "../package.json";
import {decodeBasicProgram, decodeSystemProgram, ElementType} from "trs80-base";
import {Program} from "./Program";
import {disasmForTrs80Program} from "trs80-disasm";
import {instructionsToText} from "z80-disasm";
import {BitType} from "./BitType";

/**
 * Create a plain text version of the Basic program described by the binary.
 */
function makeBasicText(binary: Uint8Array): string {
    const basicProgram = decodeBasicProgram(binary);
    if (basicProgram === undefined) {
        return "";
    }

    const parts: string[] = [];

    for (const basicElement of basicProgram.elements) {
        if (parts.length > 0 && basicElement.elementType === ElementType.LINE_NUMBER) {
            parts.push("\n");
        }

        parts.push(basicElement.text);
    }

    parts.push("\n");

    return parts.join("");
}

/**
 * Return the singular or plural version of a string depending on the count.
 */
function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : plural ?? (singular + "s");
}

/**
 * Return the count and the singular or plural version of a string depending on the count.
 */
function pluralizeWithCount(count: number, singular: string, plural?: string): string {
    return `${count} ${pluralize(count, singular, plural)}`;
}

function main() {
    program
        .storeOptionsAsProperties(false)
        .option("--force", "overwrite existing output files")
        .option("--all", "write a single output file for the whole tape, instead of one per program")
        .option("--wav", "output clean WAV file")
        .option("--cas", "output CAS file")
        .option("--text", "make text version of file when possible (e.g,. detokenized Basic, listing file for system files)")
        .option("--json", "make a single JSON file for the whole tape")
        .description("Extracts programs from a TRS-80 cassette audio file.")
        .usage("[options] original.wav")
        .version(pkg.version)
        .parse(process.argv);

    if (program.args.length !== 1) {
        program.outputHelp();
        process.exit(1);
    }

    const force = program.opts().force;
    const all = program.opts().all;
    const wav = program.opts().wav;
    const cas = program.opts().cas;
    const text = program.opts().text;
    const json = program.opts().json;

    if (all && !(wav || cas)) {
        console.error("Must specify --wav or --cas when using --all");
        process.exit(1);
    }

    const wavInputPathname = program.args[0];
    const {dir, name} = path.parse(wavInputPathname);

    console.log("Reading WAV file...");
    let buffer;
    try {
        buffer = fs.readFileSync(wavInputPathname);
    } catch (e) {
        console.error("Can't open \"" + wavInputPathname + "\": " + e.message);
        process.exit(1);
    }

    console.log("Decoding WAV file...");
    const audioFile = readWavFile(buffer.buffer);

    console.log("Decoding programs...");
    const tape = new Tape(wavInputPathname, audioFile);
    const decoder = new Decoder(tape);
    decoder.decode();

    const wavFileParts: Int16Array[] = [];
    const casFileParts: Uint8Array[] = [];

    // Write contents to file if the file is missing, or if --force is specified.
    let firstForceNotice = true;
    const possiblyWriteFile = (pathname: string, contents: Uint8Array | string) => {
        if (!force && fs.existsSync(pathname)) {
            console.error("    " + pathname + " exists" + (firstForceNotice ? " (use --force to overwrite)" : ""));
            firstForceNotice = false;
        } else {
            console.log("    Writing " + pathname);
            fs.writeFileSync(pathname, contents);
        }
    };

    const nameForProgram = (program: Program): string => name + "-T" + program.trackNumber + "-C" + program.copyNumber;

    const fullData: any = {
        programs: [],
        sampleRate: tape.sampleRate,
        version: 1,
    };

    for (let i = 0; i < tape.programs.length; i++) {
        const program = tape.programs[i];
        const programName = nameForProgram(program);
        const programData: any = {
            name: programName,
            trackNumber: program.trackNumber,
            copyNumber: program.copyNumber,
            startFrame: program.startFrame,
            endFrame: program.endFrame,
            speed: program.baud,
            length: program.binary.length,
        };
        fullData.programs.push(programData);

        const labelParts: string[] = [];

        // Speed.
        labelParts.push(program.baud + " baud");

        // Size.
        labelParts.push(pluralizeWithCount(program.binary.length, "byte"));

        // Start, stop, and duration.
        labelParts.push(frameToTimestamp(program.startFrame, tape.sampleRate, true) + " to " +
            frameToTimestamp(program.endFrame, tape.sampleRate, true) + " (" +
            frameToTimestamp(program.endFrame - program.startFrame, tape.sampleRate, true) + ")");

        // Decode various formats.
        programData.type = "unknown";
        const systemProgram = decodeSystemProgram(program.binary);

        // Analyze system program.
        if (systemProgram !== undefined) {
            labelParts.push("system program (" + systemProgram.filename + ")");
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
            if (checksumErrors === 0) {
                labelParts.push("all checksums good")
            } else {
                labelParts.push(`${checksumErrors} of ${pluralizeWithCount(systemProgram.chunks.length, "chunk")} ${pluralize(checksumErrors, "has", "have")} a checksum error`);
            }

            programData.checksumErrorCount = checksumErrors;
        }

        // Label Basic program.
        if (program.isBasicProgram()) {
            labelParts.push("Basic program");
            programData.type = "basic";
        }

        // Warn about bit errors.
        const errorCount = program.countBitErrors();
        if (errorCount !== 0) {
            labelParts.push(pluralizeWithCount(errorCount, "bit-reading error"));
        }
        programData.errorCount = errorCount;
        programData.errors = [];
        for (const bitData of program.bitData) {
            if (bitData.bitType === BitType.BAD) {
                programData.errors.push(Math.round((bitData.startFrame + bitData.endFrame)/2));
            }
        }

        // See if it's a duplicate.
        let isDuplicate = false;
        for (let j = 0; j < i; j++) {
            const otherProgram = tape.programs[j];
            if (program.sameBinaryAs(otherProgram)) {
                labelParts.push(`identical to ${nameForProgram(otherProgram)}`);
                isDuplicate = true;
                break;
            }
        }
        programData.isDuplicate = isDuplicate;

        console.log(programName + ": " + labelParts.join(", "));

        if (!isDuplicate) {
            if (wav) {
                if (all) {
                    if (wavFileParts.length > 0) {
                        // Insert some silence between the recordings.
                        wavFileParts.push(makeSilence(2, DEFAULT_SAMPLE_RATE));
                    }
                    wavFileParts.push(program.asAudio());
                } else {
                    possiblyWriteFile(path.join(dir, programName + ".wav"), program.asWavFile());
                }
            }

            if (cas) {
                let casFile = program.asCasFile();
                if (all) {
                    casFileParts.push(casFile);
                } else {
                    possiblyWriteFile(path.join(dir, programName + ".cas"), casFile);
                }
            }

            if (!all) {
                if (program.isBasicProgram()) {
                    possiblyWriteFile(path.join(dir, programName + ".bas"), program.binary);
                    if (text) {
                        possiblyWriteFile(path.join(dir, programName + ".txt"), makeBasicText(program.binary));
                    }
                } else if (systemProgram !== undefined) {
                    possiblyWriteFile(path.join(dir, programName + ".3bn"), program.binary);
                    if (text) {
                        const disasm = disasmForTrs80Program(systemProgram);
                        const instructions = disasm.disassemble();
                        const lines = instructionsToText(instructions);
                        const listing = lines.join("\n") + "\n";

                        possiblyWriteFile(path.join(dir, programName + ".lst"), listing);
                    }
                } else {
                    possiblyWriteFile(path.join(dir, programName + ".bin"), program.binary);
                }
            }
        }
    }

    const allBasename = name + "-all";
    if (all) {
        if (wav && wavFileParts.length > 0) {
            possiblyWriteFile(path.join(dir, allBasename + ".wav"),
                writeWavFile(concatAudio(wavFileParts), DEFAULT_SAMPLE_RATE));
        }
        if (cas && casFileParts.length > 0) {
            possiblyWriteFile(path.join(dir, allBasename + ".cas"), concatByteArrays(casFileParts));
        }
    }

    if (json) {
        possiblyWriteFile(path.join(dir, allBasename + ".json"),
            JSON.stringify(fullData, undefined, 2));
    }
}

main();
