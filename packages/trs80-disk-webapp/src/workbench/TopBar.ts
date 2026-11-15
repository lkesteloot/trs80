import type {OpenDisk} from "../core/OpenDisk.js";
import {el} from "../core/Dom.js";

/**
 * What the top bar asks of the page.
 */
export interface TopBarHost {
    /** Show a disk. */
    selectDisk(disk: OpenDisk): void;
    /** Close a disk, after asking if it has unsaved changes. */
    closeDisk(disk: OpenDisk): void;
    /** Show the start screen, where the user opens or makes a disk. */
    showStart(): void;
    /** Undo the current disk's latest change. */
    undo(): void;
    /** Redo the current disk's latest undone change. */
    redo(): void;
}

/**
 * The top bar: a tab for each open disk (with a dot when it has unsaved changes, and a close button), a last tab
 * for the start screen, where the user opens or makes a disk, and undo and redo for the current disk. The theme button and the link to Disk Commander
 * are static HTML.
 */
export class TopBar {
    private readonly tabs = document.getElementById("tabs") as HTMLElement;
    private readonly undoButton = document.getElementById("undoBtn") as HTMLButtonElement;
    private readonly redoButton = document.getElementById("redoBtn") as HTMLButtonElement;

    /**
     * Wire up the static buttons.
     *
     * @param host the page.
     */
    constructor(host: TopBarHost) {
        this.host = host;
        this.undoButton.addEventListener("click", () => host.undo());
        this.redoButton.addEventListener("click", () => host.redo());
    }

    private readonly host: TopBarHost;

    /**
     * Redraw the tabs and the undo and redo buttons.
     *
     * @param disks the open disks.
     * @param current the disk on show, or undefined if the page shows the start screen.
     */
    public render(disks: OpenDisk[], current: OpenDisk | undefined): void {
        this.tabs.replaceChildren(...disks.map(disk => this.makeTab(disk, disk === current)), this.makeStartTab(current === undefined));

        const history = current?.session.getHistory();
        const undoLabel = history !== undefined && history.position > 0 ? history.entries[history.position - 1] : undefined;
        const redoLabel = history !== undefined && history.position < history.entries.length ?
            history.entries[history.position] : undefined;
        this.undoButton.disabled = undoLabel === undefined;
        this.undoButton.title = undoLabel === undefined ? "Nothing to undo" : "Undo: " + undoLabel + " (Ctrl-Z)";
        this.redoButton.disabled = redoLabel === undefined;
        this.redoButton.title = redoLabel === undefined ? "Nothing to redo" : "Redo: " + redoLabel + " (Shift-Ctrl-Z)";
    }

    /**
     * Make the last tab, which shows the start screen.
     *
     * @param active whether the start screen is on show.
     */
    private makeStartTab(active: boolean): HTMLElement {
        const label = el("button", "tablabel", "＋ Open or New");
        label.type = "button";
        label.title = "Open a disk image, or make a new disk";
        label.addEventListener("click", () => this.host.showStart());
        return el("div", "tab opentab" + (active ? " active" : ""), label);
    }

    /**
     * Make one disk's tab.
     */
    private makeTab(disk: OpenDisk, active: boolean): HTMLElement {
        const dirty = disk.session.hasChanges();
        const label = el("button", "tablabel", disk.name, el("span", "dot"));
        label.type = "button";
        label.title = dirty ? "Unsaved changes" : "Saved";
        label.addEventListener("click", () => this.host.selectDisk(disk));

        const close = el("button", "tabclose", "×");
        close.type = "button";
        close.title = "Close " + disk.name;
        close.setAttribute("aria-label", "Close " + disk.name);
        close.addEventListener("click", () => this.host.closeDisk(disk));

        return el("div", "tab" + (active ? " active" : "") + (dirty ? " dirty" : ""), label, close);
    }
}
