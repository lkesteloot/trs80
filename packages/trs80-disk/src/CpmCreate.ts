import {
    Cpm, CpmCreateError, type CpmDiskOptions, CpmSystemKind, type CpmVerifiedLayout, defaultCpmSystemKind, Density,
    type DmkFloppyDisk, type FloppyDisk, findCpmDataLayout, findCpmVerifiedLayout, findCpmVerifiedLayoutById,
    makeCpmDisk,
} from "trs80-base";
import {assertNever} from "z80-base";
import {countFilesToErase, describeShape, requireDmkPathname, type SystemDiskCopy} from "./DiskCreate.js";
import {DiskError} from "./DiskError.js";
import {DiskSession} from "./DiskSession.js";
import {
    describeMontezumaSystemDisk, getMontezumaNoSystemBootSector, getMontezumaSystemTracks, loadMontezumaSystemDisk,
} from "./DiskTemplates.js";
import {pluralizeWithCount} from "./Plural.js";

// The operations behind "create cpm" and "format cpm": making Montezuma Micro CP/M 2.2 disks in one of its presets
// (the verified layouts of trs80-base's CpmWriteGate.ts). They're kept apart from DiskCreate.ts's TRSDOS-family
// operations, since a CP/M disk has none of what those assume: no GAT or HIT, no granules, and no disk name or date.
// See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.

/**
 * The preset that "create cpm --system" makes: the system disk's own.
 */
const SYSTEM_DISK_PRESET_ID = "mm-system";

/**
 * What the user chose for the CP/M disk to make, with what they left out undefined.
 */
export interface CpmDiskRequest {
    /** The preset (--cpm-format), or undefined to pick one from the sides and cylinders. */
    preset: CpmVerifiedLayout | undefined;
    /** The number of sides, 1 or 2 (--sides). */
    sides: number | undefined;
    /** The number of cylinders (--cylinders). */
    cylinders: number | undefined;
    /** The density (--density), which can only be double. */
    density: Density | undefined;
    /**
     * A disk to copy the system tracks from (--system-from), in place of the preset's usual ones. It must read as
     * the same preset, since the system tracks hold the drive configuration.
     */
    systemFrom: FloppyDisk | undefined;
}

/**
 * What the reserved tracks of a new CP/M disk got.
 */
export enum CpmSystemTracks {
    /** Nothing: the preset is a data format, with no reserved tracks. */
    NONE,

    /**
     * The two system tracks of the Montezuma BIOS 2.32 system, configured by Montezuma's CONFIG for a drive of the
     * preset's shape, with no startup command, so that the disk boots, as SYSGEN leaves it.
     */
    BIOS_2_32,

    /** FORMAT's own no-system boot sector in track 0's first sector, and 0xE5 in the rest, as FORMAT leaves it. */
    NO_SYSTEM_BOOT_SECTOR,

    /** The system tracks of a disk that the user gave (--system-from). */
    COPIED,

    /** The system tracks of the disk that was there (--keep-system). */
    KEPT,
}

/**
 * Describe what a new CP/M disk's reserved tracks got, for the user, such as "the BIOS 2.32 system tracks, configured
 * for this layout".
 */
export function cpmSystemTracksToString(tracks: CpmSystemTracks): string {
    switch (tracks) {
        case CpmSystemTracks.NONE:
            return "no system tracks (a data format)";
        case CpmSystemTracks.BIOS_2_32:
            return "the BIOS 2.32 system tracks, configured for this layout";
        case CpmSystemTracks.NO_SYSTEM_BOOT_SECTOR:
            return "FORMAT's no-system boot sector, as an unSYSGENed system format has";
        case CpmSystemTracks.COPIED:
            return "the system tracks of the disk given with --system-from";
        case CpmSystemTracks.KEPT:
            return "the system tracks that the disk already had";
        default:
            assertNever(tracks);
    }
}

/**
 * What the user asked "create cpm" to make.
 */
export interface CreateCpmRequest extends CpmDiskRequest {
    /** Whether to copy the whole Montezuma 2.32 system disk, with its files, instead of a blank disk (--system). */
    system: boolean;
    /** Whether to replace a disk that the session already has, in memory (--force). */
    force: boolean;
}

/**
 * What createCpmFloppy() did.
 */
export interface CreateCpmResult {
    /** Whether the session had a disk, which the new one replaced in memory. */
    replaced: boolean;
    /** The preset that the new disk has. */
    preset: CpmVerifiedLayout;
    /** What the reserved tracks got. */
    systemTracks: CpmSystemTracks;
    /** Where the disk was copied from, if it's the system disk (--system), and otherwise undefined. */
    systemCopy: SystemDiskCopy | undefined;
}

/**
 * What the user asked "format cpm" to do.
 */
export interface FormatCpmRequest extends CpmDiskRequest {
    /** Whether to keep the disk's own system tracks (--keep-system). */
    keepSystem: boolean;
    /** Whether to erase a disk that has files, or whose files we can't count (--force). */
    force: boolean;
}

/**
 * What formatCpmFloppy() did.
 */
export interface FormatCpmResult {
    /** The preset that the formatted disk has. */
    preset: CpmVerifiedLayout;
    /** What the reserved tracks got. */
    systemTracks: CpmSystemTracks;
}

/**
 * Check that the user's sides, cylinders, and density agree with a preset. The preset decides them, so asking for
 * others is a conflict, as with the TRSDOS-family system disks.
 *
 * @param preset the preset.
 * @param request what the user chose.
 * @throws DiskError if --sides, --cylinders, or --density disagrees with the preset or isn't allowed.
 */
function checkRequestAgreesWithPreset(preset: CpmVerifiedLayout, request: CpmDiskRequest): void {
    const conflicts: string[] = [];
    if (request.sides !== undefined && request.sides !== preset.sides) {
        conflicts.push("--sides " + request.sides);
    }
    if (request.cylinders !== undefined && request.cylinders !== preset.cylinders) {
        conflicts.push("--cylinders " + request.cylinders);
    }
    if (conflicts.length > 0) {
        throw new DiskError(preset.id + " has " + pluralizeWithCount(preset.sides, "side") + " and " +
            pluralizeWithCount(preset.cylinders, "cylinder") + ", so it can't be made with " +
            conflicts.join(" or ") + "; leave that out, or choose another preset");
    }
}

/**
 * Check that the density is one that CP/M disks here can have.
 *
 * @throws DiskError if the user asked for single density.
 */
function checkDensity(request: CpmDiskRequest): void {
    if (request.density !== undefined && request.density !== Density.DOUBLE) {
        throw new DiskError("Montezuma Micro CP/M disks are double density, so --density can only be double");
    }
}

/**
 * The preset to make when the user didn't name one: the data format with the sides and cylinders, as a
 * disk that Montezuma's FORMAT makes for data.
 *
 * @param sides the sides.
 * @param cylinders the cylinders.
 * @throws DiskError if there's no data preset with that shape.
 */
function chooseDataPreset(sides: number, cylinders: number): CpmVerifiedLayout {
    const preset = findCpmDataLayout(sides, cylinders);
    if (preset === undefined) {
        throw new DiskError("There's no CP/M data format with " + pluralizeWithCount(cylinders, "cylinder") +
            " and " + pluralizeWithCount(sides, "side") + ": Montezuma's have 40 or 80 cylinders, and 1 or 2 sides. " +
            "Name a preset with --cpm-format (\"help cpm-format\" lists them)");
    }
    return preset;
}

/**
 * Run something that makes a CP/M disk, turning its failures into errors for the user.
 *
 * @param make makes the disk.
 * @throws DiskError with the message of a {@link CpmCreateError} that make raised.
 */
function makeOrExplain(make: () => DmkFloppyDisk): DmkFloppyDisk {
    try {
        return make();
    } catch (e) {
        if (e instanceof CpmCreateError) {
            throw new DiskError(e.message);
        }
        throw e;
    }
}

/**
 * Make a CP/M disk in a preset, with the reserved tracks that the preset gets by default or from a disk that the
 * user gave. The templates come from the session.
 *
 * @param session the session, which supplies the templates.
 * @param preset the preset.
 * @param systemFrom a disk to copy the system tracks from, or undefined for the preset's usual ones.
 * @param systemFromLayout the layout of that disk if the caller knows it, or undefined to find it by decoding.
 * @param copiedTracks what to call the tracks when they're copied (COPIED or KEPT).
 * @returns the disk, and what its reserved tracks got.
 * @throws DiskError if the tracks to copy don't fit the preset, the preset has no system tracks to copy to, or a
 * template isn't in this build.
 */
function makeCpmDiskForSession(session: DiskSession, preset: CpmVerifiedLayout, systemFrom: FloppyDisk | undefined,
                               systemFromLayout: CpmVerifiedLayout | undefined, copiedTracks: CpmSystemTracks):
    {floppy: DmkFloppyDisk, systemTracks: CpmSystemTracks} {

    if (systemFrom !== undefined) {
        if (preset.reservedTracks === 0) {
            throw new DiskError(preset.id + " is a data format, with no system tracks to copy to");
        }
        const options: CpmDiskOptions = {systemTracksFrom: systemFrom, systemTracksFromLayout: systemFromLayout};
        return {floppy: makeOrExplain(() => makeCpmDisk(preset, options)), systemTracks: copiedTracks};
    }

    const kind = defaultCpmSystemKind(preset);
    switch (kind) {
        case CpmSystemKind.NONE:
            return {floppy: makeOrExplain(() => makeCpmDisk(preset)), systemTracks: CpmSystemTracks.NONE};

        case CpmSystemKind.BIOS_SYSTEM: {
            const systemTracks = getMontezumaSystemTracks(session.templates, preset.id);
            if (systemTracks === undefined) {
                throw new DiskError("The system tracks for " + preset.id + " aren't in this build of the tool");
            }
            return {
                floppy: makeOrExplain(() => makeCpmDisk(preset, {systemTracks})),
                systemTracks: CpmSystemTracks.BIOS_2_32,
            };
        }

        case CpmSystemKind.NO_SYSTEM_BOOT_SECTOR: {
            const bootSector = getMontezumaNoSystemBootSector(session.templates, preset.sectorSize);
            if (bootSector === undefined) {
                throw new DiskError("The boot sector for " + preset.id + " isn't in this build of the tool");
            }
            return {
                floppy: makeOrExplain(() => makeCpmDisk(preset, {noSystemBootSector: bootSector})),
                systemTracks: CpmSystemTracks.NO_SYSTEM_BOOT_SECTOR,
            };
        }

        default:
            assertNever(kind);
    }
}

/**
 * Do "create cpm": make a new, blank Montezuma Micro CP/M disk in a preset (a data format unless the request names a
 * system one), or with system a copy of the Montezuma 2.32 system disk with its files. The disk goes in the session
 * as if it had been opened with its preset named (see {@link DiskSession.setCpmFloppy}), with changes pending. This
 * only works when the session has no disk, or with force, which replaces the session's disk in memory. The image is a
 * DMK one, so a file name for another kind is refused. If anything fails, the session's disk is unchanged.
 *
 * @param session the session.
 * @param request what to make.
 * @throws DiskError if the request doesn't make a disk, or there's a disk already and no force.
 */
export function createCpmFloppy(session: DiskSession, request: CreateCpmRequest): CreateCpmResult {
    requireDmkPathname(session, "create makes DMK images; name the file .dmk");
    if (session.hasDisk() && !request.force) {
        throw new DiskError(session.name + " already has a disk; use --force to replace it with a new blank one");
    }
    checkDensity(request);

    if (request.system) {
        return createCpmSystemDisk(session, request);
    }

    const preset = request.preset ?? chooseDataPreset(request.sides ?? 1, request.cylinders ?? 40);
    checkRequestAgreesWithPreset(preset, request);
    const {floppy, systemTracks} = makeCpmDiskForSession(session, preset, request.systemFrom, undefined,
        CpmSystemTracks.COPIED);

    const replaced = session.hasDisk();
    session.setCpmFloppy(floppy, preset);
    return {replaced, preset, systemTracks, systemCopy: undefined};
}

/**
 * Make the session's disk a copy of the Montezuma 2.32 system disk, for "create cpm --system".
 *
 * @param session the session, which has had its checks for replacing a disk.
 * @param request what the user chose, with system set.
 * @throws DiskError if the options don't fit the system disk, in which case the session's disk is unchanged.
 */
function createCpmSystemDisk(session: DiskSession, request: CreateCpmRequest): CreateCpmResult {
    if (request.systemFrom !== undefined) {
        throw new DiskError("--system-from can't be used with --system, which copies the whole system disk");
    }
    const preset = findCpmVerifiedLayoutById(SYSTEM_DISK_PRESET_ID);
    if (preset === undefined) {
        throw new Error("No preset named " + SYSTEM_DISK_PRESET_ID);
    }

    const floppy = loadMontezumaSystemDisk(session.templates);
    const description = describeMontezumaSystemDisk();
    if (request.preset !== undefined && request.preset !== preset) {
        throw new DiskError("The " + description + " is " + describeShape(floppy) + ", which is " + preset.id +
            ", so create --system can't use --cpm-format " + request.preset.id);
    }
    checkRequestAgreesWithPreset(preset, request);

    const replaced = session.hasDisk();
    session.setCpmFloppy(floppy, preset);
    return {
        replaced,
        preset,
        systemTracks: CpmSystemTracks.BIOS_2_32,
        systemCopy: {description, shape: describeShape(floppy), removedNames: []},
    };
}

/**
 * How many files "format cpm" would erase from the session's disk: all of a CP/M disk's (system files too), or the
 * count that "format" gives for another file system.
 *
 * @return the number of files, or undefined if the disk has no file system we recognize, so that we can't say.
 */
function countCpmFormatFilesToErase(session: DiskSession): number | undefined {
    const fileSystem = session.fileSystem;
    if (fileSystem instanceof Cpm) {
        return fileSystem.getDirEntries(true).length;
    }
    return countFilesToErase(session);
}

/**
 * The preset that "format cpm" makes, when the user didn't give a system disk. With a preset named, that one. With
 * a sides or cylinders given, the data format with them (the other defaulting to the disk's). Otherwise the disk's
 * own preset if it has one, and else the data format of its own sides and cylinders.
 *
 * @param session the session, whose disk is a floppy.
 * @param request what the user chose.
 * @throws DiskError if there's no preset that fits what the user asked for or the disk is.
 */
function chooseFormatPreset(session: DiskSession, request: CpmDiskRequest): CpmVerifiedLayout {
    if (request.preset !== undefined) {
        checkRequestAgreesWithPreset(request.preset, request);
        return request.preset;
    }

    const fileSystem = session.fileSystem;
    const ownPreset = fileSystem instanceof Cpm ? findCpmVerifiedLayout(fileSystem) : undefined;
    const sizeGiven = request.sides !== undefined || request.cylinders !== undefined;
    if (ownPreset !== undefined && !sizeGiven) {
        return ownPreset;
    }

    const geometry = session.floppy.getGeometry();
    return chooseDataPreset(request.sides ?? geometry.sideCount, request.cylinders ?? geometry.cylinderCount);
}

/**
 * Do "format cpm": replace the disk in memory with a blank Montezuma Micro CP/M disk. The preset is the one named,
 * else a data format with the sides and cylinders given, else the disk's own preset, else the data format of the
 * disk's own sides and cylinders. The system tracks are erased too, as Montezuma's FORMAT does, unless keepSystem
 * (or systemFrom) says to copy some. The result is a DMK image, so a file name for another kind is refused. If the
 * disk has files then force is required.
 *
 * @param session the session, whose disk is a floppy.
 * @param request what to make.
 * @throws DiskError if the disk has files and there's no force, or the request doesn't make a disk.
 */
export function formatCpmFloppy(session: DiskSession, request: FormatCpmRequest): FormatCpmResult {
    requireDmkPathname(session, "format makes the image a DMK image; give -o NEW.dmk to save to a .dmk file instead");
    checkDensity(request);
    if (request.keepSystem && request.systemFrom !== undefined) {
        throw new DiskError("--keep-system and --system-from both say where the system tracks come from; use one");
    }

    const fileCount = countCpmFormatFilesToErase(session);
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

    const preset = chooseFormatPreset(session, request);

    let systemFrom = request.systemFrom;
    let systemFromLayout: CpmVerifiedLayout | undefined = undefined;
    let copiedTracks = CpmSystemTracks.COPIED;
    if (request.keepSystem) {
        // The session's own reading of its disk, which the user may have named, and not a fresh detection.
        const fileSystem = session.fileSystem;
        systemFromLayout = fileSystem instanceof Cpm ? findCpmVerifiedLayout(fileSystem) : undefined;
        if (systemFromLayout === undefined) {
            throw new DiskError("--keep-system needs a disk that reads as one of the CP/M presets, and this one " +
                "doesn't; name its layout with --cpm-format, or use --system-from to give system tracks");
        }
        if (preset.reservedTracks === 0) {
            throw new DiskError(preset.id + " is a data format, with no system tracks, so there's nothing for " +
                "--keep-system to keep");
        }
        systemFrom = session.floppy;
        copiedTracks = CpmSystemTracks.KEPT;
    }

    const {floppy, systemTracks} = makeCpmDiskForSession(session, preset, systemFrom, systemFromLayout, copiedTracks);
    session.setCpmFloppy(floppy, preset);
    return {preset, systemTracks};
}
