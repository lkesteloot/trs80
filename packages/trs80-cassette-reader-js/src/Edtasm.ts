
// Tools for decoding EDTASM programs.
//
// http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/edtasm-file-format/

/**
 * TODO share this code with Basic.ts.
 *
 * @param out the enclosing element to add to.
 * @param text the text to add.
 * @param className the name of the class for the item.
 */
function add(out: HTMLElement, text: string, className: string) {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
}

/**
 * Decoded the program into the DIV, returning the program name.
 */
export function decodeEdtasm(bytes: Uint8Array, out: HTMLElement): string {
    // Check magic.
    if (bytes.length < 7 || bytes[0] !== 0xD3) {
        add(out, "EDTASM: missing magic -- not a EDTASM file.", "error");
        return "Error";
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
        // End of program.
        if (bytes.length - i < 5) {
            return name;
        }

        const line = document.createElement("div");

        // Read line number.
        const lineNumber = "" +
            (bytes[i] - 0xB0) +
            (bytes[i + 1] - 0xB0) +
            (bytes[i + 2] - 0xB0) +
            (bytes[i + 3] - 0xB0) +
            (bytes[i + 4] - 0xB0);
        i += 5;
        add(line, lineNumber, "line_number");

        // Parse line.
        let lineText = "";
        while (i < bytes.length && bytes[i] != 0x0D && bytes[i] !== 0x0A && bytes[i] !== 0x1A) {
            if (bytes[i] === 0x09) {
                // Tab.
                do {
                    lineText += " ";
                } while (lineText.length % 8 !== 0);
            } else {
                // Non-tab.
                lineText += String.fromCodePoint(bytes[i]);
            }
            i++;
        }
        add(line, lineText, "regular");

        // Skip EOL.
        while (i < bytes.length && (bytes[i] === 0x0D || bytes[i] === 0x0A)) {
            i++;
        }

        out.appendChild(line);
    }
}
