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

// Break args into sequences of letters, digits, or single punctuation.
const TOKENIZING_REGEXP = /([a-z]+)|([,+()])|([0-9]+)|(;.*)/g;

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

function parseOpcodes(dirname: string, prefix: string, opcodes: (number | string)[], mnemonicMap: any): void {
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

        const fullOpcodes = opcodes.concat([opcode]);

        if (mnemonic === undefined) {
            // Fallthrough to next line. These are for different opcodes that map to the
            // same instruction. Just use the last one, any will do.
        } else {
            if (mnemonic === "shift") {
                // Recurse for shifted instructions.
                if (params === undefined) {
                    throw new Error("Shift must have params");
                }
                parseOpcodes(dirname, params, fullOpcodes, mnemonicMap);
            } else {
                // Add parameters.
                for (const token of tokens) {
                    if (token === "nn" || token === "nnnn" || token === "dd" || token === "offset") {
                        fullOpcodes.push(token);
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
                let variant = {
                    tokens: tokens,
                    opcode: fullOpcodes,
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
    const opcodesDir = path.join(__dirname, "..");
    const mnemonics = {
        // To be filled in later.
    };
    const top = {
        mnemonics: mnemonics,
    };
    parseOpcodes(opcodesDir, "base", [], top.mnemonics);
    fs.writeFileSync("src/assembler/Opcodes.ts",
                     "export default " + JSON.stringify(top, null, 2) + ";");
}

generateOpcodes();
