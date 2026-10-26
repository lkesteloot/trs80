/**
 * A builder for small synthetic TRSDOS 2.3 disks, for tests. There are no TRSDOS disk images in
 * the repo, so tests that need a real decode make one here: a JV1 image with a GAT, HIT, directory
 * and files, laid out as FLOPPY_FORMATS.md describes the 2.3 family. Not exported from the package.
 */

import {BYTES_PER_SECTOR} from "./FloppyDisk.js";
import {decodeJv1FloppyDisk, type Jv1FloppyDisk} from "./Jv1FloppyDisk.js";
import {hashForFilename, TRSDOS_BLANK_PASSWORD_HASH, TRSDOS_DEFAULT_PASSWORD_HASH} from "./Trsdos.js";

/**
 * One extent of a test file: the lump (cylinder), the first granule within it, and the granule count.
 */
export type TestExtent = [lump: number, granuleOffset: number, granuleCount: number];

/**
 * A file to put on the test disk.
 */
export interface TestFile {
    /**
     * The name with a slash for the extension, such as "HELLO/BAS".
     */
    name: string;

    /**
     * The file's extents, at most four (there are no extended entries yet).
     */
    extents: TestExtent[];

    /**
     * The file's size in bytes. Defaults to the full size of the extents.
     */
    size?: number | undefined;

    /**
     * Whether it's a system file (flag 0x40).
     */
    system?: boolean | undefined;

    /**
     * Whether it's invisible (flag 0x08).
     */
    invisible?: boolean | undefined;

    /**
     * The byte that fills the file's sectors. Defaults to a different value for each file.
     */
    data?: number | undefined;
}

/**
 * Options for the disk as a whole.
 */
export interface TestDiskOptions {
    /**
     * Number of cylinders, default 35.
     */
    cylinderCount?: number | undefined;

    /**
     * Extra (lump, granule) pairs to mark used in the GAT without any file claiming them.
     */
    gatUsed?: [lump: number, granule: number][] | undefined;

    /**
     * (lump, granule) pairs to mark free in the GAT even though a file uses them.
     */
    gatFree?: [lump: number, granule: number][] | undefined;

    /**
     * Lumps (cylinders) to lock out: both granules, and used in the GAT.
     */
    lockedOut?: number[] | undefined;
}

const SECTORS_PER_TRACK = 10;
const SECTORS_PER_GRANULE = 5;
const GRANULES_PER_LUMP = 2;
const DIR_CYLINDER = 17;
// Sectors on the directory cylinder that hold directory entries (after the GAT and HIT).
const DIR_SECTOR_COUNT = 8;
const DIR_ENTRY_LENGTH = 32;
const DIR_ENTRIES_PER_SECTOR = BYTES_PER_SECTOR / DIR_ENTRY_LENGTH;
// Entries 0 and 1 of each directory sector are reserved for system files in the 2.3 family.
const FIRST_USER_ENTRY = 2;
const USER_ENTRIES_PER_SECTOR = DIR_ENTRIES_PER_SECTOR - FIRST_USER_ENTRY;
const MAX_EXTENTS_PER_ENTRY = 4;
const FLAG_IN_USE = 0x10;
const FLAG_INVISIBLE = 0x08;
const FLAG_SYSTEM = 0x40;
// GAT byte of a lump with no granules in use: the unused high bits are set.
const GAT_FREE_BYTE = 0xFC;
const GAT_LOCKED_OUT_BYTE = 0xFF;
// Where the GAT's other fields are.
const GAT_LOCKOUT_OFFSET = 0x60;
const GAT_DOS_VERSION_OFFSET = 0xCB;
const GAT_PASSWORD_OFFSET = 0xCE;
const GAT_NAME_OFFSET = 0xD0;
const GAT_DATE_OFFSET = 0xD8;
const GAT_AUTO_OFFSET = 0xE0;
// What the real TRSDOS 2.x writes in HIT slot 1 instead of DIR/SYS's own hash (see "The HIT" in
// FLOPPY_FORMATS.md). The decoder accepts that and the real hash; we write the former to be faithful.
const OLD_DIR_SYS_HASH = 0x2C;

/**
 * Compute the byte offset of a sector in a JV1 image.
 */
function sectorOffset(cylinder: number, sector: number): number {
    return (cylinder*SECTORS_PER_TRACK + sector)*BYTES_PER_SECTOR;
}

/**
 * Pad (or truncate) a string with spaces to a length and write its ASCII into the binary.
 */
function writeText(binary: Uint8Array, offset: number, text: string, length: number): void {
    const padded = text.padEnd(length, " ");
    for (let i = 0; i < length; i++) {
        binary[offset + i] = padded.charCodeAt(i);
    }
}

/**
 * Write a little-endian 16-bit word.
 */
function writeWord(binary: Uint8Array, offset: number, value: number): void {
    binary[offset] = value & 0xFF;
    binary[offset + 1] = value >> 8;
}

/**
 * Convert "HELLO/BAS" to the raw 11-character name, "HELLO   BAS".
 */
function toRawFilename(name: string): string {
    const slash = name.indexOf("/");
    const base = slash === -1 ? name : name.substring(0, slash);
    const extension = slash === -1 ? "" : name.substring(slash + 1);
    return base.padEnd(8, " ").substring(0, 8) + extension.padEnd(3, " ").substring(0, 3);
}

/**
 * The directory entry, GAT bits and sector fill that a file needs.
 */
interface PlacedFile {
    file: TestFile;
    // The sector index within the directory, and the entry within that sector.
    dirSectorIndex: number;
    entryIndex: number;
    // The byte that fills the file's sectors, or undefined for the system files, which have no data of their own.
    fillByte: number | undefined;
}

/**
 * Write a directory entry and its HIT byte.
 */
function writeDirEntry(binary: Uint8Array, placed: PlacedFile, hitByte: number, size: number): void {
    const {file, dirSectorIndex, entryIndex} = placed;
    const rawFilename = toRawFilename(file.name);
    const entryOffset = sectorOffset(DIR_CYLINDER, 2 + dirSectorIndex) + entryIndex*DIR_ENTRY_LENGTH;

    let flags = FLAG_IN_USE;
    if (file.system === true) {
        flags |= FLAG_SYSTEM;
    }
    if (file.invisible === true) {
        flags |= FLAG_INVISIBLE;
    }
    binary[entryOffset] = flags;
    // TRSDOS 2.3 counts the partial last sector in the sector count, so the sector count is the
    // rounded-up number of sectors and byte 3 is the end-of-file offset in the last one.
    binary[entryOffset + 3] = size % BYTES_PER_SECTOR;
    // LRL of 256.
    binary[entryOffset + 4] = 0;
    writeText(binary, entryOffset + 5, rawFilename, 11);
    writeWord(binary, entryOffset + 16, TRSDOS_BLANK_PASSWORD_HASH);
    writeWord(binary, entryOffset + 18, TRSDOS_BLANK_PASSWORD_HASH);
    writeWord(binary, entryOffset + 20, Math.ceil(size/BYTES_PER_SECTOR));

    // Extents, then 0xFF 0xFF for the unused ones and for the (absent) extended entry link.
    binary.fill(0xFF, entryOffset + 22, entryOffset + DIR_ENTRY_LENGTH);
    for (let i = 0; i < file.extents.length; i++) {
        const [lump, granuleOffset, granuleCount] = file.extents[i];
        binary[entryOffset + 22 + 2*i] = lump;
        binary[entryOffset + 22 + 2*i + 1] = (granuleOffset << 5) | (granuleCount - 1);
    }

    // HIT byte: index is (entry << 5) | sector.
    binary[sectorOffset(DIR_CYLINDER, 1) + ((entryIndex << 5) | dirSectorIndex)] = hitByte;
}

/**
 * Make a JV1 disk with a TRSDOS 2.3 file system (single density, 10 sectors of 256 bytes per
 * track, two 5-sector granules per cylinder, directory on cylinder 17) holding these files.
 * BOOT/SYS and DIR/SYS are added, in their usual reserved directory slots. The user files go in
 * the unreserved slots (entries 2 to 7 of each directory sector), in order, and the first sector's
 * come first.
 *
 * The result is decoded with {@link decodeJv1FloppyDisk}, so it's what a real image would give.
 *
 * @param files the user files.
 * @param options the disk's options.
 * @return the decoded disk.
 */
export function makeTrsdos23TestDisk(files: TestFile[], options: TestDiskOptions = {}): Jv1FloppyDisk {
    const cylinderCount = options.cylinderCount ?? 35;
    if (cylinderCount <= DIR_CYLINDER || cylinderCount > GAT_LOCKOUT_OFFSET) {
        throw new Error("Unsupported cylinder count " + cylinderCount);
    }
    if (files.length > DIR_SECTOR_COUNT*USER_ENTRIES_PER_SECTOR) {
        throw new Error("Too many files");
    }
    const binary = new Uint8Array(cylinderCount*SECTORS_PER_TRACK*BYTES_PER_SECTOR);

    // The system files. The boot file owns just the boot granule, and DIR/SYS both granules of the
    // directory cylinder. Neither has data of its own: the boot sector is written below, and
    // the directory sectors are directory entries.
    const bootFile: TestFile = {
        name: "BOOT/SYS",
        extents: [[0, 0, 1]],
        system: true,
        invisible: true,
    };
    const dirFile: TestFile = {
        name: "DIR/SYS",
        extents: [[DIR_CYLINDER, 0, GRANULES_PER_LUMP]],
        system: true,
        invisible: true,
    };

    // Boot sector: byte 2 is the directory cylinder.
    binary[sectorOffset(0, 0) + 2] = DIR_CYLINDER;

    // GAT sector. Lumps past the disk's end are 0xFF.
    const gatOffset = sectorOffset(DIR_CYLINDER, 0);
    binary.fill(0xFF, gatOffset, gatOffset + BYTES_PER_SECTOR);
    const gat = new Uint8Array(cylinderCount).fill(GAT_FREE_BYTE);
    const markGranule = (lump: number, granule: number, used: boolean): void => {
        if (lump < 0 || lump >= cylinderCount || granule < 0 || granule >= GRANULES_PER_LUMP) {
            throw new Error(`Granule ${lump}:${granule} is not on the disk`);
        }
        if (used) {
            gat[lump] |= 1 << granule;
        } else {
            gat[lump] &= ~(1 << granule);
        }
    };

    // Place all the files: system files first, at their fixed slots.
    const placed: PlacedFile[] = [
        {file: bootFile, dirSectorIndex: 0, entryIndex: 0, fillByte: undefined},
        {file: dirFile, dirSectorIndex: 1, entryIndex: 0, fillByte: undefined},
    ];
    files.forEach((file, i) => {
        placed.push({
            file,
            dirSectorIndex: Math.floor(i/USER_ENTRIES_PER_SECTOR),
            entryIndex: FIRST_USER_ENTRY + i % USER_ENTRIES_PER_SECTOR,
            fillByte: file.data ?? (0x41 + i) & 0xFF,
        });
    });

    for (const placedFile of placed) {
        const {file} = placedFile;
        if (file.extents.length > MAX_EXTENTS_PER_ENTRY) {
            throw new Error(`File ${file.name} has more than ${MAX_EXTENTS_PER_ENTRY} extents`);
        }

        // The GAT bit and fill for every granule the file's extents cover. Like the DOS, a count that
        // runs past the end of a lump continues in the next one.
        let extentSectors = 0;
        for (const [lump, granuleOffset, granuleCount] of file.extents) {
            for (let i = 0; i < granuleCount; i++) {
                const linear = lump*GRANULES_PER_LUMP + granuleOffset + i;
                // Tests can point an extent past the end of the disk, so there's nothing to mark there.
                if (linear < cylinderCount*GRANULES_PER_LUMP) {
                    markGranule(Math.floor(linear/GRANULES_PER_LUMP), linear % GRANULES_PER_LUMP, true);
                }
            }
            extentSectors += granuleCount*SECTORS_PER_GRANULE;
        }

        const size = file.size ?? extentSectors*BYTES_PER_SECTOR;
        // The sectors of the extents, in order, then clipped to the file's size.
        const dataSectors = Math.min(extentSectors, Math.ceil(size/BYTES_PER_SECTOR));
        if (placedFile.fillByte !== undefined) {
            let sectorsLeft = dataSectors;
            for (const [lump, granuleOffset, granuleCount] of file.extents) {
                const firstSector = (lump*GRANULES_PER_LUMP + granuleOffset)*SECTORS_PER_GRANULE;
                for (let i = 0; i < granuleCount*SECTORS_PER_GRANULE && sectorsLeft > 0; i++, sectorsLeft--) {
                    const linearSector = firstSector + i;
                    const offset = linearSector*BYTES_PER_SECTOR;
                    if (offset + BYTES_PER_SECTOR > binary.length) {
                        break;
                    }
                    binary.fill(placedFile.fillByte, offset, offset + BYTES_PER_SECTOR);
                }
            }
        }

        // DIR/SYS's HIT slot (entry 0 of sector 1, which is HIT index 1) holds the old wrong hash.
        const isDirSys = file === dirFile;
        const hitByte = isDirSys ? OLD_DIR_SYS_HASH : hashForFilename(toRawFilename(file.name));
        writeDirEntry(binary, placedFile, hitByte, size);
    }

    for (const [lump, granule] of options.gatUsed ?? []) {
        markGranule(lump, granule, true);
    }
    for (const [lump, granule] of options.gatFree ?? []) {
        markGranule(lump, granule, false);
    }

    // The lockout table: a byte per cylinder, mirroring the GAT's bits (0xFC for none, 0xFF for locked out).
    const lockout = new Uint8Array(cylinderCount).fill(GAT_FREE_BYTE);
    for (const lump of options.lockedOut ?? []) {
        if (lump < 0 || lump >= cylinderCount) {
            throw new Error(`Lump ${lump} is not on the disk`);
        }
        lockout[lump] = GAT_LOCKED_OUT_BYTE;
        gat[lump] = GAT_LOCKED_OUT_BYTE;
    }
    binary.set(gat, gatOffset);
    binary.set(lockout, gatOffset + GAT_LOCKOUT_OFFSET);

    // The GAT's trailer. TRSDOS 2.x writes 0x21 for the version and leaves the LDOS fields zero.
    binary[gatOffset + GAT_DOS_VERSION_OFFSET] = 0x21;
    binary[gatOffset + GAT_DOS_VERSION_OFFSET + 1] = 0;
    binary[gatOffset + GAT_DOS_VERSION_OFFSET + 2] = 0;
    writeWord(binary, gatOffset + GAT_PASSWORD_OFFSET, TRSDOS_DEFAULT_PASSWORD_HASH);
    writeText(binary, gatOffset + GAT_NAME_OFFSET, "TESTDISK", 8);
    writeText(binary, gatOffset + GAT_DATE_OFFSET, "10/25/26", 8);
    binary.fill(0x20, gatOffset + GAT_AUTO_OFFSET, gatOffset + BYTES_PER_SECTOR);
    binary[gatOffset + GAT_AUTO_OFFSET] = 0x0D;

    const disk = decodeJv1FloppyDisk(binary);
    if (disk === undefined) {
        throw new Error("Test disk didn't decode as JV1");
    }
    return disk;
}
