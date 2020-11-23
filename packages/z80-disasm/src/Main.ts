
import program from "commander";
import * as fs from "fs";
import {Disasm} from "./Disasm";
import {toHexWord, toHexByte} from "z80-base";

program
    .option('--org <address>', 'where to assume the binary is loaded (0)')
    .option('--start <addresses>', 'starting points in binary, comma-separated')
    .arguments("<in.bin>");

program.parse(process.argv);

if (program.args.length !== 1) {
    program.help();
}

const org = program.org ? parseInt(program.org) : 0;
const binPathname: string = program.args[0];

let bin = fs.readFileSync(binPathname);

const disasm = new Disasm();
disasm.addChunk(bin, org);
disasm.addEntryPoint(org);
if (program.start !== undefined) {
    for (const address of program.start.split(",")) {
        disasm.addEntryPoint(parseInt(address));
    }
}
const instructions = disasm.disassemble();
for (const instruction of instructions) {
    if (instruction.label !== undefined) {
        console.log("                 " + instruction.label + ":");
    }

    let address = instruction.address;
    const bytes = instruction.bin;

    while (bytes.length > 0) {
        const subbytes = bytes.slice(0, Math.min(3, bytes.length));
        console.log(toHexWord(address) + " " +
            subbytes.map(toHexByte).join(" ").padEnd(12) +
            (address === instruction.address ? "        " + instruction.toText() : ""));
        address += subbytes.length;
        bytes.splice(0, subbytes.length);
    }
}
