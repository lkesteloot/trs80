import {Trs80Screen} from "./Trs80Screen.js";

/**
 * A Trs80Screen to be displayed on a web page.
 */
export class Trs80WebScreen extends Trs80Screen {
    /**
     * Get the HTML node for this screen.
     */
    public getNode(): HTMLElement {
        throw new Error("Must be implemented");
    }
}
