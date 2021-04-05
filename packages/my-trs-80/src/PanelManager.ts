import {Panel} from "./Panel";
import {SimpleEventDispatcher} from "strongly-typed-events";

/**
 * Manages a stack of displayed panels.
 */
export class PanelManager {
    private readonly backgroundNode: HTMLElement;
    private readonly positioningNode: HTMLElement;
    private readonly panels: Panel[] = [];
    public readonly onOpenClose = new SimpleEventDispatcher<boolean>();
    private isOpen = false;

    constructor() {
        const body = document.querySelector("body") as HTMLElement;

        this.backgroundNode = document.createElement("div");
        this.backgroundNode.classList.add("panel-background");
        this.backgroundNode.addEventListener("click", e => {
            if (e.target === this.backgroundNode) {
                this.close();
                e.preventDefault();
                e.stopPropagation();
            }
        });
        body.append(this.backgroundNode);

        this.positioningNode = document.createElement("div");
        this.positioningNode.classList.add("panel-positioning");
        this.backgroundNode.append(this.positioningNode);

        // Pass key events to panels.
        document.addEventListener("keydown", e => {
            let handled = false;

            // Ctrl-L anywhere to toggle the panels.
            if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key === "l") {
                this.toggle();
                handled = true;
            }

            // Ctrl-Backspace to pop a panel.
            if (!handled && this.panels.length > 1 && e.ctrlKey && !e.metaKey && !e.shiftKey &&
                !e.altKey && e.key === "Backspace") {

                this.popPanel();
                handled = true;
            }

            // If panel is open, pass key to visible panel.
            if (!handled && this.isOpen) {
                // Give panel first chance, in case they need Esc for something more useful
                // than closing the panel.
                handled = this.panels[this.panels.length - 1].onKeyDown(e);
                if (!handled && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key === "Escape") {
                    this.close();
                    handled = true;
                }
            }

            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    /**
     * Push a new panel and animate it on-screen.
     */
    public pushPanel(panel: Panel): void {
        this.panels.push(panel);
        this.positioningNode.append(panel.element);

        if (this.panels.length === 1) {
            // First panel, position immediately.
            this.positionPanels(this.panels.length - 1);
        } else {
            // Position it instantly at its off-screen position.
            this.positionPanels(this.panels.length - 2);

            // Wait for it to be laid out, then position it on-screen so the animation will be used.
            setTimeout(() => {
                this.positionPanels(this.panels.length - 1);
            }, 0);
        }
    }

    /**
     * Start the animation to pop the most screen panel.
     */
    public popPanel(): void {
        if (this.panels.length > 1) {
            // Slide it off-screen.
            this.positionPanels(this.panels.length - 2);

            // Remove it from the DOM.
            const panel = this.panels.pop();
            setTimeout(() => {
                if (panel !== undefined) {
                    panel.onPanelDestroy();
                    panel.element.remove();
                }
            }, 1000);
        }
    }

    /**
     * Move the panels to their position so that "active" will be on-screen.
     */
    private positionPanels(active: number): void {
        for (let i = 0; i < this.panels.length; i++) {
            const screen = this.panels[i];
            const offset = (i - active)*100;

            screen.element.style.left = offset + "vw";
            screen.element.style.right = -offset + "vw";
        }
    }

    /**
     * Show the panels. Shows them where they were last.
     */
    public open(): void {
        if (!this.isOpen) {
            this.isOpen = true;
            this.onOpenClose.dispatch(true);
            this.backgroundNode.classList.add("panel-shown");
        }
    }

    /**
     * Hides the panels.
     */
    public close(): void {
        if (this.isOpen) {
            this.isOpen = false;
            this.onOpenClose.dispatch(false);
            this.backgroundNode.classList.remove("panel-shown");
        }
    }

    /**
     * Toggle the visibility of the panels.
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}
