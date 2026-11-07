import fs from "fs";
import path from "path";
import {
    ModelIITrsdosDirEntry, Trs80File, TrsdosIIFile, TrsdosIIFileType, TrsdosIIRecordType, XenixTarFile,
    decodeTrs80File } from "trs80-base";
import {assertNever} from "z80-base";
import { AudioFile, readWavFile } from "trs80-cassette";

/**
 * Error that ends the command. Its message is shown to the user without a stack trace,
 * and the tool exits with status 1.
 */
export class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ToolError";
    }
}

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

/**
 * Return the input pathname with the extension replaced.
 * @param pathname input pathname
 * @param extension extension with period.
 */
export function replaceExtension(pathname: string, extension: string): string {
    const { dir, name } = path.parse(pathname);
    return path.join(dir, name + extension);
}

/**
 * Load a file and return its bytes, or an error.
 */
export function loadFile(filename: string): Uint8Array | string {
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        return `Can't open file "${filename}" (${e.message})`;
    }

    // A Buffer is a Uint8Array view of (possibly pooled) memory; return it as-is.
    return buffer;
}

/**
 * Write a file so that an interrupted write can't leave half a file: write the bytes to a new file in
 * the same directory (so that the rename can't cross file systems), then rename it over the target.
 * If the target exists, the new file gets its permission bits, and if the target is a symbolic link
 * then the file it points to is replaced and the link stays. If anything fails, the new file is removed.
 *
 * @param pathname the file to create or replace.
 * @param binary the bytes to write.
 * @throws the file system's error if the write or the rename fails, after removing the new file.
 */
export function writeFileAtomically(pathname: string, binary: Uint8Array): void {
    // Replace the file that a symbolic link points to, rather than the link.
    let targetPathname = pathname;
    let mode: number | undefined = undefined;
    try {
        targetPathname = fs.realpathSync(pathname);
        mode = fs.statSync(targetPathname).mode & 0o7777;
    } catch (e) {
        // The target doesn't exist yet, so it gets the default permissions.
    }

    const {dir, base} = path.parse(targetPathname);
    const tempPathname = path.join(dir, "." + base + ".tmp-" + process.pid);
    try {
        const fd = fs.openSync(tempPathname, "w");
        try {
            fs.writeSync(fd, binary);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        if (mode !== undefined) {
            fs.chmodSync(tempPathname, mode);
        }
        fs.renameSync(tempPathname, targetPathname);
    } catch (e) {
        try {
            fs.rmSync(tempPathname, { force: true });
        } catch (e2) {
            // Nothing more we can do; report the original error.
        }
        throw e;
    }
}

/**
 * Synchronously read a TRS-80 file, or return an error string.
 *
 * TODO: This pattern appears several times in this file.
 */
export function readTrs80File(filename: string): Trs80File | AudioFile | string {
    const binary = loadFile(filename);
    if (typeof binary === "string") {
        return binary;
    }

    const extension = path.parse(filename).ext.toUpperCase();
    if (extension === ".WAV") {
        try {
            return readWavFile(binary);
        } catch (e: any) {
            if (e.message) {
                return filename + ": " + e.message;
            } else {
                return "Can't read " + filename;
            }
        }
    }

    const trs80File = decodeTrs80File(binary, { filename });
    if (trs80File.error !== undefined) {
        return filename + ": " + trs80File.error;
    }

    return trs80File;
}

/**
 * Format a date as "DD/MM/YYYY", or "DD/MM/YYYY HH:MM" if the time is included, the way
 * TrsdosDirEntry.getFullDateString() shows TRSDOS dates, so that every file system's dates look alike.
 *
 * @param date the date to format.
 * @param utc whether to read the date's fields in UTC rather than the local time zone. Use true for
 * dates that are real points in time (such as Unix times), so that the output doesn't depend on where
 * the tool runs, and false for dates that were built from the fields of a calendar date.
 * @param includeTime whether to add the hours and minutes.
 */
export function formatDate(date: Date, utc: boolean, includeTime: boolean): string {
    const year = utc ? date.getUTCFullYear() : date.getFullYear();
    const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
    const day = utc ? date.getUTCDate() : date.getDate();
    let text = day.toString().padStart(2, "0") + "/" + month.toString().padStart(2, "0") + "/" +
        year.toString().padStart(4, "0");
    if (includeTime) {
        const hour = utc ? date.getUTCHours() : date.getHours();
        const minute = utc ? date.getUTCMinutes() : date.getMinutes();
        text += " " + hour.toString().padStart(2, "0") + ":" + minute.toString().padStart(2, "0");
    }
    return text;
}

/**
 * Format a date for JSON output as "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" if the time is included, with
 * a trailing "Z" if the date is in UTC. This is ISO 8601, but we read the fields directly instead of
 * using toISOString(), because TRS-80 dates have no time zone: unless utc is true, the date's local
 * fields are the ones that were recorded, and converting to UTC would shift them.
 *
 * @param date the date to format.
 * @param utc whether to read the date's fields in UTC rather than the local time zone. See formatDate().
 * @param includeTime whether to add the hours and minutes.
 */
export function jsonDate(date: Date, utc: boolean, includeTime: boolean): string {
    const year = utc ? date.getUTCFullYear() : date.getFullYear();
    const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
    const day = utc ? date.getUTCDate() : date.getDate();
    let text = year.toString().padStart(4, "0") + "-" + month.toString().padStart(2, "0") + "-" +
        day.toString().padStart(2, "0");
    if (includeTime) {
        const hour = utc ? date.getUTCHours() : date.getHours();
        const minute = utc ? date.getUTCMinutes() : date.getMinutes();
        text += "T" + hour.toString().padStart(2, "0") + ":" + minute.toString().padStart(2, "0");
        if (utc) {
            text += "Z";
        }
    }
    return text;
}

/**
 * The flags of a Model II TRSDOS file: "S" if it's a system file and "P" if it's a program,
 * with "-" in place of the ones that aren't set.
 */
export function modelIITrsdosFlagsString(dirEntry: ModelIITrsdosDirEntry): string {
    return (dirEntry.isSystemFile() ? "S" : "-") + (dirEntry.isProgram() ? "P" : "-");
}

/**
 * The flags of a TRSDOS-II file, always three characters: "P" (program) or "D" (data), then "F"
 * (fixed-length records) or "V" (variable-length records), then "S" if the entry has the system
 * flag, or "-".
 */
export function trsdosIIFlagsString(file: TrsdosIIFile): string {
    let fileType: string;
    const fileTypeValue = file.getFileType();
    switch (fileTypeValue) {
        case TrsdosIIFileType.PROGRAM: fileType = "P"; break;
        case TrsdosIIFileType.DATA: fileType = "D"; break;
        default: assertNever(fileTypeValue);
    }

    let recordType: string;
    const recordTypeValue = file.getRecordType();
    switch (recordTypeValue) {
        case TrsdosIIRecordType.FIXED: recordType = "F"; break;
        case TrsdosIIRecordType.VARIABLE: recordType = "V"; break;
        default: assertNever(recordTypeValue);
    }

    return fileType + recordType + (file.hasSystemFlag() ? "S" : "-");
}

/**
 * The permission bits of a Xenix tar member in octal, always four digits, such as "0755".
 */
export function xenixTarModeString(file: XenixTarFile): string {
    return file.mode.toString(8).padStart(4, "0");
}

/**
 * The type flag of a Xenix tar member as a printable character: "0" for a regular file, which
 * can be stored as either "0" or NUL.
 */
export function xenixTarTypeLetter(file: XenixTarFile): string {
    return file.typeFlag === "\0" ? "0" : file.typeFlag;
}

/**
 * Convert an exception to a string for an error message.
 */
export function exceptionToString(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

// Added to the name of a file that had damage, if the user asked for that.
export const DAMAGED_SUFFIX = " [DAMAGED]";

/**
 * Return a file or directory name that's safe to create in its directory. Names can come
 * from a disk image, which can hold anything, so replace the characters that would let a
 * name leave its directory (path separators, and the colon, which starts a drive on
 * Windows) and don't allow a name that's empty or only dots, such as "..". Normal TRS-80
 * names, like "FOO.CMD", are unchanged.
 */
function safeOutputName(name: string): string {
    return name.replace(/[\/\\:\0]/g, "_").replace(/^\.*$/, "_");
}

/**
 * Return the components of the path to create in the output directory for a file. On file
 * systems with directories, a "/" in the filename separates them (as in "usr/bin/vi" on a
 * Xenix tar disk), and we recreate them, dropping empty components (as in "a//b").
 * Elsewhere the whole filename is one name.
 */
export function safeOutputPath(filename: string, hasDirectories: boolean): string[] {
    if (!hasDirectories) {
        return [safeOutputName(filename)];
    }

    const components = filename.split("/").filter(component => component !== "").map(safeOutputName);
    return components.length === 0 ? ["_"] : components;
}

/**
 * Return the components of the path that "extract" creates in the output directory for a file, before
 * it makes the path unique.
 *
 * @param filename the name of the file as decoded.
 * @param hasDirectories whether a "/" in the name separates directories (see InputFile.hasDirectories()).
 * @param damaged whether the file had damage.
 * @param lowercase whether to lowercase the name, as in "foo.cmd" for "FOO.CMD".
 * @param markDamaged whether to add " [DAMAGED]" to the name of a file that had damage.
 */
export function outputPathComponents(filename: string, hasDirectories: boolean, damaged: boolean,
                                     lowercase: boolean, markDamaged: boolean): string[] {

    const components = safeOutputPath(lowercase ? filename.toLowerCase() : filename, hasDirectories);
    components[components.length - 1] += damaged && markDamaged ? DAMAGED_SUFFIX : "";
    return components;
}

/**
 * Whether the string contains a character that makes it a glob pattern.
 */
function hasGlobCharacters(arg: string): boolean {
    return /[*?\[\]{}]/.test(arg);
}

/**
 * Expand one command-line argument that names host files. Cmd.exe and PowerShell don't expand
 * wildcards for native programs, so we do it ourselves on every platform.
 *
 * An argument that names an existing file or directory is used unchanged, which matters because
 * names like "Zork (1980)(Infocom)[a].dsk" contain glob syntax, and because the shell has already
 * expanded the arguments on Unix. Otherwise an argument with glob characters is a pattern,
 * and is replaced by the regular files that it matches, sorted. Any other argument is returned
 * unchanged, so that the command reports it as a missing file.
 *
 * @param arg the argument from the command line.
 * @returns the files the argument stands for, which is never empty.
 * @throws ToolError if the argument is a pattern that matches no files.
 */
function expandInputPatternArg(arg: string): string[] {
    const exists = fs.statSync(arg, { throwIfNoEntry: false }) !== undefined;
    if (exists || !hasGlobCharacters(arg)) {
        return [arg];
    }

    // A backslash is a path separator on Windows, not an escape.
    const pattern = process.platform === "win32" ? arg.replace(/\\/g, "/") : arg;
    const matches = fs.globSync(pattern)
        .filter(match => fs.statSync(match, { throwIfNoEntry: false })?.isFile() === true)
        .sort();
    if (matches.length === 0) {
        throw new ToolError("No files match \"" + arg + "\"");
    }

    return matches;
}

/**
 * Expand the wildcards in the command-line arguments that name host files. See
 * expandInputPatternArg() for the rules.
 *
 * @param args the arguments from the command line.
 * @returns the files that the arguments stand for, in order.
 * @throws ToolError if an argument is a pattern that matches no files.
 */
export function expandInputPatterns(args: string[]): string[] {
    return args.flatMap(expandInputPatternArg);
}

/**
 * Expand the wildcards in a command-line argument for a command that takes only one host file.
 *
 * @param arg the argument from the command line.
 * @returns the one file that the argument stands for.
 * @throws ToolError if the argument is a pattern that doesn't match exactly one file.
 */
export function expandInputPattern(arg: string): string {
    const files = expandInputPatternArg(arg);
    if (files.length !== 1) {
        throw new ToolError("\"" + arg + "\" matches " + files.length + " files, but this command takes one");
    }

    return files[0];
}

/**
 * Find the words that follow a subcommand in the raw command line, exactly as the user typed them.
 * Commander consumes the program-level options it knows wherever they appear and drops some "--"
 * words, so a subcommand that parses its own words must not take them from commander.
 *
 * Program options are skipped up to the subcommand, along with the values of those that take one
 * (given as "--color 16" or "--color=16"). The first word that isn't an option must be the subcommand.
 *
 * @param argv the command-line arguments, without the node executable and script (process.argv.slice(2)).
 * @param subcommand the name of the subcommand.
 * @param programOptionsWithValues the long program options that take a value, such as "--color".
 * @returns the words after the subcommand, or undefined if the first word that isn't a program
 * option is not the subcommand (or there is none).
 */
export function wordsAfterSubcommand(argv: string[], subcommand: string,
                                     programOptionsWithValues: string[]): string[] | undefined {

    let i = 0;
    while (i < argv.length && argv[i].startsWith("-") && argv[i] !== "-" && argv[i] !== "--") {
        // Skip the value of an option that takes one, unless it was attached with "=".
        i += programOptionsWithValues.includes(argv[i]) ? 2 : 1;
    }

    if (i >= argv.length || argv[i] !== subcommand) {
        return undefined;
    }

    return argv.slice(i + 1);
}

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

/**
 * Wrap text into lines of at most the given width, breaking at spaces or (optionally) after hyphens where
 * possible, and indenting all but the first line. A word too long for a line is broken anywhere, or with
 * breakLongWords off is kept whole on a line of its own, longer than the width.
 *
 * @param text the text to wrap.
 * @param width the maximum length of each line, including its indent.
 * @param indent the number of spaces before each line after the first.
 * @param breakAfterHyphens whether a line may end after a hyphen, as in "well-" then "known". Leave this
 * off for text with names in it, like "trsdos-1.3".
 * @param breakLongWords whether to break a word that doesn't fit on a line by itself. Leave this off for
 * text that people copy, like file paths, and on where nothing may go past the width.
 * @return the lines, at least one.
 */
export function wrapText(text: string, width: number, indent: number, breakAfterHyphens = true,
                         breakLongWords = true): string[] {
    const lines: string[] = [];
    const indentText = " ".repeat(indent);
    let rest = text;
    let prefix = "";

    // Too narrow to indent and still make progress.
    if (width <= indent) {
        return [text];
    }

    while (prefix.length + rest.length > width) {
        const room = width - prefix.length;
        // Break at the last space or after the last hyphen that fits, or anywhere if there's neither.
        const afterHyphen = breakAfterHyphens ? rest.lastIndexOf("-", room - 1) + 1 : 0;
        let breakIndex = Math.max(rest.lastIndexOf(" ", room), afterHyphen);
        if (breakIndex <= 0) {
            // The first word doesn't fit: break it, or end the line after it.
            const nextSpace = rest.indexOf(" ", room);
            breakIndex = breakLongWords ? room : nextSpace;
            if (breakIndex < 0) {
                break;
            }
        }
        lines.push(prefix + rest.slice(0, breakIndex).trimEnd());
        rest = rest.slice(breakIndex).trimStart();
        prefix = indentText;
    }
    lines.push(prefix + rest);

    return lines;
}

/**
 * The width to wrap text to for a person at the terminal: the terminal's width if standard output is one,
 * and otherwise 80, as Commander does for its help.
 */
export function terminalWidth(): number {
    return process.stdout.isTTY && process.stdout.columns > 0 ? process.stdout.columns : 80;
}

/**
 * Wrap a message that may have several lines (such as an error with a list under it) to fit the terminal.
 * Each line wraps at spaces, and the lines that it wraps into are indented as far as it was. A line of a
 * list, which is indented and has a term and then at least two spaces before its description, wraps
 * under the description instead.
 *
 * @param message the text, with lines separated by "\n".
 * @param width the width to wrap to; the terminal's width by default.
 * @return the message with long lines wrapped.
 */
export function wrapMessage(message: string, width = terminalWidth()): string {
    return message.split("\n").map(line => {
        const listItem = /^ +[^ ]+ {2,}(?=\S)/.exec(line);
        const indent = listItem !== null ? listItem[0].length : line.length - line.trimStart().length;
        return wrapText(line, width, indent, false, false).join("\n");
    }).join("\n");
}
