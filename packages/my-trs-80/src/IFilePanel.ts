import {Context} from "./Context";
import {File} from "./File";
import {Panel} from "./Panel";

/**
 * Whether any file panel (starting with given and going backward) satisfies the given predicate.
 */
export function anyFilePanel(panel: IFilePanel | undefined, predicate: (panel: IFilePanel) => boolean): boolean {
    return panel !== undefined && (predicate(panel) || anyFilePanel(panel.nextFilePanel, predicate));
}

/**
 * Interface for accessing a file panel's info.
 */
export interface IFilePanel {
    context: Context;
    file: File;
    nextFilePanel: IFilePanel | undefined;

    /**
     * Set the header of the panel (the name of the file).
     */
    setHeaderText(header: string): void;
}
