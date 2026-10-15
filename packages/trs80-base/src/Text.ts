/**
 * Helpers for the text that disk structures hold: file names, banners, and the like.
 */

/**
 * Bytes as Latin-1 text, one character per byte. Not String.fromCharCode(... bytes), which
 * throws on arrays of more than about 100K, and not TextDecoder("latin1"), which browsers
 * treat as Windows-1252, changing bytes 0x80-0x9F.
 */
export function bytesToText(bytes: Uint8Array): string {
    let text = "";
    for (const b of bytes) {
        text += String.fromCharCode(b);
    }
    return text;
}

/**
 * Whether every character of the string is printable ASCII (32 to 126).
 */
export function isPrintable(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 32 || c > 126) {
            return false;
        }
    }
    return true;
}
