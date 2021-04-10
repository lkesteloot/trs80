
import * as fs from "fs";
import * as path from "path";
import { program } from "commander";
import {decodeSystemProgram, decodeTrs80File, decodeTrsdos, trsdosProtectionLevelToString} from "trs80-base";
import {withCommas} from "teamten-ts-utils";
import {Decoder, readWavFile, Tape} from "trs80-cassette";

function dir(infile: string): void {
    let buffer;
    try {
        buffer = fs.readFileSync(infile);
    } catch (e) {
        console.error("Can't open \"" + infile + "\": " + e.message);
        process.exit(1);
    }

    if (infile.toLowerCase().endsWith(".wav")) {
        const wavFile = readWavFile(buffer.buffer);
        const tape = new Tape(infile, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();

        for (const program of tape.programs) {
            let extension = ".BIN";
            if (program.isEdtasmProgram()) {
                extension = ".ASM";
            } else if (program.isBasicProgram()) {
                extension = ".BAS";
            } else if (decodeSystemProgram(program.binary) !== undefined) {
                extension = ".3BN";
            }
            const filename = program.getPseudoFilename() + extension;

            console.log(filename.padEnd(12) + " " +
                withCommas(program.binary.length).padStart(8) + "  " +
                program.baud + " baud");
        }
    } else {
        const file = decodeTrs80File(buffer, infile);

        switch (file.className) {
            case "Jv1FloppyDisk":
            case "Jv3FloppyDisk":
            case "DmkFloppyDisk":
                const trsdos = decodeTrsdos(file);
                if (trsdos !== undefined) {
                    for (const dirEntry of trsdos.dirEntries) {
                        console.log(dirEntry.getFilename(".").padEnd(12) + " " +
                            withCommas(dirEntry.getSize()).padStart(8) + " " +
                            dirEntry.getDateString() + " " +
                            trsdosProtectionLevelToString(dirEntry.getProtectionLevel()));
                    }
                } else {
                    console.log("Can only show directory of TRSDOS floppies.");
                }
                break;

            default:
                console.log("Can't show a directory of this file type (" + file.className + ").");
                break;
        }
    }
}

function extract(infile: string, outfile: string): void {

}

function convert(infile: string, outfile: string): void {

}

function hexdump(infile: string): void {

}

function main() {
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool");
    program
        .command("dir <infile>")
        .description("list files in the infile", {
            infile: "WAV, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .action(infile => {
            dir(infile);
        });
    program
        .command("extract <infile> <outfile>")
        .description("extract files in the infile", {
            infile: "WAV, JV1, JV3, or DMK file",
            outfile: "path to file or directory, or to JSON file for metadata",
        })
        .action((infile, outfile) => {
            extract(infile, outfile);
        });
    program
        .command("convert <infile> <outfile>")
        .description("convert infile to outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file",
            outfile: "WAV, CAS, CMD, 3BN, BAS, or LST file",
        })
        .action((infile, outfile) => {
            convert(infile, outfile);
        });
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .action(infile => {
            hexdump(infile);
        });
    program
        .parse(process.argv);
}

main();
