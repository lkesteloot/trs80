import {HARD_DISK_FORMAT_DOSES} from "trs80-base";
import {
    addPartition, deletePartition, describeDriverSettings, describeFreeSpaceLines, DiskSession,
} from "trs80-disk";
import {ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {parseAddDate, parseCountOption, parseModelOption, type ParsedDiskCommand} from "./DiskCommandParser.js";
import {formatDosHelpLines, parseFormatDosName} from "./DiskHelp.js";

/**
 * The options that only "partition --add" takes.
 */
const ADD_ONLY_OPTIONS = [
    "--cylinders", "--heads", "--start-cylinder", "--start-head", "--name", "--date", "--model", "--granules",
];

/**
 * Do "partition --add DOS": find room for a partition, format it, and select it.
 *
 * @param session the session.
 * @param command the parsed command, whose one argument is the DOS.
 * @throws ToolError if the DOS or an option is bad, there's no room, or the disk can't be written.
 */
function addPartitionFromCommand(session: DiskSession, command: ParsedDiskCommand): void {
    const options = command.options;
    if (command.args.length === 0) {
        throw new ToolError("partition --add needs a DOS to format the partition for. The DOSes are:\n" +
            formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
    }
    if (command.args.length > 1) {
        throw new ToolError("partition --add takes one DOS and no partition");
    }
    const dateText = options.getString("--date");
    const result = addPartition(session, {
        dos: parseFormatDosName(command.args[0], HARD_DISK_FORMAT_DOSES),
        placement: {
            cylinders: parseCountOption(options, "--cylinders"),
            heads: parseCountOption(options, "--heads"),
            startCylinder: parseCountOption(options, "--start-cylinder"),
            startHead: parseCountOption(options, "--start-head"),
        },
        granulesPerCylinder: parseCountOption(options, "--granules"),
        name: options.getString("--name"),
        date: dateText === undefined ? undefined : parseAddDate(dateText),
        model: parseModelOption(options),
        force: options.has("--force"),
    });
    const added = result.partition;
    console.log("Added partition " + result.number + ", " + added.diskName + ": " + added.partition.describeLocation() +
        ", " + added.trsdos.nameAndVersion + ", directory on cylinder " + added.trsdos.dirLumpNumber + ".");
    for (const line of describeDriverSettings(session.hardDisk.getGeometry(), [{number: result.number, partition: added}])) {
        console.log(line);
    }
}

/**
 * Do "partition --delete [N|NAME]": erase a partition so that its space is free.
 *
 * @param session the session.
 * @param command the parsed command, whose argument, if any, names the partition.
 * @throws ToolError if no partition is named or selected, it has files and there's no --force, or the disk
 * can't be written.
 */
function deletePartitionFromCommand(session: DiskSession, command: ParsedDiskCommand): void {
    if (command.args.length > 1) {
        throw new ToolError("partition --delete takes at most one partition");
    }

    const result = deletePartition(session, command.args[0], command.options.has("--force"));
    const renumbered = result.renumbered ? " The partitions after it are renumbered." : "";
    console.log("Deleted " + result.label + ". Its space (" + result.location + ") is free." + renumbered);
}

/**
 * The "partition" command: list the partitions of a hard disk, choose the one that the other commands work
 * on, or add or delete one.
 */
export const PARTITION_COMMAND: DiskCommand = {
    spec: {
        name: "partition",
        aliases: ["part"],
        args: "[N|NAME|DOS]",
        summary: "list, choose, add or delete the partitions of a hard disk",
        options: [
            {
                name: "--add",
                valueName: undefined,
                description: "make a new partition formatted for the DOS given as the argument, in free space",
            },
            {
                name: "--delete",
                valueName: undefined,
                description: "erase the partition given as the argument (default: the chosen one), freeing its space",
            },
            {
                name: "--cylinders",
                valueName: "N",
                description: "with --add, the partition's cylinders (35 to 203; default: the rest of the free block, " +
                    "at most 203)",
            },
            {
                name: "--heads",
                valueName: "N",
                description: "with --add, the partition's heads (default: all the disk's, or 1 if --start-head is given)",
            },
            {
                name: "--start-cylinder",
                valueName: "N",
                description: "with --add, the first cylinder (default: the first free block)",
            },
            {
                name: "--start-head",
                valueName: "N",
                description: "with --add, the first head; this makes a partition by head (default: the first free head)",
            },
            {
                name: "--name",
                valueName: "NAME",
                description: "with --add, the disk's name, up to 8 letters and digits starting with a letter " +
                    "(default: HARD and the first free letter, HARDA to HARDZ)",
            },
            {
                name: "--date",
                valueName: "YYYY-MM-DD",
                description: "with --add, the date to put on the partition (default: today)",
            },
            {
                name: "--model",
                valueName: "1|3|4",
                description: "with --add, the TRS-80 the partition is for, which picks ldos-5.3's boot sector: " +
                    "the Model I's for 1, else the Model III's",
            },
            {
                name: "--granules",
                valueName: "N",
                description: "with --add, the granules in each cylinder, 1 to 8 (default: granules of the smallest power " +
                    "of two sectors that is at least 4 per head, at most 32; Tandy's installer uses 2 per head, up to 4 heads)",
            },
            {
                name: "--force",
                valueName: undefined,
                description: "with --delete, delete a partition that has files; with --add, format over space that " +
                    "isn't blank; either way, write to a write-protected image",
            },
        ],
        extraHelp: [
            "A hard disk holds one or more partitions, each with a file system of its own. With no argument, " +
                "this lists them with their numbers (from 1), where they are, their disk names, their DOS, their " +
                "number of files, and whether they can be written, then the free space that no partition uses. " +
                "With a number or a disk name (ignoring case), the following commands work on that partition, " +
                "until you choose another. The same choice can be made with --partition before the first command.",
            "A disk with only one partition uses it without being told. With several, the commands that work " +
                "on files need one chosen, so that a file is never written to the wrong partition.",
            "--add DOS finds the free space, formats a partition in it as an empty data partition for the DOS " +
                "(ldos-5.3 or lsdos-6.3), and chooses it. A disk is split one of two ways, which the partitions " +
                "already on it decide: by cylinder (every partition uses all the disk's heads, over a run of " +
                "cylinders; the default), or by head (every partition has the same cylinders from cylinder 0, " +
                "normally all the disk's or the first 203, over a run of heads; --heads less than the disk's, or " +
                "--start-head, asks for it). The two can't be mixed. A partition that uses the whole disk is " +
                "alone on it.",
            "An HDV file has no partition table, so a DOS finds only the partitions that its hard disk driver " +
                "was configured for. After --add, this prints the settings to configure the driver with.",
            "--delete erases the partition, so its space is free and the partitions after it are renumbered. " +
                "Like the other changes to the disk, it can be taken back with undo until the disk is saved.",
            "This works on hard disks only.",
        ],
    },

    endsSession: false,

    /**
     * With no argument, list the partitions and the free space. With one, select that partition and say so,
     * or with --add or --delete, make or erase one.
     *
     * @throws ToolError if the disk is a floppy, the options don't make sense together, or the argument doesn't
     * name exactly one partition.
     */
    run(session, command) {
        if (!session.isHardDisk()) {
            throw new ToolError("The disk is a floppy, which has no partitions");
        }

        const options = command.options;
        const adding = options.has("--add");
        const deleting = options.has("--delete");
        if (adding && deleting) {
            throw new ToolError("--add and --delete can't be used together");
        }
        if (!adding) {
            const stray = ADD_ONLY_OPTIONS.find(name => options.has(name));
            if (stray !== undefined) {
                throw new ToolError(stray + " only applies with --add");
            }
        }
        if (options.has("--force") && !adding && !deleting) {
            throw new ToolError("--force only applies with --add or --delete");
        }

        if (adding) {
            addPartitionFromCommand(session, command);
            return;
        }
        if (deleting) {
            deletePartitionFromCommand(session, command);
            return;
        }
        if (command.args.length > 1) {
            throw new ToolError("partition takes one partition number or name");
        }

        const wanted = command.args[0];
        if (wanted === undefined) {
            const lines = session.describePartitionLines();
            const freeLines = describeFreeSpaceLines(session.hardDisk.getGeometry(), session.getPartitions());
            for (const line of [...lines, ...freeLines]) {
                console.log(line);
            }
            return;
        }

        session.selectPartition(wanted);
        console.log("Working on partition " + session.selectedPartitionNumber + " (" +
            session.selectedPartitionName + ").");
    },
};
