
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
    /**
     * Whether this instruction is the target of a CALL, JP, or JR instruction.
     */
    public isJumpTarget = false;
    /**
     * Label at this address.
     */
    public label: string | undefined;
    /**
     * Target of a jump from this instruction.
     */
    public jumpTarget: number | undefined;

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

    /**
     * Replace all instances of "varName" in the args field with a replacement.
     */
    public replaceArgVariable(varName: string, replacement: string): void {
        const args = this.args;
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];

            while (true) {
                const pos = arg.indexOf(varName);
                if (pos >= 0) {
                    arg = arg.substr(0, pos) + replacement + arg.substr(pos + varName.length);
                } else {
                    break;
                }
            }

            args[i] = arg;
        }
    }
}
