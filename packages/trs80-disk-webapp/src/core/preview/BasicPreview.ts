import {BasicProgram, ElementType} from "trs80-base";
import {assertNever} from "z80-base";
import {newPreviewBody, newPreviewElement, spanHtml} from "./PreviewHtml.js";

/**
 * The CSS class for a piece of a Basic program, matching the colors that my-trs-80's Basic tab uses.
 *
 * @param elementType the kind of piece.
 */
function basicClassName(elementType: ElementType): string {
    switch (elementType) {
        case ElementType.ERROR:
            return "preview-basic-error";
        case ElementType.LINE_NUMBER:
            return "preview-basic-line-number";
        case ElementType.PUNCTUATION:
            return "preview-basic-punctuation";
        case ElementType.KEYWORD:
            return "preview-basic-keyword";
        case ElementType.REGULAR:
            return "preview-basic-regular";
        case ElementType.STRING:
            return "preview-basic-string";
        case ElementType.COMMENT:
            return "preview-basic-comment";
        default:
            assertNever(elementType);
    }
}

/**
 * The HTML of a Basic program's source listing: one line of colored spans per program line.
 *
 * @param program the decoded program.
 * @return the HTML, with lines separated by newlines.
 */
export function basicListingHtml(program: BasicProgram): string {
    const lines: string[][] = [];
    let line: string[] | undefined = undefined;
    for (const element of program.elements) {
        // A line number starts a new line.
        if (line === undefined || element.elementType === ElementType.LINE_NUMBER) {
            line = [];
            lines.push(line);
        }
        line.push(spanHtml(element.asAscii(), basicClassName(element.elementType)));
    }
    return lines.map(parts => parts.join("")).join("\n");
}

/**
 * Render a Basic program as a source listing.
 *
 * @param program the decoded program.
 * @return the preview element. It ends with the decoder's error, if there is one.
 */
export function renderBasicPreview(program: BasicProgram): HTMLElement {
    let html = basicListingHtml(program);
    if (program.error !== undefined) {
        html += "\n" + spanHtml(program.error, "preview-error");
    }
    const element = newPreviewElement("preview-basic");
    element.append(newPreviewBody(html));
    return element;
}
