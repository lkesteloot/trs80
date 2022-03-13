
import {EditorState, basicSetup} from "@codemirror/basic-setup"
import {EditorView, keymap} from "@codemirror/view"
import {indentWithTab} from "@codemirror/commands"
import {Asm} from "z80-asm";
import {CassettePlayer, Config, Trs80} from "trs80-emulator";
import {CanvasScreen} from "trs80-emulator-web";
import {ControlPanel, DriveIndicators, PanelType, SettingsPanel, WebKeyboard} from "trs80-emulator-web";
import {WebSoundPlayer} from "trs80-emulator-web";

const initial_code = `  .org 0x5000
  di
  ld a,191
  ld hl,15360
  ld (hl),a
loop:
  jp loop
`;

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
  ]
});

let view = new EditorView({
  state: startState,
  parent: document.getElementById("editor") as HTMLDivElement
});
view.hasFocus

const button = document.getElementById("assemble_button");
button?.addEventListener("click", () => {
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
  if (sourceFile !== undefined) {
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



keyboard.interceptKeys
