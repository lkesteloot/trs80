import { expect } from "chai";
import "mocha";
import { Disasm } from "./Disasm";

describe("disassemble", () => {
    it("nop", () => {
        const result = new Disasm().disassemble([0x00]).map((i) => i.toText());
        expect(result).to.eql(["nop"]);
    });
    it("di", () => {
        const result = new Disasm().disassemble([0xF3]).map((i) => i.toText());
        expect(result).to.eql(["di"]);
    });
    it("nop di nop di", () => {
        const result = new Disasm().disassemble([0x00, 0xF3, 0x00, 0xF3]).map((i) => i.toText());
        expect(result).to.eql(["nop", "di", "nop", "di"]);
    });
    it("shift no param", () => {
        const result = new Disasm().disassemble([0xED, 0x44]).map((i) => i.toText());
        expect(result).to.eql(["neg"]);
    });
    it("fill nn", () => {
        const result = new Disasm().disassemble([0x06, 0x01]).map((i) => i.toText());
        expect(result).to.eql(["ld b,0x01"]);
    });
    it("fill nnnn", () => {
        const result = new Disasm().disassemble([0xC3, 0x15, 0x30]).map((i) => i.toText());
        expect(result).to.eql(["jp 0x3015"]);
    });
});

describe("label", () => {
    it("built-in", () => {
        const result = new Disasm().disassemble([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            .map((i) => i.label);
        expect(result).to.eql(["reset", undefined, undefined, undefined, undefined, undefined,
            undefined, undefined, "rst08"]);
    });
    it("jp", () => {
        const result = new Disasm().disassemble([0xC3, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["jp L1", "nop"]);
    });
    it("call", () => {
        const result = new Disasm().disassemble([0xCD, 0x03, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["call L1", "nop"]);
    });
    it("jr", () => {
        const result = new Disasm().disassemble([0x18, 0x01, 0x00, 0x00]);
        expect(result.map((i) => i.label)).to.eql(["reset", undefined, "L1"]);
        expect(result.map((i) => i.toText())).to.eql(["jr L1", "nop", "nop"]);
    });
});
