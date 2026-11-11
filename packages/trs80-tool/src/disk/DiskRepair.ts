import type {DiskCommand} from "./DiskCommands.js";
import {findingToJson, type RepairResultJson} from "./DiskJson.js";
import {describeFixablePrograms, describeFreeableUnclaimed, repairDisk} from "trs80-disk";

/**
 * The "repair" command: fix the file system damage that "check" finds, where it can be fixed.
 */
export const REPAIR_COMMAND: DiskCommand = {
    spec: {
        name: "repair",
        aliases: [],
        args: "",
        summary: "fix the file system damage that check finds, where it can be fixed",
        options: [
            {
                name: "--free-unclaimed",
                valueName: undefined,
                description: "also free granules that the GAT marks used but no file claims (some programs keep " +
                    "data there; the boot cylinder and locked-out cylinders are never freed)",
            },
            {
                name: "--fix-program-sizes",
                valueName: undefined,
                description: "also set the size of programs whose transfer record is past their directory size, " +
                    "further into their last sector (the DOS loads them fine; this makes them copy whole)",
            },
        ],
    },

    endsSession: false,

    /**
     * Repair the disk, then say what was changed, what damage is left, and whether the disk can now be written.
     * It works on a disk that is damaged but otherwise sound, and refuses one that can't be written for any
     * other reason (an uncertain layout, say), since a repair writes to the same places as any other change.
     */
    run(session, command, globalOptions, out) {
        const freeUnclaimed = command.options.has("--free-unclaimed");
        const fixProgramSizes = command.options.has("--fix-program-sizes");

        const {repaired, damagedBefore, readOnlyReasonAfter} = repairDisk(session, {freeUnclaimed, fixProgramSizes});

        for (const line of repaired.changes) {
            out.line(line);
        }
        if (repaired.remaining.length > 0) {
            out.line(repaired.changes.length === 0 ? "Nothing could be repaired automatically." : "Not repaired:");
            for (const {finding, advice} of repaired.remaining) {
                out.line("  " + finding.message);
                out.line("    " + advice);
            }
        } else if (repaired.changes.length === 0) {
            out.line("Nothing to repair.");
        }
        const fixableProgramNames = repaired.fixablePrograms.map(file => file.getFilename("/"));
        if (repaired.freeableUnclaimed.length > 0) {
            out.line(describeFreeableUnclaimed(repaired.freeableUnclaimed.length));
        }
        if (repaired.fixablePrograms.length > 0) {
            out.line(describeFixablePrograms(fixableProgramNames));
        }

        // The gate is evaluated again, since the repair may have settled what blocked writing.
        if (damagedBefore) {
            out.line(readOnlyReasonAfter === undefined ? "The disk is now safe to write." :
                "The disk is still read-only: " + readOnlyReasonAfter);
        }

        const result: RepairResultJson = {
            changes: repaired.changes,
            remaining: repaired.remaining.map(({finding, advice}) => ({...findingToJson(finding), advice})),
            freeableUnclaimedGranules: repaired.freeableUnclaimed.length,
            fixablePrograms: fixableProgramNames,
            writable: readOnlyReasonAfter === undefined,
        };
        if (readOnlyReasonAfter !== undefined) {
            result.readOnlyReason = readOnlyReasonAfter;
        }
        out.result(result);
    },
};
