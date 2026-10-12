import {describe, expect, it} from "vitest";
import {MemoryBlock} from "./MemoryBlock.js";

describe("memory block", () => {
    it("adds a very large array of bytes", () => {
        // Spreading this many arguments into push() overflows the stack.
        const bytes = new Array<number>(2_000_000).fill(0x55);
        const block = new MemoryBlock(0x4000);
        block.addBytes(bytes);
        expect(block.bytes.length).to.equal(bytes.length);
        expect(block.isAtAddress(0x4000 + bytes.length)).to.be.true;
    });
});
