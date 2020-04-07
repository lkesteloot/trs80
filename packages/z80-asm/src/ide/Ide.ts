
import CodeMirror from "codemirror";
import {Parser, ParseResults} from "../assembler/Parser";
import {toHexByte, toHexWord} from "z80-base";
import IdeController from "./IdeController";

// Load these for their side-effects (they register themselves).
import "codemirror/addon/dialog/dialog";
import "codemirror/addon/search/search";
import "codemirror/addon/search/jump-to-line";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/hint/show-hint";
import "codemirror/addon/scroll/annotatescrollbar";
import "codemirror/mode/z80/z80";

import {initIpc} from "./ElectronIpc";
import * as fs from "fs";
import * as path from "path";
import Store from "electron-store";

// Max number of sub-lines per line. These are lines where we display the
// opcodes for a single source line.
const MAX_SUBLINES = 100;

// Max number of opcode bytes we display per subline. Sync this with the CSS
// that lays out the gutter.
const BYTES_PER_SUBLINE = 3;

const CURRENT_PATHNAME_KEY = "current-pathname";

class File {
    public readonly lines: string[];
    public lineNumber: number = 0;

    constructor(lines: string[]) {
        this.lines = lines;
    }
}

function readFile(pathname: string): string | undefined {
    try {
        return fs.readFileSync(pathname, "utf-8");
    } catch (e) {
        console.log("readFile(" + pathname + "): " + e);
        return undefined;
    }
}

function readFileLines(pathname: string): string[] | undefined {
    const text = readFile(pathname);
    return text === undefined ? undefined : text.split(/\r?\n/);
}

class Ide implements IdeController {
    private store: Store;
    private readonly cm: CodeMirror.Editor;
    private readonly assembled: ParseResults[] = [];
    private pathname: string = "";
    private scrollbarAnnotator: any;

    constructor(parent: HTMLElement) {
        this.store = new Store();

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
            extraKeys: {
                // "Ctrl-Space": "autocomplete"
            },
            hintOptions: {
                hint: () => this.hint(),
            }
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

        // The type definition doesn't include this extension.
        this.scrollbarAnnotator = (this.cm as any).annotateScrollbar("scrollbar-error");

        initIpc(this);

        this.cm.focus();

        // Read file from last time.
        const pathname = this.store.get(CURRENT_PATHNAME_KEY);
        if (pathname !== undefined) {
            const text = readFile(pathname);
            if (text !== undefined) {
                this.pathname = pathname;
                this.cm.setValue(text);
            }
        }
    }

    setText(pathname: string, text: string): void {
        this.pathname = pathname;
        this.cm.setValue(text);

        this.store.set(CURRENT_PATHNAME_KEY, pathname);
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

        for (let pass = 0; pass < 2; pass++) {
            let address = 0;

            const lines: string[] = [];
            for (let lineNumber = 0; lineNumber < this.cm.lineCount(); lineNumber++) {
                const line = this.cm.getLine(lineNumber);
                lines.push(line);
            }
            const fileStack = [new File(lines)];

            while (fileStack.length > 0) {
                const top = fileStack[fileStack.length - 1];
                if (top.lineNumber >= top.lines.length) {
                    fileStack.pop();
                    continue;
                }

                const line = top.lines[top.lineNumber++];
                const parser = new Parser(line, address, constants, pass === 0);
                const results = parser.assemble();
                address = results.nextAddress;

                if (pass === 1 && fileStack.length === 1) {
                    this.assembled.push(results);
                }

                // Include file.
                if (results.includeFilename !== undefined) {
                    const pathname = path.resolve(path.dirname(this.pathname), results.includeFilename);
                    const includedLines = readFileLines(pathname);
                    if (includedLines === undefined) {
                        // TODO report error.
                        results.error = "cannot read file " + pathname;
                    } else {
                        fileStack.push(new File(includedLines));
                    }
                }
            }
        }

        // Update UI.
        const annotationMarks: any[] = [];
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
                // console.log(results.error);
                this.cm.addLineClass(lineNumber, "background", "error-line");
                annotationMarks.push({
                    from: { line: lineNumber, ch: 0 },
                    to: { line: lineNumber + 1, ch: 0 },
                });
            }
        }

        this.scrollbarAnnotator.update(annotationMarks);

        const after = Date.now();
        console.log("Assembly time: " + (after - before));
    }

    private hint(): any {
        const cursor = this.cm.getCursor();
        const line = this.cm.getLine(cursor.line);
        const start = cursor.ch;
        const end = cursor.ch;

        return {
            list: ["aaaaa", "bbbbb", "ccccc"],
            from: CodeMirror.Pos(cursor.line, start - 3),
            to: CodeMirror.Pos(cursor.line, start),
        };
    }
}

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    new Ide(element);
}
