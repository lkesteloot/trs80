
/**
 * Convert a number to a string.
 *
 * @param n number to convert
 * @param base base of the number
 * @param size zero-pad to this many digits
 */
export function pad(n: number, base: number, size: number) {
    let s = n.toString(base);

    if (base === 16) {
        // I prefer upper case hex.
        s = s.toUpperCase();
    }

    while (s.length < size) {
        s = "0" + s;
    }

    return s;
}

/**
 * Converts a Uint8Array to base64. Not super efficient, don't use on a huge array.
 */
export function base64EncodeUint8Array(array: Uint8Array): string {
    let s = "";
    array.forEach(c => s += String.fromCharCode(c));
    return btoa(s);
}
