/**
 * Decides whether we'll write to a CP/M disk. CP/M doesn't record its disk parameters, so a disk's
 * layout is one of our candidates that read the directory best, and writing with a wrong guess puts
 * data where CP/M won't look. We write only the layouts whose parameters we have from a real system,
 * and refuse (or ask the user to force) where the reading is in doubt. See "Montezuma Micro CP/M
 * 2.2" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {Cpm, rankCpmCandidates} from "./Cpm.js";
import {FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {TrsdosWriteAccess, writeProtectionMessage} from "./TrsdosWriteGate.js";

// The name of the format that has verified layouts.
const MONTEZUMA_FORMAT_NAME = "Montezuma Micro";

// The versions of Montezuma Micro's BIOS that used skew 4.
const MONTEZUMA_SKEW_4_VERSIONS = ["1.26", "1.30"];

// Matches the name that CPM_BANNERS makes for a Montezuma Micro BIOS, capturing the version.
const MONTEZUMA_BIOS_NAME = /^Montezuma Micro CP\/M BIOS (\d+\.\d+)$/;

/**
 * A disk parameter block that was verified against a real system, such as the output of Montezuma's
 * PROBE program.
 */
export interface CpmVerifiedLayout {
    // Montezuma's name for the format, such as "Standard DS system".
    readonly name: string;
    // Distance between consecutive logical sectors.
    readonly skew: number;
    // Bytes in a physical sector.
    readonly sectorSize: number;
    readonly sectorsPerTrack: number;
    // Sides that the file system uses.
    readonly sides: number;
    readonly cylinders: number;
    // Reserved tracks (the DPB's OFF). Each side counts as a track.
    readonly reservedTracks: number;
    // The last block number (the DPB's DSM).
    readonly dsm: number;
}

/**
 * The layouts that we'll write, all of them Montezuma Micro CP/M 2.2's. Each has 2K blocks and 128
 * directory entries (the Montezuma format entries of CPM_FORMATS), and the DSM is checked against
 * what the decoder computes, so a drift between this table and the decoder blocks writing. The first
 * 12 are from the DPBs that PROBE printed, and the last 3 from the earlier versions' formats. See
 * "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md. (The 1.32 format, FORMAT15 there, is the same as
 * "Standard DS system".)
 */
export const CPM_VERIFIED_LAYOUTS: readonly CpmVerifiedLayout[] = [
    {name: "Standard system", skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 84},
    {name: "Standard data", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 40, reservedTracks: 0, dsm: 99},
    {name: "Standard DS system", skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 174},
    {name: "Standard DS data", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 40, reservedTracks: 0, dsm: 199},
    {name: "80T system", skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 80, reservedTracks: 2, dsm: 174},
    {name: "80T data", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 80, reservedTracks: 0, dsm: 199},
    {name: "80T DS system", skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 80, reservedTracks: 2, dsm: 354},
    {name: "80T DS data", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 80, reservedTracks: 0, dsm: 399},
    {name: "Extended system", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 94},
    {name: "Extended DS system", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 194},
    {name: "Extended 80T system", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 80, reservedTracks: 2, dsm: 194},
    {name: "Extended 80T DS system", skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 80, reservedTracks: 2, dsm: 394},
    {name: "Version 1.26 and 1.30 system", skew: 4, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 84},
    {name: "Version 1.26 and 1.30 DS system", skew: 4, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 174},
    {name: "Version 1.42 and 1.44 DS system", skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 4, dsm: 170},
];

/**
 * The verified layout that a decoded disk has, or undefined if it has none.
 */
export function findCpmVerifiedLayout(cpm: Cpm): CpmVerifiedLayout | undefined {
    if (cpm.format.name !== MONTEZUMA_FORMAT_NAME) {
        return undefined;
    }
    return CPM_VERIFIED_LAYOUTS.find(layout =>
        layout.skew === cpm.format.skew &&
        layout.sectorSize === cpm.sectorSize &&
        layout.sectorsPerTrack === cpm.sectorsPerTrack &&
        layout.sides === cpm.allocationSides &&
        layout.cylinders === cpm.cylinderCount &&
        layout.reservedTracks === cpm.reservedTrackCount &&
        layout.dsm === cpm.blockCount - 1);
}

/**
 * The reasons we might not let a tool write to a CP/M disk. They're declared in the order that
 * {@link CpmWriteGate.blockers} lists them.
 */
export enum CpmWriteBlockerKind {
    /**
     * No verified layout matches the disk. Not forceable: we don't know where the BIOS keeps blocks.
     */
    UNSUPPORTED_LAYOUT,

    /**
     * The directory has CP/M 3 entries (passwords, a label, or date stamps), which we don't maintain.
     * Not forceable.
     */
    CPM3_ENTRIES,

    /**
     * A sector of the directory is missing or has a CRC error. Not forceable.
     */
    DIRECTORY_UNREADABLE,

    /**
     * The image says it's write-protected, or its format can't be written.
     */
    WRITE_PROTECTED,

    /**
     * Another layout reads the disk as well as the one we chose, and puts blocks in different sectors.
     */
    LAYOUT_DOUBT,

    /**
     * The directory has bad entries or blocks claimed more than once.
     */
    DAMAGE,
}

/**
 * A short lowercase name for a kind of blocker, such as "layout-doubt".
 */
export function cpmWriteBlockerKindToString(kind: CpmWriteBlockerKind): string {
    switch (kind) {
        case CpmWriteBlockerKind.UNSUPPORTED_LAYOUT:
            return "unsupported-layout";
        case CpmWriteBlockerKind.CPM3_ENTRIES:
            return "cpm3-entries";
        case CpmWriteBlockerKind.DIRECTORY_UNREADABLE:
            return "directory-unreadable";
        case CpmWriteBlockerKind.WRITE_PROTECTED:
            return "write-protected";
        case CpmWriteBlockerKind.LAYOUT_DOUBT:
            return "layout-doubt";
        case CpmWriteBlockerKind.DAMAGE:
            return "damage";
        default:
            assertNever(kind);
    }
}

/**
 * The access level that a kind of blocker allows, if it were the only one. Damage is the only one
 * that leaves room for a repair, though we have no CP/M repair.
 */
export function cpmWriteBlockerKindAccess(kind: CpmWriteBlockerKind): TrsdosWriteAccess {
    switch (kind) {
        case CpmWriteBlockerKind.UNSUPPORTED_LAYOUT:
        case CpmWriteBlockerKind.CPM3_ENTRIES:
        case CpmWriteBlockerKind.DIRECTORY_UNREADABLE:
        case CpmWriteBlockerKind.WRITE_PROTECTED:
        case CpmWriteBlockerKind.LAYOUT_DOUBT:
            return TrsdosWriteAccess.READ_ONLY;
        case CpmWriteBlockerKind.DAMAGE:
            return TrsdosWriteAccess.REPAIR_ONLY;
        default:
            assertNever(kind);
    }
}

/**
 * One reason that a CP/M disk isn't fully writable.
 */
export interface CpmWriteBlocker {
    kind: CpmWriteBlockerKind;

    /**
     * One or two complete sentences for the user.
     */
    message: string;

    /**
     * Whether the user may override this blocker (with --force).
     */
    forceable: boolean;
}

/**
 * The result of {@link evaluateCpmWriteGate}.
 */
export interface CpmWriteGate {
    access: TrsdosWriteAccess;

    /**
     * Why the access isn't {@link TrsdosWriteAccess.WRITABLE}, in the order of the
     * {@link CpmWriteBlockerKind} enum. Empty when the disk is writable.
     */
    blockers: CpmWriteBlocker[];
}

/**
 * Whether two candidates put blocks in the same sectors, which is true when they differ at most
 * in the cylinder count and that doesn't change the pointer size or the extent mask. (Directory
 * entries then mean the same thing under both.)
 */
function sameBlockMapping(a: Cpm, b: Cpm): boolean {
    return a.format === b.format &&
        a.allocationSides === b.allocationSides &&
        a.reservedTrackCount === b.reservedTrackCount &&
        a.wideBlockPointers === b.wideBlockPointers &&
        a.extentMask === b.extentMask;
}

/**
 * Whether the image has every sector of the data layout on side 1 of every cylinder. Montezuma's
 * FORMAT never touches side 1 of a single-sided disk, so a formatted side 1 means a double-sided disk.
 */
function side1IsFullyFormatted(cpm: Cpm): boolean {
    const first = cpm.format.firstSectorNumber;
    for (let cylinder = 0; cylinder < cpm.geometry.cylinderCount; cylinder++) {
        for (let i = 0; i < cpm.sectorsPerTrack; i++) {
            if (!cpm.disk.hasSectorData(SectorPosition.make(cylinder, 1, first + i))) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Whether the image has no sector at all on side 1.
 */
function side1IsEmpty(cpm: Cpm): boolean {
    return cpm.geometry.sectorInfos.every(info => info.sectorPosition.side !== 1);
}

/**
 * Whether the disk's banner names a Montezuma BIOS version that didn't use skew 4.
 */
function bannerRulesOutSkew4(cpm: Cpm): boolean {
    const match = MONTEZUMA_BIOS_NAME.exec(cpm.nameAndVersion);
    return match !== null && !MONTEZUMA_SKEW_4_VERSIONS.includes(match[1]);
}

/**
 * The other readings of the disk that we can't rule out: the candidates in the ranking, other than
 * the given layout, that read as well (the same score and missing sectors) and put blocks in
 * different sectors. These don't count:
 *
 * - A candidate that differs only in its cylinder count, with the same pointer size and extent mask.
 * - A one-side candidate, when the disk uses two sides and the image has every sector of the data
 *   layout on side 1 of every cylinder.
 * - A two-side candidate, when the disk uses one side and the image has no sector at all on side 1, since such an
 *   image can't be a two-sided disk's. (The mirror of the rule above.)
 * - A skew-4 Montezuma candidate, when the disk's banner names a Montezuma BIOS version other than
 *   1.26 and 1.30, the only ones with skew 4.
 *
 * See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 *
 * @param cpm the layout that we'd write with.
 * @param ranked every candidate, from rankCpmCandidates().
 */
export function findCpmLayoutDoubts(cpm: Cpm, ranked: Cpm[]): Cpm[] {
    let side1Proven: boolean | undefined;
    let side1Empty: boolean | undefined;
    const bannerExcludesSkew4 = bannerRulesOutSkew4(cpm);

    return ranked.filter(other => {
        if (other.sameLayout(cpm)) {
            return false;
        }
        const tied = other.evaluation.score === cpm.evaluation.score &&
            other.evaluation.missingSectorCount === cpm.evaluation.missingSectorCount;
        if (!tied || sameBlockMapping(cpm, other)) {
            return false;
        }

        const isSkew4Montezuma = other.format.name === MONTEZUMA_FORMAT_NAME && other.format.skew === 4;
        if (bannerExcludesSkew4 && isSkew4Montezuma) {
            return false;
        }

        if (cpm.allocationSides === 1 && other.allocationSides === 2) {
            side1Empty ??= side1IsEmpty(cpm);
            if (side1Empty) {
                return false;
            }
        }

        if (cpm.allocationSides === 2 && other.allocationSides === 1) {
            side1Proven ??= side1IsFullyFormatted(cpm);
            if (side1Proven) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Describe in a few words how another reading differs from the chosen one, such as "one side" or
 * "skew 4".
 */
function describeDifference(cpm: Cpm, other: Cpm): string {
    const parts: string[] = [];
    if (other.format !== cpm.format) {
        parts.push(other.format.skew !== cpm.format.skew ? `skew ${other.format.skew}` : `the ${other.format.name} format`);
    }
    if (other.allocationSides !== cpm.allocationSides) {
        parts.push(other.allocationSides === 1 ? "one side" : "two sides");
    }
    if (other.reservedTrackCount !== cpm.reservedTrackCount) {
        parts.push(`${other.reservedTrackCount} reserved tracks`);
    }
    if (other.cylinderCount !== cpm.cylinderCount) {
        parts.push(`${other.cylinderCount} cylinders`);
    }
    return parts.length === 0 ? "a different layout" : parts.join(" and ");
}

/**
 * What a caller of evaluateCpmWriteGate() can tell it.
 */
export interface CpmWriteGateOptions {
    /**
     * Whether the layout was settled earlier (a session remembers the layout of a disk it has changed, undone, or
     * redone, and the user may have forced past a doubt then), so that other readings that tie aren't a
     * LAYOUT_DOUBT. False or missing for a layout that was just detected.
     */
    layoutSettled?: boolean | undefined;
}

/**
 * Decide whether we'll write to a CP/M disk, and what blocks us otherwise. Ranks the layouts of
 * the disk itself (to look for doubts), reads the directory, and changes nothing.
 *
 * @param cpm the decoded file system, on a floppy or an overlay over one. Decode it with whole records.
 * @param options what the caller knows that the disk doesn't say.
 */
export function evaluateCpmWriteGate(cpm: Cpm, options: CpmWriteGateOptions = {}): CpmWriteGate {
    const blockers: CpmWriteBlocker[] = [];

    const verified = findCpmVerifiedLayout(cpm);
    const unsupported = verified === undefined;
    if (unsupported) {
        blockers.push({
            kind: CpmWriteBlockerKind.UNSUPPORTED_LAYOUT,
            message: `Writing ${cpm.nameAndVersion} disks with this layout (${cpm.summary()}) isn't supported yet. ` +
                `So far only Montezuma Micro's PROBE-verified layouts can be written.`,
            forceable: false,
        });
    }

    if (cpm.hasCpm3Entries()) {
        blockers.push({
            kind: CpmWriteBlockerKind.CPM3_ENTRIES,
            message: "The directory has CP/M 3 entries (passwords, a label, or date stamps), which can't be written yet.",
            forceable: false,
        });
    }

    if (!cpm.dirSectorsReadable()) {
        blockers.push({
            kind: CpmWriteBlockerKind.DIRECTORY_UNREADABLE,
            message: "A sector of the directory is missing or has a CRC error, so the directory can't be rewritten safely.",
            forceable: false,
        });
    }

    if (cpm.disk instanceof FloppyDisk) {
        const protectionMessage = writeProtectionMessage(cpm.disk);
        if (protectionMessage !== undefined) {
            blockers.push({kind: CpmWriteBlockerKind.WRITE_PROTECTED, message: protectionMessage, forceable: true});
        }
    }

    // Other readings matter only for a layout that we can write, and not when the caller says the layout is settled.
    if (!unsupported && options.layoutSettled !== true) {
        const ranked = rankCpmCandidates(cpm.disk, cpm.geometry, true);
        const doubts = findCpmLayoutDoubts(cpm, ranked);
        if (doubts.length > 0) {
            const differences = Array.from(new Set(doubts.map(other => describeDifference(cpm, other))));
            blockers.push({
                kind: CpmWriteBlockerKind.LAYOUT_DOUBT,
                message: `The disk reads equally well with ${differences.join(", or with ")}, and nothing on it tells ` +
                    `the readings apart. Writing with the wrong one would put data where CP/M won't look.`,
                forceable: true,
            });
        }
    }

    const {badEntryCount, duplicateBlockCount} = cpm.evaluation;
    if (badEntryCount > 0 || duplicateBlockCount > 0) {
        const problems: string[] = [];
        if (badEntryCount > 0) {
            problems.push(badEntryCount === 1 ? "1 bad directory entry" : `${badEntryCount} bad directory entries`);
        }
        if (duplicateBlockCount > 0) {
            problems.push(duplicateBlockCount === 1 ? "1 block claimed twice" : `${duplicateBlockCount} blocks claimed twice`);
        }
        blockers.push({
            kind: CpmWriteBlockerKind.DAMAGE,
            message: `The directory is damaged (${problems.join(" and ")}). Writing to it won't make that worse, ` +
                `because free space is computed conservatively, but the damage stays.`,
            forceable: true,
        });
    }

    let access = TrsdosWriteAccess.WRITABLE;
    for (const blocker of blockers) {
        const kindAccess = cpmWriteBlockerKindAccess(blocker.kind);
        // The enum is declared from least to most restrictive.
        if (kindAccess > access) {
            access = kindAccess;
        }
    }

    return {access, blockers};
}
