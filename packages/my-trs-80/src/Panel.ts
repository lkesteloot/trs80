import {Context} from "./Context";
import {File} from "./File";
import {CmdProgram} from "trs80-base";

/**
 * Base class for panels.
 */
export class Panel {
    public readonly context: Context
    public readonly element: HTMLElement;

    constructor(context: Context) {
        this.context = context;

        this.element = document.createElement("div");
        this.element.classList.add("popup-content");
    }

    /**
     * Run a program and close the panel.
     */
    public runProgram(file: File): void {
        const cmdProgram = new CmdProgram(file.binary);
        if (cmdProgram.error !== undefined) {
            // TODO
        } else {
            this.context.trs80.runCmdProgram(cmdProgram);
            this.context.panelManager.close();
        }
    }
}
