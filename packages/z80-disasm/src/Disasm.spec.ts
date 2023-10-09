import { expect } from "chai";
import { Z80_KNOWN_LABELS } from "z80-base";
import { Disasm } from "./Disasm.js";
import {Instruction} from "./Instruction.js";

// I can't get mocha to work with TypeScript and ESM, so just provide their
// functions.
let testCount = 0;
let successCount = 0;
function describe(name: string, f: () => void): void {
    testCount++
    try {
        f();
        successCount += 1;
    } catch (e) {
        console.log(name + ": " + e);
    }
}
const it = describe;

function disasm(bin: ArrayLike<number>, org: number = 0): Instruction[] {
    const d = new Disasm();
    d.addLabels(Z80_KNOWN_LABELS);
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
    it("positive index offset", () => {
        const result = disasmToText([0xDD, 0x34, 0x05]);
        expect(result).to.eql(["inc (ix+0x05)"]);
    });
    it("negative index offset", () => {
        const result = disasmToText([0xDD, 0x34, 0xFB]);
        expect(result).to.eql(["inc (ix-0x05)"]);
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
        expect(result.map((i) => i.toText())).to.eql(["jp label1", "nop"]);
    });
    it("call", () => {
        const result = disasm([0xCD, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["rst00", "label1"]);
        expect(result.map((i) => i.toText())).to.eql(["call label1", "nop"]);
    });
    it("jr", () => {
        const result = disasm([0x18, 0x01, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["rst00", undefined, "label1"]);
        expect(result.map((i) => i.toText())).to.eql(["jr label1", ".byte 0x00", "nop"]);
    });
});

console.log(successCount + " successful out of " + testCount);
