import {describe, expect, it} from "vitest";
import { Z80_KNOWN_LABELS } from "z80-base";
import { Disasm } from "./Disasm.js";
import {Instruction} from "./Instruction.js";

function disasm(bin: ArrayLike<number>, org: number = 0): Instruction[] {
    const d = new Disasm();
    d.addLabels(Z80_KNOWN_LABELS);
    d.addChunk(bin, org);
    d.addEntryPoint(org);
    return d.disassemble();
}

function disasmToText(bin: ArrayLike<number>, org?: number, upperCase?: boolean): string[] {
    return disasm(bin, org).map(i => i.toText(upperCase ?? false));
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
    it("rst", () => {
        const result = disasmToText([0xD7]);
        expect(result).to.eql(["rst 10"]);
    });
    it("nop di nop di", () => {
        const result = disasmToText([0x00, 0xF3, 0x00, 0xF3]);
        expect(result).to.eql(["nop", "di", "nop", "di"]);
    });
    it("chunk that wraps past 0xFFFF", () => {
        // This used to throw. Tracing the code doesn't follow the wrap yet, so the bytes at
        // the top come out as data, after the code at 0x0000.
        const result = disasmToText([0x00, 0xF3, 0x00, 0xF3], 0xFFFE);
        expect(result).to.eql(["defb 0x00,0xF3", "nop", "di"]);
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
    it("positive index offset", () => {
        const result = disasmToText([0xDD, 0x34, 0x05]);
        expect(result).to.eql(["inc (ix+0x05)"]);
    });
    it("negative index offset", () => {
        const result = disasmToText([0xDD, 0x34, 0xFB]);
        expect(result).to.eql(["inc (ix-0x05)"]);
    });
    it("text", () => {
       const result = disasmToText([0xC3, 0x00, 0x00, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x21]);
       expect(result).to.eql(["jp rst00", ".text \"Hello!\""]);
    });
    it("upper case", () => {
        const result = disasmToText([0xC3, 0x00, 0x00, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x21], 0, true);
        expect(result).to.eql(["JP RST00", ".TEXT \"Hello!\""]);
    });
});

describe("label", () => {
    it("built-in", () => {
        const result = disasm([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            .map((i) => i.label);
        expect(result).to.eql(["rst00", undefined, undefined, undefined, undefined, undefined,
            undefined, undefined, "rst08"]);
    });
    it("jp", () => {
        const result = disasm([0xC3, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["rst00", "label1"]);
        expect(result.map((i) => i.toText(false))).to.eql(["jp label1", "nop"]);
        expect(result.map((i) => i.toText(true))).to.eql(["JP LABEL1", "NOP"]);
    });
    it("call", () => {
        const result = disasm([0xCD, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["rst00", "label1"]);
        expect(result.map((i) => i.toText(false))).to.eql(["call label1", "nop"]);
        expect(result.map((i) => i.toText(true))).to.eql(["CALL LABEL1", "NOP"]);
    });
    it("jr", () => {
        const result = disasm([0x18, 0x01, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["rst00", undefined, "label1"]);
        expect(result.map((i) => i.toText(false))).to.eql(["jr label1", "defb 0x00", "nop"]);
        expect(result.map((i) => i.toText(true))).to.eql(["JR LABEL1", "DEFB 0X00", "NOP"]);
    });
});
