import {toHexByte, toHexWord} from "z80-base";
import {PageTab} from "./PageTab";
import {
    CMD_CHUNK_TYPE_NAME,
    CmdLoadBlockChunk,
    CmdLoadModuleHeaderChunk,
    CmdProgram,
    CmdTransferAddressChunk
} from "trs80-base";
import {clearElement} from "teamten-ts-utils";

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

/**
 * Add a snippet (first few bytes) of a binary to the line.
 */
function addBinarySnippet(line: HTMLDivElement, loadData: Uint8Array) {
    const bytes = loadData.slice(0, Math.min(3, loadData.length));
    const text = Array.from(bytes).map(toHexByte).join(" ") + (bytes.length < loadData.length ? " ..." : "");
    add(line, text, "cmd-hex");
    add(line, " (" + loadData.length + " byte" + (loadData.length == 1 ? "" : "s") + ")", "cmd-address");
}

/**
 * Tab for displaying chunks of CMD files.
 */
export class CmdTab extends PageTab {
    private readonly cmdProgram: CmdProgram;
    private readonly innerElement: HTMLElement;

    constructor(cmdProgram: CmdProgram) {
        super("CMD");

        this.cmdProgram = cmdProgram;

        this.element.classList.add("cmd-tab");

        const outer = document.createElement("div");
        outer.classList.add("cmd-outer");
        this.element.append(outer);

        this.innerElement = document.createElement("div");
        this.innerElement.classList.add("cmd");
        outer.append(this.innerElement);
    }

    public onFirstShow(): void {
        this.generateCmd();
    }

    private generateCmd(): void {
        const lines: HTMLElement[] = [];
        const cmdProgram = this.cmdProgram;

        if (cmdProgram.error !== undefined) {
            const line = document.createElement("div");
            lines.push(line);
            add(line, cmdProgram.error, "cmd-error");
        }

        // Display a row for each chunk.
        let programAddress: number | undefined = undefined;
        chunkLoop: for (const chunk of cmdProgram.chunks) {
            const line = document.createElement("div");
            lines.push(line);

            // Chunk type.
            add(line, toHexByte(chunk.type) + "  ", "cmd-address");

            switch (chunk.className) {
                case "CmdLoadBlockChunk":
                    add(line, "Load at ", "cmd-opcodes");
                    add(line, toHexWord(chunk.address), "cmd-address");
                    add(line, ": ", "cmd-opcodes");
                    addBinarySnippet(line, chunk.loadData);
                    if (programAddress !== undefined && chunk.address !== programAddress) {
                        add(line, " (not contiguous, expected " + toHexWord(programAddress) + ")", "cmd-error");
                    }
                    programAddress = chunk.address + chunk.loadData.length;
                    break;

                case "CmdTransferAddressChunk":
                    if (chunk.rawData.length !== 2) {
                        add(line, "Transfer address chunk has invalid length " + chunk.rawData.length, "cmd-error");
                    } else {
                        add(line, "Jump to ", "cmd-opcodes");
                        add(line, toHexWord(chunk.address), "cmd-address");
                    }
                    // Not sure what to do here. I've seen junk after this block. I suspect that CMD
                    // parsers of the time, when running into this block, would immediately just
                    // jump to the address and ignore everything after it, so let's emulate that.
                    break chunkLoop;

                case "CmdLoadModuleHeaderChunk":
                    add(line, "Load module header: ", "cmd-opcodes");
                    add(line, chunk.filename, "cmd-hex");
                    break;

                default:
                    add(line, "Unknown type: ", "cmd-error");
                    addBinarySnippet(line, chunk.rawData);
                    const name = CMD_CHUNK_TYPE_NAME.get(chunk.type);
                    if (name !== undefined) {
                        add(line, " (" + name + ")", "cmd-error");
                    }
                    break;
            }
        }

        // Add the lines all at once.
        clearElement(this.innerElement);
        this.innerElement.append(... lines);
    }
}
