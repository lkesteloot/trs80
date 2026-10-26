import {assertNever, toHexByte, word} from "z80-base";
import type {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {
    decodeDirEntry, decodeTrsdos, encodeTrsdos23DirEntry, encodeTrsdos23ExtendedDirEntry, hashForFilename,
    hashTrsdosPassword, TRSDOS_BLANK_PASSWORD_HASH, type Trsdos, type Trsdos23TimeStamp, trsdos23TimeStampToWord,
    type TrsdosDirEntry, type TrsdosDirectory, type TrsdosDirSlot, TrsdosProtectionLevel, TrsdosVersion,
} from "./Trsdos.js";
import {allocateGranules, type AllocatedExtent, freeGranuleFlags, maxGranulesPerExtent} from "./TrsdosAllocator.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {chooseDirSlots} from "./TrsdosDirSlots.js";
import {trsdosFilenameToRaw, trsdosFilenameToString, type TrsdosFilename} from "./TrsdosFilename.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {
    formatTrsdosGatDate, GAT_AUTO_OFFSET, GAT_DATE_OFFSET, GAT_NAME_OFFSET, GAT_PASSWORD_OFFSET, GAT_TEXT_LENGTH,
    GAT_MEDIA_BLOCK_OFFSET, gatHasMediaBlock, isTrsdosSystemInformationSector, readTrsdosDiskInfo, SYSINFO_AUTO_LENGTH, SYSINFO_AUTO_OFFSET,
    type TrsdosDiskInfo, trsdosGatDateYearRange, trsdosKeepsAutoInSystemInformation, trsdosSystemInformationPosition,
} from "./TrsdosDiskInfo.js";
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
 * The bits of a directory entry's byte 0 that hold the protection level.
 */
const PROTECTION_LEVEL_MASK = 0x07;

/**
 * Byte 1 of an LDOS-line entry: the bits that {@link TrsdosWriter.setAttributes} keeps when it changes the
 * date, which are the bit that says the file was CREATEd (bit 7), the modified bit (bit 6), and the bit
 * that says the file is open (bit 5). The rest of the byte is the date-not-set bit and the month.
 */
const BYTE1_KEPT_BITS = 0xE0;

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
 * What {@link TrsdosWriter.setAttributes} changes. A field that's undefined is left as it is.
 */
export interface TrsdosAttributeChanges {
    /**
     * Whether to hide the file from directory listings.
     */
    invisible?: boolean | undefined;

    /**
     * Whether to make the file a system file. BOOT/SYS and DIR/SYS can't change.
     */
    system?: boolean | undefined;

    /**
     * The protection level, which is what the file's access password lets a user do.
     */
    protectionLevel?: TrsdosProtectionLevel | undefined;

    /**
     * The update (owner) password, which always allows full access; empty for none.
     */
    updatePassword?: string | undefined;

    /**
     * The access (user) password, which allows access up to the protection level; empty for none. Disks
     * with time stamps (LDOS 5.3 and LS-DOS 6.3) don't have it.
     */
    accessPassword?: string | undefined;

    /**
     * The date to record, in local time, or null to record none. Only the LDOS line of DOSes has file dates.
     */
    date?: Date | null | undefined;
}

/**
 * What {@link TrsdosWriter.setDiskInfo} changes. A field that's undefined is left as it is.
 */
export interface TrsdosDiskInfoChanges {
    /**
     * The disk's name, up to eight characters. See {@link TrsdosWriter.setDiskInfo} for what is accepted.
     */
    name?: string | undefined;

    /**
     * The disk's date, in local time, which the DOS stores as MM/DD/YY.
     */
    date?: Date | undefined;

    /**
     * The master password, up to eight letters and digits starting with a letter; empty for a blank one.
     */
    masterPassword?: string | undefined;

    /**
     * The AUTO command, which the DOS runs when it boots; empty for none.
     */
    autoCommand?: string | undefined;
}

/**
 * The date fields of a directory entry as the decoder reads them.
 */
interface ExpectedDate {
    /**
     * The month, 0 for none.
     */
    month: number;

    /**
     * The day, 0 for none.
     */
    day: number;

    /**
     * The year, or undefined if the decoder reads none.
     */
    year: number | undefined;

    /**
     * The hour, or undefined if the entry has no time stamp.
     */
    hour: number | undefined;

    /**
     * The minute, or undefined if the entry has no time stamp.
     */
    minute: number | undefined;
}

/**
 * What the decoded primary entry of a file must read as after {@link TrsdosWriter.setAttributes}
 * has changed it, kept for the final verification.
 */
interface AttributeExpectation {
    /**
     * Byte 0, of which the low seven bits are compared.
     */
    flags: number;

    /**
     * The update password hash.
     */
    updatePassword: number | undefined;

    /**
     * The access password hash as the decoder reads it, which is undefined when the entry holds a time
     * stamp. Null if we don't know how the decoder will read it, so it isn't checked.
     */
    accessPassword: number | undefined | null;

    /**
     * The date fields, or null if we don't know how the decoder will read them, so they aren't checked.
     */
    date: ExpectedDate | null;
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
 * and renaming files and changing their attributes.
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
     * The working copy of the system information sector (cylinder 0, sector 2), made the first time
     * {@link setDiskInfo} changes an AUTO command that TRSDOS 6 keeps there.
     */
    private sysInfo: SectorCopy | undefined = undefined;

    /**
     * What the disk's name, date, master password and AUTO command must read as after {@link setDiskInfo}
     * has changed them, or undefined if it hasn't.
     */
    private expectedDiskInfo: TrsdosDiskInfo | undefined = undefined;

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
     * What each primary entry that {@link setAttributes} has changed must read as afterwards.
     */
    private readonly attributeExpectations = new Map<TrsdosDirEntry, AttributeExpectation>();

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
     * Change a file's attributes: the invisible and system flags, the protection level, the update and access
     * passwords, and the date. Only what's given changes, and only in the file's primary entry (extended
     * entries have no attributes). Nothing reaches the overlay until {@link flush}. If this throws, the writer is
     * as it was before the call.
     *
     * Only TRSDOS 2.3 layouts are supported for now, and not under TRSDOS 1.3 rules. BOOT/SYS and DIR/SYS can't
     * change between system and user file, but their other attributes can change.
     *
     * Dates are only stored by the LDOS line. A date on another DOS is an error here, unlike in
     * {@link addFile}, since a date is all that the caller asked for. Changing the date keeps the entry's other
     * flag bits in byte 1, including the "modified since backup" bit: the file's contents didn't change, so
     * it doesn't need backing up again. On LDOS 5.3 and LS-DOS 6.3 disks the time stamp takes the place of the access
     * password, so those disks can't have an access password set, can't date a system file (whose dates the
     * decoder ignores), and keep a password that is there rather than overwrite it with a time stamp. Clearing the date
     * there puts back the blank access password.
     *
     * @param dirEntry the file's primary entry, from {@link findFile} or the writer's directory.
     * @param changes what to change.
     * @throws TrsdosWriteError if the attributes can't be changed.
     */
    public setAttributes(dirEntry: TrsdosDirEntry, changes: TrsdosAttributeChanges): void {
        this.checkNotFlushed();
        const trsdos = this.trsdos;
        const name = this.currentName(dirEntry);
        if (!this.directory.files.includes(dirEntry)) {
            throw new TrsdosWriteError(`${name} isn't a file in this directory`);
        }
        if (this.deleted.has(dirEntry)) {
            throw new TrsdosWriteError(`${name} has been deleted`);
        }
        const slot = this.slotsByEntry.get(dirEntry);
        if (slot === undefined) {
            throw new TrsdosWriteError(`${name} is a system file that TRSDOS 1.3 doesn't list in its directory, ` +
                `so its attributes can't be changed`);
        }

        switch (trsdos.version) {
            case TrsdosVersion.V2_3:
                break;

            case TrsdosVersion.V1_3:
                throw new TrsdosWriteError("Changing attributes isn't supported yet on TRSDOS 1.3 disks");

            case TrsdosVersion.V2_7:
                throw new TrsdosWriteError("Changing attributes isn't supported yet on TRSDOS 2.7 disks");

            default:
                assertNever(trsdos.version);
        }
        switch (this.ruleSet) {
            case TrsdosRuleSet.TRSDOS_2:
            case TrsdosRuleSet.LDOS_5:
            case TrsdosRuleSet.TRSDOS_6:
            case TrsdosRuleSet.DOSPLUS:
                break;

            case TrsdosRuleSet.TRSDOS_1_3:
                throw new TrsdosWriteError("Changing attributes isn't supported yet on TRSDOS 1.3 disks");

            default:
                assertNever(this.ruleSet);
        }

        // Work on a copy of the entry, so that a refusal leaves the writer as it was.
        const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
        const dirCopy = this.getDirSectorCopy(sectorPosition);
        const entryLength = trsdos.dirEntryLength;
        const bytes = dirCopy.bytes.slice(offset, offset + entryLength);
        const current = decodeDirEntry(bytes, trsdos.geometry, trsdos.version, this.hit.bytes[slot.hitIndex],
            trsdos.hasTimeStamps);
        if (current === undefined || typeof current === "string") {
            throw new TrsdosWriteError(`${name} has a directory entry that can't be read`);
        }
        // A copy, so that a refusal below leaves the expectation as it was.
        const expected: AttributeExpectation = {...this.attributeExpectations.get(dirEntry) ?? {
            flags: current.flags,
            updatePassword: current.updatePassword,
            accessPassword: current.accessPassword,
            date: {month: current.month, day: current.day, year: current.year, hour: current.hour, minute: current.minute},
        }};

        // Byte 0.
        let flags = bytes[0];
        if (changes.invisible !== undefined) {
            flags = changes.invisible ? flags | FLAG_INVISIBLE : flags & ~FLAG_INVISIBLE;
        }
        const wasSystem = (flags & FLAG_SYSTEM) !== 0;
        if (changes.system !== undefined && changes.system !== wasSystem) {
            if (PROTECTED_RAW_FILENAMES.includes(dirEntry.rawFilename)) {
                throw new TrsdosWriteError(`${name} can't become ${wasSystem ? "a user" : "a system"} file: ` +
                    `the DOS needs it as it is`);
            }
            flags = changes.system ? flags | FLAG_SYSTEM : flags & ~FLAG_SYSTEM;
        }
        const isSystem = (flags & FLAG_SYSTEM) !== 0;
        if (changes.protectionLevel !== undefined) {
            const level: number = changes.protectionLevel;
            if (!Number.isInteger(level) || level < TrsdosProtectionLevel.FULL || level > TrsdosProtectionLevel.NO_ACCESS) {
                throw new TrsdosWriteError(`${level} isn't a protection level; use 0 to 7`);
            }
            flags = (flags & ~PROTECTION_LEVEL_MASK) | level;
        }
        bytes[0] = flags;
        expected.flags = flags;

        // The passwords, bytes 16-19.
        if (changes.updatePassword !== undefined) {
            const hash = TrsdosWriter.hashPassword(changes.updatePassword);
            bytes[16] = hash & 0xFF;
            bytes[17] = hash >> 8;
        }
        expected.updatePassword = word(bytes[17], bytes[16]);
        if (changes.accessPassword !== undefined) {
            if (trsdos.hasTimeStamps) {
                throw new TrsdosWriteError(`Can't set the access password of ${name}: entries on this disk keep ` +
                    `a time stamp where the access password would go`);
            }
            const hash = TrsdosWriter.hashPassword(changes.accessPassword);
            bytes[18] = hash & 0xFF;
            bytes[19] = hash >> 8;
            expected.accessPassword = hash;
        }

        // The date, bytes 1-2, and the time stamp in bytes 18-19 if the disk has them.
        if (changes.date !== undefined) {
            switch (this.ruleSet) {
                case TrsdosRuleSet.TRSDOS_2:
                case TrsdosRuleSet.DOSPLUS:
                    throw new TrsdosWriteError(`Can't set the date of ${name}: ` +
                        `${trsdosRuleSetToString(this.ruleSet)} disks don't store file dates`);

                case TrsdosRuleSet.LDOS_5:
                case TrsdosRuleSet.TRSDOS_6:
                    break;

                default:
                    // TRSDOS 1.3 rules were refused above.
                    assertNever(this.ruleSet);
            }

            const date = changes.date;
            const datePart = this.makeDateFields(date === null ? undefined : date);
            if (trsdos.hasTimeStamps) {
                if (isSystem) {
                    throw new TrsdosWriteError(`Can't set the date of ${name}: system files have no dates on this disk`);
                }
                if (datePart.timeStamp !== undefined) {
                    if (current.accessPassword !== undefined && current.accessPassword !== TRSDOS_BLANK_PASSWORD_HASH) {
                        throw new TrsdosWriteError(`Can't set the date of ${name}: its access password bytes hold ` +
                            `something other than a time stamp, which the time stamp would replace`);
                    }
                    const stamp = trsdos23TimeStampToWord(datePart.timeStamp);
                    if (stamp === TRSDOS_BLANK_PASSWORD_HASH) {
                        throw new TrsdosWriteError(`Can't set the date of ${name} to that time: its time stamp ` +
                            `would read as a blank access password`);
                    }
                    bytes[18] = stamp >> 8;
                    bytes[19] = stamp & 0xFF;
                    expected.accessPassword = undefined;
                } else if (current.accessPassword === undefined) {
                    // Take the time stamp out, leaving the old style of entry with no password.
                    bytes[18] = TRSDOS_BLANK_PASSWORD_HASH & 0xFF;
                    bytes[19] = TRSDOS_BLANK_PASSWORD_HASH >> 8;
                    expected.accessPassword = TRSDOS_BLANK_PASSWORD_HASH;
                }
            }
            bytes[1] = (bytes[1] & BYTE1_KEPT_BITS) | (datePart.byte1 & ~BYTE1_KEPT_BITS & 0xFF);
            bytes[2] = datePart.byte2;
            expected.date = date === null ?
                {month: 0, day: 0, year: FIRST_YEAR, hour: undefined, minute: undefined} :
                {
                    month: date.getMonth() + 1,
                    day: date.getDate(),
                    year: date.getFullYear(),
                    hour: datePart.timeStamp === undefined ? undefined : date.getHours(),
                    minute: datePart.timeStamp === undefined ? undefined : date.getMinutes(),
                };
        }
        if (trsdos.hasTimeStamps && isSystem !== wasSystem) {
            // The decoder reads bytes 18-19 and the year differently for system files, so we
            // can't say what it will make of them.
            expected.accessPassword = null;
            expected.date = null;
        }

        // Everything has been checked; now change the working copy.
        for (let i = 0; i < entryLength; i++) {
            if (dirCopy.bytes[offset + i] !== bytes[i]) {
                dirCopy.bytes[offset + i] = bytes[i];
                dirCopy.dirty = true;
            }
        }
        this.attributeExpectations.set(dirEntry, expected);
    }

    /**
     * Change the disk's name, date, master password and AUTO command, which are in the GAT (except the
     * AUTO command of TRSDOS 6 and LS-DOS 6, which is in the system information sector). Only what's given
     * changes. Nothing reaches the overlay until {@link flush}, which verifies that the disk reads back
     * with the new values and the old values of the rest. If this throws, the writer is as it was before the call.
     * See "The GAT's name, date and AUTO command" in FLOPPY_FORMATS.md.
     *
     * Only TRSDOS 2.3 layouts are supported for now, and not under TRSDOS 1.3 rules.
     *
     * - The name is trimmed, then must be one to eight printable ASCII characters. It's stored padded with
     *   spaces, and uppercased except on DOSPLUS, whose names are mixed case.
     * - The date's year must be one that the DOS can enter: 1980 to 1999, or to 2011 on LDOS 5.3 and LS-DOS 6.3
     *   disks (1978 to 1999 on TRSDOS 2.x).
     * - The master password is hashed like the file passwords.
     * - The AUTO command is trimmed, then must be printable ASCII, and at most 31 characters on the DOSes that
     *   keep it in the GAT (32 bytes at 0xE0 including the 0x0D terminator, fewer if the GAT ends with a media
     *   block) or 79 on TRSDOS 6 and LS-DOS 6 (80 bytes at 0x20 of the system information sector). A disk
     *   that has no such sector (one that a different formatter made) is refused. Whatever the DOS keeps
     *   elsewhere in that sector, including the DOS version banner at 0x10, stays as it is.
     *
     * @param changes what to change.
     * @throws TrsdosWriteError if the information can't be changed, or a value isn't acceptable.
     */
    public setDiskInfo(changes: TrsdosDiskInfoChanges): void {
        this.checkNotFlushed();
        const trsdos = this.trsdos;

        switch (trsdos.version) {
            case TrsdosVersion.V2_3:
                break;

            case TrsdosVersion.V1_3:
                throw new TrsdosWriteError("Changing the disk's name, date, password and AUTO command isn't " +
                    "supported yet on TRSDOS 1.3 disks");

            case TrsdosVersion.V2_7:
                throw new TrsdosWriteError("Changing the disk's name, date, password and AUTO command isn't " +
                    "supported yet on TRSDOS 2.7 disks");

            default:
                assertNever(trsdos.version);
        }
        switch (this.ruleSet) {
            case TrsdosRuleSet.TRSDOS_2:
            case TrsdosRuleSet.LDOS_5:
            case TrsdosRuleSet.TRSDOS_6:
            case TrsdosRuleSet.DOSPLUS:
                break;

            case TrsdosRuleSet.TRSDOS_1_3:
                throw new TrsdosWriteError("Changing the disk's name, date, password and AUTO command isn't " +
                    "supported yet on TRSDOS 1.3 disks");

            default:
                assertNever(this.ruleSet);
        }
        if (trsdos.geometry.modalDataSectorSize !== SECTOR_SIZE) {
            throw new TrsdosWriteError(`Changing the disk's information isn't supported on disks with ` +
                `${trsdos.geometry.modalDataSectorSize}-byte sectors`);
        }

        // What the disk reads as now, which the changes go over. A copy, so that a refusal below leaves
        // the expectation as it was.
        const current = this.expectedDiskInfo ?? readTrsdosDiskInfo(trsdos, this.ruleSet);
        if (typeof current === "string") {
            throw new TrsdosWriteError(`Can't read the disk's information: ${current}`);
        }
        const expected: TrsdosDiskInfo = {...current};
        const gatBytes = this.gat.bytes.slice();

        if (changes.name !== undefined) {
            const name = this.checkDiskName(changes.name);
            TrsdosWriter.putPaddedText(gatBytes, GAT_NAME_OFFSET, name);
            expected.name = name;
        }

        if (changes.date !== undefined) {
            const date = changes.date;
            const year = date.getFullYear();
            const range = trsdosGatDateYearRange(this.ruleSet, trsdos.hasTimeStamps);
            if (Number.isNaN(year) || year < range.first || year > range.last) {
                throw new TrsdosWriteError(`${trsdosRuleSetToString(this.ruleSet)} disks can't store the year ` +
                    `${Number.isNaN(year) ? "of that date" : year}; give a date from ${range.first} to ${range.last}`);
            }
            const dateText = formatTrsdosGatDate(date);
            TrsdosWriter.putPaddedText(gatBytes, GAT_DATE_OFFSET, dateText);
            expected.date = dateText;
        }

        if (changes.masterPassword !== undefined) {
            const hash = TrsdosWriter.hashPassword(changes.masterPassword);
            gatBytes[GAT_PASSWORD_OFFSET] = hash & 0xFF;
            gatBytes[GAT_PASSWORD_OFFSET + 1] = hash >> 8;
            expected.passwordHash = hash;
        }

        let sysInfoBytes: Uint8Array | undefined = undefined;
        if (changes.autoCommand !== undefined) {
            const command = TrsdosWriter.checkAutoCommand(changes.autoCommand);
            if (trsdosKeepsAutoInSystemInformation(this.ruleSet)) {
                const sysInfo = this.getSysInfoCopy();
                if (!isTrsdosSystemInformationSector(sysInfo.bytes)) {
                    throw new TrsdosWriteError("Can't change the AUTO command: the disk has no system " +
                        "information sector (cylinder 0, sector 2), which is where TRSDOS 6 and LS-DOS 6 keep it");
                }
                if (command.length >= SYSINFO_AUTO_LENGTH) {
                    throw new TrsdosWriteError(`The AUTO command is ${command.length} characters, but at most ` +
                        `${SYSINFO_AUTO_LENGTH - 1} fit on this disk`);
                }
                // The command and its terminator, then zeros as FORMAT leaves it.
                sysInfoBytes = sysInfo.bytes.slice();
                sysInfoBytes.fill(0, SYSINFO_AUTO_OFFSET, SYSINFO_AUTO_OFFSET + SYSINFO_AUTO_LENGTH);
                TrsdosWriter.putAutoCommand(sysInfoBytes, SYSINFO_AUTO_OFFSET, command);
            } else {
                // The field runs to the end of the sector, or to the media block if the GAT has one.
                const fieldEnd = gatHasMediaBlock(gatBytes) ? GAT_MEDIA_BLOCK_OFFSET - 1 : SECTOR_SIZE;
                const fieldLength = fieldEnd - GAT_AUTO_OFFSET;
                if (command.length >= fieldLength) {
                    throw new TrsdosWriteError(`The AUTO command is ${command.length} characters, but at most ` +
                        `${fieldLength - 1} fit on this disk`);
                }
                // The DOSes that keep it here pad with spaces, except TRSDOS 2.x, whose FORMAT leaves 0xFF.
                const filler = this.ruleSet === TrsdosRuleSet.TRSDOS_2 ? 0xFF : 0x20;
                gatBytes.fill(filler, GAT_AUTO_OFFSET, fieldEnd);
                TrsdosWriter.putAutoCommand(gatBytes, GAT_AUTO_OFFSET, command);
            }
            expected.autoCommand = command;
        }

        // Everything has been checked; now change the working copies.
        for (let i = 0; i < SECTOR_SIZE; i++) {
            if (this.gat.bytes[i] !== gatBytes[i]) {
                this.gat.bytes[i] = gatBytes[i];
                this.gat.dirty = true;
            }
        }
        if (sysInfoBytes !== undefined && this.sysInfo !== undefined) {
            for (let i = 0; i < SECTOR_SIZE; i++) {
                if (this.sysInfo.bytes[i] !== sysInfoBytes[i]) {
                    this.sysInfo.bytes[i] = sysInfoBytes[i];
                    this.sysInfo.dirty = true;
                }
            }
        }
        this.expectedDiskInfo = expected;
    }

    /**
     * Check a disk name and put it in the form that the GAT holds it as far as the decoder is concerned.
     *
     * @param name what the caller gave.
     * @return the trimmed name, in the case the DOS stores.
     * @throws TrsdosWriteError if the DOS wouldn't accept the name.
     */
    private checkDiskName(name: string): string {
        const trimmed = name.trim();
        if (trimmed === "") {
            throw new TrsdosWriteError("A disk name can't be empty");
        }
        if (trimmed.length > GAT_TEXT_LENGTH) {
            throw new TrsdosWriteError(`The disk name "${trimmed}" is too long: a name is up to ${GAT_TEXT_LENGTH} characters`);
        }
        if (!/^[\x20-\x7E]+$/.test(trimmed)) {
            throw new TrsdosWriteError(`The disk name "${trimmed}" has characters that a name can't have: ` +
                `use printable ASCII characters`);
        }
        switch (this.ruleSet) {
            case TrsdosRuleSet.DOSPLUS:
                return trimmed;

            case TrsdosRuleSet.TRSDOS_2:
            case TrsdosRuleSet.TRSDOS_1_3:
            case TrsdosRuleSet.LDOS_5:
            case TrsdosRuleSet.TRSDOS_6:
                return trimmed.toUpperCase();

            default:
                assertNever(this.ruleSet);
        }
    }

    /**
     * Check an AUTO command.
     *
     * @param command what the caller gave, empty for none.
     * @return the command without leading or trailing spaces.
     * @throws TrsdosWriteError if the command has characters that can't be typed.
     */
    private static checkAutoCommand(command: string): string {
        const trimmed = command.trim();
        if (!/^[\x20-\x7E]*$/.test(trimmed)) {
            throw new TrsdosWriteError("The AUTO command has characters that can't be stored: " +
                "use printable ASCII characters");
        }
        return trimmed;
    }

    /**
     * Write text into a fixed-width field, padded on the right with spaces.
     *
     * @param bytes the sector.
     * @param offset where the field starts.
     * @param text the text, at most {@link GAT_TEXT_LENGTH} characters.
     */
    private static putPaddedText(bytes: Uint8Array, offset: number, text: string): void {
        const padded = text.padEnd(GAT_TEXT_LENGTH, " ");
        for (let i = 0; i < GAT_TEXT_LENGTH; i++) {
            bytes[offset + i] = padded.charCodeAt(i);
        }
    }

    /**
     * Write an AUTO command and its 0x0D terminator.
     *
     * @param bytes the sector.
     * @param offset where the command goes.
     * @param command the command, printable ASCII.
     */
    private static putAutoCommand(bytes: Uint8Array, offset: number, command: string): void {
        for (let i = 0; i < command.length; i++) {
            bytes[offset + i] = command.charCodeAt(i);
        }
        bytes[offset + command.length] = 0x0D;
    }

    /**
     * The working copy of the system information sector, made the first time it's asked for.
     *
     * @throws TrsdosWriteError if the sector can't be read.
     */
    private getSysInfoCopy(): SectorCopy {
        if (this.sysInfo === undefined) {
            this.sysInfo = this.copySector(trsdosSystemInformationPosition(), "system information");
        }
        return this.sysInfo;
    }

    /**
     * Hash a password for a directory entry, turning the hash function's error into a write error.
     *
     * @param password the password, or empty for none.
     * @throws TrsdosWriteError if the DOS wouldn't accept the password.
     */
    private static hashPassword(password: string): number {
        try {
            return hashTrsdosPassword(password);
        } catch (e) {
            throw new TrsdosWriteError(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Whether anything has been changed in memory since the writer was made, not counting changes
     * that put a byte back to what it was.
     */
    public hasChanges(): boolean {
        return this.gat.dirty || this.hit.dirty || [...this.dirSectors.values()].some(copy => copy.dirty) ||
            this.sysInfo?.dirty === true || this.pendingSectors.length > 0;
    }

    /**
     * Write the changed sectors to the overlay, decode the overlay again, and verify the result:
     * it must have the same layout, hold the files it had before less the deleted ones and plus the
     * added ones, with the renamed ones under their new names, read every remaining file exactly as before (except any file that includes the
     * directory sectors), read every added file as the contents given, show the attributes
     * that {@link setAttributes} set, read the disk information that {@link setDiskInfo} set, and have no layout or damage problem it didn't have. With no changes, nothing is written and the
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
        if (this.sysInfo !== undefined) {
            copies.push(this.sysInfo);
        }
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
     * Throw if a file's entry, decoded after the change, doesn't read as {@link setAttributes} meant.
     *
     * @param name the file's name.
     * @param expected what the entry must read as.
     * @param newEntry the entry as decoded after the change.
     */
    private static verifyAttributes(name: string, expected: AttributeExpectation, newEntry: TrsdosDirEntry): void {
        if ((newEntry.flags & 0x7F) !== (expected.flags & 0x7F)) {
            throw new TrsdosWriteError(`After the change, the attributes of ${name} read as 0x${toHexByte(newEntry.flags & 0x7F)} ` +
                `instead of 0x${toHexByte(expected.flags & 0x7F)}`);
        }
        if (newEntry.updatePassword !== expected.updatePassword) {
            throw new TrsdosWriteError(`After the change, the update password of ${name} reads differently`);
        }
        if (expected.accessPassword !== null && newEntry.accessPassword !== expected.accessPassword) {
            throw new TrsdosWriteError(`After the change, the access password of ${name} reads differently`);
        }
        const date = expected.date;
        if (date !== null && (newEntry.month !== date.month || newEntry.day !== date.day ||
            newEntry.year !== date.year || newEntry.hour !== date.hour || newEntry.minute !== date.minute)) {

            throw new TrsdosWriteError(`After the change, the date of ${name} reads differently`);
        }
    }

    /**
     * What a file must read as after the change, given what it read as before. A file on cylinder 0
     * (BOOT/SYS) includes the system information sector, so if {@link setDiskInfo} changed that sector,
     * the file reads with the new sector in place of the old one.
     *
     * @param dirEntry the file's primary entry.
     * @param original the file's contents before the change.
     * @return the contents the file must have now.
     */
    private withSystemInformation(dirEntry: TrsdosDirEntry, original: Uint8Array): Uint8Array {
        if (this.sysInfo === undefined || !this.sysInfo.dirty) {
            return original;
        }
        const key = this.sysInfo.sectorPosition.key();
        const index = this.trsdos.getFileSectorPositions(dirEntry).findIndex(position => position.key() === key);
        if (index < 0 || index*SECTOR_SIZE >= original.length) {
            return original;
        }
        const expected = original.slice();
        expected.set(this.sysInfo.bytes.subarray(0, Math.min(SECTOR_SIZE, original.length - index*SECTOR_SIZE)),
            index*SECTOR_SIZE);
        return expected;
    }

    /**
     * Throw if the disk's name, date, master password and AUTO command, read after the change, aren't
     * what {@link setDiskInfo} meant them to be.
     *
     * @param newTrsdos the file system decoded after the change.
     * @param expected what the information must read as, which includes the fields that didn't change.
     */
    private verifyDiskInfo(newTrsdos: Trsdos, expected: TrsdosDiskInfo): void {
        const info = readTrsdosDiskInfo(newTrsdos, this.ruleSet);
        if (typeof info === "string") {
            throw new TrsdosWriteError(`After the change, the disk's information can't be read: ${info}`);
        }
        if (info.name !== expected.name) {
            throw new TrsdosWriteError(`After the change, the disk's name reads as "${info.name}" instead of "${expected.name}"`);
        }
        if (info.date !== expected.date) {
            throw new TrsdosWriteError(`After the change, the disk's date reads as "${info.date}" instead of "${expected.date}"`);
        }
        if (info.passwordHash !== expected.passwordHash) {
            throw new TrsdosWriteError("After the change, the disk's master password reads differently");
        }
        if (info.autoCommand !== expected.autoCommand) {
            throw new TrsdosWriteError(`After the change, the disk's AUTO command reads as "${info.autoCommand}" ` +
                `instead of "${expected.autoCommand}"`);
        }
    }

    /**
     * Compare the disk decoded after the change with the disk as it was, and throw if the
     * difference isn't exactly the files we deleted, added, renamed and changed the attributes of.
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
            const attributes = this.attributeExpectations.get(expectedEntry);
            if (attributes !== undefined && newEntry !== undefined) {
                TrsdosWriter.verifyAttributes(name, attributes, newEntry);
            }
            if (this.coversDirectory(expectedEntry)) {
                continue;
            }
            const originalBinary = this.originalContents.get(expectedEntry);
            const expectedBinary = originalBinary === undefined ? undefined :
                this.withSystemInformation(expectedEntry, originalBinary);
            if (newEntry === undefined || expectedBinary === undefined ||
                !bytesEqual(expectedBinary, newTrsdos.readFile(newEntry))) {

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

        // The disk's name, date, master password and AUTO command.
        if (this.expectedDiskInfo !== undefined) {
            this.verifyDiskInfo(newTrsdos, this.expectedDiskInfo);
        }

        // No new problems.
        for (const key of TrsdosWriter.problemKeys(newTrsdos)) {
            if (!this.originalProblems.has(key)) {
                throw new TrsdosWriteError(`After the change, the disk has a new problem: ${key.substring(key.indexOf("|") + 1)}`);
            }
        }
    }
}
