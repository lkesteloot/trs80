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
  WidgetType
} from "@codemirror/view"
import {EditorSelection, EditorState, Extension} from "@codemirror/state"
import {defineLanguageFacet, indentOnInput, Language, LanguageSupport} from "@codemirror/language"
import {history, historyKeymap} from "@codemirror/history"
import {foldGutter, foldKeymap} from "@codemirror/fold"
import {highlightActiveLineGutter, lineNumbers} from "@codemirror/gutter"
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
import {Z80_KNOWN_LABELS} from "z80-base"
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS} from "trs80-base"
import {ScreenEditor} from "./ScreenEditor.ts";

const initial_code = `        .org 0x5000
        di
        ld a,191
        ld hl,15360
        ld b,10
        
loop:
        ld (hl),a
        inc hl
        dec b
        jr nz,loop
      
        ; Screenshot
        .byte 65, 66
        
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
prevErrorButton.addEventListener("click", () => prevError());
const nextErrorButton = document.createElement("button");
nextErrorButton.textContent = "Next";
nextErrorButton.addEventListener("click", () => nextError());
errorContainer.append(errorMessageDiv, prevErrorButton, nextErrorButton);
editorPane.append(sampleChooser, editorContainer, errorContainer);
const assembleButton = document.createElement("button");
assembleButton.innerText = "Assemble";
const saveButton = document.createElement("button");
saveButton.innerText = "Save";
const restoreButton = document.createElement("button");
restoreButton.innerText = "Restore";
const emulatorDiv = document.createElement("div");
emulatorDiv.id = "emulator";
content.append(editorPane, emulatorDiv);

class EditScreenshotWidget extends WidgetType {
  eq(): boolean{
    // No content, so they're all equal.
    return true;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("span");
    button.setAttribute("aria-hidden", "true");
    button.className = "cm-screenshot-edit";
    button.innerText = "Edit";
    return button;
  }

  ignoreEvent(): boolean {
    // We want the click.
    return false;
  }
}

function checkboxes(view: EditorView) {
  const widgets: Range<Decoration>[] = []
  for (let {from, to} of view.visibleRanges) {
    const s = view.state.doc.sliceString(from, to);
    let start = 0;
    while (true) {
      const i = s.indexOf("; Screenshot", start);
      if (i >= 0) {
        let j = s.indexOf("\n", i);
        if (j < 0) {
          j = s.length;
        }
        const deco = Decoration.widget({
          widget: new EditScreenshotWidget(),
          side: 1,
        });
        widgets.push(deco.range(from + j));
        start = j;
      } else {
        break;
      }
    }
  }
  return Decoration.set(widgets);
}

const screenshotPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = checkboxes(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = checkboxes(update.view)
    }
  }
}, {
  decorations: v => v.decorations,

  eventHandlers: {
    click: (e, view) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("cm-screenshot-edit")) {
        startScreenshotEditMode(view, view.posAtDOM(target));
        return true;
      } else {
        return false;
      }
    }
  }
});

let autoDeployProgram = true;

function startScreenshotEditMode(view: EditorView, pos: number) {
  autoDeployProgram = false;
  const screenEditor = new ScreenEditor(view, pos, trs80, screen);
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
    if (sourceFile === undefined) {
      return Tree.empty;
    }

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

const extensions: Extension = [
  lineNumbers(),
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
      reassemble();
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
  screenshotPlugin,
];

let startState = EditorState.create({
  doc: initial_code,
  extensions: extensions,
});

const view = new EditorView({
  state: startState,
  parent: document.getElementById("editor") as HTMLDivElement
});

function assemble(code: string[]): {asm: Asm, sourceFile: SourceFile | undefined} {
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
  return { asm, sourceFile };
}

function reassemble() {
  const editorState = view.state;
  const doc = editorState.doc;
  const code = doc.toJSON();
  const {asm, sourceFile} = assemble(code);
  // console.log(sourceFile);
  if (sourceFile === undefined) {
    // TODO, file not found.
    return;
  }

  const diagnostics: Diagnostic[] = [];
  const errorLineNumbers: number[] = []; // 1-based.
  for (const line of sourceFile.assembledLines) {
    if (line.error !== undefined && line.lineNumber !== undefined /* TODO */) {
      const lineInfo = doc.line(line.lineNumber + 1);
      console.log("error on line", line.lineNumber + 1); // TODO remove
      diagnostics.push({
        from: lineInfo.from,  // TODO first non-blank.
        to: lineInfo.to,
        severity: "error",
        message: line.error,
      });
      errorLineNumbers.push(line.lineNumber + 1);
    }
  }
  const transactions = setDiagnostics(editorState, diagnostics);
  view.dispatch(transactions);

  if (diagnostics.length === 0 && autoDeployProgram) {
    if (trs80State === undefined) {
      trs80State = trs80.save();
    } else {
      trs80.restore(trs80State);
    }
    for (const line of sourceFile.assembledLines) {
      for (let i = 0; i < line.binary.length; i++) {
        trs80.writeMemory(line.address + i, line.binary[i]);
      }
    }
    let entryPoint = asm.entryPoint;
    if (entryPoint === undefined) {
      for (const line of sourceFile.assembledLines) {
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

  updateAssemblyErrors(errorLineNumbers);
}

let mErrorLineNumbers: number[] = [];
function updateAssemblyErrors(errorLineNumbers: number[]) {
  mErrorLineNumbers = errorLineNumbers;

  if (errorLineNumbers.length === 0) {
    errorContainer.style.display = "none";
  } else {
    errorContainer.style.display = "flex";
    errorMessageDiv.innerText = errorLineNumbers.length + " error" + (errorLineNumbers.length === 1 ? "" : "s");
  }
}

function moveCursorToLineNumber(lineNumber: number) {
  const lineInfo = view.state.doc.line(lineNumber);
  view.dispatch({
    selection: EditorSelection.single(lineInfo.from),
    scrollIntoView: true,
  });
  view.focus();
}

function nextError() {
  if (mErrorLineNumbers.length === 0) {
    return;
  }
  const {from} = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const cursorLineNumber = line.number;
  for (const errorLineNumber of mErrorLineNumbers) {
    if (errorLineNumber > cursorLineNumber ||
        cursorLineNumber >= mErrorLineNumbers[mErrorLineNumbers.length - 1]) {

      moveCursorToLineNumber(errorLineNumber);
      break;
    }
  }
}

function prevError() {
  if (mErrorLineNumbers.length === 0) {
    return;
  }
  const {from} = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const cursorLineNumber = line.number;
  for (const errorLineNumber of mErrorLineNumbers.slice().reverse()) {
    if (errorLineNumber < cursorLineNumber || cursorLineNumber <= mErrorLineNumbers[0]) {
      moveCursorToLineNumber(errorLineNumber);
      break;
    }
  }
}

assembleButton.addEventListener("click", () => reassemble());

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
  console.log("updateFocus");
  keyboard.interceptKeys = document.activeElement === document.body;
}
document.body.addEventListener("focus", () => updateFocus(), true);
document.body.addEventListener("blur", () => updateFocus(), true);
document.body.focus();
updateFocus();

reboot();

