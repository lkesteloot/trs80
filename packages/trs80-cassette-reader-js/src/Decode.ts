import * as fs from "fs";
import * as path from "path";
import {DEFAULT_SAMPLE_RATE, readWavFile, writeWavFile} from "./WavFile";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";
import * as Basic from "./Basic";
import * as program from "commander";
import {concatByteArrays} from "./Utils";
import {concatAudio, makeSilence} from "./AudioUtils";

/**
 * Create a plain text version of the Basic program described by the binary.
 */
function makeBasicText(binary: Uint8Array): string {
    const basicElements = Basic.fromTokenized(binary);

    const parts: string[] = [];

    for (const basicElement of basicElements) {
        if (parts.length > 0 && basicElement.elementType === Basic.ElementType.LINE_NUMBER) {
            parts.push("\n");
        }

        parts.push(basicElement.text);
    }

    parts.push("\n");

    return parts.join("");
}

function main() {
    program
        .storeOptionsAsProperties(false)
        .option("--force", "overwrite existing output files")
        .option("--split", "split tape into programs")
        .option("--wav", "output clean WAV file")
        .option("--cas", "output CAS file")
        .option("--bin", "output BIN file")
        .option("--bas", "output BAS file")
        .description("Reads a TRS-80 cassette audio file and generates cleaned-up files.")
        .usage("[options] original.wav")
        .parse(process.argv);

    if (program.args.length !== 1) {
        program.outputHelp();
        process.exit(1);
    }

    const force = program.opts().force;
    const split = program.opts().split;
    const wav = program.opts().wav;
    const cas = program.opts().cas;
    const bin = program.opts().bin;
    const bas = program.opts().bas;

    if (!wav && !cas && !bin) {
        console.error("Specify at least one of --wav, --cas, --bin, or --bas");
        program.outputHelp();
        process.exit(1);
    }

    if (!split && (bas || bin)) {
        console.error("Must use --split when specifying --bin or --bas");
        program.outputHelp();
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
    const possiblyWriteFile = (pathname: string, contents: Uint8Array | string) => {
        if (!force && fs.existsSync(pathname)) {
            console.error("Not overwriting " + pathname);
        } else {
            console.log("Writing " + pathname);
            fs.writeFileSync(pathname, contents);
        }
    };

    for (let i = 0; i < tape.programs.length; i++) {
        const program = tape.programs[i];
        const programName = name + "-" + program.trackNumber + "-" + program.copyNumber;
        const errorCount = program.countBitErrors();
        if (errorCount !== 0) {
            console.log(`Warning: Track ${program.trackNumber} copy ${program.copyNumber} has ${errorCount} bit-reading error${errorCount === 1 ? "" : "s"}.`);
        }

        if (wav) {
            if (split) {
                possiblyWriteFile(path.join(dir, programName + ".wav"), program.asWavFile());
            } else {
                if (wavFileParts.length > 0) {
                    // Insert some silence between the recordings.
                    wavFileParts.push(makeSilence(2, DEFAULT_SAMPLE_RATE));
                }
                wavFileParts.push(program.asAudio());
            }
        }

        if (bin && split) {
            possiblyWriteFile(path.join(dir, programName + ".bin"), program.binary);
        }

        if (cas) {
            let casFile = program.asCasFile();
            if (split) {
                possiblyWriteFile(path.join(dir, programName + ".cas"), casFile);
            } else {
                casFileParts.push(casFile);
            }
        }

        if (bas && split && program.isBasicProgram()) {
            possiblyWriteFile(path.join(dir, programName + ".bas"), makeBasicText(program.binary));
        }
    }

    if (!split) {
        const basename = name + "-all";
        if (wav && wavFileParts.length > 0) {
            possiblyWriteFile(path.join(dir, basename + ".wav"),
                writeWavFile(concatAudio(wavFileParts), DEFAULT_SAMPLE_RATE));
        }
        if (cas && casFileParts.length > 0) {
            possiblyWriteFile(path.join(dir, basename + ".cas"), concatByteArrays(casFileParts));
        }
    }
}

main();
