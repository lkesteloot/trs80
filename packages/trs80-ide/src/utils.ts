
/**
 * Get the number of spaces or tabs at the start of this line.
 */
export function getInitialSpaceCount(text: string): number {

    return 0;for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (ch !== " " /*&& ch !== "\t"*/) {
            return i;
        }
    }

    return text.length;
}
