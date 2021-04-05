import {Highlight} from "./Highlight";
import {TapeBrowser} from "./TapeBrowser";
import {Program} from "trs80-cassette";

/**
 * Represents an item that's highlightable and maps to a part of the program's binary.
 */
export class Highlightable {
    /**
     * First byte index into the binary array of the highlight, inclusive.
     */
    public readonly firstIndex: number;
    /**
     * Last byte index into the binary array of the highlight, inclusive.
     */
    public readonly lastIndex: number;
    /**
     * HTML element representing this item.
     */
    public readonly element: HTMLElement;

    constructor(firstIndex: number, lastIndex: number, element: HTMLElement) {
        this.firstIndex = firstIndex;
        this.lastIndex = lastIndex;
        this.element = element;
    }
}

/**
 * Helper class to highlight or select elements.
 */
export class Highlighter {
    /**
     * The TapeBrowser object, for updating highlights and selections.
     */
    private readonly tapeBrowser: TapeBrowser;
    /**
     * The program that all these elements belong to. In principle they could
     * belong to more than one, but not in our current UI.
     */
    private readonly program: Program;
    /**
     * Entire container of these element, to catch clicks outside any specific element.
     */
    private readonly container: HTMLElement;
    /**
     * All elements, index by the byte index.
     */
    readonly elements: HTMLElement[] = [];
    /**
     * Currently-highlighted elements.
     */
    readonly highlightedElements: HTMLElement[] = [];
    /**
     * Currently-selected elements.
     */
    readonly selectedElements: HTMLElement[] = [];
    /**
     * The start of the selection, if we're currently selecting.
     */
    private selectionBeginIndex: number | undefined;
    /**
     * An element we should scroll to after we become visible.
     */
    private scrollToElement: HTMLElement | undefined;

    constructor(tapeBrowser: TapeBrowser, program: Program, container: HTMLElement) {
        this.tapeBrowser = tapeBrowser;
        this.program = program;
        this.container = container;

        container.addEventListener("mousedown", event => event.preventDefault());
        window.addEventListener("mouseup", event => {
            if (this.selectionBeginIndex !== undefined) {
                this.selectionBeginIndex = undefined;
                this.tapeBrowser.doneSelecting(this);
                event.preventDefault();
            }
        });
    }

    /**
     * Add the highlightable element to the highlighter.
     */
    public addHighlightable(h: Highlightable): void {
        // Allow undefined element for convenience of caller. Just ignore it.
        const element = h.element;
        if (element === undefined) {
            return;
        }

        for (let byteIndex = h.firstIndex; byteIndex <= h.lastIndex; byteIndex++) {
            this.elements[byteIndex] = element;
        }

        // Set up event listeners for highlighting.
        element.addEventListener("mouseenter", () => {
            this.tapeBrowser.setHighlight(new Highlight(this.program, h.firstIndex, h.lastIndex));
            if (this.selectionBeginIndex !== undefined) {
                const highlight = h.firstIndex <= this.selectionBeginIndex && this.selectionBeginIndex <= h.lastIndex
                    ? new Highlight(this.program, h.firstIndex, h.lastIndex)
                    : this.selectionBeginIndex < h.firstIndex
                        ? new Highlight(this.program, this.selectionBeginIndex, h.lastIndex)
                        : new Highlight(this.program, h.firstIndex, this.selectionBeginIndex);
                this.tapeBrowser.setSelection(highlight);
            }
        });
        element.addEventListener("mouseleave", () => {
            if (this.selectionBeginIndex === undefined) {
                this.tapeBrowser.setHighlight(undefined)
            }
        });

        // Set up event listeners for selecting.
        element.addEventListener("mousedown", event => {
            this.tapeBrowser.setSelection(new Highlight(this.program, h.firstIndex, h.lastIndex));
            // This isn't right, it depends on which way they'll select. Might have to fix later.
            this.selectionBeginIndex = h.firstIndex;
            event.preventDefault();
        });
    }

    /**
     * Add all highlightables to the highlighter.
     */
    public addHighlightables(highlightables: Highlightable[]): void {
        for (const highlightable of highlightables) {
            this.addHighlightable(highlightable);
        }
    }

    /**
     * Highlight the specified elements.
     */
    public highlight(highlight: Highlight | undefined, program: Program, highlightClassName: string): void {
        for (const e of this.highlightedElements) {
            e.classList.remove(highlightClassName);
        }
        this.highlightedElements.splice(0);
        if (highlight !== undefined && highlight.program === program) {
            const e = this.elements[highlight.firstIndex];
            if (e !== undefined) {
                e.classList.add(highlightClassName);
                this.highlightedElements.push(e);
            }
        }
    }

    /**
     * Select the specified elements.
     */
    public select(highlight: Highlight | undefined, program: Program, selectClassName: string): void {
        for (const e of this.selectedElements) {
            e.classList.remove(selectClassName);
        }
        this.selectedElements.splice(0);
        if (highlight !== undefined && highlight.program === program) {
            for (let byteIndex = highlight.firstIndex; byteIndex <= highlight.lastIndex; byteIndex++) {
                const e = this.elements[byteIndex];
                if (e !== undefined) {
                    e.classList.add(selectClassName);
                    this.selectedElements.push(e);
                }
            }
        }
    }

    /**
     * Called when the user is done selecting and we should scroll to the selection.
     */
    public doneSelecting(): void {
        // Bring the middle element into view.
        if (this.selectedElements.length > 0) {
            const midElement = this.selectedElements[Math.floor(this.selectedElements.length / 2)];
            if (midElement.offsetHeight === 0) {
                // Not visible, do this later.
                this.scrollToElement = midElement;
            } else {
                midElement.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }
    }

    /**
     * This set of elements was just shown.
     */
    public didShow(): void {
        if (this.scrollToElement !== undefined) {
            this.scrollToElement.scrollIntoView({
                behavior: "auto",
                block: "center",
            });
            this.scrollToElement = undefined;
        }
    }
}
