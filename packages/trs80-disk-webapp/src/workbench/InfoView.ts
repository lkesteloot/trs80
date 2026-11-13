import {
    canTrimFloppy, getFloppyDetails, parseTrsdosGatDate, SYSINFO_AUTO_LENGTH, Trsdos, type TrsdosDiskInfo,
    type TrsdosDiskInfoChanges, TrsdosRuleSet, trsdosGatDateYearRange, trsdosKeepsAutoInSystemInformation,
    TRIMMABLE_FLOPPY_FORMATS,
} from "trs80-base";
import {
    DiskError, describeAutoCommand, describeMasterPassword, getWriteProtect, readDiskInfo, type DiskSession,
} from "trs80-disk";
import {assertNever} from "z80-base";
import type {OpenDisk} from "../core/OpenDisk.js";
import {getDiskFacts} from "./DiskFacts.js";
import {el, formatNumber, makeButton, makeSwitch, withDisabledReason} from "./Dom.js";

/**
 * What the Disk info view asks of the page.
 */
export interface InfoViewHost {
    /**
     * Change the disk's name, date, master password or AUTO command.
     *
     * @param changes what to change.
     * @returns undefined if it worked, and otherwise the error, which the page has shown.
     */
    saveLabel(changes: TrsdosDiskInfoChanges): Promise<string | undefined>;
    /** Set or clear the image's write-protect flag. */
    setWriteProtect(disk: OpenDisk, writeProtected: boolean): void;
    /** Show the sheet that formats the disk. */
    format(): void;
    /** Show the sheet that trims the disk. */
    trim(): void;
    /** Show the sheet that saves the disk in another format. */
    saveAs(): void;
}

/**
 * What a DOS lets a disk's label hold, which the fields apply as the user types.
 */
interface LabelLimits {
    /** The most characters in the name, which every DOS gives eight. */
    nameLength: number;
    /** Whether the DOS keeps the name in upper case, which every DOS but DOSPLUS and MultiDOS does. */
    upperCaseName: boolean;
    /** The first and last year of a date that the DOS can store. */
    firstYear: number;
    lastYear: number;
    /** The most characters in the AUTO command, or undefined if the disk can't hold one that we can change. */
    autoLength: number | undefined;
    /** The most characters in the master password. */
    passwordLength: number;
}

/**
 * The limits of a disk's label.
 *
 * @param trsdos the disk's file system.
 * @param ruleSet the rules that the disk is written by.
 * @param info the disk's information, whose AUTO command is undefined if the disk has no place to keep one.
 */
function getLabelLimits(trsdos: Trsdos, ruleSet: TrsdosRuleSet, info: TrsdosDiskInfo): LabelLimits {
    const years = trsdosGatDateYearRange(ruleSet, trsdos.hasTimeStamps);

    // Where the AUTO command is kept decides its length: 79 in TRSDOS 6's system information sector, and about 31
    // in the GAT, less if the GAT has a media block (the engine says if a command doesn't fit).
    let autoLength: number | undefined;
    switch (ruleSet) {
        case TrsdosRuleSet.MULTIDOS:
            // Its AUTO commands start with a flag character that we haven't worked out.
            autoLength = undefined;
            break;
        case TrsdosRuleSet.TRSDOS_2_7:
            autoLength = 30;
            break;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.NEWDOS_80:
            autoLength = trsdosKeepsAutoInSystemInformation(ruleSet) ? SYSINFO_AUTO_LENGTH - 1 : 31;
            break;
        default:
            assertNever(ruleSet);
    }
    if (info.autoCommand === undefined) {
        autoLength = undefined;
    }

    let upperCaseName: boolean;
    switch (ruleSet) {
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.MULTIDOS:
            upperCaseName = false;
            break;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.TRSDOS_2_7:
        case TrsdosRuleSet.NEWDOS_80:
            upperCaseName = true;
            break;
        default:
            assertNever(ruleSet);
    }

    return {
        nameLength: 8, upperCaseName, firstYear: years.first, lastYear: years.last, autoLength, passwordLength: 8,
    };
}

/**
 * Convert the date that the GAT holds ("MM/DD/YY") to the value of a date input ("YYYY-MM-DD").
 *
 * @param text the GAT's date.
 * @param ruleSet the DOS's rules, which say which century the two digits are in.
 * @returns the value, or "" if the GAT holds no date.
 */
function gatDateToInputValue(text: string, ruleSet: TrsdosRuleSet): string {
    const date = parseTrsdosGatDate(text, ruleSet);
    if (date === undefined) {
        return "";
    }
    return String(date.year).padStart(4, "0") + "-" + String(date.month).padStart(2, "0") + "-" + String(date.day).padStart(2, "0");
}

/**
 * Convert the value of a date input to a date, in local time.
 *
 * @param value the input's value, "YYYY-MM-DD".
 * @returns the date, or undefined if the value isn't a date.
 */
function inputValueToDate(value: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) {
        return undefined;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The facts about a disk that aren't in the label, as pairs of a term and its value: what "info --verbose" says,
 * from the engine's and trs80-base's descriptions.
 *
 * @param disk the disk.
 */
function getDiskDetails(disk: OpenDisk): [string, string][] {
    const session = disk.session;
    const facts = getDiskFacts(session);
    const details: [string, string][] = [];
    details.push(["File", disk.name]);
    details.push(["DOS", facts.dos]);
    details.push(["Image format", facts.format]);
    details.push(["Image size", formatNumber(session.image.binary.length) + " bytes"]);

    if (session.isHardDisk()) {
        const geometry = session.hardDisk.getGeometry();
        details.push(["Geometry", formatNumber(geometry.cylinderCount) + " cylinders, " + geometry.headCount + " heads, " +
            geometry.sectorsPerTrack + " sectors per track, " + geometry.sectorSize + " bytes per sector"]);
        const partitions = session.getPartitions();
        details.push(["Partitions", String(partitions.length)]);
        const number = session.selectedPartitionNumber;
        if (number !== undefined) {
            const partition = partitions[number - 1];
            details.push(["Selected partition", number + " (" + session.selectedPartitionName + "), " +
                partition.partition.describeLocation()]);
        }
    } else {
        for (const detail of getFloppyDetails(session.floppy, session.fileSystem)) {
            details.push([detail.label, detail.value]);
        }
    }

    const readOnlyReason = session.getReadOnlyReason();
    details.push(["Writable", readOnlyReason === undefined ? "yes" : "no: " + readOnlyReason]);
    return details;
}

/**
 * Why an operation on the whole disk isn't offered, or undefined if it is.
 *
 * @param session the disk's session.
 * @param what the operation, such as "Format".
 */
function hardDiskReason(session: DiskSession, what: string): string | undefined {
    return session.isHardDisk() ? what + " isn't offered for a hard disk image." : undefined;
}

/**
 * The Disk info view: the label's fields, edited in place with the DOS's limits applied as you type; the
 * write-protect switch; the facts that "info --verbose" gives; and the buttons for the operations on the whole disk
 * (format, trim, save as), which are disabled with their reason when they don't apply.
 */
export class InfoView {
    /** The view's root element, which the page puts in its main pane. */
    public readonly element = el("div", "infoview");

    private readonly host: InfoViewHost;

    /**
     * @param host the page.
     */
    constructor(host: InfoViewHost) {
        this.host = host;
    }

    /**
     * Draw the information about a disk.
     *
     * @param disk the disk.
     */
    public render(disk: OpenDisk): void {
        const cards: HTMLElement[] = [];
        const label = this.makeLabelCard(disk);
        if (label !== undefined) {
            cards.push(label);
        }
        cards.push(this.makeProtectCard(disk), this.makeButtonsCard(disk));

        const list = el("dl", "kv facts");
        for (const [term, value] of getDiskDetails(disk)) {
            list.append(el("dt", "", term), el("dd", "", value));
        }
        cards.push(el("div", "card", el("h4", "", "Details"), list));
        this.element.replaceChildren(...cards);
    }

    /**
     * Make the card with the label's fields, or undefined if the disk has no label that we can show.
     */
    private makeLabelCard(disk: OpenDisk): HTMLElement | undefined {
        const session = disk.session;
        const trsdos = session.fileSystem;
        const ruleSet = session.getWriteGate()?.ruleSet;
        if (!(trsdos instanceof Trsdos) || ruleSet === undefined) {
            return undefined;
        }

        let info: TrsdosDiskInfo;
        try {
            info = readDiskInfo(session);
        } catch (e) {
            if (e instanceof DiskError) {
                return el("div", "card", el("h4", "", "Label"), el("p", "kind", e.message));
            }
            throw e;
        }

        const limits = getLabelLimits(trsdos, ruleSet, info);
        const readOnlyReason = session.getReadOnlyReason();
        const readOnly = readOnlyReason !== undefined;

        const nameInput = el("input", "mono");
        nameInput.value = info.name;
        nameInput.maxLength = limits.nameLength;
        nameInput.style.width = "130px";
        nameInput.spellcheck = false;

        const dateInput = el("input");
        dateInput.type = "date";
        const originalDate = gatDateToInputValue(info.date, ruleSet);
        dateInput.value = originalDate;
        dateInput.min = String(limits.firstYear) + "-01-01";
        dateInput.max = String(limits.lastYear) + "-12-31";

        const autoInput = el("input", "mono");
        autoInput.value = info.autoCommand ?? "";
        autoInput.placeholder = "none";
        autoInput.spellcheck = false;
        autoInput.style.width = "min(100%, 320px)";
        if (limits.autoLength !== undefined) {
            autoInput.maxLength = limits.autoLength;
        }

        const passwordInput = el("input", "mono");
        passwordInput.maxLength = limits.passwordLength;
        passwordInput.placeholder = "blank";
        passwordInput.style.width = "130px";
        passwordInput.spellcheck = false;
        passwordInput.hidden = true;
        let changingPassword = false;
        const passwordText = el("span", "mono", describeMasterPassword(info.passwordHash, info.version));
        passwordText.style.color = "var(--fg-strong)";
        const passwordButton = makeButton("Change…", () => {
            changingPassword = !changingPassword;
            passwordInput.hidden = !changingPassword;
            passwordButton.textContent = changingPassword ? "Keep it" : "Change…";
            if (changingPassword) {
                passwordInput.focus();
            }
            update();
        });
        passwordButton.style.marginLeft = "8px";
        passwordButton.style.padding = "2px 8px";

        const saveButton = makeButton("Save label", () => void save(), "primary");
        const status = el("span", "note");

        /** What the fields hold that differs from the disk. */
        const pendingChanges = (): TrsdosDiskInfoChanges => {
            const changes: TrsdosDiskInfoChanges = {};
            const name = nameInput.value.trim();
            if (name !== info.name && name !== "") {
                changes.name = name;
            }
            if (dateInput.value !== originalDate) {
                const date = inputValueToDate(dateInput.value);
                if (date !== undefined) {
                    changes.date = date;
                }
            }
            if (changingPassword) {
                changes.masterPassword = passwordInput.value;
            }
            if (limits.autoLength !== undefined && autoInput.value.trim() !== (info.autoCommand ?? "")) {
                changes.autoCommand = autoInput.value.trim();
            }
            return changes;
        };

        /** Apply the limits to what's been typed, and enable Save if there's a change. */
        const update = (): void => {
            if (limits.upperCaseName) {
                nameInput.value = nameInput.value.toUpperCase();
            }
            nameInput.value = nameInput.value.replace(/[^\x20-\x7E]/g, "");
            autoInput.value = autoInput.value.replace(/[^\x20-\x7E]/g, "");
            passwordInput.value = passwordInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (/^\d/.test(passwordInput.value)) {
                // A password starts with a letter.
                passwordInput.value = passwordInput.value.replace(/^\d+/, "");
            }

            const changed = Object.values(pendingChanges()).some(value => value !== undefined);
            const nameProblem = nameInput.value.trim() === "";
            const date = inputValueToDate(dateInput.value);
            const dateChanged = dateInput.value !== originalDate;
            const dateOutOfRange = dateChanged && date !== undefined &&
                (date.getFullYear() < limits.firstYear || date.getFullYear() > limits.lastYear);
            const dateProblem = dateChanged && (date === undefined || dateOutOfRange);
            saveButton.disabled = !changed || readOnly || nameProblem || dateProblem;
            status.textContent = nameProblem ? "A disk name can't be empty." : dateProblem ?
                "This DOS can store the years " + limits.firstYear + " to " + limits.lastYear + "." : "";
            status.classList.remove("bad");
        };
        const save = async (): Promise<void> => {
            const error = await this.host.saveLabel(pendingChanges());
            if (error !== undefined) {
                status.textContent = error;
                status.classList.add("bad");
            }
        };
        for (const input of [nameInput, dateInput, autoInput, passwordInput]) {
            input.disabled = readOnly;
            input.addEventListener("input", update);
        }
        autoInput.disabled = readOnly || limits.autoLength === undefined;
        passwordButton.disabled = readOnly;
        for (const input of [nameInput, autoInput, passwordInput]) {
            input.addEventListener("keydown", event => {
                if (event.key === "Enter" && !saveButton.disabled) {
                    event.preventDefault();
                    void save();
                }
            });
        }

        const form = el("div", "form",
            el("label", "", "Name"), el("div", "", nameInput, " ",
                el("span", "note", "up to " + limits.nameLength + " characters")),
            el("label", "", "Date"), el("div", "", dateInput, " ",
                el("span", "note", limits.firstYear + " to " + limits.lastYear + " on this DOS")),
            el("label", "", "Master password"), el("div", "", passwordText, passwordButton, " ", passwordInput),
            el("label", "", "AUTO command"), el("div", "", autoInput, " ",
                el("span", "note", limits.autoLength === undefined ?
                    "this disk has no place to keep one that we can change (" + describeAutoCommand(info.autoCommand) + ")" :
                    "runs at boot, up to " + limits.autoLength + " characters")));

        const footer = el("div", "btnrow", withDisabledReason(saveButton, readOnly ? readOnlyReason : undefined), status);
        footer.style.marginTop = "12px";
        update();
        const card = el("div", "card", el("h4", "", "Label"), form, footer);
        if (readOnlyReason !== undefined) {
            card.append(el("p", "hint", "The label can't be changed: " + readOnlyReason));
        }
        return card;
    }

    /**
     * Make the card with the write-protect switch.
     */
    private makeProtectCard(disk: OpenDisk): HTMLElement {
        const flag = getWriteProtect(disk.session);
        const unsupported = typeof flag === "string" ? flag : undefined;
        const {element, input} = makeSwitch("Write-protected", flag === true, checked => {
            this.host.setWriteProtect(disk, checked);
        }, unsupported ?? "The image's write-protect flag, which emulators honor (protect on or off)");
        input.disabled = unsupported !== undefined;
        const note = el("span", "hint", unsupported ?? "The flag in the image file, which emulators honor. It doesn't stop this page from changing the disk.");
        note.style.margin = "0 0 0 10px";
        return el("div", "card", el("h4", "", "Write protection"), el("div", "", element, note));
    }

    /**
     * Make the card with the buttons for the operations on the whole disk.
     */
    private makeButtonsCard(disk: OpenDisk): HTMLElement {
        const session = disk.session;
        const row = el("div", "btnrow");

        const formatReason = hardDiskReason(session, "Format");
        const format = makeButton("Format…", () => this.host.format(), "danger");
        format.disabled = formatReason !== undefined;
        row.append(withDisabledReason(format, formatReason));

        let trimReason = hardDiskReason(session, "Trim");
        if (trimReason === undefined && !canTrimFloppy(session.floppy)) {
            trimReason = "Trim works on " + TRIMMABLE_FLOPPY_FORMATS + " images, not on " + session.floppy.getDescription() + ".";
        }
        const trim = makeButton("Trim unused tracks…", () => this.host.trim());
        trim.disabled = trimReason !== undefined;
        row.append(withDisabledReason(trim, trimReason));

        const saveAsReason = session.isHardDisk() ? "A hard disk image can only be saved as it is." : undefined;
        const saveAs = makeButton("Save as another format…", () => this.host.saveAs());
        saveAs.disabled = saveAsReason !== undefined;
        row.append(withDisabledReason(saveAs, saveAsReason));

        return el("div", "card", el("h4", "", "Do something with the whole disk"), row);
    }
}
