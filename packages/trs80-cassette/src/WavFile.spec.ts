import {describe, it, expect} from "vitest";
import {readWavFile} from "./WavFile.js";

/**
 * Make a RIFF chunk: ID, size, data, and a padding byte if the size is odd. The declared size can be
 * overridden to simulate a truncated file (which has no padding).
 */
function chunk(id: string, data: number[], littleEndian: boolean, declaredSize = data.length): number[] {
    const bytes = [...id].map(c => c.charCodeAt(0));
    bytes.push(...uint32(declaredSize, littleEndian), ...data);
    if (data.length === declaredSize && data.length % 2 === 1) {
        bytes.push(0);
    }
    return bytes;
}

/**
 * Encode a 16-bit value.
 */
function uint16(n: number, littleEndian: boolean): number[] {
    const bytes = [n & 0xFF, (n >> 8) & 0xFF];
    return littleEndian ? bytes : bytes.reverse();
}

/**
 * Encode a 32-bit value.
 */
function uint32(n: number, littleEndian: boolean): number[] {
    const bytes = [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    return littleEndian ? bytes : bytes.reverse();
}

/**
 * Make a mono PCM "fmt " chunk.
 */
function fmtChunk(bitDepth: number, littleEndian: boolean): number[] {
    const blockAlign = bitDepth/8;
    return chunk("fmt ", [
        ...uint16(1, littleEndian), ...uint16(1, littleEndian), ...uint32(8000, littleEndian),
        ...uint32(8000*blockAlign, littleEndian), ...uint16(blockAlign, littleEndian),
        ...uint16(bitDepth, littleEndian)], littleEndian);
}

/**
 * Wrap chunks in a RIFF (or RIFX) header and parse the result.
 */
function makeAndRead(chunks: number[][], littleEndian = true) {
    const body = chunks.flat();
    const bytes = [...(littleEndian ? "RIFF" : "RIFX")].map(c => c.charCodeAt(0));
    bytes.push(...uint32(body.length + 4, littleEndian), 0x57, 0x41, 0x56, 0x45, ...body);
    return readWavFile(new Uint8Array(bytes));
}

describe("readWavFile", () => {
    it("reads 8-bit samples", () => {
        const wav = makeAndRead([fmtChunk(8, true), chunk("data", [128, 129, 127], true)]);
        expect(wav.rate).to.eql(8000);
        expect(Array.from(wav.samples)).to.eql([0, 255, -255]);
    });

    it("skips the padding byte after odd-sized chunks", () => {
        const wav = makeAndRead([
            fmtChunk(8, true),
            chunk("junk", [1, 2, 3], true),
            chunk("data", [128, 129], true)]);
        expect(Array.from(wav.samples)).to.eql([0, 255]);
    });

    it("skips the padding byte after an odd-sized LIST chunk", () => {
        const info = [..."INFOIART"].map(c => c.charCodeAt(0)).concat(uint32(1, true), [0x41]);
        const wav = makeAndRead([
            fmtChunk(8, true),
            chunk("LIST", info, true),
            chunk("data", [128, 129], true)]);
        expect(Array.from(wav.samples)).to.eql([0, 255]);
    });

    it("uses what's there of a truncated data chunk", () => {
        const wav = makeAndRead([fmtChunk(8, true), chunk("data", [128, 129, 130], true, 1000)]);
        expect(Array.from(wav.samples)).to.eql([0, 255, 510]);
    });

    it("drops a partial 16-bit sample at the end of a truncated data chunk", () => {
        const wav = makeAndRead([fmtChunk(16, true), chunk("data", [0x01, 0x02, 0xFF, 0xFF, 0x05], true, 1000)]);
        expect(Array.from(wav.samples)).to.eql([0x0201, -1]);
    });

    it("reads big-endian RIFX files", () => {
        const wav = makeAndRead([fmtChunk(16, false), chunk("data", [0x01, 0x02, 0xFF, 0xFE], false)], false);
        expect(wav.rate).to.eql(8000);
        expect(Array.from(wav.samples)).to.eql([0x0102, -2]);
    });
});
