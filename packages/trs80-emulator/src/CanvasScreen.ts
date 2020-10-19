import {Trs80Screen} from "./Trs80Screen";
import {configureStylesheet, FONT_IMAGE} from "./Stylesheet";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN} from "./Utils";

const cssPrefix = CSS_PREFIX + "-canvas-screen";

// Run it on the next event cycle.
const UPDATE_THUMBNAIL_TIMEOUT_MS = 0;

/**
 * Record a character that was supposed to be written to the screen, but was delayed.
 */
class WrittenCharacter {
    public readonly address: number;
    public readonly value: number;

    constructor(address: number, value: number) {
        this.address = address;
        this.value = value;
    }
}

/**
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80Screen {
    private readonly node: HTMLElement;
    private readonly narrowCanvas: HTMLCanvasElement;
    private readonly expandedCanvas: HTMLCanvasElement;
    private readonly narrowContext: CanvasRenderingContext2D;
    private readonly expandedContext: CanvasRenderingContext2D;
    private readonly fontImage: HTMLImageElement;
    private readonly thumbnailImage: HTMLImageElement | undefined;
    private updateThumbnailTimeout: number | undefined;
    private fontImageLoaded = false;
    private readonly writeQueue: WrittenCharacter[] = [];

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

        // Image that stores original font.
        this.fontImage = document.createElement("img");
        this.fontImage.src = FONT_IMAGE;
        this.fontImage.onload = () => {
            // Once the font image loads, we can write the characters we couldn't write before.
            this.fontImageLoaded = true;
            for (const writeChar of this.writeQueue) {
                this.writeChar(writeChar.address, writeChar.value);
            }
            this.writeQueue.splice(0, this.writeQueue.length);
        };

        if (isThumbnail) {
            this.thumbnailImage = document.createElement("img");
            this.thumbnailImage.width = 64*8/3;
            this.thumbnailImage.height = 16*24/3;
            this.node.appendChild(this.thumbnailImage);
        }

        // Make global CSS if necessary.
        configureStylesheet();
    }

    writeChar(address: number, value: number): void {
        if (!this.fontImageLoaded) {
            // Can't write anything until the font image loads. Record what we were supposed to do.
            this.writeQueue.push(new WrittenCharacter(address, value));
            return;
        }

        const offset = address - SCREEN_BEGIN;
        const imageX = (value % 32)*8;
        const imageY = Math.floor(value / 32)*24;
        const screenX = (offset % 64)*8;
        const screenY = Math.floor(offset / 64)*24;
        this.narrowContext.drawImage(this.fontImage, imageX, imageY, 8, 24, screenX, screenY, 8, 24);

        if (offset % 2 === 0) {
            const imageX = (value % 32)*16;
            const imageY = Math.floor(value / 32 + 10)*24;
            this.expandedContext.drawImage(this.fontImage, imageX, imageY, 16, 24, screenX, screenY, 16, 24);
        }

        this.scheduleUpdateThumbnail();
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
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
