import {describe, expect, it} from "vitest";
import {makeBlankFloppy, makeDmkImage} from "./DmkBuilder.js";
import {type FloppyDisk, type FormattedTrack, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {buildFormattedTrack, LDOS_DD_TRACK_LAYOUT, LDOS_SD_TRACK_LAYOUT} from "./TrackLayout.js";
import {
    decodeTrsdos,
    hashForFilename,
    TRSDOS_BLANK_PASSWORD_HASH,
    type Trsdos,
    type TrsdosDirEntry,
} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {reservedDecs} from "./TrsdosDirSlots.js";
import {readTrsdosDiskInfo} from "./TrsdosDiskInfo.js";
import {findTrsdosDiskSize} from "./TrsdosDiskSize.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {multidosGatSize, multidosLayoutProblem, multidosReservedDecs} from "./TrsdosMultidos.js";
import {identifyTrsdosRuleSet, TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {makeTrsdos23TestDisk, type TestFile} from "./TrsdosTestDisk.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess, TrsdosWriteBlockerKind} from "./TrsdosWriteGate.js";
import {TrsdosWriteError, TrsdosWriter} from "./TrsdosWriter.js";

/**
 * The boot sector code after the 3-byte prefix of MultiDOS 1.5 and 1.6's data disks, which with GAT byte 0xCB
 * = 0x16 names the disk MultiDOS 1.6. See "Boot sector code by DOS" in FLOPPY_FORMATS.md.
 */
const STUB_1_6 = [0xCD, 0x0B, 0x00, 0x11, 0x2E, 0x00, 0x19, 0x7E, 0x23, 0xB7];

/**
 * The same for MultiDOS 1.7 through 2.10, which with 0x17 and no BOOT/SYS names the disk MultiDOS 1.7, 1.7.1 or
 * 1.71, and with 0xFF MultiDOS 2.10.
 */
const STUB_1_7 = [0x3A, 0x03, 0x00, 0xFE, 0x17, 0x28, 0x24, 0xCD, 0x0B, 0x00, 0x11, 0x2F, 0x00];

/**
 * The raw name of MultiDOS FORMAT's marker entry.
 */
const MARKER = "NoDOS   Ind";

/**
 * A change to the GAT and the HIT before they're written.
 */
type Patch = (gat: Uint8Array, hit: Uint8Array) => void;

/**
 * Rewrite the GAT (and the HIT) of a committed disk, and put the 0xFE that MultiDOS's boot sectors have in byte 1
 * of its boot sector.
 */
function patchGatAndHit(disk: FloppyDisk, patch: Patch): void {
    const trsdos = decodeTrsdos(disk);
    if (trsdos === undefined) {
        throw new Error("The disk didn't decode before the patch");
    }
    const gat = readBytes(disk, trsdos.getGatPosition()).slice();
    const hit = readBytes(disk, trsdos.getHitPosition()).slice();
    patch(gat, hit);
    const bootPosition = SectorPosition.make(0, 0, 0);
    const boot = readBytes(disk, bootPosition).slice();
    boot[1] = 0xFE;
    const setup = new SectorOverlay(disk);
    setup.writeSector(trsdos.getGatPosition(), gat);
    setup.writeSector(trsdos.getHitPosition(), hit);
    setup.writeSector(bootPosition, boot);
    setup.commit();
}

/**
 * Make the single-density test disk: the TRSDOS 2.3 builder's 35-cylinder disk (cylinder lumps of two 5-sector
 * granules, directory on cylinder 17 with 8 entry sectors) with MultiDOS 1.6's data-disk boot code and GAT byte,
 * GAT bytes 0xCC and 0xCD in the counts form (35 lumps, 35 cylinders), FORMAT's NoDOS/Ind marker at DEC 2, and a
 * user file HELLO/BAS on lump 5.
 *
 * @param files more files.
 * @param options granules to mark used, and a change to the GAT.
 */
function makeSdFixture(files: TestFile[] = [], options: {gatUsed?: {lump: number, granule: number}[], patch?: Patch} = {}) {
    const disk = makeTrsdos23TestDisk([
        {name: "HELLO/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}], size: 2000},
        {name: "NoDOS/Ind", extents: [], size: 0, system: true, invisible: true, dec: 2},
        ...files,
    ], {dosVersion: 0x16, bootCode: new Uint8Array(STUB_1_6), gatUsed: options.gatUsed});
    patchGatAndHit(disk, gat => {
        gat[0xCC] = 35;
        gat[0xCD] = 35;
        options.patch?.(gat, new Uint8Array(256));
    });
    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("The single-density test disk didn't decode");
    }
    return {disk, overlay, trsdos, makeWriter: () => new TrsdosWriter(trsdos, TrsdosRuleSet.MULTIDOS)};
}

/**
 * A file on the double-density test disks: one extent.
 */
interface DdFile {
    /** The raw 11-character name. */
    rawName: string;
    /** The DEC (HIT index) of its slot. */
    dec: number;
    /** The entry's byte 0. */
    flags: number;
    /** Its extent, or undefined for none. */
    extent: {lump: number, granule: number, granuleCount: number} | undefined;
    /** The size in bytes. */
    size: number;
    /** The byte that fills its data sectors, or undefined to write none. */
    fill: number | undefined;
    /** Bytes 16 to 19, default blank passwords. */
    passwords?: number[];
}

/**
 * The layout of one of the double-density test disks.
 */
interface DdLayout {
    /** Whether it's "P" density (a single-density cylinder 0, then lumps of 10 sectors), or else cylinder lumps. */
    pDensity: boolean;
    /** The image's sides, 1 or 2. Only the cylinder-lump disks have two. */
    sides: number;
    /** The sides that the file system allocates. */
    allocSides: number;
    /** Sectors per granule. */
    sectorsPerGranule: number;
    /** Granules per lump. */
    granulesPerLump: number;
    /** The directory's lump and its granules. */
    dirLump: number;
    dirGranules: number;
    /** The number of lumps. */
    lumpCount: number;
}

/**
 * The "P" density test disk: 40 cylinders, the first single density, then 39 of 18 double-density sectors, which
 * is 70 lumps of two 5-sector granules. The directory is in sectors 8 to 17 of cylinder 10, which is lump 17, as
 * MultiDOS's FORMAT puts it.
 */
const P_LAYOUT: DdLayout = {
    pDensity: true, sides: 1, allocSides: 1, sectorsPerGranule: 5, granulesPerLump: 2, dirLump: 17, dirGranules: 2, lumpCount: 70,
};

/**
 * The double-sided double-density test disk: 40 cylinders of two sides of 18 sectors, each a lump of six 6-sector
 * granules, with the directory in the three granules of side 0 of cylinder 20.
 */
const DS_LAYOUT: DdLayout = {
    pDensity: false, sides: 2, allocSides: 2, sectorsPerGranule: 6, granulesPerLump: 6, dirLump: 20, dirGranules: 3,
    lumpCount: 40,
};

/**
 * A two-sided image whose file system is on side 0 only: cylinder lumps of three 6-sector granules, with the
 * directory in cylinder 20, and nothing on side 1.
 */
const ONE_SIDE_OF_TWO_LAYOUT: DdLayout = {...DS_LAYOUT, allocSides: 1, granulesPerLump: 3};

/**
 * Where a sector of a lump is on a double-density test disk.
 *
 * @param layout the disk's layout.
 * @param lump the lump.
 * @param sectorInLump the sector within the lump, from 0.
 */
function ddPosition(layout: DdLayout, lump: number, sectorInLump: number): SectorPosition {
    if (layout.pDensity) {
        const linear = lump*layout.sectorsPerGranule*layout.granulesPerLump + sectorInLump;
        return SectorPosition.make(1 + Math.floor(linear/18), 0, linear % 18);
    }
    return SectorPosition.make(lump, Math.floor(sectorInLump/18), sectorInLump % 18);
}

/**
 * Make a 32-byte directory entry as MultiDOS 1.x writes it: the month in byte 1 and the day and year in byte 2
 * (09/01/81), and the passwords in bytes 16 to 19.
 */
function makeEntry(file: DdFile): Uint8Array {
    const entry = new Uint8Array(32).fill(0xFF);
    const sectors = Math.ceil(file.size/256);
    entry.set([file.flags, 9, (1 << 3) | 1, file.size % 256, 0], 0);
    entry.set([...file.rawName].map(c => c.charCodeAt(0)), 5);
    entry.set(file.passwords ?? [TRSDOS_BLANK_PASSWORD_HASH & 0xFF, TRSDOS_BLANK_PASSWORD_HASH >> 8,
        TRSDOS_BLANK_PASSWORD_HASH & 0xFF, TRSDOS_BLANK_PASSWORD_HASH >> 8], 16);
    entry.set([sectors & 0xFF, sectors >> 8], 20);
    if (file.extent !== undefined) {
        entry.set([file.extent.lump, (file.extent.granule << 5) | (file.extent.granuleCount - 1)], 22);
    }
    return entry;
}

/**
 * Options for the double-density test disks.
 */
interface DdOptions {
    /** Whether to make the second side's sector IDs say side 0, as on a disk with a volume on each side. */
    sideOneSaysSideZero?: boolean;
    /** Granules to mark used in the GAT, as [lump, granule]. */
    usedGranules?: [number, number][];
    /** A change to the GAT and the HIT before they're written. */
    patch?: Patch;
}

/**
 * Make one of the double-density MultiDOS test disks: DIR/SYS at DEC 0 covering the directory, FORMAT's marker at
 * DEC 1, and HELLO/BAS (whose extent crosses a track boundary on the "P" disk, and is on side 1 of the two-sided
 * one). The GAT has no lockout table on the "P" disk (0xFF from 0x60, as FORMAT leaves it) and one on the other, and
 * bytes 0xCC and 0xCD in the counts form (on the two-sided disk, the LDOS form). The boot code names MultiDOS 1.6 on
 * the "P" disk and MultiDOS 1.7, 1.7.1 or 1.71 on the other.
 *
 * @param layout the disk's layout.
 * @param options what to change.
 * @return the disk, committed, and its overlay and decoded file system.
 */
function makeDdFixture(layout: DdLayout, options: DdOptions = {}) {
    const cylinders = 40;
    let disk;
    if (options.sideOneSaysSideZero === true) {
        const tracks: FormattedTrack[] = [];
        for (let cylinder = 0; cylinder < cylinders; cylinder++) {
            for (let side = 0; side < 2; side++) {
                const track = buildFormattedTrack(LDOS_DD_TRACK_LAYOUT, new TrackPosition(cylinder, 0), 2);
                if (track === undefined) {
                    throw new Error("Can't make a track");
                }
                tracks.push({...track, trackPosition: new TrackPosition(cylinder, side)});
            }
        }
        disk = makeDmkImage(tracks, cylinders, 2);
    } else {
        disk = makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, cylinders, layout.sides,
            {cylinder0Layout: layout.pDensity ? LDOS_SD_TRACK_LAYOUT : undefined});
    }
    if (disk === undefined) {
        throw new Error("Can't make the test disk");
    }

    const helloLump = 5;
    // On side 1 of the two-sided disk.
    const helloGranule = layout.allocSides === 2 ? 3 : 0;
    const files: DdFile[] = [
        {rawName: "DIR     SYS", dec: 0, flags: 0x5D, size: 0, fill: undefined,
            extent: {lump: layout.dirLump, granule: 0, granuleCount: layout.dirGranules}},
        {rawName: MARKER, dec: 1, flags: 0x5F, size: 0, fill: undefined, extent: undefined,
            passwords: [0x12, 0x34, 0x56, 0x78]},
        {rawName: "HELLO   BAS", dec: 0x42, flags: 0x10, size: 2000, fill: 0x48,
            extent: {lump: helloLump, granule: helloGranule, granuleCount: 2}},
    ];

    const gat = new Uint8Array(256).fill(0xFF);
    const hit = new Uint8Array(256);
    const freeByte = (0xFF << layout.granulesPerLump) & 0xFF;
    for (let lump = 0; lump < layout.lumpCount; lump++) {
        gat[lump] = freeByte;
        if (!layout.pDensity) {
            gat[0x60 + lump] = freeByte;
        }
    }
    if (!layout.pDensity) {
        // The boot cylinder's first granule.
        gat[0] |= 0x01;
    }
    const markUsed = (lump: number, granule: number) => {
        gat[lump] |= 1 << granule;
    };
    const sectorData: [SectorPosition, Uint8Array][] = [];
    for (const file of files) {
        hit[file.dec] = hashForFilename(file.rawName);
        const extent = file.extent;
        if (extent === undefined) {
            continue;
        }
        for (let i = 0; i < extent.granuleCount; i++) {
            markUsed(extent.lump, extent.granule + i);
        }
        if (file.fill !== undefined) {
            for (let s = 0; s < Math.ceil(file.size/256); s++) {
                sectorData.push([ddPosition(layout, extent.lump, extent.granule*layout.sectorsPerGranule + s),
                    new Uint8Array(256).fill(file.fill)]);
            }
        }
    }
    for (const [lump, granule] of options.usedGranules ?? []) {
        markUsed(lump, granule);
    }

    // The disk's information, as MultiDOS's FORMAT writes it.
    gat[0xCB] = layout.pDensity ? 0x16 : 0x17;
    if (layout.pDensity) {
        gat[0xCC] = layout.lumpCount;
        gat[0xCD] = cylinders;
    } else {
        gat[0xCC] = cylinders - 35;
        gat[0xCD] = 0x40 | (layout.allocSides === 2 ? 0x20 : 0) | (layout.granulesPerLump/layout.allocSides - 1);
    }
    gat.set([0xE0, 0x42], 0xCE);
    gat.set([..."Multidos"].map(c => c.charCodeAt(0)), 0xD0);
    gat.set([..."09/01/81"].map(c => c.charCodeAt(0)), 0xD8);
    gat.set([..."MULTIDOS format."].map(c => c.charCodeAt(0)), 0xE0);
    options.patch?.(gat, hit);

    const setup = new SectorOverlay(disk);
    const boot = new Uint8Array(256);
    boot.set([layout.pDensity ? 0x3B : 0x00, 0xFE, layout.dirLump, ...(layout.pDensity ? STUB_1_6 : STUB_1_7)]);
    setup.writeSector(SectorPosition.make(0, 0, 0), boot);
    setup.writeSector(ddPosition(layout, layout.dirLump, 0), gat);
    setup.writeSector(ddPosition(layout, layout.dirLump, 1), hit);
    const entrySectorCount = layout.dirGranules*layout.sectorsPerGranule - 2;
    const dirSectors = Array.from({length: entrySectorCount}, () => new Uint8Array(256));
    for (const file of files) {
        dirSectors[file.dec & 0x1F].set(makeEntry(file), (file.dec >> 5)*32);
    }
    dirSectors.forEach((bytes, i) => setup.writeSector(ddPosition(layout, layout.dirLump, 2 + i), bytes));
    for (const [position, bytes] of sectorData) {
        setup.writeSector(position, bytes);
    }
    setup.commit();

    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("The double-density test disk didn't decode");
    }
    return {disk, overlay, trsdos, makeWriter: () => new TrsdosWriter(trsdos, TrsdosRuleSet.MULTIDOS)};
}

/**
 * A disk to write, built by one of the builders above.
 */
interface Fixture {
    overlay: SectorOverlay;
    trsdos: Trsdos;
    makeWriter: () => TrsdosWriter;
}

/**
 * The kinds of test disk, to run each rule's test on.
 */
const FIXTURES: [string, () => Fixture][] = [
    ["single density", () => makeSdFixture()],
    ["P density", () => makeDdFixture(P_LAYOUT)],
    ["double-sided double density", () => makeDdFixture(DS_LAYOUT)],
];

/**
 * Parse a file name, failing the test if it's bad.
 */
function name(text: string): TrsdosFilename {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * Get a file, failing the test if it's missing.
 */
function getFile(source: Trsdos | TrsdosWriter, fileName: string): TrsdosDirEntry {
    const dirEntry = source.findFile(fileName);
    if (dirEntry === undefined) {
        throw new Error("No file " + fileName);
    }
    return dirEntry;
}

/**
 * Read a sector, failing the test if it's missing.
 */
function readBytes(volume: Trsdos["disk"], sectorPosition: SectorPosition): Uint8Array {
    const sector = volume.readSector(sectorPosition);
    if (sector === undefined) {
        throw new Error("Missing sector " + sectorPosition.key());
    }
    return sector.data;
}

/**
 * The 32 bytes of a file's directory entry, and where they are.
 */
function entryOf(trsdos: Trsdos, fileName: string): { bytes: Uint8Array, dec: number, position: SectorPosition, offset: number } {
    const slot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === fileName);
    if (slot === undefined) {
        throw new Error("No slot for " + fileName);
    }
    const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
    return {
        bytes: readBytes(trsdos.disk, sectorPosition).slice(offset, offset + 32),
        dec: slot.hitIndex,
        position: sectorPosition,
        offset,
    };
}

/**
 * Make test contents: a pattern that differs from byte to byte.
 */
function makeContents(size: number, seed = 1): Uint8Array {
    const contents = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        contents[i] = (i*7 + (i >> 8)*13 + seed*31) & 0xFF;
    }
    return contents;
}

/**
 * The layout and damage findings of a disk, which a write must not add.
 */
function problems(trsdos: Trsdos): string[] {
    return checkTrsdos(trsdos).findings
        .filter(finding => [TrsdosFindingSeverity.LAYOUT, TrsdosFindingSeverity.DAMAGE]
            .includes(trsdosFindingKindSeverity(finding.kind)))
        .map(finding => finding.message);
}

/**
 * The messages of a disk's unforceable UNSUPPORTED_LAYOUT blockers.
 */
function layoutBlockers(trsdos: Trsdos, ruleSet?: TrsdosRuleSet): string[] {
    return evaluateTrsdosWriteGate(trsdos, ruleSet).blockers
        .filter(blocker => blocker.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT && !blocker.forceable)
        .map(blocker => blocker.message);
}

describe("MultiDOS test disks", () => {
    it("decodes the single-density disk as MultiDOS 1.6, writable under its rules", () => {
        const {trsdos} = makeSdFixture();
        expect(trsdos.nameAndVersion).to.equal("MultiDOS 1.6");
        expect(trsdos.lumpsAreCylinders).to.be.true;
        expect(identifyTrsdosRuleSet(trsdos).ruleSet).to.equal(TrsdosRuleSet.MULTIDOS);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.MULTIDOS);
        expect(problems(trsdos)).to.eql([]);
    });

    it("decodes the P density disk with lumps after cylinder 0, writable under its rules", () => {
        const {trsdos} = makeDdFixture(P_LAYOUT);
        expect(trsdos.nameAndVersion).to.equal("MultiDOS 1.6");
        expect(trsdos.lumpsAreCylinders).to.be.false;
        expect(trsdos.firstDataCylinder).to.equal(1);
        expect(trsdos.lumpCount).to.equal(70);
        expect(trsdos.dirLumpNumber).to.equal(17);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(problems(trsdos)).to.eql([]);
    });

    it("decodes the double-sided disk as one volume of MultiDOS 1.7, writable under its rules", () => {
        const {trsdos} = makeDdFixture(DS_LAYOUT);
        expect(trsdos.nameAndVersion).to.equal("MultiDOS 1.7, 1.7.1 or 1.71");
        expect(trsdos.allocationSides).to.equal(2);
        expect(trsdos.granulesPerLump).to.equal(6);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(problems(trsdos)).to.eql([]);
    });
});

describe("multidosGatSize", () => {
    it("reads 0xCC and 0xCD as lumps and cylinders, or in LDOS's form", () => {
        const counts = makeSdFixture().trsdos;
        expect(multidosGatSize(counts, readBytes(counts.disk, counts.getGatPosition())))
            .to.eql({form: "counts", cylinderCount: 35});
        // 35 cylinders, single density, one side, two granules per track.
        const ldos = makeSdFixture([], {patch: gat => gat.set([0x00, 0x01], 0xCC)}).trsdos;
        expect(multidosGatSize(ldos, readBytes(ldos.disk, ldos.getGatPosition())))
            .to.eql({form: "ldos", cylinderCount: 35});
        const ds = makeDdFixture(DS_LAYOUT).trsdos;
        expect(multidosGatSize(ds, readBytes(ds.disk, ds.getGatPosition()))).to.eql({form: "ldos", cylinderCount: 40});
        // One MultiDOS 2.0 disk gives granules per cylinder, not per track.
        const perCylinder = makeDdFixture(DS_LAYOUT, {patch: gat => gat[0xCD] = 0x65}).trsdos;
        expect(multidosGatSize(perCylinder, readBytes(perCylinder.disk, perCylinder.getGatPosition())))
            .to.eql({form: "ldos", cylinderCount: 40});
    });

    it("rejects a GAT that describes another disk", () => {
        // 40 cylinders on a 35-cylinder image; 35 lumps but 40 cylinders; 70 lumps in LDOS's form on a P disk.
        for (const patch of [(gat: Uint8Array) => gat.set([40, 40], 0xCC), (gat: Uint8Array) => gat[0xCD] = 40,
            (gat: Uint8Array) => gat.set([0x00, 0x01], 0xCD)]) {
            const {trsdos} = makeSdFixture([], {patch});
            expect(multidosGatSize(trsdos, readBytes(trsdos.disk, trsdos.getGatPosition()))).to.be.undefined;
        }
        const p = makeDdFixture(P_LAYOUT, {patch: gat => gat.set([5, 0x41], 0xCC)}).trsdos;
        expect(multidosGatSize(p, readBytes(p.disk, p.getGatPosition()))).to.be.undefined;
        // The LDOS form with the wrong sides.
        const ds = makeDdFixture(DS_LAYOUT, {patch: gat => gat[0xCD] = 0x42}).trsdos;
        expect(multidosGatSize(ds, readBytes(ds.disk, ds.getGatPosition()))).to.be.undefined;
    });

    it("gives the disk's size from whichever form agrees", () => {
        const sd = makeSdFixture();
        expect(findTrsdosDiskSize(sd.trsdos, sd.disk)).to.eql({cylinderCount: 35, source: "GAT byte 0xCD"});
        const p = makeDdFixture(P_LAYOUT);
        expect(findTrsdosDiskSize(p.trsdos, p.disk)).to.eql({cylinderCount: 40, source: "GAT byte 0xCD"});
        const ds = makeDdFixture(DS_LAYOUT);
        expect(findTrsdosDiskSize(ds.trsdos, ds.disk)).to.eql({cylinderCount: 40, source: "GAT byte 0xCC"});
        const bad = makeSdFixture([], {patch: gat => gat.set([40, 40], 0xCC)});
        expect(findTrsdosDiskSize(bad.trsdos, bad.disk)).to.be.a("string");
    });
});

describe("The write gate on MultiDOS disks", () => {
    it("refuses a disk whose GAT contradicts its layout, even with --force", () => {
        const {trsdos} = makeSdFixture([], {patch: gat => gat.set([40, 40], 0xCC)});
        expect(layoutBlockers(trsdos)).to.have.length(1);
        expect(layoutBlockers(trsdos)[0]).to.contain("GAT bytes 0xCC and 0xCD (0x28 and 0x28)");
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.READ_ONLY);
        const good = makeSdFixture();
        expect(multidosLayoutProblem(good.trsdos, good.disk)).to.be.undefined;
    });

    it("refuses a two-sided image that allocates one side, since the second could be its own volume", () => {
        // The P layout's directory and files on a two-sided disk whose second side is blank.
        const {trsdos} = makeDdFixture(ONE_SIDE_OF_TWO_LAYOUT);
        expect(trsdos.allocationSides).to.equal(1);
        expect(layoutBlockers(trsdos)).to.eql(["The image has two sides but the disk allocates only the first, and " +
            "MultiDOS also makes disks with a directory on each side, so writing it isn't supported."]);
    });

    it("refuses a disk whose second side's IDs say side 0", () => {
        const {trsdos} = makeDdFixture(DS_LAYOUT, {sideOneSaysSideZero: true});
        expect(trsdos.allocationSides).to.equal(2);
        expect(layoutBlockers(trsdos)).to.eql(["Sectors on the second side say they're on side 0, as on a MultiDOS " +
            "disk with a directory on each side, so writing it isn't supported."]);
    });

    it("refuses the releases that it has no rules for, even with --dos multidos", () => {
        // MultiDOS 2.10's stub and GAT byte.
        const {trsdos} = makeDdFixture(DS_LAYOUT, {patch: gat => gat[0xCB] = 0xFF});
        expect(trsdos.nameAndVersion).to.equal("MultiDOS 2.10");
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(gate.blockers.map(blocker => blocker.kind)).to.eql([TrsdosWriteBlockerKind.UNSUPPORTED_DOS]);
        expect(layoutBlockers(trsdos, TrsdosRuleSet.MULTIDOS)).to.eql(["This disk says it's MultiDOS 2.10, and only " +
            "MultiDOS 1.x and 2.00 disks are written under MultiDOS's rules."]);
    });

    it("writes a MultiDOS disk under MultiDOS's rules only", () => {
        const {trsdos} = makeSdFixture();
        expect(layoutBlockers(trsdos, TrsdosRuleSet.LDOS_5)).to.eql(["This disk says it's MultiDOS 1.6, which is " +
            "written only under MultiDOS's rules (--dos multidos), not under --dos ldos-5."]);
        expect(evaluateTrsdosWriteGate(trsdos, TrsdosRuleSet.LDOS_5).access).to.equal(TrsdosWriteAccess.READ_ONLY);
        expect(evaluateTrsdosWriteGate(trsdos, TrsdosRuleSet.MULTIDOS).access).to.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("doesn't write another DOS's disk under MultiDOS's rules", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([]));
        expect(trsdos).to.not.be.undefined;
        expect(layoutBlockers(trsdos!, TrsdosRuleSet.MULTIDOS)).to.eql([`This disk says it's ${trsdos!.nameAndVersion}, ` +
            "and only MultiDOS 1.x and 2.00 disks are written under MultiDOS's rules."]);
        expect(evaluateTrsdosWriteGate(trsdos!, TrsdosRuleSet.MULTIDOS).access).to.equal(TrsdosWriteAccess.READ_ONLY);
    });
});

describe("multidosReservedDecs", () => {
    it("reserves entries 0 and 1 of the first 16 directory sectors and entries 6 and 7 of the last", () => {
        // 8 entry sectors.
        const sd = makeSdFixture().trsdos;
        expect(multidosReservedDecs(sd).sort((a, b) => a - b)).to.eql([
            0, 1, 2, 3, 4, 5, 6, 7, 32, 33, 34, 35, 36, 37, 38, 39, (6 << 5) | 7, (7 << 5) | 7]);
        expect([...reservedDecs(sd, TrsdosRuleSet.MULTIDOS)].sort((a, b) => a - b))
            .to.eql(multidosReservedDecs(sd).sort((a, b) => a - b));
        // 16 entry sectors.
        const ds = makeDdFixture(DS_LAYOUT).trsdos;
        const decs = multidosReservedDecs(ds);
        expect(decs).to.have.length(34);
        for (let sector = 0; sector < 16; sector++) {
            expect(decs).to.include(sector);
            expect(decs).to.include(32 | sector);
        }
        expect(decs).to.include.members([(6 << 5) | 15, (7 << 5) | 15]);
    });
});

for (const [label, make] of FIXTURES) {
    describe(`TrsdosWriter under MultiDOS rules, ${label}`, () => {
        it("adds a file with a MultiDOS date and blank passwords in an unreserved slot, and reads it back", () => {
            const {trsdos, makeWriter} = make();
            const writer = makeWriter();
            const contents = makeContents(3*256 + 10);
            const result = writer.addFile(name("NEWFILE/DAT"), contents, {date: new Date(1983, 4, 17)});
            expect(result.warning).to.be.undefined;
            const newTrsdos = writer.flush();

            const entry = entryOf(newTrsdos, "NEWFILE/DAT");
            expect(entry.bytes[0]).to.equal(0x10);
            expect(entry.bytes[1]).to.equal(5);
            expect(entry.bytes[2]).to.equal((17 << 3) | 3);
            expect([...entry.bytes.subarray(16, 20)]).to.eql([0x96, 0x42, 0x96, 0x42]);
            expect(multidosReservedDecs(trsdos)).to.not.include(entry.dec);
            const dirEntry = getFile(newTrsdos, "NEWFILE/DAT");
            expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
            expect(dirEntry.getDate()?.getFullYear()).to.equal(1983);
            expect(problems(newTrsdos)).to.eql([]);
        });

        it("adds a file with no date as zeros, and refuses a year that byte 2 can't hold", () => {
            const {makeWriter} = make();
            const writer = makeWriter();
            expect(() => writer.addFile(name("LATE/DAT"), makeContents(10), {date: new Date(1990, 0, 1)}))
                .to.throw(TrsdosWriteError, "give a date from 1980 to 1987");
            writer.addFile(name("UNDATED/DAT"), makeContents(10));
            const newTrsdos = writer.flush();
            const entry = entryOf(newTrsdos, "UNDATED/DAT").bytes;
            expect([entry[1], entry[2]]).to.eql([0, 0]);
        });

        it("doesn't write extended entries", () => {
            // Granule 0 of every lump used, so that a file of 6 granules needs 6 extents.
            const usedGranules: [number, number][] = [];
            for (let lump = 0; lump < 70; lump++) {
                usedGranules.push([lump, 0]);
            }
            const fixture = label === "single density" ?
                makeSdFixture([], {gatUsed: usedGranules.filter(([lump]) => lump < 35).map(([lump, granule]) => ({lump, granule}))}) :
                label === "P density" ? makeDdFixture(P_LAYOUT, {usedGranules}) :
                    makeDdFixture(DS_LAYOUT, {usedGranules: usedGranules.filter(([lump]) => lump < 40)
                        .flatMap(([lump]) => [0, 2, 4].map(granule => [lump, granule] as [number, number]))});
            const writer = fixture.makeWriter();
            const granuleSize = fixture.trsdos.sectorsPerGranule*256;
            expect(() => writer.addFile(name("BIG/DAT"), makeContents(6*granuleSize)))
                .to.throw(TrsdosWriteError, "MultiDOS's extended directory entries");
        });

        it("kills a file by changing only bit 4 of byte 0, the HIT byte and the GAT bits", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const hello = entryOf(trsdos, "HELLO/BAS");
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            const oldHit = readBytes(overlay, trsdos.getHitPosition()).slice();
            const oldDirSector = readBytes(overlay, hello.position).slice();
            const extent = [...trsdos.getFileExtents(getFile(trsdos, "HELLO/BAS"))][0];

            writer.deleteFile(getFile(writer, "HELLO/BAS"));
            const newTrsdos = writer.flush();
            expect(newTrsdos.findFile("HELLO/BAS")).to.be.undefined;

            const expectedDirSector = oldDirSector.slice();
            expectedDirSector[hello.offset] &= ~0x10;
            expect(readBytes(overlay, hello.position)).to.eql(expectedDirSector);
            const expectedHit = oldHit.slice();
            expectedHit[hello.dec] = 0;
            expect(readBytes(overlay, newTrsdos.getHitPosition())).to.eql(expectedHit);
            const expectedGat = oldGat.slice();
            for (let i = 0; i < extent.granuleCount; i++) {
                expectedGat[extent.cylinderNumber] &= ~(1 << (extent.granuleOffset + i));
            }
            expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(expectedGat);
            expect(problems(newTrsdos)).to.eql([]);
        });

        it("won't kill, rename, replace or change FORMAT's marker or DIR/SYS", () => {
            const {makeWriter} = make();
            const writer = makeWriter();
            const marker = writer.getFiles().find(dirEntry => dirEntry.rawFilename === MARKER);
            expect(marker).to.not.be.undefined;
            expect(() => writer.deleteFile(marker!)).to.throw(TrsdosWriteError, "can't be deleted");
            expect(() => writer.renameFile(marker!, name("FOO/BAR"))).to.throw(TrsdosWriteError, "can't be renamed");
            expect(() => writer.replaceFile(marker!, makeContents(10))).to.throw(TrsdosWriteError, "can't be replaced");
            expect(() => writer.setAttributes(marker!, {system: false})).to.throw(TrsdosWriteError, "not a file");
            expect(() => writer.setAttributes(marker!, {invisible: false})).to.throw(TrsdosWriteError, "not a file");
            expect(() => writer.deleteFile(getFile(writer, "DIR/SYS"))).to.throw(TrsdosWriteError, "can't be deleted");
            expect(writer.hasChanges()).to.be.false;
        });

        it("renames a file, changing only its name and HIT byte", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const hello = entryOf(trsdos, "HELLO/BAS");
            writer.renameFile(getFile(writer, "HELLO/BAS"), name("GREET/BAS"));
            const newTrsdos = writer.flush();

            const expected = hello.bytes.slice();
            expected.set([..."GREET   BAS"].map(c => c.charCodeAt(0)), 5);
            expect(readBytes(overlay, hello.position).slice(hello.offset, hello.offset + 32)).to.eql(expected);
            expect(readBytes(overlay, newTrsdos.getHitPosition())[hello.dec]).to.equal(hashForFilename("GREET   BAS"));
        });

        it("sets protection and invisibility, leaving bytes 1, 2 and 16-19, and refuses passwords and dates", () => {
            const {trsdos, makeWriter} = make();
            const oldEntry = entryOf(trsdos, "HELLO/BAS").bytes;
            const writer = makeWriter();
            const hello = getFile(writer, "HELLO/BAS");
            expect(() => writer.setAttributes(hello, {updatePassword: "SECRET"})).to.throw(TrsdosWriteError, "passwords");
            expect(() => writer.setAttributes(hello, {accessPassword: ""})).to.throw(TrsdosWriteError, "passwords");
            expect(() => writer.setAttributes(hello, {date: new Date(1983, 1, 20)})).to.throw(TrsdosWriteError, "date");
            expect(() => writer.setAttributes(hello, {date: null})).to.throw(TrsdosWriteError, "date");
            writer.setAttributes(hello, {protectionLevel: 5, invisible: true});
            const newTrsdos = writer.flush();
            const entry = entryOf(newTrsdos, "HELLO/BAS").bytes;
            expect(entry[0]).to.equal(0x10 | 0x08 | 5);
            expect([...entry.subarray(1, 32)]).to.eql([...oldEntry.subarray(1, 32)]);
        });

        it("keeps a replaced file's bytes 1, 2 and 16-19, ignoring a date with a warning", () => {
            const {trsdos, makeWriter} = make();
            const oldEntry = entryOf(trsdos, "HELLO/BAS").bytes;
            const writer = makeWriter();
            const contents = makeContents(700);
            const result = writer.replaceFile(getFile(writer, "HELLO/BAS"), contents, {date: new Date(1984, 1, 1)});
            expect(result.warning).to.contain("the date was ignored");
            const newTrsdos = writer.flush();
            const entry = entryOf(newTrsdos, "HELLO/BAS").bytes;
            expect([entry[1], entry[2]]).to.eql([oldEntry[1], oldEntry[2]]);
            expect([...entry.subarray(16, 20)]).to.eql([...oldEntry.subarray(16, 20)]);
            expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        });

        it("changes the disk's name in its own case, its date and password, but not its AUTO command", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            expect(() => writer.setDiskInfo({autoCommand: "DIR"})).to.throw(TrsdosWriteError, "AUTO command");
            writer.setDiskInfo({name: "MyDisk", date: new Date(1984, 9, 7), masterPassword: "PASSWORD"});
            const newTrsdos = writer.flush();
            const info = readTrsdosDiskInfo(newTrsdos, TrsdosRuleSet.MULTIDOS);
            expect(info).to.not.be.a("string");
            expect(info).to.include({name: "MyDisk", date: "10/07/84"});
            const gat = readBytes(overlay, newTrsdos.getGatPosition());
            expect(gat.subarray(0, 0xCE)).to.eql(oldGat.subarray(0, 0xCE));
            expect(gat.subarray(0xE0)).to.eql(oldGat.subarray(0xE0));
        });

        it("never frees unclaimed granules on repair", () => {
            const {overlay, trsdos, makeWriter} = label === "single density" ?
                makeSdFixture([], {gatUsed: [{lump: 30, granule: 1}]}) :
                makeDdFixture(label === "P density" ? P_LAYOUT : DS_LAYOUT, {usedGranules: [[30, 1]]});
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            const writer = makeWriter();
            const result = writer.repair({freeUnclaimed: true});
            expect(result.keptUnclaimed.map(granule => [granule.lump, granule.granule])).to.deep.include([30, 1]);
            expect(result.changes).to.eql([]);
            writer.flush();
            expect(readBytes(overlay, trsdos.getGatPosition())).to.eql(oldGat);
        });
    });
}

describe("TrsdosWriter under MultiDOS rules, P density's GAT", () => {
    it("doesn't read GAT bytes 0x60 on as a lockout table, so every free granule can be allocated", () => {
        const {trsdos, makeWriter} = makeDdFixture(P_LAYOUT);
        // FORMAT leaves 0xFF from 0x60, which as a lockout table would lock out every lump.
        expect(readBytes(trsdos.disk, trsdos.getGatPosition())[0x60]).to.equal(0xFF);
        const writer = makeWriter();
        // 70 lumps of 2 granules, less the directory's 2 and HELLO/BAS's 2.
        const freeGranules = 70*2 - 4;
        const contents = makeContents(4*5*256);
        writer.addFile(name("FOUR/DAT"), contents);
        const newTrsdos = writer.flush();
        expect(newTrsdos.readFile(getFile(newTrsdos, "FOUR/DAT"))).to.eql(contents);
        const gat = readBytes(newTrsdos.disk, newTrsdos.getGatPosition());
        let used = 0;
        for (let lump = 0; lump < 70; lump++) {
            used += (gat[lump] & 1) + ((gat[lump] >> 1) & 1);
        }
        expect(140 - used).to.equal(freeGranules - 4);
        expect(gat.subarray(0x60, 0xC0).every(byte => byte === 0xFF)).to.be.true;
    });
});
