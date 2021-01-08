import {toHexByte, toHexWord} from "z80-base";
import {ProgramAnnotation} from "trs80-base/dist/ProgramAnnotation";
import {isSameStringArray} from "./Utils";

const STRIDE = 16;

function newLine(lines: HTMLElement[]): HTMLElement {
    const line = document.createElement("div");
    lines.push(line);
    return line;
}

function newSpan(line: HTMLElement, text: string, ...cssClass: string[]): HTMLElement {
    const e = document.createElement("span");
    e.classList.add(...cssClass);
    e.innerText = text;
    line.append(e);
    return e;
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

export class HexdumpGenerator {
    private readonly binary: Uint8Array;
    private readonly collapse: boolean;
    private readonly annotations: ProgramAnnotation[];

    constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        this.binary = binary;
        this.collapse = collapse;
        this.annotations = annotations;
    }

    public generate(): HTMLElement[] {
        const lines: HTMLElement[] = [];
        const binary = this.binary;

        const generateAnnotation = (annotation: ProgramAnnotation) => {
            const beginAddr = Math.floor(annotation.begin/STRIDE)*STRIDE;
            const endAddr = Math.min(Math.ceil(annotation.end/STRIDE)*STRIDE, binary.length);
            let lastAddr: number | undefined = undefined;
            for (let addr = beginAddr; addr < endAddr; addr += STRIDE) {
                if (this.collapse && lastAddr !== undefined &&
                    binary.length - addr >= STRIDE && segmentsEqual(binary, lastAddr, addr, STRIDE)) {

                    if (addr === lastAddr + STRIDE) {
                        const line = newLine(lines);

                        if (allSameByte(binary, addr, STRIDE)) {
                            // Lots of the same byte repeated. Say many there are.
                            const count = countConsecutive(binary, addr);
                            newSpan(line, "      ... ", "address");
                            newSpan(line, count.toString(), "ascii");
                            newSpan(line, " (", "address");
                            newSpan(line, "0x" + count.toString(16).toUpperCase(), "ascii");
                            newSpan(line, ") consecutive bytes of ", "address");
                            newSpan(line, "0x" + toHexByte(binary[addr]), "hex");
                            newSpan(line, " ...", "address");
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
                            newSpan(line, "      ... ", "address");
                            newSpan(line, count.toString(), "ascii");
                            const plural = count === 1 ? "" : "s";
                            newSpan(line, ` repetition${plural} of previous row ...`, "address");
                        }

                        // Draw vertical ellipsis.
                        if (annotation.text !== "" && addr !== beginAddr) {
                            // This doesn't trigger a reflow. Don't use innerText, which does.
                            const lineText = line.textContent ?? "";
                            const width = STRIDE*4 + 13;
                            const label = String.fromCodePoint(0x22EE).padStart(width - lineText.length, " ");
                            newSpan(line, label, "annotation");
                        }
                    }
                } else {
                    lastAddr = addr;

                    let label: string = "";
                    if (annotation.text !== "") {
                        if (addr === beginAddr) {
                            label = annotation.text;
                        } else {
                            // Vertical ellipsis.
                            label = "  " + String.fromCodePoint(0x22EE);
                        }
                    }
                    this.generateRow(lines, addr, annotation.begin, annotation.end, label);
                }
            }
        };

        // Sort in case they were generated out of order.
        this.annotations.sort((a, b) => a.begin - b.begin);

        let lastAnnotation: ProgramAnnotation | undefined = undefined;
        for (const annotation of this.annotations) {
            if (lastAnnotation !== undefined && lastAnnotation.end < annotation.begin) {
                generateAnnotation(new ProgramAnnotation("", lastAnnotation.end, annotation.begin));
            }
            // Make sure there are no overlapping annotations.
            if (lastAnnotation === undefined || lastAnnotation.end <= annotation.begin) {
                generateAnnotation(annotation);
            }
            lastAnnotation = annotation;
        }
        const lastAnnotationEnd = lastAnnotation !== undefined ? lastAnnotation.end : 0;
        if (lastAnnotationEnd < binary.length) {
            generateAnnotation(new ProgramAnnotation("", lastAnnotationEnd, binary.length));
        }

        // Final address to show where file ends.
        newSpan(newLine(lines), toHexWord(binary.length), "address");

        return lines;
    }

    private generateRow(lines: HTMLElement[], addr: number, beginAddr: number, endAddr: number, label: string) {
        const binary = this.binary;

        const line = newLine(lines);
        const cssClass = ["address"];
        if (addr < beginAddr) {
            cssClass.push("outside-annotation");
        }
        newSpan(line, toHexWord(addr) + "  ", ...cssClass);

        // Utility function for adding text to a line, minimizing the number of needless spans.
        let currentCssClass: string[] | undefined = undefined;
        let e: HTMLElement | undefined = undefined;
        const addText = (text: string, ...cssClass: string[]) => {
            if (e === undefined || currentCssClass === undefined || !isSameStringArray(cssClass, currentCssClass)) {
                e = newSpan(line, text, ...cssClass);
                currentCssClass = cssClass.slice();
            } else {
                e.innerText += text;
            }
        };

        // Hex.
        let subAddr: number;
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + STRIDE; subAddr++) {
            const cssClass = ["hex"];
            if (subAddr < beginAddr || subAddr >= endAddr) {
                cssClass.push("outside-annotation");
            }
            addText(toHexByte(binary[subAddr]) + " ", ...cssClass);
        }
        addText("".padStart((addr + STRIDE - subAddr) * 3 + 2, " "), "hex");

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
            if (subAddr < beginAddr || subAddr >= endAddr) {
                cssClass.push("outside-annotation");
            }
            addText(char, ...cssClass);
        }
        if (label !== "") {
            addText("".padStart(addr + STRIDE - subAddr + 2, " ") + label, "annotation");
        }
    }
}
