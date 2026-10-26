import {type TrsdosRepairResult, TrsdosWriteAccess} from "trs80-base";
import {assertNever} from "z80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {DiskWritePurpose} from "./DiskSession.js";

/**
 * The "repair" command: fix the file system damage that "check" finds, where it can be fixed.
 */
export const REPAIR_COMMAND: DiskCommand = {
    spec: {
        name: "repair",
        aliases: [],
        usage: "[--free-unclaimed]",
        summary: "fix the file system damage that check finds, where it can be fixed",
        minArgs: 0,
        maxArgs: 0,
        options: [
            {
                name: "--free-unclaimed",
                valueName: undefined,
                description: "also free granules that the GAT marks used but no file claims (some programs keep " +
                    "data there; the boot cylinder and locked-out cylinders are never freed)",
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
            result = writer.repair({freeUnclaimed});
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

        // The gate is evaluated again, since the repair may have settled what blocked writing.
        if (damagedBefore) {
            const readOnlyReason = session.getReadOnlyReason();
            console.log(readOnlyReason === undefined ? "The disk is now safe to write." :
                "The disk is still read-only: " + readOnlyReason);
        }
    },
};
