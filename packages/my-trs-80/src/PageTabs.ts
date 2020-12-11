import {PageTab} from "./PageTab";
import {clearElement} from "teamten-ts-utils";

export class PageTabs {
    private readonly containerElement: Element;
    private readonly tabElement: HTMLElement;
    private readonly tabs: PageTab[] = [];
    private activeIndex = 0;

    constructor(element: Element) {
        this.containerElement = element;
        this.containerElement.classList.add("page-tabs-container");

        // Where we draw the page tabs themselves.
        this.tabElement = document.createElement("div");
        this.tabElement.classList.add("page-tabs");
        this.containerElement.append(this.tabElement);
        this.recreateTabs();
    }

    public newTab(name: string): PageTab {
        const tab = new PageTab(name);
        this.tabs.push(tab);
        this.containerElement.append(tab.element);
        this.recreateTabs();
        return tab;
    }

    private recreateTabs(): void {
        clearElement(this.tabElement);

        for (let index = 0; index < this.tabs.length; index++) {
            const tab = this.tabs[index];
            const tabDiv = document.createElement("div");
            tabDiv.innerText = tab.name;
            tabDiv.classList.toggle("page-tab-active", index === this.activeIndex);
            tabDiv.addEventListener("click", () => {
                this.setActiveTab(index);
            });

            this.tabElement.append(tabDiv);
        }
    }

    private setActiveTab(activeIndex: number): void {
        console.log(activeIndex);
        this.activeIndex = activeIndex;
        this.recreateTabs();

        for (let index = 0; index < this.tabs.length; index++) {
            const tab = this.tabs[index];
            tab.element.classList.toggle("hidden", index !== this.activeIndex);
        }
    }
}
