
import {EditorState, basicSetup} from "@codemirror/basic-setup"
import {EditorView, keymap} from "@codemirror/view"
import {indentWithTab} from "@codemirror/commands"
import {Asm, SourceFile} from "z80-asm";
import {CassettePlayer, Config, Trs80, Trs80State} from "trs80-emulator";
import {CanvasScreen} from "trs80-emulator-web";
import {ControlPanel, DriveIndicators, PanelType, SettingsPanel, WebKeyboard} from "trs80-emulator-web";
import {WebSoundPlayer} from "trs80-emulator-web";

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


const body = document.body;
{
  let e = document.createElement("div");
  e.id = "editor";
  body.append(e);
}
const assembleButton = document.createElement("button");
assembleButton.innerText = "Assemble";
body.append(assembleButton);
const saveButton = document.createElement("button");
saveButton.innerText = "Save";
body.append(saveButton);
const restoreButton = document.createElement("button");
restoreButton.innerText = "Restore";
body.append(restoreButton);
{
  const e = document.createElement("div");
  e.id = "emulator";
  body.append(e);
}


let startState = EditorState.create({
  doc: initial_code,
  extensions: [
    basicSetup,
    keymap.of([indentWithTab]),
    EditorView.updateListener.of(update => {
      if (update.focusChanged) {
        keyboard.interceptKeys = !update.view.hasFocus;
      }
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        reassemble();
      }
    }),
  ]
});

let view = new EditorView({
  state: startState,
  parent: document.getElementById("editor") as HTMLDivElement
});

function hasErrors(sourceFile: SourceFile): boolean {
  for (const line of sourceFile.assembledLines) {
    if (line.error !== undefined) {
      return true;
    }
  }

  return false;
}

function reassemble() {
  const code = view.state.doc.toJSON();
  console.log(code);
  const asm = new Asm({
    readBinaryFile(pathname: string): Uint8Array | undefined {
      return undefined;
    }, readDirectory(pathname: string): string[] | undefined {
      return undefined;
    }, readTextFile(pathname: string): string[] | undefined {
      return code;
    }
  });
  const sourceFile = asm.assembleFile("current.asm");
  console.log(sourceFile);
  if (sourceFile !== undefined && !hasErrors(sourceFile)) {
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

const emulatorDiv = document.getElementById("emulator") as HTMLDivElement;
const config = Config.makeDefault();
const screen = new CanvasScreen(1);
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
