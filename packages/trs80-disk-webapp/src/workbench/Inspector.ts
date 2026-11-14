import {DiskError, readDiskInfo} from "trs80-disk";
import {type FileRow} from "../core/FileRows.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {countOf, el, formatKilobytes, formatNumber, makeButton} from "../core/Dom.js";
import {getDiskFacts, getSpaceUse} from "../core/DiskFacts.js";
import {describeRow, renderPreviewPanel} from "./PreviewPanel.js";
import {renderSectorPanel} from "./SectorPanel.js";
import {type DiskViewState, ViewKind} from "./ViewState.js";
import {capitalize} from "./Text.js";

/**
 * What the inspector asks of the page.
 */
export interface InspectorHost {
    /** The color of a file's swatch, or undefined for none. */
    getColor(disk: OpenDisk, fullName: string): string | undefined;
    /** Open the file's preview full screen. */
    openFullScreen(row: FileRow): void;
    /** Download the files, or a ZIP of several. */
    extract(rows: FileRow[]): void;
    /** Show the file in the Files view, from a link in the sector panel. */
    showFile(name: string): void;
    /** The number of rows on the disk that are user files, for the details. */
    countFiles(disk: OpenDisk): {user: number, system: number};
}

/**
 * The panel on the right: the selected file's previews, a summary of several files, or the disk's details when
 * nothing is selected.
 */
export class Inspector {
    private readonly container: HTMLElement;
    private readonly host: InspectorHost;

    /**
     * @param container the element to fill.
     * @param host the page.
     */
    constructor(container: HTMLElement, host: InspectorHost) {
        this.container = container;
        this.host = host;
    }

    /**
     * Draw the inspector for a disk and its selection.
     *
     * @param disk the disk.
     * @param state its view state.
     * @param selected the selected files, in table order.
     */
    public render(disk: OpenDisk, state: DiskViewState, selected: FileRow[]): void {
        const showingSector = state.view === ViewKind.MAP && state.pickedSector !== undefined && !disk.session.isHardDisk();
        if (showingSector && state.pickedSector !== undefined) {
            renderSectorPanel(this.container, disk, state.pickedSector, name => this.host.showFile(name));
        } else if (selected.length === 0) {
            this.renderDetails(disk);
        } else if (selected.length === 1) {
            this.renderFile(disk, state, selected[0]);
        } else {
            this.renderSummary(disk, selected);
        }
    }

    /**
     * Make a swatch in a file's color.
     */
    private swatch(disk: OpenDisk, fullName: string): HTMLElement[] {
        const color = this.host.getColor(disk, fullName);
        if (color === undefined) {
            return [];
        }
        const swatch = el("span", "swatch");
        swatch.style.background = color;
        return [swatch];
    }

    /**
     * Show one file: its name, its previews, and buttons.
     */
    private renderFile(disk: OpenDisk, state: DiskViewState, row: FileRow): void {
        const preview = el("div");
        renderPreviewPanel(preview, row, {state});
        this.container.replaceChildren(
            this.makeFullScreenButton(row),
            el("h3", "", ...this.swatch(disk, row.fullName), row.fullName),
            el("div", "sub", describeRow(row)),
            preview,
            el("div", "actions", makeButton("Extract", () => this.host.extract([row]))));
    }

    /**
     * Make the icon button in the panel's upper-right corner that opens the file full screen: two arrows, one
     * pointing to the lower left and one to the upper right.
     */
    private makeFullScreenButton(row: FileRow): HTMLElement {
        const button = makeButton("", () => this.host.openFullScreen(row), "fullscreen-btn");
        button.title = "Open full screen";
        button.setAttribute("aria-label", "Open full screen");
        button.innerHTML = "<svg viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" " +
            "stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">" +
            "<path d=\"M10 2h4v4M14 2L9.5 6.5M6 14H2v-4M2 14l4.5-4.5\"/></svg>";
        return button;
    }

    /**
     * Show a summary of several selected files.
     */
    private renderSummary(disk: OpenDisk, rows: FileRow[]): void {
        const bytes = rows.reduce((sum, row) => sum + row.size, 0);
        const list = el("div", "mono filelist");
        for (const row of rows) {
            list.append(...this.swatch(disk, row.fullName), row.fullName, el("br"));
        }
        this.container.replaceChildren(
            el("h3", "", countOf(rows.length, "file")),
            el("div", "sub", formatNumber(bytes) + " bytes in all"),
            list,
            el("div", "actions", makeButton("Extract as ZIP", () => this.host.extract(rows))));
    }

    /**
     * Show the disk's details, for when no file is selected.
     */
    private renderDetails(disk: OpenDisk): void {
        const session = disk.session;
        const facts = getDiskFacts(session);
        const list = el("dl", "kv");
        const add = (term: string, value: string, className = ""): void => {
            list.append(el("dt", "", term), el("dd", className, className === "mono" ? value : capitalize(value)));
        };

        let title = disk.name;
        let diskDate = "";
        let autoCommand: string | undefined = undefined;
        try {
            const info = readDiskInfo(session);
            title = info.name === "" ? disk.name : info.name;
            diskDate = info.date;
            autoCommand = info.autoCommand;
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
        }

        add("File", disk.name, "mono");
        add("DOS", facts.dos);
        add("Format", facts.format);
        if (facts.shape !== undefined) {
            add("Shape", facts.shape);
        }
        if (facts.density !== undefined) {
            add("Density", facts.density);
        }
        const counts = this.host.countFiles(disk);
        add("Files", counts.user + (counts.system > 0 ? " (" + counts.system + " system)" : ""));
        const space = getSpaceUse(session);
        if (space !== undefined) {
            add("Free", formatKilobytes(space.freeBytes) + " of " + formatKilobytes(space.totalGranules * space.granuleBytes));
        }
        if (diskDate !== "") {
            add("Date", diskDate);
        }
        if (autoCommand !== undefined) {
            add("AUTO", autoCommand === "" ? "None" : autoCommand, "mono");
        }
        add("Changes", session.hasChanges() ? "Unsaved" : "None unsaved");

        this.container.replaceChildren(
            el("h3", "", title),
            el("div", "sub", facts.dos + " · " + facts.format + " · " + disk.name),
            list,
            el("p", "hint", "Select a file to see it here."));
    }
}
