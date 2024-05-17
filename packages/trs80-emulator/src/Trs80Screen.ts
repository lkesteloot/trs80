import {Config} from "./Config.js";
import {TRS80_SCREEN_BEGIN, TRS80_SCREEN_END} from "trs80-base";

/**
 * Abstract base class for displaying a screen.
 */
export class Trs80Screen {
    private expanded = false;
    private alternate = false;

    /**
     * Set the config for this screen. Before this is called, the screen is permitted to use any config
     * it wants.
     */
    public setConfig(config: Config): void {
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
     * Enable or disable alternate (Katakana) character mode.
     */
    public setAlternateCharacters(alternate: boolean): void {
        this.alternate = alternate;
    }

    /**
     * Return whether we're in alternate (Katakana) character mode.
     */
    public isAlternateCharacters(): boolean {
        return this.alternate;
    }

    /**
     * Fill the screen with the screenshot.
     */
    public displayScreenshot(screenshot: string): void {
        // Make it blank if screenshot string is blank.
        if (screenshot === "") {
            for (let address = TRS80_SCREEN_BEGIN; address < TRS80_SCREEN_END; address++) {
                this.writeChar(address, 32);
            }
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

        let address = TRS80_SCREEN_BEGIN;
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

        if (address !== TRS80_SCREEN_END) {
            throw new Error("Screenshot was of the wrong length");
        }
    }
}
