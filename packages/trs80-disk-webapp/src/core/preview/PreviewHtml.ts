/**
 * Escape text for use in HTML, as the content of an element.
 *
 * @param text the plain text.
 * @return the text with "&", "<" and ">" replaced by entities.
 */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Make the HTML for a span with a class. A preview builds its text as one string of these, so that the browser
 * parses it all at once, instead of the preview making an element per piece with the DOM.
 *
 * @param text the plain text of the span (it's escaped here).
 * @param className the CSS class.
 * @return the HTML.
 */
export function spanHtml(text: string, className: string): string {
    return "<span class=\"" + className + "\">" + escapeHtml(text) + "</span>";
}

/**
 * Make the outer element of a preview: a column holding an optional toolbar and the scrolling body.
 *
 * @param kindClass the CSS class that names the view, such as "preview-hex".
 * @return the element, with the classes "preview" and the given one.
 */
export function newPreviewElement(kindClass: string): HTMLElement {
    const element = document.createElement("div");
    element.classList.add("preview", kindClass);
    return element;
}

/**
 * Make the scrolling, monospaced body of a preview.
 *
 * @param html the HTML of the body's content.
 * @return a "pre" element with the class "preview-body".
 */
export function newPreviewBody(html: string): HTMLPreElement {
    const pre = document.createElement("pre");
    pre.classList.add("preview-body");
    pre.innerHTML = html;
    return pre;
}

/**
 * Make a checkbox with a label, for a preview's toolbar.
 *
 * @param text the label.
 * @param checked the initial state.
 * @param onChange called with the new state when the user changes it.
 * @return the label element, which holds the checkbox.
 */
export function newCheckbox(text: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => onChange(checkbox.checked));
    label.append(checkbox, " " + text);
    return label;
}

/**
 * Make a toolbar for a preview.
 *
 * @param children the controls.
 * @return the toolbar element.
 */
export function newToolbar(...children: Node[]): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.classList.add("preview-toolbar");
    toolbar.append(...children);
    return toolbar;
}
