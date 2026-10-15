/**
 * Classes for reading UCSD Pascal diskettes for the Model I. See "UCSD Pascal" in
 * FLOPPY_FORMATS.md.
 *
 * UCSD Pascal runs on the UCSD Pascal, whose volume is what the disk holds. We call it
 * UCSD Pascal because that's the name people know it by.
 *
 * The p-System volume starts after the TRS-80 boot track and is addressed in 512-byte blocks.
 * The directory is always in blocks 2 to 5, and files are contiguous runs of blocks. Blocks
 * are spread over the physical sectors with an interleave and a track-to-track skew, which
 * the disk doesn't record, so we keep a table of the formats we know.
 */

import {assertNever} from "z80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {bytesToText, isPrintable, makeSkewTable} from "./DiskUtils.js";

// Bytes in a block, the p-System's unit of allocation.
const BLOCK_SIZE = 512;

// Block of the first directory sector.
const DIR_FIRST_BLOCK = 2;

// Block after the directory, which is where the first file can start.
const DIR_NEXT_BLOCK = 6;

// Size of a directory entry, including the volume header (entry 0).
const DIR_ENTRY_SIZE = 26;

// Most files in a directory (the four blocks hold 78 entries including the header).
const MAX_FILE_COUNT = 77;

// Longest volume name.
const MAX_VOLUME_NAME_LENGTH = 7;

// Longest filename.
const MAX_FILENAME_LENGTH = 15;

// Size of the editor's header at the start of a text file: two blocks.
const TEXT_HEADER_SIZE = 2*BLOCK_SIZE;

// Carriage return, which ends each line of a text file.
const CR = 0x0D;

// Data link escape: in a text file, it's followed by 32 + n and stands for n spaces.
const DLE = 0x10;

// The code in a DLE sequence for no spaces; the count byte is this plus the number of spaces.
const DLE_BASE = 32;

/**
 * How one vendor's p-System lays out its blocks on the disk. The disk doesn't record this.
 */
export interface UcsdPascalFormat {
    // Who made the port, such as "FMG".
    readonly name: string;
    // Sectors on each data track.
    readonly sectorsPerTrack: number;
    // Bytes in each physical sector.
    readonly sectorSize: number;
    // Density of the data tracks.
    readonly density: Density;
    // Number of the first sector on each track.
    readonly firstSectorNumber: number;
    // Cylinder that holds the start of the volume (the cylinders before it are the boot track).
    readonly firstTrack: number;
    // Distance between consecutive logical sectors on a track, as in CP/M's "skew".
    readonly interleave: number;
    // How many physical sectors each track's sector order is rotated, per track from the first.
    readonly trackSkew: number;
}

// The formats that we know. These were measured from real disks.
export const UCSD_PASCAL_FORMATS: readonly UcsdPascalFormat[] = [
    // FMG Corporation's UCSD Pascal II.0 for the Model I (1979), measured from its disks.
    {
        name: "FMG",
        sectorsPerTrack: 10,
        sectorSize: 256,
        density: Density.SINGLE,
        firstSectorNumber: 0,
        firstTrack: 1,
        interleave: 2,
        trackSkew: 6,
    },
];

/**
 * The kind of a file in a p-System directory.
 */
export enum UcsdPascalFileKind {
    UNTYPED = 0,
    // The bad blocks file, with the extension ".BAD".
    BAD = 1,
    CODE = 2,
    TEXT = 3,
    INFO = 4,
    DATA = 5,
    GRAF = 6,
    FOTO = 7,
    SECURE_DIR = 8,
}

/**
 * A short readable name for the kind, such as "Code".
 */
export function ucsdPascalFileKindToString(kind: UcsdPascalFileKind): string {
    switch (kind) {
        case UcsdPascalFileKind.UNTYPED: return "Untyped";
        case UcsdPascalFileKind.BAD: return "Bad";
        case UcsdPascalFileKind.CODE: return "Code";
        case UcsdPascalFileKind.TEXT: return "Text";
        case UcsdPascalFileKind.INFO: return "Info";
        case UcsdPascalFileKind.DATA: return "Data";
        case UcsdPascalFileKind.GRAF: return "Graf";
        case UcsdPascalFileKind.FOTO: return "Foto";
        case UcsdPascalFileKind.SECURE_DIR: return "Securedir";
        default: assertNever(kind);
    }
}

/**
 * Convert the number in a directory entry to a kind, or return undefined if we don't know it.
 */
function ucsdPascalFileKindFromNumber(n: number): UcsdPascalFileKind | undefined {
    switch (n) {
        case UcsdPascalFileKind.UNTYPED:
        case UcsdPascalFileKind.BAD:
        case UcsdPascalFileKind.CODE:
        case UcsdPascalFileKind.TEXT:
        case UcsdPascalFileKind.INFO:
        case UcsdPascalFileKind.DATA:
        case UcsdPascalFileKind.GRAF:
        case UcsdPascalFileKind.FOTO:
        case UcsdPascalFileKind.SECURE_DIR:
            return n;
        default:
            return undefined;
    }
}

/**
 * Read a little-endian 16-bit word.
 */
function readWord(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Decode a directory date word (month in bits 0-3, day in bits 4-8, years since 1900 in
 * bits 9-15), or return undefined if there's no date.
 */
function parseDate(value: number): Date | undefined {
    const month = value & 0x0F;
    const day = (value >> 4) & 0x1F;
    const year = 1900 + (value >> 9);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return undefined;
    }
    return new Date(year, month - 1, day);
}

/**
 * The physical sectors of a block, in order. The volume's sectors are numbered from its
 * start, and each track has them in interleaved order, rotated by the track skew for
 * each track after the first.
 *
 * @param format how the volume is laid out on the disk.
 * @param skewTable the physical sector index (from 0) of each logical sector on a track.
 * @param block the block number within the volume.
 */
function blockSectorPositions(format: UcsdPascalFormat, skewTable: number[], block: number): SectorPosition[] {
    const sectorsPerBlock = BLOCK_SIZE/format.sectorSize;
    const positions: SectorPosition[] = [];
    for (let half = 0; half < sectorsPerBlock; half++) {
        const sector = block*sectorsPerBlock + half;
        const track = Math.floor(sector/format.sectorsPerTrack);
        const logical = sector % format.sectorsPerTrack;
        const physical = (skewTable[logical] + format.trackSkew*track) % format.sectorsPerTrack;
        positions.push(SectorPosition.make(format.firstTrack + track, 0, format.firstSectorNumber + physical));
    }
    return positions;
}

/**
 * A file in the directory.
 */
export class UcsdPascalFile implements FloppyDirEntry {
    public readonly name: string;
    // First block of the file.
    public readonly firstBlock: number;
    // The block after the file's last, so the file's blocks are firstBlock to nextBlock - 1.
    public readonly nextBlock: number;
    public readonly kind: UcsdPascalFileKind;
    // Number of bytes used in the file's last block, 1 to 512.
    public readonly lastByte: number;
    private readonly date: Date | undefined;

    /**
     * @param name the filename, such as "SYSTEM.PASCAL".
     * @param firstBlock the file's first block.
     * @param nextBlock the block after the file's last.
     * @param kind the file's kind.
     * @param lastByte number of bytes used in the file's last block.
     * @param date the file's date, or undefined if it has none.
     */
    constructor(name: string, firstBlock: number, nextBlock: number, kind: UcsdPascalFileKind, lastByte: number,
                date: Date | undefined) {

        this.name = name;
        this.firstBlock = firstBlock;
        this.nextBlock = nextBlock;
        this.kind = kind;
        this.lastByte = lastByte;
        this.date = date;
    }

    /**
     * The name, unchanged. The dots in p-System names ("SYSTEM.PASCAL", "READ.ME.TEXT") are part
     * of the name, so the separator is ignored.
     */
    public getFilename(extensionSeparator: string): string {
        return this.name;
    }

    /**
     * The length of the file in bytes: all of its blocks except the last, plus the used part of the last.
     */
    public getSize(): number {
        return (this.nextBlock - this.firstBlock - 1)*BLOCK_SIZE + this.lastByte;
    }

    /**
     * The file's date, or undefined if its month or day is zero.
     */
    public getDate(): Date | undefined {
        return this.date;
    }

    /**
     * Whether this is a text file (kind TEXT, which the p-System names with a ".TEXT" suffix),
     * whose bytes ucsdPascalTextToHost() can convert.
     */
    public isText(): boolean {
        return this.kind === UcsdPascalFileKind.TEXT;
    }

    /**
     * The p-System has no system attribute, and its "SYSTEM." naming convention also covers the
     * user's work file (SYSTEM.WRK.TEXT), so hiding files by name would hide user data. Nothing is
     * a system file.
     */
    public isSystemFile(): boolean {
        return false;
    }

    /**
     * The p-System has no hidden files.
     */
    public isHidden(): boolean {
        return false;
    }
}

/**
 * A UCSD Pascal volume.
 */
export class UcsdPascal implements FloppyFileSystem<UcsdPascalFile> {
    public readonly disk: FloppyDisk;
    public readonly format: UcsdPascalFormat;
    public readonly nameAndVersion: string;
    public readonly volumeName: string;
    // Number of blocks in the volume, from the volume header.
    public readonly blockCount: number;
    // In directory order.
    public readonly files: UcsdPascalFile[];
    // Physical sector index (from 0) of each logical sector on a track.
    private readonly skewTable: number[];

    /**
     * @param disk the floppy.
     * @param format how the volume is laid out on the disk.
     * @param volumeName the name from the volume header.
     * @param blockCount number of blocks in the volume.
     * @param files the files, in directory order.
     */
    constructor(disk: FloppyDisk, format: UcsdPascalFormat, volumeName: string, blockCount: number,
                files: UcsdPascalFile[]) {

        this.disk = disk;
        this.format = format;
        this.nameAndVersion = format.name + " UCSD Pascal";
        this.volumeName = volumeName;
        this.blockCount = blockCount;
        this.files = files;
        this.skewTable = makeSkewTable(format.sectorsPerTrack, format.interleave);
    }

    /**
     * The physical sectors of a block, in order.
     */
    public blockSectorPositions(block: number): SectorPosition[] {
        return blockSectorPositions(this.format, this.skewTable, block);
    }

    /**
     * Every file in directory order. None are system files.
     */
    public getDirEntries(includeSystemFiles: boolean): UcsdPascalFile[] {
        return this.files;
    }

    /**
     * The sectors of the file's blocks, in order.
     */
    public getFileSectorPositions(file: UcsdPascalFile): SectorPosition[] {
        const positions: SectorPosition[] = [];
        for (let block = file.firstBlock; block < file.nextBlock; block++) {
            positions.push(... this.blockSectorPositions(block));
        }
        return positions;
    }

    /**
     * The raw bytes of the file, without converting text files. A sector that can't be read
     * counts as zeros.
     */
    public readFile(file: UcsdPascalFile): Uint8Array {
        return this.readFileWithDamage(file).binary;
    }

    /**
     * The contents of the file, as with readFile(), and the sectors that were missing or had CRC errors.
     */
    public readFileWithDamage(file: UcsdPascalFile): FloppyFileContents {
        const damage = new FileDamage();
        const parts: Uint8Array[] = [];

        for (const position of this.getFileSectorPositions(file)) {
            const sector = this.disk.readSector(position);
            if (sector === undefined) {
                damage.missingSectors.push(position);
                parts.push(new Uint8Array(this.format.sectorSize));
            } else {
                if (sector.crcError) {
                    damage.crcErrorSectors.push(position);
                }
                parts.push(sector.data);
            }
        }

        return {binary: concatByteArrays(parts).subarray(0, file.getSize()), damage};
    }
}

/**
 * Convert the contents of a p-System text file (as returned by UcsdPascal.readFile()) to plain host
 * text. The file is a two-block (1,024-byte) editor header, which we drop, then 1,024-byte pages.
 * Each line ends in a carriage return, which becomes a newline, and the unused end of each page
 * is NULs, which we drop. A DLE followed by the byte 32 + n stands for n spaces; the editor
 * writes one at the start of every line to give its indentation (32 for none), but we expand
 * it wherever it is. A DLE with no byte after it is dropped. Other bytes are kept as they are.
 *
 * @param data the whole file, header included.
 * @returns the text, which is empty if the file is no longer than its header.
 */
export function ucsdPascalTextToHost(data: Uint8Array): Uint8Array {
    const out: number[] = [];

    for (let i = TEXT_HEADER_SIZE; i < data.length; i++) {
        const byte = data[i];
        if (byte === 0) {
            // Page padding.
            continue;
        } else if (byte === CR) {
            out.push(0x0A);
        } else if (byte === DLE) {
            // Count byte.
            i++;
            if (i < data.length) {
                const spaceCount = Math.max(0, data[i] - DLE_BASE);
                for (let j = 0; j < spaceCount; j++) {
                    out.push(0x20);
                }
            }
        } else {
            out.push(byte);
        }
    }

    return new Uint8Array(out);
}

/**
 * Read the first byteCount bytes of the directory, or return undefined if one of the sectors
 * that they're in can't be read or is the wrong size.
 */
function readDirectoryBytes(disk: FloppyDisk, format: UcsdPascalFormat, skewTable: number[],
                            byteCount: number): Uint8Array | undefined {

    const sectorSize = format.sectorSize;
    const sectorCount = Math.ceil(byteCount/sectorSize);
    const sectorsPerBlock = BLOCK_SIZE/sectorSize;
    const parts: Uint8Array[] = [];
    for (let i = 0; i < sectorCount; i++) {
        const block = DIR_FIRST_BLOCK + Math.floor(i/sectorsPerBlock);
        const position = blockSectorPositions(format, skewTable, block)[i % sectorsPerBlock];
        const sector = disk.readSector(position);
        if (sector === undefined || sector.data.length !== sectorSize) {
            return undefined;
        }
        parts.push(sector.data);
    }
    return concatByteArrays(parts).subarray(0, byteCount);
}

/**
 * Parse a Pascal string at the offset (a length byte, then a fixed-size field), or return
 * undefined if the length is out of range or the name has characters that a name can't have.
 */
function parsePascalName(bytes: Uint8Array, offset: number, maxLength: number): string | undefined {
    const length = bytes[offset];
    if (length < 1 || length > maxLength) {
        return undefined;
    }
    const name = bytesToText(bytes.subarray(offset + 1, offset + 1 + length));
    if (!isPrintable(name) || name.includes(" ")) {
        return undefined;
    }
    return name;
}

/**
 * Try to decode the volume as the format, or return undefined if it doesn't validate.
 */
function decodeUcsdPascalFormat(disk: FloppyDisk, format: UcsdPascalFormat): UcsdPascal | undefined {
    const geometry = disk.getGeometry();
    const imageBlockCount = Math.floor(
        (geometry.cylinderCount - format.firstTrack)*format.sectorsPerTrack*format.sectorSize/BLOCK_SIZE);

    // Read the volume header first, which tells us how many entries to read.
    const skewTable = makeSkewTable(format.sectorsPerTrack, format.interleave);
    const header = readDirectoryBytes(disk, format, skewTable, DIR_ENTRY_SIZE);
    if (header === undefined) {
        return undefined;
    }

    const firstBlock = readWord(header, 0);
    const nextBlock = readWord(header, 2);
    const fileKind = readWord(header, 4);
    const volumeName = parsePascalName(header, 6, MAX_VOLUME_NAME_LENGTH);
    const eovBlock = readWord(header, 14);
    const fileCount = readWord(header, 16);
    if (firstBlock !== 0 || nextBlock !== DIR_NEXT_BLOCK || fileKind !== 0 || volumeName === undefined ||
        eovBlock <= DIR_NEXT_BLOCK || eovBlock > imageBlockCount || fileCount > MAX_FILE_COUNT) {

        return undefined;
    }

    // Read the entries. The sectors past what they need may never have been written.
    const directory = readDirectoryBytes(disk, format, skewTable, (fileCount + 1)*DIR_ENTRY_SIZE);
    if (directory === undefined) {
        return undefined;
    }

    const files: UcsdPascalFile[] = [];
    let previousNextBlock = DIR_NEXT_BLOCK;
    for (let i = 1; i <= fileCount; i++) {
        const offset = i*DIR_ENTRY_SIZE;
        const entryFirstBlock = readWord(directory, offset);
        const entryNextBlock = readWord(directory, offset + 2);
        const kind = ucsdPascalFileKindFromNumber(readWord(directory, offset + 4) & 0x0F);
        const name = parsePascalName(directory, offset + 6, MAX_FILENAME_LENGTH);
        const lastByte = readWord(directory, offset + 22);
        const date = parseDate(readWord(directory, offset + 24));
        if (kind === undefined || name === undefined || entryFirstBlock < previousNextBlock ||
            entryFirstBlock >= entryNextBlock || entryNextBlock > eovBlock || lastByte < 1 ||
            lastByte > BLOCK_SIZE) {

            return undefined;
        }

        files.push(new UcsdPascalFile(name, entryFirstBlock, entryNextBlock, kind, lastByte, date));
        previousNextBlock = entryNextBlock;
    }

    return new UcsdPascal(disk, format, volumeName, eovBlock, files);
}

/**
 * Decode the UCSD Pascal volume of the floppy, or return undefined if it doesn't have one.
 * This is strict, because it runs on every floppy that nothing else claims.
 */
export function decodeUcsdPascal(disk: FloppyDisk): UcsdPascal | undefined {
    const geometry = disk.getGeometry();
    for (const format of UCSD_PASCAL_FORMATS) {
        const formatMatches = format.sectorsPerTrack === geometry.modalDataSectorSpan &&
            format.sectorSize === geometry.modalDataSectorSize &&
            format.density === geometry.modalDataDensity;
        if (!formatMatches) {
            continue;
        }

        const ucsdPascal = decodeUcsdPascalFormat(disk, format);
        if (ucsdPascal !== undefined) {
            return ucsdPascal;
        }
    }

    return undefined;
}
