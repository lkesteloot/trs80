import {Keyboard} from "trs80-emulator";

export class WebKeyboard extends Keyboard {
    // Convert keys on the keyboard to ASCII letters or special strings like "Enter".
    public configureKeyboard(): void {
        // Handle a key event by mapping it and sending it to the emulator.
        const keyEvent = (event: KeyboardEvent, isPressed: boolean) => {
            // Don't do anything if we're not active.
            if (!this.interceptKeys) {
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

            const key = event.key;
            if (key !== "") {
                this.keyEvent(key, isPressed);
                event.preventDefault();
            }
        };

        const body = document.getElementsByTagName("body")[0];
        body.addEventListener("keydown", (event) => keyEvent(event, true));
        body.addEventListener("keyup", (event) => keyEvent(event, false));
        body.addEventListener("paste", (event) => {
            // Don't do anything if we're not active.
            if (!this.interceptKeys) {
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
}
