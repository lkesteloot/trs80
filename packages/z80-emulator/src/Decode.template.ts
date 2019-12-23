import {Z80} from "./Z80";
import {toHex, inc8, inc16, word, hi, lo, Flag} from "z80-test/dist";

const halfCarryAddTable = [0, Flag.H, Flag.H, Flag.H, 0, 0, 0, Flag.H];
const halfCarrySubTable = [0, 0, Flag.H, 0, Flag.H, 0, Flag.H, Flag.H];
const overflowAddTable = [0, 0, 0, Flag.V, Flag.V, 0, 0, 0];
const overflowSubTable = [0, Flag.V, 0, 0, 0, 0, Flag.V, 0];

export function decode(z80: Z80): void {
    z80.tStateCount += 4;
    const inst = z80.readByteInternal(z80.regs.pc);
    z80.regs.pc = (z80.regs.pc + 1) & 0xFFFF;
    z80.regs.r = (z80.regs.r + 1) & 0xFF;

    switch (inst) {
        // DECODE

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}
