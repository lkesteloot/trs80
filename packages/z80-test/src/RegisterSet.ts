import {Register} from "./Register";

/**
 * Set of register values.
 */
export type RegisterSet = Map<Register,number>;

export function makeEmptyRegisterSet(): RegisterSet {
    const registerSet = new Map<Register, number>();

    registerSet.set(Register.AF, 0);
    registerSet.set(Register.BC, 0);
    registerSet.set(Register.DE, 0);
    registerSet.set(Register.HL, 0);
    registerSet.set(Register.AF_PRIME, 0);
    registerSet.set(Register.BC_PRIME, 0);
    registerSet.set(Register.DE_PRIME, 0);
    registerSet.set(Register.HL_PRIME, 0);
    registerSet.set(Register.IX, 0);
    registerSet.set(Register.IY, 0);
    registerSet.set(Register.SP, 0);
    registerSet.set(Register.PC, 0);
    registerSet.set(Register.MEMPTR, 0);
    registerSet.set(Register.I, 0);
    registerSet.set(Register.R, 0);
    registerSet.set(Register.IFF1, 0);
    registerSet.set(Register.IFF2, 0);
    registerSet.set(Register.IM, 0);

    return registerSet;
}
