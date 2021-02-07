
import {CSS_PREFIX} from "./Utils";
import {FLOPPY_DRIVE_COUNT} from "./FloppyDiskController";

const gCssPrefix = CSS_PREFIX + "-drive-indicators";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gIndicatorCssClass = gCssPrefix + "-indicator";
const gIndicatorDriveOnCssClass = gCssPrefix + "-drive-on";

const GLOBAL_CSS = `
.${gScreenNodeCssClass} {
    /* Force the screen node to relative positioning. Hope that doesn't screw anything up. */
    position: relative;
}

.${gIndicatorCssClass} {
    position: absolute;
    background-color: #CC0000;
    right: 10px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    opacity: 0;
    transition: opacity .20s ease-in-out;
    filter: drop-shadow(0 0 3px #ff0000);
}

.${gIndicatorDriveOnCssClass} {
    opacity: .75;
}
`;

/**
 * Red lights on top of the screen that indicate which drives are spinning.
 */
export class DriveIndicators {
    private readonly lights: HTMLElement[] = [];

    /**
     * @param screenNode the node from the Trs80Screen object's getNode() method.
     */
    constructor(screenNode: HTMLElement) {
        // Make global CSS if necessary.
        DriveIndicators.configureStyle();

        screenNode.classList.add(gScreenNodeCssClass);

        for (let i = 0; i < FLOPPY_DRIVE_COUNT; i++) {
            const light = document.createElement("div");
            light.classList.add(gIndicatorCssClass);
            light.style.bottom = (12 + 20*i) + "px";
            screenNode.append(light);

            this.lights.push(light);
        }
    }

    /**
     * Set the drive number (0-based) that's currently on, if any.
     * @param drive
     */
    public setActiveDrive(drive: number | undefined): void {
        for (let i = 0; i < FLOPPY_DRIVE_COUNT; i++) {
            this.lights[i].classList.toggle(gIndicatorDriveOnCssClass, i === drive);
        }
    }

    /**
     * Make a global stylesheet for all TRS-80 emulators on this page.
     */
    private static configureStyle(): void {
        const styleId = gCssPrefix;
        if (document.getElementById(styleId) !== null) {
            // Already created.
            return;
        }

        const node = document.createElement("style");
        node.id = styleId;
        node.innerHTML = GLOBAL_CSS;
        document.head.appendChild(node);
    }
}
