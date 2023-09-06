/**
 * EDTASM is an assembler, and this file handles its file format.
 *
 * https://www.trs-80.com/wordpress/tips/formats/#edasfile
 * https://www.classic-computers.org.nz/system-80/software-manuals/manuals-Editor-Assembler-Tandy.pdf
 */

import {AbstractTrs80File} from "./Trs80File.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import { toHexByte } from "z80-base";

const END_OF_PROGRAM = 0x1A;
const LINE_NUMBER_LENGTH = 5;

function isValidProgramNameChar(n: number) {
    return (n >= 0x41 && n <= 0x5A) || n === 0x20;
}

function isValidLineNumberChar(n: number) {
    return n >= 0xB0 && n <= 0xB9;
}

function isNewline(n: number): boolean {
    return n == 0x0A || n == 0x0D;
}

function formatLineNumber(lineNumber: number): string {
    return lineNumber.toString().padStart(LINE_NUMBER_LENGTH, "0")
}

/**
 * Whether the binary represents an EDTASM program.
 *
 * https://www.trs-80.com/wordpress/tips/formats/#edasfile
 */
export function isEdtasmProgram(binary: Uint8Array): boolean {
    return binary != null &&
        binary.length >= 13 &&
        binary[0] === 0xD3 &&
        isValidProgramNameChar(binary[1]) &&
        isValidProgramNameChar(binary[2]) &&
        isValidProgramNameChar(binary[3]) &&
        isValidProgramNameChar(binary[4]) &&
        isValidProgramNameChar(binary[5]) &&
        isValidProgramNameChar(binary[6]) &&
        isValidLineNumberChar(binary[7]) &&
        isValidLineNumberChar(binary[8]) &&
        isValidLineNumberChar(binary[9]) &&
        isValidLineNumberChar(binary[10]) &&
        isValidLineNumberChar(binary[11]) &&
        binary[12] === 0x20;
}

/**
 * Single line of assembly language source code.
 */
export class EdtasmLine {
    // Originally as five-digit number.
    public readonly lineNumber: number;
    // Tabs expanded, no newline.
    public readonly line: string;

    constructor(lineNumber: number, line: string) {
        this.lineNumber = lineNumber;
        this.line = line;
    }

    /**
     * Return this line in ASCII, without terminating newline.
     */
    public asAscii(): string {
        return formatLineNumber(this.lineNumber) + " " + this.line;
    }
}

/**
 * Assembly language source code.
 */
export class EdtasmFile extends AbstractTrs80File {
    public readonly className = "EdtasmFile";
    public readonly name: string;
    public readonly lines: EdtasmLine[];

    public override getDescription(): string {
        return "EDTASM file" + (this.name !== "" ? " (" + this.name + ")" : "");
    }

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                name: string, lines: EdtasmLine[]) {

        super(binary, error, annotations);
        this.name = name;
        this.lines = lines;
    }

    /**
     * Return this program in ASCII, with line numbers.
     */
    public asAscii(): string {
        return this.lines.map(line => line.asAscii() + "\n").join("");
    }
}

/**
 * Decode the program or return undefined if the file isn't an EDTASM file.
 */
export function decodeEdtasmFile(binary: Uint8Array): EdtasmFile | undefined {
    if (!isEdtasmProgram(binary)) {
        return undefined;
    }

    let error: string | undefined = undefined;
    const annotations: ProgramAnnotation[] = [];

    // Read name of program.
    const name =
        (String.fromCodePoint(binary[1]) +
            String.fromCodePoint(binary[2]) +
            String.fromCodePoint(binary[3]) +
            String.fromCodePoint(binary[4]) +
            String.fromCodePoint(binary[5]) +
            String.fromCodePoint(binary[6])).trim();

    annotations.push(new ProgramAnnotation("Magic number", 0, 1));
    annotations.push(new ProgramAnnotation("Name" + (name !== "" ? " (" + name + ")" : ""), 1, 7));

    const lines: EdtasmLine[] = [];
    let pos = 7;
    while (true) {
        if (pos + LINE_NUMBER_LENGTH >= binary.length || (pos < binary.length && binary[pos] === END_OF_PROGRAM)) {
            // End of program.
            if (pos < binary.length && binary[pos] === END_OF_PROGRAM) {
                annotations.push(new ProgramAnnotation("End of file marker", pos, pos + 1));
            } else if (error === undefined) {
                error = "File is not terminated with 0x" + toHexByte(END_OF_PROGRAM);
            }
            return new EdtasmFile(binary, error, annotations, name, lines);
        }

        // Read line number.
        let lineNumber = 0;
        for (let i = 0; i < LINE_NUMBER_LENGTH; i++) {
            if (error === undefined && !isValidLineNumberChar(binary[pos])) {
                error = "Invalid line number at position " + pos;
            }
            lineNumber = lineNumber*10 + (binary[pos] - 0xB0);
            pos++;
        }

        annotations.push(new ProgramAnnotation("Line number (" + formatLineNumber(lineNumber) + ")",
            pos - LINE_NUMBER_LENGTH, pos));

        // Parse line.
        let columnNumber = 0;
        const linePos = pos;
        const parts: string[] = [];
        while (pos < binary.length && !isNewline(binary[pos]) && binary[pos] !== END_OF_PROGRAM) {
            let text: string;
            if (binary[pos] === 0x09) {
                // Tab.
                text = "".padEnd(8 - columnNumber % 8);
            } else {
                // Non-tab.
                text = String.fromCodePoint(binary[pos]);
            }
            parts.push(text);
            columnNumber += text.length;
            pos++;
        }

        lines.push(new EdtasmLine(lineNumber, parts.join("")));

        // Skip EOL.
        while (pos < binary.length && isNewline(binary[pos])) {
            pos++;
        }

        annotations.push(new ProgramAnnotation("Line text", linePos, pos));
    }
}
