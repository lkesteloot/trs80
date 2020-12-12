import {Context} from "./Context";
import {File} from "./File";

/**
 * Base class for panels.
 */
export class Panel {
    public readonly context: Context
    public readonly element: HTMLElement;

    constructor(context: Context) {
        this.context = context;

        this.element = document.createElement("div");
        this.element.classList.add("panel");
    }

    /**
     * Run a program and close the panel.
     */
    public runProgram(file: File): void {
        this.context.runProgram(file);
        this.context.panelManager.close();
    }
}
