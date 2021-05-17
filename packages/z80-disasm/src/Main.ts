
import program from "commander";
import * as fs from "fs";
import {Disasm} from "./Disasm.js";
import {Z80_KNOWN_LABELS} from "./KnownLabels.js";
import {instructionsToText} from "./TextFormatter.js";

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
disasm.addLabels(Z80_KNOWN_LABELS);
disasm.addChunk(bin, org);
disasm.addEntryPoint(org);
if (program.start !== undefined) {
    for (const address of program.start.split(",")) {
        disasm.addEntryPoint(parseInt(address));
    }
}
const instructions = disasm.disassemble();
for (const line of instructionsToText(instructions)) {
    console.log(line);
}
