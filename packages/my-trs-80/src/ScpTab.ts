import {PageTab} from "./PageTab";
import {Density, numberToSide, ScpFloppyDisk, ScpRev, ScpSector, Side} from "trs80-base";
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
    public sectorNumber: number | undefined = undefined;
    private listeners: SelectionListener[] = [];

    /**
     * Update the selection.
     */
    public set(trackNumber: number, sectorNumber: number | undefined): void {
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
            th.addEventListener("click", () => this.selection.set(trackNumber, undefined));
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
                if (trackNumber === this.selection.trackNumber &&
                    (sectorNumber === this.selection.sectorNumber || this.selection.sectorNumber === undefined)) {

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
    private zoom = 1; // pixel = timeNs*zoom
    private centerTimeNs: number = 0;
    private cummulativeNs = new Uint32Array(0);

    public constructor(scp: ScpFloppyDisk, selection: Selection) {
        this.scp = scp;
        this.selection = selection;
        this.top = document.createElement("div");
        this.top.classList.add("scp-track-tile");

        this.canvas = document.createElement("canvas");
        this.canvas.width = 1000;
        this.canvas.height = 200;
        this.top.append(this.canvas);

        this.configureCanvas();

        selection.addListener(() => this.syncWithSelection());
        this.syncWithSelection();
    }

    private syncWithSelection(): void {
        const rev = this.getRev();

        this.cummulativeNs = new Uint32Array(rev.bitcells.length + 1);
        for (let i = 0; i < rev.bitcells.length; i++) {
            this.cummulativeNs[i + 1] = this.cummulativeNs[i] + rev.bitcells[i]*this.scp.resolutionTimeNs;
        }

        if (this.selection.sectorNumber === undefined) {
            this.zoomToFitAll();
        } else {
            const sector = rev.getSector(this.selection.sectorNumber);
            if (sector === undefined) {
                this.zoomToFitAll();
            } else {
                const [beginIdNs, endIdNs] = this.getSectorIdSpan(rev, sector);
                const [beginDataNs, endDataNs] = this.getSectorDataSpan(rev, sector);
                this.zoomToFit(beginIdNs - 100000, endDataNs + 100000);
            }
        }

        this.draw();
    }

    private configureCanvas(): void {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterTimeNs = 0;
        let holdingShift = false;
        let holdingAlt = false;
        let inCanvas = false;
        let selectionAdjustMode = SelectionAdjustMode.CREATE;
        let lastSeenMouseX = 0;
        let lastSeenMouseY = 0;

        const updateCursor = () => {
            this.canvas.style.cursor = holdingShift ? (holdingAlt ? "zoom-out" : "zoom-in")
                : holdingAlt ? (selectionAdjustMode === SelectionAdjustMode.CREATE ? "auto" : "col-resize")
                    : dragging ? "grabbing"
                        : "grab";
        };
        updateCursor();

        /*
        // See if we're on the edge of a sample selection area.
        const updateSelectionAdjustMode = () => {
            selectionAdjustMode = SelectionAdjustMode.CREATE;
            if (holdingAlt && this.selectionMode === SelectionMode.SAMPLES &&
                this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {

                const startX = this.nsToScreenX(this.startSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - startX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.LEFT;
                }
                const endX = this.nsToScreenX(this.endSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - endX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.RIGHT;
                }
            }
            updateCursor();
        };
         */

        // Mouse enter/leave events.
        this.canvas.addEventListener("mouseenter", event => {
            inCanvas = true;
            holdingAlt = event.altKey;
            holdingShift = event.shiftKey;
            // updateSelectionAdjustMode();
            updateCursor();
        });
        this.canvas.addEventListener("mouseleave", () => {
            inCanvas = false;
        });

        // Mouse click events.
        this.canvas.addEventListener("mousedown", event => {
            if (holdingShift) {
                // Zoom.
                if (holdingAlt) {
                    // Zoom out.
                    this.setZoom(this.zoom/2, event.offsetX);
                } else {
                    // Zoom in.
                    this.setZoom(this.zoom*2, event.offsetX);
                }
            } else {
                // Start pan.
                dragging = true;
                dragInitialX = event.offsetX;
                dragInitialCenterTimeNs = this.centerTimeNs;
                updateCursor();
            }
        });
        this.canvas.addEventListener("mousemove", event => {
            lastSeenMouseX = event.offsetX;
            lastSeenMouseY = event.offsetY;

            if (dragging) {
                const dx = event.offsetX - dragInitialX;
                this.centerTimeNs = dragInitialCenterTimeNs - dx/this.zoom;
                this.draw();
            }/* else if (selectionStart !== undefined) {
                const frame = this.screenXToOriginalFrame(event.offsetX);
                const highlight = this.highlightAt(frame);
                if (highlight !== undefined && highlight.program === selectionStart.program) {
                    this.onSelection.dispatch(new Highlight(highlight.program,
                        selectionStart.firstIndex, highlight.lastIndex));
                }
            } else if (selectingSamples) {
                this.endSampleSelectionFrame = this.screenXToOriginalFrame(event.offsetX);
                this.draw();
                this.updateInfoPanels();
            } else if (holdingAlt) {
                const frame = this.screenXToOriginalFrame(event.offsetX);
                const highlight = this.highlightAt(frame);
                this.onHighlight.dispatch(highlight);
                updateSelectionAdjustMode();
            }*/
        });
        window.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false;
                updateCursor();
            }/* else if (selectionStart !== undefined) {
                this.onDoneSelecting.dispatch(this);
                this.updateInfoPanels();
                selectionStart = undefined;
            } else if (selectingSamples) {
                // Done selecting samples.
                if (this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {
                    if (this.startSampleSelectionFrame === this.endSampleSelectionFrame) {
                        // Deselect.
                        this.startSampleSelectionFrame = undefined;
                        this.endSampleSelectionFrame = undefined;
                    } else if (this.startSampleSelectionFrame > this.endSampleSelectionFrame) {
                        // Put in the right order.
                        const tmp = this.startSampleSelectionFrame;
                        this.startSampleSelectionFrame = this.endSampleSelectionFrame;
                        this.endSampleSelectionFrame = tmp;
                    }
                }
                selectingSamples = false;
                this.draw();
                this.updateInfoPanels();
            }*/
        });

        // Keyboard events.
        document.addEventListener("keydown", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = true;
                    // updateSelectionAdjustMode();
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
                    // updateSelectionAdjustMode();
                    updateCursor();
                }
                if (event.key === "Shift") {
                    holdingShift = false;
                    updateCursor();
                }
            }
        });
    }

    /**
     * Set the zoom level to a particular value.
     *
     * @param zoom new zoom level.
     * @param screenX pixel to keep at the same place, or undefined to mean the horizontal center.
     */
    public setZoom(zoom: number, screenX: number | undefined): void {
        if (zoom !== this.zoom) {
            if (screenX === undefined) {
                screenX = this.canvas.width / 2;
            }

            const ns = this.screenXToNs(screenX);
            this.zoom = zoom;
            this.centerTimeNs = ns - (screenX - this.canvas.width/2)/zoom;
            this.draw();
        }
    }

    /**
     * Zoom to fit a time range.
     */
    public zoomToFit(startNs: number, endNs: number) {
        const ns = endNs - startNs;

        // Visually centered time.
        this.centerTimeNs =(startNs + endNs)/2;

        // Find appropriate zoom.
        this.setZoom(this.computeFitLevel(ns), undefined);

        this.draw();
    }

    /**
     * Zoom to fit all time.
     */
    public zoomToFitAll() {
        if (this.cummulativeNs.length !== 0) {
            this.zoomToFit(0, this.cummulativeNs[this.cummulativeNs.length - 1]);
        }
    }

    /**
     * Compute fit level to fit the specified time.
     *
     * @param ns time we want to display.
     */
    private computeFitLevel(ns: number): number {
        return this.canvas.width / ns;
    }

    /**
     * Convert a screen (pixel) X location to the time into the revolution.
     */
    private screenXToNs(screenX: number): number {
        // Offset in pixels from center of canvas.
        const pixelOffset = screenX - this.canvas.width/2;

        // Convert to time.
        return this.centerTimeNs + pixelOffset/this.zoom;
    }

    /**
     * Convert a time into the revolution to its X coordinate. Does not clamp to display range.
     */
    private nsToScreenX(ns: number): number {
        return this.canvas.width/2 + (ns - this.centerTimeNs)*this.zoom;
    }

    /**
     * Redraw the canvas.
     */
    public draw() {
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

        const rev = this.getRev();

        for (const sector of rev.sectors) {
            // Draw the ID.
            {
                const [beginNs, endNs] = this.getSectorIdSpan(rev, sector);
                const beginX = this.nsToScreenX(beginNs);
                const endX = this.nsToScreenX(endNs);
                ctx.fillStyle = sector.hasIdCrcError() ? badColor : waveformColor;
                ctx.fillRect(beginX, 0, endX - beginX, height);
            }

            // Draw the data.
            {
                const [beginNs, endNs] = this.getSectorDataSpan(rev, sector);
                const beginX = this.nsToScreenX(beginNs);
                const endX = this.nsToScreenX(endNs);
                ctx.fillStyle = sector.hasDataCrcError() ? badColor : waveformColor;
                ctx.fillRect(beginX, 0, endX - beginX, height);
            }
        }
    }

    /**
     * Gets the time span of a sector's ID info.
     */
    private getSectorIdSpan(rev: ScpRev, sector: ScpSector): [beginNs: number, endNs: number] {
        const beginBitcellIndex = rev.bytes[sector.idamIndex].bitcellIndex;
        const endBitcellIndex = rev.bytes[sector.idamIndex + 7].bitcellIndex; // CRC is +5 and +6.

        const beginNs = this.cummulativeNs[beginBitcellIndex];
        const endNs = this.cummulativeNs[endBitcellIndex];

        return [beginNs, endNs];
    }

    /**
     * Gets the time span of a sector's data info.
     */
    private getSectorDataSpan(rev: ScpRev, sector: ScpSector): [beginNs: number, endNs: number] {
        const beginBitcellIndex = rev.bytes[sector.damIndex].bitcellIndex;
        const endBitcellIndex = rev.bytes[sector.damIndex + 256].bitcellIndex;

        const beginNs = this.cummulativeNs[beginBitcellIndex];
        const endNs = this.cummulativeNs[endBitcellIndex];

        return [beginNs, endNs];
    }

    /**
     * Get the rev to display.
     */
    private getRev(): ScpRev {
        return this.scp.tracks[this.selection.trackNumber].revs[0];
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
            if (selection.sectorNumber === undefined) {
                this.update(undefined);
            } else {
                this.update(scp.tracks[selection.trackNumber].revs[0].getSector(selection.sectorNumber));
            }
        });
    }

    public update(sector: ScpSector | undefined) {
        clearElement(this.top);

        if (sector !== undefined) {
            const hexdumpGenerator = new HtmlHexdumpGenerator(sector.getData(), [], {
                collapse: false,
                showLastAddress: false,
            });
            this.top.append(...hexdumpGenerator.generate());
        }
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
