import {PageTab} from "./PageTab";
import {Density, numberToSide, ScpFloppyDisk, ScpSector, Side} from "trs80-base";
import {makeTextButton} from "./Utils";
import {HtmlHexdumpGenerator} from "./HtmlHexdumpGenerator";
import {clearElement} from "teamten-ts-utils";

const LEGEND_FOR_LETTER: { [letter: string]: string } = {
    "-": "Missing sector",
    "C": "CRC error",
    "X": "Deleted sector",
    "S": "Single density",
    "D": "Double density",
}

const CLASS_FOR_LETTER: { [letter: string]: string } = {
    "-": "sector-missing",
    "C": "sector-crc-error",
    "X": "sector-deleted",
    "S": "sector-single",
    "D": "sector-double",
}

/**
 * Whether the user is selecting whole bytes or bitcells.
 */
export enum SelectionMode { BYTES, BITCELLS }

/**
 * When adjusting the selection, whether changing one of its ends, or creating it from scratch.
 */
enum SelectionAdjustMode { LEFT, CREATE, RIGHT }

/**
 * Listener for selection changes.
 */
type SelectionListener = (selection: Selection) => void;

/**
 * Keep track of the selected track and sector.
 */
class Selection {
    public trackNumber = 0;
    public sectorNumber = 0;
    private listeners: SelectionListener[] = [];

    /**
     * Update the selection.
     */
    public set(trackNumber: number, sectorNumber: number): void {
        this.trackNumber = trackNumber;
        this.sectorNumber = sectorNumber;

        for (const listener of [... this.listeners]) {
            listener(this);
        }
    }

    /**
     * Add a listener for changes to the selection.
     *
     * @return a function to remove the listener.
     */
    public addListener(listener: SelectionListener): () => void {
        this.listeners.push(listener);

        return () => {
            const i = this.listeners.indexOf(listener);
            if (i >= 0) {
                this.listeners.splice(i, 1);
            }
        };
    }
}

/**
 * Tile for displaying whole-disk information, like the sector map.
 */
class ScpDiskTile {
    public readonly scp: ScpFloppyDisk;
    public readonly selection: Selection;
    public readonly top: HTMLElement;
    public sectorTable: HTMLTableElement;

    public constructor(scp: ScpFloppyDisk, selection: Selection) {
        this.scp = scp;
        this.selection = selection;
        this.top = document.createElement("div");
        this.top.classList.add("scp-disk-tile");

        this.sectorTable = document.createElement("table");
        this.top.append(this.sectorTable);

        selection.addListener(() => {
            this.update();
        });
    }

    public update(): void {
        const newTable = document.createElement("table");
        newTable.classList.add("sector-table"); // TODO remove default border/padding.

        const geometry = this.scp.getGeometry();
        const minSectorNumber = Math.min(geometry.firstTrack.firstSector, geometry.lastTrack.firstSector);
        const maxSectorNumber = Math.max(geometry.firstTrack.lastSector, geometry.lastTrack.lastSector);

        const sideNumber = 0; // TODO provide UI to choose this.
        const side = numberToSide(sideNumber);
        const sideName = side === Side.FRONT ? "Front" : "Back";
        let row = document.createElement("tr");
        newTable.append(row);
        row.append(document.createElement("th"));
        for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
            const th = document.createElement("th");
            th.classList.add("sector-number");
            th.innerText = sectorNumber.toString();
            row.append(th);
        }

        const usedLetters = new Set<string>();
        for (let trackNumber = geometry.firstTrack.trackNumber; trackNumber <= geometry.lastTrack.trackNumber; trackNumber++) {
            row = document.createElement("tr");
            newTable.append(row);
            const th = document.createElement("th");
            th.classList.add("track-number");
            th.innerText = trackNumber.toString();
            row.append(th);
            for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
                const sectorData = this.scp.readSector(trackNumber, side, sectorNumber);
                let text: string;
                if (sectorData === undefined) {
                    text = "-";
                } else if (sectorData.crcError) {
                    text = "C";
                } else if (sectorData.deleted) {
                    text = "X";
                } else if (sectorData.density === Density.SINGLE) {
                    text = "S";
                } else {
                    text = "D";
                }

                usedLetters.add(text);
                const td = document.createElement("td");
                td.classList.add("sector-info-cell");
                const className = CLASS_FOR_LETTER[text];
                if (className !== undefined) {
                    td.classList.add(className);
                }
                if (trackNumber === this.selection.trackNumber && sectorNumber === this.selection.sectorNumber) {
                    td.classList.add("selected");
                }
                td.innerText = text;
                td.addEventListener("click", () => this.selection.set(trackNumber, sectorNumber));
                row.append(td);
            }
        }

        if (usedLetters.size > 0) {
            row = document.createElement("tr");
            newTable.append(row);
            const td = document.createElement("td");
            td.colSpan = maxSectorNumber - minSectorNumber + 2;
            row.append(td);

            const legendContainer = document.createElement("div");
            td.append(legendContainer);
            legendContainer.classList.add("sector-info-legend");

            // Make sorted array to make it deterministic.
            const legendLetters = Array.from(usedLetters.values()).sort();

            for (const legendLetter of legendLetters) {
                const explanation = LEGEND_FOR_LETTER[legendLetter] ?? "Unknown";
                const cssClass = CLASS_FOR_LETTER[legendLetter];

                const legend = document.createElement("div");
                const span = document.createElement("span");
                if (cssClass !== undefined) {
                    span.classList.add(cssClass);
                }
                span.innerText = legendLetter;
                legend.append(span, ": " + explanation);
                legendContainer.append(legend);
            }
        }

        this.sectorTable.replaceWith(newTable);
        this.sectorTable = newTable;
    }
}

/**
 * Tile for displaying whole-track information, like the bitcell stream.
 */
class ScpTrackTile {
    public readonly scp: ScpFloppyDisk;
    public readonly selection: Selection;
    public readonly top: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private zoom: number = 1000/1e9/0.200; // pixel = timeNs*zoom
    private centerTimeNs: number = 0;

    public constructor(scp: ScpFloppyDisk, selection: Selection) {
        this.scp = scp;
        this.selection = selection;
        this.top = document.createElement("div");
        this.top.classList.add("scp-track-tile");

        this.canvas = document.createElement("canvas");
        this.canvas.width = 1000;
        this.canvas.height = 200;
        this.top.append(this.canvas);

        this.configureCanvas(this.canvas);

        selection.addListener(() => this.update());
    }

    private configureCanvas(canvas: HTMLCanvasElement): void {
        let dragging = false;
        let holdingShift = false;
        let holdingAlt = false;
        let inCanvas = false;
        let selectionAdjustMode = SelectionAdjustMode.CREATE;

        const updateCursor = () => {
            canvas.style.cursor = holdingShift ? (holdingAlt ? "zoom-out" : "zoom-in")
                : holdingAlt ? (selectionAdjustMode === SelectionAdjustMode.CREATE ? "auto" : "col-resize")
                    : dragging ? "grabbing"
                        : "grab";
        };
        updateCursor();

        // See if we're on the edge of a sample selection area.
        const updateSelectionAdjustMode = () => {
            selectionAdjustMode = SelectionAdjustMode.CREATE;
            if (holdingAlt && this.selectionMode === SelectionMode.SAMPLES &&
                this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {

                const startX = this.originalFrameToScreenX(this.startSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - startX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.LEFT;
                }
                const endX = this.originalFrameToScreenX(this.endSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - endX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.RIGHT;
                }
            }
            updateCursor();
        };

        // Mouse click events.
        this.canvas.addEventListener("mousedown", event => {
            if (holdingShift) {
                // Zoom.
                if (holdingAlt) {
                    // Zoom out.
                    this.setZoom(this.zoom + 1, event.offsetX);
                } else {
                    // Zoom in.
                    this.setZoom(this.zoom - 1, event.offsetX);
                }
            }
        });

        // Keyboard events.
        document.addEventListener("keydown", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = true;
                    updateSelectionAdjustMode();
                    updateCursor();
                }
                if (event.key === "Shift") {
                    holdingShift = true;
                    updateCursor();
                }
            }
        });
        document.addEventListener("keyup", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = false;
                    updateSelectionAdjustMode();
                    updateCursor();
                }
                if (event.key === "Shift") {
                    holdingShift = false;
                    updateCursor();
                }
            }
        });
    }

    public update() {
        const canvas = this.canvas;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const width = canvas.width;
        const height = canvas.height;

        // Get the theme variables.
        canvas.classList.add("dark-mode");
        const style = getComputedStyle(canvas);
        const backgroundColor = style.getPropertyValue("--background");
        const selectionColor = style.getPropertyValue("--background-highlights");
        const highlightColor = "rgba(0, 0, 0, 0.2)";
        const braceColor = style.getPropertyValue("--foreground-secondary");
        const labelColor = style.getPropertyValue("--foreground");
        const waveformColor = style.getPropertyValue("--blue");
        const startColor = style.getPropertyValue("--cyan");
        const badColor = style.getPropertyValue("--red");

        // Background.
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        const track = this.scp.tracks[this.selection.trackNumber];

        const rev = track.revs[0];
        const cummulativeNs = new Uint32Array(rev.bitcells.length + 1);
        for (let i = 0; i < rev.bitcells.length; i++) {
            cummulativeNs[i + 1] = cummulativeNs[i] + rev.bitcells[i]*this.scp.resolutionTimeNs;
        }

        for (const sector of rev.sectors) {
            const beginBitcellIndex = rev.bytes[sector.idamIndex].bitcellIndex;
            const endBitcellIndex = rev.bytes[sector.damIndex + 256].bitcellIndex;

            const beginNs = cummulativeNs[beginBitcellIndex];
            const endNs = cummulativeNs[endBitcellIndex];
            console.log(sector.getSectorNumber(), beginNs, endNs);

            ctx.fillStyle = waveformColor;
            ctx.fillRect(beginNs*this.zoom, 0, (endNs - beginNs)*this.zoom, height);
        }
    }
}

/**
 * Tile for displaying whole-sector information, like a hex dump.
 */
class ScpSectorTile {
    public readonly scp: ScpFloppyDisk;
    public readonly selection: Selection;
    public readonly top: HTMLElement;

    public constructor(scp: ScpFloppyDisk, selection: Selection) {
        this.scp = scp;
        this.selection = selection;
        this.top = document.createElement("div");
        this.top.classList.add("scp-sector-tile", "hexdump");

        selection.addListener(() => {
            this.update(scp.tracks[selection.trackNumber].revs[0].sectors[selection.sectorNumber]);
        });
    }

    public update(sector: ScpSector) {
        clearElement(this.top);

        const hexdumpGenerator = new HtmlHexdumpGenerator(sector.getData(), false, []);
        this.top.append(... hexdumpGenerator.generate());
    }
}

/**
 * Tab for exploring and repairing SCP files.
 */
export class ScpTab extends PageTab {
    private readonly diskTile: ScpDiskTile;
    private readonly trackTile: ScpTrackTile;
    private readonly sectorTile: ScpSectorTile;

    public constructor(scp: ScpFloppyDisk) {
        super("SCP File");

        this.element.classList.add("scp-tab");

        const outer = document.createElement("div");
        outer.classList.add("scp-tab-outer");
        this.element.append(outer);

        // Container of tiles.
        const tileContainer = document.createElement("div");
        tileContainer.classList.add("scp-tab-tile-container");
        outer.append(tileContainer);

        const selection = new Selection();
        this.diskTile = new ScpDiskTile(scp, selection);
        this.trackTile = new ScpTrackTile(scp, selection);
        this.sectorTile = new ScpSectorTile(scp, selection);

        tileContainer.append(
            this.diskTile.top,
            this.trackTile.top,
            this.sectorTile.top);

        this.diskTile.update();

        const actionBar = document.createElement("div");
        actionBar.classList.add("action-bar");
        this.element.append(actionBar);

        /*
        const exportScpButton = makeTextButton("Export SCP", "get_app", "export-scp-button", () => {
        });
        actionBar.append(exportScpButton);
        */

        const importDmkButton = makeTextButton("Import DMK", "get_app", "import-dmk-button", () => {
        });
        actionBar.append(importDmkButton);
    }
}
