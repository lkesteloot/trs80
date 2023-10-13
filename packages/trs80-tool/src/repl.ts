import chalk from "chalk";
import readline from "readline";
import {hexdumpBinary} from "./hexdump.js";
import { Hal, Z80 } from "z80-emulator";
import {RegisterSet, isRegisterSetField, toHexByte, toHexWord } from "z80-base";
import { Asm } from "z80-asm";

/**
 * Regular expression to find <var>nn</var> markup in opcode descriptions.
 */
const VAR_RE = /<var>([^<]*)<\/var>/g;

/**
 * Takes a string like "Loads <var>nn</var> into HL." and returns a version
 * with the "nn" highlighted and tags removed.
 */
function highlightVar(description: string): string {
    return description.replace(VAR_RE, (match, p1) => chalk.underline(p1));
}

/**
 * Handle the "repl" command.
 */
export function repl() {
    class ReplHal implements Hal {
        tStateCount: number = 0;
        ram = new Uint8Array(65536);

        readMemory(address: number): number {
            const value = this.ram[address];
            console.log("    Read 0x" + toHexByte(value) + " from 0x" + toHexWord(address));
            return value;
        }
        writeMemory(address: number, value: number): void {
            console.log("    Write 0x" + toHexByte(value) + " to 0x" + toHexWord(address));
            this.ram[address] = value;
        }
        contendMemory(address: number): void {
            // Ignore.
        }
        readPort(address: number): number {
            address &= 0xFF;
            const value = 0x12; // Whatever.
            console.log("    Input 0x" + toHexByte(value) + " from 0x" + toHexWord(address));
            return value;
        }
        writePort(address: number, value: number): void {
            address &= 0xFF;
            console.log("    Output 0x" + toHexByte(value) + " to 0x" + toHexWord(address));
        }
        contendPort(address: number): void {
            // Ignore.
        }
    }
    let org = 0x0000;
    const hal = new ReplHal();
    const z80 = new Z80(hal);
    z80.regs.pc = org;

    console.log('Type "help" for help.');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    function updatePrompt() {
        rl.setPrompt(chalk.yellowBright("0x" + toHexWord(org) + "> "));
    }

    function dumpRegisters(before: RegisterSet) {
        const ALL = ["af", "bc", "de", "hl", "afPrime", "bcPrime", "dePrime", "hlPrime",
            "ix", "iy", "sp", "pc"];
        const FLAGS = ["Carry/Borrow", "Subtraction", "Parity/Overflow", "X3", "Half Carry", "X5", "Zero", "Sign (negative)"];

        console.log("Registers:");

        const flags: string[] = [];
        for (let i = 0; i < 8; i++) {
            const bit = 1 << i;
            const isSet = (z80.regs.f & bit) !== 0;
            const wasSet = (before.f & bit) !== 0;
            const changed = isSet !== wasSet;
            let color = changed ? chalk.whiteBright : chalk.dim;
            if (isSet) {
                color = color.underline;
            }
            flags.push(color(FLAGS[i]));
        }
        console.log("    " + flags.join(", "));

        for (let i = 0; i < ALL.length; i++) {
            const reg = ALL[i];
            if (isRegisterSetField(reg)) {
                if (i % 4 === 0) {
                    process.stdout.write("    ");
                }
                let regLabel = reg.toUpperCase();
                if (regLabel.endsWith("PRIME")) {
                    regLabel = regLabel.substring(0, 2) + "'";
                } else {
                    regLabel = " " + regLabel;
                }

                const changed = z80.regs.getValue(reg) !== before.getValue(reg);
                const color = changed ? chalk.whiteBright : chalk.dim;

                process.stdout.write(color(regLabel + "=" + toHexWord(z80.regs.getValue(reg))) + "  ");
                if (i % 4 === 3) {
                    process.stdout.write("\n");
                }
            }
        }
    }

    updatePrompt();
    rl.prompt();

    rl.on('line', (line: string) => {
        line = line.trim();
        if (line === "help") {
            console.log('The number at the prompt is the "org", i.e., the location that the');
            console.log('next instruction will be written to. Type an instruction (such as "ld a,5")');
            console.log('or a machine language byte sequence (such as "0x3e05"). This will write it');
            console.log('to the current location and execute one instruction. Press enter on an empty');
            console.log('line to execute another instruction. Other commands:');
            console.log('    "quit" or Ctrl-D to quit.');
            console.log('    "org 0x5000" to change org.');
            console.log('    "mem" to dump memory.');
        } else if (line === "quit") {
            process.exit(0);
        } else if (line === "") {
            const regs = z80.regs.clone();
            z80.step();
            dumpRegisters(regs);
        } else if (line.startsWith("org ")) {
            org = parseInt(line.substring(4)) & 0xFFFF;
        } else if (line === "mem") {
            // We could have a parameter here for where to start, but our hexdump assumes
            // we always start at 0, so the addresses would be wrong.
            hexdumpBinary(hal.ram, true, []);
        } else if (line.startsWith("0x")) {
            z80.regs.pc = org;
            for (let i = 2; i < line.length; i += 2) {
                const value = parseInt(line.substring(i, i + 2), 16);
                hal.ram[org] = value;
                org += 1;
            }
            const regs = z80.regs.clone();
            z80.step();
            dumpRegisters(regs);
        } else {
            // Assemble instruction.
            z80.regs.pc = org;
            const fileSystem = {
                readTextFile(pathname: string): string[] | undefined {
                    return [
                        " .org " + org,
                        // Assembly can't be in first column.
                        " " + line
                    ];
                },

                // Read the file as a blob, or undefined if the file cannot be read.
                readBinaryFile(pathname: string): Uint8Array | undefined {
                    return undefined;
                },

                // Read all filenames in a directory, or undefined if the directory cannot be read.
                readDirectory(pathname: string): string[] | undefined {
                    return undefined;
                }
            }
            const asm = new Asm(fileSystem);
            asm.assembleFile("");
            let success = true;
            for (const line of asm.assembledLines) {
                if (line.error !== undefined) {
                    console.log(line.error);
                    success = false;
                }
            }
            if (success) {
                for (const line of asm.assembledLines) {
                    for (let i = 0; i < line.binary.length; i++) {
                        hal.ram[line.address + i] = line.binary[i];
                        org += 1;
                    }
                    if (line.binary.length !== 0) {
                        // Show four bytes at a time.
                        console.log("Listing:");
                        let displayAddress = line.address;
                        for (let i = 0; i < line.binary.length; i += 4) {
                            let result = "    " + toHexWord(displayAddress) + ":";
                            for (let j = 0; j < 4 && i + j < line.binary.length; j++) {
                                result += " " + toHexByte(line.binary[i + j]);
                                displayAddress++;
                            }
                            if (i === 0) {
                                result = result.padEnd(24, " ") + line.line;
                            }
                            console.log(result);
                        }
                    }
                    if (line.variant !== undefined && line.variant.clr !== undefined) {
                        const clr = line.variant.clr;
                        console.log("Instruction information:");
                        let output = "    " + clr.instruction + ": " + highlightVar(clr.description);
                        if (clr.undocumented) {
                            output += " (undocumented)";
                        }
                        console.log(output);
                        output = "    Opcodes: " + clr.opcodes + ", bytes: " + clr.byte_count + ", clocks: " + clr.without_jump_clock_count;
                        if (clr.with_jump_clock_count !== clr.without_jump_clock_count) {
                            output += " (" + clr.with_jump_clock_count + " with jump)";
                        }
                        console.log(output);
                        if (clr.flags === "------") {
                            console.log("    Flags are unaffected");
                        } else {
                            const FLAGS = "CNPHZS";
                            for (let i = 0; i < 6; i++) {
                                output = "    " + FLAGS[i] + ": ";
                                switch (clr.flags[i]) {
                                    case "-": output += "unaffected"; break;
                                    case "0": output += "reset"; break;
                                    case "1": output += "set"; break;
                                    case "P": output += "detects parity"; break;
                                    case "V": output += "detects overflow"; break;
                                    case "+": output += "affected as defined"; break;
                                    case "*": output += "exceptional (see docs)"; break;
                                    case " ": output += "unknown"; break;
                                    default: output += "???"; break;
                                }
                                console.log(output);
                            }
                        }
                    }
                }
                const regs = z80.regs.clone();
                console.log("Execution:");
                z80.step();
                dumpRegisters(regs);
            }
        }

        updatePrompt();
        rl.prompt();
    }).on('close', () => {
        console.log('');
        process.exit(0);
    });
}
