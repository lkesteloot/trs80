import {BasicElement, BasicProgram, ElementType, Trs80File} from "trs80-base";
import {PageTab} from "./PageTab";
import {clearElement} from "teamten-ts-utils";

/**
 * Add text to the line with the specified class.
 *
 * @param out the enclosing element to add to.
 * @param text the text to add.
 * @param className the name of the class for the item.
 * @return the new element.
 */
function add(out: HTMLElement, text: string, className: string): HTMLElement {
    const e = document.createElement("span");
    e.innerText = text;
    e.classList.add(className);
    out.appendChild(e);
    return e;
}

/**
 * Tab for displaying the decoded Basic source code.
 */
export class BasicTab extends PageTab {
    private readonly basic: BasicProgram;
    private readonly basicElement: HTMLElement;

    constructor(basic: BasicProgram) {
        super("Basic");

        this.basic = basic;

        this.element.classList.add("basic-tab");

        const outer = document.createElement("div");
        outer.classList.add("basic-outer");
        this.element.append(outer);

        this.basicElement = document.createElement("div");
        this.basicElement.classList.add("basic");
        outer.append(this.basicElement);
    }

    public onFirstShow(): void {
        this.generateBasic();
    }

    /**
     * Regenerate the HTML for the Basic program.
     */
    private generateBasic(): void {
        const lines: HTMLElement[] = [];
        let line: HTMLElement | undefined = undefined;

        for (const basicElement of this.basic.elements) {
            // Create a new line if necessary.
            if (line === undefined || basicElement.elementType === ElementType.LINE_NUMBER) {
                line = document.createElement("div");
                lines.push(line);
            }

            add(line, basicElement.asAscii(), BasicTab.classNameForBasicElement(basicElement));
        }

        // Add the lines all at once.
        clearElement(this.basicElement);
        this.basicElement.append(... lines);
    }

    /**
     * Get the CSS class name for the given element.
     */
    private static classNameForBasicElement(basicElement: BasicElement): string {
        switch (basicElement.elementType) {
            case ElementType.ERROR:
                return "basic-error";

            case ElementType.LINE_NUMBER:
                return "basic-line-number";

            case ElementType.PUNCTUATION:
                return "basic-punctuation";

            case ElementType.KEYWORD:
                return "basic-keyword";

            case ElementType.REGULAR:
            default:
                return "basic-regular";

            case ElementType.STRING:
                return "basic-string";

            case ElementType.COMMENT:
                return "basic-comment";
        }
    }
}
