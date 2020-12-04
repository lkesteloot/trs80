import jss from './Jss'
import {Disasm, TRS80_MODEL_III_KNOWN_LABELS, Z80_KNOWN_LABELS} from "z80-disasm";
import {toHexByte, toHexWord} from "z80-base";
import {Highlightable} from "./Highlighter";
import {ProgramAnnotation} from "./Annotations";
import {
    CMD_LOAD_BLOCK,
    CmdLoadBlockChunk, CmdLoadModuleHeaderChunk,
    CmdProgram, CmdTransferAddressChunk
} from "./CmdProgram";

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
export function toDiv(cmdProgram: CmdProgram, out: HTMLElement): [Highlightable[], ProgramAnnotation[]] {
    sheet.attach();
    const classes = sheet.classes;

    // Every element we render that maps to a byte in the program.
    const elements: Highlightable[] = [];
    // Waveform annotations.
    const annotations: ProgramAnnotation[] = [];

    if (cmdProgram.error !== undefined) {
        const line = document.createElement("div");
        out.appendChild(line);
        add(line, cmdProgram.error, classes.error);
    }

    // List chunks in file.
    let h1 = document.createElement("h1");
    h1.innerText = "Chunks";
    out.appendChild(h1);

    // Display a row for each chunk.
    let programAddress: number | undefined = undefined;
    for (const chunk of cmdProgram.chunks) {
        const line = document.createElement("div");
        out.appendChild(line);

        // Chunk type.
        add(line, toHexByte(chunk.type) + "  ", classes.address);

        if (chunk instanceof CmdLoadBlockChunk) {
            add(line, "Load at ", classes.opcodes);
            add(line, toHexWord(chunk.address), classes.address);
            add(line, ": ", classes.opcodes);
            const bytes = chunk.loadData.slice(0, Math.min(3, chunk.loadData.length));
            const text = Array.from(bytes).map(toHexByte).join(" ") + (bytes.length < chunk.loadData.length ? " ..." : "");
            add(line, text, classes.hex);
            add(line, " (" + chunk.loadData.length + " byte" + (chunk.loadData.length == 1 ? "" : "s") + ")", classes.address);
            if (programAddress !== undefined && chunk.address !== programAddress) {
                add(line, " (not contiguous, expected " + toHexWord(programAddress) + ")", classes.error);
            }
            programAddress = chunk.address + chunk.loadData.length;
        } else if (chunk instanceof CmdTransferAddressChunk) {
            if (chunk.rawData.length !== 2) {
                add(line, "Transfer address chunk has invalid length " + chunk.rawData.length, classes.error);
            } else {
                add(line, "Jump to ", classes.opcodes);
                add(line, toHexWord(chunk.address), classes.address);
            }
        } else if (chunk instanceof CmdLoadModuleHeaderChunk) {
            add(line, "Load module header: ", classes.opcodes);
            add(line, chunk.filename, classes.hex);
        } else {
            add(line, "Unknown type: ", classes.error);
            const bytes = chunk.rawData.slice(0, Math.min(3, chunk.rawData.length));
            const text = Array.from(bytes).map(toHexByte).join(" ") + (bytes.length < chunk.rawData.length ? " ..." : "");
            add(line, text, classes.hex);
            add(line, " (" + chunk.rawData.length + " byte" + (chunk.rawData.length == 1 ? "" : "s") + ")", classes.address);
        }
    }

    h1 = document.createElement("h1");
    h1.innerText = "Disassembly";
    out.appendChild(h1);

    const disasm = new Disasm();
    disasm.addLabels(Z80_KNOWN_LABELS);
    disasm.addLabels(TRS80_MODEL_III_KNOWN_LABELS);
    disasm.addLabels([[cmdProgram.entryPointAddress, "MAIN"]]);
    for (const chunk of cmdProgram.chunks) {
        if (chunk.type === CMD_LOAD_BLOCK) {
            const address = chunk.rawData[0] + chunk.rawData[1] * 256;
            disasm.addChunk(chunk.rawData.slice(2), address);
        }
    }
    disasm.addEntryPoint(cmdProgram.entryPointAddress);
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

            const byteOffset = cmdProgram.addressToByteOffset(address);
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
