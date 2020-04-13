
import CodeMirror from "codemirror";
import {Parser, ParseResults, SymbolInfo} from "../assembler/Parser";
import {toHexByte, toHexWord} from "z80-base";
import tippy from 'tippy.js';

import 'tippy.js/dist/tippy.css';
import "codemirror/lib/codemirror.css";
import "codemirror/theme/mbo.css";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/addon/hint/show-hint.css";
import "./main.css";

// Load these for their side-effects (they register themselves).
import "codemirror/addon/dialog/dialog";
import "codemirror/addon/search/search";
import "codemirror/addon/search/jump-to-line";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/hint/show-hint";
import "codemirror/addon/scroll/annotatescrollbar";
import "codemirror/addon/selection/active-line";
import "codemirror/addon/selection/mark-selection";
import "codemirror/mode/z80/z80";

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

// File we're parsing.
class File {
    public readonly pathname: string;
    public readonly lines: string[];
    public lineNumber: number = 0;

    constructor(pathname: string, lines: string[]) {
        this.pathname = pathname;
        this.lines = lines;
    }
}

// Result of looking up what symbol we're on.
class SymbolHit {
    public readonly symbol: SymbolInfo;
    // Undefined if it's the definition.
    public readonly referenceNumber: number | undefined;

    constructor(symbol: SymbolInfo, reference: number | undefined) {
        this.symbol = symbol;
        this.referenceNumber = reference;
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

class Ide {
    private store: Store;
    private readonly cm: CodeMirror.Editor;
    // The index of this array is the line number in the file (zero-based).
    private readonly assembled: ParseResults[] = [];
    // Map from symbol name to SymbolInfo object.
    private readonly symbols = new Map<string, SymbolInfo>();
    private pathname: string = "";
    private scrollbarAnnotator: any;
    private readonly symbolMarks: CodeMirror.TextMarker[] = [];

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
            extraKeys: (CodeMirror as any).normalizeKeyMap({
                // "Ctrl-Space": "autocomplete"
                "Cmd-B": () => this.jumpToDefinition(false),
                "Shift-Cmd-B": () => this.jumpToDefinition(true),
            }),
            hintOptions: {
                hint: () => this.hint(),
            },
            styleActiveLine: true,
            styleSelectedText: true,
            cursorScrollMargin: 200,
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

        this.cm.on("cursorActivity", (instance) => {
            this.updateHighlight();
        });

        // The type definition doesn't include this extension.
        this.scrollbarAnnotator = (this.cm as any).annotateScrollbar("scrollbar-error");

        // Configure IPC with the main process of Electron.
        const ipcRenderer = (window as any).ipcRenderer;
        ipcRenderer.on("set-text", (event: any, pathname: string, text: string) => this.setText(pathname, text));
        ipcRenderer.on("next-error", () => this.nextError());
        ipcRenderer.on("declaration-or-usages", () => this.jumpToDefinition(false));
        ipcRenderer.on("next-usage", () => this.jumpToDefinition(true));

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

    private setText(pathname: string, text: string): void {
        this.pathname = pathname;
        this.cm.setValue(text);

        this.store.set(CURRENT_PATHNAME_KEY, pathname);
    }

    private nextError(): void {
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
            // TODO error might not be in this file:
            this.setCursor(this.pathname, nextErrorLineNumber, 0);
        }
    }

    // Set the editor's cursor if it's for this file.
    private setCursor(pathname: string, lineNumber: number, column: number): void {
        if (pathname === this.pathname) {
            this.cm.setCursor(lineNumber, column);
        }
    }

    // Find symbol usage at a location, or undefined if we're not on a symbol.
    private findSymbolAt(lineNumber: number, column: number): SymbolHit | undefined {
        for (const symbol of this.symbols.values()) {
            // See if we're at the definition.
            if (symbol.pathname === this.pathname && lineNumber === symbol.lineNumber &&
                column >= symbol.column && column <= symbol.column + symbol.name.length) {

                return new SymbolHit(symbol, undefined);
            } else {
                // See if we're at a use.
                for (let i = 0; i < symbol.references.length; i++) {
                    let reference = symbol.references[i];

                    if (reference.pathname === this.pathname && lineNumber === reference.lineNumber
                        && column >= reference.column && column <= reference.column + symbol.name.length) {

                        return new SymbolHit(symbol, i);
                    }
                }
            }
        }

        return undefined;
    }

    // Jump from a use to its definition and vice versa.
    //
    // @param nextUse whether to jump to the next use if we're on one (true) or go to the definition (false).
    private jumpToDefinition(nextUse: boolean) {
        const pos = this.cm.getCursor();
        const symbolHit = this.findSymbolAt(pos.line, pos.ch);
        if (symbolHit !== undefined) {
            const symbol = symbolHit.symbol;

            if (symbolHit.referenceNumber === undefined) {
                if (symbol.references.length > 0) {
                    // Jump to first use.
                    const reference = symbol.references[0];
                    this.setCursor(reference.pathname, reference.lineNumber, reference.column);
                } else {
                    // TODO display error.
                }
            } else {
                if (nextUse) {
                    const reference = symbol.references[(symbolHit.referenceNumber + 1) % symbol.references.length];
                    this.setCursor(reference.pathname, reference.lineNumber, reference.column);
                } else {
                    this.setCursor(symbol.pathname, symbol.lineNumber, symbol.column);
                }
            }
        }
    }

    private clearSymbolMarks(): void {
        let mark;

        while ((mark = this.symbolMarks.pop()) !== undefined) {
            mark.clear();
        }
    }

    private updateHighlight() {
        this.clearSymbolMarks();

        const pos = this.cm.getCursor();
        const symbolHit = this.findSymbolAt(pos.line, pos.ch);
        if (symbolHit !== undefined) {
            const symbol = symbolHit.symbol;

            if (symbol.pathname === this.pathname) {
                const mark = this.cm.markText({line: symbol.lineNumber, ch: symbol.column},
                    {line: symbol.lineNumber, ch: symbol.column + symbol.name.length},
                    {
                        className: "current-symbol",
                    });
                this.symbolMarks.push(mark);
            }

            for (const reference of symbol.references) {
                console.log(reference.pathname, this.pathname);
                if (reference.pathname === this.pathname) {
                    const mark = this.cm.markText({line: reference.lineNumber, ch: reference.column},
                        {line: reference.lineNumber, ch: reference.column + symbol.name.length},
                        {
                            className: "current-symbol",
                        });
                    this.symbolMarks.push(mark);
                }
            }
        }
    }

    private assembleAll() {
        this.symbols.clear();
        this.assembled.splice(0, this.assembled.length);

        const before = Date.now();

        for (let pass = 0; pass < 2; pass++) {
            let address = 0;

            const lines: string[] = [];
            for (let lineNumber = 0; lineNumber < this.cm.lineCount(); lineNumber++) {
                const line = this.cm.getLine(lineNumber);
                lines.push(line);
            }
            const fileStack = [new File(this.pathname, lines)];

            while (fileStack.length > 0) {
                const top = fileStack[fileStack.length - 1];
                if (top.lineNumber >= top.lines.length) {
                    fileStack.pop();
                    continue;
                }

                const lineNumber = top.lineNumber++;
                const line = top.lines[lineNumber];
                const parser = new Parser(line, top.pathname, lineNumber, address, this.symbols, pass === 0);
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
                        fileStack.push(new File(pathname, includedLines));
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

                if (results.variant !== undefined && results.variant.clr !== null) {
                    const clr = results.variant.clr;
                    let popup = "<b>" + clr.instruction.toUpperCase() + "</b><br><br>";
                    if (clr.description) {
                        popup += clr.description + "<br><br>";
                    }
                    popup += clr.byte_count + " bytes, ";
                    if (clr.with_jump_clock_count === clr.without_jump_clock_count) {
                        popup += clr.with_jump_clock_count + " clocks.<br><br>";
                    } else {
                        popup += clr.with_jump_clock_count + "/" + clr.without_jump_clock_count + " clocks.<br><br>";
                    }

                    if (clr.flags === "------") {
                        popup += "Flags are unaffected.</br>";
                    } else {
                        const flagLabels = ['C', 'N', 'P/V', 'H', 'Z', 'S'];

                        for (let i = 0; i < 6; i++) {
                            popup += "<b>" + flagLabels[i] + ":</b> ";

                            switch (clr.flags.charAt(i)) {
                                case '-':
                                    popup += 'unaffected';
                                    break;
                                case '+':
                                    popup += 'affected as defined';
                                    break;
                                case 'P':
                                    popup += 'detects parity';
                                    break;
                                case 'V':
                                    popup += 'detects overflow';
                                    break;
                                case '1':
                                    popup += 'set';
                                    break;
                                case '0':
                                    popup += 'reset';
                                    break;
                                case '*':
                                    popup += 'exceptional';
                                    break;
                                default:
                                    popup += 'unknown';
                                    break;
                            }
                            popup += "<br>";
                        }
                    }

                    if (clr.undocumented) {
                        popup += "<br>Undocumented instructions.<br>";
                    }
                    addressElement.addEventListener("mouseenter", event => {
                        console.log("mouseenter");
                        if (addressElement !== null && (addressElement as any)._tippy === undefined) {
                            console.log("defining");
                            const instance = tippy(addressElement, {
                                content: popup,
                                allowHTML: true,
                            });
                            instance.show();
                        }
                    });
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
        // TODO remove.
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

function main() {
    const element = document.getElementById("editor") as HTMLElement;
    new Ide(element);
}

main();
