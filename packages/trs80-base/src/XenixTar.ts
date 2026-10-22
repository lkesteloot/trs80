/**
 * Classes for reading TRS-80 Model 16 and 6000 Xenix floppies that hold a raw tar archive,
 * the way Xenix distribution and backup disks do. See "Xenix tar disks" in FLOPPY_FORMATS.md.
 *
 * There's no file system: the disk's data tracks are the archive, end to end. Each disk of a
 * multi-disk set is a complete archive. A file that doesn't fit is split into extents, which are
 * stored as members of the same name on consecutive disks (see FLOPPY_FORMATS.md).
 */

import {assertNever} from "z80-base";
import {concatByteArrays} from "teamten-ts-utils";
import {TRS80_BASE_LOGGER} from "z80-logger";
import {FileDamage, type FloppyFileContents} from "./FileDamage.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import type {FloppyDirEntry, FloppyFileSystem} from "./FloppyFileSystem.js";
import {bytesToText} from "./DiskUtils.js";

// Bytes in each sector, and in each tar block.
const SECTOR_SIZE = 512;

// Sectors on each data track, numbered from 1.
const SECTORS_PER_TRACK = 16;

// Number we give the first sector of a track.
const FIRST_SECTOR_NUMBER = 1;

// The first track that holds archive data, counting linearly as cylinder*sides + side. Track 0
// is the boot track, which Xenix leaves unused on these disks.
const FIRST_DATA_TRACK = 1;

// Offsets and lengths of the fields in a tar header.
const NAME_OFFSET = 0;
const NAME_LENGTH = 100;
const MODE_OFFSET = 100;
const MODE_LENGTH = 8;
const UID_OFFSET = 108;
const UID_LENGTH = 8;
const GID_OFFSET = 116;
const GID_LENGTH = 8;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const MTIME_OFFSET = 136;
const MTIME_LENGTH = 12;
const CHECKSUM_OFFSET = 148;
const CHECKSUM_LENGTH = 8;
const TYPE_FLAG_OFFSET = 156;
const LINK_NAME_OFFSET = 157;
const LINK_NAME_LENGTH = 100;
const MAGIC_OFFSET = 257;
// Xenix's extent fields, for a file split across disks. They're in bytes that old tar leaves
// zero (and that ustar uses for its magic, so a ustar header has no extent).
const EXTENT_NUMBER_OFFSET = 257;
const EXTENT_NUMBER_LENGTH = 4;
const EXTENT_COUNT_OFFSET = 261;
const EXTENT_COUNT_LENGTH = 4;
const EXTENT_FILE_SIZE_OFFSET = 265;
const EXTENT_FILE_SIZE_LENGTH = 12;
const PREFIX_OFFSET = 345;
const PREFIX_LENGTH = 155;

// The ustar magic, without the version or the terminator that follows it.
const USTAR_MAGIC = "ustar";

// Fill byte of unwritten sectors, such as the boot track.
const FILL_BYTE = 0xE5;

// The most data sectors that we believe a member has. Anything bigger is a damaged header, and
// this keeps one from making us build an enormous list of positions.
const MAX_MEMBER_SECTORS = 1 << 16;

// The number of members that must precede a bad header for us to believe that the disk
// holds an archive. A lone valid header followed by junk is a stale header in the boot block of a
// Xenix file system.
const MIN_MEMBERS_BEFORE_BAD_HEADER = 2;

/**
 * The kind of archive member, from its type flag.
 */
export enum XenixTarType {
    // "0" or NUL: a regular file.
    FILE,
    // "7": a regular file that was stored contiguously. We treat it like any other.
    CONTIGUOUS_FILE,
    // "1": a hard link to an earlier member.
    HARD_LINK,
    // "2": a symbolic link.
    SYMBOLIC_LINK,
    // "3": a character device.
    CHARACTER_DEVICE,
    // "4": a block device.
    BLOCK_DEVICE,
    // "5": a directory.
    DIRECTORY,
    // "6": a FIFO.
    FIFO,
    // Anything else.
    OTHER,
}

/**
 * A readable name for the type, such as "Directory".
 */
export function xenixTarTypeToString(type: XenixTarType): string {
    switch (type) {
        case XenixTarType.FILE: return "File";
        case XenixTarType.CONTIGUOUS_FILE: return "Contiguous file";
        case XenixTarType.HARD_LINK: return "Hard link";
        case XenixTarType.SYMBOLIC_LINK: return "Symbolic link";
        case XenixTarType.CHARACTER_DEVICE: return "Character device";
        case XenixTarType.BLOCK_DEVICE: return "Block device";
        case XenixTarType.DIRECTORY: return "Directory";
        case XenixTarType.FIFO: return "FIFO";
        case XenixTarType.OTHER: return "Other";
        default: assertNever(type);
    }
}

/**
 * The type for the type flag character of a header. NUL (the empty character) is a regular file.
 */
function xenixTarTypeFromFlag(typeFlag: string): XenixTarType {
    switch (typeFlag) {
        case "\0":
        case "0": return XenixTarType.FILE;
        case "7": return XenixTarType.CONTIGUOUS_FILE;
        case "1": return XenixTarType.HARD_LINK;
        case "2": return XenixTarType.SYMBOLIC_LINK;
        case "3": return XenixTarType.CHARACTER_DEVICE;
        case "4": return XenixTarType.BLOCK_DEVICE;
        case "5": return XenixTarType.DIRECTORY;
        case "6": return XenixTarType.FIFO;
        default: return XenixTarType.OTHER;
    }
}

/**
 * Whether members of this type are listed as files.
 */
function isListedType(type: XenixTarType): boolean {
    switch (type) {
        case XenixTarType.FILE:
        case XenixTarType.CONTIGUOUS_FILE:
        case XenixTarType.HARD_LINK:
            return true;
        case XenixTarType.SYMBOLIC_LINK:
        case XenixTarType.CHARACTER_DEVICE:
        case XenixTarType.BLOCK_DEVICE:
        case XenixTarType.DIRECTORY:
        case XenixTarType.FIFO:
        case XenixTarType.OTHER:
            return false;
        default:
            assertNever(type);
    }
}

/**
 * Whether data follows the header for members of this type, according to its size field. Links
 * have no data of their own, whatever their size field says, as with GNU tar.
 */
function typeHasData(type: XenixTarType): boolean {
    switch (type) {
        case XenixTarType.HARD_LINK:
        case XenixTarType.SYMBOLIC_LINK:
            return false;
        case XenixTarType.FILE:
        case XenixTarType.CONTIGUOUS_FILE:
        case XenixTarType.CHARACTER_DEVICE:
        case XenixTarType.BLOCK_DEVICE:
        case XenixTarType.DIRECTORY:
        case XenixTarType.FIFO:
        case XenixTarType.OTHER:
            return true;
        default:
            assertNever(type);
    }
}

/**
 * The position of a sector of the archive stream. Sectors are numbered linearly from the
 * first sector of the first data track.
 *
 * @param sectorIndex index of the sector within the archive stream.
 * @param sideCount the number of sides that the archive spans: 1 or 2.
 */
function streamSectorPosition(sectorIndex: number, sideCount: number): SectorPosition {
    const track = FIRST_DATA_TRACK + Math.floor(sectorIndex/SECTORS_PER_TRACK);
    const sectorNumber = FIRST_SECTOR_NUMBER + sectorIndex % SECTORS_PER_TRACK;
    return SectorPosition.make(Math.floor(track/sideCount), track % sideCount, sectorNumber);
}

/**
 * Which part of a file split across disks a member holds. The member's own size is the size of
 * this part.
 */
export interface XenixTarExtent {
    // The number of this part, from 1.
    number: number;
    // The number of parts the file is split into.
    count: number;
    // The size in bytes of the whole file, all parts together.
    fileSize: number;
}

/**
 * A member of the archive that's listed as a file: a regular file or a hard link.
 */
export class XenixTarFile implements FloppyDirEntry {
    // The full path name as stored in the archive, with the ustar prefix if there is one.
    public readonly name: string;
    // The permission bits, such as 0o755.
    public readonly mode: number;
    public readonly uid: number;
    public readonly gid: number;
    // Size in bytes according to the header. For a hard link, this is the size of its target.
    public readonly size: number;
    // Modification time in seconds since 1970.
    public readonly mtime: number;
    // The type flag character of the header, or "\0".
    public readonly typeFlag: string;
    public readonly type: XenixTarType;
    // Name of the target of a hard link, otherwise an empty string.
    public readonly linkName: string;
    // Positions of the sectors that hold the data, in order. For a member cut off by the end
    // of the disk, this includes positions that don't exist on the disk.
    public readonly sectorPositions: SectorPosition[];
    // The part of a file split across disks that this member holds, or undefined if it's a whole file.
    public readonly extent: XenixTarExtent | undefined;

    /**
     * @param name the full path name.
     * @param mode the permission bits.
     * @param uid the owner's user ID.
     * @param gid the owner's group ID.
     * @param size the size in bytes.
     * @param mtime the modification time in seconds since 1970.
     * @param typeFlag the header's type flag character, or "\0".
     * @param type the type decoded from the flag.
     * @param linkName the name of the target, for a hard link.
     * @param sectorPositions the positions of the data sectors, in order.
     * @param extent the part of a split file that this member holds, or undefined for a whole file.
     */
    constructor(name: string, mode: number, uid: number, gid: number, size: number, mtime: number,
                typeFlag: string, type: XenixTarType, linkName: string, sectorPositions: SectorPosition[],
                extent: XenixTarExtent | undefined) {

        this.name = name;
        this.mode = mode;
        this.uid = uid;
        this.gid = gid;
        this.size = size;
        this.mtime = mtime;
        this.typeFlag = typeFlag;
        this.type = type;
        this.linkName = linkName;
        this.sectorPositions = sectorPositions;
        this.extent = extent;
    }

    /**
     * The path name as stored, such as "usr/lib/libc.a", without any leading "./" or "/". Tar names
     * are Unix paths and have no extension, so the separator is ignored. Directories are separated
     * by "/", as the FloppyDirEntry interface says.
     */
    public getFilename(extensionSeparator: string): string {
        return this.name.replace(/^(\.?\/)+/, "");
    }

    /**
     * The size in bytes, as recorded in the header (so also for a member that's cut off by the end of the disk).
     */
    public getSize(): number {
        return this.size;
    }

    /**
     * The modification time.
     */
    public getDate(): Date | undefined {
        return new Date(this.mtime*1000);
    }

    /**
     * There are no system files on a tar disk.
     */
    public isSystemFile(): boolean {
        return false;
    }

    /**
     * There are no hidden files on a tar disk.
     */
    public isHidden(): boolean {
        return false;
    }
}

/**
 * A Xenix floppy that holds a tar archive.
 */
export class XenixTar implements FloppyFileSystem<XenixTarFile> {
    public readonly disk: FloppyDisk;
    public readonly nameAndVersion = "Xenix tar";
    // The listed members (files and hard links), in archive order.
    public readonly files: XenixTarFile[];
    // Number of members that aren't listed, such as directories and symbolic links.
    public readonly skippedMemberCount: number;

    /**
     * @param disk the floppy.
     * @param files the listed members, in archive order.
     * @param skippedMemberCount the number of members that weren't listed.
     */
    constructor(disk: FloppyDisk, files: XenixTarFile[], skippedMemberCount: number) {
        this.disk = disk;
        this.files = files;
        this.skippedMemberCount = skippedMemberCount;
    }

    /**
     * Every file in archive order. There are no system files, so the flag has no effect.
     */
    public getDirEntries(includeSystemFiles: boolean): XenixTarFile[] {
        return this.files;
    }

    /**
     * The positions of the sectors that hold the file's data. Part of this can be beyond
     * the end of the disk if the file is cut off.
     */
    public getFileSectorPositions(file: XenixTarFile): SectorPosition[] {
        return file.sectorPositions;
    }

    /**
     * The file's bytes. Sectors that can't be read are zero-filled.
     */
    public readFile(file: XenixTarFile): Uint8Array {
        return this.readFileWithDamage(file).binary;
    }

    /**
     * The file's bytes as with readFile(), and the sectors that were missing or had CRC errors. A
     * file that's cut off by the end of the disk is zero-filled and reports the missing sectors.
     */
    public readFileWithDamage(file: XenixTarFile): FloppyFileContents {
        const damage = new FileDamage();
        const parts: Uint8Array[] = [];
        for (const position of file.sectorPositions) {
            const sector = this.disk.readSector(position);
            if (sector === undefined || sector.data.length !== SECTOR_SIZE) {
                damage.missingSectors.push(position);
                parts.push(new Uint8Array(SECTOR_SIZE));
            } else {
                if (sector.crcError) {
                    damage.crcErrorSectors.push(position);
                }
                parts.push(sector.data);
            }
        }

        return {binary: concatByteArrays(parts).subarray(0, file.size), damage};
    }
}

/**
 * Read a NUL-terminated Latin-1 string out of a fixed-size field.
 */
function readString(block: Uint8Array, offset: number, length: number): string {
    const field = block.subarray(offset, offset + length);
    const end = field.indexOf(0);
    return bytesToText(end === -1 ? field : field.subarray(0, end));
}

/**
 * Parse an octal number out of a fixed-size field, or return undefined if it's not one. The
 * number can be padded with spaces on the left, and ends at the first NUL or space. Old tars
 * sometimes leave stale digits after the terminator, so anything after it is ignored.
 */
function readOctal(block: Uint8Array, offset: number, length: number): number | undefined {
    const text = bytesToText(block.subarray(offset, offset + length)).replace(/^ +/, "");
    const match = /^([0-7]+)(?:[ \0]|$)/.exec(text);
    return match === null ? undefined : parseInt(match[1], 8);
}

/**
 * Whether the block is entirely zero bytes, which is how tar ends an archive.
 */
function isZeroBlock(block: Uint8Array): boolean {
    return block.every(b => b === 0);
}

/**
 * Whether the block is entirely the filler of an unwritten sector.
 */
function isFillBlock(block: Uint8Array): boolean {
    return block.every(b => b === FILL_BYTE);
}

/**
 * Whether the header block's checksum field matches the sum of its bytes, with the field
 * itself counted as spaces. Old tars summed signed bytes, so we accept either.
 */
function isChecksumValid(block: Uint8Array): boolean {
    const expected = readOctal(block, CHECKSUM_OFFSET, CHECKSUM_LENGTH);
    if (expected === undefined) {
        return false;
    }

    let unsignedSum = 0;
    let signedSum = 0;
    for (let i = 0; i < block.length; i++) {
        const b = i >= CHECKSUM_OFFSET && i < CHECKSUM_OFFSET + CHECKSUM_LENGTH ? 0x20 : block[i];
        unsignedSum += b;
        signedSum += b >= 0x80 ? b - 0x100 : b;
    }

    return expected === unsignedSum || expected === signedSum;
}

/**
 * A parsed tar header.
 */
interface TarHeader {
    name: string;
    mode: number;
    uid: number;
    gid: number;
    size: number;
    mtime: number;
    typeFlag: string;
    type: XenixTarType;
    linkName: string;
    extent: XenixTarExtent | undefined;
}

/**
 * Parse the extent fields of a header block, or return undefined if the member isn't a part of
 * a split file: the fields must be numbers and consistent with each other and with the member's size.
 * The number and count have only been seen as single digits, so we can't tell whether they're
 * octal or decimal; we read them as octal like the other numbers.
 *
 * @param block the header block.
 * @param size the member's own size.
 */
function parseExtent(block: Uint8Array, size: number): XenixTarExtent | undefined {
    const number = readOctal(block, EXTENT_NUMBER_OFFSET, EXTENT_NUMBER_LENGTH);
    const count = readOctal(block, EXTENT_COUNT_OFFSET, EXTENT_COUNT_LENGTH);
    const fileSize = readOctal(block, EXTENT_FILE_SIZE_OFFSET, EXTENT_FILE_SIZE_LENGTH);
    if (number === undefined || count === undefined || fileSize === undefined) {
        return undefined;
    }
    if (number < 1 || number > count || count < 2 || fileSize < size) {
        return undefined;
    }

    return {number, count, fileSize};
}

/**
 * Parse a header block whose checksum is already known to be good, or return undefined if its
 * numeric fields aren't numbers.
 */
function parseHeader(block: Uint8Array): TarHeader | undefined {
    const mode = readOctal(block, MODE_OFFSET, MODE_LENGTH);
    const uid = readOctal(block, UID_OFFSET, UID_LENGTH);
    const gid = readOctal(block, GID_OFFSET, GID_LENGTH);
    const size = readOctal(block, SIZE_OFFSET, SIZE_LENGTH);
    const mtime = readOctal(block, MTIME_OFFSET, MTIME_LENGTH);
    if (mode === undefined || uid === undefined || gid === undefined || size === undefined || mtime === undefined) {
        return undefined;
    }

    let name = readString(block, NAME_OFFSET, NAME_LENGTH);
    if (bytesToText(block.subarray(MAGIC_OFFSET, MAGIC_OFFSET + USTAR_MAGIC.length)) === USTAR_MAGIC) {
        const prefix = readString(block, PREFIX_OFFSET, PREFIX_LENGTH);
        if (prefix !== "") {
            name = prefix + "/" + name;
        }
    }
    if (name === "") {
        return undefined;
    }

    const typeFlag = String.fromCharCode(block[TYPE_FLAG_OFFSET]);
    return {
        name,
        mode,
        uid,
        gid,
        size,
        mtime,
        typeFlag,
        type: xenixTarTypeFromFlag(typeFlag),
        linkName: readString(block, LINK_NAME_OFFSET, LINK_NAME_LENGTH),
        extent: parseExtent(block, size),
    };
}

/**
 * The number of sides to treat the archive as spanning: the disk's, if it has one or two.
 */
function archiveSideCount(disk: FloppyDisk): number {
    return disk.getGeometry().sideCount >= 2 ? 2 : 1;
}

/**
 * Make the listed file for a header of a listed type. A hard link shares the data of the earlier
 * member that it names, if that's on this disk, and is empty otherwise.
 *
 * @param header the member's header.
 * @param sectorPositions the positions of the sectors following the header, which are the member's data.
 * @param filesByName the listed members so far, by name.
 */
function makeFile(header: TarHeader, sectorPositions: SectorPosition[],
                  filesByName: Map<string, XenixTarFile>): XenixTarFile {

    let size = header.size;
    let positions = sectorPositions;
    let extent = header.extent;
    switch (header.type) {
        case XenixTarType.HARD_LINK: {
            const target = filesByName.get(header.linkName);
            size = target?.size ?? 0;
            positions = target?.sectorPositions ?? [];
            // A link takes its target's data, so it isn't a part of anything.
            extent = undefined;
            break;
        }
        case XenixTarType.FILE:
        case XenixTarType.CONTIGUOUS_FILE:
        case XenixTarType.SYMBOLIC_LINK:
        case XenixTarType.CHARACTER_DEVICE:
        case XenixTarType.BLOCK_DEVICE:
        case XenixTarType.DIRECTORY:
        case XenixTarType.FIFO:
        case XenixTarType.OTHER:
            break;
        default:
            assertNever(header.type);
    }

    return new XenixTarFile(header.name, header.mode, header.uid, header.gid, size, header.mtime,
        header.typeFlag, header.type, header.linkName, positions, extent);
}

/**
 * Decode the tar archive on the floppy, or return undefined if it doesn't hold one: the data tracks
 * must be 16 sectors of 512 bytes, and the first header must have a good checksum. A disk that
 * starts in the middle of a member (the second or later disk of a set) has no header there and is
 * rejected. So is a disk that has one valid header and then junk: Xenix file system disks can have
 * a stale tar header in their boot block, and the second header is what tells them apart.
 *
 * Hard links are listed with the data and size of their targets (earlier in the archive), or with
 * no data if the target isn't on this disk. Directories and other special members aren't listed.
 * The archive ends at a zero block, at filler left in unwritten sectors, at a header that doesn't
 * check out (which we log, since the rest of the disk is then ignored; it's an error before
 * the second member), or at the end of the disk.
 * A member that runs past the end of the disk is listed with its full size, and its missing
 * sectors show up as damage when it's read.
 */
export function decodeXenixTar(disk: FloppyDisk): XenixTar | undefined {
    const geometry = disk.getGeometry();
    if (geometry.modalDataSectorSpan !== SECTORS_PER_TRACK || geometry.modalDataSectorSize !== SECTOR_SIZE ||
        geometry.modalDataDensity !== Density.DOUBLE || geometry.firstSectorNumber !== FIRST_SECTOR_NUMBER) {

        return undefined;
    }

    const sideCount = archiveSideCount(disk);
    const trackCount = geometry.cylinderCount*sideCount;
    const totalSectors = Math.max(0, trackCount - FIRST_DATA_TRACK)*SECTORS_PER_TRACK;

    /**
     * Read a block of the archive stream, or return undefined if the sector is unreadable or past the end.
     */
    const readBlock = (sectorIndex: number): Uint8Array | undefined => {
        if (sectorIndex >= totalSectors) {
            return undefined;
        }
        const sector = disk.readSector(streamSectorPosition(sectorIndex, sideCount));
        return sector === undefined || sector.data.length !== SECTOR_SIZE ? undefined : sector.data;
    };

    const files: XenixTarFile[] = [];
    // Listed members by name, for resolving hard links.
    const filesByName = new Map<string, XenixTarFile>();
    let skippedMemberCount = 0;
    let memberCount = 0;
    let sectorIndex = 0;
    while (sectorIndex < totalSectors) {
        const block = readBlock(sectorIndex);
        if (block === undefined) {
            // Unreadable header.
            if (memberCount === 0) {
                return undefined;
            }
            TRS80_BASE_LOGGER.warn(`Xenix tar: unreadable header at stream sector ${sectorIndex}`);
            break;
        }
        if (isZeroBlock(block) || (memberCount > 0 && isFillBlock(block))) {
            // End of archive. The first block can't be this, or there's no archive.
            if (memberCount === 0) {
                return undefined;
            }
            break;
        }

        const header = isChecksumValid(block) ? parseHeader(block) : undefined;
        if (header === undefined || Math.ceil(header.size/SECTOR_SIZE) > MAX_MEMBER_SECTORS) {
            // Either the end of an archive that has no terminator, or damage. The rest is ignored.
            if (memberCount < MIN_MEMBERS_BEFORE_BAD_HEADER) {
                return undefined;
            }
            TRS80_BASE_LOGGER.warn(`Xenix tar: bad header at stream sector ${sectorIndex}`);
            break;
        }
        memberCount++;
        sectorIndex++;

        // Positions of the data sectors, which may go off the end of the disk.
        const dataSectorCount = typeHasData(header.type) ? Math.ceil(header.size/SECTOR_SIZE) : 0;
        const sectorPositions: SectorPosition[] = [];
        for (let i = 0; i < dataSectorCount; i++) {
            sectorPositions.push(streamSectorPosition(sectorIndex + i, sideCount));
        }
        sectorIndex += dataSectorCount;

        if (isListedType(header.type)) {
            const file = makeFile(header, sectorPositions, filesByName);
            files.push(file);
            filesByName.set(file.name, file);
        } else {
            skippedMemberCount++;
        }
    }

    return new XenixTar(disk, files, skippedMemberCount);
}
