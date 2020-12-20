import {PageTab} from "./PageTab";
import {clearElement} from "teamten-ts-utils";

/**
 * Set of page tabs.
 */
export class PageTabs {
    private readonly containerElement: Element;
    private readonly tabElement: HTMLElement;
    private readonly tabs: PageTab[] = [];
    private activeIndex: number | undefined = undefined;

    constructor(element: Element) {
        this.containerElement = element;
        this.containerElement.classList.add("page-tabs-container");

        // Where we draw the page tabs themselves.
        this.tabElement = document.createElement("div");
        this.tabElement.classList.add("page-tabs");
        this.containerElement.append(this.tabElement);
    }

    /**
     * Create a new tab.
     */
    public newTab(name: string): PageTab {
        const tab = new PageTab(name);
        this.tabs.push(tab);
        this.containerElement.append(tab.element);
        this.setActiveTab(this.activeIndex ?? 0);
        return tab;
    }

    /**
     * Recreate the set of page tabs (the UI).
     */
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

    /**
     * Switch the active tab.
     */
    private setActiveTab(activeIndex: number): void {
        if (this.activeIndex !== undefined) {
            this.tabs[this.activeIndex].onHide.dispatch();
        }

        this.activeIndex = activeIndex;
        this.recreateTabs();

        for (let index = 0; index < this.tabs.length; index++) {
            this.tabs[index].element.classList.toggle("hidden", index !== this.activeIndex);
        }

        this.tabs[this.activeIndex].onShow.dispatch();
    }
}
