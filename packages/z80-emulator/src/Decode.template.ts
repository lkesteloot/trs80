import {Z80} from "../src/Z80";
import {toHex} from "z80-test/dist";

export function decode(z80: Z80): void {
    const inst = z80.fetch();
    z80.regs.r = (z80.regs.r + 1) & 0xFF;

    switch (inst) {
        // DECODE

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}