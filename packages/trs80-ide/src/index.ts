import {defaultKeymap, indentWithTab} from "@codemirror/commands"
import {
    Decoration,
    DecorationSet,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightSpecialChars,
    keymap,
    ViewPlugin,
    ViewUpdate,
    BlockInfo,
    WidgetType
} from "@codemirror/view"
import {EditorSelection, EditorState, Extension, StateField, StateEffect, Transaction} from "@codemirror/state"
import {RangeSetBuilder} from "@codemirror/rangeset";
import {defineLanguageFacet, indentOnInput, Language, LanguageSupport, indentUnit} from "@codemirror/language"
import {history, historyKeymap} from "@codemirror/history"
import {foldGutter, foldKeymap} from "@codemirror/fold"
import {highlightActiveLineGutter, lineNumbers, gutter, GutterMarker} from "@codemirror/gutter"
import {bracketMatching} from "@codemirror/matchbrackets"
import {closeBrackets, closeBracketsKeymap} from "@codemirror/closebrackets"
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search"
import {autocompletion, completionKeymap} from "@codemirror/autocomplete"
import {commentKeymap} from "@codemirror/comment"
import {rectangularSelection} from "@codemirror/rectangular-selection"
import {defaultHighlightStyle} from "@codemirror/highlight"
import {Diagnostic, lintKeymap, setDiagnostics} from "@codemirror/lint"

import {Asm, SourceFile} from "z80-asm";
import {CassettePlayer, Config, Trs80, Trs80State} from "trs80-emulator";
import {
    CanvasScreen,
    ControlPanel,
    DriveIndicators,
    PanelType,
    SettingsPanel,
    WebKeyboard,
    WebSoundPlayer
} from "trs80-emulator-web";

import {Input, NodeType, Parser, PartialParse, Tree, TreeFragment} from "@lezer/common";

import {breakdwn} from "./breakdwn.ts";
import {scarfman} from "./scarfman.ts";
import "./style.css";
import {toHexByte, toHexWord, Z80_KNOWN_LABELS} from "z80-base"
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS} from "trs80-base"
import {ScreenEditor} from "./ScreenEditor.ts";
import {ScreenshotSection} from "./ScreenshotSection.ts";
import {AssemblyResults} from "./AssemblyResults.ts";

const initial_code = `        .org 0x5000
        di
        
        ld hl,screenshot
        ld de,15360
draw:
        ld a,(hl)
        or a
        jr z,enddraw
        ld (de),a
        inc de
        inc hl
        jr draw

enddraw:
        ld a,191
        ld hl,15360
        ld b,10
        
loop:
        ld (hl),a
        inc hl
        dec b
        jr nz,loop
      
        ; Screenshot
screenshot:
        .byte 65, 66
        ; End screenshot
        .byte 0
        
stop:
        jp stop
`;

const space_invaders = `        .org 0x5000
        di
        ld hl,15360
        inc hl
        inc hl
        
        ld a,191
        ld b, 100
        
loop:
        push hl
        ld (hl),0x80
        inc hl
        ld (hl),0x89
        inc hl
        ld (hl),0xB7
        inc hl
        ld (hl),0x9D
        inc hl
        ld (hl),0x81
        inc hl
      
        pop hl
        inc hl
      
        push bc
        ld bc,5500
wait:
        dec bc
        ld a,b
        or a,c
        jr nz,wait
        pop bc
      
        dec b
        jr nz,loop
      
stop:
        jp stop
`;

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
        bytesDom.classList.add("gutter-bytecode-address");

        dom.append(addressDom, bytesDom);
        return dom;
    }
}
const BYTECODE_SPACER = new BytecodeGutter(0, [1, 2, 3, 4, 5]);

const body = document.body;
body.classList.add("light-mode");

const content = document.createElement("div");
content.classList.add("content");
body.append(content);

const editorPane = document.createElement("div");
editorPane.classList.add("editor-pane");
const sampleChooser = document.createElement("select");
sampleChooser.classList.add("sample-chooser");
const samples = [
    {value: "initial_code", name: "Simple", code: initial_code},
    {value: "space_invaders", name: "Space Invaders", code: space_invaders},
    {value: "breakdwn", name: "Breakdown", code: breakdwn},
    {value: "scarfman", name: "Scarfman", code: scarfman},
];
for (const sample of samples) {
    const option = document.createElement("option");
    option.value = sample.value;
    option.textContent = sample.name;
    sampleChooser.append(option);
}
const editorContainer = document.createElement("div");
editorContainer.classList.add("editor-container");
const editorDiv = document.createElement("div");
editorDiv.id = "editor";
editorContainer.append(editorDiv);
const errorContainer = document.createElement("div");
errorContainer.classList.add("error-container");
const errorMessageDiv = document.createElement("div");
errorMessageDiv.id = "error-message";
const prevErrorButton = document.createElement("button");
prevErrorButton.textContent = "Previous";
prevErrorButton.addEventListener("click", () => prevError(view.state.field(assemblyResultsStateField)));
const nextErrorButton = document.createElement("button");
nextErrorButton.textContent = "Next";
nextErrorButton.addEventListener("click", () => nextError(view.state.field(assemblyResultsStateField)));
errorContainer.append(errorMessageDiv, prevErrorButton, nextErrorButton);
editorPane.append(sampleChooser, editorContainer, errorContainer);
const saveButton = document.createElement("button");
saveButton.innerText = "Save";
const restoreButton = document.createElement("button");
restoreButton.innerText = "Restore";
const emulatorDiv = document.createElement("div");
emulatorDiv.id = "emulator";
content.append(editorPane, emulatorDiv);

class EditScreenshotWidget extends WidgetType {
    private readonly screenshotIndex: number;

    constructor(screenshotIndex: number) {
        super();
        this.screenshotIndex = screenshotIndex;
    }

    eq(other: EditScreenshotWidget): boolean{
        return this.screenshotIndex === other.screenshotIndex;
    }

    toDOM(): HTMLElement {
        const button = document.createElement("span");
        button.setAttribute("aria-hidden", "true");
        button.className = "cm-screenshotEdit";
        button.innerText = "Edit";
        button.dataset.screenshotIndex = this.screenshotIndex.toString();
        return button;
    }

    ignoreEvent(): boolean {
        // We want the click.
        return false;
    }
}

const screenshotTheme = EditorView.baseTheme({
    ".cm-screenshotHighlight": { backgroundColor: "rgba(0, 0, 0, 0.05)" },
});

/**
 * Generate a set of decorations for all screenshots in the code.
 */
function decorationsForScreenshots(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const assemblyResults = view.state.field(assemblyResultsStateField);
    for (let i = 0; i < assemblyResults.screenshotSections.length; i++) {
        const s = assemblyResults.screenshotSections[i];
        const line = view.state.doc.line(s.beginCommentLineNumber);
        const widgetDeco = Decoration.widget({
            widget: new EditScreenshotWidget(i),
            side: 1,
        });
        builder.add(line.to, line.to, widgetDeco);

        if (s.firstDataLineNumber !== undefined && s.lastDataLineNumber !== undefined) {
            for (let lineNumber = s.firstDataLineNumber; lineNumber <= s.lastDataLineNumber; lineNumber++) {
                const line = view.state.doc.line(lineNumber);
                const lineDeco = Decoration.line({ // TODO I think I only need to create one of these?
                    attributes: {
                        class: "cm-screenshotHighlight",
                    },
                });
                builder.add(line.from, line.from, lineDeco);
            }
        }
    }

    return builder.finish();
}

const screenshotViewPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
        this.decorations = decorationsForScreenshots(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || true) { // TODO maybe compare assembly result screenshot info?
            this.decorations = decorationsForScreenshots(update.view)
        }
    }
}, {
    decorations: v => v.decorations,

    eventHandlers: {
        click: (e, view) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains("cm-screenshotEdit") && !view.state.field(editingScreenshotStateField)) {
                const screenshotIndex = parseInt(target.dataset.screenshotIndex as string);
                startScreenshotEditMode(view, view.posAtDOM(target), screenshotIndex);
                return true;
            } else {
                return false;
            }
        }
    }
});

function screenshotPlugin(): Extension {
    return [
        screenshotViewPlugin,
        screenshotTheme,
    ];
}

function startScreenshotEditMode(view: EditorView, pos: number, screenshotIndex: number) {
    const assemblyResults = view.state.field(assemblyResultsStateField);
    controlPanel.disable();
    view.dispatch({
        effects: editingScreenshotStateEffect.of(true),
    });
    const screenEditor = new ScreenEditor(view, pos, assemblyResults, screenshotIndex, trs80, screen, () => {
        controlPanel.enable();
        view.dispatch({
            effects: editingScreenshotStateEffect.of(false),
        });
        reassemble();
    });
    return true;
}

const nodeTypes = [
    NodeType.define({
        id: 0,
        name: "file",
    }),
    NodeType.define({
        id: 1,
        name: "line",
    }),
];

class Xyz implements PartialParse {
    input: Input;

    constructor(input: Input) {
        this.input = input;
    }

    advance(): Tree | null {
        const code = this.input.read(0, this.input.length).split("\n");
        const {sourceFile} = assemble(code);

        const lines: Tree[] = [];
        const positions: number[] = [];
        let pos = 0;

        for (let i = 0; i < sourceFile.assembledLines.length; i++) {
            lines.push(new Tree(nodeTypes[1], [], [], length));
            positions.push(pos);
            pos += code[i].length + 1;
        }

        return new Tree(nodeTypes[0], lines, positions, length);
    }

    parsedPos: number = 0;

    stopAt(pos: number): void {
        throw new Error("Method not implemented.")
    }

    stoppedAt: number | null = null;
}

class Z80AssemblyParser extends Parser {
    createParse(input: Input,
                fragments: readonly TreeFragment[],
                ranges: readonly { from: number; to: number }[]): PartialParse {

        return new Xyz(input);
    }
}

const parser = new Z80AssemblyParser();

const language = new Language(
    defineLanguageFacet(),
    parser,
    nodeTypes[1]
);

function z80AssemblyLanguage() {
    return new LanguageSupport(language, []);
}

/**
 * State field for keeping the assembly results.
 */
const assemblyResultsStateEffect = StateEffect.define<AssemblyResults>();
const assemblyResultsStateField = StateField.define<AssemblyResults>({
    create: () => {
        return assemble([""]);
    },
    update: (value: AssemblyResults, tr: Transaction) => {
        // See if we're explicitly setting it from the outside.
        for (const effect of tr.effects) {
            if (effect.is(assemblyResultsStateEffect)) {
                return effect.value;
            }
        }
        // See if we should reassembly based on changes to the doc.
        if (tr.docChanged) {
            return assemble(tr.state.doc.toJSON());
        } else {
            return value;
        }
    },
});

/**
 * State field for whether editing a screenshot.
 */
const editingScreenshotStateEffect = StateEffect.define<boolean>();
const editingScreenshotStateField = StateField.define<boolean>({
        create: () => false,
        update: (value: boolean, tr: Transaction) => {
            for (const effect of tr.effects) {
                if (effect.is(editingScreenshotStateEffect)) {
                    value = effect.value;
                }
            }
            return value;
        },
        compare: (a: boolean, b: boolean) => a === b,
    }
);

const extensions: Extension = [
    lineNumbers(),
    bytecodeGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    defaultHighlightStyle.fallback,
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...commentKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
    ]),
    EditorView.updateListener.of(update => {
        if (update.docChanged) {
            updateEverything(update.state.field(assemblyResultsStateField));
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
    screenshotPlugin(),
    assemblyResultsStateField,
    editingScreenshotStateField,
    indentUnit.of("        "),
    // Make editor read-only when editing a screenshot.
    EditorState.readOnly.from(editingScreenshotStateField, editing => editing),
];

let startState = EditorState.create({
    doc: initial_code,
    extensions: extensions,
});

const view = new EditorView({
    state: startState,
    parent: document.getElementById("editor") as HTMLDivElement
});

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

function reassemble() {
    const results = assemble(view.state.doc.toJSON());
    view.dispatch({
       effects: assemblyResultsStateEffect.of(results),
    });
    updateEverything(results);
}

function updateEverything(results: AssemblyResults) {
    updateDiagnostics(results);
    updateAssemblyErrors(results);
    runProgram(results);
}

// Update the squiggly lines in the editor.
function updateDiagnostics(results: AssemblyResults) {
    const diagnostics: Diagnostic[] = [];
    for (const line of results.errorLines) {
        if (line.lineNumber !== undefined /* TODO */) {
            const lineInfo = view.state.doc.line(line.lineNumber + 1);
            diagnostics.push({
                from: lineInfo.from,  // TODO first non-blank.
                to: lineInfo.to,
                severity: "error",
                message: line.error,
            });
        }
    }

    view.dispatch(setDiagnostics(view.state, diagnostics));
}

function runProgram(results: AssemblyResults) {
    if (results.errorLines.length === 0) {
        if (trs80State === undefined) {
            trs80State = trs80.save();
        } else {
            trs80.restore(trs80State);
        }
        for (const line of results.sourceFile.assembledLines) {
            for (let i = 0; i < line.binary.length; i++) {
                trs80.writeMemory(line.address + i, line.binary[i]);
            }
        }
        let entryPoint = results.asm.entryPoint;
        if (entryPoint === undefined) {
            for (const line of results.sourceFile.assembledLines) {
                if (line.binary.length > 0) {
                    entryPoint = line.address;
                    break;
                }
            }
        }
        if (entryPoint !== undefined) {
            trs80.jumpTo(entryPoint);
        }
    }
}

function updateAssemblyErrors(results: AssemblyResults) {
    if (results.errorLines.length === 0) {
        errorContainer.style.display = "none";
    } else {
        errorContainer.style.display = "flex";
        errorMessageDiv.innerText = results.errorLines.length +
            " error" + (results.errorLines.length === 1 ? "" : "s");
    }
}

// 1-based.
function moveCursorToLineNumber(lineNumber: number) {
    const lineInfo = view.state.doc.line(lineNumber);
    view.dispatch({
        selection: EditorSelection.single(lineInfo.from),
        scrollIntoView: true,
    });
    view.focus();
}

function nextError(results: AssemblyResults) {
    if (results.errorLineNumbers.length === 0) {
        return;
    }
    const {from} = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const cursorLineNumber = line.number;
    for (const errorLineNumber of results.errorLineNumbers) {
        if (errorLineNumber > cursorLineNumber ||
            cursorLineNumber >= results.errorLineNumbers[results.errorLineNumbers.length - 1]) {

            moveCursorToLineNumber(errorLineNumber);
            break;
        }
    }
}

function prevError(results: AssemblyResults) {
    if (results.errorLineNumbers.length === 0) {
        return;
    }
    const {from} = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const cursorLineNumber = line.number;
    for (const errorLineNumber of results.errorLineNumbers.slice().reverse()) {
        if (errorLineNumber < cursorLineNumber || cursorLineNumber <= results.errorLineNumbers[0]) {
            moveCursorToLineNumber(errorLineNumber);
            break;
        }
    }
}

/**
 * Gutter to show address and bytecode.
 */
function bytecodeGutter() {
    return gutter({
        class: "gutter-bytecode",
        lineMarker: (view: EditorView, line: BlockInfo) => {
            const results = view.state.field(assemblyResultsStateField);
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

let trs80State: Trs80State | undefined;

saveButton.addEventListener("click", () => {
    trs80State = trs80.save();
});
restoreButton.addEventListener("click", () => {
    if (trs80State !== undefined) {
        trs80.restore(trs80State);
    }
});
sampleChooser.addEventListener("change", () => {
    const sampleValue = sampleChooser.value;
    const sample = samples.filter(s => s.value === sampleValue)[0];
    if (sample !== undefined) {
        const code = sample.code;
        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: code,
            }
        });
    }
});

const config = Config.makeDefault();
const screen = new CanvasScreen(1.5);
const keyboard = new WebKeyboard();
const cassettePlayer = new CassettePlayer();
const soundPlayer = new WebSoundPlayer();
const trs80 = new Trs80(config, screen, keyboard, cassettePlayer, soundPlayer);
keyboard.configureKeyboard();

const reboot = () => {
    trs80.reset();
    trs80.start();
};

const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
const viewPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);
const controlPanel = new ControlPanel(screen.getNode());
controlPanel.addResetButton(reboot);
// controlPanel.addTapeRewindButton(() => {
//   cassettePlayer.rewind();
// });
controlPanel.addSettingsButton(hardwareSettingsPanel);
controlPanel.addSettingsButton(viewPanel);
controlPanel.addMuteButton(soundPlayer);

const driveIndicators = new DriveIndicators(screen.getNode(), trs80.getMaxDrives());
trs80.onMotorOn.subscribe(drive => driveIndicators.setActiveDrive(drive));

emulatorDiv.append(screen.getNode());

// Give focus to the emulator if the editor does not have it.
function updateFocus() {
    keyboard.interceptKeys = document.activeElement === document.body;
}
document.body.addEventListener("focus", () => updateFocus(), true);
document.body.addEventListener("blur", () => updateFocus(), true);
document.body.focus();
updateFocus();

reboot();
// Don't assemble right away, give the ROM a chance to start.
setTimeout(() => reassemble(), 500);
