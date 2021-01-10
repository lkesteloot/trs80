import {Panel} from "./Panel";
import {File} from "./File";
import {Context} from "./Context";
import {PageTabs} from "./PageTabs";
import {decodeTrs80File} from "trs80-base";
import {HexdumpTab} from "./HexdumpTab";
import {FileInfoTab} from "./FileInfoTab";
import {IFilePanel} from "./IFilePanel";

/**
 * Panel to explore a file.
 */
export class FilePanel extends Panel implements IFilePanel {
    public file: File;

    constructor(context: Context, file: File) {
        super(context, file.name, "file-panel", true);

        this.file = file;
        const trs80File = decodeTrs80File(file.binary, file.filename);

        const pageTabs = new PageTabs(this.content);
        new FileInfoTab(this, pageTabs, trs80File);
        new HexdumpTab(this.context, pageTabs, trs80File);
    }

    setHeaderText(header: string): void {
        this.headerTextNode.innerText = header;
    }
}
