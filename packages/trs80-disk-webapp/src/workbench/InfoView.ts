import {
    canTrimFloppy, hashTrsdosPasswordForVersion, knownTrsdosPassword, Trsdos, type TrsdosDiskInfo,
    type TrsdosDiskInfoChanges, TRIMMABLE_FLOPPY_FORMATS, type TrsdosVersion,
} from "trs80-base";
import {
    DiskError, describeAutoCommand, getWriteProtect, readDiskInfo, type DiskSession,
} from "trs80-disk";
import type {OpenDisk} from "../core/OpenDisk.js";
import {capitalize} from "./Text.js";
import {getDiskDetails} from "../core/DiskFacts.js";
import {gatDateToInputValue, getLabelLimits, inputValueToDate} from "../core/LabelLimits.js";
import {bootBlocker} from "../core/Booting.js";
import {el, formatNumber, makeButton, makeSwitch, withDisabledReason} from "../core/Dom.js";

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
    /** Boot the disk in the emulator. */
    boot(): void;
}

/**
 * The master passwords that the user has typed in this page session, by layout and hash. The disk keeps only the
 * hash, so this is how we can show the password again later, even on another disk with the same one. It's in
 * memory only, and so is gone when the page is closed.
 */
const typedPasswords = new Map<string, string>();

/**
 * The key in {@link typedPasswords} for a hash, which depends on the layout because TRSDOS 1.3 hashes differently.
 */
function passwordKey(version: TrsdosVersion, hash: number): string {
    return String(version) + ":" + hash;
}

/**
 * Remember a password that the user typed.
 *
 * @param password the password.
 * @param version the disk's layout.
 */
function rememberPassword(password: string, version: TrsdosVersion): void {
    try {
        typedPasswords.set(passwordKey(version, hashTrsdosPasswordForVersion(password, version)), password);
    } catch {
        // The DOS wouldn't take it, so it can't be on a disk.
    }
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
            list.append(el("dt", "", term), el("dd", term === "File" ? "mono" : "", term === "File" ? value : capitalize(value)));
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
                return el("div", "card", el("p", "kind", e.message));
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
        autoInput.placeholder = "None";
        autoInput.spellcheck = false;
        autoInput.style.width = "min(100%, 320px)";
        if (limits.autoLength !== undefined) {
            autoInput.maxLength = limits.autoLength;
        }

        // The disk keeps only the password's hash, so we can show the password only if we know it: it's blank or
        // the default, or the user typed it earlier in this page session. Otherwise the field is empty and says so.
        const knownPassword = knownTrsdosPassword(info.passwordHash, info.version) ??
            typedPasswords.get(passwordKey(info.version, info.passwordHash));
        const passwordInput = el("input", "mono");
        passwordInput.maxLength = limits.passwordLength;
        passwordInput.value = knownPassword ?? "";
        passwordInput.placeholder = knownPassword === undefined ? "Unknown" : "None";
        passwordInput.style.width = "130px";
        passwordInput.spellcheck = false;
        const passwordHashNote = el("span", "note", "hash 0x" + info.passwordHash.toString(16).toUpperCase().padStart(4, "0"));
        passwordHashNote.hidden = knownPassword !== undefined;
        let passwordEdited = false;

        const saveButton = makeButton("Save", () => void save(), "primary");
        const status = el("span", "note");

        /** The hash of what's in the password field, or undefined if the DOS wouldn't take it. */
        const passwordHash = (): number | undefined => {
            try {
                return hashTrsdosPasswordForVersion(passwordInput.value, info.version);
            } catch {
                return undefined;
            }
        };

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
            if (passwordEdited && passwordHash() !== info.passwordHash) {
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

            if (passwordEdited) {
                // What was typed is the password as far as we know, so remember it for when it comes back.
                rememberPassword(passwordInput.value, info.version);
                passwordHashNote.hidden = true;
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
        passwordInput.addEventListener("input", () => {
            passwordEdited = true;
            update();
        });
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
            el("label", "", "Master password"), el("div", "", passwordInput, " ", passwordHashNote),
            el("label", "", "AUTO command"), el("div", "", autoInput, " ",
                el("span", "note", limits.autoLength === undefined ?
                    "this disk has no place to keep one that we can change (" + describeAutoCommand(info.autoCommand) + ")" :
                    "runs at boot, up to " + limits.autoLength + " characters")));

        const footer = el("div", "btnrow", withDisabledReason(saveButton, readOnly ? readOnlyReason : undefined), status);
        footer.style.marginTop = "12px";
        update();
        const card = el("div", "card", form, footer);
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
        note.style.margin = "0";
        // The switch centers its label in the track's 20px, so the note's lines are 20px too, which puts its first
        // line level with the label. The switch never wraps.
        element.style.flex = "none";
        note.style.lineHeight = "20px";
        const row = el("div", "", element, note);
        row.style.display = "flex";
        row.style.alignItems = "flex-start";
        row.style.gap = "10px";
        return el("div", "card", el("h4", "", "Write protection"), row);
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

        const bootReason = bootBlocker(disk);
        const boot = makeButton("Boot in the Emulator", () => this.host.boot());
        boot.disabled = bootReason !== undefined;
        row.append(withDisabledReason(boot, bootReason));

        return el("div", "card", el("h4", "", "Do something with the whole disk"), row);
    }
}
