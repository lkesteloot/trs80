import {
    defaultKeymap,
    history,
    historyKeymap,
    indentLess,
    indentMore,
    moveLineDown,
    moveLineUp,
    redo,
    selectAll,
    toggleComment,
    undo,
} from "@codemirror/commands"
import {
    BlockInfo,
    Decoration,
    DecorationSet,
    drawSelection,
    EditorView,
    gutter,
    gutterLineClass,
    GutterMarker,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    hoverTooltip,
    KeyBinding,
    keymap,
    lineNumbers,
    rectangularSelection,
    showPanel,
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
    Prec,
    RangeSet,
    StateEffect,
    StateEffectType,
    StateField,
    Text,
    Transaction
} from "@codemirror/state"
import {indentUnit, StreamLanguage,} from "@codemirror/language"
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, CompletionContext} from "@codemirror/autocomplete"
import {
    findNext,
    findPrevious,
    highlightSelectionMatches,
    openSearchPanel,
    searchKeymap,
    selectNextOccurrence,
} from "@codemirror/search"
import {Diagnostic, setDiagnostics} from "@codemirror/lint"
import {Asm, SourceFile, SymbolAppearance} from "z80-asm";
import {toHexByte, toHexWord, Z80_KNOWN_LABELS} from "z80-base";
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS} from "trs80-base";
import {ScreenshotSection} from "./ScreenshotSection";
import {AssemblyResults, AssemblyStats, ErrorAssembledLine} from "./AssemblyResults";
import {screenshotPlugin} from "./ScreenshotPlugin";
import {customCompletions} from "./AutoComplete";
import {Emulator} from "./Emulator";
import {getDefaultExample} from "./UserInterface";
import {getInitialSpaceCount} from "./utils";
import {INDENTATION_SIZE, z80StreamParser} from "./Z80Parser";
import {solarizedDark} from 'cm6-theme-solarized-dark'
import {asmToCmdBinary, asmToIntelHex, asmToRawBinary, asmToSystemBinary} from "trs80-asm"
import {variablePillPlugin} from "./VariablePillPlugin";

// Keys for local storage.
const CODE_KEY = "trs80-ide-code";
const ORIG_CODE_KEY = "trs80-ide-orig-code";
const NAME_KEY = "trs80-ide-name";

// Default name for file.
const DEFAULT_FILE_NAME = "untitled";

// Milliseconds after boot to wait before we take a snapshot.
const POST_BOOT_DELAY = 500;

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
    const assemblyResults = new AssemblyResults(asm, sourceFile, screenshotSections);

    gtag("event", "assemble", {
        value: assemblyResults.errorLines.length,
    });

    return assemblyResults;
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

                const binary = assembledLine.rolledUpBinary;
                if (assembledLine.isData()) {
                    if (firstDataLineNumber === undefined) {
                        firstDataLineNumber = lineNumber;
                    }
                    lastDataLineNumber = lineNumber;
                } else if (binary.length > 0) {
                    // Reached instruction.
                    break;
                }

                byteCount += binary.length;
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
    private readonly compartment = new Compartment();

    public constructor(enabled: boolean, extension: Extension) {
        this.enabled = enabled;
        this.extension = extension;
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

// Type of pill notice, so they can be hidden later or replaced.
type PillNoticeId = "error" | "reference";

// Information about a pill notice to be shown.
interface PillNotice {
    text: string,
    isError: boolean,
    priority: number,
    onPrevious?: () => void,
    onClick?: () => void,
    onNext?: () => void,
}

/**
 * Simple editor state with an effect and field.
 */
class SimpleStateField<T> {
    public readonly effect: StateEffectType<T>;
    public readonly field: StateField<T>;

    constructor(initialValue: T) {
        this.effect = StateEffect.define<T>();
        this.field = StateField.define<T>({
            create: () => initialValue,
            update: (value: T, tr: Transaction) => {
                // See if we're explicitly setting it from the outside.
                for (const effect of tr.effects) {
                    if (effect.is(this.effect)) {
                        return effect.value;
                    }
                }
                return value;
            },
        });
    }
}

/**
 * Handle the Tab key in a smart way.
 */
const fancyTab: KeyBinding = {
    key: "Tab",
    run: view => {
        const { state, dispatch } = view;
        if (state.readOnly) {
            return false;
        }
        // If we have multi-line ranges, indent all the lines.
        if (state.selection.ranges.some(r => !r.empty)) {
            return indentMore(view);
        }
        // Insert tab. TODO: Support spaces.
        dispatch(state.update(state.replaceSelection("\t"), {scrollIntoView: true, userEvent: "input"}));
        return true;
    },
    shift: indentLess,
};

// Encapsulates the editor and methods for it.
export class Editor {
    private readonly emulator: Emulator;
    private readonly assemblyResultsStateEffect: StateEffectType<AssemblyResults>;
    private readonly assemblyResultsStateField: StateField<AssemblyResults>;
    private readonly breakpointEffect: StateEffectType<BreakpointAction>;
    private readonly breakpointState: StateField<RangeSet<GutterMarker>>;
    private readonly currentPcEffect: StateEffectType<number | undefined>;
    private readonly fileHandle = new SimpleStateField<FileSystemFileHandle | undefined>(undefined);
    private readonly name = new SimpleStateField<string>(DEFAULT_FILE_NAME);
    private readonly memory = new SimpleStateField<Uint8Array | undefined>(undefined);
    public readonly pillNotice: HTMLDivElement;
    private readonly pillNoticePrevious: HTMLElement;
    private readonly pillNoticeText: HTMLElement;
    private readonly pillNoticeNext: HTMLElement;
    public readonly view: EditorView;
    private readonly pillNotices = new Map<PillNoticeId,PillNotice>();
    private readonly backJumpStack: number[] = [];
    private readonly forwardJumpStack: number[] = [];
    private lineNumbersGutter: OptionalExtension;
    private addressesGutter: OptionalExtension;
    private bytecodeGutter: OptionalExtension;
    private timingGutter: OptionalExtension;
    private statsPanel: OptionalExtension;
    public autoRun = true;
    private currentLineNumber = 0; // 1-based.
    private currentLineHasError = false;
    private origCode = "";
    private currentPillNotice: PillNotice | undefined = undefined;

    public constructor(emulator: Emulator) {
        this.emulator = emulator;
        this.emulator.debugPc.subscribe(this.onDebugPc.bind(this));
        this.emulator.trs80.onConfig.subscribe(configChange => {
            // Take another snapshot, after letting the ROM a chance to start.
            if (!configChange.oldConfig.equals(configChange.newConfig)) {
                this.emulator.trs80State = undefined;
                setTimeout(() => this.reassemble(), POST_BOOT_DELAY);
            }
        });

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

                this.updateBreakpoints(set, transaction.newDoc);

                return set;
            }
        });

        // Update the PC while single-stepping.
        this.currentPcEffect = StateEffect.define<number | undefined>({});

        this.lineNumbersGutter = new OptionalExtension(true, lineNumbers());
        this.addressesGutter = new OptionalExtension(true, this.makeAddressesGutter());
        this.bytecodeGutter = new OptionalExtension(true, this.makeBytecodeGutter());
        this.timingGutter = new OptionalExtension(false, this.makeTimingGutter());
        this.statsPanel = new OptionalExtension(false, this.makeStatsPanel());

        const extensions: Extension = [
            this.lineNumbersGutter.getInitialExtension(),
            this.addressesGutter.getInitialExtension(),
            this.bytecodeGutter.getInitialExtension(),
            this.timingGutter.getInitialExtension(),
            this.statsPanel.getInitialExtension(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            // foldGutter(),
            drawSelection(),
            // dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            // indentOnInput(),
            // bracketMatching(),
            // Disable closeBrackets(), it's not super useful in assembly, and it gets in the way of
            // auto-complete where you type "ld (", the close parenthesis gets added, and when the
            // line auto-completes the close parenthesis is left at the end.
            // closeBrackets(),
            autocompletion({
                override: [
                    (context: CompletionContext) => customCompletions(context, this.assemblyResultsStateField)
                ],
                defaultKeymap: false,
            }),
            // Use the default autocomplete keymap, but replace Enter with Tab.
            Prec.highest(keymap.of(completionKeymap
                .map(m => ({ ...m, key: m.key === "Enter" ? "Tab" : m.key })))),
            rectangularSelection(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                // ...foldKeymap,
                // Opens a lint panel, seems kinda broken:
                // ...lintKeymap,
                fancyTab,
            ]),
            // Reassemble and run when contents change.
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    const results = this.getAssemblyResults(update.state);
                    this.updateEverything(results);
                    if (!this.getAssemblyResults(update.state).equals(this.getAssemblyResults(update.startState))) {
                        this.potentiallyAutoRun(results);
                    }
                }
            }),
            // Auto-save after doc changes.
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    window.localStorage.setItem(CODE_KEY, JSON.stringify(update.state.doc.toJSON()));
                }
                if (update.docChanged || update.selectionSet) {
                    // Hide "1 of 3 references" when user moves around.
                    this.hidePillNotice("reference");
                }
            }),
            // Keep track of current line number and whether it had an error when we moved to it.
            EditorView.updateListener.of(update => {
                const cursor = update.state.selection.main.head;
                const line = update.state.doc.lineAt(cursor);
                const lineNumber = line.number;
                if (lineNumber !== this.currentLineNumber) {
                    const assemblyResults = this.getAssemblyResults(update.state);
                    const hasError = assemblyResults.sourceFile.assembledLines[lineNumber - 1].rolledUpError !== undefined;
                    this.currentLineNumber = lineNumber;
                    this.currentLineHasError = hasError;
                    this.updateEverything(assemblyResults);
                }
            }),
            screenshotPlugin({
                assemblyResultsStateField: this.assemblyResultsStateField,
                startScreenEditor: emulator.startScreenEditor.bind(emulator),
                onClose: () => {
                    this.reassemble();
                },
            }),
            variablePillPlugin({
                assemblyResultsStateField: this.assemblyResultsStateField,
                memoryStateField: this.memory.field,
            }),
            this.assemblyResultsStateField,
            // indentUnit.of(" ".repeat(INDENTATION_SIZE)),
            indentUnit.of("\t"),
            EditorState.tabSize.of(INDENTATION_SIZE),
            gBaseThemeConfig.of(gBaseTheme),
            EditorView.theme({
                // Override theme, which uses an opaque color for the active line, and this hides
                // the selection, which is done in a separate layer below.
                '.cm-activeLine': {
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                },
                // The selection in this theme is identical to the active line highlight.
                // Make it more obvious.
                '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                },
                // Our theme makes the highlighted item dim, which has the wrong effect, it makes it
                // seem unhighlighted. Use a different effect.
                '.cm-tooltip-autocomplete': {
                    '& > ul > li[aria-selected]': {
                        // Match menubar colors.
                        backgroundColor: "var(--blue)",
                        color: "white",
                    },
                },
                // Default colors here make the text hard to read. Use a box instead.
                '.cm-snippetField': {
                    backgroundColor: "inherit",
                    boxShadow: "inset 0 0 0.5px 0.5px var(--orange)",
                },
                '.cm-snippetField *': {
                    // Stand out regardless of syntax highlight.
                    color: "white",
                    // Get rid of italic for comments, the text sticks out of the box.
                    fontStyle: "normal",
                },
                ".cm-stats-panel": {
                    padding: "5px 10px",
                },
                ".cm-stats-panel .cm-stats-panel-number": {
                    fontWeight: "bold",
                    color: "var(--blue)",
                },
            }),
            solarizedDark,
            highlightActiveLine(),
            highlightSelectionMatches({
                highlightWordAroundCursor: true,
            }),
            hoverTooltip(this.getHoverTooltip.bind(this), {
                hideOnChange: true,
            }),
            this.breakpointState,
            this.currentPcHighlightExtension(),
            this.fileHandle.field,
            this.name.field,
            this.memory.field,
            StreamLanguage.define(z80StreamParser),
        ];

        // Load saved doc.
        let defaultDoc: string | Text | undefined;
        const saveDoc = window.localStorage.getItem(CODE_KEY);
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

        // Create the pill that shows the number of errors.
        this.pillNotice = document.createElement("div");
        this.pillNotice.classList.add("pill-notice", "pill-notice-hidden");
        this.pillNotice.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            this.currentPillNotice?.onClick?.();
        });
        this.pillNoticePrevious = document.createElement("div");
        this.pillNoticePrevious.classList.add("pill-notice-arrow");
        this.pillNoticePrevious.textContent = "\u25C0";
        this.pillNoticePrevious.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            this.currentPillNotice?.onPrevious?.();
        });
        this.pillNoticeText = document.createElement("div");
        this.pillNoticeNext = document.createElement("div");
        this.pillNoticeNext.classList.add("pill-notice-arrow");
        this.pillNoticeNext.textContent = "\u25B6";
        this.pillNoticeNext.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            this.currentPillNotice?.onNext?.();
        });
        this.pillNotice.append(this.pillNoticePrevious, this.pillNoticeText, this.pillNoticeNext);

        // Set the orig code from storage or current editor.
        const origCode = window.localStorage.getItem(ORIG_CODE_KEY);
        this.setOrigCode(origCode ?? this.getCode());

        // Set the name of the file.
        this.setName(window.localStorage.getItem(NAME_KEY) ?? DEFAULT_FILE_NAME);

        // Don't assemble right away, give the ROM a chance to start.
        setTimeout(() => this.reassemble(), POST_BOOT_DELAY);
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

    // Undo the last change.
    public undo() {
        undo(this.view);
    }

    // Redo the last undo'ed change.
    public redo() {
        redo(this.view);
    }

    // Open the Find panel below the editor.
    public openSearchPanel() {
        openSearchPanel(this.view);
    }

    // Find the next occurrence of the searched term.
    public findNext() {
        findNext(this.view);
    }

    // Find the previous occurrence of the searched term.
    public findPrevious() {
        findPrevious(this.view);
    }

    // Select the next occurrence of the searched term. If no term is being searched,
    // use the one under the cursor.
    public selectNextOccurrence() {
        selectNextOccurrence(this.view);
    }

    // Select all text in the file.
    public selectAll() {
        selectAll(this.view);
    }

    // Toggle comment on cursor line.
    public toggleComment() {
        toggleComment(this.view);
    }

    // Move the current line up.
    public moveLineUp() {
        moveLineUp(this.view);
    }

    // Move the current line down.
    public moveLineDown() {
        moveLineDown(this.view);
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

    // Specify whether to show various stats.
    public setShowStats(showStats: boolean): void {
        this.statsPanel.setEnabled(this.view, showStats);
    }

    // Load the code of an example into the editor.
    public setCode(code: string, name?: string, handle?: FileSystemFileHandle | undefined) {
        name = name ?? DEFAULT_FILE_NAME;
        this.emulator.closeScreenEditor();
        this.setOrigCode(code);
        window.localStorage.setItem(NAME_KEY, name);
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: code,
            },
            effects: [
                this.fileHandle.effect.of(handle),
                this.name.effect.of(name),
            ],
        });
        this.updateName();
    }

    // Update the file handle.
    public setHandle(handle: FileSystemFileHandle | undefined) {
        this.view.dispatch({
            effects: [
                this.fileHandle.effect.of(handle),
            ],
        });
    }

    // Get the editor contents as a string.
    public getCode(): string {
        return this.view.state.doc.sliceString(0);
    }

    // Get the current file handle, if any.
    public getFileHandle(): FileSystemFileHandle | undefined {
        return this.view.state.field(this.fileHandle.field);
    }

    // Get the current file name (without extension).
    public getName(): string {
        return this.view.state.field(this.name.field);
    }

    // Set the current file name (without extension).
    public setName(name: string) {
        window.localStorage.setItem(NAME_KEY, name);
        this.view.dispatch({
            effects: [
                this.name.effect.of(name),
            ],
        });
        this.updateName();
    }

    // After the name has been set in the state field, call this to update various UI things.
    private updateName() {
        const title = document.head.querySelector("title");
        if (title !== null) {
            title.textContent = "TRS-80 IDE - " + this.getName();
        }
    }

    // Whether the user has modified the editor code since it was loaded.
    public fileHasBeenModified(): boolean {
        return this.getCode() !== this.origCode;
    }

    // Indicate that the file was just saved, so the orig code is now
    // the current contents of the editor.
    public fileWasSaved() {
        this.setOrigCode(this.getCode());
    }

    // Update the original code that we compare with when deciding whether
    // the buffer has been saved.
    public setOrigCode(origCode: string) {
        this.origCode = origCode;
        window.localStorage.setItem(ORIG_CODE_KEY, origCode);
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
        function makeNode(tagName: string, className: string, textContent?: string, allowHtml = false): HTMLElement {
            const div = document.createElement(tagName);
            div.classList.add(className);
            if (textContent !== undefined) {
                if (allowHtml) {
                    div.innerHTML = textContent;
                } else {
                    div.textContent = textContent;
                }
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
            dom.append(makeNode("div", "hover-tooltip-description", clr.description, true));
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
                    to: lineInfo.to, // TODO don't include comment.
                    severity: "error",
                    message: line.rolledUpError,
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

    // Moves the cursor to the specified line (1-based), centering it in the window.
    public moveCursorToLineNumber(lineNumber: number, column: number) {
        const lineInfo = this.view.state.doc.line(lineNumber);
        this.backJumpStack.push(this.view.state.selection.main.head);
        this.forwardJumpStack.splice(0, this.forwardJumpStack.length);
        this.moveCursorToPosAndCenter(lineInfo.from + column);
    }

    /**
     * Move the cursor to the position. This is a low-level routine,
     * you might prefer {@link #moveCursorToLineNumber}.
     */
    private moveCursorToPosAndCenter(pos: number) {
        this.view.dispatch({
            selection: EditorSelection.single(pos),
            effects: EditorView.scrollIntoView(pos, {
                y: "center",
            }),
        });
        this.view.focus();
    }

    // Move the cursor to the next error (after the current line), wrapping if necessary.
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

    // Move the cursor to the previous error (before the current line), wrapping if necessary.
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

    /**
     * Go back in the jump stack.
     */
    public back(): void {
        const pos = this.backJumpStack.pop();
        if (pos !== undefined) {
            this.forwardJumpStack.push(this.view.state.selection.main.head);
            this.moveCursorToPosAndCenter(pos);
        }
    }

    /**
     * Go forward in the jump stack.
     */
    public forward(): void {
        const pos = this.forwardJumpStack.pop();
        if (pos !== undefined) {
            this.backJumpStack.push(this.view.state.selection.main.head);
            this.moveCursorToPosAndCenter(pos);
        }
    }

    // Jump from a use to its definition and vice versa.
    //
    // @param nextUse whether to cycle uses/definitions (true) or switch between use and definition (false).
    // @param next go to the next (if nextUse is true), vs. previous.
    public jumpToDefinition(nextUse: boolean, next: boolean) {
        const assemblyResults = this.getAssemblyResults();
        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const symbolHit = assemblyResults.findSymbolAt(line.number - 1, pos - line.from);
        if (symbolHit !== undefined) {
            const symbol = symbolHit.symbol;

            let count = 0;
            let index = 0;
            let noun = "";
            let error: string | undefined;

            if (symbolHit.isDefinition) {
                if (nextUse) {
                    count = symbol.definitions.length;
                    index = (symbolHit.appearanceNumber + (next ? 1 : count - 1)) % count;
                    noun = "definitions";
                    const reference = symbol.definitions[index];
                    this.setCursorToReference(reference);
                } else if (symbol.references.length > 0) {
                    this.setCursorToReference(symbol.references[0]);
                    count = symbol.references.length;
                    index = 0;
                    noun = "references";
                } else {
                    error = "No references";
                }
            } else {
                if (nextUse) {
                    count = symbol.references.length;
                    index = (symbolHit.appearanceNumber + (next ? 1 : count - 1)) % count;
                    noun = "references";
                    const reference = symbol.references[index];
                    this.setCursorToReference(reference);
                } else if (symbol.definitions.length > 0) {
                    this.setCursorToReference(symbol.definitions[0]);
                    count = symbol.definitions.length;
                    index = 0;
                    noun = "definitions";
                } else {
                    error = "No definition";
                }
            }

            if (error !== undefined) {
                this.showPillNotice("reference", {
                    text: error,
                    isError: false,
                    priority: 10,
                });
            } else if (count > 1) {
                this.showPillNotice("reference", {
                    text: `${index + 1} of ${count} ${noun}`,
                    isError: false,
                    priority: 10,
                    onPrevious: () => this.jumpToDefinition(true, false),
                    onNext: () => this.jumpToDefinition(true, true),
                });
            } else {
                this.hidePillNotice("reference");
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
            this.hidePillNotice("error");
        } else {
            const noun = count === 1 ? "error" : "errors";
            this.showPillNotice("error", {
                text: `${count} ${noun}`,
                isError: true,
                priority: 0,
                onPrevious: count === 1 ? undefined : () => this.prevError(),
                onClick: count !== 1 ? undefined : () => this.nextError(),
                onNext: count === 1 ? undefined : () => this.nextError(),
            });
        }
    }

    private setCursorToReference(appearance: SymbolAppearance): void {
        const assembledLine = appearance.assembledLine;
        if (assembledLine !== undefined && assembledLine.lineNumber !== undefined) {
            this.moveCursorToLineNumber(assembledLine.lineNumber + 1, appearance.column);
        }
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

    // Toggle the breakpoint on the current line.
    public toggleBreakpointAtCurrentLine() {
        const results = this.getAssemblyResults(this.view.state);

        this.view.state.selection.ranges.filter(r => r.empty).forEach(r => {
            const line = this.view.state.doc.lineAt(r.from);
            const lineNumber = line.number;
            const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
            if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
                this.toggleBreakpoint(this.view, line.from);
            }
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
    private updateBreakpoints(set: RangeSet<GutterMarker>, doc: Text): void {
        let breakpoints: Uint8Array | undefined;
        if (set.size === 0) {
            breakpoints = undefined;
        } else {
            breakpoints = new Uint8Array(64*1024);

            const results = this.getAssemblyResults();

            let count = 0;
            const itr = set.iter();
            while (itr.value !== null) {
                const lineNumber = doc.lineAt(itr.from).number;
                const assembledLine = results.sourceFile.assembledLines[lineNumber - 1];
                if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
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
                const pcChanged = update.state.field(currentPcState) !== update.startState.field(currentPcState);
                if (update.docChanged || pcChanged) {
                    this.decorations = this.getDeco(update.view);

                    if (pcChanged) {
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

    // Update the PC and memory while single-stepping.
    private onDebugPc(pc: number | undefined): void {
        this.view.dispatch({
            effects: [
                this.currentPcEffect.of(pc),
                this.memory.effect.of(pc === undefined ? undefined : this.emulator.trs80.getMemory()),
            ],
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
                if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
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
                    if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
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
                if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
                    let bytes = assembledLine.rolledUpBinary;
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

    /**
     * Create the panel that shows various statistics about the assembled program.
     */
    private makeStatsPanel() {
        return showPanel.of(v => {
            const dom = document.createElement("div");
            dom.classList.add("cm-stats-panel");

            // Get the nodes for the size and label for a stat.
            function getSizeAndLabel(number: number, label: string): Node[] {
                const sizeNode = document.createElement("span");
                sizeNode.classList.add("cm-stats-panel-number");
                sizeNode.textContent = number.toString();

                const labelNode = document.createElement("span");
                labelNode.textContent = label;

                return [sizeNode, labelNode];
            }

            function pluralize(count: number, s: string) {
                return s + (count === 1 ? "" : "s");
            }

            /**
             * Takes an array of arrays of nodes, removes the empty top-level arrays,
             * puts the delimiter between the top-level arrays, and flattens them.
             */
            function joinNodes(nodesLists: (Node | string)[][], delimiter: string): (Node | string)[] {
                // Remove empty top-level arrays.
                nodesLists = nodesLists.filter(nodesList => nodesList.length > 0);

                const nodes: (Node | string)[] = [];
                for (const nodesList of nodesLists) {
                    if (nodes.length > 0) {
                        nodes.push(delimiter);
                    }
                    nodes.push(... nodesList);
                }

                return nodes;
            }

            // Get HTML nodes for statistics.
            function getStats(stats: AssemblyStats): (Node | string)[] {
                const nodesLists: Node[][] = [];

                if (stats.codeSize > 0) {
                    nodesLists.push(getSizeAndLabel(
                        stats.codeSize, " code " + pluralize(stats.codeSize, "byte")));
                }
                if (stats.dataSize > 0) {
                    nodesLists.push(getSizeAndLabel(stats.dataSize, " data " + pluralize(stats.dataSize, "byte")));
                }
                if (stats.codeSize > 0 && stats.dataSize > 0) {
                    nodesLists.push(getSizeAndLabel(stats.totalSize, " total " + pluralize(stats.totalSize, "byte")));
                }

                return joinNodes(nodesLists, ", ");
            }

            const updateStats = (state: EditorState) => {
                const assemblyResults = this.getAssemblyResults(state);
                const nodesLists: (Node | string)[][] = [];

                nodesLists.push(getStats(assemblyResults.getStats()));

                let posA = state.selection.main.head;
                let posB = state.selection.main.anchor;
                if (posB < posA) {
                    [posB, posA] = [posA, posB];
                }
                const a = state.doc.lineAt(posA).number - 1;
                const lineB = state.doc.lineAt(posB);
                let b = lineB.number - 1;
                let forceShow = false;
                if (b > a && posB === lineB.from) {
                    // Don't count the last line if we're at the very start of the line, intuitively
                    // that doesn't feel like part of the selection, nothing from that line is highlighted.
                    b -= 1;
                    forceShow = true;
                }
                if (forceShow || a < b) {
                    nodesLists.push(getStats(assemblyResults.getStats(line =>
                        line.lineNumber !== undefined && line.lineNumber >= a && line.lineNumber <= b)));
                }

                dom.replaceChildren(...joinNodes(nodesLists, "; selection: "));
            };
            updateStats(this.view.state);

            return {
                top: false,
                dom: dom,
                update: viewUpdate => {
                    if (viewUpdate.docChanged || viewUpdate.selectionSet) {
                        updateStats(viewUpdate.state);
                    }
                },
            };
        });
    }

    /**
     * Make a CMD file binary from the assembled code.
     */
    public makeCmdFile(): Uint8Array | undefined {
        const results = this.getAssemblyResults();
        const name = this.getName();
        const { entryPoint } = results.asm.getEntryPoint();
        if (entryPoint === undefined) {
            return undefined;
        }

        return asmToCmdBinary(name, entryPoint, results.asm);
    }

    /**
     * Make a system file binary from the assembled code.
     */
    public makeSystemFile(): Uint8Array | undefined {
        const results = this.getAssemblyResults();
        const name = this.getName();
        const { entryPoint } = results.asm.getEntryPoint();
        if (entryPoint === undefined) {
            return undefined;
        }

        return asmToSystemBinary(name, entryPoint, results.asm);
    }

    /**
     * Make a raw binary file, loading at address 0, from the assembled code.
     */
    public makeRawBinaryFile(): Uint8Array {
        const results = this.getAssemblyResults();
        return asmToRawBinary(0, results.asm);
    }

    /**
     * Make an Intel HEX file from the assembled code.
     */
    public makeIntelHexFile(): Uint8Array {
        const results = this.getAssemblyResults();
        const lines = asmToIntelHex(results.asm);
        const text = lines.join("\n") + "\n";
        return new TextEncoder().encode(text);
    }

    /**
     * Show a pill notice with the given ID.
     */
    private showPillNotice(id: PillNoticeId, pillNotice: PillNotice): void {
        this.pillNotices.set(id, pillNotice);
        this.updatePillNotices();
    }

    /**
     * Hide the pill notice with the given ID.
     */
    private hidePillNotice(id: PillNoticeId): void {
        this.pillNotices.delete(id);
        this.updatePillNotices();
    }

    /**
     * Update the visible pill notice, if any, from the map.
     */
    private updatePillNotices(): void {
        if (this.pillNotices.size === 0) {
            this.pillNotice.classList.add("pill-notice-hidden");
            this.currentPillNotice = undefined;
        } else {
            // Pick highest priority notice.
            const pillNotice = Array.from(this.pillNotices.values())
                .sort((a, b) => b.priority - a.priority)[0];

            this.pillNotice.classList.remove("pill-notice-hidden");
            this.pillNotice.classList.toggle("pill-notice-error", pillNotice.isError);
            this.pillNotice.classList.toggle("pill-notice-has-click", pillNotice.onClick !== undefined);
            this.pillNoticeText.innerText = pillNotice.text;
            this.pillNoticePrevious.classList.toggle("pill-notice-arrow-hidden", pillNotice.onPrevious === undefined);
            this.pillNoticeNext.classList.toggle("pill-notice-arrow-hidden", pillNotice.onNext === undefined);
            this.currentPillNotice = pillNotice;
        }
    }

    /**
     * Get the address of the selected line (where the cursor is), or undefined
     * if it can't be determined.
     */
    public getCurrentLineAddress(): number | undefined {
        const results = this.getAssemblyResults(this.view.state);

        const pos = this.view.state.selection.main.head;
        const line = this.view.state.doc.lineAt(pos);
        const assembledLine = results.sourceFile.assembledLines[line.number - 1];
        if (assembledLine !== undefined && assembledLine.rolledUpBinary.length > 0) {
            return assembledLine.address;
        } else {
            return undefined;
        }
    }
}
