
// Tools for decoding EDTASM programs.
//
// https://www.trs-80.com/wordpress/tips/formats/#edasfile

import jss from './Jss';
import {Highlightable} from "./Highlighter";

// Stylesheet.
const BACKGROUND_COLOR = "#1E1E1E";
const STYLE = {
    error: {
        color: "#aa0000",
        "&$highlighted": {
            backgroundColor: "#aa0000",
            color: BACKGROUND_COLOR,
        },
    },
    lineNumber: {
        color: "#858585",
        "&$highlighted": {
            backgroundColor: "#858585",
            color: BACKGROUND_COLOR,
        },
    },
    regular: {
        color: "#9CDCFE",
        "&$highlighted": {
            backgroundColor: "#9CDCFE",
            color: BACKGROUND_COLOR,
        },
    },
    comment: {
        color: "#6A9955",
        "&$highlighted": {
            backgroundColor: "#6A9955",
            color: BACKGROUND_COLOR,
        },
    },
    selected: {
        backgroundColor: "#555555",
    },
    highlighted: {
        // Empty style that's referenced above as $highlighted.
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

/**
 * TODO share this code with Basic.ts.
 *
 * @param out the enclosing element to add to.
 * @param text the text to add.
 * @param className the name of the class for the item.
 * @return the new element.
 */
function add(out: HTMLElement, text: string, className: string): HTMLElement {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
    return e;
}

/**
 * Decoded the program into the DIV, returning the program name and array of created elements.
 *
 * TODO: Just decode the binary into an EdtasmFile object.
 */
export function decodeEdtasm(bytes: Uint8Array, out: HTMLElement): [string, Highlightable[]] {
    sheet.attach();
    const classes = sheet.classes;
    const elements: Highlightable[] = [];
    let e: HTMLElement;

    // Check magic.
    if (bytes.length < 7 || bytes[0] !== 0xD3) {
        add(out, "EDTASM: missing magic -- not a EDTASM file.", classes.error);
        return ["Error", elements];
    }

    // Read name of program.
    const name =
        (String.fromCodePoint(bytes[1]) +
        String.fromCodePoint(bytes[2]) +
        String.fromCodePoint(bytes[3]) +
        String.fromCodePoint(bytes[4]) +
        String.fromCodePoint(bytes[5]) +
        String.fromCodePoint(bytes[6])).trim();

    let i = 7;
    while (true) {
        if (bytes.length - i < 5) {
            // End of program.
            return [name, elements];
        }

        const line = document.createElement("div");

        // Read line number.
        for (let j = 0; j < 5; j++) {
            e = add(line, (bytes[i] - 0xB0).toString(), classes.lineNumber);
            elements.push(new Highlightable(i, i, e));
            i++;
        }

        // Parse line.
        let pos = 0;
        let className = classes.regular;
        while (i < bytes.length && bytes[i] != 0x0D && bytes[i] !== 0x0A && bytes[i] !== 0x1A) {
            let text: string;
            if (bytes[i] === 0x09) {
                // Tab.
                text = "";
                do {
                    text += " ";
                    pos++;
                } while (pos % 8 !== 0);
            } else {
                // Non-tab.
                text = String.fromCodePoint(bytes[i]);
                if (text === ";") {
                    // Semicolon to end of line is comment.
                    className = classes.comment;
                }
                pos++;
            }
            e = add(line, text, className);
            elements.push(new Highlightable(i, i, e));
            i++;
        }

        // Skip EOL.
        while (i < bytes.length && (bytes[i] === 0x0D || bytes[i] === 0x0A)) {
            i++;
        }

        out.appendChild(line);
    }
}
