import * as fs from "fs";
import {colors, isColorEnabled} from "./colors.js";
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
        super(binary, { collapse, annotations });
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
 * Return the span's text with the colors for what it shows, for a span inside
 * the annotation being explained.
 */
function colorSpan(span: HexdumpSpan): string {
    const has = (cssClass: string) => span.classes.indexOf(cssClass) >= 0;
    if (has("annotation")) {
        return colors.annotation(span.text);
    } else if (has("address")) {
        return colors.address(span.text);
    } else if (has("ascii-unprintable")) {
        return colors.muted(span.text);
    } else if (has("hex")) {
        // Both columns of bytes. (The ASCII column's spans have "hex" too, but
        // the counts in "... 5 consecutive bytes ..." lines don't.)
        return colors.data(span.text);
    } else {
        return span.text;
    }
}

/**
 * Hex dump a binary array. Addresses, bytes, and annotations are colored.
 * Outside the annotation being explained, bytes are dimmed and addresses are
 * a dim version of their color. Without color, those bytes are hidden.
 */
export function hexdumpBinary(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]): void {
    const hexdump = new ConsoleHexdumpGenerator(binary, collapse, annotations);
    for (const line of hexdump.generate()) {
        console.log(line.map(span => {
            const outside = span.classes.indexOf("outside-annotation") >= 0;
            if (!outside) {
                return colorSpan(span);
            } else if (!isColorEnabled()) {
                // Hide altogether.
                return "".padEnd(span.text.length, " ");
            } else if (span.classes.indexOf("address") >= 0) {
                return colors.muted(colors.address(span.text));
            } else {
                return colors.muted(span.text);
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
    const file = decodeTrs80File(buffer, { filename, disassemble: true });
    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        // Continue anyway, might have interesting information.
    }

    hexdumpBinary(file.binary, collapse, file.annotations);
}
