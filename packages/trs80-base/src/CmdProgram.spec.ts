import {describe, expect, it} from "vitest";
import {CmdIsamDirectoryEntryChunk} from "./CmdProgram.js";

describe("cmd program", () => {
    it("keeps the file offset and sector offset of an ISAM directory entry separate", () => {
        const chunk = new CmdIsamDirectoryEntryChunk(0x1234, new Uint8Array([0x07, 0x00, 0x50, 0x03, 0x00, 0x80]));
        expect(chunk.offset).to.equal(0x1234);
        expect(chunk.sectorOffset).to.equal(0x80);
        expect(chunk.sectorNumber).to.equal(3);
        expect(chunk.transferAddress).to.equal(0x5000);
    });
});
