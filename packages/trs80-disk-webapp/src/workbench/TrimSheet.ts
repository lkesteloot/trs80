import {DiskError, type TrimRequest, type TrimResult, TrimNothingReason, trimCommandLine} from "trs80-disk";
import {assertNever} from "z80-base";
import {trimDryRun} from "../core/Actions.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {countOf, el, formatNumber, makeButton, makeSwitch} from "./Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * What the Trim sheet needs.
 */
export interface TrimSheetOptions {
    /** The disk to trim, which must be a floppy. */
    disk: OpenDisk;
    /**
     * Do the trim.
     *
     * @param request what to drop.
     * @returns undefined on success, and otherwise the error for the sheet to show.
     */
    perform(request: TrimRequest): Promise<string | undefined>;
}

/**
 * Say why a trim had nothing to do.
 *
 * @param result the result, whose trimmed is false.
 */
function describeNothing(result: Extract<TrimResult, {trimmed: false}>): string[] {
    switch (result.reason) {
        case TrimNothingReason.ONE_SIDE:
            return ["The image has only one side, so there's no side 1 to drop."];
        case TrimNothingReason.CYLINDERS:
            return ["The image has " + countOf(result.cylinderCount, "cylinder") + ", which is no more than you asked to keep."];
        case TrimNothingReason.UNUSED:
            return ["Nothing to trim: the image has no cylinders past the end of the disk."];
        case TrimNothingReason.KEPT:
            return ["The image has cylinders past the disk's end, but none that can be proven to hold nothing the disk " +
                "needs.", ...result.kept];
        case TrimNothingReason.SIZE_UNPROVEN:
            return ["The disk's records don't prove where it ends" + (result.unproven === undefined ? "" : ": " +
                result.unproven) + ", so nothing past the end can be dropped. Name a number of cylinders to keep to " +
                "trim anyway."];
        default:
            assertNever(result.reason);
    }
}

/**
 * The "Trim" sheet: what to drop (the cylinders past a number, side 1), and, before anything is done, what a trim
 * would do, from a dry run on a copy of the disk.
 */
export class TrimSheet {
    private readonly options: TrimSheetOptions;
    private readonly sheet: Sheet;
    private readonly trimButton: HTMLButtonElement;
    private readonly cylindersInput = el("input");
    private readonly sideBox = el("input");
    private readonly forceBox: {element: HTMLLabelElement, input: HTMLInputElement};
    private readonly plan = el("div", "trimplan");
    private readonly commandElement = el("code", "");

    /**
     * Build the sheet. It isn't shown until {@link open} is called.
     *
     * @param options what it needs.
     */
    constructor(options: TrimSheetOptions) {
        this.options = options;
        const geometry = options.disk.session.floppy.getGeometry();

        this.cylindersInput.type = "number";
        this.cylindersInput.min = "1";
        this.cylindersInput.max = String(geometry.cylinderCount);
        this.cylindersInput.placeholder = "automatic";
        this.cylindersInput.style.width = "110px";
        this.cylindersInput.addEventListener("input", () => this.update());

        this.sideBox.type = "checkbox";
        this.sideBox.disabled = geometry.sideCount < 2;
        this.sideBox.addEventListener("change", () => this.update());
        this.forceBox = makeSwitch("Drop even what can't be proven unused", false, () => this.update(),
            "Also drop tracks that hold data we can't prove is unused, or trim a write-protected image. It never drops " +
            "a track that shows signs of copy protection.");

        const form = el("div", "form",
            el("label", "", "Keep cylinders"), el("div", "", this.cylindersInput, " ",
                el("span", "note", "of " + geometry.cylinderCount + "; blank drops only what's past the disk's end")),
            el("label", "", "Drop side 1"), el("div", "", this.sideBox, " ",
                el("span", "note", geometry.sideCount < 2 ? "the image has one side" : "keep only side 0")),
            el("label", "", "Force"), this.forceBox.element);
        this.trimButton = makeButton("Trim", () => void this.perform(), "primary");
        this.sheet = new Sheet({
            title: "Trim " + options.disk.name,
            subtitle: "Drops the tracks that nothing needs. Nothing changes until you press Trim, and Trim can be undone.",
            content: el("div", "", form, el("h4", "", "Trim would"), this.plan,
                el("p", "hint", "The command line: ", this.commandElement)),
            buttons: [makeButton("Cancel", () => this.sheet.close()), this.trimButton],
        });
        this.update();
    }

    /**
     * Show the sheet.
     */
    public open(): void {
        this.sheet.open();
    }

    /**
     * The request that the fields equal, or the problem with them.
     */
    private makeRequest(): TrimRequest | string {
        const text = this.cylindersInput.value.trim();
        let cylinders: number | undefined = undefined;
        if (text !== "") {
            cylinders = Number(text);
            if (!Number.isInteger(cylinders) || cylinders < 1) {
                return "The number of cylinders to keep must be a whole number, at least 1.";
            }
        }
        return {cylinders, dropSide: this.sideBox.checked, force: this.forceBox.input.checked};
    }

    /**
     * Try the trim on a copy of the disk, and show what it would do.
     */
    private update(): void {
        const request = this.makeRequest();
        if (typeof request === "string") {
            this.plan.replaceChildren(el("p", "", request));
            this.sheet.setStatus("", false);
            this.trimButton.disabled = true;
            return;
        }

        this.commandElement.textContent = trimCommandLine(request);
        let result: TrimResult | undefined = undefined;
        let problem = "";
        try {
            result = trimDryRun(this.options.disk.session, request).result;
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
            // The engine names the command line's option; the sheet has a switch instead.
            problem = e.message
                .replace(/Use --force to/g, "Turn on Force to")
                .replace(/use --force to/g, "turn on Force to")
                .replace(/even with --force/g, "even with Force");
        }

        this.trimButton.disabled = result === undefined || !result.trimmed;
        if (result === undefined) {
            this.plan.replaceChildren(el("p", "", problem));
            this.sheet.setStatus(problem, true);
            return;
        }

        this.sheet.setStatus("", false);
        if (!result.trimmed) {
            this.plan.replaceChildren(...describeNothing(result).map(line => el("p", "", line)));
            return;
        }
        const children: HTMLElement[] = [el("ul", "repairlist", ...result.removed.map(line => el("li", "", line)))];
        if (result.kept.length > 0) {
            children.push(el("p", "hint", "It keeps:"), el("ul", "repairlist", ...result.kept.map(line => el("li", "", line))));
        }
        children.push(el("p", "", "The image goes from " + countOf(result.oldCylinderCount, "cylinder") + " and " +
            countOf(result.oldSideCount, "side") + " to " + countOf(result.newCylinderCount, "cylinder") + " and " +
            countOf(result.newSideCount, "side") + ", and from " + formatNumber(result.oldSize) + " to " +
            formatNumber(result.newSize) + " bytes."));
        this.plan.replaceChildren(...children);
    }

    /**
     * Do the trim, and close the sheet if it worked.
     */
    private async perform(): Promise<void> {
        const request = this.makeRequest();
        if (typeof request === "string") {
            return;
        }
        const error = await this.options.perform(request);
        if (error === undefined) {
            this.sheet.close();
        } else {
            this.sheet.setStatus(error, true);
        }
    }
}
