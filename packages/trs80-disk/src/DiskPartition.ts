import {
    erasePartition, formatLdosPartition, hardDiskDosProblem, type LdosPartition, PARTITION_MAX_CYLINDERS,
    PARTITION_MIN_CYLINDERS, type TrsdosFormatDos,
} from "trs80-base";
import {
    blocksOverlap, byHeadCylinderCount, chooseDefaultPartitionName, classifySplit, describeBlock, DiskSplit,
    findFreeBlocks, type HardDiskBlock, isBlockBlank, partitionBlock,
} from "./DiskHardLayout.js";
import {DiskError} from "./DiskError.js";
import {DiskSession, type PartitionLocation} from "./DiskSession.js";
import {getHardDiskBootSectors} from "./DiskTemplates.js";
import {pluralizeWithCount} from "./Plural.js";

// The operations behind the "partition" command on a hard disk: choosing where a new partition goes, adding one,
// and deleting one. (Listing and selecting partitions are methods of DiskSession.)

/**
 * Where the user wants a new partition, with what they left out undefined.
 */
export interface PartitionPlacement {
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
function makeOverlapError(session: DiskSession, block: HardDiskBlock, freeBlocks: readonly HardDiskBlock[]): DiskError {
    const partitions = session.getPartitions();
    const index = partitions.findIndex(p => blocksOverlap(block, partitionBlock(p)));
    const who = index < 0 ? "a partition" : "partition " + (index + 1) + " (" + partitions[index].diskName + ")";
    return new DiskError("The new partition (" + describeBlock(block) + ") would overlap " + who + ". " +
        describeFreeBlocks(freeBlocks));
}

/**
 * Work out where a new partition goes, from what the user asked for and what's free.
 *
 * @param session the session, whose disk is a hard disk.
 * @param request what the user asked for.
 * @return the block for the new partition.
 * @throws DiskError saying why there's no such place.
 */
export function choosePartitionBlock(session: DiskSession, request: PartitionPlacement): HardDiskBlock {
    const geometry = session.hardDisk.getGeometry();
    const blocks = session.getPartitions().map(partitionBlock);
    const split = classifySplit(geometry, blocks);
    if (split === DiskSplit.UNKNOWN) {
        throw new DiskError("Can't work out the free space: the partitions on the disk follow neither a split by " +
            "cylinder (every partition uses all " + geometry.headCount + " heads) nor a split by head (every " +
            "partition starts at cylinder 0 with the same number of cylinders).\n" +
            session.describePartitionLines().join("\n"));
    }
    const freeBlocks = findFreeBlocks(geometry, blocks, split);

    if (request.heads !== undefined && request.heads > geometry.headCount) {
        throw new DiskError("The disk has " + pluralizeWithCount(geometry.headCount, "head") + ", not " + request.heads);
    }
    const byHead = request.startHead !== undefined || (request.heads !== undefined && request.heads < geometry.headCount);

    if (byHead) {
        // Partitions by head all start at cylinder 0 and have the same cylinders: those of the partitions
        // already on the disk, or for the first, what was asked for or as many as a partition can have.
        if (split === DiskSplit.BY_CYLINDER) {
            throw new DiskError("The disk's partitions are split by cylinder, so a partition by head can't be added " +
                "(it would mix the two kinds). " + describeFreeBlocks(freeBlocks));
        }
        if (request.startCylinder !== undefined && request.startCylinder !== 0) {
            throw new DiskError("A partition by head starts at cylinder 0, not " + request.startCylinder +
                ". Leave out --start-cylinder.");
        }
        let cylinderCount: number;
        if (split === DiskSplit.BY_HEAD) {
            cylinderCount = byHeadCylinderCount(blocks);
            if (request.cylinders !== undefined && request.cylinders !== cylinderCount) {
                throw new DiskError("The disk's partitions by head each have " + cylinderCount + " cylinders, and a " +
                    "new one must too, not " + request.cylinders + ". Leave out --cylinders.");
            }
        } else {
            cylinderCount = request.cylinders ?? Math.min(geometry.cylinderCount, BY_HEAD_MAX_CYLINDERS);
            if (cylinderCount < BY_HEAD_MIN_CYLINDERS || cylinderCount > BY_HEAD_MAX_CYLINDERS ||
                cylinderCount > geometry.cylinderCount) {

                throw new DiskError("A partition has " + BY_HEAD_MIN_CYLINDERS + " to " + BY_HEAD_MAX_CYLINDERS +
                    " cylinders, and this disk has " + pluralizeWithCount(geometry.cylinderCount, "cylinder") +
                    ", so a partition by head can't have " + cylinderCount + ".");
            }
        }

        const heads = request.heads ?? 1;
        if (request.startHead !== undefined) {
            const block = {cylinderOffset: 0, headOffset: request.startHead, cylinderCount, headCount: heads};
            if (block.headOffset + block.headCount > geometry.headCount) {
                throw new DiskError("Heads " + block.headOffset + " to " + (block.headOffset + block.headCount - 1) +
                    " don't fit on a disk of " + pluralizeWithCount(geometry.headCount, "head"));
            }
            if (blocks.some(b => blocksOverlap(block, b))) {
                throw makeOverlapError(session, block, freeBlocks);
            }
            return block;
        }

        const free = freeBlocks.find(b => b.headCount >= heads);
        if (free === undefined) {
            throw new DiskError("There is no free space for " + pluralizeWithCount(heads, "head") + ". " +
                describeFreeBlocks(freeBlocks));
        }
        return {cylinderOffset: 0, headOffset: free.headOffset, cylinderCount, headCount: heads};
    }

    // Partitions by cylinder each use all the disk's heads.
    if (split === DiskSplit.BY_HEAD) {
        throw new DiskError("The disk's partitions are split by head, so a partition by cylinder can't be added " +
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
                    throw new DiskError("Cylinder " + startCylinder + " is past the end of the disk, which has " +
                        pluralizeWithCount(geometry.cylinderCount, "cylinder"));
                }
                throw makeOverlapError(session, asked, freeBlocks);
            }
            cylinders = Math.min(free.cylinderOffset + free.cylinderCount - startCylinder, PARTITION_MAX_CYLINDERS);
        }

        const block = {cylinderOffset: startCylinder, headOffset: 0, cylinderCount: cylinders, headCount: geometry.headCount};
        if (block.cylinderOffset + block.cylinderCount > geometry.cylinderCount) {
            throw new DiskError("Cylinders " + startCylinder + " to " + (startCylinder + cylinders - 1) + " don't fit " +
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
        throw new DiskError("There is no free block of " + pluralizeWithCount(needed, "cylinder") +
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
 * What the user asked "partition --add" to make.
 */
export interface AddPartitionRequest {
    /** The DOS to format the partition for, which must be one that hard disks can have. */
    dos: TrsdosFormatDos;
    /** Where the user wants the partition (see {@link choosePartitionBlock}). */
    placement: PartitionPlacement;
    /** The granules in each cylinder (--granules), or undefined for the default. */
    granulesPerCylinder: number | undefined;
    /** The disk's name (--name), or undefined for HARD and the first free letter. */
    name: string | undefined;
    /** The date to put on the partition (--date), or undefined for today. */
    date: Date | undefined;
    /** The TRS-80 model, which chooses the boot sector (--model). */
    model: 1 | 3 | 4 | undefined;
    /** Whether to format over space that isn't blank, and write to a write-protected image (--force). */
    force: boolean;
}

/**
 * What addPartition() did.
 */
export interface AddPartitionResult {
    /** The new partition's number, from 1. */
    number: number;
    /** The new partition, as found on the disk afterward. */
    partition: LdosPartition;
}

/**
 * Do "partition --add DOS": find room for a partition where the user asked (see {@link choosePartitionBlock}),
 * format it, and select it.
 *
 * @param session the session, whose disk is a hard disk.
 * @param request what to make.
 * @throws DiskError if the DOS is bad, there's no such room, all the default names are taken, the space isn't
 * blank and there's no force, or the disk can't be written.
 */
export function addPartition(session: DiskSession, request: AddPartitionRequest): AddPartitionResult {
    const dos = request.dos;
    const dosProblem = hardDiskDosProblem(dos);
    if (dosProblem !== undefined) {
        throw new DiskError(dosProblem);
    }
    const block = choosePartitionBlock(session, request.placement);

    let name = request.name;
    if (name === undefined) {
        name = chooseDefaultPartitionName(session.getPartitions().map(p => p.diskName));
        if (name === undefined) {
            throw new DiskError("All the names HARDA to HARDZ are taken; give one with --name");
        }
    }

    // Space with data in it that isn't an LDOS partition of ours (another DOS's, say) is formatted over only
    // if the user says so, since there's no telling from the disk whether it's free.
    const hardDisk = session.hardDisk;
    if (!request.force && !isBlockBlank(hardDisk, block)) {
        throw new DiskError("The space for the new partition (" + describeBlock(block) + ") isn't blank. It may " +
            "hold data of another kind of partition, which formatting would destroy; use --force to format over it.");
    }

    const bootSectors = getHardDiskBootSectors(session.templates, dos, request.model);
    const location = {cylinderOffset: block.cylinderOffset, headOffset: block.headOffset};
    session.changeHardDisk(disk => {
        const message = formatLdosPartition(disk, {
            dos,
            startCylinder: block.cylinderOffset,
            startHead: block.headOffset,
            cylinders: block.cylinderCount,
            heads: block.headCount,
            granulesPerCylinder: request.granulesPerCylinder,
            name,
            date: request.date,
            bootSectors,
        });
        if (message !== undefined) {
            throw new DiskError(message);
        }
    }, location, request.force);

    const partitions = session.getPartitions();
    const index = partitions.findIndex(p => p.partition.cylinderOffset === location.cylinderOffset &&
        p.partition.headOffset === location.headOffset);
    if (index < 0) {
        throw new DiskError("The partition was written but isn't found on the disk afterward, so something is wrong; " +
            "use \"undo\" to take it back");
    }
    return {number: index + 1, partition: partitions[index]};
}

/**
 * What deletePartition() did.
 */
export interface DeletePartitionResult {
    /** The number that the deleted partition had, from 1. */
    number: number;
    /** What the partition was called in messages, such as "partition 2 (GAMES)". */
    label: string;
    /** Where the partition was on the disk, such as "cylinders 0-39, heads 0-5". */
    location: string;
    /** Whether there were partitions after it, which are now numbered one lower. */
    renumbered: boolean;
}

/**
 * Do "partition --delete [N|NAME]": erase a partition so that its space is free.
 *
 * @param session the session, whose disk is a hard disk.
 * @param wanted the number or disk name of the partition, or undefined for the selected one.
 * @param force whether to delete a partition that has files, and to write to a write-protected image (--force).
 * @throws DiskError if no partition is named or selected, it has files and there's no force, or the disk
 * can't be written.
 */
export function deletePartition(session: DiskSession, wanted: string | undefined, force: boolean): DeletePartitionResult {
    let number: number;
    if (wanted !== undefined) {
        number = session.findPartitionNumber(wanted);
    } else {
        const selected = session.selectedPartitionNumber;
        if (selected === undefined) {
            throw new DiskError("No partition is selected: name the one to delete (partition --delete N|NAME), " +
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
        throw new DiskError("The " + label + " has " + pluralizeWithCount(userFiles, "file") +
            "; use --force to delete it.");
    }

    // Keep the selection unless it's the partition that goes away.
    const keep = session.selectedPartitionNumber === number ? undefined : selectedLocation(session);
    session.changeHardDisk(() => {
        try {
            erasePartition(target.partition);
        } catch (e) {
            throw new DiskError(e instanceof Error ? e.message : String(e));
        }
    }, keep, force);

    const renumbered = number <= session.getPartitions().length;
    return {number, label, location: target.partition.describeLocation(), renumbered};
}
