/**
 * The longest name part of a TRSDOS file name.
 */
const MAX_NAME_LENGTH = 8;

/**
 * The longest extension of a TRSDOS file name.
 */
const MAX_EXTENSION_LENGTH = 3;

/**
 * A TRSDOS file name, made from what a user typed or from a host file's name.
 */
export interface TrsdosFilename {
    /**
     * The name part, 1 to 8 uppercase letters and digits, the first a letter.
     */
    readonly name: string;

    /**
     * The extension, 0 to 3 uppercase letters and digits, the first a letter, or empty for none.
     */
    readonly extension: string;
}

/**
 * The name as TRSDOS shows it, with a slash before any extension, such as "HELLO/BAS".
 */
export function trsdosFilenameToString(filename: TrsdosFilename): string {
    return filename.extension === "" ? filename.name : filename.name + "/" + filename.extension;
}

/**
 * The name as a directory entry stores it: the name and the extension, each padded with spaces,
 * 11 characters in all, as {@link hashForFilename} takes it.
 */
export function trsdosFilenameToRaw(filename: TrsdosFilename): string {
    return filename.name.padEnd(MAX_NAME_LENGTH, " ") + filename.extension.padEnd(MAX_EXTENSION_LENGTH, " ");
}

/**
 * Why a part of a TRSDOS name isn't valid, or undefined if it is: it must be letters and digits,
 * the first a letter, and not too long. The part must already be in upper case.
 *
 * @param part the name or the extension.
 * @param what "name" or "extension", for the message.
 * @param maxLength the longest the part may be.
 */
function partProblem(part: string, what: string, maxLength: number): string | undefined {
    if (part.length > maxLength) {
        return `its ${what} is longer than ${maxLength} characters`;
    }
    if (part !== "" && !/^[A-Z][A-Z0-9]*$/.test(part)) {
        return `its ${what} must be letters and digits, starting with a letter`;
    }
    return undefined;
}

/**
 * Read a TRSDOS file name as a user typed it, such as "hello.bas" or "HELLO/BAS". Case doesn't
 * matter, and either "/" or "." may come before the extension, since a TRSDOS name can't contain a
 * period. A drive number (":1") or password (TRSDOS's ".PASSWORD" after the extension) isn't
 * accepted, since neither means anything here.
 *
 * @param text what the user typed.
 * @returns the name, or a message saying what's wrong with it.
 */
export function parseTrsdosFilename(text: string): TrsdosFilename | string {
    const upper = text.toUpperCase();
    if (upper.includes(":")) {
        return `"${text}" isn't a TRSDOS file name: leave out the drive number`;
    }

    const parts = upper.split(/[/.]/);
    if (parts.length > 2) {
        return `"${text}" isn't a TRSDOS file name: it has more than one "/" or "."`;
    }
    const [name, extension = ""] = parts;
    if (name === "") {
        return `"${text}" isn't a TRSDOS file name: it has no name before the extension`;
    }

    const problem = partProblem(name, "name", MAX_NAME_LENGTH) ??
        partProblem(extension, "extension", MAX_EXTENSION_LENGTH);
    if (problem !== undefined) {
        return `"${text}" isn't a TRSDOS file name: ${problem}`;
    }

    return {name, extension};
}

/**
 * The result of making a TRSDOS file name from a host file's name.
 */
export interface HostFilenameConversion {
    /**
     * The TRSDOS name.
     */
    readonly filename: TrsdosFilename;

    /**
     * Whether characters had to be dropped or the name shortened, so that the TRSDOS name isn't
     * just the host name in upper case. Callers should tell the user.
     */
    readonly changed: boolean;
}

/**
 * Make a TRSDOS file name from a host file's name, such as "hello-world.bas", which becomes
 * HELLOWOR/BAS. The name is upper-cased, everything but letters and digits is dropped, and the
 * name and extension are cut to 8 and 3 characters. The extension is what follows the last period.
 *
 * @param hostFilename the host file's name, without its directory.
 * @returns the name and whether it differs from the host's, or a message saying why there's no
 * TRSDOS name to be made (no letters before the extension, or a name that starts with a digit).
 */
export function trsdosFilenameFromHost(hostFilename: string): HostFilenameConversion | string {
    const upper = hostFilename.toUpperCase();
    const dotIndex = upper.lastIndexOf(".");
    // A leading period (".profile") starts the name, not an extension.
    const hasExtension = dotIndex > 0;
    const hostName = hasExtension ? upper.substring(0, dotIndex) : upper;
    const hostExtension = hasExtension ? upper.substring(dotIndex + 1) : "";

    const name = hostName.replace(/[^A-Z0-9]/g, "").substring(0, MAX_NAME_LENGTH);
    const extension = hostExtension.replace(/[^A-Z0-9]/g, "").substring(0, MAX_EXTENSION_LENGTH);

    if (name === "" || !/^[A-Z]/.test(name)) {
        return `Can't make a TRSDOS name from "${hostFilename}", since TRSDOS names start with a letter. ` +
            `Give one with --as.`;
    }
    // An extension that starts with a digit can't be kept as one; leave it off rather than guess.
    const keptExtension = /^[A-Z]/.test(extension) ? extension : "";

    const filename = {name, extension: keptExtension};
    const changed = hostName !== name || hostExtension !== keptExtension;
    return {filename, changed};
}
