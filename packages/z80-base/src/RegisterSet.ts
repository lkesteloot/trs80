import {Register} from "./Register.js";
import {hi, lo, word} from "./Utils.js";

/**
 * All registers in a Z80.
 */
export class RegisterSet {
    // External state:
    public af: number = 0;
    public bc: number = 0;
    public de: number = 0;
    public hl: number = 0;
    public afPrime: number = 0;
    public bcPrime: number = 0;
    public dePrime: number = 0;
    public hlPrime: number = 0;
    public ix: number = 0;
    public iy: number = 0;
    public sp: number = 0;
    public pc: number = 0;

    // Internal state:
    public memptr: number = 0;
    public i: number = 0;
    public r: number = 0;  // Low 7 bits of R.
    public r7: number = 0; // Bit 7 of R.
    public iff1: number = 0;
    public iff2: number = 0;
    public im: number = 0;
    public halted: number = 0;

    get a(): number {
        return hi(this.af);
    }

    set a(value: number) {
        this.af = word(value, this.f);
    }

    get f(): number {
        return lo(this.af);
    }

    set f(value: number) {
        this.af = word(this.a, value);
    }

    get b(): number {
        return hi(this.bc);
    }

    set b(value: number) {
        this.bc = word(value, this.c);
    }

    get c(): number {
        return lo(this.bc);
    }

    set c(value: number) {
        this.bc = word(this.b, value);
    }

    get d(): number {
        return hi(this.de);
    }

    set d(value: number) {
        this.de = word(value, this.e);
    }

    get e(): number {
        return lo(this.de);
    }

    set e(value: number) {
        this.de = word(this.d, value);
    }

    get h(): number {
        return hi(this.hl);
    }

    set h(value: number) {
        this.hl = word(value, this.l);
    }

    get l(): number {
        return lo(this.hl);
    }

    set l(value: number) {
        this.hl = word(this.h, value);
    }

    get ixh(): number {
        return hi(this.ix);
    }

    set ixh(value: number) {
        this.ix = word(value, this.ixl);
    }

    get ixl(): number {
        return lo(this.ix);
    }

    set ixl(value: number) {
        this.ix = word(this.ixh, value);
    }

    get iyh(): number {
        return hi(this.iy);
    }

    set iyh(value: number) {
        this.iy = word(value, this.iyl);
    }

    get iyl(): number {
        return lo(this.iy);
    }

    set iyl(value: number) {
        this.iy = word(this.iyh, value);
    }

    /**
     * Combine the two R parts together.
     */
    get rCombined(): number {
        return (this.r7 & 0x80) | (this.r & 0xF7);
    }

    /**
     * Get a register by name.
     */
    public getValue(registerName: Register): number {
        return this[registerName];
    }
}

/**
 * All real fields of RegisterSet, for enumeration.
 */
export const registerSetFields: Register[] = [
    "af", "bc", "de", "hl",
    "afPrime", "bcPrime", "dePrime", "hlPrime",
    "ix", "iy", "sp", "pc",
    "memptr", "i", "r", "iff1", "iff2", "im", "halted"];
