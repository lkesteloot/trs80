import {type Cpm, CpmExtent, CpmFile, decodeCpmWithLayout} from "./Cpm.js";
import {cpmFilenameToString, type CpmFilename} from "./CpmFilename.js";
import type {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos} from "./Trsdos.js";

/**
 * The size of a CP/M record, the unit of a file's size and of what the writer addresses.
 */
const RECORD_SIZE = 128;

/**
 * The size of a directory entry (slot).
 */
const DIR_ENTRY_SIZE = 32;

/**
 * The user byte of an unused directory slot, which the writer takes as free.
 */
const UNUSED_USER = 0xE5;

/**
 * The highest user number of a file.
 */
const MAX_FILE_USER = 15;

/**
 * The highest user byte that isn't a bad entry: CP/M 3 uses 16 to 0x21 for passwords, the label, and date stamps,
 * which are never files and whose bytes aren't block pointers.
 */
const MAX_OTHER_USER = 0x21;

/**
 * The byte that pads the last record of a file, and ends a text file.
 */
const CTRL_Z = 0x1A;

/**
 * The bit that holds an attribute in the high bit of a name or extension byte.
 */
const ATTRIBUTE_BIT = 0x80;

/**
 * Offsets in a directory entry of the bytes that the writer reads or sets.
 */
const NAME_OFFSET = 1;
const READ_ONLY_OFFSET = 9;
const SYSTEM_OFFSET = 10;
const EXTENT_LOW_OFFSET = 12;
const EXTENT_HIGH_OFFSET = 14;
const RECORD_COUNT_OFFSET = 15;
const POINTERS_OFFSET = 16;

/**
 * A change to a CP/M disk was refused, or didn't verify. The message is suitable for showing to a user. If it
 * comes from {@link CpmWriter.flush}, the overlay holds a change that didn't verify and the caller must discard it.
 */
export class CpmWriteError extends Error {
    /** What kind of refusal this is, for callers that act on the cause. */
    public readonly kind: CpmWriteErrorKind;

    /**
     * @param message what went wrong.
     * @param kind what kind of refusal this is.
     */
    constructor(message: string, kind: CpmWriteErrorKind = CpmWriteErrorKind.OTHER) {
        super(message);
        this.name = "CpmWriteError";
        this.kind = kind;
    }
}

/**
 * The kinds of {@link CpmWriteError}, for the causes that a caller may want to tell apart without reading the
 * message.
 */
export enum CpmWriteErrorKind {
    /** Anything not listed below. */
    OTHER,

    /** There's no room for the file: too few free blocks, or no free directory slots. */
    NO_SPACE,
}

/**
 * What the user may choose when adding a file. Each flag that is undefined is left clear on a new file, and is
 * kept as it was on a replaced one.
 */
export interface CpmAddOptions {
    /** Whether the file is a system file (SYS), which hides it from DIR. */
    system?: boolean | undefined;

    /** Whether the file is read-only (R/O). */
    readOnly?: boolean | undefined;
}

/**
 * What {@link CpmWriter.addFile} did.
 */
export interface CpmAddResult {
    /** The file's name, such as "HELLO.TXT". */
    name: string;

    /** The file's size in bytes, before the last record was padded. */
    size: number;
}

/**
 * Attributes to change. Each that is undefined is left alone. CP/M 2.2 has these two, and the archive bit, which
 * the writer never touches.
 */
export interface CpmAttributeChanges {
    /** Whether the file is a system file (SYS). */
    system?: boolean | undefined;

    /** Whether the file is read-only (R/O). */
    readOnly?: boolean | undefined;
}

/**
 * The blocks that files could be given on a disk, and those that look free but can't be used.
 */
export interface CpmFreeBlocks {
    /** The blocks that no entry claims and whose records are all on sectors that can be written, lowest first. */
    free: number[];

    /** The blocks that no entry claims but that have a record on a sector that is missing or has a CRC error. */
    unusable: number[];
}

/**
 * Find the blocks that new files could be given: the data blocks (from the first one after the reserved blocks, to
 * the DPB's last block) that no directory entry claims, less those with a record on a sector that is missing or has
 * a CRC error, so that a truncated image or a damaged sector is never allocated. CP/M has no allocation map, so
 * "claims" is conservative: every block pointer in range, in every slot that isn't unused (0xE5) and isn't a CP/M 3
 * password, label, or date stamp (user 16 to 0x21), counts, whether or not the entry decoded as a file, since a
 * rejected entry may still own its blocks. See "CP/M" in FLOPPY_FORMATS.md.
 *
 * @param cpm the file system, which says how blocks map to sectors and is what reads the sectors.
 * @param directory the directory's bytes (dirEntryCount*32), which may be a writer's working copy. Default is
 * the disk's.
 */
export function findCpmFreeBlocks(cpm: Cpm, directory: Uint8Array = cpm.readDirectoryBytes()): CpmFreeBlocks {
    const claimed = new Set<number>();
    const pointerSize = cpm.wideBlockPointers ? 2 : 1;
    for (let slot = 0; slot < cpm.dirEntryCount; slot++) {
        const entry = directory.subarray(slot*DIR_ENTRY_SIZE, (slot + 1)*DIR_ENTRY_SIZE);
        const user = entry[0];
        if (user === UNUSED_USER || (user > MAX_FILE_USER && user <= MAX_OTHER_USER)) {
            continue;
        }
        for (let i = POINTERS_OFFSET; i < DIR_ENTRY_SIZE; i += pointerSize) {
            const block = cpm.wideBlockPointers ? entry[i] | (entry[i + 1] << 8) : entry[i];
            if (block >= cpm.firstDataBlock && block < cpm.blockCount) {
                claimed.add(block);
            }
        }
    }

    // How many bytes each sector holds, or -1 if it's missing or has a CRC error, read once.
    const sectorSizes = new Map<string, number>();

    /**
     * Whether every record of a block is on a sector that can be written.
     */
    const usable = (block: number): boolean => {
        for (const record of cpm.getBlockRecords(block)) {
            const {position, offset} = cpm.getRecordLocation(record);
            const key = position.key();
            let size = sectorSizes.get(key);
            if (size === undefined) {
                const sector = cpm.disk.hasSectorData(position) ? cpm.disk.readSector(position) : undefined;
                size = sector === undefined || sector.crcError ? -1 : sector.data.length;
                sectorSizes.set(key, size);
            }
            if (size < offset + RECORD_SIZE) {
                return false;
            }
        }
        return true;
    };

    const free: number[] = [];
    const unusable: number[] = [];
    for (let block = cpm.firstDataBlock; block < cpm.blockCount; block++) {
        if (!claimed.has(block)) {
            (usable(block) ? free : unusable).push(block);
        }
    }
    return {free, unusable};
}

/**
 * Whether two byte arrays have the same contents.
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Whether two lists of numbers are the same.
 */
function numbersEqual(a: readonly number[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * A file that the writer knows about: how it is now, and what it was.
 */
interface WriterFile {
    /**
     * The file as it is now, with its current name and attributes and its directory slots. Renaming or changing
     * attributes replaces this with a new object.
     */
    file: CpmFile;

    /**
     * The file as it was when the writer was made, or undefined for a file that the writer added (or replaced,
     * which makes a new file).
     */
    original: CpmFile | undefined;

    /**
     * For an added file, its contents padded to whole records, which flush() verifies by reading it back.
     */
    contents: Uint8Array | undefined;

    /**
     * For an added file, the data-area records that hold it, so that deleting it again can drop them.
     */
    records: number[];
}

/**
 * Everything that replaceFile() must put back if it fails after deleting the old file.
 */
interface WriterSnapshot {
    directory: Uint8Array;
    touchedSlots: Set<number>;
    files: WriterFile[];
    pendingRecords: Map<number, Uint8Array>;
}

/**
 * The sector that a group of record writes goes to, with the writes.
 */
interface SectorPatch {
    position: SectorPosition;
    patches: {offset: number, bytes: Uint8Array}[];
}

/**
 * Makes changes to a CP/M disk: deleting, adding, replacing and renaming files and changing their attributes.
 * See "CP/M" and "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md for the directory's encoding.
 *
 * The writer copies the directory, makes every change there (and in a map of pending records, for file data), and
 * writes the changed sectors to a {@link SectorOverlay} only in {@link flush}, so nothing reaches the disk until the
 * caller commits the overlay. {@link flush} then decodes the overlay again and compares it with the disk as it
 * was when the writer was made, and refuses (by throwing) if anything differs that shouldn't. The caller discards
 * the overlay on any error.
 *
 * The writer doesn't decide whether the disk is safe to write; the caller checks the write gate first. A writer
 * is used for one flush: once {@link flush} succeeds, make a new writer from the returned file system.
 *
 * Files are identified by their first directory slot, so a file object from before a rename or an attribute
 * change still names the same file.
 */
export class CpmWriter {
    /**
     * The file system being changed, as decoded (with whole records) when the writer was made. It sits on
     * {@link overlay}.
     */
    public readonly cpm: Cpm;

    /**
     * The overlay holding the changes, which is {@link cpm}'s disk.
     */
    public readonly overlay: SectorOverlay;

    /**
     * The directory's bytes as they were when the writer was made.
     */
    private readonly originalDirectory: Uint8Array;

    /**
     * The directory's bytes with the changes made so far.
     */
    private directory: Uint8Array;

    /**
     * The slots that were written since the writer was made, even if a byte was put back.
     */
    private touchedSlots = new Set<number>();

    /**
     * The files as they are now, in directory order and then in the order added.
     */
    private files: WriterFile[];

    /**
     * The new data, by record index in the data area, 128 bytes each.
     */
    private pendingRecords = new Map<number, Uint8Array>();

    /**
     * Whether flush() has succeeded, after which the writer's snapshot is out of date.
     */
    private flushed = false;

    /**
     * @param overlay the overlay over the floppy to change.
     * @param cpm the file system decoded on that overlay with whole records, as decodeCpmWithLayout() makes it.
     */
    constructor(overlay: SectorOverlay, cpm: Cpm) {
        if (cpm.disk !== overlay) {
            throw new Error("The file system must be decoded on the writer's overlay");
        }
        this.overlay = overlay;
        this.cpm = cpm;
        this.originalDirectory = cpm.readDirectoryBytes();
        this.directory = new Uint8Array(this.originalDirectory);
        this.files = cpm.getDirEntries(true).map(file => ({file, original: file, contents: undefined, records: []}));

    }

    /**
     * The files on the disk as of now, from every user, in directory order and then in the order added.
     */
    public getFiles(): CpmFile[] {
        return this.files.map(entry => entry.file);
    }

    /**
     * Find the files with a name, case doesn't matter, from every user. There's one per user at most.
     */
    public findFiles(filename: CpmFilename): CpmFile[] {
        return this.files.map(entry => entry.file).filter(file => CpmWriter.hasName(file, filename));
    }

    /**
     * Whether a file has the name, ignoring case.
     */
    private static hasName(file: CpmFile, filename: CpmFilename): boolean {
        return file.name.toUpperCase() === filename.name && file.extension.toUpperCase() === filename.extension;
    }

    /**
     * The writer's record of a file, found by its first slot.
     *
     * @throws CpmWriteError if it isn't one of the writer's files (it was deleted, or comes from another disk).
     */
    private findEntry(file: CpmFile): WriterFile {
        const slot = file.extents[0].slot;
        const entry = this.files.find(candidate => candidate.file.extents[0].slot === slot);
        if (entry === undefined) {
            throw new CpmWriteError(`${cpmFilenameToString(file)} isn't a file on this disk (or was already deleted)`);
        }
        return entry;
    }

    /**
     * Capture what replaceFile() may have to restore.
     */
    private snapshot(): WriterSnapshot {
        return {
            directory: new Uint8Array(this.directory),
            touchedSlots: new Set(this.touchedSlots),
            files: [...this.files],
            pendingRecords: new Map(this.pendingRecords),
        };
    }

    /**
     * Put back what {@link snapshot} captured.
     */
    private restore(snapshot: WriterSnapshot): void {
        this.directory = snapshot.directory;
        this.touchedSlots = snapshot.touchedSlots;
        this.files = snapshot.files;
        this.pendingRecords = snapshot.pendingRecords;
    }

    /**
     * The 11 bytes of a name and extension, upper case and padded with spaces, with attribute bits.
     */
    private static rawName(filename: CpmFilename, nameHighBits: Uint8Array | undefined, readOnly: boolean,
                           system: boolean): Uint8Array {

        const text = filename.name.padEnd(8, " ") + filename.extension.padEnd(3, " ");
        const raw = new Uint8Array(11);
        for (let i = 0; i < 11; i++) {
            raw[i] = text.charCodeAt(i);
            if (i < 8 && nameHighBits !== undefined) {
                raw[i] |= nameHighBits[i];
            }
        }
        if (readOnly) {
            raw[READ_ONLY_OFFSET - NAME_OFFSET] |= ATTRIBUTE_BIT;
        }
        if (system) {
            raw[SYSTEM_OFFSET - NAME_OFFSET] |= ATTRIBUTE_BIT;
        }
        return raw;
    }

    /**
     * Add a file for a user. Nothing changes if it throws.
     *
     * @param user the user number, 0 to 15.
     * @param filename the name.
     * @param contents the file's bytes, which are padded to whole records with Ctrl-Z.
     * @param nameHighBits the high bits to keep on the first 8 bytes of the name (0 or 0x80 each), or undefined for none.
     * @param readOnly whether the file is R/O.
     * @param system whether the file is SYS.
     * @throws CpmWriteError if the user has a file of that name, or there's no room.
     */
    private addFileForUser(user: number, filename: CpmFilename, contents: Uint8Array, nameHighBits: Uint8Array | undefined,
                           readOnly: boolean, system: boolean): CpmAddResult {

        const cpm = this.cpm;
        const name = cpmFilenameToString(filename);
        if (this.files.some(entry => entry.file.user === user && CpmWriter.hasName(entry.file, filename))) {
            throw new CpmWriteError(`${name} is already on the disk`);
        }

        // Sizes, in records and blocks. A directory entry holds a fixed number of blocks.
        const recordsPerBlock = cpm.recordsPerBlock;
        const recordCount = Math.ceil(contents.length/RECORD_SIZE);
        const blockCount = Math.ceil(recordCount/recordsPerBlock);
        const pointerCount = cpm.wideBlockPointers ? 8 : 16;
        const recordsPerEntry = (cpm.extentMask + 1)*128;
        if (pointerCount*recordsPerBlock !== recordsPerEntry) {
            throw new CpmWriteError("This disk's block size doesn't fit its directory entries");
        }
        const entryCount = Math.max(1, Math.ceil(recordCount/recordsPerEntry));

        // Space, lowest first.
        const {free} = findCpmFreeBlocks(cpm, this.directory);
        if (free.length < blockCount) {
            throw new CpmWriteError(`There's no room for ${name}: it needs ${blockCount.toLocaleString()} ` +
                `${blockCount === 1 ? "block" : "blocks"} and the disk has ${free.length.toLocaleString()} free`,
                CpmWriteErrorKind.NO_SPACE);
        }
        const blocks = free.slice(0, blockCount);
        const slots: number[] = [];
        for (let slot = 0; slot < cpm.dirEntryCount && slots.length < entryCount; slot++) {
            if (this.directory[slot*DIR_ENTRY_SIZE] === UNUSED_USER) {
                slots.push(slot);
            }
        }
        if (slots.length < entryCount) {
            throw new CpmWriteError(`There's no room for ${name} in the directory: it needs ` +
                `${entryCount} ${entryCount === 1 ? "entry" : "entries"} and the directory has ${slots.length} free`,
                CpmWriteErrorKind.NO_SPACE);
        }

        // The entries: entry k holds records k*RPE up to (k+1)*RPE, its last logical extent's record count is RC,
        // and EX and S2 are the low 5 bits and the rest of its extent number. See "CP/M" in FLOPPY_FORMATS.md.
        const rawName = CpmWriter.rawName(filename, nameHighBits, readOnly, system);
        const extents: CpmExtent[] = [];
        for (let k = 0; k < entryCount; k++) {
            const firstRecord = k*recordsPerEntry;
            const n = Math.min(recordCount, firstRecord + recordsPerEntry) - firstRecord;
            const lastLogicalExtent = n === 0 ? 0 : Math.floor((n - 1)/128);
            const extentNumber = k*(cpm.extentMask + 1) + lastLogicalExtent;
            const entryRecordCount = n - 128*lastLogicalExtent;
            const entryBlocks = blocks.slice(k*pointerCount, k*pointerCount + Math.ceil(n/recordsPerBlock));

            const bytes = new Uint8Array(DIR_ENTRY_SIZE);
            bytes[0] = user;
            bytes.set(rawName, NAME_OFFSET);
            bytes[EXTENT_LOW_OFFSET] = extentNumber & 0x1F;
            bytes[EXTENT_HIGH_OFFSET] = extentNumber >> 5;
            bytes[RECORD_COUNT_OFFSET] = entryRecordCount;
            entryBlocks.forEach((block, i) => {
                if (cpm.wideBlockPointers) {
                    bytes[POINTERS_OFFSET + 2*i] = block & 0xFF;
                    bytes[POINTERS_OFFSET + 2*i + 1] = block >> 8;
                } else {
                    bytes[POINTERS_OFFSET + i] = block;
                }
            });
            this.directory.set(bytes, slots[k]*DIR_ENTRY_SIZE);
            this.touchedSlots.add(slots[k]);
            extents.push(new CpmExtent(user, filename.name, filename.extension, readOnly, system, false,
                extentNumber, entryRecordCount, entryBlocks, slots[k]));
        }

        // The data, as whole records.
        const padded = new Uint8Array(recordCount*RECORD_SIZE).fill(CTRL_Z);
        padded.set(contents);
        const records: number[] = [];
        blocks.forEach((block, i) => {
            const recordsInBlock = Math.min(recordsPerBlock, recordCount - i*recordsPerBlock);
            for (let j = 0; j < recordsInBlock; j++) {
                const record = block*recordsPerBlock + j;
                const first = (i*recordsPerBlock + j)*RECORD_SIZE;
                this.pendingRecords.set(record, padded.slice(first, first + RECORD_SIZE));
                records.push(record);
            }
        });

        this.files.push({file: new CpmFile(extents, undefined), original: undefined, contents: padded, records});
        return {name, size: contents.length};
    }

    /**
     * Add a file for user 0. Its contents are padded to whole records with Ctrl-Z, which CP/M needs because it
     * records sizes in records, and read back like that. A file of no bytes is one entry with no blocks. Blocks are
     * taken lowest first, and so are directory slots. Nothing reaches the overlay until {@link flush}. If this
     * throws, the writer is as it was before the call.
     *
     * @param filename the name.
     * @param contents the file's bytes.
     * @param options the attributes to set.
     * @throws CpmWriteError if user 0 already has a file of that name, or there's no room (a NO_SPACE error).
     */
    public addFile(filename: CpmFilename, contents: Uint8Array, options: CpmAddOptions = {}): CpmAddResult {
        this.checkNotFlushed();
        return this.addFileForUser(0, filename, contents, undefined, options.readOnly === true,
            options.system === true);
    }

    /**
     * Replace a file's contents: delete it, then add it again under the same user and name, with the same R/O and
     * SYS attributes unless the options say otherwise. The blocks and slots that the delete frees may be reused,
     * so the new copy takes the lowest ones. The archive bit isn't kept, since the file is new. If this throws,
     * the writer is as it was before the call.
     *
     * @param file the file, from {@link getFiles} or {@link findFiles}.
     * @param contents the new bytes.
     * @param options the attributes to change; those left undefined stay as the old file had them.
     * @throws CpmWriteError if there's no room (a NO_SPACE error), or the file isn't on the disk.
     */
    public replaceFile(file: CpmFile, contents: Uint8Array, options: CpmAddOptions = {}): CpmAddResult {
        this.checkNotFlushed();
        const entry = this.findEntry(file);
        const current = entry.file;
        const firstSlot = current.extents[0].slot;
        const nameHighBits = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
            nameHighBits[i] = this.directory[firstSlot*DIR_ENTRY_SIZE + NAME_OFFSET + i] & ATTRIBUTE_BIT;
        }
        const filename = {name: current.name, extension: current.extension};

        const before = this.snapshot();
        try {
            this.deleteFile(current);
            return this.addFileForUser(current.user, filename, contents, nameHighBits,
                options.readOnly ?? current.isReadOnly(), options.system ?? current.isSystemFile());
        } catch (e) {
            this.restore(before);
            throw e;
        }
    }

    /**
     * Delete a file: set the user byte of each of its slots to 0xE5, as CP/M's ERA does and nothing else, so its blocks
     * become free (CP/M has no map to update). Nothing reaches the overlay until {@link flush}.
     *
     * @param file the file, from {@link getFiles} or {@link findFiles}.
     * @throws CpmWriteError if the file isn't on the disk.
     */
    public deleteFile(file: CpmFile): void {
        this.checkNotFlushed();
        const entry = this.findEntry(file);
        for (const extent of entry.file.extents) {
            this.directory[extent.slot*DIR_ENTRY_SIZE] = UNUSED_USER;
            this.touchedSlots.add(extent.slot);
        }
        for (const record of entry.records) {
            this.pendingRecords.delete(record);
        }
        this.files = this.files.filter(candidate => candidate !== entry);
    }

    /**
     * Rename a file, in every one of its slots. Each byte of the name keeps its high bit (the attributes, and
     * CP/M's interface attributes f1' to f8'), and only the low 7 bits change. Renaming a file to its own name
     * changes nothing. Nothing reaches the overlay until {@link flush}. If this throws, the writer is as it was.
     *
     * @param file the file, from {@link getFiles} or {@link findFiles}.
     * @param newFilename the new name, which must not belong to another file of the same user (case doesn't matter).
     * @throws CpmWriteError if the file isn't on the disk, or its user has a file of the new name.
     */
    public renameFile(file: CpmFile, newFilename: CpmFilename): void {
        this.checkNotFlushed();
        const entry = this.findEntry(file);
        const current = entry.file;
        const conflict = this.files.some(other => other !== entry && other.file.user === current.user &&
            CpmWriter.hasName(other.file, newFilename));
        if (conflict) {
            throw new CpmWriteError(`${cpmFilenameToString(newFilename)} is already on the disk`);
        }

        const text = newFilename.name.padEnd(8, " ") + newFilename.extension.padEnd(3, " ");
        for (const extent of current.extents) {
            const base = extent.slot*DIR_ENTRY_SIZE + NAME_OFFSET;
            for (let i = 0; i < 11; i++) {
                this.directory[base + i] = (this.directory[base + i] & ATTRIBUTE_BIT) | text.charCodeAt(i);
            }
            this.touchedSlots.add(extent.slot);
        }

        const extents = current.extents.map(extent => new CpmExtent(extent.user, newFilename.name,
            newFilename.extension, extent.readOnly, extent.system, extent.archived, extent.extentNumber,
            extent.recordCount, extent.blocks, extent.slot));
        entry.file = new CpmFile(extents, undefined);
    }

    /**
     * Change a file's R/O and SYS attributes, which are the high bits of the extension's first two bytes, in every
     * one of its slots. The archive bit isn't touched. Nothing reaches the overlay until {@link flush}.
     *
     * @param file the file, from {@link getFiles} or {@link findFiles}.
     * @param changes what to change; each field left undefined stays as it is.
     * @throws CpmWriteError if the file isn't on the disk.
     */
    public setAttributes(file: CpmFile, changes: CpmAttributeChanges): void {
        this.checkNotFlushed();
        const entry = this.findEntry(file);
        const current = entry.file;
        const setBit = (slot: number, offset: number, on: boolean): void => {
            const index = slot*DIR_ENTRY_SIZE + offset;
            this.directory[index] = on ? this.directory[index] | ATTRIBUTE_BIT : this.directory[index] & ~ATTRIBUTE_BIT;
        };

        for (const extent of current.extents) {
            if (changes.readOnly !== undefined) {
                setBit(extent.slot, READ_ONLY_OFFSET, changes.readOnly);
            }
            if (changes.system !== undefined) {
                setBit(extent.slot, SYSTEM_OFFSET, changes.system);
            }
            this.touchedSlots.add(extent.slot);
        }

        const extents = current.extents.map(extent => new CpmExtent(extent.user, extent.name, extent.extension,
            changes.readOnly ?? extent.readOnly, changes.system ?? extent.system, extent.archived,
            extent.extentNumber, extent.recordCount, extent.blocks, extent.slot));
        entry.file = new CpmFile(extents, undefined);
    }

    /**
     * Whether anything has been changed in memory since the writer was made, not counting changes that put a byte
     * back to what it was.
     */
    public hasChanges(): boolean {
        return this.pendingRecords.size > 0 || !bytesEqual(this.directory, this.originalDirectory);
    }

    /**
     * Throw if the writer has already flushed, since its snapshot is then out of date.
     */
    private checkNotFlushed(): void {
        if (this.flushed) {
            throw new CpmWriteError("This writer has already been flushed; make a new one");
        }
    }

    /**
     * Write bytes into sectors of the overlay, a sector at a time: read the sector, patch the bytes in, and write
     * it back, so that records smaller than a sector and blocks that start partway through one work. A sector that
     * is missing or has a CRC error is refused, since we can't write around what we can't read.
     *
     * @param sectors the sectors and the patches for each.
     */
    private writeSectors(sectors: Iterable<SectorPatch>): void {
        for (const {position, patches} of sectors) {
            const sector = this.overlay.readSector(position);
            const description = `cylinder ${position.cylinderNumber}, side ${position.side}, sector ${position.sectorNumber}`;
            if (sector === undefined) {
                throw new CpmWriteError(`Can't write ${description}: the sector isn't on the disk`);
            }
            if (sector.crcError) {
                throw new CpmWriteError(`Can't write ${description}: the sector has a CRC error`);
            }
            const data = new Uint8Array(sector.data);
            for (const {offset, bytes} of patches) {
                if (offset + bytes.length > data.length) {
                    throw new CpmWriteError(`Can't write ${description}: the sector is too small`);
                }
                data.set(bytes, offset);
            }
            try {
                this.overlay.writeSector(position, data);
            } catch (e) {
                throw new CpmWriteError(e instanceof Error ? e.message : String(e));
            }
        }
    }

    /**
     * Group pieces of data by the sector they go in.
     *
     * @param pieces the sector, the byte offset in it, and the bytes, in any order.
     */
    private static groupBySector(pieces: Iterable<{position: SectorPosition, offset: number, bytes: Uint8Array}>):
        SectorPatch[] {

        const groups = new Map<string, SectorPatch>();
        for (const {position, offset, bytes} of pieces) {
            const key = position.key();
            let group = groups.get(key);
            if (group === undefined) {
                group = {position, patches: []};
                groups.set(key, group);
            }
            group.patches.push({offset, bytes});
        }
        return [...groups.values()];
    }

    /**
     * Write the changed data and directory slots to the overlay, decode the overlay again, and verify the result.
     * The new files' data goes first, then the directory that points to it. Then the result must read back the
     * directory as written, have the files it had less the deleted ones and plus the added ones, with renamed ones
     * under their new names and changed attributes, read every file that wasn't replaced exactly as before, read
     * every added file as the contents given, have every untouched directory slot as it was, have no more bad entries
     * or repeated blocks than before, have written only to data tracks, and still not read as a TRSDOS disk. With no
     * changes, nothing is written and the result is verified all the same.
     *
     * It doesn't check that the disk would be detected with the same layout when it's opened afresh, since removing
     * files can leave too little evidence for that. The session checks it when the disk is saved (see
     * DiskSession.getSaveBlocker() in trs80-disk), and until then it remembers the layout.
     *
     * @return the file system decoded from the changed overlay, with whole records.
     * @throws CpmWriteError if the result differs from what was intended. The overlay then holds the change, and
     * the caller must discard it.
     */
    public flush(): Cpm {
        this.checkNotFlushed();
        const cpm = this.cpm;

        // Remember what the files that stay hold, before anything is written.
        const contentsBefore = new Map<WriterFile, Uint8Array>();
        for (const entry of this.files) {
            if (entry.original !== undefined) {
                contentsBefore.set(entry, cpm.readFile(entry.original));
            }
        }

        // The data first, then the directory slots that point to it.
        const dataPieces = [...this.pendingRecords].map(([record, bytes]) => ({...cpm.getRecordLocation(record), bytes}));
        this.writeSectors(CpmWriter.groupBySector(dataPieces));
        const slotPieces = [...this.touchedSlots].sort((a, b) => a - b).map(slot => ({
            ...cpm.getDirSlotLocation(slot),
            bytes: this.directory.slice(slot*DIR_ENTRY_SIZE, (slot + 1)*DIR_ENTRY_SIZE),
        }));
        this.writeSectors(CpmWriter.groupBySector(slotPieces));

        const after = decodeCpmWithLayout(this.overlay, cpm, true);
        this.verify(after, contentsBefore);

        this.flushed = true;
        return after;
    }

    /**
     * Check the overlay as it is after the writes against what the writer meant to do.
     *
     * @param after the file system decoded on the overlay after the writes.
     * @param contentsBefore the contents (whole records) of each file that stays.
     * @throws CpmWriteError if anything is wrong.
     */
    private verify(after: Cpm, contentsBefore: Map<WriterFile, Uint8Array>): void {
        const cpm = this.cpm;

        // 2. The directory is what the writer meant, and the files in it are the ones we expect.
        if (!bytesEqual(after.readDirectoryBytes(), this.directory)) {
            throw new CpmWriteError("After the change, the directory doesn't read back as written");
        }
        const actualFiles = after.getDirEntries(true);
        if (actualFiles.length !== this.files.length) {
            throw new CpmWriteError(`After the change, the disk has ${actualFiles.length} files instead of ` +
                `${this.files.length}`);
        }
        const actualByKey = new Map(actualFiles.map(file => [`${file.user}:${file.name}.${file.extension}`, file]));
        for (const entry of this.files) {
            const expected = entry.file;
            const name = cpmFilenameToString(expected);
            const actual = actualByKey.get(`${expected.user}:${expected.name}.${expected.extension}`);
            if (actual === undefined || !CpmWriter.sameShape(expected, actual)) {
                throw new CpmWriteError(`After the change, ${name} doesn't read back with the entries it should have`);
            }

            // 3. A file that wasn't replaced reads as before, and 4. an added one as the contents given.
            const before = contentsBefore.get(entry);
            if (before !== undefined) {
                if (!bytesEqual(after.readFile(actual), before)) {
                    throw new CpmWriteError(`After the change, ${name} doesn't read back as it did before`);
                }
            } else if (entry.contents !== undefined && !bytesEqual(after.readFile(actual), entry.contents)) {
                throw new CpmWriteError(`After the change, ${name} doesn't read back as what was written`);
            }
        }

        // 3. Every slot that wasn't touched is as it was.
        for (let slot = 0; slot < cpm.dirEntryCount; slot++) {
            if (!this.touchedSlots.has(slot)) {
                const range = [slot*DIR_ENTRY_SIZE, (slot + 1)*DIR_ENTRY_SIZE];
                if (!bytesEqual(this.directory.subarray(range[0], range[1]), this.originalDirectory.subarray(range[0], range[1]))) {
                    throw new CpmWriteError(`After the change, directory slot ${slot} differs but wasn't touched`);
                }
            }
        }

        // 5. No new damage.
        if (after.evaluation.badEntryCount > cpm.evaluation.badEntryCount ||
            after.evaluation.duplicateBlockCount > cpm.evaluation.duplicateBlockCount) {

            throw new CpmWriteError("After the change, the directory has more damage than before");
        }

        // 6. Nothing on the reserved tracks changed.
        for (const position of this.overlay.getChangedPositions()) {
            const track = position.cylinderNumber*cpm.allocationSides + position.side;
            if (track < cpm.reservedTrackCount) {
                throw new CpmWriteError("The change would write to the disk's system tracks");
            }
        }

        // 7. The disk doesn't start reading as TRSDOS.
        if (decodeTrsdos(this.overlay) !== undefined) {
            throw new CpmWriteError("After the change, the disk would read as a TRSDOS disk");
        }
    }

    /**
     * Whether two files have the same entries: the same slots, extent numbers, record counts, blocks, and flags.
     */
    private static sameShape(expected: CpmFile, actual: CpmFile): boolean {
        if (expected.extents.length !== actual.extents.length) {
            return false;
        }
        return expected.extents.every((extent, i) => {
            const other = actual.extents[i];
            return extent.slot === other.slot && extent.extentNumber === other.extentNumber &&
                extent.recordCount === other.recordCount && numbersEqual(extent.blocks, other.blocks) &&
                extent.readOnly === other.readOnly && extent.system === other.system &&
                extent.archived === other.archived;
        });
    }
}
