import {Flag, hi, inc16, lo, RegisterSet, word} from "z80-base";
import {decode} from "./Decode";
import {Hal} from "./Hal";

/**
 * Emulated Z80 processor.
 */
export class Z80 {
    /**
     * Full set of registers.
     */
    public regs: RegisterSet = new RegisterSet();
    /**
     * Hardware abstraction layer this Z80 is dealing with.
     */
    public hal: Hal;
    /**
     * Tables for computing flags. Public so that the decoding function
     * can access them.
     */
    public sz53Table: number[] = []; /* The S, Z, 5 and 3 bits of the index */
    public parityTable: number[] = []; /* The parity of the lookup value */
    public sz53pTable: number[] = []; /* OR the above two tables together */

    constructor(hal: Hal) {
        this.hal = hal;
        this.initTables();
    }

    /**
     * Reset the Z80 to a known state.
     */
    public reset(): void {
        this.regs = new RegisterSet();
    }

    /**
     * Execute one instruction.
     */
    public step(): void {
        decode(this);
    }

    /**
     * Increment the clock count.
     */
    public incTStateCount(count: number): void {
        this.hal.tStateCount += count;
    }

    /**
     * Read a byte from memory, taking as many clock cycles as necessary.
     */
    public readByte(address: number): number {
        this.incTStateCount(3);
        return this.readByteInternal(address);
    }

    /**
     * Read a byte from memory (not affecting clock).
     */
    public readByteInternal(address: number): number {
        return this.hal.readMemory(address);
    }

    /**
     * Write a byte to memory, taking as many clock cycles as necessary.
     */
    public writeByte(address: number, value: number): void {
        this.incTStateCount(3);
        this.writeByteInternal(address, value);
    }

    /**
     * Write a byte to memory (not affecting clock).
     */
    public writeByteInternal(address: number, value: number): void {
        this.hal.writeMemory(address, value);
    }

    /**
     * Write a byte to a port, taking as many clock cycles as necessary.
     */
    public writePort(address: number, value: number): void {
        this.incTStateCount(1);
        this.hal.writePort(address, value);
        this.incTStateCount(3);
    }

    /**
     * Read a byte from a port, taking as many clock cycles as necessary.
     */
    public readPort(address: number): number {
        this.incTStateCount(1);
        const value = this.hal.readPort(address);
        this.incTStateCount(3);
        return value;
    }

    /**
     * Push a word on the stack.
     */
    public pushWord(value: number): void {
        this.pushByte(hi(value));
        this.pushByte(lo(value));
    }

    /**
     * Push a byte on the stack.
     */
    public pushByte(value: number): void {
        this.regs.sp = (this.regs.sp - 1) & 0xFFFF;
        this.writeByte(this.regs.sp, value);
    }

    /**
     * Pop a word from the stack.
     */
    public popWord(): number {
        const lowByte = this.popByte();
        const highByte = this.popByte();
        return word(highByte, lowByte);
    }

    /**
     * Pop a byte from the stack.
     */
    public popByte(): number {
        const value = this.readByte(this.regs.sp);
        this.regs.sp = inc16(this.regs.sp);
        return value;
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
}
