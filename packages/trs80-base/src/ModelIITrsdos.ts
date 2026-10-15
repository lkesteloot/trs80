/**
 * Classes for reading the 8-inch floppies of Tandy's TRS-80 Model II TRSDOS 1.x and 2.0 (the Model 12
 * and 16 run the same disks). See "Model II TRSDOS" in FLOPPY_FORMATS.md.
 *
 * This DOS shares nothing with the Model I/III TRSDOS family except the hash that fills the
 * HIT and the password hash. A disk has 77 cylinders on one side: cylinder 0 is FM with 26
 * sectors of 128 bytes, and the rest are MFM with 26 sectors of 256 bytes. A granule is five
 * sectors, five granules fit on a cylinder (sector 26 is unused), and a file is a list of up
 * to sixteen extents of consecutive granules. The directory is five granules, normally on cylinder 44
 * with 2.0 keeping a copy on cylinder 52, but FORMAT can put it elsewhere, and sector 2 of cylinder 0
 * says where.
 */

import {assertNever, word} from "z80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {hashForFilename} from "./Trsdos.js";
import {bytesToText, isPrintable} from "./DiskUtils.js";

// Bytes in each data sector (cylinder 1 and up).
const SECTOR_SIZE = 256;

// Sectors on each track.
const SECTORS_PER_TRACK = 26;

// Sectors in a granule.
const SECTORS_PER_GRANULE = 5;

// Granules on each cylinder. Sector 26 of each cylinder is unused.
const GRANULES_PER_CYLINDER = 5;

// Cylinder of the directory, unless FORMAT was told otherwise.
const DEFAULT_DIR_CYLINDER = 44;

// Cylinder of the copy of the directory that 2.0 keeps, unless FORMAT was told otherwise.
const DEFAULT_ALT_DIR_CYLINDER = 52;

// FORMAT's default distance from the directory to its copy when it's told only where the directory goes.
const ALT_DIR_DISTANCE = 8;

// Number of cylinders on the disk.
const CYLINDER_COUNT = 77;

// Size of a directory entry.
const DIR_ENTRY_SIZE = 64;

// Directory entries in each sector.
const DIR_ENTRIES_PER_SECTOR = SECTOR_SIZE/DIR_ENTRY_SIZE;

// Offset in the directory entry of the one-byte attributes.
const ENTRY_ATTRIBUTES_OFFSET = 0;

// Offset of the EOF byte: the offset within its sector of the first byte of the last record.
const ENTRY_EOF_OFFSET = 3;

// Offset of the logical record length. Zero means 256.
const ENTRY_LRL_OFFSET = 4;

// Offsets of the eight-letter name and three-letter extension.
const ENTRY_NAME_OFFSET = 5;
const ENTRY_EXTENSION_OFFSET = 13;

// Length of the name and extension together, which is what the HIT hash covers.
const FULL_NAME_LENGTH = 11;

// Offsets of the little-endian password hashes.
const ENTRY_UPDATE_PASSWORD_OFFSET = 16;
const ENTRY_ACCESS_PASSWORD_OFFSET = 18;

// Offset of the little-endian ending relative record number (the sector holding the last record).
const ENTRY_ERN_OFFSET = 20;

// Offset of the extent list, and the number of extents in it.
const ENTRY_EXTENTS_OFFSET = 22;
const MAX_EXTENTS = 16;

// Offsets of the dates, each three bytes: year minus 1900, month, day.
const ENTRY_CREATED_OFFSET = 54;
const ENTRY_UPDATED_OFFSET = 58;

// Offset of the protection level.
const ENTRY_PROTECTION_OFFSET = 57;

// Attribute bits that the DOS itself uses. The others are the "user attribute" that an application sets when
// it creates a file (we see 0x02, 0x10 and 0x40), and nothing in the DOS hides a file.
const ATTRIBUTE_SYSTEM = 0x80;
const ATTRIBUTE_PROGRAM = 0x20;

// An extent whose first byte is one of these ends the list.
const EXTENT_END_CYLINDER = 0xFF;
const EXTENT_END_CYLINDER_ALT = 0xFE;

// Password hash of "no password", the same as in the Model I/III TRSDOS.
export const MODEL_II_TRSDOS_NO_PASSWORD_HASH = 0x4296;

// ERN of an empty file, which has no extents. Its EOF byte is also 0xFF, so the size formula doesn't apply.
const EMPTY_ERN = 0xFFFF;

// Offsets in the ID sector (cylinder 0 sector 1, 128 bytes).
const ID_NAME_OFFSET = 0;
const ID_NAME_LENGTH = 8;
const ID_MASTER_PASSWORD_OFFSET = 8;

// Offsets in the second sector of cylinder 0, which holds the directory's location: the
// directory cylinder, then a byte that is 1 for the V1 layout and 2 for V2, then the DOS's name,
// then at 10 a BCD version (0x12 for 1.2, 0x20 for 2.0, and 0 on a 1.1 disk).
const BOOT_INFO_SECTOR = 2;
const BOOT_INFO_DIR_CYLINDER_OFFSET = 0;
const BOOT_INFO_VERSION_OFFSET = 10;

// Flags in the V2 GAT.
const GAT_FLAG_DIR = 0x40;
const GAT_FLAG_ALT_DIR = 0x20;
const GAT_FLAG_LOCKED_OUT = 0x80;

/**
 * How the first sectors of the directory cylinder are arranged. The ID sector on cylinder
 * 0 isn't a reliable way to tell, because some 2.0 disks have a 1.x ID sector.
 */
export enum ModelIITrsdosLayout {
    // TRSDOS 1.x: sector 1 is the GAT, sector 2 the HIT, and entries start at sector 3.
    V1,
    // TRSDOS 2.0: sector 1 holds both the HIT and the GAT, and entries start at sector 2.
    V2,
}

/**
 * A readable name for the layout: "1.x" or "2.0".
 */
export function modelIITrsdosLayoutToString(layout: ModelIITrsdosLayout): string {
    switch (layout) {
        case ModelIITrsdosLayout.V1: return "1.x";
        case ModelIITrsdosLayout.V2: return "2.0";
        default: assertNever(layout);
    }
}

/**
 * Where things are on the directory cylinder for a layout.
 */
interface LayoutInfo {
    // Sector holding the GAT.
    gatSector: number;
    // Offset of the first byte of the GAT in that sector.
    gatOffset: number;
    // Sector holding the HIT. The HIT starts at its first byte.
    hitSector: number;
    // Offset of the byte that holds the directory cylinder, which is followed by a version byte.
    dirCylinderOffset: number;
    // First sector of directory entries. Entries continue through sector 25.
    firstEntrySector: number;
}

/**
 * Where things are for the layout.
 */
function layoutInfo(layout: ModelIITrsdosLayout): LayoutInfo {
    switch (layout) {
        case ModelIITrsdosLayout.V1:
            return {gatSector: 1, gatOffset: 0, hitSector: 2, dirCylinderOffset: 0x9A, firstEntrySector: 3};
        case ModelIITrsdosLayout.V2:
            return {gatSector: 1, gatOffset: 0x60, hitSector: 1, dirCylinderOffset: 0x60 + CYLINDER_COUNT,
                firstEntrySector: 2};
        default:
            assertNever(layout);
    }
}

/**
 * Last sector of a cylinder that's part of a granule, which is where the directory's entries stop.
 */
const LAST_USED_SECTOR = GRANULES_PER_CYLINDER*SECTORS_PER_GRANULE;

/**
 * A run of consecutive granules of a file.
 */
export class ModelIITrsdosExtent {
    // Cylinder of the extent's first granule.
    public readonly cylinder: number;
    // Granule (0 to 4) within that cylinder.
    public readonly granule: number;
    // Number of granules, which run on into the following cylinders.
    public readonly granuleCount: number;

    /**
     * @param cylinder cylinder of the first granule.
     * @param granule granule within the cylinder, 0 to 4 (but anything from 0 to 7 can be read from a damaged disk).
     * @param granuleCount number of granules.
     */
    constructor(cylinder: number, granule: number, granuleCount: number) {
        this.cylinder = cylinder;
        this.granule = granule;
        this.granuleCount = granuleCount;
    }
}

/**
 * Parse a date of three bytes (year minus 1900, month, day), or return undefined if the month or day
 * is out of range.
 */
function parseDate(bytes: Uint8Array): Date | undefined {
    const year = 1900 + bytes[0];
    const month = bytes[1];
    const day = bytes[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return undefined;
    }
    return new Date(year, month - 1, day);
}

/**
 * A file in the directory.
 */
export class ModelIITrsdosDirEntry implements FloppyDirEntry {
    // The raw 64 bytes of the entry.
    public readonly binary: Uint8Array;
    // Position of the entry in the directory, counting from 0.
    public readonly index: number;
    // The entry's byte in the HIT, which is never zero for an entry in use. It's the hash of the name.
    public readonly hitHash: number;
    // Bit 7 is system and bit 5 is program (a load module, by DIR's "P"). The other bits are set by applications.
    public readonly attributes: number;
    // Offset within its sector of the first byte of the last record.
    public readonly eof: number;
    // Logical record length, from 1 to 256. (A zero in the entry means 256.)
    public readonly lrl: number;
    // Name without padding.
    public readonly name: string;
    // Extension without padding.
    public readonly extension: string;
    public readonly updatePasswordHash: number;
    public readonly accessPasswordHash: number;
    // Relative sector number (from 0) of the sector that holds the last record.
    public readonly ern: number;
    public readonly extents: ModelIITrsdosExtent[];
    // Undefined if the month or day is out of range.
    public readonly createdDate: Date | undefined;
    public readonly updatedDate: Date | undefined;
    // 0 to 7. For system files, 6 is execute-only and 7 is no access.
    public readonly protectionLevel: number;
    // Length of what ModelIITrsdos.readFile() returns if the extents are intact.
    private readonly size: number;

    /**
     * @param binary the 64 bytes of the entry.
     * @param index position of the entry in the directory.
     * @param hitHash the entry's byte in the HIT.
     */
    constructor(binary: Uint8Array, index: number, hitHash: number) {
        this.binary = binary;
        this.index = index;
        this.hitHash = hitHash;
        this.attributes = binary[ENTRY_ATTRIBUTES_OFFSET];
        this.eof = binary[ENTRY_EOF_OFFSET];
        this.lrl = binary[ENTRY_LRL_OFFSET] === 0 ? 256 : binary[ENTRY_LRL_OFFSET];
        const rawName = bytesToText(binary.subarray(ENTRY_NAME_OFFSET, ENTRY_NAME_OFFSET + FULL_NAME_LENGTH));
        this.name = rawName.substring(0, 8).trimEnd();
        this.extension = rawName.substring(8).trimEnd();
        this.updatePasswordHash = word(binary[ENTRY_UPDATE_PASSWORD_OFFSET + 1], binary[ENTRY_UPDATE_PASSWORD_OFFSET]);
        this.accessPasswordHash = word(binary[ENTRY_ACCESS_PASSWORD_OFFSET + 1], binary[ENTRY_ACCESS_PASSWORD_OFFSET]);
        this.ern = word(binary[ENTRY_ERN_OFFSET + 1], binary[ENTRY_ERN_OFFSET]);
        this.extents = [];
        for (let i = 0; i < MAX_EXTENTS; i++) {
            const offset = ENTRY_EXTENTS_OFFSET + i*2;
            const cylinder = binary[offset];
            if (cylinder === EXTENT_END_CYLINDER || cylinder === EXTENT_END_CYLINDER_ALT) {
                break;
            }
            const info = binary[offset + 1];
            this.extents.push(new ModelIITrsdosExtent(cylinder, info >> 5, (info & 0x1F) + 1));
        }
        this.createdDate = parseDate(binary.subarray(ENTRY_CREATED_OFFSET, ENTRY_CREATED_OFFSET + 3));
        this.protectionLevel = binary[ENTRY_PROTECTION_OFFSET];
        this.updatedDate = parseDate(binary.subarray(ENTRY_UPDATED_OFFSET, ENTRY_UPDATED_OFFSET + 3));
        this.size = this.ern === EMPTY_ERN ? 0 : this.ern*SECTOR_SIZE + this.eof + this.lrl;
    }

    /**
     * The name, with the extension after the separator if there is one.
     */
    public getFilename(extensionSeparator: string): string {
        return this.extension === "" ? this.name : this.name + extensionSeparator + this.extension;
    }

    /**
     * The size in bytes: the sectors before the last one, plus the offset of the last record in its
     * sector, plus the length of a record.
     */
    public getSize(): number {
        return this.size;
    }

    /**
     * The date the file was last updated, or undefined if the entry has no valid date.
     */
    public getDate(): Date | undefined {
        return this.updatedDate;
    }

    /**
     * Whether the system-file bit is set, which hides the file from the ordinary directory listing.
     */
    public isSystemFile(): boolean {
        return (this.attributes & ATTRIBUTE_SYSTEM) !== 0;
    }

    /**
     * Whether the program (load module) bit is set.
     */
    public isProgram(): boolean {
        return (this.attributes & ATTRIBUTE_PROGRAM) !== 0;
    }

    /**
     * We know of no hidden bit apart from the system one.
     */
    public isHidden(): boolean {
        return false;
    }
}

/**
 * A Model II TRSDOS file system.
 */
export class ModelIITrsdos implements FloppyFileSystem<ModelIITrsdosDirEntry> {
    public readonly disk: FloppyDisk;
    public readonly nameAndVersion: string;
    public readonly layout: ModelIITrsdosLayout;
    // Cylinder that the directory was read from. This is normally 44, or 52 if 44's couldn't be used.
    public readonly dirCylinder: number;
    // The BCD version byte that FORMAT stored in the second sector of cylinder 0 (0x12, 0x20), or undefined
    // if that sector is missing. This isn't always the version that the layout implies, because some disks
    // with the 2.0 layout say 1.2.
    public readonly formatVersion: number | undefined;
    // Name from the ID sector on cylinder 0, without padding, or undefined if it's missing or not text.
    public readonly diskName: string | undefined;
    // Little-endian hash of the master password, or undefined if the ID sector is missing.
    public readonly masterPasswordHash: number | undefined;
    // In directory order.
    public readonly entries: ModelIITrsdosDirEntry[];
    // Number of slots that the HIT marks as in use but that we left out, because their sector couldn't be
    // read or their name doesn't match the HIT's hash (so their files, if any, are lost to us).
    public readonly rejectedEntryCount: number;

    /**
     * @param disk the floppy.
     * @param layout how the directory cylinder is arranged.
     * @param dirCylinder the cylinder that the directory came from.
     * @param formatVersion the version byte from the second sector of cylinder 0.
     * @param diskName the disk's name from the ID sector.
     * @param masterPasswordHash hash of the disk's master password.
     * @param entries the entries in use, in directory order.
     * @param rejectedEntryCount the number of in-use slots that were left out of the entries.
     */
    constructor(disk: FloppyDisk, layout: ModelIITrsdosLayout, dirCylinder: number, formatVersion: number | undefined,
                diskName: string | undefined, masterPasswordHash: number | undefined,
                entries: ModelIITrsdosDirEntry[], rejectedEntryCount: number) {

        this.disk = disk;
        this.layout = layout;
        this.nameAndVersion = "Model II TRSDOS " + modelIITrsdosLayoutToString(layout);
        this.dirCylinder = dirCylinder;
        this.formatVersion = formatVersion;
        this.diskName = diskName;
        this.masterPasswordHash = masterPasswordHash;
        this.entries = entries;
        this.rejectedEntryCount = rejectedEntryCount;
    }

    /**
     * Every file in directory order, optionally leaving out the system files.
     */
    public getDirEntries(includeSystemFiles: boolean): ModelIITrsdosDirEntry[] {
        return includeSystemFiles ? this.entries : this.entries.filter(entry => !entry.isSystemFile());
    }

    /**
     * The sectors of the file in order, enough to hold its size. If the extents are too short, this
     * is only what they hold.
     */
    public getFileSectorPositions(dirEntry: ModelIITrsdosDirEntry): SectorPosition[] {
        const sectorsNeeded = Math.ceil(dirEntry.getSize()/SECTOR_SIZE);
        const positions: SectorPosition[] = [];
        for (const extent of dirEntry.extents) {
            for (let i = 0; i < extent.granuleCount; i++) {
                // Granules run on into the next cylinder.
                const granuleIndex = extent.granule + i;
                const cylinder = extent.cylinder + Math.floor(granuleIndex/GRANULES_PER_CYLINDER);
                const firstSector = 1 + (granuleIndex % GRANULES_PER_CYLINDER)*SECTORS_PER_GRANULE;
                for (let j = 0; j < SECTORS_PER_GRANULE; j++) {
                    if (positions.length >= sectorsNeeded) {
                        return positions;
                    }
                    positions.push(SectorPosition.make(cylinder, 0, firstSector + j));
                }
            }
        }
        return positions;
    }

    /**
     * The contents of the file, ending at its recorded size. A sector that can't be read counts as zeros.
     */
    public readFile(dirEntry: ModelIITrsdosDirEntry): Uint8Array {
        return this.readFileWithDamage(dirEntry).binary;
    }

    /**
     * The contents of the file, as with readFile(), and the sectors that were missing or had CRC errors, and
     * whether its extents are too short for the file's size.
     */
    public readFileWithDamage(dirEntry: ModelIITrsdosDirEntry): FloppyFileContents {
        const damage = new FileDamage();
        const parts: Uint8Array[] = [];
        const positions = this.getFileSectorPositions(dirEntry);
        for (const position of positions) {
            const sector = this.disk.readSector(position);
            if (sector === undefined) {
                damage.missingSectors.push(position);
                parts.push(new Uint8Array(SECTOR_SIZE));
            } else {
                if (sector.crcError) {
                    damage.crcErrorSectors.push(position);
                }
                parts.push(sector.data);
            }
        }

        if (positions.length*SECTOR_SIZE < dirEntry.getSize()) {
            damage.directoryErrors.push("extents too short for the file's size");
        }

        const binary = concatByteArrays(parts).subarray(0, dirEntry.getSize());
        return {binary, damage};
    }
}

/**
 * The result of reading a directory as one layout from one cylinder.
 */
interface Candidate {
    layout: ModelIITrsdosLayout;
    cylinder: number;
    entries: ModelIITrsdosDirEntry[];
    // In-use slots whose names match their hashes.
    hits: number;
    // In-use slots that don't, or that couldn't be read.
    misses: number;
    // Whether the GAT has the marks that a blank disk of this layout must have.
    gatValid: boolean;
}

/**
 * Read a sector of the cylinder if it's there and has the right size.
 */
function readDataSector(disk: FloppyDisk, cylinder: number, sector: number): Uint8Array | undefined {
    const data = disk.readSector(SectorPosition.make(cylinder, 0, sector))?.data;
    return data?.length === SECTOR_SIZE ? data : undefined;
}

/**
 * Whether the GAT in this sector has what every disk of this layout has when the directory is on the
 * given cylinder, which we use to accept a disk with no files.
 */
function isGatValid(layout: ModelIITrsdosLayout, gatSector: Uint8Array, dirCylinder: number): boolean {
    const info = layoutInfo(layout);
    if (gatSector[info.dirCylinderOffset] !== dirCylinder) {
        return false;
    }

    const gat = gatSector.subarray(info.gatOffset, info.gatOffset + CYLINDER_COUNT);
    switch (layout) {
        case ModelIITrsdosLayout.V1:
            // Every byte has its unused high bits set, and the directory cylinder is full.
            return gat[dirCylinder] === 0xFF && gat.every(b => (b & 0xE0) === 0xE0);

        case ModelIITrsdosLayout.V2:
            // The directory cylinder is marked.
            return (gat[dirCylinder] & GAT_FLAG_DIR) !== 0;

        default:
            assertNever(layout);
    }
}

/**
 * Read the directory of the cylinder as the layout, or return undefined if its first sector can't be read.
 *
 * @param primaryCylinder where the disk says its directory is, which a copy on another cylinder also says.
 */
function readCandidate(disk: FloppyDisk, layout: ModelIITrsdosLayout, cylinder: number,
                       primaryCylinder: number): Candidate | undefined {

    const info = layoutInfo(layout);
    const gatSector = readDataSector(disk, cylinder, info.gatSector);
    const hitSector = readDataSector(disk, cylinder, info.hitSector);
    if (gatSector === undefined || hitSector === undefined) {
        return undefined;
    }

    const entries: ModelIITrsdosDirEntry[] = [];
    let hits = 0;
    let misses = 0;
    const entrySectorCount = LAST_USED_SECTOR - info.firstEntrySector + 1;
    for (let entrySectorIndex = 0; entrySectorIndex < entrySectorCount; entrySectorIndex++) {
        const entrySector = readDataSector(disk, cylinder, info.firstEntrySector + entrySectorIndex);
        for (let i = 0; i < DIR_ENTRIES_PER_SECTOR; i++) {
            const index = entrySectorIndex*DIR_ENTRIES_PER_SECTOR + i;
            const hitHash = hitSector[index];
            if (hitHash === 0) {
                continue;
            }

            if (entrySector === undefined) {
                misses++;
                continue;
            }

            const binary = entrySector.slice(i*DIR_ENTRY_SIZE, (i + 1)*DIR_ENTRY_SIZE);
            const rawName = bytesToText(binary.subarray(ENTRY_NAME_OFFSET, ENTRY_NAME_OFFSET + FULL_NAME_LENGTH));
            if (isPrintable(rawName) && hashForFilename(rawName) === hitHash) {
                hits++;
                entries.push(new ModelIITrsdosDirEntry(binary, index, hitHash));
            } else {
                misses++;
            }
        }
    }

    const gatValid = isGatValid(layout, gatSector, primaryCylinder);
    return {layout, cylinder, entries, hits, misses, gatValid};
}

/**
 * Pick the layout whose directory on the cylinder fits best, or return undefined if none is good enough.
 *
 * @param primaryCylinder where the disk says its directory is.
 */
function bestCandidate(disk: FloppyDisk, cylinder: number, primaryCylinder: number): Candidate | undefined {
    let best: Candidate | undefined = undefined;
    for (const layout of [ModelIITrsdosLayout.V2, ModelIITrsdosLayout.V1]) {
        const candidate = readCandidate(disk, layout, cylinder, primaryCylinder);
        if (candidate === undefined) {
            continue;
        }

        // Accept it if the hashes vouch for it, or if it has no files and has a GAT that only this layout has.
        const hashesVouch = candidate.hits > 0 && candidate.hits > candidate.misses;
        const validBlank = candidate.hits === 0 && candidate.misses === 0 && candidate.gatValid;
        if (!hashesVouch && !validBlank) {
            continue;
        }

        if (best === undefined || candidate.hits - candidate.misses > best.hits - best.misses) {
            best = candidate;
        }
    }

    return best;
}

/**
 * Decode the Model II TRSDOS file system of the floppy, or return undefined if it doesn't have one.
 * This is strict, because other systems' disks have the same geometry: it needs the HIT to vouch for
 * the directory, or an empty directory with the layout's GAT.
 */
export function decodeModelIITrsdos(disk: FloppyDisk): ModelIITrsdos | undefined {
    const geometry = disk.getGeometry();
    if (geometry.modalDataSectorSpan !== SECTORS_PER_TRACK || geometry.modalDataSectorSize !== SECTOR_SIZE ||
        geometry.modalDataDensity !== Density.DOUBLE || geometry.cylinderCount <= DEFAULT_DIR_CYLINDER) {

        return undefined;
    }

    // Cylinder 0's second sector says where FORMAT put the directory. If it's missing or nonsense, assume
    // the default. Either way the hashes have the final say.
    const bootInfo = disk.readSector(SectorPosition.make(0, 0, BOOT_INFO_SECTOR))?.data;
    const hintedCylinder = bootInfo?.[BOOT_INFO_DIR_CYLINDER_OFFSET];
    const primaryCylinder = hintedCylinder !== undefined && hintedCylinder >= 1 && hintedCylinder < geometry.cylinderCount
        ? hintedCylinder : DEFAULT_DIR_CYLINDER;
    const formatVersion = bootInfo?.[BOOT_INFO_VERSION_OFFSET];

    // The directory, then the usual place for it, then the copies of those: the directory's
    // distance away, and cylinder 52.
    const cylinders = [primaryCylinder, DEFAULT_DIR_CYLINDER, primaryCylinder + ALT_DIR_DISTANCE,
        DEFAULT_ALT_DIR_CYLINDER].filter((cylinder, i, all) =>
            cylinder < geometry.cylinderCount && all.indexOf(cylinder) === i);
    let candidate: Candidate | undefined = undefined;
    for (const cylinder of cylinders) {
        candidate = bestCandidate(disk, cylinder, primaryCylinder);
        if (candidate !== undefined) {
            break;
        }
    }
    if (candidate === undefined) {
        return undefined;
    }

    // The ID sector is on the FM boot track, in 128-byte sectors.
    let diskName: string | undefined = undefined;
    let masterPasswordHash: number | undefined = undefined;
    const idSector = disk.readSector(SectorPosition.make(0, 0, 1))?.data;
    if (idSector !== undefined && idSector.length > ID_MASTER_PASSWORD_OFFSET + 1) {
        const rawName = bytesToText(idSector.subarray(ID_NAME_OFFSET, ID_NAME_OFFSET + ID_NAME_LENGTH));
        diskName = isPrintable(rawName) ? rawName.trimEnd() : undefined;
        masterPasswordHash = word(idSector[ID_MASTER_PASSWORD_OFFSET + 1], idSector[ID_MASTER_PASSWORD_OFFSET]);
    }

    return new ModelIITrsdos(disk, candidate.layout, candidate.cylinder, formatVersion, diskName,
        masterPasswordHash, candidate.entries, candidate.misses);
}
