import opcodeMap from "./Opcodes.json";
import {Instruction} from "./Instruction";
import {signedByte, toHex, word} from "z80-base";

const TARGET = "TARGET";

export class Disasm {
    public disassemble(bin: number[] | Uint8Array): Instruction[] {
        const instructions: Instruction[] = [];

        let address = 0;
        let bytes: number[] = [];

        // Map from jump target to list of instructions that jump there.
        const jumpTargetMap = new Map<number, Instruction[]>();

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

        // Get the next byte.
        let index = 0;
        const next = (): number => {
            const byte = index < bin.length ? bin[index++] : 0;
            bytes.push(byte);
            address += 1;
            return byte;
        };

        // Fetch each instruction.
        while (index < bin.length) {
            const startAddress = address;
            let jumpTarget: number | undefined = undefined;

            bytes = [];

            // Fetch base instruction.
            let byte = next();
            let map: any = opcodeMap;

            while (true) {
                let value: any = map[byte.toString(16)];
                if (value === undefined) {
                    // TODO
                    // asm.push(".byte 0x" + byte.toString(16));
                    break;
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

                    let instruction = new Instruction(startAddress, bytes, value.mnemonic, value.params, args);
                    instructions.push(instruction);
                    if (jumpTarget !== undefined) {
                        instruction.jumpTarget = jumpTarget;

                        // Add this instruction to the list of instructions that call this target.
                        let sources = jumpTargetMap.get(jumpTarget);
                        if (sources === undefined) {
                            sources = [];
                            jumpTargetMap.set(jumpTarget, sources);
                        }
                        sources.push(instruction);
                    }
                    break;
                }
            }
        }

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
                instruction.replaceArgVariable(TARGET, "0x" + toHex(instruction.jumpTarget, 4));
            }
        }

        return instructions;
    }
}
