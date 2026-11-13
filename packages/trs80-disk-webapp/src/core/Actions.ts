import type {BasicDialect, TrsdosDiskInfo, TrsdosDiskInfoChanges} from "trs80-base";
import {
    addCommandLine, type AddCommandOptions, addFiles, type AddFilesResult, type AddFileSource, type AddOptions,
    type AddPlanItem, type AttributeChangeResult, type AttributeRequest, attribCommandLine, changeAttributes,
    changeDiskInfo, DiskError, DiskSession, formatFloppy, formatFloppyCommandLine,
    type FormatFloppyRequest, formatYmd, killCommandLine, killFiles, labelCommandLine, planAdd, protectCommandLine,
    renameCommandLine, renameFile, type RenameResult, repairCommandLine, repairDisk, type RepairResult,
    revertCommandLine, setWriteProtect, trimCommandLine, trimDisk, type TrimRequest, type TrimResult,
} from "trs80-disk";

// Every change that a page can make to a disk, one function each, so that both pages make them the same way.
// Each builds the command line that the change equals, runs the engine's operation inside runUndoable() with
// that line as its label, and returns the engine's result along with the line. The engine's DiskErrors are
// thrown as they are, for the page to show.

export {newDisk, type NewDiskResult} from "./Opening.js";

/**
 * What an action did: the command line that it equals, and what the engine returned.
 */
export interface ActionResult<T> {
    /** The command line, such as "kill HELLO/BAS". A page shows it, and the undo history holds it as the label. */
    commandLine: string;
    /** What the engine's operation returned. */
    result: T;
}

/**
 * Run an operation as one undoable step.
 *
 * @param session the disk's session.
 * @param commandLine the command line, which labels the undo entry.
 * @param operation the engine's operation.
 */
async function runAction<T>(session: DiskSession, commandLine: string, operation: () => T): Promise<ActionResult<T>> {
    let result: T | undefined;
    await session.runUndoable(commandLine, () => {
        result = operation();
    });

    // runUndoable() either runs the operation to the end or throws.
    return {commandLine, result: result as T};
}

/**
 * Remove files.
 *
 * @param session the disk's session.
 * @param patterns the TRS-80 names or patterns of the files to remove.
 * @returns the names of the files removed.
 */
export async function kill(session: DiskSession, patterns: string[]): Promise<ActionResult<string[]>> {
    return runAction(session, killCommandLine(patterns), () => killFiles(session, patterns));
}

/**
 * Rename one file.
 *
 * @param session the disk's session.
 * @param oldName the file's name as the disk shows it.
 * @param newName the new name.
 */
export async function rename(session: DiskSession, oldName: string, newName: string): Promise<ActionResult<RenameResult>> {
    return runAction(session, renameCommandLine(oldName, newName), () => renameFile(session, oldName, newName));
}

/**
 * Change the attributes of files.
 *
 * @param session the disk's session.
 * @param patterns the TRS-80 names or patterns of the files.
 * @param request what to change.
 */
export async function attrib(session: DiskSession, patterns: string[],
                             request: AttributeRequest): Promise<ActionResult<AttributeChangeResult>> {

    return runAction(session, attribCommandLine(patterns, request), () => changeAttributes(session, patterns, request));
}

/**
 * Change the disk's name, date, master password or AUTO command.
 *
 * @param session the disk's session.
 * @param changes what to change.
 * @returns the disk's information read back after the change.
 */
export async function label(session: DiskSession, changes: TrsdosDiskInfoChanges): Promise<ActionResult<TrsdosDiskInfo>> {
    return runAction(session, labelCommandLine(changes), () => changeDiskInfo(session, changes));
}

/**
 * Set or clear the image's write-protect flag.
 *
 * @param session the disk's session.
 * @param writeProtected the new value.
 * @returns whether the flag changed.
 */
export async function protect(session: DiskSession, writeProtected: boolean): Promise<ActionResult<boolean>> {
    return runAction(session, protectCommandLine(writeProtected), () => setWriteProtect(session, writeProtected));
}

/**
 * Which extra repairs to make.
 */
export interface RepairOptions {
    /** Also free granules that the GAT marks used but no file claims. */
    freeUnclaimed: boolean;
    /** Also set the size of programs whose transfer record is past their directory size. */
    fixProgramSizes: boolean;
    /** Also mark used in the GAT the free granules that the image doesn't fully hold. */
    markMissingUsed: boolean;
}

/**
 * Repair the damage that "check" finds.
 *
 * @param session the disk's session.
 * @param options which extra repairs to make.
 */
export async function repair(session: DiskSession, options: RepairOptions): Promise<ActionResult<RepairResult>> {
    return runAction(session, repairCommandLine(options), () => repairDisk(session, options));
}

/**
 * Make a throwaway session of a copy of the disk's current image, so that an operation can be tried without
 * touching the real disk. It uses the same partition, if the disk has several.
 *
 * @param session the disk's session.
 */
function makeScratchSession(session: DiskSession): DiskSession {
    const partition = session.selectedPartitionNumber;
    return DiskSession.fromBinary(session.name, new Uint8Array(session.image.binary), {
        partition: partition === undefined ? undefined : String(partition),
    });
}

/**
 * Do a repair on a copy of the disk to see what it would do, changing nothing.
 *
 * @param session the disk's session, which isn't changed.
 * @param options which extra repairs to make.
 * @throws DiskError if the repair would be refused.
 */
export function repairDryRun(session: DiskSession, options: RepairOptions): ActionResult<RepairResult> {
    const scratch = makeScratchSession(session);
    return {commandLine: repairCommandLine(options), result: repairDisk(scratch, options)};
}

/**
 * Drop the image's unused cylinders or side 1.
 *
 * @param session the disk's session.
 * @param request what to drop.
 */
export async function trim(session: DiskSession, request: TrimRequest): Promise<ActionResult<TrimResult>> {
    return runAction(session, trimCommandLine(request), () => trimDisk(session, request));
}

/**
 * Do a trim on a copy of the disk to see what it would do, changing nothing.
 *
 * @param session the disk's session, which isn't changed.
 * @param request what to drop.
 * @throws DiskError if the trim would be refused.
 */
export function trimDryRun(session: DiskSession, request: TrimRequest): ActionResult<TrimResult> {
    const scratch = makeScratchSession(session);
    return {commandLine: trimCommandLine(request), result: trimDisk(scratch, request)};
}

/**
 * Erase a floppy and make it an empty data disk.
 *
 * @param session the disk's session.
 * @param request what to make.
 */
export async function format(session: DiskSession, request: FormatFloppyRequest): Promise<ActionResult<void>> {
    return runAction(session, formatFloppyCommandLine(request), () => formatFloppy(session, request));
}

/**
 * What undo, redo or going to a history position did.
 */
export interface HistoryMoveResult {
    /** The labels of the entries that were undone or redone, in the order they were, or empty if nothing was. */
    labels: string[];
}

/**
 * Undo the latest change.
 *
 * @param session the disk's session.
 * @returns the label of what was undone, which is empty if there was nothing to undo.
 */
export function undo(session: DiskSession): ActionResult<HistoryMoveResult> {
    const label = session.undo();
    return {commandLine: "undo", result: {labels: label === undefined ? [] : [label]}};
}

/**
 * Redo the change that was last undone.
 *
 * @param session the disk's session.
 * @returns the label of what was redone, which is empty if there was nothing to redo.
 */
export function redo(session: DiskSession): ActionResult<HistoryMoveResult> {
    const label = session.redo();
    return {commandLine: "redo", result: {labels: label === undefined ? [] : [label]}};
}

/**
 * Put the disk back as it was when last saved. This is a change like any other, and can be undone.
 *
 * @param session the disk's session.
 * @returns whether anything was reverted.
 */
export function revert(session: DiskSession): ActionResult<boolean> {
    return {commandLine: revertCommandLine(), result: session.revert()};
}

/**
 * Undo or redo until a given number of history entries are applied. The command line has one "undo" or "redo"
 * per step, chained with " : " as on the CLI.
 *
 * @param session the disk's session.
 * @param position the number of entries to have applied, from 0 to the history's length.
 * @throws DiskError if the position is out of range.
 */
export function goToHistoryPosition(session: DiskSession, position: number): ActionResult<HistoryMoveResult> {
    const before = session.getHistory();
    session.goToHistoryPosition(position);

    // The entries between the old and new positions, in the order they were undone or redone.
    const undoing = position < before.position;
    const labels = undoing ? before.entries.slice(position, before.position).reverse() :
        before.entries.slice(before.position, position);
    const commandLine = labels.map(() => undoing ? "undo" : "redo").join(" : ");
    return {commandLine, result: {labels}};
}

/**
 * How to add host files. It's the engine's options, with the BASIC and date optional, and a way to take each
 * file's date from the file.
 */
export type AddActionOptions = Omit<AddOptions, "basic" | "date"> & {
    /** The BASIC to tokenize for, or undefined for the disk's own. */
    basic?: BasicDialect | undefined;
    /** The date for every file, or undefined for none. */
    date?: Date | undefined;
    /**
     * Whether each file gets its own File.lastModified as its date. It applies to the files that the explicit
     * date doesn't cover. The engine takes one date per call, so the files are added in one call per day, in one
     * undoable step, and the command line has one "add" per day.
     */
    useFileDates?: boolean | undefined;
};

/**
 * A host file as an {@link AddFileSource}, with the date that the browser says it was last modified.
 */
export interface HostFileSource extends AddFileSource {
    /** The file's modification time, in milliseconds since 1970. */
    lastModified: number;
}

/**
 * Whether an add source came from {@link planAddFiles}, and so has a modification time.
 */
function isHostFileSource(source: AddFileSource): source is HostFileSource {
    return typeof (source as Partial<HostFileSource>).lastModified === "number";
}

/**
 * The engine's options for an add.
 *
 * @param session the disk's session, for its BASIC.
 * @param options the page's options.
 */
function engineAddOptions(session: DiskSession, options: AddActionOptions): AddOptions {
    return {
        as: options.as,
        ascii: options.ascii,
        binary: options.binary,
        text: options.text,
        basic: options.basic ?? session.getBasicDialect(),
        system: options.system,
        invisible: options.invisible,
        overwrite: options.overwrite,
        date: options.date,
    };
}

/**
 * Work out what adding files would do, without changing anything.
 *
 * @param session the disk's session.
 * @param files the host files, in order.
 * @param options how to add them.
 * @throws DiskError for a problem with the whole request (see planAdd()).
 */
export async function planAddFiles(session: DiskSession, files: File[], options: AddActionOptions): Promise<AddPlanItem[]> {
    const sources: HostFileSource[] = [];
    for (const file of files) {
        sources.push({
            label: file.name,
            name: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
            lastModified: file.lastModified,
        });
    }

    return planAdd(session, sources, engineAddOptions(session, options));
}

/**
 * The groups of plan items that are added in one call each: all together unless useFileDates splits them by
 * the day they were last modified.
 *
 * @param plan the plan.
 * @param options the options.
 * @returns each group with the date its call gets, in order of first appearance.
 */
function groupPlanByDate(plan: AddPlanItem[], options: AddActionOptions): {date: Date | undefined, items: AddPlanItem[]}[] {
    if (options.useFileDates !== true || options.date !== undefined) {
        return [{date: options.date, items: plan}];
    }

    const groups = new Map<string, {date: Date | undefined, items: AddPlanItem[]}>();
    for (const item of plan) {
        const date = isHostFileSource(item.source) ? new Date(item.source.lastModified) : undefined;
        const key = date === undefined ? "" : formatYmd(date);
        let group = groups.get(key);
        if (group === undefined) {
            group = {date, items: []};
            groups.set(key, group);
        }
        group.items.push(item);
    }
    return [...groups.values()];
}

/**
 * Check a plan before anything is written, as addFiles() does for one call, so that a plan added in several
 * calls fails before the first rather than part way.
 *
 * @param plan the plan.
 * @param options the options.
 * @throws DiskError for the first problem.
 */
function checkPlan(plan: AddPlanItem[], options: AddActionOptions): void {
    for (const item of plan) {
        if (item.problem !== undefined) {
            throw new DiskError(item.problem);
        }
    }
    if (options.overwrite !== true) {
        for (const item of plan) {
            if (item.existingName !== undefined) {
                throw new DiskError(item.existingName + " is already on the disk (use --overwrite to replace it)");
            }
        }
    }
}

/**
 * Add the planned files to the disk, as one undoable step.
 *
 * @param session the disk's session.
 * @param plan the plan from {@link planAddFiles}, with no problems in it.
 * @param options the same options that the plan was made with.
 * @throws DiskError if an item has a problem, or the disk can't be written.
 */
export async function addPlanned(session: DiskSession, plan: AddPlanItem[],
                                 options: AddActionOptions): Promise<ActionResult<AddFilesResult>> {

    checkPlan(plan, options);
    const groups = groupPlanByDate(plan, options);
    const engineOptions = engineAddOptions(session, options);
    const commandOptions: AddCommandOptions = {...engineOptions, basic: options.basic};
    const commandLine = groups.map(group => addCommandLine(group.items.map(item => item.source.label),
        {...commandOptions, date: group.date})).join(" : ");

    const combined: AddFilesResult = {files: [], warnings: []};
    const positionBefore = session.getHistory().position;
    try {
        await session.runUndoable(commandLine, () => {
            for (const group of groups) {
                const added = addFiles(session, group.items, {...engineOptions, date: group.date});
                combined.files.push(...added.files);
                for (const warning of added.warnings) {
                    if (!combined.warnings.includes(warning)) {
                        combined.warnings.push(warning);
                    }
                }
            }
        });
    } catch (e) {
        // One call is all or nothing, but several aren't, so take back what an earlier day's call did.
        const partlyDone = groups.length > 1 && session.getHistory().position > positionBefore;
        if (partlyDone) {
            session.undo();
        }
        throw e;
    }

    return {commandLine, result: combined};
}
