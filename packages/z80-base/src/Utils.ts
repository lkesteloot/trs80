
// Various utility functions.

/**
 * Convert a number to hex and zero-pad to the specified number of hex digits.
 */
export function toHex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, "0");
}

/**
 * Convert a byte to hex.
 */
export function toHexByte(value: number): string {
    return toHex(value, 2);
}

/**
 * Convert a word to hex.
 */
export function toHexWord(value: number): string {
    return toHex(value, 4);
}

/**
 * Convert a long (32-bit value) to hex.
 */
export function toHexLong(value: number): string {
    value &= 0xFFFFFFFF;

    // Convert two's complement negative numbers to positive numbers.
    if (value < 0) {
        value += 0x100000000;
    }

    return value.toString(16).toUpperCase().padStart(8, "0");
}

/**
 * Return the high byte of a word.
 */
export function hi(value: number): number {
    return (value >> 8) & 0xFF;
}

/**
 * Return the low byte of a word.
 */
export function lo(value: number): number {
    return value & 0xFF;
}

/**
 * Create a word from a high and low byte.
 */
export function word(highByte: number, lowByte: number): number {
    return ((highByte & 0xFF) << 8) | (lowByte & 0xFF);
}

/**
 * Increment a byte.
 */
export function inc8(value: number): number {
    return add8(value, 1);
}

/**
 * Increment a word.
 */
export function inc16(value: number): number {
    return add16(value, 1);
}

/**
 * Decrement a byte.
 */
export function dec8(value: number): number {
    return sub8(value, 1);
}

/**
 * Decrement a word.
 */
export function dec16(value: number): number {
    return sub16(value, 1);
}

/**
 * Add two bytes together.
 */
export function add8(a: number, b: number): number {
    return (a + b) & 0xFF;
}

/**
 * Add two words together.
 */
export function add16(a: number, b: number): number {
    return (a + b) & 0xFFFF;
}

/**
 * Subtract two bytes.
 */
export function sub8(a: number, b: number): number {
    return (a - b) & 0xFF;
}

/**
 * Subtract two words.
 */
export function sub16(a: number, b: number): number {
    return (a - b) & 0xFFFF;
}

/**
 * Convert a byte to a signed number (e.g., 0xff to -1).
 */
export function signedByte(value: number): number {
    return value >= 128 ? value - 256 : value;
}
