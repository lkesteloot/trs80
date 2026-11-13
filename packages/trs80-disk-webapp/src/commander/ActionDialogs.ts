import {
    BasicDialect, TRSDOS_FORMAT_DOSES, Trsdos, type TrsdosDiskInfo, type TrsdosDiskInfoChanges, type TrsdosProtectionLevel,
    trsdosFormatDosToString, trsdosProtectionLevels, trsdosProtectionLevelToString, TrsdosFormatDos,
} from "trs80-base";
import {
    type AddFilesResult, type AddPlanItem, type AttributeRequest, createCommandLine, type CreateFloppyRequest, DiskError,
    describeChanges, getWriteProtect, readDiskInfo,
} from "trs80-disk";
import {
    type ActionResult, type AddActionOptions, addPlanned, attrib, label as changeLabel, planAddFiles, protect, rename,
} from "../core/Actions.js";
import {describeAdd} from "../core/Describe.js";
import {countOf, el, formatNumber} from "../core/Dom.js";
import {getDosOptions, hasSystemDisk} from "../core/DosOptions.js";
import {type ExtractOptions} from "../core/Extracting.js";
import type {FileRow} from "../core/FileRows.js";
import {gatDateToInputValue, getLabelLimits, inputValueToDate} from "../core/LabelLimits.js";
import type {OpenDisk} from "../core/OpenDisk.js";
import {newDisk, type NewDiskResult} from "../core/Opening.js";
import {type DialogLayer, formRow, makeCheck, makeRadio, makeText} from "./Dialogs.js";

// The dialogs of the commander's actions. Each one gathers the choices and then hands the action to the page,
// which runs it through the core's actions and reports it in the message area.

/**
 * What an action that the page ran came to: its value, or the message of the error that was reported.
 */
export type RunOutcome<T> = {ok: true, value: T} | {ok: false, message: string};

/**
 * The message that a dialog button returns for an outcome: nothing if it worked, and otherwise the error.
 *
 * @param outcome what the action came to.
 */
function errorOf<T>(outcome: RunOutcome<T>): string | undefined {
    return outcome.ok ? undefined : outcome.message;
}

/**
 * What the dialogs ask of the page.
 */
export interface ActionHost {
    /** The layer that dialogs open in. */
    readonly dialogs: DialogLayer;
    /**
     * Run an action on a disk and report it in the message area.
     *
     * @param disk the disk.
     * @param action does the change.
     * @param describe says what it did, in lines for the message area.
     * @returns the engine's result, or the error's message, which has been reported.
     */
    run<T>(disk: OpenDisk, action: () => ActionResult<T> | Promise<ActionResult<T>>,
           describe: (result: T) => string[]): Promise<RunOutcome<T>>;
}

/**
 * Words for the heading of a dialog about some files.
 *
 * @param names the files' names.
 */
function namesText(names: readonly string[]): string {
    return names.length === 1 ? names[0] : countOf(names.length, "file");
}

/**
 * How to show the "what happens" column of the add plan.
 *
 * @param item the plan item.
 * @param overwrite whether replacing is on.
 * @returns the text and the CSS class that colors it.
 */
function describePlanItem(item: AddPlanItem, overwrite: boolean): {text: string, className: string} {
    if (item.problem !== undefined) {
        return {text: item.problem, className: "bad"};
    }

    const parts = [...item.conversionMessages];
    if (item.existingName !== undefined) {
        if (overwrite) {
            return {text: [...parts, "replaces the " + item.existingName + " that's on the disk"].join("; "), className: "rep"};
        }
        return {text: "already on the disk: tick Replace to overwrite it", className: "bad"};
    }
    return {text: parts.length === 0 ? "added as it is" : parts.join("; "), className: ""};
}

/**
 * What the Add dialog needs to start.
 */
export interface AddDialogOptions {
    /** The disk to add to. */
    disk: OpenDisk;
    /** The host files, in order. */
    files: File[];
    /** The dialog's title. */
    title: string;
    /** A sentence at the top, saying where the files come from. */
    subtitle: string;
    /** Whether the files come from another disk, in which case they're copied exactly, with their dates. */
    copyMode: boolean;
    /** Called after the files have been added. */
    afterAdd: (result: AddFilesResult) => void;
}

/**
 * Show the plan for adding files to a disk, as the workbench's Add sheet does: what each file becomes, with
 * switches that change the plan as you press them. Nothing changes until Add.
 *
 * @param host the page.
 * @param options what to add.
 */
export function openAddPlanDialog(host: ActionHost, options: AddDialogOptions): void {
    const {disk, files, copyMode} = options;
    let ascii = false;
    let binary = copyMode;
    let overwrite = false;
    let useFileDates = copyMode && files.every(file => file.lastModified > 0);
    let basic: BasicDialect | undefined = undefined;
    let asName = "";
    let plan: AddPlanItem[] = [];
    let planSequence = 0;
    let planError: string | undefined = undefined;

    const tableBody = el("tbody");
    const table = el("table", "plan", el("thead", "", el("tr", "", el("th", "", "From"), el("th", "r", "Bytes"),
        el("th", "", "On the disk"), el("th", "", "What happens"))), tableBody);
    const nameInput = makeText("", 14, text => {
        asName = text;
        void replan();
    });
    const nameRow = el("div", "grid", ...formRow("Name on the disk", nameInput));
    nameRow.hidden = files.length !== 1;

    const asciiCheck = makeCheck("Keep BASIC as text (--ascii)", ascii, checked => {
        ascii = checked;
        void replan();
    });
    const binaryCheck = makeCheck("No conversion (--binary)", binary, checked => {
        binary = checked;
        void replan();
    });
    const overwriteCheck = makeCheck("Replace files that are already on the disk (--overwrite)", overwrite, checked => {
        overwrite = checked;
        void replan();
    });
    const datesCheck = makeCheck("Use the files' dates (--date)", useFileDates, checked => {
        useFileDates = checked;
        void replan();
    });
    const basicSelect = el("select");
    for (const [value, text] of [["", "BASIC: the disk's"], ["3", "Model I/III BASIC"], ["4", "Model 4 BASIC"]]) {
        const option = el("option", "", text);
        option.value = value;
        basicSelect.append(option);
    }
    basicSelect.addEventListener("change", () => {
        basic = basicSelect.value === "3" ? BasicDialect.MODEL_III : basicSelect.value === "4" ? BasicDialect.MODEL_4 : undefined;
        void replan();
    });

    const handle = host.dialogs.open({
        title: options.title,
        body: [el("p", "wrap", options.subtitle), table, nameRow, asciiCheck.element, binaryCheck.element,
            overwriteCheck.element, datesCheck.element, basicSelect],
        buttons: [{
            label: "Add",
            action: async () => {
                const problem = addProblem();
                if (problem !== undefined) {
                    return problem;
                }
                const outcome = await host.run(disk, () => addPlanned(disk.session, plan, makeOptions()), describeAdd);
                if (outcome.ok) {
                    options.afterAdd(outcome.value);
                }
                return errorOf(outcome);
            },
        }],
    });

    /**
     * The options for the engine, from the switches.
     */
    function makeOptions(): AddActionOptions {
        return {
            as: files.length === 1 && asName.trim() !== "" ? asName.trim() : undefined,
            ascii, binary, text: false, basic, system: false, invisible: false, overwrite, date: undefined, useFileDates,
        };
    }

    /**
     * Why the plan can't be added now, or undefined if it can.
     */
    function addProblem(): string | undefined {
        if (planError !== undefined) {
            return planError;
        }
        if (plan.length === 0) {
            return "There's nothing to add.";
        }
        const bad = plan.find(item => item.problem !== undefined);
        if (bad !== undefined) {
            return bad.source.label + ": " + bad.problem;
        }
        const existing = plan.find(item => item.existingName !== undefined);
        if (existing !== undefined && !overwrite) {
            return existing.existingName + " is already on the disk. Tick Replace to overwrite it.";
        }
        return undefined;
    }

    /**
     * Plan again after a switch changes, and show the answer. A plan that a newer one overtakes is dropped.
     */
    async function replan(): Promise<void> {
        const sequence = ++planSequence;
        let newPlan: AddPlanItem[] = [];
        let error: string | undefined = undefined;
        try {
            newPlan = await planAddFiles(disk.session, files, makeOptions());
        } catch (e) {
            if (e instanceof DiskError) {
                error = e.message;
            } else {
                throw e;
            }
        }
        if (sequence !== planSequence) {
            return;
        }
        plan = newPlan;
        planError = error;
        tableBody.replaceChildren(...plan.map(item => {
            const what = describePlanItem(item, overwrite);
            return el("tr", "", el("td", "", item.source.label), el("td", "r", formatNumber(item.source.bytes.length)),
                el("td", "", item.name === "" ? "(no name)" : item.name), el("td", what.className, what.text));
        }));
        const problem = addProblem();
        handle.setStatus(problem ?? "Tab moves between the fields. Enter adds. Add can be undone.", problem !== undefined);
        handle.setButtonEnabled(0, problem === undefined);
    }

    void replan();
}

/**
 * Ask how to extract files, then do it.
 *
 * @param host the page.
 * @param rows the files.
 * @param destination where they go, in words, such as "the folder music".
 * @param extract does the extraction with the chosen options. It returns undefined if it worked, and otherwise a
 * message for the dialog.
 */
export function openExtractDialog(host: ActionHost, rows: readonly FileRow[], destination: string,
                                  extract: (options: ExtractOptions) => Promise<string | undefined>): void {

    let lowercase = true;
    let markDamaged = false;
    const names = rows.map(row => row.fullName);
    host.dialogs.open({
        title: "Extract " + namesText(names) + " to " + destination,
        body: [
            el("p", "wrap", names.join("  ")),
            makeCheck("Lowercase names (--lowercase)", lowercase, checked => lowercase = checked).element,
            makeCheck("Mark damaged files (--mark-damaged)", markDamaged, checked => markDamaged = checked).element,
        ],
        buttons: [{label: "Extract", action: () => extract({lowercase, markDamaged})}],
    });
}

/**
 * A checkbox that can show "mixed" when the files differ, and only reports a change if the user touches it.
 */
class TriStateCheck {
    /** The label element. */
    public readonly element: HTMLLabelElement;
    private readonly input: HTMLInputElement;
    private readonly original: boolean | undefined;
    private touched = false;

    /**
     * @param label the text beside the checkbox.
     * @param values the value for each file.
     */
    constructor(label: string, values: boolean[]) {
        const same = values.every(value => value === values[0]);
        this.original = same ? values[0] : undefined;
        const check = makeCheck(label + (same ? "" : " (mixed)"), this.original === true, () => this.touched = true);
        this.input = check.input;
        this.input.indeterminate = !same;
        this.element = check.element;
    }

    /**
     * The value to set, or undefined to leave the files alone.
     */
    public get change(): boolean | undefined {
        return !this.touched || this.input.checked === this.original ? undefined : this.input.checked;
    }
}

/**
 * Show the dialog that changes the attributes of files on a TRSDOS-family disk: invisible, system and the
 * protection level, with the DOS's names for the levels. (Passwords and dates are in the workbench.)
 *
 * @param host the page.
 * @param disk the disk.
 * @param rows the files, which have attributes.
 */
export function openAttribDialog(host: ActionHost, disk: OpenDisk, rows: readonly FileRow[]): void {
    const trsdos = disk.session.fileSystem;
    if (!(trsdos instanceof Trsdos)) {
        host.dialogs.alert("Attributes", ["This file system has no attributes that can be changed."]);
        return;
    }

    const attributes = rows.map(row => row.attributes!);
    const invisible = new TriStateCheck("Invisible (--invisible, --visible)", attributes.map(a => a.invisible));
    const system = new TriStateCheck("System file (--system, --no-system)", attributes.map(a => a.system));

    const names = trsdos.protectionNames;
    const levels = new Set(attributes.map(a => a.protectionLevel));
    const original: TrsdosProtectionLevel | undefined = levels.size === 1 ? [...levels][0] : undefined;
    const protection = el("select");
    if (original === undefined) {
        const mixed = el("option", "", "(mixed: leave alone)");
        mixed.value = "";
        protection.append(mixed);
    }
    for (const level of trsdosProtectionLevels(names)) {
        const option = el("option", "", trsdosProtectionLevelToString(level, names) + " (" + level + ")");
        option.value = String(level);
        option.selected = level === original;
        protection.append(option);
    }

    const fileNames = rows.map(row => row.fullName);
    host.dialogs.open({
        title: "Attributes of " + namesText(fileNames),
        body: [invisible.element, system.element, el("div", "grid", ...formRow("Protection (--protect)", protection)),
            el("p", "muted", "Passwords and dates are in the workbench.")],
        buttons: [{
            label: "Apply",
            action: () => {
                const request: AttributeRequest = {};
                if (invisible.change !== undefined) {
                    request.invisible = invisible.change;
                }
                if (system.change !== undefined) {
                    request.system = system.change;
                }
                if (protection.value !== "" && Number(protection.value) !== original) {
                    request.protect = trsdosProtectionLevelToString(Number(protection.value) as TrsdosProtectionLevel, names);
                }
                if (Object.keys(request).length === 0) {
                    return Promise.resolve("Nothing changed.");
                }
                return host.run(disk, () => attrib(disk.session, fileNames, request), result =>
                    ["Changed " + result.files.join(", ") + ": " + describeChanges(result.changes, result.protectionNames) + "."])
                    .then(errorOf);
            },
        }],
    });
}

/**
 * Show the dialog that changes a disk's label: its name, date, AUTO command and master password, and the image's
 * write-protect flag.
 *
 * @param host the page.
 * @param disk the disk.
 */
export function openLabelDialog(host: ActionHost, disk: OpenDisk): void {
    const session = disk.session;
    const trsdos = session.fileSystem;
    const ruleSet = session.getWriteGate()?.ruleSet;
    if (!(trsdos instanceof Trsdos) || ruleSet === undefined) {
        host.dialogs.alert("Label", ["This file system has no label that can be changed."]);
        return;
    }

    let info: TrsdosDiskInfo;
    try {
        info = readDiskInfo(session);
    } catch (e) {
        if (e instanceof DiskError) {
            host.dialogs.alert("Label", [e.message]);
            return;
        }
        throw e;
    }

    const limits = getLabelLimits(trsdos, ruleSet, info);
    const nameInput = makeText(info.name, 10);
    nameInput.maxLength = limits.nameLength;
    nameInput.addEventListener("input", () => {
        if (limits.upperCaseName) {
            nameInput.value = nameInput.value.toUpperCase();
        }
    });
    const originalDate = gatDateToInputValue(info.date, ruleSet);
    const dateInput = el("input");
    dateInput.type = "date";
    dateInput.value = originalDate;
    dateInput.min = limits.firstYear + "-01-01";
    dateInput.max = limits.lastYear + "-12-31";
    const autoInput = makeText(info.autoCommand ?? "", 34);
    if (limits.autoLength !== undefined) {
        autoInput.maxLength = limits.autoLength;
    } else {
        autoInput.disabled = true;
        autoInput.placeholder = "this disk has no AUTO command that we can change";
    }
    const passwordInput = makeText("", 10);
    passwordInput.maxLength = limits.passwordLength;
    passwordInput.disabled = true;
    passwordInput.placeholder = "blank";
    passwordInput.addEventListener("input", () => {
        passwordInput.value = passwordInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    const changePassword = makeCheck("change it", false, checked => {
        passwordInput.disabled = !checked;
        if (checked) {
            passwordInput.focus();
        }
    });
    const protectFlag = getWriteProtect(session);
    const protectCheck = makeCheck("Write-protected (the image's flag)", protectFlag === true, () => undefined);
    protectCheck.input.disabled = typeof protectFlag === "string";
    if (typeof protectFlag === "string") {
        protectCheck.element.title = protectFlag;
    }

    host.dialogs.open({
        title: "Label " + disk.name,
        body: [
            el("div", "grid",
                ...formRow("Name", nameInput),
                ...formRow("Date", dateInput),
                ...formRow("AUTO command", autoInput),
                ...formRow("Master password", el("span", "", passwordInput, " ", changePassword.element)),
            ),
            protectCheck.element,
        ],
        buttons: [{
            label: "Apply",
            action: async () => {
                const changes: TrsdosDiskInfoChanges = {};
                const name = nameInput.value.trim();
                if (name === "") {
                    return "A disk name can't be empty.";
                }
                if (name !== info.name) {
                    changes.name = name;
                }
                if (dateInput.value !== originalDate) {
                    const date = inputValueToDate(dateInput.value);
                    if (date === undefined) {
                        return "The date isn't a date.";
                    }
                    changes.date = date;
                }
                if (limits.autoLength !== undefined && autoInput.value.trim() !== (info.autoCommand ?? "")) {
                    changes.autoCommand = autoInput.value.trim();
                }
                if (changePassword.input.checked) {
                    changes.masterPassword = passwordInput.value;
                }
                const protectChanged = typeof protectFlag === "boolean" && protectCheck.input.checked !== protectFlag;
                if (Object.keys(changes).length === 0 && !protectChanged) {
                    return "Nothing changed.";
                }

                if (Object.keys(changes).length > 0) {
                    const outcome = await host.run(disk, () => changeLabel(session, changes), result => {
                        const sentences: string[] = [];
                        if (changes.name !== undefined) {
                            sentences.push("Name is now " + result.name + ".");
                        }
                        if (changes.date !== undefined) {
                            sentences.push("Date is now " + result.date + ".");
                        }
                        if (changes.masterPassword !== undefined) {
                            sentences.push(changes.masterPassword === "" ? "Master password is now blank." :
                                "Master password is changed.");
                        }
                        if (changes.autoCommand !== undefined) {
                            sentences.push(changes.autoCommand === "" ? "AUTO command is removed." :
                                "AUTO command is now " + changes.autoCommand + ".");
                        }
                        return [sentences.join(" ")];
                    });
                    if (!outcome.ok) {
                        return outcome.message;
                    }
                }
                if (protectChanged) {
                    return host.run(disk, () => protect(session, protectCheck.input.checked), changed =>
                        [changed ? "The image is now " + (protectCheck.input.checked ? "" : "not ") + "write-protected." :
                            "The flag was already that way."]).then(errorOf);
                }
                return undefined;
            },
        }],
    });
}

/**
 * Ask for a new name for a file, then rename it.
 *
 * @param host the page.
 * @param disk the disk.
 * @param row the file.
 * @param afterRename called with the new name after a successful rename.
 */
export function openRenameDialog(host: ActionHost, disk: OpenDisk, row: FileRow, afterRename: (newName: string) => void): void {
    const input = makeText(row.fullName, 16);
    host.dialogs.open({
        title: "Rename " + row.fullName,
        body: [el("div", "grid", ...formRow("New name", input))],
        buttons: [{
            label: "Rename",
            action: async () => {
                const newName = input.value.trim();
                if (newName === "") {
                    return "Type the new name.";
                }
                const outcome = await host.run(disk, () => rename(disk.session, row.fullName, newName),
                    result => ["Renamed " + result.oldName + " to " + result.newName + "."]);
                if (outcome.ok) {
                    afterRename(newName);
                }
                return errorOf(outcome);
            },
        }],
    });
}

/**
 * Ask for a pattern, to mark or unmark files by.
 *
 * @param host the page.
 * @param adding whether this marks (true) or unmarks (false).
 * @param apply does it with the pattern.
 */
export function openPatternDialog(host: ActionHost, adding: boolean, apply: (pattern: string) => string | undefined): void {
    const input = makeText("*", 24);
    host.dialogs.open({
        title: adding ? "Mark files" : "Unmark files",
        body: [el("div", "grid", ...formRow("Pattern", input)),
            el("p", "muted", "* matches any run of characters, ? one character. Several patterns can be separated by spaces.")],
        buttons: [{label: adding ? "Mark" : "Unmark", action: () => apply(input.value)}],
    });
}

/**
 * Ask what kind of disk to make, then make it.
 *
 * @param host the page.
 * @param where where the disk will be saved from, such as "In the folder music", for the dialog's first line.
 * @param created called with the new disk.
 */
export function openNewDiskDialog(host: ActionHost, where: string, created: (made: NewDiskResult) => void): void {
    let dos: TrsdosFormatDos = TrsdosFormatDos.LDOS_5_3;
    let system = false;
    let cylinders = getDosOptions(dos).cylinders[0];
    let sides = 1;
    let model: 1 | 3 = 3;
    let name = "new.dmk";
    let nameEdited = false;

    const doseBox = el("div");
    const shapeBox = el("div", "grid");
    const nameInput = makeText(name, 22, text => {
        name = text;
        nameEdited = true;
        refresh();
    });
    const commandLine = el("p", "muted");

    /**
     * The "create" request that the choices equal. Choices that equal the DOS's defaults are left undefined, so that
     * the command line stays short.
     */
    function makeRequest(): CreateFloppyRequest {
        const options = getDosOptions(dos);
        const useShape = !system;
        return {
            format: {
                dos,
                cylinders: useShape && cylinders !== options.cylinders[0] ? cylinders : undefined,
                sides: useShape && sides !== 1 ? sides : undefined,
                density: undefined,
                model: options.models.length > 0 && model !== options.models[0] ? model : undefined,
                name: undefined,
                date: undefined,
            },
            system,
            minimal: false,
            force: false,
        };
    }

    /**
     * The file name, with ".dmk" added if the user left the extension off.
     */
    function diskName(): string {
        const trimmed = name.trim();
        return trimmed === "" ? "" : trimmed.includes(".") ? trimmed : trimmed + ".dmk";
    }

    /**
     * Build a select element of numbers or models.
     */
    function makeSelect<T extends number>(values: readonly T[], current: T, text: (value: T) => string, disabled: boolean,
                                          onChoose: (value: T) => void): HTMLSelectElement {
        const select = el("select");
        for (const value of values) {
            const option = el("option", "", text(value));
            option.value = String(value);
            option.selected = value === current;
            select.append(option);
        }
        select.disabled = disabled;
        select.addEventListener("change", () => onChoose(Number(select.value) as T));
        return select;
    }

    /**
     * Redraw the choices that depend on the DOS, and the command line.
     */
    function refresh(): void {
        const options = getDosOptions(dos);
        const canSystem = hasSystemDisk(dos);
        if (!canSystem) {
            system = false;
        }

        doseBox.replaceChildren(...TRSDOS_FORMAT_DOSES.map(candidate => {
            const radio = makeRadio("dos", trsdosFormatDosToString(candidate).padEnd(14) + getDosOptions(candidate).summary,
                candidate === dos, () => {
                    dos = candidate;
                    const candidateOptions = getDosOptions(candidate);
                    cylinders = candidateOptions.cylinders[0];
                    sides = candidateOptions.sides[0];
                    model = candidateOptions.models.length > 0 ? candidateOptions.models[0] : 3;
                    refresh();
                });
            return radio.element;
        }));

        const kindData = makeRadio("kind", "Data disk (empty)", !system, () => {
            system = false;
            refresh();
        });
        const kindSystem = makeRadio("kind", "System disk (bootable, with the DOS's files)", system, () => {
            system = true;
            refresh();
        });
        kindSystem.input.disabled = !canSystem;
        if (!canSystem) {
            kindSystem.element.title = "There's no system disk for this DOS";
        }

        const shapeRows: Node[] = [
            ...formRow("Cylinders", makeSelect(options.cylinders, cylinders, String, system, value => {
                cylinders = value;
                refresh();
            })),
            ...formRow("Sides", makeSelect(options.sides, sides, String, system, value => {
                sides = value;
                refresh();
            })),
        ];
        if (options.models.length > 0) {
            shapeRows.push(...formRow("Model", makeSelect(options.models, model, value => value === 1 ? "Model I" : "Model III",
                false, value => {
                    model = value as 1 | 3;
                    refresh();
                })));
        }
        shapeBox.replaceChildren(...shapeRows);
        kindBox.replaceChildren(kindData.element, kindSystem.element);

        if (!nameEdited) {
            name = system ? trsdosFormatDosToString(dos).toLowerCase().replace(/[^a-z0-9.]+/g, "-") + "-system.dmk" : "new.dmk";
            nameInput.value = name;
        }
        commandLine.textContent = "= " + createCommandLine(makeRequest());
    }

    const kindBox = el("div");
    host.dialogs.open({
        title: "New disk",
        body: [el("p", "", where + ", a new DMK image:"), doseBox, el("p", ""), kindBox, shapeBox,
            el("div", "grid", ...formRow("File name", nameInput)), commandLine],
        buttons: [{
            label: "Create",
            action: async () => {
                const fileName = diskName();
                if (fileName === "") {
                    return "Type a file name.";
                }
                try {
                    created(await newDisk(makeRequest(), fileName));
                } catch (e) {
                    if (e instanceof DiskError) {
                        return e.message;
                    }
                    throw e;
                }
                return undefined;
            },
        }],
    });
    refresh();
}
