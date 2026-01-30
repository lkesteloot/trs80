import {toHex, toHexByte} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation.js";

// Unicode for a vertical ellipsis.
const VERTICAL_ELLIPSIS = 0x22EE;

/**
 * Returns whether two string arrays are the same.
 *
 * Lodash has isEqual(), but it adds about 15 kB after minimization! (It's a deep comparison
 * that has to deal with all sorts of data types.)
 */
export function isSameStringArray(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Compare two parts of an array for equality.
 */
function segmentsEqual(binary: Uint8Array, start1: number, start2: number, length: number): boolean {
    while (length-- > 0) {
        if (binary[start1++] !== binary[start2++]) {
            return false;
        }
    }

    return true;
}

/**
 * Count consecutive bytes of the same value that are around "addr".
 */
function countConsecutive(binary: Uint8Array, addr: number, beginAddr: number, endAddr: number): number {
    const value = binary[addr];

    // Find first same byte value.
    let firstAddr = addr;
    while (firstAddr > beginAddr && binary[firstAddr - 1] === value) {
        firstAddr--;
    }

    // Find last same byte value.
    let lastAddr = addr;
    while (lastAddr < endAddr - 1 && binary[addr + 1] === value) {
        lastAddr++;
    }

    return lastAddr - firstAddr + 1;
}

/**
 * Whether this segment is made up of the same value.
 */
function allSameByte(binary: Uint8Array, addr: number, length: number): boolean {
    for (let i = 1; i < length; i++) {
        if (binary[addr + i] !== binary[addr]) {
            return false;
        }
    }

    return true;
}

export type HexdumpOptions = {
    /**
     * If sequential rows are identical, collapse them into one.
     */
    collapse: boolean,
    /**
     * Annotations to show to the right of the hexdump.
     */
    annotations: ProgramAnnotation[],
    /**
     * Whether to generate an extra line with just the end address.
     */
    showEndAddress: boolean,
    /**
     * Number of bytes to show per row.
     */
    stride: number,
};
const DEFAULT_OPTIONS = {
    collapse: true,
    annotations: [],
    showEndAddress: false,
    stride: 16,
} as const satisfies HexdumpOptions;

/**
 * Generates a hexdump for the given binary.
 *
 * The LINE_TYPE type keeps track of an entire line being output. It's made of several SPAN_TYPE objects.
 */
export abstract class HexdumpGenerator<LINE_TYPE, SPAN_TYPE> {
    private readonly binary: Uint8Array;
    private readonly options: HexdumpOptions;
    private readonly addrDigits: number;
    private readonly addrSpaces: string;

    protected constructor(binary: Uint8Array, options?: Partial<HexdumpOptions>) {
        this.binary = binary;
        this.options = {
            ... DEFAULT_OPTIONS,
            ... options,
        };

        // Figure out the number of digits in the address: 4 or 6.
        this.addrDigits = this.binary.length < (2 << 16) ? 4 : 6;
        this.addrSpaces = "".padStart(this.addrDigits, " ");
    }

    /**
     * Create a new line object.
     */
    protected abstract newLine(): LINE_TYPE;

    /**
     * Get the accumulated text for a line.
     */
    protected abstract getLineText(line: LINE_TYPE): string;

    /**
     * Add a span with the given text and classes to the specified line.
     *
     * The classes are:
     *
     * - address: hex address of a row.
     * - hex: hex data.
     * - ascii: plain ASCII data.
     * - ascii-unprintable: ASCII data but not printable (e.g., control character).
     * - annotation: text annotations on the right side.
     * - outside-annotation: mixin class for data that's outside the current line's annotation. Should
     *   be displayed dimly or not at all.
     */
    protected abstract newSpan(line: LINE_TYPE, text: string, ...cssClass: string[]): SPAN_TYPE;

    /**
     * Add the text to the span.
     */
    protected abstract addTextToSpan(span: SPAN_TYPE, text: string): void;

    /**
     * Whether the subclass supports expansion of nested annotations. If not, then
     * they won't be generated.
     */
    protected supportsNestedAnnotations(): boolean {
        return false;
    }

    /**
     * For subclasses that support nested annotations, informs the subclass that
     * we're about to generate lines that can be expanded.
     */
    protected beginExpandable(): void {
        // Subclass should override and modify the next line to show some kind
        // of "expand" button. All the lines until beginExpanded() should be
        // hidden when this button is pressed.
    }

    protected beginExpanded(): void {
        // Subclass should override and hide all subsequent lines by default,
        // only showing them when the above button is pressed.
    }

    protected endExpanded(): void {
        // Subclass should override and return to normal (always-visible) lines.
    }

    /**
     * Whether the subclass wants the registerHexByte() and registerAsciiByte() methods
     * called. If yes, each span will only have one byte. If no, spans can include
     * multiple bytes, for efficiency, using the addTextToSpan() method.
     */
    protected requireRegisteredBytes(): boolean {
        return false;
    }

    /**
     * A hex byte (in the binary) has been generated for this index.
     * Only called if requireRegisteredBytes() returns true.
     */
    protected registerHexByte(span: SPAN_TYPE, index: number): void {
        // Nothing.
    }

    /**
     * An ASCII byte (in the binary) has been generated for this index.
     * Only called if requireRegisteredBytes() returns true.
     */
    protected registerAsciiByte(span: SPAN_TYPE, index: number): void {
        // Nothing.
    }

    /**
     * Generate all line elements for this binary.
     */
    public *generate(): Generator<LINE_TYPE, void, void> {
        yield* this.generateAnnotations(0, this.binary.length, this.options.annotations);

        if (this.options.showEndAddress) {
            // Final address (with no data) to show where the file ends.
            const finalLine = this.newLine();
            this.newSpan(finalLine, toHex(this.binary.length, this.addrDigits), "address");
            yield finalLine;
        }
    }

    /**
     * Generate the lines for the given annotations. Creates blank annotations to fill the space
     * between the provided annotations.
     */
    private *generateAnnotations(addr: number, endAddr: number,
                                 annotations: ProgramAnnotation[]): Generator<LINE_TYPE, void, void> {

        // Sort by start address in case they were generated out of order.
        annotations.sort((a, b) => a.begin - b.begin);

        for (const annotation of annotations) {
            // Fill empty space between annotations and at the very start.
            if (addr < annotation.begin) {
                yield* this.generateAnnotation(new ProgramAnnotation("", addr, annotation.begin));
            }
            // Make sure there are no overlapping annotations.
            if (addr <= annotation.begin) {
                // Include nested annotations if the subclass wants them.
                const expandNestedAnnotations = this.supportsNestedAnnotations() &&
                    annotation.nestedAnnotations.length > 0;
                if (expandNestedAnnotations) {
                    this.beginExpandable();
                }

                // Show this annotation.
                yield* this.generateAnnotation(annotation);

                if (expandNestedAnnotations) {
                    this.beginExpanded();
                    yield* this.generateAnnotations(annotation.begin, annotation.end, annotation.nestedAnnotations);
                    this.endExpanded();
                }
            }
            addr = annotation.end;
        }

        // Fill to end of program.
        if (addr < endAddr) {
            yield* this.generateAnnotation(new ProgramAnnotation("", addr, endAddr));
        }
    }

    /**
     * Generate all the lines for an annotation.
     */
    private *generateAnnotation(annotation: ProgramAnnotation): Generator<LINE_TYPE, void, void> {
        const binary = this.binary;

        const stride = this.options.stride;
        const firstLineAddr = Math.floor(annotation.begin/stride)*stride;
        const firstFullLineAddr = Math.ceil(annotation.begin/stride)*stride;
        // If the annotation is zero-length and starts at a multiple of STRIDE, push it to the next STRIDE
        // above firstLineAddr. Otherwise no row will be generated. (This is for empty annotations
        // at the beginning of nested annotation lists.)
        const endAddr = Math.max(Math.ceil(annotation.end/stride)*stride, firstLineAddr + stride);
        const lastLineAddr = endAddr - stride;
        let previousAddr: number | undefined = undefined;
        for (let addr = firstLineAddr; addr < endAddr; addr += stride) {
            if (this.options.collapse &&                                    // User wants duplicate lines collapsed.
                addr !== firstLineAddr &&                                   // Never the first line, full or partial.
                addr !== firstFullLineAddr &&                               // Never the first full line.
                !(addr === lastLineAddr && endAddr !== annotation.end) &&   // Never the last partial line.
                previousAddr !== undefined &&
                segmentsEqual(binary, previousAddr, addr, stride)) {

                // Collapsed section. See if we want to print the text for it this time.
                if (addr === previousAddr + stride) {
                    const line = this.newLine();

                    if (allSameByte(binary, addr, stride)) {
                        // Lots of the same byte repeated. Say how many there are.
                        const count = countConsecutive(binary, addr, annotation.begin, annotation.end);
                        this.newSpan(line, this.addrSpaces + "   ... ", "address");
                        this.newSpan(line, count.toString(), "ascii");
                        this.newSpan(line, " (", "address");
                        this.newSpan(line, "0x" + count.toString(16).toUpperCase(), "ascii");
                        this.newSpan(line, ") consecutive bytes of ", "address");
                        this.newSpan(line, "0x" + toHexByte(binary[addr]), "hex");
                        this.newSpan(line, " ...", "address");
                    } else {
                        // A repeating pattern, but not all the same byte. Say how many times repeated.
                        let count = 1;
                        for (let otherAddr = addr + stride; otherAddr <= binary.length - stride; otherAddr += stride) {
                            if (segmentsEqual(binary, previousAddr, otherAddr, stride)) {
                                count += 1;
                            } else {
                                break;
                            }
                        }
                        this.newSpan(line, this.addrSpaces + "  ... ", "address");
                        this.newSpan(line, count.toString(), "ascii");
                        const plural = count === 1 ? "" : "s";
                        this.newSpan(line, ` repetition${plural} of previous row ...`, "address");
                    }

                    // Draw vertical ellipsis.
                    if (annotation.text !== "" && addr !== firstLineAddr) {
                        const lineText = this.getLineText(line);
                        const indent = this.addrDigits + stride*4 + 7 + (annotation.text.length - 1)/2;
                        const spaces = Math.max(indent - lineText.length, 0);
                        const label = " ".repeat(spaces) + String.fromCodePoint(VERTICAL_ELLIPSIS);
                        this.newSpan(line, label, "annotation");
                    }

                    yield line;
                }
            } else {
                // Non-collapsed row.
                previousAddr = addr;

                let label: string = "";
                if (annotation.text !== "") {
                    if (addr === firstLineAddr) {
                        label = annotation.text;
                    } else {
                        const spaces = (annotation.text.length - 1)/2;
                        label = " ".repeat(spaces) + String.fromCodePoint(VERTICAL_ELLIPSIS);
                    }
                }

                yield this.generateRow(addr, annotation.begin, annotation.end, label);
            }
        }
    }

    /**
     * Generates a single row of hex and ASCII.
     * @param addr address for the line.
     * @param beginAddr the first address of this annotation (inclusive).
     * @param endAddr this last address of this annotation (exclusive).
     * @param label the label to show on this row.
     * @return the created row.
     */
    private generateRow(addr: number, beginAddr: number, endAddr: number, label: string): LINE_TYPE {
        const binary = this.binary;
        const stride = this.options.stride;

        const line = this.newLine();
        const cssClass = ["address"];
        if (addr < beginAddr) {
            cssClass.push("outside-annotation");
        }
        this.newSpan(line, toHex(addr, this.addrDigits) + "  ", ...cssClass);

        // Utility function for adding text to a line, minimizing the number of needless spans.
        let currentCssClass: string[] | undefined = undefined;
        let e: SPAN_TYPE | undefined = undefined;
        const addText = (text: string, ...cssClass: string[]) => {
            if (e === undefined || currentCssClass === undefined || !isSameStringArray(cssClass, currentCssClass)) {
                e = this.newSpan(line, text, ...cssClass);
                currentCssClass = cssClass.slice();
            } else {
                this.addTextToSpan(e, text);
            }
        };

        // Hex.
        let subAddr: number;
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + stride; subAddr++) {
            const cssClass = ["hex"];
            const outside = subAddr < beginAddr || subAddr >= endAddr;
            if (outside) {
                cssClass.push("outside-annotation");
            }
            const hexByte = toHexByte(binary[subAddr]);
            if (this.requireRegisteredBytes() && !outside) {
                const span = this.newSpan(line, hexByte, ...cssClass);
                this.registerHexByte(span, subAddr);
                e = undefined;
            } else {
                addText(hexByte, ...cssClass);
            }

            // Spacing.
            const halfWay = subAddr == addr + stride/2 - 1;
            const spacing = halfWay ? "  " : " ";
            addText(spacing, ...cssClass);
        }
        const numBytesSkipped = addr + stride - subAddr;
        addText("".padStart(numBytesSkipped*3 + (numBytesSkipped > stride/2 ? 1 : 0) + 2, " "), "hex");

        // ASCII.
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + stride; subAddr++) {
            const c = binary[subAddr];
            const cssClass = ["hex"];
            let char;
            if (c >= 32 && c < 127) {
                cssClass.push("ascii");
                char = String.fromCharCode(c);
            } else {
                cssClass.push("ascii-unprintable");
                char = ".";
            }
            const outside = subAddr < beginAddr || subAddr >= endAddr;
            if (outside) {
                cssClass.push("outside-annotation");
            }
            if (this.requireRegisteredBytes() && !outside) {
                const span = this.newSpan(line, char, ...cssClass);
                this.registerAsciiByte(span, subAddr);
                e = undefined;
            } else {
                addText(char, ...cssClass);
            }
        }
        if (label !== "") {
            addText("".padStart(addr + stride - subAddr + 2, " ") + label, "annotation");
        }

        return line;
    }
}
