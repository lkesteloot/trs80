import {TrsdosProtectionLevel} from "trs80-base";
import {fileKindToString, type FileRow, filterRows, omitHiddenRows} from "../core/FileRows.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {el, formatNumber, makeButton, makeCheckbox, makeSwitch} from "../core/Dom.js";
import {lightFiles, ownerKey} from "./Highlight.js";
import type {DiskViewState} from "./ViewState.js";

/**
 * What the Files view asks of the page when the user does something that needs more than the view itself.
 */
export interface FilesViewHost {
    /** The rows of the disk, with system files if asked. */
    getRows(disk: OpenDisk, includeSystem: boolean): FileRow[];
    /** The color of a file's swatch, or undefined for none. */
    getColor(disk: OpenDisk, fullName: string): string | undefined;
    /** How many other disks are open, which decides whether "Copy to…" is available. */
    otherDiskCount(): number;
    /** The selection changed: the inspector should redraw. */
    selectionChanged(): void;
    /** Open the file's preview full screen. */
    openFullScreen(row: FileRow): void;
    /** Choose host files to add. */
    chooseFilesToAdd(): void;
    /** Add these host files, which were dropped on the list. */
    addDroppedFiles(files: File[]): void;
    /** Download the files, or a ZIP of several. */
    extract(rows: FileRow[]): void;
    /** Write the files into a folder that the user picks (Chromium only). */
    extractToFolder(rows: FileRow[]): void;
    /** Whether the browser can write into a chosen folder. */
    canExtractToFolder(): boolean;
    /**
     * Rename a file.
     *
     * @returns undefined if it worked, and otherwise the error, which the page has shown.
     */
    rename(row: FileRow, newName: string): Promise<string | undefined>;
    /** Show the attributes sheet for the files. */
    attributes(rows: FileRow[]): void;
    /** Delete the files, after asking. */
    remove(rows: FileRow[]): void;
    /** Show the sheet that copies the files to another disk. */
    copyTo(rows: FileRow[]): void;
}

/**
 * How long a click on the name of the only selected file waits before it starts a rename, so that a double
 * click can open the preview instead.
 */
const RENAME_CLICK_DELAY_MS = 450;

/**
 * One button of the action bar, with the span around it that carries its tooltip when it's disabled.
 */
interface ActionButton {
    button: HTMLButtonElement;
    wrapper: HTMLElement;
}

/**
 * The Files view: the action bar, the filter, the table of files with its selection, inline rename, and
 * dropping host files to add them. It draws itself once and then updates in place, so that typing in the filter
 * isn't interrupted by a redraw. The page calls {@link render} when the disk changes.
 */
export class FilesView {
    /** The view's root element, which the page puts in its main pane. */
    public readonly element = el("div", "filesview");

    private readonly host: FilesViewHost;
    private disk: OpenDisk | undefined = undefined;
    private state: DiskViewState | undefined = undefined;
    private visibleRows: FileRow[] = [];

    private readonly buttons = new Map<string, ActionButton>();
    private readonly filterInput = el("input");
    private readonly systemSwitch: {element: HTMLLabelElement, input: HTMLInputElement};
    private readonly hiddenSwitch: {element: HTMLLabelElement, input: HTMLInputElement};
    private readonly lowercaseBox: {element: HTMLLabelElement, input: HTMLInputElement};
    private readonly markDamagedBox: {element: HTMLLabelElement, input: HTMLInputElement};
    private readonly tableWrap = el("div", "tablewrap");
    private readonly tbody = el("tbody");
    /** Whether the table is being redrawn, so that a box that's removed doesn't cancel the rename. */
    private redrawing = false;
    private renameTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    /** The row that the keyboard moved to last, which shift-arrow extends from the anchor to. */
    private cursor: string | undefined = undefined;

    /**
     * Build the view's parts.
     *
     * @param host the page.
     */
    constructor(host: FilesViewHost) {
        this.host = host;

        const bar = el("div", "actionbar");
        const add = (id: string, label: string, onClick: () => void, className = ""): void => {
            const button = makeButton(label, onClick, className);
            const wrapper = el("span", "", button);
            this.buttons.set(id, {button, wrapper});
            bar.append(wrapper);
        };
        const separator = (): void => {
            bar.append(el("span", "sep"));
        };
        add("add", "＋ Add files", () => host.chooseFilesToAdd(), "primary");
        add("extract", "Extract", () => this.withSelection(rows => host.extract(rows)));
        if (host.canExtractToFolder()) {
            add("folder", "Extract to folder…", () => this.withSelection(rows => host.extractToFolder(rows)));
        }
        add("view", "View", () => this.withSelection(rows => host.openFullScreen(rows[0])));
        separator();
        add("rename", "Rename", () => this.withSelection(rows => this.startRename(rows[0])));
        add("attributes", "Attributes", () => this.withSelection(rows => host.attributes(rows)));
        add("delete", "Delete", () => this.withSelection(rows => host.remove(rows)), "danger");
        separator();
        add("copy", "Copy to…", () => this.withSelection(rows => host.copyTo(rows)));
        bar.append(el("span", "grow"));

        this.filterInput.type = "search";
        this.filterInput.placeholder = "Filter: *.BAS";
        this.filterInput.setAttribute("aria-label", "Filter files by name");
        this.filterInput.addEventListener("input", () => {
            if (this.state !== undefined) {
                this.state.filter = this.filterInput.value;
                this.renderTable();
                this.host.selectionChanged();
            }
        });
        this.systemSwitch = makeSwitch("Show system files", false, checked => {
            if (this.state !== undefined && this.disk !== undefined) {
                this.state.showSystem = checked;
                this.render(this.disk, this.state);
                this.host.selectionChanged();
            }
        }, "Also list system files");
        this.hiddenSwitch = makeSwitch("Show hidden files", false, checked => {
            if (this.state !== undefined && this.disk !== undefined) {
                this.state.showHidden = checked;
                this.render(this.disk, this.state);
                this.host.selectionChanged();
            }
        }, "Also list files with the invisible attribute");
        bar.append(this.filterInput, this.systemSwitch.element, this.hiddenSwitch.element);

        const table = el("table", "files", el("thead", "", el("tr", "",
            el("th", "", "Name"), el("th", "", "Ext"), el("th", "num", "Size"), el("th", "", "Date"),
            el("th", "", "Attributes"), el("th", "", "Kind"))), this.tbody);
        this.tableWrap.append(table);
        this.tableWrap.tabIndex = 0;
        this.tableWrap.addEventListener("keydown", event => this.onKeyDown(event));
        this.tableWrap.addEventListener("dragover", event => this.onDragOver(event));
        this.tableWrap.addEventListener("dragleave", () => this.element.classList.remove("dropping"));
        this.tableWrap.addEventListener("drop", event => this.onDrop(event));

        this.lowercaseBox = makeCheckbox("lowercase names", false, checked => {
            if (this.state !== undefined) {
                this.state.extractLowercase = checked;
            }
        });
        this.markDamagedBox = makeCheckbox("mark damaged files", false, checked => {
            if (this.state !== undefined) {
                this.state.extractMarkDamaged = checked;
            }
        });
        const hint = el("div", "hint", "Drop files from your computer here to add them.");
        const extractOptions = el("div", "hint extractopts", "When extracting: ", this.lowercaseBox.element, " ",
            this.markDamagedBox.element);
        this.element.append(bar, this.tableWrap, hint, extractOptions);
    }

    /**
     * Run a function on the selected rows, if there are any.
     */
    private withSelection(run: (rows: FileRow[]) => void): void {
        const rows = this.selectedRows();
        if (rows.length > 0) {
            run(rows);
        }
    }

    /**
     * The selected rows that are showing, in table order.
     */
    public selectedRows(): FileRow[] {
        const state = this.state;
        if (state === undefined) {
            return [];
        }
        return this.visibleRows.filter(row => state.selected.has(row.fullName));
    }

    /**
     * Show a disk's files. Call it when the disk or its view state changes. The selection is cut down to the
     * files that are showing.
     *
     * @param disk the disk.
     * @param state its view state.
     */
    public render(disk: OpenDisk, state: DiskViewState): void {
        if (this.disk !== disk) {
            this.cancelRenameTimer();
        }
        this.disk = disk;
        this.state = state;
        this.filterInput.value = state.filter;
        this.systemSwitch.input.checked = state.showSystem;
        this.hiddenSwitch.input.checked = state.showHidden;
        this.lowercaseBox.input.checked = state.extractLowercase;
        this.markDamagedBox.input.checked = state.extractMarkDamaged;
        this.renderTable();
    }

    /**
     * Redraw the table and the buttons from the disk's rows and the filter.
     */
    private renderTable(): void {
        const disk = this.disk;
        const state = this.state;
        if (disk === undefined || state === undefined) {
            return;
        }

        const hadFocus = this.tableWrap.contains(document.activeElement) && document.activeElement !== this.tableWrap &&
            !(document.activeElement instanceof HTMLInputElement);
        const allRows = this.host.getRows(disk, state.showSystem);
        this.visibleRows = filterRows(omitHiddenRows(allRows, state.showHidden), state.filter);

        // Keep only the selected files that are still showing.
        const names = new Set(this.visibleRows.map(row => row.fullName));
        for (const name of [...state.selected]) {
            if (!names.has(name)) {
                state.selected.delete(name);
            }
        }
        if (state.anchor !== undefined && !names.has(state.anchor)) {
            state.anchor = undefined;
        }
        if (state.renaming !== undefined && !names.has(state.renaming)) {
            state.renaming = undefined;
        }

        this.redrawing = true;
        lightFiles(undefined);
        if (this.visibleRows.length === 0) {
            const message = state.filter === "" ? "No files." : "No files match.";
            this.tbody.replaceChildren(el("tr", "", Object.assign(el("td", "kind empty", message), {colSpan: 6})));
        } else {
            this.tbody.replaceChildren(...this.visibleRows.map(row => this.makeRow(disk, state, row)));
        }
        this.redrawing = false;
        this.updateButtons();
        if (hadFocus) {
            this.tableWrap.focus();
        }
        if (state.renaming !== undefined) {
            const input = this.tbody.querySelector("input.rename") as HTMLInputElement | null;
            input?.focus();
            input?.select();
        }
    }

    /**
     * Make one row of the table.
     */
    private makeRow(disk: OpenDisk, state: DiskViewState, row: FileRow): HTMLElement {
        const color = this.host.getColor(disk, row.fullName);
        const renaming = state.renaming === row.fullName;
        const nameCell = el("td", "name");
        if (color !== undefined) {
            const swatch = el("span", "swatch");
            swatch.style.background = color;
            nameCell.append(swatch);
        }
        if (renaming) {
            nameCell.append(this.makeRenameInput(row));
        } else {
            nameCell.append(row.name);
        }

        const pills = el("td");
        const attributes = row.attributes;
        if (row.isSystem) {
            pills.append(this.pill("SYS", "", "System file"));
        }
        if (row.isHidden) {
            pills.append(this.pill("INV", "", "Invisible"));
        }
        if (attributes !== undefined && attributes.protectionLevel !== TrsdosProtectionLevel.FULL) {
            pills.append(this.pill(attributes.protection, "prot", "Protection level"));
        }
        if (attributes?.hasPasswords === true) {
            pills.append(this.pill("PW", "", "Has a password"));
        }
        if (row.damage !== undefined) {
            pills.append(this.pill("BAD", "bad", row.damage.toString()));
        }

        const tr = el("tr", (state.selected.has(row.fullName) ? "sel" : "") + (row.isHidden ? " dim" : ""),
            nameCell, el("td", "mono", renaming ? "" : row.extension), el("td", "num", formatNumber(row.size)),
            el("td", "", row.dateText), pills, el("td", "kind", fileKindToString(row.kind)));
        tr.dataset.name = row.fullName;
        tr.dataset.fo = ownerKey(row.fullName);
        // Light up the file's part of the space bar.
        tr.addEventListener("mouseenter", () => lightFiles([row.fullName]));
        tr.addEventListener("mouseleave", () => lightFiles(undefined));
        tr.addEventListener("click", event => this.onRowClick(event, row, nameCell));
        tr.addEventListener("dblclick", () => {
            this.cancelRenameTimer();
            this.host.openFullScreen(row);
        });
        return tr;
    }

    /**
     * Make a pill for the attributes column.
     */
    private pill(text: string, className: string, title: string): HTMLElement {
        const pill = el("span", "pill " + className, text);
        pill.title = title;
        return pill;
    }

    /**
     * Make the box that renames a file in place.
     */
    private makeRenameInput(row: FileRow): HTMLInputElement {
        const input = el("input", "rename");
        input.value = row.fullName;
        input.maxLength = 12;
        input.spellcheck = false;
        input.addEventListener("click", event => event.stopPropagation());
        input.addEventListener("dblclick", event => event.stopPropagation());
        input.addEventListener("keydown", event => {
            event.stopPropagation();
            if (event.key === "Enter") {
                event.preventDefault();
                void this.commitRename(row, input.value);
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.cancelRename();
            }
        });
        // Redrawing the table removes the box, which blurs it, and that mustn't cancel the rename.
        input.addEventListener("blur", () => {
            if (!this.redrawing) {
                this.cancelRename();
            }
        });
        return input;
    }

    /**
     * Start renaming a file in place.
     */
    private startRename(row: FileRow): void {
        if (this.state === undefined) {
            return;
        }
        this.cancelRenameTimer();
        this.state.renaming = row.fullName;
        this.renderTable();
    }

    /**
     * Stop renaming without changing anything.
     */
    private cancelRename(): void {
        if (this.state?.renaming === undefined) {
            return;
        }
        this.state.renaming = undefined;
        this.renderTable();
        this.tableWrap.focus();
    }

    /**
     * Rename a file to what the user typed. The box stays open if it fails, so they can fix the name.
     */
    private async commitRename(row: FileRow, newName: string): Promise<void> {
        const trimmed = newName.trim();
        if (trimmed === "" || trimmed.toUpperCase() === row.fullName.toUpperCase()) {
            this.cancelRename();
            return;
        }

        const state = this.state as DiskViewState;
        state.renaming = undefined;
        const error = await this.host.rename(row, trimmed);
        if (error !== undefined) {
            state.renaming = row.fullName;
            this.renderTable();
        } else {
            // The file has its new name, so the selection follows it.
            const newRow = this.host.getRows(this.disk as OpenDisk, state.showSystem)
                .find(candidate => candidate.fullName.toUpperCase() === trimmed.toUpperCase());
            state.selected.clear();
            state.anchor = undefined;
            if (newRow !== undefined) {
                state.selected.add(newRow.fullName);
                state.anchor = newRow.fullName;
            }
            this.renderTable();
            this.host.selectionChanged();
            this.tableWrap.focus();
        }
    }

    /**
     * Forget a click that was waiting to start a rename.
     */
    private cancelRenameTimer(): void {
        if (this.renameTimer !== undefined) {
            clearTimeout(this.renameTimer);
            this.renameTimer = undefined;
        }
    }

    /**
     * Handle a click on a row: select it, or extend the selection with Shift or Cmd/Ctrl. A click on the name of
     * the one selected file starts a rename, if the disk is writable.
     */
    private onRowClick(event: MouseEvent, row: FileRow, nameCell: HTMLElement): void {
        const state = this.state;
        if (state === undefined || state.renaming !== undefined) {
            return;
        }

        this.cancelRenameTimer();
        this.cursor = row.fullName;
        const wasOnlySelection = state.selected.size === 1 && state.selected.has(row.fullName);
        const index = this.visibleRows.indexOf(row);
        if (event.shiftKey && state.anchor !== undefined) {
            const anchorIndex = this.visibleRows.findIndex(candidate => candidate.fullName === state.anchor);
            this.selectRange(anchorIndex < 0 ? index : anchorIndex, index);
        } else if (event.metaKey || event.ctrlKey) {
            if (state.selected.has(row.fullName)) {
                state.selected.delete(row.fullName);
            } else {
                state.selected.add(row.fullName);
            }
            state.anchor = row.fullName;
        } else {
            state.selected.clear();
            state.selected.add(row.fullName);
            state.anchor = row.fullName;
        }
        this.selectionUpdated();
        this.tableWrap.focus();

        const plainClickOnName = !event.shiftKey && !event.metaKey && !event.ctrlKey && wasOnlySelection &&
            nameCell.contains(event.target as Node);
        if (plainClickOnName && this.renameEnabled()) {
            this.renameTimer = setTimeout(() => this.startRename(row), RENAME_CLICK_DELAY_MS);
        }
    }

    /**
     * Select the rows from one index to another, inclusive, in either order.
     */
    private selectRange(from: number, to: number): void {
        const state = this.state as DiskViewState;
        state.selected.clear();
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
            state.selected.add(this.visibleRows[i].fullName);
        }
    }

    /**
     * Whether renaming is possible right now.
     */
    private renameEnabled(): boolean {
        return this.disk !== undefined && this.disk.session.getReadOnlyReason() === undefined &&
            this.selectedRows().length === 1;
    }

    /**
     * Show the selection in the rows and the buttons, and tell the page.
     */
    private selectionUpdated(): void {
        const state = this.state as DiskViewState;
        for (const tr of Array.from(this.tbody.children) as HTMLElement[]) {
            tr.classList.toggle("sel", tr.dataset.name !== undefined && state.selected.has(tr.dataset.name));
        }
        this.updateButtons();
        this.host.selectionChanged();
    }

    /**
     * Move the selection with the arrow keys, and handle Enter, Delete and F2.
     */
    private onKeyDown(event: KeyboardEvent): void {
        const state = this.state;
        if (state === undefined || state.renaming !== undefined || event.target !== this.tableWrap) {
            return;
        }

        const rows = this.visibleRows;
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                if (rows.length === 0) {
                    return;
                }
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                const cursorIndex = this.cursorIndex(delta);
                const next = Math.max(0, Math.min(rows.length - 1,
                    cursorIndex < 0 ? (delta > 0 ? 0 : rows.length - 1) : cursorIndex + delta));
                if (event.shiftKey && state.anchor !== undefined) {
                    const anchorIndex = rows.findIndex(row => row.fullName === state.anchor);
                    this.selectRange(anchorIndex < 0 ? next : anchorIndex, next);
                } else {
                    state.selected.clear();
                    state.selected.add(rows[next].fullName);
                    state.anchor = rows[next].fullName;
                }
                this.cursor = rows[next].fullName;
                this.selectionUpdated();
                this.tbody.querySelector(`tr[data-name="${CSS.escape(rows[next].fullName)}"]`)
                    ?.scrollIntoView({block: "nearest"});
                break;
            }

            case "Enter":
                if (this.selectedRows().length === 1) {
                    event.preventDefault();
                    this.host.openFullScreen(this.selectedRows()[0]);
                }
                break;

            case "Delete":
            case "Backspace":
                if (this.selectedRows().length > 0 && this.canChange()) {
                    event.preventDefault();
                    this.host.remove(this.selectedRows());
                }
                break;

            case "F2":
                if (this.renameEnabled()) {
                    event.preventDefault();
                    this.startRename(this.selectedRows()[0]);
                }
                break;

            case "a":
            case "A":
                if (event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    state.selected = new Set(rows.map(row => row.fullName));
                    this.selectionUpdated();
                }
                break;

            default:
                break;
        }
    }

    /**
     * The index of the row that the arrow keys move from: the keyboard cursor if it's still showing, and
     * otherwise the last selected row (moving down) or the first (moving up), or -1 if nothing is selected.
     */
    private cursorIndex(delta: number): number {
        const cursor = this.visibleRows.findIndex(row => row.fullName === this.cursor);
        if (cursor >= 0) {
            return cursor;
        }

        const selected = this.selectedRows();
        if (selected.length === 0) {
            return -1;
        }
        return this.visibleRows.indexOf(delta > 0 ? selected[selected.length - 1] : selected[0]);
    }

    /**
     * Whether the disk can be changed.
     */
    private canChange(): boolean {
        return this.disk !== undefined && this.disk.session.getReadOnlyReason() === undefined;
    }

    /**
     * Whether a drag carries files from the computer.
     */
    private dragHasFiles(event: DragEvent): boolean {
        return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes("Files");
    }

    /**
     * Allow files to be dropped on the list, and show that they can be.
     */
    private onDragOver(event: DragEvent): void {
        if (!this.dragHasFiles(event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.element.classList.add("dropping");
    }

    /**
     * Add the files that were dropped on the list.
     */
    private onDrop(event: DragEvent): void {
        this.element.classList.remove("dropping");
        if (!this.dragHasFiles(event) || event.dataTransfer === null) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) {
            this.host.addDroppedFiles(files);
        }
    }

    /**
     * Enable each button as the selection and the disk allow, with a tooltip that says why when it isn't.
     */
    private updateButtons(): void {
        const disk = this.disk;
        if (disk === undefined) {
            return;
        }

        const rows = this.selectedRows();
        const count = rows.length;
        const readOnlyReason = disk.session.getReadOnlyReason();
        const needsFile = "Select a file.";
        const needsOne = "Select one file.";
        const attributesOk = count > 0 && rows.every(row => row.attributes !== undefined);
        const otherDisks = this.host.otherDiskCount();

        const reasons: [string, string | undefined][] = [
            ["add", readOnlyReason],
            ["extract", count > 0 ? undefined : needsFile],
            ["folder", count > 0 ? undefined : needsFile],
            ["view", count === 1 ? undefined : needsOne],
            ["rename", readOnlyReason ?? (count === 1 ? undefined : needsOne)],
            ["attributes", readOnlyReason ?? (count === 0 ? needsFile : attributesOk ? undefined :
                "This disk's files have no attributes to change.")],
            ["delete", readOnlyReason ?? (count > 0 ? undefined : needsFile)],
            ["copy", count === 0 ? needsFile : otherDisks > 0 ? undefined : "Open or make another disk to copy to."],
        ];
        for (const [id, reason] of reasons) {
            const entry = this.buttons.get(id);
            if (entry !== undefined) {
                entry.button.disabled = reason !== undefined;
                entry.wrapper.title = reason ?? "";
            }
        }
    }
}
