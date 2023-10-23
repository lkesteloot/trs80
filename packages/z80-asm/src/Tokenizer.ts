import {isByteReg, isWordReg } from "z80-base";

/**
 * List of all flags that can be specified in an instruction.
 */
const FLAGS = new Set(["z", "nz", "c", "nc", "po", "pe", "p", "m"]);

// Whether the specified character counts as horizontal whitespace.
function isWhitespace(c: string): boolean {
    return c === " " || c === "\t";
}

export function isLegalIdentifierCharacter(ch: string, isFirst: boolean) {
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch == '.' || ch == '_' ||
        (!isFirst && (ch >= '0' && ch <= '9'));
}

function isFlag(s: string): boolean {
    return FLAGS.has(s.toLowerCase());
}

/**
 * Parse a single digit in the given base, or undefined if the digit does not
 * belong to that base.
 */
export function parseDigit(ch: string, base: number): number | undefined {
    let value = ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 0x30
        : ch >= 'A' && ch <= 'F' ? ch.charCodeAt(0) - 0x41 + 10
            : ch >= 'a' && ch <= 'f' ? ch.charCodeAt(0) - 0x61 + 10
                : undefined;

    return value === undefined || value >= base ? undefined : value;
}

export class Tokenizer {
    // Full text of line being parsed.
    public readonly line: string;
    // Parsing index into the line.
    public column: number = 0;
    // Column of the identifier we just parsed.
    public identifierColumn = 0;

    constructor(line: string) {
        this.line = line;
    }

    // Advance the parser to the end of the line.
    public skipToEndOfLine(): void {
        this.column = this.line.length;
    }

    // Return all the text on the rest of the line.
    public readToEndOfLine(): string {
        const s = this.line.substring(this.column);
        this.skipToEndOfLine();
        return s;
    }

    // Whether we're at a comment or the end of the line. Assumes we've already skipped whitespace.
    public isEndOfLine(): boolean {
        return this.matches(";") || this.column === this.line.length;
    }

    /**
     * Skip comment and return whether we're really at the end of the line.
     */
    public ensureEndOfLine(): boolean {
        // Check for comment.
        if (this.matches(';')) {
            // Skip rest of line.
            this.column = this.line.length;
        }
        return this.column == this.line.length;
    }

    /**
     * If the next part of the line matches the parameter, skip it and subsequent whitespace and return true.
     * Else returns false.
     */
    public found(s: string): boolean {
        if (this.matches(s)) {
            this.column += s.length;
            this.skipWhitespace();
            return true;
        } else {
            return false;
        }
    }

    /**
     * If any of the specified strings is next, it is skipped (and subsequent whitespace) and returned.
     * Else undefined is returned.
     */
    public foundAnyOf(ss: string[]): string | undefined {
        for (const s of ss) {
            if (this.found(s)) {
                return s;
            }
        }

        return undefined;
    }

    /**
     * Whether the next part of the line matches the passed-in string. Does not advance.
     */
    public matches(s: string): boolean {
        return this.line.startsWith(s, this.column);
    }

    /**
     * Advance past any horizontal whitespace.
     */
    public skipWhitespace(): void {
        while (this.column < this.line.length && isWhitespace(this.line[this.column])) {
            this.column++;
        }
    }

    public readIdentifier(allowRegister: boolean, toLowerCase: boolean): string | undefined {
        const startColumn = this.column;

        // Skip through the identifier.
        while (this.column < this.line.length && isLegalIdentifierCharacter(this.line[this.column], this.column === startColumn)) {
            this.column++;
        }

        if (this.column === startColumn) {
            return undefined;
        }

        let identifier = this.line.substring(startColumn, this.column);
        if (toLowerCase) {
            identifier = identifier.toLowerCase();
        }
        // Special case to parse AF'.
        if (allowRegister && identifier.toLowerCase() === "af" && this.found("'")) {
            identifier += "'";
        }
        if (!allowRegister && (isWordReg(identifier) || isByteReg(identifier) || isFlag(identifier))) {
            // Register names can't be identifiers.
            this.column = startColumn;
            return undefined;
        }
        this.skipWhitespace();
        this.identifierColumn = startColumn;
        return identifier;
    }

    /**
     * If the next identifier matches the given one, return it.
     */
    public foundIdentifier(identifier: string, toLowerCase: boolean): boolean {
        const beforeColumn = this.column;
        const foundIdentifier = this.readIdentifier(false, toLowerCase);
        if (foundIdentifier === identifier) {
            return true;
        }

        // Back up.
        this.column = beforeColumn;
        return false;
    }

    /**
     * Reads a string like "abc", or undefined if didn't find a string.
     * If found the beginning of a string but not the end, throws an Error.
     */
    public readString(): string | undefined {
        // Find beginning of string.
        if (this.column === this.line.length || (this.line[this.column] !== '"' && this.line[this.column] !== "'")) {
            return undefined;
        }
        const quoteChar = this.line[this.column];
        this.column++;

        // Find end of string.
        const startIndex = this.column;
        while (this.column < this.line.length && this.line[this.column] !== quoteChar) {
            this.column++;
        }

        if (this.column === this.line.length) {
            // No end quote.
            throw new Error("no end quote in string");
        }

        // Clip out string contents.
        const value = this.line.substring(startIndex, this.column);
        this.column++;
        this.skipWhitespace();

        return value;
    }

    /**
     * Reads a single-quoted character constant, like 'A', and returns its
     * unicode value, in this case 65. Returns undefined if this is not
     * a character constant. Throws if it's a mis-formatted character constant.
     */
    public readCharConstant(): number | undefined {
        if (!this.matches("'")) {
            return undefined;
        }

        if (this.column > this.line.length - 3 || this.line[this.column + 2] !== "'") {
            throw new Error("invalid character constant");
        }
        const value = this.line.charCodeAt(this.column + 1);
        this.column += 3;
        this.skipWhitespace();
        return value;
    }

    /**
     * Reads a macro argument (a string including the quotes, an argument in angle brackets
     * not including the brackets, or whatever's until the next comma). Throws if there's
     * an unbalanced quote or angle bracket.
     */
    public readMacroArg(): string {
        let arg: string | undefined;

        if (this.matches("\"") || this.matches("'")) {
            const begin = this.column;
            // Read the string but we pull it out ourselves since we need the quotes.
            // This might throw if there's no end quote.
            this.readString();
            arg = this.line.substring(begin, this.column).trim();
        } else if (this.matches("<")) {
            this.column++;
            const begin = this.column;
            while (this.column < this.line.length && this.line[this.column] !== ">") {
                this.column++;
            }
            if (this.column === this.line.length) {
                throw new Error("Missing > after < in macro argument");
            }
            arg = this.line.substring(begin, this.column);
            this.column++;
            this.skipWhitespace();
        } else {
            // Read to next comma.
            const begin = this.column;
            while (this.column < this.line.length && !this.matches(",") && !this.matches(";")) {
                this.column++;
            }
            arg = this.line.substring(begin, this.column).trim();
            this.skipWhitespace();
        }

        return arg;
    }

    /**
     * Reads a numeric constant, like 1234, and returns its value. Handles the
     * following formats:
     *
     * Decimal: 1234
     * Binary: 0b1010, 1010b, %1010
     * Octal: 0o1234, 1234o
     * Hex: 0x1234, 1234h, $1234
     * Current line address: $ or -$
     *
     * @param address the current line's address, in case the $ is actually a reference
     * to that and not a hex prefix.
     */
    public readNumericConstant(address: number): number | undefined {
        const startColumn = this.column;

        let base = 10;
        let sign = 1;

        if (this.found('-')) {
            sign = -1;
        }

        // Hex numbers can start with $, like $FF.
        if (this.found('$')) {
            if (this.column === this.line.length || parseDigit(this.line[this.column], 16) === undefined) {
                // It's a reference to the current address, not a hex prefix.
                return sign*address;
            }

            base = 16;
        } else if (this.found('%')) {
            base = 2;
        }

        // Before we parse the number, we need to look ahead to see
        // if it ends with H, like 0FFH.
        if (base === 10) {
            const saveColumn = this.column;
            while (this.column < this.line.length && parseDigit(this.line[this.column], 16) !== undefined) {
                this.column++;
            }
            if (this.column < this.line.length && this.line[this.column].toUpperCase() === "H") {
                base = 16;
            }
            this.column = saveColumn;
        }
        // Before we parse the number, we need to look ahead to see
        // if it ends with O, like 123O.
        if (base === 10) {
            const saveColumn = this.column;
            while (this.column < this.line.length && parseDigit(this.line[this.column], 8) !== undefined) {
                this.column++;
            }
            if (this.column < this.line.length && this.line[this.column].toUpperCase() === "O" &&
                // "O" can't be followed by octal digit, or it's not the final character.
                (this.column === this.line.length || parseDigit(this.line[this.column + 1], 8) === undefined)) {

                base = 8;
            }
            this.column = saveColumn;
        }
        // And again we need to look for B, like 010010101B. We can't fold this into the
        // above since a "B" is a legal hex number!
        if (base === 10) {
            const saveColumn = this.column;
            while (this.column < this.line.length && parseDigit(this.line[this.column], 2) !== undefined) {
                this.column++;
            }
            if (this.column < this.line.length && this.line[this.column].toUpperCase() === "B" &&
                // "B" can't be followed by hex digit, or it's not the final character.
                (this.column === this.line.length || parseDigit(this.line[this.column + 1], 16) === undefined)) {

                base = 2;
            }
            this.column = saveColumn;
        }

        // Look for 0x, 0o, or 0b prefix. Must do this after above checks so that we correctly
        // mark "0B1H" as hex and not binary.
        if (base === 10 && this.column + 2 < this.line.length && this.line[this.column] === '0') {
            if (this.line[this.column + 1].toLowerCase() == 'x') {
                base = 16;
                this.column += 2;
            } else if (this.line[this.column + 1].toLowerCase() == 'o') {
                base = 8;
                this.column += 2;
            } else if (this.line[this.column + 1].toLowerCase() == 'b' &&
                // Must check next digit to distinguish from just "0B".
                parseDigit(this.line[this.column + 2], 2) !== undefined) {

                base = 2;
                this.column += 2;
            }
        }

        // Parse number.
        let gotDigit = false;
        let value = 0;
        while (this.column < this.line.length) {
            const ch = this.line[this.column];
            let chValue = parseDigit(ch, base);
            if (chValue === undefined) {
                break;
            }
            value = value * base + chValue;
            gotDigit = true;
            this.column++;
        }

        if (!gotDigit) {
            if (this.column !== startColumn) {
                // Saw some prefix but no digits after that.
                throw new Error("invalid number");
            }

            // Parsed nothing.
            return undefined;
        }

        // Check for base suffix.
        if (this.column < this.line.length) {
            const baseChar = this.line[this.column].toUpperCase();
            if (baseChar === "H") {
                // Check for programmer errors.
                if (base !== 16) {
                    throw new Error("found H at end of non-hex number: " + this.line.substring(startColumn, this.column + 1));
                }
                this.column++;
            } else if (baseChar === "O") {
                // Check for programmer errors.
                if (base !== 8) {
                    throw new Error("found O at end of non-octal number: " + this.line.substring(startColumn, this.column + 1));
                }
                this.column++;
            } else if (baseChar === "B") {
                // Check for programmer errors.
                if (base !== 2) {
                    throw new Error("found B at end of non-binary number: " + this.line.substring(startColumn, this.column + 1));
                }
                this.column++;
            }
        }

        this.skipWhitespace();

        return sign * value;
    }
}
