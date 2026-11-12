import {describe, expect, it} from "vitest";
import {decodeHiResScreen, HiResScreen, HiResScreenFormat, whyNotHiResScreen} from "./HiResScreen.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

const MODEL_4_SIZE = 19200;
const MODEL_III_SIZE = 12288;

/**
 * Decode a screen, failing the test if it isn't one.
 */
function decode(binary: Uint8Array, extension: string): HiResScreen {
    const screen = decodeHiResScreen(binary, extension);
    if (screen === undefined) {
        throw new Error("Not a screen: " + whyNotHiResScreen(binary, extension));
    }
    return screen;
}

/**
 * Compress a whole Model 4 screen as alternating runs: 127 copies of a byte, then a literal byte.
 */
function compress(bitmap: Uint8Array): Uint8Array {
    const out: number[] = [];
    let i = 0;
    while (i < bitmap.length) {
        const count = Math.min(127, bitmap.length - i);
        out.push(0x80 | count, bitmap[i]);
        i += count;
        if (i < bitmap.length) {
            out.push(1, bitmap[i]);
            i += 1;
        }
    }
    return new Uint8Array(out);
}

/**
 * A Model 4 screen with runs of the same byte, so that compress() keeps it exactly.
 */
function makeRunnyScreen(): Uint8Array {
    const bitmap = new Uint8Array(MODEL_4_SIZE);
    let i = 0;
    let value = 0;
    while (i < bitmap.length) {
        bitmap.fill(value, i, i + 127);
        i += 127;
        bitmap[i++] = 0x5A;
        value = (value + 0x11) & 0xFF;
    }
    return bitmap.subarray(0, MODEL_4_SIZE);
}

describe("HiResScreen", () => {
    it("decodes a Model 4 screen with the high bit on the left", () => {
        const binary = new Uint8Array(MODEL_4_SIZE);
        binary[0] = 0x80;                   // (0, 0)
        binary[80 + 1] = 0x40;              // (9, 1)
        binary[MODEL_4_SIZE - 1] = 0x01;    // (639, 239)
        const screen = decode(binary, ".HR");
        expect(screen.format).to.equal(HiResScreenFormat.MODEL_4);
        expect([screen.width, screen.height]).to.eql([640, 240]);
        expect(screen.isPixelLit(0, 0)).to.be.true;
        expect(screen.isPixelLit(1, 0)).to.be.false;
        expect(screen.isPixelLit(9, 1)).to.be.true;
        expect(screen.isPixelLit(8, 1)).to.be.false;
        expect(screen.isPixelLit(639, 239)).to.be.true;
        expect(screen.getDescription()).to.equal("Hi-res screen (Model 4, 640x240)");
        expect(decode(binary, ".HRG").format).to.equal(HiResScreenFormat.MODEL_4);
    });

    it("puts a Model III screen's scan lines in order", () => {
        // Fill each stored line with its own index.
        const binary = new Uint8Array(MODEL_III_SIZE);
        for (let stored = 0; stored < 192; stored++) {
            binary.fill(stored, stored*64, stored*64 + 64);
        }
        const screen = decode(binary, ".HRX");
        expect(screen.format).to.equal(HiResScreenFormat.MODEL_III);
        expect([screen.width, screen.height]).to.eql([512, 192]);
        // The file holds line 0 of each of the 16 character rows, then line 1 of each, and so on.
        const firstByteOfRow = (row: number) => screen.bitmap[row*64];
        expect(firstByteOfRow(0)).to.equal(0);
        expect(firstByteOfRow(1)).to.equal(16);
        expect(firstByteOfRow(11)).to.equal(176);
        expect(firstByteOfRow(12)).to.equal(1);
        expect(firstByteOfRow(13)).to.equal(17);
        expect(firstByteOfRow(191)).to.equal(191);
        // Every stored line is used exactly once.
        const used = new Set<number>();
        for (let row = 0; row < 192; row++) {
            used.add(firstByteOfRow(row));
        }
        expect(used.size).to.equal(192);
    });

    it("expands a compressed screen", () => {
        const bitmap = makeRunnyScreen();
        const screen = decode(compress(bitmap), ".CHR");
        expect(screen.format).to.equal(HiResScreenFormat.MODEL_4_COMPRESSED);
        expect(screen.bitmap).to.eql(bitmap);
        expect(decode(compress(bitmap), ".SHR").bitmap).to.eql(bitmap);
    });

    it("cuts off a last run that goes past the screen, and allows a little slack", () => {
        // 151 runs of 127 make 19,177 bytes, so the last run needs only 23 of its 30.
        const bitmap = new Uint8Array(MODEL_4_SIZE).fill(0xFF);
        const runs: number[] = [];
        for (let i = 0; i < 151; i++) {
            runs.push(0x80 | 127, 0xFF);
        }
        runs.push(0x80 | 30, 0xFF);
        const compressed = new Uint8Array(runs);
        expect(decode(compressed, ".SHR").bitmap).to.eql(bitmap);

        const withSlack = new Uint8Array(compressed.length + 512);
        withSlack.set(compressed);
        expect(decode(withSlack, ".SHR").bitmap).to.eql(bitmap);

        const tooMuchSlack = new Uint8Array(compressed.length + 513);
        tooMuchSlack.set(compressed);
        expect(whyNotHiResScreen(tooMuchSlack, ".SHR")).to.contain("513 bytes after the screen");
    });

    it("rejects compressed data that isn't a screen", () => {
        const compressed = compress(makeRunnyScreen());
        expect(whyNotHiResScreen(compressed.subarray(0, 100), ".CHR")).to.contain("ends after");
        const withEmptyRun = compressed.slice();
        withEmptyRun[4] = 0x80;
        expect(whyNotHiResScreen(withEmptyRun, ".CHR")).to.contain("empty run at byte 4");
        expect(whyNotHiResScreen(compressed, ".CHR")).to.be.undefined;
    });

    it("explains a file of the wrong size", () => {
        expect(decodeHiResScreen(new Uint8Array(1024), ".HR")).to.be.undefined;
        expect(whyNotHiResScreen(new Uint8Array(1024), ".HR")).to.equal("a hi-res screen in a .HR file is " +
            "19,200 bytes (Model 4) or 12,288 bytes (Model III), but this file is 1,024 bytes");
        // The extensions that name one model don't accept the other's size.
        expect(decodeHiResScreen(new Uint8Array(MODEL_III_SIZE), ".HRG")).to.be.undefined;
        expect(decodeHiResScreen(new Uint8Array(MODEL_4_SIZE), ".HRX")).to.be.undefined;
        expect(decodeHiResScreen(new Uint8Array(MODEL_4_SIZE), ".BIN")).to.be.undefined;
    });

    it("is recognized by decodeTrs80File only by extension", () => {
        const binary = new Uint8Array(MODEL_4_SIZE);
        expect(decodeTrs80File(binary, {filename: "PICTURE.HR"}).className).to.equal("HiResScreen");
        expect(decodeTrs80File(binary, {filename: "PICTURE.DAT"}).className).to.not.equal("HiResScreen");
        // A font named .HR is still decoded as whatever it is.
        expect(decodeTrs80File(new Uint8Array(1024), {filename: "FONT.HR"}).className).to.equal("RawBinaryFile");
    });
});
