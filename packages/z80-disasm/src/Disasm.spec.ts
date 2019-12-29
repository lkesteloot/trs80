import { expect } from "chai";
import "mocha";
import { Disasm } from "./Disasm";

describe("disassemble", () => {
    it("nop", () => {
        const result = new Disasm().disassemble([0x00]);
        expect(result).to.eql(["nop"]);
    });
    it("di", () => {
        const result = new Disasm().disassemble([0xF3]);
        expect(result).to.eql(["di"]);
    });
    it("nop di nop di", () => {
        const result = new Disasm().disassemble([0x00, 0xF3, 0x00, 0xF3]);
        expect(result).to.eql(["nop", "di", "nop", "di"]);
    });
    it("shift no param", () => {
        const result = new Disasm().disassemble([0xED, 0x44]);
        expect(result).to.eql(["neg"]);
    });
});
