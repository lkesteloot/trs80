import {makeCloseIconButton, makeIcon, makeIconButton} from "./Utils";
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
        super(context);

        this.element.classList.add("library-panel");

        const header = document.createElement("h1");
        const headerTextNode = document.createElement("span");
        headerTextNode.innerText = "Library";
        header.append(headerTextNode);
        header.append(makeCloseIconButton(() => this.context.panelManager.close()));
        this.element.append(header);

        const content = document.createElement("div");
        content.classList.add("panel-content");
        this.element.append(content);

        const pageTabs = new PageTabs(content);
        new RetroStoreTab(pageTabs, context);
        new YourFilesTab(pageTabs, context);
    }
}
