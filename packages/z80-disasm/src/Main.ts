
import program from "commander";
import * as fs from "fs";
import {Disasm} from "./Disasm";
import {toHex} from "z80-base";

program
    .arguments("<in.bin>");

program.parse(process.argv);

if (program.args.length !== 1) {
    program.help();
}

const binPathname: string = program.args[0];

let bin = fs.readFileSync(binPathname);

const disasm = new Disasm();
const instructions = disasm.disassemble(bin);
for (const instruction of instructions) {
    console.log(toHex(instruction.address, 4) + " " + instruction.binText().padEnd(12) + instruction.toText());
}
