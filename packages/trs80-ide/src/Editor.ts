import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands"
import {
    BlockInfo,
    Decoration,
    DecorationSet,
    drawSelection,
    dropCursor,
    EditorView,
    gutter,
    gutterLineClass,
    GutterMarker,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    hoverTooltip,
    keymap,
    lineNumbers,
    rectangularSelection,
    Tooltip,
    TooltipView,
    ViewPlugin,
    ViewUpdate
} from "@codemirror/view"
import {
    Compartment,
    EditorSelection,
    EditorState,
    Extension,
    RangeSet,
    StateEffect,
    StateEffectType,
    StateField,
    Text,
    Transaction
} from "@codemirror/state"
import {
    bracketMatching,
    defaultHighlightStyle,
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
import {AssemblyResults, ErrorAssembledLine} from "./AssemblyResults";
import {screenshotPlugin} from "./ScreenshotPlugin";
import {customCompletions} from "./AutoComplete";
import {Emulator} from "./Emulator";
import {getDefaultExample, getDefaultTheme} from "./UserInterface";
import {getInitialSpaceCount} from "./utils";

const AUTO_SAVE_KEY = "trs80-ide-auto-save";

/**
 * Gutter to show info about the line (address, bytecode, etc.).
 */
class InfoGutter extends GutterMarker {
    constructor(private readonly text: string, private readonly cssClasses: string[] = []) {
        super();
    }

    toDOM() {
        if (this.cssClasses.length === 0) {
            return document.createTextNode(this.text);
        } else {
            const span = document.createElement("span");
            span.classList.add(... this.cssClasses);
            span.textContent = this.text;
            return span;
        }
    }
}

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

// An extension that can be turned on or off.
class OptionalExtension {
    private enabled: boolean;
    private readonly extension: Extension;
    private readonly compartment: Compartment;

    public constructor(enabled: boolean, extension: Extension) {
        this.enabled = enabled;
        this.extension = extension;
        this.compartment = new Compartment();
    }

    // The initial extension to put into the editor's config.
    public getInitialExtension(): Extension {
        return this.compartment.of(this.getExtension());
    }

    // Enable or disable the extension.
    public setEnabled(view: EditorView, enabled: boolean): void {
        this.enabled = enabled;
        view.dispatch({
            effects: this.compartment.reconfigure(this.getExtension()),
        });
    }

    // Get the extension, if enabled.
    private getExtension(): Extension {
        return this.enabled ? this.extension : [];
    }
}

// Encapsulates a command to manipulate breakpoints.
interface BreakpointAction {
    action: "set" | "reset" | "reset-all";
    pos: number;
}

// Encapsulates the editor and methods for it.
export class Editor {
    private readonly emulator: Emulator;
    private readonly assemblyResultsStateEffect: StateEffectType<AssemblyResults>;
    private readonly assemblyResultsStateField: StateField<AssemblyResults>;
    private readonly breakpointEffect: StateEffectType<BreakpointAction>;
    private readonly breakpointState: StateField<RangeSet<GutterMarker>>;
    private readonly currentPcEffect: StateEffectType<number | undefined>;
    private readonly fileHandleStateEffect: StateEffectType<FileSystemFileHandle | undefined>;
    private readonly fileHandleStateField: StateField<FileSystemFileHandle | undefined>;
    public readonly errorPill: HTMLDivElement;
    public readonly view: EditorView;
    private lineNumbersGutter: OptionalExtension;
    private addressesGutter: OptionalExtension;
    private bytecodeGutter: OptionalExtension;
    private timingGutter: OptionalExtension;
    public autoRun = true;
    private currentLineNumber = 0; // 1-based.
    private currentLineHasError = false;

    public constructor(emulator: Emulator) {
        this.emulator = emulator;
        this.emulator.debugPc.subscribe(this.onDebugPc.bind(this));

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

        const dummyMarker = new class extends GutterMarker {};
        this.breakpointEffect = StateEffect.define<BreakpointAction>({
            map: (value, mapping) => ({
                action: value.action,
                pos: mapping.mapPos(value.pos),
            }),
        });
        this.breakpointState = StateField.define<RangeSet<GutterMarker>>({
            create: () => {
                return RangeSet.empty;
            },
            update: (set: RangeSet<GutterMarker>, transaction: Transaction) => {
                set = set.map(transaction.changes);

                for (const e of transaction.effects) {
                    if (e.is(this.breakpointEffect)) {
                        const value = e.value as BreakpointAction;
                        switch (value.action) {
                            case "set":
                                set = set.update({add: [dummyMarker.range(value.pos)]});
                                break;
                            case "reset":
                                set = set.update({filter: from => from != value.pos});
                                break;
                            case "reset-all":
                                set = RangeSet.empty;
                                break;
                        }
                    }
                }

                this.updateBreakpoints(set);

                return set;
            }
        });

        // Update the PC while single-stepping.
        this.currentPcEffect = StateEffect.define<number | undefined>({});

        // Effect/field for the file handle.
        this.fileHandleStateEffect = StateEffect.define<FileSystemFileHandle | undefined>();
        this.fileHandleStateField = StateField.define<FileSystemFileHandle | undefined>({
            create: () => {
                return undefined;
            },
            update: (value: FileSystemFileHandle | undefined, tr: Transaction) => {
                // See if we're explicitly setting it from the outside.
                for (const effect of tr.effects) {
                    if (effect.is(this.fileHandleStateEffect)) {
                        return effect.value;
                    }
                }
                return value;
            },
        });

        this.lineNumbersGutter = new OptionalExtension(true, lineNumbers());
        this.addressesGutter = new OptionalExtension(true, this.makeAddressesGutter());
        this.bytecodeGutter = new OptionalExtension(true, this.makeBytecodeGutter());
        this.timingGutter = new OptionalExtension(false, this.makeTimingGutter());

        const extensions: Extension = [
            this.lineNumbersGutter.getInitialExtension(),
            this.addressesGutter.getInitialExtension(),
            this.bytecodeGutter.getInitialExtension(),
            this.timingGutter.getInitialExtension(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            // foldGutter(),
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
            highlightSelectionMatches({
                highlightWordAroundCursor: true,
            }),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                // ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
                indentWithTab,
            ]),
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    const results = this.getAssemblyResults(update.state);
                    this.updateEverything(results);
                    if (!this.getAssemblyResults(update.state).equals(this.getAssemblyResults(update.startState))) {
                        this.potentiallyAutoRun(results);
                    }
                }
            }),
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    window.localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(update.state.doc.toJSON()));
                }
            }),
            EditorView.updateListener.of(update => {
                // Keep track of current line number and whether it had an error when we moved to it.
                const cursor = update.state.selection.main.head;
                const line = update.state.doc.lineAt(cursor);
                const lineNumber = line.number;
                if (lineNumber !== this.currentLineNumber) {
                    const assemblyResults = this.getAssemblyResults(update.state);
                    const hasError = assemblyResults.sourceFile.assembledLines[lineNumber - 1].error !== undefined;
                    this.currentLineNumber = lineNumber;
                    this.currentLineHasError = hasError;
                    this.updateEverything(assemblyResults);
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
            hoverTooltip(this.getHoverTooltip.bind(this), {
                hideOnChange: true,
            }),
            this.breakpointState,
            this.currentPcHighlightExtension(),
            this.fileHandleStateField,
        ];

        let defaultDoc: string | Text | undefined = undefined;
        const saveDoc = window.localStorage.getItem(AUTO_SAVE_KEY);
        if (saveDoc !== null) {
            const lines = JSON.parse(saveDoc);
            defaultDoc = Text.of(lines);
        } else {
            defaultDoc = getDefaultExample();
        }

        let startState = EditorState.create({
            doc: defaultDoc,
            extensions: extensions,
        });

        this.view = new EditorView({
            state: startState,
        });

        this.errorPill = document.createElement("div");
        this.errorPill.classList.add("error-pill");
        this.errorPill.addEventListener("click", () => this.nextError());
    }

    // Get the editor's node.
    public getNode(): HTMLElement {
        return this.view.dom;
    }

    // Get the most recent assembly results.
    public getAssemblyResults(state?: EditorState): AssemblyResults {
        state = state ?? this.view.state;
        return state.field(this.assemblyResultsStateField);
    }

    // Set the presentation mode (large text, etc.).
    public setPresentationMode(presentationMode: boolean): void {
        this.view.dispatch({
            effects: gBaseThemeConfig.reconfigure([presentationMode ? gPresentationTheme : gBaseTheme]),
        });
    }

    // Specify whether to show line numbers.
    public setShowLineNumbers(showLineNumbers: boolean): void {
        this.lineNumbersGutter.setEnabled(this.view, showLineNumbers);
    }

    // Specify whether to show addresses.
    public setShowAddresses(showAddresses: boolean): void {
        this.addressesGutter.setEnabled(this.view, showAddresses);
    }

    // Specify whether to show bytecodes.
    public setShowBytecode(showBytecode: boolean): void {
        this.bytecodeGutter.setEnabled(this.view, showBytecode);
    }

    // Specify whether to show timing.
    public setShowTiming(showTiming: boolean): void {
        this.timingGutter.setEnabled(this.view, showTiming);
    }

    // Set the editor to the specific color theme.
    public setTheme(theme: Extension): void {
        this.view.dispatch({
            effects: gColorThemeConfig.reconfigure([theme]),
        });
    }

    // Load the code of an example into the editor.
    public setCode(code: string, handle?: FileSystemFileHandle | undefined) {
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: code,
            },
            effects: [
                this.fileHandleStateEffect.of(handle),
            ],
        });
    }

    // Get the editor contents as a string.
    public getCode(): string {
        return this.view.state.doc.sliceString(0);
    }

    // Get the current file handle, if any.
    public getFileHandle(): FileSystemFileHandle | undefined {
        return this.view.state.field(this.fileHandleStateField);
    }

    // Get tooltip content given a hover position.
    private getHoverTooltip(view: EditorView, pos: number, side: number): Tooltip | null {
        const {from, to, text, number} = view.state.doc.lineAt(pos);
        const assemblyResults = this.getAssemblyResults(view.state);
        const line = assemblyResults.sourceFile.assembledLines[number - 1];
        if (line.variant === undefined) {
            return null;
        }

        const dom = document.createElement("div");
        dom.classList.add("hover-tooltip");

        // Utility function to make a node with a class and text.
        function makeNode(tagName: string, className: string, textContent?: string): HTMLElement {
            const div = document.createElement(tagName);
            div.classList.add(className);
            if (textContent !== undefined) {
                div.textContent = textContent;
            }
            return div;
        }

        const clr = line.variant.clr;
        if (clr !== undefined) {
            const headerNode = makeNode("div", "hover-tooltip-header");
            dom.append(headerNode);
            headerNode.append(makeNode("span", "hover-tooltip-instruction", clr.instruction));
            const modifiers: string[] = [];
            if (clr.undocumented) {
                modifiers.push("undocumented");
            }
            if (line.variant.isPseudo) {
                modifiers.push("pseudo");
            }
            if (modifiers.length > 0) {
                headerNode.append(makeNode("span", "hover-tooltip-modifiers",
                    " (" + modifiers.join(", ") + ")"));
            }
            dom.append(makeNode("div", "hover-tooltip-description", clr.description));
            const clockNode = makeNode("div", "hover-tooltip-clocks");
            dom.append(clockNode);
            clockNode.append(makeNode("span", "hover-tooltip-clocks-label", "Clocks: "));
            clockNode.append(makeNode("span", "hover-tooltip-clocks-value",
                clr.without_jump_clock_count + (clr.with_jump_clock_count !== clr.without_jump_clock_count ?
                    " (" + clr.with_jump_clock_count + " with jump)" : "")));
            if (clr.flags === "------") {
                dom.append(makeNode("div", "hover-tooltip-flags-unaffected", "Flags are unaffected"));
            } else {
                const FLAGS = "CNPHZS";
                for (let i = 0; i < 6; i++) {
                    const flagNode = makeNode("div", "hover-tooltip-flag");
                    dom.append(flagNode);
                    flagNode.append(makeNode("span", "hover-tooltip-clocks-label", FLAGS[i] + ": "));
                    let value: string | undefined = undefined;
                    switch (clr.flags[i]) {
                        case "-": value = "unaffected"; break;
                        case "0": value = "reset"; break;
                        case "1": value = "set"; break;
                        case "P": value = "detects parity"; break;
                        case "V": value = "detects overflow"; break;
                        case "+": value = "affected as defined"; break;
                        case "*": value = "exceptional (see docs)"; break;
                        case " ": value = "unknown"; break;
                        default: value = "???"; break;
                    }
                    flagNode.append(makeNode("span", "hover-tooltip-clocks-value", value));
                }
            }
        } else {
            if (line.variant.isPseudo) {
                dom.append(makeNode("div", "hover-tooltip-pseudo", "This is a pseudo instruction."));
            }
        }

        if (dom.children.length === 0) {
            return null;
        }

        const initialSpaceCount = getInitialSpaceCount(text);
        const start = from + initialSpaceCount;
        const end = to; // TODO could remove comment and trailing whitespace.

        if (pos < start || pos > to) {
            return null;
        }

        return {
            pos: start,
            end: end,
            above: true,
            create(view: EditorView): TooltipView {
                return {dom};
            },
        };
    }

    // Update the squiggly lines in the editor.
    public updateDiagnostics(results: AssemblyResults) {
        const diagnostics: Diagnostic[] = [];
        for (const line of results.errorLines) {
            if (line.lineNumber !== undefined /* TODO */ && this.lineShouldDisplayError(line)) {
                const lineInfo = this.view.state.doc.line(line.lineNumber + 1);
                const text = lineInfo.text;
                diagnostics.push({
                    from: lineInfo.from + getInitialSpaceCount(text),
                    to: lineInfo.to,
                    severity: "error",
                    message: line.error,
                });
            }
        }

        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }

    // Whether we should highlight this error line.
    private lineShouldDisplayError(line: ErrorAssembledLine): boolean {
        // Don't show error if it didn't have an error when we moved to it, we're still typing the line.
        return line.lineNumber !== undefined &&
            (line.lineNumber + 1 !== this.currentLineNumber || this.currentLineHasError);
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
        this.potentiallyAutoRun(results);
    }

    // Update editor state as a result of assembly.
    private updateEverything(results: AssemblyResults) {
        this.updateDiagnostics(results);
        this.updateAssemblyErrors(results);
    }

    // Run the program if necessary.
    private potentiallyAutoRun(results: AssemblyResults) {
        if (this.autoRun) {
            this.emulator.runProgram(results);
        }
    }

    // Show error pill with number of assembly errors.
    private updateAssemblyErrors(results: AssemblyResults) {
        let count = 0;
        for (const line of results.errorLines) {
            if (this.lineShouldDisplayError(line)) {
                count += 1;
            }
        }
        if (count === 0) {
            this.errorPill.style.display = "none";
        } else {
            this.errorPill.style.display = "block";
            this.errorPill.innerText = count.toString();
        }
    }

    private setCursorToReference(ref: SymbolReference): void {
        this.moveCursorToLineNumber(ref.lineNumber + 1, ref.column);
    }

    // Toggle the breakpoint at the specified location.
    private toggleBreakpoint(view: EditorView, pos: number) {
        const hasBreakpoint = this.posHasBreakpoint(view, pos);
        view.dispatch({
            effects: this.breakpointEffect.of({
                action: hasBreakpoint ? "reset" : "set",
                pos: pos,
            }),
        });
    }

    // Clear all breakpoints set by the user.
    public clearAllBreakpoints(): void {
        this.view.dispatch({
            effects: this.breakpointEffect.of({
                action: "reset-all",
                pos: 0,
            }),
        });
    }

    // Whether the editor position (which should be the first on a line) has a breakpoint set.
    private posHasBreakpoint(view: EditorView, pos: number): boolean {
        const breakpoints = view.state.field(this.breakpointState);
        let hasBreakpoint = false;
        breakpoints.between(pos, pos, () => {hasBreakpoint = true});
        return hasBreakpoint;
    }

    // Update the emulator's breakpoints from our editor breakpoints.
    private updateBreakpoints(set: RangeSet<GutterMarker>): void {
        let breakpoints: Uint8Array | undefined;
        if (set.size === 0) {
            breakpoints = undefined;
        } else {
            breakpoints = new Uint8Array(64*1024);

            const results = this.getAssemblyResults();

            let count = 0;
            const itr = set.iter();
            while (itr.value !== null) {
                const lineNumber = this.view.state.doc.lineAt(itr.from).number;
                const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                if (assembledLine !== undefined && assembledLine.binary.length > 0) {
                    breakpoints[assembledLine.address] = 1;
                    count += 1;
                }

                itr.next();
            }

            // Faster run-time checks.
            if (count === 0) {
                breakpoints = undefined;
            }
        }
        this.emulator.setBreakpoints(breakpoints);
    }

    // An extension to highlight the line for the PC.
    private currentPcHighlightExtension(): Extension {
        // Keep track of the current PC while single-stepping.
        const currentPcState = StateField.define<number | undefined>({
            create: () => undefined,
            update: (value: number | undefined, transaction: Transaction): number | undefined => {
                for (const e of transaction.effects) {
                    if (e.is(this.currentPcEffect)) {
                        value = e.value;
                    }
                }

                return value;
            },
        });

        // Get position of start of line where PC is.
        const getPcLinePos = (state: EditorState): number | undefined => {
            const pc = state.field(currentPcState);
            if (pc !== undefined) {
                const assemblyResults = this.getAssemblyResults();
                const lineNumber = assemblyResults.addressToLineMap.get(pc);
                if (lineNumber !== undefined) {
                    return state.doc.line(lineNumber).from;
                }
            }

            return undefined;
        };

        // Gutter marker for gutter highlighting.
        const currentPcGutterMarker = new class extends GutterMarker {
            elementClass = "currentPcGutter";
        };

        // Extension to highlight gutter of PC.
        const currentPcGutterHighlighter = gutterLineClass.compute([currentPcState], state => {
            const marks = [];
            const linePos = getPcLinePos(state);
            if (linePos !== undefined) {
                marks.push(currentPcGutterMarker.range(linePos));
            }
            return RangeSet.of(marks)
        });

        // Decoration to highlight non-gutter line.
        const lineDeco = Decoration.line({class: "currentPcLine"});

        // Plugin to update decoration for PC line.
        const currentPcHighlighter = ViewPlugin.fromClass(class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.getDeco(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged ||
                    update.state.field(currentPcState) !== update.startState.field(currentPcState)) {

                    this.decorations = this.getDeco(update.view);

                    const linePos = getPcLinePos(update.state);
                    if (linePos !== undefined) {
                        // TODO I put this setTimeout() here because we're not permitted to
                        // dispatch a new transaction using an update. But I don't know what the
                        // correct way is to observe changes to a state field and dispatch
                        // new effects. In general I don't know how to react to changes
                        // to state fields.
                        setTimeout(() => {
                            update.view.dispatch({
                                effects: EditorView.scrollIntoView(linePos, {
                                    y: "center",
                                }),
                            });
                        }, 0);
                    }
                }
            }

            private getDeco(view: EditorView) {
                const linePos = getPcLinePos(view.state);
                if (linePos === undefined) {
                    return Decoration.none;
                } else {
                    return Decoration.set([lineDeco.range(linePos)]);
                }
            }
        }, {
            decorations: v => v.decorations,
        })

        return [
            currentPcState,
            currentPcGutterHighlighter,
            currentPcHighlighter,
        ];
    }

    // Update the PC while single-stepping.
    private onDebugPc(pc: number | undefined): void {
        this.view.dispatch({
            effects: this.currentPcEffect.of(pc),
        });
    }

    /**
     * Gutter to show each line's address.
     */
    private makeAddressesGutter() {
        return gutter({
            class: "gutter-addresses hidable-gutter",
            lineMarker: (view: EditorView, line: BlockInfo) => {
                const results = this.getAssemblyResults(view.state);
                const lineNumber = view.state.doc.lineAt(line.from).number;
                const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                if (assembledLine !== undefined && assembledLine.binary.length > 0) {
                    const hasBreakpoint = this.posHasBreakpoint(view, line.from);
                    return new InfoGutter(toHexWord(assembledLine.address), [
                        "gutter-address",
                        ... (hasBreakpoint ? ["gutter-breakpoint"] : []),
                    ]);
                }
                return null;
            },
            domEventHandlers: {
                mousedown: (view: EditorView, line: BlockInfo, event: Event) => {
                    const mouseEvent = event as MouseEvent;
                    if (mouseEvent.altKey || mouseEvent.shiftKey || mouseEvent.ctrlKey || mouseEvent.metaKey) {
                        return true;
                    }
                    const results = this.getAssemblyResults(view.state);
                    const lineNumber = view.state.doc.lineAt(line.from).number;
                    const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                    if (assembledLine !== undefined && assembledLine.binary.length > 0) {
                        this.toggleBreakpoint(view, line.from);
                    }
                    return true;
                },
            },
            lineMarkerChange: (update: ViewUpdate) => true, // TODO remove?
        });
    }

    /**
     * Gutter to show the line's bytecode.
     */
    private makeBytecodeGutter() {
        return gutter({
            class: "gutter-bytecode hidable-gutter",
            lineMarker: (view: EditorView, line: BlockInfo) => {
                const results = this.getAssemblyResults(view.state);
                const lineNumber = view.state.doc.lineAt(line.from).number;
                const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                if (assembledLine !== undefined && assembledLine.binary.length > 0) {
                    let bytes = assembledLine.binary;
                    const tooBig = bytes.length > 4;
                    if (tooBig) {
                        bytes = bytes.slice(0, 3);
                    }
                    const text = bytes.map(b => toHexByte(b)).join(" ") + (tooBig ? " ..." : "");

                    return new InfoGutter(text);
                }
                return null;
            },
            lineMarkerChange: (update: ViewUpdate) => true, // TODO remove?
        });
    }

    /**
     * Gutter to show the line's timing info.
     */
    private makeTimingGutter() {
        return gutter({
            class: "gutter-timing hidable-gutter",
            lineMarker: (view: EditorView, line: BlockInfo) => {
                const results = this.getAssemblyResults(view.state);
                const lineNumber = view.state.doc.lineAt(line.from).number;
                const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                if (assembledLine !== undefined && assembledLine.variant !== undefined) {
                    const clr = assembledLine.variant.clr;
                    if (clr !== undefined) {
                        let text = "";
                        const timing = results.timingMap.get(lineNumber);
                        if (timing !== undefined) {
                            text = timing.toString();
                        }

                        // Assume 3 digits max. Scarfman got as high as 500.
                        text = text.padEnd(4, " ") + "+" + clr.without_jump_clock_count.toString();
                        if (clr.with_jump_clock_count !== clr.without_jump_clock_count) {
                            text += "/" + clr.with_jump_clock_count;
                        }
                        return new InfoGutter(text);
                    }
                }
                return null;
            },
            lineMarkerChange: (update: ViewUpdate) => true, // TODO remove?
        });
    }
}
