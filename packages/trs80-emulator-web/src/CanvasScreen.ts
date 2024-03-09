import {Trs80WebScreen} from "./Trs80WebScreen.js";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_ALT_FONT, MODEL3_FONT} from "./Fonts.js";
import {Background, CGChip, Config, ModelType, Phosphor, ScanLines} from "trs80-emulator";
import {toHexByte} from "z80-base";
import {TRS80_CHAR_HEIGHT, TRS80_CHAR_PIXEL_HEIGHT, TRS80_CHAR_PIXEL_WIDTH, TRS80_CHAR_WIDTH,
    TRS80_PIXEL_HEIGHT,
    TRS80_PIXEL_WIDTH, TRS80_SCREEN_BEGIN, TRS80_SCREEN_END, TRS80_SCREEN_SIZE} from "trs80-base";
import {SimpleEventDispatcher} from "strongly-typed-events";
import { FlipCard, FlipCardSide} from "./FlipCard.js";

export const AUTHENTIC_BACKGROUND = "#334843";
export const BLACK_BACKGROUND = "#000000";

const PADDING = 10;
const BORDER_RADIUS = 8;

const WHITE_PHOSPHOR = [230, 231, 252];
const AMBER_PHOSPHOR = [247, 190, 64];
const GREEN_PHOSPHOR = [122, 244, 96];

// Gets an RGB array (0-255) for a phosphor.
export function phosphorToRgb(phosphor: Phosphor): number[] {
    switch (phosphor) {
        case Phosphor.WHITE:
        default:
            return WHITE_PHOSPHOR;

        case Phosphor.GREEN:
            return GREEN_PHOSPHOR;

        case Phosphor.AMBER:
            return AMBER_PHOSPHOR;
    }
}

/**
 * Type of mouse event.
 */
export type ScreenMouseEventType = "mousedown" | "mouseup" | "mousemove";

/**
 * Position of the mouse on the screen.
 */
export class ScreenMousePosition {
    // TRS-80 pixels (128x48).
    public readonly pixelX: number;
    public readonly pixelY: number;
    // Character position (64x16).
    public readonly charX: number;
    public readonly charY: number;
    // Sub-pixel within the character (2x3).
    public readonly subPixelX: number;
    public readonly subPixelY: number;
    // Bit that's on within the pixel (0-5), row-major.
    public readonly bit: number;
    // Mask of the above bit (0x01, 0x02, 0x04, 0x08, 0x10, 0x20).
    public readonly mask: number;
    // Offset of the character position within the screen (0-1023).
    public readonly offset: number;
    // Address in memory (15360-16383).
    public readonly address: number;

    public constructor(pixelX: number, pixelY: number) {
        this.pixelX = pixelX;
        this.pixelY = pixelY;
        this.charX = Math.floor(pixelX / TRS80_CHAR_PIXEL_WIDTH);
        this.charY = Math.floor(pixelY / TRS80_CHAR_PIXEL_HEIGHT);
        this.subPixelX = pixelX % TRS80_CHAR_PIXEL_WIDTH;
        this.subPixelY = pixelY % TRS80_CHAR_PIXEL_HEIGHT;
        this.bit = this.subPixelY * TRS80_CHAR_PIXEL_WIDTH + this.subPixelX;
        this.mask = 1 << this.bit;
        this.offset = this.charY * TRS80_CHAR_WIDTH + this.charX;
        this.address = this.offset + TRS80_SCREEN_BEGIN;
    }
}

/**
 * An event representing a mouse action on the screen.
 */
export class ScreenMouseEvent {
    public readonly type: ScreenMouseEventType;
    public readonly position: ScreenMousePosition;
    public readonly shiftKey: boolean;

    public constructor(type: ScreenMouseEventType, position: ScreenMousePosition, shiftKey: boolean) {
        this.type = type;
        this.position = position;
        this.shiftKey = shiftKey;
    }
}

/**
 * Simple representation of a pixel selection.
 */
export class Selection {
    public readonly x1: number;
    public readonly y1: number;
    public readonly width: number;
    public readonly height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x1 = x;
        this.y1 = y;
        this.width = width;
        this.height = height;
    }

    // Exclusive.
    public get x2(): number {
        return this.x1 + this.width;
    }

    // Exclusive.
    public get y2(): number {
        return this.y1 + this.height;
    }

    public contains(x: number, y: number): boolean {
        return x >= this.x1 && y >= this.y1 && x < this.x2 && y < this.y2;
    }

    public isEmpty(): boolean {
        return this.width <= 0 || this.height <= 0;
    }

    public equals(other: Selection): boolean {
        return this.x1 === other.x1 &&
            this.y1 === other.y1 &&
            this.width === other.width &&
            this.height === other.height;
    }
}

export const FULL_SCREEN_SELECTION = new Selection(0, 0, TRS80_PIXEL_WIDTH, TRS80_PIXEL_HEIGHT);
export const EMPTY_SELECTION = new Selection(0, 0, 0, 0);

/**
 * Options for the overlay.
 */
export interface OverlayOptions {
    // Whether to show the pixel (fine) grid.
    showPixelGrid?: boolean;
    // Whether to show the character (coarse) grid.
    showCharGrid?: boolean;
    // Whether to highlight an entire pixel column or row.
    showHighlight?: boolean;
    highlightPixelColumn?: number;
    highlightPixelRow?: number;

    // Whether to show a character cursor, and where.
    showCursor?: boolean;
    cursorPosition?: number; // 0 to 1023.

    // Rectangular selection area.
    showSelection?: boolean;
    selection?: Selection;
    selectionAntsOffset?: number;
}

type FullOverlayOptions = Required<OverlayOptions>;

const DEFAULT_OVERLAY_OPTIONS: FullOverlayOptions = {
    showPixelGrid: false,
    showCharGrid: false,
    showHighlight: false,
    highlightPixelColumn: 0,
    highlightPixelRow: 0,
    showCursor: false,
    cursorPosition: 0,
    showSelection: false,
    selection: EMPTY_SELECTION,
    selectionAntsOffset: 0,
};

function overlayOptionsEqual(a: FullOverlayOptions, b: FullOverlayOptions): boolean {
    return a.showPixelGrid === b.showPixelGrid &&
        a.showCharGrid === b.showCharGrid &&
        a.showHighlight === b.showHighlight &&
        a.highlightPixelColumn === b.highlightPixelColumn &&
        a.highlightPixelRow === b.highlightPixelRow &&
        a.showCursor === b.showCursor &&
        a.cursorPosition === b.cursorPosition &&
        a.showSelection === b.showSelection &&
        a.selection.equals(b.selection) &&
        a.selectionAntsOffset === b.selectionAntsOffset;
}

const GRID_COLOR = "rgba(160, 160, 255, 0.5)";
const GRID_HIGHLIGHT_COLOR = "rgba(255, 255, 160, 0.5)";

/**
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80WebScreen implements FlipCardSide {
    public readonly scale: number = 1;
    public readonly padding: number;
    private readonly node: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly memory: Uint8Array = new Uint8Array(TRS80_SCREEN_END - TRS80_SCREEN_BEGIN);
    private readonly glyphs: HTMLCanvasElement[] = [];
    public readonly mouseActivity = new SimpleEventDispatcher<ScreenMouseEvent>();
    private flipCard: FlipCard | undefined = undefined;
    private lastMouseEvent: MouseEvent | undefined = undefined;
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;
    private overlayCanvas: HTMLCanvasElement | undefined = undefined;
    private overlayOptions: FullOverlayOptions = DEFAULT_OVERLAY_OPTIONS;

    /**
     * Create a canvas screen.
     *
     * @param scale size multiplier. If greater than 1, use multiples of 0.5.
     */
    constructor(scale: number = 1) {
        super();

        this.node = document.createElement("div");
        // Fit canvas horizontally so that the nested objects (panels and progress bars) are
        // displayed in the canvas.
        this.node.style.maxWidth = "max-content";

        this.scale = scale;
        this.padding = Math.round(PADDING * this.scale);

        this.canvas = document.createElement("canvas");
        // Make it block so we don't have any weird text margins on the bottom.
        this.canvas.style.display = "block";
        this.canvas.width = TRS80_CHAR_WIDTH * 8 * this.scale + 2 * this.padding;
        this.canvas.height = TRS80_CHAR_HEIGHT * 24 * this.scale + 2 * this.padding;
        this.canvas.addEventListener("mousemove", (event) => this.onMouseEvent("mousemove", event));
        this.canvas.addEventListener("mousedown", (event) => this.onMouseEvent("mousedown", event));
        this.canvas.addEventListener("mouseup", (event) => this.onMouseEvent("mouseup", event));
        // We don't have a good way to unsubscribe from these two. We could add some kind of close() method.
        // We could also check in the callback that the canvas's ancestor is window.
        window.addEventListener("keydown", (event) => this.onKeyEvent(event), {
            capture: true,
            passive: true,
        });
        window.addEventListener("keyup", (event) => this.onKeyEvent(event), {
            capture: true,
            passive: true,
        });
        this.node.append(this.canvas);

        this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;

        this.updateFromConfig();
    }

    didAttachToFlipCard(flipCard: FlipCard): void {
        this.flipCard = flipCard;
    }

    willDetachFromFlipCard(): void {
        this.flipCard = undefined;
    }

    /**
     * Update the overlay options.
     */
    public setOverlayOptions(userOptions: OverlayOptions): void {
        // Fill in defaults.
        const options: Required<OverlayOptions> = {
            ... DEFAULT_OVERLAY_OPTIONS,
            ... userOptions
        };
        if (overlayOptionsEqual(options, this.overlayOptions)) {
            return;
        }
        this.overlayOptions = options;

        const showSelection = options.showSelection && !options.selection.isEmpty();
        const showOverlay = options.showPixelGrid || options.showCharGrid ||
            options.showHighlight !== undefined || options.showCursor || showSelection;
        if (showOverlay) {
            const width = this.canvas.width;
            const height = this.canvas.height;
            const gridWidth = width - 2*this.padding;
            const gridHeight = height - 2*this.padding;

            // Create overlay canvas if necessary.
            let overlayCanvas = this.overlayCanvas;
            if (overlayCanvas === undefined) {
                overlayCanvas = document.createElement("canvas");
                overlayCanvas.style.position = "absolute";
                overlayCanvas.style.top = "0";
                overlayCanvas.style.left = "0";
                overlayCanvas.style.pointerEvents = "none";
                overlayCanvas.width = width;
                overlayCanvas.height = height;
                this.node.append(overlayCanvas);

                this.overlayCanvas = overlayCanvas;
            }

            // Whether to highlight a grid line.
            function isHighlighted(showHighlight: boolean, highlightValue: number, value: number): boolean {
                return showHighlight && (highlightValue === value || highlightValue + 1 === value);
            }

            // Clear the overlay.
            const ctx = overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
            ctx.save();
            ctx.clearRect(0, 0, width, height);
            ctx.translate(this.padding, this.padding);

            // Draw columns.
            for (let i = 0; i <= TRS80_PIXEL_WIDTH; i++) {
                const highlighted = isHighlighted(options.showHighlight, options.highlightPixelColumn, i);
                const isCharLine = options.showCharGrid && i % TRS80_CHAR_PIXEL_WIDTH === 0;
                if (highlighted || options.showPixelGrid || isCharLine) {
                    const x = Math.round(i * 4 * this.scale);
                    ctx.lineWidth = isCharLine && !highlighted ? 2 : 1;
                    ctx.strokeStyle = highlighted ? GRID_HIGHLIGHT_COLOR : GRID_COLOR;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, gridHeight);
                    ctx.stroke();
                }
            }

            // Draw rows.
            for (let i = 0; i <= TRS80_PIXEL_HEIGHT; i++) {
                const highlighted = isHighlighted(options.showHighlight, options.highlightPixelRow, i);
                const isCharLine = options.showCharGrid && i % TRS80_CHAR_PIXEL_HEIGHT === 0;
                if (highlighted || options.showPixelGrid || isCharLine) {
                    const y = Math.round(i * 8 * this.scale);
                    ctx.lineWidth = isCharLine && !highlighted ? 2 : 1;
                    ctx.strokeStyle = highlighted ? GRID_HIGHLIGHT_COLOR : GRID_COLOR;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(gridWidth, y);
                    ctx.stroke();
                }
            }

            // Draw cursor.
            if (options.showCursor && options.cursorPosition >= 0 && options.cursorPosition < TRS80_SCREEN_SIZE) {
                const x = options.cursorPosition % TRS80_CHAR_WIDTH;
                const y = Math.floor(options.cursorPosition / TRS80_CHAR_WIDTH);

                ctx.fillStyle = GRID_HIGHLIGHT_COLOR;
                ctx.fillRect(x * 8 * this.scale, y * 24 * this.scale,
                    8 * this.scale, 24 * this.scale);
            }

            // Draw selection.
            if (showSelection) {
                const x1 = options.selection.x1*4*this.scale;
                const y1 = options.selection.y1*8*this.scale;
                const x2 = options.selection.x2*4*this.scale;
                const y2 = options.selection.y2*8*this.scale;
                const dash = 5;
                ctx.save();
                ctx.setLineDash([dash, dash]);
                for (let pass = 0; pass < 2; pass++) {
                    ctx.lineDashOffset = options.selectionAntsOffset + pass*dash;
                    ctx.strokeStyle = pass == 0 ? "black" : "white";
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y1);
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x1, y2);
                    ctx.moveTo(x1, y2);
                    ctx.lineTo(x2, y2);
                    ctx.moveTo(x2, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Remove overlay.
            if (this.overlayCanvas !== undefined) {
                this.overlayCanvas.remove();
                this.overlayCanvas = undefined;
            }
        }
    }

    /**
     * Width of the entire screen, including margins.
     */
    public getWidth(): number {
        return this.canvas.width;
    }

    /**
     * Height of the entire screen, including margins.
     */
    public getHeight(): number {
        return this.canvas.height;
    }

    setConfig(config: Config): void {
        this.config = config;
        this.updateFromConfig();
    }

    /**
     * Send a new mouse event to listeners.
     */
    private emitMouseActivity(type: ScreenMouseEventType, event: MouseEvent, shiftKey: boolean): void {
        const x = event.offsetX - this.padding;
        const y = event.offsetY - this.padding;
        const pixelX = Math.min(TRS80_PIXEL_WIDTH - 1, Math.max(0, Math.floor(x / this.scale / 4)));
        const pixelY = Math.min(TRS80_PIXEL_HEIGHT - 1, Math.max(0, Math.floor(y / this.scale / 8)));
        const position = new ScreenMousePosition(pixelX, pixelY);
        this.mouseActivity.dispatch(new ScreenMouseEvent(type, position, shiftKey));
    }

    /**
     * Handle a new mouse event.
     */
    private onMouseEvent(type: ScreenMouseEventType, event: MouseEvent): void {
        if (type === "mousemove" &&
            this.lastMouseEvent !== undefined &&
            (this.lastMouseEvent.buttons & 1) !== 0 &&
            (event.buttons & 1) === 0) {

            // Mouse was release since the last event, probably outside the canvas or window.
            // Fake a mouse up event.
            this.emitMouseActivity("mouseup", event, event.shiftKey);
        }
        this.lastMouseEvent = event;
        this.emitMouseActivity(type, event, event.shiftKey);
    }

    /**
     * Handle a new keyboard events. Only shift keys really matter.
     */
    private onKeyEvent(event: KeyboardEvent): void {
        if (this.lastMouseEvent !== undefined) {
            this.emitMouseActivity("mousemove", this.lastMouseEvent, event.shiftKey);
        }
    }

    /**
     * Update the font and screen from the config and other state.
     */
    private updateFromConfig(): void {
        let font;
        switch (this.config.cgChip) {
            case CGChip.ORIGINAL:
                font = MODEL1A_FONT;
                break;
            case CGChip.LOWER_CASE:
            default:
                switch (this.config.modelType) {
                    case ModelType.MODEL1:
                        font = MODEL1B_FONT;
                        break;
                    case ModelType.MODEL3:
                    case ModelType.MODEL4:
                    default:
                        font = this.isAlternateCharacters() ? MODEL3_ALT_FONT : MODEL3_FONT;
                        break;
                }
                break;
        }

        const glyphOptions: GlyphOptions = {
            color: phosphorToRgb(this.config.phosphor),
            scanLines: this.config.scanLines === ScanLines.ON,
        };
        for (let i = 0; i < 256; i++) {
            this.glyphs[i] = font.makeImage(i, this.isExpandedCharacters(), glyphOptions);
        }
        this.glyphWidth = font.width;

        this.drawBackground();
        this.refresh();
    }

    writeChar(address: number, value: number): void {
        const offset = address - TRS80_SCREEN_BEGIN;
        this.memory[offset] = value;
        this.drawChar(offset, value);
    }

    public getForegroundColor(): string {
        const color = phosphorToRgb(this.config.phosphor);
        return "#" + toHexByte(color[0]) + toHexByte(color[1]) + toHexByte(color[2]);
    }

    /**
     * Get the background color as a CSS color based on the current config.
     */
    public getBackgroundColor(): string {
        switch (this.config.background) {
            case Background.BLACK:
                return BLACK_BACKGROUND;

            case Background.AUTHENTIC:
            default:
                return AUTHENTIC_BACKGROUND;
        }
    }

    /**
     * The border radius of the screen, in pixels ("px" units).
     */
    public getBorderRadius(): number {
        return BORDER_RADIUS*this.scale;
    }

    /**
     * Draw a single character to the canvas.
     */
    private drawChar(offset: number, value: number): void {
        const screenX = (offset % 64)*8*this.scale + this.padding;
        const screenY = Math.floor(offset / 64)*24*this.scale + this.padding;

        this.context.fillStyle = this.getBackgroundColor();

        if (this.isExpandedCharacters()) {
            if (offset % 2 === 0) {
                this.context.fillRect(screenX, screenY, 16*this.scale, 24*this.scale);
                this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth * 2, 24,
                    screenX, screenY, 16*this.scale, 24*this.scale);
            }
        } else {
            this.context.fillRect(screenX, screenY, 8*this.scale, 24*this.scale);
            this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth, 24,
                screenX, screenY, 8*this.scale, 24*this.scale);
        }
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
        if (expanded !== this.isExpandedCharacters()) {
            super.setExpandedCharacters(expanded);
            this.updateFromConfig();
        }
    }

    setAlternateCharacters(alternate: boolean): void {
        if (alternate !== this.isAlternateCharacters()) {
            super.setAlternateCharacters(alternate);
            this.updateFromConfig();
        }
    }

    /**
     * Draw the background of the canvas.
     */
    private drawBackground(): void {
        const ctx = this.context;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const radius = this.getBorderRadius();

        ctx.fillStyle = this.getBackgroundColor();
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.arcTo(width, 0, width, radius, radius);
        ctx.arcTo(width, height, width - radius, height, radius);
        ctx.arcTo(0, height, 0, height - radius, radius);
        ctx.arcTo(0, 0, radius, 0, radius);
        ctx.fill();
    }

    /**
     * Refresh the display based on what we've kept track of.
     */
    private refresh(): void {
        for (let offset = 0; offset < this.memory.length; offset++) {
            this.drawChar(offset, this.memory[offset]);
        }
    }

    /**
     * Returns the canvas as an <img> element that can be resized. This is relatively
     * expensive.
     *
     * This method is deprecated, use asImageAsync instead.
     */
    public asImage(): HTMLImageElement {
        const image = document.createElement("img");
        image.src = this.canvas.toDataURL();
        return image;
    }

    /**
     * Returns the canvas as an <img> element that can be resized. Despite the
     * "async" name, there's still some synchronous work, about 13ms.
     */
    public asImageAsync(): Promise<HTMLImageElement> {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            // According to this answer:
            //     https://stackoverflow.com/a/59025746/211234
            // the toBlob() method still has to copy the image synchronously, so this whole method still
            // takes about 13ms. It's better than toDataUrl() because it doesn't have to make an actual
            // base64 string. The Object URL is just a reference to the blob.
            this.canvas.toBlob(blob => {
                if (blob === null) {
                    reject("Cannot make image from screen");
                } else {
                    const image = document.createElement("img");
                    const url = URL.createObjectURL(blob);
                    image.addEventListener("load", () => {
                        URL.revokeObjectURL(url);
                        // Resolve when the image is fully loaded so that there's no UI glitching.
                        resolve(image);
                    });
                    image.src = url;
                }
            });
        });
    }

    /**
     * Make a canvas from the sub-rectangle section.
     */
    public makeSelectionCanvas(selection: Selection): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = selection.width*4*this.scale;
        canvas.height = selection.height*8*this.scale;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        ctx.drawImage(this.canvas,
            selection.x1*4*this.scale + this.padding, selection.y1*8*this.scale + this.padding,
            selection.width*4*this.scale, selection.height*8*this.scale,
            0, 0,
            selection.width*4*this.scale, selection.height*8*this.scale);

        return canvas;
    }
}
