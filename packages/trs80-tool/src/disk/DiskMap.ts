import {SectorPosition} from "trs80-base";
import {
    buildDiskMap, MapCellKind, mapCellKindIsProblem, mapCellKindToString, totalsText, type DiskMapModel, type DiskSession,
    type MapCell, type MapFile,
} from "trs80-disk";
import {assertNever} from "z80-base";
import {colors, filePalette, type Style} from "../colors.js";
import {pluralize, pluralizeWithCount} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {printLines} from "./DiskList.js";

/**
 * The width to draw for when stdout isn't a terminal.
 */
const DEFAULT_WIDTH = 80;

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
 * The least characters a cell has, used when the wide cells don't fit the terminal.
 */
const NARROW_CELL_WIDTH = 2;

/**
 * The symbol that a kind of cell is drawn with. It's the only character of a free sector's cell, and the
 * fill of the rest. A file's run (and the directory's and boot's) is filled with a line after its name.
 */
function mapCellKindSymbol(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return "·";
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
 * problems stand out in the error color.
 */
function mapCellKindStyle(kind: MapCellKind): Style {
    switch (kind) {
        case MapCellKind.FREE:
        case MapCellKind.OTHER_FILE:
            return colors.muted;
        case MapCellKind.FILE:
            return colors.plain;
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
            return colors.emphasis;
        case MapCellKind.LOCKED_OUT:
            return colors.warning;
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return colors.error;
        default:
            assertNever(kind);
    }
}

/**
 * The style that a file's cells and name are drawn in: its color in the palette, or plain for a file
 * that has no color.
 */
function fileStyle(file: MapFile): Style {
    return file.colorIndex === undefined ? colors.plain : filePalette[file.colorIndex % filePalette.length];
}

/**
 * The style of a cell's characters: its file's color, or its kind's style.
 */
function cellStyle(cell: MapCell): Style {
    return cell.file !== undefined ? fileStyle(cell.file) : mapCellKindStyle(cell.kind);
}

/**
 * Lay out items in as many columns as fit, filling each column before the next.
 *
 * @param items the items, each as its colored text and its width without the color codes.
 * @param width the width of the terminal.
 * @param indent the blanks before each line.
 */
function columnize(items: { text: string, width: number }[], width: number, indent: string): string[] {
    if (items.length === 0) {
        return [];
    }
    const itemWidth = Math.max(...items.map(item => item.width));
    const gap = 3;
    const columnCount = Math.max(1, Math.floor((width - indent.length + gap)/(itemWidth + gap)));
    const rowCount = Math.ceil(items.length/columnCount);

    const lines: string[] = [];
    for (let row = 0; row < rowCount; row++) {
        let line = indent;
        for (let column = 0; column*rowCount + row < items.length; column++) {
            const item = items[column*rowCount + row];
            const isLast = (column + 1)*rowCount + row >= items.length;
            line += item.text + (isLast ? "" : " ".repeat(itemWidth - item.width + gap));
        }
        lines.push(line);
    }

    return lines;
}

/**
 * The entries that list the files the user asked about: name in the file's color, size in granules, size in
 * bytes, and a mark for system files. A file with no granules is listed too, since it isn't in the grid.
 */
function matchedFileItems(mapFiles: MapFile[]): { text: string, width: number }[] {
    const nameWidth = Math.max(...mapFiles.map(file => file.name.length));
    const granuleWidth = Math.max(...mapFiles.map(file => file.granuleCount.toLocaleString().length));
    const byteWidth = Math.max(...mapFiles.map(file => file.dirEntry.getSize().toLocaleString().length));

    return mapFiles.map(file => {
        const granuleText = file.granuleCount.toLocaleString().padStart(granuleWidth) + " " +
            pluralize(file.granuleCount, "granule ", "granules");
        const byteText = file.dirEntry.getSize().toLocaleString().padStart(byteWidth) + " bytes";
        const systemText = file.dirEntry.isSystemFile() ? "  system" : "";
        const plainWidth = nameWidth + 2 + granuleText.length + 2 + byteText.length + systemText.length;
        const text = fileStyle(file)(file.name.padEnd(nameWidth)) + "  " + granuleText + "  " + byteText +
            colors.muted(systemText);
        return { text, width: plainWidth };
    });
}

/**
 * The legend's line of symbols and what they mean, for the symbols that appear on the map, wrapped to the width.
 *
 * @param counts the number of cells of each kind.
 * @param width the width of the terminal.
 */
function symbolLegendLines(counts: Map<MapCellKind, number>, width: number): string[] {
    // The kinds that are drawn with a symbol of their own, in the order they're listed in, with the problems
    // last. Files, the directory and the boot granules are named in the grid.
    const kinds = [MapCellKind.FREE, MapCellKind.LOCKED_OUT, MapCellKind.OTHER_FILE, MapCellKind.SHARED,
        MapCellKind.CLAIMED_BUT_FREE, MapCellKind.UNCLAIMED];

    const lines: string[] = [];
    let line = "";
    let lineWidth = 0;
    for (const kind of kinds) {
        const count = counts.get(kind) ?? 0;
        if (count === 0) {
            continue;
        }
        const plain = mapCellKindSymbol(kind) + " " + mapCellKindToString(kind) +
            (mapCellKindIsProblem(kind) ? " (" + count.toLocaleString() + ")" : "");
        const text = mapCellKindStyle(kind)(mapCellKindSymbol(kind)) + " " + mapCellKindToString(kind) +
            (mapCellKindIsProblem(kind) ? " (" + count.toLocaleString() + ")" : "");
        if (lineWidth > 0 && lineWidth + 3 + plain.length > width) {
            lines.push(line);
            line = "";
            lineWidth = 0;
        }
        if (lineWidth > 0) {
            line += "   ";
            lineWidth += 3;
        }
        line += text;
        lineWidth += plain.length;
    }
    if (lineWidth > 0) {
        lines.push(line);
    }

    return lines;
}

/**
 * Where one sector of a granule sits in the grid.
 */
interface SectorSlot {
    /** The index of the sector's granule in the granule map. */
    granuleIndex: number;
    /** Whether the sector is the last of its granule. */
    endsGranule: boolean;
}

/**
 * One character of a drawn line, with the style to draw it in.
 */
interface StyledChar {
    /** The character. */
    text: string;
    /** The style. */
    style: Style;
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
            // One mark per sector, so that free space doesn't look like a solid bar.
            return positionInCell === 0 ? mapCellKindSymbol(kind) : " ";
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
 * Draw the sectors of one line of the grid (one side of one cylinder). Neighboring sectors that show the
 * same thing form a run, and the run of a file (or of the directory or boot) starts with its name, unless it
 * continues the previous line's last run.
 *
 * @param slots the line's sectors, in sector order, with undefined for those that no granule covers.
 * @param cells how every granule is drawn.
 * @param cellWidth the number of characters in a cell.
 * @param previousIdentity the identity of the last cell of the line before this one in the same cylinder
 * (the other side), or undefined if there isn't such a line or it ended in no cell.
 * @return the line's characters, slots.length*cellWidth of them.
 */
function drawSectorRuns(slots: (SectorSlot | undefined)[], cells: MapCell[], cellWidth: number,
                        previousIdentity: string | undefined): StyledChar[] {

    const chars: StyledChar[] = [];
    for (let i = 0; i < slots.length*cellWidth; i++) {
        chars.push({ text: " ", style: colors.plain });
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

            // The run's background.
            for (let i = start; i < end; i++) {
                const endsGranule = slots[i]?.endsGranule ?? false;
                for (let positionInCell = 0; positionInCell < cellWidth; positionInCell++) {
                    chars[i*cellWidth + positionInCell] = {
                        text: runCharacter(cell.kind, positionInCell, cellWidth, endsGranule),
                        style: cellStyle(cell),
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
                    chars[start*cellWidth + i] = { text: cell.label[i], style: cellStyle(cell) };
                }
                // A blank between the name and the fill, but not over a granule end, which stays.
                if (nameLength < runLength && chars[start*cellWidth + nameLength].text !== GRANULE_END) {
                    chars[start*cellWidth + nameLength] = { text: " ", style: cellStyle(cell) };
                }
            }
        }

        start = end;
    }

    return chars;
}

/**
 * Turn the characters of a line into a string, with their styles and without trailing blanks.
 */
function styledCharsToString(chars: StyledChar[]): string {
    let end = chars.length;
    while (end > 0 && chars[end - 1].text === " ") {
        end--;
    }

    let result = "";
    let start = 0;
    while (start < end) {
        let stop = start + 1;
        while (stop < end && chars[stop].style === chars[start].style) {
            stop++;
        }
        result += chars[start].style(chars.slice(start, stop).map(char => char.text).join(""));
        start = stop;
    }

    return result;
}

/**
 * Draw the map of a TRSDOS disk: a grid with a line for each side of each cylinder and a cell for each of
 * its sectors, in the cell's granule's color, with the files' names written in, then a legend of the symbols
 * and the totals.
 *
 * @param model the map's data.
 * @param width the width of the terminal.
 * @return the lines.
 */
export function drawGranuleMap(model: DiskMapModel, width: number): string[] {
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

    const lines: string[] = [];

    // The ruler of sector numbers.
    if (cellWidth === WIDE_CELL_WIDTH) {
        let ruler = makeGutter(cylinderHeader, sideHeader);
        for (let i = 0; i < sectorsPerTrack; i++) {
            ruler += String(firstSectorNumber + i).padStart(cellWidth - 1) + " ";
        }
        lines.push(colors.muted(ruler.trimEnd()));
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
            lines.push(colors.muted(tens.trimEnd()));
        }
        lines.push(colors.muted(units.trimEnd()));
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
            lines.push(colors.muted(makeGutter(String(cylinder), "") + "not in the file system"));
            continue;
        }

        for (let side = 0; side < allocationSides; side++) {
            // The other side's line continues onto this one, so don't repeat the name of a file that runs across.
            const previousIdentity = side > 0 ? slotIdentity(sideSlots[side - 1][sectorsPerTrack - 1], cells) : undefined;
            const body = styledCharsToString(drawSectorRuns(sideSlots[side], cells, cellWidth, previousIdentity));
            const gutter = makeGutter(side === 0 ? String(cylinder) : "", String(side));
            lines.push(body === "" ? colors.muted(gutter.trimEnd()) : colors.muted(gutter) + body);
        }
    }

    if (imageSideCount > allocationSides) {
        lines.push(colors.muted("The image has " + pluralizeWithCount(imageSideCount, "side") +
            ", but the file system uses only " + allocationSides + "."));
    }

    // Below the grid.
    lines.push("");
    if (model.hasSelection && model.files.length > 0) {
        lines.push(...columnize(matchedFileItems(model.files), width, ""));
        lines.push("");
    }
    lines.push(...symbolLegendLines(model.kindCounts, width));
    lines.push(totalsText(model.totals));

    return lines;
}

/**
 * The "map" command: draw where everything is on a TRSDOS-family disk.
 */
export const MAP_COMMAND: DiskCommand = {
    spec: {
        name: "map",
        aliases: [],
        args: "[PATTERN...]",
        summary: "draw the disk sector by sector: where each file is, what's free, and any damage",
        options: [],
        extraHelp: [
            "Each cylinder is a line, and each sector on it is a cell (two characters wide, or one on a narrow terminal), " +
                "numbered by the ruler above. On a double-sided disk each cylinder has a line for side 0 and one for " +
                "side 1, so reading left to right and top to bottom follows the order the DOS allocates sectors in. " +
                "A \"│\" ends each granule, so you can see where they begin and end.",
            "A file is a run of \"─\" that starts with its name, in a color of its own, and the name repeats " +
                "at the start of each cylinder (but not when a file runs from side 0 to side 1). The directory and " +
                "the boot granule are drawn the same way. Free sectors are \"·\", locked-out granules \"x\", and " +
                "sectors that the file system doesn't cover are blank.",
            "With patterns, only the files that match get names and colors, and the others are shown as a plain " +
                "\"─\"; the matching files are listed below the map. A wildcard never matches a system file; to " +
                "show one, give its name.",
            "Damage shows in the error color: \"!\" for a granule that two or more files claim, \"?\" for one " +
                "that a file claims but the GAT says is free, and \"u\" for one the GAT says is used but no file claims.",
            "This works on TRSDOS-family disks only, and changes nothing.",
        ],
    },

    endsSession: false,
    floppyOnly: true,

    /**
     * Draw the map, through the pager if it's taller than the screen. It only reads, so it works on any
     * disk whose file system is TRSDOS-family, including a read-only one.
     */
    run(session: DiskSession, command) {
        const model = buildDiskMap(session, command.args);

        const width = process.stdout.columns ?? DEFAULT_WIDTH;
        printLines(drawGranuleMap(model, width));
    },
};
