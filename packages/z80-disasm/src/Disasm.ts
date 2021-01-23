import opcodeMap from "./Opcodes.json";
import {Instruction} from "./Instruction";
import {inc16, signedByte, toHex, toHexByte, toHexWord, word} from "z80-base";

// Temporary string used for address substitution.
const TARGET = "TARGET";

// Number of bytes in memory.
const MEM_SIZE = 64*1024;

export class Disasm {
    private readonly memory = new Uint8Array(MEM_SIZE);
    private readonly hasContent = new Uint8Array(MEM_SIZE);
    private readonly isDecoded = new Uint8Array(MEM_SIZE);
    private readonly instructions: (Instruction | undefined)[] = new Array(MEM_SIZE);
    private readonly knownLabels = new Map<number, string>();
    /**
     * Addresses that might be jumped to when running the code.
     */
    private entryPoints: number[] = [];

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
     * Disassemble one instruction.
     *
     * @param address the address to disassemble.
     */
    private disassembleOne(address: number): Instruction {
        // Bytes decoded so far in the instruction being disassembled.
        let bytes: number[] = [];

        // Get the next byte.
        const next = (): number => {
            const byte = this.memory[address];
            bytes.push(byte);
            address = inc16(address);
            return byte;
        };

        const startAddress = address;
        let jumpTarget: number | undefined = undefined;

        // Fetch base instruction.
        let byte = next();
        let map: any = opcodeMap;

        let instruction: Instruction | undefined;

        while (instruction === undefined) {
            let value: any = map[byte.toString(16)];
            if (value === undefined) {
                // TODO
                // asm.push(".byte 0x" + byte.toString(16));
                const stringParams = bytes.map((n) => "0x" + toHex(n, 2));
                instruction = new Instruction(startAddress, bytes, ".byte", stringParams, stringParams);
            } else if (value.shift !== undefined) {
                // Descend to sub-map.
                map = value.shift;
                byte = next();
            } else {
                // Found instruction. Parse arguments.
                const args: string[] = (value.params ?? []).slice();

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

                instruction = new Instruction(startAddress, bytes, value.mnemonic, value.params, args);
                if (jumpTarget !== undefined) {
                    instruction.jumpTarget = jumpTarget;
                }
            }
        }

        return instruction;
    }

    /**
     * Makes a data (.byte, .text) instruction starting at the specified address.
     */
    private makeDataInstruction(address: number): Instruction {
        const startAddress = address;

        // Whether the byte is appropriate for a .text instruction.
        const isPrintable = (b: number) => b >= 32 && b < 127;
        const isText = (b: number) => isPrintable(b) || b === 10 || b === 13;

        const parts: string[] = [];
        let mnemonic: string | undefined = undefined;

        // Look for contiguous sequence of either text or not text.
        if (isText(this.memory[address])) {
            mnemonic = ".text";
            while (address < MEM_SIZE && this.hasContent[address] && !this.isDecoded[address] && isText(this.memory[address]) && address - startAddress < 50) {
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
                address += 1;
            }

            if (address - startAddress < 2) {
                // Probably not actual text.
                mnemonic = undefined;
                parts.splice(0, parts.length);
                address = startAddress;
            } else {
                // Allow terminating NUL.
                if (address < MEM_SIZE && this.hasContent[address] && !this.isDecoded[address] && this.memory[address] === 0) {
                    parts.push("0x" + toHexByte(0));
                    address += 1;
                }
            }
        }

        if (mnemonic === undefined) {
            mnemonic = ".byte";
            while (address < MEM_SIZE && this.hasContent[address] && !this.isDecoded[address] && address - startAddress < 8) {
                parts.push("0x" + toHexByte(this.memory[address]));
                address += 1;
            }
        }

        const bytes = Array.from(this.memory.slice(startAddress, address));
        return new Instruction(startAddress, bytes, mnemonic, parts, parts);
    }

    /**
     * Add an array of known label ([address, label] pairs).
     */
    public addLabels(labels: [number, string][]): void {
        for (const [address, label] of labels) {
            this.knownLabels.set(address, label);
        }
    }

    /**
     * Disassemble all instructions and assign labels.
     */
    public disassemble(): Instruction[] {
        // Create set of addresses we want to decode, starting with our entry points.
        const addressesToDecode = new Set<number>();

        const addAddressToDecode = (number: number | undefined): void => {
            if (number !== undefined &&
                this.hasContent[number] &&
                this.instructions[number] === undefined) {

                addressesToDecode.add(number);
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
                throw new Error("not binary content was specified");
            }
        } else {
            for (const address of this.entryPoints) {
                addressesToDecode.add(address);
            }
        }

        // Keep decoding as long as we have addresses to decode.
        while (addressesToDecode.size !== 0) {
            // Pick any to do next.
            const address = addressesToDecode.values().next().value;
            addressesToDecode.delete(address);
            const instruction = this.disassembleOne(address);
            this.instructions[address] = instruction;
            this.isDecoded.fill(1, address, address + instruction.bin.length);
            addAddressToDecode(instruction.jumpTarget);

            if (instruction.continues()) {
                addAddressToDecode(address + instruction.bin.length);
            }
        }

        // Map from jump target to list of instructions that jump there.
        const jumpTargetMap = new Map<number, Instruction[]>();

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
            if (instruction.jumpTarget !== undefined) {
                let label = this.knownLabels.get(instruction.jumpTarget);
                if (label === undefined) {
                    label = "0x" + toHexWord(instruction.jumpTarget);
                }

                instruction.replaceArgVariable(TARGET, label);
            }
        }

        return instructions;
    }
}
