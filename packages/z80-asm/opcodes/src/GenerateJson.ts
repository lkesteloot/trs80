// This program generates the Opcodes.json source file that contains
// the map from mnemonics to variants of those instructions.
//
//  Top-level JSON object:
//      "mnemonics": Object:
//          mnemonic: Object:    -- key is lower case, like "ld" or "nop".
//              "variants": Array of variants, each an object:
//                  "tokens": array of tokens, like ["a", ",", "nn"], all lower case.
//                  "opcode": array of opcodes for this instruction. Each opcode can be:
//                      A number literal, which is uses as-is as a byte.
//                      "nn", a one-byte literal, from the tokens
//                      "nnnn", a two-byte literal, to be written little endian, from the tokens.
//                      "dd", a one-byte literal, from the tokens.

import * as path from "path";
import * as fs from "fs";
import {toHexByte} from "z80-base";
import {Variant, OpcodeTemplate, ClrInstruction} from "../../src/assembler/OpcodesTypes";

// Break args into sequences of letters, digits, or single punctuation.
const TOKENIZING_REGEXP = /([a-z]+)|([,+()])|([0-9]+)|(;.*)/g;

interface ClrFile {
    instructions: ClrInstruction[];
}

function tokenize(s: string | undefined): string[] {
    if (s === undefined) {
        return [];
    }

    const tokens = [];

    let match;
    while ((match = TOKENIZING_REGEXP.exec(s)) !== null) {
        tokens.push(match[0]);
    }

    return tokens;
}

// Look through the Clr file and find the instruction with this sequence of opcodes.
function findClrInstruction(clr: ClrFile, opcodes: string): ClrInstruction | undefined {
    for (const instruction of clr.instructions) {
        // Remove parameters from clr, we don't insert them ourselves until after this check.
        if (opcodes === instruction.opcodes.replace(/\*+/, "")) {
            return instruction;
        }
    }

    return undefined;
}

function parseOpcodes(dirname: string, prefix: string, opcodes: OpcodeTemplate[], mnemonicMap: any, clr: ClrFile): void {
    const pathname = path.join(dirname, "opcodes_" + prefix.toLowerCase() + ".dat");

    fs.readFileSync(pathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
        line = line.trim();
        if (line.length === 0 || line.startsWith("#")) {
            // Comment or empty line.
            return;
        }

        // Parse line.
        const fields = line.split(/\s+/);
        const opcodeString = fields.length >= 1 ? fields[0] : undefined;
        const mnemonic = fields.length >= 2 ? fields[1].toLowerCase() : undefined;
        const params = fields.length >= 3 ? fields[2].toLowerCase() : undefined;
        const extra = fields.length >= 4 ? fields[3].toLowerCase() : undefined;
        if (fields.length > 4) {
            throw new Error("Invalid opcode line: " + line);
        }

        if (opcodeString === undefined || opcodeString.length == 0 || !opcodeString.startsWith("0x")) {
            throw new Error("Invalid opcode value: " + line);
        }

        const opcode = parseInt(opcodeString, 16);
        const tokens = tokenize(params).concat(tokenize(extra));

        // Special case: "RST 10" really means 10 hex, so convert it to decimal.
        if (mnemonic === "rst") {
            tokens[0] = parseInt(tokens[0], 16).toString(10);
        }

        const fullOpcodes: OpcodeTemplate[] = opcodes.concat([opcode]);

        if (mnemonic === undefined) {
            // Fallthrough to next line. These are for different opcodes that map to the
            // same instruction. Just use the last one, any will do.
        } else {
            if (mnemonic === "shift") {
                // Recurse for shifted instructions.
                if (params === undefined) {
                    throw new Error("Shift must have params");
                }
                parseOpcodes(dirname, params, fullOpcodes, mnemonicMap, clr);
            } else {
                const fullOpcodesString = fullOpcodes.map(value => typeof(value) === "number" ? toHexByte(value) : "**").join("");
                const clrInst = findClrInstruction(clr, fullOpcodesString);
                if (clrInst === undefined) {
                    console.log("Didn't find " + fullOpcodesString + " in clr");
                }

                // Add parameters.
                for (const token of tokens) {
                    if (token === "nn" || token === "nnnn" || token === "dd" || token === "offset") {
                        if (opcodes.length === 3 && (opcodes[0] === 0xDD || opcodes[0] === 0xFD) && opcodes[1] === 0xCB) {
                            fullOpcodes.splice(2, 0, token);
                        } else {
                            fullOpcodes.push(token);
                        }
                    }
                }

                // Find mnemonic in map, adding if necessary.
                let mnemonicInfo = mnemonicMap[mnemonic] as any;
                if (mnemonicInfo === undefined) {
                    mnemonicInfo = {
                        variants: [],
                    };
                    mnemonicMap[mnemonic] = mnemonicInfo;
                }

                // Generate this variant.
                let variant: Variant = {
                    tokens: tokens,
                    opcode: fullOpcodes,
                    clr: clrInst ?? null,
                };
                mnemonicInfo.variants.push(variant);

                // For instructions like "ADD A,C", also produce "ADD C" with an implicit "A".
                if (tokens.length > 2 && tokens[0] === "a" && tokens[1] === ",") {
                    variant = Object.assign({}, variant, {
                        tokens: tokens.slice(2),
                    });
                    mnemonicInfo.variants.push(variant);
                }
            }
        }
    });
}

function generateOpcodes(): void {
    const opcodesDir = path.join(__dirname, "..", "..", "..");
    const clr = JSON.parse(fs.readFileSync(path.join(opcodesDir, "clr.json"), "utf-8")) as ClrFile;

    const mnemonics = {
        // To be filled in later.
    };
    const top = {
        mnemonics: mnemonics,
    };
    parseOpcodes(opcodesDir, "base", [], top.mnemonics, clr);

    const text = 'import {Instructions} from "./OpcodesTypes";\n\n' +
        'const opcodes: Instructions = ' + JSON.stringify(top, null, 2, ) + ";\n\n" +
        'export default opcodes;\n';
    fs.writeFileSync("src/assembler/Opcodes.ts", text);
}

generateOpcodes();
