import {describe, expect, it} from "vitest";
import {decodeTrsdos, Trsdos, TrsdosVersion} from "./Trsdos.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile} from "./TrsdosTestDisk.js";

const BYTES_PER_GRANULE = 5*256;
// Two granules per cylinder, 35 cylinders.
const TOTAL_GRANULES = 70;
// The boot granule and both granules of the directory cylinder.
const SYSTEM_GRANULES = 3;

/**
 * Make a test disk and decode it as TRSDOS, failing the test if it doesn't.
 */
function makeTrsdos(files: TestFile[], options: TestDiskOptions = {}): Trsdos {
    const trsdos = decodeTrsdos(makeTrsdos23TestDisk(files, options));
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return trsdos;
}

/**
 * Make a test disk and its granule map, failing the test if either fails.
 */
function makeMap(files: TestFile[], options: TestDiskOptions = {}): TrsdosGranuleMap {
    const map = TrsdosGranuleMap.make(makeTrsdos(files, options));
    if (typeof map === "string") {
        throw new Error("No granule map: " + map);
    }
    return map;
}

/**
 * The "lump:granule" names of the granules, for comparing.
 */
function names(granules: { lump: number, granule: number }[]): string[] {
    return granules.map(granule => granule.lump + ":" + granule.granule);
}

describe("TrsdosTestDisk", () => {
    it("decodes as TRSDOS 2.3 with the expected layout", () => {
        const trsdos = makeTrsdos([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000, data: 0x11},
            {name: "WORLD/TXT", extents: [{lump: 5, granuleOffset: 0, granuleCount: 1}, {lump: 8, granuleOffset: 1, granuleCount: 1}], data: 0x22},
        ]);

        expect(trsdos.version).to.equal(TrsdosVersion.V2_3);
        expect(trsdos.dirLumpNumber).to.equal(17);
        expect(trsdos.granulesPerLump).to.equal(2);
        expect(trsdos.sectorsPerGranule).to.equal(5);
        expect(trsdos.allocationSides).to.equal(1);
        expect(trsdos.lumpCount).to.equal(35);

        const names = trsdos.getDirEntries(true).map(entry => entry.getFilename("/")).sort();
        expect(names).to.eql(["BOOT/SYS", "DIR/SYS", "HELLO/BAS", "WORLD/TXT"]);
        expect(trsdos.getDirEntries(false).map(entry => entry.getFilename("/")).sort())
            .to.eql(["HELLO/BAS", "WORLD/TXT"]);

        const hello = trsdos.findFile("HELLO/BAS");
        expect(hello?.getSize()).to.equal(1000);
        expect(trsdos.readFile(hello!)).to.eql(new Uint8Array(1000).fill(0x11));
        const world = trsdos.findFile("WORLD/TXT");
        expect(world?.getSize()).to.equal(2*BYTES_PER_GRANULE);
        expect(trsdos.readFile(world!)).to.eql(new Uint8Array(2*BYTES_PER_GRANULE).fill(0x22));

        const boot = trsdos.findFile("BOOT/SYS");
        expect(boot?.isSystemFile()).to.equal(true);
        expect(boot?.isHidden()).to.equal(true);
        expect(boot?.extents.map(String)).to.eql(["Extent[0:0:1]"]);
        expect(trsdos.findFile("DIR/SYS")?.extents.map(String)).to.eql(["Extent[17:0:2]"]);
    });
});

describe("TrsdosGranuleMap", () => {
    it("counts free granules and bytes", () => {
        const map = makeMap([
            {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]},
            {name: "WORLD/TXT", extents: [{lump: 5, granuleOffset: 1, granuleCount: 3}]},
        ]);

        expect(map.granules.length).to.equal(TOTAL_GRANULES);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 5);
        expect(map.getFreeByteCount()).to.equal((TOTAL_GRANULES - SYSTEM_GRANULES - 5)*BYTES_PER_GRANULE);
        expect(map.outOfRange).to.eql([]);
        expect(map.getSharedGranules()).to.eql([]);
        expect(map.getClaimedButFreeGranules()).to.eql([]);
        expect(map.getUsedButUnclaimedGranules()).to.eql([]);
    });

    it("describes each granule", () => {
        const map = makeMap([{name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]}]);

        expect(map.get(3, 0)?.owners.map(entry => entry.getFilename("/"))).to.eql(["HELLO/BAS"]);
        expect(map.get(3, 0)?.gatUsed).to.equal(true);
        expect(map.get(3, 0)?.isFree()).to.equal(false);
        expect(map.get(4, 0)?.owners).to.eql([]);
        expect(map.get(4, 0)?.gatUsed).to.equal(false);
        expect(map.get(4, 0)?.isFree()).to.equal(true);
        expect(map.get(17, 1)?.inDirectory).to.equal(true);
        expect(map.get(17, 1)?.isFree()).to.equal(false);
        expect(map.get(0, 0)?.owners.map(entry => entry.getFilename("/"))).to.eql(["BOOT/SYS"]);
        expect(map.get(35, 0)).to.be.undefined;
        expect(map.get(0, 2)).to.be.undefined;
    });

    it("finds shared granules", () => {
        const map = makeMap([
            {name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]},
            {name: "TWO/DAT", extents: [{lump: 3, granuleOffset: 1, granuleCount: 2}]},
        ]);

        // ONE covers 3:0 and 3:1, and TWO covers 3:1 and 4:0.
        expect(names(map.getSharedGranules())).to.eql(["3:1"]);
        const shared = map.getSharedGranules()[0];
        expect(shared.owners.map(entry => entry.getFilename("/")).sort()).to.eql(["ONE/DAT", "TWO/DAT"]);
        expect(shared.isFree()).to.equal(false);
    });

    it("counts a granule once for a file that claims it twice", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}, {lump: 3, granuleOffset: 1, granuleCount: 1}]}]);

        expect(map.get(3, 1)?.owners.length).to.equal(1);
        expect(map.getSharedGranules()).to.eql([]);
    });

    it("finds granules that are claimed but free in the GAT", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]}], {gatFree: [{lump: 3, granule: 1}]});

        expect(names(map.getClaimedButFreeGranules())).to.eql(["3:1"]);
        expect(map.get(3, 1)?.isFree()).to.equal(false);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 2);
    });

    it("finds granules that are used in the GAT but unclaimed, but not the boot or directory", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]}], {gatUsed: [{lump: 10, granule: 0}, {lump: 11, granule: 1}]});

        expect(names(map.getUsedButUnclaimedGranules())).to.eql(["10:0", "11:1"]);
        expect(map.get(0, 0)?.gatUsed).to.equal(true);
        expect(map.get(17, 0)?.gatUsed).to.equal(true);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 2 - 2);
    });

    it("doesn't count locked-out cylinders as free", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]}], {lockedOut: [20]});

        expect(map.get(20, 0)?.lockedOut).to.equal(true);
        expect(map.get(20, 1)?.lockedOut).to.equal(true);
        expect(map.get(21, 0)?.lockedOut).to.equal(false);
        expect(map.get(20, 0)?.isFree()).to.equal(false);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 2 - 2);
    });

    it("reports an extent past the last lump once, and counts its in-range part", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 34, granuleOffset: 1, granuleCount: 3}]}]);

        expect(map.outOfRange.length).to.equal(1);
        expect(map.outOfRange[0].dirEntry.getFilename("/")).to.equal("ONE/DAT");
        expect(map.outOfRange[0].extent.toString()).to.equal("Extent[34:1:3]");
        expect(map.get(34, 1)?.owners.length).to.equal(1);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 1);
    });

    it("lets an extent run from the second granule of a lump into the next lump", () => {
        const map = makeMap([{name: "ONE/DAT", extents: [{lump: 10, granuleOffset: 1, granuleCount: 2}]}]);

        expect(map.outOfRange).to.eql([]);
        expect(map.get(10, 0)?.owners).to.eql([]);
        expect(map.get(10, 1)?.owners.length).to.equal(1);
        expect(map.get(11, 0)?.owners.length).to.equal(1);
        expect(map.get(11, 1)?.owners).to.eql([]);
        expect(map.getFreeGranuleCount()).to.equal(TOTAL_GRANULES - SYSTEM_GRANULES - 2);
    });
});
