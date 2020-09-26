
import * as fs from "fs";
import * as path from "path";
import {readWavFile} from "./WavReader";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";
import * as Basic from "./Basic";

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
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error("Usage: Decode input.wav");
        console.error("Generates various files with the base name of the WAV file.");
        process.exit(1);
    }

    const wavPathname = args[0];
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
        const binaryPathname = path.join(dir, name + "-" + (i + 1) + ".bin");
        if (fs.existsSync(binaryPathname)) {
            console.error("Not overwriting " + binaryPathname);
        } else {
            console.log("Writing " + binaryPathname);
            fs.writeFileSync(binaryPathname, program.binary);
        }

        if (program.isBasicProgram()) {
            const basicPathname = path.join(dir, name + "-" + (i + 1) + ".bas");
            if (fs.existsSync(basicPathname)) {
                console.error("Not overwriting " + basicPathname);
            } else {
                console.log("Writing " + basicPathname);
                fs.writeFileSync(basicPathname, makeBasicText(program.binary));
            }
        }
    }
}

main();
