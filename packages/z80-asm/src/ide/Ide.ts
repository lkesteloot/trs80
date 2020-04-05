
import CodeMirror from "codemirror";
import {Parser} from "../assembler/Parser";
import {toHexByte, toHexWord} from "z80-base";

// Max number of sub-lines per line. These are lines where we display the
// opcodes for a single source line.
const MAX_SUBLINES = 100;

// Max number of opcode bytes we display per subline. Sync this with the CSS
// that lays out the gutter.
const BYTES_PER_SUBLINE = 3;

function assembleAll(cm: CodeMirror.Editor) {
    const constants = {};

    const before = Date.now();

    // First pass.
    let address = 0;
    for (let i = 0; i < cm.lineCount(); i++) {
        const line = cm.getLine(i);
        const parser = new Parser(line, address, constants, true);
        const results = parser.assemble();
        address = results.nextAddress;
    }

    // Second pass.
    address = 0;
    for (let i = 0; i < cm.lineCount(); i++) {
        const line = cm.getLine(i);
        const parser = new Parser(line, address, constants, false);
        const results = parser.assemble();

        let addressElement: HTMLElement | null;
        if (results.binary.length > 0) {
            addressElement = document.createElement("div");

            // Break opcodes over multiple lines if necessary.
            let numLines = 0;
            for (let offset = 0;
                 offset < results.binary.length && numLines < MAX_SUBLINES;
                 offset += BYTES_PER_SUBLINE, numLines++) {

                const addressString = toHexWord(results.address + offset) +
                    " " + results.binary.slice(offset, offset + BYTES_PER_SUBLINE).map(toHexByte).join(" ");
                const addressTextElement = document.createTextNode(addressString);
                if (offset > 0) {
                    addressElement.appendChild(document.createElement("br"));
                }
                addressElement.appendChild(addressTextElement);
            }
            addressElement.classList.add("gutter-style");

            // For the line height using CSS.
            cm.removeLineClass(i, "wrap", undefined);
            if (numLines !== 1) {
                cm.addLineClass(i, "wrap", "line-height-" + numLines);
            }
        } else {
            addressElement = null;
        }
        cm.setGutterMarker(i, "gutter-assembled", addressElement);

        if (results.error === undefined) {
            cm.removeLineClass(i, "text", "error-line");
        } else {
            cm.addLineClass(i, "text", "error-line");
        }

        address = results.nextAddress;
    }

    const after = Date.now();
    console.log("Assembly time: " + (after - before));
}

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    const config = {
        value: "",
        lineNumbers: true,
        tabSize: 8,
        theme: 'mbo',
        gutters: ["CodeMirror-linenumbers", "gutter-assembled"],
    };
    const cm = CodeMirror(element, config);

    // Create CSS classes for our line heights. We do this dynamically since
    // we don't know the line height at compile time.
    const cssRules = [];
    for (let lineCount = 1; lineCount < MAX_SUBLINES; lineCount++) {
        cssRules.push(".line-height-" + lineCount + " { height: " + lineCount*cm.defaultTextHeight() + "px; }");
    }
    const style = document.createElement("style");
    style.appendChild(document.createTextNode(cssRules.join("\n")));
    document.head.appendChild(style);

    cm.on("change", (instance, changeObj) => {
        // It's important to call this in "change", and not in "changes" or
        // after a timeout, because we want to be part of this operation.
        // This way a large re-assemble takes 40ms instead of 300ms.
        assembleAll(cm);
    });

    fetch("samples/basic.asm")
        .then(response => response.text())
        .then(text => cm.setValue(text));
}

