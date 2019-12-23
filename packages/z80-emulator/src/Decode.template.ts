import {Z80} from "../src/Z80";
import {toHex, inc8, inc16, word, hi, lo} from "z80-test/dist";

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