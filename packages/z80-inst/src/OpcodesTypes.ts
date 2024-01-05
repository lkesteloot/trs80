
// Each opcode template can be a literal byte value or a variable like "nn".
export type OpcodeTemplateOperand = "nn" | "nnnn" | "dd" | "offset";
export type OpcodeTemplate = number | OpcodeTemplateOperand;

// Information from clr.
export interface ClrInstruction {
    opcodes: string;
    undocumented: boolean;
    z180: boolean;
    flags: string;
    byte_count: number;
    with_jump_clock_count: number;
    without_jump_clock_count: number;
    description: string;
    instruction: string;

    // Not in the file, we use this to keep track of which ones we've used so we
    // can flag the missing ones.
    used?: boolean;
}

// A particular variant of a mnemonic, such as "ld a,(hl)".
export interface OpcodeVariant {
    // Mnemonic of the instruction, like "ld".
    mnemonic: string;

    // Comma-separated parameters, such as ["a", "(hl)"].
    params: string[];

    // The sequence of tokens, not including the mnemonic, such as ["a", ",", "(", "hl", ")"].
    tokens: string[];

    // The sequence of literal byte values or templates (like "nn").
    opcodes: OpcodeTemplate[];

    // Pseudo instructions are either combination of other instructions
    // (like "ld hl,bc") or are synonyms (like "add c" for "add a,c").
    // In the latter case, both variants have the same opcodes but different tokens.
    isPseudo: boolean;

    // Whether this is an alias for another variant (whose "isAlias" field is undefined).
    // For example the sequence DDCBdd47 is the same instruction as DDCBdd40.
    // Both variants have the same tokens but different opcodes. The one whose
    // isAlias is undefined has the shortest number of opcodes, and if there's a tie,
    // the highest opcodes.
    aliasOf?: OpcodeVariant;

    // Optional clr information. TODO: Make not optional.
    clr?: ClrInstruction;
}

// Map from opcode to its variant, or to a submap.
export type OpcodeMap = Map<number,OpcodeVariant | OpcodeMap>;

// All information about a particular mnemonic, lke "ld".
export interface MnemonicInfo {
    // The variants of this mnemonic.
    variants: OpcodeVariant[];
}

// Information about all mnemonics.
export interface Mnemonics {
    // Map from mnemonic (like "ld") to information about all its variants.
    [mnemonic: string]: MnemonicInfo;
}

// All instructions.
export interface Instructions {
    mnemonics: Mnemonics;
}

/**
 * Type guard for the operand.
 */
export function isOpcodeTemplateOperand(operand: string): operand is OpcodeTemplateOperand {
    return operand === "nn" || operand === "nnnn" || operand === "dd" || operand === "offset";
}

/**
 * Make a string version of a variant, suitable to be assembled or shown ot the user.
 */
export function opcodeVariantToString(variant: OpcodeVariant): string {
    const parts: string[] = [variant.mnemonic, " "];

    let lastWasAlphanumeric = false;
    for (const token of variant.tokens) {
        const thisIsAlphanumeric = token !== "(" && token !== ")" && token !== "," && token !== "+";
        if (lastWasAlphanumeric && thisIsAlphanumeric) {
            parts.push(" ");
        }
        parts.push(token);
        lastWasAlphanumeric = thisIsAlphanumeric;
    }

    return parts.join("");
}
