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
            // Pick any to start with.
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
                    const bytes = [this.memory[address]];
                    const stringParams = bytes.map((n) => "0x" + toHexByte(n));
                    instruction = new Instruction(address, bytes, ".byte", stringParams, stringParams);
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

        // Known labels.
        const knownLabels = new Map<number, string>([
            // Generic Z80:
            [0x0000, "rst00"],
            [0x0008, "rst08"],
            [0x0010, "rst10"],
            [0x0018, "rst18"],
            [0x0020, "rst20"],
            [0x0028, "rst28"],
            [0x0030, "rst30"],
            [0x0038, "rst38"],

            // TRS-80 Model III specific:
            [0x0298, "clkon"], // Turn clock on.
            [0x02a1, "clkoff"], // Turn clock off.
            [0x0296, "cshin"], // Search for cassette header and sync byte.
            [0x0235, "csin"],  // Read cassette byte.
            [0x0287, "cshwr"], // Write cassette leader and sync byte.
            [0x01f8, "csoff"], // Turn off cassette.
            [0x0264, "csout"], // Write byte to cassette.
            [0x3033, "date"], // Get today's date.
            [0x0060, "delay"], // Delay for a specified interval (2.46 + 14.8*BC microseconds).
            [0x0069, "initio"], // Initialize all I/O drivers.
            [0x002b, "kbchar"], // Get a keyboard character if available.
            [0x0040, "kbline"], // Wait for a line from the keyboard.
            [0x0049, "kbwait"], // Wait for a keyboard character.
            [0x028d, "kbbrk"], // Check for a Break key only.
            [0x003b, "prchar"], // Output a character to the printer.
            [0x01d9, "prscn"], // Print entire screen contents.
            [0x1a19, "ready"], // Jump to Model III Basic "Ready".
            [0x0000, "reset"], // Jump to reset.
            [0x006c, "route"], // Change I/O device routing.
            [0x005a, "rsinit"], // Initialize the RS-232-C interface.
            [0x0050, "rsrcv"], // Receive a character from the RS-232-C interface.
            [0x0055, "rstx"], // Transmit a character to the RS-232-C interface.
            [0x3042, "setcas"], // Prompt user to set cassette baud rate.
            [0x3036, "time"], // Get the time.
            [0x0033, "vdchar"], // Display a character.
            [0x01c9, "vdcls"], // Clear the video display screen.
            [0x021b, "vdline"], // Display a line.
        ]);

        // Assign labels.
        let labelCounter = 1;
        for (const instruction of instructions) {
            let label = knownLabels.get(instruction.address);
            const sources = jumpTargetMap.get(instruction.address) ?? [];
            if (sources.length !== 0) {
                if (label === undefined) {
                    // Make anonymous label.
                    label = "L" + labelCounter++;
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
                instruction.replaceArgVariable(TARGET, "0x" + toHexWord(instruction.jumpTarget));
            }
        }

        return instructions;
    }
}
