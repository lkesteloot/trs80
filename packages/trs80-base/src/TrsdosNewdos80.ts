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

// The GAT byte that holds the DOS's version marker, and its value for NEWDOS/80 version 2.
const GAT_VERSION_OFFSET = 0xCB;
const GAT_VERSION_NEWDOS80_V2 = 0x82;

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
    if (gat === undefined || marker !== GAT_VERSION_NEWDOS80_V2) {
        const markerText = marker === undefined ? "unreadable" : "0x" + marker.toString(16).toUpperCase().padStart(2, "0");
        return `This disk's GAT wasn't written by NEWDOS/80 version 2 (byte 0xCB is ${markerText}), ` +
            "and version 1 disks can differ in layout, so writing it isn't supported.";
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
        return `This disk has ${trsdos.lumpCount} lumps, so its GAT runs past 0x60, but there's no PDRIVE ` +
            "table to confirm the lump count, so writing it isn't supported.";
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
