import {
    BootSector, CMD_CHUNK_TYPE_NAME, CmdProgram, Level1Program, SystemProgram, disasmForTrs80Program,
} from "trs80-base";
import {toHexByte, toHexWord} from "z80-base";
import {newPreviewBody, newPreviewElement, spanHtml} from "./PreviewHtml.js";

/**
 * The kinds of program that we can disassemble.
 */
export type DisassemblyFile = SystemProgram | CmdProgram | Level1Program | BootSector;

/**
 * The first few bytes of a binary, and its length, as HTML for a line of the CMD chunk summary.
 *
 * @param data the bytes.
 */
function binarySnippetHtml(data: Uint8Array): string {
    const bytes = Array.from(data.slice(0, 3));
    const text = bytes.map(toHexByte).join(" ") + (bytes.length < data.length ? " ..." : "");
    return spanHtml(text, "preview-dis-hex") +
        spanHtml(" (" + data.length + " byte" + (data.length === 1 ? "" : "s") + ")", "preview-dis-address");
}

/**
 * The lines that summarize a CMD file's chunks (the load ranges, the entry point), as the CMD tab of
 * my-trs-80 shows them. Like the loader, it stops at the transfer address.
 *
 * @param cmdProgram the program.
 * @return lines of HTML, starting with a heading line, or none if the program has no chunks and no error.
 */
function cmdChunkLines(cmdProgram: CmdProgram): string[] {
    const lines: string[] = [];
    if (cmdProgram.error !== undefined) {
        lines.push(spanHtml(cmdProgram.error, "preview-error"));
    }

    // The address that the next load block would start at if the blocks were contiguous.
    let programAddress: number | undefined = undefined;
    chunkLoop: for (const chunk of cmdProgram.chunks) {
        let line = spanHtml(toHexByte(chunk.type) + "  ", "preview-dis-address");

        switch (chunk.className) {
            case "CmdLoadBlockChunk":
                line += spanHtml("Load at ", "preview-dis-opcodes") +
                    spanHtml(toHexWord(chunk.address), "preview-dis-address") +
                    spanHtml(": ", "preview-dis-opcodes") + binarySnippetHtml(chunk.loadData);
                if (programAddress !== undefined && chunk.address !== programAddress) {
                    line += spanHtml(" (not contiguous, expected " + toHexWord(programAddress) + ")",
                        "preview-error");
                }
                programAddress = chunk.address + chunk.loadData.length;
                lines.push(line);
                break;

            case "CmdTransferAddressChunk":
                if (chunk.rawData.length !== 2) {
                    line += spanHtml("Transfer address chunk has invalid length " + chunk.rawData.length,
                        "preview-error");
                } else {
                    line += spanHtml("Jump to ", "preview-dis-opcodes") +
                        spanHtml(toHexWord(chunk.address), "preview-dis-address");
                }
                lines.push(line);
                // Anything after the transfer address is junk that the loader would never read.
                break chunkLoop;

            case "CmdLoadModuleHeaderChunk":
                line += spanHtml("Load module header: ", "preview-dis-opcodes") +
                    spanHtml(chunk.filename, "preview-dis-hex");
                lines.push(line);
                break;

            default: {
                line += spanHtml("Unknown type: ", "preview-error") + binarySnippetHtml(chunk.rawData);
                const name = CMD_CHUNK_TYPE_NAME.get(chunk.type);
                if (name !== undefined) {
                    line += spanHtml(" (" + name + ")", "preview-error");
                }
                lines.push(line);
                break;
            }
        }
    }

    return lines;
}

/**
 * The lines of the disassembly of a program: a line per instruction, with its address and bytes, and a line
 * for each label. An instruction of more than four bytes continues on further lines.
 *
 * @param program the program.
 * @return lines of HTML.
 */
function disassemblyLines(program: DisassemblyFile): string[] {
    const disasm = disasmForTrs80Program(program);
    const instructions = disasm.disassemble();

    const lines: string[] = [];
    for (const instruction of instructions) {
        if (instruction.label !== undefined) {
            lines.push("                  " + spanHtml(instruction.label, "preview-dis-label") +
                spanHtml(":", "preview-dis-punctuation"));
        }

        let address = instruction.address;
        // Copy, since we consume it.
        const bytes = instruction.bin.slice();
        while (bytes.length > 0) {
            const subbytes = bytes.splice(0, Math.min(4, bytes.length));
            const subbytesText = subbytes.map(toHexByte).join(" ");

            let line = spanHtml(toHexWord(address), "preview-dis-address") + "  " +
                spanHtml(subbytesText, "preview-dis-hex");
            if (address === instruction.address) {
                line += "".padEnd(12 - subbytesText.length + 8) +
                    spanHtml(instruction.toText(false), "preview-dis-opcodes");
            }
            lines.push(line);

            address += subbytes.length;
        }
    }

    return lines;
}

/**
 * Render the disassembly of a program. A CMD program starts with a summary of its chunks.
 *
 * @param program the decoded program.
 * @return the preview element.
 */
export function renderDisassemblyPreview(program: DisassemblyFile): HTMLElement {
    const lines: string[] = [];
    if (program instanceof CmdProgram) {
        const chunkLines = cmdChunkLines(program);
        if (chunkLines.length > 0) {
            lines.push(...chunkLines, "");
        }
    }
    lines.push(...disassemblyLines(program));

    const element = newPreviewElement("preview-disassembly");
    element.append(newPreviewBody(lines.join("\n")));
    return element;
}
