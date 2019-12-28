
// Handle keyboard mapping. The TRS-80 Model III keyboard has keys in different
// places, so we must occasionally fake a Shift key being up or down when it's
// really not.

const BEGIN_ADDR = 0x3800;
const END_ADDR = BEGIN_ADDR + 256;
const KEY_DELAY_CLOCK_CYCLES = 4000;

// Whether to force a Shift key, and how.
enum ShiftState {
    NEUTRAL, FORCE_DOWN, FORCE_UP,
}

// For each ASCII character or key we keep track of how to trigger it.
class KeyInfo {
    public byteIndex: number;
    public bitNumber: number;
    public shiftForce: ShiftState;

    constructor(byteIndex: number, bitNumber: number, shiftForce: ShiftState) {
        this.byteIndex = byteIndex;
        this.bitNumber = bitNumber;
        this.shiftForce = shiftForce;
    }
}

// A queued-up key.
class KeyActivity {
    keyInfo: KeyInfo;
    isPressed: boolean;

    constructor(keyInfo: KeyInfo, isPressed: boolean) {
        this.keyInfo = keyInfo;
        this.isPressed = isPressed;
    }
}

// Map from ASCII or special key to the info of which byte and bit it's mapped
// to, and whether to force Shift.
const keyMap = new Map<string, KeyInfo>();

// http://www.trs-80.com/trs80-zaps-internals.htm#keyboard13
keyMap.set("@", new KeyInfo(0, 0, ShiftState.FORCE_UP));

keyMap.set("A", new KeyInfo(0, 1, ShiftState.FORCE_DOWN));
keyMap.set("B", new KeyInfo(0, 2, ShiftState.FORCE_DOWN));
keyMap.set("C", new KeyInfo(0, 3, ShiftState.FORCE_DOWN));
keyMap.set("D", new KeyInfo(0, 4, ShiftState.FORCE_DOWN));
keyMap.set("E", new KeyInfo(0, 5, ShiftState.FORCE_DOWN));
keyMap.set("F", new KeyInfo(0, 6, ShiftState.FORCE_DOWN));
keyMap.set("G", new KeyInfo(0, 7, ShiftState.FORCE_DOWN));
keyMap.set("H", new KeyInfo(1, 0, ShiftState.FORCE_DOWN));
keyMap.set("I", new KeyInfo(1, 1, ShiftState.FORCE_DOWN));
keyMap.set("J", new KeyInfo(1, 2, ShiftState.FORCE_DOWN));
keyMap.set("K", new KeyInfo(1, 3, ShiftState.FORCE_DOWN));
keyMap.set("L", new KeyInfo(1, 4, ShiftState.FORCE_DOWN));
keyMap.set("M", new KeyInfo(1, 5, ShiftState.FORCE_DOWN));
keyMap.set("N", new KeyInfo(1, 6, ShiftState.FORCE_DOWN));
keyMap.set("O", new KeyInfo(1, 7, ShiftState.FORCE_DOWN));
keyMap.set("P", new KeyInfo(2, 0, ShiftState.FORCE_DOWN));
keyMap.set("Q", new KeyInfo(2, 1, ShiftState.FORCE_DOWN));
keyMap.set("R", new KeyInfo(2, 2, ShiftState.FORCE_DOWN));
keyMap.set("S", new KeyInfo(2, 3, ShiftState.FORCE_DOWN));
keyMap.set("T", new KeyInfo(2, 4, ShiftState.FORCE_DOWN));
keyMap.set("U", new KeyInfo(2, 5, ShiftState.FORCE_DOWN));
keyMap.set("V", new KeyInfo(2, 6, ShiftState.FORCE_DOWN));
keyMap.set("W", new KeyInfo(2, 7, ShiftState.FORCE_DOWN));
keyMap.set("X", new KeyInfo(3, 0, ShiftState.FORCE_DOWN));
keyMap.set("Y", new KeyInfo(3, 1, ShiftState.FORCE_DOWN));
keyMap.set("Z", new KeyInfo(3, 2, ShiftState.FORCE_DOWN));

keyMap.set("a", new KeyInfo(0, 1, ShiftState.FORCE_UP));
keyMap.set("b", new KeyInfo(0, 2, ShiftState.FORCE_UP));
keyMap.set("c", new KeyInfo(0, 3, ShiftState.FORCE_UP));
keyMap.set("d", new KeyInfo(0, 4, ShiftState.FORCE_UP));
keyMap.set("e", new KeyInfo(0, 5, ShiftState.FORCE_UP));
keyMap.set("f", new KeyInfo(0, 6, ShiftState.FORCE_UP));
keyMap.set("g", new KeyInfo(0, 7, ShiftState.FORCE_UP));
keyMap.set("h", new KeyInfo(1, 0, ShiftState.FORCE_UP));
keyMap.set("i", new KeyInfo(1, 1, ShiftState.FORCE_UP));
keyMap.set("j", new KeyInfo(1, 2, ShiftState.FORCE_UP));
keyMap.set("k", new KeyInfo(1, 3, ShiftState.FORCE_UP));
keyMap.set("l", new KeyInfo(1, 4, ShiftState.FORCE_UP));
keyMap.set("m", new KeyInfo(1, 5, ShiftState.FORCE_UP));
keyMap.set("n", new KeyInfo(1, 6, ShiftState.FORCE_UP));
keyMap.set("o", new KeyInfo(1, 7, ShiftState.FORCE_UP));
keyMap.set("p", new KeyInfo(2, 0, ShiftState.FORCE_UP));
keyMap.set("q", new KeyInfo(2, 1, ShiftState.FORCE_UP));
keyMap.set("r", new KeyInfo(2, 2, ShiftState.FORCE_UP));
keyMap.set("s", new KeyInfo(2, 3, ShiftState.FORCE_UP));
keyMap.set("t", new KeyInfo(2, 4, ShiftState.FORCE_UP));
keyMap.set("u", new KeyInfo(2, 5, ShiftState.FORCE_UP));
keyMap.set("v", new KeyInfo(2, 6, ShiftState.FORCE_UP));
keyMap.set("w", new KeyInfo(2, 7, ShiftState.FORCE_UP));
keyMap.set("x", new KeyInfo(3, 0, ShiftState.FORCE_UP));
keyMap.set("y", new KeyInfo(3, 1, ShiftState.FORCE_UP));
keyMap.set("z", new KeyInfo(3, 2, ShiftState.FORCE_UP));

keyMap.set("0", new KeyInfo(4, 0, ShiftState.FORCE_UP));
keyMap.set("1", new KeyInfo(4, 1, ShiftState.FORCE_UP));
keyMap.set("2", new KeyInfo(4, 2, ShiftState.FORCE_UP));
keyMap.set("3", new KeyInfo(4, 3, ShiftState.FORCE_UP));
keyMap.set("4", new KeyInfo(4, 4, ShiftState.FORCE_UP));
keyMap.set("5", new KeyInfo(4, 5, ShiftState.FORCE_UP));
keyMap.set("6", new KeyInfo(4, 6, ShiftState.FORCE_UP));
keyMap.set("7", new KeyInfo(4, 7, ShiftState.FORCE_UP));
keyMap.set("8", new KeyInfo(5, 0, ShiftState.FORCE_UP));
keyMap.set("9", new KeyInfo(5, 1, ShiftState.FORCE_UP));

keyMap.set("`", new KeyInfo(4, 0, ShiftState.FORCE_DOWN)); // Simulate Shift-0.
keyMap.set("!", new KeyInfo(4, 1, ShiftState.FORCE_DOWN));
keyMap.set("\"", new KeyInfo(4, 2, ShiftState.FORCE_DOWN));
keyMap.set("#", new KeyInfo(4, 3, ShiftState.FORCE_DOWN));
keyMap.set("$", new KeyInfo(4, 4, ShiftState.FORCE_DOWN));
keyMap.set("%", new KeyInfo(4, 5, ShiftState.FORCE_DOWN));
keyMap.set("&", new KeyInfo(4, 6, ShiftState.FORCE_DOWN));
keyMap.set("'", new KeyInfo(4, 7, ShiftState.FORCE_DOWN));
keyMap.set("(", new KeyInfo(5, 0, ShiftState.FORCE_DOWN));
keyMap.set(")", new KeyInfo(5, 1, ShiftState.FORCE_DOWN));

keyMap.set(":", new KeyInfo(5, 2, ShiftState.FORCE_UP));
keyMap.set(";", new KeyInfo(5, 3, ShiftState.FORCE_UP));
keyMap.set(",", new KeyInfo(5, 4, ShiftState.FORCE_UP));
keyMap.set("-", new KeyInfo(5, 5, ShiftState.FORCE_UP));
keyMap.set(".", new KeyInfo(5, 6, ShiftState.FORCE_UP));
keyMap.set("/", new KeyInfo(5, 7, ShiftState.FORCE_UP));

keyMap.set("*", new KeyInfo(5, 2, ShiftState.FORCE_DOWN));
keyMap.set("+", new KeyInfo(5, 3, ShiftState.FORCE_DOWN));
keyMap.set("<", new KeyInfo(5, 4, ShiftState.FORCE_DOWN));
keyMap.set("=", new KeyInfo(5, 5, ShiftState.FORCE_DOWN));
keyMap.set(">", new KeyInfo(5, 6, ShiftState.FORCE_DOWN));
keyMap.set("?", new KeyInfo(5, 7, ShiftState.FORCE_DOWN));

keyMap.set("Enter", new KeyInfo(6, 0, ShiftState.NEUTRAL));
keyMap.set("Clear", new KeyInfo(6, 1, ShiftState.NEUTRAL));
keyMap.set("Break", new KeyInfo(6, 2, ShiftState.NEUTRAL));
keyMap.set("Up", new KeyInfo(6, 3, ShiftState.NEUTRAL));
keyMap.set("Down", new KeyInfo(6, 4, ShiftState.NEUTRAL));
keyMap.set("Left", new KeyInfo(6, 5, ShiftState.NEUTRAL));
keyMap.set("Right", new KeyInfo(6, 6, ShiftState.NEUTRAL));
keyMap.set(" ", new KeyInfo(6, 7, ShiftState.NEUTRAL));
keyMap.set("Shift", new KeyInfo(7, 0, ShiftState.NEUTRAL));

export class Keyboard {
    // 8 bytes, each a bitfield of keys currently pressed.
    private keys = new Uint8Array(8);
    private shiftForce = ShiftState.NEUTRAL;

    // We queue up keystrokes so that we don't overwhelm the ROM polling routines.
    keyQueue: KeyActivity[]  = [];
    keyProcessMinClock: number = 0;

    public static isInRange(address: number): boolean {
        return address >= BEGIN_ADDR && address < END_ADDR;
    }

    // Release all keys.
    public clearKeyboard(): void {
        this.keys.fill(0);
        this.shiftForce = ShiftState.NEUTRAL;
    }

    // Read a byte from the keyboard memory bank. This is an odd system where
    // bits in the address map to the various bytes, and you can read the OR'ed
    // addresses to read more than one byte at a time. This isn't used by the
    // ROM, I don't think. For the last byte we fake the Shift key if necessary.
    public readKeyboard(addr: number, clock: number): number {
        addr -= BEGIN_ADDR;
        let b = 0;

        // Dequeue if necessary.
        if (clock > this.keyProcessMinClock) {
            let keyWasPressed = this.processKeyQueue();
            if (keyWasPressed) {
                this.keyProcessMinClock = clock + KEY_DELAY_CLOCK_CYCLES;
            }
        }

        // OR together the various bytes.
        for (let i = 0; i < this.keys.length; i++) {
            let keys = this.keys[i];
            if ((addr & (1 << i)) !== 0) {
                if (i === 7) {
                    // Modify keys based on the shift force.
                    switch (this.shiftForce) {
                        case ShiftState.NEUTRAL:
                            // Nothing.
                            break;

                        case ShiftState.FORCE_UP:
                            // On the Model III the first two bits are left and right shift,
                            // though we don't handle the right shift anywhere.
                            keys &= ~0x03;
                            break;

                        case ShiftState.FORCE_DOWN:
                            keys |= 0x01;
                            break;
                    }
                }

                b |= keys
            }
        }

        return b;
    }

    // Enqueue a key press or release.
    public keyEvent(key: string, isPressed: boolean) {
        // Look up the key info.
        let keyInfo = keyMap.get(key);
        if (keyInfo === undefined) {
            console.log("Unknown key \"" + key + "\"");
        } else {
            // Append key to queue.
            this.keyQueue.push(new KeyActivity(keyInfo, isPressed));
        }
    }

    // Dequeue the next key and set its bit. Return whether a key was processed.
    private  processKeyQueue(): boolean {
        const keyActivity = this.keyQueue.shift();
        if (keyActivity === undefined) {
            return false;
        }

        this.shiftForce = keyActivity.keyInfo.shiftForce;
        const bit = 1 << keyActivity.keyInfo.bitNumber;
        if (keyActivity.isPressed) {
            this.keys[keyActivity.keyInfo.byteIndex] |= bit
        } else {
            this.keys[keyActivity.keyInfo.byteIndex] &= ~bit;
        }

        return true;
    }

    // Convert keys on the keyboard to ASCII letters or special strings like "Enter".
    public configureKeyboard(): void {
        // Converts a key up/down event to an ASCII character or string representing
        // key, like "Left".
        const eventToKey = (event: KeyboardEvent) => {
            let key;
            let which = event.which;
            const shifted = event.shiftKey;

            // http://www.trs-80.com/trs80-zaps-internals.htm#keyboard13
            if (which === 13) {
                // Enter.
                key = "Enter";
            } else if (which === 32) {
                // Space.
                key = " ";
            } else if (which >= 65 && which < 65+26) {
                // Letters.
                if (!shifted) {
                    // Make lower case.
                    which += 32;
                }
                key = String.fromCharCode(which);
            } else if (which === 48) {
                key = shifted ? ")" : "0";
            } else if (which === 49) {
                key = shifted ? "!" : "1";
            } else if (which === 50) {
                key = shifted ? "@" : "2";
            } else if (which === 51) {
                key = shifted ? "#" : "3";
            } else if (which === 52) {
                key = shifted ? "$" : "4";
            } else if (which === 53) {
                key = shifted ? "%" : "5";
            } else if (which === 54) {
                key = shifted ? "^" : "6";
            } else if (which === 55) {
                key = shifted ? "&" : "7";
            } else if (which === 56) {
                key = shifted ? "*" : "8";
            } else if (which === 57) {
                key = shifted ? "(" : "9";
            } else if (which === 8) {
                // Backspace.
                key = "Left"; // Left.

                // Don't go back to previous page.
                event.preventDefault();
            } else if (which === 187) {
                // Equal.
                key = shifted ? "+" : "=";
            } else if (which === 188) {
                // Comma.
                key = shifted ? "<" : ",";
            } else if (which === 190) {
                // Period.
                key = shifted ? ">" : ".";
            } else if (which == 16) {
                // Shift.
                key = "Shift";
            } else if (which == 192) {
                // Backtick.
                key = shifted ? "~" : "`";
            } else if (which == 186) {
                // Semicolon.
                key = shifted ? ":" : ";";
            } else if (which == 222) {
                // Quote..
                key = shifted ? "\"" : "'";
            } else if (which == 189) {
                // Hyphen.
                key = shifted ? "_" : "-";
            } else if (which == 191) {
                // Slash.
                key = shifted ? "?" : "/";
            } else if (which == 37) {
                // Left arrow.
                key = "Left";
            } else if (which == 39) {
                // Right arrow.
                key = "Right";
            } else if (which == 40) {
                // Down arrow.
                key = "Down";
            } else if (which == 38) {
                // Up arrow.
                key = "Up";
            } else if (which == 27) {
                // Escape.
                key = "Break";
            } else if (which == 9) {
                // Tab.
                key = "Clear";

                // Don't move focus to next field.
                event.preventDefault();
            } else {
                // Ignore.
                /// console.log(which);
                key = "";
            }

            return key
        };

        // Handle a key event by mapping it and sending it to the emulator.
        const keyEvent = (event: KeyboardEvent, isPressed: boolean) => {
            // Don't send to virtual computer if a text input field is selected.
            // if ($(document.activeElement).attr("type") == "text") {
            //     return;
            // }

            const key = eventToKey(event);
            if (key !== "") {
                this.keyEvent(key, isPressed);
                event.preventDefault();
            }
        };

        const body = document.getElementsByTagName("body")[0];
        body.addEventListener("keydown", (event) => keyEvent(event, true));
        body.addEventListener("keyup", (event) => keyEvent(event, false));
    };
}
