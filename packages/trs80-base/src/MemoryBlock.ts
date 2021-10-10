
/**
 * Represents a contiguous chunk of bytes in memory.
 */
export class MemoryBlock {
    public readonly address: number;
    public readonly bytes: number[] = [];

    constructor(startAddress: number) {
        this.address = startAddress;
    }

    /**
     * Add bytes to the block of memory.
     */
    public addBytes(bytes: number[]): void {
        this.bytes.push(... bytes);
    }

    /**
     * Whether the next byte will be added at this address.
     */
    public isAtAddress(address: number): boolean {
        return this.address + this.bytes.length === address;
    }

    /**
     * Breaks this block into sub-blocks of at most maxSize bytes.
     */
    public breakInto(maxSize: number): MemoryBlock[] {
        const subBlocks: MemoryBlock[] = [];

        let index = 0;
        while (index < this.bytes.length) {
            const thisSize = Math.min(this.bytes.length - index, maxSize);

            const subBlock = new MemoryBlock(this.address + index);
            subBlock.addBytes(this.bytes.slice(index, thisSize));
            subBlocks.push(subBlock);

            index += thisSize;
        }

        return subBlocks;
    }
}
