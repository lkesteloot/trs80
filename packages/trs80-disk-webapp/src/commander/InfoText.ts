import {TrsdosFindingSeverity, trsdosFindingKindSeverity} from "trs80-base";
import {checkDisk, DiskError, findingSeverityHeading} from "trs80-disk";
import {assertNever} from "z80-base";
import {getDiskDetails} from "../core/DiskFacts.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {escapeHtml, spanHtml} from "../core/preview/PreviewHtml.js";

// The Info view of the other panel's disk, as text: its facts, what "check" finds, and the undo history.

/** The width that a fact's name is padded to. */
const TERM_WIDTH = 24;

/**
 * The CSS class that colors a finding's dot.
 */
function severityClass(severity: TrsdosFindingSeverity): string {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "warn";
        case TrsdosFindingSeverity.DAMAGE:
            return "err";
        case TrsdosFindingSeverity.NOTE:
            return "muted";
        default:
            assertNever(severity);
    }
}

/**
 * The lines of what "check" finds, as HTML.
 *
 * @param disk the disk.
 */
function checkLines(disk: OpenDisk): string[] {
    let findings;
    try {
        findings = checkDisk(disk.session).findings;
    } catch (e) {
        if (e instanceof DiskError) {
            return ["  " + spanHtml(e.message, "muted")];
        }
        throw e;
    }
    if (findings.length === 0) {
        return ["  " + spanHtml("No problems found.", "ok")];
    }

    const lines: string[] = [];
    for (const severity of [TrsdosFindingSeverity.LAYOUT, TrsdosFindingSeverity.DAMAGE, TrsdosFindingSeverity.NOTE]) {
        const group = findings.filter(finding => trsdosFindingKindSeverity(finding.kind) === severity);
        if (group.length === 0) {
            continue;
        }
        lines.push("  " + escapeHtml(findingSeverityHeading(severity)));
        for (const finding of group) {
            lines.push("    " + spanHtml("●", severityClass(severity)) + " " + escapeHtml(finding.message));
        }
    }
    return lines;
}

/**
 * The lines of the undo history, oldest first, with a marker on the entry that the disk is at.
 *
 * @param disk the disk.
 */
function historyLines(disk: OpenDisk): string[] {
    const history = disk.session.getHistory();
    const lines: string[] = [];
    const mark = (position: number, label: string): string => {
        const marker = position === history.position ? "▶" : position < history.position ? "·" : " ";
        const savedText = position === history.savedPosition ? " " + spanHtml("(saved)", "ok") : "";
        return "  " + marker + " " + (position > history.position ? spanHtml(label, "muted") : escapeHtml(label)) + savedText;
    };

    lines.push(mark(0, "Opened"));
    for (const [index, label] of history.entries.entries()) {
        lines.push(mark(index + 1, label));
    }
    return lines;
}

/**
 * The text of the Info view: a block of facts, then what "check" finds, then the history.
 *
 * @param disk the disk.
 * @returns the HTML for a "pre" body.
 */
export function infoHtmlOf(disk: OpenDisk): string {
    const lines: string[] = [];
    for (const [term, value] of getDiskDetails(disk)) {
        lines.push(spanHtml(term.padEnd(TERM_WIDTH), "k") + escapeHtml(value));
    }

    lines.push("");
    lines.push(spanHtml("check", "k"));
    lines.push(...checkLines(disk));
    lines.push("");
    lines.push(spanHtml("history", "k") + " (Ctrl-Z undoes, Shift-Ctrl-Z redoes)");
    lines.push(...historyLines(disk));
    return lines.join("\n");
}
