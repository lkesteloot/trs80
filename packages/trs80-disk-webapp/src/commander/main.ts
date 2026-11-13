import {initTheme} from "../theme.js";

/** Text of the F1 help dialog. */
const HELP_TEXT =
    "Disk Commander shows a folder on your computer and a disk image side by side; a disk image opens like a folder. " +
    "Arrows move, Tab switches panels, Space or Insert marks files, Enter opens, Backspace goes back up. " +
    "F5 copies the marked files to the other panel: from your computer to a disk is add, from a disk to your computer is extract, and disk to disk is both. " +
    "F9 switches the other panel between files, quick view, info and the map. Anything you type goes to the command line, which runs trs80-tool's disk commands on the current disk. " +
    "Changes stay in memory until Ctrl-S; Ctrl-Z and F10 undo, per disk.";

/**
 * Close the modal layer, if open.
 */
function closeDialog(): void {
    const layer = document.getElementById("layer");
    if (layer !== null) {
        layer.replaceChildren();
    }
}

/**
 * Show a dialog with a title, a message, and an OK button. Escape, Enter, or a click outside closes it.
 */
function showAlert(title: string, text: string): void {
    const layer = document.getElementById("layer");
    if (layer === null) {
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const dialog = document.createElement("div");
    dialog.className = "dlg";
    dialog.setAttribute("role", "dialog");

    const heading = document.createElement("h2");
    heading.textContent = title;
    dialog.append(heading);

    const body = document.createElement("div");
    body.style.maxWidth = "60ch";
    body.style.whiteSpace = "normal";
    body.textContent = text;
    dialog.append(body);

    const buttons = document.createElement("div");
    buttons.className = "btns";
    const ok = document.createElement("button");
    ok.className = "def";
    ok.textContent = "OK";
    ok.addEventListener("click", closeDialog);
    buttons.append(ok);
    dialog.append(buttons);

    overlay.append(dialog);
    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            closeDialog();
        }
    });
    layer.replaceChildren(overlay);
    ok.focus();
}

/**
 * Whether a dialog is currently open.
 */
function isDialogOpen(): boolean {
    const layer = document.getElementById("layer");
    return layer !== null && layer.childElementCount > 0;
}

/**
 * Wire up the static page.
 */
function main(): void {
    initTheme("commander-theme", "themeBtn");
    document.querySelector("[data-fk=\"1\"]")?.addEventListener("click", () => showAlert("Help", HELP_TEXT));
    document.addEventListener("keydown", event => {
        if (event.key === "F1") {
            event.preventDefault();
            showAlert("Help", HELP_TEXT);
        } else if (event.key === "Escape" && isDialogOpen()) {
            closeDialog();
        }
    });
}

main();
