
import jss from './Jss'
import {Disasm} from "z80-disasm";
import {toHexWord} from "z80-base";
import {SystemProgram} from "./SystemProgram";

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
        "&$highlighted": {
            backgroundColor: "var(--red)",
            color: BACKGROUND_COLOR,
        },
    },
    address: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    hex: {
        color: "var(--blue)",
        "&$highlighted": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
    },
    opcodes: {
        color: "var(--cyan)",
        "&$highlighted": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
    },
    label: {
        color: "var(--orange)",
        "&$highlighted": {
            backgroundColor: "var(--orange)",
            color: BACKGROUND_COLOR,
        },
    },
    space: {
        color: "var(--foregroun)",
        "&$highlighted": {
            backgroundColor: "var(--foreground)",
            color: BACKGROUND_COLOR,
        },
    },
    punctuation: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    selected: {
        backgroundColor: "var(--background-highlights)",
    },
    highlighted: {
        // Empty style that's referenced above as $highlighted.
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

/**
 * Render a disassembled system program.
 *
 * @return array of the elements added, with the index being the offset into the original bytes array.
 */
export function toDiv(systemProgram: SystemProgram, out: HTMLElement): HTMLElement[] {
    sheet.attach();
    const classes = sheet.classes;

    // Map from byte address to HTML element for that byte.
    const elements: HTMLElement[] = [];

    if (systemProgram.error !== undefined) {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, systemProgram.error, classes.error);
    }

    // Make single binary with all bytes.
    // TODO pass each chunk to disassembler, since it may not be continuous.
    let totalLength = 0;
    for (const chunk of systemProgram.chunks) {
        totalLength += chunk.data.length;
    }
    const binary = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of systemProgram.chunks) {
        binary.set(chunk.data, offset);
        offset += chunk.data.length;
    }

    const disasm = new Disasm(binary);

    // TODO not right in general. See chunks above.
    disasm.org = systemProgram.chunks.length === 0 ? 0 : systemProgram.chunks[0].loadAddress;
    const instructions = disasm.disassembleAll();

    for (const instruction of instructions) {
        if (instruction.label !== undefined) {
            const line = document.createElement("div");
            out.appendChild(line);
            add(line, "                  ", classes.space);
            add(line, instruction.label, classes.label);
            add(line, ":", classes.punctuation);
        }

        const line = document.createElement("div");
        out.appendChild(line);
        add(line, toHexWord(instruction.address), classes.address);
        add(line, "  ", classes.space);
        const e = add(line, instruction.binText(), classes.hex);
        add(line, "".padEnd(12 - instruction.binText().length + 8), classes.space);
        add(line, instruction.toText(), classes.opcodes);

        // We don't have index in original array. Not remotely.
        //        elements[instruction.] = e;
    }

    return elements;
}
