
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
        let opOrlabel = this.readIdentifier();
        if (opOrlabel !== undefined) {
            if (this.foundChar(':')) {
                console.log("Found label \"" + opOrlabel + "\"");
                opOrlabel = this.readIdentifier();
            }
        }

        if (opOrlabel !== undefined) {
            // TODO: I don't know why I need that any:
            const mnemonicInfo = (mnemonicData as any).mnemonics[opOrlabel];
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
                        } else if (token === "nn" || token === "nnnn" || token === "dd") {
                            // Parse.
                            match = false;
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
                    this.error = "no variant found for " + opOrlabel;
                }
            } else {
                this.error = "unknown mnemonic: " + opOrlabel;
            }
        }
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
}

let address = 0;
fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
    console.log("                 " + chalk.gray(line));
    const parser = new Parser(line);
    parser.assemble();
    if (parser.error !== undefined) {
        console.log("                 " + chalk.red(parser.error));
    } else if (parser.binary.length !== 0) {
        let result = toHex(address, 4) + " ";
        for (const byte of parser.binary) {
            result += " " + toHex(byte, 2);
        }
        result = result.padEnd(17, " ") + line;
        console.log(result);
        address += parser.binary.length;
    }
});
