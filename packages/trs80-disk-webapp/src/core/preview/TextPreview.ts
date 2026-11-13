import {escapeHtml, newPreviewBody, newPreviewElement, spanHtml} from "./PreviewHtml.js";

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
 * The end of the bytes without the trailing Ctrl-Z and NUL padding.
 *
 * @param binary the bytes of the file.
 */
function endWithoutPadding(binary: Uint8Array): number {
    let end = binary.length;
    while (end > 0 && (binary[end - 1] === CTRL_Z || binary[end - 1] === 0)) {
        end--;
    }
    return end;
}

/**
 * Whether the bytes of a file are text, by the rule of trs80-tool's "list" command: after removing trailing
 * Ctrl-Z and NUL bytes (padding), the file must have no NUL bytes at all, and at most one byte in twenty
 * can be something other than a printable ASCII character (0x20 to 0x7E), tab, CR, or LF. An empty file
 * counts as text, but a file of nothing but padding does not.
 *
 * @param binary the bytes of the file.
 */
export function looksLikeText(binary: Uint8Array): boolean {
    const end = endWithoutPadding(binary);
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

    return badCount*TEXT_BAD_BYTE_DIVISOR <= end;
}

/**
 * The HTML for the text of a file. CR, CRLF and LF each end a line, whatever mix the file has (so the text
 * comes out with the browser's line endings). A control character is shown as its Unicode "control picture"
 * (such as the symbol for ESC), and a byte of 0x80 or more as a dot, both muted, so that nothing is invisible.
 * One character per byte, since the TRS-80 isn't Unicode.
 *
 * @param binary the bytes of the file, without its host-text conversion.
 * @return HTML for a "pre" element.
 */
export function textHtml(binary: Uint8Array): string {
    const end = endWithoutPadding(binary);
    const parts: string[] = [];
    let plain = "";

    // Add the plain text so far, as one piece.
    const flush = () => {
        if (plain !== "") {
            parts.push(escapeHtml(plain));
            plain = "";
        }
    };

    for (let i = 0; i < end; i++) {
        const c = binary[i];
        if (c === 0x0D) {
            plain += "\n";
            if (i + 1 < end && binary[i + 1] === 0x0A) {
                i++;
            }
        } else if (c === 0x0A) {
            plain += "\n";
        } else if (c === 0x09 || (c >= 0x20 && c < 0x7F)) {
            plain += String.fromCharCode(c);
        } else {
            flush();
            // Control characters get their picture (U+2400 + c, with U+2421 for DEL); the rest are dots.
            const picture = c < 0x20 ? String.fromCharCode(0x2400 + c) : c === 0x7F ? "␡" : ".";
            parts.push(spanHtml(picture, "preview-text-unprintable"));
        }
    }
    flush();

    return parts.join("");
}

/**
 * Render a text file.
 *
 * @param binary the bytes of the file, or its host text if the file system has its own.
 * @return the preview element.
 */
export function renderTextPreview(binary: Uint8Array): HTMLElement {
    const element = newPreviewElement("preview-text");
    element.append(newPreviewBody(textHtml(binary)));
    return element;
}
