
import {toHexByte} from "z80-base";

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

    // Other variant that we're an alias of, or undefined if we're the preferred
    // (or only) variant. For example, DD40 is an undocumented variant of 40,
    // and DDCBdd47 is an undocumented variant of DDCBdd46. We prefer variants
    // that are documented, have fewer opcodes, or have the numerically lowest
    // opcodes (in that order).
    aliasOf?: OpcodeVariant;

    // Clr information.
    clr: ClrInstruction;
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

/**
 * Given an opcode template, returns its hex or its string value.
 */
function opcodeTemplateToString(opcodeTemplate: OpcodeTemplate): string {
    return typeof opcodeTemplate === "number" ? toHexByte(opcodeTemplate) : opcodeTemplate;
}

/**
 * Generates a string for the opcode templates, suitable for debugging.
 */
export function opcodeVariantToOpcodeString(variant: OpcodeVariant): string {
    return variant.opcodes.map(opcodeTemplateToString).join(" ");
}
