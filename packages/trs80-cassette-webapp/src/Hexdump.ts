
// Tools for generating a hex dump of a binary file.

import jss from './Jss';
import {Highlightable} from "./Highlighter";
import {Program} from "trs80-cassette";
import {HexdumpGenerator, ProgramAnnotation} from "trs80-base";

// Stylesheet.
const BACKGROUND_COLOR = "var(--background)";
const STYLE = {
    address: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    hex: {
        color: "var(--blue)",
        "&$highlighted": {
            backgroundColor: "var(--blue)",
            color: BACKGROUND_COLOR,
        },
    },
    ascii: {
        color: "var(--cyan)",
        "&$highlighted": {
            backgroundColor: "var(--cyan)",
            color: BACKGROUND_COLOR,
        },
    },
    asciiUnprintable: {
        color: "var(--foreground-secondary)",
        "&$highlighted": {
            backgroundColor: "var(--foreground-secondary)",
            color: BACKGROUND_COLOR,
        },
    },
    annotation: {
        color: "var(--violet)",
    },
    outsideAnnotation: {
        opacity: 0.2,
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
type Classes = typeof sheet.classes;

/**
 * Hexdump generator for HTML output.
 */
class HtmlHexdumpGenerator extends HexdumpGenerator<HTMLDivElement, HTMLSpanElement> {
    private static classCounter = 1;
    private readonly parent: HTMLElement;
    private readonly classes: Classes;
    public readonly hexHighlightables: Highlightable[] = [];
    public readonly asciiHighlightables: Highlightable[] = [];
    private nestedCounter = 1;
    private nestedId: string = "";
    private nextLineExpandable = false;
    private expanded = false;

    constructor(binary: Uint8Array, collapse: boolean,
                annotations: ProgramAnnotation[], parent: HTMLElement, classes: Classes) {

        super(binary, collapse, annotations);
        this.parent = parent;
        this.classes = classes;
        HtmlHexdumpGenerator.classCounter += 1;
    }

    protected newLine(): HTMLDivElement {
        return document.createElement("div");
    }

    protected getLineText(line: HTMLElement): string {
        return line.textContent ?? "";
    }

    protected newSpan(line: HTMLElement, text: string, ...cssClass: string[]): HTMLSpanElement {
        const e = document.createElement("span");
        e.classList.add(...cssClass.map(className => this.mapClassName(className)));
        e.innerText = text;
        line.append(e);
        return e;
    }

    protected addTextToSpan(span: HTMLElement, text: string): void {
        span.innerText += text;
    }

    protected supportsNestedAnnotations(): boolean {
        return true;
    }

    protected beginExpandable(): void {
        // Come up with new number and ID
        this.nestedId = "htmlHexdumpGenerator-" + HtmlHexdumpGenerator.classCounter + "-" + this.nestedCounter;
        this.nestedCounter += 1;

        // Create and add checkbox.
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = this.nestedId + "-checkbox";
        this.parent.append(checkbox);

        // Create and add stylesheet.
        const stylesheet = document.createElement("style");
        stylesheet.innerText = `
        #${this.nestedId}-checkbox {
            display: none;
        }
        .${this.nestedId}-control {
            opacity: 0.4;
        }
        .${this.nestedId}-label {
            cursor: pointer;
            text-decoration: underline;
        }
        #${this.nestedId}-checkbox:checked ~ .${this.nestedId}-expandable {
            display: none;
        }
        #${this.nestedId}-checkbox:not(:checked) ~ .${this.nestedId}-expanded {
            display: none;
        }
        `;
        this.parent.append(stylesheet);

        // Mark that we need to modify next line.
        this.nextLineExpandable = true;
        this.expanded = false;
    }

    protected beginExpanded(): void {
        this.nextLineExpandable = true;
        this.expanded = true;
    }

    protected endExpanded(): void {
        this.nextLineExpandable = false;
        this.nestedId = "";
    }

    protected requireRegisteredBytes(): boolean {
        return true;
    }

    protected registerHexByte(span: HTMLSpanElement, index: number): void {
        this.hexHighlightables.push(new Highlightable(index, index, span));
    }

    protected registerAsciiByte(span: HTMLSpanElement, index: number): void {
        this.asciiHighlightables.push(new Highlightable(index, index, span));
    }

    /**
     * Generate the lines and add them to the div.
     */
    public run(): void {
        for (const line of this.generate()) {
            if (this.nextLineExpandable) {
                const label = document.createElement("label");
                label.innerText = this.expanded ? "collapse" : "disasm";
                label.classList.add(this.nestedId + "-label");
                label.htmlFor = this.nestedId + "-checkbox";

                const control = document.createElement("span");
                control.classList.add(this.nestedId + "-control");
                control.append(" (", label, ")");

                line.lastElementChild?.append(control);
                this.nextLineExpandable = false;
            }
            if (this.nestedId !== "") {
                if (this.expanded) {
                    line.classList.add(this.nestedId + "-expanded");
                } else {
                    line.classList.add(this.nestedId + "-expandable");
                }
            }

            this.parent.append(line);
        }
    }

    private mapClassName(className: string): string {
        switch (className) {
            case "address":
                return this.classes.address;

            case "hex":
            default:
                return this.classes.hex;

            case "ascii":
                return this.classes.ascii;

            case "ascii-unprintable":
                return this.classes.asciiUnprintable;

            case "annotation":
                return this.classes.annotation;

            case "outside-annotation":
                return this.classes.outsideAnnotation;
        }
    }
}

export function create(program: Program, div: HTMLElement): [Highlightable[], Highlightable[]] {
    sheet.attach();
    const hexdumpGenerator = new HtmlHexdumpGenerator(program.binary,
        false, program.annotations ?? [], div, sheet.classes);
    hexdumpGenerator.run();
    return [hexdumpGenerator.hexHighlightables, hexdumpGenerator.asciiHighlightables];
}
