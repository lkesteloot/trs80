
import * as fs from "fs";
import * as path from "path";
import { program } from "commander";

function dir(infile: string): void {

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
            infile: "WAV, JV1, JV3, or DMK file",
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
