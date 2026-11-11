/**
 * Return the singular or plural version of a string depending on the count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : plural ?? (singular + "s");
}

/**
 * Return the count and the singular or plural version of a string depending on the count.
 */
export function pluralizeWithCount(count: number, singular: string, plural?: string): string {
    return `${count.toLocaleString()} ${pluralize(count, singular, plural)}`;
}
