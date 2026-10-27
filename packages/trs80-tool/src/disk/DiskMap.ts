import {Trsdos, TrsdosGranuleMap, type TrsdosDirEntry, type TrsdosGranule} from "trs80-base";
import {assertNever} from "z80-base";
import {colors, filePalette, type Style} from "../colors.js";
import {pluralize, pluralizeWithCount, selectByPatterns, systemWildcardHint, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {printLines} from "./DiskList.js";
import type {DiskSession} from "./DiskSession.js";

/**
 * The width to draw for when stdout isn't a terminal.
 */
const DEFAULT_WIDTH = 80;

/**
 * The columns of the map are kept to a multiple of this when the map is split into blocks, so that the
 * ruler's tens line up with the block's edges.
 */
const RULER_STEP = 10;

/**
 * The raw (8 + 3 characters) names of the system files that the map shows as the boot and directory
 * granules rather than as files.
 */
const BOOT_RAW_FILENAME = "BOOT    SYS";
const DIR_RAW_FILENAME = "DIR     SYS";

/**
 * The characters that name files in the map, in order: A to Z, a to z, then 0 to 9. The symbols that mean
 * something else are left out (B for boot, D for directory, and o, u and x), so a letter is never
 * ambiguous. Files past the end of the list are all "+".
 */
const FILE_SYMBOLS = (() => {
    const reserved = new Set(["B", "D", "o", "u", "x"]);
    const all = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return [...all].filter(ch => !reserved.has(ch));
})();

/**
 * The symbol for files that don't have their own, when there are more files than symbols.
 */
const OVERFLOW_SYMBOL = "+";

/**
 * What one cell of the map, which is one granule, shows.
 */
export enum MapCellKind {
    /** Nothing uses the granule. */
    FREE,
    /** One file uses it, and the file is among those the user is looking at. */
    FILE,
    /** One file uses it, but the user asked about other files. */
    OTHER_FILE,
    /** The directory. */
    DIRECTORY,
    /** The boot sector's granule, or BOOT/SYS's. */
    BOOT,
    /** The lockout table says the granule can't be used. */
    LOCKED_OUT,
    /** Two or more files claim the granule. */
    SHARED,
    /** A file claims the granule, but the GAT says it's free, so the DOS would hand it out again. */
    CLAIMED_BUT_FREE,
    /** The GAT says the granule is used, but no file claims it. */
    UNCLAIMED,
}

/**
 * What a cell kind means, for the map's legend. A file's cells are described by the file's own entry in
 * the legend, so this is only a generic phrase for it.
 */
export function mapCellKindToString(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return "free";
        case MapCellKind.FILE:
            return "file";
        case MapCellKind.OTHER_FILE:
            return "other file";
        case MapCellKind.DIRECTORY:
            return "directory";
        case MapCellKind.BOOT:
            return "boot";
        case MapCellKind.LOCKED_OUT:
            return "locked out";
        case MapCellKind.SHARED:
            return "shared by two or more files";
        case MapCellKind.CLAIMED_BUT_FREE:
            return "claimed by a file but free in the GAT";
        case MapCellKind.UNCLAIMED:
            return "used in the GAT but claimed by no file";
        default:
            assertNever(kind);
    }
}

/**
 * The symbol that a kind of cell is drawn with (a file's cells have the file's own symbol instead).
 */
function mapCellKindSymbol(kind: MapCellKind): string {
    switch (kind) {
        case MapCellKind.FREE:
            return ".";
        case MapCellKind.FILE:
            return OVERFLOW_SYMBOL;
        case MapCellKind.OTHER_FILE:
            return "o";
        case MapCellKind.DIRECTORY:
            return "D";
        case MapCellKind.BOOT:
            return "B";
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
 * Whether the kind of cell is a sign of a damaged file system.
 */
function isProblem(kind: MapCellKind): boolean {
    switch (kind) {
        case MapCellKind.SHARED:
        case MapCellKind.CLAIMED_BUT_FREE:
        case MapCellKind.UNCLAIMED:
            return true;
        case MapCellKind.FREE:
        case MapCellKind.FILE:
        case MapCellKind.OTHER_FILE:
        case MapCellKind.DIRECTORY:
        case MapCellKind.BOOT:
        case MapCellKind.LOCKED_OUT:
            return false;
        default:
            assertNever(kind);
    }
}

/**
 * A file that the map draws with a symbol of its own.
 */
interface MapFile {
    /** The directory entry. */
    dirEntry: TrsdosDirEntry;
    /** The character that marks the file's granules, or a blank for a file with no granules. */
    symbol: string;
    /** The style of the symbol. */
    style: Style;
    /** The number of granules the file occupies. */
    granuleCount: number;
}

/**
 * How one granule is drawn.
 */
interface MapCell {
    /** The kind of cell. */
    kind: MapCellKind;
    /** The file, for a FILE cell. */
    file: MapFile | undefined;
}

/**
 * Whether the entry is BOOT/SYS or DIR/SYS, which the map draws as B and D rather than as files.
 */
function isBootOrDirFile(dirEntry: TrsdosDirEntry): boolean {
    return dirEntry.rawFilename === BOOT_RAW_FILENAME || dirEntry.rawFilename === DIR_RAW_FILENAME;
}

/**
 * Decide what a granule shows. The checks run in order of importance: a problem shows over anything
 * else, then a file, then the disk's own structures.
 *
 * @param granule the granule.
 * @param mapFiles the files that have symbols, by directory entry.
 */
function classifyGranule(granule: TrsdosGranule, mapFiles: Map<TrsdosDirEntry, MapFile | undefined>): MapCell {
    const realOwners = granule.owners.filter(owner => !isBootOrDirFile(owner));
    const hasBootOwner = granule.owners.some(owner => owner.rawFilename === BOOT_RAW_FILENAME);

    if (realOwners.length > 1) {
        return { kind: MapCellKind.SHARED, file: undefined };
    }
    if (granule.owners.length > 0 && !granule.gatUsed) {
        return { kind: MapCellKind.CLAIMED_BUT_FREE, file: undefined };
    }
    if (realOwners.length === 1) {
        const file = mapFiles.get(realOwners[0]);
        return file === undefined ? { kind: MapCellKind.OTHER_FILE, file: undefined } : { kind: MapCellKind.FILE, file };
    }
    if (granule.inDirectory) {
        return { kind: MapCellKind.DIRECTORY, file: undefined };
    }
    if (hasBootOwner) {
        return { kind: MapCellKind.BOOT, file: undefined };
    }
    if (granule.owners.length > 0) {
        // DIR/SYS outside the directory's range, which is unusual but not a problem for the file system.
        return { kind: MapCellKind.DIRECTORY, file: undefined };
    }
    if (granule.lockedOut) {
        return { kind: MapCellKind.LOCKED_OUT, file: undefined };
    }
    if (granule.gatUsed) {
        // The boot cylinder has granules that no file claims, on DOSes whose boot sector isn't a file.
        return { kind: granule.lump === 0 ? MapCellKind.BOOT : MapCellKind.UNCLAIMED, file: undefined };
    }
    return { kind: MapCellKind.FREE, file: undefined };
}

/**
 * Draw one cell, colored.
 */
function drawCell(cell: MapCell): string {
    if (cell.file !== undefined) {
        return cell.file.style(cell.file.symbol);
    }
    return mapCellKindStyle(cell.kind)(mapCellKindSymbol(cell.kind));
}

/**
 * Give the files their symbols and colors. User files come first, in directory order, then system
 * files; BOOT/SYS and DIR/SYS have none, since the map shows them as B and D.
 *
 * @param files the primary directory entries to give symbols to (the selected ones), in directory order.
 * @param granuleCounts the number of granules each file occupies.
 * @return the files in legend order.
 */
function makeMapFiles(files: TrsdosDirEntry[], granuleCounts: Map<TrsdosDirEntry, number>): MapFile[] {
    const candidates = files.filter(file => !isBootOrDirFile(file));
    const ordered = [...candidates.filter(file => !file.isSystemFile()), ...candidates.filter(file => file.isSystemFile())];

    const mapFiles: MapFile[] = [];
    let nextSymbol = 0;
    for (const dirEntry of ordered) {
        const granuleCount = granuleCounts.get(dirEntry) ?? 0;
        if (granuleCount === 0) {
            // It has no cells to mark. (It's still listed if the user named it.)
            mapFiles.push({ dirEntry, symbol: " ", style: colors.plain, granuleCount });
            continue;
        }
        const symbol = nextSymbol < FILE_SYMBOLS.length ? FILE_SYMBOLS[nextSymbol] : OVERFLOW_SYMBOL;
        const style = filePalette[nextSymbol % filePalette.length];
        nextSymbol++;
        mapFiles.push({ dirEntry, symbol, style, granuleCount });
    }

    return mapFiles;
}

/**
 * The rows of the ruler over a block of the map and the label for each row of granules.
 *
 * @param firstLump the first lump in the block.
 * @param lumpCountInBlock the number of lumps in the block.
 * @param maxLump the highest lump number on the disk, which decides how many digits the ruler has.
 * @param gutterWidth the width of the labels on the left.
 * @param lumpTerm "cylinder" or "lump".
 * @return the ruler's lines, from the highest digit to the units.
 */
function rulerLines(firstLump: number, lumpCountInBlock: number, maxLump: number, gutterWidth: number,
                    lumpTerm: string): string[] {

    const lines: string[] = [];
    for (let place = 10**(String(maxLump).length - 1); place >= 10; place /= 10) {
        // The digit appears over the lump where it starts counting, as in a ruler.
        let line = " ".repeat(gutterWidth + 1);
        for (let i = 0; i < lumpCountInBlock; i++) {
            const lump = firstLump + i;
            line += lump % place === 0 ? String(Math.floor(lump/place) % 10) : " ";
        }
        lines.push(colors.muted(line.trimEnd()));
    }

    let units = lumpTerm.padEnd(gutterWidth) + " ";
    for (let i = 0; i < lumpCountInBlock; i++) {
        units += String((firstLump + i) % 10);
    }
    lines.push(colors.muted(units));

    return lines;
}

/**
 * Split the lumps into blocks that fit in the width.
 *
 * @param lumpCount the number of lumps.
 * @param available the number of cells that fit on a line.
 * @return the number of lumps in each block (the last block may be shorter).
 */
function blockSize(lumpCount: number, available: number): number {
    if (lumpCount <= available) {
        return lumpCount;
    }
    if (available < RULER_STEP) {
        return Math.max(1, available);
    }

    // Balance the blocks (80 lumps on 70 columns are 2 blocks of 40, not 70 and 10), and keep their edges
    // on the ruler's tens where that fits.
    const blockCount = Math.ceil(lumpCount/available);
    const size = Math.ceil(lumpCount/blockCount);
    const rounded = Math.ceil(size/RULER_STEP)*RULER_STEP;
    return rounded <= available ? rounded : size;
}

/**
 * The text of the map's totals line, such as "62 of 240 granules used, 178 free (222.5 KB)".
 */
function totalsText(granuleMap: TrsdosGranuleMap): string {
    const trsdos = granuleMap.trsdos;
    const total = granuleMap.granules.length;
    const free = granuleMap.getFreeGranuleCount();
    const lockedOut = granuleMap.granules.filter(granule => granule.lockedOut).length;
    const freeKb = granuleMap.getFreeByteCount()/1024;
    const granuleBytes = trsdos.sectorsPerGranule*trsdos.geometry.modalDataSectorSize;
    return (total - free).toLocaleString() + " of " + pluralizeWithCount(total, "granule") + " used, " +
        free.toLocaleString() + " free (" + freeKb.toLocaleString(undefined, { maximumFractionDigits: 1 }) +
        " KB)" + (lockedOut > 0 ? ", " + lockedOut.toLocaleString() + " locked out" : "") +
        ". A granule is " + pluralizeWithCount(granuleBytes, "byte") + ".";
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
 * The legend's entries for the files: symbol, name, size in granules, size in bytes, and a mark for
 * system files.
 */
function fileLegendItems(mapFiles: MapFile[]): { text: string, width: number }[] {
    const nameWidth = Math.max(...mapFiles.map(file => file.dirEntry.getFilename("/").length));
    const granuleWidth = Math.max(...mapFiles.map(file => file.granuleCount.toLocaleString().length));
    const byteWidth = Math.max(...mapFiles.map(file => file.dirEntry.getSize().toLocaleString().length));

    return mapFiles.map(file => {
        const granuleText = file.granuleCount.toLocaleString().padStart(granuleWidth) + " " +
            pluralize(file.granuleCount, "granule ", "granules");
        const byteText = file.dirEntry.getSize().toLocaleString().padStart(byteWidth) + " bytes";
        const systemText = file.dirEntry.isSystemFile() ? "  system" : "";
        const plainWidth = 1 + 2 + nameWidth + 2 + granuleText.length + 2 + byteText.length + systemText.length;
        const text = file.style(file.symbol) + "  " + file.dirEntry.getFilename("/").padEnd(nameWidth) + "  " +
            granuleText + "  " + byteText + colors.muted(systemText);
        return { text, width: plainWidth };
    });
}

/**
 * The legend's line of symbols and what they mean, for the kinds that appear on the map, wrapped to the width.
 *
 * @param counts the number of cells of each kind.
 * @param width the width of the terminal.
 */
function symbolLegendLines(counts: Map<MapCellKind, number>, width: number): string[] {
    // The order they're listed in, with the problems last.
    const kinds = [MapCellKind.FREE, MapCellKind.DIRECTORY, MapCellKind.BOOT, MapCellKind.LOCKED_OUT,
        MapCellKind.OTHER_FILE, MapCellKind.SHARED, MapCellKind.CLAIMED_BUT_FREE, MapCellKind.UNCLAIMED];

    const lines: string[] = [];
    let line = "";
    let lineWidth = 0;
    for (const kind of kinds) {
        const count = counts.get(kind) ?? 0;
        if (count === 0) {
            continue;
        }
        const plain = mapCellKindSymbol(kind) + " " + mapCellKindToString(kind) +
            (isProblem(kind) ? " (" + count.toLocaleString() + ")" : "");
        const text = mapCellKindStyle(kind)(mapCellKindSymbol(kind)) + " " + mapCellKindToString(kind) +
            (isProblem(kind) ? " (" + count.toLocaleString() + ")" : "");
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
 * Draw the map of a TRSDOS disk: a grid with a column for each lump and a row for each granule in it, a
 * legend naming the files, and the totals.
 *
 * @param granuleMap the analysis of the disk. Its owners' entries are the files, in directory order.
 * @param files the directory entries to draw, in directory order, as made for the granule map.
 * @param selected the files to give symbols to, or undefined for all of them.
 * @param width the width of the terminal.
 * @return the lines.
 */
export function drawGranuleMap(granuleMap: TrsdosGranuleMap, files: TrsdosDirEntry[],
                               selected: TrsdosDirEntry[] | undefined, width: number): string[] {

    const trsdos = granuleMap.trsdos;
    const lumpCount = trsdos.lumpCount;
    const granulesPerLump = trsdos.granulesPerLump;

    // How much of the disk each file occupies.
    const granuleCounts = new Map<TrsdosDirEntry, number>();
    for (const granule of granuleMap.granules) {
        for (const owner of granule.owners) {
            granuleCounts.set(owner, (granuleCounts.get(owner) ?? 0) + 1);
        }
    }

    // Files that have no cells don't get a symbol unless the user asked for them by pattern.
    const wanted = (selected ?? files).filter(file => selected !== undefined || (granuleCounts.get(file) ?? 0) > 0);
    const mapFiles = makeMapFiles(wanted, granuleCounts);
    const mapFilesByEntry = new Map<TrsdosDirEntry, MapFile | undefined>();
    for (const mapFile of mapFiles) {
        if (mapFile.granuleCount > 0) {
            mapFilesByEntry.set(mapFile.dirEntry, mapFile);
        }
    }

    // What every granule shows.
    const cells = granuleMap.granules.map(granule => classifyGranule(granule, mapFilesByEntry));
    const kindCounts = new Map<MapCellKind, number>();
    for (const cell of cells) {
        kindCounts.set(cell.kind, (kindCounts.get(cell.kind) ?? 0) + 1);
    }

    // The grid, in blocks of lumps that fit the width.
    const rowDigits = String(granulesPerLump - 1).length;
    const gutterWidth = Math.max("granule ".length + rowDigits, trsdos.lumpTerm.length);
    const available = Math.max(1, width - gutterWidth - 1);
    const size = blockSize(lumpCount, available);
    const lines: string[] = [];
    for (let firstLump = 0; firstLump < lumpCount; firstLump += size) {
        const lumpCountInBlock = Math.min(size, lumpCount - firstLump);
        if (firstLump > 0) {
            lines.push("");
        }
        lines.push(...rulerLines(firstLump, lumpCountInBlock, lumpCount - 1, gutterWidth, trsdos.lumpTerm));
        for (let granule = 0; granule < granulesPerLump; granule++) {
            let line = colors.muted(("granule " + String(granule).padStart(rowDigits)).padEnd(gutterWidth)) + " ";
            for (let i = 0; i < lumpCountInBlock; i++) {
                line += drawCell(cells[(firstLump + i)*granulesPerLump + granule]);
            }
            lines.push(line);
        }
    }

    // The legend.
    lines.push("");
    if (mapFiles.length > 0) {
        lines.push(...columnize(fileLegendItems(mapFiles), width, ""));
        lines.push("");
    }
    lines.push(...symbolLegendLines(kindCounts, width));
    lines.push(totalsText(granuleMap));

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
        summary: "draw the disk granule by granule: where each file is, what's free, and any damage",
        options: [],
        extraHelp: [
            "There is a column for each cylinder (or lump, where a lump isn't a cylinder) and a row for each granule in it.",
            "Each file has a letter and a color, listed below the map. With patterns, only the files that match " +
                "get letters, and the others are shown as \"o\". A wildcard never matches a system file; to " +
                "show one, give its name.",
            "Damage shows in the error color: \"!\" for a granule that two or more files claim, \"?\" for one " +
                "that a file claims but the GAT says is free, and \"u\" for one the GAT says is used but no file claims.",
            "This works on TRSDOS-family disks only, and changes nothing.",
        ],
    },

    endsSession: false,

    /**
     * Draw the map, through the pager if it's taller than the screen. It only reads, so it works on any
     * disk whose file system is TRSDOS-family, including a read-only one.
     */
    run(session: DiskSession, command) {
        const fileSystem = session.fileSystem;
        if (fileSystem === undefined) {
            throw new ToolError("Can't find a DOS directory on \"" + session.pathname + "\"");
        }
        if (!(fileSystem instanceof Trsdos)) {
            throw new ToolError("map works on TRSDOS-family disks, not " + fileSystem.nameAndVersion + " disks");
        }

        // Make our own map, from our own copy of the directory, so that the files are in directory order.
        const files = fileSystem.getDirEntries(true);
        const granuleMap = TrsdosGranuleMap.make(fileSystem, files);
        if (typeof granuleMap === "string") {
            throw new ToolError("Can't draw the map: " + granuleMap);
        }

        let selected: TrsdosDirEntry[] | undefined = undefined;
        if (command.args.length > 0) {
            const selection = selectByPatterns(files, command.args, {
                name: file => file.getFilename("."),
                hasDirectories: () => false,
                isSystem: file => file.isSystemFile(),
            }, false);
            if (selection.unmatchedPattern !== undefined) {
                throw new ToolError("No file on the disk matches \"" + selection.unmatchedPattern + "\"" +
                    systemWildcardHint(selection.unmatchedOnlySystem));
            }
            selected = selection.selected;
        }

        const width = process.stdout.columns ?? DEFAULT_WIDTH;
        printLines(drawGranuleMap(granuleMap, files, selected, width));
    },
};
