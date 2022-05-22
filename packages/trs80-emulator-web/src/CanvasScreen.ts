import {Trs80WebScreen} from "./Trs80WebScreen.js";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_ALT_FONT, MODEL3_FONT} from "./Fonts.js";
import {Background, CGChip, Config, ModelType, Phosphor, ScanLines} from "trs80-emulator";
import {toHexByte} from "z80-base";
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_END} from "trs80-base";
import {SimpleEventDispatcher} from "strongly-typed-events";

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
        this.charX = Math.floor(pixelX / 2);
        this.charY = Math.floor(pixelY / 3);
        this.subPixelX = pixelX % 2;
        this.subPixelY = pixelY % 3;
        this.bit = this.subPixelY * 2 + this.subPixelX;
        this.mask = 1 << this.bit;
        this.offset = this.charY * 64 + this.charX;
        this.address = this.offset + TRS80_SCREEN_BEGIN;
    }
}

/**
 * An event representing a mouse action on the screen.
 */
export class ScreenMouseEvent {
    public readonly type: ScreenMouseEventType;
    // Undefined if outside the screen.
    public readonly position: ScreenMousePosition | undefined;
    public readonly shiftKey: boolean;

    public constructor(type: ScreenMouseEventType, position: ScreenMousePosition | undefined, shiftKey: boolean) {
        this.type = type;
        this.position = position;
        this.shiftKey = shiftKey;
    }
}

/**
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80WebScreen {
    public readonly scale: number = 1;
    public readonly padding: number;
    private readonly node: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly memory: Uint8Array = new Uint8Array(TRS80_SCREEN_END - TRS80_SCREEN_BEGIN);
    private readonly glyphs: HTMLCanvasElement[] = [];
    public readonly mouseActivity = new SimpleEventDispatcher<ScreenMouseEvent>();
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;
    private overlayCanvas: HTMLCanvasElement | undefined = undefined;

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
        this.padding = Math.round(PADDING*this.scale);

        this.canvas = document.createElement("canvas");
        // Make it block so we don't have any weird text margins on the bottom.
        this.canvas.style.display = "block";
        this.canvas.width = 64*8*this.scale + 2*this.padding;
        this.canvas.height = 16*24*this.scale + 2*this.padding;
        this.canvas.addEventListener("mousemove", (event) => this.emitMouseActivity("mousemove", event));
        this.canvas.addEventListener("mousedown", (event) => this.emitMouseActivity("mousedown", event));
        this.canvas.addEventListener("mouseup", (event) => this.emitMouseActivity("mouseup", event));
        this.node.append(this.canvas);

        this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;

        this.showGrid(false, false);
        this.updateFromConfig();
    }

    /**
     * Show the overlay grid.
     *
     * @param showPixelGrid whether to show the pixel (fine) grid.
     * @param showCharGrid whether to show the character (coarse) grid.
     */
    public showGrid(showPixelGrid: boolean, showCharGrid: boolean): void {
        if (this.overlayCanvas !== undefined) {
            this.overlayCanvas.remove();
            this.overlayCanvas = undefined;
        }

        if (showPixelGrid || showCharGrid) {
            const width = this.canvas.width;
            const height = this.canvas.height;

            const overlayCanvas = document.createElement("canvas");
            overlayCanvas.style.position = "absolute";
            overlayCanvas.style.top = "0";
            overlayCanvas.style.left = "0";
            overlayCanvas.style.pointerEvents = "none";
            overlayCanvas.width = width;
            overlayCanvas.height = height;
            this.node.append(overlayCanvas);

            const ctx = overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
            ctx.strokeStyle = "rgba(160, 160, 255, 0.5)";
            let step = showPixelGrid ? 1 : 2;
            for (let i = 0; i <= 128; i += step) {
                const x = Math.round(i*4*this.scale + this.padding);
                ctx.lineWidth = showCharGrid && i % 2 === 0 ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(x, this.padding);
                ctx.lineTo(x, height - this.padding);
                ctx.stroke();
            }
            step = showPixelGrid ? 1 : 3;
            for (let i = 0; i <= 48; i += step) {
                const y = Math.round(i*8*this.scale + this.padding);
                ctx.lineWidth = showCharGrid && i % 3 === 0 ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(this.padding, y);
                ctx.lineTo(width - this.padding, y);
                ctx.stroke();
            }

            this.overlayCanvas = overlayCanvas;
        }
    }

    public getWidth(): number {
        return this.canvas.width;
    }

    public getHeight(): number {
        return this.canvas.height;
    }

    setConfig(config: Config): void {
        this.config = config;
        this.updateFromConfig();
    }

    private emitMouseActivity(type: ScreenMouseEventType, event: MouseEvent): void {
        const x = event.offsetX - this.padding;
        const y = event.offsetY - this.padding;
        const pixelX = Math.floor(x / this.scale / 4);
        const pixelY = Math.floor(y / this.scale / 8);
        const position = pixelX < 0 || pixelY < 0 || pixelX >= 128 || pixelY >= 48
            ? undefined
            : new ScreenMousePosition(pixelX, pixelY);
        this.mouseActivity.dispatch(new ScreenMouseEvent(type, position, event.shiftKey));
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
}
