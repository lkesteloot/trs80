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
