import {SimpleEventDispatcher} from "strongly-typed-events";

/**
 * Represents a single page tab and its contents.
 */
export abstract class PageTab {
    public readonly name: string;
    public visible: boolean;
    private firstShow = true;
    // Element for the body of the tab.
    public readonly element: Element;

    protected constructor(name: string, visible: boolean = true) {
        this.name = name;
        this.visible = visible;
        this.element = document.createElement("div");
        this.element.classList.add("tab-content");
    }

    /**
     * Called when a tab is shown.
     */
    public onShow(): void {
        if (this.firstShow) {
            this.firstShow = false;
            // Delay to give the UI a chance to highlight the tab.
            setTimeout(() => this.onFirstShow(), 0);
        }
    }

    /**
     * Called the first time a tab is shown.
     */
    public onFirstShow(): void {
        // Nothing by default.
    }

    /**
     * Called when a key is pressed and this tab is visible.
     * @param e the keyboard event for the key down event.
     * @return whether the method handled the key.
     */
    public onKeyDown(e: KeyboardEvent): boolean {
        // Nothing by default.
        return false;
    }

    /**
     * Called when a tab is hidden (another tab is shown).
     */
    public onHide(): void {
        // Nothing by default.
    }

    /**
     * Called when the page tab is being destroyed.
     */
    public onDestroy(): void {
        // Nothing by default.
    }
}
