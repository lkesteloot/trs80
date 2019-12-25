import {Z80} from "./Z80";
import {toHex, inc8, inc16, dec8, dec16, add8, add16, sub8, sub16, word, hi, lo, Flag, signedByte} from "z80-test/dist";

const halfCarryAddTable = [0, Flag.H, Flag.H, Flag.H, 0, 0, 0, Flag.H];
const halfCarrySubTable = [0, 0, Flag.H, 0, Flag.H, 0, Flag.H, Flag.H];
const overflowAddTable = [0, 0, 0, Flag.V, Flag.V, 0, 0, 0];
const overflowSubTable = [0, Flag.V, 0, 0, 0, 0, Flag.V, 0];

function fetchInstruction(z80: Z80): number {
    z80.incTStateCount(4);
    const inst = z80.readByteInternal(z80.regs.pc);
    z80.regs.pc = (z80.regs.pc + 1) & 0xFFFF;
    z80.regs.r = (z80.regs.r + 1) & 0xFF;

    return inst;
}

function decodeCB(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_CB

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

function decodeDD(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_DD

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

function decodeDDCB(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_DDCB

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

function decodeED(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_ED

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

function decodeFD(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_FD

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

function decodeFDCB(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_FDCB

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}

export function decode(z80: Z80): void {
    const inst = fetchInstruction(z80);

    switch (inst) {
        // DECODE_BASE

        default:
            console.log("Unhandled opcode " + toHex(inst, 2));
            break;

    }
}
