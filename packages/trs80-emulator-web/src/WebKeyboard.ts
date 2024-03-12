import {Keyboard} from "trs80-emulator";

// Web-based emulator keyboard.
export class WebKeyboard extends Keyboard {
    private interceptKeys: () => boolean = () => true;

    // Convert keys on the keyboard to ASCII letters or special strings like "Enter".
    public configureKeyboard(): void {
        // Handle a key event by mapping it and sending it to the emulator.
        const keyEvent = (event: KeyboardEvent, isPressed: boolean) => {
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
                this.keyEvent(key, isPressed);
                event.preventDefault();
            }
        };

        const body = document.querySelector("body") as HTMLBodyElement;
        body.addEventListener("keydown", event => keyEvent(event, true));
        body.addEventListener("keyup", event => keyEvent(event, false));
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
