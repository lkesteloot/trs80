/**
 * Upper-case the first letter of a value, for showing it in a table of terms and values ("single" becomes
 * "Single"). The rest is left alone, so a file name, hex, or a number that starts the value is unchanged.
 *
 * @param text the value.
 */
export function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.substring(1);
}

/**
 * A hex number for showing in a table, with the "0x" prefix.
 *
 * @param hex the digits, such as "3748".
 */
export function hexValue(hex: string): string {
    return "0x" + hex;
}
