/**
 * Classes for reading Percom MicroDOS diskettes for the Model I. See "Percom MicroDOS" in
 * FLOPPY_FORMATS.md.
 *
 * MicroDOS shares nothing with TRSDOS: sectors are numbered absolutely, the directory is
 * always in the same ten sectors, files are contiguous runs of sectors, and the first byte
 * of each sector says how many of the bytes after it are data.
 */

import {assertNever, word} from "z80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {BASIC_HEADER_BYTE} from "./Basic.js";
import {bytesToText, isPrintable} from "./DiskUtils.js";

// Sectors on each track, numbered from 0.
const SECTORS_PER_TRACK = 10;

// Bytes in each sector.
const SECTOR_SIZE = 256;

// Absolute number of the first sector of the directory.
const DIR_FIRST_SECTOR = 20;

// Number of sectors in the directory.
const DIR_SECTOR_COUNT = 10;

// Size of a directory entry.
const DIR_ENTRY_SIZE = 45;

// Number of directory entries in each directory sector.
const DIR_ENTRIES_PER_SECTOR = 5;

// First byte of every directory sector: the length of the five entries after it.
const DIR_SECTOR_COUNT_BYTE = DIR_ENTRY_SIZE*DIR_ENTRIES_PER_SECTOR;

// Name of the entry that ends the directory.
const DIR_END_NAME = "%%%%%%%%%%";

// Length of a filename.
const NAME_LENGTH = 10;

// Length of a remark.
const REMARK_LENGTH = 30;

// Most data bytes in a sector.
const MAX_SECTOR_DATA = 255;

// Absolute sector of the boot sector, where the DOS's own file starts.
const BOOT_SECTOR = 0;

/**
 * The type letter of a MicroDOS file.
 */
export enum MicroDosFileType {
    // "P": a BASIC program.
    PROGRAM,
    // "D": data.
    DATA,
}

/**
 * A readable name for the type: "BASIC" or "Data".
 */
export function microDosFileTypeToString(type: MicroDosFileType): string {
    switch (type) {
        case MicroDosFileType.PROGRAM: return "BASIC";
        case MicroDosFileType.DATA: return "Data";
        default: assertNever(type);
    }
}

/**
 * The letter that the directory uses for the type, such as "P".
 */
export function microDosFileTypeToLetter(type: MicroDosFileType): string {
    switch (type) {
        case MicroDosFileType.PROGRAM: return "P";
        case MicroDosFileType.DATA: return "D";
        default: assertNever(type);
    }
}

/**
 * Parse the type letter of a directory entry, or return undefined if it's not one we know.
 */
function microDosFileTypeFromLetter(letter: string): MicroDosFileType | undefined {
    switch (letter) {
        case "P": return MicroDosFileType.PROGRAM;
        case "D": return MicroDosFileType.DATA;
        default: return undefined;
    }
}

/**
 * The position of an absolute sector number.
 */
function absoluteSectorPosition(sector: number): SectorPosition {
    return SectorPosition.make(Math.floor(sector/SECTORS_PER_TRACK), 0, sector % SECTORS_PER_TRACK);
}

/**
 * The number of data bytes that the sector holds, given its first byte and its length.
 */
function sectorDataLength(sectorBytes: Uint8Array): number {
    return Math.min(sectorBytes[0], MAX_SECTOR_DATA, sectorBytes.length - 1);
}

/**
 * A file in the directory.
 */
export class MicroDosFile implements FloppyDirEntry {
    public readonly name: string;
    // Absolute sector numbers, inclusive.
    public readonly firstSector: number;
    public readonly lastSector: number;
    public readonly type: MicroDosFileType;
    public readonly remark: string;
    // Length of what MicroDos.readFile() returns.
    private readonly size: number;

    /**
     * @param name the filename, without padding.
     * @param firstSector absolute number of the file's first sector.
     * @param lastSector absolute number of the file's last sector.
     * @param type the file's type.
     * @param remark the free-form remark, without padding.
     * @param size length in bytes of the file's contents, as returned by MicroDos.readFile().
     */
    constructor(name: string, firstSector: number, lastSector: number, type: MicroDosFileType, remark: string,
                size: number) {

        this.name = name;
        this.firstSector = firstSector;
        this.lastSector = lastSector;
        this.type = type;
        this.remark = remark;
        this.size = size;
    }

    /**
     * The name. MicroDOS names have no extension, so the separator is ignored.
     */
    public getFilename(extensionSeparator: string): string {
        return this.name;
    }

    /**
     * The length of what MicroDos.readFile() returns, which for a program includes the BASIC header byte.
     */
    public getSize(): number {
        return this.size;
    }

    /**
     * MicroDOS doesn't record dates.
     */
    public getDate(): Date | undefined {
        return undefined;
    }

    /**
     * The DOS itself (starting at the boot sector) and the directory are listed as files.
     */
    public isSystemFile(): boolean {
        return this.firstSector === BOOT_SECTOR || this.firstSector === DIR_FIRST_SECTOR;
    }

    /**
     * MicroDOS has no hidden files.
     */
    public isHidden(): boolean {
        return false;
    }
}

/**
 * A MicroDOS file system.
 */
export class MicroDos implements FloppyFileSystem<MicroDosFile> {
    public readonly disk: FloppyDisk;
    public readonly nameAndVersion = "Percom MicroDOS";
    // In directory order.
    public readonly files: MicroDosFile[];

    /**
     * @param disk the floppy.
     * @param files the files, in directory order.
     */
    constructor(disk: FloppyDisk, files: MicroDosFile[]) {
        this.disk = disk;
        this.files = files;
    }

    /**
     * Every file in directory order, optionally leaving out the DOS and the directory.
     */
    public getDirEntries(includeSystemFiles: boolean): MicroDosFile[] {
        return includeSystemFiles ? this.files : this.files.filter(file => !file.isSystemFile());
    }

    /**
     * The sectors from the file's first to its last.
     */
    public getFileSectorPositions(file: MicroDosFile): SectorPosition[] {
        const positions: SectorPosition[] = [];
        for (let sector = file.firstSector; sector <= file.lastSector; sector++) {
            positions.push(absoluteSectorPosition(sector));
        }
        return positions;
    }

    /**
     * The data bytes of each sector, concatenated. For a program, this is preceded by the
     * 0xFF that starts a BASIC file, because MicroDOS keeps programs in memory format, so
     * the result is an ordinary BASIC file. A sector that can't be read counts as 255 zeros.
     */
    public readFile(file: MicroDosFile): Uint8Array {
        return this.readFileWithDamage(file).binary;
    }

    /**
     * The contents of the file, as with readFile(), and the sectors that were missing or had CRC errors.
     */
    public readFileWithDamage(file: MicroDosFile): FloppyFileContents {
        const damage = new FileDamage();
        const parts: Uint8Array[] = [];
        switch (file.type) {
            case MicroDosFileType.PROGRAM:
                parts.push(new Uint8Array([BASIC_HEADER_BYTE]));
                break;
            case MicroDosFileType.DATA:
                break;
            default:
                assertNever(file.type);
        }

        for (const position of this.getFileSectorPositions(file)) {
            const sector = this.disk.readSector(position);
            if (sector === undefined) {
                damage.missingSectors.push(position);
                parts.push(new Uint8Array(MAX_SECTOR_DATA));
            } else {
                if (sector.crcError) {
                    damage.crcErrorSectors.push(position);
                }
                parts.push(sector.data.subarray(1, 1 + sectorDataLength(sector.data)));
            }
        }

        return {binary: concatByteArrays(parts), damage};
    }
}

/**
 * Compute the length of what readFile() will return for a file with these sectors.
 */
function computeFileSize(disk: FloppyDisk, type: MicroDosFileType, firstSector: number, lastSector: number): number {
    let size = 0;
    switch (type) {
        case MicroDosFileType.PROGRAM:
            // The BASIC header.
            size += 1;
            break;
        case MicroDosFileType.DATA:
            break;
        default:
            assertNever(type);
    }

    for (let sector = firstSector; sector <= lastSector; sector++) {
        const sectorData = disk.readSector(absoluteSectorPosition(sector));
        size += sectorData === undefined ? MAX_SECTOR_DATA : sectorDataLength(sectorData.data);
    }

    return size;
}

/**
 * Decode the MicroDOS file system of the floppy, or return undefined if it doesn't have one.
 * This is strict, because it runs on every floppy that isn't TRSDOS or CP/M.
 */
export function decodeMicroDos(disk: FloppyDisk): MicroDos | undefined {
    const geometry = disk.getGeometry();
    if (geometry.modalDataSectorSpan !== SECTORS_PER_TRACK || geometry.modalDataDensity !== Density.SINGLE) {
        return undefined;
    }
    const sectorCount = geometry.cylinderCount*SECTORS_PER_TRACK;

    // Read all of the directory sectors.
    const dirSectors: Uint8Array[] = [];
    for (let i = 0; i < DIR_SECTOR_COUNT; i++) {
        const sector = disk.readSector(absoluteSectorPosition(DIR_FIRST_SECTOR + i));
        if (sector === undefined || sector.data.length !== SECTOR_SIZE || sector.data[0] !== DIR_SECTOR_COUNT_BYTE) {
            return undefined;
        }
        dirSectors.push(sector.data);
    }

    // Parse the entries up to the sentinel.
    const files: MicroDosFile[] = [];
    let foundEnd = false;
    for (let i = 0; i < DIR_SECTOR_COUNT*DIR_ENTRIES_PER_SECTOR && !foundEnd; i++) {
        const sector = dirSectors[Math.floor(i/DIR_ENTRIES_PER_SECTOR)];
        const offset = 1 + (i % DIR_ENTRIES_PER_SECTOR)*DIR_ENTRY_SIZE;
        const entry = sector.subarray(offset, offset + DIR_ENTRY_SIZE);
        const rawName = bytesToText(entry.subarray(0, NAME_LENGTH));
        if (rawName === DIR_END_NAME) {
            foundEnd = true;
            continue;
        }

        const name = rawName.trimEnd();
        const firstSector = word(entry[11], entry[10]);
        const lastSector = word(entry[13], entry[12]);
        const type = microDosFileTypeFromLetter(String.fromCharCode(entry[14]));
        const rawRemark = bytesToText(entry.subarray(15, 15 + REMARK_LENGTH));
        if (name === "" || !isPrintable(rawName) || type === undefined || !isPrintable(rawRemark) ||
            firstSector > lastSector || lastSector >= sectorCount) {

            return undefined;
        }

        const size = computeFileSize(disk, type, firstSector, lastSector);
        files.push(new MicroDosFile(name, firstSector, lastSector, type, rawRemark.trimEnd(), size));
    }

    if (!foundEnd) {
        return undefined;
    }

    return new MicroDos(disk, files);
}
