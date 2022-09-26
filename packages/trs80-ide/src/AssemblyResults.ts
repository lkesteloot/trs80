
import {Asm, AssembledLine, SourceFile} from "z80-asm";
import {ScreenshotSection} from "./ScreenshotSection";
import {SymbolHit} from "./SymbolHit";

// Error is required.
export type ErrorAssembledLine = AssembledLine & { error: string };

/**
 * Everything we know about the assembled code.
 */
export class AssemblyResults {
    public readonly asm: Asm;
    public readonly sourceFile: SourceFile;
    public readonly screenshotSections: ScreenshotSection[];
    // Map from 1-based line number to assembled line.
    public readonly lineMap = new Map<number, AssembledLine>();
    public readonly errorLines: ErrorAssembledLine[];
    public readonly errorLineNumbers: number[]; // 1-based.
    // Map from 1-based line number to timing (clocks since most recent loop).
    public readonly timingMap = new Map<number, number>();

    constructor(asm: Asm, sourceFile: SourceFile, screenshotSections: ScreenshotSection[]) {
        this.asm = asm;
        this.sourceFile = sourceFile;
        this.screenshotSections = screenshotSections;

        // Gather all errors.
        const errorLines: ErrorAssembledLine[] = [];
        const errorLineNumbers: number[] = []; // 1-based.
        let timing = 0;
        for (const line of sourceFile.assembledLines) {
            if (line.lineNumber !== undefined) {
                this.lineMap.set(line.lineNumber + 1, line);
            }

            if (line.error !== undefined) {
                // Too bad TS can't detect this narrowing.
                errorLines.push(line as ErrorAssembledLine);

                if (line.lineNumber !== undefined) {
                    errorLineNumbers.push(line.lineNumber + 1);
                }
            }

            // TODO find more direct way to know if this line defines a symbol.
            let definesSymbol = false;
            for (const symbol of line.symbols) {
                for (const definition of symbol.definitions) {
                    if (definition.lineNumber === line.lineNumber) {
                        definesSymbol = true;
                        break;
                    }
                }
                if (definesSymbol) {
                    break;
                }
            }
            if (definesSymbol) {
                timing = 0;
            }
            if (line.variant !== undefined && line.lineNumber !== undefined) {
                const clocks = line.variant.clr?.without_jump_clock_count;
                if (clocks !== undefined) {
                    timing += clocks;
                }
                this.timingMap.set(line.lineNumber + 1, timing);
            }
        }
        this.errorLines = errorLines;
        this.errorLineNumbers = errorLineNumbers;
    }

    // Find symbol usage at a location, or undefined if we're not on a symbol.
    public findSymbolAt(lineNumber: number, column: number): SymbolHit | undefined {
        const assembledLine = this.sourceFile.assembledLines[lineNumber];
        for (const symbol of assembledLine.symbols) {
            // See if we're at a definition.
            for (let i = 0; i < symbol.definitions.length; i++) {
                if (symbol.matches(symbol.definitions[i], lineNumber, column)) {
                    return new SymbolHit(symbol, true, i);
                }
            }
            // See if we're at a use.
            for (let i = 0; i < symbol.references.length; i++) {
                if (symbol.matches(symbol.references[i], lineNumber, column)) {
                    return new SymbolHit(symbol, false, i);
                }
            }
        }

        return undefined;
    }
}
