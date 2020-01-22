
// Tools for generating a hex dump of a binary file.

import jss from './Jss';
import {pad} from "./Utils";

// Stylesheet.
const BACKGROUND_COLOR = "#1E1E1E";
const STYLE = {
    address: {
        color: "#858585",
        "&$highlighted": {
            backgroundColor: "#858585",
            color: BACKGROUND_COLOR,
        },
    },
    hex: {
        color: "#D4D4D4",
        "&$highlighted": {
            backgroundColor: "#D4D4D4",
            color: BACKGROUND_COLOR,
        },
    },
    ascii: {
        color: "#D4D4D4",
        "&$highlighted": {
            backgroundColor: "#D4D4D4",
            color: BACKGROUND_COLOR,
        },
    },
    asciiUnprintable: {
        color: "#858585",
        "&$highlighted": {
            backgroundColor: "#858585",
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

export function create(binary: Uint8Array, div: HTMLElement): [HTMLElement[], HTMLElement[]] {
    sheet.attach();
    const classes = sheet.classes;

    const hexElements: HTMLElement[] = [];
    const asciiElements: HTMLElement[] = [];

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
            hexElements.push(e);
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
            asciiElements.push(e);
            line.appendChild(e);
        }
        div.appendChild(line);
    }

    return [hexElements, asciiElements];
}
