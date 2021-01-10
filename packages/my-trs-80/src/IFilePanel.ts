import {Context} from "./Context";
import {File} from "./File";

export interface IFilePanel {
    context: Context;
    file: File;

    /**
     * Set the header of the panel (the name of the file).
     */
    setHeaderText(header: string): void;
}
