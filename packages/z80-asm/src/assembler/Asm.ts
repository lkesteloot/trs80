import mnemonicData from "./Opcodes";
import {toHex, hi, lo, isByteReg, isWordReg} from "z80-base";
import {Variant} from "./OpcodesTypes";
import * as path from "path";
import * as fs from "fs";

/**
 * List of all flags that can be specified in an instruction.
 */
const FLAGS = new Set(["z", "nz", "c", "nc", "po", "pe", "p", "m"]);

// Byte-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z54.htm
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z51.htm
const PSEUDO_DEF_BYTES = new Set(["defb", "db", ".db", ".byte", "defm", "dm", ".dm", ".text", ".ascii"]);

// Word-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z52.htm
const PSEUDO_DEF_WORDS = new Set(["defw", "dw", ".dw", ".word"]);

// Long-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z53.htm
const PSEUDO_DEF_LONGS = new Set([".long"]);

// Org-setting pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z50.htm
const PSEUDO_ORG = new Set(["org", ".org", ".loc"]);

// Alignment pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z57.htm
const PSEUDO_ALIGN = new Set(["align", ".align"]);

// Fill pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z56.htm
const PSEUDO_FILL = new Set(["defs", "ds", ".ds", ".block", ".blkb", "data"]);

// In the gather pass we figure out what symbols are references and
// the location and values of all symbols. If include libraries are not used,
// then at the end of this pass we know the value of all symbols and we can jump
// to the final pass.
const GATHER_PASS = 1;

// The library pass is used to read library files from "#include library"
// directives. This pass is used if the gather pass found such directives
// and some symbols could not be resolved.
const LIBRARY_PASS = 2;

// The final pass should be identical to the previous pass (gather or library)
// but with full knowledge of all symbols, so we can generate final opcodes.
const FINAL_PASS = 3;

// Type of target we can handle.
type Target = "bin" | "rom";

function parseDigit(ch: string, base: number): number | undefined {
    let value = ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 0x30
        : ch >= 'A' && ch <= 'F' ? ch.charCodeAt(0) - 0x41 + 10
            : ch >= 'a' && ch <= 'f' ? ch.charCodeAt(0) - 0x61 + 10
                : undefined;

    return value === undefined || value >= base ? undefined : value;
}

function isFlag(s: string): boolean {
    return FLAGS.has(s.toLowerCase());
}

function isLegalIdentifierCharacter(ch: string, isFirst: boolean) {
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch == '.' || ch == '_' ||
        (!isFirst && (ch >= '0' && ch <= '9'));
}

/**
 * Get the fill byte for the specified target.
 */
function fillForTarget(target: Target): number {
    switch (target) {
        case "bin":
            return 0x00;

        case "rom":
            return 0xFF;
    }
}

// A reference to a symbol.
export class SymbolReference {
    public pathname: string;
    public lineNumber: number;
    public column: number;

    constructor(pathname: string, lineNumber: number, column: number) {
        this.pathname = pathname;
        this.lineNumber = lineNumber;
        this.column = column;
    }
}

// Information about a symbol (label, constant).
export class SymbolInfo {
    public name: string;
    public value: number;
    public definition: SymbolReference;
    public references: SymbolReference[] = [];

    constructor(name: string, value: number, pathname: string, lineNumber: number, column: number) {
        this.name = name;
        this.value = value;
        this.definition = new SymbolReference(pathname, lineNumber, column);
    }

    // Whether the specified point is in this reference.
    public matches(ref: SymbolReference, pathname: string, lineNumber: number, column: number) {
        return pathname === ref.pathname && lineNumber === ref.lineNumber &&
            column >= ref.column && column <= ref.column + this.name.length;
    }
}

// Map from symbol name to info about the symbol. TODO: Delete?
export type SymbolMap = Map<string,SymbolInfo>;

export class AssembledLine {
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
    // If it's a library include, the directory.
    public libraryIncludeDir: string | undefined;
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

// Read the lines of a file, or undefined if the file cannot be read.
export type FileReader = (pathname: string) => string[] | undefined;

/**
 * Assembler.
 */
export class Asm {
    // Interface for fetching a file's lines.
    public readonly fileReader: FileReader;
    // Map from symbol name to SymbolInfo.
    public readonly symbols = new Map<string, SymbolInfo>();
    // At the end of a pass, this set has all the symbols that were used but not defined.
    public readonly undefinedSymbols = new Set<string>();
    // Symbols that should be read by the library include.
    public libraryIncludeSymbols = new Set<string>();

    constructor(fileReader: FileReader) {
        this.fileReader = fileReader;
    }

    public assembleFile(pathname: string): AssembledLine[] | undefined {
        let assembledLines: AssembledLine[] | undefined;

        // First pass shouldn't load libraries.
        this.libraryIncludeSymbols.clear();

        for (let passNumber = GATHER_PASS; passNumber <= FINAL_PASS; passNumber++) {
            const pass = new Pass(this, passNumber);
            assembledLines = pass.assembleFile(pathname);
            if (passNumber === GATHER_PASS) {
                if (this.undefinedSymbols.size > 0 && pass.hasLibraryInclude) {
                    // Need the library pass.
                    console.log("Undefined symbols: ", this.undefinedSymbols); // TODO remove.
                    this.libraryIncludeSymbols = new Set<string>(this.undefinedSymbols);
                } else {
                    // Skip the library pass.
                    passNumber++;
                }
            }
        }

        return assembledLines;
    }
}

/**
 * Represents a pass through all the files.
 */
class Pass {
    public readonly asm: Asm;
    public readonly passNumber: number;
    // Address of line being parsed.
    public address = 0;
    // Scope prefix (for #local areas).
    public scopePrefix = "";
    public scopeCounter = 1;
    // Target type (bin, rom).
    public target: Target = "bin";
    // Whether any line is a library include.
    public hasLibraryInclude = false;

    constructor(asm: Asm, passNumber: number) {
        this.asm = asm;
        this.passNumber = passNumber;
    }

    public ignoreUnknownIdentifiers(): boolean {
        return this.passNumber !== FINAL_PASS;
    }

    /**
     * Assembles the lines of the file, returning an AssembledLine object for
     * each line in the original file. Returns undefined if the file cannot be loaded.
     */
    public assembleFile(pathname: string): AssembledLine[] | undefined {
        const fileParser = new FileParser(this, pathname);
        return fileParser.assemble();
    }
}

/**
 * Parser for a particular file.
 */
class FileParser {
    public readonly pass: Pass;
    // Pathname we're assembling.
    public readonly pathname: string;

    constructor(pass: Pass, pathname: string) {
        this.pass = pass;
        this.pathname = pathname;
    }

    /**
     * Assembles the lines of the file, returning an AssembledLine object for
     * each line in the original file. Returns undefined if the file cannot be loaded.
     */
    public assemble(): AssembledLine[] | undefined {
        const lines = this.pass.asm.fileReader(this.pathname);
        if (lines === undefined) {
            return undefined;
        }

        const assembledLines: AssembledLine[] = [];

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const lineParser = new LineParser(this, lines[lineNumber], lineNumber);
            const results = lineParser.assemble();

            this.pass.address = results.nextAddress;
            if (this.pass.passNumber === FINAL_PASS) {
                assembledLines.push(results);
            }

            // Include file.
            if (results.includeFilename !== undefined) {
                const includePathname = path.resolve(path.dirname(this.pathname), results.includeFilename);
                const includeAssembledLines = this.pass.assembleFile(includePathname);
                if (includeAssembledLines === undefined) {
                    results.error = "cannot read file " + includePathname;
                }
            }

            // Library include.
            if (results.libraryIncludeDir !== undefined && this.pass.asm.libraryIncludeSymbols.size > 0) {
                const libraryDir = path.resolve(path.dirname(this.pathname), results.libraryIncludeDir);
                const filenames = fs.readdirSync(libraryDir);
                // Map from symbol to full filename.
                const filenameMap = new Map<string,string>();
                for (const filename of filenames) {
                    const symbol = path.parse(filename).name;
                    filenameMap.set(symbol, filename);
                }

                for (const symbol of this.pass.asm.libraryIncludeSymbols) {
                    const filename = filenameMap.get(symbol);
                    if (filename !== undefined) {
                        const includePathname = path.resolve(libraryDir, filename);
                        console.log("Auto-including " + includePathname); // TODO remove.
                        const includeAssembledLines = this.pass.assembleFile(includePathname);
                        if (includeAssembledLines === undefined) {
                            throw new Error("cannot read file " + includePathname);
                        }
                    }
                }
            }
        }

        return assembledLines;
    }
}

/**
 * Parser for one single line.
 */
class LineParser {
    private readonly file: FileParser;
    // Full text of line being parsed.
    private readonly line: string;
    // Line number we're parsing, zero-based.
    private readonly lineNumber: number;
    // Parsing index into the line.
    private column: number = 0;
    // Pointer to the token we just parsed.
    private previousToken = 0;
    // Results of parsing one line.
    private readonly results: AssembledLine;

    constructor(file: FileParser, line: string, lineNumber: number) {
        this.file = file;
        this.line = line;
        this.lineNumber = lineNumber;
        this.results = new AssembledLine(line, file.pass.address);
    }

    public assemble(): AssembledLine {
        this.parseLine();
        return this.results;
    }

    private parseLine(): void {
        // Convenience.
        const thisAddress = this.file.pass.address;

        // What value to assign to the label we parse, if any.
        let labelValue: number | undefined;

        // Look for compiler directive.
        if (this.line.trim().startsWith("#")) {
            this.parseDirective();
            return;
        }

        // Look for label in column 1.
        let symbolColumn = 0;
        let label = this.readIdentifier(false, false);
        let labelIsGlobal = false;
        if (label !== undefined) {
            if (this.foundChar(':')) {
                if (this.foundChar(':')) {
                    // Double colons indicate global symbols (not local to #local).
                    labelIsGlobal = true;
                }
            }

            // By default assign it to current address, but can be overwritten
            // by .equ below.
            labelValue = this.file.pass.address;
            symbolColumn = this.previousToken;
        }

        this.skipWhitespace();
        let mnemonic = this.readIdentifier(false, true);
        if (mnemonic !== undefined && this.previousToken > 0) {
            if (PSEUDO_DEF_BYTES.has(mnemonic)) {
                while (true) {
                    const s = this.readString();
                    if (s !== undefined) {
                        const adjustOperator = this.foundOneOfChar(["+", "-", "&", "|", "^"]);
                        let adjustValue: number | undefined;

                        if (adjustOperator !== undefined) {
                            adjustValue = this.readExpression(true);
                            if (adjustValue === undefined) {
                                if (this.results.error === undefined) {
                                    this.results.error = "bad adjustment value";
                                }
                                return;
                            }
                        }

                        for (let i = 0; i < s.length; i++) {
                            let value = s.charCodeAt(i);
                            if (i === s.length - 1 && adjustOperator !== undefined && adjustValue !== undefined) {
                                switch (adjustOperator) {
                                    case "+":
                                        value += adjustValue;
                                        break;

                                    case "-":
                                        value -= adjustValue;
                                        break;

                                    case "&":
                                        value &= adjustValue;
                                        break;

                                    case "|":
                                        value |= adjustValue;
                                        break;

                                    case "^":
                                        value ^= adjustValue;
                                        break;
                                }

                                value = lo(value);
                            }
                            this.results.binary.push(value);
                        }
                    } else if (this.results.error !== undefined) {
                        // Error parsing string.
                        return;
                    } else {
                        // Try some pre-defined names. These are only valid here.
                        const s = this.parsePredefinedName();
                        if (s !== undefined) {
                            for (let i = 0; i < s.length; i++) {
                                this.results.binary.push(s.charCodeAt(i));
                            }
                        } else {
                            // Try a normal expression.
                            const value = this.readExpression(true);
                            if (value === undefined) {
                                if (this.results.error === undefined) {
                                    this.results.error = "invalid " + mnemonic + " expression";
                                }
                                return;
                            }
                            this.results.binary.push(value);
                        }
                    }
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (PSEUDO_DEF_WORDS.has(mnemonic)) {
                while (true) {
                    const value = this.readExpression(true);
                    if (value === undefined) {
                        if (this.results.error === undefined) {
                            this.results.error = "invalid " + mnemonic + " expression";
                        }
                        return;
                    }
                    this.results.binary.push(lo(value));
                    this.results.binary.push(hi(value));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (PSEUDO_DEF_LONGS.has(mnemonic)) {
                while (true) {
                    const value = this.readExpression(true);
                    if (value === undefined) {
                        if (this.results.error === undefined) {
                            this.results.error = "invalid " + mnemonic + " expression";
                        }
                        return;
                    }
                    this.results.binary.push(lo(value));
                    this.results.binary.push(hi(value));
                    this.results.binary.push(lo(value >> 16));
                    this.results.binary.push(hi(value >> 16));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (mnemonic === ".equ" || mnemonic === "equ") {
                const value = this.readExpression(true);
                if (value === undefined) {
                    this.results.error = "bad value for constant";
                } else if (label === undefined) {
                    this.results.error = "must have label for constant";
                } else {
                    // Remember constant.
                    labelValue = value;
                }
            } else if (PSEUDO_ORG.has(mnemonic)) {
                const startAddress = this.readExpression(true);
                if (startAddress === undefined) {
                    this.results.error = "start address expected";
                } else {
                    this.results.nextAddress = startAddress;
                }
            } else if (PSEUDO_ALIGN.has(mnemonic)) {
                const align = this.readExpression(true);
                if (align === undefined || align <= 0) {
                    this.results.error = "alignment value expected";
                } else {
                    let fillChar: number | undefined;
                    if (this.foundChar(",")) {
                        const expr = this.readExpression(true);
                        if (expr === undefined) {
                            if (this.results.error === undefined) {
                                this.results.error = "error in fill byte";
                            }
                            return;
                        }
                        fillChar = expr;
                    }

                    if (fillChar === undefined) {
                        this.results.nextAddress = thisAddress + (align - thisAddress%align)%align;
                    } else {
                        fillChar = lo(fillChar);

                        let address = thisAddress;
                        while ((address % align) !== 0) {
                            this.results.binary.push(fillChar);
                            address++;
                        }
                    }
                }
            } else if (PSEUDO_FILL.has(mnemonic)) {
                const length = this.readExpression(true);
                if (length === undefined || length <= 0) {
                    this.results.error = "length value expected";
                } else {
                    let fillChar: number | undefined;
                    if (this.foundChar(",")) {
                        const expr = this.readExpression(true);
                        if (expr === undefined) {
                            if (this.results.error === undefined) {
                                this.results.error = "error in fill byte";
                            }
                            return;
                        }
                        fillChar = expr;
                    }

                    if (fillChar === undefined) {
                        this.results.nextAddress = thisAddress + length;
                    } else {
                        fillChar = lo(fillChar);

                        for (let i = 0; i < length; i++) {
                            this.results.binary.push(fillChar);
                        }
                    }
                }
            } else {
                this.processOpCode(mnemonic);
            }
        }

        // Make sure there's no extra junk.
        this.ensureEndOfLine();

        // If we're defining a new symbol, record it.
        if (label !== undefined && labelValue !== undefined) {
            const scopedLabel = (labelIsGlobal ? "" : this.file.pass.scopePrefix) + label;
            const oldSymbolInfo = this.file.pass.asm.symbols.get(scopedLabel);
            if (oldSymbolInfo !== undefined) {
                // Sanity check.
                if (labelValue !== oldSymbolInfo.value ||
                    this.lineNumber !== oldSymbolInfo.definition.lineNumber ||
                    symbolColumn !== oldSymbolInfo.definition.column ||
                    this.file.pathname !== oldSymbolInfo.definition.pathname) {

                    // TODO should be programmer error.
                    console.log("error: changing value of \"" + label + "\" from " + toHex(oldSymbolInfo.value, 4) +
                        " to " + toHex(labelValue, 4));
                }
            } else {
                this.file.pass.asm.symbols.set(scopedLabel,
                    new SymbolInfo(label, labelValue, this.file.pathname, this.lineNumber, symbolColumn));
                this.file.pass.asm.undefinedSymbols.delete(label);
            }
        }
    }

    // Parse a pre-defined name, returning its value.
    private parsePredefinedName(): string | undefined {
        const name = this.readIdentifier(false, true);
        if (name === undefined) {
            return undefined;
        }

        let value;

        // https://k1.spdns.de/Develop/Projects/zasm/Documentation/z54.htm
        switch (name) {
            case "__date__": {
                const date = new Date();
                value = date.getFullYear() + "-" + (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
                    date.getDate().toString().padStart(2, "0");
                break;
            }

            case "__time__": {
                const date = new Date();
                value = date.getHours().toString().padStart(2, "0") + ":" +
                    date.getMinutes().toString().padStart(2, "0") + ":" +
                    date.getSeconds().toString().padStart(2, "0");
                break;
            }

            case "__file__":
                value = this.file.pathname;
                break;

            case "__line__":
                // Zero-based.
                value = this.lineNumber.toString();
                break;
        }

        if (value === undefined) {
            // Back up, it wasn't for us.
            this.column = this.previousToken;
        }

        return value;
    }

    // Make sure there's no junk at the end of the line.
    private ensureEndOfLine(): void {
        // Check for comment.
        if (this.isChar(';')) {
            // Skip rest of line.
            this.column = this.line.length;
        }
        if (this.column != this.line.length) {
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
                if (target === "bin" || target === "rom") {
                    this.file.pass.target = target;
                } else {
                    if (target === undefined) {
                        this.results.error = "must specify target";
                    } else {
                        this.results.error = "unknown target " + target;
                    }
                    return;
                }
                break;

            case "code":
                const segmentName = this.readIdentifier(true, false);
                if (segmentName === undefined) {
                    this.results.error = "segment name expected";
                } else if (this.foundChar(',')) {
                    const startAddress = this.readExpression(true);
                    if (startAddress === undefined) {
                        this.results.error = "start address expected";
                    } else {
                        this.results.nextAddress = startAddress;

                        if (this.foundChar(',')) {
                            const length = this.readExpression(true);
                            if (length === undefined) {
                                this.results.error = "length expected";
                            }
                        }
                    }
                }
                break;

            case "include": {
                const previousColumn = this.column;
                const token = this.readIdentifier(false, true);
                if (token === "library") {
                    const dir = this.readString();
                    if (dir === undefined) {
                        this.results.error = "missing library directory";
                    } else {
                        this.results.libraryIncludeDir = dir;
                        this.file.pass.hasLibraryInclude = true;
                    }
                } else {
                    this.column = previousColumn;
                    const filename = this.readString();
                    if (filename === undefined) {
                        this.results.error = "missing included filename";
                    } else {
                        this.results.includeFilename = filename;
                    }
                }
                break;
            }

            case "local":
                if (this.file.pass.scopePrefix !== "") {
                    this.results.error = "can't have nested #local";
                } else {
                    // Pick characters that aren't normally allowed.
                    this.file.pass.scopePrefix = "#local" + this.file.pass.scopeCounter++ + "-";
                }
                break;

            case "endlocal":
                if (this.file.pass.scopePrefix === "") {
                    this.results.error = "#endlocal without #local";
                } else {
                    this.file.pass.scopePrefix = "";
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
            const argStart = this.column;
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
                        const value = this.readExpression(false);
                        if (value === undefined) {
                            match = false;
                        } else {
                            // Add value to binary.
                            if (args[token] !== undefined) {
                                throw new Error("duplicate arg: " + this.line);
                            }
                            args[token] = value;
                        }
                    } else if (parseDigit(token[0], 10) !== undefined) {
                        // If the token is a number, then we must parse an expression and
                        // compare the values. This is used for BIT, SET, RES, RST, IM, and one
                        // variant of OUT (OUT (C), 0).
                        const expectedValue = parseInt(token, 10);
                        const actualValue = this.readExpression(false);
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
                    if (this.column < this.line.length && !this.isChar(';')) {
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
                    this.column = argStart;
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
            this.results.error = "no end quote in string";
            return undefined;
        }

        // Clip out string contents.
        const value = this.line.substring(startIndex, this.column);
        this.column++;
        this.skipWhitespace();

        return value;
    }

    /**
     * Read an expression.
     *
     * @param canStartWithOpenParens whether to allow the expression to start with an open parenthesis.
     *
     * @return the value of the expression, or undefined if there was an error reading it.
     */
    private readExpression(canStartWithOpenParens: boolean): number | undefined {
        if (!canStartWithOpenParens && this.line[this.column] === '(') {
            // Expressions can't start with an open parenthesis because that's ambiguous
            // with dereferencing.
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
            const subValue = this.readLogic();
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

    private readLogic(): number | undefined {
        let value = 0;
        let op = "";

        while (true) {
            const subValue = this.readShift();
            if (subValue === undefined) {
                return undefined;
            }

            if (op === "&") {
                value &= subValue;
            } else if (op === "|") {
                value |= subValue;
            } else if (op === "^") {
                value ^= subValue;
            } else {
                value = subValue;
            }

            const ch = this.foundOneOfChar(["&", "|", "^"]);
            if (ch !== undefined) {
                op = ch;
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

            op = this.line.substr(this.column, 2);
            if (op === "<<" || op === ">>") {
                this.column += 2;
                this.skipWhitespace();
            } else {
                break;
            }
        }

        return value;
    }

    private readAtom(): number | undefined {
        const startIndex = this.column;

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
            let symbolInfo = undefined;
            if (this.file.pass.scopePrefix !== "") {
                // Prefer local to global.
                symbolInfo = this.file.pass.asm.symbols.get(this.file.pass.scopePrefix + identifier);
            }
            if (symbolInfo === undefined) {
                // Check global.
                symbolInfo = this.file.pass.asm.symbols.get(identifier);
            }
            if (symbolInfo === undefined) {
                if (!this.file.pass.ignoreUnknownIdentifiers()) {
                    this.results.error = "unknown identifier \"" + identifier + "\"";
                }
                // TODO I don't like that the set here is mutated even though evaluating this expression
                // might be speculative.
                this.file.pass.asm.undefinedSymbols.add(identifier);
                return 0;
            } else {
                if (!this.file.pass.ignoreUnknownIdentifiers()) {
                    symbolInfo.references.push(new SymbolReference(this.file.pathname, this.lineNumber, startIndex));
                }
                return symbolInfo.value;
            }
        }

        // Try literal character, like 'a'.
        if (this.isChar("'")) {
            if (this.column > this.line.length - 3 || this.line[this.column + 2] !== "'") {
                // TODO invalid character constant, show error.
                return undefined;
            }
            const value = this.line.charCodeAt(this.column + 1);
            this.column += 3;
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
            if (this.column === this.line.length || parseDigit(this.line[this.column], 16) === undefined) {
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
            const beforeIndex = this.column;
            while (this.column < this.line.length && parseDigit(this.line[this.column], 16) !== undefined) {
                this.column++;
            }
            if (this.column < this.line.length && this.line[this.column].toUpperCase() === "H") {
                base = 16;
            }
            this.column = beforeIndex;
        }
        // And again we need to look for B, like 010010101B. We can't fold this into the
        // above look since a "B" is a legal hex number!
        if (base === 10) {
            const beforeIndex = this.column;
            while (this.column < this.line.length && parseDigit(this.line[this.column], 2) !== undefined) {
                this.column++;
            }
            if (this.column < this.line.length && this.line[this.column].toUpperCase() === "B" &&
                // "B" can't be followed by hex digit, or it's not the final character.
                (this.column === this.line.length || parseDigit(this.line[this.column + 1], 16) === undefined)) {

                base = 2;
            }
            this.column = beforeIndex;
        }

        // Look for 0x or 0b prefix. Must do this after above checks so that we correctly
        // mark "0B1H" as hex and not binary.
        if (base === 10 && this.column + 2 < this.line.length && this.line[this.column] === '0') {
            if (this.line[this.column + 1].toLowerCase() == 'x') {
                base = 16;
                this.column += 2;
            } else if (this.line[this.column + 1].toLowerCase() == 'b' &&
                // Must check next digit to distinguish from just "0B".
                parseDigit(this.line[this.column + 2], 2) !== undefined) {

                base = 2;
                this.column += 2;
            }
        }

        // Parse number.
        let value = 0;
        while (true) {
            if (this.column == this.line.length) {
                break;
            }

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
            // Didn't parse anything.
            return undefined;
        }

        // Check for base suffix.
        if (this.column < this.line.length) {
            const baseChar = this.line[this.column].toUpperCase();
            if (baseChar === "H") {
                // Check for programmer errors.
                if (base !== 16) {
                    throw new Error("found H at end of non-hex number: " + this.line.substring(startIndex, this.column + 1));
                }
                this.column++;
            } else if (baseChar === "B") {
                // Check for programmer errors.
                if (base !== 2) {
                    throw new Error("found B at end of non-binary number: " + this.line.substring(startIndex, this.column + 1));
                }
                this.column++;
            }
        }

        this.skipWhitespace();

        return sign * value;
    }

    private skipWhitespace(): void {
        while (this.column < this.line.length && (this.line[this.column] === ' ' || this.line[this.column] === '\t')) {
            this.column++;
        }
    }

    private readIdentifier(allowRegister: boolean, toLowerCase: boolean): string | undefined {
        const startIndex = this.column;

        while (this.column < this.line.length && isLegalIdentifierCharacter(this.line[this.column], this.column == startIndex)) {
            this.column++;
        }

        if (this.column > startIndex) {
            let identifier = this.line.substring(startIndex, this.column);
            if (toLowerCase) {
                identifier = identifier.toLowerCase();
            }
            if (!allowRegister && (isWordReg(identifier) || isByteReg(identifier) || isFlag(identifier))) {
                // Register names can't be identifiers.
                this.column = startIndex;
                return undefined;
            }
            this.skipWhitespace();
            this.previousToken = startIndex;
            return identifier;
        } else {
            return undefined;
        }
    }

    /**
     * If the next character matches the parameter, skips it and subsequent whitespace and return true.
     * Else returns false.
     */
    private foundChar(ch: string): boolean {
        if (this.isChar(ch)) {
            this.column++;
            this.skipWhitespace();
            return true;
        } else {
            return false;
        }
    }

    /**
     * If any of the specified characters is next, it is skipped (and subsequent whitespace) and returned.
     * Else undefined is returned.
     */
    private foundOneOfChar(chars: string[]): string | undefined {
        for (const ch of chars) {
            if (this.foundChar(ch)) {
                return ch;
            }
        }

        return undefined;
    }

    // Whether the next character matches the parameter. Does not advance.
    private isChar(ch: string): boolean {
        return this.column < this.line.length && this.line[this.column] === ch;
    }
}
