import {Trsdos} from "trs80-base";
import {
    type AddFilesResult, type AddPlanItem, DiskError, describeChanges, type AttributeRequest,
} from "trs80-disk";
import {
    type ActionResult, type AddActionOptions, addPlanned, attrib, kill, protect, redo, rename, undo,
} from "../core/Actions.js";
import {
    downloadFile, downloadZip, extractToFolder, type ExtractOptions, type ExtractResult,
} from "../core/Extracting.js";
import {type FileRow, filterRows, getFileRows} from "../core/FileRows.js";
import {installUndoKeys} from "../core/Keys.js";
import {DiskStore} from "../core/DiskStore.js";
import {type OpenDisk, SaveKind} from "../core/OpenDisk.js";
import {
    getDroppedInputs, newDisk, openFiles, openFromHandles, type OpenInput, type OpenResult, pickFiles,
    supportsFilePicker, type UnopenedFile,
} from "../core/Opening.js";
import {installUnsavedChangesWarning, saveDisk, saveDiskAs} from "../core/Saving.js";
import {AddSheet} from "./AddSheet.js";
import {AttributesSheet} from "./AttributesSheet.js";
import {openCopySheet} from "./CopySheet.js";
import {DiskHeader} from "./DiskHeader.js";
import {getSpaceUse, needsPartitionChoice, type SpaceUse} from "./DiskFacts.js";
import {countOf, el, makeButton} from "./Dom.js";
import {FilesView, type FilesViewHost} from "./FilesView.js";
import {Inspector} from "./Inspector.js";
import {Messages} from "./Messages.js";
import {NewDiskPanel, type NewDiskChoice} from "./NewDiskPanel.js";
import {renderPreviewPanel, describeRow} from "./PreviewPanel.js";
import {makeSampleDisk} from "./Samples.js";
import {openSaveAsSheet} from "./SaveAsSheet.js";
import {confirmSheet} from "./Sheet.js";
import {TopBar} from "./TopBar.js";
import {DiskViewState, VIEW_KINDS, ViewKind, viewKindToString} from "./ViewState.js";

/**
 * What an action that the page ran came to.
 */
type RunOutcome<T> = {ok: true, value: ActionResult<T>} | {ok: false, message: string};

/**
 * What the page remembers about a disk's history between changes, to tell an undo or redo (which the keyboard
 * and the buttons do) from a new change.
 */
interface HistoryMark {
    /** How many entries were applied. */
    position: number;
    /** How many entries there were in all. */
    length: number;
}

/**
 * The names of the files that an add made, for the strip.
 */
function describeAdd(result: AddFilesResult): string[] {
    const lines: string[] = [];
    for (const file of result.files) {
        lines.push(...file.conversionMessages);
        lines.push((file.replaced ? "Replaced " : "Added ") + file.name + " (" + countOf(file.size, "byte") + ").");
    }
    for (const warning of result.warnings) {
        lines.push("Warning: " + warning + ".");
    }
    return lines;
}

/**
 * The workbench page: it owns the open disks, which one is on show, and each disk's view state, and it wires the
 * parts of the page (the top bar, the start screen, the header, the Files view, the inspector and the command
 * strip) to the disks. When a disk changes, it redraws what depends on it.
 */
export class Workbench implements FilesViewHost {
    private readonly store = new DiskStore();
    private readonly states = new Map<number, DiskViewState>();
    private readonly rowCache = new Map<number, Map<boolean, FileRow[]>>();
    private readonly spaceCache = new Map<number, {use: SpaceUse | undefined, colors: Map<string, string>}>();
    private readonly historyMarks = new Map<number, HistoryMark>();
    private currentId: number | undefined = undefined;
    private showingStart = true;
    private busy = 0;

    private readonly startElement = document.getElementById("start") as HTMLElement;
    private readonly workElement = document.getElementById("work") as HTMLElement;
    private readonly viewsElement = document.getElementById("views") as HTMLElement;
    private readonly paneElement = document.getElementById("pane") as HTMLElement;
    private readonly openInput = document.getElementById("filePick") as HTMLInputElement;
    private readonly addInput = el("input");
    private readonly messages = new Messages(document.getElementById("strip") as HTMLElement);
    private readonly topBar: TopBar;
    private readonly header: DiskHeader;
    private readonly filesView: FilesView;
    private readonly inspector: Inspector;
    private readonly newDiskPanel: NewDiskPanel;

    /**
     * Build the page's parts and start listening.
     */
    constructor() {
        this.topBar = new TopBar({
            selectDisk: disk => this.showDisk(disk),
            closeDisk: disk => void this.closeDisk(disk),
            open: () => void this.chooseFiles(),
            newDisk: () => this.showNewDiskPanel(),
            undo: () => this.undoCurrent(),
            redo: () => this.redoCurrent(),
        });
        this.header = new DiskHeader(document.getElementById("diskhead") as HTMLElement,
            document.getElementById("banner") as HTMLElement, {
                save: disk => void this.save(disk),
                saveAs: disk => this.saveAs(disk),
                setWriteProtect: (disk, writeProtected) => void this.setWriteProtect(disk, writeProtected),
            });
        this.filesView = new FilesView(this);
        this.inspector = new Inspector(document.getElementById("inspector") as HTMLElement, {
            getColor: (disk, fullName) => this.getColor(disk, fullName),
            openFullScreen: row => this.openFullScreen(row),
            extract: rows => void this.extract(rows),
            countFiles: disk => this.countFiles(disk),
        });
        this.newDiskPanel = new NewDiskPanel(choice => void this.createDisk(choice));

        this.addInput.type = "file";
        this.addInput.multiple = true;
        this.addInput.addEventListener("change", () => {
            const files = Array.from(this.addInput.files ?? []);
            this.addInput.value = "";
            this.addDroppedFiles(files);
        });
        this.openInput.addEventListener("change", () => {
            const inputs = Array.from(this.openInput.files ?? []).map(file => ({file}));
            this.openInput.value = "";
            void this.openInputs(inputs);
        });
        document.getElementById("openBtn")?.addEventListener("click", () => void this.chooseFiles());
        document.getElementById("sampleLink")?.addEventListener("click", event => {
            event.preventDefault();
            void this.trySample();
        });
        this.installDropHandling();

        this.store.onAdded(disk => this.onDiskAdded(disk));
        this.store.onRemoved(disk => this.onDiskRemoved(disk));
        this.store.onChanged(disk => this.onDiskChanged(disk));
        installUndoKeys(() => this.showingStart ? undefined : this.currentDisk());
        installUnsavedChangesWarning(this.store);
        this.renderAll();
    }

    // ------------------------------------------------------------------ Disks and what's on show.

    /**
     * The disk on show, or undefined if there's none.
     */
    private currentDisk(): OpenDisk | undefined {
        return this.currentId === undefined ? undefined : this.store.get(this.currentId);
    }

    /**
     * The view state of a disk.
     */
    private stateOf(disk: OpenDisk): DiskViewState {
        let state = this.states.get(disk.id);
        if (state === undefined) {
            state = new DiskViewState();
            this.states.set(disk.id, state);
        }
        return state;
    }

    /**
     * Show a disk, and leave the start screen.
     */
    private showDisk(disk: OpenDisk): void {
        this.currentId = disk.id;
        this.showingStart = false;
        this.renderAll();
    }

    /**
     * Show the start screen, with the New Disk panel in view.
     */
    private showNewDiskPanel(): void {
        this.showingStart = true;
        this.renderAll();
        this.newDiskPanel.focus();
    }

    /**
     * A disk was added to the store: remember its history, and show it.
     */
    private onDiskAdded(disk: OpenDisk): void {
        this.recordHistory(disk);
        this.showDisk(disk);
    }

    /**
     * A disk was closed: forget what we kept for it, and show another or the start screen.
     */
    private onDiskRemoved(disk: OpenDisk): void {
        this.states.delete(disk.id);
        this.rowCache.delete(disk.id);
        this.spaceCache.delete(disk.id);
        this.historyMarks.delete(disk.id);
        this.messages.forgetDisk(disk.id);
        if (this.currentId === disk.id) {
            const remaining = this.store.list();
            this.currentId = remaining.length > 0 ? remaining[remaining.length - 1].id : undefined;
            this.showingStart = this.currentId === undefined;
        }
        this.renderAll();
    }

    /**
     * A disk changed: drop what we computed from it, notice an undo or redo, and redraw.
     */
    private onDiskChanged(disk: OpenDisk): void {
        this.rowCache.delete(disk.id);
        this.spaceCache.delete(disk.id);
        this.noticeHistoryMove(disk);
        if (disk.id === this.currentId && !this.showingStart) {
            this.renderAll();
        } else {
            this.topBar.render(this.store.list(), this.showingStart ? undefined : this.currentDisk());
        }
    }

    /**
     * Close a disk, after asking if it has unsaved changes.
     */
    private async closeDisk(disk: OpenDisk): Promise<void> {
        if (disk.session.hasChanges()) {
            const confirmed = await confirmSheet("Close " + disk.name + "?",
                "It has unsaved changes, which will be lost.", "Close without saving", true);
            if (!confirmed) {
                return;
            }
        }
        this.store.remove(disk);
    }

    // ------------------------------------------------------------------ Drawing.

    /**
     * Redraw everything that depends on the current disk and on which screen shows.
     */
    private renderAll(): void {
        const disk = this.currentDisk();
        const showStart = this.showingStart || disk === undefined;
        this.startElement.hidden = !showStart;
        this.workElement.hidden = showStart;
        this.topBar.render(this.store.list(), showStart ? undefined : disk);
        this.messages.setDisk(showStart ? undefined : disk?.id, disk?.name ?? "");
        if (!showStart && disk !== undefined) {
            this.renderDisk(disk);
        }
    }

    /**
     * Draw the header, the view tabs, the main pane and the inspector for a disk.
     */
    private renderDisk(disk: OpenDisk): void {
        const state = this.stateOf(disk);
        this.header.render(disk, this.countFiles(disk).user);
        this.renderViewTabs(disk, state);
        this.renderPane(disk, state);
        this.renderInspector(disk, state);
    }

    /**
     * Draw the row of view tabs.
     */
    private renderViewTabs(disk: OpenDisk, state: DiskViewState): void {
        this.viewsElement.replaceChildren(...VIEW_KINDS.map(kind => {
            const button = makeButton(viewKindToString(kind), () => {
                state.view = kind;
                this.renderDisk(disk);
            }, state.view === kind ? "active" : "");
            return button;
        }));
    }

    /**
     * Draw the main pane: the Files view, or a note for what isn't built yet.
     */
    private renderPane(disk: OpenDisk, state: DiskViewState): void {
        const session = disk.session;
        if (state.view !== ViewKind.FILES) {
            this.paneElement.replaceChildren(el("div", "card comingsoon", el("h4", "", viewKindToString(state.view)),
                "Coming soon."));
            return;
        }
        if (needsPartitionChoice(session) || (session.isHardDisk() && session.getPartitions().length === 0)) {
            const count = session.getPartitions().length;
            this.paneElement.replaceChildren(el("div", "card comingsoon", el("h4", "", "Hard disk image"),
                count === 0 ? "No LDOS, LS-DOS, DOSPLUS or NEWDOS/80 partitions were found." :
                    "This image has " + countOf(count, "partition") + ". Choosing one is coming soon to this page."));
            return;
        }

        if (this.filesView.element.parentElement !== this.paneElement) {
            this.paneElement.replaceChildren(this.filesView.element);
        }
        this.filesView.render(disk, state);
    }

    /**
     * Draw the inspector for the current selection.
     */
    private renderInspector(disk: OpenDisk, state: DiskViewState): void {
        this.inspector.render(disk, state, this.selectedRows(disk, state));
    }

    /**
     * The selected rows of a disk, in table order, whichever view is showing.
     */
    private selectedRows(disk: OpenDisk, state: DiskViewState): FileRow[] {
        const rows = filterRows(this.getRows(disk, state.showSystem), state.filter);
        return rows.filter(row => state.selected.has(row.fullName));
    }

    // ------------------------------------------------------------------ Facts about a disk, kept until it changes.

    /**
     * The rows of a disk's files.
     */
    public getRows(disk: OpenDisk, includeSystem: boolean): FileRow[] {
        let byInclude = this.rowCache.get(disk.id);
        if (byInclude === undefined) {
            byInclude = new Map();
            this.rowCache.set(disk.id, byInclude);
        }

        let rows = byInclude.get(includeSystem);
        if (rows === undefined) {
            rows = needsPartitionChoice(disk.session) ? [] : getFileRows(disk.session, includeSystem);
            byInclude.set(includeSystem, rows);
        }
        return rows;
    }

    /**
     * How many user and system files a disk has.
     */
    private countFiles(disk: OpenDisk): {user: number, system: number} {
        const user = this.getRows(disk, false).length;
        const all = this.getRows(disk, true).length;
        return {user, system: Math.max(0, all - user)};
    }

    /**
     * A file's color, as the space bar and the map show it.
     */
    public getColor(disk: OpenDisk, fullName: string): string | undefined {
        let entry = this.spaceCache.get(disk.id);
        if (entry === undefined) {
            const use = getSpaceUse(disk.session);
            const colors = new Map<string, string>();
            for (const file of use?.files ?? []) {
                colors.set(file.name.toUpperCase(), file.color);
            }
            entry = {use, colors};
            this.spaceCache.set(disk.id, entry);
        }
        return entry.colors.get(fullName.toUpperCase());
    }

    // ------------------------------------------------------------------ Running actions.

    /**
     * Run an action on a disk and tell the user how it went. A DiskError is shown in the strip and in an alert and
     * changes nothing. Anything else is a bug: it goes to the console and the user is told that something went
     * wrong.
     *
     * @param disk the disk.
     * @param action does the change.
     * @param describe says what it did, in lines for the strip.
     */
    private async run<T>(disk: OpenDisk, action: () => Promise<ActionResult<T>> | ActionResult<T>,
                         describe: (result: T) => string[]): Promise<RunOutcome<T>> {

        this.busy++;
        try {
            const result = await action();
            this.messages.reportDone(disk.id, result.commandLine, describe(result.result));
            return {ok: true, value: result};
        } catch (e) {
            return {ok: false, message: this.reportFailure(disk, e)};
        } finally {
            this.busy--;
            this.recordHistory(disk);
        }
    }

    /**
     * Show an error to the user, and return the message that they were shown.
     */
    private reportFailure(disk: OpenDisk | undefined, e: unknown): string {
        let message: string;
        if (e instanceof DiskError) {
            message = e.message;
        } else {
            console.error(e);
            message = "Something went wrong. The browser's console has the details.";
        }
        this.messages.reportError(disk?.id, message);
        return message;
    }

    /**
     * Remember where a disk's history stands.
     */
    private recordHistory(disk: OpenDisk): void {
        const history = disk.session.getHistory();
        this.historyMarks.set(disk.id, {position: history.position, length: history.entries.length});
    }

    /**
     * If a disk's history moved without our running an action, then it was an undo or redo from the keyboard or
     * the buttons: show it in the strip.
     */
    private noticeHistoryMove(disk: OpenDisk): void {
        const before = this.historyMarks.get(disk.id);
        const history = disk.session.getHistory();
        this.recordHistory(disk);
        if (this.busy > 0 || before === undefined || before.length !== history.entries.length) {
            return;
        }

        if (history.position < before.position) {
            const labels = history.entries.slice(history.position, before.position).reverse();
            this.messages.reportDone(disk.id, labels.map(() => "undo").join(" : "), labels.map(label => "Undid " + label));
        } else if (history.position > before.position) {
            const labels = history.entries.slice(before.position, history.position);
            this.messages.reportDone(disk.id, labels.map(() => "redo").join(" : "), labels.map(label => "Redid " + label));
        }
    }

    /**
     * Undo the current disk's latest change.
     */
    private undoCurrent(): void {
        const disk = this.currentDisk();
        if (disk !== undefined) {
            undo(disk.session);
        }
    }

    /**
     * Redo the current disk's latest undone change.
     */
    private redoCurrent(): void {
        const disk = this.currentDisk();
        if (disk !== undefined) {
            redo(disk.session);
        }
    }

    // ------------------------------------------------------------------ Opening and making disks.

    /**
     * Let the user choose disk images to open.
     */
    private async chooseFiles(): Promise<void> {
        if (!supportsFilePicker()) {
            this.openInput.click();
            return;
        }

        try {
            const handles = await pickFiles();
            if (handles.length > 0) {
                this.showOpenResult(await openFromHandles(handles));
            }
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Open files that the user gave us.
     */
    private async openInputs(inputs: OpenInput[]): Promise<void> {
        try {
            this.showOpenResult(await openFiles(inputs));
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Put newly opened disks in the store, and say what became of the files that weren't disks.
     */
    private showOpenResult(result: OpenResult): void {
        for (const disk of result.disks) {
            this.store.add(disk);
        }
        if (result.disks.length > 0) {
            this.showDisk(result.disks[0]);
            this.messages.toast("Opened " + countOf(result.disks.length, "disk") + ".");
        }
        if (result.unopened.length > 0) {
            this.handleUnopened(result.disks.length > 0, result.unopened);
        }
    }

    /**
     * Files that aren't disk images are offered for adding to the current disk, if no disk was opened with them
     * and the disk is writable. Otherwise the user is told why they weren't opened.
     */
    private handleUnopened(openedDisks: boolean, unopened: UnopenedFile[]): void {
        const disk = this.currentDisk();
        if (!openedDisks && disk !== undefined && !this.showingStart && disk.session.getReadOnlyReason() === undefined) {
            this.openAddSheet(disk, unopened.map(file => file.file), {
                title: "Add files to " + disk.name,
                subtitle: countOf(unopened.length, "file") + " " + (unopened.length === 1 ? "isn't a disk image" :
                    "aren't disk images") + ", so you can add " + (unopened.length === 1 ? "it" : "them") + " to " +
                    disk.name + ". Nothing changes until you press Add.",
                copyMode: false,
            });
            return;
        }

        this.messages.reportError(undefined, unopened.map(file => "Can't open " + file.name + ": " + file.message).join(" "));
    }

    /**
     * Make a new disk from the New Disk panel and open it.
     */
    private async createDisk(choice: NewDiskChoice): Promise<void> {
        try {
            const made = await newDisk(choice.request, choice.name);
            this.store.add(made.disk);
            const description = made.result.systemCopy === undefined ? "Made a blank data disk." :
                "Made a copy of the " + made.result.systemCopy.description + ".";
            this.messages.reportDone(made.disk.id, made.commandLine, [description]);
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Make the sample disk and open it.
     */
    private async trySample(): Promise<void> {
        try {
            const disk = await makeSampleDisk();
            this.store.add(disk);
            this.messages.reportDone(disk.id, undefined, ["Made a sample disk with three BASIC programs."]);
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Let files be dropped anywhere on the page. Disk images open, and other files are offered for adding.
     */
    private installDropHandling(): void {
        const bigDrop = document.getElementById("bigDrop");
        const hasFiles = (event: DragEvent): boolean =>
            event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes("Files");

        document.addEventListener("dragover", event => {
            if (hasFiles(event)) {
                // Without this, the browser would navigate to the file.
                event.preventDefault();
                bigDrop?.classList.add("over");
            }
        });
        document.addEventListener("dragleave", event => {
            if (event.relatedTarget === null) {
                bigDrop?.classList.remove("over");
            }
        });
        document.addEventListener("drop", event => {
            bigDrop?.classList.remove("over");
            if (!hasFiles(event) || event.dataTransfer === null) {
                return;
            }
            event.preventDefault();
            // The drop's data is only good until this handler returns, so ask for everything now.
            void getDroppedInputs(event.dataTransfer).then(inputs => this.openInputs(inputs));
        });
    }

    // ------------------------------------------------------------------ Saving.

    /**
     * Save a disk, by writing back or downloading.
     */
    private async save(disk: OpenDisk): Promise<void> {
        try {
            const kind = disk.saveKind;
            const result = await saveDisk(disk);
            this.messages.toast((kind === SaveKind.DOWNLOAD ? "Downloaded " : "Saved ") + result.name + ".");
        } catch (e) {
            this.reportFailure(disk, e);
        }
    }

    /**
     * Ask for a format and save a copy of the disk in it.
     */
    private saveAs(disk: OpenDisk): void {
        openSaveAsSheet(disk, format => void this.saveAsFormat(disk, format));
    }

    /**
     * Save a copy of a disk in a format.
     */
    private async saveAsFormat(disk: OpenDisk, format: Parameters<typeof saveDiskAs>[1]): Promise<void> {
        try {
            const result = await saveDiskAs(disk, format);
            if (result !== undefined) {
                this.messages.toast((result.kind === SaveKind.DOWNLOAD ? "Downloaded " : "Saved ") + result.name + ".");
            }
        } catch (e) {
            this.reportFailure(disk, e);
        }
    }

    /**
     * Set or clear the image's write-protect flag.
     */
    private async setWriteProtect(disk: OpenDisk, writeProtected: boolean): Promise<void> {
        const outcome = await this.run(disk, () => protect(disk.session, writeProtected), changed =>
            [changed ? (writeProtected ? "Write-protected the image." : "Removed the image's write protection.") :
                "The image was already " + (writeProtected ? "write-protected." : "not write-protected.")]);
        if (!outcome.ok && disk.id === this.currentId) {
            // The switch moved, but nothing changed.
            this.renderDisk(disk);
        }
    }

    // ------------------------------------------------------------------ FilesViewHost.

    /** @inheritDoc */
    public otherDiskCount(): number {
        return Math.max(0, this.store.list().length - 1);
    }

    /** @inheritDoc */
    public selectionChanged(): void {
        const disk = this.currentDisk();
        if (disk !== undefined) {
            this.renderInspector(disk, this.stateOf(disk));
        }
    }

    /** @inheritDoc */
    public chooseFilesToAdd(): void {
        this.addInput.click();
    }

    /** @inheritDoc */
    public addDroppedFiles(files: File[]): void {
        const disk = this.currentDisk();
        if (disk === undefined || files.length === 0) {
            return;
        }

        const reason = disk.session.getReadOnlyReason();
        if (reason !== undefined) {
            this.messages.reportError(disk.id, "Can't add files: " + reason);
            return;
        }
        this.openAddSheet(disk, files, {
            title: "Add files to " + disk.name,
            subtitle: "Here's what will happen to each file. Nothing changes until you press Add, and Add can be undone.",
            copyMode: false,
        });
    }

    /**
     * Show the Add sheet for a disk.
     *
     * @param disk the disk to add to.
     * @param files the host files.
     * @param texts the sheet's words, and whether it's a copy from another disk.
     * @param afterAdd called with the result after a successful add.
     */
    private openAddSheet(disk: OpenDisk, files: File[],
                         texts: {title: string, subtitle: string, copyMode: boolean},
                         afterAdd?: (result: AddFilesResult) => void): void {

        const sheet = new AddSheet({
            disk,
            files,
            title: texts.title,
            subtitle: texts.subtitle,
            copyMode: texts.copyMode,
            perform: (plan, options) => this.performAdd(disk, plan, options, afterAdd),
        });
        sheet.open();
    }

    /**
     * Do an add from the sheet.
     *
     * @returns undefined on success, and otherwise the error for the sheet to show.
     */
    private async performAdd(disk: OpenDisk, plan: AddPlanItem[], options: AddActionOptions,
                             afterAdd: ((result: AddFilesResult) => void) | undefined): Promise<string | undefined> {

        const outcome = await this.run(disk, () => addPlanned(disk.session, plan, options), describeAdd);
        if (!outcome.ok) {
            return outcome.message;
        }

        // Select what was added, and show it.
        const state = this.stateOf(disk);
        state.view = ViewKind.FILES;
        state.selected = new Set(outcome.value.result.files.map(file => file.name));
        state.anchor = undefined;
        state.renaming = undefined;
        if (disk.id === this.currentId && !this.showingStart) {
            this.renderDisk(disk);
        }
        afterAdd?.(outcome.value.result);
        return undefined;
    }

    /** @inheritDoc */
    public async extract(rows: FileRow[]): Promise<void> {
        const disk = this.currentDisk();
        if (disk === undefined || rows.length === 0) {
            return;
        }

        const state = this.stateOf(disk);
        const options: ExtractOptions = {lowercase: state.extractLowercase, markDamaged: state.extractMarkDamaged};
        try {
            let result: ExtractResult;
            let line: string;
            if (rows.length === 1) {
                result = downloadFile(rows[0], options);
                line = "Downloaded " + result.written[0] + ".";
            } else {
                const zipName = disk.name.replace(/\.[^.]*$/, "") + ".zip";
                result = await downloadZip(rows, zipName, options);
                line = "Downloaded " + zipName + " with " + countOf(rows.length, "file") + ".";
            }
            this.messages.reportDone(disk.id, result.commandLine, [line]);
        } catch (e) {
            this.reportFailure(disk, e);
        }
    }

    /** @inheritDoc */
    public canExtractToFolder(): boolean {
        return "showDirectoryPicker" in window;
    }

    /** @inheritDoc */
    public async extractToFolder(rows: FileRow[]): Promise<void> {
        const disk = this.currentDisk();
        if (disk === undefined || rows.length === 0) {
            return;
        }

        const state = this.stateOf(disk);
        const options: ExtractOptions = {lowercase: state.extractLowercase, markDamaged: state.extractMarkDamaged};
        try {
            const picker = (window as unknown as {
                showDirectoryPicker(options: {mode: "readwrite"}): Promise<FileSystemDirectoryHandle>,
            }).showDirectoryPicker;
            let folder: FileSystemDirectoryHandle;
            try {
                folder = await picker.call(window, {mode: "readwrite"});
            } catch (e: any) {
                if (e?.name === "AbortError") {
                    return;
                }
                throw e;
            }

            const result = await extractToFolder(folder, rows, options);
            const lines = ["Wrote " + countOf(result.written.length, "file") + " to " + folder.name + "."];
            for (const skipped of result.skipped) {
                lines.push("Skipped " + skipped.path + ": " + skipped.reason + ".");
            }
            this.messages.reportDone(disk.id, result.commandLine, lines);
        } catch (e) {
            this.reportFailure(disk, e);
        }
    }

    /** @inheritDoc */
    public async rename(row: FileRow, newName: string): Promise<string | undefined> {
        const disk = this.currentDisk();
        if (disk === undefined) {
            return "There's no disk.";
        }

        const outcome = await this.run(disk, () => rename(disk.session, row.fullName, newName),
            result => ["Renamed " + result.oldName + " to " + result.newName + "."]);
        return outcome.ok ? undefined : outcome.message;
    }

    /** @inheritDoc */
    public attributes(rows: FileRow[]): void {
        const disk = this.currentDisk();
        const trsdos = disk?.session.fileSystem;
        if (disk === undefined || !(trsdos instanceof Trsdos)) {
            return;
        }

        const names = rows.map(row => row.fullName);
        const sheet = new AttributesSheet({
            rows,
            trsdos,
            apply: async (request: AttributeRequest) => {
                const outcome = await this.run(disk, () => attrib(disk.session, names, request), result =>
                    ["Changed " + result.files.join(", ") + ": " + describeChanges(result.changes, result.protectionNames) + "."]);
                return outcome.ok ? undefined : outcome.message;
            },
        });
        sheet.open();
    }

    /** @inheritDoc */
    public remove(rows: FileRow[]): void {
        const disk = this.currentDisk();
        if (disk === undefined || rows.length === 0) {
            return;
        }

        const title = rows.length === 1 ? "Delete " + rows[0].fullName + "?" : "Delete " + countOf(rows.length, "file") + "?";
        void confirmSheet(title, "The " + (rows.length === 1 ? "file is" : "files are") + " removed from the disk image " +
            "in memory. You can undo this until you close the page.", "Delete", true).then(async confirmed => {

            if (confirmed) {
                const names = rows.map(row => row.fullName);
                await this.run(disk, () => kill(disk.session, names),
                    removed => removed.map(name => "Removed " + name + "."));
            }
        });
    }

    /** @inheritDoc */
    public copyTo(rows: FileRow[]): void {
        const source = this.currentDisk();
        if (source === undefined) {
            return;
        }

        const targets = this.store.list().filter(disk => disk !== source);
        openCopySheet(rows.length, targets, target => this.copyFiles(rows, source, target));
    }

    /**
     * Show the Add sheet on the target disk, for files read from the source.
     */
    private copyFiles(rows: FileRow[], source: OpenDisk, target: OpenDisk): void {
        const files = rows.map(row => new File([row.bytes as BlobPart], row.hostName.substring(row.hostName.lastIndexOf("/") + 1),
            {lastModified: row.date?.getTime() ?? 0}));
        this.openAddSheet(target, files, {
            title: "Copy " + countOf(rows.length, "file") + " to " + target.name,
            subtitle: "From " + source.name + ". Here's what will happen to each file. Nothing changes until you " +
                "press Add, and Add can be undone on " + target.name + ".",
            copyMode: true,
        }, () => this.messages.toast("Copied " + countOf(rows.length, "file") + " to " + target.name + "."));
    }

    /** @inheritDoc */
    public openFullScreen(row: FileRow): void {
        const disk = this.currentDisk();
        if (disk === undefined) {
            return;
        }

        const state = this.stateOf(disk);
        const body = el("div", "fullscreen-body");
        const close = (): void => {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            this.renderInspector(disk, state);
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        };
        const overlay = el("div", "fullscreen",
            el("div", "fullscreen-head", el("h2", "mono", row.fullName), el("span", "sub", describeRow(row)),
                el("span", "grow"), makeButton("Close (Esc)", close)),
            body);
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-label", "Preview of " + row.fullName);
        document.body.append(overlay);
        document.addEventListener("keydown", onKey, true);
        renderPreviewPanel(body, row, {state});
    }
}
