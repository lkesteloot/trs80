
// Each opcode template can be a literal byte value or a variable like "nn".
export type OpcodeTemplateOperand = "nn" | "nnnn" | "dd" | "offset";
export type OpcodeTemplate = number | OpcodeTemplateOperand;

// Information from clr.
export interface ClrInstruction {
    opcodes: string;
    undocumented: boolean;
    flags: string;
    byte_count: number;
    with_jump_clock_count: number;
    without_jump_clock_count: number;
    description: string;
    instruction: string;
}

// A particular variant of a mnemonic, such as "ld a,(hl)".
export interface Variant {
    // The sequence of tokens, not including the mnemonic, such as ["a", ",", "(", "hl", ")"].
    tokens: string[];

    // The sequence of literal byte values or templates (like "nn").
    opcode: OpcodeTemplate[];

    // Optional clr information. TODO: Make not optional.
    clr: ClrInstruction | null;
}

// All information about a particular mnemonic, lke "ld".
export interface MnemonicInfo {
    // The variants of this mnemonic.
    variants: Variant[];
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
