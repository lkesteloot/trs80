
import { expect } from "chai";
import "mocha";
import { Parser } from "./Parser";

describe("assemble", () => {
    it("nop", () => {
        const parser = new Parser(" nop", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0]);
        expect(results.error).to.be.undefined;
    });

    it("label", () => {
        const constants: any = {};
        const parser = new Parser("main", 5, constants, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(constants).to.deep.include({"main": 5});
    });

    it("label w/colon", () => {
        const constants: any = {};
        const parser = new Parser("main:", 5, constants, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(constants).to.deep.include({"main": 5});
    });

    // Mnemonics are allowed as labels.
    it("nop (as label)", () => {
        const constants: any = {};
        const parser = new Parser("nop", 5, constants, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(constants).to.deep.include({"nop": 5});
    });

    it("label w/inst", () => {
        const constants: any = {};
        const parser = new Parser("main nop", 5, constants, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0]);
        expect(results.error).to.be.undefined;
        expect(constants).to.deep.include({"main": 5});
    });

    it("ld a,c", () => {
        const parser = new Parser(" ld a,c", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x79]);
        expect(results.error).to.be.undefined;
    });

    it("ld a,c w/spaces", () => {
        const parser = new Parser(" ld a , c ", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x79]);
        expect(results.error).to.be.undefined;
    });

    it("bad mnemonic", () => {
        const parser = new Parser(" foo", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.not.be.undefined;
    });

    it("present identifier", () => {
        const parser = new Parser(" ld a,foo", 0, {"foo": 6}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x3E, 0x06]);
        expect(results.error).to.be.undefined;
    });

    it("missing identifier", () => {
        const parser = new Parser(" ld a,foo", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x3E, 0x00]);
        expect(results.error).to.not.be.undefined;
    });

    it("#code without address", () => {
        const parser = new Parser("#code FOO", 10, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(results.nextAddress).to.be.equal(10);
    });

    it("#code with address", () => {
        const parser = new Parser("#code FOO, 0x4000", 0, {}, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(results.nextAddress).to.be.equal(0x4000);
    });

    it("parse error", () => {
        const parser = new Parser("#target bin", 0, {}, false);
            const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.not.be.undefined;
    });
});

