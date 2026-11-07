import {ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";

/**
 * The "partition" command: list the partitions of a hard disk, or choose the one that the other
 * commands work on.
 */
export const PARTITION_COMMAND: DiskCommand = {
    spec: {
        name: "partition",
        aliases: ["part"],
        args: "[N|NAME]",
        summary: "list the partitions of a hard disk, or choose the one the other commands work on",
        options: [],
        extraHelp: [
            "A hard disk holds one or more partitions, each with a file system of its own. With no argument, " +
                "this lists them with their numbers (from 1), where they are, their disk names, their DOS, their " +
                "number of files, and whether they can be written. With a number or a disk name (ignoring case), " +
                "the following commands work on that partition, until you choose another. " +
                "The same choice can be made with --partition before the first command.",
            "A disk with only one partition uses it without being told. With several, the commands that work " +
                "on files need one chosen, so that a file is never written to the wrong partition.",
            "This works on hard disks only, and changes nothing on the disk.",
        ],
    },

    endsSession: false,

    /**
     * With no argument, list the partitions. With one, select that partition and say so.
     *
     * @throws ToolError if the disk is a floppy, or the argument doesn't name exactly one partition.
     */
    run(session, command) {
        if (!session.isHardDisk()) {
            throw new ToolError("The disk is a floppy, which has no partitions");
        }

        const wanted = command.args[0];
        if (wanted === undefined) {
            const lines = session.describePartitionLines();
            if (lines.length === 0) {
                throw new ToolError("No LDOS, LS-DOS or DOSPLUS partitions were found on the disk");
            }
            for (const line of lines) {
                console.log(line);
            }
            return;
        }

        session.selectPartition(wanted);
        console.log("Working on partition " + session.selectedPartitionNumber + " (" +
            session.selectedPartitionName + ").");
    },
};
