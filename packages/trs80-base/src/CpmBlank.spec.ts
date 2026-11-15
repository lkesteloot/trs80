import {describe, expect, it} from "vitest";
import {Cpm, decodeCpm} from "./Cpm.js";
import {makeMontezumaTestDisk, type CpmTestFile} from "./CpmTestDisk.js";
import {
    CPM_VERIFIED_LAYOUTS,
    CpmWriteBlockerKind,
    decodeBlankCpm,
    evaluateCpmWriteGate,
    findBlankCpmCandidates,
    findCpmVerifiedLayout,
    findCpmVerifiedLayoutById,
    type CpmVerifiedLayout,
} from "./CpmWriteGate.js";
import {Density, type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {makeBlankFloppy} from "./DmkBuilder.js";
import type {TrackLayout} from "./TrackLayout.js";

// Banners of the BIOS versions of each kind of layout.
const BANNER_2 = "Model 4 64K System CP/M 2.2 v2.32";
const BANNER_126 = "Model 4 60K System CP/M 2.2 v1.26";
const BANNER_142 = "Model 4 60K System CP/M 2.2 v1.42";

/**
 * The preset with an id, which must exist.
 */
function preset(id: string): CpmVerifiedLayout {
    const layout = findCpmVerifiedLayoutById(id);
    if (layout === undefined) {
        throw new Error("No preset " + id);
    }
    return layout;
}

/**
 * The ids of the presets that a disk's blank readings have, in order.
 */
function blankIds(disk: FloppyDisk): string[] {
    return findBlankCpmCandidates(disk, disk.getGeometry(), true).map(cpm => findCpmVerifiedLayout(cpm)?.id ?? "?");
}

/**
 * A few files for a disk that's emptied afterward.
 */
function someFiles(): CpmTestFile[] {
    return [
        {name: "A.TXT", contents: new TextEncoder().encode("Hello.\r\n".repeat(40))},
        {name: "B.BIN", contents: Uint8Array.from({length: 5000}, (_, i) => (i*7) & 0xFF)},
    ];
}

/**
 * Empty a disk the way ERA does: mark every directory slot unused, leaving the rest of the entry.
 */
function eraseAllFiles(disk: FloppyDisk): void {
    const cpm = decodeCpm(disk, true)!;
    for (let slot = 0; slot < cpm.format.dirEntryCount; slot++) {
        const {position, offset} = cpm.getDirSlotLocation(slot);
        const sector = disk.readSector(position)!;
        sector.data[offset] = 0xE5;
        disk.writeSector(position, sector);
    }
}

/**
 * The banner to put on a layout's disk, which is the one of its BIOS version.
 */
function bannerFor(layout: CpmVerifiedLayout): string {
    if (layout.reservedTracks === 4) {
        return BANNER_142;
    }
    return layout.skew === 4 ? BANNER_126 : BANNER_2;
}

describe("blank Montezuma disks", () => {
    describe("findBlankCpmCandidates", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            it(`recognizes a blank ${layout.id}, with the banner of its BIOS`, () => {
                const disk = makeMontezumaTestDisk(layout, [], layout.reservedTracks > 0 ? {banner: bannerFor(layout)} : {});
                const ids = blankIds(disk);
                if (layout.skew === 4) {
                    // Nothing on a blank disk tells skew 2 from skew 4, and version 1.26's banner allows both.
                    const standard = CPM_VERIFIED_LAYOUTS.find(other => other.skew === 2 && other.sides === layout.sides &&
                        other.reservedTracks === 2 && other.sectorSize === 256 && other.cylinders === layout.cylinders)!;
                    expect(ids).to.eql([standard.id, layout.id]);
                } else {
                    expect(ids).to.eql([layout.id]);
                }
            });
        }

        it("is ambiguous for a double-sided system disk with no banner, as FORMAT leaves it", () => {
            // The skews tie on a blank directory, and so do the reserved tracks, since all that's on them is E5.
            const disk = makeMontezumaTestDisk(preset("mm-ds-system"), []);
            expect(blankIds(disk)).to.eql(["mm-ds-system", "mm-1.26-ds-system", "mm-1.42-ds-system"]);
            expect(decodeBlankCpm(disk)).not.to.equal(undefined);
            expect(findCpmVerifiedLayout(decodeBlankCpm(disk)!)?.id).to.equal("mm-ds-system");
        });

        it("is ambiguous only between skews for a single-sided system disk with no banner", () => {
            const disk = makeMontezumaTestDisk(preset("mm-system"), []);
            expect(blankIds(disk)).to.eql(["mm-system", "mm-1.26-system"]);
        });

        it("uses a 2.x banner to rule out skew 4 and the 4 reserved tracks", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-system"), [], {banner: BANNER_2});
            expect(blankIds(disk)).to.eql(["mm-ds-system"]);
        });

        it("keeps only the 4 reserved tracks of a two-sided disk for versions 1.42 and 1.44", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-system"), [], {banner: BANNER_142});
            expect(blankIds(disk)).to.eql(["mm-1.42-ds-system"]);
            const single = makeMontezumaTestDisk(preset("mm-system"), [], {banner: "Model 4 60K System CP/M 2.2 v1.44"});
            // A one-sided disk of these versions reads as the standard system format.
            expect(blankIds(single)).to.eql(["mm-system"]);
        });

        it("recognizes a disk emptied by deleting every file, which keeps most of each entry", () => {
            for (const id of ["mm-ds-data", "mm-system", "mm-80-data", "mm-ext-ds-system"]) {
                const layout = preset(id);
                const disk = makeMontezumaTestDisk(layout, someFiles(), layout.reservedTracks > 0 ? {banner: BANNER_2} : {});
                eraseAllFiles(disk);
                expect(blankIds(disk)).to.eql([id]);
            }
        });

        it("reads a blank disk in a double-sided image with side 1 unformatted as one side", () => {
            const disk = makeMontezumaTestDisk(preset("mm-data"), [], {imageSideCount: 2, unformatSide1: true});
            expect(disk.getGeometry().sideCount).to.equal(2);
            expect(blankIds(disk)).to.eql(["mm-data"]);
        });

        it("reads a blank disk with every sector of side 1 as two sides", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-data"), []);
            expect(blankIds(disk)).to.eql(["mm-ds-data"]);
        });

        it("doesn't recognize an all-0xE5 disk whose geometry no layout fits", () => {
            // 35 cylinders, which no layout has.
            expect(blankIds(makeMontezumaTestDisk(preset("mm-system"), [], {cylinderCount: 35}))).to.eql([]);
            // 16 sectors of 256 bytes, which no layout has.
            const trackLayout: TrackLayout = makeLayout(16, 256, 1);
            expect(blankIds(makeBlankFloppy(trackLayout, 40, 1)!)).to.eql([]);
        });

        it("doesn't recognize a blank disk whose sectors are numbered from 0, as TRSDOS's are", () => {
            const from1 = makeBlankFloppy(makeLayout(10, 512, 1), 40, 1)!;
            expect(blankIds(from1)).to.eql(["mm-data"]);
            const from0 = makeBlankFloppy(makeLayout(10, 512, 0), 40, 1)!;
            expect(blankIds(from0)).to.eql([]);
            expect(decodeFloppyFileSystem(from0)).to.equal(undefined);
        });

        it("doesn't recognize a system format whose first sector looks like the start of a directory", () => {
            const disk = makeMontezumaTestDisk(preset("mm-system"), [], {noBootSector: true, banner: BANNER_2});
            expect(blankIds(disk)).to.eql([]);
        });

        it("doesn't recognize a system format that has neither Montezuma's boot sector nor a banner", () => {
            const disk = makeMontezumaTestDisk(preset("mm-system"), []);
            expect(blankIds(disk)).to.eql(["mm-system", "mm-1.26-system"]);

            // Another system's boot sector: not a directory, and not Montezuma's.
            const position = SectorPosition.make(0, 0, 1);
            const sector = disk.readSector(position)!;
            sector.data.fill(0x55);
            disk.writeSector(position, sector);
            expect(blankIds(disk)).to.eql([]);
            expect(decodeFloppyFileSystem(disk)).to.equal(undefined);
        });

        it("doesn't recognize a disk that has a file", () => {
            const disk = makeMontezumaTestDisk(preset("mm-data"), someFiles());
            expect(blankIds(disk)).to.eql([]);
        });
    });

    describe("decodeFloppyFileSystem", () => {
        it("reads a blank disk as CP/M, with no files", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-data"), []);
            expect(decodeCpm(disk)).to.equal(undefined);
            const cpm = decodeFloppyFileSystem(disk);
            expect(cpm).to.be.instanceOf(Cpm);
            expect(findCpmVerifiedLayout(cpm as Cpm)?.id).to.equal("mm-ds-data");
            expect((cpm as Cpm).getDirEntries(true)).to.eql([]);
        });

        it("still prefers the decoders that find something", () => {
            const disk = makeMontezumaTestDisk(preset("mm-data"), someFiles());
            const cpm = decodeFloppyFileSystem(disk) as Cpm;
            expect(cpm.getDirEntries(true)).to.have.length(2);
        });
    });

    describe("the write gate", () => {
        it("doubts an ambiguous blank disk, naming the other presets", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-system"), []);
            const cpm = decodeBlankCpm(disk, true)!;
            const gate = evaluateCpmWriteGate(cpm);
            expect(gate.blockers.map(blocker => blocker.kind)).to.eql([CpmWriteBlockerKind.LAYOUT_DOUBT]);
            expect(gate.blockers[0].message).to.contain("mm-1.26-ds-system");
            expect(gate.blockers[0].message).to.contain("mm-1.42-ds-system");
            expect(gate.blockers[0].message).to.contain("The reading in use is mm-ds-system");
        });

        it("has no doubt when the layout is settled, as with --cpm-format", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-system"), []);
            const cpm = decodeBlankCpm(disk, true)!;
            expect(evaluateCpmWriteGate(cpm, {layoutSettled: true}).blockers).to.eql([]);
        });

        it("has no doubt about a blank disk that the evidence settles", () => {
            const disk = makeMontezumaTestDisk(preset("mm-ds-data"), []);
            expect(evaluateCpmWriteGate(decodeBlankCpm(disk, true)!).blockers).to.eql([]);
        });
    });
});

/**
 * A Montezuma-style track layout (double density, in-order sectors, 0xE5 fill) whose sectors are numbered from a
 * given number.
 */
function makeLayout(sectorCount: number, sectorSize: number, firstSectorNumber: number): TrackLayout {
    return {
        id: `test-${sectorCount}x${sectorSize}-from-${firstSectorNumber}`,
        description: "A blank track",
        density: Density.DOUBLE,
        sectorCount,
        sectorSize,
        firstSectorNumber,
        interleaveStep: 1,
        cylinderSkew: 0,
        twoSidedCylinderSkew: 0,
        sideSkew: 0,
        leadGapLength: 32,
        idSyncLength: 12,
        gap2Length: 22,
        dataSyncLength: 12,
        gap3Length: 16,
        fillPattern: [0xE5],
        sectorTail: [],
    };
}
