import {BAD_FILENAME_CHARACTERS} from "./Cpm.js";

/**
 * The longest name part of a CP/M file name.
 */
const MAX_NAME_LENGTH = 8;

/**
 * The longest extension of a CP/M file name.
 */
const MAX_EXTENSION_LENGTH = 3;

/**
 * A CP/M file name, made from what a user typed or from a host file's name. See "CP/M" in FLOPPY_FORMATS.md.
 */
export interface CpmFilename {
    /**
     * The name part, 1 to 8 upper-case characters that CP/M allows in a name.
     */
    readonly name: string;

    /**
     * The extension, 0 to 3 upper-case characters that CP/M allows in a name, or empty for none.
     */
    readonly extension: string;
}

/**
 * The name as CP/M shows it, with a period before any extension, such as "HELLO.TXT".
 */
export function cpmFilenameToString(filename: CpmFilename): string {
    return filename.extension === "" ? filename.name : filename.name + "." + filename.extension;
}

/**
 * Whether a character (already upper-cased) may be in a CP/M name. The directory stores 7-bit ASCII (the high
 * bits are attributes), and the reader refuses control characters, DEL, space, and the characters of
 * BAD_FILENAME_CHARACTERS, so we write nothing else.
 */
function isAllowedCharacter(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code > 0x20 && code < 0x7F && !BAD_FILENAME_CHARACTERS.includes(ch);
}

/**
 * Why a part of a CP/M name isn't valid, or undefined if it is. The part must already be in upper case.
 *
 * @param part the name or the extension.
 * @param what "name" or "extension", for the message.
 * @param maxLength the longest the part may be.
 */
function partProblem(part: string, what: string, maxLength: number): string | undefined {
    if (part.length > maxLength) {
        return `its ${what} is longer than ${maxLength} characters`;
    }
    for (const ch of part) {
        if (!isAllowedCharacter(ch)) {
            const shown = ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) >= 0x7F ?
                "a control or non-ASCII character" : `"${ch}"`;
            return `its ${what} has ${shown}, which CP/M doesn't allow in a name`;
        }
    }
    return undefined;
}

/**
 * Read a CP/M file name as a user typed it, such as "hello.txt" or "README". Case doesn't matter. A user
 * number ("3:HELLO.TXT") or drive letter isn't accepted, since neither means anything here yet.
 *
 * @param text what the user typed.
 * @returns the name, or a message saying what's wrong with it.
 */
export function parseCpmFilename(text: string): CpmFilename | string {
    // Upper-casing a non-ASCII letter can change its length ("ß"), so look for those before it.
    for (const ch of text) {
        if (ch.charCodeAt(0) > 0x7E) {
            return `"${text}" isn't a CP/M file name: it has a control or non-ASCII character`;
        }
    }
    const upper = text.toUpperCase();
    if (upper.includes(":")) {
        return `"${text}" isn't a CP/M file name: leave out the drive or user number`;
    }

    const parts = upper.split(".");
    if (parts.length > 2) {
        return `"${text}" isn't a CP/M file name: it has more than one "."`;
    }
    const [name, extension = ""] = parts;
    if (name === "") {
        return `"${text}" isn't a CP/M file name: it has no name before the extension`;
    }

    const problem = partProblem(name, "name", MAX_NAME_LENGTH) ??
        partProblem(extension, "extension", MAX_EXTENSION_LENGTH);
    if (problem !== undefined) {
        return `"${text}" isn't a CP/M file name: ${problem}`;
    }

    return {name, extension};
}

/**
 * The result of making a CP/M file name from a host file's name.
 */
export interface CpmHostFilenameConversion {
    /**
     * The CP/M name.
     */
    readonly filename: CpmFilename;

    /**
     * Whether characters had to be dropped or the name shortened, so that the CP/M name isn't just the host
     * name in upper case. Callers should tell the user.
     */
    readonly changed: boolean;
}

/**
 * Keep the characters of a host name part that CP/M allows in a name, and cut it to a length.
 */
function cleanPart(part: string, maxLength: number): string {
    return Array.from(part).filter(isAllowedCharacter).join("").substring(0, maxLength);
}

/**
 * Make a CP/M file name from a host file's name, such as "hello-world.txt", which becomes HELLO-WO.TXT. The
 * name is upper-cased, every character that CP/M doesn't allow in a name is dropped (unlike TRSDOS, CP/M
 * allows digits first, hyphens, and most punctuation), and the name and extension are cut to 8 and 3
 * characters. The extension is what follows the last period.
 *
 * @param hostFilename the host file's name, without its directory.
 * @returns the name and whether it differs from the host's, or a message saying why there's no CP/M name to be
 * made (nothing is left of the name).
 */
export function cpmFilenameFromHost(hostFilename: string): CpmHostFilenameConversion | string {
    const upper = hostFilename.toUpperCase();
    const dotIndex = upper.lastIndexOf(".");
    // A leading period (".profile") starts the name, not an extension.
    const hasExtension = dotIndex > 0;
    const hostName = hasExtension ? upper.substring(0, dotIndex) : upper;
    const hostExtension = hasExtension ? upper.substring(dotIndex + 1) : "";

    const name = cleanPart(hostName, MAX_NAME_LENGTH);
    const extension = cleanPart(hostExtension, MAX_EXTENSION_LENGTH);
    if (name === "") {
        return `Can't make a CP/M name from "${hostFilename}", since nothing of its name is left that CP/M ` +
            `allows. Give one with --as.`;
    }

    const changed = hostName !== name || hostExtension !== extension;
    return {filename: {name, extension}, changed};
}
