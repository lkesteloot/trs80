import {Panel} from "./Panel";
import {Context} from "./Context";
import {PageTabs} from "./PageTabs";

/**
 * Panel that has page tabs.
 */
export abstract class TabbedPanel extends Panel {
    public readonly pageTabs: PageTabs;

    protected constructor(context: Context, title: string, panelCssClass: string, showBackButton: boolean) {
        super(context, title, panelCssClass, showBackButton);
        this.pageTabs = new PageTabs(this.content);
    }

    onPanelDestroy(): void {
        this.pageTabs.destroy();
        super.onPanelDestroy();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        return this.pageTabs.onKeyDown(e) || super.onKeyDown(e);
    }
}
