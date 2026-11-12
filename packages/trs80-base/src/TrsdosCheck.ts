import {assertNever, toHexByte} from "z80-base";
import {CMD_TRANSFER_ADDRESS, CmdLoadBlockChunk, decodeCmdProgram} from "./CmdProgram.js";
import type {FloppyFileContents} from "./FileDamage.js";
import {FloppyDisk, type SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {
    hashForFilename,
    isOldDirSysHashInAnySlot,
    type Trsdos,
    type TrsdosDirEntry,
    type TrsdosDirSlot,
} from "./Trsdos.js";
import {findUnwritableGranuleSectors} from "./TrsdosAllocator.js";
import {findDosDiskSize, findTrsdosCylinderUse} from "./TrsdosDiskSize.js";
import {type TrsdosGranule, TrsdosGranuleMap} from "./TrsdosGranuleMap.js";

/**
 * How serious a finding is, which decides what a repair or a write may do about it.
 */
export enum TrsdosFindingSeverity {
    /**
     * We may have guessed the disk's layout wrong, so nothing may write to the disk, not even a repair.
     */
    LAYOUT,

    /**
     * The layout is fine but the file system is inconsistent. A repair may fix these.
     */
    DAMAGE,

    /**
     * Normal and harmless, reported for information.
     */
    NOTE,
}

/**
 * A short lowercase name for a severity, such as "damage".
 */
export function trsdosFindingSeverityToString(severity: TrsdosFindingSeverity): string {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "layout";
        case TrsdosFindingSeverity.DAMAGE:
            return "damage";
        case TrsdosFindingSeverity.NOTE:
            return "note";
        default:
            assertNever(severity);
    }
}

/**
 * The kinds of things {@link checkTrsdos} can find.
 */
export enum TrsdosFindingKind {
    // Layout doubts.

    /** The GAT can't be read, so nothing about the granules can be checked. */
    GAT_UNREADABLE,
    /** The GAT's unused bits aren't what the DOS writes, so the granules per lump are a guess. */
    GAT_NOT_STRICT,
    /** The directory was read without its HIT, because the HIT doesn't match it. */
    HIT_IGNORED,

    // Damage.

    /** Two or more files claim the same granules. */
    SHARED_GRANULES,
    /** A file uses granules that the GAT says are free. */
    CLAIMED_BUT_FREE,
    /** A file's extent runs past the end of the disk. */
    EXTENT_OUT_OF_RANGE,
    /** A directory entry's HIT byte isn't the hash of its file's name. */
    HIT_MISMATCH,
    /** An extended directory entry that no file's chain reaches. */
    ORPHAN_EXTENDED_ENTRY,
    /** A file with missing sectors, CRC errors, or a broken chain of directory entries. */
    DAMAGED_FILE,

    // Notes.

    /** The GAT marks granules used that no file claims. */
    USED_BUT_UNCLAIMED,
    /**
     * Granules that the GAT says are free but that the image doesn't fully hold: some of their sectors
     * have no ID, no data field, or the wrong size. New files skip them, since writing them would fail.
     * See {@link findFreeButMissingGranules}.
     */
    FREE_BUT_MISSING,
    /**
     * BOOT/SYS shares granules of the boot cylinder with another file. See "BOOT/SYS overlaps SYS7/SYS
     * on LDOS 5.3.1" in FLOPPY_FORMATS.md.
     */
    BOOT_SYS_OVERLAP,
    /**
     * A program whose directory size ends before its transfer record, which is further into its last sector.
     * The DOS loads it whole, since it reads whole sectors, and many DOSes shipped files this way, so it's a
     * note, not damage. Anything that copies the file by its size gets a broken program. See "Programs that run
     * past their EOF byte" in FLOPPY_FORMATS.md.
     */
    PROGRAM_PAST_EOF,
}

/**
 * A short lowercase name for a kind of finding, such as "shared-granules".
 */
export function trsdosFindingKindToString(kind: TrsdosFindingKind): string {
    switch (kind) {
        case TrsdosFindingKind.GAT_UNREADABLE:
            return "gat-unreadable";
        case TrsdosFindingKind.GAT_NOT_STRICT:
            return "gat-not-strict";
        case TrsdosFindingKind.HIT_IGNORED:
            return "hit-ignored";
        case TrsdosFindingKind.SHARED_GRANULES:
            return "shared-granules";
        case TrsdosFindingKind.CLAIMED_BUT_FREE:
            return "claimed-but-free";
        case TrsdosFindingKind.EXTENT_OUT_OF_RANGE:
            return "extent-out-of-range";
        case TrsdosFindingKind.HIT_MISMATCH:
            return "hit-mismatch";
        case TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY:
            return "orphan-extended-entry";
        case TrsdosFindingKind.DAMAGED_FILE:
            return "damaged-file";
        case TrsdosFindingKind.PROGRAM_PAST_EOF:
            return "program-past-eof";
        case TrsdosFindingKind.USED_BUT_UNCLAIMED:
            return "used-but-unclaimed";
        case TrsdosFindingKind.FREE_BUT_MISSING:
            return "free-but-missing";
        case TrsdosFindingKind.BOOT_SYS_OVERLAP:
            return "boot-sys-overlap";
        default:
            assertNever(kind);
    }
}

/**
 * The severity of a kind of finding.
 */
export function trsdosFindingKindSeverity(kind: TrsdosFindingKind): TrsdosFindingSeverity {
    switch (kind) {
        case TrsdosFindingKind.GAT_UNREADABLE:
        case TrsdosFindingKind.GAT_NOT_STRICT:
        case TrsdosFindingKind.HIT_IGNORED:
            return TrsdosFindingSeverity.LAYOUT;
        case TrsdosFindingKind.SHARED_GRANULES:
        case TrsdosFindingKind.CLAIMED_BUT_FREE:
        case TrsdosFindingKind.EXTENT_OUT_OF_RANGE:
        case TrsdosFindingKind.HIT_MISMATCH:
        case TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY:
        case TrsdosFindingKind.DAMAGED_FILE:
            return TrsdosFindingSeverity.DAMAGE;
        case TrsdosFindingKind.USED_BUT_UNCLAIMED:
        case TrsdosFindingKind.FREE_BUT_MISSING:
        case TrsdosFindingKind.BOOT_SYS_OVERLAP:
        case TrsdosFindingKind.PROGRAM_PAST_EOF:
            return TrsdosFindingSeverity.NOTE;
        default:
            assertNever(kind);
    }
}

/**
 * One thing that {@link checkTrsdos} found.
 */
export interface TrsdosFinding {
    kind: TrsdosFindingKind;

    /**
     * A complete sentence that a user can read.
     */
    message: string;

    /**
     * The files involved (their primary entries), possibly empty. They're the same objects as in
     * {@link TrsdosCheckResult.granuleMap}'s owners.
     */
    dirEntries: TrsdosDirEntry[];

    /**
     * The granules involved, possibly empty.
     */
    granules: TrsdosGranule[];
}

/**
 * The result of {@link checkTrsdos}.
 */
export interface TrsdosCheckResult {
    /**
     * What was found, in a stable order: layout first, then damage, then notes. Within a kind, they're
     * in order of position on the disk.
     */
    findings: TrsdosFinding[];

    /**
     * The granule map the granule-based checks used, or undefined if the GAT couldn't be read.
     */
    granuleMap: TrsdosGranuleMap | undefined;
}

// The size of a sector, in bytes, in the TRSDOS family.
const SECTOR_SIZE = 256;

// The raw name of the boot file, as the directory stores it (8 + 3 characters).
const BOOT_SYS_RAW_FILENAME = "BOOT    SYS";

// The most ranges of granules to spell out in a message before saying "and N more".
const MAX_RANGES_IN_MESSAGE = 8;

/**
 * Pick the singular or plural form of a word for a count.
 */
function plural(count: number, singular: string, pluralForm: string = singular + "s"): string {
    return count === 1 ? singular : pluralForm;
}

/**
 * Format a list of granules for a message, with consecutive granules of a lump collapsed into
 * ranges: "cylinder 5, granules 0-1; cylinder 6, granule 0". The list is shortened with "and N more"
 * if it has many ranges.
 *
 * @param granules the granules, in any order.
 * @param lumpTerm "cylinder" or "lump".
 */
function formatGranules(granules: TrsdosGranule[], lumpTerm: string): string {
    const sorted = [...granules].sort((a, b) => a.lump - b.lump || a.granule - b.granule);

    // Each range is [lump, first granule, last granule].
    const ranges: [number, number, number][] = [];
    for (const granule of sorted) {
        const last = ranges[ranges.length - 1];
        if (last !== undefined && last[0] === granule.lump && last[2] + 1 === granule.granule) {
            last[2] = granule.granule;
        } else if (last === undefined || last[0] !== granule.lump || last[2] !== granule.granule) {
            ranges.push([granule.lump, granule.granule, granule.granule]);
        }
    }

    const parts = ranges.slice(0, MAX_RANGES_IN_MESSAGE).map(([lump, first, last]) => {
        const granuleText = first === last ? `granule ${first}` : `granules ${first}-${last}`;
        return `${lumpTerm} ${lump}, ${granuleText}`;
    });
    const hidden = ranges.length - parts.length;
    return parts.join("; ") + (hidden > 0 ? `; and ${hidden} more` : "");
}

/**
 * Join names for a sentence: "A", "A and B", "A, B and C".
 */
function joinNames(names: string[]): string {
    if (names.length <= 1) {
        return names.join("");
    }
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/**
 * The first granule of a list in disk order, as a sort key.
 */
function firstGranuleKey(granules: TrsdosGranule[], granulesPerLump: number): number {
    return Math.min(... granules.map(granule => granule.lump*granulesPerLump + granule.granule));
}

/**
 * Check a TRSDOS-family disk for inconsistencies, changing nothing. The findings say whether
 * the layout we decoded is in doubt (so nothing should write), what's damaged (which a repair may
 * fix), and what's merely worth knowing.
 *
 * @param trsdos the decoded file system.
 */
export function checkTrsdos(trsdos: Trsdos): TrsdosCheckResult {
    const lumpTerm = trsdos.lumpTerm;
    const findings: TrsdosFinding[] = [];
    const layoutFindings: TrsdosFinding[] = [];
    const damageFindings: TrsdosFinding[] = [];
    const noteFindings: TrsdosFinding[] = [];

    // Read the directory once so that every finding refers to the same entry objects.
    const {slots, files} = trsdos.getDirectory();
    const granuleMap = TrsdosGranuleMap.make(trsdos, files);
    const granulesPerLump = trsdos.granulesPerLump;
    const nameOf = (dirEntry: TrsdosDirEntry): string => dirEntry.getFilename("/");

    // Layout doubts.
    if (typeof granuleMap === "string") {
        const reason = granuleMap.replace(/\.$/, "");
        layoutFindings.push({
            kind: TrsdosFindingKind.GAT_UNREADABLE,
            message: `The GAT can't be read (${reason}), so the granules can't be checked.`,
            dirEntries: [],
            granules: [],
        });
    } else if (!trsdos.gatPassesStrictCheck) {
        layoutFindings.push({
            kind: TrsdosFindingKind.GAT_NOT_STRICT,
            message: `The GAT's unused bits aren't what the DOS writes, so the number of granules per ${lumpTerm} is a guess.`,
            dirEntries: [],
            granules: [],
        });
    }
    if (trsdos.hitIgnored) {
        layoutFindings.push({
            kind: TrsdosFindingKind.HIT_IGNORED,
            message: "The HIT doesn't match the directory, so files were found without it.",
            dirEntries: [],
            granules: [],
        });
    }

    // Which primary entry reaches each extended entry through its chain.
    const primaryOfExtended = findPrimariesOfExtendedEntries(files);

    // Granule-based damage.
    if (typeof granuleMap !== "string") {
        // Granules shared by the same set of files. BOOT/SYS's sharing of the boot cylinder is kept
        // apart: it's how some DOSes' system disks come, and harmless to a writer, since no file
        // ever gets a granule that any file claims.
        const fileIndexes = new Map<TrsdosDirEntry, number>(files.map((file, i) => [file, i]));
        const sharedGroups = new Map<string, { owners: TrsdosDirEntry[], granules: TrsdosGranule[], bootOverlap: boolean }>();
        for (const granule of granuleMap.getSharedGranules()) {
            const owners = [...granule.owners].sort((a, b) => (fileIndexes.get(a) ?? 0) - (fileIndexes.get(b) ?? 0));
            const bootOverlap = granule.lump === 0 && owners.some(owner => owner.rawFilename === BOOT_SYS_RAW_FILENAME);
            const key = (bootOverlap ? "boot:" : "") + owners.map(owner => fileIndexes.get(owner)).join(",");
            let group = sharedGroups.get(key);
            if (group === undefined) {
                group = {owners, granules: [], bootOverlap};
                sharedGroups.set(key, group);
            }
            group.granules.push(granule);
        }
        for (const {owners, granules, bootOverlap} of sharedGroups.values()) {
            const sharing = `${joinNames(owners.map(nameOf))} share ${granules.length} ${plural(granules.length, "granule")} ` +
                `(${formatGranules(granules, lumpTerm)})`;
            if (bootOverlap) {
                noteFindings.push({
                    kind: TrsdosFindingKind.BOOT_SYS_OVERLAP,
                    message: `${sharing} on the boot ${lumpTerm}. Some DOSes' system disks come that way, and it's ` +
                        `harmless, since no new file gets a granule that a file claims.`,
                    dirEntries: owners,
                    granules,
                });
            } else {
                damageFindings.push({
                    kind: TrsdosFindingKind.SHARED_GRANULES,
                    message: sharing + ".",
                    dirEntries: owners,
                    granules,
                });
            }
        }

        // Granules a file uses that the GAT says are free.
        const freeByFile = new Map<TrsdosDirEntry, TrsdosGranule[]>();
        for (const granule of granuleMap.getClaimedButFreeGranules()) {
            for (const owner of granule.owners) {
                const list = freeByFile.get(owner);
                if (list === undefined) {
                    freeByFile.set(owner, [granule]);
                } else {
                    list.push(granule);
                }
            }
        }
        const freeFindings: TrsdosFinding[] = [];
        for (const [dirEntry, granules] of freeByFile) {
            freeFindings.push({
                kind: TrsdosFindingKind.CLAIMED_BUT_FREE,
                message: `${nameOf(dirEntry)} uses ${granules.length} ${plural(granules.length, "granule")} ` +
                    `that the GAT says ${plural(granules.length, "is", "are")} free (${formatGranules(granules, lumpTerm)}).`,
                dirEntries: [dirEntry],
                granules,
            });
        }
        freeFindings.sort((a, b) =>
            firstGranuleKey(a.granules, granulesPerLump) - firstGranuleKey(b.granules, granulesPerLump));
        damageFindings.push(... freeFindings);

        // Extents that run off the disk.
        const outOfRange = [...granuleMap.outOfRange].sort((a, b) =>
            (a.extent.cylinderNumber*granulesPerLump + a.extent.granuleOffset) -
            (b.extent.cylinderNumber*granulesPerLump + b.extent.granuleOffset));
        for (const {dirEntry, extent} of outOfRange) {
            damageFindings.push({
                kind: TrsdosFindingKind.EXTENT_OUT_OF_RANGE,
                message: `${nameOf(dirEntry)} has an extent of ${extent.granuleCount} ` +
                    `${plural(extent.granuleCount, "granule")} starting at ${lumpTerm} ${extent.cylinderNumber}, ` +
                    `granule ${extent.granuleOffset}, which runs past the end of the disk.`,
                dirEntries: [dirEntry],
                granules: [],
            });
        }
    }

    // HIT bytes that don't match the names.
    if (!trsdos.hitIgnored) {
        for (const slot of slots) {
            const finding = checkHitByte(trsdos, slot, primaryOfExtended);
            if (finding !== undefined) {
                damageFindings.push(finding);
            }
        }
    }

    // Extended entries that no file reaches.
    for (const slot of slots) {
        const dirEntry = slot.dirEntry;
        if (dirEntry.isExtendedEntry() && !primaryOfExtended.has(dirEntry)) {
            damageFindings.push(makeOrphanFinding(slot));
        }
    }

    // Programs that run past their EOF byte, which are notes, found while reading the files.
    const programNotes: TrsdosFinding[] = [];

    // Damage found by reading the files.
    for (const file of files) {
        const contents = trsdos.readFileWithDamage(file);
        const damage = contents.damage;
        if (damage.isDamaged()) {
            damageFindings.push({
                kind: TrsdosFindingKind.DAMAGED_FILE,
                message: `${nameOf(file)} is damaged: ${damage.toString()}.`,
                dirEntries: [file],
                granules: [],
            });
        } else {
            const wholeProgram = analyzeProgramPastEof(trsdos, file, contents);
            if (wholeProgram !== undefined) {
                const size = file.getSize();
                const extra = wholeProgram.binary.length - size;
                programNotes.push({
                    kind: TrsdosFindingKind.PROGRAM_PAST_EOF,
                    message: `${nameOf(file)}'s directory gives ${size.toLocaleString()} bytes, but the program runs ` +
                        `on ${extra.toLocaleString()} ${plural(extra, "byte")} further into its last sector, to its ` +
                        `transfer record. The DOS loads it whole, but copying it by its size gives a broken program.`,
                    dirEntries: [file],
                    granules: [],
                });
            }
        }
    }

    // Notes.
    if (typeof granuleMap !== "string") {
        const unclaimed = granuleMap.getUsedButUnclaimedGranules();
        if (unclaimed.length > 0) {
            noteFindings.push({
                kind: TrsdosFindingKind.USED_BUT_UNCLAIMED,
                message: `The GAT marks ${unclaimed.length} ${plural(unclaimed.length, "granule")} used that no file claims ` +
                    `(${formatGranules(unclaimed, lumpTerm)}). That's normal for locked-out ${lumpTerm}s and ` +
                    `some DOSes' boot granules.`,
                dirEntries: [],
                granules: unclaimed,
            });
        }

        const missing = findFreeButMissingGranules(trsdos, granuleMap);
        if (missing.granules.length > 0) {
            const count = missing.granules.length;
            const one = count === 1;
            const lostBytes = count*trsdos.sectorsPerGranule*SECTOR_SIZE;
            noteFindings.push({
                kind: TrsdosFindingKind.FREE_BUT_MISSING,
                message: `The GAT says ${count} ${plural(count, "granule")} ${plural(count, "is", "are")} free ` +
                    `that the image doesn't fully hold (${formatGranules(missing.granules, lumpTerm)}): ` +
                    `${missing.sectorCount} of ${one ? "its" : "their"} sectors ` +
                    `${plural(missing.sectorCount, "is", "are")} missing or the wrong size. New files skip ` +
                    `${one ? "it" : "them"}, so ${lostBytes.toLocaleString()} bytes of the free space can't be used.`,
                dirEntries: [],
                granules: missing.granules,
            });
        }
    }

    noteFindings.push(... programNotes);

    findings.push(... layoutFindings, ... damageFindings, ... noteFindings);
    return {
        findings,
        granuleMap: typeof granuleMap === "string" ? undefined : granuleMap,
    };
}

/**
 * The free granules that the image doesn't fully hold, and so that no new file can be given, with the
 * same test the writer's allocator makes ({@link findUnwritableGranuleSectors}).
 */
export interface FreeButMissingGranules {
    /** The granules, in disk order. */
    granules: TrsdosGranule[];

    /** How many of their sectors are missing or the wrong size. */
    sectorCount: number;
}

/**
 * Find the granules that the GAT and the files leave free ({@link TrsdosGranule.isFree}) but that the
 * image doesn't fully hold: some sector has no ID, no data field, or the wrong size, so a file given the
 * granule would fail when saved. The writer's allocator skips them. Only granules inside the disk's
 * proven size count ({@link findDosDiskSize}), so a tail past the DOS's end doesn't, such as the
 * cylinders past TRSDOS 1.3's 40, whose GAT bytes are zero. Where the size isn't proven (and on hard
 * disk partitions), every granule counts.
 *
 * @param trsdos the file system.
 * @param granuleMap its granule map.
 */
export function findFreeButMissingGranules(trsdos: Trsdos, granuleMap: TrsdosGranuleMap): FreeButMissingGranules {
    const candidates: { granule: TrsdosGranule, sectors: SectorPosition[] }[] = [];
    for (const granule of granuleMap.granules) {
        if (granule.isFree()) {
            const sectors = findUnwritableGranuleSectors(trsdos, granule.lump, granule.granule);
            if (sectors.length > 0) {
                candidates.push({granule, sectors});
            }
        }
    }

    // Most disks have none, so the size is worked out only when there are some.
    let cylinderCount: number | undefined = undefined;
    const volume = trsdos.disk instanceof SectorOverlay ? trsdos.disk.base : trsdos.disk;
    if (candidates.length > 0 && volume instanceof FloppyDisk) {
        const use = findTrsdosCylinderUse(trsdos, granuleMap, volume.getGeometry().cylinderCount);
        const size = findDosDiskSize(trsdos, volume, use);
        if (typeof size !== "string") {
            cylinderCount = size.cylinderCount;
        }
    }

    const inside = candidates.filter(({granule}) => cylinderCount === undefined ||
        trsdos.getGranuleSectorPositions(granule.lump, granule.granule)
            .every(position => position.cylinderNumber < cylinderCount));
    return {
        granules: inside.map(({granule}) => granule),
        sectorCount: inside.reduce((sum, {sectors}) => sum + sectors.length, 0),
    };
}

/**
 * Make the finding for an extended directory entry that no file's chain reaches. (Exported for the repair,
 * which reports the orphans it leaves alone.)
 *
 * @param slot the orphan's slot.
 */
export function makeOrphanFinding(slot: TrsdosDirSlot): TrsdosFinding {
    return {
        kind: TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY,
        message: `The extended directory entry at DEC ${toHexByte(slot.hitIndex)} isn't part of any file.`,
        dirEntries: [slot.dirEntry],
        granules: [],
    };
}

/**
 * Find the primary entry whose chain reaches each extended entry. An extended entry that no chain
 * reaches is absent from the map (it's an orphan). One that two chains reach goes to the first file.
 *
 * @param files the primary entries.
 */
export function findPrimariesOfExtendedEntries(files: TrsdosDirEntry[]): Map<TrsdosDirEntry, TrsdosDirEntry> {
    const primaryOfExtended = new Map<TrsdosDirEntry, TrsdosDirEntry>();
    for (const file of files) {
        const visited = new Set<TrsdosDirEntry>([file]);
        let next = file.nextDirEntry;
        while (next !== undefined && !visited.has(next)) {
            visited.add(next);
            if (!primaryOfExtended.has(next)) {
                primaryOfExtended.set(next, file);
            }
            next = next.nextDirEntry;
        }
    }
    return primaryOfExtended;
}

/**
 * Compare a slot's HIT byte with the hash of its file's name. (Exported for the repair, which fixes
 * the bytes that this reports.)
 *
 * @param trsdos the file system.
 * @param slot the slot to check.
 * @param primaryOfExtended the primary entry whose chain reaches each extended entry.
 * @return a finding if the byte is wrong, or undefined if it's right or can't be checked.
 */
export function checkHitByte(trsdos: Trsdos, slot: TrsdosDirSlot,
                      primaryOfExtended: Map<TrsdosDirEntry, TrsdosDirEntry>): TrsdosFinding | undefined {

    const hitByte = slot.hitByte;
    if (hitByte === undefined || slot.nameWasBlank) {
        // Nothing to compare, or no name to hash.
        return undefined;
    }

    // An extended entry has no name; its HIT byte is the hash of its primary's name. An orphan
    // has no primary and is reported as such.
    const dirEntry = slot.dirEntry;
    const isExtended = dirEntry.isExtendedEntry();
    const primary = isExtended ? primaryOfExtended.get(dirEntry) : dirEntry;
    if (primary === undefined) {
        return undefined;
    }

    const expected = hashForFilename(primary.rawFilename);
    if (hitByte === expected || (!isExtended && isOldDirSysHashInAnySlot(trsdos.version, primary.rawFilename, hitByte))) {
        return undefined;
    }

    const subject = isExtended ? `an extended entry of ${primary.getFilename("/")}` : primary.getFilename("/");
    return {
        kind: TrsdosFindingKind.HIT_MISMATCH,
        message: `The HIT byte for ${subject} is ${toHexByte(hitByte)}, but the hash of its name is ${toHexByte(expected)}.`,
        dirEntries: [primary],
        granules: [],
    };
}

/**
 * A program whose last sector holds more of it than the directory's size says.
 */
export interface ProgramPastEof {
    /**
     * The whole program: the file's bytes followed by the rest of the program in its last sector, ending
     * with the transfer record. Its length is the program's real size.
     */
    binary: Uint8Array;
}

/**
 * Find the program that a file really is when its directory size ends before its transfer record, which
 * is further into the file's last sector, and return its bytes. See {@link findProgramPastEof} for the
 * conditions. Never reads past the file's last sector.
 *
 * @param trsdos the file system.
 * @param dirEntry the file's primary entry.
 * @param contents the file as {@link Trsdos.readFileWithDamage} gives it, if the caller has already read it.
 * @return the whole program, or undefined if the file isn't such a program.
 */
export function analyzeProgramPastEof(trsdos: Trsdos, dirEntry: TrsdosDirEntry,
                                      contents?: FloppyFileContents): ProgramPastEof | undefined {

    // A full last sector has nothing after the EOF to look at.
    const size = dirEntry.getSize();
    if (size <= 0 || size % SECTOR_SIZE === 0) {
        return undefined;
    }

    // Damaged files are reported as such.
    const fileContents = contents ?? trsdos.readFileWithDamage(dirEntry);
    if (fileContents.damage.isDamaged() || fileContents.binary.length !== size) {
        return undefined;
    }

    // The sector that holds the end of the file must be in the file, and read cleanly.
    const lastIndex = Math.floor(size/SECTOR_SIZE);
    const position = trsdos.getFileSectorPositions(dirEntry)[lastIndex];
    if (position === undefined) {
        return undefined;
    }
    const sector = trsdos.disk.readSector(position);
    if (sector === undefined || sector.crcError || sector.data.length < SECTOR_SIZE) {
        return undefined;
    }

    // The file followed by the rest of that sector.
    const whole = new Uint8Array((lastIndex + 1)*SECTOR_SIZE);
    whole.set(fileContents.binary, 0);
    whole.set(sector.data.subarray(size % SECTOR_SIZE, SECTOR_SIZE), size);

    // It must parse cleanly and end with a transfer record that's past the size.
    const program = decodeCmdProgram(whole);
    if (program === undefined || program.error !== undefined) {
        return undefined;
    }
    const lastChunk = program.chunks[program.chunks.length - 1];
    if (lastChunk === undefined || lastChunk.type !== CMD_TRANSFER_ADDRESS || program.binary.length <= size) {
        return undefined;
    }

    // The entry point must be in a load block, or the bytes may be stale ones that look like a transfer record.
    const entry = program.entryPointAddress;
    if (entry === undefined) {
        return undefined;
    }
    const entryLoaded = program.chunks.some(chunk =>
        chunk instanceof CmdLoadBlockChunk && chunk.address <= entry && entry < chunk.address + chunk.loadData.length);
    if (!entryLoaded) {
        return undefined;
    }

    return {binary: whole.slice(0, program.binary.length)};
}

/**
 * If a file is a program cut short by its EOF byte, return the program's real size. Such a program (CMD
 * format: a chain of records ending in a transfer record) has an EOF byte that's too small, so the directory's
 * size ends partway through it, while the rest of it is in the rest of the file's last sector. The DOS loads
 * it whole, but anything that honors the size gets a broken program.
 *
 * All of these must hold: the size is positive and not a multiple of the sector size; the file reads without
 * damage; its last sector is in the file and reads cleanly; the file followed by the rest of that sector parses
 * as a CMD program without error whose last record is a transfer record and whose length is greater than the
 * size; and the entry point is inside one of its load blocks.
 *
 * @param trsdos the file system.
 * @param dirEntry the file's primary entry.
 * @return the program's size in bytes, or undefined if the file isn't such a program.
 */
export function findProgramPastEof(trsdos: Trsdos, dirEntry: TrsdosDirEntry): number | undefined {
    return analyzeProgramPastEof(trsdos, dirEntry)?.binary.length;
}
