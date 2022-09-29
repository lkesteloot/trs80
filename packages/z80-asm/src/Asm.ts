import {hi, isByteReg, isWordReg, KnownLabel, lo, toHexWord} from "z80-base";
import {dirname, parse, resolve} from "./path.js";
import {OpcodeVariant} from "z80-inst";
import { mnemonicMap } from "z80-inst";
import { OpcodeTemplateOperand } from "z80-inst";
import { isOpcodeTemplateOperand } from "z80-inst";

/**
 * List of all flags that can be specified in an instruction.
 */
const FLAGS = new Set(["z", "nz", "c", "nc", "po", "pe", "p", "m"]);

// Byte-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z54.htm
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z51.htm
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z59.htm
const PSEUDO_DEF_BYTES = new Set(["defb", "db", ".db", ".byte", "defm", "dm", ".dm", ".text", ".ascii", ".asciz"]);

// Word-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z52.htm
const PSEUDO_DEF_WORDS = new Set(["defw", "dw", ".dw", ".word"]);

// Long-defining pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z53.htm
const PSEUDO_DEF_LONGS = new Set([".long"]);

// Instruction to assign a value to a symbol. We don't support the "set" variant
// because it clashes with the Z80 "set" instruction, and so requires extra
// parsing logic.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z71.htm
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z72.htm
const PSEUDO_EQU = new Set(["equ", ".equ", "defl", "="]);

// Org-setting pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z50.htm
const PSEUDO_ORG = new Set(["org", ".org", ".loc"]);

// Alignment pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z57.htm
const PSEUDO_ALIGN = new Set(["align", ".align"]);

// Fill pseudo instructions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z56.htm
const PSEUDO_FILL = new Set(["defs", "ds", ".ds", ".block", ".blkb", "data", "dc"]);

// Pseudo instructions to start and end macro definitions.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z64.htm#A
const PSEUDO_MACRO = new Set(["macro", ".macro"]);
const PSEUDO_ENDM = new Set(["endm", ".endm"]);

// Pseudo instructions for if/else/endif.
const PSEUDO_IF = new Set(["if", "cond", "#if"]);
const PSEUDO_ELSE = new Set(["else", "#else"]);
const PSEUDO_ENDIF = new Set(["endif", "endc", "#endif"]);

// End file instruction. Followed by optional entry address or label.
const PSEUDO_END = new Set(["end"]);

// Valid extensions for files in library directories. Use the same list as zasm.
const LIBRARY_EXTS = new Set([".s", ".ass", ".asm"]);

// Possible tags for macro parameters.
// https://k1.spdns.de/Develop/Projects/zasm/Documentation/z65.htm#A
const MACRO_TAGS = ["!", "#", "$", "%", "&", ".", ":", "?", "@", "\\", "^", "_", "|", "~"];

// Type of target we can handle.
type Target = "bin" | "rom";

/**
 * Documentation about a set of (synonym) directives.
 */
export interface AsmDirectiveDoc {
    // These are all synonyms for the same directive.
    directives: Set<string>;
    description: string;
}

/**
 * Documentation about the assembly directives we support. This is
 * for interactive (IDE) auto-complete.
 */
export function getAsmDirectiveDocs(): AsmDirectiveDoc[] {
    return [
        {
            directives: PSEUDO_DEF_BYTES,
            description: "Define a sequence of bytes, text, or strings.",
        },
        {
            directives: PSEUDO_DEF_WORDS,
            description: "Define a sequence of 16-bit words.",
        },
        {
            directives: PSEUDO_DEF_LONGS,
            description: "Define a sequence of 32-bit longs.",
        },
        {
            directives: PSEUDO_EQU,
            description: "Assign a value to a symbol.",
        },
        {
            directives: PSEUDO_ORG,
            description: "Specify address of next instruction.",
        },
        {
            directives: PSEUDO_ALIGN,
            description: "Add fill bytes until address is multiple of specified value.",
        },
        {
            directives: PSEUDO_FILL,
            description: "Fill memory with repeated 0 bytes.",
        },
        {
            directives: PSEUDO_MACRO,
            description: "Start a macro definition.",
        },
        {
            directives: PSEUDO_ENDM,
            description: "End a macro definition.",
        },
        {
            directives: PSEUDO_IF,
            description: "If conditional.",
        },
        {
            directives: PSEUDO_ELSE,
            description: "Else conditional.",
        },
        {
            directives: PSEUDO_ENDIF,
            description: "End of if conditional.",
        },
        {
            directives: PSEUDO_END,
            description: "End of file, optionally followed by entry address or label.",
        },
    ];
}

/**
 * Parse a single digit in the given base, or undefined if the digit does not
 * belong to that base.
 */
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

// Whether the specified character counts as horizontal whitespace.
function isWhitespace(c: string): boolean {
    return c === " " || c === "\t";
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
    // Line number in listing.
    public lineNumber: number;
    public column: number;

    constructor(lineNumber: number, column: number) {
        this.lineNumber = lineNumber;
        this.column = column;
    }
}

// Information about a symbol (label, constant).
export class SymbolInfo {
    public readonly name: string;
    public value: number;
    public definitions: SymbolReference[] = [];
    public references: SymbolReference[] = [];
    // If it has multiple definitions with different values.
    public changesValue = false;

    constructor(name: string, value: number) {
        this.name = name;
        this.value = value;
    }

    // Whether the specified point is in this reference.
    public matches(ref: SymbolReference, lineNumber: number, column: number) {
        return lineNumber === ref.lineNumber &&
            column >= ref.column && column <= ref.column + this.name.length;
    }
}

// Information about each file that was read. Note that we may have more than one of these
// objects for one physical file if the file is included more than once.
export class FileInfo {
    public readonly pathname: string;
    // File that included this file, or undefined if it's the top file.
    public readonly parentFileInfo: FileInfo | undefined;
    // Depth of include, with 0 meaning top level.
    public readonly depth: number;
    // Line number in listing, inclusive.
    public beginLineNumber = 0;
    // Line number in listing, exclusive.
    public endLineNumber = 0;
    // Files included by this file.
    public readonly childFiles: FileInfo[] = [];
    // Lines in listing that correspond to this file.
    public readonly lineNumbers: number[] = [];

    constructor(pathname: string, parentFileInfo: FileInfo | undefined) {
        this.pathname = pathname;
        this.parentFileInfo = parentFileInfo;
        this.depth = parentFileInfo === undefined ? 0 : parentFileInfo.depth + 1;

        if (parentFileInfo !== undefined) {
            parentFileInfo.childFiles.push(this);
        }
    }
}

export class AssembledLine {
    // Source of line.
    public readonly fileInfo: FileInfo;
    // Line number in original file, or undefined if it's a synthetic line.
    public readonly lineNumber: number | undefined;
    // Text of line.
    public readonly line: string;
    // Line number in the listing.
    public listingLineNumber = 0;
    // Address of this line.
    public address = 0;
    // Decoded opcodes and parameters:
    public binary: number[] = [];
    // Any error found in the line.
    public error: string | undefined;
    // The variant of the instruction, if any.
    public variant: OpcodeVariant | undefined;
    // List of symbols defined or referenced on this line.
    public readonly symbols: SymbolInfo[] = [];
    // The next address, if it was explicitly specified.
    private specifiedNextAddress: number | undefined;

    constructor(fileInfo: FileInfo, lineNumber: number | undefined, line: string) {
        this.fileInfo = fileInfo;
        this.lineNumber = lineNumber;
        this.line = line;
    }

    set nextAddress(nextAddress: number) {
        this.specifiedNextAddress = nextAddress;
    }

    get nextAddress(): number {
        // Return explicit if provided, otherwise compute.
        return this.specifiedNextAddress ?? (this.address + this.binary.length);
    }

    /**
     * Whether this line holds data, e.g. from a ".byte" directive.
     */
    public isData(): boolean {
        return this.binary.length > 0 && this.variant === undefined;
    }

    /**
     * Whether these two assembled lines equal each other, in the sense
     * of where they're stored in memory. Does not consider things like
     * symbols.
     */
    public equals(other: AssembledLine): boolean {
        if (this.address !== other.address) {
            return false;
        }

        const b1 = this.binary;
        const b2 = other.binary;
        if (b1.length !== b2.length) {
            return false;
        }

        for (let i = 0; i < b1.length; i++) {
            if (b1[i] !== b2[i]) {
                return false;
            }
        }

        return true;
    }
}

/**
 * Virtual file system, used by the assembler to read files and directories. All
 * pathname parameters are relative to the top-level file being assembled.
 */
export interface FileSystem {
    // Read the lines of a file, or undefined if the file cannot be read.
    readTextFile(pathname: string): string[] | undefined;

    // Read the file as a blob, or undefined if the file cannot be read.
    readBinaryFile(pathname: string): Uint8Array | undefined;

    // Read all filenames in a directory, or undefined if the directory cannot be read.
    readDirectory(pathname: string): string[] | undefined;
}

export class SourceFile {
    public readonly fileInfo: FileInfo;
    public readonly assembledLines: AssembledLine[];

    constructor(fileInfo: FileInfo, assembledLines: AssembledLine[]) {
        this.fileInfo = fileInfo;
        this.assembledLines = assembledLines;
    }
}

/**
 * Macro definition.
 */
class Macro {
    public readonly name: string;
    // Single-character tag, like "&", "\\", or "#".
    public readonly tag: string;
    // Parameter names, not including the tags.
    public readonly params: string[];
    // Line number of ".macro" in the listing.
    public readonly macroListingLineNumber: number;
    // Line number of ".endm" in the listing.
    public readonly endmListingLineNumber: number;
    // Lines of text, not including .macro or endm.
    public readonly lines: string[];

    constructor(name: string, tag: string, params: string[], macroListingLineNumber: number, endmListingLineNumber: number, lines: string[]) {
        this.name = name;
        this.tag = tag;
        this.params = params;
        this.macroListingLineNumber = macroListingLineNumber;
        this.endmListingLineNumber = endmListingLineNumber;
        this.lines = lines;
    }
}

/**
 * Scope for symbols.
 */
class Scope {
    public readonly symbols = new Map<string, SymbolInfo>();
    public readonly parent: Scope | undefined;

    constructor(parent: Scope | undefined) {
        this.parent = parent;
    }

    public get(identifier: string, propagateUp?: boolean): SymbolInfo | undefined {
        let symbolInfo = this.symbols.get(identifier);
        if (symbolInfo === undefined && propagateUp && this.parent !== undefined) {
            symbolInfo = this.parent.get(identifier, propagateUp);
        }

        return symbolInfo;
    }

    public set(symbolInfo: SymbolInfo): void {
        this.symbols.set(symbolInfo.name, symbolInfo);
    }

    public remove(identifier: string): void {
        this.symbols.delete(identifier);
    }
}

/**
 * Assembler.
 */
export class Asm {
    // Interface for fetching a file's lines.
    public readonly fileSystem: FileSystem;
    // Index 0 is global scope, then one scope for each #local.
    public readonly scopes: Scope[] = [new Scope(undefined)];
    // All assembled lines.
    public assembledLines: AssembledLine[] = [];
    // Cache from full directory path to list of filenames in the directory.
    private dirCache = new Map<string,string[]>();
    // Map from macro name (lower case) to its definition.
    public macros = new Map<string,Macro>();
    // Entry point into program.
    public entryPoint: number | undefined = undefined;

    constructor(fileSystem: FileSystem) {
        this.fileSystem = fileSystem;
    }

    /**
     * Add a global symbol outside the code, perhaps in the ROM or OS.
     */
    public addKnownLabel({ name, address }: KnownLabel): void {
        const symbolInfo = new SymbolInfo(name, address);
        // TODO find a better way to represent "not in our source file":
        symbolInfo.definitions.push(new SymbolReference(0, 0));
        this.scopes[0].set(symbolInfo);
    }

    /**
     * Add a global symbols outside the code, perhaps in the ROM or OS.
     */
    public addKnownLabels(knownLabels: KnownLabel[]): void {
        for (const knownLabel of knownLabels) {
            this.addKnownLabel(knownLabel);
        }
    }

    public assembleFile(pathname: string): SourceFile | undefined {
        // Load the top-level file.
        const sourceFile = this.loadSourceFile(pathname, undefined);
        if (sourceFile === undefined) {
            return undefined;
        }

        // This array will grow as we include files and expand macros.
        this.assembledLines = sourceFile.assembledLines.slice();

        // FIRST PASS. Expand include files and macros, assemble instructions so that each
        // label knows where it'll be.
        new Pass(this, 1).run();

        // SECOND PASS. Patch up references and generate error messages for undefined symbols.
        new Pass(this, 2).run();

        // Fix up line numbers in FileInfo structures.
        for (let lineNumber = 0; lineNumber < this.assembledLines.length; lineNumber++) {
            const assembledLine = this.assembledLines[lineNumber];
            assembledLine.fileInfo.lineNumbers.push(lineNumber);
        }
        // Fix up begin/end line numbers in FileInfo structures.
        const computeBeginEndLineNumbers = (fileInfo: FileInfo) => {
            if (fileInfo.lineNumbers.length === 0) {
                throw new Error("File info for \"" + fileInfo.pathname + "\" has no lines");
            }

            fileInfo.beginLineNumber = fileInfo.lineNumbers[0];
            fileInfo.endLineNumber = fileInfo.lineNumbers[fileInfo.lineNumbers.length - 1] + 1;

            for (const child of fileInfo.childFiles) {
                // Process children first.
                computeBeginEndLineNumbers(child);
                fileInfo.beginLineNumber = Math.min(fileInfo.beginLineNumber, child.beginLineNumber);
                fileInfo.endLineNumber = Math.max(fileInfo.endLineNumber, child.endLineNumber);
            }
        };
        computeBeginEndLineNumbers(sourceFile.fileInfo);

        // Fill in symbols of each line.
        for (const scope of this.scopes) {
            for (const symbol of scope.symbols.values()) {
                for (const reference of symbol.definitions) {
                    this.assembledLines[reference.lineNumber].symbols.push(symbol);
                }
                for (const reference of symbol.references) {
                    this.assembledLines[reference.lineNumber].symbols.push(symbol);
                }
            }
        }

        return sourceFile;
    }

    /**
     * Load a source file as an array of AssembledLine objects, or undefined if the
     * file can't be loaded.
     */
    public loadSourceFile(pathname: string, parentFileInfo: FileInfo | undefined): SourceFile | undefined {
        const lines = this.fileSystem.readTextFile(pathname);
        if (lines === undefined) {
            return undefined;
        }

        const fileInfo = new FileInfo(pathname, parentFileInfo);

        // Converted to assembled lines.
        const assembledLines: AssembledLine[] = [];
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            assembledLines.push(new AssembledLine(fileInfo, lineNumber, lines[lineNumber]));
        }

        return new SourceFile(fileInfo, assembledLines);
    }

    /**
     * Reads a directory, caching the results.
     *
     * @return a list of filenames in the directory, or undefined if an error occurs.
     */
    public readDir(dir: string): string[] | undefined {
        let filenames = this.dirCache.get(dir);
        if (filenames === undefined) {
            filenames = this.fileSystem.readDirectory(dir);
            if (filenames === undefined) {
                // Can't read dir.
                return undefined;
            }
            this.dirCache.set(dir, filenames);
        }

        return filenames;
    }
}

/**
 * Represents a pass through all the files.
 */
class Pass {
    public readonly asm: Asm;
    public readonly passNumber: number;
    // The current scope, local or global.
    public currentScope: Scope;
    // Number of scopes defined so far in this pass, including global (index 0).
    public scopeCount = 1;
    // Target type (bin, rom).
    public target: Target = "bin";
    // Number (in listing) of line we're assembling.
    private listingLineNumber = 0;
    // Number of library files we included.
    public libraryIncludeCount = 0;
    // Whether we've seen an "end" directive.
    public sawEnd = false;

    constructor(asm: Asm, passNumber: number) {
        this.asm = asm;
        this.passNumber = passNumber;
        this.currentScope = this.asm.scopes[0];
    }

    /**
     * Assembles the lines of the file. Returns a FileInfo object for this tree, or undefined
     * if the file couldn't be read.
     *
     * @return the number of errors.
     */
    public run(): number {
        const before = Date.now();

        let errorCount = 0;

        // Assemble every line.
        this.listingLineNumber = 0;
        while (true) {
            const assembledLine = this.getNextLine();
            if (assembledLine === undefined) {
                break;
            }
            new LineParser(this, assembledLine).assemble();

            if (assembledLine.error !== undefined) {
                errorCount++;
            }
        }

        // Make sure our #local and #endlocal are balanced.
        if (this.currentScope !== this.asm.scopes[0]) {
            const lines = this.asm.assembledLines;
            if (lines.length > 0 && lines[lines.length - 1].error === undefined) {
                lines[lines.length - 1].error = "missing #endlocal";
            }
        }
        const after = Date.now();

        /*
        console.log("Pass " + this.passNumber + " time: " + (after - before) +
            ", library includes: " + this.libraryIncludeCount +
            ", errors: " + errorCount);
         */

        return errorCount;
    }

    /**
     * Return the next line of the listing file, or undefined if there are no more.
     */
    public getNextLine(): AssembledLine | undefined {
        if (this.listingLineNumber < 0 || this.listingLineNumber >= this.asm.assembledLines.length) {
            return undefined;
        }

        const listingLineNumber = this.listingLineNumber++;
        const assembledLine = this.asm.assembledLines[listingLineNumber];
        assembledLine.listingLineNumber = listingLineNumber;
        assembledLine.address = listingLineNumber === 0 ? 0 : this.asm.assembledLines[listingLineNumber - 1].nextAddress;

        return assembledLine;
    }

    /**
     * Rewind or skip ahead to this location. This line will be parsed next.
     */
    public setListingLineNumber(listingLineNumber: number): void {
        this.listingLineNumber = listingLineNumber;
    }

    /**
     * Insert the specified lines immediately after the line currently being assembled.
     * @param assembledLines
     */
    public insertLines(assembledLines: AssembledLine[]): void {
        this.asm.assembledLines.splice(this.listingLineNumber, 0, ...assembledLines);
    }

    /**
     * Return the scope for global symbols.
     */
    public globals(): Scope {
        return this.asm.scopes[0];
    }

    /**
     * Return the scope for the innermost #local, which could just be the global scope.
     */
    public locals(): Scope {
        return this.currentScope;
    }

    /**
     * Create a new scope, when we hit #local.
     */
    public enterScope(): Scope {
        if (this.passNumber === 1) {
            this.currentScope = new Scope(this.currentScope);
            this.asm.scopes.push(this.currentScope);
            this.scopeCount++;
        } else {
            this.currentScope = this.asm.scopes[this.scopeCount++];
        }
        return this.currentScope;
    }

    /**
     * Exit the current scope, when we hit #endlocal.
     *
     * @return whether successful. Might fail if we're already at the global scope.
     */
    public leaveScope(): boolean {
        const scope = this.currentScope.parent;
        if (scope === undefined) {
            return false;
        }

        this.currentScope = scope;

        return true;
    }
}

/**
 * Parser for one single line.
 */
class LineParser {
    private readonly pass: Pass;
    private readonly assembledLine: AssembledLine;
    // Full text of line being parsed.
    private readonly line: string;
    // Parsing index into the line.
    private column: number = 0;
    // Pointer to the token we just parsed.
    private previousToken = 0;

    constructor(pass: Pass, assembledLine: AssembledLine) {
        this.pass = pass;
        this.assembledLine = assembledLine;
        this.line = assembledLine.line;
    }

    public assemble(): void {
        // Convenience.
        const thisAddress = this.assembledLine.address;

        // Clear out anything we put in previous passes.
        this.assembledLine.binary.length = 0;

        if (this.pass.sawEnd) {
            // Ignore all lines after "end".
            return;
        }

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
            labelValue = thisAddress;
            symbolColumn = this.previousToken;
        }

        this.skipWhitespace();
        let mnemonic = this.readIdentifier(false, true);
        if (mnemonic === undefined) {
            // Special check for "=", which is the same as "defl".
            const column = this.column;
            if (this.foundChar("=")) {
                mnemonic = "=";
                this.previousToken = column;
            }
        }
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
                                if (this.assembledLine.error === undefined) {
                                    this.assembledLine.error = "bad adjustment value";
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
                            this.assembledLine.binary.push(value);
                        }
                    } else if (this.assembledLine.error !== undefined) {
                        // Error parsing string.
                        return;
                    } else {
                        // Try some pre-defined names. These are only valid here.
                        const s = this.parsePredefinedName();
                        if (s !== undefined) {
                            for (let i = 0; i < s.length; i++) {
                                this.assembledLine.binary.push(s.charCodeAt(i));
                            }
                        } else {
                            // Try a normal expression.
                            const value = this.readExpression(true);
                            if (value === undefined) {
                                if (this.assembledLine.error === undefined) {
                                    this.assembledLine.error = "invalid " + mnemonic + " expression";
                                }
                                return;
                            }
                            this.assembledLine.binary.push(lo(value));
                        }
                    }
                    if (!this.foundChar(',')) {
                        break;
                    }
                }

                if (mnemonic === ".asciz") {
                    // Terminating nul.
                    this.assembledLine.binary.push(0);
                }
            } else if (PSEUDO_DEF_WORDS.has(mnemonic)) {
                while (true) {
                    const value = this.readExpression(true);
                    if (value === undefined) {
                        if (this.assembledLine.error === undefined) {
                            this.assembledLine.error = "invalid " + mnemonic + " expression";
                        }
                        return;
                    }
                    this.assembledLine.binary.push(lo(value));
                    this.assembledLine.binary.push(hi(value));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (PSEUDO_DEF_LONGS.has(mnemonic)) {
                while (true) {
                    const value = this.readExpression(true);
                    if (value === undefined) {
                        if (this.assembledLine.error === undefined) {
                            this.assembledLine.error = "invalid " + mnemonic + " expression";
                        }
                        return;
                    }
                    this.assembledLine.binary.push(lo(value));
                    this.assembledLine.binary.push(hi(value));
                    this.assembledLine.binary.push(lo(value >> 16));
                    this.assembledLine.binary.push(hi(value >> 16));
                    if (!this.foundChar(',')) {
                        break;
                    }
                }
            } else if (PSEUDO_EQU.has(mnemonic)) {
                const value = this.readExpression(true);
                if (value === undefined) {
                    this.assembledLine.error = "bad value for constant";
                } else if (label === undefined) {
                    this.assembledLine.error = "must have label for constant";
                } else {
                    // Remember constant.
                    labelValue = value;
                }
            } else if (PSEUDO_ORG.has(mnemonic)) {
                const startAddress = this.readExpression(true);
                if (startAddress === undefined) {
                    this.assembledLine.error = "start address expected";
                } else {
                    this.assembledLine.nextAddress = startAddress;
                }
            } else if (PSEUDO_ALIGN.has(mnemonic)) {
                const align = this.readExpression(true);
                if (align === undefined || align <= 0) {
                    this.assembledLine.error = "alignment value expected";
                } else {
                    let fillChar: number | undefined;
                    if (this.foundChar(",")) {
                        const expr = this.readExpression(true);
                        if (expr === undefined) {
                            if (this.assembledLine.error === undefined) {
                                this.assembledLine.error = "error in fill byte";
                            }
                            return;
                        }
                        fillChar = expr;
                    }

                    if (fillChar === undefined) {
                        this.assembledLine.nextAddress = thisAddress + (align - thisAddress%align)%align;
                    } else {
                        fillChar = lo(fillChar);

                        let address = thisAddress;
                        while ((address % align) !== 0) {
                            this.assembledLine.binary.push(fillChar);
                            address++;
                        }
                    }
                }
            } else if (PSEUDO_FILL.has(mnemonic)) {
                const length = this.readExpression(true);
                if (length === undefined || length <= 0) {
                    this.assembledLine.error = "length value expected";
                } else {
                    let fillChar: number | undefined;
                    if (this.foundChar(",")) {
                        const expr = this.readExpression(true);
                        if (expr === undefined) {
                            if (this.assembledLine.error === undefined) {
                                this.assembledLine.error = "error in fill byte";
                            }
                            return;
                        }
                        fillChar = expr;
                    }

                    if (fillChar === undefined) {
                        this.assembledLine.nextAddress = thisAddress + length;
                    } else {
                        fillChar = lo(fillChar);

                        for (let i = 0; i < length; i++) {
                            this.assembledLine.binary.push(fillChar);
                        }
                    }
                }
            } else if (PSEUDO_MACRO.has(mnemonic)) {
                // Macro definition.
                let name: string | undefined;
                let tag: string;
                if (label !== undefined) {
                    name = label;
                    label = undefined;
                    tag = "&";
                } else {
                    name = this.readIdentifier(true, false);
                    if (name === undefined) {
                        this.assembledLine.error = "must specify name of macro";
                        return;
                    }
                    tag = "\\";
                }

                // Convert to lower case because all mnemonics are case-insensitive.
                name = name.toLowerCase();
                const macro = this.pass.asm.macros.get(name);

                if (this.pass.passNumber > 1) {
                    // Skip macro definition.
                    if (macro === undefined) {
                        throw new Error("Macro \"" + name + "\" not found in pass " + this.pass.passNumber);
                    }

                    this.pass.setListingLineNumber(macro.endmListingLineNumber + 1);
                    return;
                } else {
                    // Can't redefine macro.
                    if (macro !== undefined) {
                        this.assembledLine.error = "macro \"" + name + "\" already defined";
                        return;
                    }

                    // Parse parameters.
                    const params: string[] = [];
                    if (!this.isEndOfLine()) {
                        // See if the first parameter specifies a tag. It's okay to not have one.
                        tag = this.foundOneOfChar(MACRO_TAGS) ?? tag;

                        do {
                            const thisTag = this.foundOneOfChar(MACRO_TAGS) ?? tag;
                            if (thisTag !== tag) {
                                this.assembledLine.error = "Inconsistent tags in macro: " + tag + " and " + thisTag;
                                return;
                            }

                            const param = this.readIdentifier(true, false);
                            if (param === undefined) {
                                this.assembledLine.error = "expected macro parameter name";
                                return;
                            }

                            params.push(param);
                        } while (this.foundChar(","));

                        // Make sure there's no extra junk.
                        this.ensureEndOfLine();
                    }

                    // Eat rest of macro.
                    const macroListingLineNumber = this.assembledLine.listingLineNumber;
                    let endmListingLineNumber: number | undefined = undefined;
                    const lines: string[] = [];

                    while (true) {
                        const assembledLine = this.pass.getNextLine();
                        if (assembledLine === undefined) {
                            this.assembledLine.error = "macro has no endm";
                            break;
                        }

                        const lineParser = new LineParser(this.pass, assembledLine);
                        // TODO check to make sure macro doesn't contain a # directive, unless the tag is
                        // # and the directive is one of the param names.
                        lineParser.skipWhitespace();
                        const token = lineParser.readIdentifier(false, true);
                        if (token !== undefined && PSEUDO_ENDM.has(token)) {
                            endmListingLineNumber = assembledLine.listingLineNumber;
                            break;
                        }

                        lines.push(assembledLine.line);
                    }

                    if (endmListingLineNumber === undefined) {
                        // Error in macro. Try to recover.
                        endmListingLineNumber = macroListingLineNumber;
                        lines.splice(0, lines.length);
                        this.pass.setListingLineNumber(macroListingLineNumber + 1);
                    }

                    this.pass.asm.macros.set(name, new Macro(name, tag, params,
                        macroListingLineNumber, endmListingLineNumber, lines));

                    // Don't want to parse any more of the original macro line.
                    return;
                }
            } else if (PSEUDO_ENDM.has(mnemonic)) {
                this.assembledLine.error = "endm outside of macro definition";
                return;
            } else if (PSEUDO_END.has(mnemonic)) {
                // End of source file. See if there's an optional entry address or label.
                this.skipWhitespace();
                if (!this.isEndOfLine()) {
                    const value = this.readExpression(true);
                    if (value === undefined) {
                        if (this.assembledLine.error === undefined) {
                            this.assembledLine.error = "invalid expression for entry point";
                        }
                        return;
                    }

                    // See if it's changed.
                    if (this.pass.asm.entryPoint !== undefined && this.pass.asm.entryPoint !== value) {
                        if (this.assembledLine.error === undefined) {
                            this.assembledLine.error = "changing entry point from 0x" +
                                toHexWord(this.pass.asm.entryPoint) + " to 0x" +
                                toHexWord(value);
                        }
                        return;
                    }

                    this.pass.asm.entryPoint = value;
                }

                this.pass.sawEnd = true;
            } else {
                this.processOpCode(mnemonic);
            }
        }

        // Make sure there's no extra junk.
        this.ensureEndOfLine();

        // If we're defining a new symbol, record it.
        if (label !== undefined && labelValue !== undefined) {
            const scope = labelIsGlobal ? this.pass.globals() : this.pass.locals();
            let symbolInfo = scope.get(label);
            if (symbolInfo !== undefined) {
                // Check if value is changing.
                if (symbolInfo.definitions.length > 0 && symbolInfo.value !== labelValue) {
                    symbolInfo.changesValue = true;
                }
                symbolInfo.value = labelValue;
            } else {
                symbolInfo = new SymbolInfo(label, labelValue);
                scope.set(symbolInfo);
            }
            if (this.pass.passNumber === 1) {
                symbolInfo.definitions.push(new SymbolReference(this.assembledLine.listingLineNumber, symbolColumn));
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
                value = this.assembledLine.fileInfo.pathname;
                break;

            case "__line__":
                // Zero-based.
                // The line number might be undefined if the line is synthetic.
                value = (this.assembledLine.lineNumber ?? 0).toString();
                break;
        }

        if (value === undefined) {
            // Back up, it wasn't for us.
            this.column = this.previousToken;
        }

        return value;
    }

    // Advance the parser to the end of the line.
    private skipToEndOfLine(): void {
        this.column = this.line.length;
    }

    // Whether we're at the end of the line. Assumes we've already skipped whitespace.
    private isEndOfLine(): boolean {
        return this.isChar(";") || this.column === this.line.length;
    }

    // Make sure there's no junk at the end of the line.
    private ensureEndOfLine(): void {
        // Check for comment.
        if (this.isChar(';')) {
            // Skip rest of line.
            this.column = this.line.length;
        }
        if (this.column != this.line.length && this.assembledLine.error === undefined) {
            this.assembledLine.error = "syntax error";
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
            this.assembledLine.error = "must specify directive after #";
            return;
        }

        switch (directive) {
            case "target":
                const target = this.readIdentifier(false, true);
                if (target === "bin" || target === "rom") {
                    this.pass.target = target;
                } else {
                    if (target === undefined) {
                        this.assembledLine.error = "must specify target";
                    } else {
                        this.assembledLine.error = "unknown target " + target;
                    }
                    return;
                }
                break;

            case "code":
                const segmentName = this.readIdentifier(true, false);
                if (segmentName === undefined) {
                    this.assembledLine.error = "segment name expected";
                } else if (this.foundChar(',')) {
                    if (this.foundChar("*")) {
                        // Keep start address unchanged.
                    } else {
                        const startAddress = this.readExpression(true);
                        if (startAddress === undefined) {
                            this.assembledLine.error = "start address expected";
                        } else {
                            this.assembledLine.nextAddress = startAddress;
                        }
                    }

                    if (this.foundChar(',')) {
                        const length = this.readExpression(true);
                        if (length === undefined) {
                            this.assembledLine.error = "length expected";
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
                        this.assembledLine.error = "missing library directory";
                    } else if (this.pass.passNumber === 1) {
                        const libraryDir = resolve(dirname(this.assembledLine.fileInfo.pathname), dir);
                        const filenames = this.pass.asm.readDir(libraryDir);
                        if (filenames === undefined) {
                            this.assembledLine.error = "can't read directory \"" + libraryDir + "\"";
                            return;
                        }
                        const includeLines: AssembledLine[] = [];
                        for (const filename of filenames) {
                            let parsedPath = parse(filename);
                            if (LIBRARY_EXTS.has(parsedPath.ext)) {
                                const symbol = this.pass.globals().get(parsedPath.name);
                                if (symbol !== undefined && symbol.definitions.length === 0) {
                                    // Found used but undefined symbol that matches a file in the library.
                                    const includePathname = resolve(dir, filename);
                                    includeLines.push(
                                        new AssembledLine(this.assembledLine.fileInfo, undefined,
                                            "#include \"" + includePathname + "\""));
                                    this.pass.libraryIncludeCount++;
                                }
                            }
                        }
                        this.pass.insertLines(includeLines);
                    }
                } else if (token !== undefined) {
                    this.assembledLine.error = "unknown identifier " + token;
                } else {
                    this.column = previousColumn;
                    const filename = this.readString();
                    if (filename === undefined) {
                        this.assembledLine.error = "missing included filename";
                    } else if (this.pass.passNumber === 1) {
                        const includePathname = resolve(dirname(this.assembledLine.fileInfo.pathname), filename);
                        const sourceFile = this.pass.asm.loadSourceFile(includePathname, this.assembledLine.fileInfo);
                        if (sourceFile === undefined) {
                            this.assembledLine.error = "cannot read file " + includePathname;
                        } else {
                            // Insert the included lines right in our listing.
                            this.pass.insertLines(sourceFile.assembledLines);
                        }
                    }
                }
                break;
            }

            case "local":
                this.pass.enterScope();
                break;

            case "endlocal":
                // When we leave a scope, we must push symbols that are both references and undefined out
                // to the outer scope, since that's where they might be defined.
                const scope = this.pass.locals();
                if (scope.parent === undefined) {
                    this.assembledLine.error = "#endlocal without #local";
                } else {
                    for (const [identifier, symbol] of scope.symbols) {
                        if (symbol.references.length > 0 && symbol.definitions.length === 0) {
                            scope.remove(identifier);

                            // Merge with this symbol in the parent, if any.
                            const parentSymbol = scope.parent.get(identifier);
                            if (parentSymbol === undefined) {
                                scope.parent.set(symbol);
                            } else {
                                parentSymbol.references.splice(parentSymbol.references.length, 0, ...symbol.references);
                            }
                        }
                    }
                    this.pass.leaveScope();
                }
                break;

            case "insert": {
                // Must specify pathname as string.
                const pathname = this.readString();
                if (pathname === undefined) {
                    if (this.assembledLine.error === undefined) {
                        this.assembledLine.error = "must specify pathname of file to insert";
                    }
                    return;
                }

                // Pathname is relative to including file.
                const resolvedPathname = resolve(dirname(this.assembledLine.fileInfo.pathname), pathname);

                // Load the file.
                const binary = this.pass.asm.fileSystem.readBinaryFile(resolvedPathname);
                if (binary === undefined) {
                    this.assembledLine.error = "file \"" + resolvedPathname + "\" not found";
                    return;
                }

                this.assembledLine.binary.push(...binary);
                break;
            }

            default:
                this.assembledLine.error = "unknown directive #" + directive;
                break;
        }

        // Make sure there's no extra junk.
        this.ensureEndOfLine();
    }

    private processOpCode(mnemonic: string): void {
        // See if we should expand a macro.
        const macro = this.pass.asm.macros.get(mnemonic);
        if (macro !== undefined) {
            if (this.pass.passNumber > 1) {
                if (this.assembledLine.listingLineNumber > macro.endmListingLineNumber) {
                    // Valid, used after definition. Skip macro call.
                    this.skipToEndOfLine();
                    return;
                } else {
                    // Ignore, will probably be an error below.
                }
            } else {
                // Pass 1, expand macro.

                // Parse arguments.
                const args: string[] = [];
                if (!this.isEndOfLine()) {
                    do {
                        const begin = this.column;
                        while (this.column < this.line.length && !this.isChar(",") && !this.isChar(";")) {
                            if (this.isChar("\"") || this.isChar("'")) {
                                const str = this.readString();
                                if (str === undefined) {
                                    // Error is already set.
                                    return;
                                }
                            } else {
                                this.column++;
                            }
                        }
                        // Back up over trailing spaces.
                        while (this.column > begin && isWhitespace(this.line.charAt(this.column - 1))) {
                            this.column--;
                        }

                        const arg = this.line.substring(begin, this.column);
                        args.push(arg);

                        this.skipWhitespace();
                    } while (this.foundChar(","));
                }

                // Make sure we got the right number.
                if (args.length < macro.params.length) {
                    // Give name of argument as hint to what to type next.
                    this.assembledLine.error = "macro missing \"" + macro.params[args.length] + "\" argument";
                    return;
                }
                if (args.length > macro.params.length) {
                    this.assembledLine.error = "macro got too many arguments (" + args.length +
                        " instead of " + macro.params.length + ")";
                    return;
                }

                const assembledLines = macro.lines.map((line) =>
                    new AssembledLine(this.assembledLine.fileInfo, undefined, this.performMacroSubstitutions(line, macro, args)));
                this.pass.insertLines(assembledLines);
                return;
            }
        }

        // See if it's a Z80 mnemonic.
        const mnemonicInfo = mnemonicMap.get(mnemonic);
        if (mnemonicInfo !== undefined) {
            const argStart = this.column;
            let match = false;

            for (const variant of mnemonicInfo) {
                // Map from something like "nn" to its value.
                const args = new Map<OpcodeTemplateOperand, number>();

                match = true;

                for (let i = 0; i < variant.tokens.length; i++) {
                    const token = variant.tokens[i];

                    // Some instructions like "LD A,(IX+dd)" should also allow "LD A,(IX)". Perhaps
                    // we should have this in the official list of variants, but instead let's just
                    // hack it here.
                    const nextToken = variant.tokens[i + 1];
                    if (token === "+" &&
                        isOpcodeTemplateOperand(nextToken) &&
                        variant.tokens[i + 2] === ")" &&
                        this.foundChar(")")) {

                        // Pretend missing arg is zero
                        args.set(nextToken, 0);
                        i += 2;
                        continue;
                    }

                    if (token === "," || token === "(" || token === ")" || token === "+") {
                        if (!this.foundChar(token)) {
                            match = false;
                        }
                    } else if (isOpcodeTemplateOperand(token)) {
                        // Parse.
                        const value = this.readExpression(false);
                        if (value === undefined) {
                            match = false;
                        } else {
                            // Add value to binary.
                            if (args.has(token)) {
                                throw new Error("duplicate arg: " + this.line);
                            }
                            args.set(token, value);
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
                    // Make sure they're no extra garbage.
                    if (!this.isEndOfLine()) {
                        match = false;
                    }
                }

                if (match) {
                    this.assembledLine.binary = [];
                    for (const op of variant.opcodes) {
                        if (typeof(op) === "string") {
                            const value = args.get(op);
                            if (value === undefined) {
                                throw new Error("arg " + op + " not found for " + this.line);
                            }
                            switch (op) {
                                case "nnnn":
                                    this.assembledLine.binary.push(lo(value));
                                    this.assembledLine.binary.push(hi(value));
                                    break;

                                case "nn":
                                case "dd":
                                    this.assembledLine.binary.push(lo(value));
                                    break;

                                case "offset":
                                    this.assembledLine.binary.push(lo(value - this.assembledLine.address - this.assembledLine.binary.length - 1));
                                    break;

                                default:
                                    throw new Error("Unknown arg type " + op);
                            }
                        } else {
                            this.assembledLine.binary.push(op);
                        }
                    }
                    this.assembledLine.variant = variant;
                    break;
                } else {
                    // Reset reader.
                    this.column = argStart;
                }
            }

            if (!match && this.assembledLine.error === undefined) {
                this.assembledLine.error = "no variant found for " + mnemonic;
            }
        } else {
            this.assembledLine.error = "unknown mnemonic: " + mnemonic;
        }
    }

    /**
     * Substitute macro parameters and expand {} expressions.
     */
    private performMacroSubstitutions(line: string, macro: Macro, args: string[]): string {
        const parts: string[] = [];

        let i = 0;
        while (i < line.length) {
            const ch = line.charAt(i);
            if (ch === macro.tag) {
                const beginName = i + 1;
                let endName = beginName;
                while (endName < line.length && isLegalIdentifierCharacter(line.charAt(endName), endName === beginName)) {
                    endName++;
                }

                const name = line.substring(beginName, endName);
                const argIndex = macro.params.indexOf(name);
                if (argIndex >= 0) {
                    parts.push(args[argIndex]);
                    i = endName;
                } else {
                    parts.push(ch);
                    i++;
                }
            } else {
                parts.push(ch);
                i++;
            }
        }

        return parts.join("");
    }

    /**
     * Reads a string like "abc", or undefined if didn't find a string.
     * If found the beginning of a string but not the end, sets this.assembledLine.error
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
            this.assembledLine.error = "no end quote in string";
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

    /**
     * Read a sum, or undefined if there was an error reading it.
     */
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

    /**
     * Read a product, or undefined if there was an error reading it.
     */
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

    /**
     * Read a logic (&, |, and ^) expression, or undefined if there was an error reading it.
     */
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

    /**
     * Read a shift (<< and >>) expression, or undefined if there was an error reading it.
     */
    private readShift(): number | undefined {
        let value = 0;
        let op = "";

        while (true) {
            const subValue = this.readMonadic();
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

    /**
     * Read a monadic (unary prefix operator) expression, or undefined if there was an error reading it.
     */
    private readMonadic(): number | undefined {
        const ch = this.foundOneOfChar(["+", "-", "~", "!"]);
        if (ch !== undefined) {
            const value = this.readMonadic();
            if (value === undefined) {
                return undefined;
            }
            switch (ch) {
                case "+":
                default:
                    return value;

                case "-":
                    return -value;

                case "~":
                    return ~value;

                case "!":
                    return !value ? 1 : 0;
            }
        } else {
            return this.readAtom();
        }
    }

    /**
     * Read an atom (number constant, identifier) expression, or undefined if there was an error reading it.
     */
    private readAtom(): number | undefined {
        const startIndex = this.column;

        // Parenthesized expression.
        if (this.foundChar('(')) {
            const value = this.readExpression(true);
            if (value === undefined || !this.foundChar(')')) {
                return undefined;
            }
            return value;
        }

        // Try identifier.
        const identifier = this.readIdentifier(false, false);
        if (identifier !== undefined) {
            // See if it's a built-in function.
            if (this.foundChar("(")) {
                const value = this.readExpression(true);
                if (value === undefined) {
                    if (this.assembledLine.error === undefined) {
                        this.assembledLine.error = "missing expression for function call";
                    }
                    return undefined;
                }
                if (!this.foundChar(")")) {
                    if (this.assembledLine.error === undefined) {
                        this.assembledLine.error = "missing end parenthesis for function call";
                    }
                    return undefined;
                }
                switch (identifier) {
                    case "lo":
                        return lo(value);

                    case "hi":
                        return hi(value);

                    default:
                        this.assembledLine.error = "unknown function \"" + identifier + "\"";
                        return undefined;
                }
            }

            // Must be symbol reference. Get address of identifier or value of constant.

            // Local symbols can shadow global ones, and might not be defined yet, so only check
            // the local scope in pass 1. In pass 2 the identifier must have been defined somewhere.
            let symbolInfo = this.pass.locals().get(identifier, this.pass.passNumber !== 1);
            if (symbolInfo === undefined) {
                if (this.pass.passNumber === 1) {
                    // Record that this identifier was used so that we can include its file with
                    // library includes. We don't know whether it's a local or global symbol.
                    // Assume local and push it out in #endlocal.
                    symbolInfo = new SymbolInfo(identifier, 0);
                    this.pass.locals().set(symbolInfo);
                } else {
                    throw new Error("Identifier " + identifier + " was not defined in pass 1");
                }
            }
            if (this.pass.passNumber === 1) {
                // TODO I don't like this, given that evaluating this expression might be speculative.
                symbolInfo.references.push(new SymbolReference(this.assembledLine.listingLineNumber, startIndex));
            } else if (symbolInfo.definitions.length === 0) {
                this.assembledLine.error = "unknown identifier \"" + identifier + "\"";
                return 0;
            } else if (symbolInfo.definitions.length > 1 &&
                symbolInfo.changesValue &&
                symbolInfo.definitions[0].lineNumber >= this.assembledLine.listingLineNumber) {

                this.assembledLine.error = "label \"" + identifier + "\" not yet defined here";
                return 0;
            }
            return symbolInfo.value;
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
                return sign*this.assembledLine.address;
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
                    if (this.assembledLine.error === undefined) {
                        this.assembledLine.error = "found H at end of non-hex number: " + this.line.substring(startIndex, this.column + 1);
                    }
                    return undefined;
                }
                this.column++;
            } else if (baseChar === "B") {
                // Check for programmer errors.
                if (base !== 2) {
                    if (this.assembledLine.error === undefined) {
                        this.assembledLine.error = "found B at end of non-binary number: " + this.line.substring(startIndex, this.column + 1);
                    }
                    return undefined;
                }
                this.column++;
            }
        }

        this.skipWhitespace();

        return sign * value;
    }

    private skipWhitespace(): void {
        while (this.column < this.line.length && isWhitespace(this.line[this.column])) {
            this.column++;
        }
    }

    private readIdentifier(allowRegister: boolean, toLowerCase: boolean): string | undefined {
        const startIndex = this.column;

        // Skip through the identifier.
        while (this.column < this.line.length && isLegalIdentifierCharacter(this.line[this.column], this.column == startIndex)) {
            this.column++;
        }

        if (this.column > startIndex) {
            let identifier = this.line.substring(startIndex, this.column);
            if (toLowerCase) {
                identifier = identifier.toLowerCase();
            }
            // Special case to parse AF'.
            if (allowRegister && identifier.toLowerCase() === "af" && this.foundChar("'")) {
                identifier += "'";
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
