import {
    erasePartition, formatLdosPartition, HARD_DISK_FORMAT_DOSES, hardDiskDosProblem, PARTITION_MAX_CYLINDERS,
    PARTITION_MIN_CYLINDERS,
} from "trs80-base";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {parseAddDate, parseCountOption, parseModelOption, type ParsedDiskCommand} from "./DiskCommandParser.js";
import {formatDosHelpLines, parseFormatDosName} from "./DiskHelp.js";
import {
    blocksOverlap, byHeadCylinderCount, chooseDefaultPartitionName, classifySplit, describeBlock, describeDriverSettings, describeFreeSpaceLines, DiskSession, DiskSplit, findFreeBlocks, type HardDiskBlock, isBlockBlank, partitionBlock, type PartitionLocation,
} from "trs80-disk";
import {getHardDiskBootSectors} from "./DiskTemplates.js";

/**
 * The options that only "partition --add" takes.
 */
const ADD_ONLY_OPTIONS = [
    "--cylinders", "--heads", "--start-cylinder", "--start-head", "--name", "--date", "--model", "--granules",
];

/**
 * What the user asked for with "partition --add".
 */
interface AddRequest {
    /** The number of cylinders (--cylinders), or undefined to use the free block's. */
    cylinders: number | undefined;
    /** The number of heads (--heads), or undefined for the default. */
    heads: number | undefined;
    /** The first cylinder (--start-cylinder), or undefined to use the first free block. */
    startCylinder: number | undefined;
    /** The first head (--start-head), or undefined to use the first free block. */
    startHead: number | undefined;
}

/**
 * The most cylinders that a partition by head can have, and so the most that a disk split that way can have.
 */
const BY_HEAD_MIN_CYLINDERS = PARTITION_MIN_CYLINDERS;
const BY_HEAD_MAX_CYLINDERS = PARTITION_MAX_CYLINDERS;

/**
 * Describe the free blocks for an error message, such as "Free space: cylinders 310-839, heads 0-5." or
 * "There is no free space."
 */
function describeFreeBlocks(blocks: readonly HardDiskBlock[]): string {
    if (blocks.length === 0) {
        return "There is no free space.";
    }
    return "Free space: " + blocks.map(describeBlock).join("; ") + ".";
}

/**
 * The error for a block that would overlap a partition.
 *
 * @param session the session.
 * @param block the block that was asked for.
 * @param freeBlocks the free space, to tell the user about.
 */
function makeOverlapError(session: DiskSession, block: HardDiskBlock, freeBlocks: readonly HardDiskBlock[]): ToolError {
    const partitions = session.getPartitions();
    const index = partitions.findIndex(p => blocksOverlap(block, partitionBlock(p)));
    const who = index < 0 ? "a partition" : "partition " + (index + 1) + " (" + partitions[index].diskName + ")";
    return new ToolError("The new partition (" + describeBlock(block) + ") would overlap " + who + ". " +
        describeFreeBlocks(freeBlocks));
}

/**
 * Work out where a new partition goes, from what the user asked for and what's free.
 *
 * @param session the session, whose disk is a hard disk.
 * @param request what the user asked for.
 * @return the block for the new partition.
 * @throws ToolError saying why there's no such place.
 */
function chooseNewPartitionBlock(session: DiskSession, request: AddRequest): HardDiskBlock {
    const geometry = session.hardDisk.getGeometry();
    const blocks = session.getPartitions().map(partitionBlock);
    const split = classifySplit(geometry, blocks);
    if (split === DiskSplit.UNKNOWN) {
        throw new ToolError("Can't work out the free space: the partitions on the disk follow neither a split by " +
            "cylinder (every partition uses all " + geometry.headCount + " heads) nor a split by head (every " +
            "partition starts at cylinder 0 with the same number of cylinders).\n" +
            session.describePartitionLines().join("\n"));
    }
    const freeBlocks = findFreeBlocks(geometry, blocks, split);

    if (request.heads !== undefined && request.heads > geometry.headCount) {
        throw new ToolError("The disk has " + pluralizeWithCount(geometry.headCount, "head") + ", not " + request.heads);
    }
    const byHead = request.startHead !== undefined || (request.heads !== undefined && request.heads < geometry.headCount);

    if (byHead) {
        // Partitions by head all start at cylinder 0 and have the same cylinders: those of the partitions
        // already on the disk, or for the first, what was asked for or as many as a partition can have.
        if (split === DiskSplit.BY_CYLINDER) {
            throw new ToolError("The disk's partitions are split by cylinder, so a partition by head can't be added " +
                "(it would mix the two kinds). " + describeFreeBlocks(freeBlocks));
        }
        if (request.startCylinder !== undefined && request.startCylinder !== 0) {
            throw new ToolError("A partition by head starts at cylinder 0, not " + request.startCylinder +
                ". Leave out --start-cylinder.");
        }
        let cylinderCount: number;
        if (split === DiskSplit.BY_HEAD) {
            cylinderCount = byHeadCylinderCount(blocks);
            if (request.cylinders !== undefined && request.cylinders !== cylinderCount) {
                throw new ToolError("The disk's partitions by head each have " + cylinderCount + " cylinders, and a " +
                    "new one must too, not " + request.cylinders + ". Leave out --cylinders.");
            }
        } else {
            cylinderCount = request.cylinders ?? Math.min(geometry.cylinderCount, BY_HEAD_MAX_CYLINDERS);
            if (cylinderCount < BY_HEAD_MIN_CYLINDERS || cylinderCount > BY_HEAD_MAX_CYLINDERS ||
                cylinderCount > geometry.cylinderCount) {

                throw new ToolError("A partition has " + BY_HEAD_MIN_CYLINDERS + " to " + BY_HEAD_MAX_CYLINDERS +
                    " cylinders, and this disk has " + pluralizeWithCount(geometry.cylinderCount, "cylinder") +
                    ", so a partition by head can't have " + cylinderCount + ".");
            }
        }

        const heads = request.heads ?? 1;
        if (request.startHead !== undefined) {
            const block = {cylinderOffset: 0, headOffset: request.startHead, cylinderCount, headCount: heads};
            if (block.headOffset + block.headCount > geometry.headCount) {
                throw new ToolError("Heads " + block.headOffset + " to " + (block.headOffset + block.headCount - 1) +
                    " don't fit on a disk of " + pluralizeWithCount(geometry.headCount, "head"));
            }
            if (blocks.some(b => blocksOverlap(block, b))) {
                throw makeOverlapError(session, block, freeBlocks);
            }
            return block;
        }

        const free = freeBlocks.find(b => b.headCount >= heads);
        if (free === undefined) {
            throw new ToolError("There is no free space for " + pluralizeWithCount(heads, "head") + ". " +
                describeFreeBlocks(freeBlocks));
        }
        return {cylinderOffset: 0, headOffset: free.headOffset, cylinderCount, headCount: heads};
    }

    // Partitions by cylinder each use all the disk's heads.
    if (split === DiskSplit.BY_HEAD) {
        throw new ToolError("The disk's partitions are split by head, so a partition by cylinder can't be added " +
            "(it would mix the two kinds). Give --heads or --start-head to add one by head. " +
            describeFreeBlocks(freeBlocks));
    }
    if (request.startCylinder !== undefined) {
        const startCylinder = request.startCylinder;
        let cylinders = request.cylinders;
        if (cylinders === undefined) {
            // The rest of the free block that holds the start, up to the most that a partition has.
            const free = freeBlocks.find(b => b.cylinderOffset <= startCylinder &&
                startCylinder < b.cylinderOffset + b.cylinderCount);
            if (free === undefined) {
                const asked = {cylinderOffset: startCylinder, headOffset: 0, cylinderCount: 1, headCount: geometry.headCount};
                if (startCylinder >= geometry.cylinderCount) {
                    throw new ToolError("Cylinder " + startCylinder + " is past the end of the disk, which has " +
                        pluralizeWithCount(geometry.cylinderCount, "cylinder"));
                }
                throw makeOverlapError(session, asked, freeBlocks);
            }
            cylinders = Math.min(free.cylinderOffset + free.cylinderCount - startCylinder, PARTITION_MAX_CYLINDERS);
        }

        const block = {cylinderOffset: startCylinder, headOffset: 0, cylinderCount: cylinders, headCount: geometry.headCount};
        if (block.cylinderOffset + block.cylinderCount > geometry.cylinderCount) {
            throw new ToolError("Cylinders " + startCylinder + " to " + (startCylinder + cylinders - 1) + " don't fit " +
                "on a disk of " + pluralizeWithCount(geometry.cylinderCount, "cylinder"));
        }
        if (blocks.some(b => blocksOverlap(block, b))) {
            throw makeOverlapError(session, block, freeBlocks);
        }
        return block;
    }

    // The first free block that has room for the cylinders asked for, or for a partition of the fewest.
    const needed = request.cylinders ?? PARTITION_MIN_CYLINDERS;
    const free = freeBlocks.find(b => b.cylinderCount >= needed);
    if (free === undefined) {
        throw new ToolError("There is no free block of " + pluralizeWithCount(needed, "cylinder") +
            (request.cylinders === undefined ? " or more, the fewest that a partition has" : "") + ". " +
            describeFreeBlocks(freeBlocks));
    }
    return {
        cylinderOffset: free.cylinderOffset,
        headOffset: 0,
        cylinderCount: request.cylinders ?? Math.min(free.cylinderCount, PARTITION_MAX_CYLINDERS),
        headCount: geometry.headCount,
    };
}

/**
 * The location of the selected partition, to keep it selected through a change.
 */
function selectedLocation(session: DiskSession): PartitionLocation | undefined {
    const number = session.selectedPartitionNumber;
    if (number === undefined) {
        return undefined;
    }
    const partition = session.getPartitions()[number - 1].partition;
    return {cylinderOffset: partition.cylinderOffset, headOffset: partition.headOffset};
}

/**
 * Do "partition --add DOS": find room for a partition, format it, and select it.
 *
 * @param session the session.
 * @param command the parsed command, whose one argument is the DOS.
 * @throws ToolError if the DOS or an option is bad, there's no room, or the disk can't be written.
 */
function addPartition(session: DiskSession, command: ParsedDiskCommand): void {
    const options = command.options;
    if (command.args.length === 0) {
        throw new ToolError("partition --add needs a DOS to format the partition for. The DOSes are:\n" +
            formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
    }
    if (command.args.length > 1) {
        throw new ToolError("partition --add takes one DOS and no partition");
    }
    const dos = parseFormatDosName(command.args[0], HARD_DISK_FORMAT_DOSES);
    const dosProblem = hardDiskDosProblem(dos);
    if (dosProblem !== undefined) {
        throw new ToolError(dosProblem);
    }

    const dateText = options.getString("--date");
    const model = parseModelOption(options);
    const granulesPerCylinder = parseCountOption(options, "--granules");
    const block = chooseNewPartitionBlock(session, {
        cylinders: parseCountOption(options, "--cylinders"),
        heads: parseCountOption(options, "--heads"),
        startCylinder: parseCountOption(options, "--start-cylinder"),
        startHead: parseCountOption(options, "--start-head"),
    });
    const date = dateText === undefined ? undefined : parseAddDate(dateText);

    let name = options.getString("--name");
    if (name === undefined) {
        name = chooseDefaultPartitionName(session.getPartitions().map(p => p.diskName));
        if (name === undefined) {
            throw new ToolError("All the names HARDA to HARDZ are taken; give one with --name");
        }
    }

    // Space with data in it that isn't an LDOS partition of ours (another DOS's, say) is formatted over only
    // if the user says so, since there's no telling from the disk whether it's free.
    const hardDisk = session.hardDisk;
    if (!options.has("--force") && !isBlockBlank(hardDisk, block)) {
        throw new ToolError("The space for the new partition (" + describeBlock(block) + ") isn't blank. It may " +
            "hold data of another kind of partition, which formatting would destroy; use --force to format over it.");
    }

    const location = {cylinderOffset: block.cylinderOffset, headOffset: block.headOffset};
    session.changeHardDisk(disk => {
        const message = formatLdosPartition(disk, {
            dos,
            startCylinder: block.cylinderOffset,
            startHead: block.headOffset,
            cylinders: block.cylinderCount,
            heads: block.headCount,
            granulesPerCylinder,
            name,
            date,
            bootSectors: getHardDiskBootSectors(dos, model),
        });
        if (message !== undefined) {
            throw new ToolError(message);
        }
    }, location, options.has("--force"));

    const partitions = session.getPartitions();
    const index = partitions.findIndex(p => p.partition.cylinderOffset === location.cylinderOffset &&
        p.partition.headOffset === location.headOffset);
    if (index < 0) {
        throw new ToolError("The partition was written but isn't found on the disk afterward, so something is wrong; " +
            "use \"undo\" to take it back");
    }
    const added = partitions[index];
    console.log("Added partition " + (index + 1) + ", " + added.diskName + ": " + added.partition.describeLocation() +
        ", " + added.trsdos.nameAndVersion + ", directory on cylinder " + added.trsdos.dirLumpNumber + ".");
    for (const line of describeDriverSettings(hardDisk.getGeometry(), [{number: index + 1, partition: added}])) {
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
function deletePartition(session: DiskSession, command: ParsedDiskCommand): void {
    if (command.args.length > 1) {
        throw new ToolError("partition --delete takes at most one partition");
    }
    const options = command.options;
    const force = options.has("--force");

    let number: number;
    if (command.args.length === 1) {
        number = session.findPartitionNumber(command.args[0]);
    } else {
        const selected = session.selectedPartitionNumber;
        if (selected === undefined) {
            throw new ToolError("No partition is selected: name the one to delete (partition --delete N|NAME), " +
                "or choose one with the \"partition\" command first.\n" +
                session.describePartitionLines().join("\n"));
        }
        number = selected;
    }

    const partitions = session.getPartitions();
    const target = partitions[number - 1];
    const label = "partition " + number + " (" + (target.diskName === "" ? "no name" : target.diskName) + ")";
    const userFiles = target.trsdos.getDirEntries(false).length;
    if (userFiles > 0 && !force) {
        throw new ToolError("The " + label + " has " + pluralizeWithCount(userFiles, "file") +
            "; use --force to delete it.");
    }

    // Keep the selection unless it's the partition that goes away.
    const keep = session.selectedPartitionNumber === number ? undefined : selectedLocation(session);
    session.changeHardDisk(() => {
        try {
            erasePartition(target.partition);
        } catch (e) {
            throw new ToolError(e instanceof Error ? e.message : String(e));
        }
    }, keep, force);

    const renumbered = number <= session.getPartitions().length ?
        " The partitions after it are renumbered." : "";
    console.log("Deleted " + label + ". Its space (" + target.partition.describeLocation() + ") is free." + renumbered);
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
            addPartition(session, command);
            return;
        }
        if (deleting) {
            deletePartition(session, command);
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
