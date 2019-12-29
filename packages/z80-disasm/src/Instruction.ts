
import {toHex} from "z80-base";

export class Instruction {
    /**
     * Address of instruction.
     */
    public address: number;
    /**
     * Raw binary as found in the original.
     */
    public bin: number[];
    /**
     * Mnemonic of the instruction (e.g., "ld").
     */
    public mnemonic: string;
    /**
     * Parameters to the instruction (e.g., ["hl","nnnn"]).
     */
    public params: string[];
    /**
     * Arguments to the instruction (e.g., ["hl","1234"]).
     */
    public args: string[];

    constructor(address: number, bin: number[], mnemonic: string, params: string[], args: string[]) {
        this.address = address;
        this.bin = bin;
        this.mnemonic = mnemonic;
        this.params = params ?? [];
        this.args = args ?? [];
    }

    /**
     * Text version of the binary: two-digit hex numbers separated by a space.
     */
    public binText(): string {
        return this.bin.map((n) => toHex(n, 2)).join(" ");
    }

    /**
     * Text of the instruction (e.g., "ld hl,1234").
     */
    public toText(): string {
        return (this.mnemonic + " " + this.args.join(",")).trim();
    }
}
