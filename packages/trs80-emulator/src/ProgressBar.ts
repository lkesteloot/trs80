
import {CSS_PREFIX} from "./Utils";

const gCssPrefix = CSS_PREFIX + "-progress-bar";
const gScreenNodeCssClass = gCssPrefix + "-screen-node";
const gBarCssClass = gCssPrefix + "-bar";
const gSubbarCssClass = gCssPrefix + "-subbar";

const GLOBAL_CSS = "." + gBarCssClass + ` {
    background-color: rgba(0, 0, 0, 0.2);
    position: absolute;
    left: 15%;
    width: 70%;
    bottom: 10%;
    height: 20px;
    border-radius: 10px;
    overflow: hidden;
    opacity: 0;
    transition: opacity .20s ease-in-out;
}

.` + gSubbarCssClass + ` {
    background-color: rgba(255, 255, 255, 0.4);
    width: 0;
    height: 20px;
}

.` + gScreenNodeCssClass + ` {
    /* Force the screen node to relative positioning. Hope that doesn't screw anything up. */
    position: relative;
}

`;

/**
 * Overlay on top of a screen to show progress, for instance the position of a cassette tape.
 */
export class ProgressBar {
    private readonly barNode: HTMLElement;
    private readonly subbarNode: HTMLElement;
    private maxValue: number = 100;

    /**
     * @param screenNode the node from the Trs80Screen object's getNode() method.
     */
    constructor(screenNode: HTMLElement) {
        // Make global CSS if necessary.
        ProgressBar.configureStyle();

        screenNode.classList.add(gScreenNodeCssClass);

        this.barNode = document.createElement("div");
        this.barNode.classList.add(gBarCssClass);
        screenNode.appendChild(this.barNode);

        this.subbarNode = document.createElement("div");
        this.subbarNode.classList.add(gSubbarCssClass);
        this.barNode.appendChild(this.subbarNode);
    }

    public setMaxValue(maxValue: number) {
        this.maxValue = maxValue;
    }

    public setValue(value: number) {
        this.subbarNode.style.width = "" + Math.round(value*100/this.maxValue) + "%";
    }

    public show() {
        this.barNode.style.opacity = "1";
    }

    public hide() {
        this.barNode.style.opacity = "0";
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
