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
import {RangeSetBuilder, Compartment} from "@codemirror/state";
import {defineLanguageFacet, indentOnInput, Language, LanguageSupport, indentUnit} from "@codemirror/language"
import {history, historyKeymap} from "@codemirror/commands"
import {foldGutter, foldKeymap} from "@codemirror/language"
import {highlightActiveLineGutter, lineNumbers, gutter, GutterMarker} from "@codemirror/view"
import {bracketMatching} from "@codemirror/language"
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete"
import {highlightSelectionMatches, searchKeymap} from "@codemirror/search"
import {autocompletion, completionKeymap, CompletionContext, Completion, CompletionResult} from "@codemirror/autocomplete"
import {rectangularSelection} from "@codemirror/view"
import {syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language"
import {Diagnostic, lintKeymap, setDiagnostics} from "@codemirror/lint"
import { solarizedDark } from 'cm6-theme-solarized-dark'
import { solarizedLight } from 'cm6-theme-solarized-light'
import { basicDark } from 'cm6-theme-basic-dark'
import { basicLight } from 'cm6-theme-basic-light'
import { gruvboxDark } from 'cm6-theme-gruvbox-dark'
import { gruvboxLight } from 'cm6-theme-gruvbox-light'
import { materialDark } from 'cm6-theme-material-dark'
import { nord } from 'cm6-theme-nord'
import * as RetroStoreProto from "retrostore-api";

import {Asm, getAsmDirectiveDocs, SourceFile} from "z80-asm";
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
import {toHexByte, toHexWord, Z80_KNOWN_LABELS} from "z80-base";
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS, ProgramBuilder} from "trs80-base";
import {ScreenEditor} from "./ScreenEditor.ts";
import {ScreenshotSection} from "./ScreenshotSection.ts";
import {AssemblyResults} from "./AssemblyResults.ts";
import { mnemonicMap, OpcodeVariant } from "z80-inst";
import {screenshotPlugin} from "./ScreenshotPlugin.ts";
import {createMenubar, getMenuEntryById, Menu, MenuCommand} from "./Menubar.ts";

const initial_code = `        .org 0x9000
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
        
        ; Timing start
loop:
        ld (hl),a
        inc hl
        dec b
        jr nz,loop
        ; Timing end

stop:
        jp stop

        ; Screenshot
screenshot:
        .byte 65, 66
        ; End screenshot
        .byte 0
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

// Available themes.
const THEMES = [
    {
        extension: basicLight,
        name: 'Basic Light'
    },
    {
        extension: basicDark,
        name: 'Basic Dark'
    },
    {
        extension: solarizedLight,
        name: 'Solarized Light'
    },
    {
        extension: solarizedDark,
        name: 'Solarized Dark'
    },
    {
        extension: materialDark,
        name: 'Material Dark'
    },
    {
        extension: nord,
        name: 'Nord'
    },
    {
        extension: gruvboxLight,
        name: 'Gruvbox Light'
    },
    {
        extension: gruvboxDark,
        name: 'Gruvbox Dark'
    },
];
const DEFAULT_THEME_INDEX = 3;

// Available examples.
const EXAMPLES = [
    { name: "Simple", code: initial_code },
    { name: "Space Invaders", code: space_invaders },
    { name: "Breakdown", code: breakdwn },
    { name: "Scarfman", code: scarfman },
];

// Pull-down menu.
const MENU: Menu = [
    {
        text: "File",
        menu: [
            {
                text: "Open...",
                action: () => alert("Open!!!"),
            },
            {
                id: "examples-list",
                text: "Examples",
                menu: [],
            },
            {
                text: "Upload to RetroStore",
                action: async () => await uploadToRetroStore(),
            }
        ],
    },
    {
        text: "View",
        menu: [
            {
                id: "theme-list",
                text: "Editor Theme",
                menu: [],
            },
            {
                text: "Numbers",
                menu: [
                    {
                        text: "One",
                    },
                    {
                        text: "Two",
                    },
                    {
                        text: "Three",
                    },
                ],
            },
            {
                text: "Presentation Mode",
                action: (menuCommand: MenuCommand) => {
                    // Toggle current mode.
                    const presentationMode = !(menuCommand.checked ?? false);
                    view.dispatch({
                        effects: gBaseThemeConfig.reconfigure([presentationMode ? gPresentationTheme : gBaseTheme]),
                    });
                    document.body.classList.toggle("presentation-mode", presentationMode);
                    document.body.classList.toggle("work-mode", !presentationMode);
                    menuCommand.setChecked(presentationMode);
                },
            },
        ],
    }
];

/**
 * Builder of chunks of memory for the RetroStore interface.
 */
class RetroStoreProgramBuilder extends ProgramBuilder {
    /**
     * Get RetroStore memory regions for the bytes given so far.
     */
    public getMemoryRegions(): RetroStoreProto.MemoryRegion[] {
        // Sort blocks by address (not really necessary for RetroStore).
        this.blocks.sort((a, b) => a.address - b.address);

        return this.blocks
            .map(block => ({
                start: block.address,
                length: block.bytes.length,
                data: new Uint8Array(block.bytes),
            }));
    }
}

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

// Uploads the already-assembled code to the RetroStore.
async function uploadToRetroStore() {
    const results = view.state.field(gAssemblyResultsStateField);
    if (results.errorLines.length !== 0) {
        return;
    }
    const builder = new RetroStoreProgramBuilder();
    for (const line of results.sourceFile.assembledLines) {
        builder.addBytes(line.address, line.binary);
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
    if (entryPoint === undefined) {
        return;
    }
    const params: RetroStoreProto.UploadSystemStateParams = {
        state: {
            // Can't use the enum here because it's a "const enum", and the way we compile
            // TS is one file at a time (probably transpile only?). So must hack it with
            // a string that's cast.
            model: "MODEL_III" as RetroStoreProto.Trs80Model,
            registers: {
                pc: entryPoint,
            },
            memoryRegions: builder.getMemoryRegions(),
        },
    };
    console.log(params);
    const response = await fetch("https://retrostore.org/api/uploadState", {
        method: "POST",
        body: RetroStoreProto.encodeUploadSystemStateParams(params),
        mode: "cors",
        cache: "no-cache",
        redirect: "follow",
    });
    console.log(response);
    const arrayBuffer = await response.arrayBuffer();
    console.log(arrayBuffer);
    const x = RetroStoreProto.decodeApiResponseUploadSystemState(new Uint8Array(arrayBuffer));
    console.log(x);
    if (x.token !== undefined) {
        console.log("Token: " + x.token.low);
        alert("Code is " + x.token.low);
    }
}

// Load the code of an example into the editor.
function loadExample(code: string) {
    if (gScreenEditor !== undefined) {
        gScreenEditor.cancel();
        // Set to undefined in the close callback.
    }
    view.dispatch({
        changes: {
            from: 0,
            to: view.state.doc.length,
            insert: code,
        }
    });
}

const body = document.body;
body.classList.add("light-mode", "work-mode");

const content = document.createElement("div");
content.classList.add("content");
body.append(content);

const editorPane = document.createElement("div");
editorPane.classList.add("editor-pane");
const examplesMenu = getMenuEntryById(MENU, "examples-list");
if (examplesMenu !== undefined) {
    for (const example of EXAMPLES) {
        examplesMenu.menu.push({
            text: example.name,
            action: () => loadExample(example.code),
        });
    }
}
const themeMenu = getMenuEntryById(MENU, "theme-list");
if (themeMenu !== undefined) {
    function updateCheckmarks(index: number): void {
        for (let i = 0; i < THEMES.length; i++) {
            themeMenu.menu[i].setChecked(i === index);
        }
    }

    for (let i = 0; i < THEMES.length; i++) {
        const theme = THEMES[i];

        themeMenu.menu.push({
            text: theme.name,
            action: () => {
                view.dispatch({
                    effects: gColorThemeConfig.reconfigure([theme]),
                });
                updateCheckmarks(i);
            },
            checked: i == DEFAULT_THEME_INDEX,
        });
    }
}
const menubar = createMenubar(MENU);
const toolbar = document.createElement("div");
toolbar.classList.add("toolbar");
// Toolbar is currently empty.
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
prevErrorButton.addEventListener("click", () => prevError(view.state.field(gAssemblyResultsStateField)));
const gNextErrorButton = document.createElement("button");
gNextErrorButton.textContent = "Next";
gNextErrorButton.addEventListener("click", () => nextError(view.state.field(gAssemblyResultsStateField)));
errorContainer.append(errorMessageDiv, prevErrorButton, gNextErrorButton);
editorPane.append(menubar, toolbar, editorContainer, errorContainer);
const gSaveButton = document.createElement("button");
gSaveButton.innerText = "Save";
const gRestoreButton = document.createElement("button");
gRestoreButton.innerText = "Restore";
const gEmulatorDiv = document.createElement("div");
gEmulatorDiv.id = "emulator";
content.append(editorPane, gEmulatorDiv);

// /**
//  * Plugin to set and update the timing results.
//  */
// const timingViewPlugin = ViewPlugin.fromClass(class {
//     decorations: DecorationSet
//
//     constructor(view: EditorView) {
//         this.decorations = decorationsForTiming(view);
//     }
//
//     update(update: ViewUpdate) {
//         if (update.docChanged || true) { // TODO maybe compare assembly result screenshot info?
//             this.decorations = decorationsForTiming(update.view)
//         }
//     }
// }, {
//     decorations: v => v.decorations,
// });
//
// function timingPlugin(): Extension {
//     return [
//         timingViewPlugin,
//     ];
// }

let gScreenEditor: ScreenEditor | undefined = undefined;
function startScreenEditor(view: EditorView, screenshotIndex: number, onClose: () => void) {
    gControlPanel.disable();
    if (gScreenEditor !== undefined) {
        gScreenEditor.cancel();
    }
    const assemblyResults = view.state.field(gAssemblyResultsStateField);
    gScreenEditor = new ScreenEditor(view, assemblyResults, screenshotIndex, gTrs80, gScreen, () => {
        gScreenEditor = undefined;
        gControlPanel.enable();
        onClose();
        reassemble();
    });
}

/*
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
 */

/**
 * State field for keeping the assembly results.
 */
const gAssemblyResultsStateEffect = StateEffect.define<AssemblyResults>();
const gAssemblyResultsStateField = StateField.define<AssemblyResults>({
    create: () => {
        return assemble([""]);
    },
    update: (value: AssemblyResults, tr: Transaction) => {
        // See if we're explicitly setting it from the outside.
        for (const effect of tr.effects) {
            if (effect.is(gAssemblyResultsStateEffect)) {
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

// Get the full label (such as "ld a,b") for the variant.
function getVariantLabel(variant: OpcodeVariant): string {
    const label = variant.mnemonic + " " + variant.params.join(",");
    return label.trim();
}

const ASM_DIRECTIVE_DOCS = getAsmDirectiveDocs();

/**
 * Return true if every word appears in the description.
 */
function matchesDescription(words: string[], description: string): boolean {
    if (words.length === 0) {
        return false;
    }

    description = description.toLowerCase();

    for (const word of words) {
        if (description.indexOf(word) === -1) {
            return false;
        }
    }

    return true;
}

// Custom auto-completions from the Z80 instruction set.
function customCompletions(context: CompletionContext): CompletionResult | null {
    // Grab entire line.
    const word = context.matchBefore(/.*/);
    if (word === null) {
        return null;
    }

    // Skip initial space.
    let spaceCount = 0;
    for (let i = 0; i < word.text.length; i++) {
        if (word.text.charAt(i) === " ") {
            spaceCount += 1;
        } else {
            break;
        }
    }
    if (spaceCount === 0) {
        // Don't autocomplete at start of line, that's for labels.
        return null;
    }
    // Skip leading spaces, normalize to lower case, and collapse spaces.
    const search = word.text.substring(spaceCount).toLowerCase().replace(/[ \t]+/g, " ");
    if (search === "" && !context.explicit) {
        return null;
    }
    // Remove words that start with a period, only want those in "search".
    const searchWords = search.split(" ").filter(word => word !== "" && !word.startsWith("."));

    // Find all variants.
    const options: Completion[] = [];
    const matchingVariants: OpcodeVariant[] = [];
    for (const variants of mnemonicMap.values()) {
        for (const variant of variants) {
            if ((variant.clr !== undefined && matchesDescription(searchWords, variant.clr.description)) ||
                getVariantLabel(variant).toLowerCase().startsWith(search)) {

                matchingVariants.push(variant);
            }
        }
    }

    // Sort to put most likely on top.
    matchingVariants.sort((a, b) => a.opcodes.length - b.opcodes.length);

    // Convert to options.
    for (const variant of matchingVariants) {
        const option: Completion = {
            label: getVariantLabel(variant),
        };
        if (variant.clr !== undefined) {
            option.info = variant.clr.description;
            // Or "detail"?
        }
        options.push(option);
    }

    // Now check assembler directives.
    for (const doc of ASM_DIRECTIVE_DOCS) {
        const descriptionMatches = searchWords.length > 0 && 
            matchesDescription(searchWords, doc.description);
        for (const directive of doc.directives.values()) {
            if (descriptionMatches || directive.toLowerCase().startsWith(search)) {
                options.push({
                    label: directive,
                    info: doc.description,
                });
            }
        }
    }

    return {
        from: word.from + spaceCount,
        options: options,
        filter: false,
    };
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
            updateEverything(update.state.field(gAssemblyResultsStateField));
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
        assemblyResultsStateField: gAssemblyResultsStateField,
        startScreenEditor: startScreenEditor,
    }),
    // timingPlugin(),
    gAssemblyResultsStateField,
    indentUnit.of("        "),
    gBaseThemeConfig.of(gBaseTheme),
    gColorThemeConfig.of(THEMES[DEFAULT_THEME_INDEX]),
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
       effects: gAssemblyResultsStateEffect.of(results),
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
            trs80State = gTrs80.save();
        } else {
            gTrs80.restore(trs80State);
        }
        for (const line of results.sourceFile.assembledLines) {
            for (let i = 0; i < line.binary.length; i++) {
                gTrs80.writeMemory(line.address + i, line.binary[i]);
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
            gTrs80.jumpTo(entryPoint);
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
            const results = view.state.field(gAssemblyResultsStateField);
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

gSaveButton.addEventListener("click", () => {
    trs80State = gTrs80.save();
});
gRestoreButton.addEventListener("click", () => {
    if (trs80State !== undefined) {
        gTrs80.restore(trs80State);
    }
});

const gConfig = Config.makeDefault();
const gScreen = new CanvasScreen(1.5);
const gKeyboard = new WebKeyboard();
const gCassettePlayer = new CassettePlayer();
const gSoundPlayer = new WebSoundPlayer();
const gTrs80 = new Trs80(gConfig, gScreen, gKeyboard, gCassettePlayer, gSoundPlayer);
gKeyboard.configureKeyboard();

const reboot = () => {
    gTrs80.reset();
    gTrs80.start();
};

const gHardwareSettingsPanel = new SettingsPanel(gScreen.getNode(), gTrs80, PanelType.HARDWARE);
const gViewPanel = new SettingsPanel(gScreen.getNode(), gTrs80, PanelType.VIEW);
const gControlPanel = new ControlPanel(gScreen.getNode());
gControlPanel.addResetButton(reboot);
// controlPanel.addTapeRewindButton(() => {
//   cassettePlayer.rewind();
// });
gControlPanel.addSettingsButton(gHardwareSettingsPanel);
gControlPanel.addSettingsButton(gViewPanel);
gControlPanel.addMuteButton(gSoundPlayer);

const gDriveIndicators = new DriveIndicators(gScreen.getNode(), gTrs80.getMaxDrives());
gTrs80.onMotorOn.subscribe(drive => gDriveIndicators.setActiveDrive(drive));

gEmulatorDiv.append(gScreen.getNode());

// Give focus to the emulator if the editor does not have it.
function updateFocus() {
    gKeyboard.interceptKeys = document.activeElement === document.body;
}
document.body.addEventListener("focus", () => updateFocus(), true);
document.body.addEventListener("blur", () => updateFocus(), true);
document.body.focus();
updateFocus();

reboot();
// Don't assemble right away, give the ROM a chance to start.
setTimeout(() => reassemble(), 500);
