import {TRS80_BASE_LOGGER} from "z80-logger";
import type {HardDisk} from "./HardDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {readPdriveHardDiskSlots} from "./Pdrive.js";
import {decodeNewdos80HardDiskPartition, type Trsdos} from "./Trsdos.js";

/**
 * The first two bytes of a NEWDOS/80 boot sector. The third is the directory's lump.
 */
const BOOT_SECTOR_MAGIC_0 = 0x00;
const BOOT_SECTOR_MAGIC_1 = 0xFE;

/**
 * Find the partitions of a NEWDOS/80 hard disk, in disk order (by head), each with its decoded file
 * system. Each partition is one head, from cylinder 0, described by a slot of the PDRIVE table on
 * cylinder 0, head 0, which gives its size and its sectors per granule. The directory's lump comes
 * from the partition's own boot sector, since FORMAT can have been told a different one than the
 * table's. Slots whose head has no boot sector or doesn't decode (a head that was never formatted, or
 * a disk that isn't NEWDOS/80's) yield nothing, as do later slots for a head already found. See
 * "NEWDOS/80 on hard disks" in FLOPPY_FORMATS.md.
 */
export function findNewdos80Partitions(disk: HardDisk): {partition: HardDiskPartition, trsdos: Trsdos}[] {
    const diskGeometry = disk.getGeometry();
    const found: {partition: HardDiskPartition, trsdos: Trsdos}[] = [];

    const slots = readPdriveHardDiskSlots((cylinder, head, sector) => disk.readSector(cylinder, head, sector));
    for (const slot of slots) {
        if (slot.head >= diskGeometry.headCount || slot.cylinderCount > diskGeometry.cylinderCount) {
            continue;
        }

        const bootSector = disk.readSector(0, slot.head, 0);
        if (bootSector === undefined || bootSector[0] !== BOOT_SECTOR_MAGIC_0 || bootSector[1] !== BOOT_SECTOR_MAGIC_1) {
            continue;
        }

        const dirLumpNumber = bootSector[2];
        const partition = new HardDiskPartition(disk, 0, slot.head, slot.cylinderCount, 1);
        const trsdos = decodeNewdos80HardDiskPartition(partition, slot, dirLumpNumber);
        if (trsdos === undefined) {
            continue;
        }

        const overlapped = found.some(other => other.partition.overlaps(partition));
        if (overlapped) {
            TRS80_BASE_LOGGER.warn(`Skipping PDRIVE slot ${slot.slot} for head ${slot.head} of the NEWDOS/80 ` +
                "hard disk, because an earlier slot has that head");
            continue;
        }

        found.push({partition, trsdos});
    }

    found.sort((a, b) => a.partition.headOffset - b.partition.headOffset);
    return found;
}
