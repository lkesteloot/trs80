import {
    EditorView,
} from "@codemirror/view"
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

import {ScreenEditor} from "./ScreenEditor";
import {AssemblyResults} from "./AssemblyResults";

// Encapsulates the emulator and methods for it.
export class Emulator {
    private readonly screen: CanvasScreen;
    private readonly trs80: Trs80;
    private readonly controlPanel: ControlPanel;
    private screenEditor: ScreenEditor | undefined = undefined;
    private trs80State: Trs80State | undefined = undefined;

    public constructor() {
        const config = Config.makeDefault();
        this.screen = new CanvasScreen(1.5);
        const keyboard = new WebKeyboard();
        const cassettePlayer = new CassettePlayer();
        const soundPlayer = new WebSoundPlayer();
        this.trs80 = new Trs80(config, this.screen, keyboard, cassettePlayer, soundPlayer);
        keyboard.configureKeyboard();

        const reboot = () => {
            this.trs80.reset();
            this.trs80.start();
        };

        const hardwareSettingsPanel = new SettingsPanel(this.screen.getNode(), this.trs80, PanelType.HARDWARE);
        const viewPanel = new SettingsPanel(this.screen.getNode(), this.trs80, PanelType.VIEW);
        this.controlPanel = new ControlPanel(this.screen.getNode());
        this.controlPanel.addResetButton(reboot);
        this.controlPanel.addSettingsButton(hardwareSettingsPanel);
        this.controlPanel.addSettingsButton(viewPanel);
        this.controlPanel.addMuteButton(soundPlayer);

        const driveIndicators = new DriveIndicators(this.screen.getNode(), this.trs80.getMaxDrives());
        this.trs80.onMotorOn.subscribe(drive => driveIndicators.setActiveDrive(drive));

        reboot();

        // Give focus to the emulator if the editor does not have it.
        function updateFocus() {
            keyboard.interceptKeys = document.activeElement === document.body;
        }

        document.body.addEventListener("focus", () => updateFocus(), true);
        document.body.addEventListener("blur", () => updateFocus(), true);
        document.body.focus();
        updateFocus();
    }

    public getNode(): HTMLElement {
        return this.screen.getNode();
    }

    public startScreenEditor(view: EditorView, assemblyResults: AssemblyResults,
                             screenshotIndex: number, onClose: () => void) {

        this.controlPanel.disable();
        this.closeScreenEditor();
        this.screenEditor = new ScreenEditor(view, assemblyResults, screenshotIndex, this.trs80, this.screen, () => {
            this.screenEditor = undefined;
            this.controlPanel.enable();
            onClose();
        });
    }

    public closeScreenEditor() {
        if (this.screenEditor !== undefined) {
            this.screenEditor.cancel();
            // Set to undefined in the close callback.
        }
    }

    public runProgram(results: AssemblyResults) {
        if (results.errorLines.length === 0) {
            if (this.trs80State === undefined) {
                // Disable interrupts, it causes the cursor to blink.
                this.trs80.z80.regs.iff1 = 0;
                this.trs80.z80.regs.iff2 = 0;

                this.trs80State = this.trs80.save();
            } else {
                this.trs80.restore(this.trs80State);
            }
            for (const line of results.sourceFile.assembledLines) {
                for (let i = 0; i < line.binary.length; i++) {
                    this.trs80.writeMemory(line.address + i, line.binary[i]);
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
                this.trs80.jumpTo(entryPoint);
            }
        }
    }
}
