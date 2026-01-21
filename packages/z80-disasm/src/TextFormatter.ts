import {toHexByte, toHexWord} from "z80-base";
import {Disasm, HexFormat, toFormattedHex} from "./Disasm.js";
import {Instruction} from "./Instruction.js";

const INSTRUCTION_INDENT = " ".repeat(8);
const ADDRESS_INDENT = " ".repeat(5);
const LISTING_INDENT = ADDRESS_INDENT + " ".repeat(3*4);

export interface InstructionsToTextConfig {
    // Make a listing (vs. disassembly), default false.
    makeListing?: boolean;
    // Show opcode binary in listing, default true.
    showBinary?: boolean;
    // Function hex format, default c.
    hexFormat?: HexFormat;
    // Generate upper case disassembly (except for string literals), default false.
    upperCase?: boolean;
    // Main address to jump to, default unspecified.
    mainEntryPoint?: number | undefined;
}

/**
 * Converts an array of instructions into an array of text lines, suitable for displaying
 * in a shell console.
 *
 * @param disasm The disassembler used to make the instructions.
 * @param instructions The array of instructions to convert.
 * @param config object to configure the conversion.
 * @returns The array of text lines.
 */
export function instructionsToText(disasm: Disasm,
                                   instructions: Instruction[],
                                   config: InstructionsToTextConfig): string[] {

    // Set defaults.
    const {
        makeListing = false,
        showBinary = true,
        hexFormat = HexFormat.C,
        upperCase = false,
        mainEntryPoint,
    } = config;

    // Convenience function to transform text.
    function xform(value: string) {
        return upperCase ? value.toUpperCase() : value;
    }

    const lines: string[] = [];

    let expectedAddress = undefined;
    const listingIndent = makeListing ? showBinary ? LISTING_INDENT : ADDRESS_INDENT : "";
    let executableCount = 0;
    let nonExecutableCount = 0;

    for (const instruction of instructions) {
        let address = instruction.address;
        const bytes = instruction.bin;

        if (address !== expectedAddress) {
            lines.push(listingIndent + INSTRUCTION_INDENT + xform(".org " + toFormattedHex(address, 4, hexFormat)));
            expectedAddress = address;
        }
        expectedAddress += bytes.length;

        if (instruction.isExecutable) {
            executableCount++;
        } else {
            nonExecutableCount++;
        }

        if (instruction.label !== undefined) {
            lines.push(listingIndent + xform(instruction.label) + ":");
        }

        const instructionText = instruction.toText(upperCase);
        if (makeListing) {
            if (showBinary) {
                let i = 0;
                while (i < bytes.length) {
                    const subbytes = bytes.slice(i, Math.min(i + 3, bytes.length));
                    lines.push(toHexWord(address) + " " +
                        subbytes.map(toHexByte).join(" ").padEnd(12) +
                        (address === instruction.address ? INSTRUCTION_INDENT + instructionText : ""));
                    address += subbytes.length;
                    i += subbytes.length;
                }
            } else {
                lines.push(toHexWord(address) + " " + INSTRUCTION_INDENT + instructionText);
            }
        } else {
            lines.push(INSTRUCTION_INDENT + instructionText);
        }
    }

    let endLine = listingIndent + INSTRUCTION_INDENT + "end";
    if (mainEntryPoint !== undefined) {
        const label = disasm.getLabelForAddress(mainEntryPoint) ?? toFormattedHex(mainEntryPoint, 4, hexFormat);
        endLine += " " + label;
    }
    lines.push(endLine);

    if (false) {
        // Statistics.
        lines.push("");
        lines.push("Disassembly statistics:");
        lines.push("    Executable instructions: " + executableCount);
        lines.push("    Non-executable instructions: " + nonExecutableCount);
    }

    return lines;
}
