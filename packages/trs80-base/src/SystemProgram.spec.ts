import {describe, expect, it} from "vitest";
import {decodeSystemProgram} from "./SystemProgram.js";

describe("system program", () => {
    it("reports a file truncated at the checksum", () => {
        // Header, filename, data chunk marker, length, address, data, but no checksum.
        const binary = new Uint8Array([
            0x55, 0x41, 0x42, 0x43, 0x20, 0x20, 0x20,
            0x3C, 0x02, 0x00, 0x70, 0x01, 0x02,
        ]);
        const program = decodeSystemProgram(binary, false);
        expect(program?.error).to.equal("File is truncated at checksum");
        expect(program?.chunks.length).to.equal(0);
    });
});
