import {
    type Trsdos, type TrsdosProtectionLevel, trsdosProtectionLevels, trsdosProtectionLevelToString,
} from "trs80-base";
import {type AttributeRequest, formatYmd} from "trs80-disk";
import type {FileRow} from "../core/FileRows.js";
import {el, makeButton} from "./Dom.js";
import {Sheet} from "./Sheet.js";

/**
 * Whether every item has the same value, and if so what it is.
 */
function commonValue<T>(values: readonly T[]): {same: true, value: T} | {same: false} {
    const first = values[0];
    return values.every(value => value === first) ? {same: true, value: first} : {same: false};
}

/**
 * How the Attributes sheet is opened.
 */
export interface AttributesSheetOptions {
    /** The selected files, which are on a TRSDOS-family disk, so each has attributes. */
    rows: FileRow[];
    /** The disk's file system, for its protection names and whether it has an access password. */
    trsdos: Trsdos;
    /**
     * Apply the changes.
     *
     * @returns undefined if it worked, and otherwise the error to show in the sheet.
     */
    apply: (request: AttributeRequest) => Promise<string | undefined>;
}

/**
 * A checkbox that can show "mixed" when the selected files differ. The change is only reported if the user
 * touches it.
 */
class TriStateField {
    /** The checkbox. */
    public readonly input = el("input");
    private readonly original: boolean | undefined;
    private touched = false;

    /**
     * @param values the value for each selected file.
     * @param onChange called when the user changes it.
     */
    constructor(values: boolean[], onChange: () => void) {
        const common = commonValue(values);
        this.original = common.same ? common.value : undefined;
        this.input.type = "checkbox";
        this.input.checked = this.original === true;
        this.input.indeterminate = !common.same;
        this.input.addEventListener("change", () => {
            this.touched = true;
            onChange();
        });
    }

    /**
     * Whether the files differ.
     */
    public get isMixed(): boolean {
        return this.original === undefined;
    }

    /**
     * The value to set, or undefined to leave the files alone: the user hasn't changed it, or has put it back.
     */
    public get change(): boolean | undefined {
        if (!this.touched || this.input.checked === this.original) {
            return undefined;
        }
        return this.input.checked;
    }
}

/**
 * The sheet that changes the attributes of the selected files: invisible, system, protection level (with the
 * DOS's names), the passwords, and the date. A field where the files differ shows "mixed" and is left alone
 * unless the user changes it. A field that the DOS doesn't have is left out, with a note.
 */
export class AttributesSheet {
    private readonly options: AttributesSheetOptions;
    private readonly sheet: Sheet;
    private readonly applyButton: HTMLButtonElement;
    private readonly invisible: TriStateField;
    private readonly system: TriStateField;
    private readonly protection = el("select");
    private readonly originalProtection: TrsdosProtectionLevel | undefined;
    private readonly updatePassword = el("input");
    private readonly removeUpdatePassword = el("input");
    private readonly accessPassword = el("input");
    private readonly removeAccessPassword = el("input");
    private readonly dateInput = el("input");
    private readonly noDate = el("input");
    private readonly originalDate: string | undefined;
    private readonly datesMixed: boolean;
    private dateTouched = false;
    private adding = false;

    /**
     * Build the sheet. Call {@link open} to show it.
     */
    constructor(options: AttributesSheetOptions) {
        this.options = options;
        const rows = options.rows;
        const attributes = rows.map(row => row.attributes!);
        const update = (): void => this.update();

        this.invisible = new TriStateField(attributes.map(a => a.invisible), update);
        this.system = new TriStateField(attributes.map(a => a.system), update);

        // Protection.
        const names = options.trsdos.protectionNames;
        const level = commonValue(attributes.map(a => a.protectionLevel));
        this.originalProtection = level.same ? level.value : undefined;
        if (!level.same) {
            const mixed = el("option", "", "(mixed: leave alone)");
            mixed.value = "";
            mixed.selected = true;
            this.protection.append(mixed);
        }
        for (const candidate of trsdosProtectionLevels(names)) {
            const option = el("option", "", trsdosProtectionLevelToString(candidate, names) + " (" + candidate + ")");
            option.value = String(candidate);
            option.selected = level.same && level.value === candidate;
            this.protection.append(option);
        }
        this.protection.addEventListener("change", update);

        // Passwords.
        const updateCount = attributes.filter(a => a.hasUpdatePassword).length;
        const accessCount = attributes.filter(a => a.hasAccessPassword).length;
        const hasAccessPassword = !options.trsdos.hasTimeStamps;
        this.setupPassword(this.updatePassword, this.removeUpdatePassword, updateCount);
        this.setupPassword(this.accessPassword, this.removeAccessPassword, accessCount);

        // Date.
        const dates = rows.map(row => row.date === undefined ? "" : formatYmd(row.date));
        const commonDate = commonValue(dates);
        this.datesMixed = !commonDate.same;
        this.originalDate = commonDate.same ? commonDate.value : undefined;
        this.dateInput.type = "date";
        this.dateInput.value = commonDate.same ? commonDate.value : "";
        this.noDate.type = "checkbox";
        this.noDate.checked = commonDate.same && commonDate.value === "";
        this.dateInput.addEventListener("input", () => {
            this.dateTouched = true;
            this.noDate.checked = false;
            update();
        });
        this.noDate.addEventListener("change", () => {
            this.dateTouched = true;
            if (this.noDate.checked) {
                this.dateInput.value = "";
            }
            update();
        });

        const mixedNote = (isMixed: boolean): HTMLElement => el("span", "note", isMixed ? " (mixed)" : "");
        const form = el("div", "form",
            el("label", "", "Visibility"),
            el("div", "opts", el("label", "", this.invisible.input, " Invisible ", el("code", "", "--invisible"),
                mixedNote(this.invisible.isMixed))),
            el("label", "", "Kind"),
            el("div", "opts", el("label", "", this.system.input, " System file ", el("code", "", "--system"),
                mixedNote(this.system.isMixed))),
            el("label", "", "Protection"),
            el("div", "", this.protection),
            el("label", "", "Update password"),
            this.passwordRow(this.updatePassword, this.removeUpdatePassword, updateCount, rows.length),
            el("label", "", "Access password"),
            hasAccessPassword ?
                this.passwordRow(this.accessPassword, this.removeAccessPassword, accessCount, rows.length) :
                el("div", "note", "This DOS keeps a time stamp where the access password would go, so there's " +
                    "no access password to set."),
            el("label", "", "Date"),
            el("div", "", this.dateInput, " ",
                el("label", "inline", this.noDate, " No date"), mixedNote(this.datesMixed)));

        this.applyButton = makeButton("Apply", () => this.apply(), "primary");
        const title = rows.length === 1 ? "Attributes of " + rows[0].fullName :
            "Attributes of " + rows.length + " files";
        this.sheet = new Sheet({
            title,
            subtitle: "Only what you change is changed.",
            content: form,
            buttons: [makeButton("Cancel", () => this.sheet.close()), this.applyButton],
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
     * Set up a password input and its "remove" checkbox.
     */
    private setupPassword(input: HTMLInputElement, remove: HTMLInputElement, setCount: number): void {
        input.type = "text";
        input.maxLength = 8;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.className = "mono";
        input.placeholder = setCount === 0 ? "none" : "unchanged";
        remove.type = "checkbox";
        remove.disabled = setCount === 0;
        input.addEventListener("input", () => {
            if (input.value !== "") {
                remove.checked = false;
            }
            this.update();
        });
        remove.addEventListener("change", () => {
            if (remove.checked) {
                input.value = "";
            }
            this.update();
        });
    }

    /**
     * The row of a password's input, its "remove" checkbox, and how many files have one.
     */
    private passwordRow(input: HTMLInputElement, remove: HTMLInputElement, setCount: number,
                        total: number): HTMLElement {

        const status = setCount === 0 ? "none set" : setCount === total ? "set" : "set on " + setCount + " of " + total;
        return el("div", "", input, " ", el("label", "inline", remove, " Remove"), el("span", "note", " (" + status + ")"));
    }

    /**
     * The changes that the user has made, or undefined for none.
     */
    private makeRequest(): AttributeRequest | undefined {
        const request: AttributeRequest = {};
        let changed = false;

        const invisible = this.invisible.change;
        if (invisible !== undefined) {
            request.invisible = invisible;
            changed = true;
        }
        const system = this.system.change;
        if (system !== undefined) {
            request.system = system;
            changed = true;
        }

        if (this.protection.value !== "" && Number(this.protection.value) !== this.originalProtection) {
            const names = this.options.trsdos.protectionNames;
            request.protect = trsdosProtectionLevelToString(Number(this.protection.value) as TrsdosProtectionLevel, names);
            changed = true;
        }

        const updatePassword = this.passwordChange(this.updatePassword, this.removeUpdatePassword);
        if (updatePassword !== undefined) {
            request.updatePassword = updatePassword;
            changed = true;
        }
        if (!this.options.trsdos.hasTimeStamps) {
            const accessPassword = this.passwordChange(this.accessPassword, this.removeAccessPassword);
            if (accessPassword !== undefined) {
                request.accessPassword = accessPassword;
                changed = true;
            }
        }

        const dateChange = this.dateChange();
        if (dateChange !== undefined) {
            request.date = dateChange.date;
            changed = true;
        }

        return changed ? request : undefined;
    }

    /**
     * The new password for a field: the text, "" to remove it, or undefined to leave it.
     */
    private passwordChange(input: HTMLInputElement, remove: HTMLInputElement): string | undefined {
        if (input.value !== "") {
            return input.value;
        }
        return remove.checked ? "" : undefined;
    }

    /**
     * The date change, or undefined for none. A null date removes the date.
     */
    private dateChange(): {date: Date | null} | undefined {
        if (!this.dateTouched) {
            return undefined;
        }
        if (this.noDate.checked) {
            // Putting the same state back is no change.
            return this.originalDate === "" ? undefined : {date: null};
        }
        if (this.dateInput.value === "") {
            return undefined;
        }
        if (this.dateInput.value === this.originalDate) {
            return undefined;
        }

        const [year, month, day] = this.dateInput.value.split("-").map(Number);
        return {date: new Date(year, month - 1, day)};
    }

    /**
     * Update the Apply button and the status.
     */
    private update(): void {
        const request = this.makeRequest();
        this.applyButton.disabled = request === undefined || this.adding;
        this.sheet.setStatus(request === undefined ? "Nothing changed." : "", false);
    }

    /**
     * Apply the changes and close the sheet, or show the error.
     */
    private async apply(): Promise<void> {
        const request = this.makeRequest();
        if (request === undefined || this.adding) {
            return;
        }

        this.adding = true;
        this.applyButton.disabled = true;
        const error = await this.options.apply(request);
        this.adding = false;
        if (error === undefined) {
            this.sheet.close();
        } else {
            this.sheet.setStatus(error, true);
            this.applyButton.disabled = false;
        }
    }
}

