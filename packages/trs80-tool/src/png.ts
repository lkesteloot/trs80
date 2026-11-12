import * as zlib from "zlib";

// Every PNG file starts with these bytes.
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// IHDR values for a one-bit grayscale image.
const BIT_DEPTH = 1;
const COLOR_TYPE_GRAYSCALE = 0;

// The filter byte before each row: "None", since the rows are already one bit per pixel.
const FILTER_NONE = 0;

/**
 * Make a PNG chunk: its length, type, data, and CRC.
 */
function makeChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
        chunk[4 + i] = type.charCodeAt(i);
    }
    chunk.set(data, 8);
    // The CRC covers the type and the data.
    view.setUint32(8 + data.length, zlib.crc32(chunk.subarray(4, 8 + data.length)));
    return chunk;
}

/**
 * Encode a black-and-white bitmap as a PNG, one bit per pixel, with 1 bits white.
 *
 * @param width the bitmap's width in pixels, a multiple of 8.
 * @param height the bitmap's height in pixels.
 * @param bitmap the rows from the top, width/8 bytes each, with the leftmost pixel in the high bit.
 * @param rowCopies how many times to write each row, to make pixels that are taller than they are wide.
 * The PNG is this many times the bitmap's height.
 * @return the PNG file's bytes.
 */
export function encodeBlackAndWhitePng(width: number, height: number, bitmap: Uint8Array,
                                       rowCopies = 1): Uint8Array {
    const bytesPerRow = width/8;
    if (!Number.isInteger(bytesPerRow) || bitmap.length !== bytesPerRow*height) {
        throw new Error(`Bitmap of ${bitmap.length} bytes doesn't fit ${width}x${height}`);
    }

    const header = new Uint8Array(13);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, width);
    const pngHeight = height*rowCopies;
    headerView.setUint32(4, pngHeight);
    header[8] = BIT_DEPTH;
    header[9] = COLOR_TYPE_GRAYSCALE;
    // Compression, filter method, and interlace are all 0 (the only or the default choice).

    const raw = new Uint8Array((bytesPerRow + 1)*pngHeight);
    for (let y = 0; y < pngHeight; y++) {
        const offset = y*(bytesPerRow + 1);
        const bitmapRow = Math.floor(y/rowCopies);
        raw[offset] = FILTER_NONE;
        raw.set(bitmap.subarray(bitmapRow*bytesPerRow, (bitmapRow + 1)*bytesPerRow), offset + 1);
    }

    const chunks = [
        PNG_SIGNATURE,
        makeChunk("IHDR", header),
        makeChunk("IDAT", zlib.deflateSync(raw)),
        makeChunk("IEND", new Uint8Array(0)),
    ];
    return Buffer.concat(chunks);
}
