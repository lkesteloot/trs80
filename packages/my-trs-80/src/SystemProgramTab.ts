import {toHexByte, toHexWord} from "z80-base";
import {PageTab} from "./PageTab";
import {
    SystemProgram, TRS80_SCREEN_BEGIN, TRS80_SCREEN_END
} from "trs80-base";
import {clearElement} from "teamten-ts-utils";
import {CanvasScreen} from "trs80-emulator-web";

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
 * Tab for displaying chunks of system files.
 */
export class SystemProgramTab extends PageTab {
    private readonly systemProgram: SystemProgram;
    private readonly innerElement: HTMLElement;

    constructor(systemProgram: SystemProgram) {
        super("System");

        this.systemProgram = systemProgram;

        this.element.classList.add("system-program-tab");

        const outer = document.createElement("div");
        outer.classList.add("system-program-outer");
        this.element.append(outer);

        this.innerElement = document.createElement("div");
        this.innerElement.classList.add("system-program");
        outer.append(this.innerElement);
    }

    public onFirstShow(): void {
        this.generateSystemProgram();
    }

    private generateSystemProgram(): void {
        const lines: HTMLElement[] = [];
        const systemProgram = this.systemProgram;

        if (systemProgram.error !== undefined) {
            const line = document.createElement("div");
            lines.push(line);
            add(line, systemProgram.error, "system-program-error");
        }

        // Prepare screenshot, in case loading process writes to screen.
        const screen = new CanvasScreen();

        let wroteToScreen = false;

        // Display a row for each chunk.
        let programAddress: number | undefined = undefined;
        for (const chunk of systemProgram.chunks) {
            const line = document.createElement("div");
            lines.push(line);

            // Address and length.
            let length = chunk.data.length;
            let text = toHexWord(chunk.loadAddress) + "-" + toHexWord(chunk.loadAddress + length - 1) +
                " (" + length + " byte" + (length === 1 ? "" : "s") + ")";
            text = text.padEnd(23, " ");
            add(line, text, "system-program-address");

            // First few bytes.
            const bytes = chunk.data.slice(0, Math.min(3, length));
            text = Array.from(bytes).map(toHexByte).join(" ") + (bytes.length < length ? " ..." : "");
            text = text.padEnd(14, " ");
            add(line, text, "system-program-hex");

            // Write explanation.
            if (chunk.loadAddress >= TRS80_SCREEN_BEGIN && chunk.loadAddress + chunk.data.length <= TRS80_SCREEN_END) {
                add(line, "Screen", "system-program-explanation");
                if (!wroteToScreen) {
                    add(line, " (see screenshot above)", "system-program-highlight");
                }
                for (let i = 0; i < length; i++) {
                    screen.writeChar(chunk.loadAddress + i, chunk.data[i]);
                }
                wroteToScreen = true;
            } else if (chunk.loadAddress === 0x4210) {
                add(line, "Port 0xEC bitmask", "system-program-explanation");
            } else if (chunk.loadAddress === 0x401E) {
                add(line, "Video driver pointer", "system-program-explanation");
            } else {
                add(line, "Program code", "system-program-explanation");
                if (programAddress !== undefined && chunk.loadAddress !== programAddress) {
                    add(line, " (not contiguous, expected " + toHexWord(programAddress) + ")",
                        "system-program-highlight");
                }
                programAddress = chunk.loadAddress + length;
            }

            if (!chunk.isChecksumValid()) {
                add(line, " (invalid checksum)", "system-program-highlight");
            }
        }

        const entryPointDiv = document.createElement("div");
        entryPointDiv.classList.add("system-program-entry-point");
        lines.push(entryPointDiv);
        add(entryPointDiv, "Entry point: ", "system-program-explanation");
        add(entryPointDiv, toHexWord(systemProgram.entryPointAddress), "system-program-address");

        if (wroteToScreen) {
            const screenDiv = document.createElement("div");
            screenDiv.classList.add("system-program-screenshot");
            screen.asImageAsync().then(image => screenDiv.append(image));
            lines.unshift(screenDiv);
        }

        // Add the lines all at once.
        clearElement(this.innerElement);
        this.innerElement.append(... lines);
    }
}
