import type {FloppyDisk} from "trs80-base";
import type {BootModel, BootModelChoice} from "trs80-disk";
import {BasicLevel, CassettePlayer, Config, ModelType, RunningState, Trs80} from "trs80-emulator";
import {
    Bezel, CanvasScreen, ControlPanel, DriveIndicators, FlipCard, loadTrs80Config, PanelType, saveTrs80Config,
    SettingsPanel, WebKeyboard, WebSoundPlayer,
} from "trs80-emulator-web";
import {assertNever} from "z80-base";
import {modelName} from "./Booting.js";
import {el, makeButton, makeCheckbox} from "./Dom.js";
import "./emulator.css";

// The emulator's panel, which slides over the page while a disk is booted. This module pulls in the emulator and
// its ROMs, so Booting.ts loads it only when a disk is booted. The machine is set up as my-trs-80's is: a photo of
// the computer around the screen, and the settings on the screen's hover buttons, kept in local storage.

/** The local storage key of the emulator's settings, which both pages share. */
const CONFIG_KEY = "trs80-disk-emulator-config";

/**
 * What the panel runs.
 */
export interface EmulatorRequest {
    /** The booted disk's name, for the panel's title. */
    name: string;
    /** The floppies to mount, from drive 0, which holds the booted disk. At most four. */
    floppies: FloppyDisk[];
    /** The names of the disks in drives 1 and up, in drive order. */
    driveNames: string[];
    /** The model that the disk's DOS is for, and why. The machine starts as this model. */
    choice: BootModelChoice;
    /**
     * Called when the machine starts, and again whenever the user changes the model or write-protects the disk.
     *
     * @param model the model now running.
     * @param writeProtected whether the booted disk is now write-protected (by the panel's switch, or by its image).
     */
    onSettings(model: BootModel, writeProtected: boolean): void;
}

/**
 * The emulator's model type for a model number.
 */
function bootModelToModelType(model: BootModel): ModelType {
    switch (model) {
        case 1:
            return ModelType.MODEL1;
        case 3:
            return ModelType.MODEL3;
        case 4:
            return ModelType.MODEL4;
        default:
            assertNever(model);
    }
}

/**
 * The model number of the emulator's model type.
 */
function modelTypeToBootModel(modelType: ModelType): BootModel {
    switch (modelType) {
        case ModelType.MODEL1:
            return 1;
        case ModelType.MODEL3:
            return 3;
        case ModelType.MODEL4:
            return 4;
        default:
            assertNever(modelType);
    }
}

/**
 * The emulated machine, with its screen and keyboard. A page makes one, the first time it boots a disk, and keeps
 * it: the keyboard listens on the page for good, so a second machine would get the keys too.
 */
class Machine {
    /** Holds the photo of the computer and the screen, which fit themselves to its size. */
    public readonly node: HTMLElement;
    /** The machine. */
    public readonly trs80: Trs80;
    /** Whether the panel is open, which is when the keyboard sends keys to the machine. */
    public isOpen = false;

    /**
     * Make the machine, stopped, with the settings that the user last chose.
     */
    constructor() {
        this.node = el("div", "emu-screen");
        const config = loadTrs80Config(CONFIG_KEY, Config.makeDefault().edit().withBezel(true).build());
        const screen = new CanvasScreen(1.5);
        const keyboard = new WebKeyboard();
        const soundPlayer = new WebSoundPlayer();
        this.trs80 = new Trs80(config, screen, keyboard, new CassettePlayer(), soundPlayer);
        keyboard.configureKeyboard();
        this.trs80.onConfig.subscribe(change => saveTrs80Config(change.newConfig, CONFIG_KEY));

        const flipCard = new FlipCard(screen);
        flipCard.setFront(screen);
        const bezel = new Bezel(this.node, screen, flipCard, this.trs80);
        this.node.append(bezel.node);

        // The hover buttons on the screen. The model is the hardware panel's.
        const hardwarePanel = new SettingsPanel(screen.getNode(), this.trs80, PanelType.HARDWARE);
        const viewPanel = new SettingsPanel(screen.getNode(), this.trs80, PanelType.VIEW, {bezel: true});
        const controlPanel = new ControlPanel(screen.getNode());
        controlPanel.addResetButton(() => this.reboot());
        controlPanel.addSettingsButton(hardwarePanel);
        controlPanel.addSettingsButton(viewPanel);
        controlPanel.addMuteButton(soundPlayer);
        keyboard.addInterceptKeys(() => this.isOpen && !hardwarePanel.isOpen() && !viewPanel.isOpen());

        // The bezel lights the drive's LED where its photo shows the drives, and the screen's indicators otherwise.
        const driveIndicators = new DriveIndicators(screen.getNode(), this.trs80.getMaxDrives());
        let activeDrive: number | undefined = undefined;
        const updateDriveIndicators = (): void => {
            const shownByBezel = bezel.setActiveDrive(activeDrive);
            driveIndicators.setActiveDrive(shownByBezel ? undefined : activeDrive);
        };
        this.trs80.onMotorOn.subscribe(drive => {
            activeDrive = drive;
            updateDriveIndicators();
        });
        // The bezel and the model can change while a drive is on.
        this.trs80.onConfig.subscribe(updateDriveIndicators);
    }

    /**
     * The model that the machine is now.
     */
    public getModel(): BootModel {
        return modelTypeToBootModel(this.trs80.getConfig().modelType);
    }

    /**
     * Switch to a model and Level II Basic, keeping the user's other settings, and reboot.
     */
    public setModel(model: BootModel): void {
        const config = this.trs80.getConfig().edit()
            .withModelType(bootModelToModelType(model))
            .withBasicLevel(BasicLevel.LEVEL2)
            .build();
        if (!config.isValid()) {
            throw new Error("Can't make a Model " + modelName(model) + " to boot on");
        }
        this.trs80.setConfig(config);
        this.reboot();
    }

    /**
     * Press reset and run.
     */
    public reboot(): void {
        this.trs80.reset();
        this.trs80.setRunningState(RunningState.STARTED);
    }
}

/** The page's machine, made on the first boot. */
let machine: Machine | undefined = undefined;

/**
 * Blur whatever has focus, so that the keys go to the machine and not to a control of the panel (a focused
 * button would also be pressed by Space or Enter).
 */
function blurFocus(): void {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}

/**
 * Open the emulator's panel over the page, boot the first floppy, and wait until the user closes the panel. While
 * it's open, the keys go to the machine, not to the page. When it closes, the machine is stopped and the floppies
 * are taken out.
 *
 * @param request what to run.
 * @returns a promise that resolves when the panel has closed.
 */
export function runEmulator(request: EmulatorRequest): Promise<void> {
    machine ??= new Machine();
    const theMachine = machine;
    const trs80 = theMachine.trs80;
    const floppy = request.floppies[0];

    // Whether the image itself is write-protected, or can't be written, which the switch can't change.
    floppy.setMountedWriteProtected(false);
    const imageWriteProtected = floppy.isWriteProtected();

    let model = request.choice.model;
    let writeProtected = imageWriteProtected;
    const tellSettings = (): void => request.onSettings(model, writeProtected);

    const title = el("h2", "");
    const setTitle = (): void => {
        title.textContent = request.name + " on a Model " + modelName(model);
    };

    const protect = makeCheckbox("Write-protected", writeProtected, checked => {
        writeProtected = checked;
        floppy.setMountedWriteProtected(checked);
        tellSettings();
        blurFocus();
    });
    protect.input.disabled = imageWriteProtected;
    protect.element.title = imageWriteProtected ? "The image is marked write-protected, or its format can't be written." :
        "Mount the disk write-protected, so that the DOS can't write to it.";

    const notes = [request.choice.reason + ".",
        "The DOS's writes go to the disk on this page; closing shows them, as one change that Undo takes back."];
    if (request.driveNames.length > 0) {
        notes.push("Other drives: " + request.driveNames.map((name, index) => ":" + (index + 1) + " " + name)
            .join(", ") + " (write-protected).");
    }

    // Keys typed for the machine mustn't also reach the page's own shortcuts, which listen on the document. The
    // keyboard listens on the body, before this, and this stops them there.
    const stopKey = (event: Event): void => event.stopPropagation();
    const overlay = el("div", "emu");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "TRS-80 emulator");

    // The user changes the model with the screen's hardware settings.
    const unsubscribeConfig = trs80.onConfig.subscribe(() => {
        const newModel = theMachine.getModel();
        if (newModel !== model) {
            model = newModel;
            setTitle();
            tellSettings();
        }
    });

    return new Promise<void>(resolve => {
        const close = (): void => {
            unsubscribeConfig();
            trs80.setRunningState(RunningState.STOPPED);
            trs80.ejectAllFloppyDisks();
            theMachine.isOpen = false;
            document.body.removeEventListener("keydown", stopKey);
            document.body.removeEventListener("keyup", stopKey);
            document.body.removeEventListener("paste", stopKey);
            overlay.remove();
            resolve();
        };
        const closeButton = makeButton("Close", close, "primary");
        closeButton.title = "Stop the machine and go back to the disk.";

        setTitle();
        overlay.append(
            el("div", "emu-head", title, el("span", "grow"), protect.element, closeButton),
            el("div", "emu-notes", ...notes.map(note => el("span", "", note))),
            theMachine.node);
        document.body.append(overlay);
        document.body.addEventListener("keydown", stopKey);
        document.body.addEventListener("keyup", stopKey);
        document.body.addEventListener("paste", stopKey);
        blurFocus();

        trs80.ejectAllFloppyDisks();
        request.floppies.forEach((disk, drive) => trs80.loadFloppyDisk(disk, drive));
        theMachine.isOpen = true;
        theMachine.setModel(model);
        tellSettings();
    });
}
