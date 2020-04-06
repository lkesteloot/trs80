
import CodeMirror from "codemirror";
import {Parser, ParseResults} from "../assembler/Parser";
import {toHexByte, toHexWord} from "z80-base";
import IdeController from "./IdeController";

// Load these for their side-effects (they register themselves).
import "codemirror/addon/dialog/dialog";
import "codemirror/addon/search/search";
import "codemirror/addon/search/jump-to-line";
import "codemirror/addon/edit/closebrackets";
import "codemirror/mode/z80/z80";

import {initIpc} from "./ElectronIpc";

// Max number of sub-lines per line. These are lines where we display the
// opcodes for a single source line.
const MAX_SUBLINES = 100;

// Max number of opcode bytes we display per subline. Sync this with the CSS
// that lays out the gutter.
const BYTES_PER_SUBLINE = 3;

class Ide implements IdeController {
    private readonly cm: CodeMirror.Editor;
    private readonly assembled: ParseResults[] = [];

    constructor(parent: HTMLElement) {
        const config = {
            value: "",
            lineNumbers: true,
            tabSize: 8,
            theme: 'mbo',
            gutters: ["CodeMirror-linenumbers", "gutter-assembled"],
            autoCloseBrackets: true,
            mode: "text/x-z80",
            // Doesn't work, I call focus() explicitly later.
            autoFocus: true,
        };
        this.cm = CodeMirror(parent, config);

        // Create CSS classes for our line heights. We do this dynamically since
        // we don't know the line height at compile time.
        const cssRules = [];
        for (let lineCount = 1; lineCount < MAX_SUBLINES; lineCount++) {
            cssRules.push(".line-height-" + lineCount + " { height: " + lineCount * this.cm.defaultTextHeight() + "px; }");
        }
        const style = document.createElement("style");
        style.appendChild(document.createTextNode(cssRules.join("\n")));
        document.head.appendChild(style);

        this.cm.on("change", (instance, changeObj) => {
            // It's important to call this in "change", and not in "changes" or
            // after a timeout, because we want to be part of this operation.
            // This way a large re-assemble takes 40ms instead of 300ms.
            this.assembleAll();
        });

        initIpc(this);

        /*
        fetch("samples/basic.asm")
            .then(response => response.text())
            .then(text => cm.setValue(text));
         */

        this.cm.focus();
    }

    setText(text: string): void {
        this.cm.setValue(text);
    }

    nextError(): void {
        if (this.assembled.length === 0) {
            return;
        }

        const currentLineNumber = this.cm.getCursor().line;
        console.log(currentLineNumber);
        let nextErrorLineNumber = currentLineNumber;
        do {
            nextErrorLineNumber = (nextErrorLineNumber + 1) % this.assembled.length;
        } while (nextErrorLineNumber !== currentLineNumber && this.assembled[nextErrorLineNumber].error === undefined);

        if (nextErrorLineNumber !== currentLineNumber) {
            // Use the separate scrollInfoView() so we can provide a visible margin around the error.
            this.cm.setCursor({ line: nextErrorLineNumber, ch: 0 }, undefined, { scroll: false });
            this.cm.scrollIntoView(null, 200);
        }
    }

    private assembleAll() {
        const constants = {};
        this.assembled.splice(0, this.assembled.length);

        const before = Date.now();

        // First pass.
        let address = 0;
        for (let lineNumber = 0; lineNumber < this.cm.lineCount(); lineNumber++) {
            const line = this.cm.getLine(lineNumber);
            const parser = new Parser(line, address, constants, true);
            const results = parser.assemble();
            address = results.nextAddress;
        }

        // Second pass.
        address = 0;
        for (let lineNumber = 0; lineNumber < this.cm.lineCount(); lineNumber++) {
            const line = this.cm.getLine(lineNumber);
            const parser = new Parser(line, address, constants, false);
            const results = parser.assemble();
            this.assembled.push(results);
            address = results.nextAddress;
        }

        // Update UI.
        for (let lineNumber = 0; lineNumber < this.assembled.length; lineNumber++) {
            const results = this.assembled[lineNumber];

            let addressElement: HTMLElement | null;
            if (results.binary.length > 0) {
                addressElement = document.createElement("div");

                // Break opcodes over multiple lines if necessary.
                let numLines = 0;
                for (let offset = 0;
                     offset < results.binary.length && numLines < MAX_SUBLINES;
                     offset += BYTES_PER_SUBLINE, numLines++) {

                    const addressString = toHexWord(results.address + offset) +
                        "  " + results.binary.slice(offset, offset + BYTES_PER_SUBLINE).map(toHexByte).join(" ");
                    const addressTextElement = document.createTextNode(addressString);
                    if (offset > 0) {
                        addressElement.appendChild(document.createElement("br"));
                    }
                    addressElement.appendChild(addressTextElement);
                }
                addressElement.classList.add("gutter-style");

                // For the line height using CSS.
                this.cm.removeLineClass(lineNumber, "wrap", undefined);
                if (numLines !== 1) {
                    this.cm.addLineClass(lineNumber, "wrap", "line-height-" + numLines);
                }
            } else {
                addressElement = null;
            }
            this.cm.setGutterMarker(lineNumber, "gutter-assembled", addressElement);

            if (results.error === undefined) {
                this.cm.removeLineClass(lineNumber, "background", "error-line");
            } else {
                this.cm.addLineClass(lineNumber, "background", "error-line");
            }

        }

        const after = Date.now();
        console.log("Assembly time: " + (after - before));
    }
}

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    new Ide(element);
}
