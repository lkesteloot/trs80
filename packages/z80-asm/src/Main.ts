import * as fs from "fs";
import chalk from "chalk";
import mnemonicData from "./Opcodes.json";
import {toHex, hi, lo, isByteReg, isWordReg} from "z80-base";

const srcPathname = "sio_basic.asm";

/**
 * List of all flags.
 */
const FLAGS = new Set(["z", "nz", "c", "nc", "po", "pe", "p", "m"]);

/**
 * Parses one line of assembly language.
 */
class Parser {
    // Full text of line being parsed.
    private readonly line: string;
    // Address of line being parsed.
    private readonly address: number;
    // Map from constant name to value.
    private readonly constants: any;
    // Whether to ignore identifiers that we don't know about (for the first pass).
    private readonly ignoreUnknownIdentifiers: boolean;
    // Parsing index into the line.
    private i: number = 0;
    // Pointer to the token we just parsed.
    private previousToken = 0;
    // Decoded opcodes and parameters:
    public binary: number[] = [];
    // Any error found in the line.
    public error: string | undefined;

    constructor(line: string, address: number, constants: any, ignoreUnknownIdentifiers: boolean) {
        this.line = line;
        this.address = address;
        this.constants = constants;
        this.ignoreUnknownIdentifiers = ignoreUnknownIdentifiers;
    }

    public assemble(): void {
        // What value to assign to the label we parse, if any.
        let labelValue: number | undefined;

        // Look for label in column 1.
        this.i = 0;
        let label = this.readIdentifier(false, false);
        if (label !== undefined) {
            // console.log("Found label \"" + label + "\"");
            if (this.foundChar(':')) {
                // Optional colon.
            }

            // By default assign it to current address, but can be overwritten
            // by .equ below.
            labelValue = this.address;
        }

        this.skipWhitespace();
        let mnemonic = this.readIdentifier(false, true);
        if (mnemonic !== undefined && this.previousToken > 0) {
            if (mnemonic === ".byte") {
                while (true) {
                    const s = this.readString();
                    if (s !== undefined) {
                        for (let i = 0; i < s.length; i++) {
                            this.binary.push(s.charCodeAt(i));
                        }
                    } else if (this.error !== undefined) {
                        // Error parsing string.
                        return;
                    } else {
                        const value = this.readExpression();
                        if (value === undefined) {
                            if (this.error === undefined) {
                                this.error = "invalid .byte expression";
                            }
                            return;
                        }
                        this.binary.push(value);
                    }
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (mnemonic === ".word") {
                while (true) {
                    const value = this.readExpression();
                    if (value === undefined) {
                        if (this.error === undefined) {
                            this.error = "invalid .word expression";
                        }
                        return;
                    }
                    this.binary.push(lo(value));
                    this.binary.push(hi(value));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (mnemonic === ".equ") {
                const value = this.readExpression();
                if (value === undefined) {
                    this.error = "bad value for constant";
                } else if (label === undefined) {
                    this.error = "must have label for constant";
                } else {
                    // Remember constant.
                    labelValue = value;
                }
            } else {
                this.processOpCode(mnemonic);
            }
        }

        if (label !== undefined && labelValue !== undefined) {
            const oldValue = this.constants[label];
            if (oldValue !== undefined && labelValue !== oldValue) {
                // TODO should be programmer error.
                console.log("warning: changing value of \"" + label + "\" from " + toHex(oldValue, 4) +
                    " to " + toHex(labelValue, 4));
            }
            this.constants[label] = labelValue;
        }
    }

    private processOpCode(mnemonic: string): void {
        // TODO: I don't know why I need that any:
        const mnemonicInfo = (mnemonicData as any).mnemonics[mnemonic];
        if (mnemonicInfo !== undefined) {
            const argStart = this.i;
            let match = false;

            for (const variant of mnemonicInfo.variants) {
                match = true;

                for (const token of variant.tokens) {
                    if (token === "," || token === "(" || token === ")" || token === "+") {
                        if (!this.foundChar(token)) {
                            match = false;
                        }
                    } else if (token === "nn" || token === "nnnn" || token === "dd" || token === "offset") {
                        // Parse.
                        const value = this.readExpression();
                        if (value === undefined) {
                            match = false;
                        } else {
                            // Add value to binary.
                        }
                    } else {
                        // Register or flag.
                        const identifier = this.readIdentifier(true, true);
                        if (identifier !== token) {
                            match = false;
                        }
                    }

                    if (!match) {
                        break;
                    }
                }

                if (match) {
                    // See if it's the end of the line.
                    if (this.isChar(';')) {
                        // Skip rest of line.
                        this.i = this.line.length;
                    }

                    if (this.i != this.line.length) {
                        match = false;
                    }
                }

                if (match) {
                    this.binary = variant.opcode;
                    break;
                } else {
                    // Reset reader.
                    this.i = argStart;
                }
            }

            if (!match) {
                this.error = "no variant found for " + mnemonic;
            }
        } else {
            this.error = "unknown mnemonic: " + mnemonic;
        }
    }

    /**
     * Reads a string like "abc", or undefined if didn't find a string.
     * If found the beginning of a string but not the end, sets this.error
     * and returns undefined.
     */
    private readString(): string | undefined {
        // Find beginning of string.
        if (this.i === this.line.length || this.line[this.i] != '"') {
            return undefined;
        }
        this.i++;

        // Find end of string.
        const startIndex = this.i;
        while (this.i < this.line.length && this.line[this.i] !== '"') {
            this.i++;
        }

        if (this.i === this.line.length) {
            // No end quote.
            this.error = "no end quote in string";
            return undefined;
        }

        // Clip out string contents.
        const value = this.line.substring(startIndex, this.i);
        this.i++;
        this.skipWhitespace();

        return value;
    }

    private readExpression(): number | undefined {
        return this.readSum();
    }

    private readSum(): number | undefined {
        let value = 0;
        let sign = 1;

        while (true) {
            const subValue = this.readProduct();
            if (subValue === undefined) {
                return undefined;
            }
            value += sign * subValue;

            if (this.foundChar('+')) {
                sign = 1;
            } else if (this.foundChar('-')) {
                sign = -1;
            } else {
                break;
            }
        }

        return value;
    }

    private readProduct(): number | undefined {
        let value = 1;
        let isMultiply = true;

        while (true) {
            const subValue = this.readAtom();
            if (subValue === undefined) {
                return undefined;
            }
            if (isMultiply) {
                value *= subValue;
            } else {
                value /= subValue;
            }

            if (this.foundChar('*')) {
                isMultiply = true;
            } else if (this.foundChar('/')) {
                isMultiply = false;
            } else {
                break;
            }
        }

        return value;
    }

    private readAtom(): number | undefined {
        // Parenthesized expression.
        if (this.foundChar('(')) {
            const value = this.readExpression();
            if (value === undefined || !this.foundChar(')')) {
                return undefined;
            }
            return value;
        }

        // Try identifier.
        const identifier = this.readIdentifier(false, false);
        if (identifier !== undefined) {
            // Get address of identifier or value of constant.
            let value = this.constants[identifier];
            if (value === undefined) {
                if (!this.ignoreUnknownIdentifiers) {
                    this.error = "unknown identifier \"" + identifier + "\"";
                }
                value = 0;
            }
            return value;
        }

        // Try literal character, like 'a'.
        if (this.isChar("'")) {
            if (this.i > this.line.length - 3 || this.line[this.i + 2] !== "'") {
                // TODO invalid character constant, show error.
                return undefined;
            }
            const value = this.line.charCodeAt(this.i + 1);
            this.i += 3;
            this.skipWhitespace();
            return value;
        }

        // Try numeric literal.
        let base = 10;
        let sign = 1;
        let gotDigit = false;

        // Hex numbers can start with $, like $FF.
        if (this.foundChar('$')) {
            base = 16;
        }
        if (this.foundChar('-')) {
            sign = -1;
        }

        // Before we parse the number, we need to look ahead to see
        // if it ends with H, like 0FFH.
        if (base === 10) {
            const beforeIndex = this.i;
            while (this.i < this.line.length && this.parseHexDigit(this.line[this.i], 16) !== undefined) {
                this.i++;
            }
            if (this. i < this.line.length && this.line[this.i].toUpperCase() === "H") {
                base = 16;
            }
            this.i = beforeIndex;
        }
        // And again we need to look for B, like 010010101B. We can't fold this into the
        // above look since a "B" is a legal hex number!
        if (base === 10) {
            const beforeIndex = this.i;
            while (this.i < this.line.length && this.parseHexDigit(this.line[this.i], 2) !== undefined) {
                this.i++;
            }
            if (this. i < this.line.length && this.line[this.i].toUpperCase() === "B") {
                base = 2;
            }
            this.i = beforeIndex;
        }

        // Parse number.
        let value = 0;
        while (true) {
            if (this.i == this.line.length) {
                break;
            }

            const ch = this.line[this.i];
            let chValue = this.parseHexDigit(ch, base);
            if (chValue === undefined) {
                break;
            }
            value = value*base + chValue;
            gotDigit = true;
            this.i++;
        }

        if (!gotDigit) {
            // Didn't parse anything.
            return undefined;
        }

        // Check for base suffix.
        if (this.i < this.line.length) {
            const baseChar = this.line[this.i].toUpperCase();
            if (baseChar === "H") {
                // Check for programmer errors.
                if (base !== 16) {
                    throw new Error("found H at end of non-hex number");
                }
                this.i++;
            } else if (baseChar === "B") {
                // Check for programmer errors.
                if (base !== 2) {
                    throw new Error("found B at end of non-binary number");
                }
                this.i++;
            }
        }

        this.skipWhitespace();

        return sign*value;
    }

    private skipWhitespace(): void {
        while (this.i < this.line.length && (this.line[this.i] === ' ' || this.line[this.i] === '\t')) {
            this.i++;
        }
    }

    private readIdentifier(allowRegister: boolean, toLowerCase: boolean): string | undefined {
        const startIndex = this.i;

        while (this.i < this.line.length && this.isLegalIdentifierCharacter(this.line[this.i], this.i == startIndex)) {
            this.i++;
        }

        if (this.i > startIndex) {
            let identifier = this.line.substring(startIndex, this.i);
            if (toLowerCase) {
                identifier = identifier.toLowerCase();
            }
            if (!allowRegister && (isWordReg(identifier) || isByteReg(identifier) || this.isFlag(identifier))) {
                // Register names can't be identifiers.
                this.i = startIndex;
                return undefined;
            }
            this.skipWhitespace();
            this.previousToken = startIndex;
            return identifier;
        } else {
            return undefined;
        }
    }

    private isLegalIdentifierCharacter(ch: string, isFirst: boolean) {
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch == '.' || ch == '_' ||
            (!isFirst && (ch >= '0' && ch <= '9'));
    }

    private foundChar(ch: string): boolean {
        if (this.isChar(ch)) {
            this.i++;
            this.skipWhitespace();
            return true;
        } else {
            return false;
        }
    }

    private isChar(ch: string): boolean {
        return this.i < this.line.length && this.line[this.i] === ch;
    }

    private parseHexDigit(ch: string, base: number): number | undefined {
        let value = ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 0x30
            : ch >= 'A' && ch <= 'F' ? ch.charCodeAt(0) - 0x41 + 10
            : ch >= 'a' && ch <= 'f' ? ch.charCodeAt(0) - 0x61 + 10
            : undefined;

        return value === undefined || value >= base ? undefined : value;
    }

    private isFlag(s: string): boolean {
        return FLAGS.has(s.toLowerCase());
    }
}

function main() {
    const constants: any = {};
    const lines = fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/);
    for (let pass = 0; pass < 2; pass++) {
        let errorCount = 0;
        let address = 0;
        lines.forEach((line: string) => {
            const parser = new Parser(line, address, constants, pass === 0);
            parser.assemble();
            if (pass !== 0) {
                if (parser.binary.length !== 0) {
                    // Show four bytes at a time.
                    let displayAddress = address;
                    for (let i = 0; i < parser.binary.length; i += 4) {
                        let result = toHex(displayAddress, 4) + ":";
                        for (let j = 0; j < 4 && i + j < parser.binary.length; j++) {
                            result += " " + toHex(parser.binary[i + j], 2);
                            displayAddress++;
                        }
                        if (i === 0) {
                            result = result.padEnd(20, " ") + line;
                        }
                        console.log(result);
                    }
                } else {
                    console.log("                    " + chalk.gray(line));
                }
                if (parser.error !== undefined) {
                    console.log("                    " + chalk.red("error: " + parser.error));
                    errorCount += 1;
                }
            }
            address += parser.binary.length;
        });
        if (pass !== 0) {
            console.log(errorCount + " errors");
        }
    }
}

main();
