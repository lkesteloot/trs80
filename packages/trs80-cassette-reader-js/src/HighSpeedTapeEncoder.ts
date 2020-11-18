
import {concatAudio} from "./AudioUtils";
import {concatByteArrays} from "./Utils";

const SYNC_BYTE = 0x7F;

/**
 * Generate one cycle of a sine wave.
 * @param length number of samples in the full cycle.
 * @return audio samples for one cycle.
 */
function generateCycle(length: number): Int16Array {
    const audio = new Int16Array(length);

    for (let i = 0; i < length; i++) {
        const t = 2*Math.PI*i/length;

        // -0.5 to 0.5, matches recorded audio.
        audio[i] = Math.sin(t)*16384;
    }

    return audio;
}

/**
 * Generate a half cycle that fades off to zero instead of coming down hard to zero.
 *
 * @param length number of samples to generate.
 * @param previousBit the previous cycle, so we copy the ending slope.
 */
function generateFinalHalfCycle(length: number, previousBit: Int16Array): Int16Array {
    // Copy the slope of the end of the zero bit.
    const slope = previousBit[previousBit.length - 1] - previousBit[previousBit.length - 2];

    // Points on the Bezier.
    const x1 = 0;
    const y1 = 0;
    const y2 = 32767;
    const x2 = (y2 - y1 + x1*slope)/slope;
    const x3 = length/2;
    const y3 = 0;
    const x4 = length - 1;
    const y4 = 0;

    // Generated audio;
    const audio = new Int16Array(length);

    // Go through Bezier in small steps.
    let position = 0;
    for (let i = 0; i <= 128; i++) {
        const t = i/128.0;

        // Compute Bezier value.
        const x12 = x1 + (x2 - x1)*t;
        const y12 = y1 + (y2 - y1)*t;
        const x23 = x2 + (x3 - x2)*t;
        const y23 = y2 + (y3 - y2)*t;
        const x34 = x3 + (x4 - x3)*t;
        const y34 = y3 + (y4 - y3)*t;

        const x123 = x12 + (x23 - x12)*t;
        const y123 = y12 + (y23 - y12)*t;
        const x234 = x23 + (x34 - x23)*t;
        const y234 = y23 + (y34 - y23)*t;

        const x1234 = x123 + (x234 - x123)*t;
        const y1234 = y123 + (y234 - y123)*t;

        // Draw a crude horizontal line from the previous point.
        const newPosition = Math.min(Math.floor(x1234), length - 1);
        while (position <= newPosition) {
            audio[position] = y1234;
            position += 1;
        }
    }

    // Finish up anything left.
    while (position <= length - 1) {
        audio[position] = 0;
        position += 1;
    }

    return audio;
}

/**
 * Adds the byte "b" to the samples list, most significant bit first.
 * @param samplesList list of samples we're adding to.
 * @param b byte to generate.
 * @param zero samples for a zero bit.
 * @param one samples for a one bit.
 */
function addByte(samplesList: Int16Array[], b: number, zero: Int16Array, one: Int16Array) {
    // MSb first.
    for (let i = 7; i >= 0; i--) {
        if ((b & (1 << i)) != 0) {
            samplesList.push(one);
        } else {
            samplesList.push(zero);
        }
    }
}

/**
 * Adds the header bytes necessary for writing high-speed cassettes.
 */
export function wrapHighSpeed(bytes: Uint8Array): Uint8Array {
    // Add tape header.
    const buffers = [
        new Uint8Array(256).fill(0x55),
        new Uint8Array([SYNC_BYTE]),
        bytes,
    ];
    return concatByteArrays(buffers);
}

/**
 * High-speed CAS files have start bits built-in. Strip these out because
 * we re-insert them below when encoding. We could also remove the
 * writing of start bits below, but we don't really know how many bits
 * there are at the end that we shouldn't write.
 */
export function stripStartBits(inBytes: Uint8Array): Uint8Array {
    // Find sync byte.
    let headerSize: number | undefined = undefined;
    for (let i = 0; i < inBytes.length; i++) {
        if (inBytes[i] === SYNC_BYTE) {
            headerSize = i + 1;
            break;
        }
    }
    if (headerSize === undefined) {
        console.log("Can't find sync byte in high-speed CAS file");
        return inBytes;
    }

    // Compute new size of array.
    const outBytes = new Uint8Array(Math.floor(headerSize + (inBytes.length - headerSize)*8/9));

    // First bytes, up to and including sync byte, don't have a start bit.
    outBytes.set(inBytes.slice(0, headerSize));

    // Strip start bit from the rest.
    for (let i = headerSize; i < outBytes.length; i++) {
        // Index of most-significant data bit.
        const bitIndex =  headerSize*8 + (i - headerSize)*9 + 1;
        const byteIndex = Math.floor(bitIndex/8);
        const bitOffset = bitIndex%8;

        let value = inBytes[byteIndex] << bitOffset;
        if (bitOffset !== 0) {
            value |= inBytes[byteIndex + 1] >> (8 - bitOffset);
        }
        outBytes[i] = value;
    }

    return outBytes;
}

/**
 * Encode the sequence of bytes as an array of audio samples for high-speed (1500 baud) cassettes.
 * @param bytes cas-style array of bytes, including 256 0x55 bytes and sync byte.
 * @param sampleRate number of samples per second in the generated audio.
 */
export function encodeHighSpeed(bytes: Uint8Array, sampleRate: number): Int16Array {
    // Length of a zero bit, in samples.
    const zeroLength = Math.round(0.00072*sampleRate);

    // Length of a one bit, in samples.
    const oneLength = Math.round(0.00034*sampleRate);

    // Samples representing a zero bit.
    const zero = generateCycle(zeroLength);

    // Samples representing a one bit.
    const one = generateCycle(oneLength);

    // Samples representing a long zero bit. This is the first start bit
    // after the end of the header. It's 1 ms longer than a regular zero.
    const longZero = generateCycle(zeroLength + sampleRate/1000);

    // The final cycle in the entire waveform, which is necessary
    // to force that last negative-to-positive transition (and interrupt).
    // We could just use a simple half cycle here, but it's nicer to do
    // something like the original analog.
    const finalHalfCycle = generateFinalHalfCycle(zeroLength*3, zero);

    // List of samples.
    const samplesList: Int16Array[] = [];

    // Start with half a second of silence.
    samplesList.push(new Int16Array(sampleRate / 2));

    // Write program.
    let sawSyncByte = false;
    for (const b of bytes) {
        if (!sawSyncByte && b === SYNC_BYTE) {
            sawSyncByte = true;
        } else if (sawSyncByte) {
            // Start bit.
            samplesList.push(zero);
        }
        addByte(samplesList, b, zero, one);
    }

    if (!sawSyncByte) {
        console.log("Warning: Didn't see sync byte when generating high-speed audio");
    }

    // Finish off the last cycle, so that it generates an interrupt.
    samplesList.push(finalHalfCycle);

    // End with half a second of silence.
    samplesList.push(new Int16Array(sampleRate / 2));

    // Concatenate all samples.
    return concatAudio(samplesList);
}
