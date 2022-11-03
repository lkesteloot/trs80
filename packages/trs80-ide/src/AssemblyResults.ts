
import {Asm, AssembledLine, SourceFile, SymbolAppearance, SymbolType} from "z80-asm";
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
    // From 16-bit address to 1-based line number.
    public readonly addressToLineMap = new Map<number, number>();
    // All variable symbol references (not jump/code references).
    public readonly variableReferences: SymbolAppearance[] = [];

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

            if (line.lineNumber !== undefined && line.getSourceFileBinary().length > 0) {
                this.addressToLineMap.set(line.address, line.lineNumber + 1);
            }

            if (line.error !== undefined) {
                // Too bad TS can't detect this narrowing.
                errorLines.push(line as ErrorAssembledLine);

                if (line.lineNumber !== undefined) {
                    errorLineNumbers.push(line.lineNumber + 1);
                }
            }

            // Restart timing if there's a label, assume it's a loop.
            if (line.symbolsDefined.length > 0) {
                timing = 0;
            }
            if (line.variant !== undefined && line.lineNumber !== undefined) {
                const clocks = line.variant.clr?.without_jump_clock_count;
                if (clocks !== undefined) {
                    timing += clocks;
                }
                this.timingMap.set(line.lineNumber + 1, timing);
            }

            // Append to list of all appearances.
            for (const ref of line.symbolsReferenced) {
                switch (ref.symbol.type) {
                    case SymbolType.UNKNOWN:
                    case SymbolType.CODE:
                    default:
                        // Skip it.
                        break;

                    case SymbolType.BYTE:
                    case SymbolType.WORD:
                    case SymbolType.ARRAY:
                        this.variableReferences.push(ref);
                        break;
                }
            }
        }

        this.errorLines = errorLines;
        this.errorLineNumbers = errorLineNumbers;
    }

    // Find symbol usage at a location, or undefined if we're not on a symbol.
    public findSymbolAt(lineNumber: number, column: number): SymbolHit | undefined {
        const assembledLine = this.sourceFile.assembledLines[lineNumber];

        // See if we're at a definition.
        for (const appearance of assembledLine.symbolsDefined) {
            if (appearance.matches(lineNumber, column)) {
                return new SymbolHit(appearance.symbol, true, appearance.index);
            }
        }

        // See if we're at a use.
        for (const appearance of assembledLine.symbolsReferenced) {
            if (appearance.matches(lineNumber, column)) {
                return new SymbolHit(appearance.symbol, false, appearance.index);
            }
        }

        return undefined;
    }

    // Whether these two assembly results are the same.
    public equals(other: AssemblyResults): boolean {
        // Not clear what to compare here. Do the simple thing and compare
        // all assembled lines, since that's what ends up in memory, and
        // entry point, but maybe other things matter too.
        if (this.asm.entryPoint !== other.asm.entryPoint) {
            return false;
        }

        const lines1 = this.asm.assembledLines;
        const lines2 = other.asm.assembledLines;

        let i1 = 0;
        let i2 = 0;

        while (true) {
            // It's nice to ignore blank lines, so that we can add comments without
            // restarting everything.
            while (i1 < lines1.length && lines1[i1].getSourceFileBinary().length === 0) i1 += 1;
            while (i2 < lines2.length && lines2[i2].getSourceFileBinary().length === 0) i2 += 1;

            if (i1 === lines1.length && i2 === lines2.length) {
                // Reached end on both.
                return true;
            }
            if (i1 === lines1.length || i2 === lines2.length) {
                // Reached end on one, the other has extra lines.
                return false;
            }

            // Compare contents of lines.
            if (!lines1[i1].equals(lines2[i2])) {
                return false;
            }

            i1 += 1;
            i2 += 1;
        }
    }
}
