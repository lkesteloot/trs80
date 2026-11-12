import {
    BASIC_HEADER_BYTE, BASIC_TAPE_HEADER_BYTE, BasicDialect, basicDialectToString, BasicProgram, decodeBasicProgram,
    decodeTrs80File, guessBasicDialect, parseBasicText, type Trs80File,
} from "trs80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {assertNever} from "z80-base";
import {DiskError} from "./DiskError.js";
import {pluralizeWithCount} from "./Plural.js";

/**
 * Host file extensions (lower case, with the period) whose files are text, so that the "disk add"
 * command converts their line endings (LF or CRLF on the host) to the CR that TRS-80 text files use.
 * Any other extension (other than .bas, .cas, and .3bn, which have their own conversions) is copied
 * as it is.
 */
export const TEXT_FILE_EXTENSIONS: readonly string[] =
    [".txt", ".asm", ".jcl", ".doc", ".hlp", ".lst", ".fix", ".src"];

/**
 * The extension of a file name without directories, including the period, as path.posix.extname() gives
 * it: from the last period to the end, or an empty string if there's no period or the only one is the
 * name's first character.
 */
export function extensionOf(name: string): string {
    const index = name.lastIndexOf(".");
    return index <= 0 ? "" : name.substring(index);
}

/**
 * The name of a file without its extension, as path.posix.parse().name gives it for a name without
 * directories.
 */
export function stemOf(name: string): string {
    return name.substring(0, name.length - extensionOf(name).length);
}

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
    /** Treat every file as text, whatever its extension: convert its line endings to CR, and nothing else. */
    text: boolean;
    /**
     * The BASIC that the disk's programs are for: BASIC text is tokenized for it, and a tokenized program that
     * is clearly for the other one is converted. It's also the one that a tokenized program's tokens are read as
     * when the bytes don't say which BASIC they're for.
     */
    basic: BasicDialect;
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
 * @param hostName the host file's name without directories, which is used in messages and whose extension
 * says what kind of file it is.
 * @param bytes the host file's contents.
 * @param options the conversion options.
 * @returns the converted file.
 * @throws DiskError if the file can't be converted, or the options contradict each other.
 */
export function importHostFile(hostName: string, bytes: Uint8Array, options: ImportOptions): ImportResult {
    checkImportOptions(options);

    if (options.binary) {
        return {contents: bytes, extension: undefined, messages: []};
    }
    if (options.text) {
        return importTextFile(hostName, bytes);
    }

    const hostExtension = extensionOf(hostName).toLowerCase();

    if (hostExtension === ".bas") {
        return importBasicFile(hostName, bytes, options.ascii, options.basic);
    } else if (hostExtension === ".cas") {
        return importCassetteFile(hostName, bytes, options.ascii, options.basic);
    } else if (hostExtension === ".3bn") {
        return importSystemProgramFile(hostName, bytes);
    } else if (TEXT_FILE_EXTENSIONS.includes(hostExtension)) {
        return importTextFile(hostName, bytes);
    } else {
        return {contents: bytes, extension: undefined, messages: []};
    }
}

/**
 * Check that the conversion options don't contradict each other: --binary turns off every conversion, which
 * --ascii and --text ask for.
 *
 * @throws DiskError if they do.
 */
export function checkImportOptions(options: Pick<ImportOptions, "ascii" | "binary" | "text">): void {
    if (options.binary && options.ascii) {
        throw new DiskError("Use either --ascii or --binary, not both");
    }
    if (options.binary && options.text) {
        throw new DiskError("Use either --text or --binary, not both");
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
 * The words that say which BASIC a program was tokenized for, or nothing for the Model III's, which is
 * what everything assumes without being told.
 *
 * @param basic the BASIC.
 * @returns text that follows "Tokenized x.bas", such as " for Model 4 BASIC".
 */
function forBasicNote(basic: BasicDialect): string {
    switch (basic) {
        case BasicDialect.MODEL_III:
            return "";
        case BasicDialect.MODEL_4:
            return " for " + basicDialectToString(basic) + " BASIC";
        default:
            assertNever(basic);
    }
}

/**
 * The words that say which BASIC a tokenized program was read as, or nothing for the Model III's.
 *
 * @param basic the BASIC.
 * @returns text that follows "Converted x.bas to text", such as ", reading its tokens as Model 4 BASIC".
 */
function readAsNote(basic: BasicDialect): string {
    switch (basic) {
        case BasicDialect.MODEL_III:
            return "";
        case BasicDialect.MODEL_4:
            return ", reading its tokens as " + basicDialectToString(basic) + " BASIC";
        default:
            assertNever(basic);
    }
}

/**
 * Convert a .bas file. Tokenized BASIC is kept (or turned back into text with --ascii), and BASIC
 * text is tokenized (or kept as text with --ascii).
 *
 * A tokenized program doesn't say which BASIC it's for. We read it as the one its bytes fit (see
 * guessBasicDialect()) or else as the disk's, and if it's clearly for the other BASIC we convert it to the disk's.
 *
 * @param hostName the host file's name.
 * @param bytes the host file's contents.
 * @param ascii whether the BASIC program should be stored as text.
 * @param basic the disk's BASIC.
 * @throws DiskError if the file is neither tokenized BASIC nor BASIC text.
 */
function importBasicFile(hostName: string, bytes: Uint8Array, ascii: boolean, basic: BasicDialect): ImportResult {
    const sourceBasic = guessBasicDialect(bytes) ?? basic;
    const program = decodeBasicProgram(bytes, sourceBasic);
    if (program !== undefined) {
        if (program.error !== undefined) {
            throw new DiskError("Can't add " + hostName + ": it looks like tokenized BASIC but is damaged (" +
                program.error + "). Use --binary to copy it as it is.");
        }
        return basicProgramResult(hostName, program, sourceBasic, ascii, basic, "");
    }

    // Not tokenized, so it should be text.
    if (ascii) {
        return {
            contents: ensureFinalCr(convertLineEndings(bytes)),
            extension: undefined,
            messages: [],
        };
    }

    const tokenized = parseBasicText(bytes, basic);
    if (typeof tokenized === "string") {
        throw new DiskError(basicTextErrorMessage(hostName, bytes, tokenized, basic));
    }
    return {
        contents: tokenized,
        extension: undefined,
        messages: ["Tokenized " + hostName + forBasicNote(basic) + "."],
    };
}

/**
 * Make the result for a BASIC program that's already tokenized.
 *
 * @param hostName the host file's name, for messages.
 * @param program the decoded program.
 * @param sourceBasic the BASIC that the program was decoded as.
 * @param ascii whether the program should be stored as text.
 * @param basic the disk's BASIC. A program for a different one is converted to it by way of its text.
 * @param extension the TRSDOS extension to suggest, or the empty string for none.
 */
function basicProgramResult(hostName: string, program: BasicProgram, sourceBasic: BasicDialect, ascii: boolean,
                            basic: BasicDialect, extension: string): ImportResult {

    const messages: string[] = [];
    let contents: Uint8Array;
    if (ascii) {
        contents = ensureFinalCr(convertLineEndings(latin1Bytes(program.asAscii())));
        messages.push("Converted " + hostName + " to text" + readAsNote(sourceBasic) + ".");
    } else if (sourceBasic !== basic) {
        // The text of the program is the same in any BASIC, so tokenize it again for the disk's.
        const tokenized = parseBasicText(program.asAscii(), basic);
        if (typeof tokenized === "string") {
            throw new DiskError("Can't convert " + hostName + " from " + basicDialectToString(sourceBasic) +
                " to " + basicDialectToString(basic) + " BASIC (" + tokenized + "). Use --ascii to keep it as " +
                "text, or --binary to copy it as it is.");
        }
        contents = tokenized;
        messages.push("Converted " + hostName + " from " + basicDialectToString(sourceBasic) + " to " +
            basicDialectToString(basic) + " BASIC tokens.");
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
 * @param basic the BASIC that the text was being tokenized for.
 */
function basicTextErrorMessage(hostName: string, bytes: Uint8Array, parseError: string, basic: BasicDialect): string {
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
        const result = parseBasicText(lines.slice(0, mid).join("\n"), basic);
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
 * @param basic the disk's BASIC.
 * @throws DiskError if the cassette is empty, has several programs, or has something else.
 */
function importCassetteFile(hostName: string, bytes: Uint8Array, ascii: boolean, basic: BasicDialect): ImportResult {
    const trs80File = decodeTrs80File(bytes, {filename: hostName});
    if (trs80File.className !== "Cassette" || trs80File.error !== undefined) {
        throw new DiskError("Can't add " + hostName + ": it isn't a CAS file that can be read" +
            (trs80File.error === undefined ? "" : " (" + trs80File.error + ")") +
            ". Use --binary to copy it as it is.");
    }

    if (trs80File.files.length === 0) {
        throw new DiskError("Can't add " + hostName + ": the cassette has no programs. " +
            "Use --binary to copy it as it is.");
    }
    if (trs80File.files.length > 1) {
        throw new DiskError("Can't add " + hostName + ": the cassette has " +
            pluralizeWithCount(trs80File.files.length, "program") + ". Use \"trs80-tool extract\" to get the " +
            "programs out of it first, or --binary to copy it as it is.");
    }

    return importProgram(hostName, trs80File.files[0].file, ascii, basic);
}

/**
 * Convert a .3bn file, which is a system program, to a CMD program.
 *
 * @param hostName the host file's name.
 * @param bytes the host file's contents.
 * @throws DiskError if the file isn't a system program.
 */
function importSystemProgramFile(hostName: string, bytes: Uint8Array): ImportResult {
    const trs80File = decodeTrs80File(bytes, {filename: hostName});
    if (trs80File.className !== "SystemProgram" || trs80File.error !== undefined) {
        throw new DiskError("Can't add " + hostName + ": it isn't a system program that can be read" +
            (trs80File.error === undefined ? "" : " (" + trs80File.error + ")") +
            ". Use --binary to copy it as it is.");
    }

    return importProgram(hostName, trs80File, false, BasicDialect.MODEL_III);
}

/**
 * Convert a program that came out of a cassette or a .3bn file, as "convert" would for the
 * disk's formats: system programs become CMD programs, and BASIC programs are tokenized.
 *
 * @param hostName the host file's name, whose base name names a system program that has no name of its own.
 * @param trs80File the decoded program.
 * @param ascii whether a BASIC program should be stored as text.
 * @param basic the disk's BASIC. A cassette's BASIC program is a Model III one.
 * @throws DiskError if it's some other kind of program.
 */
function importProgram(hostName: string, trs80File: Trs80File, ascii: boolean, basic: BasicDialect): ImportResult {
    switch (trs80File.className) {
        case "SystemProgram": {
            const baseName = stemOf(hostName).toUpperCase();
            const cmdProgram = trs80File.toCmdProgram(baseName);
            return {
                contents: cmdProgram.binary,
                extension: "CMD",
                messages: ["Converted " + hostName + " to a CMD program."],
            };
        }

        case "BasicProgram":
            return basicProgramResult(hostName, trs80File, BasicDialect.MODEL_III, ascii, basic, "BAS");

        case "CmdProgram":
        case "Level1Program":
        case "EdtasmFile":
        case "RawBinaryFile":
        case "Cassette":
        case "BootSector":
        case "HiResScreen":
        case "Jv1FloppyDisk":
        case "Jv3FloppyDisk":
        case "DmkFloppyDisk":
        case "ScpFloppyDisk":
        case "HfeFloppyDisk":
        case "ImdFloppyDisk":
        case "HdvHardDisk":
            throw new DiskError("Can't add " + hostName + ": it holds a " + trs80File.getDescription().toLowerCase() +
                ", which can't be put on a disk. Use --binary to copy it as it is.");

        default:
            assertNever(trs80File);
    }
}
