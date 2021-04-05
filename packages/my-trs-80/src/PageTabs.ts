import {PageTab} from "./PageTab";
import {clearElement} from "teamten-ts-utils";

/**
 * Set of page tabs.
 */
export class PageTabs {
    private readonly containerElement: Element;
    private readonly tabElement: HTMLElement;
    private readonly tabs: PageTab[] = [];
    // The tab last selected by the user.
    private activeIndex = 0;
    // Same as activeIndex, unless it's not visible, in which case some other
    // visible tab, or undefined if no tab is visible.
    private effectiveActiveIndex: number | undefined = undefined;

    constructor(element: Element) {
        this.containerElement = element;
        this.containerElement.classList.add("page-tabs-container");

        // Where we draw the page tabs themselves.
        this.tabElement = document.createElement("div");
        this.tabElement.classList.add("page-tabs");
        this.containerElement.append(this.tabElement);
    }

    /**
     * Add a new tab. Be sure it's fully configured, because its onShow
     * listener might be called synchronously.
     */
    public addTab(tab: PageTab): void {
        this.tabs.push(tab);
        this.containerElement.append(tab.element);
        this.configurationChanged();
    }

    /**
     * The panel these page tabs are on is being destroyed.
     */
    public destroy(): void {
        for (const tab of this.tabs) {
            tab.onDestroy();
        }
    }

    /**
     * Switch the active tab.
     */
    private setActiveTab(activeIndex: number): void {
        if (activeIndex !== this.activeIndex) {
            this.activeIndex = activeIndex;
            this.configurationChanged();
        }
    }

    /**
     * Called when a key is pressed and this panel is visible.
     * @param e the keyboard event for the key down event.
     * @return whether the method handled the key.
     */
    public onKeyDown(e: KeyboardEvent): boolean {
        return this.effectiveActiveIndex !== undefined && this.tabs[this.effectiveActiveIndex].onKeyDown(e);
    }

    /**
     * Update all tabs given a new configuration.
     */
    public configurationChanged(): void {
        const oldEffectiveActiveIndex = this.effectiveActiveIndex;
        this.computeEffectiveActiveIndex();
        if (oldEffectiveActiveIndex !== this.effectiveActiveIndex) {
            if (oldEffectiveActiveIndex !== undefined) {
                this.tabs[oldEffectiveActiveIndex].onHide();
            }
            if (this.effectiveActiveIndex !== undefined) {
                this.tabs[this.effectiveActiveIndex].onShow();
            }
        }

        this.recreateTabs();
        this.updateTabContentVisibility();
    }

    /**
     * Get the current active index. If it's hidden, return another one. If none
     * exist, return undefined.
     */
    private computeEffectiveActiveIndex(): void {
        this.effectiveActiveIndex = this.activeIndex;

        // If the active tab is hidden, find another one.
        if (this.effectiveActiveIndex >= this.tabs.length || !this.tabs[this.effectiveActiveIndex].visible) {
            // Pick any.
            this.effectiveActiveIndex = undefined;
            for (let i = 0; i < this.tabs.length; i++) {
                if (this.tabs[i].visible) {
                    this.effectiveActiveIndex = i;
                    break;
                }
            }
        }
    }

    /**
     * Recreate the set of page tabs (the UI).
     */
    private recreateTabs(): void {
        clearElement(this.tabElement);

        for (let index = 0; index < this.tabs.length; index++) {
            const tab = this.tabs[index];
            if (tab.visible) {
                const tabDiv = document.createElement("div");
                tabDiv.innerText = tab.name;
                tabDiv.classList.toggle("page-tab-active", index === this.effectiveActiveIndex);
                tabDiv.addEventListener("click", () => {
                    this.setActiveTab(index);
                });

                this.tabElement.append(tabDiv);
            }
        }
    }

    /**
     * Update which tab contents are visible based on which is selected.
     */
    private updateTabContentVisibility(): void {
        for (let index = 0; index < this.tabs.length; index++) {
            this.tabs[index].element.classList.toggle("hidden", index !== this.effectiveActiveIndex);
        }
    }
}
