import {inc16, signedByte, toHex, toHexByte, toHexWord, word} from "z80-base";
import {Instruction} from "./Instruction.js";
import opcodeMap from "./Opcodes.js";
import {Preamble} from "./Preamble.js";

// Whether to dump statistics to the console, for debugging.
const PRINT_STATISTICS = false;

// Temporary string used for address substitution.
const TARGET = "TARGET";

// Number of bytes in memory.
const MEM_SIZE = 64*1024;

// Whether the byte can be converted to readable ASCII.
function isPrintable(b: number): boolean {
    return b >= 32 && b < 127;
}

// Whether the byte is appropriate for a .text instruction.
function isText(b: number): boolean {
    return isPrintable(b) || b === 0x0A || b === 0x0D;
}

// Whether this byte can terminate text.
function isTextTerminator(b: number): boolean {
    // Allow terminating NUL. Also allow terminating 0x03, it was used by the TRS-80 $VDLINE routine.
    return b === 0x00 || b === 0x03;
}

// Types for the opcode map.
interface OpcodeInstruction {
    mnemonic: string,
    params?: string[],
    extra?: string[],
}
interface OpcodeShift {
    shift: OpcodeMap,
}
type OpcodeMap = {
    [opcode: string]: OpcodeInstruction | OpcodeShift,
}

/**
 * Main class for disassembling a binary.
 */
export class Disasm {
    private readonly memory = new Uint8Array(MEM_SIZE);
    private readonly readMemory = (address: number) => this.memory[address];
    private readonly hasContent = new Uint8Array(MEM_SIZE);
    private readonly isDecoded = new Uint8Array(MEM_SIZE);
    private readonly instructions: (Instruction | undefined)[] = new Array(MEM_SIZE);
    private readonly knownLabels = new Map<number, string>();
    /**
     * Addresses that might be jumped to when running the code.
     */
    private entryPoints: number[] = [];
    /**
     * Values that were loaded into a 16-bit register. We can't be sure that these were meant to be
     * addresses, but guess that they were if it helps make a nicer disassembly.
     */
    private referencedAddresses = new Set<number>();
    /**
     * Map from an opcode (like 0xCF for RST 8) to the number of additional data bytes to gobble up.
     */
    private opcodeToAdditionDataLength = new Map<number,number>();

    /**
     * Add a chunk of binary somewhere in memory.
     */
    public addChunk(bin: ArrayLike<number>, address: number): void {
        this.memory.set(bin, address);
        this.hasContent.fill(1, address, address + bin.length);
    }

    /**
     * Add a memory location that might be jumped to when running this program. If no entry
     * points are specified, then the lower address for which we have binary will be used.
     */
    public addEntryPoint(entryPoint: number): void {
        this.entryPoints.push(entryPoint);
    }

    /**
     * Specify that this opcode (e.g., 0xCF) has this many bytes of additional data after it
     * that should not be interpreted as code.
     */
    public addAdditionalDataLength(opcode: number, length: number): void {
        this.opcodeToAdditionDataLength.set(opcode, length);
    }

    /**
     * Disassemble one instruction.
     *
     * @param address the address to disassemble.
     * @param readMemory function for reading a byte of memory at the specified address.
     */
    private disassembleOne(address: number, readMemory: (address: number) => number): Instruction {
        // Bytes decoded so far in the instruction being disassembled.
        let bytes: number[] = [];

        // Get the next byte.
        const next = (): number => {
            const byte = readMemory(address);
            bytes.push(byte);
            address = inc16(address);
            return byte;
        };

        const startAddress = address;
        let jumpTarget: number | undefined = undefined;

        // Fetch base instruction.
        let byte = next();
        let map: OpcodeMap = opcodeMap;

        let instruction: Instruction | undefined;

        while (instruction === undefined) {
            let value = map[byte.toString(16)];
            if (value === undefined) {
                // TODO
                // asm.push(".byte 0x" + byte.toString(16));
                const stringParams = bytes.map((n) => "0x" + toHex(n, 2));
                instruction = new Instruction(startAddress, bytes, ".byte", stringParams, stringParams, false);
            } else if ("shift" in value) {
                // Descend to sub-map.
                map = value.shift;
                byte = next();
            } else {
                // Found instruction. Parse arguments.
                const args = (value.params ?? []).slice();

                for (let i = 0; i < args.length; i++) {
                    let arg = args[i];

                    let changed: boolean;
                    do {
                        changed = false;

                        // Fetch word argument.
                        let pos = arg.indexOf("nnnn");
                        if (pos >= 0) {
                            const lowByte = next();
                            const highByte = next();
                            const nnnn = word(highByte, lowByte);
                            let target: string;
                            if (value.mnemonic === "call" || value.mnemonic === "jp") {
                                jumpTarget = nnnn;
                                target = TARGET;
                            } else {
                                target = "0x" + toHex(nnnn, 4);

                                // Only do this if the destination register is HL, since that's
                                // often an address and other registers are more often lengths.
                                if (value.params !== undefined && value.params.length === 2 &&
                                    value.params[0] === "hl" && value.params[1] === "nnnn") {

                                    this.referencedAddresses.add(nnnn);
                                }
                            }
                            arg = arg.substr(0, pos) + target + arg.substr(pos + 4);
                            changed = true;
                        }

                        // Fetch byte argument.
                        pos = arg.indexOf("nn");
                        if (pos === -1) {
                            pos = arg.indexOf("dd");
                        }
                        if (pos >= 0) {
                            const nn = next();
                            arg = arg.substr(0, pos) + "0x" + toHex(nn, 2) + arg.substr(pos + 2);
                            changed = true;
                        }

                        // Fetch offset argument.
                        pos = arg.indexOf("offset");
                        if (pos >= 0) {
                            const offset = signedByte(next());
                            jumpTarget = address + offset;
                            arg = arg.substr(0, pos) + TARGET + arg.substr(pos + 6);
                            changed = true;
                        }
                    } while (changed);

                    args[i] = arg;
                }

                instruction = new Instruction(startAddress, bytes, value.mnemonic, value.params, args, true);
                if (jumpTarget !== undefined) {
                    instruction.jumpTarget = jumpTarget;
                }
                instruction.additionalDataLength = this.getAdditionalDataLength(instruction);
            }
        }

        return instruction;
    }

    /**
     * Makes a data (.byte, .text) instruction starting at the specified address.
     */
    private makeDataInstruction(startAddress: number): Instruction {
        // Find out the max number of bytes we can eat up.
        let address = startAddress;
        while (address < MEM_SIZE &&
            address - startAddress < 50 &&
            this.hasContent[address] &&
            // Be sure to advance at least one byte.
            !(address > startAddress && this.isDecoded[address]) &&
            // Stop at an address that might be meaningful to the code.
            !(address > startAddress && this.referencedAddresses.has(address))) {

            address += 1;
        }
        let endAddress = address; // Exclusive.

        // Find the first large chunk of text.
        let startOfText: number | undefined = undefined;
        let startOfTextChunk: number | undefined = undefined;
        for (address = startAddress; address < endAddress; address++) {
            const byte = this.memory[address];

            // Detect first text chunk.
            if (isText(byte)) {
                if (startOfText === undefined) {
                    startOfText = address;
                }

                if (address - startOfText >= 4) {
                    // Found something long enough, lock it in.
                    startOfTextChunk = startOfText;
                }
            } else if (isTextTerminator(byte) && startOfTextChunk !== undefined) {
                // Allow one terminator after the text, but we're done now.
                address++;
                break;
            } else {
                if (startOfText !== undefined) {
                    if (startOfTextChunk !== undefined) {
                        // Found large text.
                        break;
                    }

                    // Too short, keep going.
                    startOfText = undefined;
                }
            }
        }
        const endOfText = address; // Exclusive.

        const parts: string[] = [];
        let mnemonic: string;

        if (startOfTextChunk === startAddress) {
            // Printable text.
            mnemonic = ".text";

            endAddress = endOfText;
            for (address = startAddress; address < endAddress; address++) {
                const byte = this.memory[address];
                if (isPrintable(byte)) {
                    let char = String.fromCharCode(byte);
                    if (char === "\"") {
                        // zasm doesn't support this backslash syntax. We'd have to enclose the whole string
                        // with single quotes.
                        // http://k1.spdns.de/Develop/Projects/zasm/Documentation/z79.htm#R
                        char = "\\\"";
                    }
                    if (parts.length > 0 && parts[parts.length - 1].startsWith("\"")) {
                        const s = parts[parts.length - 1];
                        parts[parts.length - 1] = s.substring(0, s.length - 1) + char + "\"";
                    } else {
                        parts.push("\"" + char + "\"");
                    }
                } else {
                    parts.push("0x" + toHexByte(byte));
                }
            }
        } else {
            // Raw bytes.
            mnemonic = ".byte";

            if (startOfTextChunk !== undefined) {
                // Stop at start of text chunk.
                endAddress = startOfTextChunk;
            }

            for (address = startAddress; address < endAddress; address++) {
                parts.push("0x" + toHexByte(this.memory[address]));
            }
        }

        const bytes = Array.from(this.memory.slice(startAddress, endAddress));
        return new Instruction(startAddress, bytes, mnemonic, parts, parts, false);
    }

    /**
     * Add a known label.
     *
     * @param address address of label.
     * @param label name to use for label.
     */
    public addLabel(address: number, label: string): void {
        this.knownLabels.set(address, label);
    }

    /**
     * Add an array of known label ([address, label] pairs).
     */
    public addLabels(labels: [number, string][]): void {
        for (const [address, label] of labels) {
            this.addLabel(address, label);
        }
    }

    /**
     * Whether we have a label with this name. This is pretty slow currently, but is only used
     * where that doesn't matter. Speed up with a set later if necessary.
     */
    public haveLabel(label: string): boolean {
        for (const l of this.knownLabels.values()) {
            if (l === label) {
                return true;
            }
        }

        return false;
    }

    /**
     * Add the label or, if it's already there, add a suffix to make it unique.
     */
    public addUniqueLabel(address: number, label: string): void {
        let suffix = 1;

        while (suffix < 1000) {
            const uniqueLabel = label + (suffix === 1 ? "" : suffix);
            if (this.haveLabel(uniqueLabel)) {
                suffix += 1;
            } else {
                this.addLabel(address, uniqueLabel);
                break;
            }
        }
    }

    /**
     * Disassemble a single instruction for tracing. This is intended when tracing a live CPU and
     * we want to print the currently-executing instructions.
     */
    public disassembleTrace(address: number, readMemory: (address: number) => number): Instruction {
        const instruction = this.disassembleOne(address, readMemory);
        this.replaceTargetAddress(instruction);

        return instruction;
    }

    /**
     * Disassemble all instructions and assign labels.
     */
    public disassemble(): Instruction[] {
        // First, see if there's a preamble that copies the program elsewhere in memory and jumps to it.

        // Use numerical for-loop instead of for-of because we modify the array in the loop.
        for (let i = 0; i < this.entryPoints.length; i++) {
            const entryPoint = this.entryPoints[i];
            const preamble = Preamble.detect(this.memory, entryPoint);
            if (preamble !== undefined) {
                const begin = preamble.sourceAddress;
                const end = begin + preamble.copyLength;
                this.addChunk(this.memory.subarray(begin, end), preamble.destinationAddress);
                // Unmark this so that we don't decode it as data. It's possible that the program makes use of
                // it, but unlikely.
                this.hasContent.fill(0, begin, end);
                this.addUniqueLabel(preamble.jumpAddress, "main");
                // It might have a preamble! See Galaxy Invasion.
                this.addEntryPoint(preamble.jumpAddress);
            }
        }

        // Create set of addresses we want to decode, starting with our entry points.
        const addressesToDecode = new Set<number>();
        const addAddressToDecode = (address: number | undefined): void => {
            if (address !== undefined &&
                this.hasContent[address] &&
                // Don't use isDecoded here, it might cause some bytes to not get decoded. For example,
                // addresses 5, 6, 7 might get decoded as an instruction, then later 4, 5, but we want
                // the next instruction at 6 to get decoded.
                this.instructions[address] === undefined) {

                addressesToDecode.add(address);
            }
        };

        if (this.entryPoints.length === 0) {
            // No explicit entry points. Default to lowest address we have data for.
            for (let address = 0; address < MEM_SIZE; address++) {
                if (this.hasContent[address]) {
                    addressesToDecode.add(address);
                    break;
                }
            }
            if (this.entryPoints.length === 0) {
                throw new Error("no binary content was specified");
            }
        } else {
            for (const address of this.entryPoints) {
                addressesToDecode.add(address);
            }
        }

        // Keep decoding as long as we have addresses to decode.
        while (addressesToDecode.size > 0) {
            // Pick any to do next.
            const address = addressesToDecode.values().next().value;
            addressesToDecode.delete(address);

            const instruction = this.disassembleOne(address, this.readMemory);
            this.instructions[address] = instruction;
            this.isDecoded.fill(1, address, address + instruction.bin.length);
            addAddressToDecode(instruction.jumpTarget);
            addAddressToDecode(instruction.continuesAt());
        }

        // Map from jump target to list of instructions that jump there.
        const jumpTargetMap = new Map<number, Instruction[]>();

        // Make list of instructions in memory order.
        const instructions: Instruction[] = [];
        for (let address = 0; address < MEM_SIZE; address++) {
            if (this.hasContent[address]) {
                let instruction = this.instructions[address];
                if (instruction === undefined) {
                    instruction = this.makeDataInstruction(address);
                }
                instructions.push(instruction);

                if (instruction.jumpTarget !== undefined) {
                    // Add this instruction to the list of instructions that call this target.
                    let sources = jumpTargetMap.get(instruction.jumpTarget);
                    if (sources === undefined) {
                        sources = [];
                        jumpTargetMap.set(instruction.jumpTarget, sources);
                    }
                    sources.push(instruction);
                }

                // Make sure we have content, or we'll make no progress in this loop.
                if (instruction.bin.length === 0) {
                    throw new Error("Instruction at 0x" + toHexWord(address) + " has no content");
                }

                address += instruction.bin.length - 1;
            }
        }

        // Assign labels.
        let labelCounter = 1;
        for (const instruction of instructions) {
            let label = this.knownLabels.get(instruction.address);
            const sources = jumpTargetMap.get(instruction.address) ?? [];
            if (sources.length !== 0) {
                if (label === undefined) {
                    // Make anonymous label.
                    label = "label" + labelCounter++;
                }
            }
            if (label !== undefined) {
                instruction.label = label;

                // Replace pseudo-target in instruction.
                for (const source of sources) {
                    source.replaceArgVariable(TARGET, label);
                }
            }
        }

        // Replace the target variable with the actual address for those
        // jumps that go outside our disassembled code.
        for (const instruction of instructions) {
            this.replaceTargetAddress(instruction);
        }

        // Print some statistics.
        if (PRINT_STATISTICS) {
            let contentCount = 0;
            let decodedCount = 0;
            for (let i = 0; i < MEM_SIZE; i++) {
                if (this.hasContent[i]) {
                    contentCount += 1;
                }
                if (this.isDecoded[i]) {
                    decodedCount += 1;
                }
            }

            console.log(Math.round(contentCount / MEM_SIZE * 100) + "% of memory has contents");
            console.log(Math.round(decodedCount / contentCount * 100) + "% of content is decoded");
        }

        return instructions;
    }

    private replaceTargetAddress(instruction: Instruction): void {
        if (instruction.jumpTarget !== undefined) {
            let label = this.knownLabels.get(instruction.jumpTarget);
            if (label === undefined) {
                label = "0x" + toHexWord(instruction.jumpTarget);
            }

            instruction.replaceArgVariable(TARGET, label);
        }
    }

    /**
     * Compute the number of additional data bytes there are after this instruction.
     */
    private getAdditionalDataLength(instruction: Instruction): number {
        return this.opcodeToAdditionDataLength.get(instruction.bin[0]) ?? 0;
    }
}
