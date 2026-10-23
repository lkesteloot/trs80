import {TRS80_BASE_LOGGER} from "z80-logger";
import {HARD_DISK_SECTORS_PER_TRACK, type HardDisk} from "./HardDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {decodeTrsdosHardDiskPartition, type Trsdos} from "./Trsdos.js";

/**
 * A partition of a hard disk and the LDOS or LS-DOS file system found in it.
 */
export interface LdosPartition {
    /**
     * Where the partition is on the disk, and a way to read its sectors.
     */
    readonly partition: HardDiskPartition;

    /**
     * The decoded file system.
     */
    readonly trsdos: Trsdos;

    /**
     * The disk name that FORMAT wrote in the partition's GAT, or an empty string if it has none.
     */
    readonly diskName: string;

    /**
     * A name for the partition that's unique on the disk, ignoring case, and safe to use as a
     * directory name on the host. It's usually the disk name (see makeDirectoryNames()).
     */
    readonly directoryName: string;
}

/**
 * The directory name for a partition whose disk name has nothing usable in it.
 */
const FALLBACK_DIRECTORY_NAME = "PART";

/**
 * Make a directory name for each partition from its disk name, in disk order. A name keeps its
 * letters, digits, "-" and "_"; anything else becomes "_". A name with no letter or digit becomes
 * "PART". If the result is already taken (ignoring case, since host file systems often do), it
 * gets the first free suffix of "-2", "-3" and so on, so the first partition with a name keeps it.
 *
 * @param diskNames the disk names of the partitions, in disk order.
 * @return the directory names, in the same order.
 */
export function makeDirectoryNames(diskNames: string[]): string[] {
    const used = new Set<string>();

    return diskNames.map(diskName => {
        const safeName = diskName.replace(/[^A-Za-z0-9_-]/g, "_");
        const baseName = /[A-Za-z0-9]/.test(safeName) ? safeName : FALLBACK_DIRECTORY_NAME;

        let name = baseName;
        for (let suffix = 2; used.has(name.toUpperCase()); suffix++) {
            name = `${baseName}-${suffix}`;
        }
        used.add(name.toUpperCase());

        return name;
    });
}

/**
 * The second byte of a partition's boot sector, as on 2.3-family floppies. The first is usually 0
 * but is 0xF3 on DOSPLUS's system partition, and the third is the directory's cylinder, whose high
 * bit DOSPLUS can set. See "Boot sector prefixes" in FLOPPY_FORMATS.md.
 */
const BOOT_SECTOR_MAGIC_1 = 0xFE;

/**
 * Where the GAT keeps the media data block that LS-DOS 6.2 and later write (and LDOS 5.3 does too,
 * with some drivers): a byte with the value 3, then three letters that name the driver. We only
 * trust the block when the letters are those of the driver that fills in every field. See "Hard disk
 * images" in FLOPPY_FORMATS.md.
 */
const MEDIA_DATA_OFFSET = 0xF5;
const MEDIA_DATA_SIGNATURE = "\x03RSH";

/**
 * The bit in the GAT's byte 0xCD and in the media data block's FLAG2 that means each logical
 * cylinder is two physical ones (DBLBIT). We don't read such partitions.
 */
const DOUBLE_CYLINDER_BIT = 0x20;

/**
 * The version bytes (GAT byte 0xCB) of the DOSes that use the LDOS/TRSDOS 6 GAT layout: LDOS 5.x
 * (0x50-0x53), and TRSDOS 6.x and LS-DOS 6.3 (0x60-0x63), as listed in "GAT bytes 0xCB-0xCD" in
 * FLOPPY_FORMATS.md. Other DOSes' hard disks (such as DOSPLUS 3.5's, whose GATs say 0x35) can have
 * a boot sector and GAT that look like these, but lay out their granules differently, so a GAT
 * without the media data block has to carry one of them.
 */
const HARD_DISK_DOS_VERSIONS = [0x50, 0x51, 0x52, 0x53, 0x60, 0x61, 0x62, 0x63];

/**
 * The version bytes of DOSPLUS 3.x (0x31-0x35). Its hard disk partitions have the LDOS layout, but
 * its GAT leaves the granules per cylinder (byte 0xCD) at 0. Its granules are a track (32 sectors),
 * so a cylinder has one per head. That was measured on DOSPLUS 3.5; see "Hard disk images" in
 * FLOPPY_FORMATS.md.
 */
const DOSPLUS_3_VERSIONS = [0x31, 0x32, 0x33, 0x34, 0x35];

/**
 * The size and shape of a partition, as recorded in its GAT.
 */
interface PartitionLayout {
    cylinderCount: number;
    headCount: number;
    granulesPerCylinder: number;
}

/**
 * Work out a partition's layout from its GAT, or return undefined if the GAT doesn't describe a
 * partition that starts at the candidate position. If the GAT has a media data block, its fields
 * must agree with the candidate position and the boot sector. If it doesn't, the GAT must be from
 * a DOS that we know (see HARD_DISK_DOS_VERSIONS and DOSPLUS_3_VERSIONS), and the partition is
 * assumed to span the rest of the disk's heads, so partitions split by head must have the block.
 *
 * @param gat the sector that the boot sector points to.
 * @param disk the disk.
 * @param cylinder the candidate partition's first cylinder.
 * @param head the candidate partition's first head.
 * @param dirCylinder the directory cylinder that the boot sector gives.
 */
function getPartitionLayout(gat: Uint8Array, disk: HardDisk, cylinder: number, head: number,
                            dirCylinder: number): PartitionLayout | undefined {

    const diskGeometry = disk.getGeometry();
    const hasMediaData = Array.from(MEDIA_DATA_SIGNATURE).every((c, i) =>
        gat[MEDIA_DATA_OFFSET + i] === c.charCodeAt(0));

    let layout: PartitionLayout;
    if (hasMediaData) {
        // These are bytes 3 to 9 of the drive code table, described in the TRSDOS 6 programmer's guide.
        const flag1 = gat[0xF9];
        const flag2 = gat[0xFA];
        const curcyl = gat[0xFB];
        const maxcyl = gat[0xFC];
        const geometryByte = gat[0xFD];
        const granuleByte = gat[0xFE];
        const dircyl = gat[0xFF];

        if ((flag2 & DOUBLE_CYLINDER_BIT) !== 0 || (gat[0xCD] & DOUBLE_CYLINDER_BIT) !== 0) {
            TRS80_BASE_LOGGER.warn(`Skipping the hard disk partition at cylinder ${cylinder} head ${head}: ` +
                "its logical cylinders are two physical cylinders, which isn't supported");
            return undefined;
        }

        const startCylinder = ((flag1 & 0x03) << 8) | curcyl;
        const startHead = flag2 & 0x0F;
        const headCount = (geometryByte >> 5) + 1;
        const sectorsPerTrack = (geometryByte & 0x1F) + 1;
        const granulesPerCylinder = (granuleByte >> 5) + 1;
        const sectorsPerGranule = (granuleByte & 0x1F) + 1;
        const agrees = startCylinder === cylinder && startHead === head && dircyl === dirCylinder &&
            sectorsPerTrack === HARD_DISK_SECTORS_PER_TRACK &&
            granulesPerCylinder*sectorsPerGranule === headCount*sectorsPerTrack;
        if (!agrees) {
            return undefined;
        }

        layout = {cylinderCount: maxcyl + 1, headCount, granulesPerCylinder};
    } else {
        // Silently skip a GAT that has the bit or that isn't from one of these DOSes, because it's
        // probably not a GAT at all, or it's another DOS's.
        const version = gat[0xCB];
        const headCount = diskGeometry.headCount - head;
        let granulesPerCylinder: number;
        if (HARD_DISK_DOS_VERSIONS.includes(version)) {
            if ((gat[0xCD] & DOUBLE_CYLINDER_BIT) !== 0) {
                return undefined;
            }
            granulesPerCylinder = (gat[0xCD] & 0x07) + 1;
        } else if (DOSPLUS_3_VERSIONS.includes(version)) {
            granulesPerCylinder = headCount;
        } else {
            return undefined;
        }

        layout = {cylinderCount: gat[0xCC] + 35, headCount, granulesPerCylinder};
    }

    const fits = cylinder + layout.cylinderCount <= diskGeometry.cylinderCount &&
        head + layout.headCount <= diskGeometry.headCount &&
        dirCylinder < layout.cylinderCount;
    return fits ? layout : undefined;
}

/**
 * Find the partitions with LDOS's layout on a hard disk (LDOS, LS-DOS and DOSPLUS 3), in disk order
 * (by cylinder, then head).
 *
 * Every partition starts with a boot sector, whose second byte is FE and whose third is the
 * directory cylinder (relative to the partition), so look for those at every head of every cylinder.
 * The GAT is sector 0 of the directory cylinder; cylinder 0 also holds a stale copy of it, so only
 * a GAT that a boot sector points to counts. A candidate is a partition only if its file system
 * decodes (see decodeTrsdosHardDiskPartition()), so other DOSes' disks, and sectors that happen to
 * start with these bytes, yield nothing. A partition that overlaps an earlier one is dropped. See
 * "Hard disk images" in FLOPPY_FORMATS.md.
 */
export function findLdosPartitions(disk: HardDisk): LdosPartition[] {
    const diskGeometry = disk.getGeometry();
    const ldosPartitions: {partition: HardDiskPartition, trsdos: Trsdos}[] = [];

    for (let cylinder = 0; cylinder < diskGeometry.cylinderCount; cylinder++) {
        for (let head = 0; head < diskGeometry.headCount; head++) {
            const bootSector = disk.readSector(cylinder, head, 0);
            if (bootSector === undefined || bootSector[1] !== BOOT_SECTOR_MAGIC_1) {
                continue;
            }

            const dirCylinder = bootSector[2] & 0x7F;
            const gat = disk.readSector(cylinder + dirCylinder, head, 0);
            if (gat === undefined) {
                continue;
            }
            const layout = getPartitionLayout(gat, disk, cylinder, head, dirCylinder);
            if (layout === undefined) {
                continue;
            }

            const partition = new HardDiskPartition(disk, cylinder, head, layout.cylinderCount, layout.headCount);
            const trsdos = decodeTrsdosHardDiskPartition(partition, dirCylinder, layout.granulesPerCylinder);
            if (trsdos === undefined) {
                continue;
            }

            const overlapped = ldosPartitions.some(other => other.partition.overlaps(partition));
            if (overlapped) {
                TRS80_BASE_LOGGER.warn(`Skipping the hard disk partition at cylinder ${cylinder} head ${head} ` +
                    "because it overlaps an earlier one");
                continue;
            }

            ldosPartitions.push({partition, trsdos});
        }
    }

    const diskNames = ldosPartitions.map(({trsdos}) => {
        const gatInfo = trsdos.getGatInfo();
        return typeof gatInfo === "string" ? "" : gatInfo.name;
    });
    const directoryNames = makeDirectoryNames(diskNames);

    return ldosPartitions.map(({partition, trsdos}, index) => ({
        partition,
        trsdos,
        diskName: diskNames[index],
        directoryName: directoryNames[index],
    }));
}
