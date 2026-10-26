import {assertNever} from "z80-base";
import type {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {
    decodeTrsdos, encodeTrsdos23DirEntry, encodeTrsdos23ExtendedDirEntry, hashForFilename, TRSDOS_BLANK_PASSWORD_HASH, type Trsdos,
    type Trsdos23TimeStamp, type TrsdosDirEntry, type TrsdosDirectory, type TrsdosDirSlot, TrsdosVersion,
} from "./Trsdos.js";
import {allocateGranules, type AllocatedExtent, freeGranuleFlags, maxGranulesPerExtent} from "./TrsdosAllocator.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {chooseDirSlots} from "./TrsdosDirSlots.js";
import {trsdosFilenameToRaw, trsdosFilenameToString, type TrsdosFilename} from "./TrsdosFilename.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {TrsdosRuleSet, trsdosRuleSetToString} from "./TrsdosRuleSet.js";

/**
 * The directory entry flag that says the entry is in use. Clearing it deletes the entry.
 */
const FLAG_IN_USE = 0x10;

/**
 * The directory entry flag for a system file.
 */
const FLAG_SYSTEM = 0x40;

/**
 * The directory entry flag for an invisible file.
 */
const FLAG_INVISIBLE = 0x08;

/**
 * Byte 1 of an LDOS-line entry: the bit that says the file changed since the last backup, which the
 * DOS sets when it writes a file. See "Directory entries (2.3 family)" in FLOPPY_FORMATS.md.
 */
const BYTE1_MODIFIED = 0x40;

/**
 * Byte 1 of an LDOS-line entry: the bit that says the system date wasn't maintained when the file
 * was written, so the date in the entry (if any) isn't to be trusted.
 */
const BYTE1_DATE_NOT_SET = 0x10;

/**
 * The offset in a directory entry of the 11 bytes of the file's name and extension.
 */
const NAME_OFFSET = 5;

/**
 * The most extents that one primary directory entry holds.
 */
const EXTENTS_PER_ENTRY = 4;

/**
 * The size of the sectors that the writer can fill with file data.
 */
const SECTOR_SIZE = 256;

/**
 * The years that the LDOS line's directory dates hold without a time stamp: byte 2 has three bits for
 * the year, from 1980.
 */
const FIRST_YEAR = 1980;
const LAST_YEAR_WITHOUT_TIME_STAMP = 1987;

/**
 * The last year that an LDOS 5.3 or LS-DOS 6.3 time stamp holds (five bits for the year, from 1980).
 */
const LAST_YEAR_WITH_TIME_STAMP = 2011;

/**
 * The raw names of the files that can't be deleted or renamed, because the DOS needs them where they are.
 */
const PROTECTED_RAW_FILENAMES = ["BOOT    SYS", "DIR     SYS"];

/**
 * A change to a TRSDOS disk was refused, or didn't verify. The message is suitable for showing to a
 * user. If it comes from {@link TrsdosWriter.flush}, the overlay holds a change that didn't verify
 * and the caller must discard it.
 */
export class TrsdosWriteError extends Error {
    /**
     * @param message what went wrong.
     */
    constructor(message: string) {
        super(message);
        this.name = "TrsdosWriteError";
    }
}

/**
 * What to do differently when adding a file.
 */
export interface TrsdosAddOptions {
    /**
     * Whether to make it a system file.
     */
    system?: boolean | undefined;

    /**
     * Whether to hide it from directory listings.
     */
    invisible?: boolean | undefined;

    /**
     * The date to record in the file's directory entry, in local time, or undefined to record none.
     * Only the LDOS line of DOSes has file dates; on others the date is ignored and the result says so.
     */
    date?: Date | undefined;
}

/**
 * What {@link TrsdosWriter.addFile} did.
 */
export interface TrsdosAddResult {
    /**
     * The file's name with a slash before any extension, such as "HELLO/BAS".
     */
    name: string;

    /**
     * The file's size in bytes.
     */
    size: number;

    /**
     * A message for the user about something the writer did not do as asked, such as that the DOS
     * doesn't store dates, or undefined if it did everything.
     */
    warning: string | undefined;
}

/**
 * A file that {@link TrsdosWriter.addFile} has added, kept for the final verification.
 */
interface AddedFile {
    /**
     * The name with a slash before any extension, in the case the file was added with.
     */
    name: string;

    /**
     * The contents the file must read back as.
     */
    contents: Uint8Array;
}

/**
 * A sector of new file data waiting to be written to the overlay by {@link TrsdosWriter.flush}.
 */
interface PendingSector {
    /**
     * Where the sector goes.
     */
    sectorPosition: SectorPosition;

    /**
     * The sector's data.
     */
    bytes: Uint8Array;
}

/**
 * A copy of one sector's bytes that the writer is changing, and whether it has changed.
 */
interface SectorCopy {
    /**
     * Where the sector is on the disk.
     */
    sectorPosition: SectorPosition;

    /**
     * The working copy of the sector's data.
     */
    bytes: Uint8Array;

    /**
     * Whether the working copy differs from what the overlay had when we copied it.
     */
    dirty: boolean;
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
 * Makes changes to a TRSDOS floppy: the writer's core and its operations, deleting, adding
 * and renaming files.
 *
 * The writer reads the GAT, the HIT and the directory sectors it changes into memory, makes every
 * change there, and writes back only the sectors that changed, into a {@link SectorOverlay} (so
 * nothing reaches the disk until the caller commits the overlay). {@link flush} then decodes the
 * overlay again and compares it with the disk as it was when the writer was made, and refuses (by
 * throwing) if anything differs that shouldn't. The caller discards the overlay on any error.
 *
 * The writer doesn't decide whether the disk is safe to write; the caller checks the write gate first.
 * A writer is used for one flush: once {@link flush} succeeds, make a new writer from the returned
 * file system.
 */
export class TrsdosWriter {
    /**
     * The file system being changed, as decoded when the writer was made. It sits on {@link overlay}.
     */
    public readonly trsdos: Trsdos;

    /**
     * The overlay holding the changes, which is {@link trsdos}'s disk.
     */
    public readonly overlay: SectorOverlay;

    /**
     * The directory as it was when the writer was made. The entries here are the ones the writer's
     * methods take, and the ones in {@link granuleMap}.
     */
    private readonly directory: TrsdosDirectory;

    /**
     * The directory slot of each entry (primary and extended) that has one.
     */
    private readonly slotsByEntry = new Map<TrsdosDirEntry, TrsdosDirSlot>();

    /**
     * Who owns each granule, from the original directory.
     */
    private readonly granuleMap: TrsdosGranuleMap;

    /**
     * Each file's contents before any change, in the order of {@link directory}'s files.
     */
    private readonly originalContents = new Map<TrsdosDirEntry, Uint8Array>();

    /**
     * The layout and damage problems that the disk had to begin with, as "kind|message".
     */
    private readonly originalProblems: Set<string>;

    /**
     * The GAT sector's working copy.
     */
    private readonly gat: SectorCopy;

    /**
     * The HIT sector's working copy.
     */
    private readonly hit: SectorCopy;

    /**
     * The working copies of the directory sectors we've changed, by position key.
     */
    private readonly dirSectors = new Map<string, SectorCopy>();

    /**
     * The primary entries that have been deleted.
     */
    private readonly deleted = new Set<TrsdosDirEntry>();

    /**
     * The new name of each primary entry that {@link renameFile} has renamed, with a slash before any
     * extension, such as "HELLO/BAS". Use {@link currentName} to read a name.
     */
    private readonly renamed = new Map<TrsdosDirEntry, string>();

    /**
     * The rules the disk is written under, which decide what the DOS puts in a new directory entry
     * and which slots are reserved.
     */
    private readonly ruleSet: TrsdosRuleSet;

    /**
     * Whether each granule is free to be given to a new file, by linear index (lump*granulesPerLump +
     * granule), as of the changes so far: the granules that deleting files freed are free, and those
     * that adding files took are not.
     */
    private readonly freeGranules: boolean[];

    /**
     * The files that {@link addFile} has added.
     */
    private readonly added: AddedFile[] = [];

    /**
     * The data sectors of the added files, waiting to be written by {@link flush}.
     */
    private readonly pendingSectors: PendingSector[] = [];

    /**
     * Whether {@link flush} has succeeded.
     */
    private flushed = false;

    /**
     * Read the disk's GAT, HIT and directory into memory, and each file's contents and the disk's
     * problems for the final comparison.
     *
     * @param trsdos the file system, whose disk must be a {@link SectorOverlay}.
     * @param ruleSet the rules the disk is written under, from the write gate.
     * @throws TrsdosWriteError if the disk isn't an overlay, or the GAT or HIT can't be read.
     */
    constructor(trsdos: Trsdos, ruleSet: TrsdosRuleSet) {
        if (!(trsdos.disk instanceof SectorOverlay)) {
            throw new TrsdosWriteError("The disk must be a SectorOverlay to be written");
        }
        this.trsdos = trsdos;
        this.overlay = trsdos.disk;
        this.ruleSet = ruleSet;

        this.directory = trsdos.getDirectory();
        for (const slot of this.directory.slots) {
            this.slotsByEntry.set(slot.dirEntry, slot);
        }

        const granuleMap = TrsdosGranuleMap.make(trsdos, this.directory.files);
        if (typeof granuleMap === "string") {
            throw new TrsdosWriteError(granuleMap);
        }
        this.granuleMap = granuleMap;
        this.freeGranules = freeGranuleFlags(granuleMap);

        this.gat = this.copySector(trsdos.getGatPosition(), "GAT");
        this.hit = this.copySector(trsdos.getHitPosition(), "HIT");

        for (const dirEntry of this.directory.files) {
            this.originalContents.set(dirEntry, trsdos.readFile(dirEntry));
        }
        this.originalProblems = TrsdosWriter.problemKeys(trsdos);
    }

    /**
     * The files in the writer's directory that it hasn't deleted: the primary entries, including system
     * files, in directory order.
     */
    public getFiles(): TrsdosDirEntry[] {
        return this.directory.files.filter(dirEntry => !this.deleted.has(dirEntry));
    }

    /**
     * Find a file by name in the writer's directory, ignoring files it has deleted and using the
     * new names of files it has renamed.
     *
     * @param name the name with a slash before the extension, as {@link TrsdosDirEntry.getFilename}
     * gives it, such as "HELLO/BAS". The case doesn't matter.
     * @return the file's primary entry, or undefined if there's no such file.
     */
    public findFile(name: string): TrsdosDirEntry | undefined {
        const upperName = name.toUpperCase();
        return this.directory.files.find(dirEntry =>
            !this.deleted.has(dirEntry) && this.currentName(dirEntry).toUpperCase() === upperName);
    }

    /**
     * A file's name as of the changes so far: the name {@link renameFile} gave it if it has one,
     * otherwise the name it had on the disk. Everything that compares names goes through this.
     *
     * @param dirEntry the file's primary entry.
     * @return the name with a slash before any extension, such as "HELLO/BAS".
     */
    private currentName(dirEntry: TrsdosDirEntry): string {
        return this.renamed.get(dirEntry) ?? dirEntry.getFilename("/");
    }

    /**
     * Add a file: choose its granules and a directory slot, and fill in a primary directory entry,
     * the HIT byte and the GAT bits, the way the DOS's own rules would (see {@link TrsdosRuleSet}).
     * The file's data reaches the overlay at {@link flush}, with the rest. A file in a granule
     * freed by {@link deleteFile} reuses it. If this throws, the writer is as it was before the call.
     *
     * Only TRSDOS 2.3 layouts are supported for now. A file with more than four extents gets extended
     * directory entries (FXDEs), each holding four more, chained from the primary entry.
     *
     * @param filename the file's name, which must not be on the disk already (case doesn't matter).
     * @param contents the file's bytes, which are stored as they are.
     * @param options the attributes and date.
     * @return what was added, and a warning if something asked for couldn't be done.
     * @throws TrsdosWriteError if the file can't be added.
     */
    public addFile(filename: TrsdosFilename, contents: Uint8Array, options: TrsdosAddOptions = {}): TrsdosAddResult {
        this.checkNotFlushed();
        const trsdos = this.trsdos;
        const name = trsdosFilenameToString(filename);
        const rawFilename = trsdosFilenameToRaw(filename);

        switch (trsdos.version) {
            case TrsdosVersion.V2_3:
                break;

            case TrsdosVersion.V1_3:
                throw new TrsdosWriteError("Adding files isn't supported yet on TRSDOS 1.3 disks");

            case TrsdosVersion.V2_7:
                throw new TrsdosWriteError("Adding files isn't supported yet on TRSDOS 2.7 disks");

            default:
                assertNever(trsdos.version);
        }
        if (trsdos.geometry.modalDataSectorSize !== SECTOR_SIZE) {
            throw new TrsdosWriteError(`Adding files isn't supported on disks with ${trsdos.geometry.modalDataSectorSize}-byte sectors`);
        }

        const upperName = name.toUpperCase();
        const alreadyOnDisk = this.getFiles().some(dirEntry => this.currentName(dirEntry).toUpperCase() === upperName) ||
            this.added.some(addedFile => addedFile.name.toUpperCase() === upperName);
        if (alreadyOnDisk) {
            throw new TrsdosWriteError(`${name} is already on the disk`);
        }

        // The attributes and the date, by the DOS's rules.
        const datePart = this.makeDateFields(options.date);
        const flags = FLAG_IN_USE | (options.system === true ? FLAG_SYSTEM : 0) |
            (options.invisible === true ? FLAG_INVISIBLE : 0);

        // Granules.
        const size = contents.length;
        const sectorCount = Math.ceil(size/SECTOR_SIZE);
        if (sectorCount > 0xFFFF) {
            throw new TrsdosWriteError(`${name} is too big: a file can have at most 65,535 sectors`);
        }
        const neededGranules = Math.ceil(sectorCount/trsdos.sectorsPerGranule);
        // Ask for any number of extents: the directory slots below decide whether they fit, and
        // the allocator's choice doesn't depend on the limit.
        const extents = allocateGranules(this.freeGranules, trsdos.granulesPerLump, neededGranules,
            maxGranulesPerExtent(trsdos.version), Infinity);
        if (typeof extents === "string") {
            throw new TrsdosWriteError(`Can't add ${name}: ${extents.charAt(0).toLowerCase()}${extents.substring(1)}`);
        }
        if (extents.some(extent => extent.lump > 0xFD)) {
            throw new TrsdosWriteError(`Can't add ${name}: it would need a lump that a directory entry can't hold`);
        }

        // The directory slots: one for the primary entry, and one for each extended entry (FXDE) that
        // holds the extents past the first four. Asking for them all at once reports a full directory
        // before anything changes.
        const extentGroups: AllocatedExtent[][] = [];
        for (let i = 0; i < Math.max(extents.length, 1); i += EXTENTS_PER_ENTRY) {
            extentGroups.push(extents.slice(i, i + EXTENTS_PER_ENTRY));
        }
        const extendedEntriesUnderstood = this.ruleSet !== TrsdosRuleSet.TRSDOS_2;
        if (extentGroups.length > 1 && !extendedEntriesUnderstood) {
            // TRSDOS 2.x's FXDEs don't carry their primary's hash in the HIT, and we don't know what
            // they carry. See "An FXDE" in FLOPPY_FORMATS.md.
            throw new TrsdosWriteError(`Can't add ${name}: the free space is fragmented, so it needs ` +
                `${extents.length} extents, and writing TRSDOS 2.x's extended directory entries isn't ` +
                `supported yet`);
        }
        const decs = chooseDirSlots(trsdos, this.ruleSet, this.hit.bytes, extentGroups.length);
        if (typeof decs === "string") {
            const reason = `${decs.charAt(0).toLowerCase()}${decs.substring(1)}`;
            const fragmentation = extentGroups.length > 1 ?
                `the free space is fragmented, so it needs ${extents.length} extents; ` : "";
            throw new TrsdosWriteError(`Can't add ${name}: ${fragmentation}${reason}`);
        }
        const hash = hashForFilename(rawFilename);

        // The directory entries: the primary, then the chain of FXDEs. Each FXDE points back to the
        // entry before it, and each entry points ahead to the next.
        const entries = extentGroups.map((group, i) => {
            const nextDec = i + 1 < decs.length ? decs[i + 1] : undefined;
            if (i === 0) {
                return encodeTrsdos23DirEntry({
                    flags,
                    byte1: datePart.byte1,
                    byte2: datePart.byte2,
                    eofOffset: size % SECTOR_SIZE,
                    lrl: 0,
                    rawFilename,
                    updatePassword: TRSDOS_BLANK_PASSWORD_HASH,
                    accessPassword: TRSDOS_BLANK_PASSWORD_HASH,
                    timeStamp: datePart.timeStamp,
                    sectorCount,
                    extents: group,
                    nextDec,
                });
            } else {
                return encodeTrsdos23ExtendedDirEntry({prevDec: decs[i - 1], extents: group, nextDec});
            }
        });

        // Everything has been checked; now change the working copies.
        entries.forEach((entryBytes, i) => {
            const {sectorPosition, offset} = trsdos.getDirEntryLocation(decs[i]);
            const dirCopy = this.getDirSectorCopy(sectorPosition);
            dirCopy.bytes.set(entryBytes, offset);
            dirCopy.dirty = true;

            // An FXDE's HIT byte is its primary entry's hash (see "The HIT" in FLOPPY_FORMATS.md).
            this.hit.bytes[decs[i]] = hash;
        });
        this.hit.dirty = true;

        for (const extent of extents) {
            const start = extent.lump*trsdos.granulesPerLump + extent.granuleOffset;
            for (let index = start; index < start + extent.granuleCount; index++) {
                this.freeGranules[index] = false;
                this.gat.bytes[Math.floor(index/trsdos.granulesPerLump)] |= 1 << (index % trsdos.granulesPerLump);
            }
        }
        if (extents.length > 0) {
            this.gat.dirty = true;
        }

        const sectorPositions = trsdos.getExtentSectorPositions(extents);
        sectorPositions.forEach((position, i) => {
            const bytes = new Uint8Array(SECTOR_SIZE);
            bytes.set(contents.subarray(i*SECTOR_SIZE, (i + 1)*SECTOR_SIZE));
            this.pendingSectors.push({sectorPosition: position, bytes});
        });

        this.added.push({name, contents: new Uint8Array(contents)});
        return {name, size, warning: datePart.warning};
    }

    /**
     * Work out the date-related bytes of a new directory entry under the writer's rule set.
     *
     * @param date the date the caller wants stored, or undefined.
     * @return byte 1 and byte 2 of the entry, the time stamp if bytes 18-19 get one, and a warning if the
     * date can't be stored.
     * @throws TrsdosWriteError if the date can't be stored in this DOS's entries.
     */
    private makeDateFields(date: Date | undefined): {
        byte1: number, byte2: number, timeStamp: Trsdos23TimeStamp | undefined, warning: string | undefined,
    } {

        switch (this.ruleSet) {
            case TrsdosRuleSet.TRSDOS_2:
            case TrsdosRuleSet.DOSPLUS: {
                // Only the LDOS line has file dates, so bytes 1 and 2 stay zero.
                const warning = date === undefined ? undefined :
                    `${trsdosRuleSetToString(this.ruleSet)} disks don't store file dates, so the date was ignored`;
                return {byte1: 0, byte2: 0, timeStamp: undefined, warning};
            }

            case TrsdosRuleSet.LDOS_5:
            case TrsdosRuleSet.TRSDOS_6: {
                if (date === undefined) {
                    // No date: month 0 says the date was not set, and bit 4 says the system date wasn't
                    // maintained (LDOS 5.1 manual, PDF page 211).
                    return {byte1: BYTE1_MODIFIED | BYTE1_DATE_NOT_SET, byte2: 0, timeStamp: undefined, warning: undefined};
                }

                const year = date.getFullYear();
                const hasTimeStamps = this.trsdos.hasTimeStamps;
                const lastYear = hasTimeStamps ? LAST_YEAR_WITH_TIME_STAMP : LAST_YEAR_WITHOUT_TIME_STAMP;
                if (Number.isNaN(year) || year < FIRST_YEAR || year > lastYear) {
                    throw new TrsdosWriteError(`${trsdosRuleSetToString(this.ruleSet)} disks can't store the year ` +
                        `${Number.isNaN(year) ? "of that date" : year}; give a date from ${FIRST_YEAR} to ${lastYear}, or none`);
                }

                const byte1 = BYTE1_MODIFIED | (date.getMonth() + 1);
                const byte2 = (date.getDate() << 3) | ((year - FIRST_YEAR) & 0x07);
                const timeStamp = hasTimeStamps ?
                    {hour: date.getHours(), minute: date.getMinutes(), year} : undefined;
                return {byte1, byte2, timeStamp, warning: undefined};
            }

            case TrsdosRuleSet.TRSDOS_1_3:
                throw new TrsdosWriteError("Adding files isn't supported yet on TRSDOS 1.3 disks");

            default:
                assertNever(this.ruleSet);
        }
    }

    /**
     * Delete a file: clear the in-use bit of its primary entry and of each extended entry, clear their
     * HIT bytes, and free the granules that only this file used. The rest of each entry stays, so
     * that an undelete is possible. Nothing reaches the overlay until {@link flush}.
     *
     * Only TRSDOS 2.3 layouts are supported for now. BOOT/SYS and DIR/SYS can't be deleted.
     *
     * @param dirEntry the file's primary entry, from {@link findFile} or the writer's directory.
     * @throws TrsdosWriteError if the file can't be deleted.
     */
    public deleteFile(dirEntry: TrsdosDirEntry): void {
        this.checkNotFlushed();
        const name = this.currentName(dirEntry);
        if (!this.directory.files.includes(dirEntry)) {
            throw new TrsdosWriteError(`${name} isn't a file in this directory`);
        }
        if (this.deleted.has(dirEntry)) {
            throw new TrsdosWriteError(`${name} has already been deleted`);
        }
        if (!this.slotsByEntry.has(dirEntry)) {
            throw new TrsdosWriteError(`${name} is a system file that TRSDOS 1.3 doesn't list in its directory, ` +
                `so it can't be deleted`);
        }
        if (PROTECTED_RAW_FILENAMES.includes(dirEntry.rawFilename)) {
            throw new TrsdosWriteError(`${name} can't be deleted: the DOS needs it where it is`);
        }

        switch (this.trsdos.version) {
            case TrsdosVersion.V2_3:
                break;

            case TrsdosVersion.V1_3:
                throw new TrsdosWriteError("Deleting files isn't supported yet on TRSDOS 1.3 disks");

            case TrsdosVersion.V2_7:
                throw new TrsdosWriteError("Deleting files isn't supported yet on TRSDOS 2.7 disks");

            default:
                assertNever(this.trsdos.version);
        }

        // The primary entry and its chain of extended entries.
        const chain = TrsdosWriter.entryChain(dirEntry);
        for (const entry of chain) {
            const slot = this.slotsByEntry.get(entry);
            if (slot === undefined) {
                throw new TrsdosWriteError(`${name} has a directory entry that can't be found`);
            }
            this.clearDirEntry(slot);
        }

        this.releaseGranules(dirEntry);
        this.deleted.add(dirEntry);
    }

    /**
     * Rename a file: write the new name into its primary entry and update the HIT byte of that entry
     * and of each extended entry, since the HIT byte is the hash of the name. Nothing else about the
     * file changes: not its granules, its dates or its attributes. Nothing reaches the overlay until
     * {@link flush}. If this throws, the writer is as it was before the call.
     *
     * Only TRSDOS 2.3 layouts are supported for now. BOOT/SYS and DIR/SYS can't be renamed. Renaming a
     * file to its own name changes nothing. A file with extended entries can't be renamed under TRSDOS 2.x
     * rules, whose extended entries have HIT bytes that we don't understand yet.
     *
     * @param dirEntry the file's primary entry, from {@link findFile} or the writer's directory.
     * @param newFilename the new name, which must not belong to another file (case doesn't matter).
     * @throws TrsdosWriteError if the file can't be renamed.
     */
    public renameFile(dirEntry: TrsdosDirEntry, newFilename: TrsdosFilename): void {
        this.checkNotFlushed();
        const name = this.currentName(dirEntry);
        const newName = trsdosFilenameToString(newFilename);
        if (!this.directory.files.includes(dirEntry)) {
            throw new TrsdosWriteError(`${name} isn't a file in this directory`);
        }
        if (this.deleted.has(dirEntry)) {
            throw new TrsdosWriteError(`${name} has been deleted`);
        }
        if (!this.slotsByEntry.has(dirEntry)) {
            throw new TrsdosWriteError(`${name} is a system file that TRSDOS 1.3 doesn't list in its directory, ` +
                `so it can't be renamed`);
        }
        if (PROTECTED_RAW_FILENAMES.includes(dirEntry.rawFilename)) {
            throw new TrsdosWriteError(`${name} can't be renamed: the DOS needs it where it is`);
        }

        switch (this.trsdos.version) {
            case TrsdosVersion.V2_3:
                break;

            case TrsdosVersion.V1_3:
                throw new TrsdosWriteError("Renaming files isn't supported yet on TRSDOS 1.3 disks");

            case TrsdosVersion.V2_7:
                throw new TrsdosWriteError("Renaming files isn't supported yet on TRSDOS 2.7 disks");

            default:
                assertNever(this.trsdos.version);
        }

        // The name must be free. The file's own name doesn't count, so that a change of case works.
        const upperNewName = newName.toUpperCase();
        const inUse = this.getFiles().some(other =>
                other !== dirEntry && this.currentName(other).toUpperCase() === upperNewName) ||
            this.added.some(addedFile => addedFile.name.toUpperCase() === upperNewName);
        if (inUse) {
            throw new TrsdosWriteError(`${newName} is already on the disk`);
        }

        const chain = TrsdosWriter.entryChain(dirEntry);
        if (chain.length > 1 && this.ruleSet === TrsdosRuleSet.TRSDOS_2) {
            // TRSDOS 2.x's FXDEs don't carry their primary's hash in the HIT, and we don't know what
            // they carry. See "An FXDE" in FLOPPY_FORMATS.md.
            throw new TrsdosWriteError(`Can't rename ${name}: it has extended directory entries, and ` +
                `TRSDOS 2.x's HIT bytes for those aren't understood yet`);
        }
        const slots: TrsdosDirSlot[] = [];
        for (const entry of chain) {
            const slot = this.slotsByEntry.get(entry);
            if (slot === undefined) {
                throw new TrsdosWriteError(`${name} has a directory entry that can't be found`);
            }
            slots.push(slot);
        }

        // Everything has been checked; now change the working copies. The name is in the primary
        // entry only, but every entry's HIT byte is the hash of it.
        const rawFilename = trsdosFilenameToRaw(newFilename);
        const hash = hashForFilename(rawFilename);
        const {sectorPosition, offset} = this.trsdos.getDirEntryLocation(slots[0].hitIndex);
        const dirCopy = this.getDirSectorCopy(sectorPosition);
        for (let i = 0; i < rawFilename.length; i++) {
            const byte = rawFilename.charCodeAt(i);
            if (dirCopy.bytes[offset + NAME_OFFSET + i] !== byte) {
                dirCopy.bytes[offset + NAME_OFFSET + i] = byte;
                dirCopy.dirty = true;
            }
        }
        for (const slot of slots) {
            if (this.hit.bytes[slot.hitIndex] !== hash) {
                this.hit.bytes[slot.hitIndex] = hash;
                this.hit.dirty = true;
            }
        }

        this.renamed.set(dirEntry, newName);
    }

    /**
     * Whether anything has been changed in memory since the writer was made, not counting changes
     * that put a byte back to what it was.
     */
    public hasChanges(): boolean {
        return this.gat.dirty || this.hit.dirty || [...this.dirSectors.values()].some(copy => copy.dirty) ||
            this.pendingSectors.length > 0;
    }

    /**
     * Write the changed sectors to the overlay, decode the overlay again, and verify the result:
     * it must have the same layout, hold the files it had before less the deleted ones and plus the
     * added ones, with the renamed ones under their new names, read every remaining file exactly as before (except any file that includes the
     * directory sectors), read every added file as the contents given, and have no layout or damage
     * problem it didn't have. With no changes, nothing is written and the
     * result is verified all the same.
     *
     * @return the file system decoded from the changed overlay.
     * @throws TrsdosWriteError if the result differs from what was intended. The overlay then holds
     * the change, and the caller must discard it.
     */
    public flush(): Trsdos {
        this.checkNotFlushed();

        // The new files' data first, then the metadata that points to it.
        for (const pending of this.pendingSectors) {
            try {
                this.overlay.writeSector(pending.sectorPosition, pending.bytes);
            } catch (e) {
                throw new TrsdosWriteError(e instanceof Error ? e.message : String(e));
            }
        }
        const copies = [this.gat, this.hit, ...this.dirSectors.values()];
        for (const copy of copies) {
            if (copy.dirty) {
                try {
                    this.overlay.writeSector(copy.sectorPosition, copy.bytes);
                } catch (e) {
                    throw new TrsdosWriteError(e instanceof Error ? e.message : String(e));
                }
            }
        }

        const newTrsdos = decodeTrsdos(this.overlay);
        if (newTrsdos === undefined) {
            throw new TrsdosWriteError("After the change, the disk doesn't decode as a TRSDOS disk");
        }
        this.verify(newTrsdos);

        this.flushed = true;
        return newTrsdos;
    }

    /**
     * Throw if the writer has already flushed, since its snapshot is then out of date.
     */
    private checkNotFlushed(): void {
        if (this.flushed) {
            throw new TrsdosWriteError("This writer has already been flushed; make a new one");
        }
    }

    /**
     * A file's primary entry followed by its chain of extended entries, in order.
     */
    private static entryChain(dirEntry: TrsdosDirEntry): TrsdosDirEntry[] {
        const chain: TrsdosDirEntry[] = [];
        for (let entry: TrsdosDirEntry | undefined = dirEntry; entry !== undefined && !chain.includes(entry);
             entry = entry.nextDirEntry) {

            chain.push(entry);
        }
        return chain;
    }

    /**
     * Copy a sector from the overlay.
     *
     * @param sectorPosition the sector.
     * @param description what the sector is, for the error message.
     */
    private copySector(sectorPosition: SectorPosition, description: string): SectorCopy {
        const sectorData = this.overlay.readSector(sectorPosition);
        if (sectorData === undefined) {
            throw new TrsdosWriteError(`Can't read the ${description} sector`);
        }
        return {sectorPosition, bytes: new Uint8Array(sectorData.data), dirty: false};
    }

    /**
     * The working copy of a directory sector, made the first time it's asked for.
     */
    private getDirSectorCopy(sectorPosition: SectorPosition): SectorCopy {
        const key = sectorPosition.key();
        let copy = this.dirSectors.get(key);
        if (copy === undefined) {
            copy = this.copySector(sectorPosition, "directory");
            this.dirSectors.set(key, copy);
        }
        return copy;
    }

    /**
     * Delete one directory entry in memory: clear its in-use bit and its HIT byte.
     */
    private clearDirEntry(slot: TrsdosDirSlot): void {
        const {sectorPosition, offset} = this.trsdos.getDirEntryLocation(slot.hitIndex);
        const copy = this.getDirSectorCopy(sectorPosition);

        const flags = copy.bytes[offset];
        const newFlags = flags & ~FLAG_IN_USE;
        if (newFlags !== flags) {
            copy.bytes[offset] = newFlags;
            copy.dirty = true;
        }

        if (this.hit.bytes[slot.hitIndex] !== 0) {
            this.hit.bytes[slot.hitIndex] = 0;
            this.hit.dirty = true;
        }
    }

    /**
     * Free, in the GAT in memory and in {@link freeGranules}, the granules that a file's extents cover and that nothing else
     * needs: no other file that's still on the disk claims it, it isn't in the directory, and it
     * isn't locked out.
     */
    private releaseGranules(dirEntry: TrsdosDirEntry): void {
        const trsdos = this.trsdos;
        const granulesPerLump = trsdos.granulesPerLump;
        const granuleCount = trsdos.lumpCount*granulesPerLump;

        for (const extent of trsdos.getFileExtents(dirEntry)) {
            const start = extent.cylinderNumber*granulesPerLump + extent.granuleOffset;
            const end = Math.min(start + extent.granuleCount, granuleCount);
            for (let index = start; index < end; index++) {
                const granule = this.granuleMap.granules[index];
                const stillClaimed = granule.owners.some(owner => owner !== dirEntry && !this.deleted.has(owner));
                if (stillClaimed || granule.inDirectory || granule.lockedOut) {
                    continue;
                }

                // Free for the next file to be added, as well as in the GAT.
                this.freeGranules[index] = true;

                const lump = Math.floor(index/granulesPerLump);
                const bit = 1 << (index % granulesPerLump);

                if ((this.gat.bytes[lump] & bit) !== 0) {
                    this.gat.bytes[lump] &= ~bit;
                    this.gat.dirty = true;
                }
            }
        }
    }

    /**
     * Whether any of a file's granules are in the directory's range, so that the file's contents
     * include the GAT, the HIT and the directory sectors.
     */
    private coversDirectory(dirEntry: TrsdosDirEntry): boolean {
        return this.granuleMap.granules.some(granule => granule.inDirectory && granule.owners.includes(dirEntry));
    }

    /**
     * The layout and damage problems that checkTrsdos() finds, each as "kind|message", ignoring notes.
     */
    private static problemKeys(trsdos: Trsdos): Set<string> {
        const keys = new Set<string>();
        for (const finding of checkTrsdos(trsdos).findings) {
            const severity = trsdosFindingKindSeverity(finding.kind);
            if (severity === TrsdosFindingSeverity.LAYOUT || severity === TrsdosFindingSeverity.DAMAGE) {
                keys.add(finding.kind + "|" + finding.message);
            }
        }
        return keys;
    }

    /**
     * Compare the disk decoded after the change with the disk as it was, and throw if the
     * difference isn't exactly the files we deleted, added and renamed.
     */
    private verify(newTrsdos: Trsdos): void {
        // The layout.
        const oldTrsdos = this.trsdos;
        const layoutFields = [
            "version", "allocationSides", "granulesPerLump", "sectorsPerGranule", "dirLumpNumber",
            "granulesPerDir", "firstDataCylinder", "hitIgnored", "lumpCount",
        ] as const;
        for (const field of layoutFields) {
            if (oldTrsdos[field] !== newTrsdos[field]) {
                throw new TrsdosWriteError(`After the change, the disk's ${field} reads as ${newTrsdos[field]} ` +
                    `instead of ${oldTrsdos[field]}`);
            }
        }

        // The files. The expected ones are the original ones, in order, less the deleted, under their
        // new names if renamed, and the added.
        const expectedEntries = this.directory.files.filter(dirEntry => !this.deleted.has(dirEntry));
        const newEntries = newTrsdos.getDirEntries(true);
        const expectedNames = [
            ...expectedEntries.map(dirEntry => this.currentName(dirEntry)),
            ...this.added.map(addedFile => addedFile.name),
        ];
        const newNames = newEntries.map(dirEntry => dirEntry.getFilename("/"));
        for (const name of expectedNames) {
            if (!newNames.includes(name)) {
                throw new TrsdosWriteError(`After the change, ${name} is missing`);
            }
        }
        for (const name of newNames) {
            if (!expectedNames.includes(name)) {
                throw new TrsdosWriteError(`After the change, ${name} is on the disk unexpectedly`);
            }
        }
        if (expectedNames.length !== newNames.length) {
            throw new TrsdosWriteError(`After the change, the disk has ${newNames.length} files ` +
                `instead of ${expectedNames.length}`);
        }

        // Each remaining file must read as before, except for the files that cover the directory
        // (DIR/SYS), whose contents are the sectors we've just changed. Files are matched by name,
        // since a new file can take a slot between old ones, and a damaged disk can have two files
        // of the same name, which are matched in directory order.
        const newEntriesByName = new Map<string, TrsdosDirEntry[]>();
        for (const newEntry of newEntries) {
            const name = newEntry.getFilename("/");
            newEntriesByName.set(name, [...newEntriesByName.get(name) ?? [], newEntry]);
        }
        for (const expectedEntry of expectedEntries) {
            const name = this.currentName(expectedEntry);
            const newEntry = newEntriesByName.get(name)?.shift();
            if (this.coversDirectory(expectedEntry)) {
                continue;
            }
            const originalBinary = this.originalContents.get(expectedEntry);
            if (newEntry === undefined || originalBinary === undefined ||
                !bytesEqual(originalBinary, newTrsdos.readFile(newEntry))) {

                throw new TrsdosWriteError(`After the change, ${name} reads differently`);
            }
        }

        // Each added file must read back as given. Its name is unique among the others.
        for (const addedFile of this.added) {
            const newEntry = newEntriesByName.get(addedFile.name)?.shift();
            if (newEntry === undefined || !bytesEqual(addedFile.contents, newTrsdos.readFile(newEntry))) {
                throw new TrsdosWriteError(`After the change, ${addedFile.name} reads differently from what was added`);
            }
        }

        // No new problems.
        for (const key of TrsdosWriter.problemKeys(newTrsdos)) {
            if (!this.originalProblems.has(key)) {
                throw new TrsdosWriteError(`After the change, the disk has a new problem: ${key.substring(key.indexOf("|") + 1)}`);
            }
        }
    }
}
