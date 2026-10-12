import {Config, DisplayType, ModelType, Trs80} from "trs80-emulator";
import {CanvasScreen, FlipCard, type ScreenFrame} from "trs80-emulator-web";

/**
 * A photo of a computer, with a transparent hole where the screen goes. The photos are
 * from GPC (https://github.com/FastDogJo/GPC, MIT license), converted to WebP. The
 * measurements are in image pixels, taken from the alpha channel: the hole is the
 * largest region with alpha < 128 that doesn't touch the image's edge.
 */
interface BezelPhoto {
    url: string;
    width: number;
    height: number;
    // Bounds of the hole. Right and bottom are exclusive.
    holeLeft: number;
    holeTop: number;
    holeRight: number;
    holeBottom: number;
    // Width of the widest 4:3 rectangle, centered in the hole, that's entirely inside it.
    maxTextWidth: number;
    // Centers of the drive LEDs, by drive number.
    leds: {x: number, y: number}[];
    ledDiameter: number;
    // Whether the photo shows the LEDs lit, so that we must draw them off.
    ledsLitInPhoto: boolean;
}

const MODEL1_PHOTO: BezelPhoto = {
    url: "/bezels/M1.webp",
    width: 1968,
    height: 1864,
    holeLeft: 306,
    holeTop: 99,
    holeRight: 1325,
    holeBottom: 917,
    maxTextWidth: 941,
    // The drives were in separate boxes.
    leds: [],
    ledDiameter: 0,
    ledsLitInPhoto: false,
};

const MODEL3_PHOTO: BezelPhoto = {
    url: "/bezels/M3.webp",
    width: 2198,
    height: 1605,
    holeLeft: 317,
    holeTop: 97,
    holeRight: 1258,
    holeBottom: 867,
    maxTextWidth: 865,
    // Drive 0 is the bottom one.
    leds: [{x: 1489, y: 822}, {x: 1496, y: 295}],
    ledDiameter: 19,
    ledsLitInPhoto: false,
};

const MODEL4_PHOTO: BezelPhoto = {
    url: "/bezels/M4.webp",
    width: 2150,
    height: 1644,
    holeLeft: 208,
    holeTop: 115,
    holeRight: 1292,
    holeBottom: 951,
    maxTextWidth: 973,
    // Drive 0 is the bottom one.
    leds: [{x: 1511, y: 875}, {x: 1518, y: 326}],
    ledDiameter: 24,
    ledsLitInPhoto: true,
};

// Width of the text area in TRS-80 CRT pixels (64 characters of 8 pixels). The CanvasScreen
// scale is the number of CSS pixels per CRT pixel.
const TEXT_CRT_WIDTH = 512;

// Size of the text area as a fraction of the photo's maxTextWidth, leaving a margin to the
// curved edge. The authentic display can be bigger because its curvature pulls the corners
// in. Both leave the text at least 3% of the hole's width from its edge, for every photo.
const SIMPLE_TEXT_FILL = 0.95;
const AUTHENTIC_TEXT_FILL = 1.02;

// Fraction of the available area that the photo can use.
const PHOTO_FILL = 0.95;

// Scale of the screen when there's no bezel.
const PLAIN_SCALE = 1.5;

// How long to wait after the last resize before re-making the screen at the new size.
const RESIZE_DELAY_MS = 150;

/**
 * Get the photo for this model.
 */
function photoForModel(modelType: ModelType): BezelPhoto {
    switch (modelType) {
        case ModelType.MODEL1:
            return MODEL1_PHOTO;

        case ModelType.MODEL3:
        default:
            return MODEL3_PHOTO;

        case ModelType.MODEL4:
            return MODEL4_PHOTO;
    }
}

/**
 * Whether the two frames are the same, including both being undefined.
 */
function framesEqual(a: ScreenFrame | undefined, b: ScreenFrame | undefined): boolean {
    return a === undefined || b === undefined
        ? a === b
        : a.width === b.width && a.height === b.height;
}

/**
 * An LED drawn on the photo.
 */
interface Led {
    node: HTMLElement;
    // Index into the photo's LEDs, which is also the drive number.
    drive: number;
    // Whether this shows the lit LED, rather than covering a lit one in the photo.
    on: boolean;
}

/**
 * Shows a photo of the computer around the emulator's screen, if the config asks
 * for it. The photo is centered in its container and resizes with it. The screen
 * is clipped to the hole in the photo, but the panels on it (settings, etc.) are
 * not, so they can extend over the photo.
 */
export class Bezel {
    // Contains the photo and the screen.
    public readonly node: HTMLElement;
    private readonly container: HTMLElement;
    private readonly screen: CanvasScreen;
    private readonly flipCardNode: HTMLElement;
    private readonly photoNode: HTMLImageElement;
    private leds: Led[] = [];
    private photo: BezelPhoto | undefined = undefined;
    private displayType: DisplayType | undefined = undefined;
    // Drive with the motor on, if any.
    private activeDrive: number | undefined = undefined;
    // What we last gave the screen.
    private appliedScale = 0;
    private appliedFrame: ScreenFrame | undefined = undefined;
    private resizeTimer: number | undefined = undefined;

    /**
     * @param container the node that we're centered in, and that limits our size.
     */
    constructor(container: HTMLElement, screen: CanvasScreen, flipCard: FlipCard, trs80: Trs80) {
        this.container = container;
        this.screen = screen;
        this.flipCardNode = flipCard.node;

        this.node = document.createElement("div");
        this.node.classList.add("bezel");

        this.photoNode = document.createElement("img");
        this.photoNode.classList.add("bezel-photo");
        this.photoNode.alt = "";
        this.photoNode.draggable = false;

        this.node.append(this.photoNode, this.flipCardNode);

        trs80.onConfig.subscribe(configChange => this.setConfig(configChange.newConfig));
        this.setConfig(trs80.getConfig());

        new ResizeObserver(() => this.layout(false)).observe(container);
    }

    /**
     * Set which drive (0-based) has its motor on, if any. Returns whether the bezel
     * shows it, so that the caller doesn't need to.
     */
    public setActiveDrive(drive: number | undefined): boolean {
        this.activeDrive = drive;
        this.updateLeds();
        return this.photo !== undefined && this.photo.leds.length > 0;
    }

    /**
     * Update from a new config, which might change whether we're shown, which photo, and
     * the size of the text.
     */
    private setConfig(config: Config): void {
        const photo = config.bezel ? photoForModel(config.modelType) : undefined;
        const displayTypeChanged = config.displayType !== this.displayType;
        this.displayType = config.displayType;
        if (photo === this.photo) {
            if (displayTypeChanged) {
                this.layout(true);
            }
            return;
        }
        this.photo = photo;

        this.node.classList.toggle("bezel-shown", photo !== undefined);
        this.flipCardNode.classList.toggle("bezel-screen", photo !== undefined);
        for (const led of this.leds) {
            led.node.remove();
        }
        this.leds = [];

        if (photo === undefined) {
            this.photoNode.removeAttribute("src");
            for (const property of ["width", "height"]) {
                this.node.style.removeProperty(property);
            }
            for (const property of ["left", "top", "--bezel-mask-image", "--bezel-mask-size", "--bezel-mask-position"]) {
                this.flipCardNode.style.removeProperty(property);
            }
        } else {
            this.photoNode.src = photo.url;
            this.flipCardNode.style.setProperty("--bezel-mask-image", `url("${photo.url}")`);

            for (let drive = 0; drive < photo.leds.length; drive++) {
                if (photo.ledsLitInPhoto) {
                    this.addLed(drive, false);
                }
                this.addLed(drive, true);
            }
            this.updateLeds();
        }

        this.layout(true);
    }

    /**
     * Add an LED node to the bezel.
     */
    private addLed(drive: number, on: boolean): void {
        const node = document.createElement("div");
        node.classList.add("bezel-led", on ? "bezel-led-on" : "bezel-led-off");
        this.node.append(node);
        this.leds.push({node, drive, on});
    }

    /**
     * Light the LED of the active drive.
     */
    private updateLeds(): void {
        for (const led of this.leds) {
            if (led.on) {
                led.node.classList.toggle("bezel-led-lit", led.drive === this.activeDrive);
            }
        }
    }

    /**
     * Size and position everything for the container's size.
     *
     * @param now whether to re-make the screen immediately, rather than after resizing settles.
     */
    private layout(now: boolean): void {
        const photo = this.photo;
        if (photo === undefined) {
            this.setScreenScale(PLAIN_SCALE, undefined, now);
            return;
        }

        const availableWidth = this.container.clientWidth*PHOTO_FILL;
        const availableHeight = this.container.clientHeight*PHOTO_FILL;
        if (availableWidth <= 0 || availableHeight <= 0) {
            return;
        }

        // CSS pixels per image pixel.
        const k = Math.min(availableWidth/photo.width, availableHeight/photo.height);

        this.node.style.width = photo.width*k + "px";
        this.node.style.height = photo.height*k + "px";
        this.flipCardNode.style.left = photo.holeLeft*k + "px";
        this.flipCardNode.style.top = photo.holeTop*k + "px";

        const ledDiameter = photo.ledDiameter*k;
        for (const led of this.leds) {
            const {x, y} = photo.leds[led.drive];
            led.node.style.left = x*k - ledDiameter/2 + "px";
            led.node.style.top = y*k - ledDiameter/2 + "px";
            led.node.style.width = ledDiameter + "px";
            led.node.style.height = ledDiameter + "px";
        }

        const textFill = this.displayType === DisplayType.AUTHENTIC ? AUTHENTIC_TEXT_FILL : SIMPLE_TEXT_FILL;
        const scale = photo.maxTextWidth*textFill*k/TEXT_CRT_WIDTH;
        const frame: ScreenFrame = {
            width: (photo.holeRight - photo.holeLeft)*k,
            height: (photo.holeBottom - photo.holeTop)*k,
        };
        this.setScreenScale(scale, frame, now, k);
    }

    /**
     * Set the screen's scale and frame. Re-making the screen is slow, so while the
     * window is being resized, stretch the old one and re-make it when resizing stops.
     *
     * @param k CSS pixels per image pixel, if a photo is shown.
     */
    private setScreenScale(scale: number, frame: ScreenFrame | undefined, now: boolean, k?: number): void {
        if (this.resizeTimer !== undefined) {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = undefined;
        }

        const apply = () => {
            this.flipCardNode.style.removeProperty("transform");
            const photo = this.photo;
            if (photo !== undefined && k !== undefined) {
                // Line up the photo's alpha (the mask) with the screen.
                this.flipCardNode.style.setProperty("--bezel-mask-size",
                    `${photo.width*k}px ${photo.height*k}px`);
                this.flipCardNode.style.setProperty("--bezel-mask-position",
                    `${-photo.holeLeft*k}px ${-photo.holeTop*k}px`);
            }
            if (scale !== this.appliedScale || !framesEqual(frame, this.appliedFrame)) {
                this.appliedScale = scale;
                this.appliedFrame = frame;
                this.screen.setScale(scale, frame);
            }
        };

        const oldFrame = this.appliedFrame;
        if (now || frame === undefined || oldFrame === undefined) {
            apply();
        } else {
            // Stretch the existing screen until we re-make it.
            this.flipCardNode.style.transformOrigin = "0 0";
            this.flipCardNode.style.transform =
                `scale(${frame.width/oldFrame.width}, ${frame.height/oldFrame.height})`;
            this.resizeTimer = window.setTimeout(apply, RESIZE_DELAY_MS);
        }
    }
}
