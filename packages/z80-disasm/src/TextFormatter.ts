import {Instruction} from "./Instruction.js";
import {toHexByte, toHexWord} from "z80-base";

const INSTRUCTION_INDENT = "        ";
const LISTING_INDENT = "                 ";

/**
 * Converts an array of instructions into an array of text lines, suitable for displaying
 * in a shell console.
 *
 * @param instructions The array of instructions to convert.
 * @param makeListing Make a listing (vs. disassembly).
 * @returns The array of text lines.
 */
export function instructionsToText(instructions: Instruction[], makeListing: boolean): string[] {
    const lines: string[] = [];

    let expectedAddress = undefined;

    for (const instruction of instructions) {
        let address = instruction.address;
        const bytes = instruction.bin;

        if (address !== expectedAddress) {
            lines.push((makeListing ? LISTING_INDENT : "") + INSTRUCTION_INDENT + ".org 0x" + toHexWord(address));
            expectedAddress = address;
        }
        expectedAddress += bytes.length;

        if (instruction.label !== undefined) {
            lines.push((makeListing ? LISTING_INDENT : "") + instruction.label + ":");
        }

        if (makeListing) {
            while (bytes.length > 0) {
                const subbytes = bytes.slice(0, Math.min(3, bytes.length));
                lines.push(toHexWord(address) + " " +
                    subbytes.map(toHexByte).join(" ").padEnd(12) +
                    (address === instruction.address ? INSTRUCTION_INDENT + instruction.toText() : ""));
                address += subbytes.length;
                bytes.splice(0, subbytes.length);
            }
        } else {
            lines.push(INSTRUCTION_INDENT + instruction.toText());
        }
    }

    return lines;
}
