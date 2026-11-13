import {EdtasmFile} from "trs80-base";
import {escapeHtml, newPreviewBody, newPreviewElement, spanHtml} from "./PreviewHtml.js";

/**
 * The HTML for one line of EDTASM source: its line number, then the code, with a semicolon and everything
 * after it as a comment.
 *
 * @param lineNumber the line's number.
 * @param text the line's text, with tabs already expanded.
 */
function edtasmLineHtml(lineNumber: number, text: string): string {
    const commentStart = text.indexOf(";");
    const code = commentStart < 0 ? text : text.substring(0, commentStart);
    const comment = commentStart < 0 ? "" : text.substring(commentStart);

    return spanHtml(lineNumber.toString().padStart(5, "0"), "preview-edtasm-line-number") + " " +
        (code === "" ? "" : "<span class=\"preview-edtasm-regular\">" + escapeHtml(code) + "</span>") +
        (comment === "" ? "" : spanHtml(comment, "preview-edtasm-comment"));
}

/**
 * Render an EDTASM source file, as a numbered listing.
 *
 * @param file the decoded file.
 * @return the preview element. It ends with the decoder's error, if there is one.
 */
export function renderEdtasmPreview(file: EdtasmFile): HTMLElement {
    const lines = file.lines.map(line => edtasmLineHtml(line.lineNumber, line.line));
    if (file.error !== undefined) {
        lines.push(spanHtml(file.error, "preview-error"));
    }
    const element = newPreviewElement("preview-edtasm");
    element.append(newPreviewBody(lines.join("\n")));
    return element;
}
