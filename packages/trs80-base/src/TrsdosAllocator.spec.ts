import {describe, expect, it} from "vitest";
import {decodeTrsdos, type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {allocateGranules, freeGranuleFlags, maxGranulesPerExtent} from "./TrsdosAllocator.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {makeTrsdos23TestDisk} from "./TrsdosTestDisk.js";

/**
 * Make free flags from a picture: "." is a free granule and anything else is used.
 */
function flags(picture: string): boolean[] {
    return [...picture].map(c => c === ".");
}

/**
 * Allocate with two granules per lump, no real limit on the extent size, and plenty of extents,
 * and show each extent as "lump:granuleOffset+granuleCount".
 */
function allocate(picture: string, needed: number): string[] | string {
    const result = allocateGranules(flags(picture), 2, needed, 32, 100);
    return typeof result === "string" ? result : result.map(e => `${e.lump}:${e.granuleOffset}+${e.granuleCount}`);
}

/**
 * Make a decoded test disk.
 */
function makeTrsdos(...args: Parameters<typeof makeTrsdos23TestDisk>): Trsdos {
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk(...args));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return trsdos;
}

describe("allocateGranules", () => {
    it("gives an empty file no granules", () => {
        expect(allocate("....", 0)).to.eql([]);
        expect(allocate("", 0)).to.eql([]);
    });

    it("prefers an exact-fit run over a larger one", () => {
        // Runs of 4 at 0 and 3 at 5: a file of 3 takes the smaller, which starts at granule 5.
        expect(allocate("....#...#", 3)).to.eql(["2:1+3"]);
        // Runs of 3 at 0 and 4 at 4: the smaller comes first.
        expect(allocate("...#....#", 3)).to.eql(["0:0+3"]);
    });

    it("takes the smallest run that holds the file", () => {
        // Runs of 6 (at 0), 4 (at 7), 5 (at 12); a file of 4 takes the 4, a file of 5 the 5.
        const picture = "......#....#.....";
        expect(allocate(picture, 4)).to.eql(["3:1+4"]);
        expect(allocate(picture, 5)).to.eql(["6:0+5"]);
        expect(allocate(picture, 6)).to.eql(["0:0+6"]);
        // A smaller file still takes the first granules of the smallest run that holds it.
        expect(allocate(picture, 2)).to.eql(["3:1+2"]);
    });

    it("takes the lowest run on ties", () => {
        expect(allocate("...#...", 3)).to.eql(["0:0+3"]);
        expect(allocate("#...#...", 2)).to.eql(["0:1+2"]);
    });

    it("lets an extent span lump boundaries", () => {
        // Granules 7 through 10: lump 3 granule 1 through lump 5 granule 0.
        const picture = "#######....#";
        expect(allocate(picture, 4)).to.eql(["3:1+4"]);
    });

    it("uses the largest runs first, in disk order, when none holds the file", () => {
        // Runs: 2 at 0, 5 at 3, 3 at 9, 4 at 13. A file of 8 takes 5 and then 4 (using 3 of it).
        const picture = "..#.....#...#....";
        expect(allocate(picture, 8)).to.eql(["1:1+5", "6:1+3"]);
        // A file of 12 takes 5, 4, and 3, all of it.
        expect(allocate(picture, 12)).to.eql(["1:1+5", "4:1+3", "6:1+4"]);
    });

    it("takes the lowest of equal runs when taking largest first", () => {
        // Runs of 3 at 0, 3 at 4, 3 at 8, and a file of 7: the first two in full, then one from the third.
        expect(allocate("...#...#...", 7)).to.eql(["0:0+3", "2:0+3", "4:0+1"]);
    });

    it("splits runs longer than the extent limit", () => {
        const free = new Array<boolean>(80).fill(true);
        const result = allocateGranules(free, 2, 70, 32, 100);
        expect(result).to.eql([
            {lump: 0, granuleOffset: 0, granuleCount: 32},
            {lump: 16, granuleOffset: 0, granuleCount: 32},
            {lump: 32, granuleOffset: 0, granuleCount: 6},
        ]);

        const result31 = allocateGranules(free, 2, 70, 31, 100);
        expect(result31).to.eql([
            {lump: 0, granuleOffset: 0, granuleCount: 31},
            {lump: 15, granuleOffset: 1, granuleCount: 31},
            {lump: 31, granuleOffset: 0, granuleCount: 8},
        ]);
    });

    it("reports not enough room", () => {
        expect(allocate("..#...#...", 12)).to.equal("Not enough room: the file needs 12 granules and the disk has 8 free");
        expect(allocate("", 1)).to.equal("Not enough room: the file needs 1 granules and the disk has 0 free");
    });

    it("reports free space that's too fragmented", () => {
        // Fifteen runs of one granule.
        const free = flags(".#".repeat(15));
        expect(allocateGranules(free, 2, 15, 32, 13))
            .to.equal("The free space is too fragmented: the file would need 15 extents and can have at most 13");
        // The same disk fits a file of 13.
        const result = allocateGranules(free, 2, 13, 32, 13);
        expect(typeof result).to.equal("object");
        expect((result as unknown[]).length).to.equal(13);
    });

    it("counts the split extents against the limit", () => {
        const free = new Array<boolean>(70).fill(true);
        expect(allocateGranules(free, 2, 70, 32, 2)).to.be.a("string");
        expect(allocateGranules(free, 2, 70, 32, 3)).to.be.an("array");
    });
});

describe("maxGranulesPerExtent", () => {
    it("is 32 in the 2.3 family and 31 in 1.3 and 2.7", () => {
        expect(maxGranulesPerExtent(TrsdosVersion.V2_3)).to.equal(32);
        expect(maxGranulesPerExtent(TrsdosVersion.V1_3)).to.equal(31);
        expect(maxGranulesPerExtent(TrsdosVersion.V2_7)).to.equal(31);
    });

    it("matches what the decoder reads from a directory entry", () => {
        // The builder writes the count less one, as the 2.3 family does.
        const trsdos = makeTrsdos([
            {name: "BIG/DAT", extents: [{lump: 1, granuleOffset: 0, granuleCount: 32}]},
        ]);
        const big = trsdos.findFile("BIG/DAT");
        expect(big?.extents.map(String)).to.eql(["Extent[1:0:32]"]);
        expect(big?.extents[0].granuleCount).to.equal(maxGranulesPerExtent(TrsdosVersion.V2_3));
    });
});

describe("freeGranuleFlags", () => {
    it("matches isFree() for every granule of a test disk", () => {
        const trsdos = makeTrsdos([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]},
            {name: "WORLD/TXT", extents: [{lump: 5, granuleOffset: 1, granuleCount: 3}]},
        ], {lockedOut: [20]});
        const map = TrsdosGranuleMap.make(trsdos);
        if (typeof map === "string") {
            throw new Error(map);
        }

        const free = freeGranuleFlags(map);
        expect(free.length).to.equal(70);
        expect(free).to.eql(map.granules.map(granule => granule.isFree()));

        const isFree = (lump: number, granule: number): boolean => free[lump*2 + granule];
        // The boot granule, the directory, the files' granules, and locked-out lumps aren't free.
        expect(isFree(0, 0)).to.equal(false);
        expect(isFree(0, 1)).to.equal(true);
        expect(isFree(17, 0)).to.equal(false);
        expect(isFree(17, 1)).to.equal(false);
        expect(isFree(3, 0)).to.equal(false);
        expect(isFree(3, 1)).to.equal(false);
        expect(isFree(5, 0)).to.equal(true);
        expect(isFree(5, 1)).to.equal(false);
        expect(isFree(6, 0)).to.equal(false);
        expect(isFree(6, 1)).to.equal(false);
        expect(isFree(7, 0)).to.equal(true);
        expect(isFree(20, 0)).to.equal(false);
        expect(isFree(20, 1)).to.equal(false);
        expect(free.filter(f => f).length).to.equal(map.getFreeGranuleCount());
    });
});
