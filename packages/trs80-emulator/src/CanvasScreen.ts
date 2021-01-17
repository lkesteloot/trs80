import {Trs80Screen} from "./Trs80Screen";
import {SCREEN_BEGIN, SCREEN_END} from "./Utils";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_ALT_FONT, MODEL3_FONT} from "./Fonts";
import {Background, CGChip, Config, ModelType, Phosphor, ScanLines} from "./Config";

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
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80Screen {
    private readonly scale: number = 1;
    private readonly padding: number;
    private readonly node: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly memory: Uint8Array = new Uint8Array(SCREEN_END - SCREEN_BEGIN);
    private readonly glyphs: HTMLCanvasElement[] = [];
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;

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
        this.canvas.width = 64*8*this.scale + 2*this.padding;
        this.canvas.height = 16*24*this.scale + 2*this.padding;
        this.node.append(this.canvas);

        this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;

        this.updateFromConfig();
    }

    setConfig(config: Config): void {
        this.config = config;
        this.updateFromConfig();
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
        const offset = address - SCREEN_BEGIN;
        this.memory[offset] = value;
        this.drawChar(offset, value);
    }

    /**
     * Get the background color as a CSS color based on the current config.
     */
    private getBackgroundColor(): string {
        switch (this.config.background) {
            case Background.BLACK:
                return BLACK_BACKGROUND;

            case Background.AUTHENTIC:
            default:
                return AUTHENTIC_BACKGROUND;
        }
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
        const width = this.canvas.width;
        const height = this.canvas.height;
        const radius = BORDER_RADIUS*this.scale;

        this.context.fillStyle = this.getBackgroundColor();
        this.context.beginPath();
        this.context.moveTo(radius, 0);
        this.context.arcTo(width, 0, width, radius, radius);
        this.context.arcTo(width, height, width - radius, height, radius);
        this.context.arcTo(0, height, 0, height - radius, radius);
        this.context.arcTo(0, 0, radius, 0, radius);
        this.context.fill();
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
     */
    public asImage(): HTMLImageElement {
        const image = document.createElement("img");
        // TODO use canvas.toBlob() instead, it might not block the UI thread.
        image.src = this.canvas.toDataURL();

        return image;
    }
}
