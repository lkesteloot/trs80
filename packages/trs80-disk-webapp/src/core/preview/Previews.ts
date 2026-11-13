import {
    BasicDialect, BasicProgram, BootSector, CmdProgram, EdtasmFile, HiResScreen, Level1Program, SystemProgram,
    Trs80File, decodeTrs80File,
} from "trs80-base";
import {assertNever} from "z80-base";
import {renderBasicPreview} from "./BasicPreview.js";
import {renderDisassemblyPreview} from "./DisassemblyPreview.js";
import {renderEdtasmPreview} from "./EdtasmPreview.js";
import {renderHexPreview} from "./HexPreview.js";
import {renderPicturePreview} from "./PicturePreview.js";
import {looksLikeText, renderTextPreview} from "./TextPreview.js";

/**
 * The first byte of a tokenized Basic program saved to a disk, and of one saved to a cassette (which a
 * file on a disk can also start with).
 */
const BASIC_DISK_HEADER_BYTE = 0xFF;
const BASIC_TAPE_HEADER_BYTE = 0xD3;

/**
 * The ways of previewing a file.
 */
export enum PreviewKind {
    /** A tokenized Basic program, as a source listing. */
    LISTING,
    /** Text, with the line endings fixed and control characters shown. */
    TEXT,
    /** Z80 disassembly of a program, with a CMD program's load ranges. */
    DISASSEMBLY,
    /** EDTASM assembly source. */
    EDTASM,
    /** An annotated hex dump. */
    HEX,
    /** A hi-res screen picture. */
    PICTURE,
}

/**
 * The name of a way of previewing, for a tab.
 */
export function previewKindToString(kind: PreviewKind): string {
    switch (kind) {
        case PreviewKind.LISTING:
            return "BASIC";
        case PreviewKind.TEXT:
            return "Text";
        case PreviewKind.DISASSEMBLY:
            return "Disassembly";
        case PreviewKind.EDTASM:
            return "EDTASM";
        case PreviewKind.HEX:
            return "Hex";
        case PreviewKind.PICTURE:
            return "Picture";
        default:
            assertNever(kind);
    }
}

/**
 * A file to preview.
 */
export interface PreviewFile {
    /** The file's name, which helps decode it (the extension recognizes hi-res screens, for example). */
    name: string;
    /** The file's bytes as they are on the disk. */
    binary: Uint8Array;
    /** The decoded file. */
    trs80File: Trs80File;
    /**
     * The file's host text, for a file system that has its own idea of a text file (as UCSD Pascal does).
     * If it's given, the TEXT view shows it in place of the binary.
     */
    hostText?: Uint8Array | undefined;
}

/**
 * Options for rendering a preview.
 */
export interface PreviewOptions {
    /**
     * The Basic that a tokenized program is for. If it's not the one that the file was decoded with, the
     * file is decoded again. This is how the page lets the user override a Model 4 program that was read as
     * Model III Basic, or the reverse. Undefined keeps the file as it was decoded.
     */
    basicDialect?: BasicDialect | undefined;
}

/**
 * Whether the bytes are a tokenized Basic program: the first byte is the header of a disk or tape one.
 */
function isTokenizedBasic(bytes: Uint8Array): boolean {
    return bytes.length > 0 && (bytes[0] === BASIC_DISK_HEADER_BYTE || bytes[0] === BASIC_TAPE_HEADER_BYTE);
}

/**
 * The previews that make sense for a file, in the order to show them, with the default first. They follow
 * the choice that trs80-tool's "list" command makes (a tokenized Basic program as a listing, text as text,
 * anything else as hex), and add what a page can show that a terminal can't or that "list" leaves to
 * other commands:
 *
 * - A tokenized Basic program: the listing, then hex. A Basic program that's really text source, which the
 *   decoder tokenized, shows as text first, then the listing, then hex.
 * - A CMD, system, Level 1 or boot program: the disassembly, then hex.
 * - An EDTASM source file: the EDTASM listing, then hex.
 * - A hi-res screen: the picture, then hex.
 * - Text (see looksLikeText()): text, then hex.
 * - Anything else: hex.
 *
 * Hex is always available.
 *
 * @param trs80File the decoded file.
 * @param bytes the file's bytes as they are on the disk.
 * @return the views, default first.
 */
export function availablePreviews(trs80File: Trs80File, bytes: Uint8Array): PreviewKind[] {
    const kinds: PreviewKind[] = [];

    if (trs80File instanceof BasicProgram) {
        if (isTokenizedBasic(bytes)) {
            kinds.push(PreviewKind.LISTING);
        } else {
            if (looksLikeText(bytes)) {
                kinds.push(PreviewKind.TEXT);
            }
            kinds.push(PreviewKind.LISTING);
        }
    } else if (trs80File instanceof CmdProgram || trs80File instanceof SystemProgram ||
        trs80File instanceof Level1Program || trs80File instanceof BootSector) {

        kinds.push(PreviewKind.DISASSEMBLY);
    } else if (trs80File instanceof EdtasmFile) {
        kinds.push(PreviewKind.EDTASM);
    } else if (trs80File instanceof HiResScreen) {
        kinds.push(PreviewKind.PICTURE);
    } else if (looksLikeText(bytes)) {
        kinds.push(PreviewKind.TEXT);
    }

    kinds.push(PreviewKind.HEX);

    return kinds;
}

/**
 * Show a message where a preview can't be made.
 *
 * @param message what's wrong.
 */
function renderUnavailable(message: string): HTMLElement {
    const element = document.createElement("div");
    element.classList.add("preview", "preview-unavailable");
    element.textContent = message;
    return element;
}

/**
 * Render one view of a file. The element is a column with an optional toolbar and a scrolling body
 * (see preview.css), so its parent should give it a height. Long files build into a single "pre", not
 * an element per line or byte.
 *
 * @param kind the view. If the file can't be shown that way, the result says so.
 * @param file the file.
 * @param options options for the rendering.
 * @return the element to put on the page.
 */
export function renderPreview(kind: PreviewKind, file: PreviewFile, options: PreviewOptions = {}): HTMLElement {
    let trs80File = file.trs80File;

    switch (kind) {
        case PreviewKind.LISTING: {
            if (options.basicDialect !== undefined) {
                // Decode again for the chosen Basic.
                trs80File = decodeTrs80File(file.binary, {filename: file.name, basicDialect: options.basicDialect});
            }
            if (!(trs80File instanceof BasicProgram)) {
                return renderUnavailable("This file isn't a BASIC program.");
            }
            return renderBasicPreview(trs80File);
        }

        case PreviewKind.TEXT:
            return renderTextPreview(file.hostText ?? file.binary);

        case PreviewKind.DISASSEMBLY:
            if (trs80File instanceof CmdProgram || trs80File instanceof SystemProgram ||
                trs80File instanceof Level1Program || trs80File instanceof BootSector) {

                return renderDisassemblyPreview(trs80File);
            }
            return renderUnavailable("This file isn't a program that can be disassembled.");

        case PreviewKind.EDTASM:
            if (!(trs80File instanceof EdtasmFile)) {
                return renderUnavailable("This file isn't an EDTASM source file.");
            }
            return renderEdtasmPreview(trs80File);

        case PreviewKind.HEX:
            return renderHexPreview(file.binary, file.name);

        case PreviewKind.PICTURE:
            if (!(trs80File instanceof HiResScreen)) {
                return renderUnavailable("This file isn't a hi-res screen.");
            }
            return renderPicturePreview(trs80File);

        default:
            assertNever(kind);
    }
}
