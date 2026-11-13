import type {BasicDialect} from "trs80-base";
import {assertNever} from "z80-base";
import type {PreviewTab} from "./PreviewPanel.js";

/**
 * The views of a disk, which the tabs under the header switch between.
 */
export enum ViewKind {
    FILES,
    MAP,
    HEALTH,
    HISTORY,
    INFO,
}

/**
 * Every view, in the order of the tabs.
 */
export const VIEW_KINDS: readonly ViewKind[] = [
    ViewKind.FILES, ViewKind.MAP, ViewKind.HEALTH, ViewKind.HISTORY, ViewKind.INFO,
];

/**
 * The name of a view, for its tab.
 */
export function viewKindToString(kind: ViewKind): string {
    switch (kind) {
        case ViewKind.FILES:
            return "Files";
        case ViewKind.MAP:
            return "Map";
        case ViewKind.HEALTH:
            return "Health";
        case ViewKind.HISTORY:
            return "History";
        case ViewKind.INFO:
            return "Disk info";
        default:
            assertNever(kind);
    }
}

/**
 * What the page remembers about how one open disk is shown: the view, the selection, the filter, and the like.
 * It's kept by the disk's ID, so it survives switching tabs.
 */
export class DiskViewState {
    /** The view on show. */
    public view = ViewKind.FILES;
    /** The selected files, by their names as the disk shows them (such as "HELLO/BAS"). */
    public selected = new Set<string>();
    /** The file that shift-click extends the selection from, or undefined. */
    public anchor: string | undefined = undefined;
    /** Whether system files are listed. */
    public showSystem = false;
    /** The wildcard filter, or "" for none. */
    public filter = "";
    /** The file being renamed in place, by its name as the disk shows it, or undefined. */
    public renaming: string | undefined = undefined;
    /** The preview tab chosen for the file on show, or undefined for the file's default. */
    public previewTab: PreviewTab | undefined = undefined;
    /** The BASIC chosen to read listings as, or undefined for what the file says. */
    public basicDialect: BasicDialect | undefined = undefined;
    /** Whether to name extracted files in lower case. */
    public extractLowercase = false;
    /** Whether to mark damaged files in extracted names. */
    public extractMarkDamaged = false;
}
