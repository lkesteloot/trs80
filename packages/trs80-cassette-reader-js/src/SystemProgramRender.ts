import jss from './Jss'
import {Disasm, TRS80_MODEL_III_KNOWN_LABELS, Z80_KNOWN_LABELS} from "z80-disasm";
import {toHexByte, toHexWord} from "z80-base";
import {SystemChunk, SystemProgram} from "./SystemProgram";
import {Highlightable} from "./Highlighter";
import {ProgramAnnotation} from "./Annotations";
import {CanvasScreen} from "trs80-emulator";

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

        if (chunk.loadAddress === 0x4210 || chunk.loadAddress === 0x401E) {
            return false;
        }

        return true;
    }

    // Prepare screenshot, in case loading process writes to screen.
    const screen = new CanvasScreen();

    let wroteToScreen = false;

    // List chunks on tape.
    let h1 = document.createElement("h1");
    h1.innerText = "Chunks";
    out.appendChild(h1);

    // Display a row for each chunk.
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

        // Write explanation.
        if (chunk.loadAddress >= SCREEN_BEGIN && chunk.loadAddress + chunk.data.length <= SCREEN_END) {
            add(line, "Screen", classes.opcodes);
            if (!wroteToScreen) {
                add(line, " (see screenshot below)", classes.error);
            }
            for (let i = 0; i < length; i++) {
                screen.writeChar(chunk.loadAddress + i, chunk.data[i]);
            }
            wroteToScreen = true;
        } else if (chunk.loadAddress === 0x4210) {
            add(line, "Port 0xEC bitmask", classes.opcodes);
        } else if (chunk.loadAddress === 0x401E) {
            add(line, "Video driver pointer", classes.opcodes);
        } else {
            add(line, "Program code", classes.opcodes);
            if (programAddress !== undefined && chunk.loadAddress !== programAddress) {
                add(line, " (not contiguous, expected " + toHexWord(programAddress) + ")", classes.error);
            }
            programAddress = chunk.loadAddress + length;
        }

        if (!chunk.isChecksumValid()) {
            add(line, " (invalid checksum)", classes.error);
        }
    }

    const entryPointDiv = document.createElement("div");
    entryPointDiv.style.marginTop = "10px";
    out.appendChild(entryPointDiv);
    add(entryPointDiv, "Entry point: ", classes.label);
    add(entryPointDiv, toHexWord(systemProgram.entryPointAddress), classes.address);

    if (wroteToScreen) {
        h1 = document.createElement("h1");
        h1.innerText = "Loading Screen";
        out.appendChild(h1);

        const screenDiv = document.createElement("div");
        screenDiv.append(screen.asImage());
        out.append(screenDiv);
    }

    h1 = document.createElement("h1");
    h1.innerText = "Disassembly";
    out.appendChild(h1);

    const disasm = new Disasm();
    disasm.addLabels(Z80_KNOWN_LABELS);
    disasm.addLabels(TRS80_MODEL_III_KNOWN_LABELS);
    disasm.addLabels([[systemProgram.entryPointAddress, "MAIN"]]);
    for (const chunk of systemProgram.chunks) {
        if (okChunk(chunk)) {
            disasm.addChunk(chunk.data, chunk.loadAddress);
        }
    }
    disasm.addEntryPoint(systemProgram.entryPointAddress);
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
            add(line, toHexWord(instruction.address), classes.address);
            add(line, "  ", classes.space);
            add(line, subbytesText, classes.hex);
            if (address === instruction.address) {
                add(line, "".padEnd(12 - subbytesText.length + 8), classes.space);
                add(line, instruction.toText(), classes.opcodes);
            }

            const byteOffset = systemProgram.addressToByteOffset(address);
            if (byteOffset !== undefined) {
                const lastIndex = byteOffset + subbytes.length - 1;
                elements.push(new Highlightable(byteOffset, lastIndex, line));
                annotations.push(new ProgramAnnotation(instruction.toText() + "\n" + instruction.binText(), byteOffset, lastIndex));
            }

            address += subbytes.length;
            bytes.splice(0, subbytes.length);
        }

    }

    return [elements, annotations];
}
