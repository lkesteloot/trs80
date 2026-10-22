import chalk from "chalk";
import type {ChalkInstance} from "chalk";

// All terminal colors are chosen here, by what they mean, so that commands use
// the same color for the same thing and a palette change happens in one place.
// Stick to the 16 named ANSI colors and to attributes like bold and dim: the
// user's terminal theme picks the actual RGB for those, and tunes them for its
// own background, light or dark. (Yellow and the bright colors are hard to read
// on light backgrounds, and blue on dark ones.) The "dir" command is the
// exception, since it uses the user's own LS_COLORS (see lscolors.ts).
//
// These styles are captured once, but chalk reads its color level when a style
// is applied, so the --color option and NO_COLOR still apply to them.

/**
 * A style that wraps text in escape codes, like chalk.red. Styles can be
 * chained, as in "colors.muted.underline".
 */
export type Style = ChalkInstance;

/**
 * Styles for terminal output, named by what they mean.
 */
export const colors = {
    /** Something went wrong, like an assembler error or an unreadable sector. */
    error: chalk.red,
    /** Something unusual worth noticing, like a log warning or a deleted sector. */
    warning: chalk.yellow,
    /** Informational log messages. */
    info: chalk.green,
    /** Text that's less important than what's around it, or missing. */
    muted: chalk.dim,
    /** Text that's more important than what's around it, like a changed register. */
    emphasis: chalk.bold,
    /** A placeholder for a value, like "nn" in an opcode's description. */
    placeholder: chalk.underline,
    /** A memory address or file offset, like the first column of a hex dump. */
    address: chalk.cyan,
    /** The bytes of a binary, in hex or as characters, like in a hex dump or a listing. */
    data: chalk.green,
    /** A note that explains nearby data, like a hex dump's annotations. */
    annotation: chalk.magenta,
    /** The REPL's prompt. */
    prompt: chalk.yellowBright,
    /** The frame drawn around the emulated screen by the "run" command. */
    frame: chalk.green,
    /** The part of the frame that marks the active drive. */
    frameActive: chalk.red,
    /** Normal text, for a table of styles that needs an entry for it. */
    plain: chalk.reset,
} satisfies { [role: string]: Style };

/**
 * Whether the byte is a printable ASCII character, including space.
 */
function isPrintableAscii(byte: number): boolean {
    return byte >= 0x20 && byte < 0x7F;
}

/**
 * Color a byte shown as a character, like "A", or "." for one that isn't
 * printable. The dot is muted, so that it doesn't look like a real period.
 */
export function colorAsciiByte(text: string, byte: number): string {
    return isPrintableAscii(byte) ? colors.data(text) : colors.muted(text);
}

/**
 * Whether output is colored at all. Use it to choose a different layout when
 * there's no color, like blanks instead of dimmed text.
 */
export function isColorEnabled(): boolean {
    return chalk.level > 0;
}

/**
 * Turn off color if the NO_COLOR environment variable asks for it
 * (https://no-color.org), since chalk doesn't honor it. Like Node, let
 * FORCE_COLOR take precedence. Call this before parsing the --color option,
 * which overrides both.
 */
export function honorNoColor(): void {
    if ((process.env.NO_COLOR ?? "") !== "" && !("FORCE_COLOR" in process.env)) {
        chalk.level = 0;
    }
}

/**
 * Set the color level based on its name. See the --color option.
 */
export function setColorLevel(levelName: string): void {
    switch (levelName.toLowerCase()) {
        case "auto":
        default:
            // Don't touch the level, let chalk set it.
            break;

        case "off":
            chalk.level = 0;
            break;

        case "16":
            chalk.level = 1;
            break;

        case "256":
            chalk.level = 2;
            break;

        case "16m":
            chalk.level = 3;
            break;
    }
}
