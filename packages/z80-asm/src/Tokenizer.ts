import {isByteReg, isWordReg } from "z80-base";

// Whether to support "%1010" syntax for binary numbers. Zmac doesn't and this
// conflicts with % for modulo. (Though I don't think there's any syntactic
// ambiguity, it does make it harder to tokenize a line without parsing it.)
const SUPPORT_PERCENT_BINARY = false;

/**
 * List of all flags that can be specified in an instruction.
 */
const FLAGS = new Set([
    "z", "nz", "c", "nc", "po", "pe", "p", "m",
    "v", "nv", // Aliases for pe and po.
]);

/**
 * Regular expressions to match various token types.
 */
const SYMBOL_RE = /^(?:<<|>>|<>|&&|==|!=|<=|>=|\|\||[-$~+*/^%!()&|?:,=<>#])/;
const IDENTIFIER_RE = /^\.?[a-zA-Z_][a-zA-Z0-9_]*/;

// Whether the specified character counts as horizontal whitespace.
function isWhitespace(c: string): boolean {
    return c === " " || c === "\t";
}

export function isLegalIdentifierCharacter(ch: string, isFirst: boolean) { // TODO remove
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch == '.' || ch == '_' ||
        (!isFirst && (ch >= '0' && ch <= '9'));
}

function isFlag(s: string): boolean {
    return FLAGS.has(s.toLowerCase());
}

// Advances past whitespace, returning the position of the next non-whitespace character.
function skipWhitespace(s: string, pos: number): number {
    while (pos < s.length && isWhitespace(s[pos])) {
        pos += 1;
    }

    return pos;
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

/**
 * Reads a string like "abc", or undefined if didn't find a string.
 */
function readString(s: string, pos: number): { value: string, end: number, error: string | undefined } | undefined {
    // Find beginning of string.
    if (s[pos] !== '"' && s[pos] !== "'") {
        return undefined;
    }
    const quoteChar = s[pos];
    pos++;

    const parts: string[] = [];
    while (true) {
        if (pos >= s.length) {
            // No end quote.
            break;
        }
        if (s[pos] === quoteChar) {
            // Allow doubled quote char to mean single quote char.
            if (pos + 1 < s.length && s[pos + 1] === quoteChar) {
                // Pick up the second one.
                pos++;
            } else {
                break;
            }
        }
        parts.push(s[pos]);
        pos++;
    }

    const value = parts.join("");
    pos++;

    return {
        value,
        end: pos,
        error: pos <= s.length ? undefined : "string is missing end quote"
    };
}

/**
 * Reads a numeric constant, like 1234, and returns its value. Handles the
 * following formats:
 *
 * Decimal: 1234
 * Binary: 0b1010, 1010b, %1010
 * Octal: 0o1234, 1234o
 * Hex: 0x1234, 1234h, $1234
 *
 * Does not handle negative numbers.
 */
function readNumericLiteral(s: string): { value: number, end: number, error: string | undefined } | undefined {
    let pos = 0;

    // Hex numbers can start with $, like $FF.
    let base = 10;
    if (pos < s.length && s[pos] === "$") {
        pos += 1;
        // Don't skip whitespace.

        if (pos === s.length || parseDigit(s[pos], 16) === undefined) {
            // Not a hex prefix, probably a reference to the current address.
            return undefined;
        }

        base = 16;
    } else if (SUPPORT_PERCENT_BINARY && pos < s.length && s[pos] === "%") {
        pos += 1;
        // Don't skip whitespace.
        base = 2;
    }

    // Before we parse the number, we need to look ahead to see
    // if it ends with H, like 0FFH. Must start with decimal digit.
    if (base === 10 && parseDigit(s[pos], 10) !== undefined) {
        const saveColumn = pos;
        while (pos < s.length && parseDigit(s[pos], 16) !== undefined) {
            pos++;
        }
        if (pos < s.length && s[pos].toUpperCase() === "H") {
            base = 16;
        }
        pos = saveColumn;
    }

    // Before we parse the number, we need to look ahead to see
    // if it ends with O, like 123O.
    if (base === 10) {
        const saveColumn = pos;
        while (pos < s.length && parseDigit(s[pos], 8) !== undefined) {
            pos++;
        }
        if (pos < s.length && s[pos].toUpperCase() === "O" &&
            // "O" can't be followed by octal digit, or it's not the final character.
            (pos === s.length || parseDigit(s[pos + 1], 8) === undefined)) {

            base = 8;
        }
        pos = saveColumn;
    }

    // And again we need to look for B, like 010010101B. We can't fold this into the
    // above since a "B" is a legal hex number!
    if (base === 10) {
        const saveColumn = pos;
        while (pos < s.length && parseDigit(s[pos], 2) !== undefined) {
            pos++;
        }
        if (pos < s.length && s[pos].toUpperCase() === "B" &&
            // "B" can't be followed by hex digit, or it's not the final character.
            (pos === s.length || parseDigit(s[pos + 1], 16) === undefined)) {

            base = 2;
        }
        pos = saveColumn;
    }

    // Look for 0x, 0o, or 0b prefix. Must do this after above checks so that we correctly
    // mark "0B1H" as hex and not binary.
    if (base === 10 && pos + 2 < s.length && s[pos] === '0') {
        if (s[pos + 1].toLowerCase() == 'x') {
            base = 16;
            pos += 2;
        } else if (s[pos + 1].toLowerCase() == 'o') {
            base = 8;
            pos += 2;
        } else if (s[pos + 1].toLowerCase() == 'b' &&
            // Must check next digit to distinguish from just "0B".
            parseDigit(s[pos + 2], 2) !== undefined) {

            base = 2;
            pos += 2;
        }
    }
    
    // Parse number.
    let gotDigit = false;
    let value = 0;
    while (pos < s.length) {
        const ch = s[pos];
        let chValue = parseDigit(ch, base);
        if (chValue === undefined) {
            break;
        }
        value = value * base + chValue;
        gotDigit = true;
        pos++;
    }

    if (!gotDigit) {
        if (pos !== 0) {
            // Saw some prefix but no digits after that.
            return {
                value,
                end: pos,
                error: "invalid number",
            };
        }

        // Parsed nothing.
        return undefined;
    }

    // Check for base suffix.
    let error: string | undefined = undefined;
    if (pos < s.length) {
        const baseChar = s[pos].toUpperCase();
        if (baseChar === "H") {
            // Check for programmer errors.
            if (base !== 16) {
                error = "found H at end of non-hex number: " + s.substring(0, pos + 1);
            } else {
                pos++;
            }
        } else if (baseChar === "O") {
            // Check for programmer errors.
            if (base !== 8) {
                error = "found O at end of non-octal number: " + s.substring(0, pos + 1);
            } else {
                pos++;
            }
        } else if (baseChar === "B") {
            // Check for programmer errors.
            if (base !== 2) {
                error = "found B at end of non-binary number: " + s.substring(0, pos + 1);
            } else {
                pos++;
            }
        }
    }

    return {
        value,
        end: pos,
        error: error,
    };
}

type Token = {
    /**
     * Position (inclusive) in line where token begins.
     */
    begin: number;

    /**
     * Position (exclusive) in line where token ends.
     */
    end: number;

    /**
     * Full text of the token, as it appears in the line.
     */
    text: string;

    /**
     * Optional error while reading the token.
     */
    error: string | undefined;
} & (
    {
        tag: "symbol" | "identifier" | "error";
    } | {
        tag: "string" | "comment";
        value: string;
    } | {
        tag: "number";
        value: number;
    }
);

/**
 * Return the token at the position in the string.
 */
function tokenAt(s: string, pos: number): Token {
    s = s.substring(pos);

    if (s === "") {
        // TODO make this an exception.
    }

    // Number literals. Do this before symbols because $ could be a reference to the current address.
    const numberInfo = readNumericLiteral(s);
    if (numberInfo !== undefined) {
        return {
            tag: "number",
            begin: pos,
            end: pos + numberInfo.end,
            text: s.substring(0, numberInfo.end),
            value: numberInfo.value,
            error: numberInfo.error,
        };
    }

    // Symbols like + and <<.
    let m = SYMBOL_RE.exec(s);
    if (m !== null) {
        return {
            tag: "symbol",
            begin: pos,
            end: pos + m[0].length,
            text: m[0],
            error: undefined,
        };
    }

    // Identifiers like "main" and "mod".
    m = IDENTIFIER_RE.exec(s);
    if (m !== null) {
        return {
            tag: "identifier",
            begin: pos,
            end: pos + m[0].length,
            text: m[0],
            error: undefined,
        };
    }

    // Strings, both single- and double-quoted, and both full strings and characters.
    const stringInfo = readString(s, 0);
    if (stringInfo !== undefined) {
        return {
            tag: "string",
            begin: pos,
            end: pos + stringInfo.end,
            text: s.substring(0, stringInfo.end),
            value: stringInfo.value,
            error: stringInfo.error,
        };
    }

    // Comments.
    if (s[0] === ";") {
        return {
            tag: "comment",
            begin: pos,
            end: pos + s.length,
            text: s,
            value: s.substring(1).trim(),
            error: undefined,
        };
    }

    // Error, one character wide so that we advance. We could also go to the next whitespace or
    // to the end of the line. It's likely just a single symbol.
    return {
        tag: "error",
        begin: pos,
        end: pos + 1,
        text: s[0],
        error: "invalid character \"" + s[0] + "\"",
    };
}

function tokenizeLine(line: string): Token[] {
    const tokens: Token[] = [];

    let pos = 0;
    while (pos < line.length) {
        // Skip whitespace.
        while (pos < line.length && isWhitespace(line[pos])) {
            pos++;
        }

        // Get next token. This always advances.
        if (pos < line.length) {
            const token = tokenAt(line, pos);
            tokens.push(token);
            if (token.end <= pos) {
                throw new Error("token did not advance: " + token);
            }
            pos = token.end;
        }
    }

    return tokens;
}

export class Tokenizer {
    // Full text of line being parsed.
    public readonly line: string;
    // Parsed tokens.
    public readonly tokens: Token[];
    // Parsing index into the line.
    public column: number = 0;
    // Parsing index into token list.
    public tokenIndex = 0;
    // Column of the identifier we just parsed.
    public identifierColumn = 0;

    constructor(line: string) {
        this.line = line;
        this.tokens = tokenizeLine(line);
        //console.log(this.tokens);
    }

    // Advance the parser to the end of the line.
    public skipToEndOfLine(): void {
        this.column = this.line.length;
        this.tokenIndex = this.tokens.length;
    }

    // Return all the text on the rest of the line.
    public readToEndOfLine(): string {
        const s = this.line.substring(this.column);
        this.skipToEndOfLine();
        return s;
    }

    // Whether we're at a comment or the end of the line. Assumes we've already skipped whitespace.
    public isEndOfLine(): boolean {
        return this.tokenIndex === this.tokens.length || this.tokens[this.tokenIndex].tag === "comment";
    }

    /**
     * Skip comment and return whether we're really at the end of the line.
     */
    public ensureEndOfLine(): boolean {
        // Check for comment.
        while (this.tokenIndex < this.tokens.length && this.tokens[this.tokenIndex].tag === "comment") {
            this.tokenIndex += 1;
        }
        return this.tokenIndex === this.tokens.length;
    }

    /**
     * If the next part of the line matches the parameter, skip it and subsequent whitespace and return true.
     * Else returns false.
     */
    public found(s: string): boolean {
        if (this.matches(s)) {
            this.column += s.length;
            this.skipWhitespace();
            this.tokenIndex += 1;
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
    public matches(expectedToken: string): boolean {
        /*
        const actualToken = tokenAt(this.line, this.column);
        return actualToken.text?.toLowerCase() === expectedToken && actualToken.error === undefined;

         */
        if (this.tokenIndex >= this.tokens.length) {
            return false;
        }
        const token = this.tokens[this.tokenIndex];
        return token.text.toLowerCase() === expectedToken && token.error === undefined;
    }

    /**
     * Advance past any horizontal whitespace.
     */
    public skipWhitespace(): void {
        this.column = skipWhitespace(this.line, this.column);
    }

    public readIdentifier(allowRegister: boolean, toLowerCase: boolean): string | undefined {
        // TODO everything in assembly is case-insensitive.
        toLowerCase = true;
        if (this.tokenIndex >= this.tokens.length) {
            return undefined;
        }
        const token = this.tokens[this.tokenIndex];
        if (token.error !== undefined) {
            return undefined;
        }
        if (token.tag !== "identifier") {
            return undefined;
        }
        let identifier = token.text;
        if (toLowerCase) {
            identifier = identifier.toLowerCase();
        }
        if (!allowRegister && (isWordReg(identifier) || isByteReg(identifier) || isFlag(identifier))) {
            // Register names can't be identifiers.
            return undefined;
        }

        this.identifierColumn = token.begin;
        this.tokenIndex += 1;
        this.column = token.end;
        this.skipWhitespace();

        return identifier;
    }

    /**
     * If the next identifier matches the given one, return it.
     */
    public foundIdentifier(identifier: string, toLowerCase: boolean): boolean {
        const beforeColumn = this.column;
        const beforeTokenIndex = this.tokenIndex;
        const foundIdentifier = this.readIdentifier(false, toLowerCase);
        if (foundIdentifier === identifier) {
            return true;
        }

        // Back up.
        this.column = beforeColumn;
        this.tokenIndex = beforeTokenIndex;
        return false;
    }

    /**
     * Reads a string like "abc", or undefined if didn't find a string.
     * If found the beginning of a string but not the end, throws an Error.
     */
    public readString(): string | undefined {
        if (this.tokenIndex >= this.tokens.length) {
            return undefined;
        }
        const token = this.tokens[this.tokenIndex];
        if (token.error !== undefined || token.tag !== "string") {
            return undefined;
        }

        this.tokenIndex += 1;
        this.column = token.end;
        this.skipWhitespace();

        return token.value;
    }

    /**
     * Reads a single-quoted character constant, like 'A' or "A", and returns its
     * unicode value, in this case 65. Returns undefined if this is not
     * a character constant. Throws if it's a mis-formatted character constant.
     */
    public readCharConstant(): number | undefined {
        if (this.tokenIndex >= this.tokens.length) {
            return undefined;
        }
        const token = this.tokens[this.tokenIndex];
        if (token.error !== undefined || token.tag !== "string") {
            return undefined;
        }
        if (token.value.length !== 1) {
            throw new Error("invalid character constant");
        }
        this.tokenIndex += 1;
        this.column = token.end;
        this.skipWhitespace();

        return token.value.charCodeAt(0);
    }

    /**
     * We don't use tokens when parsing macro arguments, they're treated textually
     * and re-tokenized when assembled within the macro.
     *
     * Reads all macro arguments, each of which can be a string including the quotes,
     * an argument in angle brackets not including the brackets, or whatever's until the
     * next comma).
     *
     * Throws if there's an unbalanced quote or angle bracket.
     *
     * Leaves the tokenizer at the end of the line or the start of a comment.
     */
    public readMacroArgs(): string[] {
        const args: string[] = [];

        if (this.tokenIndex >= this.tokens.length) {
            return args;
        }

        let pos = this.tokens[this.tokenIndex].begin;
        const line = this.line;

        while (pos < line.length && line[pos] != ";") {
            // We've skipped whitespace.
            let arg: string;

            const stringInfo = readString(line, pos);
            if (stringInfo !== undefined) {
                // Read the string but pull it out ourselves since we need the quotes.
                const { end, error } = stringInfo;
                if (error !== undefined) {
                    throw new Error(error);
                }
                arg = line.substring(pos, end);
                pos = end;
            } else if (line[pos] === "<") {
                pos += 1;
                const begin = pos;
                while (pos < line.length && line[pos] !== ">") {
                    pos += 1;
                }
                if (pos === line.length) {
                    throw new Error("Missing > after < in macro argument");
                }
                arg = line.substring(begin, pos);
                pos += 1;
            } else {
                // Read to next comma.
                const begin = pos;
                while (pos < line.length && line[pos] !== "," && line[pos] !== ";") {
                    pos++;
                }
                arg = line.substring(begin, pos).trim();
            }
            args.push(arg);
            pos = skipWhitespace(line, pos);
            if (pos < line.length && line[pos] === ",") {
                pos += 1;
                pos = skipWhitespace(line, pos);
                // Arg is required.
                if (pos === line.length || line[pos] === ";") {
                    throw new Error("missing macro argument after comma");
                }
            }
        }

        // Update our tokenizer state.
        this.column = pos;
        while (this.tokenIndex < this.tokens.length && this.tokens[this.tokenIndex].begin < pos) {
            this.tokenIndex += 1;
        }

        return args;
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
        if (this.tokenIndex >= this.tokens.length) {
            return undefined;
        }
        const token = this.tokens[this.tokenIndex];
        if (token.error !== undefined) {
            return undefined;
        }
        if (token.tag === "number") {
            this.tokenIndex += 1;
            this.column = token.end;
            this.skipWhitespace();
            return token.value;
        }
        if (token.tag === "symbol" && token.text === "$") {
            this.tokenIndex += 1;
            this.column = token.end;
            this.skipWhitespace();
            return address;
        }

        return undefined;
    }
}
