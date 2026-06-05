// This program generates the Opcodes.ts source file that contains
// all variants of Z80 instructions and indexes from mnemonics and opcodes.

import * as path from "path";
import {dirname} from "path";
import * as fs from "fs";
import {toHexByte} from "z80-base";
import {
    ClrInstruction,
    isOpcodeTemplateOperand, MnemonicInfo,
    Mnemonics,
    OpcodeTemplate,
    OpcodeVariant,
    opcodeVariantToString
} from "../src/OpcodesTypes.js";
import {isDataThirdByte} from "../src/Utils.js";
import {fileURLToPath} from "url";

// Break args into sequences of letters, digits, or single punctuation.
const TOKENIZING_REGEXP = /([a-z]+)'?|([,+()])|([0-9]+)|(;.*)/g;

// Opcodes field of temporary empty Clr until we have a chance to fix it up.
const EMPTY_CLR_OPCODES = "empty";

// Mnemonics that need special handling.
const MNEMONICS_REMOVE_A = new Set(["add", "adc", "sbc"]);
const MNEMONICS_ADD_A = new Set(["sub", "cp", "and", "xor", "or"]);
const MNEMONICS_OPTIONAL_PARENS = new Set(["jp", "in", "out"]);

interface ClrFile {
    instructions: ClrInstruction[];
}

// Break a string into a list of tokens.
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

// Capitalize register names.
function fixClrDescription(desc: string): string {
    return desc
        .replace(/\bpc\b/gi, "PC")
        .replace(/\bsp\b/gi, "SP")
        .replace(/\bhl\b/gi, "HL")
        .replace(/\bbc\b/gi, "BC")
        .replace(/\bde\b/gi, "DE")
        .replace(/\baf\b/gi, "AF")
        .replace(/\ba\b/gi, "A")
        .replace(/\bb\b/gi, "B")
        .replace(/\bc\b/gi, "C")
        .replace(/\bd\b/gi, "D")
        .replace(/\be\b/gi, "E")
        .replace(/\bix\b/gi, "IX")
        .replace(/\biy\b/gi, "IY")
        .replace(/\bixl\b/gi, "IXL")
        .replace(/\biyl\b/gi, "IYL")
        .replace(/\bixh\b/gi, "IXH")
        .replace(/\biyh\b/gi, "IYH")
        .replace(/\bz\b/gi, "Z")
        .replace(/\bF\b/gi, "F")
        .replace(/\bh\b/gi, "H")
        .replace(/\bl\b/gi, "L")
        .replace(/\bcc\b/gi, "CC")

        // Fix mistakes from the "a" conversion above.
        .replace(/\bA byte\b/g, "a byte")
        .replace(/\bA zero\b/g, "a zero")
        .replace(/\bA one\b/g, "a one")
        .replace(/\bA non-maskable\b/g, "a non-maskable");
}

// Returns the array with the parts before the command after the comma swapped.
function reversedAtComma(parts: string[]): string[] {
    const i = parts.indexOf(",");
    if (i === -1) {
        throw new Error("reversedAtComma([" + parts + "]) does not contain a comma");
    }

    return [... parts.slice(i + 1), ",", ... parts.slice(0, i)];
}

// Remove parts that are only a parenthesis. From other parts, remove the parenthesis characters.
function stripParentheses(parts: string[]): string[] {
    return parts.flatMap(part => {
        if (part === "(" || part === ")") {
            return [];
        } else if (part.startsWith("(") && part.endsWith(")")) {
            return [part.substring(1, part.length - 1)];
        } else {
            return part;
        }
    });
}

/**
 * Generate the mnemonic info from the clr info.
 */
function parseClr(clr: ClrFile, mnemonicMap: Mnemonics) {
    for (const clrInstruction of clr.instructions) {
        const parts = clrInstruction.instruction.split(" ");
        if (parts.length > 2) {
            throw new Error("Too many parts: " + parts);
        }
        const mnemonic = parts[0];
        const params = parts.length === 1 ? [] : parts[1].split(",");
        const tokens = parts.length === 1 ? [] : tokenize(parts[1]);

        // Construct array of opcodes.
        const opcodes: OpcodeTemplate[] = [];
        let opcodeString = clrInstruction.opcodes;
        for (let i = 0; i < opcodeString.length; i += 2) {
            opcodes.push(parseInt(opcodeString.substring(i, i + 2), 16));
        }

        // Add parameters.
        for (let token of tokens) {
            if (isOpcodeTemplateOperand(token)) {
                // For DDCB and FDCB instructions, the parameter is in the third position, not at the end.
                if (opcodes.length === 3 &&
                    typeof (opcodes[0]) === "number" &&
                    typeof (opcodes[1]) === "number" &&
                    isDataThirdByte(opcodes[0], opcodes[1])) {

                    opcodes.splice(2, 0, token);
                } else {
                    opcodes.push(token);
                }
            }
        }

        // Find mnemonic in map, adding if necessary.
        let mnemonicInfo = mnemonicMap[mnemonic] as (MnemonicInfo | undefined);
        if (mnemonicInfo === undefined) {
            mnemonicInfo = {
                variants: [],
            };
            mnemonicMap[mnemonic] = mnemonicInfo;
        }

        // Generate this variant.
        let variant: OpcodeVariant = {
            mnemonic: mnemonic,
            params: params,
            tokens: tokens,
            opcodes: opcodes,
            isPseudo: false,
            aliasOf: undefined,
            clr: clrInstruction,
        };
        mnemonicInfo.variants.push(variant);

        // Alternative syntaxes. https://48k.ca/zmac.html#zsyn
        if (MNEMONICS_REMOVE_A.has(mnemonic) && tokens.length > 2 && tokens[0] === "a" && tokens[1] === ",") {
            // Add variant without the "a" parameter.
            mnemonicInfo.variants.push({
                ...variant,
                params: params.slice(1),
                tokens: tokens.slice(2),
                isPseudo: true,
            });
        } else if (MNEMONICS_ADD_A.has(mnemonic)) {
            // Add variant with the "a" parameter.
            mnemonicInfo.variants.push({
                ...variant,
                params: ["a"].concat(params),
                tokens: ["a", ","].concat(tokens),
                isPseudo: true,
            });
        } else if ((mnemonic === "in" || mnemonic === "out") && params.indexOf("(c)") >= 0) {
            // BC is the full 16-bit port, so support that.
            mnemonicInfo.variants.push({
                ...variant,
                params: params.map(param => param === "(c)" ? "(bc)" : param),
                tokens: tokens.map(token => token === "c" ? "bc" : token),
                isPseudo: true,
            });
        } else if (MNEMONICS_OPTIONAL_PARENS.has(mnemonic) && tokens.indexOf("(") >= 0) {
            // Make the parentheses optional.
            mnemonicInfo.variants.push({
                ...variant,
                params: stripParentheses(params),
                tokens: stripParentheses(tokens),
                isPseudo: true,
            });
        } else if (mnemonic === "ex") {
            // Allow parameter in reverse order.
            mnemonicInfo.variants.push({
                ...variant,
                params: [params[1], params[0]],
                tokens: reversedAtComma(tokens),
                isPseudo: true,
            });
        }

        // The flags po and pe can also be written nv and v respectively.
        if (variant.params.length > 0 && variant.params[0] == "po") {
            mnemonicInfo.variants.push({
                ...variant,
                params: ["nv", ...variant.params.slice(1)],
                tokens: ["nv", ...variant.tokens.slice(1)],
                isPseudo: true,
            });
        }
        if (variant.params.length > 0 && variant.params[0] == "pe") {
            mnemonicInfo.variants.push({
                ...variant,
                params: ["v", ...variant.params.slice(1)],
                tokens: ["v", ...variant.tokens.slice(1)],
                isPseudo: true,
            });
        }
    }
}

/**
 * Add fake convenience instructions.
 *
 * https://k1.spdns.de/Develop/Projects/zasm/Documentation/z79.htm#G
 */
function addPseudoInstructions(mnemonics: Mnemonics) {
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["hl", "bc"],
        tokens: ["hl", ",", "bc"],
        opcodes: [0x60, 0x69],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "6069",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 2,
            with_jump_clock_count: 8,
            without_jump_clock_count: 8,
            description: "The contents of BC are loaded into HL.",
            instruction: "ld hl,bc",
        },
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["bc", "hl"],
        tokens: ["bc", ",", "hl"],
        opcodes: [0x44, 0x4D],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "444D",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 2,
            with_jump_clock_count: 8,
            without_jump_clock_count: 8,
            description: "The contents of HL are loaded into BC.",
            instruction: "ld bc,hl",
        },
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["de", "hl"],
        tokens: ["de", ",", "hl"],
        opcodes: [0x54, 0x5D],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "545D",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 2,
            with_jump_clock_count: 8,
            without_jump_clock_count: 8,
            description: "The contents of HL are loaded into DE.",
            instruction: "ld de,hl",
        },
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["hl", "de"],
        tokens: ["hl", ",", "de"],
        opcodes: [0x62, 0x6B],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "626B",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 2,
            with_jump_clock_count: 8,
            without_jump_clock_count: 8,
            description: "The contents of DE are loaded into HL.",
            instruction: "ld hl,de",
        },
    });
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["bc", "(hl)"],
        tokens: ["bc", ",", "(", "hl", ")"],
        opcodes: [0x4E, 0x23, 0x46, 0x2B],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "4E23462B",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 4,
            with_jump_clock_count: 26,
            without_jump_clock_count: 26,
            description: "The contents of (HL) are loaded into BC.",
            instruction: "ld bc,(hl)",
        },
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["(hl)", "bc"],
        tokens: ["(", "hl", ")", ",", "bc"],
        opcodes: [0x71, 0x23, 0x70, 0x2B],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "7123702B",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 4,
            with_jump_clock_count: 26,
            without_jump_clock_count: 26,
            description: "The contents of BC are loaded into (HL).",
            instruction: "ld (hl),bc",
        },
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["(hl)", "de"],
        tokens: ["(", "hl", ")", ",", "de"],
        opcodes: [0x73, 0x23, 0x72, 0x2B],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "7323722B",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 4,
            with_jump_clock_count: 26,
            without_jump_clock_count: 26,
            description: "The contents of DE are loaded into (HL).",
            instruction: "ld (hl),de",
        },
    })
    mnemonics["ld"].variants.push({
        mnemonic: "ld",
        params: ["de", "bc"],
        tokens: ["de", ",", "bc"],
        opcodes: [0x50, 0x59],
        isPseudo: true,
        aliasOf: undefined,
        clr: {
            opcodes: "5059",
            undocumented: true,
            z180: false,
            flags: "------",
            byte_count: 2,
            with_jump_clock_count: 8,
            without_jump_clock_count: 8,
            description: "The contents of BC are loaded into DE.",
            instruction: "ld de,bc",
        },
    })
}

/**
 * Find variants that have the same sequence of tokens but different opcodes,
 * pick one as the definitive one, and point the others as aliases.
 */
function detectAliases(mnemonics: Mnemonics) {
    const tokensToVariants = new Map<string,OpcodeVariant[]>();

    // Bin by token sequence.
    for (const mnemonic in mnemonics) {
        for (const variant of mnemonics[mnemonic].variants) {
            const key = opcodeVariantToString(variant);
            let tokenVariants = tokensToVariants.get(key);
            if (tokenVariants === undefined) {
                tokenVariants = [];
                tokensToVariants.set(key, tokenVariants);
            }
            tokenVariants.push(variant);
        }
    }

    /**
     * Whether the new variant is a better reference alias than the old one.
     */
    function isBetter(newOne: OpcodeVariant, oldOne: OpcodeVariant): boolean {
        // Prefer the new one if it's documented and old is not.
        if (newOne.clr !== undefined && oldOne.clr !== undefined &&
            newOne.clr.undocumented !== oldOne.clr.undocumented) {

            return !newOne.clr.undocumented;
        }

        // Prefer shorter.
        if (newOne.opcodes.length !== oldOne.opcodes.length) {
            return newOne.opcodes.length < oldOne.opcodes.length;
        }

        // Prefer lower (arbitrary, but for stability).
        for (let i = 0; i < newOne.opcodes.length; i++) {
            if (newOne.opcodes[i] !== oldOne.opcodes[i]) {
                return newOne.opcodes[i] < oldOne.opcodes[i];
            }
        }

        throw new Error("aliases have the same opcodes: " + opcodeVariantToString(newOne));
    }

    // Find the tokens that have multiple variants.
    for (const variants of tokensToVariants.values()) {
        if (variants.length > 1) {
            // Find the best variant.
            let chosenVariant: OpcodeVariant | undefined = undefined;
            for (const variant of variants) {
                if (chosenVariant === undefined || isBetter(variant, chosenVariant)) {
                    chosenVariant = variant;
                }
            }
            if (chosenVariant === undefined) {
                // Internal error.
                throw new Error("did not find chosen variant");
            }
            for (const variant of variants) {
                variant.aliasOf = variant === chosenVariant ? undefined : chosenVariant;

                if (variant.clr.opcodes === EMPTY_CLR_OPCODES) {
                    if (variant === chosenVariant) {
                        // Internal error.
                        throw new Error("chosen variant has no clr");
                    }

                    // Replace the Clr with one based on the chosen variant.
                    variant.clr = {
                        ...chosenVariant.clr,
                        opcodes: variant.opcodes
                            .map(v => typeof v === "number" ? toHexByte(v) : "")
                            .join(""),
                        undocumented: true,
                        // We assume here that byte count etc are the same, which isn't logically
                        // required but happens to be true because these are all 0xED aliases of each other.
                    };
                }
            }
        }
    }
}

/**
 * Make sure that no empty Clr instructions made it through.
 */
function checkEmptyClr(mnemonics: Mnemonics) {
    for (const mnemonic in mnemonics) {
        for (const variant of mnemonics[mnemonic].variants) {
            if (variant.clr.opcodes === EMPTY_CLR_OPCODES) {
                console.log("Error: Variant " + variant.opcodes + " has an empty Clr.");
            }
        }
    }
}

function makeVariantVariableName(variant: OpcodeVariant): string {
    return "variant_" + variant.opcodes.map(v => typeof(v) === "number" ? toHexByte(v) : v).join("_") +
        (variant.isPseudo ? "_pseudo" : "");
}

type CodeOpcodeMap = Map<number, OpcodeVariant | CodeOpcodeMap>;
function outputOpcodeMap(opcodeMapCode: string[], map: CodeOpcodeMap, indent: number): void {
    const indentString = "  ".repeat(indent + 1);
    const keys = Array.from(map.keys()).sort((a, b) => a - b);
    for (const key of keys) {
        const value = map.get(key);
        if (value === undefined) {
            throw new Error("Can't happen");
        }
        if (value instanceof Map) {
            opcodeMapCode.push(indentString + "[ 0x" + toHexByte(key) + ", new Map<number,OpcodeVariant | OpcodeMap>([");
            outputOpcodeMap(opcodeMapCode, value, indent + 1);
            opcodeMapCode.push(indentString + "])],");
        } else {
            const variableName = makeVariantVariableName(value);
            const label = opcodeVariantToString(value);
            opcodeMapCode.push(indentString + "[ 0x" + toHexByte(key) + ", " +  variableName + " ], // " + label +
                (value.aliasOf !== undefined ? " (alias of " + makeVariantVariableName(value.aliasOf) + ")" : ""));
        }
    }
}

/**
 * Put the name of the variant for the alias instead of a reference to the alias itself.
 * This would normally write it as a string, but after generating the JSON we strip
 * out the quotes so that it's a reference to the actual variable.
 */
function jsonReplacer(key: string, value: any): any {
    if (key === "aliasOf" && value !== undefined) {
        // We strip out the quotes later after we convert to JSON.
        return makeVariantVariableName(value);
    }

    return value;
}

/**
 * Remove the quotes around the aliasOf variant names in the generated JSON so that
 * they become references to the actual variables.
 */
function removeAliasQuotes(s: string): string {
    return s.replace(/"aliasOf": "([^"]+)"/g, '"aliasOf": $1');
}

/**
 * Generate the three chunks of code (as lines of text):
 *
 * variantCode: all the variants, as global (unexported) variables.
 * mnemonicMapCode: map from mnemonic (like "ld") to an array of all "ld" variants.
 * opcodeMapCode: map from opcode (like 0x55) to either a variant or a sub-map.
 */
function generateCode(mnemonics: Mnemonics): {variantCode: string[], mnemonicMapCode: string[], opcodeMapCode: string[]} {
    const variantCode: string[] = [];
    const mnemonicMapCode: string[] = [];
    const opcodeMapCode: string[] = [];

    mnemonicMapCode.push("// Map from mnemonic to array of variants.");
    mnemonicMapCode.push("export const mnemonicMap = new Map<string,OpcodeVariant[]>([");

    const mapEntries: CodeOpcodeMap = new Map<number, OpcodeVariant | CodeOpcodeMap>();
    const allVariants: OpcodeVariant[] = [];

    for (const mnemonic of Object.keys(mnemonics).sort()) {
        const mnemonicInfo = mnemonics[mnemonic];
        const variants = mnemonicInfo.variants;

        mnemonicMapCode.push("  [");
        mnemonicMapCode.push("    \"" + mnemonic + "\",");
        mnemonicMapCode.push("    [");

        const variantsSublist: string[] = [];

        for (const variant of variants) {
            const variableName = makeVariantVariableName(variant);
            const label = opcodeVariantToString(variant);

            allVariants.push(variant);

            if (variant.aliasOf === undefined) {
                variantsSublist.push("      " + variableName + ", // " + label);
            }

            if (!variant.isPseudo) {
                let map = mapEntries;
                const opcodes = variant.opcodes.filter(v => typeof(v) === "number") as number[];
                if (opcodes.length === 0) {
                    throw new Error("No opcodes found for variant");
                }

                for (let i = 0; i < opcodes.length - 1; i++) {
                    const byte = opcodes[i];
                    let submap = map.get(byte);
                    if (submap === undefined) {
                        submap = new Map<number, OpcodeVariant | CodeOpcodeMap>();
                        map.set(byte, submap);
                    } else if (!(submap instanceof Map)) {
                        throw new Error("Map entry is both variant and submap");
                    }
                    map = submap;
                }
                const byte = opcodes[opcodes.length - 1];
                map.set(byte, variant);
            }
        }

        mnemonicMapCode.push(... variantsSublist.sort());
        mnemonicMapCode.push("    ],");
        mnemonicMapCode.push("  ],");
    }

    mnemonicMapCode.push("]);");

    // Sort variants with aliases last since they refer to the documented version, which must come first.
    allVariants.sort((a, b) => {
        // Aliases last.
        if ((a.aliasOf === undefined) !== (b.aliasOf === undefined)) {
            return a.aliasOf === undefined ? -1 : 1;
        }

        // Opcodes.
        const aOpcodes = makeVariantVariableName(a);
        const bOpcodes = makeVariantVariableName(b);
        if (aOpcodes < bOpcodes) {
            return -1;
        }
        if (aOpcodes > bOpcodes) {
            return 1;
        }
        return 0;
    });
    for (const variant of allVariants) {
        variantCode.push("");
        variantCode.push("// " + opcodeVariantToString(variant));
        variantCode.push("const " + makeVariantVariableName(variant) + " = " +
            removeAliasQuotes(JSON.stringify(variant, jsonReplacer, 2)) +
            " as const satisfies OpcodeVariant;");
    }

    // Opcode map in different pass.
    opcodeMapCode.push("// Map from opcode to variant or sub-map.");
    opcodeMapCode.push("export const opcodeMap = new Map<number,OpcodeVariant | OpcodeMap>([");
    outputOpcodeMap(opcodeMapCode, mapEntries, 0);
    opcodeMapCode.push("]);");

    return {variantCode, mnemonicMapCode, opcodeMapCode};
}

/**
 * Generate the Opcodes.ts file.
 */
function generateOpcodes(): void {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const opcodesDir = path.join(scriptDir, "..", "..");
    const clr = JSON.parse(fs.readFileSync(path.join(opcodesDir, "clr.json"), "utf-8")) as ClrFile;

    // Read the opcodes text files and generate all variants.
    const mnemonics: Mnemonics = {
        // To be filled in later.
    };
    parseClr(clr, mnemonics);
    addPseudoInstructions(mnemonics);
    detectAliases(mnemonics);
    checkEmptyClr(mnemonics);

    // Generate variables and indexes.
    const { variantCode, mnemonicMapCode, opcodeMapCode } = generateCode(mnemonics);
    const text = [
        '// Generated by GenerateCode.ts. Do not modify.',
        '',
        'import {OpcodeMap, OpcodeVariant} from "./OpcodesTypes.js";',
        ... variantCode,
        '',
        ... mnemonicMapCode,
        '',
        ... opcodeMapCode,
        '',
    ];

    fs.writeFileSync("src/Opcodes.ts", text.join("\n"));
}

generateOpcodes();
