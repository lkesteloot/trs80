import {SCREEN_BEGIN, SCREEN_END} from "./Utils";
import {Config} from "./Config";

/**
 * Abstract base class for displaying a screen.
 */
export class Trs80Screen {
    private expanded = false;

    /**
     * Set the config for this screen. Before this is called, the screen is permitted to use any config
     * it wants. The values are the 1024 characters of the screen, in case the screen needs to refresh itself.
     */
    public setConfig(config: Config, values: Uint8Array): void {
        throw new Error("Must be implemented");
    }

    /**
     * Write a character to the screen.
     * @param address address of the character, where 15360 is the upper-left of the screen.
     * @param value the 0-255 value to write.
     */
    public writeChar(address: number, value: number): void {
        throw new Error("Must be implemented");
    }

    /**
     * Get the HTML node for this screen.
     */
    public getNode(): HTMLElement {
        throw new Error("Must be implemented");
    }

    /**
     * Enable or disable expanded (wide) character mode.
     */
    public setExpandedCharacters(expanded: boolean): void {
        this.expanded = expanded;
    }

    /**
     * Return whether we're in expanded (wide) character mode.
     */
    public isExpandedCharacters(): boolean {
        return this.expanded;
    }

    /**
     * Fill the screen with the screenshot.
     */
    public displayScreenshot(screenshot: string): void {
        // Leave it blank if screenshot string is blank.
        if (screenshot === "") {
            return;
        }

        if (!screenshot.startsWith("0:")) {
            throw new Error("Invalid screenshot version number");
        }

        // Decode screenshot.
        const s = atob(screenshot.substring(2));
        if (s.length === 0) {
            throw new Error("Screenshot string is empty");
        }

        // Set expanded mode.
        this.setExpandedCharacters(s.charCodeAt(0) === 1);

        let address = SCREEN_BEGIN;
        for (let i = 1; i < s.length; i++) {
            const value = s.charCodeAt(i);
            let count = 1;
            if (value > 32 && value < 128) {
                // Implicit count of 1.
            } else {
                i++;
                if (i === s.length) {
                    throw new Error("Missing count in RLE");
                }
                count = s.charCodeAt(i);
            }

            // Emit "count" values.
            while (count--) {
                this.writeChar(address++, value);
            }
        }

        if (address !== SCREEN_END) {
            throw new Error("Screenshot was of the wrong length");
        }
    }
}
