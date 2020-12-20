import {Context} from "./Context";
import {makeCloseIconButton, makeIcon, makeIconButton} from "./Utils";

/**
 * Base class for panels.
 */
export class Panel {
    public readonly context: Context;
    public readonly element: HTMLElement;
    public readonly headerTextNode: HTMLElement;
    public readonly content: HTMLElement;

    /**
     * Construct the panel and its basic UI.
     *
     * @param context the app's context object.
     * @param title title for the header.
     * @param panelCssClass class for the whole panel.
     * @param showBackButton whether to show a back button.
     */
    constructor(context: Context, title: string, panelCssClass: string, showBackButton: boolean) {
        this.context = context;

        this.element = document.createElement("div");
        this.element.classList.add("panel", panelCssClass);

        const header = document.createElement("h1");
        if (showBackButton) {
            const backButton = makeIconButton(makeIcon("arrow_back"), "Back",
                () => this.context.panelManager.popPanel());
            backButton.classList.add("back-button");
            header.append(backButton);
        }
        this.headerTextNode = document.createElement("span");
        this.headerTextNode.innerText = title;
        header.append(this.headerTextNode);
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        this.element.append(header);

        this.content = document.createElement("div");
        this.content.classList.add("panel-content");
        this.element.append(this.content);
    }
}
