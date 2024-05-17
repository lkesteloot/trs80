import {CanvasScreen} from "trs80-emulator-web";

// Async callback to the caller with the screen they can use. They must use the
// screen only during the (async) lifetime of the callback.
type Callback = (canvasScreen: CanvasScreen) => Promise<void>;

// Record all the people waiting for a screen of a particular size.
interface Waiter {
    // How to call them with the screen, when it's available.
    callback: Callback;

    // How to resolve them once they're done with the screen.
    resolve: () => void;
}

// Record the screen and the queue of people waiting for it.
class ScreenPoolEntry {
    public readonly canvasScreen: CanvasScreen;
    public readonly waiters: Waiter[] = [];
    public used = false;

    constructor(canvasScreen: CanvasScreen) {
        this.canvasScreen = canvasScreen;
    }

    // Give the screen to the next person waiting, if any.
    public dispatch(): void {
        if (!this.used) {
            const waiter = this.waiters.shift();
            if (waiter !== undefined) {
                this.used = true;
                waiter.callback(this.canvasScreen)
                    .finally(() => {
                        this.used = false;
                        this.dispatch();
                        waiter.resolve();
                    });
            }
        }
    }
}

// Map from scale to entry.
const gPool = new Map<number,ScreenPoolEntry>();

/**
 * Given a scale, requests a canvas screen to be given to the callback. This will always
 * be done synchronously (before the promise is resolved). The screen must be used
 * entirely within the lifetime of the callback.
 */
export function withCanvasScreen(scale: number, callback: Callback): Promise<void> {
    return new Promise<void>(resolve => {
        let entry = gPool.get(scale);
        if (entry === undefined) {
            entry = new ScreenPoolEntry(new CanvasScreen(scale));
            gPool.set(scale, entry);
        }

        entry.waiters.push({callback, resolve});
        entry.dispatch();
    });
}
