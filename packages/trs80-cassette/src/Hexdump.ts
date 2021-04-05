
// Tools for generating a hex dump of a binary file.

import jss from './Jss';
import {pad} from "./Utils";
import {Highlightable} from "./Highlighter";

// Stylesheet.
const BACKGROUND_COLOR = "var(--background)";
const STYLE = {
    address: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    hex: {
        color: "var(--blue)",
        "&$highlighted": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
    },
    ascii: {
        color: "var(--cyan)",
        "&$highlighted": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
    },
    asciiUnprintable: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    selected: {
        backgroundColor: "var(--background-highlights)",
    },
    highlighted: {
        // Empty style that's referenced above as $highlighted.
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

export function create(binary: Uint8Array, div: HTMLElement): [Highlightable[], Highlightable[]] {
    sheet.attach();
    const classes = sheet.classes;

    const hexElements: Highlightable[] = [];
    const asciiElements: Highlightable[] = [];

    for (let addr = 0; addr < binary.length; addr += 16) {
        const line = document.createElement("div");

        let e = document.createElement("span");
        e.classList.add(classes.address);
        e.innerText = pad(addr, 16, 4) + "  ";
        line.appendChild(e);

        // Hex.
        let subAddr: number;
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
            e = document.createElement("span");
            e.classList.add(classes.hex);
            e.innerText = pad(binary[subAddr], 16, 2);
            hexElements.push(new Highlightable(hexElements.length, hexElements.length, e));
            line.appendChild(e);
            line.appendChild(document.createTextNode(" "));
        }
        for (; subAddr < addr + 16; subAddr++) {
            line.appendChild(document.createTextNode("   "));
        }
        line.appendChild(document.createTextNode("  "));

        // ASCII.
        for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
            const c = binary[subAddr];
            e = document.createElement("span");
            if (c >= 32 && c < 127) {
                e.classList.add(classes.ascii);
                e.innerText = String.fromCharCode(c);
            } else {
                e.classList.add(classes.asciiUnprintable);
                e.innerText = ".";
            }
            asciiElements.push(new Highlightable(asciiElements.length, asciiElements.length, e));
            line.appendChild(e);
        }
        div.appendChild(line);
    }

    return [hexElements, asciiElements];
}
