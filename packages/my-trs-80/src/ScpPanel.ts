
import {Context} from "./Context";
import {TabbedPanel} from "./TabbedPanel";
import {decodeScpFloppyDisk} from "trs80-base";
import {ScpTab} from "./ScpTab";

/**
 * Panel to explore and import an SCP file.
 */
export class ScpPanel extends TabbedPanel {
    public name: string;
    public filename: string;
    public bytes: Uint8Array;

    constructor(context: Context, name: string, filename: string, bytes: Uint8Array) {
        super(context, name, "scp-panel", true);

        this.name = name;
        this.filename = filename;
        this.bytes = bytes;

        const scpFile = decodeScpFloppyDisk(bytes);
        if (scpFile === undefined) {
            // TODO probably move this into caller so a UI can be displayed in one place.
            throw new Error("Can't decode SCP file");
        }

        this.pageTabs.addTab(new ScpTab(scpFile));
    }
}
