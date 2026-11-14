import {decodeTrs80File} from "trs80-base";
import {DiskError, extractCommandLine, partitionDisplayName} from "trs80-disk";
import {assertNever} from "z80-base";
import {type ActionResult, choosePartition, redo, undo, kill} from "../core/Actions.js";
import {getDiskFacts, needsPartitionChoice} from "../core/DiskFacts.js";
import {boot, describeBoot} from "../core/Booting.js";
import {DiskStore} from "../core/DiskStore.js";
import {countOf, el} from "../core/Dom.js";
import {
    downloadFile, downloadZip, extractToFolder, type ExtractOptions, planExtraction,
} from "../core/Extracting.js";
import {type FileRow, getFileRows} from "../core/FileRows.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {
    DISK_IMAGE_ACCEPT, getDroppedInputs, openFiles, type OpenInput, type OpenResult, pickFiles, supportsFilePicker,
} from "../core/Opening.js";
import {
    availablePreviews, type PreviewFile, renderPreview,
} from "../core/preview/Previews.js";
import {previewFileOf} from "../core/preview/RowPreview.js";
import {downloadBlob, installUnsavedChangesWarning, saveDisk} from "../core/Saving.js";
import {SaveKind} from "../core/OpenDisk.js";
import {
    type ActionHost, openAddPlanDialog, openAttribDialog, openExtractDialog, openLabelDialog, openNewDiskDialog,
    openPatternDialog, openRenameDialog, type RunOutcome,
} from "./ActionDialogs.js";
import {type ArchiveListing, readArchive} from "./Archive.js";
import {DialogLayer} from "./Dialogs.js";
import {
    ensureFolderPermission, listFolder, looksLikeDiskImage, pickFolder, recallFolder, rememberFolder,
    supportsDirectoryPicker,
} from "./HostFolder.js";
import {infoHtmlOf} from "./InfoText.js";
import {
    archiveItems, type DiskFileItem, diskItems, folderItems, type HostFileItem, isMarkable, type Item, ItemKind, makeUpItem,
    type PartitionItem, wildcardTest, yourFilesItems,
} from "./Items.js";
import {mapHtmlOf} from "./MapText.js";
import {MessageLog} from "./MessageLog.js";
import {
    type DiskListingInfo, HostKind, nextPanelMode, Panel, type PanelRenderContext, PanelMode,
    panelModeToString,
} from "./Panel.js";
import {Viewer} from "./Viewer.js";

/**
 * The most bytes of a file on the user's computer that we read to preview it.
 */
const MAX_PREVIEW_BYTES = 4*1024*1024;

/**
 * The data type of a drag that starts on a panel's file row, so that the panels can tell it from files dragged in
 * from the desktop.
 */
const DRAG_TYPE = "application/x-disk-commander-files";

/**
 * What the commander says when a command is typed, until typed commands work.
 */
const TYPED_COMMANDS_MESSAGE = "Typed commands are coming soon. Until then, the function keys do what they say.";

/**
 * Whether a function key can be used now, and if not, why.
 */
interface KeyState {
    /** Whether the key does something. */
    enabled: boolean;
    /** Why it doesn't, for the tooltip and the message area, or "" if it does. */
    reason: string;
}

/** The labels of the function-key bar, by key number minus one. */
const FUNCTION_KEY_LABELS = ["Help", "Attrib", "View", "Label", "Copy", "Rename", "NewDisk", "Delete", "Panel", "Undo"];

/**
 * One section of the help: a heading, and either a paragraph or a list of keys and what they do.
 */
interface HelpSection {
    /** The heading. */
    heading: string;
    /** A paragraph under the heading, or undefined for none. */
    paragraph?: string | undefined;
    /** Each entry's keys (or name) and what it does. */
    entries?: [string, string][] | undefined;
}

/**
 * The help text.
 */
const HELP_SECTIONS: HelpSection[] = [
    {
        heading: "Panels",
        paragraph: "Disk Commander shows two panels side by side. Each can show a folder on your computer (or, in " +
            "browsers that can't open folders, a list called Your files), a ZIP file, or a TRS-80 disk image. A disk " +
            "image or a ZIP opens like a folder.",
    },
    {
        heading: "Moving and marking",
        entries: [
            ["Tab, Left, Right", "Switch panels. Left and Right work while the command line is empty."],
            ["Up, Down, Page Up, Page Down, Home, End", "Move the cursor."],
            ["Space, Insert", "Mark the file under the cursor and move down. Shift-click marks a range, and " +
                "Cmd-click or Ctrl-click marks one file."],
            ["+, -, *", "Mark by a pattern, unmark by a pattern, or invert the marks."],
            ["Enter", "Open a disk image, a ZIP, or a folder, or view a file."],
            ["Backspace", "Go back out of a disk, a ZIP, or a folder, like Enter on the .. row."],
            ["Alt-H", "Show or hide system files."],
        ],
    },
    {
        heading: "Booting",
        entries: [
            ["Alt-B", "Boot the floppy in the active panel in the TRS-80 emulator, as [Boot] does, on the model that " +
                "its DOS is for. The other panel's floppy goes in drive 1, and other open floppies in drives 2 and " +
                "3, write-protected. The DOS's writes stay in memory, as one change that Ctrl-Z undoes, until you " +
                "save. The emulator's panel has the model, a write-protect switch, Reset, and Close."],
        ],
    },
    {
        heading: "Opening",
        entries: [
            ["Ctrl-O, Cmd-O", "Choose disk image files to open in the active panel, as [Open Disk] does. Dropping " +
                "a disk image on a panel opens it there too. A ZIP of several disks opens as a folder of them."],
            ["Alt-O", "Choose a folder on your computer, as [Open Folder] does (or, in a browser that can't, files " +
                "for Your files, where Enter downloads the file under the cursor). Chrome won't open some " +
                "folders itself (Downloads, Desktop, Documents, or your home folder), but it will open a folder " +
                "inside them."],
        ],
    },
    {
        heading: "Function keys",
        entries: [
            ["F1", "This help."],
            ["F2", "Change the attributes of the marked files."],
            ["F3", "View the file under the cursor. In the viewer: F2 hex, F4 listing, F5 disassembly, F6 text, " +
                "F7 picture, Escape closes."],
            ["F4", "Edit the disk's label."],
            ["F5", "Copy the marked files to the other panel: from a folder to a disk is add, from a disk to a " +
                "folder is extract, and disk to disk is both. Dragging files to the other panel copies them too."],
            ["F6", "Rename the file under the cursor."],
            ["F7", "Make a new disk."],
            ["F8, Delete", "Delete the marked files."],
            ["F9", "Change what the other panel shows: a quick view of the file under the cursor, the disk's info, " +
                "the map, and back to its files."],
            ["F10, Ctrl-Z", "Undo the last change to the disk in the active panel. Shift-F10 or Shift-Ctrl-Z redoes it."],
            ["Ctrl-S", "Save the disk: back to its file where the browser allows it, into the folder for a new " +
                "disk, and as a download otherwise. Changes stay in memory until then."],
        ],
    },
    {
        heading: "The listing",
        entries: [
            ["Attr", "sys is a system file, hid is hidden, and pw has passwords. A protection level such as READ " +
                "follows when the file isn't fully accessible."],
        ],
    },
    {
        heading: "Commands",
        paragraph: "Under the panels, the message area shows the trs80-tool command that each action equals. " +
            "Typed commands are coming soon.",
    },
];

/**
 * Build the body of the help dialog from the sections: each has a heading, and a paragraph or a list of keys.
 */
function makeHelpBody(): HTMLElement {
    const body = el("div", "help");
    for (const section of HELP_SECTIONS) {
        body.append(el("h3", "", section.heading));
        if (section.paragraph !== undefined) {
            body.append(el("p", "wrap", section.paragraph));
        }
        if (section.entries !== undefined) {
            body.append(el("dl", "", ...section.entries.flatMap(([keys, text]) => [el("dt", "", keys), el("dd", "", text)])));
        }
    }
    return body;
}

/**
 * The commander page: two panels, the message area and command line, the function-key bar, and the viewer, with
 * the disks that they show. It owns the state and the keys, and runs every change through the core's actions.
 */
export class Commander implements ActionHost {
    /** The layer that dialogs open in. */
    public readonly dialogs: DialogLayer;

    private readonly store = new DiskStore();
    private readonly panels = [new Panel(0), new Panel(1)];
    private readonly log: MessageLog;
    private readonly viewer: Viewer;
    private readonly commandInput = document.getElementById("cmd") as HTMLInputElement;
    private readonly promptElement = document.getElementById("prompt") as HTMLElement;
    private readonly functionBar = document.getElementById("fkeys") as HTMLElement;
    private readonly panelsElement = document.getElementById("panels") as HTMLElement;
    private readonly fileInput = el("input");
    private readonly diskInput = el("input");

    private activeIndex = 0;
    private showSystem = false;
    private busy = 0;
    private refreshQueued = false;
    private quickSequence = 0;
    private rememberedFolder: FileSystemDirectoryHandle | undefined = undefined;
    private readonly yourFiles = new Map<string, File>();
    private readonly openDisks = new Map<string, OpenDisk>();
    private readonly diskKeys = new Map<OpenDisk, string>();
    private readonly homeFolders = new Map<OpenDisk, FileSystemDirectoryHandle>();
    private readonly listings = new Map<number, {rows: FileRow[], info: DiskListingInfo}>();
    private nextDropId = 1;
    private dragged: {panel: Panel, items: Item[]} | undefined = undefined;

    /**
     * Build the page's behavior on the static HTML (commander/index.html).
     */
    constructor() {
        this.dialogs = new DialogLayer(document.getElementById("layer") as HTMLElement);
        this.log = new MessageLog(document.getElementById("msgs") as HTMLElement);
        this.viewer = new Viewer(document.getElementById("viewerLayer") as HTMLElement, () => {
            this.positionViewer();
            this.renderFunctionBar();
        });
        for (const panel of this.panels) {
            this.panelsElement.append(panel.element);
        }

        this.fileInput.type = "file";
        this.fileInput.multiple = true;
        this.fileInput.hidden = true;
        this.fileInput.addEventListener("change", () => {
            void this.addYourFiles(Array.from(this.fileInput.files ?? []));
            this.fileInput.value = "";
        });
        document.body.append(this.fileInput);

        // The way to open disk images in a browser that has no file picker.
        this.diskInput.type = "file";
        this.diskInput.multiple = true;
        this.diskInput.accept = DISK_IMAGE_ACCEPT.join(",");
        this.diskInput.hidden = true;
        this.diskInput.addEventListener("change", () => {
            const files = Array.from(this.diskInput.files ?? []);
            this.diskInput.value = "";
            void this.handleDrop(this.active, files.map(file => ({file})));
        });
        document.body.append(this.diskInput);
        const folderButton = document.querySelector<HTMLElement>("[data-act=folder]");
        if (folderButton !== null && !supportsDirectoryPicker()) {
            folderButton.textContent = "[Choose Files]";
        }

        this.store.onChanged(() => this.scheduleRefresh());
        installUnsavedChangesWarning(this.store);
        this.installEvents();

        this.log.out("Fill a panel: drop a disk image on it, press Ctrl-O to open one, press F7 for a new disk, or choose a " +
            "folder (Alt-O). Tab switches panels. F1 is help.");
        this.renderAll();
        void recallFolder().then(handle => {
            this.rememberedFolder = handle;
            this.renderAll();
        });
    }

    // ------------------------------------------------------------------ State helpers.

    /**
     * The active panel.
     */
    private get active(): Panel {
        return this.panels[this.activeIndex];
    }

    /**
     * The panel that isn't active.
     */
    private get other(): Panel {
        return this.panels[1 - this.activeIndex];
    }

    /**
     * The folder that a panel is in, or undefined if it's not in a folder on the user's computer.
     */
    private folderOf(panel: Panel): FileSystemDirectoryHandle | undefined {
        const host = panel.host;
        return host !== undefined && host.kind === HostKind.FOLDER ? host.path[host.path.length - 1] : undefined;
    }

    /**
     * A name for where a panel is on the user's computer, which tells two files of the same name apart.
     */
    private locationKey(panel: Panel): string {
        const host = panel.host;
        if (host === undefined) {
            return "none";
        }
        switch (host.kind) {
            case HostKind.FOLDER:
                return "folder:" + host.path.map(folder => folder.name).join("/");
            case HostKind.YOUR_FILES:
                return "files";
            case HostKind.ARCHIVE:
                return "archive:" + host.id;
            default:
                assertNever(host);
        }
    }

    /**
     * The disk that is open for a file in a panel's listing, if the other panel has opened it.
     */
    private openDiskOf(panel: Panel, item: HostFileItem): OpenDisk | undefined {
        return this.openDisks.get(this.locationKey(panel) + "/" + item.name);
    }

    /**
     * What a panel needs to draw itself.
     */
    private renderContext(panel: Panel): PanelRenderContext {
        return {
            rememberedFolderName: this.rememberedFolder?.name,
            canPickFolder: supportsDirectoryPicker(),
            chooseFolder: () => void this.chooseFolder(),
            reopenFolder: () => void this.reopenFolder(),
            chooseFiles: () => this.fileInput.click(),
            openDisk: () => void this.openImageFiles(),
            newDisk: () => this.newDiskDialog(),
            openDiskOf: item => this.openDiskOf(panel, item),
        };
    }

    // ------------------------------------------------------------------ Listing and drawing.

    /**
     * The rows of a disk's files and what's known about the disk, kept until the disk changes.
     */
    private listingOf(disk: OpenDisk): {rows: FileRow[], info: DiskListingInfo} {
        const cached = this.listings.get(disk.id);
        if (cached !== undefined) {
            return cached;
        }

        const session = disk.session;
        const info: DiskListingInfo = {freeBytes: undefined, fileCount: 0, note: "", readOnlyReason: undefined};
        let rows: FileRow[] = [];
        if (!needsPartitionChoice(session)) {
            try {
                rows = getFileRows(session, this.showSystem);
                info.readOnlyReason = session.getReadOnlyReason();
                if (session.fileSystem === undefined) {
                    info.note = "No file system found";
                }
                info.fileCount = rows.length;
                info.freeBytes = session.getFreeSpace().freeBytes;
            } catch (e) {
                if (!(e instanceof DiskError)) {
                    throw e;
                }
                // The free space isn't known for every file system.
            }
        }
        const listing = {rows, info};
        this.listings.set(disk.id, listing);
        return listing;
    }

    /**
     * The items for the partitions of a hard disk image.
     */
    private partitionItems(disk: OpenDisk): PartitionItem[] {
        const session = disk.session;
        return session.getPartitions().map((partition, index) => ({
            kind: ItemKind.PARTITION as const,
            key: "p:" + (index + 1),
            number: index + 1,
            name: partitionDisplayName(partition, index + 1),
            description: partition.trsdos.nameAndVersion + " · " +
                countOf(partition.trsdos.getDirEntries(false).length, "file"),
            location: partition.partition.describeLocation(),
            readOnlyReason: session.partitionReadOnlyReason(partition),
        }));
    }

    /**
     * Rebuild the items of a panel that shows a disk.
     */
    private rebuildDiskItems(panel: Panel): void {
        const disk = panel.disk;
        if (disk === undefined) {
            return;
        }

        if (panel.choosingPartition) {
            panel.items = [makeUpItem(".."), ...this.partitionItems(disk)];
            panel.diskInfo = {freeBytes: undefined, fileCount: 0, note: "Choose the partition to work on", readOnlyReason: undefined};
        } else {
            const listing = this.listingOf(disk);
            panel.items = diskItems(listing.rows);
            panel.diskInfo = listing.info;
        }
        panel.clampCursor();
        panel.pruneMarks();
    }

    /**
     * Rebuild the items of a panel that shows a place on the user's computer, which reads the folder.
     */
    private async rebuildHostItems(panel: Panel): Promise<void> {
        const host = panel.host;
        let items: Item[] = [];
        if (host !== undefined) {
            switch (host.kind) {
                case HostKind.FOLDER: {
                    const folder = host.path[host.path.length - 1];
                    try {
                        items = folderItems(await listFolder(folder));
                    } catch (e) {
                        if (!(e instanceof DiskError)) {
                            throw e;
                        }
                        this.log.error(e.message);
                    }
                    if (host.path.length > 1) {
                        items.unshift(makeUpItem(".."));
                    }
                    break;
                }
                case HostKind.YOUR_FILES:
                    items = yourFilesItems(this.yourFiles);
                    break;
                case HostKind.ARCHIVE:
                    items = archiveItems(host.files);
                    break;
                default:
                    assertNever(host);
            }
        }
        if (panel.disk !== undefined || panel.host !== host) {
            // The panel changed while we read the folder.
            return;
        }
        panel.items = items;
        panel.clampCursor();
        panel.pruneMarks();
    }

    /**
     * Rebuild a panel's items from what it shows, and draw everything.
     */
    private async refreshPanel(panel: Panel): Promise<void> {
        if (panel.disk !== undefined) {
            this.rebuildDiskItems(panel);
        } else {
            await this.rebuildHostItems(panel);
        }
        this.renderAll();
    }

    /**
     * Ask for the panels to be rebuilt after a disk changes. Several changes in a row are rebuilt once.
     */
    private scheduleRefresh(): void {
        if (this.refreshQueued) {
            return;
        }
        this.refreshQueued = true;
        queueMicrotask(() => this.flushRefresh());
    }

    /**
     * Rebuild the panels that show disks, if a rebuild was asked for.
     */
    private flushRefresh(): void {
        if (!this.refreshQueued) {
            return;
        }
        this.refreshQueued = false;
        this.listings.clear();
        for (const panel of this.panels) {
            this.rebuildDiskItems(panel);
        }
        this.renderAll();
    }

    /**
     * Draw everything that depends on the state.
     */
    private renderAll(): void {
        for (const panel of this.panels) {
            this.renderPanel(panel);
        }
        this.updatePrompt();
        this.renderFunctionBar();
        this.focusCommandLine();
    }

    /**
     * Draw one panel, as its own list or as a view of the other panel.
     */
    private renderPanel(panel: Panel): void {
        if (panel.mode === PanelMode.FILES) {
            panel.renderList(panel.index === this.activeIndex, this.renderContext(panel));
        } else {
            this.renderViewPanel(panel);
        }
    }

    /**
     * Redraw the panels that show a view of the other panel, after the cursor or the disk changed.
     */
    private refreshViewPanels(): void {
        for (const panel of this.panels) {
            if (panel.mode !== PanelMode.FILES) {
                this.renderViewPanel(panel);
            }
        }
    }

    /**
     * Put what the active panel's prompt names in the command line's prompt: its disk, or its folder.
     */
    private updatePrompt(): void {
        const panel = this.active;
        const name = panel.disk !== undefined ? panel.disk.name : panel.host === undefined ? "" : panel.titleText();
        this.promptElement.textContent = (name === "" ? "" : name + " ") + "> ";
    }

    /**
     * Keep the command line focused, unless a dialog or the viewer wants the keys.
     */
    private focusCommandLine(): void {
        if (!this.dialogs.isOpen && !this.viewer.isOpen && document.activeElement !== this.commandInput) {
            this.commandInput.focus();
        }
    }

    /**
     * Fit the viewer above the function-key bar.
     */
    private positionViewer(): void {
        const layer = document.getElementById("viewerLayer") as HTMLElement;
        layer.style.setProperty("--fkeys-height", this.functionBar.offsetHeight + "px");
    }

    // ------------------------------------------------------------------ The view panels (F9).

    /**
     * The disk that the view panels are about: the active panel's, or the one that the cursor's disk image has open.
     */
    private subjectDisk(): OpenDisk | undefined {
        const panel = this.active;
        if (panel.disk !== undefined) {
            return panel.disk;
        }
        const item = panel.currentItem();
        return item !== undefined && item.kind === ItemKind.HOST_FILE ? this.openDiskOf(panel, item) : undefined;
    }

    /**
     * Draw a panel as a view of the other panel's subject.
     */
    private renderViewPanel(panel: Panel): void {
        const subject = this.panels[1 - panel.index];
        const item = subject.currentItem();
        let title: string;
        switch (panel.mode) {
            case PanelMode.QUICK:
                title = "Quick view: " + (item === undefined ? "" : item.kind === ItemKind.UP ? ".." : this.itemLabel(item));
                break;
            case PanelMode.INFO:
                title = "Info: " + (this.subjectDisk()?.name ?? "(not a disk)");
                break;
            case PanelMode.MAP:
                title = "Map: " + (this.subjectDisk()?.name ?? "(not a disk)");
                break;
            case PanelMode.FILES:
                return;
            default:
                assertNever(panel.mode);
        }

        const body = panel.renderViewShell(title);
        switch (panel.mode) {
            case PanelMode.QUICK:
                void this.fillQuickView(body, subject, item);
                break;
            case PanelMode.INFO: {
                const disk = this.subjectDisk();
                body.classList.add("pwrap");
                body.innerHTML = disk === undefined ? this.hintHtml("Put the cursor on a disk image and open it, or open a disk in the other panel.") :
                    infoHtmlOf(disk);
                break;
            }
            case PanelMode.MAP: {
                const disk = this.subjectDisk();
                if (disk === undefined) {
                    body.innerHTML = this.hintHtml("Put the cursor on a disk image and open it, or open a disk in the other panel.");
                } else if (needsPartitionChoice(disk.session)) {
                    body.innerHTML = this.hintHtml("Choose a partition first.");
                } else {
                    body.innerHTML = mapHtmlOf(disk.session, this.columnsOf(body)).html;
                }
                break;
            }
            default:
                assertNever(panel.mode);
        }
    }

    /**
     * A muted line of HTML for a view panel with nothing to show.
     */
    private hintHtml(text: string): string {
        const span = el("span", "muted", text);
        return span.outerHTML;
    }

    /**
     * How many characters of the monospace font fit across an element's content.
     */
    private columnsOf(element: HTMLElement): number {
        const probe = el("span", "", "0".repeat(40));
        probe.style.visibility = "hidden";
        probe.style.position = "absolute";
        element.append(probe);
        const characterWidth = probe.getBoundingClientRect().width/40;
        probe.remove();
        const style = getComputedStyle(element);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return characterWidth <= 0 ? 80 : Math.floor((element.clientWidth - padding)/characterWidth);
    }

    /**
     * A name for an item, for titles and messages.
     */
    private itemLabel(item: Item): string {
        switch (item.kind) {
            case ItemKind.UP:
                return item.name;
            case ItemKind.FOLDER:
            case ItemKind.HOST_FILE:
            case ItemKind.PARTITION:
                return item.name;
            case ItemKind.DISK_FILE:
                return item.row.fullName;
            default:
                assertNever(item);
        }
    }

    /**
     * Fill a quick view with a preview of the file under the cursor.
     *
     * @param body the view's body.
     * @param subject the panel whose cursor it follows.
     * @param item the item under that cursor.
     */
    private async fillQuickView(body: HTMLElement, subject: Panel, item: Item | undefined): Promise<void> {
        const sequence = ++this.quickSequence;
        body.classList.add("pview");
        if (item === undefined || item.kind === ItemKind.UP || item.kind === ItemKind.FOLDER) {
            body.innerHTML = this.hintHtml("Move the cursor to a file to see it here.");
            return;
        }
        if (item.kind === ItemKind.PARTITION) {
            body.innerHTML = this.hintHtml("Press Enter to work on this partition.");
            return;
        }

        let file: PreviewFile;
        if (item.kind === ItemKind.DISK_FILE) {
            file = previewFileOf(item.row);
        } else {
            if (looksLikeDiskImage(item.name)) {
                const open = this.openDiskOf(subject, item);
                body.innerHTML = this.hintHtml(open === undefined ? "A disk image. Press Enter to open it in this panel's place." :
                    "A disk image that's open. Switch the other panel to Info or Map to see it.");
                return;
            }
            body.innerHTML = this.hintHtml("Reading " + item.name + "…");
            const loaded = await this.readHostPreview(item.file);
            if (sequence !== this.quickSequence) {
                return;
            }
            if (typeof loaded === "string") {
                body.innerHTML = this.hintHtml(loaded);
                return;
            }
            file = loaded;
        }

        const kind = availablePreviews(file.trs80File, file.binary)[0];
        body.replaceChildren(renderPreview(kind, file));
    }

    /**
     * Read a file on the user's computer for previewing.
     *
     * @param file the file.
     * @returns the preview input, or a message for a file that's too big.
     */
    private async readHostPreview(file: File): Promise<PreviewFile | string> {
        if (file.size > MAX_PREVIEW_BYTES) {
            return file.name + " is too big to preview (" + countOf(file.size, "byte") + ").";
        }
        const binary = new Uint8Array(await file.arrayBuffer());
        return {name: file.name, binary, trs80File: decodeTrs80File(binary, {filename: file.name})};
    }

    // ------------------------------------------------------------------ The function-key bar.

    /**
     * Whether the disk in a panel can be written, and if not, why.
     *
     * @param panel the panel.
     * @returns the reason, or undefined if it can be.
     */
    private writeBlocker(panel: Panel): string | undefined {
        const disk = panel.disk;
        if (disk === undefined) {
            return "Open a disk in this panel first.";
        }
        if (panel.choosingPartition) {
            return "Choose a partition first.";
        }
        return disk.session.getReadOnlyReason();
    }

    /**
     * Whether a function key does something now, and if not, why not.
     *
     * @param number the key's number.
     */
    private keyState(number: number): KeyState {
        const ok: KeyState = {enabled: true, reason: ""};
        const no = (reason: string): KeyState => ({enabled: false, reason});
        const panel = this.active;
        const item = panel.currentItem();
        const diskFiles = panel.chosenItems().filter(chosen => chosen.kind === ItemKind.DISK_FILE);
        const blocker = this.writeBlocker(panel);
        switch (number) {
            case 1:
            case 7:
            case 9:
                return ok;
            case 2:
                if (blocker !== undefined) {
                    return no(blocker);
                }
                if (diskFiles.length === 0) {
                    return no("Put the cursor on a file, or mark some.");
                }
                return diskFiles.every(chosen => (chosen as DiskFileItem).row.attributes !== undefined) ? ok :
                    no("This file system has no attributes to change.");
            case 3:
                return item !== undefined && (item.kind === ItemKind.DISK_FILE || item.kind === ItemKind.HOST_FILE) ? ok :
                    no("Put the cursor on a file to view it.");
            case 4:
                return blocker !== undefined ? no(blocker) : ok;
            case 5: {
                if (panel.chosenItems().length === 0) {
                    return no("Put the cursor on a file, or mark some.");
                }
                if (this.other.mode !== PanelMode.FILES) {
                    return no("The other panel is showing " + panelModeToString(this.other.mode) + ". F9 brings its files back.");
                }
                if (panel.disk === undefined && this.other.disk === undefined) {
                    return no("Both panels are on your computer. Open a disk in one of them.");
                }
                return ok;
            }
            case 6:
                if (blocker !== undefined) {
                    return no(blocker);
                }
                return item !== undefined && item.kind === ItemKind.DISK_FILE ? ok : no("Put the cursor on a file.");
            case 8:
                if (panel.disk === undefined) {
                    return no("Files on your computer aren't deleted here.");
                }
                if (blocker !== undefined) {
                    return no(blocker);
                }
                return diskFiles.length > 0 ? ok : no("Put the cursor on a file, or mark some.");
            case 10: {
                const disk = panel.disk;
                if (disk === undefined) {
                    return no("Open a disk in this panel first.");
                }
                return disk.session.getHistory().position > 0 || disk.session.getHistory().entries.length > 0 ? ok :
                    no("There's nothing to undo.");
            }
            default:
                return no("");
        }
    }

    /**
     * Draw the function-key bar: the page's keys, or the viewer's while it's open.
     */
    private renderFunctionBar(): void {
        const keys: {number: number, label: string, enabled: boolean, reason: string}[] = [];
        if (this.viewer.isOpen) {
            for (const key of this.viewer.keys()) {
                keys.push({...key, reason: ""});
            }
        } else {
            for (let number = 1; number <= 10; number++) {
                keys.push({number, label: FUNCTION_KEY_LABELS[number - 1], ...this.keyState(number)});
            }
        }

        this.functionBar.replaceChildren(...keys.map(key => {
            const button = el("button", key.enabled ? "" : "off", el("b", "", String(key.number)), el("i", "", key.label));
            button.type = "button";
            button.dataset.fk = String(key.number);
            button.tabIndex = -1;
            if (!key.enabled && key.reason !== "") {
                button.title = key.reason;
            }
            return button;
        }));
    }

    // ------------------------------------------------------------------ Events.

    /**
     * Listen for keys, clicks and drops.
     */
    private installEvents(): void {
        document.addEventListener("keydown", event => this.onKeydown(event));
        document.addEventListener("click", event => this.onClick(event));
        document.addEventListener("dblclick", event => {
            if (!this.dialogs.isOpen && !this.viewer.isOpen && (event.target as HTMLElement).closest("[data-row]") !== null) {
                void this.enter();
            }
        });
        document.addEventListener("dragstart", event => this.onDragStart(event));
        document.addEventListener("dragend", () => {
            this.dragged = undefined;
            this.panels.forEach(panel => panel.element.classList.remove("over"));
        });
        document.addEventListener("dragover", event => {
            const target = this.dropTargetOf(event);
            if (this.dragged !== undefined && event.dataTransfer !== null &&
                Array.from(event.dataTransfer.types).includes(DRAG_TYPE)) {

                // Files dragged from a panel: the other panel takes them as a copy.
                if (target !== undefined && target !== this.dragged.panel) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                }
                for (const panel of this.panels) {
                    panel.element.classList.toggle("over", panel === target && target !== this.dragged.panel);
                }
            } else if (event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes("Files")) {
                // Without this, the browser would navigate to the file.
                event.preventDefault();
                for (const panel of this.panels) {
                    panel.element.classList.toggle("over", panel === this.panelOfElement(event.target));
                }
            }
        });
        document.addEventListener("dragleave", event => {
            if (event.relatedTarget === null) {
                this.panels.forEach(panel => panel.element.classList.remove("over"));
            }
        });
        document.addEventListener("drop", event => {
            this.panels.forEach(panel => panel.element.classList.remove("over"));
            const dragged = this.dragged;
            if (dragged !== undefined && event.dataTransfer !== null &&
                Array.from(event.dataTransfer.types).includes(DRAG_TYPE)) {

                event.preventDefault();
                this.dragged = undefined;
                const target = this.dropTargetOf(event);
                if (target !== undefined && target !== dragged.panel && !this.dialogs.isOpen && !this.viewer.isOpen &&
                    this.busy === 0) {

                    // Dropping on the other panel is F5: the same dialogs, and never a move.
                    if (this.activeIndex !== dragged.panel.index) {
                        this.setActive(dragged.panel.index);
                    }
                    void this.copyItems(dragged.panel, target, dragged.items);
                }
                return;
            }
            if (event.dataTransfer === null || !Array.from(event.dataTransfer.types).includes("Files")) {
                return;
            }
            event.preventDefault();
            const targetPanel = this.panelOfElement(event.target) ?? this.active;
            // The drop's data is only good until this handler returns, so ask for everything now.
            void getDroppedInputs(event.dataTransfer).then(inputs => this.handleDrop(targetPanel, inputs));
        });
    }

    /**
     * The panel that an element is in.
     *
     * @param target an event's target.
     * @returns the panel, or undefined if the element isn't in one.
     */
    private panelOfElement(target: EventTarget | null): Panel | undefined {
        const panelElement = target instanceof Element ? target.closest<HTMLElement>(".panel") : null;
        return this.panels.find(panel => panel.element === panelElement);
    }

    /**
     * The panel that a drag event is over, if it can take a drop: one that shows files.
     */
    private dropTargetOf(event: DragEvent): Panel | undefined {
        const panel = this.panelOfElement(event.target);
        return panel !== undefined && panel.mode === PanelMode.FILES ? panel : undefined;
    }

    /**
     * A drag starts on a file's row: remember what's dragged, which is the marked files if the dragged file is one
     * of them and otherwise just the dragged file.
     */
    private onDragStart(event: DragEvent): void {
        const rowElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row]") : null;
        const panel = this.panelOfElement(event.target);
        if (rowElement === null || panel === undefined || panel.mode !== PanelMode.FILES) {
            return;
        }
        if (this.dialogs.isOpen || this.viewer.isOpen || this.busy > 0) {
            event.preventDefault();
            return;
        }

        const item = panel.items[Number(rowElement.dataset.row)];
        if (item === undefined || !isMarkable(item) || event.dataTransfer === null) {
            event.preventDefault();
            return;
        }
        const items = panel.marks.has(item.key) ? panel.chosenItems() : [item];
        this.dragged = {panel, items};
        event.dataTransfer.setData(DRAG_TYPE, String(items.length));
        event.dataTransfer.effectAllowed = "copy";
    }

    /**
     * A click on the page: a function-key button, or a panel's row.
     */
    private onClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (this.dialogs.isOpen) {
            return;
        }

        const actionButton = target.closest<HTMLElement>("[data-act]");
        if (actionButton !== null) {
            if (!this.viewer.isOpen && this.busy === 0) {
                void this.pressActionButton(actionButton.dataset.act);
            }
            return;
        }
        const keyButton = target.closest<HTMLElement>("[data-fk]");
        if (keyButton !== null) {
            void this.pressFunctionKey(Number(keyButton.dataset.fk), false);
            return;
        }
        if (this.viewer.isOpen) {
            return;
        }

        const panelElement = target.closest<HTMLElement>(".panel");
        const panel = this.panels.find(candidate => candidate.element === panelElement);
        if (panel !== undefined && panel.mode === PanelMode.FILES) {
            const rowElement = target.closest<HTMLElement>("[data-row]");
            if (this.activeIndex !== panel.index && this.other.mode === PanelMode.FILES) {
                this.setActive(panel.index);
            }
            if (rowElement !== null && this.active === panel) {
                const previous = panel.currentItem();
                panel.cursor = Number(rowElement.dataset.row);
                const item = panel.currentItem();
                if (event.shiftKey && item !== undefined) {
                    // Mark everything from the last one clicked or marked to this one.
                    this.markRange(panel, panel.anchorKey ?? previous?.key, item);
                } else if ((event.metaKey || event.ctrlKey) && item !== undefined && isMarkable(item)) {
                    this.toggleMark(panel, item);
                    panel.anchorKey = item.key;
                } else if (item !== undefined) {
                    panel.anchorKey = item.key;
                }
                panel.updateCursor();
                this.afterCursorMove();
            }
        }
        this.focusCommandLine();
    }

    /**
     * Make a panel the active one.
     */
    private setActive(index: number): void {
        this.activeIndex = index;
        this.panels.forEach(panel => panel.setActive(panel.index === index));
        this.updatePrompt();
        this.afterCursorMove();
    }

    /**
     * Redraw what follows the active panel's cursor: the view panels, the prompt, and the function-key bar.
     */
    private afterCursorMove(): void {
        this.refreshViewPanels();
        this.updatePrompt();
        this.renderFunctionBar();
    }

    /**
     * A key press anywhere on the page. The function keys are caught (so that F5 doesn't reload the page, nor F3
     * search, nor F1 open help) and act unless a dialog is open; the rest go to the dialog, the viewer, the panels,
     * or the command line.
     */
    private onKeydown(event: KeyboardEvent): void {
        const functionKey = /^F(\d+)$/.exec(event.key);
        const functionNumber = functionKey === null ? 0 : Number(functionKey[1]);
        const isFunctionKey = functionNumber >= 1 && functionNumber <= 10 && !event.ctrlKey && !event.metaKey && !event.altKey;
        if (isFunctionKey) {
            event.preventDefault();
        }

        if (this.dialogs.isOpen) {
            // A dialog's fields get the keys. The function keys are caught above, so that they don't reload the
            // page, but they do nothing here.
            this.dialogs.handleKeydown(event);
            return;
        }
        if (this.busy > 0) {
            return;
        }

        if (this.viewer.isOpen) {
            if (isFunctionKey && functionNumber === 1) {
                this.showHelp();
            } else {
                this.viewer.handleKeydown(event);
            }
            return;
        }

        if (isFunctionKey) {
            void this.pressFunctionKey(functionNumber, event.shiftKey);
            return;
        }

        if (this.handleShortcut(event)) {
            return;
        }

        this.handlePanelKey(event);
    }

    /**
     * The keys with Ctrl, Cmd or Alt: undo, redo, save, open, boot and the toggle for system files.
     *
     * @returns whether the key was one of them.
     */
    private handleShortcut(event: KeyboardEvent): boolean {
        const command = (event.metaKey || event.ctrlKey) && !event.altKey;
        const key = event.key.toLowerCase();
        if (command && key === "z") {
            event.preventDefault();
            this.undoRedo(event.shiftKey);
            return true;
        }
        if (command && key === "s") {
            event.preventDefault();
            void this.saveActive();
            return true;
        }
        if (command && key === "o") {
            event.preventDefault();
            void this.openImageFiles();
            return true;
        }
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyO") {
            event.preventDefault();
            void this.chooseFolderOrFiles();
            return true;
        }
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyB") {
            event.preventDefault();
            void this.bootActive();
            return true;
        }
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyH") {
            event.preventDefault();
            this.showSystem = !this.showSystem;
            this.log.out(this.showSystem ? "Showing system files." : "Hiding system files.");
            this.listings.clear();
            this.refreshNow();
            return true;
        }
        return false;
    }

    /**
     * Do what a button in the title bar does.
     *
     * @param act the button's data-act.
     */
    private async pressActionButton(act: string | undefined): Promise<void> {
        switch (act) {
            case "open":
                await this.openImageFiles();
                break;
            case "folder":
                await this.chooseFolderOrFiles();
                break;
            case "boot":
                await this.bootActive();
                break;
            default:
                console.error("Unknown title bar button: " + act);
                break;
        }
    }

    /**
     * Alt-B and [Boot]: boot the floppy in the active panel in the emulator, and wait until the user closes it. The
     * other panel's disk goes in drive 1, and the other open disks after it.
     */
    private async bootActive(): Promise<void> {
        const disk = this.active.disk;
        if (disk === undefined) {
            this.log.error("Boot works on the disk in the active panel, and this panel isn't showing one. " +
                "Enter opens the disk image under the cursor.");
            return;
        }

        const otherDisk = this.other.disk;
        const others = this.store.list().filter(open => open !== otherDisk);
        if (otherDisk !== undefined) {
            others.unshift(otherDisk);
        }
        await this.run(disk, () => boot(disk, others), describeBoot);
    }

    /**
     * Alt-O and [Open Folder]: choose a folder, or in a browser that can't, files for Your files.
     */
    private async chooseFolderOrFiles(): Promise<void> {
        if (supportsDirectoryPicker()) {
            await this.chooseFolder();
        } else {
            this.fileInput.click();
        }
    }

    /**
     * Rebuild the panels that show disks now, and draw everything.
     */
    private refreshNow(): void {
        this.refreshQueued = true;
        this.flushRefresh();
    }

    /**
     * The keys that move, mark and open, and the command line's. Typing goes to the command line unless the key is
     * a panel key, and the panel keys that are also letters or symbols (Space, +, -, *, Delete, Backspace) belong
     * to the panels only while the command line is empty.
     */
    private handlePanelKey(event: KeyboardEvent): void {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        this.focusCommandLine();
        const empty = this.commandInput.value === "";
        const panel = this.active;

        if (event.key === "Tab") {
            event.preventDefault();
            this.switchPanel(1 - this.activeIndex);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            if (empty) {
                void this.enter();
            } else {
                this.log.error(TYPED_COMMANDS_MESSAGE);
            }
            return;
        }
        if (event.key === "Escape") {
            if (!empty) {
                event.preventDefault();
                this.commandInput.value = "";
            }
            return;
        }
        if (event.key === "Insert") {
            event.preventDefault();
            this.markAndMoveDown(panel);
            return;
        }
        if (!empty) {
            return;
        }

        switch (event.key) {
            case "ArrowLeft":
            case "ArrowRight":
                event.preventDefault();
                this.switchPanel(event.key === "ArrowLeft" ? 0 : 1);
                break;
            case "ArrowUp":
                event.preventDefault();
                this.moveCursor(-1);
                break;
            case "ArrowDown":
                event.preventDefault();
                this.moveCursor(1);
                break;
            case "PageUp":
                event.preventDefault();
                this.moveCursor(-this.pageSize());
                break;
            case "PageDown":
                event.preventDefault();
                this.moveCursor(this.pageSize());
                break;
            case "Home":
                event.preventDefault();
                this.moveCursor(-panel.items.length);
                break;
            case "End":
                event.preventDefault();
                this.moveCursor(panel.items.length);
                break;
            case " ":
                event.preventDefault();
                this.markAndMoveDown(panel);
                break;
            case "+":
                event.preventDefault();
                this.markByPattern(true);
                break;
            case "-":
                event.preventDefault();
                this.markByPattern(false);
                break;
            case "*":
                event.preventDefault();
                this.invertMarks(panel);
                break;
            case "Backspace":
                event.preventDefault();
                void this.goUp();
                break;
            case "Delete":
                event.preventDefault();
                void this.pressFunctionKey(8, false);
                break;
            default:
                break;
        }
    }

    /**
     * Tab, Left and Right: make a panel the active one, unless the panel that's now active is showing a view of the
     * other, which has no files to switch between.
     *
     * @param index the panel to switch to, 0 on the left and 1 on the right.
     */
    private switchPanel(index: number): void {
        if (index === this.activeIndex) {
            return;
        }
        if (this.other.mode === PanelMode.FILES) {
            this.setActive(index);
        } else {
            this.log.error("The other panel is showing " + panelModeToString(this.other.mode) + ". F9 brings its files back.");
        }
    }

    /**
     * How many rows a Page Up or Page Down moves: a screenful of the active panel.
     */
    private pageSize(): number {
        const rows = this.active.element.querySelector(".rows");
        return rows === null ? 15 : Math.max(1, Math.floor(rows.clientHeight/20) - 1);
    }

    /**
     * Move the active panel's cursor.
     *
     * @param delta how many rows, up (negative) or down.
     */
    private moveCursor(delta: number): void {
        const panel = this.active;
        panel.cursor = Math.max(0, Math.min(panel.items.length - 1, panel.cursor + delta));
        panel.updateCursor();
        this.afterCursorMove();
    }

    /**
     * Mark or unmark an item.
     */
    private toggleMark(panel: Panel, item: Item): void {
        if (panel.marks.has(item.key)) {
            panel.marks.delete(item.key);
        } else {
            panel.marks.add(item.key);
        }
        panel.updateMarks();
    }

    /**
     * Mark the files from one item to another, in either order, as Shift-click does (and unmark the rest, as the
     * workbench does).
     *
     * @param panel the panel.
     * @param anchorKey the key of the item to start from, or undefined to mark just the clicked one.
     * @param item the item that was clicked.
     */
    private markRange(panel: Panel, anchorKey: string | undefined, item: Item): void {
        const index = panel.items.indexOf(item);
        const anchorIndex = anchorKey === undefined ? -1 : panel.items.findIndex(candidate => candidate.key === anchorKey);
        const from = anchorIndex < 0 ? index : anchorIndex;
        panel.marks.clear();
        for (let i = Math.min(from, index); i <= Math.max(from, index); i++) {
            if (isMarkable(panel.items[i])) {
                panel.marks.add(panel.items[i].key);
            }
        }
        panel.anchorKey = anchorKey ?? item.key;
        panel.updateMarks();
    }

    /**
     * Space and Insert: mark the item under the cursor and move down.
     */
    private markAndMoveDown(panel: Panel): void {
        const item = panel.currentItem();
        if (item !== undefined && isMarkable(item)) {
            this.toggleMark(panel, item);
            panel.anchorKey = item.key;
        }
        this.moveCursor(1);
    }

    /**
     * "+" and "-": ask for a pattern and mark or unmark the files that match.
     *
     * @param adding whether to mark.
     */
    private markByPattern(adding: boolean): void {
        const panel = this.active;
        openPatternDialog(this, adding, pattern => {
            if (pattern.trim() === "") {
                return "Type a pattern.";
            }
            const matches = wildcardTest(pattern);
            let count = 0;
            for (const item of panel.items) {
                if (isMarkable(item) && matches(this.matchName(item))) {
                    count++;
                    if (adding) {
                        panel.marks.add(item.key);
                    } else {
                        panel.marks.delete(item.key);
                    }
                }
            }
            panel.updateMarks();
            this.log.out((adding ? "Marked " : "Unmarked ") + countOf(count, "file") + " matching " + pattern.trim() + ".");
            return undefined;
        });
    }

    /**
     * The name that a wildcard pattern is matched against.
     */
    private matchName(item: Item): string {
        return item.kind === ItemKind.DISK_FILE ? item.row.hostName : this.itemLabel(item);
    }

    /**
     * "*": mark the files that aren't marked, and unmark the ones that are.
     */
    private invertMarks(panel: Panel): void {
        for (const item of panel.items) {
            if (isMarkable(item)) {
                this.toggleMark(panel, item);
            }
        }
        panel.updateMarks();
    }

    // ------------------------------------------------------------------ Opening and leaving.

    /**
     * Enter: open what's under the cursor.
     */
    private async enter(): Promise<void> {
        const panel = this.active;
        const item = panel.currentItem();
        if (item === undefined) {
            if (panel.disk === undefined && panel.host === undefined) {
                // Enter on an empty panel reopens the remembered folder, or chooses one.
                if (this.rememberedFolder !== undefined) {
                    await this.reopenFolder();
                } else if (supportsDirectoryPicker()) {
                    await this.chooseFolder();
                } else {
                    this.fileInput.click();
                }
            }
            return;
        }

        switch (item.kind) {
            case ItemKind.UP:
                await this.goUp();
                break;
            case ItemKind.FOLDER: {
                const host = panel.host;
                if (host !== undefined && host.kind === HostKind.FOLDER) {
                    host.path.push(item.handle);
                    panel.cursor = 0;
                    panel.marks.clear();
                    await this.refreshPanel(panel);
                }
                break;
            }
            case ItemKind.HOST_FILE:
                if (looksLikeDiskImage(item.name)) {
                    await this.openImageItem(panel, item);
                } else if (panel.host?.kind === HostKind.YOUR_FILES) {
                    // Your files is a list of files that the browser gave us, which can only leave as downloads.
                    downloadBlob(item.file, item.name);
                    this.log.out("Downloaded " + item.name + ".");
                } else {
                    await this.view();
                }
                break;
            case ItemKind.DISK_FILE:
                await this.view();
                break;
            case ItemKind.PARTITION:
                this.choosePartitionItem(panel, item);
                break;
            default:
                assertNever(item);
        }
    }

    /**
     * Backspace and the ".." row: go back out of a disk, out of a ZIP, or up a folder.
     */
    private async goUp(): Promise<void> {
        const panel = this.active;
        if (panel.disk !== undefined) {
            await this.leaveDisk(panel);
            return;
        }

        const host = panel.host;
        if (host !== undefined && host.kind === HostKind.ARCHIVE) {
            // Out of a ZIP: back to where the panel was before it, with the cursor on the ZIP if it's there.
            panel.host = host.parent;
            panel.marks.clear();
            panel.anchorKey = undefined;
            await this.rebuildHostItems(panel);
            const zipIndex = panel.items.findIndex(item => item.key === "f:" + host.name);
            panel.cursor = zipIndex < 0 ? 0 : zipIndex;
            this.renderAll();
            return;
        }
        if (host !== undefined && host.kind === HostKind.FOLDER && host.path.length > 1) {
            const left = host.path.pop();
            panel.marks.clear();
            await this.rebuildHostItems(panel);
            const index = panel.items.findIndex(item => item.key === "d:" + left?.name);
            panel.cursor = index < 0 ? 0 : index;
            this.renderAll();
        }
    }

    /**
     * Open a disk image from a panel's listing, in that panel.
     */
    private async openImageItem(panel: Panel, item: HostFileItem): Promise<void> {
        const key = this.locationKey(panel) + "/" + item.name;
        const existing = this.openDisks.get(key);
        if (existing !== undefined) {
            await this.showDisk(panel, existing, key);
            return;
        }

        try {
            const archive = await readArchive(item.file);
            if (archive !== undefined) {
                await this.showArchive(panel, archive);
                return;
            }
            const result = await openFiles([{file: item.file, handle: item.handle}]);
            await this.adoptOpenResult(panel, result, key);
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Open files that were dropped or chosen. A ZIP that holds several files is shown in the panel as a folder named
     * after it, with a row for each file; everything else is opened as disks.
     *
     * @param panel the panel that gets the result.
     * @param inputs the files.
     * @returns what opening gave, or undefined if the panel was given a ZIP's folder instead.
     */
    private async openInputs(panel: Panel, inputs: OpenInput[]): Promise<OpenResult | undefined> {
        if (inputs.length === 1) {
            const archive = await readArchive(inputs[0].file);
            if (archive !== undefined) {
                await this.showArchive(panel, archive);
                return undefined;
            }
        }
        return openFiles(inputs);
    }

    /**
     * Show a ZIP's files in a panel as a folder. Going out of it returns to where the panel was.
     *
     * @param panel the panel.
     * @param archive what the ZIP held.
     */
    private async showArchive(panel: Panel, archive: ArchiveListing): Promise<void> {
        const closed = await this.closePanelDisk(panel);
        if (!closed) {
            return;
        }
        panel.host = {
            kind: HostKind.ARCHIVE, id: this.nextDropId++, name: archive.name, files: archive.files, parent: panel.host,
        };
        // The cursor starts on the first file, below the row that goes back out.
        panel.cursor = 1;
        panel.marks.clear();
        panel.anchorKey = undefined;
        this.log.out(archive.name + " holds " + countOf(archive.files.size, "file") + ". Enter opens a disk, and Backspace goes back out.");
        await this.refreshPanel(panel);
    }

    /**
     * Put an opened disk in a panel, and say what became of the files that weren't disks.
     *
     * @param panel the panel.
     * @param result what opening gave.
     * @param key the key to find the disk by, or undefined for a disk that has no place in a listing.
     */
    private async adoptOpenResult(panel: Panel, result: OpenResult, key: string | undefined): Promise<void> {
        for (const file of result.unopened) {
            this.log.error("Can't open " + file.name + ": " + file.message);
        }
        if (result.disks.length === 0) {
            this.renderAll();
            return;
        }

        const [disk, ...extra] = result.disks;
        for (const unused of extra) {
            unused.dispose();
        }
        if (extra.length > 0) {
            this.log.out("The file held " + result.disks.length + " disks. Opened the first, " + disk.name + ".");
        }
        await this.showDisk(panel, disk, key ?? "drop:" + this.nextDropId++ + "/" + disk.name);
    }

    /**
     * Show a disk in a panel, replacing what the panel showed. If the panel showed another disk with unsaved changes,
     * the user is asked what to do with them.
     *
     * @param panel the panel.
     * @param disk the disk. It joins the store if it isn't there.
     * @param key the key that finds the disk again.
     */
    private async showDisk(panel: Panel, disk: OpenDisk, key: string): Promise<void> {
        const closed = await this.closePanelDisk(panel);
        if (!closed) {
            if (!this.store.list().includes(disk)) {
                // A disk that was just opened or made, and that nobody has, is let go.
                disk.dispose();
            }
            return;
        }

        this.store.add(disk);
        this.openDisks.set(key, disk);
        this.diskKeys.set(disk, key);
        panel.disk = disk;
        panel.choosingPartition = needsPartitionChoice(disk.session);
        panel.marks.clear();
        this.rebuildDiskItems(panel);
        panel.cursor = Math.min(1, panel.items.length - 1);
        this.log.out("Opened " + disk.name + ": " + getDiskFacts(disk.session).dos + ".");
        this.renderAll();
    }

    /**
     * Stop showing the panel's disk, asking about unsaved changes first.
     *
     * @param panel the panel.
     * @returns false if the user cancelled, in which case the panel keeps its disk.
     */
    private async closePanelDisk(panel: Panel): Promise<boolean> {
        const disk = panel.disk;
        if (disk === undefined) {
            return true;
        }

        const shownElsewhere = this.panels.some(other => other !== panel && other.disk === disk);
        if (!shownElsewhere && disk.session.hasChanges()) {
            const choice = await this.askAboutChanges(disk);
            if (choice === "cancel") {
                return false;
            }
            if (choice === "save") {
                const saved = await this.save(disk);
                if (!saved) {
                    return false;
                }
            }
        }

        panel.disk = undefined;
        panel.choosingPartition = false;
        panel.marks.clear();
        if (!shownElsewhere) {
            this.releaseDisk(disk);
        }
        return true;
    }

    /**
     * Ask what to do with a disk's unsaved changes.
     */
    private askAboutChanges(disk: OpenDisk): Promise<"save" | "discard" | "cancel"> {
        return new Promise(resolve => {
            let answer: "save" | "discard" | "cancel" = "cancel";
            this.dialogs.open({
                title: "Unsaved changes",
                body: [el("p", "wrap", disk.name + " has changes that aren't saved. " +
                    (disk.saveKind === SaveKind.DOWNLOAD ? "Saving downloads the image." : "Saving writes the image back to its file."))],
                buttons: [
                    {label: "Save", action: () => {
                        answer = "save";
                        return undefined;
                    }},
                    {label: "Discard changes", action: () => {
                        answer = "discard";
                        return undefined;
                    }},
                ],
                onClosed: () => resolve(answer),
            });
        });
    }

    /**
     * Forget a disk that no panel shows.
     */
    private releaseDisk(disk: OpenDisk): void {
        if (this.panels.some(panel => panel.disk === disk)) {
            return;
        }
        const key = this.diskKeys.get(disk);
        if (key !== undefined) {
            this.openDisks.delete(key);
        }
        this.diskKeys.delete(disk);
        this.homeFolders.delete(disk);
        this.listings.delete(disk.id);
        if (!this.store.remove(disk)) {
            disk.dispose();
        }
    }

    /**
     * Go back out of a disk: to the partition list for a hard disk with a partition chosen, and otherwise to the
     * place the panel was in, with the cursor on the disk's image.
     */
    private async leaveDisk(panel: Panel): Promise<void> {
        const disk = panel.disk;
        if (disk === undefined) {
            return;
        }

        const session = disk.session;
        if (session.isHardDisk() && !panel.choosingPartition && session.getPartitions().length > 1) {
            panel.choosingPartition = true;
            panel.marks.clear();
            this.rebuildDiskItems(panel);
            const chosen = session.selectedPartitionNumber;
            panel.cursor = chosen === undefined ? 1 : chosen;
            this.renderAll();
            return;
        }

        const key = this.diskKeys.get(disk);
        const closed = await this.closePanelDisk(panel);
        if (!closed) {
            return;
        }
        await this.rebuildHostItems(panel);
        const prefix = this.locationKey(panel) + "/";
        const name = key !== undefined && key.startsWith(prefix) ? key.substring(prefix.length) : undefined;
        const index = panel.items.findIndex(item => item.kind === ItemKind.HOST_FILE && item.name === name);
        panel.cursor = index < 0 ? 0 : index;
        this.renderAll();
    }

    /**
     * Choose a partition of a hard disk, and list its files.
     */
    private choosePartitionItem(panel: Panel, item: PartitionItem): void {
        const disk = panel.disk;
        if (disk === undefined) {
            return;
        }
        try {
            const result = choosePartition(disk.session, item.number);
            this.log.command(disk.name, result.commandLine);
            this.log.out("Working on " + item.name + ": " + item.description + ".");
            panel.choosingPartition = false;
            panel.marks.clear();
            this.listings.delete(disk.id);
            this.rebuildDiskItems(panel);
            panel.cursor = Math.min(1, panel.items.length - 1);
            this.renderAll();
        } catch (e) {
            this.reportFailure(disk, e);
        }
    }

    // ------------------------------------------------------------------ Choosing folders and files.

    /**
     * Let the user choose a folder, and show it in the active panel.
     */
    private async chooseFolder(): Promise<void> {
        try {
            const folder = await pickFolder();
            if (folder === undefined) {
                return;
            }
            this.rememberedFolder = folder;
            void rememberFolder(folder);
            await this.showFolder(folder);
        } catch (e: any) {
            // The picker refuses (a SecurityError) when it wasn't started by a click or a key, and Chrome also
            // refuses folders that hold system files.
            this.log.error("Can't open a folder: " + (e?.message ?? String(e)));
            if (e?.name === "SecurityError") {
                this.log.error("Chrome won't open some folders itself (Downloads, Desktop, Documents, or your home " +
                    "folder), but it will open a folder inside them. To open a disk image, use Ctrl-O.");
            }
        }
    }

    /**
     * Reopen the folder that an earlier visit remembered. The browser asks the user to allow it.
     */
    private async reopenFolder(): Promise<void> {
        const folder = this.rememberedFolder;
        if (folder === undefined) {
            return;
        }
        const allowed = await ensureFolderPermission(folder);
        if (!allowed) {
            this.log.error("The browser didn't allow access to " + folder.name + ".");
            return;
        }
        await this.showFolder(folder);
    }

    /**
     * Show a folder in the active panel.
     */
    private async showFolder(folder: FileSystemDirectoryHandle): Promise<void> {
        const panel = this.active;
        const closed = await this.closePanelDisk(panel);
        if (!closed) {
            return;
        }
        panel.host = {kind: HostKind.FOLDER, path: [folder]};
        panel.cursor = 0;
        panel.marks.clear();
        this.log.out("Showing the folder " + folder.name + ".");
        await this.refreshPanel(panel);
    }

    /**
     * Ctrl-O and [Open Disk]: choose disk image files and open the first in the active panel. Browsers without a
     * file picker use a file input that shows disk images.
     */
    private async openImageFiles(): Promise<void> {
        if (!supportsFilePicker()) {
            this.diskInput.click();
            return;
        }

        try {
            const handles = await pickFiles();
            if (handles.length === 0) {
                return;
            }
            const inputs: OpenInput[] = [];
            for (const handle of handles) {
                inputs.push({file: await handle.getFile(), handle});
            }
            const panel = this.active;
            const result = await this.openInputs(panel, inputs);
            if (result !== undefined) {
                await this.adoptOpenResult(panel, result, undefined);
            }
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    /**
     * Add files to "Your files" and show that list in the active panel.
     */
    private async addYourFiles(files: File[]): Promise<void> {
        if (files.length === 0) {
            return;
        }
        for (const file of files) {
            this.yourFiles.set(file.name, file);
        }
        const panel = this.active;
        if (panel.host === undefined || panel.host.kind !== HostKind.YOUR_FILES) {
            const closed = await this.closePanelDisk(panel);
            if (!closed) {
                return;
            }
            panel.host = {kind: HostKind.YOUR_FILES};
            panel.cursor = 0;
            panel.marks.clear();
        }
        this.log.out("Your files has " + countOf(this.yourFiles.size, "file") + ".");
        await this.refreshPanel(panel);
    }

    /**
     * Files were dropped on a panel: disk images open in it, and other files are added to the disk it shows, or else
     * go to "Your files".
     */
    private async handleDrop(target: Panel, inputs: OpenInput[]): Promise<void> {
        if (inputs.length === 0) {
            return;
        }
        if (this.dialogs.isOpen || this.viewer.isOpen) {
            return;
        }
        if (target.mode !== PanelMode.FILES) {
            // A panel that shows a view of the other has no files to put a disk in.
            target = this.active;
        } else if (target !== this.active) {
            this.setActive(target.index);
        }

        try {
            const result = await this.openInputs(target, inputs);
            if (result === undefined) {
                return;
            }
            if (result.disks.length > 0) {
                await this.adoptOpenResult(target, result, undefined);
            }
            if (result.unopened.length > 0 && result.disks.length === 0) {
                const files = result.unopened.map(unopened => unopened.file);
                const blocker = target.disk === undefined ? "No disk here." : this.writeBlocker(target);
                if (target.disk !== undefined && blocker === undefined) {
                    this.copyHostFilesToDisk(target, files, "the files you dropped");
                } else {
                    if (target.disk !== undefined && blocker !== undefined) {
                        this.log.error("Can't add files to " + target.disk.name + ": " + blocker + " They're in Your files instead.");
                    }
                    this.setActive(target.index);
                    await this.addYourFiles(files);
                }
            }
        } catch (e) {
            this.reportFailure(undefined, e);
        }
    }

    // ------------------------------------------------------------------ Running actions.

    /** @inheritDoc */
    public async run<T>(disk: OpenDisk, action: () => ActionResult<T> | Promise<ActionResult<T>>,
                        describe: (result: T) => string[]): Promise<RunOutcome<T>> {

        this.busy++;
        try {
            const result = await action();
            this.log.command(disk.name, result.commandLine);
            const lines = describe(result.result);
            if (lines.length > 0) {
                this.log.out(lines.join("\n"));
            }
            return {ok: true, value: result.result};
        } catch (e) {
            return {ok: false, message: this.reportFailure(disk, e)};
        } finally {
            this.busy--;
            this.flushRefresh();
        }
    }

    /**
     * Show an error to the user, and return the message that they were shown. A DiskError is a problem with the
     * request; anything else is a bug, which goes to the console.
     */
    private reportFailure(disk: OpenDisk | undefined, e: unknown): string {
        let message: string;
        if (e instanceof DiskError) {
            message = e.message;
        } else {
            console.error(e);
            message = "Something went wrong. The browser's console has the details.";
        }
        this.log.error((disk === undefined ? "" : disk.name + ": ") + message);
        return message;
    }

    // ------------------------------------------------------------------ The function keys.

    /**
     * Do what a function key does, or say why it can't.
     *
     * @param number the key's number, from 1 to 10.
     * @param shift whether Shift was held, which makes F10 redo.
     */
    private async pressFunctionKey(number: number, shift: boolean): Promise<void> {
        if (this.dialogs.isOpen || this.busy > 0) {
            return;
        }

        if (this.viewer.isOpen) {
            if (number === 1) {
                this.showHelp();
            } else {
                this.viewer.pressKey(number);
            }
            return;
        }

        const state = this.keyState(number);
        if (!state.enabled) {
            if (state.reason !== "") {
                this.log.error(FUNCTION_KEY_LABELS[number - 1] + ": " + state.reason);
            }
            return;
        }

        switch (number) {
            case 1:
                this.showHelp();
                break;
            case 2:
                this.attribute();
                break;
            case 3:
                await this.view();
                break;
            case 4:
                if (this.active.disk !== undefined) {
                    openLabelDialog(this, this.active.disk);
                }
                break;
            case 5:
                await this.copy();
                break;
            case 6:
                this.renameCurrent();
                break;
            case 7:
                this.newDiskDialog();
                break;
            case 8:
                await this.deleteChosen();
                break;
            case 9:
                this.cyclePanelMode();
                break;
            case 10:
                this.undoRedo(shift);
                break;
            default:
                break;
        }
    }

    /**
     * F1: show the help.
     */
    private showHelp(): void {
        this.dialogs.open({title: "Help", body: [makeHelpBody()], buttons: [{label: "OK", action: () => undefined}], cancelLabel: ""});
    }

    /**
     * F9: change what the other panel shows.
     */
    private cyclePanelMode(): void {
        const panel = this.other;
        panel.mode = nextPanelMode(panel.mode);
        this.log.out("The other panel shows " + panelModeToString(panel.mode) + ".");
        this.renderAll();
    }

    /**
     * F2: change the attributes of the marked files.
     */
    private attribute(): void {
        const disk = this.active.disk;
        if (disk === undefined) {
            return;
        }
        const rows = this.active.chosenItems().filter((item): item is DiskFileItem => item.kind === ItemKind.DISK_FILE)
            .map(item => item.row);
        openAttribDialog(this, disk, rows);
    }

    /**
     * F6: rename the file under the cursor.
     */
    private renameCurrent(): void {
        const panel = this.active;
        const disk = panel.disk;
        const item = panel.currentItem();
        if (disk === undefined || item === undefined || item.kind !== ItemKind.DISK_FILE) {
            return;
        }
        openRenameDialog(this, disk, item.row, () => undefined);
    }

    /**
     * F7: make a new disk, and open it in the active panel.
     */
    private newDiskDialog(): void {
        const folder = this.folderOf(this.active) ?? this.folderOf(this.other);
        const where = folder === undefined ? "In memory" : "In the folder " + folder.name;
        openNewDiskDialog(this, where, made => void this.adoptNewDisk(made.disk, folder, made.commandLine,
            made.result.systemCopy === undefined ? "Made a blank data disk." :
                "Made a copy of the " + made.result.systemCopy.description + "."));
    }

    /**
     * Show a new disk in the active panel.
     */
    private async adoptNewDisk(disk: OpenDisk, folder: FileSystemDirectoryHandle | undefined, commandLine: string,
                               description: string): Promise<void> {

        const panel = this.active;
        const key = "new:" + this.nextDropId++ + "/" + disk.name;
        if (folder !== undefined) {
            this.homeFolders.set(disk, folder);
        }
        await this.showDisk(panel, disk, key);
        if (panel.disk === disk) {
            this.log.command(disk.name, commandLine);
            this.log.out(description + " It isn't saved until you press Ctrl-S.");
        } else {
            this.homeFolders.delete(disk);
        }
    }

    /**
     * F8 and Delete: delete the marked files, after asking.
     */
    private async deleteChosen(): Promise<void> {
        const panel = this.active;
        const disk = panel.disk;
        if (disk === undefined) {
            return;
        }
        const rows = panel.chosenItems().filter((item): item is DiskFileItem => item.kind === ItemKind.DISK_FILE)
            .map(item => item.row);
        if (rows.length === 0) {
            return;
        }

        const names = rows.map(row => row.fullName);
        const confirmed = await this.dialogs.confirm(
            rows.length === 1 ? "Delete " + names[0] + "?" : "Delete " + countOf(rows.length, "file") + "?",
            (rows.length === 1 ? "The file is" : "The files are") + " removed from the disk image in memory. You can undo " +
                "this with F10 until you close the disk.", "Delete");
        if (!confirmed) {
            return;
        }
        const outcome = await this.run(disk, () => kill(disk.session, names), removed => removed.map(name => "Removed " + name + "."));
        if (outcome.ok) {
            panel.marks.clear();
        }
    }

    /**
     * F10, Ctrl-Z, Shift-F10 and Shift-Ctrl-Z: undo or redo on the active panel's disk.
     *
     * @param redoing whether to redo.
     */
    private undoRedo(redoing: boolean): void {
        const disk = this.active.disk;
        if (disk === undefined) {
            this.log.error((redoing ? "Redo" : "Undo") + " works on the disk in the active panel, and this panel isn't showing one.");
            return;
        }

        const result = redoing ? redo(disk.session) : undo(disk.session);
        const labels = result.result.labels;
        this.log.command(disk.name, result.commandLine);
        if (labels.length === 0) {
            this.log.out("Nothing to " + (redoing ? "redo." : "undo."));
        } else {
            this.log.out((redoing ? "Redid: " : "Undid: ") + labels.join(", ") + ".");
        }
        this.flushRefresh();
    }

    // ------------------------------------------------------------------ Viewing.

    /**
     * F3: view the file under the cursor, full screen.
     */
    private async view(): Promise<void> {
        const panel = this.active;
        const item = panel.currentItem();
        if (item === undefined) {
            return;
        }

        switch (item.kind) {
            case ItemKind.DISK_FILE: {
                const row = item.row;
                this.viewer.open({
                    title: "View: " + row.fullName + " (" + (panel.disk?.name ?? "") + ")",
                    file: previewFileOf(row),
                    size: row.size,
                });
                break;
            }
            case ItemKind.HOST_FILE: {
                if (looksLikeDiskImage(item.name)) {
                    await this.openImageItem(panel, item);
                    return;
                }
                const loaded = await this.readHostPreview(item.file);
                if (typeof loaded === "string") {
                    this.log.error(loaded);
                    return;
                }
                this.viewer.open({title: "View: " + item.name + " (on your computer)", file: loaded, size: item.size});
                break;
            }
            case ItemKind.UP:
            case ItemKind.FOLDER:
            case ItemKind.PARTITION:
                break;
            default:
                assertNever(item);
        }
    }

    // ------------------------------------------------------------------ Copying.

    /**
     * F5: copy the marked files to the other panel. What happens follows from the two sides: a folder (or Your
     * files) to a disk adds; a disk to a folder extracts into it, or downloads if the other panel has no folder;
     * and a disk to a disk copies the files' bytes and adds them.
     */
    private async copy(): Promise<void> {
        await this.copyItems(this.active, this.other, this.active.chosenItems());
    }

    /**
     * Copy items from one panel to the other, as F5 does. Dragging files from one panel to the other does this too.
     *
     * @param source the panel that has the items.
     * @param destination the other panel.
     * @param items the items to copy.
     */
    private async copyItems(source: Panel, destination: Panel, items: Item[]): Promise<void> {
        if (items.length === 0) {
            return;
        }
        if (source.disk === undefined) {
            const files = items.filter((item): item is HostFileItem => item.kind === ItemKind.HOST_FILE);
            if (files.some(file => looksLikeDiskImage(file.name))) {
                this.log.error("A disk image isn't copied as a file. Open it with Enter, then mark its files.");
                return;
            }
            const disk = destination.disk;
            const blocker = this.writeBlocker(destination);
            if (disk === undefined || blocker !== undefined) {
                this.log.error(disk === undefined ? "Open a disk in the other panel to copy files to." :
                    "Can't change " + disk.name + ": " + blocker);
                return;
            }
            this.copyHostFilesToDisk(destination, files.map(file => file.file), "your computer", source);
            return;
        }

        const rows = items.filter((item): item is DiskFileItem => item.kind === ItemKind.DISK_FILE).map(item => item.row);
        if (rows.length === 0) {
            return;
        }
        if (destination.disk !== undefined) {
            this.copyDiskFilesToDisk(source, destination, rows);
        } else {
            this.extractRows(source, destination, rows);
        }
    }

    /**
     * Show the add plan for files from the user's computer (or from the other disk).
     *
     * @param target the panel whose disk gets the files.
     * @param files the files.
     * @param from where they come from, in words.
     * @param sourcePanel the panel whose marks are cleared after a successful add.
     */
    private copyHostFilesToDisk(target: Panel, files: File[], from: string, sourcePanel?: Panel): void {
        const disk = target.disk;
        if (disk === undefined || files.length === 0) {
            return;
        }

        openAddPlanDialog(this, {
            disk,
            files,
            title: "Copy " + countOf(files.length, "file") + " to " + disk.name,
            subtitle: "From " + from + ". Here's what will happen to each file. This can be undone.",
            copyMode: false,
            afterAdd: result => {
                sourcePanel?.marks.clear();
                this.refreshNow();
                this.moveCursorToFile(target, result.files.map(file => file.name)[0]);
            },
        });
    }

    /**
     * Copy files between two disks: their bytes, then the same add plan as for the destination. Only the
     * destination's history records it.
     */
    private copyDiskFilesToDisk(source: Panel, destination: Panel, rows: FileRow[]): void {
        const disk = destination.disk;
        const sourceDisk = source.disk;
        const blocker = this.writeBlocker(destination);
        if (disk === undefined || sourceDisk === undefined) {
            return;
        }
        if (blocker !== undefined) {
            this.log.error("Can't change " + disk.name + ": " + blocker);
            return;
        }

        const files = rows.map(row => new File([row.bytes as BlobPart], row.hostName.substring(row.hostName.lastIndexOf("/") + 1),
            {lastModified: row.date?.getTime() ?? 0}));
        openAddPlanDialog(this, {
            disk,
            files,
            title: "Copy " + countOf(files.length, "file") + " to " + disk.name,
            subtitle: "From " + sourceDisk.name + ", byte for byte. Here's what will happen to each file. " +
                "This can be undone.",
            copyMode: true,
            afterAdd: result => {
                source.marks.clear();
                this.refreshNow();
                this.moveCursorToFile(destination, result.files.map(file => file.name)[0]);
            },
        });
    }

    /**
     * Put a disk panel's cursor on a file.
     *
     * @param panel the panel.
     * @param name the file's name as the disk shows it, or undefined to leave the cursor.
     */
    private moveCursorToFile(panel: Panel, name: string | undefined): void {
        if (name === undefined) {
            return;
        }
        const index = panel.items.findIndex(item => item.kind === ItemKind.DISK_FILE && item.row.fullName === name);
        if (index >= 0) {
            panel.cursor = index;
            panel.updateCursor();
            this.afterCursorMove();
        }
    }

    /**
     * Extract files from a disk: into the other panel's folder, into Your files, or as a download if the other panel
     * has neither.
     */
    private extractRows(source: Panel, destination: Panel, rows: FileRow[]): void {
        const disk = source.disk;
        if (disk === undefined) {
            return;
        }

        const folder = this.folderOf(destination);
        const host = destination.host;
        const toYourFiles = host !== undefined && host.kind === HostKind.YOUR_FILES;
        const destinationText = folder !== undefined ? "the folder " + folder.name : toYourFiles ? "Your files" : "your downloads";

        openExtractDialog(this, rows, destinationText, async (options: ExtractOptions) => {
            try {
                if (folder !== undefined) {
                    const allowed = await ensureFolderPermission(folder);
                    if (!allowed) {
                        return "The browser didn't allow writing to " + folder.name + ".";
                    }
                    const result = await extractToFolder(folder, rows, options);
                    this.log.command(disk.name, result.commandLine);
                    this.log.out([...result.written.map(path => "Extracted " + path + "."),
                        ...result.skipped.map(skipped => "Skipped " + skipped.path + ": " + skipped.reason + ".")].join("\n"));
                } else if (toYourFiles) {
                    const planned = planExtraction(rows, options);
                    for (const file of planned) {
                        const name = file.path[file.path.length - 1];
                        this.yourFiles.set(name, new File([file.bytes as BlobPart], name,
                            {lastModified: file.date?.getTime() ?? Date.now()}));
                    }
                    this.log.command(disk.name, extractCommandLine(rows.map(row => row.fullName), {
                        outDir: undefined, as: undefined,
                        lowercase: options.lowercase === true ? true : undefined,
                        markDamaged: options.markDamaged === true ? true : undefined,
                    }));
                    this.log.out(planned.map(file => "Extracted " + file.path.join("/") + " to Your files.").join("\n"));
                } else if (rows.length === 1) {
                    const result = downloadFile(rows[0], options);
                    this.log.command(disk.name, result.commandLine);
                    this.log.out("Downloaded " + result.written[0] + ".");
                } else {
                    const result = await downloadZip(rows, disk.name.replace(/\.[^.]*$/, "") + ".zip", options);
                    this.log.command(disk.name, result.commandLine);
                    this.log.out("Downloaded " + countOf(result.written.length, "file") + " as a ZIP.");
                }
            } catch (e) {
                return this.reportFailure(disk, e);
            }

            source.marks.clear();
            if (destination.disk === undefined) {
                await this.refreshPanel(destination);
            }
            return undefined;
        });
    }

    // ------------------------------------------------------------------ Saving.

    /**
     * Ctrl-S: save the disk in the active panel.
     */
    private async saveActive(): Promise<void> {
        const disk = this.active.disk;
        if (disk === undefined) {
            this.log.error("Ctrl-S saves the disk in the active panel, and this panel isn't showing one.");
            return;
        }
        if (!disk.session.hasChanges()) {
            this.log.out("No changes to save in " + disk.name + ".");
            return;
        }
        const saved = await this.save(disk);
        if (saved) {
            await this.refreshFolderPanels();
        }
    }

    /**
     * Save a disk: back to its handle where the browser gave one, into the folder it was made in, or as a download.
     *
     * @param disk the disk.
     * @returns whether it was saved (or downloaded).
     */
    private async save(disk: OpenDisk): Promise<boolean> {
        this.busy++;
        try {
            if (disk.handle === undefined) {
                const folder = this.homeFolders.get(disk);
                if (folder !== undefined) {
                    const handle = await this.createFileInFolder(folder, disk.name);
                    if (handle === undefined) {
                        return false;
                    }
                    disk.setFile(disk.name, handle);
                }
            }

            const kind = disk.saveKind;
            const result = await saveDisk(disk);
            this.log.out((kind === SaveKind.DOWNLOAD ? "Downloaded " : "Saved ") + result.name + ".");
            return true;
        } catch (e) {
            this.reportFailure(disk, e);
            return false;
        } finally {
            this.busy--;
            this.flushRefresh();
        }
    }

    /**
     * Rebuild the listings of the panels that are in folders, after a file may have been written there.
     */
    private async refreshFolderPanels(): Promise<void> {
        await Promise.all(this.panels.filter(panel => panel.disk === undefined && panel.host?.kind === HostKind.FOLDER)
            .map(panel => this.rebuildHostItems(panel)));
        this.renderAll();
    }

    /**
     * Make a file in a folder for a new disk to be saved in, asking before replacing one that's already there.
     *
     * @returns the file's handle, or undefined if the user chose not to replace the file.
     */
    private async createFileInFolder(folder: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle | undefined> {
        let exists = true;
        try {
            await folder.getFileHandle(name);
        } catch (e: any) {
            if (e?.name !== "NotFoundError") {
                throw new DiskError("Can't look in the folder \"" + folder.name + "\": " + (e.message ?? String(e)));
            }
            exists = false;
        }
        if (exists) {
            const replace = await this.dialogs.confirm("Replace " + name + "?",
                "The folder " + folder.name + " already has a file named " + name + ". Saving replaces it.", "Replace");
            if (!replace) {
                return undefined;
            }
        }

        try {
            return await folder.getFileHandle(name, {create: true});
        } catch (e: any) {
            throw new DiskError("Can't create \"" + name + "\" in the folder \"" + folder.name + "\": " + (e.message ?? String(e)));
        }
    }
}
