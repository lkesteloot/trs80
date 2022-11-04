import {toHexByte, toHexWord} from "z80-base";
import {HexFormat, toFormattedHex} from "./Disasm.js";
import {Instruction} from "./Instruction.js";

const INSTRUCTION_INDENT = " ".repeat(8);
const ADDRESS_INDENT = " ".repeat(5);
const LISTING_INDENT = ADDRESS_INDENT + " ".repeat(3*4);

export interface InstructionsToTextConfig {
    // Make a listing (vs. disassembly), default false.
    makeListing?: boolean;
    // Show opcode binary in listing, default true,
    showBinary?: boolean;
    // Function hex format, default c.
    hexFormat?: HexFormat;
}

/**
 * Converts an array of instructions into an array of text lines, suitable for displaying
 * in a shell console.
 *
 * @param instructions The array of instructions to convert.
 * @param config object to configure the conversion.
 * @returns The array of text lines.
 */
export function instructionsToText(instructions: Instruction[], config: InstructionsToTextConfig): string[] {
    // Set defaults.
    const {
        makeListing = false,
        showBinary = true,
        hexFormat = HexFormat.C,
    } = config;

    const lines: string[] = [];

    let expectedAddress = undefined;
    const listingIndent = makeListing ? showBinary ? LISTING_INDENT : ADDRESS_INDENT : "";

    for (const instruction of instructions) {
        let address = instruction.address;
        const bytes = instruction.bin;

        if (address !== expectedAddress) {
            lines.push(listingIndent + INSTRUCTION_INDENT + ".org " + toFormattedHex(address, 4, hexFormat));
            expectedAddress = address;
        }
        expectedAddress += bytes.length;

        if (instruction.label !== undefined) {
            lines.push(listingIndent + instruction.label + ":");
        }

        if (makeListing) {
            if (showBinary) {
                while (bytes.length > 0) {
                    const subbytes = bytes.slice(0, Math.min(3, bytes.length));
                    lines.push(toHexWord(address) + " " +
                        subbytes.map(toHexByte).join(" ").padEnd(12) +
                        (address === instruction.address ? INSTRUCTION_INDENT + instruction.toText() : ""));
                    address += subbytes.length;
                    bytes.splice(0, subbytes.length);
                }
            } else {
                lines.push(toHexWord(address) + " " + INSTRUCTION_INDENT + instruction.toText());
            }
        } else {
            lines.push(INSTRUCTION_INDENT + instruction.toText());
        }
    }

    return lines;
}
