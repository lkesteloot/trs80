import {BasicDialect} from "trs80-base";
import {assertNever} from "z80-base";
import {fileKindToString, type FileRow} from "../core/FileRows.js";
import {
    availablePreviews, type PreviewFile, PreviewKind, previewKindToString, renderPreview,
} from "../core/preview/Previews.js";
import {countOf, el, formatNumber, makeButton} from "./Dom.js";
import type {DiskViewState} from "./ViewState.js";

/**
 * The "Info" tab's name in the preview tabs, next to the preview kinds.
 */
export const INFO_TAB = "info";

/**
 * A tab of the preview panel: one of the core's previews, or the file's directory information.
 */
export type PreviewTab = PreviewKind | typeof INFO_TAB;

/**
 * The BASIC choices for a listing.
 */
enum DialectChoice {
    /** What the file says. */
    AUTO,
    MODEL_III,
    MODEL_4,
}

/**
 * The BASIC that a choice means, or undefined for automatic.
 */
function dialectOfChoice(choice: DialectChoice): BasicDialect | undefined {
    switch (choice) {
        case DialectChoice.AUTO:
            return undefined;
        case DialectChoice.MODEL_III:
            return BasicDialect.MODEL_III;
        case DialectChoice.MODEL_4:
            return BasicDialect.MODEL_4;
        default:
            assertNever(choice);
    }
}

/**
 * The tabs that apply to a file, with the default first: the core's previews, then Info.
 */
function tabsFor(row: FileRow): PreviewTab[] {
    return [...availablePreviews(row.trs80File, row.bytes), INFO_TAB];
}

/**
 * The core's preview input for a row.
 */
function previewFileOf(row: FileRow): PreviewFile {
    return {
        name: row.hostName,
        binary: row.bytes,
        trs80File: row.trs80File,
        hostText: row.extractBytes !== row.bytes ? row.extractBytes : undefined,
    };
}

/**
 * Make the "Info" tab's body: the file's directory entry in words.
 */
function renderInfo(row: FileRow): HTMLElement {
    const list = el("dl", "kv");
    const add = (term: string, value: string, className = ""): void => {
        list.append(el("dt", "", term), el("dd", className, value));
    };

    add("Name", row.fullName, "mono");
    add("Size", formatNumber(row.size) + " bytes");
    add("Date", row.dateText === "" ? "none" : row.dateText);
    add("Kind", fileKindToString(row.kind) + " (" + row.trs80File.getDescription() + ")");
    const attributes = row.attributes;
    if (attributes === undefined) {
        const flags = [row.isSystem ? "system" : "", row.isHidden ? "invisible" : ""].filter(flag => flag !== "");
        add("Attributes", flags.length === 0 ? "none" : flags.join(", "));
    } else {
        const flags = [attributes.system ? "system" : "", attributes.invisible ? "invisible" : ""]
            .filter(flag => flag !== "");
        add("Attributes", flags.length === 0 ? "none" : flags.join(", "));
        add("Protection", attributes.protection);
        const passwords = [attributes.hasUpdatePassword ? "update" : "", attributes.hasAccessPassword ? "access" : ""]
            .filter(password => password !== "");
        add("Passwords", passwords.length === 0 ? "none" : passwords.join(" and "));
    }
    add("Damage", row.damage === undefined ? "none" : row.damage.toString());
    return list;
}

/**
 * Where a preview panel gets its choices and where it writes them back, so that they survive switching files.
 */
export interface PreviewPanelOptions {
    /** The disk's view state, which remembers the chosen tab and BASIC. */
    state: DiskViewState;
    /** Called when the user chooses another tab or BASIC, after the state is updated. The panel redraws itself. */
    onChange?: (() => void) | undefined;
}

/**
 * Draw a file's preview: tabs for each way of seeing it, the BASIC choice for a listing, and the body. It's used
 * in the inspector and in the full-screen view.
 *
 * @param container the element to fill. Its contents are replaced.
 * @param row the file.
 * @param options the state to use.
 */
export function renderPreviewPanel(container: HTMLElement, row: FileRow, options: PreviewPanelOptions): void {
    const state = options.state;
    const tabs = tabsFor(row);
    const tab = state.previewTab !== undefined && tabs.includes(state.previewTab) ? state.previewTab : tabs[0];

    const tabBar = el("div", "ptabs");
    for (const candidate of tabs) {
        const name = candidate === INFO_TAB ? "Info" : previewKindToString(candidate);
        tabBar.append(makeButton(name, () => {
            state.previewTab = candidate;
            renderPreviewPanel(container, row, options);
            options.onChange?.();
        }, candidate === tab ? "on" : ""));
    }
    if (tab === PreviewKind.LISTING) {
        const select = el("select", "dialect");
        select.title = "Which BASIC to read the program as";
        const choices: [DialectChoice, string][] = [
            [DialectChoice.AUTO, "BASIC: from the file"], [DialectChoice.MODEL_III, "Model I/III BASIC"],
            [DialectChoice.MODEL_4, "Model 4 BASIC"],
        ];
        const currentChoice = state.basicDialect === undefined ? DialectChoice.AUTO :
            state.basicDialect === BasicDialect.MODEL_4 ? DialectChoice.MODEL_4 : DialectChoice.MODEL_III;
        for (const [choice, label] of choices) {
            const option = el("option", "", label);
            option.value = String(choice);
            option.selected = choice === currentChoice;
            select.append(option);
        }
        select.addEventListener("change", () => {
            state.basicDialect = dialectOfChoice(Number(select.value) as DialectChoice);
            renderPreviewPanel(container, row, options);
            options.onChange?.();
        });
        tabBar.append(select);
    }

    const body = el("div", "previewbox");
    if (tab === INFO_TAB) {
        body.classList.add("info");
        body.append(renderInfo(row));
    } else {
        body.append(renderPreview(tab, previewFileOf(row), {basicDialect: state.basicDialect}));
    }
    container.replaceChildren(tabBar, body);
}

/**
 * A one-line summary for the heading of a file's panel, such as "BASIC program · 1,234 bytes · 01/02/1990".
 */
export function describeRow(row: FileRow): string {
    const parts = [fileKindToString(row.kind), countOf(row.size, "byte")];
    if (row.dateText !== "") {
        parts.push(row.dateText);
    }
    return parts.join(" · ");
}
