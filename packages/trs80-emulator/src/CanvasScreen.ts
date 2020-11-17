import {Trs80Screen} from "./Trs80Screen";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN} from "./Utils";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_FONT} from "./Fonts";
import {CGChip, Config, ModelType, Phosphor} from "./Config";

const cssPrefix = CSS_PREFIX + "-canvas-screen";

const BASE_CSS = `

.${cssPrefix} {
    display: inline-block;
    padding: 10px;
    background-color: #334843;
    border-radius: 8px;
}

`;

/**
 * Make a global stylesheet for all TRS-80 emulators on this page. Idempotent.
 */
export function configureStylesheet(): void {
    const styleId = cssPrefix;
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
    private readonly narrowCanvas: HTMLCanvasElement;
    private readonly expandedCanvas: HTMLCanvasElement;
    private readonly narrowContext: CanvasRenderingContext2D;
    private readonly expandedContext: CanvasRenderingContext2D;
    private readonly thumbnailImage: HTMLImageElement | undefined;
    private readonly narrowGlyphs: HTMLCanvasElement[] = [];
    private readonly expandedGlyphs: HTMLCanvasElement[] = [];
    private glyphWidth = 0;
    private updateThumbnailTimeout: number | undefined;

    constructor(parentNode: HTMLElement, isThumbnail: boolean) {
        super();

        clearElement(parentNode);

        // Make our own sub-node that we have control over.
        this.node = document.createElement("div");
        this.node.classList.add(cssPrefix);
        parentNode.appendChild(this.node);

        this.narrowCanvas = document.createElement("canvas");
        this.narrowCanvas.width = 64*8;
        this.narrowCanvas.height = 16*24;
        this.narrowCanvas.style.display = "block";
        this.narrowContext = this.narrowCanvas.getContext("2d") as CanvasRenderingContext2D;
        if (!isThumbnail) {
            this.node.appendChild(this.narrowCanvas);
        }

        this.expandedCanvas = document.createElement("canvas");
        this.expandedCanvas.width = 64*8;
        this.expandedCanvas.height = 16*24;
        this.expandedCanvas.style.display = "none";
        this.expandedContext = this.expandedCanvas.getContext("2d") as CanvasRenderingContext2D;
        if (!isThumbnail) {
            this.node.appendChild(this.expandedCanvas);
        }

        if (isThumbnail) {
            this.thumbnailImage = document.createElement("img");
            this.thumbnailImage.width = 64*8/3;
            this.thumbnailImage.height = 16*24/3;
            this.node.appendChild(this.thumbnailImage);
        }

        this.setConfig(Config.makeDefault(), new Uint8Array(0));

        // Make global CSS if necessary.
        configureStylesheet();
    }

    setConfig(config: Config, values: Uint8Array): void {
        let color;
        switch (config.phosphor) {
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
        switch (config.cgChip) {
            case CGChip.ORIGINAL:
                font = MODEL1A_FONT;
                break;
            case CGChip.LOWER_CASE:
            default:
                switch (config.modelType) {
                    case ModelType.MODEL1:
                        font = MODEL1B_FONT;
                        break;
                    case ModelType.MODEL3:
                    default:
                        font = MODEL3_FONT;
                        break;
                }
                break;
        }

        const glyphOptions: GlyphOptions = {
            color: color,
            scanlines: false,
        };

        this.narrowGlyphs.splice(0, this.narrowGlyphs.length);
        this.expandedGlyphs.splice(0, this.expandedGlyphs.length);
        for (let i = 0; i < 256; i++) {
            this.narrowGlyphs.push(font.makeImage(i, false, glyphOptions));
            this.expandedGlyphs.push(font.makeImage(i, true, glyphOptions));
        }
        this.glyphWidth = font.width;

        // Refresh screen.
        for (let i = 0; i < values.length; i++) {
            this.writeChar(SCREEN_BEGIN + i, values[i]);
        }
    }

    writeChar(address: number, value: number): void {
        const offset = address - SCREEN_BEGIN;
        const screenX = (offset % 64)*8;
        const screenY = Math.floor(offset / 64)*24;
        this.narrowContext.clearRect(screenX, screenY, 8, 24);
        this.narrowContext.drawImage(this.narrowGlyphs[value], 0, 0, this.glyphWidth, 24, screenX, screenY, 8, 24);

        if (offset % 2 === 0) {
            this.expandedContext.clearRect(screenX, screenY, 16, 24);
            this.expandedContext.drawImage(this.expandedGlyphs[value], 0, 0, this.glyphWidth*2, 24, screenX, screenY, 16, 24);
        }

        this.scheduleUpdateThumbnail();
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
        super.setExpandedCharacters(expanded);
        this.narrowCanvas.style.display = expanded ? "none" : "block";
        this.expandedCanvas.style.display = !expanded ? "none" : "block";
        this.scheduleUpdateThumbnail();
    }

    /**
     * Schedule a future update of our thumbnail.
     */
    private scheduleUpdateThumbnail(): void {
        this.cancelUpdateThumbnail();
        this.updateThumbnailTimeout = window.setTimeout(() => this.updateThumbnail(), UPDATE_THUMBNAIL_TIMEOUT_MS);
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
            const canvas = this.isExpandedCharacters() ? this.expandedCanvas : this.narrowCanvas;
            this.thumbnailImage.src = canvas.toDataURL();
        }
    }
}
