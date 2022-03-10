
import { expect } from "chai";
import "mocha";
import {Asm, FileSystem, SourceFile} from "./Asm";

interface TestLine {
    line: string;
    opcodes?: number[];
    error?: boolean;
}

function linesToFileSystem(lines: string[]): FileSystem {
    return {
        readBinaryFile(pathname: string): Uint8Array | undefined {
            return undefined;
        }, readDirectory(pathname: string): string[] | undefined {
            return undefined;
        }, readTextFile(pathname: string): string[] | undefined {
            return lines;
        }
    };
}

function runTest(testLines: TestLine[]): Asm {
    const asm = new Asm(linesToFileSystem(testLines.map(testLine => testLine.line)));
    const sourceFile = asm.assembleFile("unused.asm");
    if (sourceFile === undefined) {
        throw new Error("File not found");
    }
    const assembledLines = sourceFile.assembledLines;
    expect(assembledLines.length).to.be.equal(testLines.length);
    for (let i = 0; i < testLines.length; i++) {
        expect(assembledLines[i].binary).to.deep.equal(testLines[i].opcodes ?? []);
        if (testLines[i].error) {
            expect(assembledLines[i].error).to.not.be.undefined;
        } else {
            expect(assembledLines[i].error).to.be.undefined;
        }
    }
    return asm;
}

describe("assemble", () => {
    it("nop", () => {
        runTest([
            { line: " nop", opcodes: [0] },
        ]);
    });

    it("label", () => {
        const asm = runTest([
            { line: " .org 5" },
            { line: "main" },
        ]);
        expect(asm.scopes[0].get("main")?.value).to.equal(5);
    });

    it("label w/colon", () => {
        const asm = runTest([
            { line: " .org 5" },
            { line: "main:" },
        ]);
        expect(asm.scopes[0].get("main")?.value).to.equal(5);
    });

    // Mnemonics are allowed as labels.
    it("nop (as label)", () => {
        const asm = runTest([
            { line: " .org 5" },
            { line: "nop" },
        ]);
        expect(asm.scopes[0].get("nop")?.value).to.equal(5);
    });

    it("label w/inst", () => {
        const asm = runTest([
            { line: " .org 5" },
            { line: "main nop", opcodes: [0] },
        ]);
        expect(asm.scopes[0].get("main")?.value).to.equal(5);
    });

    it("ld a,c", () => {
        runTest([
            { line: " ld a,c", opcodes: [0x79] },
        ]);
    });

    it("ld a,c w/spaces", () => {
        runTest([
            { line: " ld a , c ", opcodes: [0x79] },
        ]);
    });

    it("ddcb param", () => {
        runTest([
            { line: " rlc (ix+0x56)", opcodes: [0xDD, 0xCB, 0x56, 0x06] },
        ]);
    });

    it("bad mnemonic", () => {
        runTest([
            { line: " foo", error: true },
        ]);
    });

    it("present identifier", () => {
        runTest([
            { line: "foo .equ 6" },
            { line: " ld a,foo", opcodes: [0x3E, 0x06] },
        ]);
    });

    it("missing identifier", () => {
        runTest([
            { line: " ld a,main", opcodes: [0x3E, 0x00], error: true },
        ]);
    });

    it("#code without address", () => {
        runTest([
            { line: "#code FOO" },
            { line: " jp $", opcodes: [0xC3, 0x00, 0x00] },
        ]);
    });

    it("#code with address", () => {
        runTest([
            { line: "#code FOO, 0x4000" },
            { line: " jp $", opcodes: [0xC3, 0x00, 0x40] },
        ]);
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
            const asm = runTest([
                { line: " .org 0x1234" },
                { line: line },
            ]);

            expect(asm.scopes[0].get("foo")?.value).to.be.equal(expected);
        });
    }
});

function runMacroTest(testLines: string[], expectedOpcodes: number[]): void {
    const asm = new Asm(linesToFileSystem(testLines));
    const sourceFile = asm.assembleFile("unused.asm");
    if (sourceFile === undefined) {
        throw new Error("File not found");
    }
    const opcodes: number[] = [];
    for (const assembledLine of sourceFile.assembledLines) {
        opcodes.splice(opcodes.length, 0, ... assembledLine.binary);
    }
    expect(opcodes).to.deep.equal(expectedOpcodes);
}

describe("assemble", () => {
    it("macro label first", () => {
        runMacroTest([
            "foo macro",
            "    nop",
            "    endm",
            "    foo",
            "    foo",
        ], [0, 0]);
    });
    it("macro label last", () => {
        runMacroTest([
            "    macro foo",
            "    nop",
            "    endm",
            "    foo",
            "    foo",
        ], [0, 0]);
    });
    it("macro param label first", () => {
        runMacroTest([
            "foo macro p1",
            "    ld a, &p1",
            "    endm",
            "    foo 1",
            "    foo 2",
        ], [0x3E, 1, 0x3E, 2]);
    });
    it("macro param label last", () => {
        runMacroTest([
            "    macro foo p1",
            "    ld a, \\p1",
            "    endm",
            "    foo 1",
            "    foo 2",
        ], [0x3E, 1, 0x3E, 2]);
    });
    it("macro params", () => {
        runMacroTest([
            "    macro foo p1, p2",
            "    ld a, \\p1",
            "    ld a, \\p2",
            "    endm",
            "    foo 1, 2",
            "    foo 3, 4",
        ], [0x3E, 1, 0x3E, 2, 0x3E, 3, 0x3E, 4]);
    });
    it("macro tag", () => {
        runMacroTest([
            "    macro foo #p1, #p2",
            "    ld a, #p1",
            "    ld a, #p2",
            "    endm",
            "    foo 1, 2",
            "    foo 3, 4",
        ], [0x3E, 1, 0x3E, 2, 0x3E, 3, 0x3E, 4]);
    });
    it("macro arg", () => {
        runMacroTest([
            "    macro foo p",
            "    .text \\p",
            "    endm",
            "    foo 'A,B;C'",
            "    foo \"A,B;C\"",
        ], [0x41, 0x2C, 0x42, 0x3B, 0x43, 0x41, 0x2C, 0x42, 0x3B, 0x43]);
    });
});
