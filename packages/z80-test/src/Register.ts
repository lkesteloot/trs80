
/**
 * All the various Z80 registers.
 */
export enum Register {
    AF, BC, DE, HL,
    AF_PRIME, BC_PRIME, DE_PRIME, HL_PRIME,
    IX, IY, SP, PC, MEMPTR,
    I, R, IFF1, IFF2, IM,
}

/**
 * List of all registers, for enumeration.
 */
export const allRegisters = [
    Register.AF,
    Register.BC,
    Register.DE,
    Register.HL,
    Register.AF_PRIME,
    Register.BC_PRIME,
    Register.DE_PRIME,
    Register.HL_PRIME,
    Register.IX,
    Register.IY,
    Register.SP,
    Register.PC,
    Register.MEMPTR,
    Register.I,
    Register.R,
    Register.IFF1,
    Register.IFF2,
    Register.IM,
];

/**
 * The flag bits in the F register.
 */
export enum Flag {
    /**
     * Carry and borrow. Indicates that the addition or subtraction did not
     * fit in the register.
     */
    C = 0x01,
    /**
     * Set if the last operation was a subtraction.
     */
    N = 0x02,
    /**
     * Parity: Indicates that the result has an even number of bits set.
     */
    P = 0x04,
    /**
     * Overflow: Indicates that two's complement does not fit in register.
     */
    V = P,
    /**
     * Undocumented bit, but internal state can leak into it.
     */
    X3 = 0x08,
    /**
     * Half carry: Carry from bit 3 to bit 4 during BCD operations.
     */
    H = 0x10,
    /**
     * Undocumented bit, but internal state can leak into it.
     */
    X5 = 0x20,
    /**
     * Set if value is zero.
     */
    Z = 0x40,
    /**
     * Set of value is negative.
     */
    S = 0x80,
}

/**
 * List of all word registers.
 */
const WORD_REG = new Set(["af", "bc", "de", "hl", "af'", "bc'", "de'", "hl'", "ix", "iy", "sp", "pc"]);
/**
 * List of all byte registers.
 */
const BYTE_REG = new Set(["a", "f", "b", "c", "d", "e", "h", "l", "ixh", "ixl", "iyh", "iyl"]);

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
