import {HexdumpGenerator, ProgramAnnotation, decodeTrs80File} from "trs80-base";
import {escapeHtml, newCheckbox, newPreviewBody, newPreviewElement, newToolbar} from "./PreviewHtml.js";

/**
 * How many lines of the hex dump to build in one go. The first chunk is built at once, and the rest in
 * later turns of the event loop, so that a big file shows up quickly and the page stays responsive.
 */
const LINES_PER_CHUNK = 500;

/**
 * A piece of text in a line of the dump, with its CSS classes.
 */
interface HexSpan {
    text: string;
    classes: string[];
}

/**
 * A line of the dump, as data. The line is turned into HTML once it's complete.
 */
interface HexLine {
    spans: HexSpan[];
}

/**
 * Hexdump generator that produces lines as data, to be turned into one string of HTML.
 */
class HtmlStringHexdumpGenerator extends HexdumpGenerator<HexLine, HexSpan> {
    /**
     * @param binary the bytes to dump.
     * @param collapse whether to collapse repeated rows.
     * @param annotations the annotations to show on the right.
     */
    constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        super(binary, {collapse, annotations});
    }

    protected newLine(): HexLine {
        return {spans: []};
    }

    protected getLineText(line: HexLine): string {
        return line.spans.map(span => span.text).join("");
    }

    protected newSpan(line: HexLine, text: string, ...cssClass: string[]): HexSpan {
        const span = {text, classes: cssClass};
        line.spans.push(span);
        return span;
    }

    protected addTextToSpan(span: HexSpan, text: string): void {
        span.text += text;
    }
}

/**
 * The HTML for a line of the dump. The generator's class names ("address", "hex", "ascii", ...) get the
 * prefix "preview-hex-".
 *
 * @param line the finished line.
 */
function hexLineHtml(line: HexLine): string {
    return line.spans.map(span => "<span class=\"" + span.classes.map(c => "preview-hex-" + c).join(" ") + "\">" +
        escapeHtml(span.text) + "</span>").join("");
}

/**
 * Whether the first byte array is the start of the second (or all of it).
 */
function isPrefix(prefix: Uint8Array, bytes: Uint8Array): boolean {
    return prefix.length <= bytes.length && prefix.every((byte, i) => byte === bytes[i]);
}

/**
 * The annotations to show beside a file's hex dump. The file is decoded again with disassembly, so that system
 * programs get their code annotated. The decoded binary can be the start of the file (a program padded to a
 * whole sector), and the annotations then cover that start. There are none if the decoded binary isn't the
 * bytes of the file at all, as with a text file of Basic that the decoder tokenized.
 *
 * @param binary the bytes of the file.
 * @param filename the file's name, which helps the decoder.
 */
function hexAnnotations(binary: Uint8Array, filename: string): ProgramAnnotation[] {
    const decoded = decodeTrs80File(binary, {filename, disassemble: true});
    return isPrefix(decoded.binary, binary) ? decoded.annotations : [];
}

/**
 * Render an annotated hex dump of a file. A toolbar has checkboxes for collapsing repeated rows and showing
 * annotations. The lines go into a single "pre" element, built in chunks.
 *
 * @param binary the bytes of the file.
 * @param filename the file's name, which helps decode its annotations.
 * @return the preview element.
 */
export function renderHexPreview(binary: Uint8Array, filename: string): HTMLElement {
    const element = newPreviewElement("preview-hex");
    let collapse = true;
    let annotate = true;
    let annotations: ProgramAnnotation[] | undefined = undefined;
    let body: HTMLPreElement | undefined = undefined;
    // Changes with each rebuild, to stop a previous build's later chunks.
    let buildId = 0;

    /** Build the dump with the current settings, replacing the previous one. */
    const build = () => {
        buildId++;
        const thisBuildId = buildId;
        if (annotate && annotations === undefined) {
            annotations = hexAnnotations(binary, filename);
        }
        const generator = new HtmlStringHexdumpGenerator(binary, collapse, annotate ? (annotations ?? []) : []);
        const lines = generator.generate();

        const newBody = newPreviewBody("");
        if (body === undefined) {
            element.append(newBody);
        } else {
            body.replaceWith(newBody);
        }
        body = newBody;

        /** Add the next chunk of lines, and schedule the one after it unless that was the last. */
        const addChunk = () => {
            if (thisBuildId !== buildId) {
                return;
            }
            const html: string[] = [];
            let done = false;
            while (html.length < LINES_PER_CHUNK) {
                const next = lines.next();
                if (next.done) {
                    done = true;
                    break;
                }
                html.push(hexLineHtml(next.value));
            }
            if (html.length > 0) {
                newBody.insertAdjacentHTML("beforeend", html.join("\n") + (done ? "" : "\n"));
            }
            if (!done) {
                setTimeout(addChunk, 0);
            }
        };
        addChunk();
    };

    const toolbar = newToolbar(
        newCheckbox("Collapse duplicate lines", collapse, checked => {
            collapse = checked;
            build();
        }),
        newCheckbox("Show annotations", annotate, checked => {
            annotate = checked;
            build();
        }));
    element.append(toolbar);
    build();

    return element;
}
