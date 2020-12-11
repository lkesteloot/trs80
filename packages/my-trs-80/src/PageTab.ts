

export class PageTab {
    public name: string;
    public readonly element: Element;

    constructor(name: string) {
        this.name = name;
        this.element = document.createElement("div");
        this.element.classList.add("tab-content");
    }
}
