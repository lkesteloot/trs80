import {assertNever} from "z80-base";
import {formatNumber, el, formatKilobytes} from "../core/Dom.js";
import {getDiskFacts} from "../core/DiskFacts.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {attributeText, attributeTitle, type DiskFileItem, type HostFileItem, isMarkable, type Item, ItemKind} from "./Items.js";

// One of the commander's two panels: what it shows, its cursor and marks, and how it draws its file list.

/**
 * What a panel shows when it isn't a file list of its own: F9 cycles the other panel through these.
 */
export enum PanelMode {
    /** The panel's own file list. */
    FILES,
    /** A quick view of the file under the other panel's cursor. */
    QUICK,
    /** The other panel's disk: its facts, what check finds, and the undo history. */
    INFO,
    /** The other panel's disk drawn as a map. */
    MAP,
}

/**
 * The name of a panel mode, for the panel's title and the message area.
 */
export function panelModeToString(mode: PanelMode): string {
    switch (mode) {
        case PanelMode.FILES:
            return "files";
        case PanelMode.QUICK:
            return "quick view";
        case PanelMode.INFO:
            return "info";
        case PanelMode.MAP:
            return "map";
        default:
            assertNever(mode);
    }
}

/**
 * The mode that F9 changes a panel to.
 *
 * @param mode the current mode.
 */
export function nextPanelMode(mode: PanelMode): PanelMode {
    switch (mode) {
        case PanelMode.FILES:
            return PanelMode.QUICK;
        case PanelMode.QUICK:
            return PanelMode.INFO;
        case PanelMode.INFO:
            return PanelMode.MAP;
        case PanelMode.MAP:
            return PanelMode.FILES;
        default:
            assertNever(mode);
    }
}

/**
 * Where on the user's computer a panel is.
 */
export enum HostKind {
    /** A folder that the user chose, and the subfolders below it. */
    FOLDER,
    /** The files that were dropped or chosen with a file input, in a list of their own. */
    YOUR_FILES,
    /** A ZIP file that held several files, which the panel shows as a folder. */
    ARCHIVE,
}

/**
 * A ZIP file that a panel shows as a folder, named after the ZIP.
 */
export interface ArchiveHost {
    kind: HostKind.ARCHIVE;
    /** A number that no other archive of this page load has, which tells their disks apart. */
    id: number;
    /** The ZIP's file name, which is the folder's name. */
    name: string;
    /** The files that the ZIP held, by their paths in it. */
    files: ReadonlyMap<string, File>;
    /** Where the panel was before it showed the ZIP, which going out of the ZIP returns to, or undefined for nowhere. */
    parent: HostView | undefined;
}

/**
 * Where a panel is on the user's computer: in a folder, in "Your files", or in a ZIP. A panel that shows a disk
 * keeps this, to go back to.
 */
export type HostView = {kind: HostKind.FOLDER, path: FileSystemDirectoryHandle[]} | {kind: HostKind.YOUR_FILES} | ArchiveHost;

/**
 * What a disk's panel shows besides its rows.
 */
export interface DiskListingInfo {
    /** The free bytes, or undefined if the DOS's free space isn't known. */
    freeBytes: number | undefined;
    /** How many files the rows are. */
    fileCount: number;
    /** What's wrong with the disk, such as that it has no file system we recognize, or "". */
    note: string;
    /** Why the disk is read-only, or undefined if it can be written. */
    readOnlyReason: string | undefined;
}

/**
 * What a panel needs from the page to draw itself.
 */
export interface PanelRenderContext {
    /** The name of the folder that an earlier visit remembered, or undefined. */
    rememberedFolderName: string | undefined;
    /** Whether the browser can show a folder picker. */
    canPickFolder: boolean;
    /** Ask the user for a folder to show. */
    chooseFolder(): void;
    /** Reopen the remembered folder. */
    reopenFolder(): void;
    /** Ask the user for files to show in "Your files". */
    chooseFiles(): void;
    /** Ask the user for disk image files to open. */
    openDisk(): void;
    /** Show a new disk dialog. */
    newDisk(): void;
    /** The disk open for a file in a panel's host listing, or undefined. */
    openDiskOf(item: HostFileItem): OpenDisk | undefined;
}

/**
 * The columns of a disk listing, as the CSS names them.
 */
const DISK_COLUMNS = "diskcols";
/** The columns of a folder listing. */
const HOST_COLUMNS = "hostcols";
/** The columns of a partition listing. */
const PARTITION_COLUMNS = "partcols";

/**
 * How many cells a row has in a set of columns.
 *
 * @param columns the columns, as the CSS names them.
 */
function columnCount(columns: string): number {
    return columns === DISK_COLUMNS ? 5 : 3;
}

/**
 * Make one cell of a row.
 *
 * @param text the cell's text.
 * @param className the CSS class, such as "r" for right-aligned.
 */
function cell(text: string, className = ""): HTMLElement {
    return el("span", className, text);
}

/**
 * One panel. It holds what the panel shows (nothing, a place on the user's computer, or a disk), the items it
 * lists, the cursor and the marks, and draws itself into its element.
 */
export class Panel {
    /** The panel's root element. */
    public readonly element = el("div", "panel");
    /** The panel's index: 0 on the left, 1 on the right. */
    public readonly index: number;
    /** Where the panel is on the user's computer, or undefined if it's showing nothing. */
    public host: HostView | undefined = undefined;
    /** The disk the panel shows, or undefined if it shows its host. */
    public disk: OpenDisk | undefined = undefined;
    /** What the panel lists. */
    public items: Item[] = [];
    /** Whether a hard disk's panel lists the partitions to choose from, rather than the chosen one's files. */
    public choosingPartition = false;
    /** What's known about the disk, when the panel shows one. */
    public diskInfo: DiskListingInfo | undefined = undefined;
    /** The index of the item under the cursor. */
    public cursor = 0;
    /** The keys of the marked items. */
    public readonly marks = new Set<string>();
    /** The key of the item that Shift-click marks a range from: the last one clicked or marked. */
    public anchorKey: string | undefined = undefined;
    /** What the panel shows: its own list, or a view of the other panel. */
    public mode = PanelMode.FILES;

    private rowElements: HTMLElement[] = [];
    private footElement: HTMLElement | undefined = undefined;
    private titleElement = el("span", "ptitle");

    /**
     * @param index 0 for the left panel and 1 for the right.
     */
    constructor(index: number) {
        this.index = index;
        this.element.dataset.panel = String(index);
    }

    /**
     * The item under the cursor, or undefined if the panel lists nothing.
     */
    public currentItem(): Item | undefined {
        return this.items[this.cursor];
    }

    /**
     * Keep the cursor inside the list.
     */
    public clampCursor(): void {
        this.cursor = Math.max(0, Math.min(this.cursor, this.items.length - 1));
    }

    /**
     * The marked items, or if none is marked, the one under the cursor (unless it can't be marked). These are the
     * items that a command works on.
     */
    public chosenItems(): Item[] {
        const marked = this.items.filter(item => this.marks.has(item.key) && isMarkable(item));
        if (marked.length > 0) {
            return marked;
        }
        const current = this.currentItem();
        return current !== undefined && isMarkable(current) ? [current] : [];
    }

    /**
     * Drop the marks of items that aren't in the list any more.
     */
    public pruneMarks(): void {
        const keys = new Set(this.items.map(item => item.key));
        for (const key of [...this.marks]) {
            if (!keys.has(key)) {
                this.marks.delete(key);
            }
        }
    }

    /**
     * What the panel shows, in words: the disk's name with a "*" if it has unsaved changes, or where the panel is on
     * the user's computer. It's the panel's title.
     */
    public titleText(): string {
        const disk = this.disk;
        if (disk !== undefined) {
            const facts = getDiskFacts(disk.session);
            const partition = disk.session.isHardDisk() && disk.session.selectedPartitionNumber !== undefined ?
                " · partition " + disk.session.selectedPartitionNumber : "";
            return disk.name + (disk.session.hasChanges() ? " *" : "") + " · " + facts.dos + partition;
        }

        const host = this.host;
        if (host === undefined) {
            return "Nothing here";
        }
        switch (host.kind) {
            case HostKind.FOLDER:
                return host.path.map(folder => folder.name).join("/");
            case HostKind.YOUR_FILES:
                return "Your files";
            case HostKind.ARCHIVE:
                return host.name;
            default:
                assertNever(host);
        }
    }

    /**
     * Draw the panel as a list of items (or, if it has none and no disk, the instructions for filling it).
     *
     * @param isActive whether this is the active panel.
     * @param context what the page gives.
     */
    public renderList(isActive: boolean, context: PanelRenderContext): void {
        this.element.classList.toggle("active", isActive);
        this.titleElement = el("span", "ptitle", this.titleText());

        if (this.disk === undefined && this.host === undefined) {
            this.element.replaceChildren(this.titleElement, this.makeEmptyBody(context));
            this.rowElements = [];
            this.footElement = undefined;
            return;
        }

        const columns = this.disk === undefined ? HOST_COLUMNS : this.items.some(item => item.kind === ItemKind.PARTITION) ?
            PARTITION_COLUMNS : DISK_COLUMNS;
        const header = el("div", "cols " + columns, ...this.headerCells(columns));
        this.rowElements = this.items.map((item, index) => {
            const row = this.makeRow(item, columns, context);
            row.dataset.row = String(index);
            return row;
        });
        const rows = el("div", "rows", ...this.rowElements);
        this.footElement = el("div", "pfoot");
        this.element.replaceChildren(this.titleElement, header, rows, this.footElement);
        this.updateMarks();
        this.updateCursor();
    }

    /**
     * Change the active panel's look, without rebuilding the rows.
     *
     * @param isActive whether this is the active panel.
     */
    public setActive(isActive: boolean): void {
        this.element.classList.toggle("active", isActive);
    }

    /**
     * The captions of the columns.
     */
    private headerCells(columns: string): HTMLElement[] {
        switch (columns) {
            case DISK_COLUMNS:
                return [cell("Name"), cell("Ext"), cell("Size", "r"), cell("Date"), cell("Attr")];
            case PARTITION_COLUMNS:
                return [cell("Partition"), cell("Contents"), cell("")];
            default:
                return [cell("Name"), cell("Size", "r"), cell("Date")];
        }
    }

    /**
     * Make the row for an item.
     */
    private makeRow(item: Item, columns: string, context: PanelRenderContext): HTMLElement {
        const row = el("div", "row " + columns);
        switch (item.kind) {
            case ItemKind.UP:
                row.classList.add("up");
                row.append(cell(" " + item.name), ...Array.from({length: columnCount(columns) - 1}, () => cell("")));
                break;
            case ItemKind.FOLDER:
                row.classList.add("dir");
                row.append(cell(" /" + item.name, "mk"), cell("<DIR>", "r"), cell(""));
                break;
            case ItemKind.HOST_FILE: {
                const openDisk = context.openDiskOf(item);
                let suffix = "";
                if (openDisk !== undefined) {
                    row.classList.add("img");
                    suffix = openDisk.session.hasChanges() ? " *unsaved" : " →";
                }
                row.append(cell(" " + item.name + suffix, "mk"), cell(formatNumber(item.size), "r"),
                    cell(item.date === undefined ? "" : formatHostDate(item.date)));
                break;
            }
            case ItemKind.DISK_FILE:
                this.fillDiskRow(row, item);
                break;
            case ItemKind.PARTITION: {
                row.classList.add("img");
                row.append(cell(" " + item.number + "  " + item.name, "mk"), cell(item.description),
                    cell(item.readOnlyReason === undefined ? "" : "read-only"));
                row.title = item.location + (item.readOnlyReason === undefined ? "" : ". Read-only: " + item.readOnlyReason);
                break;
            }
            default:
                assertNever(item);
        }
        // A file can be dragged to the other panel, to copy it there.
        row.draggable = isMarkable(item);
        return row;
    }

    /**
     * Fill in the cells of a disk file's row.
     */
    private fillDiskRow(row: HTMLElement, item: DiskFileItem): void {
        const file = item.row;
        if (file.isSystem) {
            row.classList.add("sys");
        }
        if (file.damage !== undefined) {
            row.classList.add("bad");
            row.title = file.damage.toString();
        }
        const attributeCell = cell(attributeText(file));
        attributeCell.title = attributeTitle(file);
        row.append(cell(" " + file.name, "mk"), cell(file.extension), cell(formatNumber(file.size), "r"),
            cell(file.dateText), attributeCell);
    }

    /**
     * Show which items are marked, and write the footer.
     */
    public updateMarks(): void {
        for (const [index, item] of this.items.entries()) {
            const row = this.rowElements[index];
            const marked = this.marks.has(item.key);
            row.classList.toggle("marked", marked);
            const first = row.firstElementChild;
            if (first !== null && first.classList.contains("mk")) {
                // The mark goes in the first character, which is a blank otherwise.
                first.textContent = (marked ? "*" : " ") + (first.textContent ?? "").substring(1);
            }
        }
        this.updateFooter();
    }

    /**
     * Move the highlight to the cursor, and scroll it into view.
     */
    public updateCursor(): void {
        for (const [index, row] of this.rowElements.entries()) {
            row.classList.toggle("cursor", index === this.cursor);
        }
        this.rowElements[this.cursor]?.scrollIntoView({block: "nearest"});
        this.updateFooter();
    }

    /**
     * Write the footer: free space and counts on the left, and what's marked on the right.
     */
    private updateFooter(): void {
        const footer = this.footElement;
        if (footer === undefined) {
            return;
        }

        const markedItems = this.items.filter(item => this.marks.has(item.key));
        const markedBytes = markedItems.reduce((sum, item) => sum + itemSize(item), 0);
        const markedText = markedItems.length === 0 ? "" :
            formatNumber(markedItems.length) + " marked, " + formatNumber(markedBytes) + " bytes";

        const parts: HTMLElement[] = [];
        const disk = this.disk;
        if (disk === undefined) {
            const fileCount = this.items.filter(item => item.kind === ItemKind.HOST_FILE).length;
            parts.push(el("span", "", formatNumber(fileCount) + (fileCount === 1 ? " file" : " files")));
            const current = this.currentItem();
            parts.push(el("span", "", markedText !== "" ? markedText : current !== undefined && current.kind === ItemKind.HOST_FILE ?
                current.name : ""));
        } else {
            const info = this.diskInfo;
            let left = "";
            if (info !== undefined) {
                left = info.note !== "" ? info.note : (info.freeBytes === undefined ? "" : formatKilobytes(info.freeBytes) + " free · ") +
                    formatNumber(info.fileCount) + (info.fileCount === 1 ? " file" : " files");
            }
            parts.push(el("span", "", left));
            if (info?.readOnlyReason !== undefined) {
                const readOnly = el("span", "ro", "read-only");
                readOnly.title = info.readOnlyReason;
                parts.push(readOnly);
            }
            parts.push(el("span", "", markedText));
        }
        footer.replaceChildren(...parts);
    }

    /**
     * The instructions that an empty panel shows.
     */
    private makeEmptyBody(context: PanelRenderContext): HTMLElement {
        const body = el("div", "pempty");
        body.append(el("p", "", "Nothing here yet. Fill this panel with:"));
        const list = el("ul");
        list.append(el("li", "", "a disk image: drop it here, or press Ctrl-O (Cmd-O on a Mac) to choose one;"));
        list.append(el("li", "", "a new disk: press F7;"));
        if (context.canPickFolder) {
            list.append(el("li", "", "a folder on your computer, to browse and save disk images in (Alt-O)."));
        } else {
            list.append(el("li", "", "files from your computer, to add to a disk (Alt-O)."));
        }
        body.append(list);

        const buttons = el("div", "pbtns");
        const makeButton = (label: string, action: () => void): void => {
            const button = el("button", "", label);
            button.type = "button";
            button.addEventListener("click", action);
            buttons.append(button);
        };
        if (context.canPickFolder) {
            if (context.rememberedFolderName !== undefined) {
                makeButton("Reopen " + context.rememberedFolderName, context.reopenFolder);
            }
            makeButton("Choose Folder", context.chooseFolder);
        } else {
            makeButton("Choose Files", context.chooseFiles);
        }
        makeButton("Open Disk", context.openDisk);
        makeButton("New Disk (F7)", context.newDisk);
        body.append(buttons);
        if (context.canPickFolder && context.rememberedFolderName !== undefined) {
            body.append(el("p", "muted", "Enter reopens " + context.rememberedFolderName + ", which the browser asks you to allow again."));
        } else if (!context.canPickFolder) {
            body.append(el("p", "muted", "This browser can't open a folder, so the files you give it are kept in a list called Your files."));
        }
        return body;
    }

    /**
     * Draw the panel as a view of the other panel (the F9 modes): a title and a body that the page fills.
     *
     * @param title the title.
     * @returns the body element, for the page to fill.
     */
    public renderViewShell(title: string): HTMLElement {
        this.element.classList.remove("active");
        this.titleElement = el("span", "ptitle", title);
        const body = el("div", "pbody");
        this.element.replaceChildren(this.titleElement, body);
        this.rowElements = [];
        this.footElement = undefined;
        return body;
    }

    /**
     * Redraw the title, after the disk's name or whether it has unsaved changes may have changed.
     */
    public updateTitle(): void {
        if (this.mode === PanelMode.FILES) {
            this.titleElement.textContent = this.titleText();
        }
    }
}

/**
 * The bytes that an item counts for in the footer's total of marked files.
 */
function itemSize(item: Item): number {
    switch (item.kind) {
        case ItemKind.HOST_FILE:
            return item.size;
        case ItemKind.DISK_FILE:
            return item.row.size;
        case ItemKind.UP:
        case ItemKind.FOLDER:
        case ItemKind.PARTITION:
            return 0;
        default:
            assertNever(item);
    }
}

/**
 * A file's date on the user's computer, as YYYY-MM-DD.
 *
 * @param date the date.
 */
export function formatHostDate(date: Date): string {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
}
