import {SimpleEventDispatcher} from "strongly-typed-events";

/**
 * Represents a single page tab and its contents.
 */
export class PageTab {
    public name: string;
    public readonly element: Element;
    public readonly onShow = new SimpleEventDispatcher<void>();
    public readonly onHide = new SimpleEventDispatcher<void>();

    constructor(name: string) {
        this.name = name;
        this.element = document.createElement("div");
        this.element.classList.add("tab-content");
    }
}
