import {SectorPosition} from "trs80-base";
import {assertNever} from "z80-base";
import {
    MapCellKind, mapCellKindIsProblem, mapCellKindToString, MapGrid, totalsText, type DiskMapModel, type MapCell,
    type MapFile,
} from "./DiskMap.js";
import {pluralize, pluralizeWithCount} from "./Plural.js";

// The map drawn as text, the way "trs80-tool disk IMAGE map" and Disk Commander's map show it: a grid with a
// line for each side of each cylinder, a cell for each sector, the files' names written in their runs, a
// legend, and the totals. The lines are runs of styled text, which the terminal colors with escape codes and
// the page with spans.

/**
 * The character that ends a granule's last sector, in a cell's last character.
 */
const GRANULE_END = "│";

/**
 * The character that fills a run of sectors that belong to a file, to the end of the run after the file's name.
 */
const RUN_FILL = "─";

/**
 * The most characters a cell has: two for content and one that is the granule's end, if it is.
 */
const WIDE_CELL_WIDTH = 3;

/**
 * The least characters a cell has, used when the wide cells don't fit the width.
 */
const NARROW_CELL_WIDTH = 2;

/**
 * The least characters a granule's cell has in a grid of granules: a symbol, a blank, and the granule's end.
 */
const MIN_GRANULE_CELL_WIDTH = 3;

/**
 * The most characters a granule's cell has in a grid of granules, which is room for most file names.
 */
const MAX_GRANULE_CELL_WIDTH = 14;

/**
 * The fewest neighboring lumps, all free, that a grid of granules draws as one row.
 */
const MIN_COLLAPSED_FREE_ROWS = 3;

/**
 * What a run of the map's text means, which a drawing turns into a color.
 */
export enum MapTextStyle {
    /** Normal text, such as the blanks between runs in the grid. */
    PLAIN,
    /** Less important text, such as the ruler, the gutter, and free sectors. */
    MUTED,
    /** Something unusual, such as locked-out granules. */
    WARNING,
    /** Damage, such as a granule that two files claim. */
    ERROR,
    /** The directory and the boot granules. */
    EMPHASIS,
    /** A file, in its color (the run's fileColor). */
    FILE,
}

/**
 * A stretch of the map's text in one style.
 */
export interface MapTextRun {
    /** The text. */
    text: string;
    /** The style, or undefined for text that's drawn as it is, with no style at all. */
    style: MapTextStyle | undefined;
    /** For a FILE run, the index of its color in the drawing's palette, otherwise undefined. */
    fileColor: number | undefined;
}

/**
 * One line of the map, as its runs. An empty line has none.
 */
export type MapTextLine = MapTextRun[];

/**
 * Make a run that isn't a file's.
 */
function run(text: string, style: MapTextStyle | undefined): MapTextRun {
    return { text, style, fileColor: undefined };
}

/**
 * The number of characters in a line.
 */
function lineLength(line: MapTextLine): number {
    return line.reduce((sum, run) => sum + run.text.length, 0);
}

/**
 * The symbol that a kind of cell is drawn with. It's the only character of a free sector's cell, and the
 * fill of the rest. A file's run (and the directory's and boot's) is filled with a line after its name.
 */
function mapCellKindSymbol(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return "·";
        case MapCellKind.NOT_ON_IMAGE:
            return "_";
        case MapCellKind.PAST_END:
            return ">";
        case MapCellKind.FILE:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
            return RUN_FILL;
        case MapCellKind.LOCKED_OUT:
            return "x";
        case MapCellKind.SHARED:
            return "!";
        case MapCellKind.CLAIMED_BUT_FREE:
            return "?";
        case MapCellKind.UNCLAIMED:
            return "u";
        default:
            assertNever(kind);
    }
}

/**
 * The style that a kind of cell is drawn in (a file's cells use the file's color instead). The
 * problems stand out in the error style.
 */
function mapCellKindStyle(kind: MapCellKind): MapTextStyle {
    switch (kind) {
        case MapCellKind.FREE:
        case MapCellKind.PAST_END:
        case MapCellKind.OTHER_FILE:
            return MapTextStyle.MUTED;
        case MapCellKind.NOT_ON_IMAGE:
            return MapTextStyle.WARNING;
        case MapCellKind.FILE:
            return MapTextStyle.PLAIN;
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
            return MapTextStyle.EMPHASIS;
        case MapCellKind.LOCKED_OUT:
            return MapTextStyle.WARNING;
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return MapTextStyle.ERROR;
        default:
            assertNever(kind);
    }
}

/**
 * A run of a file's text: in its color, or plain for a file that has no color.
 *
 * @param text the text.
 * @param file the file.
 * @param fileColorCount the number of colors in the drawing's palette, which the file's color wraps around.
 */
function fileRun(text: string, file: MapFile, fileColorCount: number): MapTextRun {
    return file.colorIndex === undefined ? run(text, MapTextStyle.PLAIN) :
        { text, style: MapTextStyle.FILE, fileColor: file.colorIndex % fileColorCount };
}

/**
 * The style of a cell's characters, as a run with no text: its file's color, or its kind's style.
 */
function cellStyle(cell: MapCell, fileColorCount: number): MapTextRun {
    return cell.file !== undefined ? fileRun("", cell.file, fileColorCount) : run("", mapCellKindStyle(cell.kind));
}

/**
 * Whether two runs are in the same style, and so can be drawn as one.
 */
function sameStyle(a: MapTextRun, b: MapTextRun): boolean {
    return a.style === b.style && a.fileColor === b.fileColor;
}

/**
 * Lay out items in as many columns as fit, filling each column before the next.
 *
 * @param items the items, each as its runs.
 * @param width the number of characters that fit on a line.
 * @param indent the blanks before each line.
 */
function columnize(items: MapTextLine[], width: number, indent: string): MapTextLine[] {
    if (items.length === 0) {
        return [];
    }
    const itemWidth = Math.max(...items.map(lineLength));
    const gap = 3;
    const columnCount = Math.max(1, Math.floor((width - indent.length + gap)/(itemWidth + gap)));
    const rowCount = Math.ceil(items.length/columnCount);

    const lines: MapTextLine[] = [];
    for (let row = 0; row < rowCount; row++) {
        const line: MapTextLine = [run(indent, undefined)];
        for (let column = 0; column*rowCount + row < items.length; column++) {
            const item = items[column*rowCount + row];
            const isLast = (column + 1)*rowCount + row >= items.length;
            line.push(...item);
            if (!isLast) {
                line.push(run(" ".repeat(itemWidth - lineLength(item) + gap), undefined));
            }
        }
        lines.push(line);
    }

    return lines;
}

/**
 * The entries that list the files the user asked about: name in the file's color, size in granules, size in
 * bytes, and a mark for system files. A file with no granules is listed too, since it isn't in the grid.
 */
function matchedFileItems(mapFiles: MapFile[], fileColorCount: number): MapTextLine[] {
    const nameWidth = Math.max(...mapFiles.map(file => file.name.length));
    const granuleWidth = Math.max(...mapFiles.map(file => file.granuleCount.toLocaleString().length));
    const byteWidth = Math.max(...mapFiles.map(file => file.dirEntry.getSize().toLocaleString().length));

    return mapFiles.map(file => {
        const granuleText = file.granuleCount.toLocaleString().padStart(granuleWidth) + " " +
            pluralize(file.granuleCount, "granule ", "granules");
        const byteText = file.dirEntry.getSize().toLocaleString().padStart(byteWidth) + " bytes";
        const systemText = file.dirEntry.isSystemFile() ? "  system" : "";
        return [
            fileRun(file.name.padEnd(nameWidth), file, fileColorCount),
            run("  " + granuleText + "  " + byteText, undefined),
            run(systemText, MapTextStyle.MUTED),
        ];
    });
}

/**
 * The legend's lines of symbols and what they mean, for the symbols that appear on the map, wrapped to the width.
 *
 * @param counts the number of cells of each kind.
 * @param width the number of characters that fit on a line.
 */
function symbolLegendLines(counts: Map<MapCellKind, number>, width: number): MapTextLine[] {
    // The kinds that are drawn with a symbol of their own, in the order they're listed in, with the problems
    // last. Files, the directory and the boot granules are named in the grid.
    const kinds = [MapCellKind.FREE, MapCellKind.NOT_ON_IMAGE, MapCellKind.PAST_END, MapCellKind.LOCKED_OUT,
        MapCellKind.OTHER_FILE, MapCellKind.SHARED, MapCellKind.CLAIMED_BUT_FREE, MapCellKind.UNCLAIMED];

    const lines: MapTextLine[] = [];
    let line: MapTextLine = [];
    for (const kind of kinds) {
        const count = counts.get(kind) ?? 0;
        if (count === 0) {
            continue;
        }
        const entry = [
            run(mapCellKindSymbol(kind), mapCellKindStyle(kind)),
            run(" " + mapCellKindToString(kind) +
                (mapCellKindIsProblem(kind) ? " (" + count.toLocaleString() + ")" : ""), undefined),
        ];
        if (line.length > 0 && lineLength(line) + 3 + lineLength(entry) > width) {
            lines.push(line);
            line = [];
        }
        if (line.length > 0) {
            line.push(run("   ", undefined));
        }
        line.push(...entry);
    }
    if (line.length > 0) {
        lines.push(line);
    }

    return lines;
}

/**
 * One cell of the grid: a sector of a granule, or in a grid of granules, a whole granule.
 */
interface SectorSlot {
    /** The index of the granule in the granule map. */
    granuleIndex: number;
    /** Whether the cell is the end of its granule (always, in a grid of granules). */
    endsGranule: boolean;
}

/**
 * One character of a drawn line, with the style to draw it in.
 */
interface StyledChar {
    /** The character. */
    text: string;
    /** The style, as a run with no text. */
    style: MapTextRun;
}

/**
 * What a slot's cell looks like, for telling whether neighboring slots belong to one run.
 *
 * @param slot the slot, or undefined for a sector that no granule covers.
 * @param cells how every granule is drawn.
 * @return the cell's identity, or undefined if there's no cell.
 */
function slotIdentity(slot: SectorSlot | undefined, cells: MapCell[]): string | undefined {
    return slot === undefined ? undefined : cells[slot.granuleIndex].identity;
}

/**
 * The character in one position of a sector's cell.
 *
 * @param kind what the sector's granule shows.
 * @param positionInCell the index of the character in the cell.
 * @param cellWidth the number of characters in a cell.
 * @param endsGranule whether the sector is the last of its granule, which puts a bar in the cell's last character.
 */
function runCharacter(kind: MapCellKind, positionInCell: number, cellWidth: number, endsGranule: boolean): string {
    if (endsGranule && positionInCell === cellWidth - 1) {
        return GRANULE_END;
    }

    switch (kind) {
        case MapCellKind.FREE:
        case MapCellKind.PAST_END:
            // One mark per sector, so that free space doesn't look like a solid bar.
            return positionInCell === 0 ? mapCellKindSymbol(kind) : " ";
        case MapCellKind.NOT_ON_IMAGE:
        case MapCellKind.FILE:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
        case MapCellKind.LOCKED_OUT:
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return mapCellKindSymbol(kind);
        default:
            assertNever(kind);
    }
}

/**
 * Draw the cells of one line of the grid: the sectors of one side of one cylinder, or the granules of one lump.
 * Neighboring cells that show the same thing form a run, and the run of a file (or of the directory or boot)
 * starts with its name, unless it continues the previous line's last run.
 *
 * @param slots the line's cells, in order, with undefined for sectors that no granule covers.
 * @param cells how every granule is drawn.
 * @param cellWidth the number of characters in a cell.
 * @param previousIdentity the identity of the last cell of the line before this one in the same cylinder
 * (the other side), or undefined if there isn't such a line or it ended in no cell.
 * @param fileColorCount the number of colors in the drawing's palette.
 * @return the line's characters, slots.length*cellWidth of them.
 */
function drawSectorRuns(slots: (SectorSlot | undefined)[], cells: MapCell[], cellWidth: number,
                        previousIdentity: string | undefined, fileColorCount: number): StyledChar[] {

    const plain = run("", MapTextStyle.PLAIN);
    const chars: StyledChar[] = [];
    for (let i = 0; i < slots.length*cellWidth; i++) {
        chars.push({ text: " ", style: plain });
    }

    let start = 0;
    while (start < slots.length) {
        const identity = slotIdentity(slots[start], cells);
        let end = start + 1;
        while (end < slots.length && slotIdentity(slots[end], cells) === identity) {
            end++;
        }

        const slot = slots[start];
        if (slot !== undefined) {
            const cell = cells[slot.granuleIndex];
            const style = cellStyle(cell, fileColorCount);

            // The run's background.
            for (let i = start; i < end; i++) {
                const endsGranule = slots[i]?.endsGranule ?? false;
                for (let positionInCell = 0; positionInCell < cellWidth; positionInCell++) {
                    chars[i*cellWidth + positionInCell] = {
                        text: runCharacter(cell.kind, positionInCell, cellWidth, endsGranule),
                        style,
                    };
                }
            }

            // The name, written over the background. A run that continues from the other side's line doesn't
            // repeat it.
            const continuesPreviousLine = start === 0 && previousIdentity === identity;
            if (cell.label !== undefined && !continuesPreviousLine) {
                // The name may cover the bars between the run's granules, but not the one that ends the run, so
                // that the end of the file stays visible.
                const runLength = (end - start)*cellWidth;
                const endsWithGranuleEnd = chars[end*cellWidth - 1].text === GRANULE_END;
                const nameLength = Math.min(cell.label.length, endsWithGranuleEnd ? runLength - 1 : runLength);
                for (let i = 0; i < nameLength; i++) {
                    chars[start*cellWidth + i] = { text: cell.label[i], style };
                }
                // A blank between the name and the fill, but not over a granule end, which stays.
                if (nameLength < runLength && chars[start*cellWidth + nameLength].text !== GRANULE_END) {
                    chars[start*cellWidth + nameLength] = { text: " ", style };
                }
            }
        }

        start = end;
    }

    return chars;
}

/**
 * Turn the characters of a line into runs, one for each stretch in one style, without trailing blanks.
 */
function styledCharsToRuns(chars: StyledChar[]): MapTextLine {
    let end = chars.length;
    while (end > 0 && chars[end - 1].text === " ") {
        end--;
    }

    const line: MapTextLine = [];
    let start = 0;
    while (start < end) {
        let stop = start + 1;
        while (stop < end && sameStyle(chars[stop].style, chars[start].style)) {
            stop++;
        }
        line.push({ ...chars[start].style, text: chars.slice(start, stop).map(char => char.text).join("") });
        start = stop;
    }

    return line;
}

/**
 * A line of text in the muted style.
 */
function mutedLine(text: string): MapTextLine {
    return [run(text, MapTextStyle.MUTED)];
}

/**
 * Lay out the grid of a floppy's map: a line for each side of each cylinder and a cell for each of its sectors,
 * in the cell's granule's style, with the files' names written in.
 *
 * @param model the map's data.
 * @param width the number of characters that fit on a line, which decides whether the cells are wide or narrow.
 * @param fileColorCount the number of colors the drawing has for files.
 * @return the lines.
 */
function layoutSectorGrid(model: DiskMapModel, width: number, fileColorCount: number): MapTextLine[] {
    const cells = model.cells;
    const {sectorsPerTrack, firstSectorNumber, allocationSides, imageSideCount, lastCylinder} = model.layout;

    // Find each granule's sectors.
    const slots = new Map<string, SectorSlot>();
    for (let granuleIndex = 0; granuleIndex < cells.length; granuleIndex++) {
        const positions = cells[granuleIndex].sectors;
        for (let i = 0; i < positions.length; i++) {
            slots.set(positions[i].key(), { granuleIndex, endsGranule: i === positions.length - 1 });
        }
    }

    // The layout: a gutter with the cylinder and the side, then a cell for each sector. Narrow the cells if
    // the wide ones don't fit.
    const cylinderHeader = "cyl";
    const sideHeader = "side";
    const cylinderColumnWidth = Math.max(cylinderHeader.length, String(lastCylinder).length);
    const hasSideColumn = allocationSides > 1;
    const gutterWidth = cylinderColumnWidth + 2 + (hasSideColumn ? sideHeader.length + 2 : 0);
    const cellWidth = gutterWidth + sectorsPerTrack*WIDE_CELL_WIDTH <= width ? WIDE_CELL_WIDTH : NARROW_CELL_WIDTH;
    const makeGutter = (cylinderText: string, sideText: string): string =>
        cylinderText.padStart(cylinderColumnWidth) + (hasSideColumn ? "  " + sideText.padEnd(sideHeader.length) : "") + "  ";

    const lines: MapTextLine[] = [];

    // The ruler of sector numbers.
    if (cellWidth === WIDE_CELL_WIDTH) {
        let ruler = makeGutter(cylinderHeader, sideHeader);
        for (let i = 0; i < sectorsPerTrack; i++) {
            ruler += String(firstSectorNumber + i).padStart(cellWidth - 1) + " ";
        }
        lines.push(mutedLine(ruler.trimEnd()));
    } else {
        let tens = makeGutter("", "");
        let units = makeGutter(cylinderHeader, sideHeader);
        for (let i = 0; i < sectorsPerTrack; i++) {
            const sectorNumber = firstSectorNumber + i;
            const isTens = sectorNumber >= 10 && sectorNumber % 10 === 0;
            tens += (isTens ? String(Math.floor(sectorNumber/10) % 10) : " ").padEnd(cellWidth);
            units += String(sectorNumber % 10).padEnd(cellWidth);
        }
        // A track with fewer than 10 sectors needs no tens.
        const hasTens = tens.trim() !== "";
        if (hasTens) {
            lines.push(mutedLine(tens.trimEnd()));
        }
        lines.push(mutedLine(units.trimEnd()));
    }

    // The grid, a line for each side of each cylinder, in the order the DOS allocates sectors.
    for (let cylinder = 0; cylinder <= lastCylinder; cylinder++) {
        const sideSlots: (SectorSlot | undefined)[][] = [];
        for (let side = 0; side < allocationSides; side++) {
            const row: (SectorSlot | undefined)[] = [];
            for (let i = 0; i < sectorsPerTrack; i++) {
                row.push(slots.get(SectorPosition.make(cylinder, side, firstSectorNumber + i).key()));
            }
            sideSlots.push(row);
        }

        const isCovered = sideSlots.some(row => row.some(slot => slot !== undefined));
        if (!isCovered) {
            lines.push(mutedLine(makeGutter(String(cylinder), "") + "not in the file system"));
            continue;
        }

        for (let side = 0; side < allocationSides; side++) {
            // The other side's line continues onto this one, so don't repeat the name of a file that runs across.
            const previousIdentity = side > 0 ? slotIdentity(sideSlots[side - 1][sectorsPerTrack - 1], cells) : undefined;
            const body = styledCharsToRuns(drawSectorRuns(sideSlots[side], cells, cellWidth, previousIdentity,
                fileColorCount));
            const gutter = makeGutter(side === 0 ? String(cylinder) : "", String(side));
            lines.push(body.length === 0 ? mutedLine(gutter.trimEnd()) : [...mutedLine(gutter), ...body]);
        }
    }

    if (imageSideCount > allocationSides) {
        lines.push(mutedLine("The image has " + pluralizeWithCount(imageSideCount, "side") +
            ", but the file system uses only " + allocationSides + "."));
    }

    return lines;
}

/**
 * Lay out the grid of a hard disk partition's map: a line for each lump and a cell for each of its granules, in
 * the granule's style, with the files' names written in. A partition's logical track runs across all its
 * heads, which is too many sectors to draw one by one. Neighboring lumps that are entirely free are drawn
 * as one line, labeled with their range.
 *
 * @param model the map's data.
 * @param width the number of characters that fit on a line, which decides how wide the cells are.
 * @param fileColorCount the number of colors the drawing has for files.
 * @return the lines.
 */
function layoutGranuleGrid(model: DiskMapModel, width: number, fileColorCount: number): MapTextLine[] {
    const cells = model.cells;
    const {granulesPerLump, lumpCount, lumpTerm} = model.layout;

    // Each lump's granules, in order.
    const rows: (SectorSlot | undefined)[][] = [];
    for (let lump = 0; lump < lumpCount; lump++) {
        rows.push(Array.from({length: granulesPerLump}, () => undefined));
    }
    for (let granuleIndex = 0; granuleIndex < cells.length; granuleIndex++) {
        const cell = cells[granuleIndex];
        rows[cell.lump][cell.granule] = { granuleIndex, endsGranule: true };
    }

    // Group the lumps into lines, with long stretches of free lumps on one line.
    const isFreeRow = (row: (SectorSlot | undefined)[]): boolean =>
        row.every(slot => slot !== undefined && cells[slot.granuleIndex].kind === MapCellKind.FREE);
    const groups: { first: number, last: number }[] = [];
    let first = 0;
    while (first < lumpCount) {
        let last = first;
        if (isFreeRow(rows[first])) {
            while (last + 1 < lumpCount && isFreeRow(rows[last + 1])) {
                last++;
            }
            if (last - first + 1 < MIN_COLLAPSED_FREE_ROWS) {
                last = first;
            }
        }
        groups.push({ first, last });
        first = last + 1;
    }

    // The layout: a gutter with the lump, then a cell for each granule, as wide as fits.
    const header = lumpTerm === "cylinder" ? "cyl" : lumpTerm;
    const groupLabel = (group: { first: number, last: number }): string =>
        group.first === group.last ? String(group.first) : group.first + "-" + group.last;
    const gutterWidth = Math.max(header.length, ...groups.map(group => groupLabel(group).length));
    const makeGutter = (text: string): string => text.padStart(gutterWidth) + "  ";
    const cellWidth = Math.max(MIN_GRANULE_CELL_WIDTH, Math.min(MAX_GRANULE_CELL_WIDTH,
        Math.floor((width - gutterWidth - 2)/Math.max(1, granulesPerLump))));

    const lines: MapTextLine[] = [];

    // The ruler of granule numbers, at the start of their cells, where the names start.
    let ruler = makeGutter(header);
    for (let granule = 0; granule < granulesPerLump; granule++) {
        ruler += String(granule).padEnd(cellWidth);
    }
    lines.push(mutedLine(ruler.trimEnd()));

    for (const group of groups) {
        const gutter = makeGutter(groupLabel(group));
        const row = rows[group.first];
        if (row.every(slot => slot === undefined)) {
            lines.push(mutedLine(gutter + "not in the file system"));
            continue;
        }
        const body = styledCharsToRuns(drawSectorRuns(row, cells, cellWidth, undefined, fileColorCount));
        lines.push([...mutedLine(gutter), ...body]);
    }

    return lines;
}

/**
 * Lay out the map of a TRSDOS disk as text: a grid of its sectors (or of its granules, for a hard disk
 * partition), in the styles of the granules' files, with the files' names written in, then the files that
 * were asked about (if any were), a legend of the symbols, and the totals.
 *
 * @param model the map's data.
 * @param width the number of characters that fit on a line, which decides how wide the cells are.
 * @param fileColorCount the number of colors the drawing has for files. A file's color wraps around it, and
 * neighboring files that end up with the same color are one run.
 * @return the lines.
 */
export function layoutDiskMapText(model: DiskMapModel, width: number, fileColorCount: number): MapTextLine[] {
    const lines: MapTextLine[] = [];
    switch (model.layout.grid) {
        case MapGrid.SECTORS:
            lines.push(...layoutSectorGrid(model, width, fileColorCount));
            break;
        case MapGrid.GRANULES:
            lines.push(...layoutGranuleGrid(model, width, fileColorCount));
            break;
        default:
            assertNever(model.layout.grid);
    }

    // Below the grid.
    lines.push([]);
    if (model.hasSelection && model.files.length > 0) {
        lines.push(...columnize(matchedFileItems(model.files, fileColorCount), width, ""));
        lines.push([]);
    }
    lines.push(...symbolLegendLines(model.kindCounts, width));
    lines.push([run(totalsText(model.totals), undefined)]);

    return lines;
}
