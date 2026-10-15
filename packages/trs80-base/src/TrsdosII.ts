/**
 * Classes for reading TRSDOS-II 4.x diskettes, the DOS of the Model II, 12, 16, and 6000 (8-inch
 * floppies). See "TRSDOS-II 4.x" in FLOPPY_FORMATS.md.
 *
 * It shares nothing with TRSDOS 1.3 or 2.3. The disk is divided into 256-byte granules (half of
 * a 512-byte sector), and a file is named by the number of the granule that holds its block table,
 * a list of runs of granules. A root directory file lists subdirectory files (such as SYSTEM/DIR),
 * which hold the 64-byte directory entries.
 */

import {assertNever} from "z80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {bytesToText, isPrintable} from "./DiskUtils.js";

// Bytes in a granule, which is half of a sector.
const GRANULE_SIZE = 256;

// Bytes in a data sector.
const SECTOR_SIZE = 512;

// Number of sectors on each data track.
const SECTORS_PER_TRACK = 16;

// Number of granules on each track.
const GRANULES_PER_TRACK = SECTORS_PER_TRACK*SECTOR_SIZE/GRANULE_SIZE;

// Granules below this number are on the FM boot cylinder, so they can't hold files.
const FIRST_DATA_GRANULE = GRANULES_PER_TRACK;

// Position of the parameter block: cylinder 0, side 0, and this sector number.
const PARAMETER_BLOCK_SECTOR = 3;

// Position of the first boot sector, which holds the banner on system disks.
const BANNER_SECTOR = 1;

// Offsets in the parameter block.
const PB_DISK_NAME = 0x00;
const PB_MASTER_PASSWORD = 0x08;
const PB_ROOT_FILE = 0x13;
const PB_ROOT_BACKUP_FILE = 0x17;
const PB_BITMAP_FILE = 0x1B;
const PB_BITMAP_BACKUP_FILE = 0x1F;
const PB_GRANULE_COUNT = 0x23;
const PB_DEVICE_TYPE = 0x26;
const PB_VERSION = 0x30;
const PB_DIRECTORY_TYPE = 0x31;

// Bytes of the parameter block that we need.
const PARAMETER_BLOCK_LENGTH = 0x32;

// Length of the disk name.
const DISK_NAME_LENGTH = 8;

// Values of the device type byte.
const DEVICE_TYPE_SINGLE_SIDED_FLOPPY = 0x15;
const DEVICE_TYPE_DOUBLE_SIDED_FLOPPY = 0x10;

// The only directory type that we understand.
const DIRECTORY_TYPE = 3;

// Number of extents in a block table.
const EXTENTS_PER_BLOCK_TABLE = 64;

// Size of a directory entry.
const DIR_ENTRY_SIZE = 64;

// Offsets in a directory entry.
const DE_FLAGS = 0x00;
const DE_FLAGS2 = 0x01;
const DE_NAME = 0x02;
const DE_NAME_LENGTH = 23;
const DE_NAME_MARKER = 0x19;
const DE_CREATED = 0x1A;
const DE_MODIFIED = 0x1E;
const DE_EXPIRY = 0x22;
const DE_PRIVILEGE = 0x26;
const DE_EOF = 0x28;
const DE_LRL = 0x2C;
const DE_PRIMARY_FILE = 0x2F;
const DE_SECONDARY_FILE = 0x33;
const DE_USER_ATTRIBUTES = 0x36;
const DE_DELETED_FILE = 0x38;
const DE_UPDATE_PASSWORD = 0x3C;
const DE_ACCESS_PASSWORD = 0x3E;

// The EOF value of an empty file.
const EMPTY_EOF = 0xFFFFFFFF;

// Suffix of the name of a subdirectory file in the root directory.
const SUBDIRECTORY_SUFFIX = "/DIR";

// Name of the subdirectory whose files are system files.
const SYSTEM_SUBDIRECTORY = "SYSTEM/DIR";

// Name of the file that holds the DOS's command processor, which says the version of the DOS.
const SYSTEM_FILE_NAME = "SYSTEM/SYS";

// Minutes in a day.
const MINUTES_PER_DAY = 24*60;

// Bits of the first flags byte of a directory entry. The measured meaning of the others, 0x08
// (set only on SYSRES/SYS, SYSTEM/SYS, and sometimes BOOT/SYS) and 0x10 (on the root's
// subdirectory entries), isn't known.
// Set on the DOS's own programs, though not on everything in the system directory.
const FLAG_SYSTEM = 0x80;
// Z80 program (a load module), as opposed to data.
const FLAG_PROGRAM = 0x40;
// Variable-length records.
const FLAG_VARIABLE_RECORDS = 0x04;

// Mask for the protection level in the privilege field.
const PRIVILEGE_LEVEL_MASK = 0x07;

/**
 * The hash that an eight-blank password has, which is what a file has when it was created
 * without a password. It's stored in the directory in place of the password.
 */
export const TRSDOS_II_BLANK_PASSWORD_HASH = 0x4296;

/**
 * The kind of a file: the "P" or "D" in a DIR listing.
 */
export enum TrsdosIIFileType {
    // A Z80 program, which is a load module in the same format as a TRS-80 CMD file.
    PROGRAM,
    // Data, including the Model 16 (68000) programs.
    DATA,
}

/**
 * A readable name for the file type: "Program" or "Data".
 */
export function trsdosIIFileTypeToString(type: TrsdosIIFileType): string {
    switch (type) {
        case TrsdosIIFileType.PROGRAM: return "Program";
        case TrsdosIIFileType.DATA: return "Data";
        default: assertNever(type);
    }
}

/**
 * Whether a file's records are all the same length.
 */
export enum TrsdosIIRecordType {
    // Fixed-length records, whose length is the LRL.
    FIXED,
    // Variable-length records, each starting with a byte that holds its length including that byte.
    VARIABLE,
}

/**
 * A readable name for the record type: "Fixed" or "Variable".
 */
export function trsdosIIRecordTypeToString(type: TrsdosIIRecordType): string {
    switch (type) {
        case TrsdosIIRecordType.FIXED: return "Fixed";
        case TrsdosIIRecordType.VARIABLE: return "Variable";
        default: assertNever(type);
    }
}

/**
 * The name that the ATTRIB command uses for a protection level, 0 to 7, which is what the access
 * password gives.
 */
export function trsdosIIProtectionLevelToString(level: number): string {
    switch (level) {
        case 0:
        case 1: return "KILL";
        case 2: return "RENAME";
        case 3: return "unused";
        case 4: return "WRITE";
        case 5: return "READ";
        case 6: return "EXEC";
        case 7: return "NONE";
        default: return "unknown";
    }
}

/**
 * Read a big-endian 16-bit value.
 */
function readBe16(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

/**
 * Read a big-endian 24-bit value, which is how file numbers and granule numbers are stored.
 */
function readBe24(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

/**
 * Read a big-endian 32-bit value as a non-negative number.
 */
function readBe32(bytes: Uint8Array, offset: number): number {
    return bytes[offset]*0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

/**
 * Convert a date as stored in a directory entry to a Date, or return undefined if it's blank or
 * not plausible. The date is minutes since midnight on January 1 of the year, so it needs the
 * year to know about leap years.
 *
 * @param minutes minutes since midnight on January 1.
 * @param yearByte the year minus 1900.
 */
function decodeDate(minutes: number, yearByte: number): Date | undefined {
    const year = 1900 + yearByte;
    const daysInYear = year % 4 === 0 ? 366 : 365;
    if (yearByte === 0 || minutes >= daysInYear*MINUTES_PER_DAY) {
        return undefined;
    }

    const day = Math.floor(minutes/MINUTES_PER_DAY);
    const minuteOfDay = minutes % MINUTES_PER_DAY;
    return new Date(year, 0, 1 + day, Math.floor(minuteOfDay/60), minuteOfDay % 60);
}

/**
 * A run of consecutive granules in a block table.
 */
export class TrsdosIIExtent {
    // Number of granules in the run.
    public readonly count: number;
    // Number of the first granule.
    public readonly startGranule: number;

    /**
     * @param count number of granules in the run.
     * @param startGranule number of the first granule.
     */
    constructor(count: number, startGranule: number) {
        this.count = count;
        this.startGranule = startGranule;
    }
}

/**
 * Where a granule is on the disk.
 */
interface GranuleLocation {
    // The 512-byte sector holding the granule.
    position: SectorPosition;
    // Offset of the granule in that sector, 0 or 256.
    offset: number;
}

/**
 * Maps granule numbers to sectors and reads them.
 */
export class GranuleReader {
    private readonly disk: FloppyDisk;
    // Number of sides that the DOS uses.
    public readonly sideCount: number;
    // Number of granules on the disk. Valid granule numbers are less than this.
    public readonly granuleCount: number;

    /**
     * @param disk the floppy.
     * @param sideCount number of sides that the DOS uses, 1 or 2.
     * @param granuleCount number of granules on the disk.
     */
    constructor(disk: FloppyDisk, sideCount: number, granuleCount: number) {
        this.disk = disk;
        this.sideCount = sideCount;
        this.granuleCount = granuleCount;
    }

    /**
     * Whether the number can be the start of a file's data or a block table.
     */
    public isDataGranule(granule: number): boolean {
        return granule >= FIRST_DATA_GRANULE && granule < this.granuleCount;
    }

    /**
     * Where the granule is. Tracks are numbered in order through the granules, and on a
     * double-sided disk they alternate between the sides of each cylinder.
     */
    public locate(granule: number): GranuleLocation {
        const track = Math.floor(granule/GRANULES_PER_TRACK);
        const cylinder = Math.floor(track/this.sideCount);
        const side = track % this.sideCount;
        const granuleInTrack = granule % GRANULES_PER_TRACK;
        // Sectors are numbered from 1.
        const sectorNumber = Math.floor(granuleInTrack/2) + 1;
        return {
            position: SectorPosition.make(cylinder, side, sectorNumber),
            offset: (granuleInTrack % 2)*GRANULE_SIZE,
        };
    }

    /**
     * Read the granule, filling it with zeros if its sector can't be read. Problems are noted
     * in the damage, if given, once for each sector.
     */
    public read(granule: number, damage?: FileDamage): Uint8Array {
        const location = this.locate(granule);
        const sector = this.disk.readSector(location.position);
        if (sector === undefined || sector.data.length < location.offset + GRANULE_SIZE) {
            if (damage !== undefined && !damage.missingSectors.some(p => p.equals(location.position))) {
                damage.missingSectors.push(location.position);
            }
            return new Uint8Array(GRANULE_SIZE);
        }

        if (sector.crcError && damage !== undefined &&
            !damage.crcErrorSectors.some(p => p.equals(location.position))) {

            damage.crcErrorSectors.push(location.position);
        }
        return sector.data.subarray(location.offset, location.offset + GRANULE_SIZE);
    }

    /**
     * Read a block table, or return undefined if its granule can't be read or it's not valid.
     */
    public readBlockTable(fileNumber: number): TrsdosIIExtent[] | undefined {
        if (!this.isDataGranule(fileNumber)) {
            return undefined;
        }
        const location = this.locate(fileNumber);
        if (!this.disk.hasSectorData(location.position)) {
            return undefined;
        }

        const bytes = this.read(fileNumber);
        const extents: TrsdosIIExtent[] = [];
        for (let i = 0; i < EXTENTS_PER_BLOCK_TABLE; i++) {
            const count = bytes[i*4];
            const start = readBe24(bytes, i*4 + 1);
            if (count === 0 || start === 0) {
                break;
            }
            if (!this.isDataGranule(start) || start + count > this.granuleCount) {
                return undefined;
            }
            extents.push(new TrsdosIIExtent(count, start));
        }
        return extents;
    }

    /**
     * Read the granules of the extents, in order.
     */
    public readExtents(extents: TrsdosIIExtent[], damage?: FileDamage): Uint8Array {
        const parts: Uint8Array[] = [];
        for (const extent of extents) {
            for (let i = 0; i < extent.count; i++) {
                parts.push(this.read(extent.startGranule + i, damage));
            }
        }
        return concatByteArrays(parts);
    }
}

/**
 * A file in a subdirectory.
 */
export class TrsdosIIFile implements FloppyDirEntry {
    // First flags byte of the directory entry. Non-zero means in use.
    public readonly flags: number;
    // Second flags byte.
    public readonly flags2: number;
    // The byte after the name: a space on most disks, "*" on some.
    public readonly nameMarker: number;
    // The full name, without padding, with "/" before the extension.
    public readonly name: string;
    // Name of the subdirectory file that this entry came from, such as "SYSTEM/DIR".
    public readonly subdirectory: string;
    // Date created, or undefined if blank or not plausible.
    public readonly created: Date | undefined;
    // Date last modified, or undefined if blank or not plausible.
    public readonly modified: Date | undefined;
    // Raw 3-byte count of minutes and year byte of the expiry date, which is unused.
    public readonly expiry: number;
    // Privilege or protection field.
    public readonly privilege: number;
    // Byte offset of the first byte of the last record, or 0xFFFFFFFF if the file is empty.
    public readonly eof: number;
    // Logical record length.
    public readonly lrl: number;
    // Number of the granule holding the file's block table.
    public readonly primaryFileNumber: number;
    // Number of the granule holding the secondary (backup) block table.
    public readonly secondaryFileNumber: number;
    // The two user attribute bytes.
    public readonly userAttributes: number;
    // The old primary file number, which the DOS saves here when the file is deleted.
    public readonly deletedFileNumber: number;
    // Hash of the update password.
    public readonly updatePasswordHash: number;
    // Hash of the access password.
    public readonly accessPasswordHash: number;
    // The file's runs of granules, from the primary block table or else the secondary one.
    public readonly extents: TrsdosIIExtent[];
    // What's wrong with the block tables, or undefined if one could be read.
    public readonly blockTableError: string | undefined;

    /**
     * @param entry the 64 bytes of the directory entry.
     * @param subdirectory the name of the subdirectory that it's in.
     * @param extents the file's runs of granules.
     * @param blockTableError a description of the problem if neither block table could be read.
     */
    constructor(entry: Uint8Array, subdirectory: string, extents: TrsdosIIExtent[],
                blockTableError: string | undefined) {

        this.flags = entry[DE_FLAGS];
        this.flags2 = entry[DE_FLAGS2];
        this.nameMarker = entry[DE_NAME_MARKER];
        this.name = bytesToText(entry.subarray(DE_NAME, DE_NAME + DE_NAME_LENGTH)).trimEnd();
        this.subdirectory = subdirectory;
        this.created = decodeDate(readBe24(entry, DE_CREATED), entry[DE_CREATED + 3]);
        this.modified = decodeDate(readBe24(entry, DE_MODIFIED), entry[DE_MODIFIED + 3]);
        this.expiry = readBe32(entry, DE_EXPIRY);
        this.privilege = readBe16(entry, DE_PRIVILEGE);
        this.eof = readBe32(entry, DE_EOF);
        this.lrl = readBe16(entry, DE_LRL);
        this.primaryFileNumber = readBe24(entry, DE_PRIMARY_FILE);
        this.secondaryFileNumber = readBe24(entry, DE_SECONDARY_FILE);
        this.userAttributes = readBe16(entry, DE_USER_ATTRIBUTES);
        this.deletedFileNumber = readBe32(entry, DE_DELETED_FILE);
        // Passwords are stored little-endian.
        this.updatePasswordHash = entry[DE_UPDATE_PASSWORD] | (entry[DE_UPDATE_PASSWORD + 1] << 8);
        this.accessPasswordHash = entry[DE_ACCESS_PASSWORD] | (entry[DE_ACCESS_PASSWORD + 1] << 8);
        this.extents = extents;
        this.blockTableError = blockTableError;
    }

    /**
     * The name, with the separator between the name and the extension. The extension is
     * what follows the first "/", and there's no separator if there's none.
     */
    public getFilename(extensionSeparator: string): string {
        const slash = this.name.indexOf("/");
        if (slash < 0) {
            return this.name;
        }
        return this.name.substring(0, slash) + extensionSeparator + this.name.substring(slash + 1);
    }

    /**
     * The length of the file's data: its EOF (the offset of the last record) plus the record length.
     */
    public getSize(): number {
        return this.eof === EMPTY_EOF ? 0 : this.eof + this.lrl;
    }

    /**
     * The number of bytes in the file's granules.
     */
    public getAllocatedSize(): number {
        return this.extents.reduce((sum, extent) => sum + extent.count, 0)*GRANULE_SIZE;
    }

    /**
     * Whether the file is a program or data.
     */
    public getFileType(): TrsdosIIFileType {
        return (this.flags & FLAG_PROGRAM) !== 0 ? TrsdosIIFileType.PROGRAM : TrsdosIIFileType.DATA;
    }

    /**
     * Whether the file has fixed- or variable-length records. For a variable-length file, the
     * LRL is the length of the last record, so the size is still the EOF plus the LRL.
     */
    public getRecordType(): TrsdosIIRecordType {
        return (this.flags & FLAG_VARIABLE_RECORDS) !== 0 ? TrsdosIIRecordType.VARIABLE : TrsdosIIRecordType.FIXED;
    }

    /**
     * Whether the directory entry has the system bit, which the DOS's own programs have. This
     * isn't the same as isSystemFile(), which goes by the directory.
     */
    public hasSystemFlag(): boolean {
        return (this.flags & FLAG_SYSTEM) !== 0;
    }

    /**
     * The protection level, 0 to 7, from the low bits of the privilege field. See
     * trsdosIIProtectionLevelToString().
     */
    public getProtectionLevel(): number {
        return this.privilege & PRIVILEGE_LEVEL_MASK;
    }

    /**
     * The date that the file was last modified.
     */
    public getDate(): Date | undefined {
        return this.modified;
    }

    /**
     * Whether the file is listed in the system subdirectory.
     */
    public isSystemFile(): boolean {
        return this.subdirectory === SYSTEM_SUBDIRECTORY;
    }

    /**
     * Whether the file is hidden. TRSDOS-II has no hidden bit: DIR leaves the system files out
     * unless asked, which isSystemFile() already covers.
     */
    public isHidden(): boolean {
        return false;
    }
}

/**
 * A TRSDOS-II 4.x file system.
 */
export class TrsdosII implements FloppyFileSystem<TrsdosIIFile> {
    public readonly disk: FloppyDisk;
    public readonly nameAndVersion: string;
    // The name given when the disk was formatted, without padding.
    public readonly diskName: string;
    // Hash of the master password, little-endian.
    public readonly masterPasswordHash: number;
    // Number of sides that the file system uses.
    public readonly sideCount: number;
    // Number of granules on the disk.
    public readonly granuleCount: number;
    // The byte at offset 0x30 of the parameter block. Not the exact version of the DOS.
    public readonly osVersionByte: number;
    // Names of the subdirectories listed in the root directory, such as "SYSTEM/DIR".
    public readonly subdirectories: string[];
    // In directory order, subdirectory by subdirectory.
    public readonly files: TrsdosIIFile[];
    private readonly granules: GranuleReader;

    /**
     * @param disk the floppy.
     * @param nameAndVersion the name and version of the DOS.
     * @param diskName the name of the disk.
     * @param masterPasswordHash hash of the master password.
     * @param osVersionByte byte 0x30 of the parameter block.
     * @param granules the reader of the disk's granules.
     * @param subdirectories names of the subdirectories.
     * @param files the files.
     */
    constructor(disk: FloppyDisk, nameAndVersion: string, diskName: string, masterPasswordHash: number,
                osVersionByte: number, granules: GranuleReader, subdirectories: string[], files: TrsdosIIFile[]) {

        this.disk = disk;
        this.nameAndVersion = nameAndVersion;
        this.diskName = diskName;
        this.masterPasswordHash = masterPasswordHash;
        this.osVersionByte = osVersionByte;
        this.granules = granules;
        this.sideCount = granules.sideCount;
        this.granuleCount = granules.granuleCount;
        this.subdirectories = subdirectories;
        this.files = files;
    }

    /**
     * Every file in directory order, optionally leaving out the system files.
     */
    public getDirEntries(includeSystemFiles: boolean): TrsdosIIFile[] {
        return includeSystemFiles ? this.files : this.files.filter(file => !file.isSystemFile());
    }

    /**
     * The granules that hold the file's data (not any extra that it's allocated), in order.
     */
    private getDataGranules(file: TrsdosIIFile): number[] {
        const granuleCount = Math.ceil(file.getSize()/GRANULE_SIZE);
        const granules: number[] = [];
        for (const extent of file.extents) {
            for (let i = 0; i < extent.count && granules.length < granuleCount; i++) {
                granules.push(extent.startGranule + i);
            }
        }
        return granules;
    }

    /**
     * The sectors that hold the file's data, each once, in order.
     */
    public getFileSectorPositions(file: TrsdosIIFile): SectorPosition[] {
        const positions: SectorPosition[] = [];
        for (const granule of this.getDataGranules(file)) {
            const position = this.granules.locate(granule).position;
            const last = positions[positions.length - 1];
            if (last === undefined || !last.equals(position)) {
                positions.push(position);
            }
        }
        return positions;
    }

    /**
     * The file's data, whose length is the file's size.
     */
    public readFile(file: TrsdosIIFile): Uint8Array {
        return this.readFileWithDamage(file).binary;
    }

    /**
     * The file's data, as with readFile(), and the sectors that were missing or had CRC errors.
     * If the file is allocated fewer granules than its size needs, the data stops at the end of
     * its granules, and that's noted as a directory error.
     */
    public readFileWithDamage(file: TrsdosIIFile): FloppyFileContents {
        const damage = new FileDamage();
        const size = file.getSize();
        if (file.blockTableError !== undefined) {
            damage.directoryErrors.push(file.blockTableError);
        }
        if (size > file.getAllocatedSize()) {
            damage.directoryErrors.push("size exceeds allocation");
        }

        const parts: Uint8Array[] = [];
        for (const granule of this.getDataGranules(file)) {
            parts.push(this.granules.read(granule, damage));
        }
        const binary = concatByteArrays(parts).subarray(0, size);
        return {binary, damage};
    }
}

/**
 * Pull the version from the banner on the first boot sector, such as "4.2" from "TRSDOS disk
 * operating system  version 4.2.  Jan ...". Returns undefined if there's no banner, as on a
 * data disk.
 */
function readBannerVersion(disk: FloppyDisk): string | undefined {
    const sector = disk.readSector(SectorPosition.make(0, 0, BANNER_SECTOR));
    if (sector === undefined) {
        return undefined;
    }
    const match = /^TRSDOS disk operating system\s+version (\d+\.\d+)/.exec(bytesToText(sector.data));
    return match === null ? undefined : match[1];
}

/**
 * Find the version of the DOS in the text of SYSTEM/SYS, such as "4.4" from "TRSDOS-II ver. 04.04.00".
 * This is for disks that lack the banner on the boot sector, which includes every 4.4 disk. Returns
 * undefined if the disk has no such file.
 */
function readSystemFileVersion(granules: GranuleReader, files: TrsdosIIFile[]): string | undefined {
    const systemFile = files.find(file => file.isSystemFile() && file.name === SYSTEM_FILE_NAME);
    if (systemFile === undefined) {
        return undefined;
    }

    const bytes = granules.readExtents(systemFile.extents).subarray(0, systemFile.getSize());
    const match = /TRSDOS-II\s+ver(?:sion|\.)\s+(\d+)\.(\d+)/.exec(bytesToText(bytes));
    return match === null ? undefined : parseInt(match[1], 10) + "." + parseInt(match[2], 10);
}

/**
 * Read the in-use entries of a directory file. The block table comes from the
 * primary file number, or from the secondary one if the primary can't be read.
 */
function readDirectoryEntries(granules: GranuleReader, primary: number, secondary: number): Uint8Array[] | undefined {
    const extents = granules.readBlockTable(primary) ?? granules.readBlockTable(secondary);
    if (extents === undefined) {
        return undefined;
    }

    const bytes = granules.readExtents(extents);
    const entries: Uint8Array[] = [];
    for (let offset = 0; offset + DIR_ENTRY_SIZE <= bytes.length; offset += DIR_ENTRY_SIZE) {
        const entry = bytes.subarray(offset, offset + DIR_ENTRY_SIZE);
        if (entry[DE_FLAGS] !== 0) {
            entries.push(entry);
        }
    }
    return entries;
}

/**
 * Get the name from a directory entry, without padding.
 */
function entryName(entry: Uint8Array): string {
    return bytesToText(entry.subarray(DE_NAME, DE_NAME + DE_NAME_LENGTH)).trimEnd();
}

/**
 * Decode the TRSDOS-II file system of the floppy, or return undefined if it doesn't have one.
 * This is strict, because other systems share the geometry of 16 sectors of 512 bytes.
 */
export function decodeTrsdosII(disk: FloppyDisk): TrsdosII | undefined {
    const geometry = disk.getGeometry();
    if (geometry.modalDataSectorSize !== SECTOR_SIZE || geometry.modalDataSectorSpan !== SECTORS_PER_TRACK ||
        geometry.modalDataDensity !== Density.DOUBLE) {

        return undefined;
    }

    // The parameter block.
    const parameterSector = disk.readSector(SectorPosition.make(0, 0, PARAMETER_BLOCK_SECTOR));
    if (parameterSector === undefined || parameterSector.data.length < PARAMETER_BLOCK_LENGTH) {
        return undefined;
    }
    const pb = parameterSector.data;
    const diskName = bytesToText(pb.subarray(PB_DISK_NAME, PB_DISK_NAME + DISK_NAME_LENGTH));
    const version = pb[PB_VERSION];
    const deviceType = pb[PB_DEVICE_TYPE];
    if (!isPrintable(diskName) || (version >> 4) !== 4 || pb[PB_DIRECTORY_TYPE] !== DIRECTORY_TYPE ||
        (deviceType !== DEVICE_TYPE_SINGLE_SIDED_FLOPPY && deviceType !== DEVICE_TYPE_DOUBLE_SIDED_FLOPPY)) {

        return undefined;
    }

    // The number of granules says whether the DOS uses both sides.
    const granuleCount = readBe24(pb, PB_GRANULE_COUNT);
    const sideCount = granuleCount > geometry.cylinderCount*GRANULES_PER_TRACK ? 2 : 1;
    const granules = new GranuleReader(disk, sideCount, granuleCount);

    const rootFile = readBe24(pb, PB_ROOT_FILE);
    const rootBackupFile = readBe24(pb, PB_ROOT_BACKUP_FILE);
    const bitmapFile = readBe24(pb, PB_BITMAP_FILE);
    if (!granules.isDataGranule(rootFile) || !granules.isDataGranule(bitmapFile)) {
        return undefined;
    }

    // The root directory lists the subdirectories.
    const rootEntries = readDirectoryEntries(granules, rootFile, rootBackupFile);
    if (rootEntries === undefined) {
        return undefined;
    }
    const subdirectoryEntries = rootEntries.filter(entry => entryName(entry).endsWith(SUBDIRECTORY_SUFFIX));
    if (subdirectoryEntries.length === 0) {
        return undefined;
    }

    // Read each subdirectory.
    const subdirectories: string[] = [];
    const files: TrsdosIIFile[] = [];
    for (const subdirectoryEntry of subdirectoryEntries) {
        const subdirectory = entryName(subdirectoryEntry);
        subdirectories.push(subdirectory);
        const entries = readDirectoryEntries(granules, readBe24(subdirectoryEntry, DE_PRIMARY_FILE),
            readBe24(subdirectoryEntry, DE_SECONDARY_FILE));
        for (const entry of entries ?? []) {
            const primary = readBe24(entry, DE_PRIMARY_FILE);
            const secondary = readBe24(entry, DE_SECONDARY_FILE);
            const extents = granules.readBlockTable(primary) ?? granules.readBlockTable(secondary);
            // An empty file has no block table.
            const empty = readBe32(entry, DE_EOF) === EMPTY_EOF;
            files.push(new TrsdosIIFile(entry, subdirectory, extents ?? [],
                extents === undefined && !empty ? "block table unreadable" : undefined));
        }
    }

    const dosVersion = readBannerVersion(disk) ?? readSystemFileVersion(granules, files);
    const nameAndVersion = dosVersion === undefined ? "TRSDOS-II" : "TRSDOS-II " + dosVersion;
    return new TrsdosII(disk, nameAndVersion, diskName.trimEnd(), pb[PB_MASTER_PASSWORD] | (pb[PB_MASTER_PASSWORD + 1] << 8),
        version, granules, subdirectories, files);
}
