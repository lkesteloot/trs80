import {Context} from "./Context";

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
}
