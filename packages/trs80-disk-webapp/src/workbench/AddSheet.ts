import {BasicDialect} from "trs80-base";
import {type AddPlanItem, DiskError} from "trs80-disk";
import {type AddActionOptions, planAddFiles} from "../core/Actions.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {countOf, el, formatKilobytes, formatNumber, makeButton} from "./Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * What the BASIC choice in the sheet can be.
 */
type BasicChoice = "auto" | "3" | "4";

/**
 * How the Add sheet starts out, and what it does at the end.
 */
export interface AddSheetOptions {
    /** The disk to add to. */
    disk: OpenDisk;
    /** The host files. */
    files: File[];
    /** The sheet's title, such as "Add files to GAMES". */
    title: string;
    /** A sentence under the title. */
    subtitle: string;
    /**
     * Whether the files come from another disk, in which case they're copied exactly (no conversion) and keep
     * their dates by default.
     */
    copyMode: boolean;
    /**
     * Do the add. This runs the action, reports it, and says if it failed.
     *
     * @returns undefined if the files were added, and otherwise the error to show in the sheet.
     */
    perform: (plan: AddPlanItem[], options: AddActionOptions) => Promise<string | undefined>;
}

/**
 * One file's row in the sheet.
 */
interface FileRowElements {
    include: HTMLInputElement;
    nameInput: HTMLInputElement;
    what: HTMLElement;
}

/**
 * The sheet that shows what adding files would do before it's done: each file's TRSDOS name (editable for a
 * single file, which is "--as"), what it becomes, and whether it replaces a file, with the switches for the
 * add's options. It plans again whenever anything changes, and its Add button is disabled, with the reason,
 * when the CLI would refuse the batch.
 */
export class AddSheet {
    private readonly options: AddSheetOptions;
    private files: File[];
    private included: boolean[];
    private rowElements: FileRowElements[] = [];
    private plan: AddPlanItem[] = [];
    private planProblem: string | undefined = undefined;
    private planSequence = 0;
    private adding = false;

    // The switches.
    private ascii = false;
    private binary: boolean;
    private text = false;
    private basic: BasicChoice = "auto";
    private system = false;
    private invisible = false;
    private overwrite = false;
    private useFileDates: boolean;
    /** The name the user typed for a single file, or undefined for the one we make. */
    private asName: string | undefined = undefined;

    private readonly sheet: Sheet;
    private readonly tbody = el("tbody");
    private readonly addButton: HTMLButtonElement;
    private readonly switches = new Map<string, HTMLInputElement>();

    /**
     * Build the sheet and plan the first time. Call {@link open} to show it.
     *
     * @param options what to add and how to report it.
     */
    constructor(options: AddSheetOptions) {
        this.options = options;
        this.files = [...options.files];
        this.included = this.files.map(() => true);
        this.binary = options.copyMode;
        this.useFileDates = options.copyMode && this.files.every(file => file.lastModified > 0);

        const table = el("table", "addplan", el("thead", "", el("tr", "",
            el("th"), el("th", "", "From"), el("th", "", "Bytes"), el("th", "", "TRSDOS name"),
            el("th", "", "What happens"))), this.tbody);

        const moreInput = el("input");
        moreInput.type = "file";
        moreInput.multiple = true;
        moreInput.hidden = true;
        moreInput.addEventListener("change", () => {
            this.addFiles(Array.from(moreInput.files ?? []));
            moreInput.value = "";
        });
        const moreButton = makeButton("Choose more files…", () => moreInput.click());

        const content = el("div", "", table, this.makeOptions(), el("div", "btnrow addmore", moreButton, moreInput));
        this.addButton = makeButton("Add", () => this.add(), "primary");
        this.addButton.disabled = true;
        this.sheet = new Sheet({
            title: options.title,
            subtitle: options.subtitle,
            content,
            buttons: [makeButton("Cancel", () => this.sheet.close()), this.addButton],
        });
        this.buildRows();
    }

    /**
     * Show the sheet and make the first plan.
     */
    public open(): void {
        this.sheet.open();
        void this.replan();
    }

    /**
     * Make the option switches.
     */
    private makeOptions(): HTMLElement {
        const container = el("div", "opts");
        const addSwitch = (key: string, label: string, flag: string, initial: boolean,
                           onChange: (checked: boolean) => void): void => {

            const input = el("input");
            input.type = "checkbox";
            input.checked = initial;
            input.addEventListener("change", () => {
                onChange(input.checked);
                this.optionsChanged();
            });
            this.switches.set(key, input);
            container.append(el("label", "", input, label + " ", el("code", "", flag)));
        };

        addSwitch("ascii", "Keep BASIC as text", "--ascii", this.ascii, checked => {
            this.ascii = checked;
            if (checked) {
                this.binary = false;
            }
        });
        addSwitch("binary", "No conversion", "--binary", this.binary, checked => {
            this.binary = checked;
            if (checked) {
                this.ascii = false;
                this.text = false;
            }
        });
        addSwitch("text", "Treat as text", "--text", this.text, checked => {
            this.text = checked;
            if (checked) {
                this.binary = false;
            }
        });
        addSwitch("system", "System files", "--system", this.system, checked => this.system = checked);
        addSwitch("invisible", "Invisible", "--invisible", this.invisible, checked => this.invisible = checked);
        addSwitch("overwrite", "Replace files already on the disk", "--overwrite", this.overwrite,
            checked => this.overwrite = checked);
        addSwitch("dates", "Use the files' dates", "--date", this.useFileDates, checked => this.useFileDates = checked);

        const select = el("select");
        select.title = "Which BASIC to tokenize for";
        for (const [value, label] of [["auto", "the disk's"], ["3", "Model I/III"], ["4", "Model 4"]]) {
            const option = el("option", "", label);
            option.value = value;
            select.append(option);
        }
        select.addEventListener("change", () => {
            this.basic = select.value as BasicChoice;
            this.optionsChanged();
        });
        container.append(el("label", "", "BASIC: ", select, " ", el("code", "", "--basic")));
        return container;
    }

    /**
     * Sync the switches that exclude each other after one changes, and plan again.
     */
    private optionsChanged(): void {
        const states: [string, boolean][] = [["ascii", this.ascii], ["binary", this.binary], ["text", this.text]];
        for (const [key, value] of states) {
            const input = this.switches.get(key);
            if (input !== undefined) {
                input.checked = value;
            }
        }
        void this.replan();
    }

    /**
     * Add more host files to the sheet.
     */
    private addFiles(files: File[]): void {
        this.files.push(...files);
        this.included.push(...files.map(() => true));
        this.asName = undefined;
        this.buildRows();
        void this.replan();
    }

    /**
     * Make the row for each file. The rows stay until the files change, so that typing in a name isn't
     * interrupted when the plan changes.
     */
    private buildRows(): void {
        this.rowElements = this.files.map((file, index) => {
            const include = el("input");
            include.type = "checkbox";
            include.checked = this.included[index];
            include.title = "Add this file";
            include.addEventListener("change", () => {
                this.included[index] = include.checked;
                this.asName = undefined;
                void this.replan();
            });

            const nameInput = el("input", "trs");
            nameInput.maxLength = 12;
            nameInput.spellcheck = false;
            nameInput.addEventListener("input", () => {
                this.asName = nameInput.value;
                void this.replan();
            });

            const what = el("td", "conv");
            this.tbody.append(el("tr", "", el("td", "", include), el("td", "mono", file.name),
                el("td", "num", formatNumber(file.size)), el("td", "", nameInput), what));
            return {include, nameInput, what};
        });
        // Remove the old rows, which come before the new ones.
        while (this.tbody.children.length > this.files.length) {
            this.tbody.firstElementChild?.remove();
        }
    }

    /**
     * The options for the engine, from the switches.
     *
     * @param includedCount how many files are included, since a name that the user typed is only for one.
     */
    private makeOptionsForEngine(includedCount: number): AddActionOptions {
        let basic: BasicDialect | undefined = undefined;
        if (this.basic === "3") {
            basic = BasicDialect.MODEL_III;
        } else if (this.basic === "4") {
            basic = BasicDialect.MODEL_4;
        }
        return {
            as: includedCount === 1 && this.asName !== undefined && this.asName.trim() !== "" ?
                this.asName.trim() : undefined,
            ascii: this.ascii,
            binary: this.binary,
            text: this.text,
            basic,
            system: this.system,
            invisible: this.invisible,
            overwrite: this.overwrite,
            date: undefined,
            useFileDates: this.useFileDates,
        };
    }

    /**
     * Plan the included files again and show the answer. A plan that's overtaken by a newer one is dropped.
     */
    private async replan(): Promise<void> {
        const sequence = ++this.planSequence;
        const includedFiles = this.files.filter((file, index) => this.included[index]);
        const options = this.makeOptionsForEngine(includedFiles.length);

        let plan: AddPlanItem[] = [];
        let problem: string | undefined = undefined;
        if (includedFiles.length > 0) {
            try {
                plan = await planAddFiles(this.options.disk.session, includedFiles, options);
            } catch (e) {
                if (!(e instanceof DiskError)) {
                    throw e;
                }
                problem = e.message;
            }
        }
        if (sequence !== this.planSequence) {
            return;
        }

        this.plan = plan;
        this.planProblem = problem;
        this.showPlan(includedFiles.length);
    }

    /**
     * Show the plan in the rows, and decide whether Add is allowed.
     */
    private showPlan(includedCount: number): void {
        let planIndex = 0;
        this.files.forEach((file, index) => {
            const elements = this.rowElements[index];
            elements.what.className = "conv";
            if (!this.included[index]) {
                elements.nameInput.value = "";
                elements.nameInput.readOnly = true;
                elements.what.textContent = "Not added";
                return;
            }

            const item: AddPlanItem | undefined = this.plan[planIndex++];
            const editable = includedCount === 1;
            elements.nameInput.readOnly = !editable;
            elements.nameInput.title = editable ? "The name on the disk (--as)" :
                "Names can be changed when adding one file";
            if (item === undefined) {
                elements.what.textContent = "";
                return;
            }
            if (!editable || this.asName === undefined) {
                elements.nameInput.value = item.name;
            }
            elements.what.textContent = this.describeItem(item);
            if (item.problem !== undefined) {
                elements.what.classList.add("bad");
            } else if (item.existingName !== undefined) {
                elements.what.classList.add(this.overwrite ? "replace" : "bad");
            }
        });

        this.updateFooter(includedCount);
    }

    /**
     * What happens to one file, in words.
     */
    private describeItem(item: AddPlanItem): string {
        if (item.problem !== undefined) {
            return item.problem;
        }

        const parts: string[] = [];
        if (item.conversionMessages.length > 0) {
            parts.push(...item.conversionMessages);
        } else {
            parts.push("Copied byte for byte.");
        }
        if (item.nameChanged) {
            parts.push("Becomes " + item.name + ".");
        }
        if (item.existingName !== undefined) {
            parts.push(this.overwrite ? "Replaces the existing file." :
                item.existingName + " is already on the disk.");
        }
        return parts.join(" ");
    }

    /**
     * Set the status line and the Add button from the plan.
     */
    private updateFooter(includedCount: number): void {
        const session = this.options.disk.session;
        const reason = this.addBlockedReason(includedCount);
        this.addButton.textContent = "Add " + countOf(includedCount, "file");
        this.addButton.disabled = reason !== undefined || this.adding;
        this.addButton.title = reason ?? "";
        if (reason !== undefined) {
            this.sheet.setStatus(reason, includedCount > 0);
            return;
        }

        const bytes = this.plan.reduce((sum, item) => sum + (item.contents?.length ?? 0), 0);
        let status = countOf(includedCount, "file") + ", " + formatNumber(bytes) + " bytes.";
        let isProblem = false;
        try {
            const free = session.getFreeSpace();
            if (bytes > free.freeBytes) {
                // This is only an estimate, since replaced files give their space back, so the engine decides.
                status += " The disk has " + formatKilobytes(free.freeBytes) + " free, so this may not fit.";
                isProblem = true;
            } else {
                status += " The disk has " + formatKilobytes(free.freeBytes) + " free.";
            }
        } catch (e) {
            if (!(e instanceof DiskError)) {
                throw e;
            }
        }
        this.sheet.setStatus(status, isProblem);
    }

    /**
     * Why the batch can't be added, or undefined if it can.
     */
    private addBlockedReason(includedCount: number): string | undefined {
        const readOnlyReason = this.options.disk.session.getReadOnlyReason();
        if (readOnlyReason !== undefined) {
            return readOnlyReason;
        }
        if (includedCount === 0) {
            return "No files are chosen.";
        }
        if (this.planProblem !== undefined) {
            return this.planProblem;
        }
        for (const item of this.plan) {
            if (item.problem !== undefined) {
                return item.problem;
            }
        }
        if (!this.overwrite) {
            const clash = this.plan.find(item => item.existingName !== undefined);
            if (clash !== undefined) {
                return clash.existingName + " is already on the disk. Switch on \"Replace files already on the disk\" " +
                    "to replace it.";
            }
        }
        return undefined;
    }

    /**
     * Do the add and close the sheet, or show why it failed.
     */
    private async add(): Promise<void> {
        const includedCount = this.included.filter(included => included).length;
        if (this.adding || this.addBlockedReason(includedCount) !== undefined) {
            return;
        }

        this.adding = true;
        this.addButton.disabled = true;
        const error = await this.options.perform(this.plan, this.makeOptionsForEngine(includedCount));
        this.adding = false;
        if (error === undefined) {
            this.sheet.close();
        } else {
            this.sheet.setStatus(error, true);
            this.addButton.disabled = false;
        }
    }
}
