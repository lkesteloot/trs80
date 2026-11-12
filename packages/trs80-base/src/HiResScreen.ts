import {assertNever} from "z80-base";
import {AbstractTrs80File} from "./Trs80File.js";

// The Model 4's hi-res screen, and the size of a raw dump of it (one bit per pixel).
const MODEL_4_WIDTH = 640;
const MODEL_4_HEIGHT = 240;
const MODEL_4_SIZE = MODEL_4_WIDTH*MODEL_4_HEIGHT/8;

// The Model III's hi-res screen, and the size of a raw dump of it.
const MODEL_III_WIDTH = 512;
const MODEL_III_HEIGHT = 192;
const MODEL_III_SIZE = MODEL_III_WIDTH*MODEL_III_HEIGHT/8;

// The Model III's screen is 16 rows of characters, each 12 scan lines tall, and its dumps store
// the screen's scan lines in that order. See HIRES_FORMATS.md.
const MODEL_III_CHARACTER_ROWS = 16;
const MODEL_III_LINES_PER_CHARACTER = 12;

// The most bytes that may follow a compressed screen's last run. Some files have a few hundred
// (see HIRES_FORMATS.md). Without a limit, any long file that started with plausible runs would
// pass as a screen.
const MAX_COMPRESSED_SLACK = 512;

/**
 * The kinds of hi-res screen dump file.
 */
export enum HiResScreenFormat {
    /** The Model 4's 640×240 screen, one bit per pixel, as .HR or .HRG. */
    MODEL_4,
    /** The Model III's 512×192 screen, one bit per pixel, as .HR or .HRX. */
    MODEL_III,
    /** The Model 4's screen, run-length encoded, as .CHR or .SHR. */
    MODEL_4_COMPRESSED,
}

/**
 * How to show a hi-res screen format to the user.
 */
export function hiResScreenFormatToString(format: HiResScreenFormat): string {
    switch (format) {
        case HiResScreenFormat.MODEL_4:
            return "Model 4";
        case HiResScreenFormat.MODEL_III:
            return "Model III";
        case HiResScreenFormat.MODEL_4_COMPRESSED:
            return "Model 4, compressed";
        default:
            assertNever(format);
    }
}

/**
 * A dump of a hi-res graphics board's screen.
 */
export class HiResScreen extends AbstractTrs80File {
    public readonly className = "HiResScreen";

    /**
     * @param binary the file's bytes.
     * @param format which kind of dump the file is.
     * @param width the screen's width in pixels, a multiple of 8.
     * @param height the screen's height in pixels.
     * @param bitmap the screen's pixels, row by row from the top, width/8 bytes per row, with the
     * leftmost pixel in each byte's high bit. A 1 bit is a lit pixel.
     */
    constructor(binary: Uint8Array,
                public readonly format: HiResScreenFormat,
                public readonly width: number,
                public readonly height: number,
                public readonly bitmap: Uint8Array) {

        super(binary, undefined, []);
    }

    /**
     * Says the format and the size.
     */
    public getDescription(): string {
        return "Hi-res screen (" + hiResScreenFormatToString(this.format) + ", " +
            this.width + "x" + this.height + ")";
    }

    /**
     * The number of bytes in each row of the bitmap.
     */
    public get bytesPerRow(): number {
        return this.width/8;
    }

    /**
     * Whether the pixel at (x, y) is lit, with (0, 0) at the top left.
     */
    public isPixelLit(x: number, y: number): boolean {
        const byte = this.bitmap[y*this.bytesPerRow + Math.floor(x/8)];
        return (byte & (0x80 >> (x % 8))) !== 0;
    }
}

/**
 * The extensions that hi-res screen files have, in upper case with their dot.
 */
const HI_RES_SCREEN_EXTENSIONS = new Set([".HR", ".HRG", ".HRX", ".CHR", ".SHR"]);

/**
 * Whether a file with this extension might be a hi-res screen.
 *
 * @param extension the extension, in upper case, with its dot.
 */
export function isHiResScreenExtension(extension: string): boolean {
    return HI_RES_SCREEN_EXTENSIONS.has(extension);
}

/**
 * Put a Model III dump's scan lines in order from top to bottom.
 */
function unscrambleModelIII(binary: Uint8Array): Uint8Array {
    const bytesPerRow = MODEL_III_WIDTH/8;
    const bitmap = new Uint8Array(MODEL_III_SIZE);
    for (let row = 0; row < MODEL_III_HEIGHT; row++) {
        const characterRow = Math.floor(row/MODEL_III_LINES_PER_CHARACTER);
        const line = row % MODEL_III_LINES_PER_CHARACTER;
        const source = (line*MODEL_III_CHARACTER_ROWS + characterRow)*bytesPerRow;
        bitmap.set(binary.subarray(source, source + bytesPerRow), row*bytesPerRow);
    }
    return bitmap;
}

/**
 * Expand a compressed (CHR or SHR) dump of the Model 4 screen. Each run starts with a control byte
 * whose low 7 bits are a count. If its high bit is set, the next byte is repeated that many times;
 * if not, that many bytes follow, to be copied. Expanding stops once the screen is full, cutting
 * short a run that goes past it. Some files do that, and some have slack after the last run.
 * See HIRES_FORMATS.md.
 *
 * @return the screen, or a sentence fragment saying why the data isn't one. Real files never have
 * a run of zero bytes, and run all the way to the end of the screen.
 */
function expandCompressed(binary: Uint8Array): Uint8Array | string {
    const bitmap = new Uint8Array(MODEL_4_SIZE);
    let i = 0;
    let j = 0;
    while (j < bitmap.length) {
        if (i >= binary.length) {
            return "it ends after " + j.toLocaleString() + " of the screen's " +
                MODEL_4_SIZE.toLocaleString() + " bytes";
        }
        const control = binary[i++];
        const count = control & 0x7F;
        const repeat = (control & 0x80) !== 0;
        const inputSize = repeat ? 1 : count;
        if (count === 0) {
            return "it has an empty run at byte " + (i - 1).toLocaleString();
        }
        if (i + inputSize > binary.length) {
            return "its last run is cut off";
        }
        const outputSize = Math.min(count, bitmap.length - j);
        if (repeat) {
            bitmap.fill(binary[i], j, j + outputSize);
        } else {
            bitmap.set(binary.subarray(i, i + outputSize), j);
        }
        i += inputSize;
        j += outputSize;
    }
    const slack = binary.length - i;
    if (slack > MAX_COMPRESSED_SLACK) {
        return "it has " + slack.toLocaleString() + " bytes after the screen, more than the " +
            MAX_COMPRESSED_SLACK + " allowed";
    }
    return bitmap;
}

/**
 * Decode a hi-res screen, or say why the file isn't one.
 *
 * @param binary the file's bytes.
 * @param extension the file's extension, in upper case, with its dot.
 * @return the screen, or a sentence fragment saying why it isn't one (for "Can't convert X: ...").
 */
function decodeOrExplain(binary: Uint8Array, extension: string): HiResScreen | string {
    switch (extension) {
        case ".HR":
        case ".HRG":
        case ".HRX": {
            if (binary.length === MODEL_4_SIZE && extension !== ".HRX") {
                return new HiResScreen(binary, HiResScreenFormat.MODEL_4, MODEL_4_WIDTH, MODEL_4_HEIGHT,
                    binary.slice());
            }
            if (binary.length === MODEL_III_SIZE && extension !== ".HRG") {
                return new HiResScreen(binary, HiResScreenFormat.MODEL_III, MODEL_III_WIDTH, MODEL_III_HEIGHT,
                    unscrambleModelIII(binary));
            }
            const sizes = extension === ".HRG" ? MODEL_4_SIZE.toLocaleString() + " bytes (Model 4)"
                : extension === ".HRX" ? MODEL_III_SIZE.toLocaleString() + " bytes (Model III)"
                : MODEL_4_SIZE.toLocaleString() + " bytes (Model 4) or " +
                    MODEL_III_SIZE.toLocaleString() + " bytes (Model III)";
            return "a hi-res screen in a " + extension + " file is " + sizes + ", but this file is " +
                binary.length.toLocaleString() + " bytes";
        }

        case ".CHR":
        case ".SHR": {
            const bitmap = expandCompressed(binary);
            if (typeof bitmap === "string") {
                return "it isn't a compressed hi-res screen: " + bitmap;
            }
            return new HiResScreen(binary, HiResScreenFormat.MODEL_4_COMPRESSED, MODEL_4_WIDTH, MODEL_4_HEIGHT,
                bitmap);
        }

        default:
            return "hi-res screens are .HR, .HRG, .HRX, .CHR, or .SHR files";
    }
}

/**
 * Decode a hi-res screen dump. These files have no header, so they're recognized only by their
 * extension and size (or, if compressed, by expanding to exactly one screen).
 *
 * @param binary the file's bytes.
 * @param extension the file's extension, in upper case, with its dot.
 * @return the screen, or undefined if the file isn't one.
 */
export function decodeHiResScreen(binary: Uint8Array, extension: string): HiResScreen | undefined {
    const result = decodeOrExplain(binary, extension);
    return typeof result === "string" ? undefined : result;
}

/**
 * Say why a file isn't a hi-res screen, for an error message.
 *
 * @param binary the file's bytes.
 * @param extension the file's extension, in upper case, with its dot.
 * @return a sentence fragment, or undefined if the file is a hi-res screen after all.
 */
export function whyNotHiResScreen(binary: Uint8Array, extension: string): string | undefined {
    const result = decodeOrExplain(binary, extension);
    return typeof result === "string" ? result : undefined;
}
