import {
    buildDiskMap, layoutDiskMapText, MapTextStyle, type DiskMapModel, type DiskSession, type MapTextRun,
} from "trs80-disk";
import {assertNever} from "z80-base";
import {colors, filePalette, type Style} from "../colors.js";
import type {DiskCommand} from "./DiskCommands.js";
import {mapToJson} from "./DiskJson.js";
import {outputPagedLines} from "./DiskList.js";

/**
 * The width to draw for when stdout isn't a terminal.
 */
const DEFAULT_WIDTH = 80;

/**
 * The terminal style of a style of the map's text.
 *
 * @param style the style.
 * @param fileColor for FILE, the index of the color in the file palette.
 */
function mapTextStyleToStyle(style: MapTextStyle, fileColor: number | undefined): Style {
    switch (style) {
        case MapTextStyle.PLAIN:
            return colors.plain;
        case MapTextStyle.MUTED:
            return colors.muted;
        case MapTextStyle.WARNING:
            return colors.warning;
        case MapTextStyle.ERROR:
            return colors.error;
        case MapTextStyle.EMPHASIS:
            return colors.emphasis;
        case MapTextStyle.FILE:
            return filePalette[fileColor ?? 0];
        default:
            assertNever(style);
    }
}

/**
 * A run of the map's text with its escape codes, or as it is if it has no style.
 */
function drawRun(run: MapTextRun): string {
    return run.style === undefined ? run.text : mapTextStyleToStyle(run.style, run.fileColor)(run.text);
}

/**
 * Draw the map of a TRSDOS disk (see layoutDiskMapText()), in the terminal's colors.
 *
 * @param model the map's data.
 * @param width the width of the terminal.
 * @return the lines.
 */
export function drawGranuleMap(model: DiskMapModel, width: number): string[] {
    return layoutDiskMapText(model, width, filePalette.length).map(line => line.map(drawRun).join(""));
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
            "On a hard disk the map is of the chosen partition. Its tracks run across all its heads, too many " +
                "sectors to draw one by one, so each line is a cylinder (a lump, on NEWDOS/80) and each cell is a " +
                "whole granule, numbered by the ruler above. Cylinders in a row that are entirely free share one " +
                "line, labeled with their range.",
            "This works on TRSDOS-family disks and partitions only, and changes nothing.",
        ],
    },

    endsSession: false,

    /**
     * Draw the map, through the pager if it's taller than the screen. It only reads, so it works on any
     * disk whose file system is TRSDOS-family, including a read-only one.
     */
    run(session: DiskSession, command, globalOptions, out) {
        const model = buildDiskMap(session, command.args);

        const width = process.stdout.columns ?? DEFAULT_WIDTH;
        outputPagedLines(out, drawGranuleMap(model, width));
        out.result(mapToJson(model));
    },
};
