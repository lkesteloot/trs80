
import {EditorView} from "@codemirror/view"
import {indentWithTab} from "@codemirror/commands"

import {keymap, highlightSpecialChars, drawSelection, highlightActiveLine, dropCursor} from "@codemirror/view"
import {Extension, EditorState} from "@codemirror/state"
import {history, historyKeymap} from "@codemirror/history"
import {foldGutter, foldKeymap} from "@codemirror/fold"
import {indentOnInput, Language, defineLanguageFacet, LanguageSupport} from "@codemirror/language"
import {lineNumbers, highlightActiveLineGutter} from "@codemirror/gutter"
import {defaultKeymap} from "@codemirror/commands"
import {bracketMatching} from "@codemirror/matchbrackets"
import {closeBrackets, closeBracketsKeymap} from "@codemirror/closebrackets"
import {searchKeymap, highlightSelectionMatches} from "@codemirror/search"
import {autocompletion, completionKeymap} from "@codemirror/autocomplete"
import {commentKeymap} from "@codemirror/comment"
import {rectangularSelection} from "@codemirror/rectangular-selection"
import {defaultHighlightStyle} from "@codemirror/highlight"
import {lintKeymap, Diagnostic, setDiagnostics} from "@codemirror/lint"

import {Asm, SourceFile} from "z80-asm";
import {CassettePlayer, Config, Trs80, Trs80State} from "trs80-emulator";
import {CanvasScreen} from "trs80-emulator-web";
import {ControlPanel, DriveIndicators, PanelType, SettingsPanel, WebKeyboard} from "trs80-emulator-web";
import {WebSoundPlayer} from "trs80-emulator-web";

import {Input, NodeType, Parser, PartialParse, Tree, TreeFragment} from "@lezer/common";

import { breakdwn } from "./breakdwn.ts";
import { scarfman } from "./scarfman.ts";
import "./style.css";
import { Z80_KNOWN_LABELS } from "z80-base"
import {TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS } from "trs80-base"

const initial_code = `  .org 0x5000
  di
  ld a,191
  ld hl,15360
  ld b, 10
  
loop:
  ld (hl),a
  inc hl
  dec b
  jr nz,loop

stop:
  jp stop
`;

const space_invaders = `  .org 0x5000
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
editorPane.append(sampleChooser, editorContainer);
const assembleButton = document.createElement("button");
assembleButton.innerText = "Assemble";
const saveButton = document.createElement("button");
saveButton.innerText = "Save";
const restoreButton = document.createElement("button");
restoreButton.innerText = "Restore";
const emulatorDiv = document.createElement("div");
emulatorDiv.id = "emulator";
content.append(editorPane, emulatorDiv);

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
    if (update.focusChanged) {
      // TODO also take into account find UI.
      keyboard.interceptKeys = !update.view.hasFocus;
    }
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
    z80AssemblyLanguage(),
];

let startState = EditorState.create({
  doc: initial_code,
  extensions: extensions,
});

let view = new EditorView({
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
  assemble(code);
  const {asm, sourceFile} = assemble(code);
  console.log(sourceFile);
  if (sourceFile === undefined) {
    // TODO, file not found.
    return;
  }

  const diagnostics: Diagnostic[] = [];
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
    }
  }
  const transactions = setDiagnostics(editorState, diagnostics);
  view.dispatch(transactions);

  if (diagnostics.length === 0) {
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

reboot();

