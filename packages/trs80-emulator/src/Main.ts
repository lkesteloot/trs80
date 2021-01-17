import {CanvasScreen} from "./CanvasScreen";
import {Trs80} from "./Trs80";
import {PanelType, SettingsPanel} from "./SettingsPanel";
import {ControlPanel} from "./ControlPanel";
import {ProgressBar} from "./ProgressBar";
import {CassettePlayer} from "./CassettePlayer";

const screenNode = document.getElementById("screen") as HTMLElement;
const screen = new CanvasScreen();
screenNode.append(screen.getNode());
const trs80 = new Trs80(screen, new CassettePlayer());

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

trs80.reset();
trs80.start();
