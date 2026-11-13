import {HARD_DISK_SECTORS_PER_TRACK} from "./HardDisk.js";
import {ldosTestSector, makeBlankTestHdv, rawFilename, writeDirEntry, writePadded} from "./LdosTestHardDisk.js";
import {hashForFilename} from "./Trsdos.js";

// Test helpers that build NEWDOS/80 hard disk images, for the tests here and in the packages that use this one.

/**
 * The number of heads and cylinders of the test disks.
 */
export const NEWDOS80_TEST_HEAD_COUNT = 3;
export const NEWDOS80_TEST_CYLINDER_COUNT = 40;

/**
 * Granules per lump, on every head, as on the real disks.
 */
const GRANULES_PER_LUMP = 8;

/**
 * The directory's size, GAT and HIT included, as on the real disks: 10 sectors plus HIT byte 0x1F.
 */
const DIR_SECTOR_COUNT = 33;

/**
 * A floppy drive's PDRIVE slot, which the hard disk reader must skip.
 */
const FLOPPY_SLOT = [0x11, 0x23, 0x07, 0x23, 0x0A, 0x02, 0x00, 0x00, 0x11, 0x02, 0x00, 0x1E, 0x03, 0x01, 0x00, 0x00];

/**
 * One head of a test disk, which is a NEWDOS/80 partition.
 */
export interface Newdos80TestHead {
    /** The head. */
    head: number;
    /** The sectors per granule, in its PDRIVE slot. */
    sectorsPerGranule: number;
    /** The directory's lump, in the head's boot sector. */
    dirLump: number;
    /** The directory's lump in the PDRIVE slot, if not dirLump. */
    slotDirLump?: number;
    /** The disk name in the GAT. */
    name: string;
    /** Whether FORMAT ran on the head; if not, it has a slot but only filler. */
    formatted: boolean;
    /** A user file, whose granules start at a granule counted from the start of the head. */
    file?: {name: string, contents: Uint8Array, firstGranule: number, entrySector: number};
}

/**
 * The bytes of logical sector n of a head, counted along the head (n % 32 of cylinder n / 32).
 */
export function newdos80TestSector(binary: Uint8Array, head: number, n: number): Uint8Array {
    return ldosTestSector(binary, NEWDOS80_TEST_HEAD_COUNT, {cylinderOffset: 0, headOffset: head},
        Math.floor(n / HARD_DISK_SECTORS_PER_TRACK), n % HARD_DISK_SECTORS_PER_TRACK);
}

/**
 * Make an HDV laid out as NEWDOS/80 2.5 lays out a hard disk: a PDRIVE table on head 0 with a slot
 * per head, and on each formatted head a boot sector, a GAT, a HIT and a 33-sector directory, with
 * BOOT/SYS, DIR/SYS and the head's file. See "NEWDOS/80 on hard disks" in FLOPPY_FORMATS.md.
 */
export function makeNewdos80TestHardDiskBinary(heads: Newdos80TestHead[]): Uint8Array {
    const binary = makeBlankTestHdv(NEWDOS80_TEST_CYLINDER_COUNT, NEWDOS80_TEST_HEAD_COUNT);
    const headSectorCount = NEWDOS80_TEST_CYLINDER_COUNT*HARD_DISK_SECTORS_PER_TRACK;

    // The PDRIVE table, with a floppy slot first and last.
    const table = newdos80TestSector(binary, 0, 2);
    table.fill(0);
    table.set(FLOPPY_SLOT, 0);
    heads.forEach((spec, index) => {
        const sectorsPerLump = spec.sectorsPerGranule*GRANULES_PER_LUMP;
        const lumpCount = Math.ceil(headSectorCount / sectorsPerLump);
        const slotDirLump = spec.slotDirLump ?? spec.dirLump;
        table.set([slotDirLump, lumpCount, 0x1C, spec.sectorsPerGranule, HARD_DISK_SECTORS_PER_TRACK,
            GRANULES_PER_LUMP, spec.head << 3, 0, slotDirLump, 0x21, 0, NEWDOS80_TEST_CYLINDER_COUNT / 8, 0, 0x40,
            NEWDOS80_TEST_CYLINDER_COUNT & 0xFF, NEWDOS80_TEST_CYLINDER_COUNT >> 8], (index + 1)*16);
    });
    table.set(FLOPPY_SLOT, (heads.length + 1)*16);

    for (const spec of heads.filter(spec => spec.formatted)) {
        const spg = spec.sectorsPerGranule;
        const sectorsPerLump = spg*GRANULES_PER_LUMP;
        const lumpCount = Math.ceil(headSectorCount / sectorsPerLump);
        const granuleCount = Math.floor(headSectorCount / spg);
        const dirGranules = Math.ceil(DIR_SECTOR_COUNT / spg);
        const dirStart = spec.dirLump*sectorsPerLump;
        const sector = (n: number) => newdos80TestSector(binary, spec.head, n);

        sector(0).set([0x00, 0xFE, spec.dirLump]);

        const gat = sector(dirStart);
        gat.fill(0xFF);
        gat.fill(0, 0, lumpCount);
        const useGranule = (granule: number) => {
            gat[Math.floor(granule / GRANULES_PER_LUMP)] |= 1 << (granule % GRANULES_PER_LUMP);
        };
        // The granules of the partial last lump that are past the end.
        for (let granule = granuleCount; granule < lumpCount*GRANULES_PER_LUMP; granule++) {
            useGranule(granule);
        }
        useGranule(0);
        for (let i = 0; i < dirGranules; i++) {
            useGranule(spec.dirLump*GRANULES_PER_LUMP + i);
        }
        gat[0xCB] = 0x82;
        gat[0xCC] = 0;
        gat[0xCD] = 0;
        gat.set([0xE0, 0x42], 0xCE);
        writePadded(gat, 0xD0, spec.name, 8);
        writePadded(gat, 0xD8, "09/03/85", 8);
        gat[0xE0] = 0x0D;

        const hit = sector(dirStart + 1);
        hit.fill(0);
        hit[0x1F] = DIR_SECTOR_COUNT - 10;
        for (let i = 2; i < DIR_SECTOR_COUNT; i++) {
            sector(dirStart + i).fill(0);
        }

        const setEntry = (entrySector: number, entryIndex: number, flags: number, name: string,
                          sectorCount: number, lastSectorSize: number, extents: [number, number][]) => {

            const filename = rawFilename(name);
            writeDirEntry(sector(dirStart + 2 + entrySector), entryIndex, flags, filename, sectorCount,
                lastSectorSize, extents);
            hit[entryIndex*32 + entrySector] = hashForFilename(filename);
        };
        setEntry(0, 0, 0x58, "BOOT/SYS", 5, 0, [[0, 0x00]]);
        setEntry(1, 0, 0x58, "DIR/SYS", DIR_SECTOR_COUNT, 0, [[spec.dirLump, dirGranules - 1]]);

        const file = spec.file;
        if (file !== undefined) {
            const fileSectorCount = Math.ceil(file.contents.length / 256);
            const fileGranules = Math.ceil(fileSectorCount / spg);
            setEntry(file.entrySector, 2, 0x10, file.name, fileSectorCount, file.contents.length % 256,
                [[Math.floor(file.firstGranule / GRANULES_PER_LUMP),
                    ((file.firstGranule % GRANULES_PER_LUMP) << 5) | (fileGranules - 1)]]);
            for (let i = 0; i < fileGranules; i++) {
                useGranule(file.firstGranule + i);
            }
            for (let i = 0; i < fileSectorCount; i++) {
                const target = sector(file.firstGranule*spg + i);
                target.fill(0);
                target.set(file.contents.subarray(i*256, (i + 1)*256));
            }
        }
    }

    return binary;
}

/**
 * Bytes for a test file that differ from sector to sector, so that a sector read from the wrong place shows.
 */
export function makeNewdos80TestContents(length: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*7 + Math.floor(i / 256)) & 0xFF);
}

/**
 * The heads of the usual test disk: head 0 with 5-sector granules, head 1 with 22-sector granules and a
 * file that runs across tracks, and head 2 named in the table but never formatted.
 */
export function makeDefaultNewdos80TestHeads(): Newdos80TestHead[] {
    return [
        {head: 0, sectorsPerGranule: 5, dirLump: 4, name: "SYSTEM", formatted: true,
            file: {name: "HELLO/TXT", contents: new TextEncoder().encode("HELLO WORLD"), firstGranule: 40, entrySector: 3}},
        {head: 1, sectorsPerGranule: 22, dirLump: 1, slotDirLump: 4, name: "DATA", formatted: true,
            file: {name: "BIG/DAT", contents: makeNewdos80TestContents(30*256 + 17), firstGranule: 19, entrySector: 30}},
        {head: 2, sectorsPerGranule: 22, dirLump: 4, name: "NEVER", formatted: false},
    ];
}
