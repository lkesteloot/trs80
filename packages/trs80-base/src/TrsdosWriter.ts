import {assertNever} from "z80-base";
import type {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos, type Trsdos, type TrsdosDirEntry, type TrsdosDirectory, type TrsdosDirSlot, TrsdosVersion} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";

/**
 * The directory entry flag that says the entry is in use. Clearing it deletes the entry.
 */
const FLAG_IN_USE = 0x10;

/**
 * The raw names of the files that can't be deleted, because the DOS needs them where they are.
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
 * Makes changes to a TRSDOS floppy: the writer's core and its first operation, deleting a file.
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
     * Whether {@link flush} has succeeded.
     */
    private flushed = false;

    /**
     * Read the disk's GAT, HIT and directory into memory, and each file's contents and the disk's
     * problems for the final comparison.
     *
     * @param trsdos the file system, whose disk must be a {@link SectorOverlay}.
     * @throws TrsdosWriteError if the disk isn't an overlay, or the GAT or HIT can't be read.
     */
    constructor(trsdos: Trsdos) {
        if (!(trsdos.disk instanceof SectorOverlay)) {
            throw new TrsdosWriteError("The disk must be a SectorOverlay to be written");
        }
        this.trsdos = trsdos;
        this.overlay = trsdos.disk;

        this.directory = trsdos.getDirectory();
        for (const slot of this.directory.slots) {
            this.slotsByEntry.set(slot.dirEntry, slot);
        }

        const granuleMap = TrsdosGranuleMap.make(trsdos, this.directory.files);
        if (typeof granuleMap === "string") {
            throw new TrsdosWriteError(granuleMap);
        }
        this.granuleMap = granuleMap;

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
     * Find a file by name in the writer's directory, ignoring files it has deleted.
     *
     * @param name the name with a slash before the extension, as {@link TrsdosDirEntry.getFilename}
     * gives it, such as "HELLO/BAS". The case doesn't matter.
     * @return the file's primary entry, or undefined if there's no such file.
     */
    public findFile(name: string): TrsdosDirEntry | undefined {
        const upperName = name.toUpperCase();
        return this.directory.files.find(dirEntry =>
            !this.deleted.has(dirEntry) && dirEntry.getFilename("/").toUpperCase() === upperName);
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
        const name = dirEntry.getFilename("/");
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
        const chain: TrsdosDirEntry[] = [];
        for (let entry: TrsdosDirEntry | undefined = dirEntry; entry !== undefined && !chain.includes(entry);
             entry = entry.nextDirEntry) {

            chain.push(entry);
        }
        for (const entry of chain) {
            const slot = this.slotsByEntry.get(entry);
            if (slot === undefined) {
                throw new TrsdosWriteError(`${name} has a directory entry that can't be found`);
            }
            this.clearDirEntry(slot);
        }

        this.freeGranules(dirEntry);
        this.deleted.add(dirEntry);
    }

    /**
     * Whether anything has been changed in memory since the writer was made, not counting changes
     * that put a byte back to what it was.
     */
    public hasChanges(): boolean {
        return this.gat.dirty || this.hit.dirty || [...this.dirSectors.values()].some(copy => copy.dirty);
    }

    /**
     * Write the changed sectors to the overlay, decode the overlay again, and verify the result:
     * it must have the same layout, hold the files it had before less the deleted ones, read every
     * remaining file exactly as before (except any file that includes the directory sectors), and
     * have no layout or damage problem it didn't have. With no changes, nothing is written and the
     * result is verified all the same.
     *
     * @return the file system decoded from the changed overlay.
     * @throws TrsdosWriteError if the result differs from what was intended. The overlay then holds
     * the change, and the caller must discard it.
     */
    public flush(): Trsdos {
        this.checkNotFlushed();

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
     * Delete one directory entry in memory: clear its in-use bit and its HIT byte.
     */
    private clearDirEntry(slot: TrsdosDirSlot): void {
        const {sectorPosition, offset} = this.trsdos.getDirEntryLocation(slot.hitIndex);
        const key = sectorPosition.key();
        let copy = this.dirSectors.get(key);
        if (copy === undefined) {
            copy = this.copySector(sectorPosition, "directory");
            this.dirSectors.set(key, copy);
        }

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
     * Free, in the GAT in memory, the granules that a file's extents cover and that nothing else
     * needs: no other file that's still on the disk claims it, it isn't in the directory, and it
     * isn't locked out.
     */
    private freeGranules(dirEntry: TrsdosDirEntry): void {
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
     * difference isn't exactly the files we deleted.
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

        // The files. The expected ones are the original ones, in order, less the deleted.
        const expectedEntries = this.directory.files.filter(dirEntry => !this.deleted.has(dirEntry));
        const newEntries = newTrsdos.getDirEntries(true);
        const expectedNames = expectedEntries.map(dirEntry => dirEntry.getFilename("/"));
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
            const name = expectedEntry.getFilename("/");
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

        // No new problems.
        for (const key of TrsdosWriter.problemKeys(newTrsdos)) {
            if (!this.originalProblems.has(key)) {
                throw new TrsdosWriteError(`After the change, the disk has a new problem: ${key.substring(key.indexOf("|") + 1)}`);
            }
        }
    }
}
