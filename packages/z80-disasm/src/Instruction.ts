
import {toHexByte} from "z80-base";

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
     * Arguments to the instruction (e.g., ["hl","0x1234"]).
     */
    public args: string[];
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
        return this.bin.map(toHexByte).join(" ");
    }

    /**
     * Text of the instruction (e.g., "ld hl,0x1234").
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

            let changed: boolean;
            do {
                changed = false;
                const pos = arg.indexOf(varName);
                if (pos >= 0) {
                    arg = arg.substr(0, pos) + replacement + arg.substr(pos + varName.length);
                    changed = true;
                }
            } while (changed);

            args[i] = arg;
        }
    }

    /**
     * Whether this instruction, when executed, potentially continues on to the next instructions. For example,
     * "nop" and "jr z,foo" return true, but "ret" and "jr foo" return false.
     */
    public continues(): boolean {
        // Return without a flag test.
        if (this.mnemonic === "ret" && this.args.length === 0) {
            return false;
        }

        // Return from interrupt.
        if (this.mnemonic === "reti" || this.mnemonic === "retn") {
            return false;
        }

        // Jump without a flag test.
        if ((this.mnemonic === "jp" || this.mnemonic === "jr") && this.args.length === 1) {
            return false;
        }

        // All else might continue.
        return true;
    }
}
