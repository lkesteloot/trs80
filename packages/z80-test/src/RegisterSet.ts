import {Register} from "./Register";

/**
 * Set of register values.
 */
export type RegisterSet = {
    [register in Register]: number;
};

export function makeEmptyRegisterSet(): RegisterSet {
    return {
        [Register.AF]: 0,
        [Register.BC]: 0,
        [Register.DE]: 0,
        [Register.HL]: 0,
        [Register.AF_PRIME]: 0,
        [Register.BC_PRIME]: 0,
        [Register.DE_PRIME]: 0,
        [Register.HL_PRIME]: 0,
        [Register.IX]: 0,
        [Register.IY]: 0,
        [Register.SP]: 0,
        [Register.PC]: 0,
        [Register.MEMPTR]: 0,
        [Register.I]: 0,
        [Register.R]: 0,
        [Register.IFF1]: 0,
        [Register.IFF2]: 0,
        [Register.IM]: 0,
    };
}
