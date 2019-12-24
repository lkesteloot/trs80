import {RegisterSet} from "z80-test";
import {hi, lo, word, inc16} from "z80-test";
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

    public readByte(address: number): number {
        this.tStateCount += 3;
        return this.readByteInternal(address);
    }

    public readByteInternal(address: number): number {
        return this.ram[address];
    }

    public writeByte(address: number, value: number): void {
        this.tStateCount += 3;
        this.writeByteInternal(address, value);
    }

    public writeByteInternal(address: number, value: number): void {
        this.ram[address] = value;
    }

    public pushWord(value: number): void {
        this.pushByte(hi(value));
        this.pushByte(lo(value));
    }

    public pushByte(value: number): void {
        this.regs.sp = (this.regs.sp - 1) & 0xFFFF;
        this.writeByte(this.regs.sp, value);
    }

    public popWord(): number {
        const lo = this.popByte();
        const hi = this.popByte();
        return word(hi, lo);
    }

    public popByte(): number {
        const value = this.readByte(this.regs.sp);
        this.regs.sp = inc16(this.regs.sp);
        return value;
    }
}