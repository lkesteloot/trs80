
import * as fs from "fs";
import chalk from "chalk";

const srcPathname = "sio_basic.asm";

class Parser {
    private line: string;
    // Parsing index into the line.
    private i: number = 0;
    // Pointer to the token we just parsed.
    private previousToken: number | undefined;

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
            console.log("Found directive or op: " + opOrlabel);
        }

        if (this.isChar(';')) {
            // Skip rest of line.
            this.i = this.line.length;
        }

        if (this.i !== this.line.length) {
            console.log(chalk.red("syntax error"));
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

fs.readFileSync(srcPathname, "utf-8").split(/\r?\n/).forEach((line: string) => {
    console.log(chalk.gray(line));
    const parser = new Parser(line);
    parser.assemble();
});
