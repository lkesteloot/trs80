import {EditorView} from "@codemirror/view";
import {ChangeSpec} from "@codemirror/state";
import {TRS80_BLINK_PERIOD_MS,
    TRS80_CHAR_WIDTH, TRS80_PIXEL_HEIGHT, TRS80_PIXEL_WIDTH, TRS80_SCREEN_BEGIN, TRS80_SCREEN_SIZE} from 'trs80-base';
import {Trs80} from 'trs80-emulator';
import {CanvasScreen, FULL_SCREEN_SELECTION, OverlayOptions, ScreenMouseEvent, ScreenMousePosition, Selection} from 'trs80-emulator-web';
import {toHexByte} from 'z80-base';
import {AssemblyResults} from "./AssemblyResults.js";
import saveIcon from "./icons/save.ico";
import cancelIcon from "./icons/cancel.ico";
import undoIcon from "./icons/undo.ico";
import redoIcon from "./icons/redo.ico";
import clearIcon from "./icons/clear.ico";
import invertIcon from "./icons/invert.ico";
import drawIcon from "./icons/draw.ico";
import eraseIcon from "./icons/erase.ico";
import pixelGridIcon from "./icons/pixel_grid.ico";
import charGridIcon from "./icons/char_grid.ico";
import highlightGridIcon from "./icons/highlight_grid.ico";
import pencilIcon from "./icons/pencil.ico";
import lineIcon from "./icons/line.ico";
import rectangleIcon from "./icons/rectangle.ico";
import ellipseIcon from "./icons/ellipse.ico";
import bucketIcon from "./icons/bucket.ico";
import textIcon from "./icons/text.ico";
import selectIcon from "./icons/select.ico";
import cutIcon from "./icons/cut.ico";
import copyIcon from "./icons/copy.ico";
import pasteIcon from "./icons/paste.ico";
import flipHorizontalIcon from "./icons/flip_horizontal.ico";
import flipVerticalIcon from "./icons/flip_vertical.ico";

const PREFIX = "screen-editor";
const MAX_UNDO = 1000; // About 1k each.

// Sync this with CSS:
const NORMAL_ICON_COLOR = "#002b36";
const SELECTED_ICON_COLOR = "#fdf6e3";

enum Mode {
    DRAW, ERASE,
}

enum Tool {
    PENCIL, LINE, RECTANGLE, ELLIPSE, BUCKET, TEXT, SELECT,
}

enum Subtool {
    NORMAL, MOVE_SELECTION,
}

/**
 * The contents of the clipboard.
 */
class Clipboard {
    public readonly width: number;
    public readonly height: number;
    public readonly pixels: boolean[];

    constructor(width: number, height: number, pixels: boolean[]) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }
}

/**
 * Whether the byte value is considered printable ASCII.
 */
function isPrintableAscii(b: number): boolean {
    return b >= 32 && b < 127;
}

/**
 * Everything restored with undo.
 */
class UndoInfo {
    public readonly raster: Uint8Array;
    // For text mode only.
    public readonly cursorPosition: number | undefined;
    public readonly byteCount: number;

    constructor(raster: Uint8Array, cursorPosition: number | undefined, byteCount: number) {
        this.raster = raster.slice();
        this.cursorPosition = cursorPosition;
        this.byteCount = byteCount;
    }
}

let gPrefixCounter = 1;

/**
 * Parse a 32x16 text string into an icon. Each pixel must take up two characters.
 * Use "*" to be "on". The off pixels will be transparent.
 */
function parseIcon(icon: string, color: string): HTMLImageElement {
    const lines = icon.split("\n").filter(line => line.length > 0);

    const height = lines.length;
    if (height !== 16) {
        throw new Error(`icons must have 16 lines, has ${height}: ${icon}`);
    }
    const width = lines[0].length / 2;
    if (width !== 16) {
        throw new Error("icons must have 16 columns: " + icon);
    }

    // Create the icon canvas.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D

    // High-res canvas.
    const canvas2 = document.createElement("canvas");
    canvas2.width = width*2;
    canvas2.height = height*2;
    const ctx2 = canvas2.getContext("2d") as CanvasRenderingContext2D

    // Draw the pixels.
    ctx.fillStyle = color;
    ctx2.fillStyle = color;
    for (let y = 0; y < height; y++) {
        const line = lines[y];
        if (line.length !== width*2) {
            throw new Error("icons must have 32 columns: " + icon);
        }
        for (let x = 0; x < width; x++) {
            if (line[x*2] !== line[x*2 + 1]) {
                throw new Error("icon has inconsistent pixel: " + icon);
            }

            if (line[x*2] === "*") {
                ctx.fillRect(x, y, 1, 1);
                ctx2.fillRect(x*2, y*2, 2, 2);
            }
        }
    }

    // Convert to an <img>
    const img = document.createElement("img");
    img.width = width;
    img.height = height;
    img.src = canvas.toDataURL("image/png");
    img.srcset = canvas2.toDataURL("image/png") + " 2x";
    return img;
}

/**
 * Set the label or icon of a button.
 */
function setButtonLabel(element: HTMLElement, label: string, icon: string | undefined): void {
    if (icon !== undefined) {
        // CSS only shows one of these:
        let img = parseIcon(icon, NORMAL_ICON_COLOR);
        img.classList.add(PREFIX + "-normal-icon");
        img.alt = label;
        img.title = label;
        element.append(img);

        img = parseIcon(icon, SELECTED_ICON_COLOR);
        img.classList.add(PREFIX + "-selected-icon");
        img.alt = label;
        img.title = label;
        element.append(img);
    } else {
        element.innerText = label;
    }
}

/**
 * Make a group of action buttons.
 */
function makeButtons(parent: HTMLDivElement,
                     buttons: {
                         label: string,
                         icon?: string,
                         onClick: () => void
                     }[]): void {

    const container = document.createElement("div");
    container.classList.add(PREFIX + "-button-group");
    parent.append(container);

    for (const { label, icon, onClick } of buttons) {
        const button = document.createElement("label");
        setButtonLabel(button, label, icon);
        button.addEventListener("click", () => onClick());
        container.append(button);
    }
}
/**
 * Make a group of buttons, only one of which can be selected at once.
 */
function makeRadioButtons(parent: HTMLDivElement,
                          buttons: { label: string, icon?: string, value: number }[],
                          defaultValue: number,
                          onChange: (newValue: number) => void): void {

    const prefix = PREFIX + "-radio-" + gPrefixCounter++;

    const container = document.createElement("div");
    container.classList.add(PREFIX + "-button-group");
    parent.append(container);

    for (const { label, value, icon } of buttons) {
        const id = prefix + "-" + value;
        const radio = document.createElement("input");

        radio.id = id;
        radio.type = "radio";
        radio.name = prefix;
        radio.value = value.toString();
        radio.checked = value == defaultValue;
        radio.addEventListener("change", function () {
            onChange(value);
        });

        const radioLabel = document.createElement("label");
        radioLabel.htmlFor = id;
        setButtonLabel(radioLabel, label, icon);
        container.append(radio, radioLabel);
    }
}

/**
 * Make a group of buttons, any of which can be checked.
 */
function makeCheckboxButtons(parent: HTMLDivElement,
                             buttons: {
                                 label: string,
                                 icon?: string,
                                 checked: boolean,
                                 onChange: (newValue: boolean) => void
                             }[]): void {

    const prefix = PREFIX + "-checkbox-" + gPrefixCounter++;

    const container = document.createElement("div");
    container.classList.add(PREFIX + "-button-group");
    parent.append(container);

    let value = 0;
    for (const { label, icon, checked, onChange } of buttons) {
        const id = prefix + "-" + value++;
        const checkbox = document.createElement("input");

        checkbox.id = id;
        checkbox.type = "checkbox";
        checkbox.checked = checked;
        checkbox.addEventListener("change", function () {
            onChange(this.checked);
        });

        const radioLabel = document.createElement("label");
        radioLabel.htmlFor = id;
        setButtonLabel(radioLabel, label, icon);
        container.append(checkbox, radioLabel);
    }
}

/**
 * Lets the user edit the screen with a paintbrush. Instantiate one of these
 * for each click of the Edit button.
 */
export class ScreenEditor {
    private readonly view: EditorView;
    private readonly screen: CanvasScreen;
    private readonly trs80: Trs80;
    private readonly onClose: () => void;
    private readonly mouseUnsubscribe: () => void;
    private readonly raster = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly rasterBackup = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly undoStack: UndoInfo[] = [];
    private readonly redoStack: UndoInfo[] = [];
    private readonly extraBytes: number[];
    private readonly begin: number;
    private readonly controlPanelDiv1: HTMLDivElement;
    private readonly controlPanelDiv2: HTMLDivElement;
    private readonly statusPanelDiv: HTMLDivElement;
    private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    private end: number;
    private byteCount: number;
    private byteCountBackup: number = 0;
    private mouseDownPosition: ScreenMousePosition | undefined = undefined;
    private previousPosition: ScreenMousePosition | undefined = undefined;
    private mode: Mode = Mode.DRAW;
    private tool: Tool = Tool.PENCIL;
    private subtool: Subtool = Subtool.NORMAL;
    private overlayOptions: OverlayOptions = {
        showSelection: true,
    };
    private blinkHandle: number | undefined = undefined;
    private antsHandle: number | undefined = undefined;
    private pixelStatus = "";
    private clipboard: Clipboard | undefined = undefined;
    private selMoving = false;
    private selMoveDx = 0;
    private selMoveDy = 0;
    private selMoveWidth = 0;
    private selMoveHeight = 0;
    private pasting = false;

    constructor(view: EditorView, pos: number, assemblyResults: AssemblyResults,
                screenshotIndex: number, trs80: Trs80, screen: CanvasScreen, onClose: () => void) {

        this.view = view;
        this.screen = screen;
        this.trs80 = trs80;
        this.onClose = onClose;
        this.mouseUnsubscribe = screen.mouseActivity.subscribe(e => this.handleMouse(e));

        trs80.stop();

        this.controlPanelDiv1 = document.createElement("div");
        this.controlPanelDiv1.classList.add(PREFIX + "-control-panel1");
        screen.getNode().append(this.controlPanelDiv1);

        this.controlPanelDiv2 = document.createElement("div");
        this.controlPanelDiv2.classList.add(PREFIX + "-control-panel2");
        screen.getNode().append(this.controlPanelDiv2);

        makeButtons(this.controlPanelDiv1, [
            { label: "Save", icon: saveIcon, onClick: () => this.close(true) },
            { label: "Cancel", icon: cancelIcon, onClick: () => this.close(false) },
        ]);

        makeButtons(this.controlPanelDiv1, [
            { label: "Cut", icon: cutIcon, onClick: () => this.cut() },
            { label: "Copy", icon: copyIcon, onClick: () => this.copy() },
            { label: "Paste", icon: pasteIcon, onClick: () => this.paste() },
        ]);

        makeButtons(this.controlPanelDiv1, [
            { label: "Undo", icon: undoIcon, onClick: () => this.undo() },
            { label: "Redo", icon: redoIcon, onClick: () => this.redo() },
        ]);

        makeButtons(this.controlPanelDiv1, [
            { label: "Clear", icon: clearIcon, onClick: () => this.clear() },
            { label: "Invert", icon: invertIcon, onClick: () => this.invert() },
            { label: "Flip Horizontally", icon: flipHorizontalIcon, onClick: () => this.flipHorizontally() },
            { label: "Flip Vertically", icon: flipVerticalIcon, onClick: () => this.flipVertically() },
        ]);

        makeRadioButtons(this.controlPanelDiv2, [
            { label: "Draw", icon: drawIcon, value: Mode.DRAW },
            { label: "Erase", icon: eraseIcon, value: Mode.ERASE },
        ], Mode.DRAW, mode => this.mode = mode);

        makeCheckboxButtons(this.controlPanelDiv2, [
            { label: "Pixel Grid", icon: pixelGridIcon, checked: false, onChange: value => {
                    this.overlayOptions.showPixelGrid = value;
                    this.screen.setOverlayOptions(this.overlayOptions);
                }},
            { label: "Char Grid", icon: charGridIcon, checked: false, onChange: value => {
                    this.overlayOptions.showCharGrid = value;
                    this.screen.setOverlayOptions(this.overlayOptions);
                }},
            { label: "Highlight Row/Col", icon: highlightGridIcon, checked: false, onChange: value => {
                    this.overlayOptions.showHighlight = value;
                    this.screen.setOverlayOptions(this.overlayOptions);
                }},
        ]);

        makeRadioButtons(this.controlPanelDiv2, [
            { label: "Pencil", icon: pencilIcon, value: Tool.PENCIL },
            { label: "Line", icon: lineIcon, value: Tool.LINE },
            { label: "Rectangle", icon: rectangleIcon, value: Tool.RECTANGLE },
            { label: "Ellipse", icon: ellipseIcon, value: Tool.ELLIPSE },
            { label: "Bucket", icon: bucketIcon, value: Tool.BUCKET },
            { label: "Text", icon: textIcon, value: Tool.TEXT },
            { label: "Select", icon: selectIcon, value: Tool.SELECT },
        ], Tool.PENCIL, tool => this.setTool(tool));

        this.statusPanelDiv = document.createElement("div");
        this.statusPanelDiv.classList.add(PREFIX + "-status-panel");
        screen.getNode().append(this.statusPanelDiv);

        // Fill with blanks.
        this.raster.fill(0x80);

        const s = assemblyResults.screenshotSections[screenshotIndex];
        this.byteCount = s.byteCount; // Don't round up here, leave what user has.
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

        window.addEventListener("keydown", this.onKeyDown);

        this.startAntsTimer();

        this.screen.setOverlayOptions(this.overlayOptions);
        this.rasterToScreen();

        this.updateSubtool();
        this.updateCursor();
    }

    /**
     * Cancel editing, as if the Cancel button was pressed.
     */
    public cancel(): void {
        this.close(false);
    }

    /**
     * Close the editor, optionally saving the screen back to the code.
     */
    private close(save: boolean): void {
        this.exitPasting();
        if (save) {
            this.rasterToCode();
        }
        this.overlayOptions = {}
        this.screen.setOverlayOptions(this.overlayOptions);
        this.trs80.start();
        this.mouseUnsubscribe();
        this.controlPanelDiv1.remove();
        this.statusPanelDiv.remove();
        this.stopBlinkTimer();
        this.stopAntsTimer();
        window.removeEventListener("keydown", this.onKeyDown);
        this.onClose();
    }

    /**
     * Set the current drawing tool.
     */
    private setTool(tool: Tool): void {
        this.exitPasting();

        this.tool = tool;

        if (this.tool === Tool.TEXT) {
            this.startBlinkTimer();
        } else {
            this.stopBlinkTimer();
        }

        this.screen.setOverlayOptions(this.overlayOptions);

        this.updateStatus();
        this.updateSubtool();
        this.updateCursor();
    }

    /**
     * Starts a cursor blink timer.
     */
    private startBlinkTimer(): void {
        this.stopBlinkTimer();
        this.overlayOptions.showCursor = true;
        this.screen.setOverlayOptions(this.overlayOptions);
        this.blinkHandle = window.setInterval(() => {
            this.overlayOptions.showCursor = !this.overlayOptions.showCursor;
            this.screen.setOverlayOptions(this.overlayOptions);
        }, TRS80_BLINK_PERIOD_MS);
    }

    /**
     * Stops any ongoing blink timer.
     */
    private stopBlinkTimer(): void {
        if (this.blinkHandle !== undefined) {
            window.clearInterval(this.blinkHandle);
            this.blinkHandle = undefined;
        }
        this.overlayOptions.showCursor = false;
        this.screen.setOverlayOptions(this.overlayOptions);
    }

    /**
     * Starts a marching ants timer.
     */
    private startAntsTimer(): void {
        this.stopAntsTimer();
        this.antsHandle = window.requestAnimationFrame(() => {
            this.overlayOptions.selectionAntsOffset = (this.overlayOptions.selectionAntsOffset ?? 0) - 0.1;
            this.screen.setOverlayOptions(this.overlayOptions);
            this.startAntsTimer();
        });
    }

    /**
     * Stops any ongoing marching ants timer.
     */
    private stopAntsTimer(): void {
        if (this.antsHandle !== undefined) {
            window.cancelAnimationFrame(this.antsHandle);
            this.antsHandle = undefined;
        }
    }

    /**
     * Call this just before making a mutating change that needs to be undoable.
     */
    private prepareForMutation(): void {
        this.exitPasting();

        // Add current state to undo stack.
        this.undoStack.push(this.makeUndoInfo());

        // Make sure undo stack doesn't get too large. We push one for each character typed.
        const cut = Math.max(this.undoStack.length - MAX_UNDO, 0);
        if (cut > 0) {
            this.undoStack.splice(0, cut);
        }

        // Wipe out redo stack.
        this.redoStack.splice(0, this.redoStack.length);
    }

    /**
     * Cut the screen or selection to the clipboard.
     */
    private cut(): void {
        this.copy();
        this.clear();
    }

    /**
     * Copy the screen or selection to the clipboard.
     */
    private copy(): void {
        this.exitPasting();
        const sel = this.getSelectionOrScreen();
        const pixels: boolean[] = [];

        for (let y = sel.y1; y < sel.y2; y++) {
            for (let x = sel.x1; x < sel.x2; x++) {
                pixels.push(this.getPixel(x, y));
            }
        }

        // Copy to system clipboard as an image.
        const canvas = this.screen.makeSelectionCanvas(sel);
        canvas.toBlob((blob: Blob | null) => {
            if (blob !== null) {
                try {
                    navigator.clipboard.write([
                        new ClipboardItem({
                            "image/png": blob
                        })
                    ]);
                } catch (e: any) {
                    // Firefox doesn't support ClipboardItem.
                    console.log("Can't copy selection to system clipboard", e);
                }
            }
        });

        this.clipboard = new Clipboard(sel.width, sel.height, pixels);
    }

    /**
     * Copy the screen or selection to the clipboard.
     */
    private paste(): void {
        this.exitPasting();
        this.pasting = true;
        this.rasterBackup.set(this.raster);
        this.byteCountBackup = this.byteCount;
        this.updatePaste(false);
    }

    /**
     * Exit paste mode and restore everything.
     */
    private exitPasting(): void {
        if (this.pasting) {
            this.raster.set(this.rasterBackup);
            this.rasterToScreen();
            this.byteCount = this.byteCountBackup;
            this.pasting = false;
        }
    }

    /**
     * Paste the clipboard.
     */
    private updatePaste(transparent: boolean): void {
        this.raster.set(this.rasterBackup);
        const x1 = this.overlayOptions.highlightPixelColumn ?? 0;
        const y1 = this.overlayOptions.highlightPixelRow ?? 0;
        const cb = this.clipboard;
        if (cb !== undefined) {
            let i = 0;
            for (let y = 0; y < cb.height; y++) {
                for (let x = 0; x < cb.width; x++) {
                    if (cb.pixels[i]) {
                        this.setPixel(x1 + x, y1 + y, true, FULL_SCREEN_SELECTION);
                    } else if (!transparent) {
                        this.setPixel(x1 + x, y1 + y, false, FULL_SCREEN_SELECTION);
                    }
                    i++;
                }
            }

            this.rasterToScreen();
            this.byteCount = this.byteCountBackup;
        }
    }

    /**
     * Undo the most recent change.
     */
    private undo(): void {
        this.exitPasting();
        const undoInfo = this.undoStack.pop() as UndoInfo;
        if (undoInfo !== undefined) {
            this.redoStack.push(this.makeUndoInfo());
            this.restoreUndoInfo(undoInfo);
        }
    }

    /**
     * Redo the most recent undo.
     */
    private redo(): void {
        this.exitPasting();
        const undoInfo = this.redoStack.pop() as UndoInfo;
        if (undoInfo !== undefined) {
            this.undoStack.push(this.makeUndoInfo());
            this.restoreUndoInfo(undoInfo);
        }
    }

    /**
     * Make a fresh undo info from the current state.
     */
    private makeUndoInfo(): UndoInfo {
        return new UndoInfo(this.raster, this.overlayOptions.cursorPosition, this.byteCount);
    }

    /**
     * Restore state from undo info.
     */
    private restoreUndoInfo(undoInfo: UndoInfo): void {
        this.raster.set(undoInfo.raster);
        this.rasterToScreen();

        if (undoInfo.cursorPosition !== undefined) {
            this.setCursorPosition(undoInfo.cursorPosition);
        }

        this.byteCount = undoInfo.byteCount;
    }

    /**
     * Get the pixel selection, if available.
     */
    private getSelection(): Selection | undefined {
        let sel = this.overlayOptions.selection;
        return sel === undefined || sel.isEmpty() ? undefined : sel;
    }

    /**
     * Get the selection, or if the selection is not set, return the whole screen.
     */
    private getSelectionOrScreen(): Selection {
        const selection = this.getSelection();
        if (selection === undefined) {
            return FULL_SCREEN_SELECTION;
        }

        return selection;
    }

    /**
     * Clear the screen or selection to black.
     */
    private clear(): void {
        this.prepareForMutation();
        const sel = this.getSelection();
        if (sel !== undefined) {
            for (let y = sel.y1; y < sel.y2; y++) {
                for (let x = sel.x1; x < sel.x2; x++) {
                    this.setPixel(x, y, false, sel);
                }
            }
        } else {
            this.raster.fill(0x80, 0, this.byteCount);
        }
        this.rasterToScreen();
    }

    /**
     * Invert the screen.
     */
    private invert(): void {
        this.prepareForMutation();
        const sel = this.getSelection();
        if (sel !== undefined) {
            for (let y = sel.y1; y < sel.y2; y++) {
                for (let x = sel.x1; x < sel.x2; x++) {
                    this.setPixel(x, y, !this.getPixel(x, y), sel);
                }
            }
        } else {
            for (let i = 0; i < this.byteCount; i++) {
                const ch = this.raster[i];
                if (ch >= 128 && ch < 192) {
                    this.raster[i] = ch ^ 0x3F;
                }
            }
        }
        this.rasterToScreen();
    }

    /**
     * Flip selection or screen horizontally.
     */
    private flipHorizontally(): void {
        this.prepareForMutation();
        const sel = this.getSelectionOrScreen();
        const width = Math.floor(sel.width / 2);
        for (let y = sel.y1; y < sel.y2; y++) {
            for (let x = 0; x < width; x++) {
                const x1 = sel.x1 + x;
                const x2 = sel.x2 - 1 - x;
                const p1 = this.getPixel(x1, y);
                const p2 = this.getPixel(x2, y);
                this.setPixel(x1, y, p2, sel);
                this.setPixel(x2, y, p1, sel);
            }
        }
    }

    /**
     * Flip selection or screen vertically.
     */
    private flipVertically(): void {
        this.prepareForMutation();
        const sel = this.getSelectionOrScreen();
        const height = Math.floor(sel.height / 2);
        for (let x = sel.x1; x < sel.x2; x++) {
            for (let y = 0; y < height; y++) {
                const y1 = sel.y1 + y;
                const y2 = sel.y2 - 1 - y;
                const p1 = this.getPixel(x, y1);
                const p2 = this.getPixel(x, y2);
                this.setPixel(x, y1, p2, sel);
                this.setPixel(x, y2, p1, sel);
            }
        }
    }

    /**
     * Write our raster array back to the source code.
     */
    private rasterToCode() {
        const lines = [];
        const raster = Array.from(this.raster.subarray(0, this.byteCount));
        for (let i = 0; i < raster.length;) {
            // TODO guess the indent.
            let text = "          ";
            const begin = i++;
            // Figure out if this is ASCII or binary.
            if (isPrintableAscii(raster[begin])) {
                // ASCII.
                while (i < raster.length && isPrintableAscii(raster[i]) && i % 64 !== 0) {
                    i++;
                }
                text += ".text '" + raster.slice(begin, i).map(b => String.fromCodePoint(b)).join("") + "'";
            } else {
                // Binary.
                while (i < raster.length && !isPrintableAscii(raster[i]) && i % 8 !== 0) {
                    i++;
                }
                text += ".byte " + raster.slice(begin, i).map(b => "0x" + toHexByte(b)).join(",");
            }
            if (begin % 64 == 0) {
                text += ` ; Line ${begin / 64}`;
            }
            lines.push(text);
        }
        if (this.extraBytes.length > 0) {
            const bytesStrings = this.extraBytes.map(b => "0x" + toHexByte(b));
            let text = `        .byte ${bytesStrings.join(",")} ; Extra data`;
            lines.push(text);
        }
        const code = lines.join("\n");

        // Update doc.
        let change: ChangeSpec;
        const docLength = this.view.state.doc.length;
        if (this.begin > docLength) {
            // We're at the very end of the doc, must insert another newline.
            change = {
                from: docLength,
                to: docLength,
                insert: "\n" + code,
            };
        } else {
            change = {
                from: this.begin,
                to: this.end,
                insert: code,
            };
        }
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
        let position = e.position;
        const statusText: string[] = [`(${position.pixelX}, ${position.pixelY})`];

        this.overlayOptions.highlightPixelColumn = position.pixelX;
        this.overlayOptions.highlightPixelRow = position.pixelY;
        this.screen.setOverlayOptions(this.overlayOptions);
        const sel = this.getSelectionOrScreen();

        if (e.type === "mousedown") {
            if (this.pasting) {
                // Must set up for undo here, since user might abort pasting.
                this.exitPasting();
                this.prepareForMutation();
                this.updatePaste(e.shiftKey);
                return;
            }
            switch (this.tool) {
                case Tool.PENCIL:
                    this.prepareForMutation();
                    this.mouseDownPosition = position;
                    this.previousPosition = position;
                    break;
                case Tool.LINE:
                case Tool.RECTANGLE:
                case Tool.ELLIPSE:
                    this.prepareForMutation();
                    this.mouseDownPosition = position;
                    this.previousPosition = undefined;
                    this.rasterBackup.set(this.raster);
                    this.byteCountBackup = this.byteCount;
                    break;
                case Tool.BUCKET:
                    this.prepareForMutation();
                    this.floodFill(position, this.mode == Mode.DRAW, sel);
                    break;
                case Tool.TEXT:
                    this.setCursorPosition(position.offset);
                    break;
                case Tool.SELECT:
                    if (this.subtool === Subtool.MOVE_SELECTION) {
                        this.selMoving = true;
                        this.selMoveDx = position.pixelX - sel.x1;
                        this.selMoveDy = position.pixelY - sel.y1;
                        this.selMoveWidth = sel.width;
                        this.selMoveHeight = sel.height;
                    } else {
                        this.selMoving = false;
                        this.overlayOptions.selection = new Selection(position.pixelX, position.pixelY, 0, 0);
                        this.mouseDownPosition = position;
                    }
                    break;
            }
        }
        if (e.type === "mouseup") {
            this.mouseDownPosition = undefined;
            this.previousPosition = undefined;
            this.selMoving = false;
        }
        const value = this.mode === Mode.DRAW;
        switch (this.tool) {
            case Tool.PENCIL:
                if (this.previousPosition != undefined) {
                    this.drawLine(this.previousPosition, position, value, sel);
                    this.previousPosition = position;
                }
                break;
            case Tool.LINE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();
                    this.byteCount = this.byteCountBackup;
                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        let dx = x - this.mouseDownPosition.pixelX;
                        let dy = y - this.mouseDownPosition.pixelY;

                        // Double dy because pixels are twice as tall as they are wide.
                        // This angle is visual, and is from -180 to 180.
                        const a = Math.atan2(dy*2, dx)*180/Math.PI;

                        // We allow both pixel 45 degrees and visual 45 degrees. Since
                        // our computed angle is visual, the pixel 45 degrees will be
                        // at 63 degrees.
                        if (Math.abs(a) < 27 || Math.abs(a) > 180 - 27) {
                            // Snap to horizontal.
                            dy = 0;
                        } else if (Math.abs(a) > 76 && Math.abs(a) < 180 - 76) { // Between 63 and 90
                            // Snap to vertical.
                            dx = 0;
                        } else if (Math.abs(a) < 54 || Math.abs(a) > 180 - 54) { // Between 45 and 63
                            // Visual 45 degrees.
                            if (Math.abs(dx) < Math.abs(dy*2)) {
                                // X is shorter, clamp Y.
                                dy = Math.sign(dy)*Math.round(Math.abs(dx/2));
                            }
                            // X must always be an odd distance away horizontally.
                            dx = Math.sign(dx)*Math.abs(dy*2 + Math.sign(dy));
                        } else {
                            // Pixel 45 degrees.
                            if (Math.abs(dx) < Math.abs(dy*2)) {
                                // X is shorter, clamp Y.
                                dy = Math.sign(dy)*Math.abs(dx);
                            } else {
                                // Y is shorter, clamp X.
                                dx = Math.sign(dx)*Math.abs(dy);
                            }
                        }
                        x = this.mouseDownPosition.pixelX + dx;
                        y = this.mouseDownPosition.pixelY + dy;
                        position = new ScreenMousePosition(x, y);
                    }
                    statusText.push(this.drawLine(this.mouseDownPosition, position, value, sel));
                }
                break;
            case Tool.RECTANGLE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();
                    this.byteCount = this.byteCountBackup;
                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        let dx = x - this.mouseDownPosition.pixelX;
                        let dy = y - this.mouseDownPosition.pixelY;

                        // Snap to visual square.
                        if (Math.abs(dx) < Math.abs(dy*2)) {
                            // X is shorter, clamp Y.
                            dy = Math.sign(dy)*Math.round(Math.abs(dx/2));
                        }
                        // X must always be an odd distance away horizontally.
                        dx = Math.sign(dx)*Math.abs(dy*2 + Math.sign(dy));

                        x = this.mouseDownPosition.pixelX + dx;
                        y = this.mouseDownPosition.pixelY + dy;
                        position = new ScreenMousePosition(x, y);
                    }
                    statusText.push(this.drawRectangle(this.mouseDownPosition, position, value, sel));
                }
                break;
            case Tool.ELLIPSE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();
                    this.byteCount = this.byteCountBackup;

                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        let dx = x - this.mouseDownPosition.pixelX;
                        let dy = y - this.mouseDownPosition.pixelY;

                        // Snap to square.
                        if (Math.abs(dx) < Math.abs(dy*2)) {
                            // X is shorter, clamp Y.
                            dy = Math.sign(dy)*Math.round(Math.abs(dx/2));
                        }
                        // X must always be an odd distance away horizontally.
                        dx = Math.sign(dx)*Math.abs(dy*2 + Math.sign(dy));

                        x = this.mouseDownPosition.pixelX + dx;
                        y = this.mouseDownPosition.pixelY + dy;
                        position = new ScreenMousePosition(x, y);
                    }

                    const dx = Math.abs(position.pixelX - this.mouseDownPosition.pixelX);
                    const dy = Math.abs(position.pixelY - this.mouseDownPosition.pixelY);
                    statusText.push(this.drawEllipse(this.mouseDownPosition, dx, dy, value, sel));
                }
                break;
            case Tool.BUCKET:
            case Tool.TEXT:
                break;
            case Tool.SELECT:
                if (this.mouseDownPosition !== undefined) {
                    const x1 = this.mouseDownPosition.pixelX;
                    const y1 = this.mouseDownPosition.pixelY;
                    const x2 = position.pixelX;
                    const y2 = position.pixelY;
                    const width = Math.abs(x1 - x2);
                    const height = Math.abs(y1 - y2);
                    this.overlayOptions.selection = new Selection(
                        Math.min(x1, x2), Math.min(y1, y2), width, height);
                    statusText.push(`${width}×${height}`);
                } else if (this.selMoving) {
                    let x1 = position.pixelX - this.selMoveDx;
                    let y1 = position.pixelY - this.selMoveDy;
                    let x2 = x1 + this.selMoveWidth;
                    let y2 = y1 + this.selMoveHeight;
                    x1 = Math.max(x1, 0);
                    y1 = Math.max(y1, 0);
                    x2 = Math.min(x2, TRS80_PIXEL_WIDTH - 1);
                    y2 = Math.min(y2, TRS80_PIXEL_HEIGHT - 1);
                    this.overlayOptions.selection = new Selection(x1, y1, x2 - x1, y2 - y1);
                    statusText.push(`${sel.width}×${sel.height}`);
                }
                this.screen.setOverlayOptions(this.overlayOptions);
                break;
        }

        if (this.pasting) {
            this.updatePaste(e.shiftKey);
        }

        this.pixelStatus = statusText.filter(s => s.length > 0).join(", ");
        this.updateStatus();
        this.updateSubtool();
        this.updateCursor();
    }

    /**
     * Update the subtool based on the cursor position.
     */
    private updateSubtool(): void {
        this.subtool = Subtool.NORMAL;

        const sel = this.getSelection();
        const x = this.overlayOptions.highlightPixelColumn ?? 0;
        const y = this.overlayOptions.highlightPixelRow ?? 0;
        if (this.tool === Tool.SELECT && sel !== undefined && sel.contains(x, y)) {
            this.subtool = Subtool.MOVE_SELECTION;
        }
    }

    /**
     * Update the cursor based on tool and subtool.
     */
    private updateCursor(): void {
        let cursor = "default";

        if (this.subtool === Subtool.MOVE_SELECTION) {
            cursor = "move";
        }

        this.screen.getNode().style.cursor = cursor;
    }

    /**
     * Handle key down events from anywhere in the window.
     */
    private handleKeyDown(event: KeyboardEvent): void {
        // Hotkeys.
        if (event.metaKey || event.ctrlKey) {
            switch (event.key) {
                case "x":
                    this.cut();
                    event.preventDefault();
                    break;
                case "c":
                    this.copy();
                    event.preventDefault();
                    break;
                case "p":
                    this.paste();
                    event.preventDefault();
                    break;
            }
            return;
        }

        if ((event.key === "Esc" || event.key === "Escape") && this.pasting) {
            this.exitPasting();
            event.preventDefault();
            return;
        }

        // Text mode.
        if (this.tool === Tool.TEXT) {
            const key = event.key;

            // Reset position.
            let pos = this.overlayOptions.cursorPosition;
            if (pos === undefined || pos < 0 || pos >= TRS80_SCREEN_SIZE) {
                pos = 0;
            }

            // I don't know if there's a good way to tell an insertable key from a key like Enter.
            if (key.length === 1) {
                let code = key.codePointAt(0) as number;
                if (isPrintableAscii(code)) {
                    // ASCII character.
                    this.prepareForMutation();
                    this.raster[pos] = code;
                    this.rasterToScreen();
                    this.extendByteCount(pos);
                    this.setCursorPosition((pos + 1) % TRS80_SCREEN_SIZE);
                }
            } else switch (key) {
                case "Enter":
                    this.setCursorPosition(((pos & 0xFFC0) + 64) % TRS80_SCREEN_SIZE);
                    break;
                case "Tab":
                    if (event.shiftKey) {
                        this.setCursorPosition(((pos + TRS80_SCREEN_SIZE - 1) & 0xFFF8) % TRS80_SCREEN_SIZE);
                    } else {
                        this.setCursorPosition(((pos & 0xFFF8) + 8) % TRS80_SCREEN_SIZE);
                    }
                    break;
                case "Backspace":
                    this.prepareForMutation();
                    pos = (pos + TRS80_SCREEN_SIZE - 1) % TRS80_SCREEN_SIZE;
                    this.raster[pos] = 0x80;
                    this.rasterToScreen();
                    this.setCursorPosition(pos);
                    break;
                case "ArrowLeft":
                    this.setCursorPosition((pos + TRS80_SCREEN_SIZE - 1) % TRS80_SCREEN_SIZE);
                    break;
                case "ArrowRight":
                    this.setCursorPosition((pos + 1) % TRS80_SCREEN_SIZE);
                    break;
                case "ArrowUp":
                    this.setCursorPosition((pos + TRS80_SCREEN_SIZE - TRS80_CHAR_WIDTH) % TRS80_SCREEN_SIZE);
                    break;
                case "ArrowDown":
                    this.setCursorPosition((pos + TRS80_CHAR_WIDTH) % TRS80_SCREEN_SIZE);
                    break;
                default:
                    // Something else, ignore.
                    break;
            }
        }
    }

    /**
     * Extend what we consider to be the size of the screen being edited.
     * @param pos position that we just modified.
     */
    private extendByteCount(pos: number): void {
        // Round up to the end of the line.
        this.byteCount = Math.max(this.byteCount, (pos + 64) & 0xFFC0);
    }

    /**
     * Draw a line from p1 to p2 of the specified value.
     * @return text to show in the status bar.
     */
    private drawLine(p1: ScreenMousePosition, p2: ScreenMousePosition, value: boolean, sel: Selection): string {
        let dx = p2.pixelX - p1.pixelX;
        let dy = p2.pixelY - p1.pixelY;

        if (Math.abs(dx) >= Math.abs(dy)) {
            // More across than vertical.

            // Order left-to-right.
            if (p1.pixelX > p2.pixelX) {
                [p1, p2] = [p2, p1];
                dx = -dx;
                dy = -dy;
            }

            const slope = dy/dx;

            let y = p1.pixelY;
            for (let x = p1.pixelX; x <= p2.pixelX; x++) {
                this.setPixel(x, Math.round(y), value, sel);
                y += slope;
            }
        } else {
            // More vertical than across.

            // Order top-to-bottom.
            if (p1.pixelY > p2.pixelY) {
                [p1, p2] = [p2, p1];
                dx = -dx;
                dy = -dy;
            }

            const slope = dx/dy;

            let x = p1.pixelX;
            for (let y = p1.pixelY; y <= p2.pixelY; y++) {
                this.setPixel(Math.round(x), y, value, sel);
                x += slope;
            }
        }

        return `${dx + 1}×${dy + 1}`;
    }

    /**
     * Draw a (hollow) rectangle from p1 to p2.
     * @return text to show in the status bar.
     */
    private drawRectangle(p1: ScreenMousePosition, p2: ScreenMousePosition, value: boolean, sel: Selection): string {
        const x1 = Math.min(p1.pixelX, p2.pixelX);
        const y1 = Math.min(p1.pixelY, p2.pixelY);
        const x2 = Math.max(p1.pixelX, p2.pixelX);
        const y2 = Math.max(p1.pixelY, p2.pixelY);

        for (let x = x1; x <= x2; x++) {
            this.setPixel(x, y1, value, sel);
            this.setPixel(x, y2, value, sel);
        }
        for (let y = y1; y <= y2; y++) {
            this.setPixel(x1, y, value, sel);
            this.setPixel(x2, y, value, sel);
        }

        return `${x2 - x1 + 1}×${y2 - y1 + 1}`;
    }

    /**
     * Draw an ellipse centered at c with the specified radii.
     * @return text to show in the status bar.
     */
    private drawEllipse(c: ScreenMousePosition, rx: number, ry: number, value: boolean, sel: Selection): string {
        const cx = c.pixelX;
        const cy = c.pixelY;

        // Draw a 4-way symmetric point.
        const plot = (x: number, y: number) => {
            this.setPixel(cx + x, cy + y, value, sel);
            this.setPixel(cx - x, cy + y, value, sel);
            this.setPixel(cx + x, cy - y, value, sel);
            this.setPixel(cx - x, cy - y, value, sel);
        };

        // Use the midpoint ellipse drawing algorithm.
        let x = 0;
        let y = ry;

        // Region 1.
        let d1 = ry*ry - rx*rx*ry + rx*rx/4;
        let dx = 2*ry*ry*x;
        let dy = 2*rx*rx*y;
        while (dx < dy) {
            plot(x, y);

            if (d1 < 0) {
                x++;
                dx = dx + 2*ry*ry;
                d1 = d1 + dx + ry*ry;
            } else {
                x++;
                y--;
                dx = dx + 2*ry*ry;
                dy = dy - 2*rx*rx;
                d1 = d1 + dx - dy + ry*ry;
            }
        }

        // Region 2.
        let d2 = ry*ry*((x + 0.5)*(x + 0.5)) + rx*rx*((y - 1) * (y - 1)) - rx*rx*ry*ry;
        while (y >= 0) {
            plot(x, y);

            if (d2 > 0) {
                y--;
                dy = dy - 2*rx*rx;
                d2 = d2 + rx*rx - dy;
            } else {
                y--;
                x++;
                dx = dx + 2 * ry*ry;
                dy = dy - 2 * rx*rx;
                d2 = d2 + dx - dy + rx*rx;
            }
        }

        return `${rx*2 + 1}×${ry*2 + 1}`;
    }

    /**
     * Turn the specified pixel on or off.
     */
    private setPixel(x: number, y: number, value: boolean, sel: Selection): void {
        if (x >= 0 && y >= 0 && x < TRS80_PIXEL_WIDTH && y < TRS80_PIXEL_HEIGHT) {
            this.setPosition(new ScreenMousePosition(x, y), value, sel);
        }
    }

    /**
     * Turn the specified position on or off.
     */
    private setPosition(position: ScreenMousePosition, value: boolean, sel: Selection): void {
        if (position.pixelX < sel.x1 || position.pixelY < sel.y1 ||
            position.pixelX >= sel.x2 || position.pixelY >= sel.y2) {

            return;
        }
        let ch = this.raster[position.offset];
        if (ch < 128 || ch >= 192) {
            // Convert to graphics.
            ch = 128;
        }
        if (value) {
            ch |= position.mask;
        } else {
            ch &= ~position.mask;
        }
        this.raster[position.offset] = ch;
        this.screen.writeChar(position.address, ch);
        this.extendByteCount(position.offset);
    }

    /**
     * Flood fill from the given position with the given value.
     */
    private floodFill(position: ScreenMousePosition, value: boolean, sel: Selection): void {
        const pixels: ScreenMousePosition[] = [position];

        while (pixels.length > 0) {
            position = pixels.pop() as ScreenMousePosition;

            const pixelValue = this.getPosition(position);
            if (pixelValue !== value) {
                this.setPosition(position, value, sel);

                const x = position.pixelX;
                const y = position.pixelY;
                if (x > sel.x1) pixels.push(new ScreenMousePosition(x - 1, y));
                if (x < sel.x2 - 1) pixels.push(new ScreenMousePosition(x + 1, y));
                if (y > sel.y1) pixels.push(new ScreenMousePosition(x, y - 1));
                if (y < sel.y2 - 1) pixels.push(new ScreenMousePosition(x, y + 1));
            }
        }
    }

    /**
     * Get the specified pixel value.
     */
    private getPixel(x: number, y: number): boolean {
        if (x >= 0 && y >= 0 && x < TRS80_PIXEL_WIDTH && y < TRS80_PIXEL_HEIGHT) {
            return this.getPosition(new ScreenMousePosition(x, y));
        } else {
            return false;
        }
    }

    /**
     * Get the pixel value at the given position.
     */
    private getPosition(position: ScreenMousePosition): boolean {
        const ch = this.raster[position.offset];
        if (ch < 128 || ch >= 192) {
            return false;
        } else {
            return (ch & position.mask) !== 0;
        }
    }

    /**
     * Set the cursor position to the given location.
     * @param position
     * @private
     */
    private setCursorPosition(position: number): void {
        this.overlayOptions.cursorPosition = position;
        this.updateStatus();
        if (this.tool === Tool.TEXT) {
            this.startBlinkTimer();
        }
    }

    /**
     * Update the status bar based on the current state.
     */
    private updateStatus(): void {
        const parts = [this.pixelStatus];

        if (this.tool === Tool.TEXT) {
            const cursor = this.overlayOptions.cursorPosition ?? 0;
            parts.push(`cursor at ${cursor}, column ${cursor % 64}, row ${Math.floor(cursor / 64)}`);
        }

        this.statusPanelDiv.innerText = parts.join(", ");
    }
}
