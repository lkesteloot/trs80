import {Instruction} from "./Instruction.js";
import {toHexByte, toHexWord} from "z80-base";

/**
 * Converts an array of instructions into an array of text lines, suitable for displaying
 * in a shell console.
 */
export function instructionsToText(instructions: Instruction[]): string[] {
    const lines: string[] = [];

    for (const instruction of instructions) {
        if (instruction.label !== undefined) {
            lines.push("                 " + instruction.label + ":");
        }

        let address = instruction.address;
        const bytes = instruction.bin;

        while (bytes.length > 0) {
            const subbytes = bytes.slice(0, Math.min(3, bytes.length));
            lines.push(toHexWord(address) + " " +
                subbytes.map(toHexByte).join(" ").padEnd(12) +
                (address === instruction.address ? "        " + instruction.toText() : ""));
            address += subbytes.length;
            bytes.splice(0, subbytes.length);
        }
    }

    return lines;
}
