import {describe, expect, it} from "vitest";
import {CmdIsamDirectoryEntryChunk, decodeCmdProgram} from "./CmdProgram.js";

describe("cmd program", () => {
    it("keeps the file offset and sector offset of an ISAM directory entry separate", () => {
        const chunk = new CmdIsamDirectoryEntryChunk(0x1234, new Uint8Array([0x07, 0x00, 0x50, 0x03, 0x00, 0x80]));
        expect(chunk.offset).to.equal(0x1234);
        expect(chunk.sectorOffset).to.equal(0x80);
        expect(chunk.sectorNumber).to.equal(3);
        expect(chunk.transferAddress).to.equal(0x5000);
    });
    it("has no entry point without a transfer address chunk", () => {
        // A load block of two bytes at 0x5000.
        const loadBlock = [0x01, 0x04, 0x00, 0x50, 0xC9, 0x00];
        const noTransfer = decodeCmdProgram(new Uint8Array(loadBlock));
        expect(noTransfer?.error).to.be.undefined;
        expect(noTransfer?.entryPointAddress).to.be.undefined;

        const withTransfer = decodeCmdProgram(new Uint8Array([...loadBlock, 0x02, 0x02, 0x00, 0x50]));
        expect(withTransfer?.entryPointAddress).to.equal(0x5000);
    });
});
