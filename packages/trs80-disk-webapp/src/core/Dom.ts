/**
 * Small helpers for building DOM, shared by the pages.
 */

/**
 * Make an element.
 *
 * @param tag the tag name.
 * @param className the CSS classes, separated by spaces, or "" for none.
 * @param children the element's children. A string becomes a text node.
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "",
                                                          ...children: (Node | string)[]): HTMLElementTagNameMap[K] {

    const element = document.createElement(tag);
    if (className !== "") {
        element.className = className;
    }
    element.append(...children);
    return element;
}

/**
 * Make a button.
 *
 * @param label the button's text.
 * @param onClick called when it's clicked.
 * @param className extra CSS classes, such as "primary" or "danger".
 */
export function makeButton(label: string, onClick: () => void, className = ""): HTMLButtonElement {
    const button = el("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
}

/**
 * Make a toggle switch, in the page's own style.
 *
 * @param label the text beside it.
 * @param checked whether it starts on.
 * @param onChange called with the new state when the user flips it.
 * @param title a tooltip, or "" for none.
 * @returns the label element to add to the page, and the checkbox inside it.
 */
export function makeSwitch(label: string, checked: boolean, onChange: (checked: boolean) => void,
                           title = ""): {element: HTMLLabelElement, input: HTMLInputElement} {

    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const element = el("label", "switch", input, el("span", "track"), " " + label);
    element.title = title;
    return {element, input};
}

/**
 * Make a checkbox with a label.
 *
 * @param label the text beside it, which may be followed by other nodes.
 * @param checked whether it starts checked.
 * @param onChange called with the new state when the user changes it.
 * @returns the label element to add to the page, and the checkbox inside it.
 */
export function makeCheckbox(label: string, checked: boolean,
                             onChange: (checked: boolean) => void): {element: HTMLLabelElement, input: HTMLInputElement} {

    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    return {element: el("label", "", input, " " + label), input};
}

/**
 * Make an element that says why a control is disabled, by wrapping it in a span with a tooltip, since a disabled
 * button doesn't show its own.
 *
 * @param control the control.
 * @param disabledReason why it's disabled, or undefined if it's enabled, in which case the control is returned
 * as it is.
 */
export function withDisabledReason<T extends HTMLElement>(control: T, disabledReason: string | undefined): HTMLElement {
    if (disabledReason === undefined) {
        return control;
    }

    const wrapper = el("span", "", control);
    wrapper.title = disabledReason;
    return wrapper;
}

/**
 * Format a number with thousands separators.
 */
export function formatNumber(value: number): string {
    return value.toLocaleString("en-US");
}

/**
 * Format a number of bytes as KB, such as "112 KB", rounding down.
 */
export function formatKilobytes(bytes: number): string {
    return formatNumber(Math.floor(bytes/1024)) + " KB";
}

/**
 * The words "1 file" or "2 files".
 *
 * @param count how many.
 * @param singular the singular noun.
 * @param plural the plural noun, or undefined to add an "s".
 */
export function countOf(count: number, singular: string, plural?: string): string {
    return formatNumber(count) + " " + (count === 1 ? singular : plural ?? singular + "s");
}

/**
 * Copy text to the clipboard.
 *
 * @param text the text.
 * @returns whether it worked.
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Make a row of segmented buttons, one of which is on.
 *
 * @param values the choices.
 * @param current the current choice.
 * @param label how to show a choice.
 * @param onChoose called with the choice that the user clicks.
 */
export function makeSegments<T>(values: readonly T[], current: T, label: (value: T) => string,
                                onChoose: (value: T) => void): HTMLElement {

    return el("div", "segmented", ...values.map(value =>
        makeButton(label(value), () => onChoose(value), value === current ? "on" : "")));
}
