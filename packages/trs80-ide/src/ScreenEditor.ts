import {EditorView} from "@codemirror/view";
import {ChangeSpec} from "@codemirror/state";
import {TRS80_PIXEL_HEIGHT, TRS80_PIXEL_WIDTH, TRS80_SCREEN_BEGIN, TRS80_SCREEN_SIZE} from 'trs80-base';
import {Trs80} from 'trs80-emulator';
import {CanvasScreen, ScreenMouseEvent, ScreenMousePosition} from 'trs80-emulator-web';
import {toHexByte} from 'z80-base';
import {AssemblyResults} from "./AssemblyResults.js";
import saveIcon from "./icons/save.ico";
import cancelIcon from "./icons/cancel.ico";
import undoIcon from "./icons/undo.ico";
import redoIcon from "./icons/redo.ico";
import drawIcon from "./icons/draw.ico";
import eraseIcon from "./icons/erase.ico";
import pixelGridIcon from "./icons/pixel_grid.ico";
import charGridIcon from "./icons/char_grid.ico";
import pencilIcon from "./icons/pencil.ico";
import lineIcon from "./icons/line.ico";
import rectangleIcon from "./icons/rectangle.ico";
import ellipseIcon from "./icons/ellipse.ico";
import bucketIcon from "./icons/bucket.ico";

const PREFIX = "screen-editor";

// Sync this with CSS:
const NORMAL_ICON_COLOR = "#002b36";
const SELECTED_ICON_COLOR = "#fdf6e3";

enum Mode {
    DRAW, ERASE,
}

enum Tool {
    PENCIL, LINE, RECTANGLE, ELLIPSE, BUCKET,
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
        const button = document.createElement("button");
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
    private readonly undoStack: Uint8Array[] = [];
    private readonly redoStack: Uint8Array[] = [];
    private readonly extraBytes: number[];
    private readonly begin: number;
    private readonly controlPanelDiv: HTMLDivElement;
    private readonly statusPanelDiv: HTMLDivElement;
    private end: number;
    private byteCount: number;
    private mouseDownPosition: ScreenMousePosition | undefined = undefined;
    private previousPosition: ScreenMousePosition | undefined = undefined;
    private mode: Mode = Mode.DRAW;
    private tool: Tool = Tool.PENCIL;
    private showPixelGrid = false;
    private showCharGrid = false;

    constructor(view: EditorView, pos: number, assemblyResults: AssemblyResults,
                screenshotIndex: number, trs80: Trs80, screen: CanvasScreen, onClose: () => void) {

        this.view = view;
        this.screen = screen;
        this.trs80 = trs80;
        this.onClose = onClose;
        this.mouseUnsubscribe = screen.mouseActivity.subscribe(e => this.handleMouse(e));

        trs80.stop();

        this.controlPanelDiv = document.createElement("div");
        this.controlPanelDiv.classList.add(PREFIX + "-control-panel");
        screen.getNode().append(this.controlPanelDiv);

        makeButtons(this.controlPanelDiv, [
            { label: "Save", icon: saveIcon, onClick: () => this.close(true) },
            { label: "Cancel", icon: cancelIcon, onClick: () => this.close(false) },
        ]);

        makeButtons(this.controlPanelDiv, [
            { label: "Undo", icon: undoIcon, onClick: () => this.undo() },
            { label: "Redo", icon: redoIcon, onClick: () => this.redo() },
        ]);

        makeRadioButtons(this.controlPanelDiv, [
            { label: "Draw", icon: drawIcon, value: Mode.DRAW },
            { label: "Erase", icon: eraseIcon, value: Mode.ERASE },
        ], Mode.DRAW, mode => this.mode = mode);

        makeCheckboxButtons(this.controlPanelDiv, [
            { label: "Pixel Grid", icon: pixelGridIcon, checked: false, onChange: value => {
                    this.showPixelGrid = value;
                    this.screen.showGrid(this.showPixelGrid, this.showCharGrid);
                }},
            { label: "Char Grid", icon: charGridIcon, checked: false, onChange: value => {
                    this.showCharGrid = value;
                    this.screen.showGrid(this.showPixelGrid, this.showCharGrid);
                }},
        ]);

        makeRadioButtons(this.controlPanelDiv, [
            { label: "Pencil", icon: pencilIcon, value: Tool.PENCIL },
            { label: "Line", icon: lineIcon, value: Tool.LINE },
            { label: "Rectangle", icon: rectangleIcon, value: Tool.RECTANGLE },
            { label: "Ellipse", icon: ellipseIcon, value: Tool.ELLIPSE },
            { label: "Bucket", icon: bucketIcon, value: Tool.BUCKET },
        ], Tool.PENCIL, tool => this.tool = tool);

        this.statusPanelDiv = document.createElement("div");
        this.statusPanelDiv.classList.add(PREFIX + "-status-panel");
        screen.getNode().append(this.statusPanelDiv);

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

        this.screen.showGrid(this.showPixelGrid, this.showCharGrid);
        this.rasterToScreen();
    }

    private close(save: boolean) {
        if (save) {
            this.rasterToCode();
        }
        this.screen.showGrid(false, false);
        this.trs80.start();
        this.mouseUnsubscribe();
        this.controlPanelDiv.remove();
        this.onClose();
    }

    /**
     * Call this just before making a mutating change that needs to be undoable.
     */
    private prepareForMutation(): void {
        this.undoStack.push(this.raster.slice());
        this.redoStack.splice(0, this.redoStack.length);
    }

    /**
     * Undo the most recent change.
     */
    private undo(): void {
        const raster = this.undoStack.pop() as Uint8Array;
        if (raster !== undefined) {
            this.redoStack.push(this.raster.slice());
            this.raster.set(raster);
            this.rasterToScreen();
        }
    }

    /**
     * Redo the most recent undo.
     */
    private redo(): void {
        const raster = this.redoStack.pop() as Uint8Array;
        if (raster !== undefined) {
            this.undoStack.push(this.raster.slice());
            this.raster.set(raster);
            this.rasterToScreen();
        }
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

        if (e.type === "mousedown") {
            this.prepareForMutation();

            switch (this.tool) {
                case Tool.PENCIL:
                    this.mouseDownPosition = e.position;
                    this.previousPosition = e.position;
                    break;
                case Tool.LINE:
                case Tool.RECTANGLE:
                case Tool.ELLIPSE:
                    this.mouseDownPosition = e.position;
                    this.previousPosition = undefined;
                    this.rasterBackup.set(this.raster);
                    break;
                case Tool.BUCKET:
                    this.floodFill(position, this.mode == Mode.DRAW);
                    break;
            }
        }
        if (e.type === "mouseup") {
            this.mouseDownPosition = undefined;
            this.previousPosition = undefined;
        }
        const value = this.mode === Mode.DRAW;
        switch (this.tool) {
            case Tool.PENCIL:
                if (this.previousPosition != undefined) {
                    this.drawLine(this.previousPosition, position, value);
                    this.previousPosition = position;
                }
                break;
            case Tool.LINE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();
                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        const dx = x - this.mouseDownPosition.pixelX;
                        const dy = y - this.mouseDownPosition.pixelY;
                        const a = Math.atan2(dy, dx)*180/Math.PI;

                        // Match Photoshop angle thresholds. Perhaps these should be adjusted
                        // sine we have rectangular pixels.
                        if (Math.abs(a) < 27 || Math.abs(a) > 153) {
                            // Snap to horizontal.
                            y = this.mouseDownPosition.pixelY;
                        } else if (Math.abs(a) > 63 && Math.abs(a) < 117) {
                            // Snap to vertical.
                            x = this.mouseDownPosition.pixelX;
                        } else {
                            // Snap to 45 degrees.
                            if (Math.abs(dx) < Math.abs(dy)) {
                                // X is shorter, clamp Y.
                                y = this.mouseDownPosition.pixelY + Math.sign(dy)*Math.abs(dx);
                            } else {
                                // Y is shorter, clamp X.
                                x = this.mouseDownPosition.pixelX + Math.sign(dx)*Math.abs(dy);
                            }
                        }
                        position = new ScreenMousePosition(x, y);
                    }
                    statusText.push(this.drawLine(this.mouseDownPosition, position, value));
                }
                break;
            case Tool.RECTANGLE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();
                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        const dx = x - this.mouseDownPosition.pixelX;
                        const dy = y - this.mouseDownPosition.pixelY;

                        // Snap to square.
                        if (Math.abs(dx) < Math.abs(dy)) {
                            // X is shorter, clamp Y.
                            y = this.mouseDownPosition.pixelY + Math.sign(dy)*Math.abs(dx);
                        } else {
                            // Y is shorter, clamp X.
                            x = this.mouseDownPosition.pixelX + Math.sign(dx)*Math.abs(dy);
                        }

                        position = new ScreenMousePosition(x, y);
                    }
                    statusText.push(this.drawRectangle(this.mouseDownPosition, position, value));
                }
                break;
            case Tool.ELLIPSE:
                if (this.mouseDownPosition != undefined) {
                    this.raster.set(this.rasterBackup);
                    this.rasterToScreen();

                    if (e.shiftKey) {
                        let x = position.pixelX;
                        let y = position.pixelY;
                        const dx = x - this.mouseDownPosition.pixelX;
                        const dy = y - this.mouseDownPosition.pixelY;

                        // Snap to square.
                        if (Math.abs(dx) < Math.abs(dy)) {
                            // X is shorter, clamp Y.
                            y = this.mouseDownPosition.pixelY + Math.sign(dy)*Math.abs(dx);
                        } else {
                            // Y is shorter, clamp X.
                            x = this.mouseDownPosition.pixelX + Math.sign(dx)*Math.abs(dy);
                        }

                        position = new ScreenMousePosition(x, y);
                    }

                    const dx = Math.abs(position.pixelX - this.mouseDownPosition.pixelX);
                    const dy = Math.abs(position.pixelY - this.mouseDownPosition.pixelY);
                    statusText.push(this.drawEllipse(this.mouseDownPosition, dx, dy, value));
                }
                break;
            case Tool.BUCKET:
                break;
        }

        this.statusPanelDiv.innerText = statusText.filter(s => s.length > 0).join(", ");
    }

    /**
     * Draw a line from p1 to p2 of the specified value.
     * @return text to show in the status bar.
     */
    private drawLine(p1: ScreenMousePosition, p2: ScreenMousePosition, value: boolean): string {
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
                this.setPixel(x, Math.round(y), value);
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
                this.setPixel(Math.round(x), y, value);
                x += slope;
            }
        }

        return `${dx + 1}×${dy + 1}`;
    }

    /**
     * Draw a (hollow) rectangle from p1 to p2.
     * @return text to show in the status bar.
     */
    private drawRectangle(p1: ScreenMousePosition, p2: ScreenMousePosition, value: boolean): string {
        const x1 = Math.min(p1.pixelX, p2.pixelX);
        const y1 = Math.min(p1.pixelY, p2.pixelY);
        const x2 = Math.max(p1.pixelX, p2.pixelX);
        const y2 = Math.max(p1.pixelY, p2.pixelY);

        for (let x = x1; x <= x2; x++) {
            this.setPixel(x, y1, value);
            this.setPixel(x, y2, value);
        }
        for (let y = y1; y <= y2; y++) {
            this.setPixel(x1, y, value);
            this.setPixel(x2, y, value);
        }

        return `${x2 - x1 + 1}×${y2 - y1 + 1}`;
    }

    /**
     * Draw an ellipse centered at c with the specified radii.
     * @return text to show in the status bar.
     */
    private drawEllipse(c: ScreenMousePosition, rx: number, ry: number, value: boolean): string {
        const cx = c.pixelX;
        const cy = c.pixelY;

        // Draw a 4-way symmetric point.
        const plot = (x: number, y: number) => {
            this.setPixel(cx + x, cy + y, value);
            this.setPixel(cx - x, cy + y, value);
            this.setPixel(cx + x, cy - y, value);
            this.setPixel(cx - x, cy - y, value);
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
    private setPixel(x: number, y: number, value: boolean): void {
        if (x >= 0 && y >= 0 && x < TRS80_PIXEL_WIDTH && y < TRS80_PIXEL_HEIGHT) {
            this.setPosition(new ScreenMousePosition(x, y), value);
        }
    }

    /**
     * Turn the specified position on or off.
     */
    private setPosition(position: ScreenMousePosition, value: boolean): void {
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
        this.byteCount = Math.max(this.byteCount, position.offset + 1);
    }

    /**
     * Flood fill from the given position with the given value.
     */
    private floodFill(position: ScreenMousePosition, value: boolean): void {
        const pixels: ScreenMousePosition[] = [position];

        while (pixels.length > 0) {
            position = pixels.pop() as ScreenMousePosition;

            const pixelValue = this.getPosition(position);
            if (pixelValue !== value) {
                this.setPosition(position, value);

                const x = position.pixelX;
                const y = position.pixelY;
                if (x > 0) pixels.push(new ScreenMousePosition(x - 1, y));
                if (x < TRS80_PIXEL_WIDTH - 1) pixels.push(new ScreenMousePosition(x + 1, y));
                if (y > 0) pixels.push(new ScreenMousePosition(x, y - 1));
                if (y < TRS80_PIXEL_HEIGHT - 1) pixels.push(new ScreenMousePosition(x, y + 1));
            }
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
}
