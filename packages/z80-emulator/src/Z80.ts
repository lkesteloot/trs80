import {RegisterSet} from "z80-test";
import {hi, lo} from "z80-test";
import {decode} from "./Decode";

export class Z80 {
    public regs: RegisterSet = new RegisterSet();
    public tStateCount: number = 0;
    public ram: Uint8Array;

    constructor(ram: Uint8Array) {
        this.ram = ram;
    }

    public reset(): void {
        this.regs = new RegisterSet();
        this.tStateCount = 0;
    }

    public step(): void {
        decode(this);
    }

    public fetch(): number {
        this.tStateCount += 4;
        const value = this.ram[this.regs.pc];
        this.regs.pc += 1;
        return value;
    }

    public pushWord(value: number): void {
        this.pushByte(hi(value));
        this.pushByte(lo(value));
    }

    public pushByte(value: number): void {
        this.regs.sp = (this.regs.sp - 1) & 0xFFFF;
        this.writeByte(this.regs.sp, value);
    }

    public writeByte(address: number, value: number): void {
        this.tStateCount += 3;
        this.ram[address] = value;
    }
}