import mnemonicData from "./Opcodes";
import {toHex, hi, lo, isByteReg, isWordReg} from "z80-base";
import {Variant} from "./OpcodesTypes";

/**
 * List of all flags.
 */
const FLAGS = new Set(["z", "nz", "c", "nc", "po", "pe", "p", "m"]);

export class ParseResults {
    // Original line.
    public line: string;
    // Address of this line.
    public address: number;
    // Decoded opcodes and parameters:
    public binary: number[] = [];
    // Any error found in the line.
    public error: string | undefined;
    // If it's an include, the filename.
    public includeFilename: string | undefined;
    // The variant of the instruction, if any.
    public variant: Variant | undefined;
    // The next address, if it was explicitly specified.
    private specifiedNextAddress: number | undefined;

    constructor(line: string, address: number) {
        this.line = line;
        this.address = address;
    }

    set nextAddress(nextAddress: number) {
        this.specifiedNextAddress = nextAddress;
    }

    get nextAddress(): number {
        // Return explicit if provided, otherwise compute.
        return this.specifiedNextAddress ?? (this.address + this.binary.length);
    }
}

/**
 * Parses one line of assembly language.
 */
export class Parser {
    // Full text of line being parsed.
    private readonly line: string;
    // Address of line being parsed.
    private readonly address: number;
    // Map from constant name to value.
    private readonly constants: any;
    // Whether to ignore identifiers that we don't know about (for the first pass).
    private readonly ignoreUnknownIdentifiers: boolean;
    // Results to the caller.
    private readonly results: ParseResults;
    // Parsing index into the line.
    private i: number = 0;
    // Pointer to the token we just parsed.
    private previousToken = 0;

    constructor(line: string, address: number, constants: any, ignoreUnknownIdentifiers: boolean) {
        this.line = line;
        this.address = address;
        this.constants = constants;
        this.ignoreUnknownIdentifiers = ignoreUnknownIdentifiers;
        this.results = new ParseResults(line, address);
    }

    public assemble(): ParseResults {
        // What value to assign to the label we parse, if any.
        let labelValue: number | undefined;

        // Look for compiler directive.
        if (this.line.trim().startsWith("#")) {
            this.parseDirective();
            return this.results;
        }

        // Look for label in column 1.
        this.i = 0;
        let label = this.readIdentifier(false, false);
        if (label !== undefined) {
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
            if (mnemonic === ".byte" || mnemonic === "defb") {
                while (true) {
                    const s = this.readString();
                    if (s !== undefined) {
                        for (let i = 0; i < s.length; i++) {
                            this.results.binary.push(s.charCodeAt(i));
                        }
                    } else if (this.results.error !== undefined) {
                        // Error parsing string.
                        return this.results;
                    } else {
                        const value = this.readExpression();
                        if (value === undefined) {
                            if (this.results.error === undefined) {
                                this.results.error = "invalid .byte expression";
                            }
                            return this.results;
                        }
                        this.results.binary.push(value);
                    }
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (mnemonic === ".word" || mnemonic === "defw") {
                while (true) {
                    const value = this.readExpression();
                    if (value === undefined) {
                        if (this.results.error === undefined) {
                            this.results.error = "invalid .word expression";
                        }
                        return this.results;
                    }
                    this.results.binary.push(lo(value));
                    this.results.binary.push(hi(value));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (mnemonic === ".equ" || mnemonic === "equ") {
                const value = this.readExpression();
                if (value === undefined) {
                    this.results.error = "bad value for constant";
                } else if (label === undefined) {
                    this.results.error = "must have label for constant";
                } else {
                    // Remember constant.
                    labelValue = value;
                }
            } else if (mnemonic === ".org") {
                const startAddress = this.readExpression();
                if (startAddress === undefined) {
                    this.results.error = "start address expected";
                } else {
                    this.results.nextAddress = startAddress;
                }
            } else {
                this.processOpCode(mnemonic);
            }
        }

        // Make sure there's no extra junk.
        this.ensureEndOfLine();

        if (label !== undefined && labelValue !== undefined) {
            const oldValue = this.constants[label];
            if (oldValue !== undefined && labelValue !== oldValue) {
                // TODO should be programmer error.
                console.log("warning: changing value of \"" + label + "\" from " + toHex(oldValue, 4) +
                    " to " + toHex(labelValue, 4));
            }
            this.constants[label] = labelValue;
        }

        return this.results;
    }

    // Make sure there's no junk at the end of the line.
    private ensureEndOfLine(): void {
        // Check for comment.
        if (this.isChar(';')) {
            // Skip rest of line.
            this.i = this.line.length;
        }
        if (this.i != this.line.length) {
            this.results.error = "syntax error";
        }
    }

    private parseDirective(): void {
        this.skipWhitespace();
        if (!this.foundChar('#')) {
            // Logic error.
            throw new Error("did not find # for directive");
        }
        const directive = this.readIdentifier(true, true);
        if (directive === undefined || directive === "") {
            this.results.error = "must specify directive after #";
            return;
        }

        switch (directive) {
            case "target":
                const target = this.readIdentifier(false, true);
                // Ignore for now. Target can be "bin" or "rom", which basically mean raw
                // binary with a different default for unspecified bytes (0x00 and 0xFF
                // respectively), and plenty of other types we have no interest in.
                break;

            case "code":
                const segmentName = this.readIdentifier(true, false);
                if (segmentName === undefined) {
                    this.results.error = "segment name expected";
                } else if (this.foundChar(',')) {
                    const startAddress = this.readExpression();
                    if (startAddress === undefined) {
                        this.results.error = "start address expected";
                    } else {
                        this.results.nextAddress = startAddress;

                        if (this.foundChar(',')) {
                            const length = this.readExpression();
                            if (length === undefined) {
                                this.results.error = "length expected";
                            }
                        }
                    }
                }
                break;

            case "include":
                const filename = this.readString();
                if (filename === undefined) {
                    this.results.error = "missing included filename";
                } else {
                    this.results.includeFilename = filename;
                }
                break;

            default:
                this.results.error = "unknown directive #" + directive;
                break;
        }

        // Make sure there's no extra junk.
        this.ensureEndOfLine();
    }

    private processOpCode(mnemonic: string): void {
        const mnemonicInfo = mnemonicData.mnemonics[mnemonic];
        if (mnemonicInfo !== undefined) {
            const argStart = this.i;
            let match = false;

            for (const variant of mnemonicInfo.variants) {
                // Map from something like "nn" to its value.
                const args: any = {};

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
                            if (args[token] !== undefined) {
                                throw new Error("duplicate arg: " + this.line);
                            }
                            args[token] = value;
                        }
                    } else if (this.parseHexDigit(token[0], 10) !== undefined) {
                        // If the token is a number, then we must parse an expression and
                        // compare the values. This is used for BIT, SET, RES, RST, IM, and one
                        // variant of OUT (OUT (C), 0).
                        const expectedValue = parseInt(token, 10);
                        const actualValue = this.readExpression();
                        if (expectedValue !== actualValue) {
                            match = false;
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
                    if (this.i < this.line.length && !this.isChar(';')) {
                        match = false;
                    }
                }

                if (match) {
                    this.results.binary = [];
                    for (const op of variant.opcode) {
                        if (typeof(op) === "string") {
                            const value = args[op];
                            if (value === undefined) {
                                throw new Error("arg " + op + " not found for " + this.line);
                            }
                            switch (op) {
                                case "nnnn":
                                    this.results.binary.push(lo(value));
                                    this.results.binary.push(hi(value));
                                    break;

                                case "nn":
                                case "dd":
                                    this.results.binary.push(lo(value));
                                    break;

                                case "offset":
                                    this.results.binary.push(lo(value - this.results.address - this.results.binary.length - 1));
                                    break;

                                default:
                                    throw new Error("Unknown arg type " + op);
                            }
                        } else {
                            this.results.binary.push(op);
                        }
                    }
                    this.results.variant = variant;
                    break;
                } else {
                    // Reset reader.
                    this.i = argStart;
                }
            }

            if (!match) {
                this.results.error = "no variant found for " + mnemonic;
            }
        } else {
            this.results.error = "unknown mnemonic: " + mnemonic;
        }
    }

    /**
     * Reads a string like "abc", or undefined if didn't find a string.
     * If found the beginning of a string but not the end, sets this.results.error
     * and returns undefined.
     */
    private readString(): string | undefined {
        // Find beginning of string.
        if (this.i === this.line.length || (this.line[this.i] !== '"' && this.line[this.i] !== "'")) {
            return undefined;
        }
        const quoteChar = this.line[this.i];
        this.i++;

        // Find end of string.
        const startIndex = this.i;
        while (this.i < this.line.length && this.line[this.i] !== quoteChar) {
            this.i++;
        }

        if (this.i === this.line.length) {
            // No end quote.
            this.results.error = "no end quote in string";
            return undefined;
        }

        // Clip out string contents.
        const value = this.line.substring(startIndex, this.i);
        this.i++;
        this.skipWhitespace();

        return value;
    }

    private readExpression(): number | undefined {
        // Expressions can't start with an open parenthesis because that's ambiguous
        // with dereferencing.
        if (this.line[this.i] === '(') {
            return undefined;
        }

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
            const subValue = this.readShift();
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

    private readShift(): number | undefined {
        let value = 0;
        let op = "";

        while (true) {
            const subValue = this.readAtom();
            if (subValue === undefined) {
                return undefined;
            }

            if (op === "<<") {
                value <<= subValue;
            } else if (op === ">>") {
                value >>= subValue;
            } else {
                value = subValue;
            }

            op = this.line.substr(this.i, 2);
            if (op === "<<" || op === ">>") {
                this.i += 2;
                this.skipWhitespace();
            } else {
                break;
            }
        }

        return value;
    }

    private readAtom(): number | undefined {
        const startIndex = this.i;

        // Parenthesized expression.
        if (this.foundChar('(')) {
            const value = this.readSum();
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
                    this.results.error = "unknown identifier \"" + identifier + "\"";
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

        if (this.foundChar('-')) {
            sign = -1;
        }

        // Hex numbers can start with $, like $FF.
        if (this.foundChar('$')) {
            if (this.i === this.line.length || this.parseHexDigit(this.line[this.i], 16) === undefined) {
                // It's a reference to the current address, not a hex prefix.
                return sign*this.results.address;
            }

            base = 16;
        } else if (this.foundChar('%')) {
            base = 2;
        }

        // Before we parse the number, we need to look ahead to see
        // if it ends with H, like 0FFH.
        if (base === 10) {
            const beforeIndex = this.i;
            while (this.i < this.line.length && this.parseHexDigit(this.line[this.i], 16) !== undefined) {
                this.i++;
            }
            if (this.i < this.line.length && this.line[this.i].toUpperCase() === "H") {
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
            if (this.i < this.line.length && this.line[this.i].toUpperCase() === "B" &&
                // "B" can't be followed by hex digit, or it's not the final character.
                (this.i === this.line.length || this.parseHexDigit(this.line[this.i + 1], 16) === undefined)) {

                base = 2;
            }
            this.i = beforeIndex;
        }

        // Look for 0x or 0b prefix. Must do this after above checks so that we correctly
        // mark "0B1H" as hex and not binary.
        if (base === 10 && this.i + 2 < this.line.length && this.line[this.i] === '0') {
            if (this.line[this.i + 1].toLowerCase() == 'x') {
                base = 16;
                this.i += 2;
            } else if (this.line[this.i + 1].toLowerCase() == 'b' &&
                // Must check next digit to distinguish from just "0B".
                this.parseHexDigit(this.line[this.i + 2], 2) !== undefined) {

                base = 2;
                this.i += 2;
            }
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
            value = value * base + chValue;
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
                    throw new Error("found H at end of non-hex number: " + this.line.substring(startIndex, this.i + 1));
                }
                this.i++;
            } else if (baseChar === "B") {
                // Check for programmer errors.
                if (base !== 2) {
                    throw new Error("found B at end of non-binary number: " + this.line.substring(startIndex, this.i + 1));
                }
                this.i++;
            }
        }

        this.skipWhitespace();

        return sign * value;
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
