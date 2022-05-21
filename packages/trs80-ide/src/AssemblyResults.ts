
import {Asm, AssembledLine, SourceFile} from "z80-asm";
import {ScreenshotSection} from "./ScreenshotSection.js";

// Error is required.
type ErrorAssembledLine = AssembledLine & { error: string };

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

    constructor(asm: Asm, sourceFile: SourceFile, screenshotSections: ScreenshotSection[]) {
        this.asm = asm;
        this.sourceFile = sourceFile;
        this.screenshotSections = screenshotSections;

        // Gather all errors.
        const errorLines: ErrorAssembledLine[] = [];
        const errorLineNumbers: number[] = []; // 1-based.
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
        }
        this.errorLines = errorLines;
        this.errorLineNumbers = errorLineNumbers;
    }
}
