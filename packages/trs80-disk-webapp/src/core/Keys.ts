import {redo, undo} from "./Actions.js";
import type {OpenDisk} from "./OpenDisk.js";

/**
 * Whether the event happened while the user was typing in a text field, where Cmd/Ctrl-Z belongs to the field.
 */
function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || target.isContentEditable;
}

/**
 * Make Cmd/Ctrl-Z undo, and Shift-Cmd/Ctrl-Z redo, on the disk that's on screen. Nothing happens while the user is
 * typing in an input or textarea.
 *
 * @param getCurrentDisk gives the disk on screen (the current tab's, or the active panel's), or undefined.
 * @returns a function that removes the shortcuts.
 */
export function installUndoKeys(getCurrentDisk: () => OpenDisk | undefined): () => void {
    const handler = (event: KeyboardEvent): void => {
        const isShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z";
        if (!isShortcut || isTypingTarget(event.target)) {
            return;
        }

        const disk = getCurrentDisk();
        if (disk === undefined) {
            return;
        }

        event.preventDefault();
        if (event.shiftKey) {
            redo(disk.session);
        } else {
            undo(disk.session);
        }
    };
    document.addEventListener("keydown", handler);

    return () => document.removeEventListener("keydown", handler);
}
