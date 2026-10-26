import {assertNever} from "z80-base";
import type {Trsdos} from "./Trsdos.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";

/**
 * The number of directory sectors whose entries 0 and 1 hold system files in the 2.3 family.
 */
const SYSTEM_FILE_SECTOR_COUNT = 8;

/**
 * The number of entries at the start of each of those sectors that the system files use.
 */
const SYSTEM_FILE_ENTRIES_PER_SECTOR = 2;

/**
 * The GAT byte that holds TRSDOS 6's disk flags, and the flag that marks a data disk. See "GAT bytes
 * 0xCB-0xCD" in FLOPPY_FORMATS.md.
 */
const GAT_FLAGS_OFFSET = 0xCD;
const GAT_DATA_DISK_FLAG = 0x80;

/**
 * Whether a disk's GAT says it's a TRSDOS 6 data disk (bit 7 of byte 0xCD). A GAT that can't be read
 * counts as a system disk, which reserves more slots.
 */
function isTrsdos6DataDisk(trsdos: Trsdos): boolean {
    const gatSector = trsdos.disk.readSector(trsdos.getGatPosition());
    if (gatSector === undefined) {
        return false;
    }
    return ((gatSector.data[GAT_FLAGS_OFFSET] ?? 0) & GAT_DATA_DISK_FLAG) !== 0;
}

/**
 * The DECs of entries 0 and 1 of the first eight directory sectors: the 16 slots that the 2.3
 * family's system files occupy.
 */
function systemFileDecs(trsdos: Trsdos): number[] {
    const decs: number[] = [];
    for (let entryIndex = 0; entryIndex < SYSTEM_FILE_ENTRIES_PER_SECTOR; entryIndex++) {
        for (let sectorIndex = 0; sectorIndex < SYSTEM_FILE_SECTOR_COUNT; sectorIndex++) {
            decs.push(trsdos.dirEntryToHitNumber(sectorIndex, entryIndex));
        }
    }
    return decs;
}

/**
 * The directory slots (DECs) that a rule set keeps for its system files, which a user file must
 * never take. See "System files sit at fixed DECs" in the HIT section of FLOPPY_FORMATS.md.
 *
 * - TRSDOS 2.x, LDOS 5 and DOSPLUS 3: entries 0 and 1 of the first eight directory sectors (16).
 * - TRSDOS 6: those 16 on a system disk, but only DECs 0 and 1 (BOOT/SYS and DIR/SYS) on a data
 *   disk, which the GAT says with bit 7 of byte 0xCD.
 * - TRSDOS 1.3: none, since its system files aren't in the directory (see "TRSDOS 1.3 system files").
 */
export function reservedDecs(trsdos: Trsdos, ruleSet: TrsdosRuleSet): Set<number> {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.DOSPLUS:
            return new Set(systemFileDecs(trsdos));

        case TrsdosRuleSet.TRSDOS_6: {
            const dataDisk = isTrsdos6DataDisk(trsdos);
            return dataDisk ? new Set([0, 1]) : new Set(systemFileDecs(trsdos));
        }

        case TrsdosRuleSet.TRSDOS_1_3:
            return new Set();

        default:
            assertNever(ruleSet);
    }
}

/**
 * Choose directory slots for the entries of a new file: the lowest free DECs that aren't reserved.
 * (In the 2.3 family the lowest DEC is entry 2 of each directory sector in turn before entry 3 of
 * any, which is how the DOS's own search runs; in TRSDOS 1.3's dense HIT it's sector by sector.)
 *
 * A slot is free when its HIT byte is 0, in every one of these DOSes ("Deleting a file" in
 * FLOPPY_FORMATS.md). Only slots that exist are considered: entries in the directory's sectors
 * (as {@link Trsdos.getDirSectors} gives them, which excludes the 2.3 layout's sectors past
 * 32) whose DEC fits in the HIT.
 *
 * @param trsdos the file system.
 * @param ruleSet the rules the disk is written under, which say what's reserved.
 * @param hit the HIT bytes to consult, which may include changes (deletions or earlier choices)
 * that aren't on the disk yet.
 * @param count the number of entries needed.
 * @return the DECs in increasing order, or a message saying that the directory is full.
 */
export function chooseDirSlots(trsdos: Trsdos, ruleSet: TrsdosRuleSet, hit: Uint8Array,
                               count: number): number[] | string {

    const hitInfo = trsdos.getHitInfo();
    if (typeof hitInfo === "string") {
        return hitInfo;
    }
    const hitLength = Math.min(hit.length, hitInfo.hit.length);
    const reserved = reservedDecs(trsdos, ruleSet);

    const freeDecs: number[] = [];
    for (const {sectorIndex} of trsdos.getDirSectors()) {
        for (let entryIndex = 0; entryIndex < trsdos.dirEntriesPerSector; entryIndex++) {
            const dec = trsdos.dirEntryToHitNumber(sectorIndex, entryIndex);
            if (dec < hitLength && hit[dec] === 0 && !reserved.has(dec)) {
                freeDecs.push(dec);
            }
        }
    }
    freeDecs.sort((a, b) => a - b);

    if (freeDecs.length < count) {
        const entryWord = count === 1 ? "entry" : "entries";
        return `The directory is full: the file needs ${count} ${entryWord} and there are ${freeDecs.length} free`;
    }
    return freeDecs.slice(0, count);
}
