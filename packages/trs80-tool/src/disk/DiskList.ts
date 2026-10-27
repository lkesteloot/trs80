import {program} from "commander";
import {BasicProgram, decodeTrs80File} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {hexdumpLines} from "../hexdump.js";
import type {InputFile} from "../InputFile.js";
import {selectInputFiles} from "../InputFile.js";
import {pageTextSync} from "../pager.js";
import {systemWildcardHint, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import type {DiskSession} from "./DiskSession.js";

/**
 * The first byte of a tokenized Basic program saved to a disk. (The cassette header, 0xD3, is also accepted.)
 */
const BASIC_DISK_HEADER_BYTE = 0xFF;
const BASIC_TAPE_HEADER_BYTE = 0xD3;

/**
 * The byte that ends a CP/M text file, and that pads out the last sector of one.
 */
const CTRL_Z = 0x1A;

/**
 * The largest share of the bytes of a file, as one in this many, that can be unprintable for the file to
 * still count as text. A little slack lets through a text file with a few stray graphics characters.
 */
const TEXT_BAD_BYTE_DIVISOR = 20;

/**
 * How "list" shows a file.
 */
enum ListKind {
    /** A tokenized Basic program, as a source listing. */
    BASIC,
    /** Text, with host line endings. */
    TEXT,
    /** Anything else, as an annotated hex dump. */
    HEX,
}

/**
 * Whether the bytes of a file are text, by this test: after removing trailing Ctrl-Z and NUL bytes (the padding
 * that CP/M and the DOS sector sizes leave), the file must have no NUL bytes at all, and at most one byte in
 * twenty can be something other than a printable ASCII character (0x20 to 0x7E), tab, CR, or LF. Tokenized Basic,
 * CMD programs and data files all have NULs, and they have far more than one odd byte in twenty. An empty
 * file counts as text (it lists as nothing), but a file of nothing but padding does not.
 *
 * @param binary the bytes of the file.
 */
export function looksLikeText(binary: Uint8Array): boolean {
    let end = binary.length;
    while (end > 0 && (binary[end - 1] === CTRL_Z || binary[end - 1] === 0)) {
        end--;
    }
    if (end === 0) {
        return binary.length === 0;
    }

    let badCount = 0;
    for (let i = 0; i < end; i++) {
        const c = binary[i];
        if (c === 0) {
            return false;
        }
        const isOk = c === 0x09 || c === 0x0A || c === 0x0D || (c >= 0x20 && c < 0x7F);
        if (!isOk) {
            badCount++;
        }
    }

    return badCount * TEXT_BAD_BYTE_DIVISOR <= end;
}

/**
 * Split the bytes of a text file into lines. CR, CRLF, and LF each end a line, whichever mix the file has,
 * and so (without leaving an empty line after it) does the end of the file. Trailing Ctrl-Z and NUL padding is
 * dropped. A byte that isn't a printable ASCII character or a tab is shown as a muted ".", so that stray
 * bytes can't send commands to the terminal.
 *
 * @param binary the bytes of the file.
 * @return the lines, without terminators.
 */
export function textLines(binary: Uint8Array): string[] {
    let end = binary.length;
    while (end > 0 && (binary[end - 1] === CTRL_Z || binary[end - 1] === 0)) {
        end--;
    }

    // One character per byte, since the TRS-80 isn't Unicode.
    let text = "";
    for (let i = 0; i < end; i++) {
        text += String.fromCharCode(binary[i]);
    }
    const lines = text.split(/\r\n|\r|\n/);
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }

    return lines.map(line => line.replace(/[^\t\x20-\x7E]/g, colors.muted(".")));
}

/**
 * Choose how to show a file, and the bytes to show it from.
 *
 * @param inFile the file.
 * @param forceHex whether the user asked for a hex dump no matter what the file is.
 * @return the kind, and for text the bytes to split into lines (a file system can have its own idea of
 * a text file's host text, as UCSD Pascal does).
 */
function chooseListKind(inFile: InputFile, forceHex: boolean): { kind: ListKind, textBytes: Uint8Array } {
    if (forceHex) {
        return { kind: ListKind.HEX, textBytes: inFile.binary };
    }

    const hostText = inFile.getHostText();
    if (hostText !== undefined) {
        return { kind: ListKind.TEXT, textBytes: hostText };
    }

    const firstByte = inFile.binary.length > 0 ? inFile.binary[0] : undefined;
    const isTokenized = firstByte === BASIC_DISK_HEADER_BYTE || firstByte === BASIC_TAPE_HEADER_BYTE;
    if (inFile.trs80File instanceof BasicProgram && isTokenized) {
        return { kind: ListKind.BASIC, textBytes: inFile.binary };
    }

    // A text file of Basic source has been tokenized for us by the decoder, but it's more faithful to show the
    // text as it is.
    if (looksLikeText(inFile.binary)) {
        return { kind: ListKind.TEXT, textBytes: inFile.binary };
    }

    return { kind: ListKind.HEX, textBytes: inFile.binary };
}

/**
 * Whether the first byte array is the start of the second (or all of it).
 */
function isPrefix(prefix: Uint8Array, bytes: Uint8Array): boolean {
    return prefix.length <= bytes.length && prefix.every((byte, i) => byte === bytes[i]);
}

/**
 * The lines of an annotated hex dump of a file, as the top-level "hexdump" command makes (it decodes the file
 * with disassembly, so system programs are annotated with their code). The decoded binary can be the start of
 * the file, as with a program padded to a whole sector after its end, and the annotations then cover that start.
 * They're left out for a file whose decoded binary isn't the bytes on the disk at all, as with a text file of
 * Basic that the decoder tokenized.
 */
function hexLines(inFile: InputFile): string[] {
    const decoded = decodeTrs80File(inFile.binary, { filename: inFile.filename, disassemble: true });
    const annotations = isPrefix(decoded.binary, inFile.binary) ? decoded.annotations : [];
    return hexdumpLines(inFile.binary, true, annotations);
}

/**
 * The lines that "list" shows for one file.
 *
 * @param inFile the file.
 * @param forceHex whether to dump the file in hex whatever it is.
 * @return the lines, which end with a note if the file is damaged or couldn't be fully decoded.
 */
function listLines(inFile: InputFile, forceHex: boolean): string[] {
    const { kind, textBytes } = chooseListKind(inFile, forceHex);

    let lines: string[];
    switch (kind) {
        case ListKind.BASIC: {
            // asAscii() ends with a newline.
            lines = (inFile.trs80File as BasicProgram).asAscii().split("\n");
            if (lines[lines.length - 1] === "") {
                lines.pop();
            }
            if (inFile.trs80File.error !== undefined) {
                lines.push(colors.error(inFile.trs80File.error));
            }
            break;
        }

        case ListKind.TEXT:
            lines = textLines(textBytes);
            break;

        case ListKind.HEX:
            lines = hexLines(inFile);
            break;

        default:
            assertNever(kind);
    }

    if (inFile.damage !== undefined) {
        lines.push(colors.warning("Damaged: " + inFile.damage.toString()));
    }

    return lines;
}

/**
 * Whether output may go to a pager: unless the user gave the program-level --no-pager.
 */
function pagerAllowed(): boolean {
    return program.opts().pager !== false;
}

/**
 * Print lines to the console, through the pager if stdout is a terminal and there is one. The "disk" command
 * runs its commands synchronously, so it can't use the pager that other commands use (see pageTextSync()).
 * Quitting the pager early just ends the listing.
 */
export function printLines(lines: string[]): void {
    if (lines.length === 0) {
        return;
    }

    const text = lines.join("\n") + "\n";
    const wasPaged = pagerAllowed() && pageTextSync(text);
    if (!wasPaged) {
        for (const line of lines) {
            console.log(line);
        }
    }
}

/**
 * Find the files that the name selects.
 *
 * @param session the open disk.
 * @param pattern the name or pattern the user gave. A name selects a system file, but a wildcard doesn't.
 * @throws ToolError if no file matches, saying so if only a system file would match the wildcard.
 */
function selectListFiles(session: DiskSession, pattern: string): InputFile[] {
    const { selected, unmatchedPattern, unmatchedOnlySystem } =
        selectInputFiles(session.getInputFiles(true), [pattern], false);
    if (unmatchedPattern === undefined) {
        return selected;
    }

    throw new ToolError("No file on the disk matches \"" + pattern + "\"" + systemWildcardHint(unmatchedOnlySystem));
}

/**
 * The "list" command: show a file's contents. It only reads, so it works on any disk whose file system
 * we can read, including a read-only one.
 */
export const LIST_COMMAND: DiskCommand = {
    spec: {
        name: "list",
        aliases: ["type", "cat"],
        args: "<NAME>",
        summary: "show a file's contents: BASIC programs as listings, text as text, anything else as a hex dump",
        options: [
            {
                name: "--hex",
                valueName: undefined,
                description: "show a hex dump whatever the file is",
            },
            {
                name: "--raw",
                valueName: undefined,
                description: "write the file's bytes unchanged to standard output, with no pager, for piping",
            },
        ],
        extraHelp: [
            "A pattern that matches several files shows each, under a header line with its name.",
            "A wildcard never matches a system file; to show one, give its name.",
            "Text is a file with no NUL bytes and almost all printable characters (CR, CRLF and LF end its lines).",
        ],
    },

    endsSession: false,

    /**
     * Show the file that the name selects (or each, if a pattern selects several), in the manner of its kind:
     * a Basic listing, text with host line endings, or a hex dump. With --raw, write the unchanged bytes to
     * standard output instead.
     */
    run(session, command) {
        const forceHex = command.options.has("--hex");
        const raw = command.options.has("--raw");
        if (forceHex && raw) {
            throw new ToolError("Use either --hex or --raw, not both");
        }

        const inFiles = selectListFiles(session, command.args[0]);
        if (raw) {
            for (const inFile of inFiles) {
                process.stdout.write(inFile.binary);
            }
            return;
        }

        const lines: string[] = [];
        for (const inFile of inFiles) {
            if (inFiles.length > 1) {
                if (lines.length > 0) {
                    lines.push("");
                }
                lines.push(colors.emphasis("==> " + inFile.filename + " <=="));
            }
            lines.push(...listLines(inFile, forceHex));
        }
        printLines(lines);
    },
};
