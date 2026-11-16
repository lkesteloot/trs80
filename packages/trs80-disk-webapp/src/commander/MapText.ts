import {
    buildDiskMap, DiskError, layoutDiskMapText, MapTextStyle, type DiskMapModel, type DiskSession, type MapTextRun,
} from "trs80-disk";
import {assertNever} from "z80-base";
import {FILE_COLORS} from "../core/DiskFacts.js";
import {escapeHtml} from "../core/preview/PreviewHtml.js";

// The disk map drawn as text, the way "trs80-tool disk IMAGE map" draws it, from the engine's layout
// (layoutDiskMapText()). Here the styles are spans, in the commander's theme.

/**
 * The CSS color of a style of the map's text, from the page's theme.
 *
 * @param style the style.
 * @param fileColor for FILE, the index of the color in FILE_COLORS.
 */
function mapTextStyleToColor(style: MapTextStyle, fileColor: number | undefined): string {
    switch (style) {
        case MapTextStyle.PLAIN:
            return "var(--fg)";
        case MapTextStyle.MUTED:
            return "var(--fg-muted)";
        case MapTextStyle.WARNING:
            return "var(--warn)";
        case MapTextStyle.ERROR:
            return "var(--err)";
        case MapTextStyle.EMPHASIS:
            return "var(--fg-strong)";
        case MapTextStyle.FILE:
            return FILE_COLORS[fileColor ?? 0];
        default:
            assertNever(style);
    }
}

/**
 * A run of the map's text as HTML: a span of its color, or the escaped text if it has no style.
 */
function runToHtml(run: MapTextRun): string {
    return run.style === undefined || run.text === "" ? escapeHtml(run.text) :
        "<span style=\"color:" + mapTextStyleToColor(run.style, run.fileColor) + "\">" + escapeHtml(run.text) + "</span>";
}

/**
 * Draw the map of a TRSDOS disk (see layoutDiskMapText()) as lines of HTML.
 *
 * @param model the map's data.
 * @param width the number of characters that fit on a line, which decides whether the cells are wide or narrow.
 * @returns the lines.
 */
export function drawGranuleMapHtml(model: DiskMapModel, width: number): string[] {
    return layoutDiskMapText(model, width, FILE_COLORS.length).map(line => line.map(runToHtml).join(""));
}

/**
 * Draw a session's disk as a map, for a panel.
 *
 * @param session the disk's session.
 * @param width the number of characters that fit on a line, which decides whether the cells are wide or narrow.
 * @returns the map as HTML, or a message (as plain text) if the disk has no map.
 */
export function mapHtmlOf(session: DiskSession, width: number): {html: string, isMessage: boolean} {
    try {
        return {html: drawGranuleMapHtml(buildDiskMap(session, []), width).join("\n"), isMessage: false};
    } catch (e: any) {
        if (e instanceof DiskError) {
            return {html: escapeHtml(e.message), isMessage: true};
        }
        throw e;
    }
}
