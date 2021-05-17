import { expect } from "chai";
import "mocha";
import { Disasm } from "./Disasm.js";
import {Instruction} from "./Instruction.js";

function disasm(bin: ArrayLike<number>, org: number = 0): Instruction[] {
    const d = new Disasm();
    d.addChunk(bin, org);
    d.addEntryPoint(org);
    return d.disassemble();
}

function disasmToText(bin: ArrayLike<number>, org?: number): string[] {
    return disasm(bin, org).map(i => i.toText());
}

describe("disassemble", () => {
    it("nop", () => {
        const result = disasmToText([0x00]);
        expect(result).to.eql(["nop"]);
    });
    it("di", () => {
        const result = disasmToText([0xF3]);
        expect(result).to.eql(["di"]);
    });
    it("nop di nop di", () => {
        const result = disasmToText([0x00, 0xF3, 0x00, 0xF3]);
        expect(result).to.eql(["nop", "di", "nop", "di"]);
    });
    it("nop di nop di with org", () => {
        const result = disasmToText([0x00, 0xF3, 0x00, 0xF3], 0x100);
        expect(result).to.eql(["nop", "di", "nop", "di"]);
    });
    it("shift no param", () => {
        const result = disasmToText([0xED, 0x44]);
        expect(result).to.eql(["neg"]);
    });
    it("fill nn", () => {
        const result = disasmToText([0x06, 0x01]);
        expect(result).to.eql(["ld b,0x01"]);
    });
    it("fill nnnn", () => {
        const result = disasmToText([0xC3, 0x15, 0x30]);
        expect(result).to.eql(["jp 0x3015"]);
    });
});

describe("label", () => {
    it("built-in", () => {
        const result = disasm([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            .map((i) => i.label);
        expect(result).to.eql(["reset", undefined, undefined, undefined, undefined, undefined,
            undefined, undefined, "rst08"]);
    });
    it("jp", () => {
        const result = disasm([0xC3, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["jp L1", "nop"]);
    });
    it("call", () => {
        const result = disasm([0xCD, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["call L1", "nop"]);
    });
    it("jr", () => {
        const result = disasm([0x18, 0x01, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", undefined, "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["jr L1", ".byte 0x00", "nop"]);
    });
});
