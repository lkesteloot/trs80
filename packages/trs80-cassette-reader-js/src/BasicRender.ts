
import jss from './Jss'
import {Highlightable} from "./Highlighter";
import {BasicProgram, ElementType} from "trs80-base";

/**
 * Add text to the line with the specified class.
 *
 * @param out the enclosing element to add to.
 * @param text the text to add.
 * @param className the name of the class for the item.
 */
function add(out: HTMLElement, text: string, className: string): HTMLElement {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
    return e;
}

// Stylesheet.
const BACKGROUND_COLOR = "var(--background)";
const STYLE = {
    error: {
        color: "var(--red)",
        "&$highlighted": {
            backgroundColor: "var(--red)",
            color: BACKGROUND_COLOR,
        },
    },
    lineNumber: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    punctuation: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    keyword: {
        color: "var(--blue)",
        "&$highlighted": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
    },
    regular: {
        color: "var(--foreground)",
        "&$highlighted": {
            backgroundColor: "var(--foreground)",
            color: BACKGROUND_COLOR,
        },
    },
    string: {
        color: "var(--orange)",
        "&$highlighted": {
            backgroundColor: "var(--orange)",
            color: BACKGROUND_COLOR,
        },
    },
    comment: {
        color: "var(--cyan)",
        "&$highlighted": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
    },
    selected: {
        backgroundColor: "var(--background-highlights)",
    },
    highlighted: {
        // Empty style that's referenced above as $highlighted.
    },
};
const sheet = jss.createStyleSheet(STYLE);
export const highlightClassName = sheet.classes.highlighted;
export const selectClassName = sheet.classes.selected;

/**
 * Render an array of Basic elements to a DIV.
 */
export function toDiv(basicProgram: BasicProgram | undefined, out: HTMLElement): Highlightable[] {
    sheet.attach();
    const classes = sheet.classes;

    // Map from byte address to HTML element for that byte.
    const elements: Highlightable[] = [];

    if (basicProgram === undefined) {
        // Not sure what to do here.
        return elements;
    }

    let line: HTMLElement | undefined = undefined;
    for (const basicElement of basicProgram.elements) {
        let className: string;

        if (line === undefined || basicElement.elementType === ElementType.LINE_NUMBER) {
            line = document.createElement("div");
            out.appendChild(line);
        }

        switch (basicElement.elementType) {
            case ElementType.ERROR:
                className = classes.error;
                break;
            case ElementType.LINE_NUMBER:
                className = classes.lineNumber;
                break;
            case ElementType.PUNCTUATION:
                className = classes.punctuation;
                break;
            case ElementType.KEYWORD:
                className = classes.keyword;
                break;
            case ElementType.REGULAR:
            default:
                className = classes.regular;
                break;
            case ElementType.STRING:
                className = classes.string;
                break;
            case ElementType.COMMENT:
                className = classes.comment;
                break;
        }

        const e = add(line, basicElement.text, className);
        if (basicElement.offset !== undefined) {
            elements.push(new Highlightable(basicElement.offset, basicElement.offset + basicElement.length - 1, e));
        }
    }

    return elements;
}
