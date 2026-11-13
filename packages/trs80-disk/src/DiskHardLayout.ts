/**
 * Where the partitions of a hard disk are and where there's room for another, for the "partition",
 * "create" and "format" commands. An HDV file has no partition table, so the layout is worked out from the
 * partitions that we find, which follow one of two patterns (see {@link DiskSplit}). Nothing here changes
 * the disk.
 */

import {
    describeHardDiskBlock, HARD_DISK_SECTORS_PER_TRACK, type HardDisk, type HardDiskGeometry, type DecodedPartition,
} from "trs80-base";
import {assertNever} from "z80-base";
import {pluralizeWithCount} from "./Plural.js";

/**
 * A block of whole cylinders and whole heads of a hard disk: where a partition is, or could go.
 */
export interface HardDiskBlock {
    /** The first cylinder. */
    cylinderOffset: number;
    /** The first head. */
    headOffset: number;
    /** The number of cylinders. */
    cylinderCount: number;
    /** The number of heads. */
    headCount: number;
}

/**
 * How a disk's partitions divide it up. The samples we know of split a disk one of two ways, so that's
 * what we can work out free space for. The kind is derived from the partitions and never stored.
 */
export enum DiskSplit {
    /**
     * There are no partitions, so the disk can be split either way.
     */
    NONE,

    /**
     * Every partition uses all of the disk's heads, over a run of cylinders. (A partition that uses every
     * head and every cylinder counts as this, and is alone on the disk.)
     */
    BY_CYLINDER,

    /**
     * Every partition starts at cylinder 0 and has the same number of cylinders, over a run of heads. That's
     * usually all of the disk's cylinders, but a disk of more than 203 cylinders (the most that a partition
     * has) leaves the rest unused.
     */
    BY_HEAD,

    /**
     * The partitions follow neither pattern, so we can't say what's free.
     */
    UNKNOWN,
}

/**
 * Convert the enum to a string for the user, such as "by cylinder".
 */
export function diskSplitToString(split: DiskSplit): string {
    switch (split) {
        case DiskSplit.NONE:
            return "not split yet";
        case DiskSplit.BY_CYLINDER:
            return "split by cylinder";
        case DiskSplit.BY_HEAD:
            return "split by head";
        case DiskSplit.UNKNOWN:
            return "split in an unrecognized way";
        default:
            assertNever(split);
    }
}

/**
 * The block of a hard disk that a partition occupies.
 */
export function partitionBlock(ldosPartition: DecodedPartition): HardDiskBlock {
    const partition = ldosPartition.partition;
    return {
        cylinderOffset: partition.cylinderOffset,
        headOffset: partition.headOffset,
        cylinderCount: partition.cylinderCount,
        headCount: partition.headCount,
    };
}

/**
 * Describe a block for the user, such as "cylinders 0-139, heads 0-5".
 */
export function describeBlock(block: HardDiskBlock): string {
    return describeHardDiskBlock(block.cylinderOffset, block.headOffset, block.cylinderCount, block.headCount);
}

/**
 * Whether two blocks share any cylinder and head.
 */
export function blocksOverlap(a: HardDiskBlock, b: HardDiskBlock): boolean {
    return a.cylinderOffset < b.cylinderOffset + b.cylinderCount &&
        b.cylinderOffset < a.cylinderOffset + a.cylinderCount &&
        a.headOffset < b.headOffset + b.headCount &&
        b.headOffset < a.headOffset + a.headCount;
}

/**
 * Work out how the partitions divide the disk.
 *
 * @param geometry the disk's geometry.
 * @param partitions the partitions, in any order.
 */
export function classifySplit(geometry: HardDiskGeometry, partitions: readonly HardDiskBlock[]): DiskSplit {
    if (partitions.length === 0) {
        return DiskSplit.NONE;
    }

    if (partitions.every(p => p.headOffset === 0 && p.headCount === geometry.headCount)) {
        return DiskSplit.BY_CYLINDER;
    }
    const cylinderCount = partitions[0].cylinderCount;
    if (partitions.every(p => p.cylinderOffset === 0 && p.cylinderCount === cylinderCount)) {
        return DiskSplit.BY_HEAD;
    }
    return DiskSplit.UNKNOWN;
}

/**
 * The number of cylinders that every partition of a disk split by head has, which a new one must have too.
 *
 * @param partitions the partitions, of which there's at least one, all with the same cylinders (see
 * {@link classifySplit}).
 */
export function byHeadCylinderCount(partitions: readonly HardDiskBlock[]): number {
    return partitions[0].cylinderCount;
}

/**
 * The blocks that no partition covers, in disk order. A disk with no partitions is all free, as one block
 * that uses every head. A disk whose partitions follow neither pattern has none that we can name.
 *
 * @param geometry the disk's geometry.
 * @param partitions the partitions, in any order.
 * @param split how they divide the disk, from {@link classifySplit}.
 */
export function findFreeBlocks(geometry: HardDiskGeometry, partitions: readonly HardDiskBlock[],
                               split: DiskSplit): HardDiskBlock[] {

    switch (split) {
        case DiskSplit.NONE:
            return [{cylinderOffset: 0, headOffset: 0, cylinderCount: geometry.cylinderCount, headCount: geometry.headCount}];

        case DiskSplit.BY_CYLINDER: {
            const free: HardDiskBlock[] = [];
            let next = 0;
            for (const p of [...partitions].sort((a, b) => a.cylinderOffset - b.cylinderOffset)) {
                if (p.cylinderOffset > next) {
                    free.push({cylinderOffset: next, headOffset: 0, cylinderCount: p.cylinderOffset - next,
                        headCount: geometry.headCount});
                }
                next = Math.max(next, p.cylinderOffset + p.cylinderCount);
            }
            if (next < geometry.cylinderCount) {
                free.push({cylinderOffset: next, headOffset: 0, cylinderCount: geometry.cylinderCount - next,
                    headCount: geometry.headCount});
            }
            return free;
        }

        case DiskSplit.BY_HEAD: {
            // The cylinders past the partitions' (on a disk of more than 203) aren't counted as free, since
            // a partition by head can't use them.
            const cylinderCount = byHeadCylinderCount(partitions);
            const free: HardDiskBlock[] = [];
            let next = 0;
            for (const p of [...partitions].sort((a, b) => a.headOffset - b.headOffset)) {
                if (p.headOffset > next) {
                    free.push({cylinderOffset: 0, headOffset: next, cylinderCount, headCount: p.headOffset - next});
                }
                next = Math.max(next, p.headOffset + p.headCount);
            }
            if (next < geometry.headCount) {
                free.push({cylinderOffset: 0, headOffset: next, cylinderCount, headCount: geometry.headCount - next});
            }
            return free;
        }

        case DiskSplit.UNKNOWN:
            return [];

        default:
            assertNever(split);
    }
}

/**
 * The name for a new partition when the user gives none: "HARD" and the first letter from A to Z that no
 * partition on the disk has as its disk name (ignoring case).
 *
 * @param diskNames the disk names of the partitions on the disk.
 * @return the name, or undefined if all 26 are taken.
 */
export function chooseDefaultPartitionName(diskNames: readonly string[]): string | undefined {
    const used = new Set(diskNames.map(name => name.toUpperCase()));
    for (let i = 0; i < 26; i++) {
        const name = "HARD" + String.fromCharCode(65 + i);
        if (!used.has(name)) {
            return name;
        }
    }
    return undefined;
}

/**
 * The lines that the "partition" command lists after the partitions: one for each block of free space,
 * lined up under {@link describePartitionLines}'s, or one saying why there's no telling what's free.
 * There are none for a NEWDOS/80 hard disk, whose partitions can't be added, and whose PDRIVE table,
 * not the space between partitions, says where they can go.
 *
 * @param geometry the disk's geometry.
 * @param partitions the partitions.
 */
export function describeFreeSpaceLines(geometry: HardDiskGeometry, partitions: readonly DecodedPartition[]): string[] {
    const isNewdos80 = partitions.some(partition => partition.trsdos.newdos80Partition !== undefined);
    if (isNewdos80) {
        return [];
    }

    const blocks = partitions.map(partitionBlock);
    const split = classifySplit(geometry, blocks);
    if (split === DiskSplit.UNKNOWN) {
        return ["   The partitions follow neither a split by cylinder nor by head, so we can't tell what's free."];
    }

    return findFreeBlocks(geometry, blocks, split).map(block => {
        const size = split === DiskSplit.BY_HEAD ? pluralizeWithCount(block.headCount, "head") :
            pluralizeWithCount(block.cylinderCount, "cylinder");
        return "     " + describeBlock(block) + "  free (" + size + ")";
    });
}

/**
 * Whether every sector of a block of the disk is zero, as a block that has never been formatted (or that
 * has been deleted) is. A sector that the image doesn't hold counts as zero.
 */
export function isBlockBlank(disk: HardDisk, block: HardDiskBlock): boolean {
    for (let cylinder = block.cylinderOffset; cylinder < block.cylinderOffset + block.cylinderCount; cylinder++) {
        for (let head = block.headOffset; head < block.headOffset + block.headCount; head++) {
            for (let sector = 0; sector < HARD_DISK_SECTORS_PER_TRACK; sector++) {
                const data = disk.readSector(cylinder, head, sector);
                if (data !== undefined && data.some(byte => byte !== 0)) {
                    return false;
                }
            }
        }
    }
    return true;
}

/**
 * The lines that tell the user how to set up the hard disk driver for the disk and the partitions that
 * were just made. An HDV file has no partition table, so a DOS only finds the partitions that its driver
 * was configured for.
 *
 * @param geometry the disk's geometry.
 * @param partitions the new partitions, each with its number on the disk (from 1).
 */
export function describeDriverSettings(geometry: HardDiskGeometry,
                                       partitions: readonly {number: number, partition: DecodedPartition}[]): string[] {

    const lines = [
        "Configure the hard disk driver with these settings (the image has no partition table, so the driver has to be told):",
        "  Disk: " + pluralizeWithCount(geometry.headCount, "head") + ", " +
            pluralizeWithCount(geometry.cylinderCount, "cylinder") + ".",
    ];
    for (const {number, partition} of partitions) {
        const physical = partition.partition;
        const trsdos = partition.trsdos;
        lines.push("  Partition " + number + " (" + (partition.diskName === "" ? "no name" : partition.diskName) + "): " +
            "starting cylinder " + physical.cylinderOffset + ", " + pluralizeWithCount(physical.cylinderCount, "cylinder") +
            ", starting head " + physical.headOffset + ", " + pluralizeWithCount(physical.headCount, "head") + ";");
        lines.push("    " + pluralizeWithCount(trsdos.granulesPerLump, "granule") + " per cylinder of " +
            pluralizeWithCount(trsdos.sectorsPerGranule, "sector") + ", directory on cylinder " +
            trsdos.dirLumpNumber + " of the partition.");
    }
    return lines;
}
