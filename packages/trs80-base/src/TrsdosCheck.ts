import {assertNever, toHexByte} from "z80-base";
import {
    hashForFilename,
    isOldDirSysHashInAnySlot,
    type Trsdos,
    type TrsdosDirEntry,
    type TrsdosDirSlot,
} from "./Trsdos.js";
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
     * BOOT/SYS shares granules of the boot cylinder with another file. See "BOOT/SYS overlaps SYS7/SYS
     * on LDOS 5.3.1" in FLOPPY_FORMATS.md.
     */
    BOOT_SYS_OVERLAP,
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
        case TrsdosFindingKind.USED_BUT_UNCLAIMED:
            return "used-but-unclaimed";
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
        case TrsdosFindingKind.BOOT_SYS_OVERLAP:
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

    // Damage found by reading the files.
    for (const file of files) {
        const damage = trsdos.readFileWithDamage(file).damage;
        if (damage.isDamaged()) {
            damageFindings.push({
                kind: TrsdosFindingKind.DAMAGED_FILE,
                message: `${nameOf(file)} is damaged: ${damage.toString()}.`,
                dirEntries: [file],
                granules: [],
            });
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
    }

    findings.push(... layoutFindings, ... damageFindings, ... noteFindings);
    return {
        findings,
        granuleMap: typeof granuleMap === "string" ? undefined : granuleMap,
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
