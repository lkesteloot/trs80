import jss from './Jss'
import {Disasm} from "z80-disasm";
import {toHexByte, toHexWord} from "z80-base";
import {SystemChunk, SystemProgram} from "./SystemProgram";
import {Highlightable} from "./Highlighter";
import {ProgramAnnotation} from "./Annotations";

// RAM address range of screen.
const SCREEN_BEGIN = 15 * 1024;
const SCREEN_END = 16 * 1024;

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
 * Render a disassembled system program.
 *
 * @return array of the elements added, with the index being the offset into the original bytes array.
 */
export function toDiv(systemProgram: SystemProgram, out: HTMLElement): [Highlightable[], ProgramAnnotation[]] {
    sheet.attach();
    const classes = sheet.classes;

    // Every element we render that maps to a byte in the program.
    const elements: Highlightable[] = [];
    // Waveform annotations.
    const annotations: ProgramAnnotation[] = [];

    if (systemProgram.error !== undefined) {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, systemProgram.error, classes.error);
    }

    function okChunk(chunk: SystemChunk): boolean {
        if (chunk.loadAddress >= SCREEN_BEGIN && chunk.loadAddress + chunk.data.length <= SCREEN_END) {
            return false;
        }

        if (chunk.loadAddress === 0x4210) {
            return false;
        }

        return true;
    }

    // Display a row for each chunk.
    let h1 = document.createElement("h1");
    h1.innerText = "Chunks";
    out.appendChild(h1);

    let programAddress: number | undefined = undefined;
    for (const chunk of systemProgram.chunks) {
        const line = document.createElement("div");
        out.appendChild(line);

        // Address and length.
        let length = chunk.data.length;
        let text = toHexWord(chunk.loadAddress) + "-" + toHexWord(chunk.loadAddress + length - 1) +
            " (" + length + " byte" + (length === 1 ? "" : "s") + ")";
        text = text.padEnd(23, " ");
        add(line, text, classes.address);

        // First few bytes.
        const bytes = chunk.data.slice(0, Math.min(3, length));
        text = Array.from(bytes).map(toHexByte).join(" ") + (bytes.length < length ? " ..." : "");
        text = text.padEnd(14, " ");
        add(line, text, classes.hex);

        if (chunk.loadAddress >= SCREEN_BEGIN && chunk.loadAddress + chunk.data.length <= SCREEN_END) {
            text = "Screen";
        } else if (chunk.loadAddress === 0x4210) {
            text = "Port 0xEC bitmask";
        } else if (chunk.loadAddress === 0x401E) {
            text = "Video driver pointer";
        } else {
            text = "Program code";
            if (programAddress !== undefined && chunk.loadAddress !== programAddress) {
                text += " (not contiguous, expected " + toHexWord(programAddress) + ")";
            }
            programAddress = chunk.loadAddress + length;
        }
        add(line, text, classes.opcodes);

        if (!chunk.isChecksumValid()) {
            add(line, " (invalid checksum)", classes.error);
        }
    }

    const entryPointDiv = document.createElement("div");
    entryPointDiv.style.marginTop = "10px";
    out.appendChild(entryPointDiv);
    add(entryPointDiv, "Entry point: ", classes.label);
    add(entryPointDiv, toHexWord(systemProgram.entryPointAddress), classes.address);

    h1 = document.createElement("h1");
    h1.innerText = "Disassembly";
    out.appendChild(h1);

    // Make single binary with all bytes.
    // TODO pass each chunk to disassembler, since it may not be continuous.
    let totalLength = 0;
    for (const chunk of systemProgram.chunks) {
        if (okChunk(chunk)) {
            totalLength += chunk.data.length;
        }
    }
    const binary = new Uint8Array(totalLength);
    let offset = 0;
    let address: number | undefined = undefined;
    let loadAddress = 0;
    for (const chunk of systemProgram.chunks) {
        console.log(chunk.loadAddress.toString(16), chunk.data.length);
        if (okChunk(chunk)) {
            if (address === undefined) {
                address = chunk.loadAddress;
                loadAddress = address;
            }
            if (chunk.loadAddress !== address) {
                // If we get this, we need to modify Disasm to get chunks.
                console.log("Expected", address.toString(16), "but got", chunk.loadAddress.toString(16));
                address = chunk.loadAddress;
            }

            binary.set(chunk.data, offset);
            offset += chunk.data.length;
            address += chunk.data.length;
        }
    }
    console.log("Start address: " + systemProgram.entryPointAddress.toString(16));

    const disasm = new Disasm(binary);

    // TODO not right in general. See chunks above.
    disasm.org = loadAddress;
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
        add(line, instruction.binText(), classes.hex);
        add(line, "".padEnd(12 - instruction.binText().length + 8), classes.space);
        add(line, instruction.toText(), classes.opcodes);

        const byteOffset = systemProgram.addressToByteOffset(instruction.address);
        if (byteOffset !== undefined) {
            let lastIndex = byteOffset + instruction.bin.length - 1;
            elements.push(new Highlightable(byteOffset, lastIndex, line));
            annotations.push(new ProgramAnnotation(instruction.toText() + "\n" + instruction.binText(), byteOffset, lastIndex));
        }
    }

    return [elements, annotations];
}
