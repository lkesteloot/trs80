import {pluralize, ToolError} from "../utils.js";

/**
 * Describes one option (such as "--out-dir DIR" or "--force") of a command or of the
 * whole run.
 */
export interface DiskOptionSpec {
    /** The long form, including the dashes, such as "--out-dir". */
    name: string;
    /** The short form, including the dash, such as "-o". */
    shortName?: string | undefined;
    /** Placeholder for the value shown in help, such as "DIR". Undefined for a boolean flag. */
    valueName: string | undefined;
    /** One-line description for help. */
    description: string;
}

/**
 * Describes one disk command, such as "dir" or "rm".
 */
export interface DiskCommandSpec {
    /** The canonical name, such as "dir". */
    name: string;
    /** Other names that mean the same thing, such as "ls". */
    aliases: string[];
    /** The argument synopsis for help, such as "NAME... [--out-dir DIR]". */
    usage: string;
    /** One-line summary for help. */
    summary: string;
    /** Minimum number of positional arguments. */
    minArgs: number;
    /** Maximum number of positional arguments, or Infinity for no limit. */
    maxArgs: number;
    /** The options this command accepts. */
    options: DiskOptionSpec[];
}

/**
 * The options given on a command line (or to one command), keyed by the long name
 * of the option. If an option is repeated then the last value wins.
 */
export class DiskOptionValues {
    /**
     * The value of each option given, keyed by its long name including the dashes (such as
     * "--out-dir"). The value is the string given for an option that takes one, or true for a flag.
     */
    private readonly values = new Map<string, string | true>();

    /**
     * Record the value of an option, replacing any earlier value.
     *
     * @param name the long name of the option, such as "--out-dir".
     * @param value the string value, or true for a boolean flag.
     */
    public set(name: string, value: string | true): void {
        this.values.set(name, value);
    }

    /**
     * Whether the option was given at all (as a flag or with a value).
     *
     * @param name the long name of the option.
     */
    public has(name: string): boolean {
        return this.values.has(name);
    }

    /**
     * The string value of an option, or undefined if the option was not given
     * or is a boolean flag.
     *
     * @param name the long name of the option.
     */
    public getString(name: string): string | undefined {
        const value = this.values.get(name);
        return typeof value === "string" ? value : undefined;
    }

    /**
     * The options as words, in the order they were first given, such as ["--force", "--out-dir", "x"],
     * for showing the command that was run. The words are not quoted.
     */
    public toWords(): string[] {
        const words: string[] = [];
        for (const [name, value] of this.values) {
            words.push(name);
            if (value !== true) {
                words.push(value);
            }
        }
        return words;
    }
}

/**
 * One command from a command line, with its arguments and options.
 */
export interface ParsedDiskCommand {
    /** The spec of the command that the user's name resolved to. */
    spec: DiskCommandSpec;
    /** The name as typed by the user (possibly an alias, in any case). */
    name: string;
    /** The positional arguments, in order. */
    args: string[];
    /** The options given to this command. */
    options: DiskOptionValues;
}

/**
 * A whole parsed command line: the global options and then the commands in order.
 */
export interface ParsedDiskCommandLine {
    /** The options that apply to the whole run. */
    globalOptions: DiskOptionValues;
    /** The commands, possibly empty. */
    commands: ParsedDiskCommand[];
}

/**
 * The separator between commands.
 */
const COMMAND_SEPARATOR = ":";

/**
 * Parse the value of a --date option (of "add", "attr", "label", "create"), which must be YYYY-MM-DD.
 *
 * @param text what the user gave.
 * @return the date at local midnight.
 * @throws ToolError if it isn't a real calendar date in that form.
 */
export function parseAddDate(text: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match !== null) {
        const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const date = new Date(year, month - 1, day);
        // Reject days that roll over, such as February 30.
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
            return date;
        }
    }
    throw new ToolError("Invalid --date \"" + text + "\": use YYYY-MM-DD, such as 1983-05-01");
}

/**
 * Find the spec for an option word, by long or short name.
 *
 * @param word the name part of the option as typed, such as "--out-dir" or "-d".
 * @param specs the options to search.
 * @returns the matching spec, or undefined.
 */
function findOptionSpec(word: string, specs: DiskOptionSpec[]): DiskOptionSpec | undefined {
    return specs.find(spec => spec.name === word || spec.shortName === word);
}

/**
 * Whether a word is an option (as opposed to an argument): it starts with a dash and
 * is not a lone "-", which is conventionally stdin or stdout.
 */
function looksLikeOption(word: string): boolean {
    return word.startsWith("-") && word !== "-";
}

/**
 * Parse one option starting at words[index], which must look like an option and not be "--".
 * Understands "--name=value", "--name value", and "-o value".
 *
 * @param words the words being parsed.
 * @param index the index of the option word.
 * @param end the index one past the last word that may belong to this option.
 * @param specs the options that are allowed here.
 * @param values where to store the result.
 * @param context how to describe the place for an unknown option, such as "the \"rm\" command"
 * or "the global options".
 * @returns the index of the first word after the option and its value.
 */
function parseOption(words: string[], index: number, end: number, specs: DiskOptionSpec[],
                     values: DiskOptionValues, context: string): number {

    const word = words[index];
    let name = word;
    let inlineValue: string | undefined = undefined;

    // Only long options take "=value".
    if (word.startsWith("--")) {
        const equalsIndex = word.indexOf("=");
        if (equalsIndex > 0) {
            name = word.substring(0, equalsIndex);
            inlineValue = word.substring(equalsIndex + 1);
        }
    }

    const spec = findOptionSpec(name, specs);
    if (spec === undefined) {
        throw new ToolError("Unknown option \"" + name + "\" for " + context);
    }

    if (spec.valueName === undefined) {
        if (inlineValue !== undefined) {
            throw new ToolError("Option \"" + spec.name + "\" does not take a value");
        }
        values.set(spec.name, true);
        return index + 1;
    }

    if (inlineValue !== undefined) {
        values.set(spec.name, inlineValue);
        return index + 1;
    }

    if (index + 1 >= end) {
        throw new ToolError("Option \"" + word + "\" needs a value (" + spec.valueName + ")");
    }
    values.set(spec.name, words[index + 1]);
    return index + 2;
}

/**
 * Find a command by name or alias, ignoring case.
 *
 * @param name the name as typed.
 * @param commandSpecs all known commands.
 * @returns the matching spec, or undefined.
 */
export function findDiskCommandSpec(name: string, commandSpecs: DiskCommandSpec[]): DiskCommandSpec | undefined {
    const lower = name.toLowerCase();
    return commandSpecs.find(spec => spec.name.toLowerCase() === lower ||
        spec.aliases.some(alias => alias.toLowerCase() === lower));
}

/**
 * Parse the words of a single command (its name first, with no ":" in them).
 *
 * @param words the words of the command, which is not empty.
 * @param commandSpecs all known commands.
 * @returns the parsed command.
 * @throws ToolError for unknown commands or options, or the wrong number of arguments.
 */
function parseOneCommand(words: string[], commandSpecs: DiskCommandSpec[]): ParsedDiskCommand {
    const name = words[0];
    const spec = findDiskCommandSpec(name, commandSpecs);
    if (spec === undefined) {
        throw new ToolError("Unknown command \"" + name + "\"");
    }

    const args: string[] = [];
    const options = new DiskOptionValues();
    let optionsEnded = false;
    let i = 1;
    while (i < words.length) {
        const word = words[i];
        if (optionsEnded || !looksLikeOption(word)) {
            args.push(word);
            i++;
        } else if (word === "--") {
            optionsEnded = true;
            i++;
        } else {
            i = parseOption(words, i, words.length, spec.options, options,
                "the \"" + name + "\" command");
        }
    }

    if (args.length < spec.minArgs) {
        if (spec.minArgs === spec.maxArgs) {
            throw new ToolError("\"" + name + "\" takes " + spec.minArgs + " " +
                pluralize(spec.minArgs, "argument"));
        }
        throw new ToolError("\"" + name + "\" needs at least " + spec.minArgs + " " +
            pluralize(spec.minArgs, "argument"));
    }
    if (args.length > spec.maxArgs) {
        if (spec.maxArgs === 0) {
            throw new ToolError("\"" + name + "\" takes no arguments");
        }
        throw new ToolError("\"" + name + "\" takes " +
            (spec.minArgs === spec.maxArgs ? "" : "at most ") + spec.maxArgs + " " +
            pluralize(spec.maxArgs, "argument"));
    }

    return { spec, name, args, options };
}

/**
 * Parse the words of a "disk" invocation that follow the disk image.
 *
 * The grammar is: optional global options, then zero or more commands separated by a
 * lone ":" word (like BASIC's statement separator). A ":" inside a word, such as
 * "HELLO/BAS:1", is not a separator. Command names and aliases are case-insensitive.
 *
 * Options may appear before, between, or after a command's arguments, in the forms
 * "--name=value", "--name value", and "-o value" (no "-ovalue" and no bundled short
 * flags). A word of just "-" is an argument. A lone "--" ends option parsing for the
 * rest of that command, so later words are arguments even if they start with a dash.
 * A ":" after "--" still separates commands, since a TRSDOS file can't be named ":"
 * and it keeps scripts predictable.
 *
 * Empty commands, as in ": :" or a ":" at either end, are skipped. Having no commands at all
 * is valid and gives an empty command list (callers can treat that as a request for an
 * interactive shell).
 *
 * @param words the words following the disk image.
 * @param globalOptionSpecs the options accepted before the first command.
 * @param commandSpecs the known commands.
 * @returns the parsed command line.
 * @throws ToolError for any syntax error, with a message suitable for the user.
 */
export function parseDiskCommandLine(words: string[], globalOptionSpecs: DiskOptionSpec[],
                                     commandSpecs: DiskCommandSpec[]): ParsedDiskCommandLine {

    const globalOptions = new DiskOptionValues();

    // Global options come first, up to the first word that isn't an option.
    let i = 0;
    while (i < words.length && looksLikeOption(words[i])) {
        i = parseOption(words, i, words.length, globalOptionSpecs, globalOptions, "the global options");
    }

    // Split the rest into commands at lone colons.
    const groups: string[][] = [];
    if (i < words.length) {
        let group: string[] = [];
        for (; i < words.length; i++) {
            if (words[i] === COMMAND_SEPARATOR) {
                groups.push(group);
                group = [];
            } else {
                group.push(words[i]);
            }
        }
        groups.push(group);
    }

    // Empty commands (": :", or a ":" at either end) are skipped.
    const commands = groups
        .filter(group => group.length > 0)
        .map(group => parseOneCommand(group, commandSpecs));

    return { globalOptions, commands };
}

/**
 * Split one line, typed at a shell prompt or read from a script, into words. This works
 * roughly like a POSIX shell, but simpler:
 *
 * - Words are separated by runs of whitespace.
 * - Single and double quotes group text (including spaces) and may be adjacent to other
 *   text, so --auto="BASIC RUN" is the single word --auto=BASIC RUN. An empty pair of
 *   quotes makes an empty word.
 * - Inside double quotes a backslash escapes only a double quote or a backslash (any
 *   other backslash is literal). Inside single quotes everything is literal.
 * - Outside quotes a backslash escapes the next character, so a\ b is the word "a b".
 *   (Backslash is therefore always an escape here; these lines are typed into our own
 *   shell, so Windows paths are not a concern, and should be quoted or use slashes.)
 *   A backslash at the very end of the line is kept literally.
 * - A "#" at the start of a word, outside quotes, starts a comment that runs to the end
 *   of the line. "HELLO#2" is not a comment.
 *
 * Quoting does not protect a ":" from being a command separator: the separation is done
 * later, by parseDiskCommandLine(), on words, and the words no longer remember whether
 * they were quoted. A file can't be named ":" anyway (TRSDOS names can't).
 *
 * @param line the line of text.
 * @returns the words, which is empty for a blank or comment-only line.
 * @throws ToolError if a quote is not closed.
 */
export function splitCommandLine(line: string): string[] {
    const words: string[] = [];
    let current = "";
    // True if we're in a word, even if it's empty so far (as with "").
    let inWord = false;
    let quote: string | undefined = undefined;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];

        if (quote === "'") {
            if (c === "'") {
                quote = undefined;
            } else {
                current += c;
            }
        } else if (quote === "\"") {
            if (c === "\"") {
                quote = undefined;
            } else if (c === "\\" && i + 1 < line.length && (line[i + 1] === "\"" || line[i + 1] === "\\")) {
                i++;
                current += line[i];
            } else {
                current += c;
            }
        } else if (c === "'" || c === "\"") {
            quote = c;
            inWord = true;
        } else if (c === "\\") {
            inWord = true;
            if (i + 1 < line.length) {
                i++;
                current += line[i];
            } else {
                current += c;
            }
        } else if (c === " " || c === "\t" || c === "\r" || c === "\n") {
            if (inWord) {
                words.push(current);
                current = "";
                inWord = false;
            }
        } else if (c === "#" && !inWord) {
            // Comment to the end of the line.
            break;
        } else {
            current += c;
            inWord = true;
        }
    }

    if (quote !== undefined) {
        throw new ToolError("Unterminated " + (quote === "'" ? "single" : "double") + " quote");
    }
    if (inWord) {
        words.push(current);
    }

    return words;
}
