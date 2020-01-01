
import program from "commander";
import * as fs from "fs";
import {Disasm} from "./Disasm";
import {toHex} from "z80-base";

program
    .option('--org <address>', 'where to assume the binary is loaded (0)')
    .arguments("<in.bin>");

program.parse(process.argv);

if (program.args.length !== 1) {
    program.help();
}

const org = program.org ? parseInt(program.org) : 0;
const binPathname: string = program.args[0];

let bin = fs.readFileSync(binPathname);

const disasm = new Disasm();
const instructions = disasm.disassembleAll(bin, org);
for (const instruction of instructions) {
    if (instruction.label !== undefined) {
        console.log("                 " + instruction.label + ":");
    }
    console.log(toHex(instruction.address, 4) + " " + instruction.binText().padEnd(12) + "        " + instruction.toText());
}
