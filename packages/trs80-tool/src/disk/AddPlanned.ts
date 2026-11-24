import {type AddOptions, type AddPlanItem, addFiles, DiskErrorKind, type DiskSession} from "trs80-disk";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskOutput} from "./DiskOutput.js";

/**
 * A file that "add" or "import" wants to put on the disk, and what became of it while planning.
 */
export interface PlannedEntry {
    /** What messages and the JSON call the file: the host path for "add", the name in the image for "import". */
    label: string;
    /** The plan for the file, or undefined if it was never planned (because it has a problem already). */
    item: AddPlanItem | undefined;
    /** Why the file can't be added, or undefined if it can (so far). */
    problem: string | undefined;
    /** What caused the problem, if it's not {@link DiskErrorKind.GENERAL}. Used when the problem stops the command. */
    problemKind?: DiskErrorKind | undefined;
}

/**
 * A file that addPlannedFiles() put on the disk.
 */
export interface PlannedAdded {
    /** The entry's label. */
    label: string;
    /** The plan for the file. */
    item: AddPlanItem;
    /** The file's name as the disk shows it, such as "HELLO/BAS". */
    name: string;
    /** The file's size in bytes. */
    size: number;
    /** Whether the file replaced one that was already on the disk. */
    replaced: boolean;
}

/**
 * A file that addPlannedFiles() skipped because of --keep-going.
 */
export interface PlannedSkipped {
    /** The entry's label. */
    label: string;
    /** Why the file wasn't added. */
    problem: string;
}

/**
 * Take the period off the end of a message, so that one can be added without doubling it.
 */
export function withoutFinalPeriod(text: string): string {
    return text.endsWith(".") ? text.substring(0, text.length - 1) : text;
}

/**
 * Whether an error from adding a file is about the whole disk (it can't be written), rather than about the
 * file, so that skipping the file and going on to the next wouldn't help.
 */
export function isWholeDiskError(e: ToolError): boolean {
    return e.kind === DiskErrorKind.READ_ONLY || e.kind === DiskErrorKind.WRITE_PROTECTED ||
        e.kind === DiskErrorKind.DAMAGED;
}

/**
 * A problem with one file that stops the whole command, with a hint about --keep-going if there are other
 * files that it could have added.
 *
 * @param problem the file's problem.
 * @param kind what caused it.
 * @param fileCount how many files were to be added.
 * @param verb what the command does with the files, such as "add" or "copy", for the hint.
 */
export function stoppingError(problem: string, kind: DiskErrorKind, fileCount: number, verb: string): ToolError {
    const hint = fileCount > 1 ? "; use --keep-going to " + verb + " the others" : "";
    return new ToolError(withoutFinalPeriod(problem) + hint, kind);
}

/**
 * Put the planned files on the disk, as "add" and "import" both do, and say what happened. Says what each
 * name becomes, then stops at the first file that can't be added (unless keepGoing says to skip it), then adds
 * the files (all in one change, or one at a time with keepGoing, so that those that fit still go in), then
 * prints what was converted, which files were added or replaced, which were skipped, and what the writer
 * warned about. The caller prints the result.
 *
 * @param session the open disk.
 * @param entries the files, in order, as planned.
 * @param addOptions the options that the plan was made with.
 * @param keepGoing whether to skip a file that can't be added, with a warning, instead of stopping.
 * @param verb what the command does with the files, such as "add" or "copy", for the hint about --keep-going.
 * @param out where the output goes.
 * @returns the files that were added or replaced, and those that were skipped, in order.
 * @throws ToolError for the first file that can't be added if keepGoing is false, or for a problem with the
 * whole disk.
 */
export function addPlannedFiles(session: DiskSession, entries: PlannedEntry[], addOptions: AddOptions,
                                keepGoing: boolean, verb: string, out: DiskOutput):
    {added: PlannedAdded[], skipped: PlannedSkipped[]} {

    // Say what the names become, then stop at the first file that can't be added (unless we're skipping them).
    const skipped: PlannedSkipped[] = [];
    const toAdd: {label: string, item: AddPlanItem}[] = [];
    for (const entry of entries) {
        const item = entry.item;
        if (item !== undefined && item.nameChanged) {
            out.line(item.source.name + " will be " + item.name + ".");
        }

        let problem = entry.problem;
        if (problem === undefined && item !== undefined && item.existingName !== undefined &&
            !addOptions.overwrite) {

            problem = item.existingName + " is already on the disk (use --overwrite to replace it)";
        }
        if (problem === undefined) {
            toAdd.push({label: entry.label, item: item!});
        } else if (keepGoing) {
            skipped.push({label: entry.label, problem});
        } else {
            throw stoppingError(problem, entry.problemKind ?? DiskErrorKind.GENERAL, entries.length, verb);
        }
    }

    // Add the files, all in one change unless we're skipping those that fail.
    const added: PlannedAdded[] = [];
    const warnings = new Set<string>();
    if (!keepGoing) {
        let result;
        try {
            result = addFiles(session, toAdd.map(entry => entry.item), addOptions);
        } catch (e) {
            if (e instanceof ToolError && !isWholeDiskError(e)) {
                throw stoppingError(e.message, e.kind, toAdd.length, verb);
            }
            throw e;
        }
        result.files.forEach((file, index) => added.push({label: toAdd[index].label, item: toAdd[index].item, ...file}));
        result.warnings.forEach(warning => warnings.add(warning));
    } else {
        for (const entry of toAdd) {
            try {
                // A failed call changes nothing, so the files that fit still go in.
                const result = addFiles(session, [entry.item], addOptions);
                added.push({label: entry.label, item: entry.item, ...result.files[0]});
                result.warnings.forEach(warning => warnings.add(warning));
            } catch (e) {
                // A problem with the whole disk (it can't be written) is not this file's.
                if (!(e instanceof ToolError) || isWholeDiskError(e)) {
                    throw e;
                }
                skipped.push({label: entry.label, problem: e.message});
            }
        }
    }

    for (const file of added) {
        for (const message of file.item.conversionMessages) {
            out.line(message);
        }
        out.line((file.replaced ? "Replaced " : "Added ") + file.name + " (" +
            pluralizeWithCount(file.size, "byte") + ").");
    }
    for (const skip of skipped) {
        // The problem names the file already.
        out.warning(withoutFinalPeriod(skip.problem) + "; skipped it.");
    }
    for (const warning of warnings) {
        out.warning(warning + ".");
    }
    return {added, skipped};
}
