
export enum Register {
    AF, BC, DE, HL,
    AF_PRIME, BC_PRIME, DE_PRIME, HL_PRIME,
    IX, IY, SP, PC, MEMPTR,
    I, R, IFF1, IFF2, IM,
}

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

export enum Flag {
    C = 0x01,
    N = 0x02,
    P = 0x04,
    V = P,
    X3 = 0x08,
    H = 0x10,
    X5 = 0x20,
    Z = 0x40,
    S = 0x80,
}

const WORD_REG = new Set(["af", "bc", "de", "hl", "af'", "bc'", "de'", "hl'", "ix", "iy", "sp", "pc"]);
const BYTE_REG = new Set(["a", "f", "b", "c", "d", "e", "h", "l", "ixh", "ixl", "iyh", "iyl"]);

export function isWordReg(s: string): boolean {
    return WORD_REG.has(s.toLowerCase());
}

export function isByteReg(s: string): boolean {
    return BYTE_REG.has(s.toLowerCase());
}
