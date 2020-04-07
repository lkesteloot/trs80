
// Each opcode template can be a literal byte value or a variable like "nn".
import opcodes from "./Opcodes";

export type OpcodeTemplate = number | "nnnn" | "nn" | "offset" | "dd";
export default opcodes;

// A particular variant of a mnemonic, such as "ld a,(hl)".
export interface Variant {
    // The sequence of tokens, not including the mnemonic, such as ["a", ",", "(", "hl", ")"].
    tokens: string[];

    // The sequence of literal byte values or templates (like "nn").
    opcode: OpcodeTemplate[];
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
