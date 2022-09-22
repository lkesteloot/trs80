
/**
 * Get the number of spaces at the start of this line.
 */
export function getInitialSpaceCount(text: string): number {
    for (let i = 0; i < text.length; i++) {
        if (text.charAt(i) !== " ") {
            return i;
        }
    }

    return text.length;
}
