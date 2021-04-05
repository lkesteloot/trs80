
import {Context} from "./Context";
import {YourFilesTab} from "./YourFilesTab";
import {RetroStoreTab} from "./RetroStoreTab";
import {TabbedPanel} from "./TabbedPanel";

/**
 * Panel showing the library of user's files.
 */
export class LibraryPanel extends TabbedPanel {
    constructor(context: Context) {
        super(context, "Library", "library-panel", false);

        this.pageTabs.addTab(new YourFilesTab(context, this.pageTabs));
        this.pageTabs.addTab(new RetroStoreTab(context));
    }
}
