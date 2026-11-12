import {assertNever} from "z80-base";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {FloppyDisk} from "./FloppyDisk.js";
import {type HardDisk} from "./HardDisk.js";
import {HardDiskPartition} from "./HardDiskPartition.js";
import {HdvHardDisk} from "./HdvHardDisk.js";
import {HfeFloppyDisk} from "./HfeFloppyDisk.js";
import {ImdFloppyDisk} from "./ImdFloppyDisk.js";
import {Jv1FloppyDisk, JV1_DIRECTORY_CYLINDER} from "./Jv1FloppyDisk.js";
import {Jv3FloppyDisk} from "./Jv3FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {isUnknownDosName, type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {
    checkTrsdos,
    type TrsdosCheckResult,
    TrsdosFindingSeverity,
    trsdosFindingKindSeverity,
} from "./TrsdosCheck.js";
import {
    identifyTrsdosRuleSet,
    ruleSetForDosName,
    TrsdosRuleSet,
    trsdosRuleSetLayout,
    trsdosRuleSetCliName,
} from "./TrsdosRuleSet.js";

// The sector count of a granule in the NEWDOS/80 candidates, which try any granules per lump.
const NEWDOS80_SECTORS_PER_GRANULE = 5;
// The range of granules per lump that the NEWDOS/80 candidates try.
const NEWDOS80_MIN_GRANULES_PER_LUMP = 2;
const NEWDOS80_MAX_GRANULES_PER_LUMP = 8;

// The number of cylinders that a hard disk partition's GAT has a byte for: bytes 0x00 to 0xCA, since
// 0xCB is the version. See "Partitions" in FLOPPY_FORMATS.md.
const HARD_DISK_GAT_CYLINDER_BYTES = 0xCB;

/**
 * How much we'll let a write tool do to a disk, by default (without the user forcing it).
 */
export enum TrsdosWriteAccess {
    /**
     * Any write is fine.
     */
    WRITABLE,

    /**
     * The layout is certain but the file system is damaged, so only a repair may write.
     */
    REPAIR_ONLY,

    /**
     * Nothing may write, not even a repair.
     */
    READ_ONLY,
}

/**
 * A short lowercase name for an access level, such as "repair-only".
 */
export function trsdosWriteAccessToString(access: TrsdosWriteAccess): string {
    switch (access) {
        case TrsdosWriteAccess.WRITABLE:
            return "writable";
        case TrsdosWriteAccess.REPAIR_ONLY:
            return "repair-only";
        case TrsdosWriteAccess.READ_ONLY:
            return "read-only";
        default:
            assertNever(access);
    }
}

/**
 * The reasons we might not let a tool write to a disk. They're declared in the order that
 * {@link TrsdosWriteGate.blockers} lists them.
 */
export enum TrsdosWriteBlockerKind {
    /**
     * We have no writer for this layout: lumps that aren't cylinders (NEWDOS/80 style), the TRSDOS 2.7
     * layout, a hard disk partition of a DOS other than LDOS 5 and TRSDOS 6, or a volume that is neither
     * a floppy nor a hard disk partition.
     */
    UNSUPPORTED_LAYOUT,

    /**
     * The disk doesn't say which DOS wrote it, and the user didn't name a rule set. The DOS decides
     * how files are written, and forcing can't choose it. See {@link TrsdosRuleSet}.
     */
    UNKNOWN_DOS,

    /**
     * The disk names a DOS that we have no rules for.
     */
    UNSUPPORTED_DOS,

    /**
     * The user named a rule set, but the disk names a different DOS: one that we have rules for, or one
     * that we don't.
     */
    DOS_MISMATCH,

    /**
     * The user named a rule set whose layout isn't the disk's.
     */
    RULE_SET_LAYOUT_MISMATCH,

    /**
     * The image says it's write-protected, or its format can't be written.
     */
    WRITE_PROTECTED,

    /**
     * The image format can't store the directory as the DOS needs it: a JV1 image keeps no data
     * address marks, and reads only cylinder 17's sectors as deleted, so a directory elsewhere
     * would lose its deleted marks when saved.
     */
    IMAGE_CANT_HOLD_DIRECTORY,

    /**
     * A layout finding of {@link checkTrsdos}: we may have guessed the disk's layout wrong.
     */
    LAYOUT_DOUBT,

    /**
     * The image has two sides, but the decoder picked one allocation side only because nothing on
     * the disk shows side 1 in use. See "One side unless proven otherwise" in FLOPPY_TODO.md.
     */
    SIDES_UNPROVEN,

    /**
     * The directory's size was chosen among candidates rather than read from the disk. See "Directory
     * size is tried, not read" in FLOPPY_TODO.md.
     */
    DIRECTORY_SIZE_UNPROVEN,

    /**
     * The file system is damaged (the layout is fine). Only a repair should write.
     */
    DAMAGE,
}

/**
 * A short lowercase name for a kind of blocker, such as "layout-doubt".
 */
export function trsdosWriteBlockerKindToString(kind: TrsdosWriteBlockerKind): string {
    switch (kind) {
        case TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT:
            return "unsupported-layout";
        case TrsdosWriteBlockerKind.UNKNOWN_DOS:
            return "unknown-dos";
        case TrsdosWriteBlockerKind.UNSUPPORTED_DOS:
            return "unsupported-dos";
        case TrsdosWriteBlockerKind.DOS_MISMATCH:
            return "dos-mismatch";
        case TrsdosWriteBlockerKind.RULE_SET_LAYOUT_MISMATCH:
            return "rule-set-layout-mismatch";
        case TrsdosWriteBlockerKind.WRITE_PROTECTED:
            return "write-protected";
        case TrsdosWriteBlockerKind.IMAGE_CANT_HOLD_DIRECTORY:
            return "image-cant-hold-directory";
        case TrsdosWriteBlockerKind.LAYOUT_DOUBT:
            return "layout-doubt";
        case TrsdosWriteBlockerKind.SIDES_UNPROVEN:
            return "sides-unproven";
        case TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN:
            return "directory-size-unproven";
        case TrsdosWriteBlockerKind.DAMAGE:
            return "damage";
        default:
            assertNever(kind);
    }
}

/**
 * One reason that a disk isn't fully writable.
 */
export interface TrsdosWriteBlocker {
    kind: TrsdosWriteBlockerKind;

    /**
     * One or two complete sentences for the user, saying why and, where something would help, what.
     */
    message: string;

    /**
     * Whether the user may override this blocker (with --force). False where we have no writer at
     * all, or no rules to write with, so there's nothing to force.
     */
    forceable: boolean;
}

/**
 * The result of {@link evaluateTrsdosWriteGate}.
 */
export interface TrsdosWriteGate {
    access: TrsdosWriteAccess;

    /**
     * Why the access isn't {@link TrsdosWriteAccess.WRITABLE}, in the order of the
     * {@link TrsdosWriteBlockerKind} enum. Empty when the disk is writable.
     */
    blockers: TrsdosWriteBlocker[];

    /**
     * The check that the blockers were based on, so that callers needn't run it again.
     */
    check: TrsdosCheckResult;

    /**
     * The rule set that applies to writes: the one the user named, or else the one the disk's DOS
     * follows. Undefined if there's neither.
     */
    ruleSet: TrsdosRuleSet | undefined;
}

/**
 * The access level that a kind of blocker allows, if it were the only one.
 */
export function trsdosWriteBlockerKindAccess(kind: TrsdosWriteBlockerKind): TrsdosWriteAccess {
    switch (kind) {
        case TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT:
        case TrsdosWriteBlockerKind.UNKNOWN_DOS:
        case TrsdosWriteBlockerKind.UNSUPPORTED_DOS:
        case TrsdosWriteBlockerKind.DOS_MISMATCH:
        case TrsdosWriteBlockerKind.RULE_SET_LAYOUT_MISMATCH:
        case TrsdosWriteBlockerKind.WRITE_PROTECTED:
        case TrsdosWriteBlockerKind.IMAGE_CANT_HOLD_DIRECTORY:
        case TrsdosWriteBlockerKind.LAYOUT_DOUBT:
        case TrsdosWriteBlockerKind.SIDES_UNPROVEN:
        case TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN:
            return TrsdosWriteAccess.READ_ONLY;
        case TrsdosWriteBlockerKind.DAMAGE:
            return TrsdosWriteAccess.REPAIR_ONLY;
        default:
            assertNever(kind);
    }
}

/**
 * The access level for a set of blockers: the most restrictive one that any of them imposes, or
 * writable if there are none.
 */
export function trsdosWriteAccessForBlockerKinds(kinds: TrsdosWriteBlockerKind[]): TrsdosWriteAccess {
    let access = TrsdosWriteAccess.WRITABLE;
    for (const kind of kinds) {
        const kindAccess = trsdosWriteBlockerKindAccess(kind);
        // The enum is declared from least to most restrictive.
        if (kindAccess > access) {
            access = kindAccess;
        }
    }
    return access;
}

/**
 * Why we have no writer for this file system's layout, or undefined if we do. (Exported for tests.)
 *
 * @param trsdos the decoded file system.
 */
export function unsupportedLayoutMessage(trsdos: Trsdos): string | undefined {
    const volume = volumeOf(trsdos);
    if (volume instanceof HardDiskPartition) {
        // The layout is the LDOS one, which the writer handles. Only the DOSPLUS 3 partitions differ.
        if (identifyTrsdosRuleSet(trsdos).ruleSet === TrsdosRuleSet.DOSPLUS) {
            return dosplusPartitionMessage();
        }
        // The GAT keeps one byte per cylinder up to 0xCA, and the version and geometry fields follow.
        if (trsdos.lumpCount > HARD_DISK_GAT_CYLINDER_BYTES) {
            return `This hard disk partition has ${trsdos.lumpCount} cylinders, but a GAT only records ` +
                `${HARD_DISK_GAT_CYLINDER_BYTES} of them, so writing it isn't supported.`;
        }
        return undefined;
    }
    if (!(volume instanceof FloppyDisk)) {
        return "Writing to this kind of disk isn't supported yet.";
    }
    if (!trsdos.lumpsAreCylinders) {
        return "This disk allocates space in lumps that aren't whole cylinders (as NEWDOS/80 does), " +
            "and writing that layout isn't supported yet.";
    }
    return undefined;
}

/**
 * The volume that a file system lives on, looking through a {@link SectorOverlay}, which the
 * writer's decoding goes through.
 */
function volumeOf(trsdos: Trsdos): Trsdos["disk"] {
    return trsdos.disk instanceof SectorOverlay ? trsdos.disk.base : trsdos.disk;
}

/**
 * Why DOSPLUS 3 hard disk partitions can't be written. Their GAT doesn't record the granules per
 * cylinder, which we only know from one disk ("Hard disk images" in FLOPPY_FORMATS.md).
 */
function dosplusPartitionMessage(): string {
    return "DOSPLUS 3 hard disk partitions are read-only: their GAT doesn't record how many granules " +
        "each cylinder has, so writing one would be a guess.";
}

/**
 * Why a hard disk image can't be written, or undefined if it can. (Exported for tests.) This looks
 * at the disk as it is, including any flag that the session cleared in memory.
 *
 * @param disk the hard disk image.
 */
export function hardDiskWriteProtectionMessage(disk: HardDisk): string | undefined {
    if (!disk.isWriteProtected()) {
        return undefined;
    }

    if (disk instanceof HdvHardDisk && disk.writeProtected) {
        return "The image's write-protect flag is set.";
    }
    return "The hard disk is write-protected.";
}

/**
 * Why a floppy image can't be written, or undefined if it can. (Exported for tests.) This looks at
 * the disk as it is, including any write-protect the user mounted it with.
 *
 * @param disk the floppy image.
 */
export function writeProtectionMessage(disk: FloppyDisk): string | undefined {
    const writeProtected = disk.isWriteProtected();
    if (!writeProtected) {
        return undefined;
    }

    // These are the formats that can be written. Their images can carry a write-protect flag.
    const imageFlagSet = (disk instanceof DmkFloppyDisk && disk.writeProtected) ||
        (disk instanceof Jv3FloppyDisk && disk.writeProtected) ||
        (disk instanceof HfeFloppyDisk && disk.writeProtected);
    if (imageFlagSet) {
        return "The image's write-protect flag is set.";
    }

    const formatCanBeWritten = disk instanceof DmkFloppyDisk || disk instanceof Jv1FloppyDisk ||
        disk instanceof Jv3FloppyDisk || disk instanceof HfeFloppyDisk || disk instanceof ImdFloppyDisk;
    if (formatCanBeWritten) {
        return "The image is mounted write-protected.";
    }

    return `Writing ${floppyFormatName(disk)} images isn't supported yet.`;
}

/**
 * Why the image can't store the disk's directory as the DOS needs it, or undefined if it can.
 * (Exported for tests.) A JV1 image keeps no data address marks, and reads cylinder 17's sectors as
 * deleted and all others as normal, so a directory on any other cylinder would lose its deleted
 * marks when saved, and the DOS would no longer find it.
 *
 * @param trsdos the decoded file system.
 */
export function imageCantHoldDirectoryMessage(trsdos: Trsdos): string | undefined {
    const directoryOnJv1Cylinder = trsdos.lumpsAreCylinders && trsdos.dirLumpNumber === JV1_DIRECTORY_CYLINDER;
    if (trsdos.disk instanceof Jv1FloppyDisk && !directoryOnJv1Cylinder) {
        return `JV1 images can't store the deleted marks of a directory on ${trsdos.lumpTerm} ` +
            `${trsdos.dirLumpNumber}. Convert the disk to DMK to write to it.`;
    }

    return undefined;
}

/**
 * The name of a floppy image's format, such as "HFE", taken from its description, which looks like
 * "Floppy disk (HFE)".
 */
function floppyFormatName(disk: FloppyDisk): string {
    const description = disk.getDescription();
    const match = /\(([^)]+)\)\s*$/.exec(description);
    return match === null ? description : match[1];
}

/**
 * Whether the decoder chose one allocation side by default on an image that has two sides. The
 * 2.3-family generator tries both and prefers one when nothing shows side 1 in use; two sides take
 * evidence. TRSDOS 1.3 is only ever one side, which is the DOS's rule, not a choice. (Exported for tests.)
 *
 * @param version the DOS layout the decoder chose.
 * @param allocationSides the number of sides the decoder allocates granules on.
 * @param physicalSides the number of sides the image has.
 */
export function sidesAreUnproven(version: TrsdosVersion, allocationSides: number, physicalSides: number): boolean {
    switch (version) {
        case TrsdosVersion.V2_3:
            return physicalSides > 1 && allocationSides === 1;
        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            // The DOS has one side.
            return false;
        default:
            assertNever(version);
    }
}

/**
 * Whether the disk's own GAT settles the number of allocation sides. The LDOS line (LDOS 5 and
 * TRSDOS 6 / LS-DOS 6) records whether the disk is double-sided in GAT byte 0xCD, and that bit
 * matched the allocation sides on every such disk checked (see "GAT bytes 0xCB-0xCD" in
 * FLOPPY_FORMATS.md). Other DOSes leave it zero or wrong, so it counts for nothing there. Goes by
 * the DOS the disk names, not by a rule set the user chose. (Exported for tests.)
 *
 * @param trsdos the decoded file system.
 */
export function gatProvesSides(trsdos: Trsdos): boolean {
    const ruleSet = identifyTrsdosRuleSet(trsdos).ruleSet;
    let gatIsReliable: boolean;
    switch (ruleSet) {
        case undefined:
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.TRSDOS_2_7:
            gatIsReliable = false;
            break;
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
            gatIsReliable = true;
            break;
        default:
            assertNever(ruleSet);
    }
    if (!gatIsReliable) {
        return false;
    }

    const gatInfo = trsdos.getGatInfo();
    return typeof gatInfo !== "string" && gatInfo.sideCount === trsdos.allocationSides;
}

/**
 * The directory sizes, in granules, that the decoder's generators try for a layout, apart from the
 * one a NEWDOS/80 HIT may ask for beyond its lump. If this has more than one entry, the size the
 * decoder chose is a choice among them. (Exported for tests.)
 *
 * The 2.3 generator tries the whole lump, and on two allocation sides also a side-0 directory
 * (granules per track). The 1.3 and 2.7 generators try only the whole lump. The NEWDOS/80
 * generator tries every size from 2 to the lump, for 5-sector granules and any granules per lump,
 * which includes layouts that look just like the 2.3 family's when its lumps are cylinders. It
 * skips cylinder 0 when that differs from the others, so such a layout has no NEWDOS/80 twin.
 *
 * @param version the DOS layout the decoder chose.
 * @param allocationSides the number of sides the decoder allocates granules on.
 * @param granulesPerLump the granules per lump of the chosen layout.
 * @param sectorsPerGranule the sectors per granule of the chosen layout.
 * @param cylinder0Differs whether the image's cylinder 0 differs from the other cylinders.
 */
export function directorySizesTried(version: TrsdosVersion, allocationSides: number, granulesPerLump: number,
                                    sectorsPerGranule: number, cylinder0Differs: boolean): number[] {

    const sizes = new Set<number>([granulesPerLump]);
    switch (version) {
        case TrsdosVersion.V2_3:
            if (allocationSides > 1) {
                sizes.add(granulesPerLump/allocationSides);
            }
            if (sectorsPerGranule === NEWDOS80_SECTORS_PER_GRANULE && !cylinder0Differs &&
                granulesPerLump >= NEWDOS80_MIN_GRANULES_PER_LUMP && granulesPerLump <= NEWDOS80_MAX_GRANULES_PER_LUMP) {

                for (let size = 2; size <= granulesPerLump; size++) {
                    sizes.add(size);
                }
            }
            break;
        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            break;
        default:
            assertNever(version);
    }
    return [...sizes].sort((a, b) => a - b);
}

/**
 * Whether DIR/SYS's entry exists and its extents cover exactly the directory's granules, which
 * proves the directory's size from the disk. (Exported for tests.)
 *
 * @param trsdos the decoded file system.
 */
export function dirSysCoversDirectory(trsdos: Trsdos): boolean {
    return trsdos.dirSysCoversDirectory();
}

/**
 * What the DOS rules say about writing a disk. See {@link evaluateDosRules}.
 */
export interface TrsdosDosRulesVerdict {
    /**
     * The rule set that applies, or undefined if none does.
     */
    ruleSet: TrsdosRuleSet | undefined;

    /**
     * The DOS blockers (of the four DOS kinds), if any.
     */
    blockers: TrsdosWriteBlocker[];
}

/**
 * Decide which rule set applies to a disk, and what stands in the way. (Exported for tests.)
 * Without a rule set from the user, the disk has to name a DOS that we have rules for. With one,
 * its layout has to be the disk's, and the disk may only name that DOS or none.
 *
 * @param nameAndVersion the DOS the disk names ({@link Trsdos.nameAndVersion}).
 * @param layout the layout the disk was decoded with.
 * @param givenRuleSet the user's choice, if any.
 */
export function evaluateDosRules(nameAndVersion: string, layout: TrsdosVersion,
                                 givenRuleSet: TrsdosRuleSet | undefined): TrsdosDosRulesVerdict {

    const identifiedRuleSet = ruleSetForDosName(nameAndVersion, layout);
    const recognized = !isUnknownDosName(nameAndVersion);

    if (givenRuleSet !== undefined) {
        const ruleSetLayout = trsdosRuleSetLayout(givenRuleSet);
        if (ruleSetLayout !== layout) {
            return {
                ruleSet: givenRuleSet,
                blockers: [{
                    kind: TrsdosWriteBlockerKind.RULE_SET_LAYOUT_MISMATCH,
                    message: `--dos ${trsdosRuleSetCliName(givenRuleSet)} doesn't fit this disk's ` +
                        `${layoutDescription(layout)} layout.`,
                    forceable: false,
                }],
            };
        }
        if (recognized && identifiedRuleSet !== givenRuleSet) {
            return {
                ruleSet: givenRuleSet,
                blockers: [{
                    kind: TrsdosWriteBlockerKind.DOS_MISMATCH,
                    message: `The disk says it's ${nameAndVersion}, not --dos ${trsdosRuleSetCliName(givenRuleSet)}.`,
                    forceable: true,
                }],
            };
        }
        return {ruleSet: givenRuleSet, blockers: []};
    }

    if (!recognized) {
        return {
            ruleSet: undefined,
            blockers: [{
                kind: TrsdosWriteBlockerKind.UNKNOWN_DOS,
                message: `Can't tell which DOS wrote this disk, and that decides how files are written. ` +
                    `Name it with --dos; "help dos" lists the choices.`,
                forceable: false,
            }],
        };
    }
    if (identifiedRuleSet === undefined) {
        return {
            ruleSet: undefined,
            blockers: [{
                kind: TrsdosWriteBlockerKind.UNSUPPORTED_DOS,
                message: `Writing ${nameAndVersion} disks isn't supported yet.`,
                forceable: false,
            }],
        };
    }
    return {ruleSet: identifiedRuleSet, blockers: []};
}

/**
 * Describe a layout for a message, such as "TRSDOS 2.3-style".
 */
function layoutDescription(layout: TrsdosVersion): string {
    switch (layout) {
        case TrsdosVersion.V2_3:
            return "TRSDOS 2.3-style";
        case TrsdosVersion.V1_3:
            return "TRSDOS 1.3-style";
        case TrsdosVersion.V2_7:
            return "TRSDOS 2.7-style";
        default:
            assertNever(layout);
    }
}

/**
 * Pick the singular or plural form of "problem" for a count.
 */
function problems(count: number): string {
    return count === 1 ? "1 problem" : count + " problems";
}

/**
 * Decide whether a decoded TRSDOS-family floppy is safe to write, and if not, why. Writing on a
 * wrong guess of the layout destroys the disk, so a disk with any doubt about its layout is
 * read-only; a disk whose layout is sound but whose file system is damaged may be repaired but not
 * otherwise written. Each reason is a blocker that a forced write could override, except
 * where we have no writer. Reads the disk (the check does) and changes nothing.
 *
 * Writing also needs to know which DOS's rules to follow; see {@link TrsdosRuleSet}. The disk's own
 * name decides that unless the user names a rule set.
 *
 * @param trsdos the decoded file system.
 * @param givenRuleSet the rule set the user chose (with --dos), if any.
 */
export function evaluateTrsdosWriteGate(trsdos: Trsdos, givenRuleSet?: TrsdosRuleSet): TrsdosWriteGate {
    const check = checkTrsdos(trsdos);
    const blockers: TrsdosWriteBlocker[] = [];

    const unsupported = unsupportedLayoutMessage(trsdos);
    if (unsupported !== undefined) {
        blockers.push({kind: TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT, message: unsupported, forceable: false});
    }

    // The rules are for a layout we can write, as with the sides and the directory size below.
    let ruleSet = givenRuleSet ?? identifyTrsdosRuleSet(trsdos).ruleSet;
    if (unsupported === undefined) {
        const verdict = evaluateDosRules(trsdos.nameAndVersion, trsdos.version, givenRuleSet);
        blockers.push(...verdict.blockers);
        ruleSet = verdict.ruleSet;
    }

    const volume = volumeOf(trsdos);
    if (volume instanceof FloppyDisk) {
        const protectionMessage = writeProtectionMessage(volume);
        if (protectionMessage !== undefined) {
            blockers.push({kind: TrsdosWriteBlockerKind.WRITE_PROTECTED, message: protectionMessage, forceable: true});
        }
    } else if (volume instanceof HardDiskPartition) {
        const protectionMessage = hardDiskWriteProtectionMessage(volume.disk);
        if (protectionMessage !== undefined) {
            blockers.push({kind: TrsdosWriteBlockerKind.WRITE_PROTECTED, message: protectionMessage, forceable: true});
        }

        // The DOSPLUS rules, named with --dos, don't make a partition's layout one that we know.
        if (unsupported === undefined && ruleSet === TrsdosRuleSet.DOSPLUS) {
            blockers.push({
                kind: TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT,
                message: dosplusPartitionMessage(),
                forceable: false,
            });
        }
    }

    const directoryMessage = imageCantHoldDirectoryMessage(trsdos);
    if (directoryMessage !== undefined) {
        blockers.push({kind: TrsdosWriteBlockerKind.IMAGE_CANT_HOLD_DIRECTORY, message: directoryMessage, forceable: false});
    }

    for (const finding of check.findings) {
        if (trsdosFindingKindSeverity(finding.kind) === TrsdosFindingSeverity.LAYOUT) {
            blockers.push({kind: TrsdosWriteBlockerKind.LAYOUT_DOUBT, message: finding.message, forceable: true});
        }
    }

    // The sides and the directory size describe a layout that we can write, so there's no point
    // in asking about them for a layout that we can't.
    if (unsupported === undefined) {
        if (sidesAreUnproven(trsdos.version, trsdos.allocationSides, trsdos.geometry.sideCount) &&
            !gatProvesSides(trsdos)) {
            blockers.push({
                kind: TrsdosWriteBlockerKind.SIDES_UNPROVEN,
                message: "The image has two sides, but nothing on the disk shows whether the DOS uses the second, " +
                    "so how granules map to sectors is a guess.",
                forceable: true,
            });
        }

        // A partition's directory is always its whole cylinder: the partition decoder tries no other size.
        const sizesTried = volume instanceof HardDiskPartition ? [trsdos.granulesPerDir] :
            directorySizesTried(trsdos.version, trsdos.allocationSides, trsdos.granulesPerLump,
                trsdos.sectorsPerGranule, trsdos.geometry.cylinder0Differs);
        const directorySizeIsOnlyChoice = sizesTried.length <= 1;
        if (!directorySizeIsOnlyChoice && !dirSysCoversDirectory(trsdos)) {
            blockers.push({
                kind: TrsdosWriteBlockerKind.DIRECTORY_SIZE_UNPROVEN,
                message: "The directory's size isn't recorded on this disk, so a new entry could land in a " +
                    "sector the DOS doesn't consider part of the directory.",
                forceable: true,
            });
        }
    }

    const damageCount = check.findings.filter(finding =>
        trsdosFindingKindSeverity(finding.kind) === TrsdosFindingSeverity.DAMAGE).length;
    if (damageCount > 0) {
        blockers.push({
            kind: TrsdosWriteBlockerKind.DAMAGE,
            message: `The file system is damaged (${problems(damageCount)}), so writing to it could make things worse. ` +
                `The "check" command lists the problems.`,
            forceable: true,
        });
    }

    return {
        access: trsdosWriteAccessForBlockerKinds(blockers.map(blocker => blocker.kind)),
        blockers,
        check,
        ruleSet,
    };
}
