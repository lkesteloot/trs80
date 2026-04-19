
/**
 * Get the number of spaces or tabs at the start of this line.
 */
export function getInitialSpaceCount(text: string): number {
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (ch !== " " && ch !== "\t") {
            return i;
        }
    }

    return text.length;
}

/**
 * Return the singular or plural version of the noun.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : (plural ?? singular + "s");
}

/**
 * Return the number, a space, then the singular or plural version of the noun.
 */
export function pluralizeWithCount(count: number, singular: string, plural?: string): string {
    return count + " " + pluralize(count, singular, plural);
}
