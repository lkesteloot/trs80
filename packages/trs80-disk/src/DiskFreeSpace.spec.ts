import {
    appendDmkTestTracks, formatTrsdosDataDisk, removeDmkId, SectorPosition, TRSDOS_13_TRACK_LAYOUT, TrsdosFormatDos,
    type DmkFloppyDisk,
} from "trs80-base";
import {describe, expect, it} from "vitest";
import {buildDiskMap, MapCellKind, totalsText} from "./DiskMap.js";
import {DiskSession, unusableFreeText} from "./DiskSession.js";

// Tests of how "free", "info" and "map" count the granules that the GAT calls free but new files never get.

/**
 * Format a blank data disk, failing the test if it can't be made.
 */
function format(dos: TrsdosFormatDos, cylinders: number): DmkFloppyDisk {
    const disk = formatTrsdosDataDisk({dos, cylinders, sides: 1, date: new Date(1983, 4, 17)});
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    return disk;
}

/**
 * Open an image in a session.
 */
function open(disk: DmkFloppyDisk): DiskSession {
    return DiskSession.fromBinary("test.dmk", disk.binary);
}

describe("free space the writer can't use", () => {
    it("leaves out granules that the image doesn't fully hold", () => {
        const whole = open(format(TrsdosFormatDos.TRSDOS_2_3, 35)).getFreeSpace();
        expect(whole.missingGranules).to.equal(0);
        expect(whole.pastEndGranules).to.equal(0);

        // TRSDOS 2.3's cylinder 0, sector 7, is in granule 1, which is free on a blank disk.
        const session = open(removeDmkId(format(TrsdosFormatDos.TRSDOS_2_3, 35), SectorPosition.make(0, 0, 7)));
        const free = session.getFreeSpace();
        expect(free.missingGranules).to.equal(1);
        expect(free.pastEndGranules).to.equal(0);
        expect(free.freeGranules).to.equal(whole.freeGranules - 1);
        expect(free.freeBytes).to.equal(free.freeGranules*free.granuleBytes);
        expect(session.getFreeSpaceText()).to.match(
            /^\d+ KB free \(\d+ granules of 1,280 bytes each\); the GAT calls 1 more granule free, which isn't fully on the image$/);

        const model = buildDiskMap(session, []);
        expect(model.kindCounts.get(MapCellKind.NOT_ON_IMAGE)).to.equal(1);
        expect(model.cells.find(cell => cell.lump === 0 && cell.granule === 1)?.kind).to.equal(MapCellKind.NOT_ON_IMAGE);
        expect(model.totals.freeGranuleCount).to.equal(free.freeGranules);
        expect(model.totals.notOnImageGranuleCount).to.equal(1);
        expect(totalsText(model.totals)).to.contain(", 1 free in the GAT but not fully on the image.");
    });

    it("leaves out granules past the disk's end", () => {
        // TRSDOS 1.3's GAT is zero past its 40 cylinders, so the tail's granules look free.
        const disk = appendDmkTestTracks(format(TrsdosFormatDos.TRSDOS_1_3, 40), [[{kind: "reRead", cylinder: 39}]],
            TRSDOS_13_TRACK_LAYOUT);
        const session = open(disk);
        const free = session.getFreeSpace();
        expect(free.pastEndGranules).to.equal(6);
        expect(free.missingGranules).to.equal(0);
        expect(session.getFreeSpaceText()).to.contain("; the GAT calls 6 more granules free, which are past the disk's end");

        const model = buildDiskMap(session, []);
        expect(model.kindCounts.get(MapCellKind.PAST_END)).to.equal(6);
        expect(model.totals.pastEndGranuleCount).to.equal(6);
        expect(totalsText(model.totals)).to.contain(", 6 free in the GAT but past the disk's end.");
    });

    it("says both", () => {
        expect(unusableFreeText({freeGranules: 1, granuleBytes: 256, freeBytes: 256, missingGranules: 2,
            pastEndGranules: 1})).to.equal("; the GAT calls 3 more granules free: 2 aren't fully on the image, " +
            "and 1 is past the disk's end");
        expect(unusableFreeText({freeGranules: 1, granuleBytes: 256, freeBytes: 256, missingGranules: 0,
            pastEndGranules: 0})).to.equal("");
    });
});
