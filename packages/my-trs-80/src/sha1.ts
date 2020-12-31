

// Convert a 32-bit unsigned number to a hex string.
// TODO use the z80-base version of this.
function toHexLong(value: number): string {
    value &= 0xFFFFFFFF;

    if (value < 0) {
        value = 0xFFFFFFFF + value + 1;
    }

    return value.toString(16).padStart(8, "0").toUpperCase();
}

/**
 * Rotate the 32-bit value left "count" bits.
 */
function rotateLeft(value: number, count: number): number {
    return ((value << count) | (value >>> (32 - count))) & 0xFFFFFFFF;
}

/**
 * Compute the SHA-1 hash of the byte array.
 *
 * https://en.wikipedia.org/wiki/SHA-1
 *
 * @return the hash as a hex string.
 */
export function sha1(bytes: Uint8Array): string {
    // Make sure we have a multiple of 64 bytes. Make space for the 0x80 byte and the 64-bit length.
    let newLength = bytes.length + 9;
    if (newLength % 64 !== 0) {
        newLength += 64 - newLength % 64;
    }
    const newBytes = new Uint8Array(newLength);
    newBytes.set(bytes);
    const view = new DataView(newBytes.buffer);

    // Add the 0x80 byte.
    newBytes[bytes.length] = 0x80;

    // Add the length. This is a 64-bit number but we don't have binaries that need more than 32 bits.
    view.setUint32(newBytes.length - 4, bytes.length*8, false);

    // Reusable array for each chunk.
    const w = new Uint32Array(80);

    // Initial hash value.
    let h0 = 0x67452301;
    let h1 = 0xEFCDAB89;
    let h2 = 0x98BADCFE;
    let h3 = 0x10325476;
    let h4 = 0xC3D2E1F0;

    // Process in 512-bit chunks.
    const wordCount = newBytes.length/4;
    for (let wordOffset = 0; wordOffset < wordCount; wordOffset += 16) {
        // Hash value for this chunk.
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;

        for (let i = 0; i < 80; i++) {
            w[i] = i < 16
                ? view.getUint32((wordOffset + i) * 4, false)
                : rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

            let f: number;
            let k: number;

            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5A827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            } else {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }

            const temp = rotateLeft(a, 5) + f + e + k + w[i];
            e = d;
            d = c;
            c = rotateLeft(b, 30);
            b = a;
            a = temp;
        }

        // Add this chunk's hash to result so far.
        h0 = (h0 + a) & 0xFFFFFFFF;
        h1 = (h1 + b) & 0xFFFFFFFF;
        h2 = (h2 + c) & 0xFFFFFFFF;
        h3 = (h3 + d) & 0xFFFFFFFF;
        h4 = (h4 + e) & 0xFFFFFFFF;
    }

    // Convert to a string.
    return [h0, h1, h2, h3, h4].map(toHexLong).join("");
}

