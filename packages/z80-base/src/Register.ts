
/**
 * Type for all byte registers.
 */
export type ByteReg = "a" | "f" | "b" | "c" | "d" | "e" | "h" | "l" | "ixh" | "ixl" | "iyh" | "iyl" | "i" | "r";

/**
 * Type for all word registers. Uses the "Prime" suffix instead of an apostrophe so that
 * this can be used as a field name for the RegisterSet class.
 */
export type WordReg = "af" | "bc" | "de" | "hl" | "afPrime" | "bcPrime" | "dePrime" | "hlPrime" | "ix" | "iy" | "sp" | "pc";

/**
 * Internal state.
 */
export type InternalReg = "memptr" | "i" | "r" | "iff1" | "iff2" | "im" | "halted";

/**
 * All registers.
 */
export type Register = ByteReg | WordReg | InternalReg;

/**
 * List of all word registers.
 */
const WORD_REG = new Set(["af", "bc", "de", "hl", "af'", "bc'", "de'", "hl'", "ix", "iy", "sp", "pc"]);

/**
 * List of all byte registers.
 */
const BYTE_REG = new Set(["a", "f", "b", "c", "d", "e", "h", "l", "ixh", "ixl", "iyh", "iyl", "i", "r"]);

/**
 * Determine whether a register stores a word.
 */
export function isWordReg(s: string): boolean {
    return WORD_REG.has(s.toLowerCase());
}

/**
 * Determine whether a register stores a byte.
 */
export function isByteReg(s: string): boolean {
    return BYTE_REG.has(s.toLowerCase());
}
