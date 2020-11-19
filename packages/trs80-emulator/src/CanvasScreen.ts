import {Trs80Screen} from "./Trs80Screen";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN, SCREEN_END} from "./Utils";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_ALT_FONT, MODEL3_FONT} from "./Fonts";
import {Background, CGChip, Config, ModelType, Phosphor, ScanLines} from "./Config";

const gCssPrefix = CSS_PREFIX + "-canvas-screen";
const gBlackBackgroundClass = gCssPrefix + "-black-background";

const BASE_CSS = `

.${gCssPrefix} {
    display: inline-block;
    padding: 10px;
    background-color: #334843;
    border-radius: 8px;
    transition: background-color .5s ease-in-out;
}

.${gCssPrefix}.${gBlackBackgroundClass} {
    background-color: black;
}

`;

/**
 * Make a global stylesheet for all TRS-80 emulators on this page. Idempotent.
 */
export function configureStylesheet(): void {
    const styleId = gCssPrefix;
    if (document.getElementById(styleId) !== null) {
        // Already created.
        return;
    }

    const node = document.createElement("style");
    node.id = styleId;
    node.innerHTML = BASE_CSS;
    document.head.appendChild(node);
}

// Run it on the next event cycle.
const UPDATE_THUMBNAIL_TIMEOUT_MS = 0;

const WHITE_PHOSPHOR = [230, 231, 252];
const AMBER_PHOSPHOR = [247, 190, 64];
const GREEN_PHOSPHOR = [122, 244, 96];

/**
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80Screen {
    private readonly node: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly thumbnailImage: HTMLImageElement | undefined;
    private readonly memory: Uint8Array = new Uint8Array(SCREEN_END - SCREEN_BEGIN);
    private readonly glyphs: HTMLCanvasElement[] = [];
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;
    private updateThumbnailTimeout: number | undefined;

    constructor(parentNode: HTMLElement, isThumbnail: boolean) {
        super();

        clearElement(parentNode);

        // Make our own sub-node that we have control over.
        this.node = document.createElement("div");
        this.node.classList.add(gCssPrefix);
        parentNode.appendChild(this.node);

        this.canvas = document.createElement("canvas");
        this.canvas.width = 64*8;
        this.canvas.height = 16*24;
        this.canvas.style.display = "block";
        this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        if (!isThumbnail) {
            this.node.appendChild(this.canvas);
        }

        if (isThumbnail) {
            this.thumbnailImage = document.createElement("img");
            this.thumbnailImage.width = 64*8/3;
            this.thumbnailImage.height = 16*24/3;
            this.node.appendChild(this.thumbnailImage);
        }

        this.updateFromConfig();

        // Make global CSS if necessary.
        configureStylesheet();
    }

    setConfig(config: Config): void {
        this.config = config;
        this.updateFromConfig();
    }

    /**
     * Update the font and screen from the config and other state.
     */
    private updateFromConfig(): void {
        let color;
        switch (this.config.phosphor) {
            case Phosphor.WHITE:
            default:
                color = WHITE_PHOSPHOR;
                break;
            case Phosphor.GREEN:
                color = GREEN_PHOSPHOR;
                break;
            case Phosphor.AMBER:
                color = AMBER_PHOSPHOR;
                break;
        }

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

        switch (this.config.background) {
            case Background.BLACK:
                this.node.classList.add(gBlackBackgroundClass);
                break;

            case Background.AUTHENTIC:
            default:
                this.node.classList.remove(gBlackBackgroundClass);
                break;
        }

        const glyphOptions: GlyphOptions = {
            color: color,
            scanLines: this.config.scanLines === ScanLines.ON,
        };
        for (let i = 0; i < 256; i++) {
            this.glyphs[i] = font.makeImage(i, this.isExpandedCharacters(), glyphOptions);
        }
        this.glyphWidth = font.width;

        this.refresh();
    }

    writeChar(address: number, value: number): void {
        const offset = address - SCREEN_BEGIN;
        this.memory[offset] = value;
        this.drawChar(offset, value);
        this.scheduleUpdateThumbnail();
    }

    /**
     * Draw a single character to the canvas.
     */
    private drawChar(offset: number, value: number): void {
        const screenX = (offset % 64)*8;
        const screenY = Math.floor(offset / 64)*24;

        if (this.isExpandedCharacters()) {
            if (offset % 2 === 0) {
                this.context.clearRect(screenX, screenY, 16, 24);
                this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth * 2, 24, screenX, screenY, 16, 24);
            }
        } else {
            this.context.clearRect(screenX, screenY, 8, 24);
            this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth, 24, screenX, screenY, 8, 24);
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
     * Refresh the display based on what we've kept track of.
     */
    private refresh(): void {
        for (let offset = 0; offset < this.memory.length; offset++) {
            this.drawChar(offset, this.memory[offset]);
        }
        this.scheduleUpdateThumbnail();
    }

    /**
     * Schedule a future update of our thumbnail.
     */
    private scheduleUpdateThumbnail(): void {
        this.cancelUpdateThumbnail();
        this.updateThumbnailTimeout = window.setTimeout(() => {
            this.updateThumbnailTimeout = undefined;
            this.updateThumbnail();
        }, UPDATE_THUMBNAIL_TIMEOUT_MS);
    }

    /**
     * Cancel any previously-cancelled scheduled thumbnail update.
     */
    private cancelUpdateThumbnail(): void {
        if (this.updateThumbnailTimeout !== undefined) {
            window.clearTimeout(this.updateThumbnailTimeout);
            this.updateThumbnailTimeout = undefined;
        }
    }

    /**
     * Synchronously update the thumbnail.
     */
    private updateThumbnail(): void {
        if (this.thumbnailImage !== undefined) {
            this.thumbnailImage.src = this.canvas.toDataURL();
        }
    }
}
