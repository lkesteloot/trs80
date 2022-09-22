import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands"
import {
    BlockInfo,
    drawSelection,
    dropCursor,
    EditorView,
    gutter,
    GutterMarker,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
    ViewUpdate
} from "@codemirror/view"
import {
    Compartment,
    EditorSelection,
    EditorState,
    Extension,
    StateEffect,
    StateField,
    StateEffectType,
    Transaction
} from "@codemirror/state"
import {
    bracketMatching,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentOnInput,
    indentUnit,
    syntaxHighlighting
} from "@codemirror/language"
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from "@codemirror/autocomplete"
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search"
import {Diagnostic, lintKeymap, setDiagnostics} from "@codemirror/lint"
import {Asm, SourceFile, SymbolReference} from "z80-asm";
import {toHexByte, toHexWord, Z80_KNOWN_LABELS} from "z80-base";
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS} from "trs80-base";
import {ScreenshotSection} from "./ScreenshotSection";
import {AssemblyResults} from "./AssemblyResults";
import {screenshotPlugin} from "./ScreenshotPlugin";
import {customCompletions} from "./AutoComplete";
import {Emulator} from "./Emulator";
import {getDefaultExample, getDefaultTheme} from "./UserInterface";

/**
 * Gutter to show the line's address and bytecode.
 */
class BytecodeGutter extends GutterMarker {
    constructor(private address: number, private bytes: number[]) {
        super();
    }

    toDOM() {
        const dom = document.createElement("div");

        const addressDom = document.createElement("span");
        addressDom.textContent = toHexWord(this.address);
        addressDom.classList.add("gutter-bytecode-address");

        const bytesDom = document.createElement("span");
        const tooBig = this.bytes.length > 4;
        const bytes = tooBig ? this.bytes.slice(0, 3) : this.bytes;
        bytesDom.textContent = bytes.map(b => toHexByte(b)).join(" ") +
            (tooBig ? " ..." : "");
        bytesDom.classList.add("gutter-bytecode-bytes");

        dom.append(addressDom, bytesDom);
        return dom;
    }
}
const BYTECODE_SPACER = new BytecodeGutter(0, [1, 2, 3, 4, 5]);

// Our own theme for the editor, overlaid with the color theme the user can pick.
const gBaseTheme = EditorView.theme({
    ".cm-scroller": {
        fontFamily: `"Roboto Mono", monospace`,
        fontSize: "16px",
    },
});

// The base theme, plus whatever we need for presentations.
const gPresentationTheme = [
    EditorView.theme({
        ".cm-scroller": {
            fontSize: "20px",
        },
    }),
    gBaseTheme,
];

// Compartment to fit the current base theme into.
const gBaseThemeConfig = new Compartment();

// Compartment to fit the current color theme into.
const gColorThemeConfig = new Compartment();

function assemble(code: string[]): AssemblyResults {
    const asm = new Asm({
        readBinaryFile(pathname: string): Uint8Array | undefined {
            return undefined;
        }, readDirectory(pathname: string): string[] | undefined {
            return undefined;
        }, readTextFile(pathname: string): string[] | undefined {
            return code;
        }
    });
    asm.addKnownLabels(Z80_KNOWN_LABELS);
    asm.addKnownLabels(TRS80_MODEL_III_KNOWN_LABELS);
    asm.addKnownLabels(TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS);
    const sourceFile = asm.assembleFile("current.asm");
    if (sourceFile === undefined) {
        // Can't happen?
        throw new Error("got undefined sourceFile");
    }

    const screenshotSections = pickOutScreenshotSections(sourceFile);

    return new AssemblyResults(asm, sourceFile, screenshotSections);
}

/**
 * Look through the assembled file and find the screenshot sections.
 */
function pickOutScreenshotSections(sourceFile: SourceFile): ScreenshotSection[] {
    const screenshotSections: ScreenshotSection[] = [];

    const lines = sourceFile.assembledLines;
    for (let lineNumber = 1; lineNumber <= lines.length; lineNumber++) {
        let assembledLine = lines[lineNumber - 1];

        if (assembledLine.line.indexOf("; Screenshot") >= 0) {
            const beginLineNumber = lineNumber;
            let endLineNumber: number | undefined = undefined;
            let firstDataLineNumber: number | undefined = undefined;
            let lastDataLineNumber: number | undefined = undefined;
            let byteCount = 0;

            for (lineNumber++; lineNumber <= lines.length; lineNumber++) {
                assembledLine = lines[lineNumber - 1];

                if (assembledLine.line.indexOf("; End screenshot") >= 0) {
                    endLineNumber = lineNumber;
                    break;
                }

                if (assembledLine.line.indexOf("; Screenshot") >= 0) {
                    lineNumber -= 1;
                    endLineNumber = lineNumber;
                    break;
                }

                if (assembledLine.isData()) {
                    if (firstDataLineNumber === undefined) {
                        firstDataLineNumber = lineNumber;
                    }
                    lastDataLineNumber = lineNumber;
                } else if (assembledLine.binary.length > 0) {
                    // Reached instruction.
                    break;
                }

                byteCount += assembledLine.binary.length;
                if (byteCount >= 1024) {
                    break;
                }
            }

            const screenshotSection = new ScreenshotSection(beginLineNumber, endLineNumber,
                firstDataLineNumber, lastDataLineNumber, byteCount);
            screenshotSections.push(screenshotSection);
        }
    }

    return screenshotSections;
}

// Encapsulates the editor and methods for it.
export class Editor {
    private readonly emulator: Emulator;
    private readonly assemblyResultsStateEffect: StateEffectType<AssemblyResults>;
    private readonly assemblyResultsStateField: StateField<AssemblyResults>;
    public readonly view: EditorView;
    public autoRun = true;

    public constructor(emulator: Emulator) {
        this.emulator = emulator;

        /**
         * State field for keeping the assembly results.
         */
        this.assemblyResultsStateEffect = StateEffect.define<AssemblyResults>();
        this.assemblyResultsStateField = StateField.define<AssemblyResults>({
            create: () => {
                return assemble([""]);
            },
            update: (value: AssemblyResults, tr: Transaction) => {
                // See if we're explicitly setting it from the outside.
                for (const effect of tr.effects) {
                    if (effect.is(this.assemblyResultsStateEffect)) {
                        return effect.value;
                    }
                }
                // See if we should reassemble based on changes to the doc.
                if (tr.docChanged) {
                    return assemble(tr.state.doc.toJSON());
                } else {
                    // No, return old value.
                    return value;
                }
            },
        });

        const extensions: Extension = [
            lineNumbers(),
            this.bytecodeGutter(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle),
            bracketMatching(),
            closeBrackets(),
            autocompletion({
                override: [
                    customCompletions,
                ],
            }),
            rectangularSelection(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
                indentWithTab,
            ]),
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    this.updateEverything(update.state.field(this.assemblyResultsStateField));
                }
            }),
            // linter(view => [
            //   {
            //     from: 3,
            //     to: 5,
            //     severity: "error",
            //     message: "bad",
            //   },
            // ], {
            //   delay: 750,
            // }),
            //   z80AssemblyLanguage(),
            screenshotPlugin({
                assemblyResultsStateField: this.assemblyResultsStateField,
                startScreenEditor: emulator.startScreenEditor.bind(emulator),
                onClose: () => {
                    this.reassemble();
                },
            }),
            // timingPlugin(),
            this.assemblyResultsStateField,
            indentUnit.of("        "),
            gBaseThemeConfig.of(gBaseTheme),
            gColorThemeConfig.of(getDefaultTheme()),
        ];

        let startState = EditorState.create({
            doc: getDefaultExample(),
            extensions: extensions,
        });

        this.view = new EditorView({
            state: startState,
        });
    }

    // Get the editor's node.
    public getNode(): HTMLElement {
        return this.view.dom;
    }

    // Get the most recent assembly results.
    public getAssemblyResults(): AssemblyResults {
        return this.view.state.field(this.assemblyResultsStateField);
    }

    // Set the presentation mode (large text, etc.).
    public setPresentationMode(presentationMode: boolean): void {
        this.view.dispatch({
            effects: gBaseThemeConfig.reconfigure([presentationMode ? gPresentationTheme : gBaseTheme]),
        });
    }

    // Set the editor to the specific color theme.
    public setTheme(theme: Extension): void {
        this.view.dispatch({
            effects: gColorThemeConfig.reconfigure([theme]),
        });
    }

    // Load the code of an example into the editor.
    public loadExample(code: string) {
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: code,
            }
        });
    }

    // Update the squiggly lines in the editor.
    public updateDiagnostics(results: AssemblyResults) {
        const diagnostics: Diagnostic[] = [];
        for (const line of results.errorLines) {
            if (line.lineNumber !== undefined /* TODO */) {
                const lineInfo = this.view.state.doc.line(line.lineNumber + 1);
                const text = lineInfo.text;
                let firstNonBlank = 0;
                for (let i = 0; i < text.length; i++) {
                    if (text.charAt(i) !== " ") {
                        firstNonBlank = i;
                        break;
                    }
                }
                diagnostics.push({
                    from: lineInfo.from + firstNonBlank,
                    to: lineInfo.to,
                    severity: "error",
                    message: line.error,
                });
            }
        }

        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }

    // 1-based.
    public moveCursorToLineNumber(lineNumber: number, column: number) {
        const lineInfo = this.view.state.doc.line(lineNumber);
        this.view.dispatch({
            selection: EditorSelection.single(lineInfo.from + column),
            scrollIntoView: true,
        });
        this.view.focus();
    }

    public nextError() {
        const results = this.getAssemblyResults();
        if (results.errorLineNumbers.length === 0) {
            return;
        }
        const {from} = this.view.state.selection.main;
        const line = this.view.state.doc.lineAt(from);
        const cursorLineNumber = line.number;
        for (const errorLineNumber of results.errorLineNumbers) {
            if (errorLineNumber > cursorLineNumber ||
                cursorLineNumber >= results.errorLineNumbers[results.errorLineNumbers.length - 1]) {

                this.moveCursorToLineNumber(errorLineNumber, 0);
                break;
            }
        }
    }

    public prevError() {
        const results = this.getAssemblyResults();
        if (results.errorLineNumbers.length === 0) {
            return;
        }
        const {from} = this.view.state.selection.main;
        const line = this.view.state.doc.lineAt(from);
        const cursorLineNumber = line.number;
        for (const errorLineNumber of results.errorLineNumbers.slice().reverse()) {
            if (errorLineNumber < cursorLineNumber || cursorLineNumber <= results.errorLineNumbers[0]) {
                this.moveCursorToLineNumber(errorLineNumber, 0);
                break;
            }
        }
    }

    // Jump from a use to its definition and vice versa.
    //
    // @param nextUse whether to cycle uses/definitions (true) or switch between use and definition (false).
    public jumpToDefinition(nextUse: boolean) {
        const assemblyResults = this.getAssemblyResults();
        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const symbolHit = assemblyResults.findSymbolAt(line.number - 1, pos - line.from);
        if (symbolHit !== undefined) {
            const symbol = symbolHit.symbol;

            if (symbolHit.isDefinition) {
                if (nextUse) {
                    const reference = symbol.definitions[(symbolHit.referenceNumber + 1) % symbol.definitions.length];
                    this.setCursorToReference(reference);
                } else if (symbol.references.length > 0) {
                    this.setCursorToReference(symbol.references[0]);
                } else {
                    // TODO: Display error.
                }
            } else {
                if (nextUse) {
                    const reference = symbol.references[(symbolHit.referenceNumber + 1) % symbol.references.length];
                    this.setCursorToReference(reference);
                } else if (symbol.definitions.length > 0) {
                    this.setCursorToReference(symbol.definitions[0]);
                } else {
                    // TODO: Display error.
                }
            }
        }
    }

    public reassemble() {
        const results = assemble(this.view.state.doc.toJSON());
        this.view.dispatch({
            effects: this.assemblyResultsStateEffect.of(results),
        });
        this.updateEverything(results);
    }

    private updateEverything(results: AssemblyResults) {
        this.updateDiagnostics(results);
        this.updateAssemblyErrors(results);
        if (this.autoRun) {
            this.emulator.runProgram(results);
        }
    }

    private updateAssemblyErrors(results: AssemblyResults) {
        // TODO move to an overlay in editor.
        /*
        if (results.errorLines.length === 0) {
            errorContainer.style.display = "none";
        } else {
            errorContainer.style.display = "flex";
            errorMessageDiv.innerText = results.errorLines.length +
                " error" + (results.errorLines.length === 1 ? "" : "s");
        }*/
    }

    private setCursorToReference(ref: SymbolReference): void {
        this.moveCursorToLineNumber(ref.lineNumber + 1, ref.column);
    }

    /**
     * Gutter to show address and bytecode.
     */
    private bytecodeGutter() {
        return gutter({
            class: "gutter-bytecode",
            lineMarker: (view: EditorView, line: BlockInfo) => {
                const results = view.state.field(this.assemblyResultsStateField);
                const lineNumber = view.state.doc.lineAt(line.from).number;
                const assembledLine = results.lineMap.get(lineNumber);
                if (assembledLine !== undefined && assembledLine.binary.length > 0) {
                    return new BytecodeGutter(assembledLine.address, assembledLine.binary);
                }
                return null;
            },
            lineMarkerChange: (update: ViewUpdate) => true, // TODO remove?
            initialSpacer: () => BYTECODE_SPACER,
        });
    }
}
