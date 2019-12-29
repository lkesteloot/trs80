
import opcodeMap from "./Opcodes.json";
import {Instruction} from "./Instruction";
import {word, toHex} from "z80-base";

export class Disasm {
    public disassemble(bin: number[] | Uint8Array): Instruction[] {
        const instructions: Instruction[] = [];

        let address = 0;
        let bytes: number[] = [];

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
                                const value = word(highByte, lowByte);
                                arg = arg.substr(0, pos) + toHex(value, 4) + arg.substr(pos + 4);
                                changed = true;
                            }

                            // Fetch byte argument.
                            pos = arg.indexOf("nn");
                            if (pos === -1) {
                                pos = arg.indexOf("dd");
                            }
                            if (pos >= 0) {
                                const value = next();
                                arg = arg.substr(0, pos) + toHex(value, 2) + arg.substr(pos + 2);
                                changed = true;
                            }
                        } while (changed);

                        args[i] = arg;
                    }

                    instructions.push(new Instruction(startAddress, bytes, value.mnemonic, value.params, args));
                    break;
                }
            }
        }

        return instructions;
    }
}
