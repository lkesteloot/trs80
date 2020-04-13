
import { expect } from "chai";
import "mocha";
import {Parser, SymbolInfo} from "./Parser";

describe("assemble", () => {
    it("nop", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" nop", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0]);
        expect(results.error).to.be.undefined;
    });

    it("label", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("main", "", 0, 5, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(symbols.get("main")?.value).to.equal(5);
    });

    it("label w/colon", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("main:", "", 0, 5, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(symbols.get("main")?.value).to.equal(5);
    });

    // Mnemonics are allowed as labels.
    it("nop (as label)", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("nop", "", 0, 5, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(symbols.get("nop")?.value).to.equal(5);
    });

    it("label w/inst", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("main nop", "", 0, 5, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0]);
        expect(results.error).to.be.undefined;
        expect(symbols.get("main")?.value).to.equal(5);
    });

    it("ld a,c", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" ld a,c", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x79]);
        expect(results.error).to.be.undefined;
    });

    it("ld a,c w/spaces", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" ld a , c ", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x79]);
        expect(results.error).to.be.undefined;
    });

    it("ddcb param", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" rlc (ix+0x56)", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0xDD, 0xCB, 0x56, 0x06]);
        expect(results.error).to.be.undefined;
    });

    it("bad mnemonic", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" foo", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.not.be.undefined;
    });

    it("present identifier", () => {
        const symbols = new Map<string,SymbolInfo>();
        symbols.set("foo", new SymbolInfo("foo", 6, "", 0, 0));
        const parser = new Parser(" ld a,foo", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x3E, 0x06]);
        expect(results.error).to.be.undefined;
    });

    it("missing identifier", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser(" ld a,foo", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([0x3E, 0x00]);
        expect(results.error).to.not.be.undefined;
    });

    it("#code without address", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("#code FOO", "", 0, 10, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(results.nextAddress).to.be.equal(10);
    });

    it("#code with address", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("#code FOO, 0x4000", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(results.nextAddress).to.be.equal(0x4000);
    });

    it("#include", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("#include \"foo/bar.asm\"", "", 0, 0, symbols, false);
        const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
        expect(results.includeFilename).to.be.equal("foo/bar.asm");
    });

    it("target bin", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("#target bin", "", 0, 0, symbols, false);
            const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.be.undefined;
    });

    it("parse error", () => {
        const symbols = new Map<string,SymbolInfo>();
        const parser = new Parser("#foo", "", 0, 0, symbols, false);
            const results = parser.assemble();
        expect(results.binary).to.deep.equal([]);
        expect(results.error).to.not.be.undefined;
    });
});

describe("number parsing", () => {
    const tests = [
        // Decimal.
        [ '0', 0 ],
        [ '00', 0 ],
        [ '5', 5 ],
        [ '123', 123 ],
        [ '0123', 123 ],

        // Hex.
        [ '$AB', 0xAB ],
        [ '0xAB', 0xAB ], // Looks like B suffix.
        [ '0ABH', 0xAB ],
        [ '0B1H', 0xB1 ], // Looks like 0x start.

        // Binary.
        [ '%1010', 0b1010 ],
        [ '0b1010', 0b1010 ],
        [ '1010B', 0b1010 ],

        // Current address.
        [ '$', 0x1234 ],
        [ '$+1', 0x1235 ],
        [ '$-1', 0x1233 ],

        // Negative numbers.
        [ '-5', -5 ],
        [ '-0xAB', -0xAB ],
        [ '-0b1010', -0b1010 ],
        [ '-0ABH', -0xAB ],
        [ '-1010B', -0b1010 ],
        [ '-$AB', -0xAB ],
        [ '-%1010', -0b1010 ],
        [ '-$', -0x1234 ],

        // Operators.
        [ '2 << 3', 16 ],
        [ '16 >> 3', 2 ],
    ];

    for (const test of tests) {
        const input = test[0];
        const expected = test[1];

        it("parsing " + input, () => {
            const line = "foo .equ " + input;
            const symbols = new Map<string,SymbolInfo>();
            const parser = new Parser(line, "", 0, 0x1234, symbols, false);
            const results = parser.assemble();
            expect(results.binary).to.deep.equal([]);
            expect(results.error).to.be.undefined;
            expect(symbols.get("foo")?.value).to.be.equal(expected);
        });
    }
});
