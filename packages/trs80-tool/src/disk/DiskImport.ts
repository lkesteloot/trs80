import path from "path";
import {
    BASIC_HEADER_BYTE, BASIC_TAPE_HEADER_BYTE, BasicProgram, decodeBasicProgram, decodeTrs80File,
    parseBasicText, type Trs80File,
} from "trs80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {assertNever} from "z80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";

/**
 * Host file extensions (lower case, with the period) whose files are text, so that the "disk add"
 * command converts their line endings (LF or CRLF on the host) to the CR that TRS-80 text files use.
 * Any other extension (other than .bas, .cas, and .3bn, which have their own conversions) is copied
 * as it is.
 */
export const TEXT_FILE_EXTENSIONS: readonly string[] =
    [".txt", ".asm", ".jcl", ".doc", ".hlp", ".lst", ".fix", ".src"];

const CR = 0x0D;
const LF = 0x0A;

/**
 * Options that control how a host file is converted for the disk.
 */
export interface ImportOptions {
    /** Keep BASIC programs as text (with CR line endings) instead of tokenizing them. */
    ascii: boolean;
    /** Copy every file exactly as it is, with no conversion. */
    binary: boolean;
}

/**
 * The result of converting a host file for the disk.
 */
export interface ImportResult {
    /** The bytes to store on the disk. */
    contents: Uint8Array;
    /**
     * The TRSDOS extension (upper case, without a period) that the file should have if the user
     * didn't name it, because the conversion changed what kind of file it is (such as "CMD" for a
     * converted system program). Undefined to keep the host file's extension.
     */
    extension: string | undefined;
    /** What was done, one sentence each, such as "Tokenized hello.bas.". Empty if nothing changed. */
    messages: string[];
}

/**
 * Convert a host file's bytes into what the disk should hold, depending on what kind of file it
 * is (see the "add" command in the site's documentation): BASIC text is tokenized, system programs
 * become CMD programs, text files get CR line endings, and everything else is unchanged.
 *
 * @param hostPathname the host file's path, whose base name is used in messages and whose extension
 * says what kind of file it is.
 * @param bytes the host file's contents.
 * @param options the conversion options.
 * @returns the converted file.
 * @throws ToolError if the file can't be converted, or the options contradict each other.
 */
export function importHostFile(hostPathname: string, bytes: Uint8Array, options: ImportOptions): ImportResult {
    if (options.ascii && options.binary) {
        throw new ToolError("Use either --ascii or --binary, not both");
    }

    if (options.binary) {
        return {contents: bytes, extension: undefined, messages: []};
    }

    const hostName = path.basename(hostPathname);
    const hostExtension = path.extname(hostName).toLowerCase();

    if (hostExtension === ".bas") {
        return importBasicFile(hostName, bytes, options.ascii);
    } else if (hostExtension === ".cas") {
        return importCassetteFile(hostName, bytes, options.ascii);
    } else if (hostExtension === ".3bn") {
        return importSystemProgramFile(hostName, bytes);
    } else if (TEXT_FILE_EXTENSIONS.includes(hostExtension)) {
        return importTextFile(hostName, bytes);
    } else {
        return {contents: bytes, extension: undefined, messages: []};
    }
}

/**
 * Convert the line endings of a text file to CR.
 *
 * @param hostName the host file's name, for the message.
 * @param bytes the host file's contents.
 */
function importTextFile(hostName: string, bytes: Uint8Array): ImportResult {
    const contents = convertLineEndings(bytes);
    const messages: string[] = [];
    if (contents.length !== bytes.length || contents.some((b, i) => b !== bytes[i])) {
        messages.push("Converted line endings of " + hostName + ".");
    }
    return {contents, extension: undefined, messages};
}

/**
 * Convert LF and CRLF line endings to CR. A lone CR is left alone.
 *
 * @param bytes the text.
 * @returns a new array.
 */
export function convertLineEndings(bytes: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === CR && i + 1 < bytes.length && bytes[i + 1] === LF) {
            // CRLF becomes CR.
            out.push(CR);
            i++;
        } else if (b === LF) {
            out.push(CR);
        } else {
            out.push(b);
        }
    }
    return Uint8Array.from(out);
}

/**
 * Convert a .bas file. Tokenized BASIC is kept (or turned back into text with --ascii), and BASIC
 * text is tokenized (or kept as text with --ascii).
 *
 * @param hostName the host file's name.
 * @param bytes the host file's contents.
 * @param ascii whether the BASIC program should be stored as text.
 * @throws ToolError if the file is neither tokenized BASIC nor BASIC text.
 */
function importBasicFile(hostName: string, bytes: Uint8Array, ascii: boolean): ImportResult {
    const program = decodeBasicProgram(bytes);
    if (program !== undefined) {
        if (program.error !== undefined) {
            throw new ToolError("Can't add " + hostName + ": it looks like tokenized BASIC but is damaged (" +
                program.error + "). Use --binary to copy it as it is.");
        }
        return basicProgramResult(hostName, program, ascii, "");
    }

    // Not tokenized, so it should be text.
    if (ascii) {
        return {
            contents: ensureFinalCr(convertLineEndings(bytes)),
            extension: undefined,
            messages: [],
        };
    }

    const tokenized = parseBasicText(bytes);
    if (typeof tokenized === "string") {
        throw new ToolError(basicTextErrorMessage(hostName, bytes, tokenized));
    }
    return {contents: tokenized, extension: undefined, messages: ["Tokenized " + hostName + "."]};
}

/**
 * Make the result for a BASIC program that's already tokenized.
 *
 * @param hostName the host file's name, for messages.
 * @param program the decoded program.
 * @param ascii whether the program should be stored as text.
 * @param extension the TRSDOS extension to suggest, or the empty string for none.
 */
function basicProgramResult(hostName: string, program: BasicProgram, ascii: boolean,
                            extension: string): ImportResult {

    const messages: string[] = [];
    let contents: Uint8Array;
    if (ascii) {
        contents = ensureFinalCr(convertLineEndings(latin1Bytes(program.asAscii())));
        messages.push("Converted " + hostName + " to text.");
    } else {
        contents = diskFormatBasic(program.binary);
        if (contents !== program.binary) {
            messages.push("Converted " + hostName + " from cassette to disk format.");
        }
    }
    return {contents, extension: extension === "" ? undefined : extension, messages};
}

/**
 * Put a tokenized program in the form that Disk BASIC stores: with the single 0xFF header byte
 * instead of the cassette's three 0xD3 bytes and a name.
 *
 * @param binary the tokenized program, in either form.
 * @returns the same array if it was already in disk form, or a new array.
 */
function diskFormatBasic(binary: Uint8Array): Uint8Array {
    if (binary.length >= 4 && binary[0] === BASIC_TAPE_HEADER_BYTE) {
        return concatByteArrays([new Uint8Array([BASIC_HEADER_BYTE]), binary.slice(4)]);
    }
    return binary;
}

/**
 * Convert a string of characters 0 to 255 to bytes.
 */
function latin1Bytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        bytes[i] = code < 256 ? code : 0x3F;
    }
    return bytes;
}

/**
 * Add a CR at the end if the text doesn't end with a line ending.
 */
function ensureFinalCr(bytes: Uint8Array): Uint8Array {
    if (bytes.length === 0 || bytes[bytes.length - 1] === CR) {
        return bytes;
    }
    return concatByteArrays([bytes, new Uint8Array([CR])]);
}

/**
 * Build the error message for BASIC text that doesn't parse, naming the file and, where we can
 * find it, the line.
 *
 * @param hostName the host file's name.
 * @param bytes the file's contents.
 * @param parseError the message that parseBasicText() gave for the whole file.
 */
function basicTextErrorMessage(hostName: string, bytes: Uint8Array, parseError: string): string {
    const suffix = ". Use --ascii to keep it as text, or --binary to copy it as it is.";
    let text: string;
    try {
        text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    } catch {
        return "Can't add " + hostName + ": it's neither tokenized BASIC nor BASIC text (" + parseError + ")" +
            suffix;
    }

    // Find the first line at which the program, up to that line, fails to parse. Parse errors
    // persist as more lines are added, so we can bisect.
    const lines = text.split(/\r\n|\r|\n/);
    let low = 1;
    let high = lines.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        const result = parseBasicText(lines.slice(0, mid).join("\n"));
        if (typeof result === "string") {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    return "Can't tokenize " + hostName + " at line " + low.toLocaleString() + " of the file: " + parseError + suffix;
}

/**
 * Convert a .cas file that holds one program. A system program becomes a CMD program, and a
 * BASIC program is kept tokenized (or as text with --ascii).
 *
 * @param hostName the host file's name.
 * @param bytes the host file's contents.
 * @param ascii whether a BASIC program should be stored as text.
 * @throws ToolError if the cassette is empty, has several programs, or has something else.
 */
function importCassetteFile(hostName: string, bytes: Uint8Array, ascii: boolean): ImportResult {
    const trs80File = decodeTrs80File(bytes, {filename: hostName});
    if (trs80File.className !== "Cassette" || trs80File.error !== undefined) {
        throw new ToolError("Can't add " + hostName + ": it isn't a CAS file that can be read" +
            (trs80File.error === undefined ? "" : " (" + trs80File.error + ")") +
            ". Use --binary to copy it as it is.");
    }

    if (trs80File.files.length === 0) {
        throw new ToolError("Can't add " + hostName + ": the cassette has no programs. " +
            "Use --binary to copy it as it is.");
    }
    if (trs80File.files.length > 1) {
        throw new ToolError("Can't add " + hostName + ": the cassette has " +
            pluralizeWithCount(trs80File.files.length, "program") + ". Use \"trs80-tool extract\" to get the " +
            "programs out of it first, or --binary to copy it as it is.");
    }

    return importProgram(hostName, trs80File.files[0].file, ascii);
}

/**
 * Convert a .3bn file, which is a system program, to a CMD program.
 *
 * @param hostName the host file's name.
 * @param bytes the host file's contents.
 * @throws ToolError if the file isn't a system program.
 */
function importSystemProgramFile(hostName: string, bytes: Uint8Array): ImportResult {
    const trs80File = decodeTrs80File(bytes, {filename: hostName});
    if (trs80File.className !== "SystemProgram" || trs80File.error !== undefined) {
        throw new ToolError("Can't add " + hostName + ": it isn't a system program that can be read" +
            (trs80File.error === undefined ? "" : " (" + trs80File.error + ")") +
            ". Use --binary to copy it as it is.");
    }

    return importProgram(hostName, trs80File, false);
}

/**
 * Convert a program that came out of a cassette or a .3bn file, as "convert" would for the
 * disk's formats: system programs become CMD programs, and BASIC programs are tokenized.
 *
 * @param hostName the host file's name, whose base name names a system program that has no name of its own.
 * @param trs80File the decoded program.
 * @param ascii whether a BASIC program should be stored as text.
 * @throws ToolError if it's some other kind of program.
 */
function importProgram(hostName: string, trs80File: Trs80File, ascii: boolean): ImportResult {
    switch (trs80File.className) {
        case "SystemProgram": {
            const baseName = path.parse(hostName).name.toUpperCase();
            const cmdProgram = trs80File.toCmdProgram(baseName);
            return {
                contents: cmdProgram.binary,
                extension: "CMD",
                messages: ["Converted " + hostName + " to a CMD program."],
            };
        }

        case "BasicProgram":
            return basicProgramResult(hostName, trs80File, ascii, "BAS");

        case "CmdProgram":
        case "Level1Program":
        case "EdtasmFile":
        case "RawBinaryFile":
        case "Cassette":
        case "BootSector":
        case "Jv1FloppyDisk":
        case "Jv3FloppyDisk":
        case "DmkFloppyDisk":
        case "ScpFloppyDisk":
        case "HfeFloppyDisk":
        case "ImdFloppyDisk":
        case "HdvHardDisk":
            throw new ToolError("Can't add " + hostName + ": it holds a " + trs80File.getDescription().toLowerCase() +
                ", which can't be put on a disk. Use --binary to copy it as it is.");

        default:
            assertNever(trs80File);
    }
}
