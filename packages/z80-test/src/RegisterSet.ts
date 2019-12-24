import {Register} from "./Register";
import {hi, lo, word} from "./Utils";

/**
 * Set of register values.
 */
export class RegisterSet {
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
    public memptr: number = 0;
    public i: number = 0;
    public r: number = 0;
    public iff1: number = 0;
    public iff2: number = 0;
    public im: number = 0;

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

    public get(register: Register): number {
        switch (register) {
            case Register.AF:
                return this.af;
            case Register.BC:
                return this.bc;
            case Register.DE:
                return this.de;
            case Register.HL:
                return this.hl;
            case Register.AF_PRIME:
                return this.afPrime;
            case Register.BC_PRIME:
                return this.bcPrime;
            case Register.DE_PRIME:
                return this.dePrime;
            case Register.HL_PRIME:
                return this.hlPrime;
            case Register.IX:
                return this.ix;
            case Register.IY:
                return this.iy;
            case Register.SP:
                return this.sp;
            case Register.PC:
                return this.pc;
            case Register.MEMPTR:
                return this.memptr;
            case Register.I:
                return this.i;
            case Register.R:
                return this.r;
            case Register.IFF1:
                return this.iff1;
            case Register.IFF2:
                return this.iff2;
            case Register.IM:
                return this.im;
            default:
                throw new Error("Unknown register " + register);
        }
    }

    public set(register: Register, value: number): void {
        switch (register) {
            case Register.AF:
                this.af = value;
                break;
            case Register.BC:
                this.bc = value;
                break;
            case Register.DE:
                this.de = value;
                break;
            case Register.HL:
                this.hl = value;
                break;
            case Register.AF_PRIME:
                this.afPrime = value;
                break;
            case Register.BC_PRIME:
                this.bcPrime = value;
                break;
            case Register.DE_PRIME:
                this.dePrime = value;
                break;
            case Register.HL_PRIME:
                this.hlPrime = value;
                break;
            case Register.IX:
                this.ix = value;
                break;
            case Register.IY:
                this.iy = value;
                break;
            case Register.SP:
                this.sp = value;
                break;
            case Register.PC:
                this.pc = value;
                break;
            case Register.MEMPTR:
                this.memptr = value;
                break;
            case Register.I:
                this.i = value;
                break;
            case Register.R:
                this.r = value;
                break;
            case Register.IFF1:
                this.iff1 = value;
                break;
            case Register.IFF2:
                this.iff2 = value;
                break;
            case Register.IM:
                this.im = value;
                break;
            default:
                throw new Error("Unknown register " + register);
        }
    }
}
