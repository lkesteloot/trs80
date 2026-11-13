/**
 * How many cylinders a TRSDOS-family disk has by its DOS's own records, and what its file system uses on
 * each cylinder. Trimming uses the size to tell what's past the disk's end, the copy-protection screen
 * uses it to tell leftovers past the end from the disk's own tracks, and the writer's allocator never gives
 * a file a granule past it. See "Tails past the disk's end" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {DosFamily, dosNameToString, isUnknownDosName} from "./DosName.js";
import {FloppyDisk} from "./FloppyDisk.js";
import {readPdriveTable} from "./Pdrive.js";
import {SectorOverlay} from "./SectorOverlay.js";
import type {Trsdos} from "./Trsdos.js";
import {GAT_MEDIA_BLOCK_OFFSET, gatHasMediaBlock} from "./TrsdosDiskInfo.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {multidosGatSize} from "./TrsdosMultidos.js";
import {identifyTrsdosRuleSet, TrsdosRuleSet} from "./TrsdosRuleSet.js";

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
 * The size of a MultiDOS disk, from GAT bytes 0xCC and 0xCD, which MultiDOS keeps in one of two forms
 * (see multidosGatSize()). Only a GAT that agrees with the decoded layout, on the image's cylinders or
 * fewer, counts, since a "P" density disk's 0xCC is lumps rather than cylinders, and so is a NEWDOS/80
 * disk's after MultiDOS's CAT (X).
 */
function multidosDiskSize(trsdos: Trsdos): DosDiskSize | string {
    const gat = trsdos.disk.readSector(trsdos.getGatPosition());
    if (gat === undefined) {
        return "its GAT can't be read";
    }
    const size = multidosGatSize(trsdos, gat.data);
    if (size === undefined) {
        return "GAT bytes 0xCC and 0xCD don't describe this disk's layout in either of the forms MultiDOS writes";
    }
    switch (size.form) {
        case "counts":
            return {cylinderCount: size.cylinderCount, source: "GAT byte 0xCD"};
        case "ldos":
            return {cylinderCount: size.cylinderCount, source: "GAT byte 0xCC"};
        default:
            assertNever(size.form);
    }
}

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
 * block), DOSPLUS's 0xCC, MultiDOS's 0xCC and 0xCD, NEWDOS/80's PDRIVE table, or TRSDOS 2.x and 1.x's fixed size. The GAT must agree:
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
            case TrsdosRuleSet.MULTIDOS:
                size = multidosDiskSize(trsdos);
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
 * How many cylinders a disk has by its DOS's own records, as findDosDiskSize() works it out, building the
 * granule map and the cylinder use that it needs.
 *
 * @param trsdos the file system.
 * @param floppy the disk it's on.
 * @return the size, or why the records don't prove one, as a clause for a person.
 */
export function findTrsdosDiskSize(trsdos: Trsdos, floppy: FloppyDisk): DosDiskSize | string {
    const granuleMap = TrsdosGranuleMap.make(trsdos);
    if (typeof granuleMap === "string") {
        return "its GAT can't be read (" + granuleMap + ")";
    }
    const use = findTrsdosCylinderUse(trsdos, granuleMap, floppy.getGeometry().cylinderCount);
    return findDosDiskSize(trsdos, floppy, use);
}

/**
 * How many cylinders the floppy under a TRSDOS-family file system has by its DOS's own records, as
 * findDosDiskSize() works them out, looking through an overlay if the file system is being written.
 *
 * @param trsdos the file system.
 * @param granuleMap its granule map.
 * @return the cylinder count, or undefined if the records prove no size, or the file system is on a hard
 * disk partition, whose size is its own.
 */
export function findTrsdosProvenCylinderCount(trsdos: Trsdos, granuleMap: TrsdosGranuleMap): number | undefined {
    const volume = trsdos.disk instanceof SectorOverlay ? trsdos.disk.base : trsdos.disk;
    if (!(volume instanceof FloppyDisk)) {
        return undefined;
    }
    const use = findTrsdosCylinderUse(trsdos, granuleMap, volume.getGeometry().cylinderCount);
    const size = findDosDiskSize(trsdos, volume, use);
    return typeof size === "string" ? undefined : size.cylinderCount;
}

/**
 * Whether every sector of a granule is on a cylinder before a count, as from
 * findTrsdosProvenCylinderCount(). A granule past it is outside the disk as its DOS formatted it, however
 * free the GAT says it is (TRSDOS 1.3's GAT is zero past its 40 cylinders).
 *
 * @param trsdos the file system.
 * @param lump the granule's lump.
 * @param granule the granule within the lump.
 * @param cylinderCount the disk's cylinders, or undefined if they aren't known, when every granule is inside.
 */
export function isGranuleInsideCylinders(trsdos: Trsdos, lump: number, granule: number,
                                         cylinderCount: number | undefined): boolean {

    return cylinderCount === undefined || trsdos.getGranuleSectorPositions(lump, granule)
        .every(position => position.cylinderNumber < cylinderCount);
}
