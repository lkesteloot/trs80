import {Z80} from "./Z80";
import {toHex, inc8, inc16, dec8, dec16, add8, add16, sub8, sub16, word, hi, lo, Flag, signedByte} from "z80-base";

// Tables for computing flags after an operation.
const halfCarryAddTable = [0, Flag.H, Flag.H, Flag.H, 0, 0, 0, Flag.H];
const halfCarrySubTable = [0, 0, Flag.H, 0, Flag.H, 0, Flag.H, Flag.H];
const overflowAddTable = [0, 0, 0, Flag.V, Flag.V, 0, 0, 0];
const overflowSubTable = [0, Flag.V, 0, 0, 0, 0, Flag.V, 0];

let fillMap: Map<number, (z80: Z80) => void>;
const decodeMap = new Map<number, (z80: Z80) => void>();
fillMap = decodeMap;
// DECODE_BASE

const decodeMapCB = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapCB;
// DECODE_CB

const decodeMapDD = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapDD;
// DECODE_DD

const decodeMapDDCB = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapDDCB;
// DECODE_DDCB

const decodeMapED = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapED;
// DECODE_ED

const decodeMapFD = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapFD;
// DECODE_FD

const decodeMapFDCB = new Map<number, (z80: Z80) => void>();
fillMap = decodeMapFDCB;
// DECODE_FDCB

/**
 * Fetch an instruction for decode.
 */
function fetchInstruction(z80: Z80): number {
    z80.incTStateCount(4);
    const inst = z80.readByteInternal(z80.regs.pc);
    z80.regs.pc = (z80.regs.pc + 1) & 0xFFFF;
    z80.regs.r = (z80.regs.r + 1) & 0xFF;

    return inst;
}

/**
 * Decode the "CB" prefix (bit instructions).
 */
function decodeCB(z80: Z80): void {
    const inst = fetchInstruction(z80);
    const func = decodeMapCB.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in CB: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the "DD" prefix (IX instructions).
 */
function decodeDD(z80: Z80): void {
    const inst = fetchInstruction(z80);
    const func = decodeMapDD.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in DD: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the "DDCB" prefix (IX bit instructions).
 */
function decodeDDCB(z80: Z80): void {
    z80.incTStateCount(3);
    const offset = z80.readByteInternal(z80.regs.pc);
    z80.regs.memptr = add16(z80.regs.ix, signedByte(offset));
    z80.regs.pc = inc16(z80.regs.pc);
    z80.incTStateCount(3);
    const inst = z80.readByteInternal(z80.regs.pc);
    z80.incTStateCount(2);
    z80.regs.pc = inc16(z80.regs.pc);

    const func = decodeMapDDCB.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in DDCB: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the "ED" prefix (extended instructions).
 */
function decodeED(z80: Z80): void {
    const inst = fetchInstruction(z80);
    const func = decodeMapED.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in ED: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the "FD" prefix (IY instructions).
 */
function decodeFD(z80: Z80): void {
    const inst = fetchInstruction(z80);
    const func = decodeMapFD.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in FD: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the "FDCB" prefix (IY bit instructions).
 */
function decodeFDCB(z80: Z80): void {
    z80.incTStateCount(3);
    const offset = z80.readByteInternal(z80.regs.pc);
    z80.regs.memptr = add16(z80.regs.iy, signedByte(offset));
    z80.regs.pc = inc16(z80.regs.pc);
    z80.incTStateCount(3);
    const inst = z80.readByteInternal(z80.regs.pc);
    z80.incTStateCount(2);
    z80.regs.pc = inc16(z80.regs.pc);

    const func = decodeMapFDCB.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode in FDCB: " + toHex(inst, 2));
    } else {
        func(z80);
    }
}

/**
 * Decode the base (un-prefixed) instructions.
 */
export function decode(z80: Z80): void {
    const inst = fetchInstruction(z80);
    const func = decodeMap.get(inst);
    if (func === undefined) {
        console.log("Unhandled opcode " + toHex(inst, 2));
    } else {
        func(z80);
    }
}
