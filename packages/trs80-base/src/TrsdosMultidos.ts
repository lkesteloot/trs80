import {Density, type FloppyDisk, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {DosFamily, type DosName, dosNameToString, isUnknownDosName} from "./DosName.js";
import {type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {ruleSetForDosName, TrsdosRuleSet} from "./TrsdosRuleSet.js";

/**
 * The raw name of the entry that MultiDOS 1.x's FORMAT writes where other DOSes put BOOT/SYS, in mixed
 * case. It's FORMAT's marker, not a user file, so it's never deleted, renamed or replaced, and stays a
 * system file. See "Writing MultiDOS" in FLOPPY_FORMATS.md.
 */
export const MULTIDOS_MARKER_RAW_FILENAME = "NoDOS   Ind";

/**
 * The most lumps that MultiDOS's GAT holds: bytes 0x00-0xBF. MultiDOS 1.6 keeps its retry count at
 * 0xC4, and later releases fill 0xC0-0xCB with 0xFF on floppies.
 */
const MULTIDOS_MAX_LUMPS = 0xC0;

/**
 * The most cylinders that MultiDOS's FORMAT makes, which is also the most that a lockout table can
 * cover.
 */
const MULTIDOS_MAX_CYLINDERS = 96;

// The GAT bytes that describe the disk's size, in one of two forms (see multidosGatSize()).
const GAT_SIZE_OFFSET = 0xCC;
const GAT_FLAGS_OFFSET = 0xCD;

// The bits of GAT byte 0xCD in its LDOS form.
const GAT_FLAG_DOUBLE_DENSITY = 0x40;
const GAT_FLAG_TWO_SIDED = 0x20;
const GAT_FLAG_GRANULES_MASK = 0x07;

// LDOS's excess-35 cylinder count in 0xCC.
const GAT_CYLINDER_EXCESS = 35;

// A "P" (pseudo double) density disk: NEWDOS/80-style lumps of two 5-sector granules on 18-sector
// double-density tracks, after a single-density cylinder 0.
const P_DENSITY_SECTORS_PER_TRACK = 18;
const P_DENSITY_SECTORS_PER_GRANULE = 5;
const P_DENSITY_GRANULES_PER_LUMP = 2;

// The directory sectors among the first of which entries 0 and 1 hold system files (see multidosReservedDecs()).
const SYSTEM_FILE_SECTOR_COUNT = 16;
const SYSTEM_FILE_ENTRIES_PER_SECTOR = 2;

// The entries of the last directory sector that MultiDOS 1.7 on keeps DIR/SYS and SYSRES/SYS in.
const LAST_SECTOR_SYSTEM_ENTRIES = [6, 7];

// The directory sectors that a DEC can address: 32 sectors of 8 entries.
const MAX_DEC_SECTORS = 32;

/**
 * What GAT bytes 0xCC and 0xCD say about a disk's size, in whichever of MultiDOS's two forms agrees with
 * the layout we decoded.
 */
export interface MultidosGatSize {
    /**
     * Which form the bytes are in: "counts" (0xCC the number of lumps and 0xCD the number of physical
     * cylinders, which MultiDOS 1.x writes, and which every release writes on a "P" density disk), or
     * "ldos" (0xCC the cylinders less 35 and 0xCD LDOS's flags, as from 2.0).
     */
    form: "counts" | "ldos";

    /**
     * The number of physical cylinders, cylinder 0 included.
     */
    cylinderCount: number;
}

/**
 * Whether a disk names MultiDOS or MultiDOS II as its DOS, or as one of the candidates.
 */
export function namesMultidos(name: DosName): boolean {
    for (let candidate: DosName | undefined = name; candidate !== undefined; candidate = candidate.or) {
        if (candidate.family === DosFamily.MULTIDOS || candidate.family === DosFamily.MULTIDOS_II) {
            return true;
        }
    }
    return false;
}

/**
 * Whether the decoded layout is a "P" density one: lumps of two 5-sector granules on 18-sector
 * double-density tracks, starting at cylinder 1, on one side.
 */
function isPDensityLayout(trsdos: Trsdos): boolean {
    return !trsdos.lumpsAreCylinders &&
        trsdos.firstDataCylinder === 1 &&
        trsdos.allocationSides === 1 &&
        trsdos.sectorsPerCylinder === P_DENSITY_SECTORS_PER_TRACK &&
        trsdos.sectorsPerGranule === P_DENSITY_SECTORS_PER_GRANULE &&
        trsdos.granulesPerLump === P_DENSITY_GRANULES_PER_LUMP &&
        trsdos.geometry.modalDataDensity === Density.DOUBLE;
}

/**
 * Read GAT bytes 0xCC and 0xCD in whichever of MultiDOS's two forms agrees with the decoded layout. In the
 * "counts" form (MultiDOS 1.x, and every "P" density disk), 0xCC is the number of lumps and 0xCD the number
 * of physical cylinders. In the "ldos" form (2.0 on), 0xCC is the cylinders less 35 and 0xCD has LDOS's
 * flags: bit 6 double density, bit 5 two sides, and bits 2-0 the granules per track (or, on one 2.0 disk,
 * per cylinder) less one. Either way the cylinders must be the image's: a GAT that describes a larger disk
 * than the image, or a smaller one (an image with an extra cylinder), doesn't agree. See "Writing MultiDOS"
 * in FLOPPY_FORMATS.md.
 *
 * @param trsdos the file system.
 * @param gat the GAT sector's bytes.
 * @return the size, or undefined if neither form agrees with the layout.
 */
export function multidosGatSize(trsdos: Trsdos, gat: Uint8Array): MultidosGatSize | undefined {
    const size = gat[GAT_SIZE_OFFSET] ?? 0;
    const flags = gat[GAT_FLAGS_OFFSET] ?? 0;
    const cylinderCount = trsdos.geometry.cylinderCount;

    if (size === trsdos.lumpCount && flags === cylinderCount) {
        return {form: "counts", cylinderCount};
    }

    // LDOS's form doesn't describe NEWDOS/80-style lumps.
    if (!trsdos.lumpsAreCylinders) {
        return undefined;
    }
    const sides = (flags & GAT_FLAG_TWO_SIDED) !== 0 ? 2 : 1;
    const density = (flags & GAT_FLAG_DOUBLE_DENSITY) !== 0 ? Density.DOUBLE : Density.SINGLE;
    const granules = (flags & GAT_FLAG_GRANULES_MASK) + 1;
    const granulesAgree = granules === trsdos.granulesPerLump/trsdos.allocationSides ||
        granules === trsdos.granulesPerLump;
    if (size + GAT_CYLINDER_EXCESS === cylinderCount && sides === trsdos.allocationSides &&
        density === trsdos.geometry.modalDataDensity && granulesAgree) {

        return {form: "ldos", cylinderCount};
    }
    return undefined;
}

/**
 * Whether any sector on the floppy's second side has an ID that says side 0. A disk with one volume per
 * side (a directory on each) is formatted like two single-sided disks, so that its second side's IDs say
 * side 0.
 */
function secondSideSaysSideZero(floppy: FloppyDisk): boolean {
    const geometry = floppy.getGeometry();
    for (let cylinder = 0; cylinder < geometry.cylinderCount; cylinder++) {
        for (let sector = geometry.firstSectorNumber; sector <= geometry.lastSectorNumber; sector++) {
            const sectorData = floppy.readSector(new SectorPosition(new TrackPosition(cylinder, 1), sector));
            if (sectorData !== undefined && sectorData.sectorPosition.trackPosition.side === 0) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Why we won't write a disk under MultiDOS's rules, or undefined if we will. None of these can be forced.
 * The checks are in order and the first failure is reported. See "Writing MultiDOS" in FLOPPY_FORMATS.md.
 *
 * - The disk must name a MultiDOS release whose rules we have (1.x or 2.00), not MultiDOS II, a later
 *   MultiDOS, or a MultiDOS with no version.
 * - A two-sided image must allocate both sides as one volume, and the second side's IDs must say side 1.
 *   MultiDOS also makes disks with a volume on each side, which we'd write as one-sided, and those can't be
 *   told from one-volume disks whose second side we didn't see used.
 * - The layout must be one that MultiDOS makes: whole cylinders of 5- or 6-sector granules, or "P" density.
 * - GAT bytes 0xCC and 0xCD must agree with the layout (see {@link multidosGatSize}).
 *
 * @param trsdos the file system.
 * @param floppy the disk it's on (not an overlay).
 * @return one or two sentences for the user, ending in a period, or undefined.
 */
export function multidosLayoutProblem(trsdos: Trsdos, floppy: FloppyDisk): string | undefined {
    if (trsdos.version !== TrsdosVersion.V2_3) {
        return "This disk isn't on the layout that MultiDOS uses, so writing it isn't supported.";
    }

    if (ruleSetForDosName(trsdos.dosName, trsdos.version) !== TrsdosRuleSet.MULTIDOS) {
        const says = isUnknownDosName(trsdos.dosName) ? "doesn't say which DOS wrote it" :
            `says it's ${dosNameToString(trsdos.dosName)}`;
        return `This disk ${says}, and only MultiDOS 1.x and 2.00 disks are written under MultiDOS's rules.`;
    }

    if (floppy.getGeometry().sideCount > 1) {
        if (trsdos.allocationSides === 1) {
            return "The image has two sides but the disk allocates only the first, and MultiDOS also makes " +
                "disks with a directory on each side, so writing it isn't supported.";
        }
        if (secondSideSaysSideZero(floppy)) {
            return "Sectors on the second side say they're on side 0, as on a MultiDOS disk with a directory " +
                "on each side, so writing it isn't supported.";
        }
    }

    const cylinderLayout = trsdos.lumpsAreCylinders &&
        (trsdos.sectorsPerGranule === 5 || trsdos.sectorsPerGranule === 6);
    if (!cylinderLayout && !isPDensityLayout(trsdos)) {
        return `This disk has ${trsdos.granulesPerLump} granules of ${trsdos.sectorsPerGranule} sectors per ` +
            `${trsdos.lumpTerm}, which isn't a layout that MultiDOS makes, so writing it isn't supported.`;
    }

    if (trsdos.geometry.cylinderCount > MULTIDOS_MAX_CYLINDERS || trsdos.lumpCount > MULTIDOS_MAX_LUMPS) {
        return `This disk has ${trsdos.geometry.cylinderCount} cylinders and ${trsdos.lumpCount} ` +
            `${trsdos.lumpTerm}s, more than MultiDOS's GAT can hold, so writing it isn't supported.`;
    }

    const gat = trsdos.disk.readSector(trsdos.getGatPosition());
    if (gat === undefined) {
        return "This disk's GAT can't be read, so writing it isn't supported.";
    }
    if (multidosGatSize(trsdos, gat.data) === undefined) {
        const hex = (offset: number) =>
            "0x" + (gat.data[offset] ?? 0).toString(16).toUpperCase().padStart(2, "0");
        const size = trsdos.lumpsAreCylinders ? `${trsdos.geometry.cylinderCount} cylinders` :
            `${trsdos.geometry.cylinderCount} cylinders and ${trsdos.lumpCount} lumps`;
        return `This disk's GAT bytes 0xCC and 0xCD (${hex(GAT_SIZE_OFFSET)} and ${hex(GAT_FLAGS_OFFSET)}) don't ` +
            `describe its ${size} in either of the forms MultiDOS writes, so writing it isn't supported.`;
    }

    return undefined;
}

/**
 * The directory slots (DECs) that MultiDOS's system files can take, which a user file must never take:
 *
 * - Entries 0 and 1 of each of the first 16 directory sectors. MultiDOS 1.0-1.6 put their system files in
 *   the first 16 slots in DEC order (entry 0 of sectors 0-15 on a 16-sector directory, or of sectors 0-7
 *   and then entry 1 of sectors 0-7 on an 8-sector one), and PACK/SYS after them; 1.7 and 2.00 put theirs
 *   in entries 0 and 1 of sectors 0-11.
 * - Entries 6 and 7 of the last directory sector, where 1.7 and 2.00 keep DIR/SYS and SYSRES/SYS.
 *
 * That's more than any one release uses, but which release copied the system to a disk can't always be
 * told. See "Writing MultiDOS" in FLOPPY_FORMATS.md.
 */
export function multidosReservedDecs(trsdos: Trsdos): number[] {
    const entrySectorCount = trsdos.granulesPerDir*trsdos.sectorsPerGranule - 2;
    const decs: number[] = [];
    for (let entryIndex = 0; entryIndex < SYSTEM_FILE_ENTRIES_PER_SECTOR; entryIndex++) {
        for (let sectorIndex = 0; sectorIndex < Math.min(SYSTEM_FILE_SECTOR_COUNT, entrySectorCount); sectorIndex++) {
            decs.push(trsdos.dirEntryToHitNumber(sectorIndex, entryIndex));
        }
    }
    if (entrySectorCount > 0 && entrySectorCount <= MAX_DEC_SECTORS) {
        for (const entryIndex of LAST_SECTOR_SYSTEM_ENTRIES) {
            decs.push(trsdos.dirEntryToHitNumber(entrySectorCount - 1, entryIndex));
        }
    }
    return decs;
}
