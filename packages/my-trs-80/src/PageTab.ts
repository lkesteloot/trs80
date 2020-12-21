import {SimpleEventDispatcher} from "strongly-typed-events";

/**
 * Represents a single page tab and its contents.
 */
export class PageTab {
    public readonly name: string;
    public visible: boolean;
    public readonly element: Element;
    public readonly onShow = new SimpleEventDispatcher<void>();
    public readonly onHide = new SimpleEventDispatcher<void>();

    constructor(name: string, visible: boolean = true) {
        this.name = name;
        this.visible = visible;
        this.element = document.createElement("div");
        this.element.classList.add("tab-content");
    }
}
