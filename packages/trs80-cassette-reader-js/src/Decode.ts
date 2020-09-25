
import * as fs from "fs";
import * as path from "path";
import {readWavFile} from "./WavReader";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";

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
    }
}

main();
