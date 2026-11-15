import {describe, expect, it} from "vitest";
import {CPM_FORMATS, decodeCpm, decodeCpmWithLayout, rankCpmCandidates} from "./Cpm.js";
import {cpmTestRecordLocation, makeMontezumaTestDisk, type CpmTestFile} from "./CpmTestDisk.js";
import {
    CPM_VERIFIED_LAYOUTS,
    CpmWriteBlockerKind,
    type CpmWriteGate,
    type CpmVerifiedLayout,
    evaluateCpmWriteGate,
    findCpmLayoutDoubts,
} from "./CpmWriteGate.js";
import {removeDmkId, setDmkConverterCrcMarker} from "./DmkTestArtifacts.js";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {TrsdosWriteAccess} from "./TrsdosWriteGate.js";

/**
 * The verified layout with a name.
 */
function layoutNamed(name: string): CpmVerifiedLayout {
    const layout = CPM_VERIFIED_LAYOUTS.find(layout => layout.name === name);
    if (layout === undefined) {
        throw new Error("No layout " + name);
    }
    return layout;
}

/**
 * A few files of different sizes, small enough to fit on any layout. The first is in the first data
 * block, whose first sector is, read with the wrong skew, one of the directory's, so its text reads as
 * bad entries and the right skew wins. A tie needs the first file to be too short to reach that sector,
 * since the directory entries all fit in its first logical sector, which every skew finds.
 *
 * @param skewTies whether to make the first file short, so that skew 2 and skew 4 read the disk equally well.
 */
function makeFiles(skewTies = false): CpmTestFile[] {
    const line = "Hello, world.\r\n";
    const hello = skewTies ? line : line.repeat(70);
    return [
        {name: "HELLO.TXT", contents: new TextEncoder().encode(hello)},
        {name: "DATA.BIN", contents: Uint8Array.from({length: 5000}, (_, i) => (i*7) & 0xFF)},
        {name: "ONE.TXT", contents: new TextEncoder().encode("One.\r\n")},
        {name: "TWO.TXT", contents: new TextEncoder().encode("Two.\r\n")},
    ];
}

/**
 * Decode a disk with whole records, as the write path does, and evaluate its gate.
 */
function gateOf(disk: FloppyDisk): CpmWriteGate {
    const cpm = decodeCpm(disk, true);
    if (cpm === undefined) {
        throw new Error("Not CP/M");
    }
    return evaluateCpmWriteGate(cpm);
}

/**
 * The kinds of the blockers in a gate.
 */
function kindsOf(gate: CpmWriteGate): CpmWriteBlockerKind[] {
    return gate.blockers.map(blocker => blocker.kind);
}

/**
 * A 40-cylinder Montezuma Super Data disk (six sectors a track, five of 1024 bytes and one of 512)
 * with one file in block 2, built by hand because the test disk builder makes only uniform tracks.
 */
class SuperDataFloppyDisk extends FloppyDisk {
    public readonly className = "SuperDataFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();

    constructor() {
        super(new Uint8Array(0), undefined, []);

        const sizes = [1024, 1024, 1024, 1024, 1024, 512];
        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < 40; cylinder++) {
            sizes.forEach((size, i) => {
                const position = SectorPosition.make(cylinder, 0, i + 1);
                sectorInfos.push(new SectorInfo(position, Density.DOUBLE, size));
                this.sectors.set(position.key(), new Uint8Array(size).fill(0xE5));
            });
        }
        this.geometry = FloppyDiskGeometry.make(40, 1, sectorInfos)!;

        // The first directory entry, which is in the first record of sector 1.
        const entry = new Uint8Array(32);
        entry.set(Array.from("A       TXT", ch => ch.charCodeAt(0)), 1);
        entry[15] = 1;
        entry[16] = 2;
        this.sectors.get(SectorPosition.make(0, 0, 1).key())!.set(entry);
    }

    /**
     * Describes the test disk.
     */
    public getDescription(): string {
        return "Super Data test floppy";
    }

    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    /**
     * Read a sector from the map.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const data = this.sectors.get(sectorPosition.key());
        return data === undefined ? undefined : new SectorData(data.slice(), sectorPosition, Density.DOUBLE);
    }
}

describe("CPM_VERIFIED_LAYOUTS", () => {
    it("has the 15 distinct Montezuma layouts", () => {
        expect(CPM_VERIFIED_LAYOUTS.length).to.equal(15);
    });
});

describe("evaluateCpmWriteGate", () => {
    it("has no blockers on every verified layout", () => {
        for (const layout of CPM_VERIFIED_LAYOUTS) {
            const disk = makeMontezumaTestDisk(layout, makeFiles());
            const cpm = decodeCpm(disk, true);
            expect(cpm, layout.name).not.to.equal(undefined);
            expect(cpm!.blockCount - 1, layout.name).to.equal(layout.dsm);
            expect(cpm!.format.skew, layout.name).to.equal(layout.skew);
            expect(kindsOf(evaluateCpmWriteGate(cpm!)), layout.name).to.eql([]);
        }
    });

    it("is writable for a Standard system disk", () => {
        const gate = gateOf(makeMontezumaTestDisk(layoutNamed("Standard system"), makeFiles()));
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("refuses a 35-cylinder image as an unsupported layout", () => {
        const disk = makeMontezumaTestDisk(layoutNamed("Standard system"), makeFiles(), {cylinderCount: 35});
        const gate = gateOf(disk);
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.UNSUPPORTED_LAYOUT]);
        expect(gate.blockers[0].forceable).to.equal(false);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(gate.blockers[0].message).to.contain("Montezuma Micro");
    });

    it("refuses a Super Data disk as an unsupported layout", () => {
        const gate = gateOf(new SuperDataFloppyDisk());
        // It's also write-protected, as a plain FloppyDisk is.
        expect(kindsOf(gate)[0]).to.equal(CpmWriteBlockerKind.UNSUPPORTED_LAYOUT);
    });

    it("doubts the skew when nothing says which BIOS wrote the disk", () => {
        const layout = layoutNamed("Standard system");
        const gate = gateOf(makeMontezumaTestDisk(layout, makeFiles(true)));
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.LAYOUT_DOUBT]);
        expect(gate.blockers[0].forceable).to.equal(true);
        expect(gate.blockers[0].message).to.contain("skew 4");
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
    });

    it("doesn't doubt the skew when a 2.x banner is on the reserved tracks", () => {
        const layout = layoutNamed("Standard system");
        const banner = "Model 4 64K System CP/M 2.2 v2.32";
        const gate = gateOf(makeMontezumaTestDisk(layout, makeFiles(true), {banner}));
        expect(gate.blockers).to.eql([]);
    });

    it("still doubts the skew when the banner is for a version that used skew 4", () => {
        const layout = layoutNamed("Standard system");
        const banner = "Model 4 64K System CP/M 2.2 v1.30";
        const gate = gateOf(makeMontezumaTestDisk(layout, makeFiles(true), {banner}));
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.LAYOUT_DOUBT]);
    });

    it("reads a double-sided image with all of side 1 as two sides, with no doubt", () => {
        const layout = layoutNamed("Standard DS data");
        const disk = makeMontezumaTestDisk(layout, makeFiles());
        const cpm = decodeCpm(disk, true)!;
        expect(cpm.allocationSides).to.equal(2);

        // The one-side reading ties, but side 1 is formatted.
        const ranked = rankCpmCandidates(cpm.disk, cpm.geometry, true);
        const oneSide = ranked.find(other => other.allocationSides === 1 && other.format === cpm.format &&
            other.reservedTrackCount === cpm.reservedTrackCount && other.cylinderCount === cpm.cylinderCount)!;
        expect(oneSide.evaluation.score).to.equal(cpm.evaluation.score);
        expect(findCpmLayoutDoubts(cpm, ranked)).to.eql([]);
        expect(evaluateCpmWriteGate(cpm).blockers).to.eql([]);
    });

    it("doubts the sides when a sector of side 1 is missing", () => {
        const layout = layoutNamed("Standard DS data");
        let disk = makeMontezumaTestDisk(layout, makeFiles());
        // A sector that no file uses, at the end of the last cylinder's side 1.
        disk = removeDmkId(disk, SectorPosition.make(39, 1, 10));
        const gate = gateOf(disk);
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.LAYOUT_DOUBT]);
        expect(gate.blockers[0].message).to.contain("one side");
    });

    it("doesn't doubt the sides of a single-sided image whose directory is sparse", () => {
        const layout = layoutNamed("Standard data");
        // One file in the first block: a two-side reading finds the same directory and file, but the image has
        // nothing on side 1, so it can't be a two-sided disk's.
        const files = [{name: "FRESH.TXT", contents: new Uint8Array(300).fill(65)}];
        const cpm = decodeCpm(makeMontezumaTestDisk(layout, files), true)!;
        const ranked = rankCpmCandidates(cpm.disk, cpm.geometry, true);
        const twoSides = ranked.find(other => other.allocationSides === 2 && other.format === cpm.format &&
            other.reservedTrackCount === cpm.reservedTrackCount && other.cylinderCount === cpm.cylinderCount)!;
        expect(twoSides.evaluation.score).to.equal(cpm.evaluation.score);
        expect(twoSides.evaluation.missingSectorCount).to.equal(cpm.evaluation.missingSectorCount);
        expect(findCpmLayoutDoubts(cpm, ranked)).to.eql([]);
        expect(evaluateCpmWriteGate(cpm).blockers).to.eql([]);
    });

    it("skips the layout doubt when the caller says the layout is settled", () => {
        const layout = layoutNamed("Standard system");
        const disk = makeMontezumaTestDisk(layout, makeFiles(true));
        const cpm = decodeCpm(disk, true)!;
        expect(evaluateCpmWriteGate(cpm).blockers.map(blocker => blocker.kind)).to.eql([CpmWriteBlockerKind.LAYOUT_DOUBT]);
        expect(evaluateCpmWriteGate(cpm, {layoutSettled: true}).blockers).to.eql([]);
    });

    it("reads a single-sided disk in a double-sided image as one side", () => {
        const layout = layoutNamed("Standard data");
        const disk = makeMontezumaTestDisk(layout, makeFiles(), {imageSideCount: 2, unformatSide1: true});
        const cpm = decodeCpm(disk, true)!;
        expect(cpm.allocationSides).to.equal(1);
        expect(evaluateCpmWriteGate(cpm).blockers).to.eql([]);
    });

    it("makes a bad entry forceable damage", () => {
        const layout = layoutNamed("Standard system");
        const bad = new Uint8Array(32);
        bad.set(Array.from("BAD     TXT", ch => ch.charCodeAt(0)), 1);
        bad[12] = 0x30;
        const banner = "Model 4 64K System CP/M 2.2 v2.32";
        const gate = gateOf(makeMontezumaTestDisk(layout, makeFiles(), {banner, rawEntries: [{slot: 5, bytes: bad}]}));
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.DAMAGE]);
        expect(gate.blockers[0].forceable).to.equal(true);
        expect(gate.access).to.equal(TrsdosWriteAccess.REPAIR_ONLY);
    });

    it("makes a CRC error in a directory sector unforceable", () => {
        const layout = layoutNamed("Standard DS data");
        let disk = makeMontezumaTestDisk(layout, makeFiles());
        // Record 4 of the directory, which is in its second sector.
        disk = setDmkConverterCrcMarker(disk, cpmTestRecordLocation(layout, 4).position);
        const gate = gateOf(disk);
        expect(kindsOf(gate)).to.contain(CpmWriteBlockerKind.DIRECTORY_UNREADABLE);
        const blocker = gate.blockers.find(blocker => blocker.kind === CpmWriteBlockerKind.DIRECTORY_UNREADABLE)!;
        expect(blocker.forceable).to.equal(false);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
    });

    it("refuses a disk with a CP/M 3 entry", () => {
        const layout = layoutNamed("Standard DS data");
        const stamp = new Uint8Array(32).fill(0);
        stamp[0] = 0x21;
        const gate = gateOf(makeMontezumaTestDisk(layout, makeFiles(), {rawEntries: [{slot: 5, bytes: stamp}]}));
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.CPM3_ENTRIES]);
        expect(gate.blockers[0].forceable).to.equal(false);
    });

    it("blocks a write-protected image, which can be forced", () => {
        const layout = layoutNamed("Standard DS data");
        const disk = makeMontezumaTestDisk(layout, makeFiles());
        disk.writeProtected = true;
        const gate = gateOf(disk);
        expect(kindsOf(gate)).to.eql([CpmWriteBlockerKind.WRITE_PROTECTED]);
        expect(gate.blockers[0].forceable).to.equal(true);
    });
});

describe("Cpm layout helpers", () => {
    it("ranks the candidates with the decoded one first", () => {
        const disk = makeMontezumaTestDisk(layoutNamed("Standard DS data"), makeFiles());
        const cpm = decodeCpm(disk, true)!;
        const ranked = rankCpmCandidates(disk, disk.getGeometry(), true);
        expect(ranked[0].sameLayout(cpm)).to.equal(true);
        expect(ranked.some(other => !other.sameLayout(cpm))).to.equal(true);
    });

    it("decodes with a given layout and finds the same files", () => {
        const layout = layoutNamed("Standard DS data");
        const disk = makeMontezumaTestDisk(layout, makeFiles());
        const cpm = decodeCpm(disk, true)!;
        const again = decodeCpmWithLayout(disk, cpm, false);
        expect(again.sameLayout(cpm)).to.equal(true);
        expect(again.wholeRecords).to.equal(false);
        expect(again.getDirEntries(true).map(file => file.getFilename(".")))
            .to.eql(cpm.getDirEntries(true).map(file => file.getFilename(".")));
    });

    it("locates directory slots and reads the raw directory", () => {
        const layout = layoutNamed("Standard system");
        const disk = makeMontezumaTestDisk(layout, makeFiles());
        const cpm = decodeCpm(disk, true)!;
        const dir = cpm.readDirectoryBytes();
        expect(dir.length).to.equal(128*32);
        expect(String.fromCharCode(...dir.subarray(1, 9))).to.equal("HELLO   ");

        // Slot 9 is the second sector's second entry, and each slot is where the sector holds it.
        for (const slot of [0, 1, 8, 9, 127]) {
            const {position, offset} = cpm.getDirSlotLocation(slot);
            const sector = disk.readSector(position)!;
            expect(Array.from(sector.data.subarray(offset, offset + 32)), `slot ${slot}`)
                .to.eql(Array.from(dir.subarray(slot*32, slot*32 + 32)));
        }
        expect(() => cpm.getDirSlotLocation(128)).to.throw();
        expect(cpm.dirSectorsReadable()).to.equal(true);
        expect(cpm.hasCpm3Entries()).to.equal(false);
    });

    it("keeps the Holmes format's four reserved blocks", () => {
        const holmes = CPM_FORMATS.find(format => format.name === "Holmes Engineering")!;
        expect(holmes.reservedBlockCount).to.equal(4);
    });

    it("starts files after the directory's blocks when a format reserves no more", () => {
        const disk = makeMontezumaTestDisk(layoutNamed("Standard DS data"), makeFiles());
        const cpm = decodeCpm(disk, true)!;
        expect(cpm.firstDataBlock).to.equal(cpm.dirBlockCount);
        expect(cpm.dirBlockCount).to.equal(2);
    });
});
