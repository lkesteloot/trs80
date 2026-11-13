import {
    findBlockingProtectionSigns, FloppyDisk, protectionSignKindToString, type TrsdosFinding, TrsdosFindingSeverity,
    type TrsdosRepairResult, TrsdosWriteAccess,
} from "trs80-base";
import {assertNever} from "z80-base";
import {DiskError, DiskErrorKind} from "./DiskError.js";
import {DiskSession, DiskWritePurpose, writeBlockersErrorKind} from "./DiskSession.js";
import {pluralizeWithCount} from "./Plural.js";

// The operations behind the "check" and "repair" commands: what's inconsistent in the file system, and
// fixing it where that can be done.

/**
 * The most program names to list before saying "and N more".
 */
const MAX_PROGRAMS_SHOWN = 4;

/**
 * What checkDisk() found.
 */
export interface CheckResult {
    /** What's inconsistent in the file system, in order of severity (layout first, then damage, then notes). */
    findings: TrsdosFinding[];

    /** Why the disk can't be written, in one or more sentences, or undefined if it can. */
    readOnlyReason: string | undefined;
}

/**
 * What repairDisk() did.
 */
export interface RepairResult {
    /** What the repair changed, what damage is left, and what it could have done with an option. */
    repaired: TrsdosRepairResult;

    /** Whether the disk was damaged, and so blocked from other writes, before the repair. */
    damagedBefore: boolean;

    /**
     * Why the disk still can't be written after the repair, or undefined if it can. Only meaningful if
     * damagedBefore: the gate is evaluated again, since the repair may have settled what blocked writing.
     */
    readOnlyReasonAfter: string | undefined;
}

/**
 * The heading for each severity of finding in a report of the check.
 */
export function findingSeverityHeading(severity: TrsdosFindingSeverity): string {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "Doubts about the layout:";
        case TrsdosFindingSeverity.DAMAGE:
            return "Damage:";
        case TrsdosFindingSeverity.NOTE:
            return "Notes:";
        default:
            assertNever(severity);
    }
}

/**
 * Check the file system for problems, changing nothing.
 *
 * @param session the session.
 * @throws DiskError if the disk has no file system, or its file system isn't TRSDOS-family.
 */
export function checkDisk(session: DiskSession): CheckResult {
    const gate = session.getWriteGate();
    if (gate === undefined) {
        if (session.fileSystem === undefined) {
            throw new DiskError("Can't find a DOS directory on \"" + session.name + "\"");
        }
        throw new DiskError("Checking " + session.fileSystem.nameAndVersion + " disks isn't supported yet");
    }

    return {findings: gate.check.findings, readOnlyReason: session.getReadOnlyReason()};
}

/**
 * Repair the disk. It works on a disk that is damaged but otherwise sound, and refuses one that can't be
 * written for any other reason (an uncertain layout, say), since a repair writes to the same places as any
 * other change. It also refuses a floppy that shows signs of copy protection, even with --force, since what
 * a check calls damage may be the protection itself (a directory cylinder left allocated, say). IDs naming
 * another cylinder don't count when they're only on re-reads past the disk's end (see
 * findBlockingProtectionSigns() in trs80-base).
 *
 * @param session the session.
 * @param options what to repair beyond the damage itself.
 * @param options.freeUnclaimed also free granules that the GAT marks used but no file claims.
 * @param options.fixProgramSizes also set the size of programs whose transfer record is past their
 * directory size.
 * @param options.markMissingUsed also mark used in the GAT the free granules that the image doesn't fully hold.
 * @throws DiskError if the disk can't be repaired.
 */
export function repairDisk(session: DiskSession,
                           options: {freeUnclaimed: boolean, fixProgramSizes: boolean, markMissingUsed: boolean}): RepairResult {
    // A disk that is unreadable for any reason but damage can't be repaired, --force or not.
    const gate = session.getWriteGate();
    if (session.fileSystem !== undefined && gate === undefined) {
        throw new DiskError("Repairing " + session.fileSystem.nameAndVersion + " disks isn't supported yet");
    }
    const damagedBefore = gate?.access === TrsdosWriteAccess.REPAIR_ONLY;
    if (gate !== undefined) {
        switch (gate.access) {
            case TrsdosWriteAccess.WRITABLE:
            case TrsdosWriteAccess.REPAIR_ONLY:
                break;
            case TrsdosWriteAccess.READ_ONLY:
                throw new DiskError("Can't repair this disk: " + session.getReadOnlyReason(),
                    writeBlockersErrorKind(gate.blockers));
            default:
                assertNever(gate.access);
        }
    }

    // Before anything touches the GAT or HIT. Unknown means hands off.
    const image = session.image;
    if (image instanceof FloppyDisk) {
        const signs = findBlockingProtectionSigns(image, session.fileSystem);
        if (signs.length > 0) {
            throw new DiskError("Can't repair this disk: it shows signs of copy protection (" +
                signs.map(sign => protectionSignKindToString(sign.kind)).join(", ") + "), and a repair could " +
                "destroy them, so it's left alone, even with --force. " + signs.map(sign => sign.message).join(" "),
                DiskErrorKind.READ_ONLY);
        }
    }

    let result = undefined as TrsdosRepairResult | undefined;
    session.changeTrsdos(DiskWritePurpose.REPAIR, writer => {
        result = writer.repair({
            freeUnclaimed: options.freeUnclaimed,
            fixProgramSizes: options.fixProgramSizes,
            markMissingUsed: options.markMissingUsed,
        });
    });
    if (result === undefined) {
        throw new Error("The repair didn't run");
    }

    // The gate is evaluated again, since the repair may have settled what blocked writing.
    return {repaired: result, damagedBefore, readOnlyReasonAfter: session.getReadOnlyReason()};
}

/**
 * Describe the granules that a repair could free, for the user. This names the command line's option
 * by its name, which is fine until a page wants its own wording.
 *
 * @param count how many granules are marked used but not claimed by any file, at least 1.
 */
export function describeFreeableUnclaimed(count: number): string {
    return pluralizeWithCount(count, "granule") + " " +
        (count === 1 ? "is" : "are") + " marked used but no file claims " +
        (count === 1 ? "it" : "them") + ". Use --free-unclaimed to free " +
        (count === 1 ? "it" : "them") +
        ", unless a program keeps data there.";
}

/**
 * Describe the free granules that the image doesn't fully hold, which a repair could mark used, for the user.
 * This names the command line's option by its name, which is fine until a page wants its own wording.
 *
 * @param count how many granules the GAT says are free that the image doesn't fully hold, at least 1.
 */
export function describeMarkableMissing(count: number): string {
    const one = count === 1;
    return pluralizeWithCount(count, "granule") + " that the GAT says " + (one ? "is" : "are") +
        " free " + (one ? "isn't" : "aren't") + " fully on the image, so new files skip " + (one ? "it" : "them") +
        ". Use --mark-missing-used to mark " + (one ? "it" : "them") + " used in the GAT, so that the DOS won't " +
        "use " + (one ? "it" : "them") + " either, unless the real disk may still have " + (one ? "its" : "their") +
        " sectors.";
}

/**
 * Describe the programs whose size a repair could fix, for the user. This names the command line's option
 * by its name, which is fine until a page wants its own wording.
 *
 * @param names the names of the programs, as shown, at least one.
 */
export function describeFixablePrograms(names: string[]): string {
    const shown = names.slice(0, MAX_PROGRAMS_SHOWN);
    const hidden = names.length - shown.length;
    const list = hidden > 0 ? shown.join(", ") + ", and " + hidden.toLocaleString() + " more" :
        shown.length <= 1 ? shown.join("") : shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1];
    const one = names.length === 1;
    return pluralizeWithCount(names.length, "program") + (one ? " runs" : " run") +
        " past " + (one ? "its" : "their") + " directory size: " + list + ". Use --fix-program-sizes to set " +
        (one ? "its size" : "their sizes") + ".";
}
