import {toHex, toHexByte} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation.js";

// Number of bytes per row.
const STRIDE = 16;

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
 * Count consecutive bytes that are around "addr".
 */
function countConsecutive(binary: Uint8Array, addr: number) {
    const value = binary[addr];

    let startAddr = addr;
    while (startAddr > 0 && binary[startAddr - 1] === value) {
        startAddr--;
    }

    while (addr < binary.length - 1 && binary[addr + 1] === value) {
        addr++;
    }

    return addr - startAddr + 1;
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

/**
 * Generates a hexdump for the given binary.
 *
 * The LINE_TYPE type keeps track of an entire line being output. It's made of several SPAN_TYPE objects.
 */
export abstract class HexdumpGenerator<LINE_TYPE, SPAN_TYPE> {
    private readonly binary: Uint8Array;
    private readonly collapse: boolean;
    private readonly annotations: ProgramAnnotation[];

    protected constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        this.binary = binary;
        this.collapse = collapse;
        this.annotations = annotations;
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
     * Generate all HTML elements for this binary.
     */
    public *generate(): Generator<LINE_TYPE, void, void> {
        const binary = this.binary;

        const [addrDigits, addrSpaces] = this.computeAddressSize();

        yield* this.generateAnnotations(binary, 0, binary.length, addrDigits, this.annotations);

        // Final address (with no data) to show where file ends.
        const finalLine = this.newLine();
        this.newSpan(finalLine, toHex(binary.length, addrDigits), "address");
        yield finalLine;
    }

    private *generateAnnotations(binary: Uint8Array, addr: number, endAddr: number, addrDigits: number,
                                 annotations: ProgramAnnotation[]): Generator<LINE_TYPE, void, void> {

        // Sort in case they were generated out of order.
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
                    yield* this.generateAnnotations(binary, annotation.begin, annotation.end,
                        addrDigits, annotation.nestedAnnotations);
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
     * @param annotation the annotation to generate.
     */
    private *generateAnnotation(annotation: ProgramAnnotation): Generator<LINE_TYPE, void, void> {
        const binary = this.binary;

        const [addrDigits, addrSpaces] = this.computeAddressSize();

        const beginAddr = Math.floor(annotation.begin/STRIDE)*STRIDE;
        // If the annotation is zero-length and a multiple of STRIDE, push it to the next STRIDE
        // above beginAddr. Otherwise no row will be generated. (This is for empty annotations
        // at the beginning of nested annotation lists.)
        const endAddr = Math.min(Math.max(
            Math.ceil(annotation.end/STRIDE)*STRIDE, beginAddr + STRIDE), binary.length);
        let lastAddr: number | undefined = undefined;
        for (let addr = beginAddr; addr < endAddr; addr += STRIDE) {
            if (this.collapse && lastAddr !== undefined &&
                binary.length - addr >= STRIDE && segmentsEqual(binary, lastAddr, addr, STRIDE)) {

                // Collapsed section. See if we want to print the text for it this time.
                if (addr === lastAddr + STRIDE) {
                    const line = this.newLine();

                    if (allSameByte(binary, addr, STRIDE)) {
                        // Lots of the same byte repeated. Say many there are.
                        const count = countConsecutive(binary, addr);
                        this.newSpan(line, addrSpaces + "   ... ", "address");
                        this.newSpan(line, count.toString(), "ascii");
                        this.newSpan(line, " (", "address");
                        this.newSpan(line, "0x" + count.toString(16).toUpperCase(), "ascii");
                        this.newSpan(line, ") consecutive bytes of ", "address");
                        this.newSpan(line, "0x" + toHexByte(binary[addr]), "hex");
                        this.newSpan(line, " ...", "address");
                    } else {
                        // A repeating pattern, but not all the same byte. Say how many times repeated.
                        let count = 1;
                        for (let otherAddr = addr + STRIDE; otherAddr <= binary.length - STRIDE; otherAddr += STRIDE) {
                            if (segmentsEqual(binary, lastAddr, otherAddr, STRIDE)) {
                                count += 1;
                            } else {
                                break;
                            }
                        }
                        this.newSpan(line, addrSpaces + "  ... ", "address");
                        this.newSpan(line, count.toString(), "ascii");
                        const plural = count === 1 ? "" : "s";
                        this.newSpan(line, ` repetition${plural} of previous row ...`, "address");
                    }

                    // Draw vertical ellipsis.
                    if (annotation.text !== "" && addr !== beginAddr) {
                        const lineText = this.getLineText(line);
                        const width = addrDigits + STRIDE*4 + 10;
                        const label = String.fromCodePoint(VERTICAL_ELLIPSIS).padStart(width - lineText.length, " ");
                        this.newSpan(line, label, "annotation");
                    }

                    yield line;
                }
            } else {
                // Non-collapsed row.
                lastAddr = addr;

                let label: string = "";
                if (annotation.text !== "") {
                    if (addr === beginAddr) {
                        label = annotation.text;
                    } else {
                        label = "  " + String.fromCodePoint(VERTICAL_ELLIPSIS);
                    }
                }

                yield this.generateRow(addr, addrDigits, annotation.begin, annotation.end, label);
            }
        }
    }

    /**
     * Generates a single row of hex and ASCII.
     * @param addr address for the line.
     * @param addrDigits the number of digits in the address.
     * @param beginAddr the first address of this annotation (inclusive).
     * @param endAddr this last address of this annotation (exclusive).
     * @param label the label to show on this row.
     * @return the created row.
     */
    private generateRow(addr: number, addrDigits: number,
                        beginAddr: number, endAddr: number, label: string): LINE_TYPE {

        const binary = this.binary;

        const line = this.newLine();
        const cssClass = ["address"];
        if (addr < beginAddr) {
            cssClass.push("outside-annotation");
        }
        this.newSpan(line, toHex(addr, addrDigits) + "  ", ...cssClass);

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
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + STRIDE; subAddr++) {
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
            const halfWay = subAddr == addr + STRIDE/2 - 1;
            const spacing = halfWay ? "  " : " ";
            addText(spacing, ...cssClass);
        }
        const numBytesSkipped = addr + STRIDE - subAddr;
        addText("".padStart(numBytesSkipped*3 + (numBytesSkipped > STRIDE/2 ? 1 : 0) + 2, " "), "hex");

        // ASCII.
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + STRIDE; subAddr++) {
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
            addText("".padStart(addr + STRIDE - subAddr + 2, " ") + label, "annotation");
        }

        return line;
    }

    /**
     * Computes the number of hex digits in the displayed address, and the spaces this represents.
     */
    private computeAddressSize(): [number, string] {
        // Figure out the number of digits in the address: 4 or 6.
        const addrDigits = this.binary.length < (2 << 16) ? 4 : 6;
        const addrSpaces = "".padStart(addrDigits, " ");

        return [addrDigits, addrSpaces];
    }
}
