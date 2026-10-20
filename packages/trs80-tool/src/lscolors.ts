import {colors, isColorEnabled} from "./colors.js";
import type {Trs80File} from "trs80-base";

// Colors for the "dir" command. The defaults match eza's built-in theme, so a
// listing looks like "ls" for people who alias it to eza. Users can override
// them with LS_COLORS (used by GNU ls, eza, fd, lsd, and tree), then
// EZA_COLORS. Both are colon-separated lists of key=value pairs, where the
// value is an SGR code like "01;31" or "38;5;208". Keys like "*.bas" match
// filename extensions. Other "*" patterns, like "*.tar.gz" or "*README", are
// ignored, since TRS-80 filenames can't match them. The two-letter keys we use
// are:
//
//     fi    regular file
//     ex    executable file (CMD and SYSTEM programs)
//     sn    file size (sets both nb and nk)
//     nb    file size under 1,000 bytes
//     nk    file size of 1,000 bytes or more
//     da    date
//
// As in eza, an EZA_COLORS that starts with "reset" turns off the defaults.

/**
 * The colors, after parsing the defaults and environment variables.
 */
interface DirColors {
    // Two-letter keys, like "fi", to SGR code.
    keys: Map<string, string>;
    // SGR code for source files, if any.
    source: string | undefined;
    // Lower-case extension, like "bas", to SGR code. Lower case because, since
    // coreutils 9.2, ls matches them case-insensitively, which matters here
    // because TRS-80 filenames are upper case and LS_COLORS entries are usually
    // lower. As in ls, a later entry overrides an earlier one.
    extensions: Map<string, string>;
}

// eza's defaults, for the keys we use. Source files are bold yellow in eza, but
// that's not a key it lets you set, so it's hard-coded in getFilenameSgr().
const DEFAULT_COLORS = "ex=1;32:nb=32:nk=1;32:da=34";
const SOURCE_SGR = "1;33";

let gDirColors: DirColors | undefined = undefined;

/**
 * Add the colors in an LS_COLORS-style string to the colors. Entries we don't
 * understand are ignored.
 */
function parseColors(dirColors: DirColors, value: string): void {
    for (const entry of value.split(":")) {
        const equals = entry.indexOf("=");
        if (equals === -1) {
            continue;
        }
        const key = entry.substring(0, equals);
        const sgr = entry.substring(equals + 1);

        // GNU ls also allows backslash and caret escapes here, but in practice
        // the values are plain SGR codes, and anything else we skip.
        if (!/^[0-9;]+$/.test(sgr)) {
            continue;
        }

        if (key.startsWith("*")) {
            const extension = key.substring(1);
            if (extension.startsWith(".") && extension.lastIndexOf(".") === 0) {
                dirColors.extensions.set(extension.substring(1).toLowerCase(), sgr);
            }
        } else if (key === "sn") {
            dirColors.keys.set("nb", sgr);
            dirColors.keys.set("nk", sgr);
        } else {
            dirColors.keys.set(key, sgr);
        }
    }
}

/**
 * Get the colors, parsing them the first time.
 */
function getDirColors(): DirColors {
    if (gDirColors === undefined) {
        const ezaColors = process.env.EZA_COLORS ?? "";
        const useDefaults = !ezaColors.startsWith("reset");
        gDirColors = {
            keys: new Map(),
            source: useDefaults ? SOURCE_SGR : undefined,
            extensions: new Map(),
        };

        if (useDefaults) {
            parseColors(gDirColors, DEFAULT_COLORS);
        }
        parseColors(gDirColors, process.env.LS_COLORS ?? "");
        parseColors(gDirColors, ezaColors);
    }

    return gDirColors;
}

/**
 * Wrap the text in the SGR code, leaving any leading or trailing spaces
 * outside, so that underlines and backgrounds don't extend into padding.
 */
function colorText(text: string, sgr: string | undefined): string {
    if (sgr === undefined || !isColorEnabled()) {
        return text;
    }

    const match = text.match(/^( *)(.*?)( *)$/) as RegExpMatchArray;
    if (match[2] === "") {
        return text;
    }

    return match[1] + "\x1b[" + sgr + "m" + match[2] + "\x1b[0m" + match[3];
}

/**
 * Return the SGR code for the filename, or undefined if it should be left
 * uncolored.
 */
function getFilenameSgr(filename: string, trs80File: Trs80File): string | undefined {
    const dirColors = getDirColors();

    // We currently show filenames as FOO.CMD, but TRSDOS writes FOO/CMD, so
    // accept either separator.
    const separator = Math.max(filename.lastIndexOf("."), filename.lastIndexOf("/"));
    if (separator !== -1) {
        const sgr = dirColors.extensions.get(filename.substring(separator + 1).toLowerCase());
        if (sgr !== undefined) {
            return sgr;
        }
    }

    // Many TRS-80 filenames have no extension, so fall back to the decoded type.
    switch (trs80File.className) {
        case "CmdProgram":
        case "SystemProgram":
            return dirColors.keys.get("ex") ?? dirColors.keys.get("fi");

        case "BasicProgram":
        case "Level1Program":
        case "EdtasmFile":
            return dirColors.source ?? dirColors.keys.get("fi");

        default:
            return dirColors.keys.get("fi");
    }
}

/**
 * Color the filename based on its suffix or type.
 */
export function colorFilename(filename: string, trs80File: Trs80File): string {
    return colorText(filename, getFilenameSgr(filename, trs80File));
}

/**
 * Color the formatted size of a file.
 */
export function colorSize(text: string, size: number): string {
    const keys = getDirColors().keys;
    return colorText(text, keys.get(size < 1000 ? "nb" : "nk"));
}

/**
 * Color a formatted date.
 */
export function colorDate(text: string): string {
    return colorText(text, getDirColors().keys.get("da"));
}

/**
 * Color an error message.
 */
export function colorError(text: string): string {
    return colors.error(text);
}
