
import {EditorView} from "@codemirror/view"
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_SIZE } from 'trs80-base';
import { Trs80 } from 'trs80-emulator';
import { CanvasScreen, ScreenMouseEvent } from 'trs80-emulator-web';
import { toHexByte } from 'z80-base';

const BYTE_PREFIX = ".byte";

/**
 * Lets the user edit the screen with a paintbrush. Instantiate one of these
 * for each click of the Edit button.
 */
export class ScreenEditor {
    private readonly view: EditorView;
    private readonly screen: CanvasScreen;
    private readonly raster = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly begin: number;
    private end: number;
    private mouseDown = false;

    constructor(view: EditorView, pos: number, trs80: Trs80, screen: CanvasScreen) {
        this.view = view;
        this.screen = screen;
        screen.mouseActivity.subscribe(e => this.handleMouse(e));

        trs80.stop();

        const { begin, end } = this.codeToRaster(pos);
        this.begin = begin;
        this.end = end;

        this.rasterToScreen();
    }

    private codeToRaster(pos: number): { begin: number, end: number } {
        // Pos is on the "Edit" button, which is really the newline, so move
        // it forward.
        pos += 1;

        // Read the screen data from the code.
        const text = this.view.state.doc.sliceString(pos);

        const begin = 0;
        let end = begin;

        // Parse screen data.
        let i = 0;
        let byteCount = 0;
        while (true) {
            // Remember last known end.
            end = i;

            // At start of line. Skip whitespace.
            while (i < text.length && text[i] === " ") {
                i++;
            }

            // Check for our byte prefix.
            if (!text.substring(i).startsWith(BYTE_PREFIX)) {
                // Done with parsing.
                break;
            }

            // Skip the prefix and whitespace.
            i += BYTE_PREFIX.length;
            while (i < text.length && text[i] === " ") {
                i++;
            }

            // Read the bytes.
            let endOfLine = text.indexOf("\n", i);
            if (endOfLine === -1) {
                endOfLine = text.length;
            }
            const bytesStrings = text.substring(i, endOfLine).split(/\s*,\s*/);
            const bytes = bytesStrings.map(b => parseInt(b));

            // See if we have too many bytes on this line.
            if (bytes.length > this.raster.length - byteCount) {
                // Not sure how to handle this! Maybe don't handle this line at all?
                break;
            }

            // Copy the bytes to the raster.
            for (let j = 0; j < bytes.length; j++) {
                this.raster[byteCount++] = bytes[j];
            }

            // Jump to the next line.
            i = endOfLine;
            if (text[i] === "\n") {
                i++;
            }
        }

        return {
            begin: pos + begin,
            end: pos + end,
        };
    }

    private rasterToCode() {
        const lines = [];
        for (let i = 0; i < this.raster.length; i += 16) {
            const bytes = Array.from(this.raster.subarray(i, i + 16));
            const bytesStrings = bytes.map(b => "0x" + toHexByte(b));
            // TODO guess the indent.
            lines.push(`        ${BYTE_PREFIX} ${bytesStrings.join(",")}`);
        }
        const code = lines.join("\n");

        const change = {
            from: this.begin,
            to: this.end,
            insert: code,
        };
        this.view.dispatch({changes: change});

        // Update end.
        this.end = this.begin + code.length;
    }

    private rasterToScreen() {
        for (let i = 0; i < TRS80_SCREEN_SIZE; i++) {
            this.screen.writeChar(TRS80_SCREEN_BEGIN + i, this.raster[i]);
        }
    }

    private handleMouse(e: ScreenMouseEvent) {
        if (e.type === "mousedown") {
            this.mouseDown = true;
        }
        if (e.type === "mouseup") {
            this.mouseDown = false;
            this.rasterToCode();
        }
        const position = e.position;
        if ((e.type === "mousedown" || this.mouseDown) && position !== undefined) {
            let ch = this.raster[position.offset];
            if (ch < 128 || ch >= 192) {
                ch = 128;
            }
            ch |= position.mask | 0x80;
            this.raster[position.offset] = ch;
            this.screen.writeChar(position.address, ch);
        }
    }
}
