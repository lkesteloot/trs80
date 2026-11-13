import {
    Density, densityToString, type FloppyDisk, formatLdosPartition, formatTrsdosDataDisk, hardDiskDosProblem,
    HARD_DISK_SECTOR_SIZE, HARD_DISK_SECTORS_PER_TRACK, makeBlankHdvHardDisk, PARTITION_MAX_CYLINDERS,
    PARTITION_MIN_CYLINDERS, DosFamily, Trsdos, TrsdosFormatDos, type TrsdosFormatOptions, TrsdosRuleSet,
} from "trs80-base";
import {assertNever} from "z80-base";
import {DiskError} from "./DiskError.js";
import {extensionOf} from "./DiskImport.js";
import {DiskSession, DiskWritePurpose} from "./DiskSession.js";
import {
    describeSystemDiskTemplate, findSystemDiskTemplate, getDataDiskBootSectors, getHardDiskBootSectors,
    loadSystemDiskTemplate,
} from "./DiskTemplates.js";
import {pluralizeWithCount} from "./Plural.js";

// The operations behind the "create" and "format" commands: making blank or system floppies, making HDV
// hard disks with partitions, and formatting a floppy or a hard disk partition again.

/**
 * The file name extensions of other kinds of disk image, which "create" and "format" refuse to save a
 * DMK image under, since the file would then be misnamed.
 */
const OTHER_IMAGE_EXTENSIONS = [".jv1", ".jv3", ".dsk", ".hfe", ".imd", ".scp", ".hdv"];

/**
 * What the user chose for the disk to make, with what they left out undefined.
 */
export interface FormatRequest {
    /** The DOS to format for (the command's argument). */
    dos: TrsdosFormatDos | undefined;
    /** The number of cylinders (--cylinders). */
    cylinders: number | undefined;
    /** The number of sides, 1 or 2 (--sides). */
    sides: number | undefined;
    /** The density (--density). */
    density: Density | undefined;
    /** The TRS-80 model, which chooses LDOS's default density (--model). */
    model: 1 | 3 | 4 | undefined;
    /** The disk's name (--name). */
    name: string | undefined;
    /** The date to put on the disk (--date). */
    date: Date | undefined;
}

/**
 * The density that a disk gets when the options don't say, following {@link formatTrsdosDataDisk}.
 */
function effectiveDensity(formatOptions: TrsdosFormatOptions): Density {
    if (formatOptions.density !== undefined) {
        return formatOptions.density;
    }

    switch (formatOptions.dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return Density.SINGLE;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return Density.DOUBLE;
        case TrsdosFormatDos.LDOS_5_3:
            return formatOptions.model === 1 ? Density.SINGLE : Density.DOUBLE;
        default:
            assertNever(formatOptions.dos);
    }
}

/**
 * Make the blank disk, in memory, with the DOS's own boot sectors when we have them for that DOS and
 * density, so that it matches what the DOS's FORMAT makes. Otherwise the disk gets a boot sector of ours.
 *
 * @param session the session, which supplies the templates.
 * @param formatOptions what to make.
 * @return the disk.
 * @throws DiskError with the reason, if the DOS can't make a disk like that.
 */
function makeBlankDisk(session: DiskSession, formatOptions: TrsdosFormatOptions): FloppyDisk {
    const bootSectors = getDataDiskBootSectors(session.templates, formatOptions.dos, effectiveDensity(formatOptions));
    const floppy = formatTrsdosDataDisk({... formatOptions, bootSectors});
    if (typeof floppy === "string") {
        throw new DiskError(floppy);
    }
    return floppy;
}

/**
 * The number of cylinders a new disk gets when the user doesn't say: 40, except 35 for TRSDOS 2.3.
 */
function defaultCylinders(dos: TrsdosFormatDos): number {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return 35;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return 40;
        default:
            assertNever(dos);
    }
}

/**
 * Whether a DOS lets the user choose the density, so that a disk being formatted can keep its own.
 */
function choosesDensity(dos: TrsdosFormatDos): boolean {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.TRSDOS_1_3:
            return false;
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return true;
        default:
            assertNever(dos);
    }
}

/**
 * Check that the file that the session will save to can hold a DMK image, which is what these commands
 * make. A name with no extension, or with an unfamiliar one, is allowed.
 *
 * @param session the session.
 * @param message what to say if the name is that of another kind of image.
 * @throws DiskError with the message if the name has the extension of another kind of image.
 */
function requireDmkPathname(session: DiskSession, message: string): void {
    const extension = extensionOf(session.saveName).toLowerCase();
    if (OTHER_IMAGE_EXTENSIONS.includes(extension)) {
        throw new DiskError(message);
    }
}

/**
 * Describe a floppy's shape for the user, such as "40 cylinders, double-sided, double density".
 */
export function describeShape(floppy: FloppyDisk): string {
    const geometry = floppy.getGeometry();
    const density = geometry.modalDataDensity === undefined ? "unknown" : densityToString(geometry.modalDataDensity);
    return pluralizeWithCount(geometry.cylinderCount, "cylinder") + ", " +
        (geometry.sideCount === 1 ? "single" : "double") + "-sided, " + density + " density";
}

/**
 * Check that the request doesn't ask for a shape that differs from the system disk's, since the files on it
 * fix its shape.
 *
 * @param request what the user chose.
 * @param floppy the system disk.
 * @param description what the system disk is, such as "LS-DOS 6.3.1 system disk for the Model 4".
 * @throws DiskError if --cylinders, --sides or --density names something other than what the disk has.
 */
function checkSystemDiskShape(request: FormatRequest, floppy: FloppyDisk, description: string): void {
    const geometry = floppy.getGeometry();
    const conflicts: string[] = [];
    if (request.cylinders !== undefined && request.cylinders !== geometry.cylinderCount) {
        conflicts.push("--cylinders " + request.cylinders);
    }
    if (request.sides !== undefined && request.sides !== geometry.sideCount) {
        conflicts.push("--sides " + request.sides);
    }
    if (request.density !== undefined && request.density !== geometry.modalDataDensity) {
        conflicts.push("--density " + densityToString(request.density));
    }

    if (conflicts.length > 0) {
        throw new DiskError("The " + description + " is " + describeShape(floppy) + ", so create --system can't " +
            "use " + conflicts.join(" or "));
    }
}

/**
 * What the user asked "create" to make as a floppy.
 */
export interface CreateFloppyRequest {
    /** What the disk is like. The DOS is required. */
    format: FormatRequest & {dos: TrsdosFormatDos};
    /** Whether to copy the DOS's system disk instead of making a blank one (--system). */
    system: boolean;
    /** Whether to remove the files that aren't system files, which needs system (--minimal). */
    minimal: boolean;
    /** Whether to replace a disk that the session already has, in memory (--force). */
    force: boolean;
}

/**
 * Where a system floppy came from, and what was removed from it.
 */
export interface SystemDiskCopy {
    /** What the system disk is, such as "LS-DOS 6.3.1 system disk for the Model 4". */
    description: string;
    /** The system disk's shape, such as "40 cylinders, double-sided, double density". */
    shape: string;
    /** The names of the files that --minimal removed, as shown ("HELLO/BAS"), empty if it wasn't given or none went. */
    removedNames: string[];
}

/**
 * What createFloppy() did.
 */
export interface CreateFloppyResult {
    /** Whether the session had a disk, which the new one replaced in memory. */
    replaced: boolean;
    /** What the disk was copied from, or undefined for a blank data disk. */
    systemCopy: SystemDiskCopy | undefined;
}

/**
 * Whether the file that the session will save to is named as a hard disk image, so that "create" makes a hard
 * disk and not a floppy.
 */
export function isHardDiskPathname(session: DiskSession): boolean {
    return extensionOf(session.saveName).toLowerCase() === HARD_DISK_EXTENSION;
}

/**
 * Do "create" on a floppy: make a new, blank, formatted data disk with the DOS's usual layout, as its FORMAT would
 * (with its boot sectors when we have them), or with system a copy of the DOS's system disk, optionally trimmed to
 * its system files, with the name and date changed. The disk goes in the session as if it had been opened, with
 * changes pending. This only works when the session has no disk, or with force, which replaces the session's disk
 * in memory. The image is a DMK one, so a file name for another kind is refused. If anything fails (a bad
 * name for a system disk, say), the session's disk is unchanged.
 *
 * @param session the session.
 * @param request what to make.
 * @throws DiskError if the request doesn't make a disk, or there's a disk already and no force.
 */
export function createFloppy(session: DiskSession, request: CreateFloppyRequest): CreateFloppyResult {
    if (request.minimal && !request.system) {
        throw new DiskError("--minimal only applies with --system");
    }

    requireDmkPathname(session, "create makes DMK images; name the file .dmk");
    if (session.hasDisk() && !request.force) {
        throw new DiskError(session.name + " already has a disk; use --force to replace it with a new blank one");
    }

    const choices = request.format;
    if (request.system) {
        return createSystemDisk(session, choices, request.minimal);
    }

    const floppy = makeBlankDisk(session, {
        dos: choices.dos,
        model: choices.model,
        density: choices.density,
        cylinders: choices.cylinders ?? defaultCylinders(choices.dos),
        sides: choices.sides ?? 1,
        name: choices.name,
        date: choices.date,
    });

    const replaced = session.hasDisk();
    session.setFloppy(floppy);
    return {replaced, systemCopy: undefined};
}

/**
 * Make the session's disk a copy of a DOS's system disk, for "create --system".
 *
 * @param session the session, which has had its checks for replacing a disk.
 * @param choices what the user chose, including the DOS.
 * @param minimal whether to remove the files that aren't system files.
 * @throws DiskError if the options don't fit the system disk or the changes can't be made, in which case the
 * session's disk is unchanged.
 */
function createSystemDisk(session: DiskSession, choices: FormatRequest & {dos: TrsdosFormatDos},
                          minimal: boolean): CreateFloppyResult {

    const template = findSystemDiskTemplate(choices.dos, choices.model);
    const description = describeSystemDiskTemplate(template);
    const floppy = loadSystemDiskTemplate(session.templates, template);
    checkSystemDiskShape(choices, floppy, description);

    // Make the changes in a session of the copy's own, so that if one fails, the session's disk is left alone.
    const copy = DiskSession.fromBinary(template.name + ".dmk", floppy.binary);
    const removedNames: string[] = [];
    if (choices.name !== undefined || choices.date !== undefined || minimal) {
        copy.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            if (choices.name !== undefined || choices.date !== undefined) {
                writer.setDiskInfo({name: choices.name, date: choices.date});
            }
            if (minimal) {
                // Keep the system files, which are the ones the DOS needs to boot.
                for (const dirEntry of writer.getFiles().filter(dirEntry => !dirEntry.isSystemFile())) {
                    writer.deleteFile(dirEntry);
                    removedNames.push(dirEntry.getFilename("/"));
                }
            }
        });
    }

    const replaced = session.hasDisk();
    session.setFloppy(copy.floppy);
    return {replaced, systemCopy: {description, shape: describeShape(floppy), removedNames}};
}

/**
 * The file name extension of the hard disk images that "create" makes, which decides that it makes one.
 */
const HARD_DISK_EXTENSION = ".hdv";

/**
 * What a new hard disk has when the user doesn't say, which is what FreHD makes for a new image.
 */
export const DEFAULT_HARD_DISK_HEADS = 6;
export const DEFAULT_HARD_DISK_CYLINDERS = 840;

/**
 * The most partitions that "create" names with the letters A to Z.
 */
export const MAX_CREATED_PARTITIONS = 26;

/**
 * The name of the nth partition (from 0) that "create" makes: HARDA, HARDB, and so on.
 */
function createdPartitionName(index: number): string {
    return "HARD" + String.fromCharCode(65 + index);
}

/**
 * The size of a hard disk for the user, such as "39 MB".
 */
export function describeHardDiskSize(heads: number, cylinders: number): string {
    const bytes = heads*cylinders*HARD_DISK_SECTORS_PER_TRACK*HARD_DISK_SECTOR_SIZE;
    return bytes >= 1024*1024 ? Math.round(bytes/(1024*1024)).toLocaleString() + " MB" :
        Math.round(bytes/1024).toLocaleString() + " KB";
}

/**
 * What the user asked "create" to make as a hard disk image.
 */
export interface CreateHardDiskRequest {
    /** The DOS to format equal partitions for, or undefined to make a blank disk with none. */
    dos: TrsdosFormatDos | undefined;
    /** The number of heads (--heads), or undefined for {@link DEFAULT_HARD_DISK_HEADS}. */
    heads: number | undefined;
    /** The number of cylinders (--cylinders), or undefined for {@link DEFAULT_HARD_DISK_CYLINDERS}. */
    cylinders: number | undefined;
    /** How many partitions (--partitions), or undefined for as few as keep each at the most cylinders. */
    partitions: number | undefined;
    /** The TRS-80 model, which chooses the boot sector (--model). */
    model: 1 | 3 | 4 | undefined;
    /** The name of the partition, if there's only one (--name). */
    name: string | undefined;
    /** The date to put on the partitions (--date). */
    date: Date | undefined;
    /** Whether to replace a disk that the session already has, in memory (--force). */
    force: boolean;
}

/**
 * What createHardDisk() did.
 */
export interface CreateHardDiskResult {
    /** Whether the session had a disk, which the new one replaced in memory. */
    replaced: boolean;
    /** The disk's cylinders. */
    cylinders: number;
    /** The disk's heads. */
    heads: number;
    /** The disk's size for the user, such as "39 MB". */
    size: string;
    /** The number of partitions made, which is 0 for a blank disk. */
    partitionCount: number;
}

/**
 * Do "create" on a hard disk image: make a blank HDV disk of the heads and cylinders given, and with a DOS also
 * format equal partitions, split by cylinder, in it. The disk goes in the session, with its partitions found.
 *
 * @param session the session, which has had no checks yet.
 * @param request what to make.
 * @throws DiskError if the request doesn't make a disk, or there's a disk already and no force.
 */
export function createHardDisk(session: DiskSession, request: CreateHardDiskRequest): CreateHardDiskResult {
    const dos = request.dos;
    const heads = request.heads ?? DEFAULT_HARD_DISK_HEADS;
    const cylinders = request.cylinders ?? DEFAULT_HARD_DISK_CYLINDERS;
    const requestedPartitions = request.partitions;
    if (dos !== undefined) {
        const dosProblem = hardDiskDosProblem(dos);
        if (dosProblem !== undefined) {
            throw new DiskError(dosProblem);
        }
    }
    if (session.hasDisk() && !request.force) {
        throw new DiskError(session.name + " already has a disk; use --force to replace it with a new blank one");
    }

    let hardDisk;
    try {
        hardDisk = makeBlankHdvHardDisk({heads, cylinders, date: request.date});
    } catch (e) {
        throw new DiskError(e instanceof Error ? e.message : String(e));
    }

    let partitionCount = 0;
    if (dos !== undefined) {
        // Equal partitions from cylinder 0, with any leftover cylinders free.
        partitionCount = requestedPartitions ?? Math.ceil(cylinders/PARTITION_MAX_CYLINDERS);
        if (partitionCount < 1 || partitionCount > MAX_CREATED_PARTITIONS) {
            throw new DiskError("--partitions is from 1 to " + MAX_CREATED_PARTITIONS + ", not " + partitionCount);
        }
        const partitionCylinders = Math.floor(cylinders/partitionCount);
        if (partitionCylinders > PARTITION_MAX_CYLINDERS) {
            throw new DiskError(pluralizeWithCount(partitionCount, "partition") + " of " + cylinders + " cylinders " +
                "would be " + partitionCylinders + " cylinders each, and a partition has at most " +
                PARTITION_MAX_CYLINDERS + "; use --partitions " + Math.ceil(cylinders/PARTITION_MAX_CYLINDERS) +
                " or more");
        }
        if (partitionCylinders < PARTITION_MIN_CYLINDERS) {
            throw new DiskError(pluralizeWithCount(partitionCount, "partition") + " of " + cylinders + " cylinders " +
                "would be " + partitionCylinders + " cylinders each, and a partition has at least " +
                PARTITION_MIN_CYLINDERS + (requestedPartitions === undefined ?
                    "; the disk is too small to format" : "; use fewer partitions"));
        }
        if (partitionCount > 1 && request.name !== undefined) {
            throw new DiskError("--name names one partition, but this makes " + partitionCount +
                " (HARDA, HARDB, ...); leave it out, and use \"label\" to rename them afterward");
        }

        const bootSectors = getHardDiskBootSectors(session.templates, dos, request.model);
        for (let i = 0; i < partitionCount; i++) {
            const message = formatLdosPartition(hardDisk, {
                dos,
                startCylinder: i*partitionCylinders,
                startHead: 0,
                cylinders: partitionCylinders,
                heads,
                name: request.name ?? createdPartitionName(i),
                date: request.date,
                bootSectors,
            });
            if (message !== undefined) {
                throw new DiskError(message);
            }
        }
    }

    const replaced = session.hasDisk();
    session.setHardDisk(hardDisk);
    return {replaced, cylinders, heads, size: describeHardDiskSize(heads, cylinders), partitionCount};
}

/**
 * The DOS of the session's disk, if it's one that "format" can make, going by the rules that the session
 * would write the disk by (so the global --dos counts).
 *
 * @return the DOS, or undefined if the disk has no TRSDOS-family file system or a DOS we can't format.
 */
export function getSessionFormatDos(session: DiskSession): TrsdosFormatDos | undefined {
    const ruleSet = session.getWriteGate()?.ruleSet;
    if (ruleSet === undefined) {
        return undefined;
    }

    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
            return TrsdosFormatDos.TRSDOS_2_3;
        case TrsdosRuleSet.TRSDOS_1_3:
            return TrsdosFormatDos.TRSDOS_1_3;
        case TrsdosRuleSet.LDOS_5:
            return TrsdosFormatDos.LDOS_5_3;
        case TrsdosRuleSet.TRSDOS_6: {
            // TRSDOS 6 and LS-DOS 6 share their rules, so go by the name. Anything but LS-DOS gets
            // TRSDOS 6.2, the one the rules are named for.
            const fileSystem = session.fileSystem;
            const isLsdos = fileSystem instanceof Trsdos && fileSystem.dosName.family === DosFamily.LS_DOS;
            return isLsdos ? TrsdosFormatDos.LSDOS_6_3 : TrsdosFormatDos.TRSDOS_6_2;
        }
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.TRSDOS_2_7:
        case TrsdosRuleSet.NEWDOS_80:
        case TrsdosRuleSet.MULTIDOS:
            // We have no NEWDOS/80 or MultiDOS boot sector to write.
            return undefined;
        default:
            assertNever(ruleSet);
    }
}

/**
 * How many files "format" would erase from the session's disk: the user files, plus the system files
 * other than the DOS's own BOOT/SYS and DIR/SYS (which every disk has).
 *
 * @return the number of files, or undefined if the disk has no file system we recognize, so that we
 * can't say.
 */
export function countFilesToErase(session: DiskSession): number | undefined {
    const fileSystem = session.fileSystem;
    if (fileSystem === undefined) {
        return undefined;
    }

    const userFiles = fileSystem.getDirEntries(false).length;
    const allFiles = fileSystem.getDirEntries(true);
    const otherSystemFiles = allFiles.filter(dirEntry => {
        const name = dirEntry.getFilename("/");
        return dirEntry.isSystemFile() && name !== "BOOT/SYS" && name !== "DIR/SYS";
    }).length;

    return userFiles + otherSystemFiles;
}

/**
 * What the user asked "format" to make on a floppy.
 */
export interface FormatFloppyRequest {
    /** What the disk is like. The DOS is required: the caller has resolved a default (see {@link getSessionFormatDos}). */
    format: FormatRequest & {dos: TrsdosFormatDos};
    /** Whether to erase a disk that has files, or whose files we can't count (--force). */
    force: boolean;
}

/**
 * Do "format" on a floppy: replace the disk in memory with a blank one, as "create" makes. The cylinders and
 * sides default to the current disk's. The result is a DMK image, so a file name for another kind is refused. If
 * the disk has files then force is required.
 *
 * @param session the session, whose disk is a floppy.
 * @param request what to make.
 * @throws DiskError if the disk has files and there's no force, or the DOS can't make a disk like that.
 */
export function formatFloppy(session: DiskSession, request: FormatFloppyRequest): void {
    const choices = request.format;
    const dos = choices.dos;

    requireDmkPathname(session, "format makes the image a DMK image; give -o NEW.dmk to save to a .dmk file instead");

    const fileCount = countFilesToErase(session);
    if (!request.force) {
        if (fileCount === undefined) {
            throw new DiskError("The disk has no file system that we recognize, so we can't say what format " +
                "would erase; use --force to format it anyway");
        }
        if (fileCount > 0) {
            throw new DiskError("format would erase " + pluralizeWithCount(fileCount, "file") +
                " from the disk; use --force to go ahead");
        }
    }

    const geometry = session.floppy.getGeometry();
    // The LDOS line takes either density, so keep the disk's own unless told otherwise.
    const keepsDensity = choices.density === undefined && choices.model === undefined && choosesDensity(dos);
    const floppy = makeBlankDisk(session, {
        dos,
        model: choices.model,
        density: keepsDensity ? geometry.modalDataDensity : choices.density,
        cylinders: choices.cylinders ?? geometry.cylinderCount,
        sides: choices.sides ?? geometry.sideCount,
        name: choices.name,
        date: choices.date,
    });

    session.setFloppy(floppy);
}

/**
 * What the user asked "format" to do to a hard disk's chosen partition.
 */
export interface FormatHardDiskRequest {
    /** The DOS to format for, which must be one that hard disks can have. */
    dos: TrsdosFormatDos;
    /** The TRS-80 model, which chooses the boot sector (--model). */
    model: 1 | 3 | 4 | undefined;
    /** The new name, or undefined to keep the partition's (--name). */
    name: string | undefined;
    /** The date to put on the partition, or undefined for today (--date). */
    date: Date | undefined;
    /** Whether to erase a partition that has files, and to write to a write-protected image (--force). */
    force: boolean;
}

/**
 * What formatHardDiskPartition() did.
 */
export interface FormatHardDiskResult {
    /** What the partition is called in messages, such as "partition 2 (GAMES)". */
    label: string;
    /** Where the partition is on the disk, such as "cylinders 0-39, heads 0-5". */
    location: string;
}

/**
 * Do "format" on a hard disk: format the chosen partition again, in the same place with the same size and
 * granules, so that it's an empty data partition.
 *
 * @param session the session, whose disk is a hard disk.
 * @param request what to make.
 * @throws DiskError if no partition is chosen, the DOS isn't one that hard disks can have, the partition has
 * files and there's no force, or the disk can't be written.
 */
export function formatHardDiskPartition(session: DiskSession, request: FormatHardDiskRequest): FormatHardDiskResult {
    session.checkPartitionsCanChange();
    const selected = session.getSelectedPartition();
    const number = session.selectedPartitionNumber;
    const dos = request.dos;
    const dosProblem = hardDiskDosProblem(dos);
    if (dosProblem !== undefined) {
        throw new DiskError(dosProblem);
    }

    const label = "partition " + number + " (" + (selected.diskName === "" ? "no name" : selected.diskName) + ")";
    const fileCount = countFilesToErase(session);
    if (!request.force) {
        if (fileCount === undefined) {
            throw new DiskError("The " + label + " has no file system that we recognize, so we can't say what format " +
                "would erase; use --force to format it anyway");
        }
        if (fileCount > 0) {
            throw new DiskError("format would erase " + pluralizeWithCount(fileCount, "file") + " from " + label +
                "; use --force to go ahead");
        }
    }

    const partition = selected.partition;
    const location = {cylinderOffset: partition.cylinderOffset, headOffset: partition.headOffset};
    session.changeHardDisk(hardDisk => {
        const message = formatLdosPartition(hardDisk, {
            dos,
            startCylinder: partition.cylinderOffset,
            startHead: partition.headOffset,
            cylinders: partition.cylinderCount,
            heads: partition.headCount,
            granulesPerCylinder: selected.trsdos.granulesPerLump,
            name: request.name ?? (selected.diskName === "" ? undefined : selected.diskName),
            date: request.date,
            bootSectors: getHardDiskBootSectors(session.templates, dos, request.model),
        });
        if (message !== undefined) {
            throw new DiskError(message);
        }
    }, location, request.force);

    return {label, location: partition.describeLocation()};
}
