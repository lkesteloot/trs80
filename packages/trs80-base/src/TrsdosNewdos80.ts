import {Density} from "./FloppyDisk.js";
import {DosFamily} from "./DosName.js";
import {readPdriveTable} from "./Pdrive.js";
import {trsdos23SystemFilename, type Trsdos, TrsdosVersion} from "./Trsdos.js";

/**
 * The most lumps that a disk can have and still have a granule existence table in its GAT (bytes
 * 0x60-0xBF). With more, the allocation table runs through 0xBF. See "Writing NEWDOS/80" in
 * FLOPPY_FORMATS.md.
 */
export const NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE = 96;

/**
 * The most lumps that the GAT can hold: its bytes 0x00-0xBF.
 */
export const NEWDOS80_MAX_LUMPS = 192;

/**
 * The highest lump number that a directory entry's extent can name (NEWDOS/80 Version 2.0 manual, PDF
 * page 100).
 */
export const NEWDOS80_MAX_EXTENT_LUMP = 191;

/**
 * The HIT byte that holds how many directory entry sectors there are beyond the first 8: 0, 5, 10, 15
 * or 20. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 */
export const NEWDOS80_EXTRA_DIR_SECTORS_OFFSET = 0x1F;

// The GAT byte that holds the DOS's version marker, and its values for NEWDOS/80 versions 1.0 and 2.
const GAT_VERSION_OFFSET = 0xCB;
const GAT_VERSION_NEWDOS80_V1 = 0x80;
const GAT_VERSION_NEWDOS80_V2 = 0x82;

// The only layout that NEWDOS/80 version 1.0 disks are written in: single density, one side, 10 sectors and two
// granules to a lump, which is a cylinder. See "Version 1.0's own writes" in FLOPPY_FORMATS.md.
const NEWDOS80_V1_SECTORS_PER_CYLINDER = 10;
const NEWDOS80_V1_GRANULES_PER_LUMP = 2;

// The offset in the GAT of the granule existence table, one byte per lump.
const GAT_EXISTENCE_OFFSET = 0x60;

// The sectors in a NEWDOS/80 granule.
const NEWDOS80_SECTORS_PER_GRANULE = 5;

// The directory sectors that every NEWDOS/80 directory has beyond the GAT and HIT.
const NEWDOS80_BASE_DIR_ENTRY_SECTORS = 8;

/**
 * The number of lumps that the DOS may allocate on a disk: the layout's lump count, or the lump
 * count in the disk's PDRIVE table if there's one and it's smaller. Granules in lumps at or past
 * this are never allocated or freed. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 */
export function newdos80DosLumpCount(trsdos: Trsdos): number {
    const table = readPdriveTable(trsdos.disk);
    if (table?.lumpCount !== undefined && table.lumpCount < trsdos.lumpCount) {
        return table.lumpCount;
    }
    return trsdos.lumpCount;
}

/**
 * Whether the DOS must never allocate (or free) a granule: it's in a lump past what the DOS
 * allocates, or the GAT's existence table says it doesn't exist. See "Writing NEWDOS/80" in
 * FLOPPY_FORMATS.md.
 *
 * @param trsdos the file system.
 * @param gatBytes the raw bytes of the GAT sector.
 * @param dosLumpCount the lumps the DOS allocates, from {@link newdos80DosLumpCount} (which reads the disk, so
 * the caller works it out once).
 * @param lump the lump.
 * @param granule the granule within the lump.
 */
export function newdos80GranuleNeverAllocated(trsdos: Trsdos, gatBytes: Uint8Array, dosLumpCount: number,
                                              lump: number, granule: number): boolean {

    if (lump >= dosLumpCount) {
        return true;
    }
    if (trsdos.lumpCount > NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE) {
        return false;
    }
    const existence = gatBytes[GAT_EXISTENCE_OFFSET + lump] ?? 0;
    return ((existence >> granule) & 1) !== 0;
}

/**
 * Whether the HIT's byte 0x1F agrees with the size of the directory that we decoded: the directory
 * is 8 entry sectors plus that byte. False if the HIT can't be read. See "Writing NEWDOS/80" in
 * FLOPPY_FORMATS.md.
 */
export function newdos80DirectorySizeRecorded(trsdos: Trsdos): boolean {
    const hitInfo = trsdos.getHitInfo();
    if (typeof hitInfo === "string") {
        return false;
    }
    const extra = hitInfo.hit[NEWDOS80_EXTRA_DIR_SECTORS_OFFSET];
    if (extra === undefined) {
        return false;
    }
    const entrySectors = trsdos.granulesPerDir*trsdos.sectorsPerGranule - 2;
    return entrySectors === NEWDOS80_BASE_DIR_ENTRY_SECTORS + extra;
}

/**
 * Check a decoded disk's PDRIVE table against the layout we decoded.
 *
 * @return a message naming the first disagreement, or undefined if the table agrees or there is none.
 */
function pdriveProblem(trsdos: Trsdos): string | undefined {
    const table = readPdriveTable(trsdos.disk);
    if (table === undefined) {
        return undefined;
    }

    const kFlag = trsdos.firstDataCylinder === 1;
    const checks: [string, number | boolean, number | boolean][] = [
        ["GPL", table.granulesPerLump, trsdos.granulesPerLump],
        ["SPT", table.sectorsPerTrack, trsdos.sectorsPerCylinder],
        ["DDSL", table.dirStartLump, trsdos.dirLumpNumber],
        ["DDGA", table.dirGranules, trsdos.granulesPerDir],
        ["the K flag of TI", table.track0OtherDensity, kFlag],
        ["the I flag of TI", table.sectorOneLowest, false],
        ["the J flag of TI", table.trackOneLowest, false],
    ];
    for (const [name, tableValue, layoutValue] of checks) {
        if (tableValue !== layoutValue) {
            return `The disk's PDRIVE table says ${name}=${tableValue}, but the disk is laid out with ` +
                `${name}=${layoutValue}, so writing it isn't supported.`;
        }
    }

    // Whether the GAT's bytes 0x60-0xBF are allocation or existence depends on the lump count.
    const tableLumps = table.lumpCount ?? 0;
    const tableHasExistence = tableLumps <= NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE;
    const layoutHasExistence = trsdos.lumpCount <= NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE;
    if (tableHasExistence !== layoutHasExistence) {
        return `The disk's PDRIVE table says it has ${tableLumps} lumps, but the disk is laid out with ` +
            `${trsdos.lumpCount}, which changes what the GAT's bytes 0x60-0xBF mean, so writing it isn't supported.`;
    }
    return undefined;
}

/**
 * Whether the disk's DOS is NEWDOS/80 version 1.0, whose files are written with byte 1 = 0 rather than version
 * 2's 0x20. The DOS the disk names decides: a version 1.0 system, or a version 2 one (on a disk that version 1.0
 * formatted, say). A disk that names no NEWDOS/80 release (written with --dos newdos-80) goes by its GAT's byte
 * 0xCB, which is 0x80 for version 1.0's FORMAT. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 */
export function newdos80IsVersion1(trsdos: Trsdos): boolean {
    const name = trsdos.dosName;
    if (name.family === DosFamily.NEWDOS_80 && name.versions.length > 0) {
        return name.versions.every(version => version.major() === 1);
    }
    const gat = trsdos.disk.readSector(trsdos.getGatPosition());
    return gat?.data[GAT_VERSION_OFFSET] === GAT_VERSION_NEWDOS80_V1;
}

/**
 * Why a disk that NEWDOS/80 version 1.0 formatted (GAT byte 0xCB = 0x80) isn't in the one version 1.0 layout we
 * write, or undefined if it is. That's single density and single sided, with lumps of two granules that are
 * cylinders, starting at cylinder 0: what Ira's disks made by version 1.0 itself show. The others are refused:
 *
 * - Double density, which version 1.0 has only through third-party patches such as DoubleZap, and whose
 *   double-sided disks store their sectors in an order that version 2 can't read (NEWDOS/80 Version 2.0 manual,
 *   PDF page 189).
 * - Single density on two sides (`SPT=20,GPL=4` by the same page), which no disk in our collection shows.
 * - A disk with a PDRIVE table, which version 1.0 doesn't write: the disks named version 1.0 that have one are
 *   NEWDOS/86 disks formatted by it.
 *
 * See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 */
function version1LayoutProblem(trsdos: Trsdos): string | undefined {
    const prefix = "This disk was formatted by NEWDOS/80 version 1.0 (GAT byte 0xCB is 0x80)";
    const singleDensity = trsdos.geometry.modalDataDensity === Density.SINGLE && !trsdos.geometry.cylinder0Differs;
    if (!singleDensity) {
        return `${prefix}, but it's double density, which version 1.0 only had through patches whose layouts ` +
            "differ, so writing it isn't supported.";
    }
    const isSingleSidedCylinderLayout = trsdos.allocationSides === 1 &&
        trsdos.sectorsPerCylinder === NEWDOS80_V1_SECTORS_PER_CYLINDER &&
        trsdos.granulesPerLump === NEWDOS80_V1_GRANULES_PER_LUMP && trsdos.lumpsAreCylinders &&
        trsdos.firstDataCylinder === 0;
    if (!isSingleSidedCylinderLayout) {
        return `${prefix}, but it isn't single sided with 10 sectors and two granules to a cylinder, the one ` +
            "version 1.0 layout we write, so writing it isn't supported.";
    }
    const table = readPdriveTable(trsdos.disk);
    if (table !== undefined) {
        return `${prefix}, but it has a PDRIVE table, which version 1.0 doesn't write, so it may be another ` +
            "DOS's disk, and writing it isn't supported.";
    }
    return undefined;
}

/**
 * Whether the GAT could be that of a disk of {@link lumpCount} lumps, at most 96, that has a granule
 * existence table at 0x60, as NEWDOS/80's FORMAT writes it: every allocation byte from lump
 * {@link lumpCount} to 0x5F is 0xFF (past the formatted lumps), so is every existence byte from
 * 0x60 + {@link lumpCount} to 0xBF, and below that each lump's existence bits are among its allocation
 * bits. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 *
 * @param gatBytes the raw bytes of the GAT sector.
 * @param lumpCount the lump count to try, 0 to 96.
 * @param granulesPerLump the granules per lump, whose bits the existence rule compares.
 */
function fitsExistenceTableGat(gatBytes: Uint8Array, lumpCount: number, granulesPerLump: number): boolean {
    const mask = (1 << granulesPerLump) - 1;
    for (let lump = 0; lump < NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE; lump++) {
        const allocation = gatBytes[lump] ?? 0;
        const existence = gatBytes[GAT_EXISTENCE_OFFSET + lump] ?? 0;
        if (lump < lumpCount) {
            if ((existence & mask & ~allocation) !== 0) {
                return false;
            }
        } else if (allocation !== 0xFF || existence !== 0xFF) {
            return false;
        }
    }
    return true;
}

/**
 * Why a disk of more than 96 lumps with no PDRIVE table can't be shown to have a GAT that runs through
 * 0xBF, or undefined if it can. Only a system disk has a PDRIVE table, so this is how a NEWDOS/80 data
 * disk that big is written. The image must not be a smaller disk imaged with extra cylinders, whose
 * GAT bytes from 0x60 are its existence table, not the allocation of lumps 96 and up. So:
 *
 * - The GAT ends where the image does: the last lump has a free granule, and the bytes past it, to 0xBF,
 *   are 0xFF. (A disk imaged with extra cylinders has 0xFF for its missing lumps.)
 * - The GAT can't be read as one of 96 lumps or fewer with an existence table (see
 *   {@link fitsExistenceTableGat}), for any lump count. NEWDOS/80's FORMAT writes such a GAT for every
 *   disk of up to 96 lumps, and allocation keeps it so, since a non-existent granule is always marked used.
 * - Every sector of every lump is on the image, so its cylinders are formatted in the layout.
 *
 * A disk that is really this big but fails (its last lump full, say) is refused, which is safe.
 * See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 *
 * @param trsdos the file system, of more than 96 lumps.
 * @param gatBytes the raw bytes of the GAT sector.
 */
function unprovenExtendedGatMessage(trsdos: Trsdos, gatBytes: Uint8Array): string | undefined {
    const lumpCount = trsdos.lumpCount;
    const prefix = `This disk has ${lumpCount} lumps and no PDRIVE table`;
    const mask = (1 << trsdos.granulesPerLump) - 1;

    const lastLumpHasFreeGranule = ((gatBytes[lumpCount - 1] ?? 0xFF) & mask) !== mask;
    let pastEndIsUsed = true;
    for (let lump = lumpCount; lump < NEWDOS80_MAX_LUMPS; lump++) {
        if (gatBytes[lump] !== 0xFF) {
            pastEndIsUsed = false;
        }
    }
    if (!lastLumpHasFreeGranule || !pastEndIsUsed) {
        return `${prefix}, and its GAT doesn't end at lump ${lumpCount - 1}, so it may be a smaller disk ` +
            "imaged with extra cylinders, and writing it isn't supported.";
    }

    for (let smallerCount = 0; smallerCount <= NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE; smallerCount++) {
        const fits = fitsExistenceTableGat(gatBytes, smallerCount, trsdos.granulesPerLump);
        if (fits) {
            return `${prefix}, and its GAT also reads as that of a ${smallerCount}-lump disk imaged with ` +
                "extra cylinders, so writing it isn't supported.";
        }
    }

    for (let lump = 0; lump < lumpCount; lump++) {
        const positions = trsdos.getExtentSectorPositions([
            {lump, granuleOffset: 0, granuleCount: trsdos.granulesPerLump},
        ]);
        for (const position of positions) {
            const sectorData = trsdos.disk.readSector(position);
            if (sectorData === undefined) {
                return `${prefix}, and sector ${position.sectorNumber} of cylinder ${position.cylinderNumber}, ` +
                    `side ${position.side} (in lump ${lump}) isn't on the image, so writing it isn't supported.`;
            }
        }
    }
    return undefined;
}

/**
 * Why we won't write a disk under NEWDOS/80's rules, or undefined if we will. The checks are in
 * order and the first failure is reported. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 *
 * @return one or two sentences for the user, ending in a period, or undefined.
 */
export function newdos80LayoutProblem(trsdos: Trsdos): string | undefined {
    if (trsdos.version !== TrsdosVersion.V2_3) {
        return "This disk isn't on the layout that NEWDOS/80 uses, so writing it isn't supported.";
    }

    const gat = trsdos.disk.readSector(trsdos.getGatPosition());
    const marker = gat?.data[GAT_VERSION_OFFSET];
    if (gat === undefined || (marker !== GAT_VERSION_NEWDOS80_V2 && marker !== GAT_VERSION_NEWDOS80_V1)) {
        const markerText = marker === undefined ? "unreadable" : "0x" + marker.toString(16).toUpperCase().padStart(2, "0");
        return `This disk's GAT wasn't written by NEWDOS/80 version 1.0 or 2 (byte 0xCB is ${markerText}), ` +
            "so writing it isn't supported.";
    }
    if (marker === GAT_VERSION_NEWDOS80_V1) {
        const version1Message = version1LayoutProblem(trsdos);
        if (version1Message !== undefined) {
            return version1Message;
        }
    }

    if (trsdos.sectorsPerGranule !== NEWDOS80_SECTORS_PER_GRANULE) {
        return `This disk has ${trsdos.sectorsPerGranule} sectors per granule, not the 5 that NEWDOS/80 uses, ` +
            "so writing it isn't supported.";
    }

    if (trsdos.lumpCount > NEWDOS80_MAX_LUMPS) {
        return `This disk has ${trsdos.lumpCount} lumps, but NEWDOS/80's GAT holds at most ${NEWDOS80_MAX_LUMPS}, ` +
            "so writing it isn't supported.";
    }

    if (!newdos80DirectorySizeRecorded(trsdos)) {
        return "The directory size that the HIT records (byte 0x1F) doesn't match the directory we decoded, " +
            "so writing the disk isn't supported.";
    }

    const pdriveMessage = pdriveProblem(trsdos);
    if (pdriveMessage !== undefined) {
        return pdriveMessage;
    }

    const table = readPdriveTable(trsdos.disk);
    if (trsdos.lumpCount > NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE && table === undefined) {
        const extendedGatMessage = unprovenExtendedGatMessage(trsdos, gat.data);
        if (extendedGatMessage !== undefined) {
            return extendedGatMessage;
        }
    }

    if (trsdos.lumpCount <= NEWDOS80_MAX_LUMPS_WITH_EXISTENCE_TABLE) {
        const mask = (1 << trsdos.granulesPerLump) - 1;
        for (let lump = 0; lump < trsdos.lumpCount; lump++) {
            const allocation = gat.data[lump] ?? 0;
            const existence = (gat.data[GAT_EXISTENCE_OFFSET + lump] ?? 0) & mask;
            if ((existence & ~allocation) !== 0) {
                return `The GAT's existence table marks a granule of lump ${lump} as non-existent, ` +
                    "but its allocation bit isn't set, so writing the disk isn't supported.";
            }
        }
    }

    return undefined;
}

/**
 * Whether the disk is a system disk: some live primary entry in one of the SYS0-SYS29 slots is named
 * that slot's system file. See "Writing NEWDOS/80" in FLOPPY_FORMATS.md.
 */
export function newdos80IsSystemDisk(trsdos: Trsdos): boolean {
    return trsdos.getDirectory().slots.some(slot => {
        if (slot.dirEntry.isExtendedEntry() || slot.hitIndex <= 1) {
            return false;
        }
        const name = trsdos23SystemFilename(slot.hitIndex);
        return name !== undefined && slot.dirEntry.rawFilename === name;
    });
}
