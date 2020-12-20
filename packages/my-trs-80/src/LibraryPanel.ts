
import {Panel} from "./Panel";
import {Context} from "./Context";
import {PageTabs} from "./PageTabs";
import {YourFilesTab} from "./YourFilesTab";
import {RetroStoreTab} from "./RetroStoreTab";

/**
 * Panel showing the library of user's files.
 */
export class LibraryPanel extends Panel {
    constructor(context: Context) {
        super(context, "Library", "library-panel", false);

        const pageTabs = new PageTabs(this.content);
        new YourFilesTab(pageTabs, context);
        new RetroStoreTab(pageTabs, context);
    }
}
