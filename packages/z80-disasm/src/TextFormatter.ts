import {toHexByte, toHexWord} from "z80-base";
import {Disasm, HexFormat, toFormattedHex} from "./Disasm.js";
import {Instruction} from "./Instruction.js";

const SPACE_WIDTH = 1;
const BYTE_WIDTH = 2;
const WORD_WIDTH = 2*BYTE_WIDTH;
const LABEL_SPACES = " ".repeat(8*SPACE_WIDTH);
const ADDRESS_SPACES = " ".repeat(WORD_WIDTH + SPACE_WIDTH);

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
    // Whether to include a comment that has the data of the instruction.
    dataComment?: boolean;
    // Number of hex bytes to display per line.
    hexByteCount?: number;
}

/**
 * Converts an array of bytes to an ASCII string, replacing non-printable characters with a period ('.').
 *
 * @param {number[]} bytes - An array of numbers representing byte values.
 * @return {string} The resulting ASCII string where non-printable characters are replaced with '.'.
 */
function toAscii(bytes: number[]): string {
    const chars: string[] = [];

    for (const b of bytes) {
        if (b >= 32 && b < 127) {
            chars.push(String.fromCharCode(b));
        } else {
            chars.push(".");
        }
    }

    return chars.join("");
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
        dataComment = false,
        hexByteCount = 3,
    } = config;

    // Convenience function to transform text.
    function xform(value: string) {
        return upperCase ? value.toUpperCase() : value;
    }

    const lines: string[] = [];

    let expectedAddress = undefined;
    const binaryWidth = showBinary ? hexByteCount*(BYTE_WIDTH + SPACE_WIDTH) : 0;
    // Address and binary.
    const listingSpaces = makeListing ? (ADDRESS_SPACES + " ".repeat(binaryWidth)) : "";
    let executableCount = 0;
    let nonExecutableCount = 0;

    for (const instruction of instructions) {
        let address = instruction.address;
        const bytes = instruction.bin;

        if (address !== expectedAddress) {
            if (lines.length > 0) {
                lines.push("");
            }
            lines.push(listingSpaces + LABEL_SPACES + xform(".org " + toFormattedHex(address, 4, hexFormat)));
            expectedAddress = address;
        }
        expectedAddress += bytes.length;

        if (instruction.isExecutable) {
            executableCount++;
        } else {
            nonExecutableCount++;
        }

        if (instruction.label !== undefined) {
            lines.push(listingSpaces + xform(instruction.label) + ":");
        }

        let instructionText = instruction.toText(upperCase);
        if (dataComment) {
           instructionText = instructionText.padEnd(32) + "; " + toAscii(bytes);
        }
        if (makeListing) {
            if (showBinary) {
                let i = 0;
                while (i < bytes.length) {
                    const subbytes = bytes.slice(i, Math.min(i + hexByteCount, bytes.length));
                    lines.push(toHexWord(address) + " " +
                        subbytes.map(toHexByte).join(" ").padEnd(binaryWidth) +
                        (address === instruction.address ? LABEL_SPACES + instructionText : ""));
                    address += subbytes.length;
                    i += subbytes.length;
                }
            } else {
                lines.push(toHexWord(address) + " " + LABEL_SPACES + instructionText);
            }
        } else {
            lines.push(LABEL_SPACES + instructionText);
        }
    }

    let endLine = listingSpaces + LABEL_SPACES + "end";
    if (mainEntryPoint !== undefined) {
        const label = disasm.getLabelForAddress(mainEntryPoint) ?? toFormattedHex(mainEntryPoint, 4, hexFormat);
        endLine += " " + label;
    }
    lines.push(xform(endLine));

    if (false) {
        // Statistics.
        lines.push("");
        lines.push("Disassembly statistics:");
        lines.push("    Executable instructions: " + executableCount);
        lines.push("    Non-executable instructions: " + nonExecutableCount);
    }

    return lines;
}
