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

function parseOpcodes(dirname: string, prefix: string, opcodes: number[], mnemonicMap: any): any {
    const pathname = path.join(dirname, "opcodes_" + prefix.toLowerCase() + ".dat");
    const opcodeMap: any = {};

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

        let value: any;

        if (mnemonic === undefined) {
            // Fallthrough to next line.
        } else {
            if (mnemonic === "shift") {
                opcodes.push(opcode);
                if (params === undefined) {
                    throw new Error("Shift must have params");
                }
                value = {
                    shift: parseOpcodes(dirname, params, opcodes, mnemonicMap),
                }
                opcodes.pop();
            } else {
                value = {
                    mnemonic: mnemonic,
                    params: params,
                    extra: extra,
                }
            }

            opcodeMap[opcode.toString(16)] = value;

            let mnemonicInfo = mnemonicMap[mnemonic] as any;
            if (mnemonicInfo === undefined) {
                mnemonicInfo = {
                    variants: [],
                };
                mnemonicMap[mnemonic] = mnemonicInfo;
            }
            const variant = {
                tokens: tokens,
                opcode: opcodes.concat([opcode]),
            };
            mnemonicInfo.variants.push(variant);
        }
    });

    return opcodeMap;
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
    fs.writeFileSync("src/Opcodes.json", JSON.stringify(top, null, 2));
}

generateOpcodes();
