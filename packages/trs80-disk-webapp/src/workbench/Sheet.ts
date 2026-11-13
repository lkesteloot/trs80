import {el, makeButton} from "./Dom.js";

/**
 * The parts of a sheet that its owner fills in.
 */
export interface SheetOptions {
    /** The title. */
    title: string;
    /** A sentence under the title, or undefined for none. */
    subtitle?: string | undefined;
    /** The sheet's body. */
    content: HTMLElement;
    /** The controls on the right of the footer, such as Cancel and an action button. */
    buttons: HTMLElement[];
    /** Called when the sheet closes for any reason (Escape included). */
    onClose?: (() => void) | undefined;
}

/**
 * A modal sheet over the page, like the mockup's: a title, a body, and a footer with a status line and buttons.
 * One is shown at a time. Escape closes it.
 */
export class Sheet {
    /** The footer's status line, which the owner changes. */
    public readonly status = el("span", "status");
    private readonly backdrop: HTMLElement;
    private readonly options: SheetOptions;
    private readonly keyHandler: (event: KeyboardEvent) => void;
    private closed = false;

    /**
     * Build the sheet. It isn't shown until {@link open} is called.
     *
     * @param options what's in it.
     */
    constructor(options: SheetOptions) {
        this.options = options;
        const header = el("header", "", el("h2", "", options.title));
        if (options.subtitle !== undefined) {
            header.append(el("p", "", options.subtitle));
        }
        const footer = el("footer", "", this.status, ...options.buttons);
        const sheet = el("div", "sheet", header, el("div", "content", options.content), footer);
        this.backdrop = el("div", "backdrop", sheet);
        this.backdrop.setAttribute("role", "dialog");
        this.backdrop.setAttribute("aria-label", options.title);
        this.keyHandler = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.close();
            }
        };
    }

    /**
     * Show the sheet, replacing any other that's showing.
     */
    public open(): void {
        const modal = document.getElementById("modal") as HTMLElement;
        modal.replaceChildren(this.backdrop);
        // Capture, so that this wins over the page's own Escape handling.
        document.addEventListener("keydown", this.keyHandler, true);
    }

    /**
     * Set the status line.
     *
     * @param text the text.
     * @param isProblem whether to show it as a problem, in red.
     */
    public setStatus(text: string, isProblem: boolean): void {
        this.status.textContent = text;
        this.status.classList.toggle("bad", isProblem);
    }

    /**
     * Close the sheet. Does nothing if it's closed already.
     */
    public close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        document.removeEventListener("keydown", this.keyHandler, true);
        this.backdrop.remove();
        this.options.onClose?.();
    }
}

/**
 * Ask the user to confirm something, with a sheet.
 *
 * @param title the question.
 * @param message more detail, or "" for none.
 * @param confirmLabel the label of the button that says yes.
 * @param danger whether yes is destructive, which colors its button.
 * @returns whether the user said yes.
 */
export function confirmSheet(title: string, message: string, confirmLabel: string, danger: boolean): Promise<boolean> {
    return new Promise(resolve => {
        let answer = false;
        const sheet: Sheet = new Sheet({
            title,
            content: el("p", "", message),
            buttons: [
                makeButton("Cancel", () => sheet.close()),
                makeButton(confirmLabel, () => {
                    answer = true;
                    sheet.close();
                }, danger ? "primary danger-fill" : "primary"),
            ],
            onClose: () => resolve(answer),
        });
        sheet.open();
        (document.querySelector("#modal .sheet footer button.primary") as HTMLElement | null)?.focus();
    });
}
