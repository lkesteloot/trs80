import {el} from "../core/Dom.js";

// The commander's modal dialogs, in the text-mode style: a double border with the title in it, fields, and
// buttons that look like "[ OK ]".

/**
 * One button of a dialog.
 */
export interface DialogButton {
    /** The button's text. */
    label: string;
    /**
     * What the button does. It can be asynchronous. If it returns a message, the dialog stays open and shows the
     * message as an error; if it returns nothing, the dialog closes.
     */
    action: () => Promise<string | undefined> | string | undefined;
}

/**
 * How to open a dialog.
 */
export interface DialogOptions {
    /** The title, which sits in the top border. */
    title: string;
    /** What's inside, above the status line and the buttons. */
    body: Node[];
    /** The buttons. The first is the default, which Enter presses. Cancel is added after them. */
    buttons: DialogButton[];
    /** The label of the button that just closes the dialog, or "" for none. Escape does the same. Default "Cancel". */
    cancelLabel?: string | undefined;
    /** Called after the dialog closes, however it closed. */
    onClosed?: (() => void) | undefined;
}

/**
 * An open dialog, for the code that opened it to update.
 */
export interface DialogHandle {
    /** The element that holds the body, which the opener may rebuild. */
    readonly bodyElement: HTMLElement;
    /**
     * Show a line under the body.
     *
     * @param text the message, or "" for none.
     * @param isError whether to show it as an error.
     */
    setStatus(text: string, isError: boolean): void;
    /**
     * Enable or disable a button.
     *
     * @param index the button's index, as in {@link DialogOptions.buttons}.
     * @param enabled whether it can be pressed.
     */
    setButtonEnabled(index: number, enabled: boolean): void;
    /** Close the dialog. */
    close(): void;
}

/**
 * The elements that Tab can reach in a dialog.
 */
const FOCUSABLE = "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/**
 * The layer that dialogs open in. At most one dialog is open at a time.
 */
export class DialogLayer {
    private readonly layer: HTMLElement;
    private current: {overlay: HTMLElement, defaultButton: () => void, cancel: () => void} | undefined = undefined;

    /**
     * @param layer the element that holds the dialog's overlay.
     */
    constructor(layer: HTMLElement) {
        this.layer = layer;
    }

    /**
     * Whether a dialog is open.
     */
    public get isOpen(): boolean {
        return this.current !== undefined;
    }

    /**
     * Open a dialog. Any dialog that's already open is closed first.
     *
     * @param options what to show.
     */
    public open(options: DialogOptions): DialogHandle {
        this.close();

        const bodyElement = el("div", "dlgbody", ...options.body);
        const status = el("p", "muted");
        status.hidden = true;
        status.setAttribute("role", "status");
        const buttonRow = el("div", "btns");
        const dialog = el("div", "dlg", el("h2", "", options.title), bodyElement, status, buttonRow);
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-label", options.title);
        const overlay = el("div", "overlay", dialog);
        overlay.dataset.overlay = "1";

        let busy = false;
        let closed = false;
        const close = (): void => {
            if (closed) {
                return;
            }
            closed = true;
            overlay.remove();
            if (this.current?.overlay === overlay) {
                this.current = undefined;
            }
            options.onClosed?.();
        };

        const buttonElements: HTMLButtonElement[] = [];
        const pressed = async (button: DialogButton): Promise<void> => {
            if (busy) {
                return;
            }
            busy = true;
            let problem: string | undefined;
            try {
                problem = await button.action();
            } catch (e: any) {
                console.error(e);
                problem = e?.message ?? String(e);
            }
            busy = false;
            if (problem === undefined) {
                close();
            } else {
                setStatus(problem, true);
            }
        };
        const setStatus = (text: string, isError: boolean): void => {
            status.textContent = text;
            status.className = isError ? "err" : "muted";
            status.hidden = text === "";
        };

        for (const [index, button] of options.buttons.entries()) {
            const element = el("button", index === 0 ? "def" : "", button.label);
            element.type = "button";
            element.addEventListener("click", () => void pressed(button));
            buttonElements.push(element);
            buttonRow.append(element);
        }
        const cancelLabel = options.cancelLabel ?? "Cancel";
        if (cancelLabel !== "") {
            const cancelButton = el("button", "", cancelLabel);
            cancelButton.type = "button";
            cancelButton.addEventListener("click", close);
            buttonRow.append(cancelButton);
        }

        // A click on the dim area outside the dialog cancels it.
        overlay.addEventListener("mousedown", event => {
            if (event.target === overlay) {
                close();
            }
        });

        this.layer.append(overlay);
        this.current = {
            overlay,
            defaultButton: () => {
                if (options.buttons.length > 0) {
                    void pressed(options.buttons[0]);
                } else {
                    close();
                }
            },
            cancel: close,
        };

        // Focus the first field, or the default button.
        const firstField = bodyElement.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled])");
        (firstField ?? buttonElements[0] ?? buttonRow.querySelector("button"))?.focus();
        if (firstField instanceof HTMLInputElement && firstField.type === "text") {
            firstField.select();
        }

        return {
            bodyElement,
            setStatus,
            setButtonEnabled: (index, enabled) => {
                const element = buttonElements[index];
                if (element !== undefined) {
                    element.disabled = !enabled;
                }
            },
            close,
        };
    }

    /**
     * Close the open dialog, if any, as Cancel does.
     */
    public close(): void {
        this.current?.cancel();
    }

    /**
     * Give the open dialog a key press: Escape cancels, Enter presses the default button (unless a button has the
     * focus, which presses itself), and Tab stays inside the dialog.
     *
     * @param event the key event.
     * @returns whether the dialog took the key. A key that it doesn't take (typing in a field, for one) is left
     * alone, for the browser.
     */
    public handleKeydown(event: KeyboardEvent): boolean {
        const current = this.current;
        if (current === undefined) {
            return false;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            current.cancel();
            return true;
        }

        if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement) &&
            !(event.target instanceof HTMLTextAreaElement)) {

            event.preventDefault();
            current.defaultButton();
            return true;
        }

        if (event.key === "Tab") {
            const focusable = Array.from(current.overlay.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (focusable.length === 0) {
                event.preventDefault();
                return true;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
            return true;
        }

        return false;
    }

    /**
     * Show a message with an OK button.
     *
     * @param title the title.
     * @param paragraphs the message, a paragraph each.
     */
    public alert(title: string, paragraphs: string[]): void {
        this.open({
            title,
            body: paragraphs.map(text => el("p", "wrap", text)),
            buttons: [{label: "OK", action: () => undefined}],
            cancelLabel: "",
        });
    }

    /**
     * Ask the user to confirm something.
     *
     * @param title the title.
     * @param text the question.
     * @param confirmLabel the label of the button that says yes.
     * @returns whether the user said yes.
     */
    public confirm(title: string, text: string, confirmLabel: string): Promise<boolean> {
        return new Promise(resolve => {
            let answer = false;
            this.open({
                title,
                body: [el("p", "wrap", text)],
                buttons: [{label: confirmLabel, action: () => {
                    answer = true;
                    return undefined;
                }}],
                onClosed: () => resolve(answer),
            });
        });
    }
}

/**
 * Make a checkbox with a label, in the dialog style.
 *
 * @param label the text beside it.
 * @param checked whether it starts checked.
 * @param onChange called with the new state when the user changes it.
 * @returns the label element and the checkbox inside it.
 */
export function makeCheck(label: string, checked: boolean,
                          onChange: (checked: boolean) => void): {element: HTMLLabelElement, input: HTMLInputElement} {

    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    return {element: el("label", "", input, label), input};
}

/**
 * Make a radio button with a label, in the dialog style.
 *
 * @param group the radio group's name.
 * @param label the text beside it.
 * @param checked whether it starts selected.
 * @param onChoose called when the user selects it.
 * @returns the label element and the radio button inside it.
 */
export function makeRadio(group: string, label: string, checked: boolean,
                          onChoose: () => void): {element: HTMLLabelElement, input: HTMLInputElement} {

    const input = el("input");
    input.type = "radio";
    input.name = group;
    input.checked = checked;
    input.addEventListener("change", () => {
        if (input.checked) {
            onChoose();
        }
    });
    return {element: el("label", "", input, label), input};
}

/**
 * Make a text field.
 *
 * @param value its starting text.
 * @param size its width in characters.
 * @param onInput called with the text after each edit, or undefined.
 */
export function makeText(value: string, size: number, onInput?: (text: string) => void): HTMLInputElement {
    const input = el("input");
    input.type = "text";
    input.value = value;
    input.size = size;
    input.spellcheck = false;
    input.autocomplete = "off";
    if (onInput !== undefined) {
        input.addEventListener("input", () => onInput(input.value));
    }
    return input;
}

/**
 * Make a row of a label and a field, for a dialog's form grid.
 *
 * @param label the label.
 * @param field the field.
 * @returns the two elements, to append to a grid.
 */
export function formRow(label: string, field: Node): Node[] {
    return [el("span", "", label), el("div", "", field)];
}
