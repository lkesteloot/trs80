import {Keyboard} from "trs80-emulator";

// Web-based emulator keyboard.
export class WebKeyboard extends Keyboard {
    private interceptKeys: () => boolean = () => true;

    // Keys we've sent as pressed and not yet as released, from KeyboardEvent.code to KeyboardEvent.key.
    // The key can change between press and release (e.g., Shift is released first), so we remember
    // what we sent.
    private readonly heldKeys = new Map<string,string>();

    // Convert keys on the keyboard to ASCII letters or special strings like "Enter".
    public configureKeyboard(): void {
        // Handle a key press by mapping it and sending it to the emulator.
        const keyDownEvent = (event: KeyboardEvent) => {
            // Don't do anything if we're not active.
            if (!this.shouldInterceptKeys()) {
                return;
            }

            // Don't send to virtual computer if a text input field is selected.
            // if ($(document.activeElement).attr("type") === "text") {
            //     return;
            // }

            // Don't interfere with browser keys.
            if (event.metaKey || event.ctrlKey) {
                return;
            }

            // Don't submit auto-repeat keys, let emulator repeat if necessary.
            if (event.repeat) {
                return;
            }

            const key = event.key;
            if (key !== "") {
                this.keyEvent(key, true);
                this.heldKeys.set(event.code, key);
                event.preventDefault();
            }
        };

        // Handle a key release. This releases any key we've sent as pressed, even if we wouldn't
        // accept a new press now (a modifier is held or focus has moved), so that keys can't get stuck.
        const keyUpEvent = (event: KeyboardEvent) => {
            const key = this.heldKeys.get(event.code);
            if (key === undefined) {
                // We didn't send the press (or have already released it).
                return;
            }

            this.heldKeys.delete(event.code);
            this.keyEvent(key, false);
            if (this.shouldInterceptKeys()) {
                event.preventDefault();
            }
        };

        const body = document.querySelector("body") as HTMLBodyElement;
        body.addEventListener("keydown", keyDownEvent);
        body.addEventListener("keyup", keyUpEvent);
        // We won't see the key releases while we're not focused, so release everything. Keep
        // the queue, which may hold the rest of a paste.
        window.addEventListener("blur", () => {
            this.heldKeys.clear();
            this.clearKeyboard();
        });
        body.addEventListener("paste", event => {
            // Don't do anything if we're not active.
            if (!this.shouldInterceptKeys()) {
                return;
            }

            if (event.clipboardData) {
                const pastedText = event.clipboardData.getData("text/plain");
                if (pastedText) {
                    this.simulateKeyboardText(pastedText);
                }
            }
            event.preventDefault();
        });
    }

    /**
     * Add a new function that can determine whether to intercept keys. Will be
     * called after the existing function.
     */
    public addInterceptKeys(interceptKeys: () => boolean): void {
        const oldInterceptKeys = this.interceptKeys;
        this.interceptKeys = () => oldInterceptKeys() && interceptKeys();
    }

    // Whether we should intercept browser keys.
    private shouldInterceptKeys(): boolean {
        return this.emulatorStarted && this.interceptKeys();
    }
}
