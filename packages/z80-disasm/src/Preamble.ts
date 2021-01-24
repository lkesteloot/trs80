
/**
 * Information about a preamble that might copy the rest of the program elsewhere in memory. It typically looks like:
 *
 *     6000  21 0E 60            ld hl,0x600E
 *     6003  11 00 43            ld de,0x4300
 *     6006  01 5C 07            ld bc,0x075C
 *     6009  ED B0               ldir
 *     600B  C3 00 43            jp 0x4300
 *     600E  [program to be copied]
 *
 */
export class Preamble {
    public readonly preambleLength: number;
    public readonly sourceAddress: number;
    public readonly destinationAddress: number;
    public readonly copyLength: number;
    public readonly jumpAddress: number;

    constructor(preambleLength: number, sourceAddress: number, destinationAddress: number,
                copyLength: number, jumpAddress: number) {

        this.preambleLength = preambleLength;
        this.sourceAddress = sourceAddress;
        this.destinationAddress = destinationAddress;
        this.copyLength = copyLength;
        this.jumpAddress = jumpAddress;
    }

    /**
     * Detect a preamble that copies the program to another address.
     */
    public static detect(memory: Uint8Array, entryPoint: number): Preamble | undefined {
        let preambleLength = 0x0E;
        let start = entryPoint;

        // Skip optional DI.
        if (memory[start] === 0xF3) { // DI
            start += 1;
            preambleLength += 1;
        }

        const sourceAddress = memory[start + 0x01] | (memory[start + 0x02] << 8);
        const destinationAddress = memory[start + 0x04] | (memory[start + 0x05] << 8);
        const copyLength = memory[start + 0x07] | (memory[start + 0x08] << 8);
        const jumpAddress = memory[start + 0x0C] | (memory[start + 0x0D] << 8);

        if (memory[start + 0x00] === 0x21 && // LD HL,nnnn
            memory[start + 0x03] === 0x11 && // LD DE,nnnn
            memory[start + 0x06] === 0x01 && // LD BC,nnnn
            memory[start + 0x09] === 0xED && memory[start + 0x0A] === 0xB0 && // LDIR
            memory[start + 0x0B] === 0xC3 && // JP nnnn
            jumpAddress >= destinationAddress && jumpAddress < destinationAddress + copyLength) {

            return new Preamble(preambleLength, sourceAddress, destinationAddress, copyLength, jumpAddress);
        }

        return undefined;
    }
}
