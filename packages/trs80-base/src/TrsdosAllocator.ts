import {assertNever} from "z80-base";
import {TrsdosVersion} from "./Trsdos.js";
import type {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";

/**
 * A maximal sequence of consecutive free granules.
 */
export interface GranuleRun {
    /**
     * The linear index of the first granule, lump*granulesPerLump + granule.
     */
    start: number;

    /**
     * The number of granules in the run.
     */
    count: number;
}

/**
 * The granules to give a file in one directory extent. The count may run past the end of the
 * start lump, into the next ones, as the decoder and {@link Trsdos.logicalToPhysical} allow.
 */
export interface AllocatedExtent {
    /**
     * The lump (the cylinder, where lumps are cylinders) that the extent starts in.
     */
    lump: number;

    /**
     * The first granule within the lump.
     */
    granuleOffset: number;

    /**
     * The number of granules.
     */
    granuleCount: number;
}

/**
 * The most granules that one directory extent can hold. The 2.3 family stores the count less one in
 * five bits, so 32; TRSDOS 1.3 and 2.7 store the count itself in five bits, so 31. (This is what
 * the decoder reads: see "Directory entries (2.3 family)" in FLOPPY_FORMATS.md and the
 * TRSDOS 1.3 entry layout.)
 */
export function maxGranulesPerExtent(version: TrsdosVersion): number {
    switch (version) {
        case TrsdosVersion.V2_3:
            return 32;

        case TrsdosVersion.V1_3:
        case TrsdosVersion.V2_7:
            return 31;

        default:
            assertNever(version);
    }
}

/**
 * Whether each granule of the disk could be handed out, by linear index (lump*granulesPerLump +
 * granule): the GAT says it's free, no file claims it, it isn't in the directory, and it isn't
 * locked out. See {@link TrsdosGranule.isFree}.
 */
export function freeGranuleFlags(map: TrsdosGranuleMap): boolean[] {
    return map.granules.map(granule => granule.isFree());
}

/**
 * Find the maximal runs of consecutive free granules, in disk order.
 *
 * @param free whether each granule is free, by linear index.
 */
export function findFreeRuns(free: boolean[]): GranuleRun[] {
    const runs: GranuleRun[] = [];
    let current: GranuleRun | undefined = undefined;
    for (let i = 0; i < free.length; i++) {
        if (free[i]) {
            if (current === undefined) {
                current = {start: i, count: 1};
                runs.push(current);
            } else {
                current.count++;
            }
        } else {
            current = undefined;
        }
    }
    return runs;
}

/**
 * Choose the granules for a new file. No DOS cares which granules a file gets, so the choice is
 * deterministic and as unfragmented as the free space allows:
 *
 * - An empty file gets no granules.
 * - If some run of free granules holds the whole file, the smallest such run is used (the lowest
 *   one on ties), from its start.
 * - Otherwise the largest runs are used first (the lowest on ties) until the file is covered, and
 *   the last run contributes only what's still needed. The extents are in disk order.
 * - A run longer than one extent can hold is split into several extents.
 *
 * Runs continue across lump boundaries, since an extent's count runs on into the next lump.
 *
 * @param free whether each granule is free, by linear index (see {@link freeGranuleFlags}).
 * @param granulesPerLump the number of granules in a lump.
 * @param needed the number of granules the file needs.
 * @param maxGranulesPerExtent the most granules in one extent (see {@link maxGranulesPerExtent}).
 * @param maxExtents the most extents the caller can record for the file.
 * @return the extents, in disk order, or a message saying why the file doesn't fit.
 */
export function allocateGranules(free: boolean[], granulesPerLump: number, needed: number,
                                 maxGranulesPerExtent: number, maxExtents: number): AllocatedExtent[] | string {

    if (needed === 0) {
        return [];
    }

    const runs = findFreeRuns(free);
    const freeCount = runs.reduce((sum, run) => sum + run.count, 0);
    if (freeCount < needed) {
        return `Not enough room: the file needs ${needed} granules and the disk has ${freeCount} free`;
    }

    // The runs to use, each possibly cut short.
    let chosen: GranuleRun[];
    let bestFit: GranuleRun | undefined = undefined;
    for (const run of runs) {
        // Runs are in disk order, so the strict comparison keeps the lowest one on ties.
        if (run.count >= needed && (bestFit === undefined || run.count < bestFit.count)) {
            bestFit = run;
        }
    }
    if (bestFit !== undefined) {
        chosen = [{start: bestFit.start, count: needed}];
    } else {
        // Largest first. The sort is stable, so equal runs stay in disk order.
        const bySize = [...runs].sort((a, b) => b.count - a.count);
        chosen = [];
        let remaining = needed;
        for (const run of bySize) {
            if (remaining <= 0) {
                break;
            }
            const count = Math.min(run.count, remaining);
            chosen.push({start: run.start, count});
            remaining -= count;
        }
        chosen.sort((a, b) => a.start - b.start);
    }

    const extents: AllocatedExtent[] = [];
    for (const run of chosen) {
        for (let offset = 0; offset < run.count; offset += maxGranulesPerExtent) {
            const start = run.start + offset;
            extents.push({
                lump: Math.floor(start/granulesPerLump),
                granuleOffset: start % granulesPerLump,
                granuleCount: Math.min(maxGranulesPerExtent, run.count - offset),
            });
        }
    }

    if (extents.length > maxExtents) {
        return `The free space is too fragmented: the file would need ${extents.length} extents and can have at most ${maxExtents}`;
    }

    return extents;
}
