/**
 * What's at the end of a floppy image, past where its DOS says the disk ends: whether those cylinders are
 * provably outside the disk (re-reads of an earlier cylinder by the imager, or unformatted), or might hold
 * something (leftovers of an earlier format, protection). Trimming an image uses this to drop only what's
 * provably outside the disk, and anything that changes a disk uses its protection screen. The rules are
 * Ira Goldklang's (GitHub issue #47): err on the side of leaving an image alone. See "Tails past the
 * disk's end" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {
    findProtectionSigns, isProtectionSign, ProtectionSign, ProtectionSignKind, protectionSignKindToString,
} from "./CopyProtection.js";
import {DosFamily, dosNameToString, isUnknownDosName} from "./DosName.js";
import {readPdriveTable} from "./Pdrive.js";
import {FloppyDisk, SectorData, SectorInfo, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import type {FloppyFileSystem} from "./FloppyFileSystem.js";
import {Trsdos, TrsdosVersion} from "./Trsdos.js";
import {GAT_MEDIA_BLOCK_OFFSET, gatHasMediaBlock} from "./TrsdosDiskInfo.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {identifyTrsdosRuleSet, TrsdosRuleSet} from "./TrsdosRuleSet.js";

/**
 * A tail of this many cylinders or more past the disk's end is never dropped without a person looking at it.
 */
export const MAX_TRIMMABLE_TAIL = 6;

/**
 * The cylinders that Model I TRSDOS 2.x's FORMAT writes.
 */
const TRSDOS_2_CYLINDERS = 35;

/**
 * The cylinders that Model III TRSDOS 1.x's FORMAT writes.
 */
const TRSDOS_1_3_CYLINDERS = 40;

/**
 * Offset in the media block of the highest cylinder number.
 */
const MEDIA_BLOCK_HIGHEST_CYLINDER = 7;

/**
 * How many cylinders a disk has by its DOS's own records.
 */
export interface DosDiskSize {
    /** The cylinders that the DOS formatted. */
    readonly cylinderCount: number;
    /** Where that comes from, as a phrase for a person, such as "GAT byte 0xCC". */
    readonly source: string;
}

/**
 * What a TRSDOS-family file system does with one cylinder.
 */
export interface TrsdosCylinderUse {
    /** The files (or "the directory") that have data on the cylinder, each at most once. */
    readonly claimedBy: string[];
    /** Whether the cylinder has space that the file system could still hand out. */
    hasFreeSpace: boolean;
}

/**
 * Work out what a TRSDOS-family file system uses on each cylinder, from its granule map: which granules
 * files and the directory own, and which are free. A granule that the GAT says is used but that nothing
 * owns (including the lockout table's "beyond the end" entries) counts as neither.
 *
 * @param trsdos the file system.
 * @param granuleMap its granule map.
 * @param cylinderCount the cylinders to report on, normally the image's.
 * @return one entry per cylinder.
 */
export function findTrsdosCylinderUse(trsdos: Trsdos, granuleMap: TrsdosGranuleMap, cylinderCount: number): TrsdosCylinderUse[] {
    const cylinders: TrsdosCylinderUse[] = [];
    for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
        cylinders.push({claimedBy: [], hasFreeSpace: false});
    }

    for (const granule of granuleMap.granules) {
        // A granule normally sits within one cylinder, but be careful.
        const granuleCylinders = new Set(trsdos.getGranuleSectorPositions(granule.lump, granule.granule)
            .map(position => position.cylinderNumber));
        for (const cylinder of granuleCylinders) {
            if (cylinder >= cylinderCount) {
                continue;
            }
            const use = cylinders[cylinder];
            for (const owner of granule.owners) {
                addName(use.claimedBy, owner.getFilename("/"));
            }
            if (granule.inDirectory && granule.owners.length === 0) {
                // Normally DIR/SYS owns these granules, but a disk can be damaged.
                addName(use.claimedBy, "the directory");
            }
            if (granule.isFree()) {
                use.hasFreeSpace = true;
            }
        }
    }

    return cylinders;
}

/**
 * Add a name to a list if it's not already there.
 */
function addName(names: string[], name: string): void {
    if (!names.includes(name)) {
        names.push(name);
    }
}

/**
 * One past the last cylinder that a file uses or that has free space, or 0 if none does.
 *
 * @param use what the file system uses on each cylinder.
 * @param countFreeSpace whether free space counts.
 */
function usedEnd(use: TrsdosCylinderUse[], countFreeSpace: boolean): number {
    let end = 0;
    use.forEach((cylinder, index) => {
        if (cylinder.claimedBy.length > 0 || (countFreeSpace && cylinder.hasFreeSpace)) {
            end = index + 1;
        }
    });
    return end;
}

/**
 * Whether GAT byte 0xCB is a release of the LDOS line (LDOS 5.0-5.3, TRSDOS 6.0-6.3, LS-DOS 6.3).
 */
function isLdosLineVersion(version: number): boolean {
    return (version >= 0x50 && version <= 0x53) || (version >= 0x60 && version <= 0x63);
}

/**
 * The size of an LDOS-line disk, from GAT byte 0xCC, which is trusted only when 0xCB is the LDOS line's
 * and the GAT's density and granules per track match the disk (see "GAT bytes 0xCB-0xCD" in
 * FLOPPY_FORMATS.md). The media block, where there is one, must agree.
 */
function ldosDiskSize(trsdos: Trsdos, floppy: FloppyDisk): DosDiskSize | string {
    const gatInfo = trsdos.getGatInfo();
    if (typeof gatInfo === "string") {
        return "its GAT can't be read (" + gatInfo + ")";
    }
    if (!isLdosLineVersion(gatInfo.osVersion)) {
        return "GAT byte 0xCB isn't an LDOS-line version, so its cylinder count (0xCC) isn't trusted";
    }
    const sectorsPerTrack = trsdos.sectorsPerCylinder/trsdos.allocationSides;
    if (gatInfo.density !== floppy.getGeometry().modalDataDensity ||
        gatInfo.granulesPerTrack*trsdos.sectorsPerGranule !== sectorsPerTrack) {

        return "the GAT's density and granules per track (0xCD) don't match the disk, so its cylinder count " +
            "(0xCC) isn't trusted";
    }

    const cylinderCount = gatInfo.cylinderCount;
    const gat = trsdos.disk.readSector(trsdos.getGatPosition())?.data;
    if (gat !== undefined && gatHasMediaBlock(gat)) {
        const mediaBlockCylinders = gat[GAT_MEDIA_BLOCK_OFFSET + MEDIA_BLOCK_HIGHEST_CYLINDER] + 1;
        if (mediaBlockCylinders !== cylinderCount) {
            return "GAT byte 0xCC says " + cylinderCount + " cylinders, but the media block says " +
                mediaBlockCylinders;
        }
        return {cylinderCount, source: "GAT byte 0xCC and the media block"};
    }
    return {cylinderCount, source: "GAT byte 0xCC"};
}

/**
 * The size of a DOSPLUS 3.x or 4.0 disk, from GAT byte 0xCC, which DOSPLUS keeps right (see "GAT bytes
 * 0xCB-0xCD" in FLOPPY_FORMATS.md).
 */
function dosplusDiskSize(trsdos: Trsdos): DosDiskSize | string {
    const gatInfo = trsdos.getGatInfo();
    if (typeof gatInfo === "string") {
        return "its GAT can't be read (" + gatInfo + ")";
    }
    return {cylinderCount: gatInfo.cylinderCount, source: "GAT byte 0xCC"};
}

/**
 * The size of a NEWDOS/80 disk, from TC in the first slot of the PDRIVE table that system disks carry
 * (see readPdriveTable() and "PDRIVE" in FLOPPY_FORMATS.md). The slot describes the drive, not
 * necessarily the disk, so it counts only if its sectors per track, granules per lump and lump count
 * match the layout we decoded. TC doesn't count an opposite-density cylinder 0.
 */
function newdos80DiskSize(trsdos: Trsdos, floppy: FloppyDisk): DosDiskSize | string {
    const table = readPdriveTable(floppy);
    if (table === undefined) {
        return "NEWDOS/80 records its size only in a system disk's PDRIVE table, and this disk has none that we can read";
    }
    const {trackCount, sectorsPerTrack, granulesPerLump, lumpCount} = table;
    if (sectorsPerTrack !== trsdos.sectorsPerCylinder || granulesPerLump !== trsdos.granulesPerLump ||
        lumpCount !== Math.floor(trackCount*sectorsPerTrack/(trsdos.sectorsPerGranule*granulesPerLump))) {

        return "the PDRIVE table on cylinder " + (table.tableCylinder ?? 0) + " doesn't describe this disk's layout";
    }
    return {cylinderCount: trackCount + trsdos.firstDataCylinder, source: "PDRIVE's TC=" + trackCount};
}

/**
 * How many cylinders a disk has by its DOS's own records: LDOS and TRSDOS 6's GAT byte 0xCC (and media
 * block), DOSPLUS's 0xCC, NEWDOS/80's PDRIVE table, or TRSDOS 2.x and 1.x's fixed size. The GAT must agree:
 * no file, and on the 2.3 layout no free space, past the end. A disk whose DOS we can't name has no size.
 *
 * @param trsdos the file system.
 * @param floppy the disk it's on.
 * @param use what the file system uses on each of the image's cylinders.
 * @return the size, or why the records don't prove one, as a clause for a person.
 */
export function findDosDiskSize(trsdos: Trsdos, floppy: FloppyDisk, use: TrsdosCylinderUse[]): DosDiskSize | string {
    const dosName = trsdos.dosName;
    const ruleSet = identifyTrsdosRuleSet(trsdos).ruleSet;
    const claimedEnd = usedEnd(use, false);
    const usedOrFreeEnd = usedEnd(use, true);

    let size: DosDiskSize | string;
    let gatEnd = usedOrFreeEnd;
    if (dosName.family === DosFamily.NEWDOS_80 && dosName.or === undefined) {
        size = newdos80DiskSize(trsdos, floppy);
    } else {
        switch (ruleSet) {
            case undefined:
                size = isUnknownDosName(dosName) ? "the disk doesn't say which DOS wrote it" :
                    "we don't know where " + dosNameToString(dosName) + " records a disk's size";
                break;
            case TrsdosRuleSet.TRSDOS_2:
                // A disk ZAPped to more cylinders shows them in its GAT.
                size = usedOrFreeEnd > TRSDOS_2_CYLINDERS ?
                    {cylinderCount: usedOrFreeEnd, source: "the GAT"} :
                    {cylinderCount: TRSDOS_2_CYLINDERS, source: "TRSDOS 2.x's fixed size"};
                break;
            case TrsdosRuleSet.TRSDOS_1_3:
                // The 1.3 layout's GAT leaves the bytes past its cylinders zero, so free space there means nothing.
                gatEnd = claimedEnd;
                size = {cylinderCount: TRSDOS_1_3_CYLINDERS, source: "TRSDOS 1.x's fixed size"};
                break;
            case TrsdosRuleSet.NEWDOS_80:
                // Normally handled above, by family; this is a name with candidate families that all
                // follow NEWDOS/80's rules.
                size = newdos80DiskSize(trsdos, floppy);
                break;
            case TrsdosRuleSet.TRSDOS_2_7:
                size = "we don't know where TRSDOS 2.7 records a disk's size";
                break;
            case TrsdosRuleSet.LDOS_5:
            case TrsdosRuleSet.TRSDOS_6:
                size = ldosDiskSize(trsdos, floppy);
                break;
            case TrsdosRuleSet.DOSPLUS:
                size = dosplusDiskSize(trsdos);
                break;
            default:
                assertNever(ruleSet);
        }
    }

    if (typeof size !== "string" && gatEnd > size.cylinderCount) {
        return size.source + " says " + size.cylinderCount + " cylinders, but the GAT uses cylinder " + (gatEnd - 1);
    }
    return size;
}

/**
 * Whether two sectors read the same: data, CRC state, deleted state and data address mark.
 */
export function sectorsReadTheSame(a: SectorData | undefined, b: SectorData | undefined): boolean {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    if (a.data.length !== b.data.length || a.deleted !== b.deleted || a.crcError !== b.crcError ||
        a.getDataAddressMark() !== b.getDataAddressMark()) {

        return false;
    }
    return a.data.every((value, i) => value === b.data[i]);
}

/**
 * The IDs of a track that a controller accepts (good ID CRC) and that have a data field.
 */
function readableIds(floppy: FloppyDisk, trackPosition: TrackPosition): SectorInfo[] {
    return floppy.getGeometry().sectorInfos.filter(info => info.sectorPosition.trackPosition.equals(trackPosition) &&
        info.hasValidIdCrc() && info.hasData());
}

/**
 * The cylinder that every readable sector of a track names in its ID, or undefined if they don't all
 * name the same one, or the track has none.
 */
function namedCylinder(floppy: FloppyDisk, trackPosition: TrackPosition, sectorNumbers: number[]): number | undefined {
    let named: number | undefined = undefined;
    for (const sectorNumber of sectorNumbers) {
        const sector = floppy.readSector(new SectorPosition(trackPosition, sectorNumber));
        if (sector === undefined) {
            return undefined;
        }
        const cylinder = sector.sectorPosition.cylinderNumber;
        if (named !== undefined && named !== cylinder) {
            return undefined;
        }
        named = cylinder;
    }
    return named;
}

/**
 * Whether a track is an imager's re-read of an earlier cylinder: a drive that couldn't step any further
 * read the same cylinder again. Every readable sector's ID names the same earlier cylinder, which is in
 * the image on the same side, with its own IDs, and every sector reads the same as that cylinder's.
 *
 * @return the cylinder it re-reads, or undefined if it isn't a re-read.
 */
export function findReReadCylinder(floppy: FloppyDisk, trackPosition: TrackPosition): number | undefined {
    const sectorNumbers = [...new Set(readableIds(floppy, trackPosition).map(info => info.sectorPosition.sectorNumber))];
    const named = namedCylinder(floppy, trackPosition, sectorNumbers);
    if (named === undefined || named >= trackPosition.cylinderNumber) {
        return undefined;
    }

    const earlier = new TrackPosition(named, trackPosition.side);
    for (const sectorNumber of sectorNumbers) {
        const tail = floppy.readSector(new SectorPosition(trackPosition, sectorNumber));
        const original = floppy.readSector(new SectorPosition(earlier, sectorNumber));
        if (original === undefined || original.sectorPosition.cylinderNumber !== named || !sectorsReadTheSame(tail, original)) {
            return undefined;
        }
    }
    return named;
}

/**
 * What a track past the disk's end holds.
 */
export enum TailTrackKind {
    /** No ID that a controller accepts: nothing is there. */
    UNFORMATTED,
    /** A re-read of an earlier cylinder (see {@link findReReadCylinder}). */
    RE_READ,
    /** Its IDs name another cylinder, but it isn't a re-read of it, as on an 80-track read of a 40-track disk. */
    FOREIGN_IDS,
    /** Formatted with the sectors and density of the disk's last cylinder. */
    LIKE_DISK,
    /** Formatted some other way, such as by an earlier format of the diskette. */
    OTHER_FORMAT,
}

/**
 * One track past the disk's end.
 */
export interface TailTrack {
    readonly trackPosition: TrackPosition;
    readonly kind: TailTrackKind;
    /** For a re-read or foreign IDs, the cylinder its IDs name. */
    readonly namedCylinder: number | undefined;
}

/**
 * Whether a track is a provable leftover that nothing on the disk needs: a re-read or unformatted.
 */
export function isDroppableTailTrack(track: TailTrack): boolean {
    switch (track.kind) {
        case TailTrackKind.UNFORMATTED:
        case TailTrackKind.RE_READ:
            return true;
        case TailTrackKind.FOREIGN_IDS:
        case TailTrackKind.LIKE_DISK:
        case TailTrackKind.OTHER_FORMAT:
            return false;
        default:
            assertNever(track.kind);
    }
}

/**
 * Say what a track past the disk's end holds.
 *
 * @param floppy the disk.
 * @param trackPosition the track.
 * @param reference a track inside the disk to compare its format with, normally the last cylinder's on
 * the same side, or undefined if there's none.
 */
export function classifyTailTrack(floppy: FloppyDisk, trackPosition: TrackPosition,
                                  reference: TrackPosition | undefined): TailTrack {

    const goodIds = floppy.getGeometry().sectorInfos.filter(info =>
        info.sectorPosition.trackPosition.equals(trackPosition) && info.hasValidIdCrc());
    if (goodIds.length === 0) {
        return {trackPosition, kind: TailTrackKind.UNFORMATTED, namedCylinder: undefined};
    }

    const reRead = findReReadCylinder(floppy, trackPosition);
    if (reRead !== undefined) {
        return {trackPosition, kind: TailTrackKind.RE_READ, namedCylinder: reRead};
    }

    const sectorNumbers = [...new Set(readableIds(floppy, trackPosition).map(info => info.sectorPosition.sectorNumber))];
    const named = namedCylinder(floppy, trackPosition, sectorNumbers);
    if (named !== undefined && named !== trackPosition.cylinderNumber) {
        return {trackPosition, kind: TailTrackKind.FOREIGN_IDS, namedCylinder: named};
    }

    const geometry = floppy.getGeometry();
    const track = geometry.trackMap.get(trackPosition.key());
    const referenceTrack = reference === undefined ? undefined : geometry.trackMap.get(reference.key());
    const likeDisk = track !== undefined && referenceTrack !== undefined &&
        !track.mixedDensity &&
        track.modalDensity === referenceTrack.modalDensity &&
        track.modalSectorSize === referenceTrack.modalSectorSize &&
        track.sectorNumbers.length === referenceTrack.sectorNumbers.length &&
        track.sectorNumbers.every((sectorNumber, i) => sectorNumber === referenceTrack.sectorNumbers[i]);
    return {trackPosition, kind: likeDisk ? TailTrackKind.LIKE_DISK : TailTrackKind.OTHER_FORMAT, namedCylinder: named};
}

/**
 * Why a cylinder past the disk's end is kept, most important first. A cylinder is listed with the first
 * reason that applies.
 */
export enum TailKeepReason {
    /** The tail has more than {@link MAX_TRIMMABLE_TAIL} cylinders, which wants a person to look. */
    TOO_LONG,
    /** The disk has a sign of copy protection that isn't about particular tracks. */
    DISK_PROTECTION_SIGN,
    /** A file or the directory is on it. */
    CLAIMED,
    /** The boot sector says the directory is on it. */
    BOOT_POINTER,
    /** The GAT has free space on it, so the DOS counts it as part of the disk. */
    FREE_SPACE,
    /** One of its tracks has a sign of copy protection. */
    PROTECTION_SIGN,
    /** One of its tracks has IDs naming another cylinder, but isn't a re-read of it. */
    FOREIGN_IDS,
    /** One of its tracks is formatted like the disk; an unused tail in the disk's own format is left alone. */
    LIKE_DISK,
    /** One of its tracks is formatted some other way, and may hold an earlier format's data. */
    OTHER_FORMAT,
    /** It could go, but a later cylinder stays, and only an unbroken run to the end of the image is dropped. */
    LATER_CYLINDER_KEPT,
}

/**
 * One cylinder past the disk's end.
 */
export interface TailCylinder {
    readonly cylinder: number;
    /** Its tracks, one per side of the image. */
    readonly tracks: TailTrack[];
    /** The files (or "the directory") that have data on it. */
    readonly claimedBy: string[];
    readonly hasFreeSpace: boolean;
    /** Whether the boot sector says the directory is on it. */
    readonly bootPointer: boolean;
    /**
     * The signs of copy protection on its tracks, not counting IDs naming another cylinder on a re-read
     * or on a track kept as {@link TailTrackKind.FOREIGN_IDS}.
     */
    readonly signs: ProtectionSign[];
    /** Why it's kept, or undefined if it can be dropped. */
    keepReason: TailKeepReason | undefined;
}

/**
 * The cylinders of a floppy image past the disk's end, and which of them provably aren't part of the disk.
 */
export interface FloppyTail {
    /** The disk's size by its DOS's records, or undefined if they don't prove one. */
    readonly size: DosDiskSize | undefined;
    /** Why the size isn't proven, as a clause for a person. Undefined when it is. */
    readonly unproven: string | undefined;
    /** The cylinders from the disk's end to the image's, in order. Empty without a size. */
    readonly cylinders: TailCylinder[];
    /** The first cylinder that can be dropped: every cylinder from it to the end of the image can go. The image's cylinder count if none can. */
    readonly dropFrom: number;
    /** The signs of copy protection that aren't about particular tracks, which keep the whole tail. */
    readonly diskSigns: ProtectionSign[];
}

/**
 * Whether a sign on a tail track is the track's kind seen another way: IDs naming another cylinder on a
 * re-read (which isn't protection) or on a track kept for its foreign IDs (which says so itself).
 */
function isExplainedByTrackKind(sign: ProtectionSign, track: TailTrack): boolean {
    return sign.kind === ProtectionSignKind.FOREIGN_CYLINDER_IDS &&
        (track.kind === TailTrackKind.RE_READ || track.kind === TailTrackKind.FOREIGN_IDS);
}

/**
 * The cylinder that a 2.3-family boot sector says the directory is on, or undefined if it doesn't say.
 */
function bootSectorDirectoryCylinder(floppy: FloppyDisk, trsdos: Trsdos): number | undefined {
    if (trsdos.version !== TrsdosVersion.V2_3 || !trsdos.lumpsAreCylinders) {
        return undefined;
    }
    const bootTrack = floppy.getGeometry().bootTrack;
    const bootSector = bootTrack === undefined ? undefined : floppy.readSector(bootTrack.firstSectorPosition());
    if (bootSector === undefined || bootSector.data.length < 3 || bootSector.data[1] !== 0xFE) {
        return undefined;
    }
    return bootSector.data[2] & 0x7F;
}

/**
 * Work out which cylinders at the end of a floppy image provably aren't part of the disk, by Ira
 * Goldklang's rules. A cylinder can go only if all of these hold:
 *
 * 1. The DOS's own records put it past the disk's end ({@link findDosDiskSize}), and no file, directory,
 *    free space or boot sector pointer is on it. No proven size means nothing can go.
 * 2. Each of its tracks is a re-read of an earlier cylinder or unformatted. Tracks formatted like the disk
 *    stay even when unused, and tracks in another format stay for a person to look at.
 * 3. It's part of an unbroken run of such cylinders to the end of the image.
 * 4. None of its tracks has a sign of copy protection (a re-read's IDs naming the cylinder it re-reads
 *    don't count), and it isn't Tandy's protection track even with only its FORMAT output, the disk has no protection sign that isn't about particular tracks, and the tail has
 *    at most {@link MAX_TRIMMABLE_TAIL} cylinders.
 * 5. On a double-sided image, both of its tracks qualify.
 *
 * @param floppy the disk.
 * @param fileSystem its file system, if it has one we read.
 * @param signs the disk's protection signs, from {@link findProtectionSigns}.
 * @param granuleMap the file system's granule map, if it's TRSDOS-family and the caller has it already.
 */
export function analyzeFloppyTail(floppy: FloppyDisk, fileSystem: FloppyFileSystem | undefined,
                                  signs: readonly ProtectionSign[], granuleMap?: TrsdosGranuleMap): FloppyTail {

    const geometry = floppy.getGeometry();
    const imageCylinders = geometry.cylinderCount;
    const diskSigns = signs.filter(sign => isProtectionSign(sign) && sign.tracks.length === 0);
    const noTail = (unproven: string): FloppyTail =>
        ({size: undefined, unproven, cylinders: [], dropFrom: imageCylinders, diskSigns});

    if (!(fileSystem instanceof Trsdos)) {
        return noTail(fileSystem === undefined ? "the disk has no file system that we recognize" :
            fileSystem.nameAndVersion + " disks don't record their size");
    }
    const trsdos = fileSystem;
    const map = granuleMap ?? TrsdosGranuleMap.make(trsdos);
    if (typeof map === "string") {
        return noTail("its GAT can't be read (" + map + ")");
    }
    const use = findTrsdosCylinderUse(trsdos, map, imageCylinders);
    const size = findDosDiskSize(trsdos, floppy, use);
    if (typeof size === "string") {
        return noTail(size);
    }

    // The signs on each track.
    const signsByTrack = new Map<string, ProtectionSign[]>();
    for (const sign of signs) {
        for (const track of sign.tracks) {
            const list = signsByTrack.get(track.key()) ?? [];
            list.push(sign);
            signsByTrack.set(track.key(), list);
        }
    }

    const bootCylinder = bootSectorDirectoryCylinder(floppy, trsdos);
    const tailLength = imageCylinders - size.cylinderCount;
    const cylinders: TailCylinder[] = [];
    for (let cylinder = size.cylinderCount; cylinder < imageCylinders; cylinder++) {
        const tracks: TailTrack[] = [];
        const cylinderSigns: ProtectionSign[] = [];
        for (let side = 0; side < geometry.sideCount; side++) {
            const trackPosition = new TrackPosition(cylinder, side);
            const reference = new TrackPosition(size.cylinderCount - 1, side);
            const track = classifyTailTrack(floppy, trackPosition, reference);
            tracks.push(track);
            for (const sign of signsByTrack.get(trackPosition.key()) ?? []) {
                if (!isExplainedByTrackKind(sign, track) && !cylinderSigns.includes(sign)) {
                    cylinderSigns.push(sign);
                }
            }
        }

        const {claimedBy, hasFreeSpace} = use[cylinder];
        const bootPointer = bootCylinder === cylinder;
        const firstKeptTrack = tracks.find(track => !isDroppableTailTrack(track));
        let keepReason: TailKeepReason | undefined;
        if (tailLength > MAX_TRIMMABLE_TAIL) {
            keepReason = TailKeepReason.TOO_LONG;
        } else if (diskSigns.length > 0) {
            keepReason = TailKeepReason.DISK_PROTECTION_SIGN;
        } else if (claimedBy.length > 0) {
            keepReason = TailKeepReason.CLAIMED;
        } else if (bootPointer) {
            keepReason = TailKeepReason.BOOT_POINTER;
        } else if (hasFreeSpace && trsdos.version !== TrsdosVersion.V1_3) {
            keepReason = TailKeepReason.FREE_SPACE;
        } else if (cylinderSigns.length > 0) {
            keepReason = TailKeepReason.PROTECTION_SIGN;
        } else if (firstKeptTrack !== undefined) {
            keepReason = tailTrackKeepReason(firstKeptTrack);
        } else {
            keepReason = undefined;
        }
        cylinders.push({cylinder, tracks, claimedBy, hasFreeSpace, bootPointer, signs: cylinderSigns, keepReason});
    }

    // Only an unbroken run to the end of the image goes.
    let dropFrom = imageCylinders;
    for (let i = cylinders.length - 1; i >= 0 && cylinders[i].keepReason === undefined; i--) {
        dropFrom = cylinders[i].cylinder;
    }
    for (const tailCylinder of cylinders) {
        if (tailCylinder.cylinder < dropFrom && tailCylinder.keepReason === undefined) {
            tailCylinder.keepReason = TailKeepReason.LATER_CYLINDER_KEPT;
        }
    }

    return {size, unproven: undefined, cylinders, dropFrom, diskSigns};
}

/**
 * Why a track keeps its cylinder, for a track that isn't droppable.
 */
function tailTrackKeepReason(track: TailTrack): TailKeepReason {
    switch (track.kind) {
        case TailTrackKind.FOREIGN_IDS:
            return TailKeepReason.FOREIGN_IDS;
        case TailTrackKind.LIKE_DISK:
            return TailKeepReason.LIKE_DISK;
        case TailTrackKind.OTHER_FORMAT:
            return TailKeepReason.OTHER_FORMAT;
        case TailTrackKind.UNFORMATTED:
        case TailTrackKind.RE_READ:
            throw new Error("A droppable track doesn't keep its cylinder");
        default:
            assertNever(track.kind);
    }
}

/**
 * Join some names for a message, as "A", "A and B", or "A, B and C".
 */
function joinNames(names: readonly string[]): string {
    return names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/**
 * Say why a cylinder past the disk's end is kept, as a clause that doesn't name the cylinder (so that
 * cylinders kept for the same reason can share it), such as "it's formatted like the rest of the disk".
 *
 * @param tail the analysis the cylinder is from.
 * @param tailCylinder the kept cylinder.
 * @param sideCount the image's sides, so that a side is named only where there's more than one.
 */
export function describeTailKeepReason(tail: FloppyTail, tailCylinder: TailCylinder, sideCount: number): string {
    const reason = tailCylinder.keepReason;
    const firstKeptTrack = tailCylinder.tracks.find(track => !isDroppableTailTrack(track));
    const sidePrefix = sideCount > 1 && firstKeptTrack !== undefined ?
        "on side " + firstKeptTrack.trackPosition.side + ", " : "";
    switch (reason) {
        case undefined:
            return "it can be dropped";
        case TailKeepReason.TOO_LONG:
            return "the image has " + tail.cylinders.length + " cylinders past the disk's end, and a tail of " +
                (MAX_TRIMMABLE_TAIL + 1) + " or more wants a person to look at it";
        case TailKeepReason.DISK_PROTECTION_SIGN:
            return "the disk shows signs of copy protection (" +
                joinNames(tail.diskSigns.map(sign => protectionSignKindToString(sign.kind))) + ")";
        case TailKeepReason.CLAIMED:
            return joinNames(tailCylinder.claimedBy) + (tailCylinder.claimedBy.length === 1 ? " is" : " are") + " on it";
        case TailKeepReason.BOOT_POINTER:
            return "the boot sector says the directory is on it";
        case TailKeepReason.FREE_SPACE:
            return "the GAT has free space on it, so the DOS counts it as part of the disk";
        case TailKeepReason.PROTECTION_SIGN: {
            const names = joinNames(tailCylinder.signs.map(sign => protectionSignKindToString(sign.kind)));
            // Tandy's protection track as FORMAT writes it isn't protection, but is never dropped either.
            return tailCylinder.signs.some(isProtectionSign) ? "it shows signs of copy protection (" + names + ")" :
                "it's a " + names + ", which is never dropped";
        }
        case TailKeepReason.FOREIGN_IDS:
            return sidePrefix + "its IDs name cylinder " + firstKeptTrack?.namedCylinder +
                ", but it doesn't read the same as that cylinder";
        case TailKeepReason.LIKE_DISK:
            return sidePrefix + "it's formatted like the rest of the disk, and an unused tail in the disk's own " +
                "format is left alone";
        case TailKeepReason.OTHER_FORMAT:
            return sidePrefix + "it's formatted differently from the rest of the disk, perhaps by an earlier format, " +
                "and may hold its data";
        case TailKeepReason.LATER_CYLINDER_KEPT:
            return "a later cylinder is kept, and only an unbroken run to the end of the image is dropped";
        default:
            assertNever(reason);
    }
}

/**
 * The signs of copy protection that should stop a change to a disk (a repair, a trim): every sign that
 * counts as protection, except IDs naming another cylinder when every track with them is a re-read past
 * the disk's proven end.
 *
 * @param floppy the disk.
 * @param fileSystem its file system, if it has one we read.
 * @param signs the disk's signs, if the caller has them already.
 */
export function findBlockingProtectionSigns(floppy: FloppyDisk, fileSystem: FloppyFileSystem | undefined,
                                            signs?: readonly ProtectionSign[]): ProtectionSign[] {

    const allSigns = signs ?? findProtectionSigns(floppy, fileSystem);
    const tail = analyzeFloppyTail(floppy, fileSystem, allSigns);
    const reReadKeys = new Set<string>();
    for (const tailCylinder of tail.cylinders) {
        for (const track of tailCylinder.tracks) {
            if (track.kind === TailTrackKind.RE_READ) {
                reReadKeys.add(track.trackPosition.key());
            }
        }
    }
    return allSigns.filter(sign => isProtectionSign(sign) &&
        !(sign.kind === ProtectionSignKind.FOREIGN_CYLINDER_IDS && sign.tracks.length > 0 &&
            sign.tracks.every(track => reReadKeys.has(track.key()))));
}
