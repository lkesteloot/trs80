import {HexdumpLine, HexdumpSpan} from "trs80-base";

/**
 * Convert a hexdump line to an HTML line.
 *
 * @param line hexdump line to convert to HTML.
 * @param selectedByte which byte to highlight with "selecvted" class, if any.
 * @param clickHandler optional handler to call on a span that has a defined address when clicked.
 */
export function hexdumpLineToHtml(line: HexdumpLine, selectedByte?: number, clickHandler?: (span: HexdumpSpan) => void): HTMLElement {
    const div = document.createElement("div");

    for (const hexdumpSpan of line.spans) {
        const e = document.createElement("span");
        e.classList.add(...hexdumpSpan.classes);
        if (selectedByte !== undefined && hexdumpSpan.address === selectedByte) {
            e.classList.add("selected");
        }
        e.innerText = hexdumpSpan.text;
        if (clickHandler !== undefined && hexdumpSpan.address !== undefined) {
            e.addEventListener("click", () => clickHandler(hexdumpSpan))
        }
        div.append(e);
    }

    return div;
}
