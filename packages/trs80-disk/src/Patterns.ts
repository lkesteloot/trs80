/**
 * Whether the name of a file inside a container matches a pattern given to "extract". Matching is
 * case-insensitive. A "*" matches any run of characters except "/", a "?" matches one character
 * except "/", and "**" matches any characters including "/". Every other character is literal.
 *
 * On file systems with directories, a pattern without a "/" is matched against the last component
 * of the name only, so that "*.cmd" finds files in every directory, and a pattern with a "/" is
 * matched against the whole path. Elsewhere a "/" in the pattern is treated as a ".", so that the
 * TRSDOS-style "HELLO/BAS" matches "HELLO.BAS".
 *
 * @param filename the name of the file as decoded (see InputFile.filename).
 * @param hasDirectories whether a "/" in the name separates directories (see InputFile.hasDirectories()).
 * @param pattern the pattern to match.
 */
export function fileNameMatchesPattern(filename: string, hasDirectories: boolean, pattern: string): boolean {
    let name = filename;
    let effectivePattern = pattern;
    if (hasDirectories) {
        if (!pattern.includes("/")) {
            name = filename.substring(filename.lastIndexOf("/") + 1);
        }
    } else {
        effectivePattern = pattern.replace(/\//g, ".");
    }

    let regex = "";
    for (let i = 0; i < effectivePattern.length; i++) {
        const c = effectivePattern[i];
        if (c === "*") {
            if (effectivePattern[i + 1] === "*") {
                regex += ".*";
                i++;
            } else {
                regex += "[^/]*";
            }
        } else if (c === "?") {
            regex += "[^/]";
        } else {
            regex += c.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
        }
    }

    return new RegExp("^" + regex + "$", "is").test(name);
}

/**
 * Whether a file name pattern has wildcards (see fileNameMatchesPattern()), as opposed to naming one file.
 *
 * @param pattern the pattern to check.
 */
export function patternHasWildcards(pattern: string): boolean {
    return pattern.includes("*") || pattern.includes("?");
}

/**
 * The end of the error for a pattern that matched no file, saying so if it's a wildcard that would have
 * matched only system files.
 *
 * @param unmatchedOnlySystem the PatternSelection.unmatchedOnlySystem of the selection that failed.
 * @returns text to put after the closing quote of the pattern: a parenthesized hint, or an empty string.
 */
export function systemWildcardHint(unmatchedOnlySystem: boolean): string {
    return unmatchedOnlySystem ? " (wildcards don't match system files, so name the file)" : "";
}

/**
 * How selectByPatterns() reads the files that it chooses from.
 */
export interface PatternSelectionAccessors<T> {
    /** The name of a file, as fileNameMatchesPattern() takes it. */
    name(file: T): string;

    /** Whether a "/" in the file's name separates directories (see fileNameMatchesPattern()). */
    hasDirectories(file: T): boolean;

    /** Whether the file is a system file. */
    isSystem(file: T): boolean;
}

/**
 * The result of selectByPatterns().
 */
export interface PatternSelection<T> {
    /** The chosen files, in their original order. */
    selected: T[];

    /** The first pattern that matched no file at all, or undefined if every pattern matched something. */
    unmatchedPattern: string | undefined;

    /**
     * Whether the unmatched pattern is a wildcard that would have matched a system file, if system
     * files could match wildcards. Always false if unmatchedPattern is undefined.
     */
    unmatchedOnlySystem: boolean;
}

/**
 * Choose the files whose names match at least one of the patterns (see fileNameMatchesPattern()). This
 * is the one place that decides which files a pattern can select, for every command that selects files:
 * a name without wildcards selects the file of that name, system file or not, but a pattern with
 * wildcards selects a system file only if wildcardsMatchSystemFiles says so.
 *
 * @param files the files to choose from, including any system files.
 * @param patterns the patterns to match, or an empty array to choose every file (as "*" does).
 * @param accessors how to read the files.
 * @param wildcardsMatchSystemFiles whether system files can match wildcards (and an empty array of patterns).
 */
export function selectByPatterns<T>(files: T[], patterns: string[], accessors: PatternSelectionAccessors<T>,
                                    wildcardsMatchSystemFiles: boolean): PatternSelection<T> {

    if (patterns.length === 0) {
        return {
            selected: files.filter(file => wildcardsMatchSystemFiles || !accessors.isSystem(file)),
            unmatchedPattern: undefined,
            unmatchedOnlySystem: false,
        };
    }

    const selected: T[] = [];
    const matchedPatterns = new Set<string>();
    for (const file of files) {
        let isSelected = false;
        for (const pattern of patterns) {
            const nameMatches = fileNameMatchesPattern(accessors.name(file), accessors.hasDirectories(file), pattern);
            const allowed = wildcardsMatchSystemFiles || !accessors.isSystem(file) || !patternHasWildcards(pattern);
            if (nameMatches && allowed) {
                isSelected = true;
                matchedPatterns.add(pattern);
            }
        }
        if (isSelected) {
            selected.push(file);
        }
    }

    const unmatchedPattern = patterns.find(pattern => !matchedPatterns.has(pattern));
    const unmatchedOnlySystem = unmatchedPattern !== undefined && !wildcardsMatchSystemFiles &&
        patternHasWildcards(unmatchedPattern) &&
        files.some(file => accessors.isSystem(file) &&
            fileNameMatchesPattern(accessors.name(file), accessors.hasDirectories(file), unmatchedPattern));
    return { selected, unmatchedPattern, unmatchedOnlySystem };
}
