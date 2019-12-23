
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

const WORD_REG = new Set(["af", "bc", "de", "hl", "af'", "bc'", "de'", "hl'", "ix", "iy", "sp", "pc"]);

export function isWordReg(s: string): boolean {
    return WORD_REG.has(s.toLowerCase());
}
