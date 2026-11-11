import {type TrsdosRepairResult, TrsdosWriteAccess} from "trs80-base";
import {assertNever} from "z80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {DiskWritePurpose} from "trs80-disk";

// The most program names to list before saying "and N more".
const MAX_PROGRAMS_SHOWN = 4;

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
    run(session, command) {
        const freeUnclaimed = command.options.has("--free-unclaimed");
        const fixProgramSizes = command.options.has("--fix-program-sizes");

        // A disk that is unreadable for any reason but damage can't be repaired, --force or not.
        const gate = session.getWriteGate();
        if (session.fileSystem !== undefined && gate === undefined) {
            throw new ToolError("Repairing " + session.fileSystem.nameAndVersion + " disks isn't supported yet");
        }
        const damagedBefore = gate?.access === TrsdosWriteAccess.REPAIR_ONLY;
        if (gate !== undefined) {
            switch (gate.access) {
                case TrsdosWriteAccess.WRITABLE:
                case TrsdosWriteAccess.REPAIR_ONLY:
                    break;
                case TrsdosWriteAccess.READ_ONLY:
                    throw new ToolError("Can't repair this disk: " + session.getReadOnlyReason());
                default:
                    assertNever(gate.access);
            }
        }

        let result = undefined as TrsdosRepairResult | undefined;
        session.changeTrsdos(DiskWritePurpose.REPAIR, writer => {
            result = writer.repair({freeUnclaimed, fixProgramSizes});
        });
        if (result === undefined) {
            throw new Error("The repair didn't run");
        }
        const repaired: TrsdosRepairResult = result;

        for (const line of repaired.changes) {
            console.log(line);
        }
        if (repaired.remaining.length > 0) {
            console.log(repaired.changes.length === 0 ? "Nothing could be repaired automatically." : "Not repaired:");
            for (const {finding, advice} of repaired.remaining) {
                console.log("  " + finding.message);
                console.log("    " + advice);
            }
        } else if (repaired.changes.length === 0) {
            console.log("Nothing to repair.");
        }
        if (repaired.freeableUnclaimed.length > 0) {
            console.log(pluralizeWithCount(repaired.freeableUnclaimed.length, "granule") + " " +
                (repaired.freeableUnclaimed.length === 1 ? "is" : "are") + " marked used but no file claims " +
                (repaired.freeableUnclaimed.length === 1 ? "it" : "them") + ". Use --free-unclaimed to free " +
                (repaired.freeableUnclaimed.length === 1 ? "it" : "them") +
                ", unless a program keeps data there.");
        }
        if (repaired.fixablePrograms.length > 0) {
            const names = repaired.fixablePrograms.map(file => file.getFilename("/"));
            const shown = names.slice(0, MAX_PROGRAMS_SHOWN);
            const hidden = names.length - shown.length;
            const list = hidden > 0 ? shown.join(", ") + ", and " + hidden.toLocaleString() + " more" :
                shown.length <= 1 ? shown.join("") : shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1];
            const one = names.length === 1;
            console.log(pluralizeWithCount(names.length, "program") + (one ? " runs" : " run") +
                " past " + (one ? "its" : "their") + " directory size: " + list + ". Use --fix-program-sizes to set " +
                (one ? "its size" : "their sizes") + ".");
        }

        // The gate is evaluated again, since the repair may have settled what blocked writing.
        if (damagedBefore) {
            const readOnlyReason = session.getReadOnlyReason();
            console.log(readOnlyReason === undefined ? "The disk is now safe to write." :
                "The disk is still read-only: " + readOnlyReason);
        }
    },
};
