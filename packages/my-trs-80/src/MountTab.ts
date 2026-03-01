import {PageTab} from "./PageTab";
import {Context} from "./Context";
import {FloppyDisk, Trs80File} from "trs80-base";
import {FLOPPY_DRIVE_COUNT} from "trs80-emulator";

const SELECTED_CSS_CLASS = "mount-radio-button-selected";

/**
 * Create a button with a dot that can be enabled, like a radio button.
 */
export function makeRadioButton(label: string, clickCallback: (() => void)): HTMLButtonElement {
    const button = document.createElement("button");
    button.classList.add("text-button", "mount-radio-button");

    // Add dot.
    const icon = document.createElement("i");
    icon.classList.add("material-icons-round", "mount-radio-button-dot");
    icon.innerText = "circle";
    button.append(icon);

    // Add text.
    const labelNode = document.createElement("span");
    labelNode.classList.add("mount-radio-button-label");
    labelNode.innerText = label;
    button.append(labelNode);

    // Action.
    button.addEventListener("click", clickCallback);

    return button;
}
/**
 * Tab to allow mounting a floppy disk.
 */
export class MountTab extends PageTab {
    private readonly context: Context;
    private readonly trs80File: Trs80File;
    private readonly unmountedButton: HTMLButtonElement;
    private readonly driveButtons: HTMLButtonElement[] = [];

    constructor(context: Context, trs80File: Trs80File) {
        super("Mount");

        this.context = context;
        this.trs80File = trs80File;

        this.element.classList.add("mount-tab");

        const contents = document.createElement("div");
        contents.classList.add("mount-contents");
        this.element.append(contents);

        const buttons = document.createElement("div");
        buttons.classList.add("mount-buttons");
        contents.append(buttons);

        this.unmountedButton = makeRadioButton("Unmounted", () => {
            this.mount(undefined);
        });
        buttons.append(this.unmountedButton);

        for (let drive = 0; drive < FLOPPY_DRIVE_COUNT; drive++) {
            this.driveButtons.push(makeRadioButton("Drive " + drive, () => {
                this.mount(drive);
            }));
        }
        buttons.append(... this.driveButtons);

        this.updateButtons();
    }

    /**
     * Mount the file on the given drive, unmounting it first if necessary.
     */
    private mount(drive: number | undefined) {
        if (this.trs80File instanceof FloppyDisk) {
            const mountedDrive = this.getMountDrive();
            if (mountedDrive !== drive) {
                if (mountedDrive !== undefined) {
                    this.context.trs80.loadFloppyDisk(undefined, mountedDrive);
                }
                if (drive !== undefined) {
                    this.context.trs80.loadFloppyDisk(this.trs80File, drive);
                }
            }
        }

        this.updateButtons();
    }

    /**
     * Get the drive that this file is currently mounted on.
     */
    private getMountDrive(): number | undefined {
        for (let drive = 0; drive < FLOPPY_DRIVE_COUNT; drive++) {
            if (this.context.trs80.getFloppyDisk(drive) === this.trs80File) {
                return drive;
            }
        }

        return undefined;
    }

    /**
     * Update the selected state of the radio buttons depending on how this file is mounted.
     */
    private updateButtons() {
        const mountedDrive = this.getMountDrive();

        this.unmountedButton.classList.toggle(SELECTED_CSS_CLASS, mountedDrive === undefined);
        for (let i = 0; i < this.driveButtons.length; i++) {
            this.driveButtons[i].classList.toggle(SELECTED_CSS_CLASS, i === mountedDrive);
        }
    }
}
