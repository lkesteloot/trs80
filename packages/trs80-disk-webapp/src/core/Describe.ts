import type {AddFilesResult} from "trs80-disk";
import {countOf} from "./Dom.js";

// How both pages put what an action did into words.

/**
 * The lines that say what an add did, for a page's message area: each conversion, each file added or replaced, and
 * the warnings.
 *
 * @param result what the add returned.
 */
export function describeAdd(result: AddFilesResult): string[] {
    const lines: string[] = [];
    for (const file of result.files) {
        lines.push(...file.conversionMessages);
        lines.push((file.replaced ? "Replaced " : "Added ") + file.name + " (" + countOf(file.size, "byte") + ").");
    }
    for (const warning of result.warnings) {
        lines.push("Warning: " + warning + ".");
    }
    return lines;
}
