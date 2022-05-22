import {EditorView} from "@codemirror/view"
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_SIZE} from 'trs80-base';
import {Trs80} from 'trs80-emulator';
import {CanvasScreen, ScreenMouseEvent} from 'trs80-emulator-web';
import {toHexByte} from 'z80-base';
import {AssemblyResults} from "./AssemblyResults.js";

/**
 * Lets the user edit the screen with a paintbrush. Instantiate one of these
 * for each click of the Edit button.
 */
export class ScreenEditor {
    private readonly view: EditorView;
    private readonly screen: CanvasScreen;
    private readonly raster = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly extraBytes: number[];
    private readonly begin: number;
    private end: number;
    private byteCount: number;
    private mouseDown = false;

    constructor(view: EditorView, pos: number, assemblyResults: AssemblyResults,
                screenshotIndex: number, trs80: Trs80, screen: CanvasScreen) {

        this.view = view;
        this.screen = screen;
        screen.mouseActivity.subscribe(e => this.handleMouse(e));

        trs80.stop();

        // Fill with blanks.
        this.raster.fill(0x80);

        const s = assemblyResults.screenshotSections[screenshotIndex];
        this.byteCount = s.byteCount;
        this.extraBytes = [];
        if (s.firstDataLineNumber !== undefined && s.lastDataLineNumber !== undefined) {
            let i = 0;
            for (let lineNumber = s.firstDataLineNumber; lineNumber <= s.lastDataLineNumber; lineNumber++) {
                const line = assemblyResults.sourceFile.assembledLines[lineNumber - 1];
                const length = Math.min(line.binary.length, this.raster.length - i);
                for (let j = 0; j < length; j++) {
                    this.raster[i++] = line.binary[j];
                }
                if (length < line.binary.length) {
                    this.extraBytes = line.binary.slice(length);
                    break;
                }
            }
            this.begin = view.state.doc.line(s.firstDataLineNumber).from;
            this.end = view.state.doc.line(s.lastDataLineNumber).to;
        } else {
            // No data lines at all, insert after comment line.
            this.begin = view.state.doc.line(s.beginCommentLineNumber).to + 1;
            this.end = this.begin;
        }

        this.rasterToScreen();
    }

    /**
     * Write our raster array back to the source code.
     */
    private rasterToCode() {
        const lines = [];
        const raster = Array.from(this.raster.subarray(0, this.byteCount));
        for (let i = 0; i < raster.length; i += 8) {
            const bytes = raster.slice(i, i + 8);
            const bytesStrings = bytes.map(b => "0x" + toHexByte(b));
            // TODO guess the indent.
            // TODO guess ASCII and use .text.
            let text = `        .byte ${bytesStrings.join(",")}`;
            if (i % 64 == 0) {
                text += ` ; Line ${i / 64}`;
            }
            lines.push(text);
        }
        if (this.extraBytes.length > 0) {
            const bytesStrings = this.extraBytes.map(b => "0x" + toHexByte(b));
            let text = `        .byte ${bytesStrings.join(",")} ; Extra data`;
            lines.push(text);
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

    /**
     * Write our raster array to the TRS-80 screen.
     */
    private rasterToScreen() {
        for (let i = 0; i < TRS80_SCREEN_SIZE; i++) {
            this.screen.writeChar(TRS80_SCREEN_BEGIN + i, this.raster[i]);
        }
    }

    /**
     * Handle a mouse event and update both our raster array and the TRS-80 screen.
     */
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
            this.byteCount = Math.max(this.byteCount, position.offset + 1);
        }
    }
}
