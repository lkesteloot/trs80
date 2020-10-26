
import * as fs from "fs";
import * as path from "path";
import {readWavFile} from "./WavFile";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";
import * as Basic from "./Basic";
import * as program from "commander";

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
        .option("-f, --force", "override existing output files")
        .parse(process.argv);

    if (program.args.length !== 1) {
        console.error("Usage: Decode input.wav");
        console.error("Generates various files with the base name of the WAV file.");
        process.exit(1);
    }

    const force = program.opts().force;

    const wavPathname = program.args[0];
    const {dir, name} = path.parse(wavPathname);

    console.log("Reading WAV file...");
    const buffer = fs.readFileSync(wavPathname);

    console.log("Decoding WAV file...");
    const audioFile = readWavFile(buffer.buffer);

    console.log("Decoding programs...");
    const tape = new Tape(wavPathname, audioFile);
    const decoder = new Decoder(tape);
    decoder.decode();

    for (let i = 0; i < tape.programs.length; i++) {
        const program = tape.programs[i];
        const programName = name + "-" + program.trackNumber + "-" + program.copyNumber;

        const binaryPathname = path.join(dir, programName + ".bin");
        if (!force && fs.existsSync(binaryPathname)) {
            console.error("Not overwriting " + binaryPathname);
        } else {
            console.log("Writing " + binaryPathname);
            fs.writeFileSync(binaryPathname, program.binary);
        }

        const casPathname = path.join(dir, programName + ".cas");
        if (!force && fs.existsSync(casPathname)) {
            console.error("Not overwriting " + casPathname);
        } else {
            console.log("Writing " + casPathname);
            fs.writeFileSync(casPathname, program.asCasFile());
        }

        if (program.isBasicProgram()) {
            const basicPathname = path.join(dir, programName + ".bas");
            if (!force && fs.existsSync(basicPathname)) {
                console.error("Not overwriting " + basicPathname);
            } else {
                console.log("Writing " + basicPathname);
                fs.writeFileSync(basicPathname, makeBasicText(program.binary));
            }
        }
    }
}

main();
