import {RegisterSet} from "z80-test";
import {hi, lo, word, inc16} from "z80-test";
import {decode} from "./Decode";
import {Flag} from "z80-test/dist";
import {Hal} from "./Hal";

export class Z80 {
    public regs: RegisterSet = new RegisterSet();
    public hal: Hal;
    public sz53Table: number[] = []; /* The S, Z, 5 and 3 bits of the index */
    public parityTable: number[] = []; /* The parity of the lookup value */
    public sz53pTable: number[] = []; /* OR the above two tables together */

    constructor(hal: Hal) {
        this.hal = hal;
        this.initTables();
    }

    private initTables(): void {
        for (let i = 0; i< 0x100; i++) {
            this.sz53Table.push(i & (Flag.X3 | Flag.X5 | Flag.S));
            let bits = i;
            let parity = 0;
            for (let bit = 0; bit < 8; bit++) {
                parity ^= bits & 1;
                bits >>= 1;
            }
            this.parityTable.push(parity ? 0 : Flag.P);
            this.sz53pTable.push(this.sz53Table[i] | this.parityTable[i]);
        }

        this.sz53Table[0] |= Flag.Z;
        this.sz53pTable[0] |= Flag.Z;

    }

    public reset(): void {
        this.regs = new RegisterSet();
    }

    public step(): void {
        decode(this);
    }

    public incTStateCount(count: number): void {
        this.hal.tStateCount += count;
    }

    public readByte(address: number): number {
        this.incTStateCount(3);
        return this.readByteInternal(address);
    }

    public readByteInternal(address: number): number {
        return this.hal.readMemory(address);
    }

    public writeByte(address: number, value: number): void {
        this.incTStateCount(3);
        this.writeByteInternal(address, value);
    }

    public writeByteInternal(address: number, value: number): void {
        this.hal.writeMemory(address, value);
    }

    public writePort(address: number, value: number): void {
        this.incTStateCount(1);
        this.hal.writePort(address, value);
        this.incTStateCount(3);
    }

    public readPort(address: number): number {
        this.incTStateCount(1);
        const value = this.hal.readPort(address);
        this.incTStateCount(3);
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