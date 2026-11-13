import type {OpenDisk} from "../core/OpenDisk.js";
import {el, makeButton} from "../core/Dom.js";
import {formatCommandLine} from "trs80-disk";

/**
 * What the History view asks of the page.
 */
export interface HistoryViewHost {
    /** Undo the latest change. */
    undo(): void;
    /** Redo the change that was last undone. */
    redo(): void;
    /** Put the disk back as it was when last saved. */
    revert(): void;
    /**
     * Undo or redo until a number of entries are applied.
     *
     * @param position the number of entries to have applied, from 0 to the history's length.
     */
    goTo(position: number): void;
}

/**
 * The History view: the undo and redo history as a list, newest first, with each change's command line. The latest
 * applied change is marked, the changes that were undone are dimmed (and a click on one redoes up to it), and the
 * point that was last saved is labeled. The bottom row is the disk as it was opened, which a click goes back to.
 */
export class HistoryView {
    /** The view's root element, which the page puts in its main pane. */
    public readonly element = el("div", "historyview");

    private readonly host: HistoryViewHost;

    /**
     * @param host the page.
     */
    constructor(host: HistoryViewHost) {
        this.host = host;
    }

    /**
     * Draw the history of a disk.
     *
     * @param disk the disk.
     */
    public render(disk: OpenDisk): void {
        const session = disk.session;
        const history = session.getHistory();
        const length = history.entries.length;

        const undo = makeButton("↶ Undo", () => this.host.undo());
        undo.disabled = history.position === 0;
        const redo = makeButton("↷ Redo", () => this.host.redo());
        redo.disabled = history.position >= length;
        const revert = makeButton("Revert to saved", () => this.host.revert());
        const hasChanges = session.hasChanges();
        revert.disabled = !hasChanges;
        revert.title = hasChanges ? "Put the disk back as it was when last saved. Undo takes this back." :
            "The disk is as it was when last saved.";
        const bar = el("div", "actionbar", undo, redo, revert, el("span", "grow"),
            el("span", "hint", "Click a row to go to it. Nothing is written until you save."));

        const list = el("ul", "history");
        // Newest first: the entries from the last to the first, then the disk as opened.
        for (let index = length - 1; index >= -1; index--) {
            list.append(this.makeRow(disk, index, history));
        }
        const card = el("div", "card", list);
        card.style.padding = "0";
        this.element.replaceChildren(bar, card);
    }

    /**
     * Make the row of one entry.
     *
     * @param disk the disk.
     * @param index the entry's index in the history, or -1 for the disk as it was opened.
     * @param history the history.
     */
    private makeRow(disk: OpenDisk, index: number, history: {entries: string[], position: number,
                    savedPosition: number | undefined}): HTMLElement {

        // The number of entries that are applied when the disk is as this row leaves it.
        const position = index + 1;
        const isCurrent = position === history.position;
        const isUndone = position > history.position;
        const label = index < 0 ? "Opened" : history.entries[index];

        const text = el("div", "", el("span", "", label));
        if (position === history.savedPosition) {
            text.append(el("span", "saved", "saved"));
        }
        if (index >= 0) {
            text.append(el("br"), el("code", "", formatCommandLine(["trs80-tool", "disk", disk.name]) + " " + label));
        }

        const row = el("li", (isCurrent ? "current " : "") + (isUndone ? "future" : ""), el("span", "mark", isCurrent ? "●" : ""),
            text, el("span", "kind", isUndone ? "undone" : ""));
        row.title = isCurrent ? "The disk is here." : isUndone ? "Redo up to this change." : "Go back to here.";
        row.addEventListener("click", () => {
            if (!isCurrent) {
                this.host.goTo(position);
            }
        });
        return row;
    }
}
