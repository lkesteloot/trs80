import {MemoryBlock} from "./MemoryBlock.js";

/**
 * Builds a program from chunks of memory.
 *
 * Subclasses can create chunks for the appropriate type of program.
 */
export abstract class ProgramBuilder {
    protected readonly blocks: MemoryBlock[] = [];

    /**
     * Add bytes at the specified address.
     */
    public addBytes(address: number, bytes: number[]): void {
        this.findBlockForAddress(address).addBytes(bytes);
    }

    /**
     * Find or create a block whose next address is the specified address.
     */
    private findBlockForAddress(address: number): MemoryBlock {
        // We're unlikely to have so many blocks for this to be a problem. If so, cache the most
        // recent found block for next time.
        for (const block of this.blocks) {
            if (block.isAtAddress(address)) {
                return block;
            }
        }

        const block = new MemoryBlock(address);
        this.blocks.push(block);
        return block;
    }
}
