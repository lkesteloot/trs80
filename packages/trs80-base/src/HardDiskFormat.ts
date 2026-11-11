/**
 * Makes new hard disk images and formats partitions on them, as the LDOS and LS-DOS hard disk
 * formatters do. A new image is an HDV file with every sector zero, and a formatted partition
 * has a boot sector, a GAT with its media data block, a HIT, and BOOT/SYS and DIR/SYS entries, like
 * the data partitions that the real formatters leave. What each field holds is in "Formatting
 * partitions" under "Hard disk images" in FLOPPY_FORMATS.md, which also has the HDV header's fields.
 */

import {assertNever} from "z80-base";
import {BYTES_PER_SECTOR, Density, SectorData, SectorPosition} from "./FloppyDisk.js";
import {HARD_DISK_SECTOR_SIZE, HARD_DISK_SECTORS_PER_TRACK, type HardDisk} from "./HardDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {decodeHdvHardDisk, type HdvHardDisk} from "./HdvHardDisk.js";
import {
    BOOT_SYS_ATTRIBUTES, BOOT_SYS_HIT_BYTE, BOOT_SYS_SECTOR_COUNT, DEFAULT_MASTER_PASSWORD, DIR_SYS_ATTRIBUTES,
    DIR_SYS_HIT_BYTE, DOUBLE_DENSITY_LOAD_ADDRESS, formatGatDate, GAT_CYLINDER_EXCESS_OFFSET,
    GAT_DISK_TYPE_OFFSET, GAT_END_OF_ALLOCATION,
    makeSyntheticBootSector, makeSystemEntry, MAX_DIRECTORY_SECTORS, NAME_LENGTH, NAME_PATTERN,
    patchDirectoryCylinder, TRSDOS_FORMAT_DOSES, TrsdosFormatDos, trsdosFormatDosCliName,
    writeText,
} from "./TrsdosFormat.js";
import {hashTrsdosPassword} from "./Trsdos.js";
import {GAT_DATE_OFFSET, GAT_MEDIA_BLOCK_OFFSET, GAT_NAME_OFFSET, GAT_PASSWORD_OFFSET} from "./TrsdosDiskInfo.js";

/**
 * The size of an HDV file's header.
 */
const HDV_HEADER_SIZE = 256;

/**
 * The fewest and most heads that an HDV image has (the header's byte 26 and a 3-bit field in the GAT).
 */
export const HARD_DISK_MIN_HEADS = 1;
export const HARD_DISK_MAX_HEADS = 8;

/**
 * The fewest and most cylinders that an HDV image has. The header's cylinder count is 10 bits (bits 8 and
 * 9 in byte 27, the low 8 in byte 28), so 1024, which would be stored as 0 and read back as no cylinders,
 * isn't possible.
 */
export const HARD_DISK_MIN_CYLINDERS = 1;
export const HARD_DISK_MAX_CYLINDERS = 1023;

/**
 * The fewest and most cylinders that a partition has. The GAT has one allocation byte per cylinder,
 * at offsets 0x00 to 0xCA, and byte 0xCC holds the number of cylinders minus 35.
 */
export const PARTITION_MIN_CYLINDERS = 35;
export const PARTITION_MAX_CYLINDERS = 203;

/**
 * The most granules in a cylinder (a 3-bit field in the GAT) and the most sectors in a granule (a 5-bit field).
 */
const MAX_GRANULES_PER_CYLINDER = 8;
const MAX_SECTORS_PER_GRANULE = 32;

/**
 * The highest starting cylinder of a partition, which the media data block holds in 10 bits.
 */
const MAX_START_CYLINDER = 1023;

/**
 * The name of a new partition when the options give none.
 */
const DEFAULT_PARTITION_NAME = "HARD";

/**
 * The letters that the media data block of the partitions we write carries: the driver that fills in
 * every field of the block, which is the one that FreHD and its emulators use.
 */
const MEDIA_DATA_SIGNATURE = "RSH";

/**
 * What to put in a new HDV image.
 */
export interface BlankHdvOptions {
    /**
     * The number of heads, 1 to 8.
     */
    heads: number;

    /**
     * The number of cylinders, 1 to 1023.
     */
    cylinders: number;

    /**
     * The date to put in the header. Defaults to now.
     */
    date?: Date | undefined;
}

/**
 * Make a new, blank HDV hard disk image: Reed's HDV 1.0 header (the fields that FreHD reads) and then
 * every sector zero, for the whole size of the disk. The result is a normal {@link HdvHardDisk}, as if
 * decoded from the file, and isn't write-protected. It has no partitions.
 *
 * @param options the shape of the disk.
 * @return the disk.
 * @throws Error if the heads or cylinders are out of range.
 */
export function makeBlankHdvHardDisk(options: BlankHdvOptions): HdvHardDisk {
    const heads = options.heads;
    const cylinders = options.cylinders;
    if (!Number.isInteger(heads) || heads < HARD_DISK_MIN_HEADS || heads > HARD_DISK_MAX_HEADS) {
        throw new Error(`A hard disk has ${HARD_DISK_MIN_HEADS} to ${HARD_DISK_MAX_HEADS} heads, not ${heads}.`);
    }
    if (!Number.isInteger(cylinders) || cylinders < HARD_DISK_MIN_CYLINDERS || cylinders > HARD_DISK_MAX_CYLINDERS) {
        throw new Error(`A hard disk has ${HARD_DISK_MIN_CYLINDERS} to ${HARD_DISK_MAX_CYLINDERS} cylinders, ` +
            `not ${cylinders}.`);
    }

    const sectorsPerCylinder = heads*HARD_DISK_SECTORS_PER_TRACK;
    const binary = new Uint8Array(HDV_HEADER_SIZE + cylinders*sectorsPerCylinder*HARD_DISK_SECTOR_SIZE);
    const date = options.date ?? new Date();

    binary[0] = 0x56;
    binary[1] = 0xCB;
    binary[2] = 0x10;                                   // Version 1.0.
    // Byte 3 is the checksum, below.
    binary[4] = 1;                                      // Header blocks.
    binary[5] = 4;                                      // What the spec says (FreHD writes 1).
    binary[6] = 0;                                      // Media type: hard disk.
    binary[7] = 0;                                      // Not write-protected.
    binary[8] = 0;                                      // No auto-boot.
    binary[9] = 0;
    binary[10] = 0;                                     // Creator: we have no assigned code.
    binary[11] = 0;                                     // LDOS/LS-DOS.
    binary[12] = date.getMonth() + 1;
    binary[13] = date.getDate();
    binary[14] = (date.getFullYear() - 1900) & 0xFF;
    binary[26] = heads;
    binary[27] = (cylinders >> 8) & 0x03;
    binary[28] = cylinders & 0xFF;
    binary[29] = sectorsPerCylinder & 0xFF;             // 0 means 256.
    binary[30] = 8;
    binary[31] = 1;                                     // What FreHD and xtrs write.

    // The checksum is the sum of the other header bytes in the first 32, exclusive-ored with 0x4C.
    let sum = 0;
    for (let i = 0; i < 32; i++) {
        if (i !== 3) {
            sum += binary[i];
        }
    }
    binary[3] = (sum & 0xFF) ^ 0x4C;

    const hardDisk = decodeHdvHardDisk(binary);
    if (hardDisk === undefined) {
        // We just made the header, so this is a bug.
        throw new Error("The new hard disk image doesn't decode");
    }
    return hardDisk;
}

/**
 * The number of sectors in each granule of a partition with this many heads, when the user doesn't say:
 * the smallest power of two that is at least 4 times the heads, and at most 32. This is the rule that
 * fits every hard disk we measured; see "Formatting partitions" in FLOPPY_FORMATS.md. Tandy's installer
 * uses a different one, so callers can give the granules per cylinder themselves.
 *
 * @param heads the partition's heads, 1 to 8.
 * @return the granules in each cylinder, and the sectors in each granule.
 */
export function defaultGranulesPerCylinder(heads: number): {granulesPerCylinder: number, sectorsPerGranule: number} {
    let sectorsPerGranule = 4;
    while (sectorsPerGranule < 4*heads && sectorsPerGranule < MAX_SECTORS_PER_GRANULE) {
        sectorsPerGranule *= 2;
    }
    return {
        granulesPerCylinder: heads*HARD_DISK_SECTORS_PER_TRACK/sectorsPerGranule,
        sectorsPerGranule,
    };
}

/**
 * What to format a partition as.
 */
export interface LdosPartitionOptions {
    /**
     * Which DOS's FORMAT to imitate: {@link TrsdosFormatDos.LDOS_5_3} or {@link TrsdosFormatDos.LSDOS_6_3}.
     */
    dos: TrsdosFormatDos;

    /**
     * The partition's first cylinder.
     */
    startCylinder: number;

    /**
     * The partition's first head.
     */
    startHead: number;

    /**
     * The number of cylinders in the partition, 35 to 203.
     */
    cylinders: number;

    /**
     * The number of heads in the partition, 1 to 8.
     */
    heads: number;

    /**
     * The granules in each cylinder, a divisor of the cylinder's sectors, 1 to 8, and at least the heads
     * (a granule holds at most 32 sectors). Defaults to {@link defaultGranulesPerCylinder}.
     */
    granulesPerCylinder?: number | undefined;

    /**
     * The disk's name, up to eight letters and digits starting with a letter, in any case. Defaults to "HARD".
     */
    name?: string | undefined;

    /**
     * The date to put in the GAT, as "MM/DD/YY" in local time. Defaults to now.
     */
    date?: Date | undefined;

    /**
     * The master password: up to eight letters and digits starting with a letter, or empty for none.
     * Defaults to "PASSWORD", which FORMAT uses when the user types nothing.
     */
    masterPassword?: string | undefined;

    /**
     * The DOS's own boot sectors for a data partition, two of 256 bytes, which are cylinder 0's sectors
     * 0 and 1. Byte 2 of each is patched to the directory cylinder, so they can come from a partition of
     * another size. Without them we write a boot sector of our own (as {@link formatTrsdosDataDisk} does
     * for floppies): it prints a message and halts.
     */
    bootSectors?: Uint8Array[] | undefined;
}

/**
 * The checked, filled-in options of a partition, and what follows from them.
 */
interface PartitionPlan {
    dos: TrsdosFormatDos;
    startCylinder: number;
    startHead: number;
    cylinders: number;
    heads: number;
    granulesPerCylinder: number;
    sectorsPerGranule: number;
    name: string;
    date: string;
    passwordHash: number;
    bootSectors: Uint8Array[] | undefined;

    /**
     * The GAT version byte (0xCB).
     */
    version: number;

    /**
     * The BOOT/SYS and DIR/SYS entries' update and access password hashes (bytes 16 to 19).
     */
    systemHashes: number[];

    /**
     * The directory's cylinder, relative to the partition.
     */
    directoryCylinder: number;

    /**
     * The number of sectors that DIR/SYS says the directory has.
     */
    directorySectors: number;
}

/**
 * The GAT version and the system files' hashes of a DOS on a hard disk, or undefined if the DOS isn't one
 * we format partitions for.
 */
function hardDiskDosParams(dos: TrsdosFormatDos): {version: number, systemHashes: number[]} | undefined {
    switch (dos) {
        case TrsdosFormatDos.LDOS_5_3:
            return {version: 0x53, systemHashes: [0xAE, 0x01, 0x00, 0x00]};
        case TrsdosFormatDos.LSDOS_6_3:
            return {version: 0x63, systemHashes: [0xF6, 0x37, 0x00, 0x00]};
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.TRSDOS_6_2:
            return undefined;
        default:
            assertNever(dos);
    }
}

/**
 * The DOSes that we format hard disk partitions for, LDOS 5.3 and LS-DOS 6.3, in the order of
 * {@link TRSDOS_FORMAT_DOSES}. (We have no sample of a TRSDOS 6.2 hard disk partition to check against,
 * and the older TRSDOSes have no hard disk support.)
 */
export const HARD_DISK_FORMAT_DOSES: readonly TrsdosFormatDos[] =
    TRSDOS_FORMAT_DOSES.filter(dos => hardDiskDosParams(dos) !== undefined);

/**
 * Why a DOS can't be formatted on a hard disk, or undefined if it can (see {@link HARD_DISK_FORMAT_DOSES}).
 * The message names the DOSes as the user types them ({@link trsdosFormatDosCliName}), such as "ldos-5.3".
 */
export function hardDiskDosProblem(dos: TrsdosFormatDos): string | undefined {
    if (hardDiskDosParams(dos) !== undefined) {
        return undefined;
    }
    const names = HARD_DISK_FORMAT_DOSES.map(trsdosFormatDosCliName);
    const choices = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    return `${trsdosFormatDosCliName(dos)} can't be formatted on a hard disk. The DOSes that work are ${choices}.`;
}

/**
 * Check the options against the disk and work out what follows from them.
 *
 * @return the plan, or a message saying what's wrong.
 */
function makePartitionPlan(disk: HardDisk, options: LdosPartitionOptions): PartitionPlan | string {
    const dosParams = hardDiskDosParams(options.dos);
    if (dosParams === undefined) {
        return hardDiskDosProblem(options.dos) ?? "";
    }

    const {startCylinder, startHead, cylinders, heads} = options;
    if (!Number.isInteger(cylinders) || cylinders < PARTITION_MIN_CYLINDERS || cylinders > PARTITION_MAX_CYLINDERS) {
        return `A partition has ${PARTITION_MIN_CYLINDERS} to ${PARTITION_MAX_CYLINDERS} cylinders, ` +
            `not ${cylinders}.`;
    }
    if (!Number.isInteger(heads) || heads < HARD_DISK_MIN_HEADS || heads > HARD_DISK_MAX_HEADS) {
        return `A partition has ${HARD_DISK_MIN_HEADS} to ${HARD_DISK_MAX_HEADS} heads, not ${heads}.`;
    }
    if (!Number.isInteger(startCylinder) || startCylinder < 0 || startCylinder > MAX_START_CYLINDER) {
        return `A partition starts at a cylinder from 0 to ${MAX_START_CYLINDER}, not ${startCylinder}.`;
    }
    if (!Number.isInteger(startHead) || startHead < 0) {
        return `A partition starts at a head of 0 or more, not ${startHead}.`;
    }

    const geometry = disk.getGeometry();
    if (startCylinder + cylinders > geometry.cylinderCount || startHead + heads > geometry.headCount) {
        return `A partition at cylinder ${startCylinder}, head ${startHead} with ${cylinders} cylinders and ` +
            `${heads} heads doesn't fit on a disk of ${geometry.cylinderCount} cylinders and ${geometry.headCount} heads.`;
    }
    if (disk.isWriteProtected()) {
        return "The disk is write-protected.";
    }

    const sectorsPerCylinder = heads*HARD_DISK_SECTORS_PER_TRACK;
    let granulesPerCylinder: number;
    let sectorsPerGranule: number;
    if (options.granulesPerCylinder === undefined) {
        ({granulesPerCylinder, sectorsPerGranule} = defaultGranulesPerCylinder(heads));
    } else {
        granulesPerCylinder = options.granulesPerCylinder;
        if (!Number.isInteger(granulesPerCylinder) || granulesPerCylinder < 1 ||
            granulesPerCylinder > MAX_GRANULES_PER_CYLINDER || sectorsPerCylinder % granulesPerCylinder !== 0) {

            return `A cylinder of ${sectorsPerCylinder} sectors has 1 to ${MAX_GRANULES_PER_CYLINDER} granules, ` +
                `a divisor of ${sectorsPerCylinder}, not ${options.granulesPerCylinder}.`;
        }
        sectorsPerGranule = sectorsPerCylinder/granulesPerCylinder;
        if (sectorsPerGranule > MAX_SECTORS_PER_GRANULE) {
            return `${granulesPerCylinder} granules per cylinder would make granules of ${sectorsPerGranule} ` +
                `sectors, and a granule has at most ${MAX_SECTORS_PER_GRANULE}.`;
        }
    }

    // The name and password are checked the way the floppy formatter does.
    const name = (options.name ?? DEFAULT_PARTITION_NAME).toUpperCase().replace(/ +$/, "");
    if (name.length > NAME_LENGTH || !NAME_PATTERN.test(name)) {
        return `Invalid disk name "${options.name}": a name is up to ${NAME_LENGTH} letters and digits, ` +
            `starting with a letter.`;
    }
    let passwordHash: number;
    try {
        passwordHash = hashTrsdosPassword(options.masterPassword ?? DEFAULT_MASTER_PASSWORD);
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }

    const bootSectors = options.bootSectors;
    if (bootSectors !== undefined) {
        if (bootSectors.length !== 2) {
            return `A hard disk partition needs 2 boot sectors, not ${bootSectors.length}.`;
        }
        if (bootSectors.some(bootSector => bootSector.length !== BYTES_PER_SECTOR)) {
            return `A boot sector is ${BYTES_PER_SECTOR} bytes.`;
        }
    }

    return {
        dos: options.dos,
        startCylinder,
        startHead,
        cylinders,
        heads,
        granulesPerCylinder,
        sectorsPerGranule,
        name: name.padEnd(NAME_LENGTH, " "),
        date: formatGatDate(options.date ?? new Date()),
        passwordHash,
        bootSectors,
        version: dosParams.version,
        systemHashes: dosParams.systemHashes,
        directoryCylinder: cylinders >> 1,
        directorySectors: Math.min(sectorsPerCylinder, MAX_DIRECTORY_SECTORS),
    };
}

/**
 * Build the partition's GAT: every cylinder free except the boot granule and the directory cylinder,
 * then the version, the cylinder count, the granules, the master password, the name and date, and the
 * media data block that tells the driver where the partition is.
 */
function makePartitionGat(plan: PartitionPlan): Uint8Array {
    const gat = new Uint8Array(BYTES_PER_SECTOR);
    const freeByte = (0xFF << plan.granulesPerCylinder) & 0xFF;

    // Past the partition's cylinders all is used. There's no lockout table on a hard disk.
    gat.fill(0xFF, 0, GAT_END_OF_ALLOCATION);
    gat.fill(freeByte, 0, plan.cylinders);
    gat[0] |= 0x01;
    gat[plan.directoryCylinder] = 0xFF;

    gat[GAT_END_OF_ALLOCATION] = plan.version;
    gat[GAT_CYLINDER_EXCESS_OFFSET] = plan.cylinders - PARTITION_MIN_CYLINDERS;
    // A data partition, with the new date style, and the granules per cylinder minus one.
    gat[GAT_DISK_TYPE_OFFSET] = 0x80 | 0x08 | (plan.granulesPerCylinder - 1);
    gat[GAT_PASSWORD_OFFSET] = plan.passwordHash & 0xFF;
    gat[GAT_PASSWORD_OFFSET + 1] = plan.passwordHash >> 8;
    writeText(gat, GAT_NAME_OFFSET, plan.name);
    writeText(gat, GAT_DATE_OFFSET, plan.date);

    // The media data block: 3, the driver's letters, then bytes 3 to 9 of the drive control table.
    const mediaBlock = [
        0x03, ...Array.from(MEDIA_DATA_SIGNATURE, ch => ch.charCodeAt(0)),
        // FLAG1: bits 8 and 9 of the starting cylinder, and two bits that every real partition has.
        0x0C | ((plan.startCylinder >> 8) & 0x03),
        // FLAG2: the starting head, and a bit that every real partition has.
        0x10 | plan.startHead,
        // CURCYL: the low 8 bits of the starting cylinder.
        plan.startCylinder & 0xFF,
        // MAXCYL: the cylinders minus one.
        plan.cylinders - 1,
        // The heads minus one, then the sectors per track minus one.
        ((plan.heads - 1) << 5) | (HARD_DISK_SECTORS_PER_TRACK - 1),
        // The granules per cylinder minus one, then the sectors per granule minus one.
        ((plan.granulesPerCylinder - 1) << 5) | (plan.sectorsPerGranule - 1),
        plan.directoryCylinder,
    ];
    gat.set(mediaBlock, GAT_MEDIA_BLOCK_OFFSET);

    return gat;
}

/**
 * Write a logical sector of a partition: the cylinder and the sector's number across all the partition's
 * heads, as {@link HardDiskPartition} counts them.
 */
function writePartitionSector(partition: HardDiskPartition, cylinder: number, sector: number, bytes: Uint8Array): void {
    const data = new Uint8Array(BYTES_PER_SECTOR);
    data.set(bytes.subarray(0, BYTES_PER_SECTOR));
    const sectorPosition = SectorPosition.make(cylinder, 0, sector);
    partition.writeSector(sectorPosition, new SectorData(data, sectorPosition, Density.DOUBLE));
}

/**
 * Set every sector of a partition to zeros, so that no boot sector, GAT or file data is left in it.
 * This is what un-formats a partition: {@link findLdosPartitions} no longer finds it, and the space
 * is free. The caller checks that the disk isn't write-protected.
 *
 * @param partition the partition.
 * @throws Error if the disk is write-protected or doesn't hold all the partition's sectors.
 */
export function erasePartition(partition: HardDiskPartition): void {
    const zeros = new Uint8Array(BYTES_PER_SECTOR);
    const sectorsPerCylinder = partition.headCount*HARD_DISK_SECTORS_PER_TRACK;
    for (let cylinder = 0; cylinder < partition.cylinderCount; cylinder++) {
        for (let sector = 0; sector < sectorsPerCylinder; sector++) {
            writePartitionSector(partition, cylinder, sector, zeros);
        }
    }
}

/**
 * Format a partition of a hard disk as an empty data partition, as the DOS's hard disk FORMAT leaves it:
 * every sector of the partition is first set to zeros, then the boot sectors, system information
 * sector, GAT (and its copy in sector 3 of cylinder 0), HIT, and the BOOT/SYS and DIR/SYS entries are
 * written. The result is found by {@link findLdosPartitions} with the layout given, and can be written
 * with {@link TrsdosWriter}. What each sector holds, and how it was checked, is in "Formatting partitions"
 * in FLOPPY_FORMATS.md.
 *
 * Nothing is written if the options are bad.
 *
 * @param disk the disk to write to.
 * @param options what to format.
 * @return a message saying what's wrong with the options or the disk, or undefined if the partition was written.
 */
export function formatLdosPartition(disk: HardDisk, options: LdosPartitionOptions): string | undefined {
    const plan = makePartitionPlan(disk, options);
    if (typeof plan === "string") {
        return plan;
    }

    const partition = new HardDiskPartition(disk, plan.startCylinder, plan.startHead, plan.cylinders, plan.heads);
    const directoryCylinder = plan.directoryCylinder;

    try {
        erasePartition(partition);

        // The boot sectors. Without the DOS's own we write one that works the same wherever it's loaded.
        const synthetic = makeSyntheticBootSector([0x00, 0xFE, directoryCylinder], DOUBLE_DENSITY_LOAD_ADDRESS);
        const given = plan.bootSectors?.map(bootSector => patchDirectoryCylinder(bootSector, 2, directoryCylinder));
        const bootSectors = given ?? [synthetic, synthetic];
        writePartitionSector(partition, 0, 0, bootSectors[0]);
        writePartitionSector(partition, 0, 1, bootSectors[1]);

        // The system information sector has the release number and, on LS-DOS, the name. Then comes a
        // copy of the GAT, which nothing updates afterward.
        const systemInfo = new Uint8Array(BYTES_PER_SECTOR);
        systemInfo[0] = plan.version;
        if (plan.dos === TrsdosFormatDos.LSDOS_6_3) {
            writeText(systemInfo, 0x10, plan.name);
        }
        writePartitionSector(partition, 0, 2, systemInfo);
        const gat = makePartitionGat(plan);
        writePartitionSector(partition, 0, 3, gat);

        // The directory: the GAT, the HIT, then BOOT/SYS and DIR/SYS in the first entry of the next two
        // sectors. The other directory sectors are still zeros.
        const hit = new Uint8Array(BYTES_PER_SECTOR);
        hit[0] = BOOT_SYS_HIT_BYTE;
        hit[1] = DIR_SYS_HIT_BYTE;
        const bootSys = makeSystemEntry(BOOT_SYS_ATTRIBUTES, "BOOT    SYS", plan.systemHashes,
            BOOT_SYS_SECTOR_COUNT, 0, 0, true);
        // DIR/SYS is the whole cylinder: offset 0, and all the granules.
        const dirSys = makeSystemEntry(DIR_SYS_ATTRIBUTES, "DIR     SYS", plan.systemHashes,
            plan.directorySectors, directoryCylinder, plan.granulesPerCylinder - 1, true);
        writePartitionSector(partition, directoryCylinder, 0, gat);
        writePartitionSector(partition, directoryCylinder, 1, hit);
        writePartitionSector(partition, directoryCylinder, 2, bootSys);
        writePartitionSector(partition, directoryCylinder, 3, dirSys);
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }

    return undefined;
}
