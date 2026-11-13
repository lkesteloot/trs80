import {describe, expect, it} from "vitest";
import {makeBlankFloppy} from "./DmkBuilder.js";
import {SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {LDOS_DD_TRACK_LAYOUT} from "./TrackLayout.js";
import {
    decodeTrsdos,
    hashForFilename,
    TRSDOS_BLANK_PASSWORD_HASH,
    type Trsdos,
    type TrsdosDirEntry,
    TrsdosVersion,
} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {readTrsdosDiskInfo} from "./TrsdosDiskInfo.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {
    newdos80DirectorySizeRecorded,
    newdos80DosLumpCount,
    newdos80IsVersion1,
    newdos80GranuleNeverAllocated,
    newdos80IsSystemDisk,
    newdos80LayoutProblem,
} from "./TrsdosNewdos80.js";
import {identifyTrsdosRuleSet, TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {makeTrsdos23TestDisk, type TestFile} from "./TrsdosTestDisk.js";
import {evaluateTrsdosWriteGate, TrsdosWriteAccess, TrsdosWriteBlockerKind} from "./TrsdosWriteGate.js";
import {TrsdosWriteError, TrsdosWriter} from "./TrsdosWriter.js";

/**
 * The sectors per track, and the first sector of the directory, of the double-density test disk. The
 * directory is at lump 17 of 10-sector lumps, which is linear sector 170 (cylinder 9, sector 8).
 */
const DD_SECTORS_PER_TRACK = 18;
const DD_SECTORS_PER_LUMP = 10;
const DD_DIR_LUMP = 17;
const DD_DIR_FIRST_SECTOR = DD_DIR_LUMP*DD_SECTORS_PER_LUMP;

/**
 * Slot 0 of a PDRIVE table that agrees with the double-density test disk of 40 cylinders (72 lumps), as
 * Pdrive.spec.ts has it: TI=A, TD=E, TC=40, SPT=18, TSR=3, GPL=2, DDSL=17, DDGA=2.
 */
const PDRIVE_40 = [0x11, 0x48, 0x07, 0x28, 0x12, 0x02, 0xFE, 0x01, 0x11, 0x02, 0x00, 0x00, 0x03, 0x01, 0x00, 0x04];

/**
 * The same for the disk of 60 cylinders (108 lumps).
 */
const PDRIVE_60 = [0x11, 0x6C, 0x07, 0x3C, 0x12, 0x02, 0xFE, 0x01, 0x11, 0x02, 0x00, 0x00, 0x03, 0x01, 0x00, 0x04];

/**
 * Where the boot sector's NEWDOS/80 version 2 prefix, which also holds the directory lump at byte 2.
 */
const BOOT_PREFIX = [0x00, 0xFE, DD_DIR_LUMP, 0xF3, 0x11, 0x05, 0x00, 0xD9, 0x31, 0xE0, 0x41, 0x21, 0xFF, 0x51,
    0xCD, 0x45, 0x43];

/**
 * A file in the double-density test disk: one extent.
 */
interface DdFile {
    /** The raw 11-character name. */
    rawName: string;
    /** The DEC (HIT index) of its slot. */
    dec: number;
    /** The entry's byte 0. */
    flags: number;
    /** Its extent. */
    lump: number;
    granule: number;
    granuleCount: number;
    /** The size in bytes, or undefined if it has no data of its own. */
    size: number;
    /** The byte that fills its data sectors, or undefined to write none. */
    fill: number | undefined;
}

/**
 * The files of the double-density test disk: BOOT/SYS and DIR/SYS in their slots, and one user file whose
 * extent crosses a track boundary (lump 5 is linear sectors 50 to 59: cylinder 2, sector 14, to cylinder 3,
 * sector 5).
 */
const DD_FILES: DdFile[] = [
    {rawName: "BOOT    SYS", dec: 0, flags: 0x58, lump: 0, granule: 0, granuleCount: 1, size: 0, fill: undefined},
    {rawName: "DIR     SYS", dec: 1, flags: 0x58, lump: DD_DIR_LUMP, granule: 0, granuleCount: 2, size: 0, fill: undefined},
    {rawName: "HELLO   BAS", dec: 0x40, flags: 0x10, lump: 5, granule: 0, granuleCount: 2, size: 2000, fill: 0x48},
];

/**
 * Options for the double-density test disk.
 */
interface DdOptions {
    /** Cylinders, default 40, which is 72 lumps. With 60, it has 108. */
    cylinders?: number;
    /** The first 16 bytes of the PDRIVE table (sector 2 of cylinder 0), or none. */
    pdrive?: number[];
    /** The GAT's byte 0xCB, default 0x82. */
    gatVersion?: number;
    /** Lumps to mark entirely used in the GAT. */
    usedLumps?: number[];
    /** Granules to mark used in the GAT, as [lump, granule]. */
    usedGranules?: [number, number][];
    /** A change to the GAT and the HIT before they're written. */
    patch?: (gat: Uint8Array, hit: Uint8Array) => void;
}

/**
 * Where a linear sector of the double-density test disk is: one side, 18 sectors numbered from 0.
 */
function ddPosition(linearSector: number): SectorPosition {
    return SectorPosition.make(Math.floor(linearSector/DD_SECTORS_PER_TRACK), 0, linearSector % DD_SECTORS_PER_TRACK);
}

/**
 * Make a 32-byte directory entry as NEWDOS/80 writes it: in use, byte 1 = 0x20, no date.
 */
function makeEntry(file: DdFile): Uint8Array {
    const entry = new Uint8Array(32).fill(0xFF);
    const sectors = Math.ceil(file.size/256);
    entry.set([file.flags, 0x20, 0, file.size % 256, 0], 0);
    entry.set([...file.rawName].map(c => c.charCodeAt(0)), 5);
    entry.set([TRSDOS_BLANK_PASSWORD_HASH & 0xFF, TRSDOS_BLANK_PASSWORD_HASH >> 8,
        TRSDOS_BLANK_PASSWORD_HASH & 0xFF, TRSDOS_BLANK_PASSWORD_HASH >> 8, sectors & 0xFF, sectors >> 8], 16);
    entry.set([file.lump, (file.granule << 5) | (file.granuleCount - 1)], 22);
    return entry;
}

/**
 * Make a single-sided double-density NEWDOS/80 version 2 disk with 18 256-byte sectors per track, numbered from 0,
 * whose lumps (10 sectors) aren't cylinders. The directory is two granules at lump 17, with the GAT's
 * existence table (when it has 96 lumps or fewer) and the files of {@link DD_FILES}.
 *
 * @param options what to change.
 * @return the disk, committed, and its overlay and decoded file system.
 */
function makeDdFixture(options: DdOptions = {}) {
    const cylinders = options.cylinders ?? 40;
    const lumpCount = Math.floor(cylinders*DD_SECTORS_PER_TRACK/DD_SECTORS_PER_LUMP);
    const disk = makeBlankFloppy(LDOS_DD_TRACK_LAYOUT, cylinders, 1);
    if (disk === undefined) {
        throw new Error("Can't make the test disk");
    }

    const gat = new Uint8Array(256).fill(0xFF);
    const hit = new Uint8Array(256);
    const entries = new Map<number, Uint8Array>();
    const sectorData: [number, Uint8Array][] = [];
    for (let lump = 0; lump < lumpCount; lump++) {
        gat[lump] = 0xFC;
        if (lumpCount <= 96) {
            gat[0x60 + lump] = 0xFC;
        }
    }
    const markUsed = (lump: number, granule: number) => {
        gat[lump] |= 1 << granule;
    };
    for (const file of DD_FILES) {
        entries.set(file.dec, makeEntry(file));
        hit[file.dec] = hashForFilename(file.rawName);
        for (let i = 0; i < file.granuleCount; i++) {
            markUsed(file.lump, file.granule + i);
        }
        if (file.fill !== undefined) {
            const first = file.lump*DD_SECTORS_PER_LUMP + file.granule*5;
            for (let s = 0; s < Math.ceil(file.size/256); s++) {
                sectorData.push([first + s, new Uint8Array(256).fill(file.fill)]);
            }
        }
    }
    for (const lump of options.usedLumps ?? []) {
        gat[lump] = 0xFF;
    }
    for (const [lump, granule] of options.usedGranules ?? []) {
        markUsed(lump, granule);
    }

    // The disk's information.
    gat[0xCB] = options.gatVersion ?? 0x82;
    gat.set([0xE0, 0x42], 0xCE);
    gat.set([..."TESTDISK"].map(c => c.charCodeAt(0)), 0xD0);
    gat.set([..."00/00/00"].map(c => c.charCodeAt(0)), 0xD8);
    gat.fill(0xFF, 0xE0, 0x100);
    gat[0xE0] = 0x0D;
    options.patch?.(gat, hit);

    const setup = new SectorOverlay(disk);
    const boot = new Uint8Array(256);
    boot.set(BOOT_PREFIX);
    setup.writeSector(ddPosition(0), boot);
    // BOOT/SYS's other sectors, which hold no table unless we say so.
    for (let s = 1; s < 5; s++) {
        setup.writeSector(ddPosition(s), new Uint8Array(256));
    }
    if (options.pdrive !== undefined) {
        const table = new Uint8Array(256);
        table.set(options.pdrive);
        setup.writeSector(ddPosition(2), table);
    }
    setup.writeSector(ddPosition(DD_DIR_FIRST_SECTOR), gat);
    setup.writeSector(ddPosition(DD_DIR_FIRST_SECTOR + 1), hit);
    const dirSectors = Array.from({length: 8}, () => new Uint8Array(256));
    for (const [dec, entry] of entries) {
        dirSectors[dec & 0x1F].set(entry, (dec >> 5)*32);
    }
    dirSectors.forEach((bytes, i) => setup.writeSector(ddPosition(DD_DIR_FIRST_SECTOR + 2 + i), bytes));
    for (const [linear, bytes] of sectorData) {
        setup.writeSector(ddPosition(linear), bytes);
    }
    setup.commit();

    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("The double-density test disk didn't decode");
    }
    return {disk, overlay, trsdos, makeWriter: () => new TrsdosWriter(trsdos, TrsdosRuleSet.NEWDOS_80)};
}

/**
 * Make the single-density, cylinder-lump test disk: the TRSDOS 2.3 builder's disk with NEWDOS/80 version 2's GAT
 * byte. It has a user file at DEC 0x40, and any files given.
 *
 * @param files more files (the builder's system files are BOOT/SYS and DIR/SYS).
 * @param options a GAT version byte, and more.
 */
function makeSdFixture(files: TestFile[] = [], options: {dosVersion?: number, gatUsed?: {lump: number, granule: number}[], lockedOut?: number[]} = {}) {
    const disk = makeTrsdos23TestDisk([
        {name: "HELLO/BAS", extents: [{lump: 5, granuleOffset: 0, granuleCount: 2}], size: 2000},
        ...files,
    ], {dosVersion: options.dosVersion ?? 0x82, gatUsed: options.gatUsed, lockedOut: options.lockedOut});
    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("The single-density test disk didn't decode");
    }
    return {disk, overlay, trsdos, makeWriter: () => new TrsdosWriter(trsdos, TrsdosRuleSet.NEWDOS_80)};
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
 * Both kinds of test disk, to run each rule's test on.
 */
const FIXTURES: [string, () => Fixture][] = [
    ["single density, cylinder lumps", () => makeSdFixture()],
    ["double density, lumps that aren't cylinders", () => makeDdFixture()],
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
 * The messages of a disk's UNSUPPORTED_LAYOUT blockers.
 */
function layoutBlockers(trsdos: Trsdos, ruleSet?: TrsdosRuleSet): string[] {
    return evaluateTrsdosWriteGate(trsdos, ruleSet).blockers
        .filter(blocker => blocker.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT)
        .map(blocker => blocker.message);
}

describe("NEWDOS/80 test disks", () => {
    it("decodes the single-density disk as NEWDOS/80 version 2, writable under its rules", () => {
        const {trsdos} = makeSdFixture();
        expect(trsdos.nameAndVersion).to.equal("NEWDOS/80 v2.0, v2.5 or v2.74");
        expect(trsdos.lumpsAreCylinders).to.be.true;
        expect(identifyTrsdosRuleSet(trsdos).ruleSet).to.equal(TrsdosRuleSet.NEWDOS_80);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.NEWDOS_80);
    });

    it("decodes the double-density disk with lumps that aren't cylinders, writable under its rules", () => {
        const {trsdos} = makeDdFixture();
        expect(trsdos.nameAndVersion).to.equal("NEWDOS/80 v2.0, v2.5 or v2.74");
        expect(trsdos.version).to.equal(TrsdosVersion.V2_3);
        expect(trsdos.lumpsAreCylinders).to.be.false;
        expect(trsdos.lumpCount).to.equal(72);
        expect(trsdos.dirLumpNumber).to.equal(DD_DIR_LUMP);
        const gate = evaluateTrsdosWriteGate(trsdos);
        expect(gate.blockers).to.eql([]);
        expect(gate.access).to.equal(TrsdosWriteAccess.WRITABLE);
        expect(gate.ruleSet).to.equal(TrsdosRuleSet.NEWDOS_80);
        expect(problems(trsdos)).to.eql([]);
    });

    it("tells the helper functions about the disks", () => {
        const {trsdos} = makeDdFixture();
        expect(newdos80LayoutProblem(trsdos)).to.be.undefined;
        expect(newdos80DirectorySizeRecorded(trsdos)).to.be.true;
        expect(newdos80DosLumpCount(trsdos)).to.equal(72);
        expect(newdos80IsSystemDisk(trsdos)).to.be.false;
        const gat = readBytes(trsdos.disk, trsdos.getGatPosition());
        // An existing granule, a granule past the disk, and one marked non-existent.
        expect(newdos80GranuleNeverAllocated(trsdos, gat, 72, 3, 1)).to.be.false;
        expect(newdos80GranuleNeverAllocated(trsdos, gat, 72, 72, 0)).to.be.true;
        const marked = gat.slice();
        marked[0x60 + 3] |= 0x02;
        expect(newdos80GranuleNeverAllocated(trsdos, marked, 72, 3, 1)).to.be.true;
        expect(newdos80GranuleNeverAllocated(trsdos, marked, 72, 3, 0)).to.be.false;
    });
});

for (const [label, make] of FIXTURES) {
    describe(`TrsdosWriter under NEWDOS/80 rules, ${label}`, () => {
        it("adds a file with byte 1 = 0x20, byte 2 = 0, and its size, and reads it back", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            const contents = makeContents(3*256 + 10);
            const result = writer.addFile(name("NEWFILE/DAT"), contents);
            expect(result.warning).to.be.undefined;
            const newTrsdos = writer.flush();

            const entry = entryOf(newTrsdos, "NEWFILE/DAT");
            expect(entry.bytes[0]).to.equal(0x10);
            expect(entry.bytes[1]).to.equal(0x20);
            expect(entry.bytes[2]).to.equal(0);
            // The EOF offset in the last sector, and the sector count, which includes that partial sector.
            expect(entry.bytes[3]).to.equal(10);
            expect([entry.bytes[20], entry.bytes[21]]).to.eql([4, 0]);
            expect(newTrsdos.readFile(getFile(newTrsdos, "NEWFILE/DAT"))).to.eql(contents);

            // Granule bits in the lump bytes only, which is one granule here.
            const gat = readBytes(overlay, newTrsdos.getGatPosition());
            const changed = [...gat].map((byte, i) => byte !== oldGat[i] ? i : -1).filter(i => i >= 0);
            const extent = [...newTrsdos.getFileExtents(getFile(newTrsdos, "NEWFILE/DAT"))][0];
            expect(changed).to.eql([extent.cylinderNumber]);
            expect(gat[extent.cylinderNumber] & (1 << extent.granuleOffset)).to.not.equal(0);
            expect(problems(newTrsdos)).to.eql([]);
        });

        it("ignores a date, with a warning, and leaves the entry's bytes 1 and 2 alone", () => {
            const {makeWriter} = make();
            const writer = makeWriter();
            const result = writer.addFile(name("DATED/DAT"), makeContents(100), {date: new Date(1982, 3, 5)});
            expect(result.warning).to.contain("don't store file dates");
            const newTrsdos = writer.flush();
            const entry = entryOf(newTrsdos, "DATED/DAT").bytes;
            expect([entry[1], entry[2]]).to.eql([0x20, 0]);
        });

        it("writes a file that needs an extended entry, in the LDOS form", () => {
            // Granule 0 of every lump used, so every free granule is a run of one.
            const usedGranules: [number, number][] = [];
            for (let lump = 1; lump < 72; lump++) {
                usedGranules.push([lump, 0]);
            }
            const {overlay, makeWriter} = label.startsWith("single") ?
                makeSdFixture([], {gatUsed: usedGranules.filter(([lump]) => lump < 35).map(([lump, granule]) => ({lump, granule}))}) :
                makeDdFixture({usedGranules});
            const writer = makeWriter();
            const contents = makeContents(6*5*256);
            writer.addFile(name("BIG/DAT"), contents);
            const newTrsdos = writer.flush();

            const primary = entryOf(newTrsdos, "BIG/DAT");
            const dirEntry = getFile(newTrsdos, "BIG/DAT");
            expect([...newTrsdos.getFileExtents(dirEntry)].length).to.equal(6);
            expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
            const slots = newTrsdos.getDirectory().slots;
            const extended = slots.find(slot => slot.dirEntry.isExtendedEntry() && slot.hitIndex !== primary.dec &&
                slot.dirEntry.prevDec === primary.dec);
            expect(extended).to.not.be.undefined;
            const {sectorPosition, offset} = newTrsdos.getDirEntryLocation(extended!.hitIndex);
            const fxde = readBytes(overlay, sectorPosition).slice(offset, offset + 32);
            expect(fxde[0]).to.equal(0x90);
            expect(fxde[1]).to.equal(primary.dec);
            expect([...fxde.subarray(2, 22)]).to.eql(new Array(20).fill(0));
            expect(readBytes(overlay, newTrsdos.getHitPosition())[extended!.hitIndex])
                .to.equal(hashForFilename("BIG     DAT"));
            expect(problems(newTrsdos)).to.eql([]);
        });

        it("kills a file by changing only bit 4 of byte 0, the HIT byte and the GAT bits", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const hello = entryOf(trsdos, "HELLO/BAS");
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            const oldHit = readBytes(overlay, trsdos.getHitPosition()).slice();
            const oldDirSector = readBytes(overlay, hello.position).slice();

            writer.deleteFile(getFile(writer, "HELLO/BAS"));
            const newTrsdos = writer.flush();
            expect(newTrsdos.findFile("HELLO/BAS")).to.be.undefined;

            const expectedDirSector = oldDirSector.slice();
            expectedDirSector[hello.offset] &= ~0x10;
            expect(readBytes(overlay, hello.position)).to.eql(expectedDirSector);
            const expectedHit = oldHit.slice();
            expectedHit[hello.dec] = 0;
            expect(readBytes(overlay, newTrsdos.getHitPosition())).to.eql(expectedHit);
            // Lump 5, both granules.
            const expectedGat = oldGat.slice();
            expectedGat[5] = 0xFC;
            expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(expectedGat);
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

        it("sets protection and invisibility, and refuses a date", () => {
            const {trsdos, makeWriter} = make();
            const oldEntry = entryOf(trsdos, "HELLO/BAS").bytes;
            const writer = makeWriter();
            expect(() => writer.setAttributes(getFile(writer, "HELLO/BAS"), {date: new Date(1983, 1, 20)}))
                .to.throw(TrsdosWriteError, "don't store file dates");
            writer.setAttributes(getFile(writer, "HELLO/BAS"), {protectionLevel: 5, invisible: true});
            const newTrsdos = writer.flush();
            const entry = entryOf(newTrsdos, "HELLO/BAS").bytes;
            expect(entry[0]).to.equal(0x10 | 0x08 | 5);
            expect([entry[1], entry[2]]).to.eql([oldEntry[1], oldEntry[2]]);
        });

        it("changes the disk's name, date, password and AUTO command in the GAT only, with 0xFF after the AUTO command", () => {
            const {overlay, trsdos, makeWriter} = make();
            const writer = makeWriter();
            const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
            const oldBoot = readBytes(overlay, SectorPosition.make(0, 0, 0)).slice();
            const oldSector2 = readBytes(overlay, SectorPosition.make(0, 0, 2)).slice();
            writer.setDiskInfo({name: "mydisk", date: new Date(1984, 9, 7), masterPassword: "PASSWORD", autoCommand: "BASIC"});
            const newTrsdos = writer.flush();

            const info = readTrsdosDiskInfo(newTrsdos, TrsdosRuleSet.NEWDOS_80);
            expect(info).to.not.be.a("string");
            expect(info).to.include({name: "MYDISK", date: "10/07/84", autoCommand: "BASIC"});
            const gat = readBytes(overlay, newTrsdos.getGatPosition());
            expect(new TextDecoder().decode(gat.subarray(0xE0, 0xE6))).to.equal("BASIC\r");
            expect(gat.subarray(0xE6).every(byte => byte === 0xFF)).to.be.true;
            expect(gat.subarray(0, 0xCE)).to.eql(oldGat.subarray(0, 0xCE));
            expect(readBytes(overlay, SectorPosition.make(0, 0, 0))).to.eql(oldBoot);
            expect(readBytes(overlay, SectorPosition.make(0, 0, 2))).to.eql(oldSector2);
        });

        it("frees unclaimed granules on repair, except those that don't exist", () => {
            // Lump 30 granule 1 is used and unclaimed. Lump 31 is used, unclaimed, and doesn't exist.
            const {overlay, trsdos, makeWriter} = label.startsWith("single") ?
                makeSdFixture([], {gatUsed: [{lump: 30, granule: 1}], lockedOut: [31]}) :
                makeDdFixture({
                    patch: gat => {
                        gat[30] |= 0x02;
                        gat[31] = 0xFF;
                        gat[0x60 + 31] = 0xFF;
                    },
                });
            const gatPosition = trsdos.getGatPosition();
            const oldGat = readBytes(overlay, gatPosition).slice();
            const writer = makeWriter();
            const result = writer.repair({freeUnclaimed: true});
            expect(result.keptUnclaimed.map(granule => granule.lump)).to.include(31);
            writer.flush();
            const newGat = readBytes(overlay, gatPosition);
            expect(newGat[30] & 0x02).to.equal(0);
            expect(newGat[31]).to.equal(0xFF);
            expect(newGat.subarray(0x60)).to.eql(oldGat.subarray(0x60));
        });

        it("leaves DIR/SYS's HIT byte 0x2C alone, and the disk writable", () => {
            const {overlay, trsdos, makeWriter} = make();
            const hitPosition = trsdos.getHitPosition();
            const oldHash = readBytes(overlay, hitPosition)[1];
            expect([0x2C, hashForFilename("DIR     SYS")]).to.include(oldHash);
            expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);

            const writer = makeWriter();
            writer.addFile(name("A/DAT"), makeContents(10));
            writer.deleteFile(getFile(writer, "HELLO/BAS"));
            const newTrsdos = writer.flush();
            expect(readBytes(overlay, hitPosition)[1]).to.equal(oldHash);

            // A repair is a change of its own.
            const repairWriter = new TrsdosWriter(newTrsdos, TrsdosRuleSet.NEWDOS_80);
            repairWriter.repair();
            repairWriter.flush();
            expect(readBytes(overlay, hitPosition)[1]).to.equal(oldHash);
        });
    });
}

describe("NEWDOS/80 directory slots", () => {
    it("never puts a file in a system file's slot on a system disk", () => {
        const system = makeTrsdos23TestDisk([
            {name: "SYS0/SYS", extents: [{lump: 2, granuleOffset: 0, granuleCount: 1}], system: true, invisible: true, dec: 2},
            {name: "SYS6/SYS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 1}], system: true, invisible: true, dec: 0x20},
        ], {dosVersion: 0x82});
        const trsdos = decodeTrsdos(new SectorOverlay(system))!;
        expect(newdos80IsSystemDisk(trsdos)).to.be.true;
        expect(evaluateTrsdosWriteGate(trsdos).ruleSet).to.equal(TrsdosRuleSet.NEWDOS_80);

        const writer = new TrsdosWriter(trsdos, TrsdosRuleSet.NEWDOS_80);
        writer.addFile(name("USER/DAT"), makeContents(100));
        const newTrsdos = writer.flush();
        const reserved = new Set<number>();
        for (const row of [0, 0x20, 0x40, 0x60]) {
            for (let column = 0; column < 8; column++) {
                reserved.add(row + column);
            }
        }
        const dec = entryOf(newTrsdos, "USER/DAT").dec;
        expect(reserved.has(dec)).to.be.false;
        // Entry 4 of the first directory sector is the first slot past the four rows.
        expect(dec).to.equal(0x80);
    });

    it("puts the first file on a data disk in DEC 2", () => {
        for (const [, make] of FIXTURES) {
            const {trsdos, makeWriter} = make();
            expect(newdos80IsSystemDisk(trsdos)).to.be.false;
            const writer = makeWriter();
            writer.addFile(name("FIRST/DAT"), makeContents(100));
            expect(entryOf(writer.flush(), "FIRST/DAT").dec).to.equal(2);
        }
    });
});

describe("NEWDOS/80 granule existence table", () => {
    it("refuses a disk whose existence table has a bit that the allocation table doesn't", () => {
        const {trsdos} = makeDdFixture({
            patch: gat => {
                gat[0x60 + 30] = 0xFE;
            },
        });
        const messages = layoutBlockers(trsdos);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("lump 30");
        expect(evaluateTrsdosWriteGate(trsdos).access).to.not.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("accepts a granule that doesn't exist, whose allocation bit is also set", () => {
        const {trsdos} = makeDdFixture({
            patch: gat => {
                gat[30] = 0xFF;
                gat[0x60 + 30] = 0xFE;
            },
        });
        expect(layoutBlockers(trsdos)).to.eql([]);
    });
});

describe("NEWDOS/80 disks with more than 96 lumps", () => {
    it("writes a data disk with no PDRIVE table whose GAT ends where the image does, into lumps past 96", () => {
        const usedLumps = Array.from({length: 96}, (_, lump) => lump);
        const {overlay, trsdos, makeWriter} = makeDdFixture({cylinders: 60, usedLumps: usedLumps.filter(lump => lump < 90)});
        expect(trsdos.lumpCount).to.equal(108);
        expect(layoutBlockers(trsdos)).to.eql([]);
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);

        // Fill lumps 90-95, so that the next file goes past 96.
        const writer = makeWriter();
        writer.addFile(name("FILL/DAT"), makeContents(6*2*5*256));
        const contents = makeContents(3000, 2);
        writer.addFile(name("HIGH/DAT"), contents);
        const newTrsdos = writer.flush();
        const dirEntry = getFile(newTrsdos, "HIGH/DAT");
        const extent = [...newTrsdos.getFileExtents(dirEntry)][0];
        expect(extent.cylinderNumber).to.equal(96);
        expect(readBytes(overlay, newTrsdos.getGatPosition())[96]).to.equal(0xFF);
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
        expect(problems(newTrsdos)).to.eql([]);
    });

    it("refuses a smaller disk imaged with extra cylinders, whose GAT doesn't end where the image does", () => {
        // A 72-lump disk's GAT, as FORMAT writes it, on an image of 108 lumps: its existence table at 0x60 reads
        // as free lumps 96-107, but bytes past those aren't 0xFF.
        const {trsdos} = makeDdFixture({
            cylinders: 60,
            patch: gat => {
                gat.fill(0xFF, 72, 0xC0);
                gat.fill(0xFC, 0x60, 0x60 + 72);
            },
        });
        expect(newdos80LayoutProblem(trsdos)).to.contain("doesn't end at lump 107");
    });

    it("refuses a GAT that also reads as a smaller disk's with an existence table", () => {
        // A 12-lump disk's GAT on an image of 108 lumps: bytes 0x60-0x6B (its existence table) read as free lumps
        // 96-107, and everything after is 0xFF, so only the existence-table reading tells it apart.
        const {trsdos} = makeDdFixture({
            cylinders: 60,
            patch: gat => {
                gat.fill(0xFF, 12, 0xC0);
                gat.fill(0xFC, 0x60, 0x60 + 12);
            },
        });
        expect(newdos80LayoutProblem(trsdos)).to.contain("reads as that of a 12-lump disk");
    });

    it("refuses a disk with no PDRIVE table whose last lump is full", () => {
        const {trsdos} = makeDdFixture({cylinders: 60, usedLumps: [107]});
        expect(newdos80LayoutProblem(trsdos)).to.contain("doesn't end at lump 107");
    });

    it("writes one with a matching PDRIVE table, into lumps past 96", () => {
        const usedLumps = Array.from({length: 96}, (_, lump) => lump);
        const {overlay, trsdos, makeWriter} = makeDdFixture({cylinders: 60, pdrive: PDRIVE_60, usedLumps});
        expect(layoutBlockers(trsdos)).to.eql([]);
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);

        const writer = makeWriter();
        const contents = makeContents(300);
        writer.addFile(name("HIGH/DAT"), contents);
        const newTrsdos = writer.flush();
        const dirEntry = getFile(newTrsdos, "HIGH/DAT");
        const extent = [...newTrsdos.getFileExtents(dirEntry)][0];
        expect(extent.cylinderNumber).to.be.at.least(96);
        expect(readBytes(overlay, newTrsdos.getGatPosition())[extent.cylinderNumber]).to.not.equal(0xFC);
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
    });

    it("never allocates lumps that the PDRIVE table doesn't count", () => {
        // The table says 100 lumps (TC=56), so lumps 100 to 107 are the drive's no more, though the GAT says free.
        const table = PDRIVE_60.slice();
        table[1] = 100;
        table[3] = 56;
        const usedLumps = Array.from({length: 100}, (_, lump) => lump);
        const {trsdos, makeWriter} = makeDdFixture({cylinders: 60, pdrive: table, usedLumps});
        expect(newdos80DosLumpCount(trsdos)).to.equal(100);
        expect(layoutBlockers(trsdos)).to.eql([]);
        expect(() => makeWriter().addFile(name("NOROOM/DAT"), makeContents(100))).to.throw(TrsdosWriteError);
    });

    it("refuses a table whose lump count is on the other side of 96", () => {
        const table = PDRIVE_60.slice();
        table[1] = 72;
        const {trsdos} = makeDdFixture({cylinders: 60, pdrive: table});
        const messages = layoutBlockers(trsdos);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("72 lumps");
    });
});

describe("NEWDOS/80 PDRIVE table disagreements", () => {
    it("writes a disk whose table agrees", () => {
        const {trsdos} = makeDdFixture({pdrive: PDRIVE_40});
        expect(layoutBlockers(trsdos)).to.eql([]);
    });

    /**
     * Make the double-density disk with a table that has one byte changed, and say what the gate refuses it for.
     */
    function refusal(changes: [number, number][]): string[] {
        const table = PDRIVE_40.slice();
        for (const [index, value] of changes) {
            table[index] = value;
        }
        return layoutBlockers(makeDdFixture({pdrive: table}).trsdos);
    }

    it("refuses a different GPL", () => {
        const messages = refusal([[5, 4]]);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("GPL=4");
        expect(messages[0]).to.contain("GPL=2");
    });

    it("refuses a different DDSL", () => {
        const messages = refusal([[0, 18], [8, 18]]);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("DDSL=18");
    });

    it("refuses a different DDGA", () => {
        const messages = refusal([[9, 3]]);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("DDGA=3");
    });

    it("refuses a K flag that the layout doesn't have", () => {
        const messages = refusal([[14, 0x04]]);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("K flag");
    });

    it("refuses an I flag", () => {
        const messages = refusal([[14, 0x01]]);
        expect(messages.length).to.equal(1);
        expect(messages[0]).to.contain("I flag");
    });
});

describe("NEWDOS/80 directory size and version", () => {
    it("refuses a disk whose HIT says the directory is a different size", () => {
        const {trsdos} = makeDdFixture({
            patch: (gat, hit) => {
                hit[0x1F] = 5;
            },
        });
        // The decoder may read the directory differently now; either way the disk isn't writable under these rules.
        const gate = evaluateTrsdosWriteGate(trsdos, TrsdosRuleSet.NEWDOS_80);
        expect(gate.access).to.not.equal(TrsdosWriteAccess.WRITABLE);
        expect(newdos80DirectorySizeRecorded(trsdos)).to.be.false;
        expect(layoutBlockers(trsdos, TrsdosRuleSet.NEWDOS_80).join(" ")).to.contain("HIT");
    });

    it("refuses a GAT that neither version wrote, even when --dos newdos-80 is given, and can't be forced", () => {
        const {trsdos} = makeSdFixture([], {dosVersion: 0x21});
        const gate = evaluateTrsdosWriteGate(trsdos, TrsdosRuleSet.NEWDOS_80);
        const blocker = gate.blockers.find(blocker => blocker.kind === TrsdosWriteBlockerKind.UNSUPPORTED_LAYOUT);
        expect(blocker).to.not.be.undefined;
        expect(blocker!.forceable).to.be.false;
        expect(blocker!.message).to.contain("version 1.0 or 2");
        expect(blocker!.message).to.contain("0x21");
    });
});

describe("NEWDOS/80 version 1.0", () => {
    it("writes a single-density, single-sided version 1.0 disk under the NEWDOS/80 rules", () => {
        const {trsdos} = makeSdFixture([], {dosVersion: 0x80});
        expect(trsdos.nameAndVersion).to.equal("NEWDOS/80 v1.0");
        expect(identifyTrsdosRuleSet(trsdos).ruleSet).to.equal(TrsdosRuleSet.NEWDOS_80);
        expect(newdos80IsVersion1(trsdos)).to.be.true;
        expect(layoutBlockers(trsdos)).to.eql([]);
        expect(evaluateTrsdosWriteGate(trsdos).access).to.equal(TrsdosWriteAccess.WRITABLE);
    });

    it("gives a new file byte 1 = 0, as version 1.0 does, and keeps a replaced file's", () => {
        const {trsdos, makeWriter} = makeSdFixture([], {dosVersion: 0x80});
        const writer = makeWriter();
        const contents = makeContents(888);
        writer.addFile(name("FILE1"), contents);
        const newTrsdos = writer.flush();
        const entry = entryOf(newTrsdos, "FILE1").bytes;
        expect([entry[0], entry[1], entry[2], entry[3]]).to.eql([0x10, 0, 0, 888 % 256]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "FILE1"))).to.eql(contents);

        const replacer = new TrsdosWriter(newTrsdos, TrsdosRuleSet.NEWDOS_80);
        replacer.replaceFile(getFile(replacer, "FILE1"), makeContents(300, 2));
        expect(entryOf(replacer.flush(), "FILE1").bytes[1]).to.equal(0);
        expect(newdos80IsVersion1(trsdos)).to.be.true;
    });

    it("goes by the DOS the disk names, so a version 2 disk keeps 0x20", () => {
        const {trsdos} = makeSdFixture([], {dosVersion: 0x82});
        expect(newdos80IsVersion1(trsdos)).to.be.false;
    });

    it("refuses a double-density version 1.0 disk", () => {
        const {trsdos} = makeDdFixture({gatVersion: 0x80});
        expect(newdos80LayoutProblem(trsdos)).to.contain("double density");
    });

    it("refuses a version 1.0 disk with a PDRIVE table, which version 1.0 doesn't write", () => {
        // TI=A, TD=A, TC=35, SPT=10, TSR=3, GPL=2, DDSL=17, DDGA=2, 35 lumps, in sector 2 of cylinder 0.
        const table = [0x11, 35, 0x07, 35, 10, 2, 0xFE, 0x01, 0x11, 2, 0, 0, 3, 1, 0, 0];
        const {disk} = makeSdFixture([], {dosVersion: 0x80});
        disk.binary.set(table, 2*256);
        const trsdos = decodeTrsdos(new SectorOverlay(disk))!;
        expect(newdos80LayoutProblem(trsdos)).to.contain("PDRIVE table");
    });
});
