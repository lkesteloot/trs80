import {TRSDOS_FORMAT_DOSES, type TrsdosFormatDos, trsdosFormatDosToString} from "trs80-base";
import {
    countFilesToErase, DiskError, formatFloppyCommandLine, type FormatFloppyRequest, getSessionFormatDos,
    saveNameCanHoldDmk,
} from "trs80-disk";
import {formatDryRun} from "../core/Actions.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {getDosOptions} from "./DosOptions.js";
import {countOf, el, makeButton, makeSegments} from "./Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * What the Format sheet needs.
 */
export interface FormatSheetOptions {
    /** The disk to format, which must be a floppy. */
    disk: OpenDisk;
    /**
     * Do the format.
     *
     * @param request what to make.
     * @returns undefined on success, and otherwise the error for the sheet to show.
     */
    perform(request: FormatFloppyRequest): Promise<string | undefined>;
}

/**
 * The model choices of a DOS that has them: keep the disk's own density, or choose a model, which decides it.
 */
type ModelChoice = 1 | 3 | undefined;

/**
 * The "Format" sheet: the same choices of DOS and shape as New Disk, the number of files that would be lost, and
 * the command line that the choices equal. Every change tries the format on a copy of the disk, so that the engine's
 * refusal (such as a disk that isn't saved as a DMK image) shows here, with the Format button off, before the user
 * commits.
 */
export class FormatSheet {
    private readonly options: FormatSheetOptions;
    private readonly sheet: Sheet;
    private readonly body = el("div", "formatbody");
    private readonly formatButton: HTMLButtonElement;
    private readonly nameInput = el("input", "mono");
    private readonly commandElement = el("code", "");
    private readonly fileCount: number | undefined;
    private readonly currentCylinders: number;
    private readonly currentSides: number;

    private dos: TrsdosFormatDos;
    private cylinders: number;
    private sides: number;
    private model: ModelChoice = undefined;

    /**
     * Build the sheet. It isn't shown until {@link open} is called.
     *
     * @param options what it needs.
     */
    constructor(options: FormatSheetOptions) {
        this.options = options;
        const session = options.disk.session;
        const geometry = session.floppy.getGeometry();
        this.currentCylinders = geometry.cylinderCount;
        this.currentSides = geometry.sideCount;
        this.fileCount = countFilesToErase(session);
        this.dos = getSessionFormatDos(session) ?? TRSDOS_FORMAT_DOSES[0];
        this.cylinders = this.currentCylinders;
        this.sides = this.currentSides;
        this.resetShape();

        this.nameInput.maxLength = 8;
        this.nameInput.placeholder = "default";
        this.nameInput.style.width = "130px";
        this.nameInput.spellcheck = false;
        this.nameInput.addEventListener("input", () => this.update());

        this.formatButton = makeButton("Format", () => void this.perform(), "primary danger-fill");
        this.sheet = new Sheet({
            title: "Format " + options.disk.name,
            subtitle: "This replaces the disk with a blank data disk, as New Disk makes one. Nothing changes until you " +
                "press Format, and Format can be undone.",
            content: this.body,
            buttons: [makeButton("Cancel", () => this.sheet.close()), this.formatButton],
        });
        this.draw();
    }

    /**
     * Show the sheet.
     */
    public open(): void {
        this.sheet.open();
    }

    /**
     * Set the shape to the disk's own where the DOS offers it, and to the DOS's default where it doesn't.
     */
    private resetShape(): void {
        const dosOptions = getDosOptions(this.dos);
        this.cylinders = dosOptions.cylinders.includes(this.currentCylinders) ? this.currentCylinders : dosOptions.cylinders[0];
        this.sides = dosOptions.sides.includes(this.currentSides) ? this.currentSides : dosOptions.sides[0];
        this.model = undefined;
    }

    /**
     * The request that the choices equal. A choice that the disk already has is left out, so that the command line
     * stays short.
     */
    private makeRequest(): FormatFloppyRequest {
        const name = this.nameInput.value.trim();
        return {
            format: {
                dos: this.dos,
                cylinders: this.cylinders === this.currentCylinders ? undefined : this.cylinders,
                sides: this.sides === this.currentSides ? undefined : this.sides,
                density: undefined,
                model: this.model,
                name: name === "" ? undefined : name,
                date: undefined,
            },
            force: true,
        };
    }

    /**
     * Draw the choices.
     */
    private draw(): void {
        const dosOptions = getDosOptions(this.dos);

        const warning = el("p", "formatwarning");
        if (this.fileCount === undefined) {
            warning.textContent = "The disk has no file system that we recognize, so we can't say what would be lost. " +
                "Everything on it will be erased.";
        } else if (this.fileCount === 0) {
            warning.textContent = "The disk has no files, so nothing will be lost.";
        } else {
            warning.textContent = countOf(this.fileCount, "file") + " will be erased.";
            warning.style.color = "var(--danger)";
            warning.style.fontWeight = "600";
        }

        const cards = el("div", "dosgrid");
        for (const dos of TRSDOS_FORMAT_DOSES) {
            const card = el("button", "doscard" + (dos === this.dos ? " on" : ""), el("b", "", trsdosFormatDosToString(dos)),
                el("span", "", getDosOptions(dos).summary));
            card.type = "button";
            card.addEventListener("click", () => {
                this.dos = dos;
                this.resetShape();
                this.draw();
            });
            cards.append(card);
        }

        const form = el("div", "form",
            el("label", "", "Cylinders"), makeSegments(dosOptions.cylinders, this.cylinders, String, value => {
                this.cylinders = value;
                this.draw();
            }),
            el("label", "", "Sides"), makeSegments(dosOptions.sides, this.sides, String, value => {
                this.sides = value;
                this.draw();
            }));
        if (dosOptions.models.length > 0) {
            const models: ModelChoice[] = [undefined, ...dosOptions.models];
            form.append(el("label", "", "Density"), makeSegments(models, this.model, value =>
                value === undefined ? "Keep the disk's" : "Model " + (value === 1 ? "I" : "III"), value => {
                this.model = value;
                this.draw();
            }));
        }
        form.append(el("label", "", "Disk name"), el("div", "", this.nameInput));

        const command = el("p", "hint", "The command line: ", this.commandElement);
        this.body.replaceChildren(warning, el("h4", "", "DOS"), cards, el("div", "newopts", form), command);
        this.update();
    }

    /**
     * Show the command line, and try the format on a copy of the disk to see whether it would be accepted.
     */
    private update(): void {
        const request = this.makeRequest();
        this.commandElement.textContent = formatFloppyCommandLine(request);
        // The engine's refusal of a disk that isn't saved as a DMK image gives the command line's way out (-o), which
        // a page doesn't have, so say the page's way.
        const canHoldDmk = saveNameCanHoldDmk(this.options.disk.session);
        if (!canHoldDmk) {
            this.sheet.setStatus("Format makes a DMK image, but this disk isn't a .dmk file. Use Save as… to save a " +
                "DMK copy, then open that and format it.", true);
            this.formatButton.disabled = true;
            return;
        }
        try {
            formatDryRun(this.options.disk.session, request);
            this.sheet.setStatus("", false);
            this.formatButton.disabled = false;
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
            this.sheet.setStatus(e.message, true);
            this.formatButton.disabled = true;
        }
    }

    /**
     * Do the format, and close the sheet if it worked.
     */
    private async perform(): Promise<void> {
        const error = await this.options.perform(this.makeRequest());
        if (error === undefined) {
            this.sheet.close();
        } else {
            this.sheet.setStatus(error, true);
        }
    }
}
