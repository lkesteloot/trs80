import {type TrsdosFinding, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "trs80-base";
import {type CheckResult, checkDisk, DiskError, type DiskSession, findingSeverityHeading, type RepairResult} from "trs80-disk";
import {assertNever} from "z80-base";
import {type RepairOptions, repairDryRun} from "../core/Actions.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {countOf, el, makeButton, makeSwitch, withDisabledReason} from "../core/Dom.js";
import {lightFiles, ownerKey} from "./Highlight.js";
import type {DiskViewState} from "./ViewState.js";

/**
 * What the Health view asks of the page.
 */
export interface HealthViewHost {
    /**
     * Repair the disk.
     *
     * @param options the extra repairs to make.
     * @returns undefined if it worked, and otherwise the error, which the page has shown.
     */
    repair(options: RepairOptions): Promise<string | undefined>;
    /**
     * Switch to the Map view with some granules lit.
     *
     * @param title what the granules are about.
     * @param granules the granules, each as "lump:granule".
     */
    showOnMap(title: string, granules: Set<string>): void;
}

/**
 * Check a disk, or say why it can't be.
 *
 * @param session the disk's session.
 * @returns the check's result, or the engine's message for why there's none.
 */
function tryCheck(session: DiskSession): CheckResult | string {
    try {
        return checkDisk(session);
    } catch (e) {
        if (e instanceof DiskError) {
            return e.message;
        }
        throw e;
    }
}

/**
 * Whether a finding is a problem, as the tab's badge counts them: layout doubts and damage, not the notes, which
 * are normal and harmless.
 */
function isProblem(finding: TrsdosFinding): boolean {
    return trsdosFindingKindSeverity(finding.kind) !== TrsdosFindingSeverity.NOTE;
}

/**
 * How many problems the check finds, for the Health tab's badge.
 *
 * @param session the disk's session.
 * @returns the number, or undefined if the disk can't be checked.
 */
export function countProblems(session: DiskSession): number | undefined {
    const check = tryCheck(session);
    return typeof check === "string" ? undefined : check.findings.filter(isProblem).length;
}

/**
 * The CSS class of the dot that marks a finding of a severity.
 */
function severityClassName(severity: TrsdosFindingSeverity): string {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "warn";
        case TrsdosFindingSeverity.DAMAGE:
            return "err";
        case TrsdosFindingSeverity.NOTE:
            return "info";
        default:
            assertNever(severity);
    }
}

/**
 * The severities in the order that the view lists them.
 */
const SEVERITIES: readonly TrsdosFindingSeverity[] = [
    TrsdosFindingSeverity.LAYOUT, TrsdosFindingSeverity.DAMAGE, TrsdosFindingSeverity.NOTE,
];

/**
 * What a dry run of a repair came to.
 */
type DryRunOutcome = {ok: true, result: RepairResult} | {ok: false, message: string};

/**
 * Try a repair on a copy of the disk.
 *
 * @param session the disk's session.
 * @param options the extra repairs to make.
 */
function tryRepair(session: DiskSession, options: RepairOptions): DryRunOutcome {
    try {
        return {ok: true, result: repairDryRun(session, options).result};
    } catch (e) {
        if (e instanceof DiskError) {
            return {ok: false, message: e.message};
        }
        throw e;
    }
}

/**
 * The Health view: what the check finds, grouped by how serious it is, with the verdict at the top, and the repair
 * with its dry run. Hovering a finding lights its files in the space bar, and a finding's granules can be shown on
 * the Map (a button, rather than a small copy of the map here, which keeps this view one list).
 */
export class HealthView {
    /** The view's root element, which the page puts in its main pane. */
    public readonly element = el("div", "healthview");

    private readonly host: HealthViewHost;

    /**
     * @param host the page.
     */
    constructor(host: HealthViewHost) {
        this.host = host;
    }

    /**
     * Draw the check of a disk.
     *
     * @param disk the disk.
     * @param state its view state.
     */
    public render(disk: OpenDisk, state: DiskViewState): void {
        lightFiles(undefined);
        const session = disk.session;
        const check = tryCheck(session);
        if (typeof check === "string") {
            this.element.replaceChildren(el("div", "card", el("div", "verdict", el("span", "big", "–"),
                el("div", "", el("h4", "", "This disk can't be checked."), el("div", "kind", check)))));
            return;
        }

        const children: HTMLElement[] = [this.makeVerdict(check)];
        if (check.findings.length > 0) {
            children.push(this.makeFindings(check.findings));
        }
        const repair = this.makeRepairCard(disk, state, check);
        if (repair !== undefined) {
            children.push(repair);
        }
        this.element.replaceChildren(...children);
    }

    /**
     * Make the verdict at the top.
     */
    private makeVerdict(check: CheckResult): HTMLElement {
        const problems = check.findings.filter(isProblem).length;
        const writable = check.readOnlyReason === undefined;
        const headline = (problems === 0 ? "No problems found" : countOf(problems, "thing") + " to look at") + ". " +
            (writable ? "Safe to write." : "Not safe to write.");
        const detail = writable ?
            (problems === 0 ? "The directory, the GAT and the HIT agree." : "Nothing here stops a change, but a repair can tidy it up.") :
            check.readOnlyReason ?? "";
        const mark = el("span", "big", problems === 0 && writable ? "✓" : "⚠︎");
        mark.style.color = problems === 0 && writable ? "var(--ok)" : "var(--warn)";
        return el("div", "card", el("div", "verdict", mark, el("div", "", el("h4", "", headline), el("div", "kind", detail))));
    }

    /**
     * Make the card that lists the findings, by severity.
     */
    private makeFindings(findings: TrsdosFinding[]): HTMLElement {
        const card = el("div", "card");
        card.append(el("h4", "", "What the check found"));
        for (const severity of SEVERITIES) {
            const ofSeverity = findings.filter(finding => trsdosFindingKindSeverity(finding.kind) === severity);
            if (ofSeverity.length === 0) {
                continue;
            }
            card.append(el("div", "severity", findingSeverityHeading(severity)));
            for (const finding of ofSeverity) {
                card.append(this.makeFinding(finding, severity));
            }
        }
        return card;
    }

    /**
     * Make one finding's row.
     */
    private makeFinding(finding: TrsdosFinding, severity: TrsdosFindingSeverity): HTMLElement {
        const names = finding.dirEntries.map(dirEntry => dirEntry.getFilename("/")).filter(name => name.trim() !== "");
        const body = el("div", "", finding.message);
        if (names.length > 0) {
            body.append(el("div", "fix", "Files: ", el("span", "mono", names.join(", "))));
        }

        const actions = el("span", "");
        if (finding.granules.length > 0) {
            const granules = new Set(finding.granules.map(granule => granule.lump + ":" + granule.granule));
            const button = makeButton("Show on map", () => this.host.showOnMap(finding.message, granules));
            button.title = "Switch to the Map, lit up at " + countOf(granules.size, "granule") + ".";
            actions.append(button);
        }

        const row = el("div", "finding", el("span", "sev " + severityClassName(severity)), body, actions);
        if (names.length > 0) {
            row.dataset.o = names.map(ownerKey).join(" ");
        }
        row.addEventListener("mouseenter", () => lightFiles(names));
        row.addEventListener("mouseleave", () => lightFiles(undefined));
        return row;
    }

    /**
     * Make the repair card, or undefined if there's nothing to say about repairing.
     */
    private makeRepairCard(disk: OpenDisk, state: DiskViewState, check: CheckResult): HTMLElement | undefined {
        const session = disk.session;
        const problems = check.findings.filter(isProblem).length;
        const none: RepairOptions = {freeUnclaimed: false, fixProgramSizes: false, markMissingUsed: false};
        const base = tryRepair(session, none);
        if (!base.ok) {
            if (problems === 0) {
                return undefined;
            }
            const refused = makeButton("Repair", () => undefined, "primary");
            refused.disabled = true;
            return el("div", "card", el("h4", "", "Repair"), el("p", "", base.message),
                withDisabledReason(refused, base.message));
        }

        // What the optional repairs could do, which only a run with them all off says.
        const available = {
            freeUnclaimed: base.result.repaired.freeableUnclaimed.length,
            fixProgramSizes: base.result.repaired.fixablePrograms.length,
            markMissingUsed: base.result.repaired.markableMissing.length,
        };
        const anyAvailable = available.freeUnclaimed + available.fixProgramSizes + available.markMissingUsed > 0;
        if (problems === 0 && !anyAvailable && base.result.repaired.changes.length === 0) {
            return undefined;
        }

        const chosen: RepairOptions = {
            freeUnclaimed: state.repairOptions.freeUnclaimed && available.freeUnclaimed > 0,
            fixProgramSizes: state.repairOptions.fixProgramSizes && available.fixProgramSizes > 0,
            markMissingUsed: state.repairOptions.markMissingUsed && available.markMissingUsed > 0,
        };
        const anyChosen = chosen.freeUnclaimed || chosen.fixProgramSizes || chosen.markMissingUsed;
        const plan = anyChosen ? tryRepair(session, chosen) : base;
        if (!plan.ok) {
            return el("div", "card", el("h4", "", "Repair"), el("p", "", plan.message));
        }

        const card = el("div", "card");
        card.append(el("h4", "", "Repair"));
        const opts = el("div", "opts");
        opts.style.marginTop = "0";
        const addSwitch = (key: keyof RepairOptions, text: string, title: string): void => {
            const {element} = makeSwitch(text, chosen[key], checked => {
                state.repairOptions = {...state.repairOptions, [key]: checked};
                this.render(disk, state);
            }, title);
            opts.append(element);
        };
        if (available.freeUnclaimed > 0) {
            addSwitch("freeUnclaimed", "Free " + countOf(available.freeUnclaimed, "unclaimed granule"),
                "Granules that the GAT marks used but no file claims. Some programs keep data in them.");
        }
        if (available.fixProgramSizes > 0) {
            addSwitch("fixProgramSizes", "Fix the size of " + countOf(available.fixProgramSizes, "program"),
                "Programs whose transfer record is past their directory size. The DOS loads them fine; this makes them copy whole.");
        }
        if (available.markMissingUsed > 0) {
            addSwitch("markMissingUsed", "Mark " + countOf(available.markMissingUsed, "missing granule") + " used",
                "Free granules that the image doesn't fully hold. New files skip them anyway; the real disk may still have their sectors.");
        }
        if (anyAvailable) {
            card.append(opts);
        }

        const changes = plan.result.repaired.changes;
        card.append(el("p", "hint", "Repair would:"));
        if (changes.length > 0) {
            card.append(el("ul", "repairlist", ...changes.map(change => el("li", "", change))));
        } else {
            card.append(el("p", "", "Change nothing."));
        }
        const remaining = plan.result.repaired.remaining;
        if (remaining.length > 0) {
            card.append(el("p", "hint", "It can't fix:"),
                el("ul", "repairlist", ...remaining.map(({finding, advice}) => el("li", "", finding.message + " " + advice))));
        }

        const readOnlyReason = session.getReadOnlyReason();
        const disabledReason = changes.length === 0 ? "There's nothing that a repair would change." : undefined;
        const button = makeButton("Repair", () => void this.host.repair(chosen), "primary");
        button.disabled = disabledReason !== undefined;
        card.append(el("div", "btnrow", withDisabledReason(button, disabledReason),
            el("span", "hint", "One change, which undo takes back." +
                (plan.result.damagedBefore && readOnlyReason !== undefined ? " Until it's repaired, other changes are refused." : ""))));
        return card;
    }
}
