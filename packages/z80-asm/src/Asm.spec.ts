import {expect} from "chai";
import {Asm, FileSystem} from "./Asm";
import {Tokenizer} from "./Tokenizer";
import {mnemonicMap, opcodeVariantToString } from "z80-inst";
import {Disasm} from "z80-disasm";
import {hi, lo} from "z80-base";

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

// Test tokenizer.
describe("tokenizer", () => {
   it("simple identifier", () => {
       const tokenizer = new Tokenizer("a");
       expect(tokenizer.matches("a")).to.be.true;
       expect(tokenizer.matches("b")).to.be.false;
    });
    it("simple identifiers", () => {
        const tokenizer = new Tokenizer("a b c");
        expect(tokenizer.found("a")).to.be.true;
        expect(tokenizer.found("b")).to.be.true;
        expect(tokenizer.found("c")).to.be.true;
        expect(tokenizer.found("d")).to.be.false;
    });
    it("all token types", () => {
        const tokenizer = new Tokenizer("a + 20 <= \"abc\" ; yeah");
        expect(tokenizer.found("a")).to.be.true;
        expect(tokenizer.found("+")).to.be.true;
        expect(tokenizer.found("20")).to.be.true;
        expect(tokenizer.found("<=")).to.be.true;
        expect(tokenizer.found("\"abc\"")).to.be.true;
        expect(tokenizer.found("; yeah")).to.be.true;
        expect(tokenizer.found("; yeah")).to.be.false;
        expect(tokenizer.isEndOfLine()).to.be.true;
    });
    it("identifiers with dots", () => {
        const tokenizer = new Tokenizer("abc .abc . ab.cd");
        expect(tokenizer.found("abc")).to.be.true;
        expect(tokenizer.found(".abc")).to.be.true;
        expect(tokenizer.found(".")).to.be.false;
        tokenizer.tokenIndex += 1;
        expect(tokenizer.found("ab")).to.be.true;
        expect(tokenizer.found(".cd")).to.be.true;
    });
    it("hex number in identifier", () => {
        // We used to mis-parse "CHKX" as the hex number "CH".
        const tokenizer = new Tokenizer("CHKX");
        expect(tokenizer.found("chkx")).to.be.true;
        expect(tokenizer.isEndOfLine()).to.be.true;
    });
    it("af' register", () => {
        const tokenizer = new Tokenizer("af'");
        expect(tokenizer.found("af'")).to.be.true;
        expect(tokenizer.isEndOfLine()).to.be.true;
    })
});

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
        if (testLines[i].error) {
            expect(assembledLines[i].error).to.not.be.undefined;
        } else {
            expect(assembledLines[i].error).to.be.undefined;
        }
        expect(assembledLines[i].binary).to.deep.equal(testLines[i].opcodes ?? []);
    }
    return asm;
}

describe("assemble", () => {
    it("comment", () => {
        runTest([
            { line: " ; hello!", opcodes: [] },
        ]);
        runTest([
            { line: " nop ; hello!", opcodes: [0] },
        ]);
    });

    it("nop", () => {
        runTest([
            { line: " nop", opcodes: [0] },
        ]);
    });

    it("label", () => {
        const asm = runTest([
            { line: " .org 5" },
            { line: "main" },
            { line: " nop", opcodes: [0x00] },
            { line: " jp main", opcodes: [0xC3, 0x05, 0x00] }
        ]);
        expect(asm.scopes[0].get("main")?.value).to.equal(5);

    });

    it("case-insensitive label", () => {
        // Identifiers are case-insensitive.
        const asm = runTest([
            { line: " .org 5" },
            { line: " nop", opcodes: [0x00] },
            { line: "ChKX" },
            { line: " nop", opcodes: [0x00] },
            { line: " jp CHKx", opcodes: [0xC3, 0x06, 0x00] },
            { line: " jp chkx", opcodes: [0xC3, 0x06, 0x00] },
        ]);
        expect(asm.scopes[0].get("chkx")?.value).to.equal(6);
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

    it("LD A,C", () => {
        runTest([
            { line: " LD A,C", opcodes: [0x79] },
        ]);
    });

    it("or 0x55", () => {
        runTest([
            { line: " or 0x55", opcodes: [0xF6, 0x55] },
        ]);
    });

    // Alternative syntax.
    it("or a,0x55", () => {
        runTest([
            { line: " or a,0x55", opcodes: [0xF6, 0x55] },
        ]);
    });

    // Expression that starts with (. Disable this, it's hard to handle and user can add 0+ at the front.
    // it("ld a,(2+3)+2", () => {
    //     runTest([
    //         { line: " ld a,(2+3)+2", opcodes: [0x3E, 0x07] },
    //     ]);
    // });

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

    // Positive index offset.
    it("inc (ix+5)", () => {
        runTest([
            { line: " inc (ix+5)", opcodes: [0xDD, 0x34, 0x05] },
        ]);
    });

    // Negative index offset.
    it("inc (ix-5)", () => {
        runTest([
            { line: " inc (ix-5)", opcodes: [0xDD, 0x34, 0xFB] },
        ]);
    });

    // Expression starting with negative sign. (Must not parse as "ix-(5+2)".)
    it("inc (ix-5+2)", () => {
        runTest([
            { line: " inc (ix-5+2)", opcodes: [0xDD, 0x34, 0xFD] },
        ]);
    });

    // Data pseudo-mnemonics.
    it(" .text 'ABC'", () => {
        runTest([
            { line: " .text 'ABC'", opcodes: [0x41, 0x42, 0x43] },
        ]);
    });

    it("db of equ", () => {
        runTest([
            { line: "xyz equ 255", opcodes: [] },
            { line: "abc db 255", opcodes: [0xFF] },
            { line: "def db xyz", opcodes: [0xFF] },
        ]);
    });

    it("handling of af'", () => {
        runTest([
            { line: " ex af,af'", opcodes: [0x08] },
            { line: " push af", opcodes: [0xF5] },
            { line: " push af'", error: true },
        ]);
    });
});

describe("all opcodes", () => {
    for (const [mnemonic, variants] of mnemonicMap) {
        for (const variant of variants) {
            if (variant.aliasOf !== undefined) {
                // Don't test for aliases, we don't assemble to them.
                continue;
            }
            const loadAddress = 100; // Non-zero to test the offsets.
            const disasm = new Disasm();
            const opcodes: number[] = [];
            const value = loadAddress - 10;
            for (const opcode of variant.opcodes) {
                if (typeof opcode === "number") {
                    opcodes.push(opcode);
                } else {
                    switch (opcode) {
                        case "nnnn":
                            opcodes.push(lo(value));
                            opcodes.push(hi(value));
                            break;

                        case "nn":
                            opcodes.push(lo(value));
                            break;

                        case "dd":
                            opcodes.push(lo(value));
                            break;

                        case "offset":
                            opcodes.push(lo(value - loadAddress - opcodes.length - 1));
                            break;
                    }
                }
            }
            disasm.addChunk(opcodes, loadAddress);
            disasm.addEntryPoint(loadAddress);
            const instructions = disasm.disassemble();
            const testLines: TestLine[] = [{
                line: " .org " + loadAddress,
            }].concat(instructions.map(instruction => ({
                    line: " " + instruction.toText(false),
                    opcodes: instruction.bin,
            })));
            it(opcodeVariantToString(variant), () => {
                runTest(testLines);
            });
        }
    }
});

describe("expressions", () => {
    const tests = [
        // Decimal.
        [ '0', 0 ],
        [ '00', 0 ],
        [ '5', 5 ],
        [ '123', 123 ],
        [ '0123', 123 ], // 0 prefix is not octal.

        // Hex.
        [ '$AB', 0xAB ],
        [ '0xAB', 0xAB ], // Looks like B suffix.
        [ '0ABH', 0xAB ],
        [ '0B1H', 0xB1 ], // Looks like 0x start.

        // Binary.
        // [ '%1010', 0b1010 ], // See SUPPORT_PERCENT_BINARY
        [ '0b1010', 0b1010 ],
        [ '1010B', 0b1010 ],

        // Octal.
        [ '0123o', 0o123 ],
        [ '0777o', 0o777 ],
        [ '0o123', 0o123 ],
        [ '0o777', 0o777 ],

        // Current address.
        [ '$', 0x1234 ],
        [ '$+1', 0x1235 ],
        [ '$-1', 0x1233 ],

        // Characters.
        [ '"A"', 65 ],
        [ "'A'", 65 ],
        [ '"A" + 1', 66 ],
        [ '1 + "A"', 66 ],
        [ '"A" | 128', 65 | 128 ],

        // Negative numbers.
        [ '-5', -5 ],
        [ '--5', 5 ],
        [ '10+---4', 6 ],
        [ '-0xAB', -0xAB ],
        [ '-0b1010', -0b1010 ],
        [ '-0ABH', -0xAB ],
        [ '-1010B', -0b1010 ],
        [ '-$AB', -0xAB ],
        // [ '-%1010', -0b1010 ], // See SUPPORT_PERCENT_BINARY
        [ '-$', -0x1234 ],

        // Function-like operators.
        [ 'lo(0x1234)', 0x34 ],
        [ 'lo 0x1234', 0x34 ],
        [ 'low(0x1234)', 0x34 ],
        [ 'low 0x1234', 0x34 ],
        [ 'hi(0x1234)', 0x12 ],
        [ 'hi 0x1234', 0x12 ],
        [ 'high(0x1234)', 0x12 ],
        [ 'high 0x1234', 0x12 ],
        [ '(high 0x1234) + 1', 0x13 ],
        [ 'high 0x1234 + 1', 0x13 ],
        [ 'high(0x1234 + 1)', 0x12 ],

        // Arithmetic operators
        ['2 + 3', 5],
        ['5 - 2', 3],
        ['4 * 6', 24],
        ['8 / 2', 4],
        ['-3 / 2', -1], // truncate
        ['7 % 3', 1],
        ['7 mod 3', 1], // zmac syntax
        ['7 Mod 3', 1], // zmac syntax (case-insensitive)

        // Bitwise operators
        ['2 & 3', 2],
        ['2 and 3', 2], // zmac syntax
        ['5 | 3', 7],
        ['5 or 3', 7], // zmac syntax
        ['6 ^ 3', 5],
        ['6 xor 3', 5], // zmac syntax
        ['~2', -3],
        ['2 << 3', 16],
        ['2 shl 3', 16], // zmac syntax
        ['8 >> 2', 2],
        ['8 shr 2', 2], // zmac syntax

        // Relational operators
        ['2 < 3', 1],
        ['2 lt 3', 1], // zmac syntax
        ['5 <= 3', 0],
        ['5 le 3', 0], // zmac syntax
        ['4 > 6', 0],
        ['4 gt 6', 0], // zmac syntax
        ['8 >= 2', 1],
        ['8 ge 2', 1], // zmac syntax

        // Equality operators
        ['2 == 3', 0],
        ['2 = 3', 0], // zmac syntax
        ['2 eq 3', 0], // zmac syntax
        ['5 != 3', 1],
        ['5 <> 3', 1], // zmac syntax
        ['5 ne 3', 1], // zmac syntax

        // Logical operators
        ['1 && 0', 0],
        ['1 || 0', 1],

        // Conditional (Ternary) operator
        ['2 > 3 ? 4 : 5', 5],

        // Complex expressions with various operators and parentheses
        ['2 + 3 * 4', 14],
        ['(2 + 3) * 4', 20],
        ['2 * 3 + 4', 10],
        ['2 * (3 + 4)', 14],
        ['8 / 2 + 3', 7],
        ['8 / (2 + 3)', 1],
        ['2 + 3 % 2', 3],
        ['(2 + 3) % 2', 1],
        ['2 << 3 + 1', 32],
        ['(2 << 3) + 1', 17],
        ['2 & 3 | 1', 3],
        ['2 ^ 3 & 1', 3],
        ['1 | 2 & 3', 3],
        ['~(2 | 3) & 0x0F', 12],
        ['2 == 3 && 4 != 5', 0],
        ['(2 == 3) || (4 != 5)', 1],
        ['2 > 3 ? 4 + 5 : 6 * 7', 42],
        ['(2 > 3 ? 4 : 5) + 6', 11],
    ];

    for (const test of tests) {
        const input = test[0];
        const expected = test[1];

        it("parsing " + input, () => {
            const asm = runTest([
                { line: " .org 0x1234" },
                { line: "foo .equ " + input },
            ]);

            expect(asm.scopes[0].get("foo")?.value).to.be.equal(expected);
        });
    }
});

function runMacroTest(testLines: string | string[], expectedOpcodes: number[]): void {
    if (typeof testLines === "string") {
        testLines = testLines.split("\n");
    }
    const asm = new Asm(linesToFileSystem(testLines));
    asm.assembleFile("unused.asm");
    const opcodes: number[] = [];
    for (const assembledLine of asm.assembledLines) {
        if (assembledLine.error !== undefined) {
            throw new Error(assembledLine.error + " in line: " + assembledLine.line);
        }
        opcodes.push(... assembledLine.binary);
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
    it("macro def after use", () => {
        runMacroTest(`
foo     macro
        ld a,5
        endm

        foo

bar     macro
        ld a,5
        endm`,
            [0x3E, 0x05]);
    });
    it("macro local label", () => {
        runMacroTest(`
foo     macro #abc,?def
?def:
        ld a,#abc
        jr z,?def
        endm

        foo 5
        foo 6`,
            [0x3E, 0x05, 0x28, 0xFC, 0x3E, 0x06, 0x28, 0xFC]);
    });
    it("macro <arg>", () => {
        runMacroTest(`
foo     macro #abc
        ld #abc
        endm

        foo <a,5>
        foo <a,(hl)>`,
            [0x3E, 0x05, 0x7E]);
    });
    it("if in macro", ()=>{
        runMacroTest([
            "foo macro p",
            "    if &p>0",
            "     ld hl,0",
            "    else",
            "     ld de,0",
            "    endif",
            "    endm",
            "    foo 10",
            "    foo 0",
        ], [0x21, 0x00, 0x00, 0x11, 0x00, 0x00]);
    })
    /*
    it("rept in macro", ()=>{
        runMacroTest([
            "incs macro &n",
            "     rept &n",
            "      inc hl",
            "     endm",
            "    endm",
            "    incs 5",
        ], [0x23, 0x23, 0x23, 0x23, 0x23]);
    })
    it("macro arg concat", ()=>{
        runMacroTest([
            "test macro &aa, &bb",
            "     ld a, &aa.&bb",
            "    endm",
            "    foo.bar equ 5",
            "    test foo, bar",
        ], [0x3e, 0x05]);
    })*/
});

console.log(successCount + " successful out of " + testCount, successCount === testCount ? "✅" : "❌");
