import jss from './Jss'
import {toHexByte, toHexWord} from "z80-base";
import {Highlightable} from "./Highlighter";
import {disasmForTrs80Program, Level1Program, Level1Type} from "trs80-base";
import {ProgramAnnotation} from "trs80-base/dist/ProgramAnnotation";

/**
 * Add text to the line with the specified class.
 *
 * @param out the enclosing element to add to.
 * @param text the text to add.
 * @param className the name of the class for the item.
 */
function add(out: HTMLElement, text: string, className: string): HTMLElement {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
    return e;
}

// Stylesheet.
const BACKGROUND_COLOR = "var(--background)";
const STYLE = {
    error: {
        color: "var(--red)",
    },
    address: {
        color: "var(--foreground-secondary)",
    },
    hex: {
        color: "var(--blue)",
    },
    opcodes: {
        color: "var(--cyan)",
    },
    label: {
        color: "var(--orange)",
    },
    space: {
        color: "var(--foreground-secondary)",
    },
    punctuation: {
        color: "var(--foreground-secondary)",
    },
    selected: {
        backgroundColor: "var(--background-highlights)",
    },
    highlighted: {
        backgroundColor: "var(--foreground-secondary)",
        "& $hex": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
        "& $punctuation": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
        "& $space": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
        "& $label": {
            backgroundColor: "var(--orange)",
            color: BACKGROUND_COLOR,
        },
        "& $opcodes": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
        "& $address": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
        "& $error": {
            backgroundColor: "var(--red)",
            color: BACKGROUND_COLOR,
        },
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

/**
 * Render a Level 1 program, which could be a BASIC program or a system program.
 *
 * @return array of two things: the elements added, with the index being the offset into the original bytes array;
 * the annotations to show for this program, in addition to the program's.
 */
export function toDiv(level1Program: Level1Program, out: HTMLElement): [Highlightable[], ProgramAnnotation[]] {
    sheet.attach();
    const classes = sheet.classes;

    // Every element we render that maps to a byte in the program.
    const elements: Highlightable[] = [];
    // Waveform annotations.
    const annotations: ProgramAnnotation[] = [];

    {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, "Start address: ", classes.label);
        add(line, toHexWord(level1Program.startAddress), classes.address);
    }
    {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, "End address: ", classes.label);
        add(line, toHexWord(level1Program.endAddress), classes.address);
    }
    if (level1Program.entryPointAddress !== undefined) {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, "Entry point: ", classes.label);
        add(line, toHexWord(level1Program.entryPointAddress), classes.address);
    }
    if (level1Program.error !== undefined) {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, "Error: ", classes.label);
        add(line, level1Program.error, classes.error);
    }
    {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, "Program type: ", classes.label);
        add(line, level1Program.getDescription(), classes.address);
    }

    switch (level1Program.guessLevel1Type()) {
        case Level1Type.BASIC: {
            const h1 = document.createElement("h1");
            h1.innerText = "Listing";
            out.appendChild(h1);

            const lines = level1Program.decodeBasic();
            if (typeof lines === "string") {
                // Decode error.
                const line = document.createElement("div");
                out.appendChild(line);
                add(line, lines, classes.error);
            } else {
                for (const line of lines) {
                    const lineDiv = document.createElement("div");
                    out.appendChild(lineDiv);
                    add(lineDiv, line.lineNumber.toString(), classes.address);
                    add(lineDiv, " ", classes.space);
                    add(lineDiv, line.code, classes.opcodes);
                }
            }
            break;
        }
        case Level1Type.SYSTEM: {
            const h1 = document.createElement("h1");
            h1.innerText = "Disassembly";
            out.appendChild(h1);

            const disasm = disasmForTrs80Program(level1Program);
            const instructions = disasm.disassemble();

            for (const instruction of instructions) {
                if (instruction.label !== undefined) {
                    const line = document.createElement("div");
                    out.appendChild(line);
                    add(line, "                  ", classes.space);
                    add(line, instruction.label, classes.label);
                    add(line, ":", classes.punctuation);
                }

                let address = instruction.address;
                const bytes = instruction.bin;

                while (bytes.length > 0) {
                    const subbytes = bytes.slice(0, Math.min(4, bytes.length));
                    const subbytesText = subbytes.map(toHexByte).join(" ");

                    const line = document.createElement("div");
                    out.appendChild(line);
                    add(line, toHexWord(address), classes.address);
                    add(line, "  ", classes.space);
                    add(line, subbytesText, classes.hex);
                    if (address === instruction.address) {
                        add(line, "".padEnd(12 - subbytesText.length + 8), classes.space);
                        add(line, instruction.toText(false), classes.opcodes);
                    }

                    const byteOffset = level1Program.addressToByteOffset(address);
                    if (byteOffset !== undefined) {
                        const endIndex = byteOffset + subbytes.length;
                        elements.push(new Highlightable(byteOffset, endIndex - 1, line));
                    }

                    address += subbytes.length;
                    bytes.splice(0, subbytes.length);
                }
            }

            break;
        }
    }

    return [elements, annotations];
}
