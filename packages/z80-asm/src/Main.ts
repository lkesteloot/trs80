import * as fs from "fs";
import chalk from "chalk";
import mnemonicData from "./Opcodes.json";
import {toHex} from "z80-base";

const srcPathname = "sio_basic.asm";

class Parser {
    private readonly line: string;
    // Parsing index into the line.
    private i: number = 0;
    // Pointer to the token we just parsed.
    private previousToken: number | undefined;
    // Decoded opcodes and parameters:
    public binary: number[] = [];
    public error: string | undefined;

    constructor(line: string) {
        this.line = line;
    }

    public assemble(): void {
        this.skipWhitespace();
        let mnemonicOrLabel = this.readIdentifier();
        if (mnemonicOrLabel !== undefined) {
            if (this.foundChar(':')) {
                // console.log("Found label \"" + opOrlabel + "\"");
                mnemonicOrLabel = this.readIdentifier();
            }
        }

        if (mnemonicOrLabel !== undefined) {
            if (mnemonicOrLabel === ".byte") {
                while (true) {
                    const value = this.readExpression();
                    if (value !== undefined) {
                        this.binary.push(value);
                        if (!this.foundChar(',')) {
                            break;
                        }
                    }
                }
            } else {
                this.processOpCode(mnemonicOrLabel);
            }
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
                        const identifier = this.readIdentifier();
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
        // Try identifier.
        const identifier = this.readIdentifier();
        if (identifier !== undefined) {
            // TODO Get address of identifier.
            return 0;
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
            this.i++;
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

    private readIdentifier(): string | undefined {
        this.previousToken = this.i;

        while (this.i < this.line.length && this.isLegalIdentifierCharacter(this.line[this.i], this.i == this.previousToken)) {
            this.i++;
        }

        if (this.i > this.previousToken) {
            const identifier = this.line.substring(this.previousToken, this.i).toLowerCase();
            this.skipWhitespace();
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
}

let address = 0;
let errorCount = 0;
fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
    const parser = new Parser(line);
    parser.assemble();
    if (parser.error !== undefined) {
        console.log("                    " + chalk.red(line));
        console.log("                    " + chalk.red(parser.error));
        errorCount += 1;
    } else if (parser.binary.length !== 0) {
        let result = toHex(address, 4) + " ";
        for (const byte of parser.binary) {
            result += " " + toHex(byte, 2);
        }
        result = result.padEnd(20, " ") + line;
        console.log(result);
        address += parser.binary.length;
    }
});
console.log(errorCount + " errors");
