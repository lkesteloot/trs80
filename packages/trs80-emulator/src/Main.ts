import {CanvasScreen} from "./CanvasScreen";
import {Trs80} from "./Trs80";
import {PanelType, SettingsPanel} from "./SettingsPanel";
import {ControlPanel} from "./ControlPanel";
import {ProgressBar} from "./ProgressBar";
import {CassettePlayer} from "./CassettePlayer";
import {Editor} from "./Editor";
import {clearElement} from "teamten-ts-utils";
import {ElementType} from "trs80-base";

const screenNode = document.getElementById("screen") as HTMLElement;
const screen = new CanvasScreen(1.5);
const trs80 = new Trs80(screen, new CassettePlayer());
const editor = new Editor(trs80, screen);
screenNode.append(editor.node);

const progressBar = new ProgressBar(screen.getNode());
progressBar.setMaxValue(1234);
progressBar.setValue(1234/3);

const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
const viewSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);

const controlPanel = new ControlPanel(screen.getNode());
controlPanel.addResetButton(() => trs80.reset());
// controlPanel.addTapeRewindButton(() => progressBar.show());
// controlPanel.addScreenshotButton(() => progressBar.hide());
controlPanel.addSettingsButton(hardwareSettingsPanel);
controlPanel.addSettingsButton(viewSettingsPanel);
controlPanel.addEditorButton(() => editor.startEdit());
// controlPanel.addSaveButton(() => 0);
// controlPanel.addCancelButton(() => 0);

trs80.reset();
trs80.start();

const programNode = document.createElement("pre");
programNode.style.backgroundColor = "#fdf6e3";
screenNode.append(programNode);

function updateProgram() {
    clearElement(programNode);
    // This might grab a program part-way through being edited. (I.e., the pointers might
    // be invalid.)
    const basicProgram = trs80.getBasicProgramFromMemory();
    if (typeof basicProgram === "string") {
        programNode.innerText = basicProgram;
    } else {
        let first = true;
        for (const element of basicProgram.elements) {
            if (element.elementType === ElementType.LINE_NUMBER && !first) {
                programNode.append("\n");
            }

            let color: string;
            switch (element.elementType) {
                case ElementType.ERROR:
                    color = "#dc322f";
                    break;

                case ElementType.LINE_NUMBER:
                    color = "#93a1a1";
                    break;

                case ElementType.PUNCTUATION:
                    color = "#93a1a1";
                    break;

                case ElementType.KEYWORD:
                    color = "#268bd2";
                    break;

                case ElementType.REGULAR:
                default:
                    color = "#657b83";
                    break;

                case ElementType.STRING:
                    color = "#cb4b16";
                    break;

                case ElementType.COMMENT:
                    color = "#2aa198";
                    break;
            }

            const span = document.createElement("span");
            span.style.color = color;
            span.innerText = element.text;
            programNode.append(span);
            first = false;
        }
    }
}
// setInterval(updateProgram, 100);
