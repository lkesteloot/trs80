import {Density, densityToString, SectorPosition, type SectorInfo, TrackPosition, Trsdos} from "trs80-base";
import {
    buildDiskMap, DiskError, type DiskMapModel, type MapCell, MapCellKind, mapCellKindIsProblem, mapCellKindToString,
    MapGrid, type DiskSession, totalsText,
} from "trs80-disk";
import {assertNever} from "z80-base";
import type {OpenDisk} from "../core/OpenDisk.js";
import {fileColor} from "../core/DiskFacts.js";
import {el, formatNumber, makeButton} from "../core/Dom.js";
import {lightFiles, ownerKey} from "./Highlight.js";
import type {DiskViewState} from "./ViewState.js";

/**
 * What the Map view asks of the page.
 */
export interface MapViewHost {
    /** The picked sector changed, so the inspector should show it. */
    sectorPicked(): void;
    /** The user asked to see the whole map again, after the Health view had narrowed it to some granules. */
    clearFocus(): void;
}

/**
 * One cell of a row of the grid, before it's made into an element.
 */
interface GridCell {
    /** The sector that the cell stands for, which a click picks: in a grid of granules, the granule's first. */
    sector: SectorPosition;
    /** Every sector that the cell stands for, in order: only {@link sector}, except in a grid of granules. */
    sectors: SectorPosition[];
    /** CSS classes that say what the cell shows. */
    className: string;
    /** The cell's own background, or undefined to leave it to the class. */
    background: string | undefined;
    /** The tokens for Highlight.ts: the files and kind that the cell stands for. */
    owners: string[];
    /** Tells apart cells that are drawn as one run, or undefined for a cell that is never part of a run. */
    identity: string | undefined;
    /** The name written across a run of these cells, or undefined for none. */
    label: string | undefined;
    /** The granule that holds the sector, as "lump:granule", or undefined if none does. */
    granule: string | undefined;
    /** The tooltip line's text. */
    tip: string;
    /** Whether the sector is a gap in the layout that holds nothing, which is drawn faint. */
    isEmpty: boolean;
}

/**
 * One row of the grid: a track, or a lump in a grid of granules, with its label and its cells in order of position.
 */
interface GridRow {
    /** The label at the left, such as "12" or "12·1". */
    label: string;
    /** The cells, one per column. */
    cells: (GridCell | undefined)[];
}

/**
 * The fewest sectors in a run of one file's cells that get the file's name written across them.
 */
const MIN_LABEL_RUN = 3;

/**
 * What a grid's cells stand for, which changes its words and its cells' width.
 */
interface GridStyle {
    /** The heading of the column of row labels, such as "cyl". */
    rulerHeader: string;
    /** What a cell is, for the hints: "sector" or "granule". */
    unit: string;
    /** The fewest cells in a run of one file's that get the file's name written across them. */
    minLabelRun: number;
    /** A class for the grid's element that sizes its cells, or "" for the sector size. */
    className: string;
}

/**
 * How a grid of sectors is drawn: a floppy's granule map, or its sector map.
 */
const SECTOR_GRID_STYLE: GridStyle = {rulerHeader: "cyl", unit: "sector", minLabelRun: MIN_LABEL_RUN, className: ""};

/**
 * The token that Highlight.ts uses for all the cells and legend items of a kind.
 *
 * @param kind the kind.
 */
function kindToken(kind: MapCellKind): string {
    return "@KIND" + kind;
}

/**
 * The CSS classes that draw a kind of cell.
 *
 * @param kind the kind.
 */
function kindClassName(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return "";
        case MapCellKind.NOT_ON_IMAGE:
            return "ghost";
        case MapCellKind.PAST_END:
            return "ghost pastend";
        case MapCellKind.FILE:
            return "";
        case MapCellKind.OTHER_FILE:
            return "sys";
        case MapCellKind.DIRECTORY:
            return "dir";
        case MapCellKind.BOOT:
            return "sys";
        case MapCellKind.LOCKED_OUT:
            return "locked";
        case MapCellKind.SHARED:
            return "bad shared";
        case MapCellKind.CLAIMED_BUT_FREE:
            return "bad claimedfree";
        case MapCellKind.UNCLAIMED:
            return "bad unclaimed";
        default:
            assertNever(kind);
    }
}

/**
 * The kinds that the legend lists after the files, in order. The two kinds of free-but-unusable granules and
 * "other file" are listed only when the disk has some.
 */
const LEGEND_KINDS: readonly MapCellKind[] = [
    MapCellKind.BOOT, MapCellKind.DIRECTORY, MapCellKind.FREE, MapCellKind.NOT_ON_IMAGE, MapCellKind.PAST_END,
    MapCellKind.LOCKED_OUT, MapCellKind.SHARED, MapCellKind.CLAIMED_BUT_FREE, MapCellKind.UNCLAIMED,
];

/**
 * The names of the files that own a granule, as the disk shows them.
 */
function ownerNames(cell: MapCell): string[] {
    return cell.owners.map(owner => owner.getFilename("/"));
}

/**
 * A phrase for the tooltip line that says what a cell holds.
 *
 * @param cell the granule's cell.
 */
function describeCell(cell: MapCell): string {
    switch (cell.kind) {
        case MapCellKind.FILE:
            return cell.file?.name ?? "a file";
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
            return cell.label ?? mapCellKindToString(cell.kind);
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
            return mapCellKindToString(cell.kind) + ": " + ownerNames(cell).join(", ");
        case MapCellKind.FREE:
        case MapCellKind.NOT_ON_IMAGE:
        case MapCellKind.PAST_END:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.LOCKED_OUT:
        case MapCellKind.UNCLAIMED:
            return mapCellKindToString(cell.kind);
        default:
            assertNever(cell.kind);
    }
}

/**
 * The Map view: the picture of where everything is on a floppy or a hard disk partition. For a TRSDOS-family
 * floppy it's the granule map, with a row for each track and a cell for each sector, colored by the file that owns
 * it. A partition's logical track runs across all its heads, up to 256 sectors, so its map has a row for each lump
 * and a cell for each granule instead. For a floppy with no file system that we understand, it's the sector map,
 * colored by density and by which sectors have problems. It's drawn with one DOM element per cell, which stays fast
 * enough for an 80-cylinder two-sided disk (about 3,000) and for a big partition (a few thousand granules).
 */
export class MapView {
    /** The view's root element, which the page puts in its main pane. */
    public readonly element = el("div", "mapview");

    private readonly host: MapViewHost;
    private state: DiskViewState | undefined = undefined;
    private readonly tip = el("div", "maptip hint");
    private pickedElement: HTMLElement | undefined = undefined;
    private cellElements = new Map<string, HTMLElement>();
    private cellsByElement = new WeakMap<HTMLElement, GridCell>();

    /**
     * @param host the page.
     */
    constructor(host: MapViewHost) {
        this.host = host;
    }

    /**
     * Draw the map of a floppy, or of a hard disk's chosen partition.
     *
     * @param disk the disk.
     * @param state its view state.
     */
    public render(disk: OpenDisk, state: DiskViewState): void {
        this.state = state;
        lightFiles(undefined);
        this.pickedElement = undefined;
        this.cellElements = new Map();
        this.cellsByElement = new WeakMap();

        const session = disk.session;
        let model: DiskMapModel | undefined = undefined;
        let whyNoGranuleMap = "";
        try {
            model = buildDiskMap(session, []);
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
            whyNoGranuleMap = e.message;
        }

        if (model !== undefined) {
            this.renderGranuleMap(session, model, state);
        } else if (session.isHardDisk()) {
            // A partition has no recording details to fall back to.
            this.element.replaceChildren(el("p", "hint", whyNoGranuleMap + "."));
        } else {
            this.renderSectorMap(session, whyNoGranuleMap);
        }
    }

    /**
     * Draw the granule map of a TRSDOS-family disk.
     */
    private renderGranuleMap(session: DiskSession, model: DiskMapModel, state: DiskViewState): void {
        const trsdos = session.fileSystem as Trsdos;
        const layout = model.layout;
        const cellBySector = new Map<string, MapCell>();
        for (const cell of model.cells) {
            for (const position of cell.sectors) {
                cellBySector.set(position.key(), cell);
            }
        }

        let rows: GridRow[];
        let style: GridStyle;
        let firstNumber: number;
        switch (layout.grid) {
            case MapGrid.SECTORS:
                rows = [];
                for (let cylinder = 0; cylinder <= layout.lastCylinder; cylinder++) {
                    for (let side = 0; side < layout.allocationSides; side++) {
                        const cells: (GridCell | undefined)[] = [];
                        for (let i = 0; i < layout.sectorsPerTrack; i++) {
                            const sectorNumber = layout.firstSectorNumber + i;
                            const position = SectorPosition.make(cylinder, side, sectorNumber);
                            cells.push(this.makeGranuleGridCell(trsdos, position, cellBySector.get(position.key()), model));
                        }
                        rows.push({label: layout.allocationSides > 1 ? cylinder + "·" + side : String(cylinder), cells});
                    }
                }
                style = SECTOR_GRID_STYLE;
                firstNumber = layout.firstSectorNumber;
                break;
            case MapGrid.GRANULES:
                rows = this.makeGranuleRows(trsdos, model);
                style = {
                    rulerHeader: trsdos.lumpsAreCylinders ? "cyl" : trsdos.lumpTerm,
                    unit: "granule",
                    minLabelRun: 1,
                    className: "granules",
                };
                firstNumber = 0;
                break;
            default:
                assertNever(layout.grid);
        }

        const legend = el("div", "legend");
        legend.append(el("h4", "", "Files · granules"));
        for (const file of model.files) {
            if (file.colorIndex === undefined) {
                continue;
            }
            const swatch = el("span", "swatch");
            swatch.style.background = fileColor(file);
            this.addLegendItem(legend, ownerKey(file.name), [swatch, el("span", "mono", file.name)], file.granuleCount);
        }
        for (const kind of LEGEND_KINDS) {
            const count = model.kindCounts.get(kind) ?? 0;
            const alwaysShown = kind === MapCellKind.BOOT || kind === MapCellKind.DIRECTORY || kind === MapCellKind.FREE;
            if (count > 0 || alwaysShown) {
                const swatch = el("span", "swatch kind " + kindClassName(kind));
                const phrase = mapCellKindToString(kind);
                this.addLegendItem(legend, kindToken(kind), [swatch, el("span", "", phrase.charAt(0).toUpperCase() + phrase.substring(1))],
                    count);
            }
        }
        const problemCount = [...model.kindCounts].filter(([kind]) => mapCellKindIsProblem(kind))
            .reduce((sum, [, count]) => sum + count, 0);
        const clickHint = style.unit === "granule" ?
            "Click a granule to see its sectors. Each row is a " + trsdos.lumpTerm + " of the partition. " :
            "Click a sector to see its bytes. ";
        legend.append(el("p", "hint", "Hover a file to light up its " + style.unit + "s. " + clickHint +
            "A granule is " + formatNumber(trsdos.sectorsPerGranule) + " sectors (" +
            formatNumber(model.totals.granuleByteCount) + " bytes)." +
            (problemCount > 0 ? " Red cells are damage; the Health view says what." : "")));

        this.finish(state, rows, firstNumber, legend, totalsText(model.totals), style);
    }

    /**
     * Make the rows of a grid of granules: one for each lump, with a cell for each of its granules.
     *
     * @param trsdos the file system, for the word for a lump.
     * @param model the map.
     */
    private makeGranuleRows(trsdos: Trsdos, model: DiskMapModel): GridRow[] {
        const layout = model.layout;
        const rows: GridRow[] = [];
        for (let lump = 0; lump < layout.lumpCount; lump++) {
            rows.push({label: String(lump), cells: new Array<GridCell | undefined>(layout.granulesPerLump).fill(undefined)});
        }

        const lumpWord = trsdos.lumpTerm.charAt(0).toUpperCase() + trsdos.lumpTerm.substring(1);
        for (const cell of model.cells) {
            const first = cell.sectors[0];
            const last = cell.sectors[cell.sectors.length - 1];
            if (first === undefined || last === undefined) {
                continue;
            }
            const where = lumpWord + " " + cell.lump + ", granule " + cell.granule + " · sectors " +
                first.sectorNumber + "-" + last.sectorNumber;
            rows[cell.lump].cells[cell.granule] = {
                ...this.describeGranule(cell, first, where),
                sectors: cell.sectors,
            };
        }
        return rows;
    }

    /**
     * Describe what one sector of the granule map shows.
     *
     * @param trsdos the file system, for the word for a lump.
     * @param position the sector.
     * @param cell the granule that holds it, or undefined if none does.
     * @param model the map.
     */
    private makeGranuleGridCell(trsdos: Trsdos, position: SectorPosition, cell: MapCell | undefined,
                                model: DiskMapModel): GridCell {

        const where = "Cylinder " + position.cylinderNumber +
            (model.layout.imageSideCount > 1 ? ", side " + position.side : "") + ", sector " + position.sectorNumber;
        if (cell === undefined) {
            return {
                sector: position, sectors: [position], className: "empty", background: undefined, owners: [], identity: undefined,
                label: undefined, granule: undefined, tip: where + ": not in any granule", isEmpty: true,
            };
        }

        const granuleText = "granule " + cell.granule + " of " + trsdos.lumpTerm + " " + cell.lump;
        return this.describeGranule(cell, position, where + " · " + granuleText);
    }

    /**
     * Describe a cell that shows a granule, or one of its sectors.
     *
     * @param cell the granule.
     * @param position the sector that a click on the cell picks.
     * @param where where the cell is, for the start of its tooltip.
     */
    private describeGranule(cell: MapCell, position: SectorPosition, where: string): GridCell {
        const owners = ownerNames(cell).map(ownerKey);
        if (cell.kind === MapCellKind.FILE && cell.file !== undefined) {
            owners.push(ownerKey(cell.file.name));
        }
        owners.push(kindToken(cell.kind));
        return {
            sector: position,
            sectors: [position],
            className: kindClassName(cell.kind),
            background: cell.kind === MapCellKind.FILE && cell.file !== undefined ? fileColor(cell.file) : undefined,
            owners: [...new Set(owners)],
            identity: cell.identity,
            label: cell.label,
            granule: cell.lump + ":" + cell.granule,
            tip: where + " · " + describeCell(cell),
            isEmpty: false,
        };
    }

    /**
     * Draw the sector map of a floppy: every sector that the image has, by density and condition. It's what the
     * map falls back to when there's no TRSDOS-family file system to say what the sectors are for.
     *
     * @param session the disk's session, which holds a floppy.
     * @param why why there's no granule map, in the engine's words.
     */
    private renderSectorMap(session: DiskSession, why: string): void {
        const state = this.state as DiskViewState;
        const geometry = session.floppy.getGeometry();

        // The sectors that the image has, by track.
        const byTrack = new Map<string, SectorInfo[]>();
        for (const info of geometry.sectorMap.values()) {
            const key = info.sectorPosition.trackPosition.key();
            const list = byTrack.get(key);
            if (list === undefined) {
                byTrack.set(key, [info]);
            } else {
                list.push(info);
            }
        }

        // The columns are the sector numbers that tracks are expected to have, and a track's strays (copy protection
        // writes them) go in extra columns after those.
        let firstNumber = Number.MAX_SAFE_INTEGER;
        let lastNumber = -1;
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            for (let side = 0; side < geometry.sideCount; side++) {
                const range = geometry.getExpectedSectorRange(new TrackPosition(cylinder, side));
                if (range !== undefined) {
                    firstNumber = Math.min(firstNumber, range.firstSectorNumber);
                    lastNumber = Math.max(lastNumber, range.lastSectorNumber);
                }
            }
        }
        if (lastNumber < firstNumber) {
            firstNumber = 0;
            lastNumber = -1;
        }
        const span = lastNumber - firstNumber + 1;

        const counts = {single: 0, double: 0, crc: 0, deleted: 0, noData: 0};
        const rows: GridRow[] = [];
        for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
            for (let side = 0; side < geometry.sideCount; side++) {
                const trackPosition = new TrackPosition(cylinder, side);
                const infos = byTrack.get(trackPosition.key()) ?? [];
                const cells: (GridCell | undefined)[] = new Array(span).fill(undefined);
                const strays: GridCell[] = [];
                for (const info of infos.sort((a, b) => a.sectorPosition.sectorNumber - b.sectorPosition.sectorNumber)) {
                    const number = info.sectorPosition.sectorNumber;
                    const cell = this.makeSectorGridCell(info, counts);
                    if (number >= firstNumber && number <= lastNumber) {
                        cells[number - firstNumber] = cell;
                    } else {
                        strays.push(cell);
                    }
                }
                cells.push(...strays);
                rows.push({label: geometry.sideCount > 1 ? cylinder + "·" + side : String(cylinder), cells});
            }
        }
        const longest = Math.max(span, ...rows.map(row => row.cells.length));
        for (const row of rows) {
            while (row.cells.length < longest) {
                row.cells.push(undefined);
            }
        }

        const legend = el("div", "legend");
        legend.append(el("h4", "", "Sectors"));
        const addKind = (className: string, text: string, count: number, alwaysShown: boolean): void => {
            if (count > 0 || alwaysShown) {
                const item = el("div", "item", el("span", "swatch kind " + className), el("span", "", text),
                    el("span", "n", formatNumber(count)));
                legend.append(item);
            }
        };
        addKind("sd", "Single density", counts.single, true);
        addKind("dd", "Double density", counts.double, true);
        addKind("crc", "CRC error", counts.crc, true);
        addKind("deleted", "Deleted data mark", counts.deleted, false);
        addKind("nodata", "ID but no data", counts.noData, false);
        legend.append(el("p", "hint", why === "" ? "" : why + ". So this shows the sectors that the image has instead of " +
            "what they're used for. "), el("span", "hint", "Click a sector to see its bytes."));

        const total = counts.single + counts.double;
        this.finish(state, rows, firstNumber, legend, formatNumber(total) + " sectors on " +
            formatNumber(byTrack.size) + " tracks.", SECTOR_GRID_STYLE);
    }

    /**
     * Describe one sector of the sector map, and count it.
     *
     * @param info what the image says about the sector.
     * @param counts the tallies for the legend, which this adds to.
     */
    private makeSectorGridCell(info: SectorInfo, counts: {single: number, double: number, crc: number, deleted: number,
                               noData: number}): GridCell {

        const position = info.sectorPosition;
        let densityClassName: string;
        switch (info.density) {
            case Density.SINGLE:
                densityClassName = "sd";
                counts.single++;
                break;
            case Density.DOUBLE:
                densityClassName = "dd";
                counts.double++;
                break;
            default:
                assertNever(info.density);
        }
        const notes: string[] = [densityToString(info.density) + " density"];
        let className: string;
        if (!info.hasData()) {
            className = "nodata";
            counts.noData++;
            notes.push("ID but no data");
        } else if (info.crcError || !info.hasValidIdCrc()) {
            className = "crc";
            counts.crc++;
            notes.push("CRC error");
        } else if (info.deleted) {
            className = "deleted";
            counts.deleted++;
            notes.push("deleted data mark");
        } else {
            className = densityClassName;
        }

        const where = "Cylinder " + position.cylinderNumber + ", side " + position.side + ", sector " + position.sectorNumber;
        return {
            sector: position, sectors: [position], className, background: undefined, owners: [], identity: undefined, label: undefined,
            granule: undefined, tip: where + " · " + notes.join(", "), isEmpty: false,
        };
    }

    /**
     * Assemble the grid, the legend and the lines around them, and put them in the view.
     *
     * @param state the disk's view state.
     * @param rows the grid's rows.
     * @param firstNumber the number of the first sector column, for the ruler.
     * @param legend the legend's element.
     * @param summary the line under the grid that says what it holds.
     * @param style what the grid's cells stand for.
     */
    private finish(state: DiskViewState, rows: GridRow[], firstNumber: number, legend: HTMLElement,
                   summary: string, style: GridStyle): void {

        const columns = Math.max(0, ...rows.map(row => row.cells.length));
        const grid = el("div", "map");
        if (style.className !== "") {
            grid.classList.add(style.className);
        }
        grid.style.setProperty("--spt", String(columns));
        const focus = state.mapFocus;
        if (focus !== undefined) {
            grid.classList.add("focusing");
        }

        const ruler = el("div", "maprow ruler", el("span", "lbl", style.rulerHeader));
        for (let i = 0; i < columns; i++) {
            ruler.append(el("span", "r", String(firstNumber + i)));
        }
        grid.append(ruler);
        for (const row of rows) {
            grid.append(this.makeRowElement(row, state, style));
        }

        const hoverHint = "Hover a " + style.unit + " to see what it is.";
        grid.addEventListener("mouseover", event => {
            const cellElement = (event.target as HTMLElement).closest(".cell") as HTMLElement | null;
            const cell = cellElement === null ? undefined : this.cellsByElement.get(cellElement);
            this.tip.textContent = cell?.tip ?? hoverHint;
        });
        grid.addEventListener("mouseleave", () => {
            this.tip.textContent = hoverHint;
        });
        grid.addEventListener("click", event => {
            const cellElement = (event.target as HTMLElement).closest(".cell") as HTMLElement | null;
            const cell = cellElement === null ? undefined : this.cellsByElement.get(cellElement);
            if (cellElement !== null && cell !== undefined) {
                this.pick(cellElement, cell);
            }
        });

        const picked = state.pickedSector;
        if (picked !== undefined) {
            const pickedElement = this.cellElements.get(SectorPosition.make(picked.cylinder, picked.side, picked.sector).key());
            pickedElement?.classList.add("picked");
            this.pickedElement = pickedElement;
        }

        this.tip.textContent = hoverHint;
        const left = el("div", "mapleft");
        if (focus !== undefined) {
            left.append(el("div", "focusbar", "Showing only the granules for: " + focus.title + " ",
                makeButton("Show everything", () => this.host.clearFocus())));
        }
        left.append(el("div", "mapscroll", grid), this.tip, el("div", "hint", summary));
        this.element.replaceChildren(el("div", "mapwrap", left, legend));
    }

    /**
     * Make the element of one row: its label, its cells, and the names written across runs of cells.
     */
    private makeRowElement(row: GridRow, state: DiskViewState, style: GridStyle): HTMLElement {
        const rowElement = el("div", "maprow", el("span", "lbl", row.label));
        const focus = state.mapFocus;

        let runStart = 0;
        const endRun = (end: number): void => {
            const first = row.cells[runStart];
            if (first?.label !== undefined && end - runStart >= style.minLabelRun) {
                const label = el("span", "runlabel", first.label);
                label.style.gridColumn = (runStart + 2) + " / span " + (end - runStart);
                rowElement.append(label);
            }
        };
        for (let i = 0; i <= row.cells.length; i++) {
            const cell = i < row.cells.length ? row.cells[i] : undefined;
            const previous = i > 0 ? row.cells[i - 1] : undefined;
            const sameRun = cell !== undefined && previous !== undefined && cell.identity !== undefined &&
                cell.identity === previous.identity;
            if (i > 0 && !sameRun) {
                endRun(i);
            }
            if (!sameRun) {
                runStart = i;
            }
            if (cell === undefined) {
                continue;
            }

            const next = i + 1 < row.cells.length ? row.cells[i + 1] : undefined;
            const endsGranule = next !== undefined && cell.granule !== next.granule;
            const classes = ["cell"];
            if (cell.className !== "") {
                classes.push(cell.className);
            }
            if (endsGranule) {
                classes.push("gend");
            }
            if (focus !== undefined && cell.granule !== undefined && focus.granules.has(cell.granule)) {
                classes.push("focus");
            }
            const cellElement = el("span", classes.join(" "));
            cellElement.style.gridRow = "1";
            cellElement.style.gridColumn = String(i + 2);
            if (cell.background !== undefined) {
                cellElement.style.background = cell.background;
            }
            if (cell.owners.length > 0) {
                cellElement.dataset.o = cell.owners.join(" ");
            }
            if (cell.granule !== undefined) {
                cellElement.dataset.g = cell.granule;
            }
            this.cellsByElement.set(cellElement, cell);
            for (const sector of cell.sectors) {
                this.cellElements.set(sector.key(), cellElement);
            }
            rowElement.append(cellElement);
        }
        return rowElement;
    }

    /**
     * Add a legend item that lights its cells when hovered.
     *
     * @param legend the legend's element.
     * @param token what its cells carry in their data-o.
     * @param content the item's swatch and name.
     * @param count the number of granules.
     */
    private addLegendItem(legend: HTMLElement, token: string, content: HTMLElement[], count: number): void {
        const item = el("div", "item", ...content, el("span", "n", formatNumber(count)));
        item.dataset.o = token;
        item.addEventListener("mouseenter", () => lightFiles([token]));
        item.addEventListener("mouseleave", () => lightFiles(undefined));
        legend.append(item);
    }

    /**
     * Pick a cell's sector, so that the inspector shows its bytes. In a grid of granules that's the granule's
     * first sector, and the inspector can step through the rest.
     */
    private pick(cellElement: HTMLElement, cell: GridCell): void {
        const state = this.state;
        if (state === undefined) {
            return;
        }

        this.pickedElement?.classList.remove("picked");
        this.pickedElement = cellElement;
        cellElement.classList.add("picked");
        state.pickedSector = {
            cylinder: cell.sector.cylinderNumber,
            side: cell.sector.side,
            sector: cell.sector.sectorNumber,
            note: cell.tip,
            cellSectors: cell.sectors,
        };
        this.host.sectorPicked();
    }
}
