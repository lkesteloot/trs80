import opcodeMap from "./Opcodes.json";

export class Disasm {
    public disassemble(opcodes: number[]): string[] {
        const asm: string[] = [];

        let map: any = opcodeMap;
        for (const opcode of opcodes) {
            const value: any = map[opcode.toString(16)];
            if (value === undefined) {
                asm.push(".byte 0x" + opcode.toString(16));
                map = opcodeMap;
            } else if (value.shift !== undefined) {
                map = value.shift;
            } else {
                asm.push(value.mnemonic);
                map = opcodeMap;
            }
        }

        return asm;
    }
}
