import * as fs from "fs";
import chalk from "chalk";
import {HexdumpGenerator, ProgramAnnotation, decodeTrs80File } from "trs80-base";

/**
 * Represents a span of characters in the hexdump with a single set of classes.
 */
class HexdumpSpan {
    public text: string;
    public readonly classes: string[];

    constructor(text: string, classes: string[]) {
        this.text = text;
        this.classes = classes;
    }
}

/**
 * Hexdump generator for console output.
 */
class ConsoleHexdumpGenerator extends HexdumpGenerator<HexdumpSpan[], HexdumpSpan> {
    constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        super(binary, collapse, annotations);
    }

    protected newLine(): HexdumpSpan[] {
        return [];
    }

    protected getLineText(line: HexdumpSpan[]): string {
        return line.map(span => span.text).join("");
    }

    protected newSpan(line: HexdumpSpan[], text: string, ...cssClass: string[]): HexdumpSpan {
        const span = new HexdumpSpan(text, cssClass);
        line.push(span);
        return span;
    }

    protected addTextToSpan(span: HexdumpSpan, text: string): void {
        span.text += text;
    }
}

/**
 * Hex dump a binary array.
 */
export function hexdumpBinary(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]): void {
    const hexdump = new ConsoleHexdumpGenerator(binary, collapse, annotations);
    for (const line of hexdump.generate()) {
        console.log(line.map(span => {
            if (span.classes.indexOf("outside-annotation") >= 0) {
                if (chalk.level === 0) {
                    // Hide altogether.
                    return "".padEnd(span.text.length, " ");
                } else {
                    return chalk.dim(span.text);
                }
            } else {
                if (span.classes.indexOf("ascii-unprintable") >= 0) {
                    return chalk.dim(span.text);
                }
                return span.text;
            }
        }).join(""));
    }
}

/**
 * Handle the "hexdump" command.
 */
export function hexdump(filename: string, collapse: boolean): void {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Decode the file.
    const file = decodeTrs80File(buffer, filename);
    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        return;
    }

    hexdumpBinary(file.binary, collapse, file.annotations);
}
