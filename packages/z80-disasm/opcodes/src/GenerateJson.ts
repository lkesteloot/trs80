// This program generates the Opcodes.json source file that contains
// the maps from opcodes to assembly instructions.
//
// The JSON file consists of a map from hex code (such as "4d") to an object.
// The object either describes the opcode or shifts to a sub-map.
// If it describes the opcode, the fields are mnemonic (a string, such as "cp"),
// "params" (an array of strings), and "extra" (an array of strings). If
// It's a sub-map, then the only key is "shift", whose value is the sub-map
// with the same structure as the top map.

import * as path from "path";
import * as fs from "fs";

import { URL } from 'url';

// Replace __dirname from non-module node. May not work well if there are
// spaces in the path (will show up as %20).
const __dirname = new URL('.', import.meta.url).pathname;

function parseOpcodes(dirname: string, prefix: string): any {
    const pathname = path.join(dirname, "opcodes_" + prefix.toLowerCase() + ".dat");
    const opcodeMap: any = {};
    let opcodes: number[] = [];

    fs.readFileSync(pathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
        line = line.trim();
        if (line.length === 0 || line.startsWith("#")) {
            // Comment or empty line.
            return;
        }

        const fields = line.split(/\s+/);
        const opcodeString = fields.length >= 1 ? fields[0] : undefined;
        const mnemonic = fields.length >= 2 ? fields[1].toLowerCase() : undefined;
        const params = fields.length >= 3 ? fields[2].toLowerCase().split(",") : undefined;
        const extra = fields.length >= 4 ? fields[3].toLowerCase().split(",") : undefined;
        if (fields.length > 4) {
            throw new Error("Invalid opcode line: " + line);
        }

        if (opcodeString === undefined || opcodeString.length == 0 || !opcodeString.startsWith("0x")) {
            throw new Error("Invalid opcode value: " + line);
        }

        const opcode = parseInt(opcodeString, 16);
        opcodes.push(opcode);

        let value: any;

        if (mnemonic === undefined) {
            // Fallthrough to next line.
        } else {
            if (mnemonic === "shift") {
                if (params === undefined) {
                    throw new Error("Shift must have params");
                }
                value = {
                    shift: parseOpcodes(dirname, params[0]),
                }
            } else {
                value = {
                    mnemonic: mnemonic,
                    params: params,
                    extra: extra,
                }
            }

            // Copy value for all numbers.
            for (const opcode of opcodes) {
                opcodeMap[opcode.toString(16)] = value;
            }
            opcodes = [];
        }
    });

    return opcodeMap;
}

function generateOpcodes(): void {
    const opcodesDir = path.join(__dirname, "..");
    const base = parseOpcodes(opcodesDir, "base");
    const text = "export default " + JSON.stringify(base, null, 2) + ";";
    fs.writeFileSync("src/Opcodes.ts", text);
}

generateOpcodes();
