import {describe, expect, it} from "vitest";
import {type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {
    decodeTrsdos, TRSDOS_13_BLANK_PASSWORD_HASH, TRSDOS_BLANK_PASSWORD_HASH, hashForFilename, hashTrsdosPassword,
    type Trsdos, type TrsdosDirEntry, TrsdosProtectionLevel, TrsdosVersion,
} from "./Trsdos.js";
import {checkTrsdos, TrsdosFindingKind, TrsdosFindingSeverity, trsdosFindingKindSeverity} from "./TrsdosCheck.js";
import {reservedDecs} from "./TrsdosDirSlots.js";
import {readTrsdosDiskInfo} from "./TrsdosDiskInfo.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
import {formatTrsdosDataDisk, hashTrsdos13Password, TrsdosFormatDos} from "./TrsdosFormat.js";
import {TrsdosGranuleMap} from "./TrsdosGranuleMap.js";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile, type TestGranule, testUserSlotDec} from "./TrsdosTestDisk.js";
import {TrsdosRuleSet} from "./TrsdosRuleSet.js";
import {TrsdosWriteError, TrsdosWriter} from "./TrsdosWriter.js";

/**
 * Everything one test needs: the disk under the overlay, the overlay, the file system on it, and
 * a writer.
 */
interface Fixture {
    disk: FloppyDisk;
    overlay: SectorOverlay;
    trsdos: Trsdos;
    writer: TrsdosWriter;
}

/**
 * Make a test disk, wrap it in an overlay, decode that as TRSDOS, and make a writer.
 *
 * @param files the disk's files.
 * @param options the disk's options.
 * @param ruleSet the rules the writer follows.
 * @param osVersion the DOS version to put in the GAT (byte 0xCB), such as 0x53 for LDOS 5.3, or
 * undefined to leave the test disk's.
 */
function makeFixture(files: TestFile[], options: TestDiskOptions = {}, ruleSet = TrsdosRuleSet.TRSDOS_2,
                     osVersion: number | undefined = undefined): Fixture {

    const disk = makeTrsdos23TestDisk(files, options);
    if (osVersion !== undefined) {
        const gatPosition = SectorPosition.make(17, 0, 0);
        const gat = readBytes(disk, gatPosition).slice();
        gat[0xCB] = osVersion;
        const patch = new SectorOverlay(disk);
        patch.writeSector(gatPosition, gat);
        patch.commit();
    }
    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return {disk, overlay, trsdos, writer: new TrsdosWriter(trsdos, ruleSet)};
}

/**
 * Read a sector's data from a disk or overlay, failing the test if it's missing.
 */
function readBytes(volume: { readSector(sectorPosition: SectorPosition): { data: Uint8Array } | undefined },
                   sectorPosition: SectorPosition): Uint8Array {

    const sectorData = volume.readSector(sectorPosition);
    if (sectorData === undefined) {
        throw new Error("Missing sector " + sectorPosition.key());
    }
    return sectorData.data;
}

/**
 * Find a file by name in a file system, failing the test if it's missing.
 */
function getFile(trsdos: Trsdos, name: string) {
    const dirEntry = trsdos.findFile(name);
    if (dirEntry === undefined) {
        throw new Error("No file " + name);
    }
    return dirEntry;
}

/**
 * Get a writer's file, failing the test if it's missing.
 */
function writerFile(writer: TrsdosWriter, name: string) {
    const dirEntry = writer.findFile(name);
    if (dirEntry === undefined) {
        throw new Error("No file " + name);
    }
    return dirEntry;
}

const HELLO: TestFile = {name: "HELLO/BAS", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}], size: 1000};
const WORLD: TestFile = {
    name: "WORLD/TXT",
    extents: [{lump: 12, granuleOffset: 0, granuleCount: 1}, {lump: 14, granuleOffset: 1, granuleCount: 1}],
};

describe("TrsdosWriter", () => {
    it("deletes one file and changes only the GAT, the HIT and its directory sector", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);
        const world = getFile(trsdos, "WORLD/TXT");
        const worldBytes = trsdos.readFile(world);
        const gatPosition = trsdos.getGatPosition();
        const hitPosition = trsdos.getHitPosition();
        const oldGat = readBytes(disk, gatPosition).slice();
        const oldHit = readBytes(disk, hitPosition).slice();
        const helloSlot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (helloSlot === undefined) {
            throw new Error("No slot");
        }
        const location = trsdos.getDirEntryLocation(helloSlot.hitIndex);
        const oldDirSector = readBytes(disk, location.sectorPosition).slice();

        expect(writer.hasChanges()).to.eql(false);
        writer.deleteFile(writerFile(writer, "hello/bas"));
        expect(writer.hasChanges()).to.eql(true);
        expect(writer.findFile("HELLO/BAS")).to.be.undefined;
        const newTrsdos = writer.flush();

        // The file is gone and the other one reads the same.
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);

        // The HIT byte is cleared, and nothing else in it.
        const newHit = readBytes(overlay, hitPosition);
        expect(newHit[helloSlot.hitIndex]).to.eql(0);
        const expectedHit = oldHit.slice();
        expectedHit[helloSlot.hitIndex] = 0;
        expect(newHit).to.eql(expectedHit);

        // The entry's in-use bit is cleared, and nothing else in the sector.
        const newDirSector = readBytes(overlay, location.sectorPosition);
        expect(newDirSector[location.offset] & 0x10).to.eql(0);
        const expectedDirSector = oldDirSector.slice();
        expectedDirSector[location.offset] &= ~0x10;
        expect(newDirSector).to.eql(expectedDirSector);

        // Lump 3's two granules are free, and no other GAT byte changed.
        const newGat = readBytes(overlay, gatPosition);
        expect(newGat[3]).to.eql(0xFC);
        const expectedGat = oldGat.slice();
        expectedGat[3] = 0xFC;
        expect(newGat).to.eql(expectedGat);

        expect(overlay.getChangedPositions().map(position => position.key())).to.eql(
            [gatPosition, hitPosition, location.sectorPosition].map(position => position.key()));

        // The disk underneath doesn't change until the overlay commits.
        expect(readBytes(disk, gatPosition)).to.eql(oldGat);
        overlay.commit();
        expect(readBytes(disk, gatPosition)).to.eql(expectedGat);
        expect(readBytes(disk, location.sectorPosition)).to.eql(expectedDirSector);
    });

    it("deletes a file with extended entries", () => {
        const lumps = [3, 4, 5, 6, 7, 9];
        const extents = lumps.map(lump => ({lump, granuleOffset: 0, granuleCount: 2}));
        const {overlay, trsdos, writer} = makeFixture([{name: "BIG/DAT", extents}, WORLD]);
        // BIG/DAT's primary entry is in user slot 0 and its extended entry in user slot 1.
        const bigHitIndexes = [testUserSlotDec(0), testUserSlotDec(1)];
        const slotCount = trsdos.getDirectory().slots.length;

        writer.deleteFile(writerFile(writer, "BIG/DAT"));
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["WORLD/TXT"]);
        expect(newTrsdos.getDirectory().slots.length).to.eql(slotCount - 2);
        const hit = readBytes(overlay, trsdos.getHitPosition());
        for (const hitIndex of bigHitIndexes) {
            expect(hit[hitIndex]).to.eql(0);
            const location = trsdos.getDirEntryLocation(hitIndex);
            expect(readBytes(overlay, location.sectorPosition)[location.offset] & 0x10).to.eql(0);
        }
        const gat = readBytes(overlay, trsdos.getGatPosition());
        for (const lump of lumps) {
            expect(gat[lump]).to.eql(0xFC);
        }
        // WORLD/TXT's granules stay used.
        expect(gat[12]).to.eql(0xFC | 0x01);
        expect(gat[14]).to.eql(0xFC | 0x02);
    });

    it("keeps a granule that another file still claims", () => {
        const a: TestFile = {name: "A/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]};
        const b: TestFile = {name: "B/DAT", extents: [{lump: 3, granuleOffset: 1, granuleCount: 2}]};
        const {overlay, trsdos, writer} = makeFixture([a, b]);
        const bBytes = trsdos.readFile(getFile(trsdos, "B/DAT"));

        writer.deleteFile(writerFile(writer, "A/DAT"));
        const newTrsdos = writer.flush();

        // Lump 3 granule 1 is shared and stays used, granule 0 is freed, and lump 4 isn't touched.
        const gat = readBytes(overlay, trsdos.getGatPosition());
        expect(gat[3]).to.eql(0xFC | 0x02);
        expect(gat[4]).to.eql(0xFC | 0x01);
        expect(newTrsdos.readFile(getFile(newTrsdos, "B/DAT"))).to.eql(bBytes);

        // Deleting B afterwards (in a new writer) frees the rest.
        const writer2 = new TrsdosWriter(newTrsdos, TrsdosRuleSet.TRSDOS_2);
        writer2.deleteFile(writerFile(writer2, "B/DAT"));
        writer2.flush();
        const gat2 = readBytes(overlay, trsdos.getGatPosition());
        expect(gat2[3]).to.eql(0xFC);
        expect(gat2[4]).to.eql(0xFC);
    });

    it("frees a shared granule when both files are deleted in one writer", () => {
        const a: TestFile = {name: "A/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}]};
        const b: TestFile = {name: "B/DAT", extents: [{lump: 3, granuleOffset: 1, granuleCount: 2}]};
        const {overlay, trsdos, writer} = makeFixture([a, b]);

        writer.deleteFile(writerFile(writer, "A/DAT"));
        writer.deleteFile(writerFile(writer, "B/DAT"));
        writer.flush();

        const gat = readBytes(overlay, trsdos.getGatPosition());
        expect(gat[3]).to.eql(0xFC);
        expect(gat[4]).to.eql(0xFC);
    });

    it("refuses BOOT/SYS, DIR/SYS, and deleting twice", () => {
        const {writer} = makeFixture([HELLO]);

        expect(() => writer.deleteFile(writerFile(writer, "BOOT/SYS"))).to.throw(TrsdosWriteError, "BOOT/SYS");
        expect(() => writer.deleteFile(writerFile(writer, "DIR/SYS"))).to.throw(TrsdosWriteError, "DIR/SYS");
        expect(writer.hasChanges()).to.eql(false);

        const hello = writerFile(writer, "HELLO/BAS");
        writer.deleteFile(hello);
        expect(() => writer.deleteFile(hello)).to.throw(TrsdosWriteError, "already");
    });

    it("refuses a disk that isn't an overlay", () => {
        const trsdos = decodeTrsdos(makeTrsdos23TestDisk([HELLO]));
        if (trsdos === undefined) {
            throw new Error("Test disk didn't decode as TRSDOS");
        }
        expect(() => new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2)).to.throw(TrsdosWriteError);
    });

    it("writes nothing on a flush with no changes", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);

        const newTrsdos = writer.flush();

        expect(overlay.hasChanges()).to.eql(false);
        expect(newTrsdos.getDirEntries(true).map(d => d.getFilename("/")))
            .to.eql(trsdos.getDirEntries(true).map(d => d.getFilename("/")));
    });

    it("refuses a second flush", () => {
        const {writer} = makeFixture([HELLO]);
        writer.flush();
        expect(() => writer.flush()).to.throw(TrsdosWriteError, "already");
    });

    it("catches damage to another file", () => {
        const {overlay, writer} = makeFixture([HELLO, WORLD]);

        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        // Corrupt the first sector of WORLD/TXT (lump 12, granule 0), which is cylinder 12.
        overlay.writeSector(SectorPosition.make(12, 0, 0), new Uint8Array(256).fill(0x99));

        expect(() => writer.flush()).to.throw(TrsdosWriteError, "WORLD/TXT reads differently");
    });

    it("restores an empty disk's GAT after deleting every user file", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);
        const emptyDisk = makeTrsdos23TestDisk([]);
        const emptyTrsdos = decodeTrsdos(emptyDisk);
        if (emptyTrsdos === undefined) {
            throw new Error("Empty test disk didn't decode as TRSDOS");
        }

        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        writer.deleteFile(writerFile(writer, "WORLD/TXT"));
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false)).to.eql([]);
        expect(readBytes(overlay, trsdos.getGatPosition())).to.eql(readBytes(emptyDisk, emptyTrsdos.getGatPosition()));
    });

    it("leaves locked-out granules alone", () => {
        const {overlay, trsdos, writer} = makeFixture([
            {name: "A/DAT", extents: [{lump: 3, granuleOffset: 0, granuleCount: 2}, {lump: 20, granuleOffset: 0, granuleCount: 1}]},
        ], {lockedOut: [20]});
        const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();

        writer.deleteFile(writerFile(writer, "A/DAT"));
        writer.flush();

        const gat = readBytes(overlay, trsdos.getGatPosition());
        expect(gat[3]).to.eql(0xFC);
        expect(gat[20]).to.eql(oldGat[20]);
    });

    it("locates the GAT, HIT and directory entries", () => {
        const {trsdos} = makeFixture([HELLO]);

        expect(trsdos.getGatPosition().key()).to.eql(SectorPosition.make(17, 0, 0).key());
        expect(trsdos.getHitPosition().key()).to.eql(SectorPosition.make(17, 0, 1).key());
        // User slot 7 is entry 3 of directory sector 1.
        const location = trsdos.getDirEntryLocation(testUserSlotDec(7));
        expect(location.sectorPosition.key()).to.eql(SectorPosition.make(17, 0, 3).key());
        expect(location.offset).to.eql(3*32);
    });
});

/**
 * Parse a TRSDOS file name that the test knows is valid.
 */
function name(text: string): TrsdosFilename {
    const filename = parseTrsdosFilename(text);
    if (typeof filename === "string") {
        throw new Error(filename);
    }
    return filename;
}

/**
 * Make test contents: a repeating pattern that differs from byte to byte and from seed to seed.
 */
function makeContents(size: number, seed = 1): Uint8Array {
    const contents = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        contents[i] = (i*7 + (i >> 8)*13 + seed*31) & 0xFF;
    }
    return contents;
}

/**
 * The 32 bytes of a file's primary directory entry on the overlay.
 */
function entryBytes(overlay: SectorOverlay, trsdos: Trsdos, fileName: string): Uint8Array {
    const slot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === fileName);
    if (slot === undefined) {
        throw new Error("No slot for " + fileName);
    }
    const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
    return readBytes(overlay, sectorPosition).slice(offset, offset + 32);
}

/**
 * Granules to mark used so that only the given lumps (and the system lumps) have free granules.
 */
function usedExcept(freeLumps: number[]): TestGranule[] {
    const used: TestGranule[] = [];
    for (let lump = 1; lump < 35; lump++) {
        if (lump !== 17 && !freeLumps.includes(lump)) {
            used.push({lump, granule: 0}, {lump, granule: 1});
        }
    }
    return used;
}

/**
 * Granules to mark used so that the free granules are scattered: granule 0 of every lump (other
 * than the directory's) is free and granule 1 is used, so no two free granules touch and a file
 * needs one extent per granule.
 */
function scatteredUsed(): TestGranule[] {
    const used: TestGranule[] = [{lump: 0, granule: 1}];
    for (let lump = 1; lump < 35; lump++) {
        if (lump !== 17) {
            used.push({lump, granule: 1});
        }
    }
    return used;
}

/**
 * One directory entry of a file's chain, as it is on the overlay.
 */
interface ChainEntry {
    dec: number;
    bytes: Uint8Array;
}

/**
 * The DEC and 32 bytes of each directory entry of a file on the overlay: the primary entry, then
 * its extended entries in chain order.
 */
function chainBytes(overlay: SectorOverlay, trsdos: Trsdos, fileName: string): ChainEntry[] {
    // Use one directory, since each call makes new entry objects.
    const directory = trsdos.getDirectory();
    const slots = directory.slots;
    const chain: ChainEntry[] = [];
    for (let dirEntry: TrsdosDirEntry | undefined = directory.files.find(file => file.getFilename("/") === fileName);
         dirEntry !== undefined; dirEntry = dirEntry.nextDirEntry) {

        const slot = slots.find(candidate => candidate.dirEntry === dirEntry);
        if (slot === undefined) {
            throw new Error("No slot in the chain of " + fileName);
        }
        const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
        chain.push({dec: slot.hitIndex, bytes: readBytes(overlay, sectorPosition).slice(offset, offset + 32)});
    }
    return chain;
}

describe("TrsdosWriter.addFile", () => {
    it("adds a small file and fills in every structure", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);
        const helloBytes = trsdos.readFile(getFile(trsdos, "HELLO/BAS"));
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const checkBefore = checkTrsdos(trsdos).findings.map(finding => finding.message);
        const contents = makeContents(100);

        const result = writer.addFile(name("small.txt"), contents);
        expect(result).to.eql({name: "SMALL/TXT", size: 100, warning: undefined});
        expect(writer.hasChanges()).to.eql(true);
        // The name is taken now, though it isn't in the disk's own list of files.
        expect(() => writer.addFile(name("SMALL/TXT"), contents)).to.throw(TrsdosWriteError, "SMALL/TXT is already on the disk");
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["HELLO/BAS", "WORLD/TXT", "SMALL/TXT"]);
        const small = getFile(newTrsdos, "SMALL/TXT");
        expect(small.getSize()).to.eql(100);
        expect(newTrsdos.readFile(small)).to.eql(contents);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(helloBytes);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);
        expect(checkTrsdos(newTrsdos).findings.map(finding => finding.message)).to.eql(checkBefore);

        // The first free user slot, and its HIT byte.
        // HELLO and WORLD are in the first two slots in the test disk's order, but the lowest free DEC is
        // entry 2 of directory sector 1.
        const dec = (2 << 5) | 1;
        const hit = readBytes(overlay, trsdos.getHitPosition());
        expect(hit[dec]).to.eql(hashForFilename("SMALL   TXT"));

        // The entry's bytes: in use, no date, EOF 100, LRL 256, blank passwords, one sector, one extent.
        const entry = entryBytes(overlay, newTrsdos, "SMALL/TXT");
        const rawName = Array.from("SMALL   TXT").map(c => c.charCodeAt(0));
        const extent = small.extents[0];
        expect(Array.from(entry)).to.eql([
            0x10, 0, 0, 100, 0, ...rawName, 0x96, 0x42, 0x96, 0x42, 1, 0,
            extent.cylinderNumber, (extent.granuleOffset << 5) | 0, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        ]);
        expect(small.updatePassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(small.accessPassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(small.extents.length).to.eql(1);
        expect(small.extents[0].granuleCount).to.eql(1);

        // The GAT has that granule and only that granule more than before.
        const oldGat = readBytes(disk, trsdos.getGatPosition());
        const newGat = readBytes(overlay, newTrsdos.getGatPosition());
        const expectedGat = oldGat.slice();
        expectedGat[extent.cylinderNumber] |= 1 << extent.granuleOffset;
        expect(newGat).to.eql(expectedGat);
    });

    it("adds a file that spans granules, in the lowest best-fitting place", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO]);
        const contents = makeContents(2000);

        writer.addFile(name("BIG/DAT"), contents);
        const newTrsdos = writer.flush();

        const big = getFile(newTrsdos, "BIG/DAT");
        expect(big.sectorCount).to.eql(8);
        expect(big.lastSectorSize).to.eql(2000 - 7*256);
        expect(big.extents.map(e => e.granuleCount)).to.eql([2]);
        expect(newTrsdos.readFile(big)).to.eql(contents);
        // The sectors of the last granule past the data are zero.
        const positions = trsdos.getExtentSectorPositions([{lump: big.extents[0].cylinderNumber,
            granuleOffset: big.extents[0].granuleOffset, granuleCount: 2}]);
        expect(positions.length).to.eql(10);
        expect(readBytes(overlay, positions[9])).to.eql(new Uint8Array(256));
        expect(readBytes(overlay, positions[7]).slice(2000 - 7*256)).to.eql(new Uint8Array(256 - (2000 - 7*256)));
    });

    it("stores sizes around the sector boundaries exactly", () => {
        for (const size of [0, 1, 255, 256, 257, 512, 1280, 1281, 2560]) {
            const {trsdos, writer} = makeFixture([HELLO]);
            const contents = makeContents(size, size);

            writer.addFile(name("EDGE/DAT"), contents);
            const newTrsdos = writer.flush();

            const edge = getFile(newTrsdos, "EDGE/DAT");
            expect(edge.getSize(), `size ${size}`).to.eql(size);
            expect(edge.sectorCount, `size ${size}`).to.eql(Math.ceil(size/256));
            expect(edge.lastSectorSize, `size ${size}`).to.eql(size % 256);
            expect(newTrsdos.readFile(edge), `size ${size}`).to.eql(contents);
            expect(edge.extents.reduce((sum, e) => sum + e.granuleCount, 0), `size ${size}`).to.eql(Math.ceil(size/1280));
            expect(checkTrsdos(newTrsdos).findings.map(f => f.message),
                `size ${size}`).to.eql(checkTrsdos(trsdos).findings.map(f => f.message));
        }
    });

    it("adds an empty file with no extents and no granules", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO]);
        const oldGat = readBytes(disk, trsdos.getGatPosition()).slice();

        writer.addFile(name("EMPTY"), new Uint8Array(0));
        const newTrsdos = writer.flush();

        const empty = getFile(newTrsdos, "EMPTY");
        expect(empty.sectorCount).to.eql(0);
        expect(empty.extents).to.eql([]);
        expect(empty.getSize()).to.eql(0);
        expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(oldGat);
    });

    it("sets the system and invisible flags", () => {
        const {overlay, writer} = makeFixture([HELLO]);

        writer.addFile(name("A/SYS"), makeContents(10), {system: true, invisible: true});
        writer.addFile(name("B/DAT"), makeContents(10), {invisible: true});
        writer.addFile(name("C/DAT"), makeContents(10), {system: true});
        const newTrsdos = writer.flush();

        expect(entryBytes(overlay, newTrsdos, "A/SYS")[0]).to.eql(0x58);
        expect(entryBytes(overlay, newTrsdos, "B/DAT")[0]).to.eql(0x18);
        expect(entryBytes(overlay, newTrsdos, "C/DAT")[0]).to.eql(0x50);
        expect(getFile(newTrsdos, "A/SYS").isSystemFile()).to.eql(true);
        expect(getFile(newTrsdos, "B/DAT").isHidden()).to.eql(true);
    });

    it("refuses a name that's on the disk, in any case, or already added", () => {
        const {writer} = makeFixture([HELLO, WORLD]);

        expect(() => writer.addFile(name("hello.bas"), makeContents(5))).to.throw(TrsdosWriteError, "HELLO/BAS is already on the disk");
        expect(() => writer.addFile(name("BOOT/SYS"), makeContents(5))).to.throw(TrsdosWriteError, "BOOT/SYS is already");
        expect(writer.hasChanges()).to.eql(false);

        writer.addFile(name("NEW"), makeContents(5));
        expect(() => writer.addFile(name("new"), makeContents(5))).to.throw(TrsdosWriteError, "NEW is already on the disk");
        // The failed add changed nothing more, so the flush verifies.
        writer.flush();
    });

    it("refuses a file that doesn't fit, and changes nothing", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO]);
        const free = TrsdosGranuleMap.make(trsdos);
        if (typeof free === "string") {
            throw new Error(free);
        }
        const freeCount = free.granules.filter(granule => granule.isFree()).length;

        expect(() => writer.addFile(name("HUGE/DAT"), makeContents((freeCount + 1)*1280)))
            .to.throw(TrsdosWriteError, "Can't add HUGE/DAT: not enough room");
        expect(writer.hasChanges()).to.eql(false);
        // A file that does fit still works afterwards.
        writer.addFile(name("FITS/DAT"), makeContents(freeCount*1280));
        const newTrsdos = writer.flush();
        expect(newTrsdos.readFile(getFile(newTrsdos, "FITS/DAT")).length).to.eql(freeCount*1280);
        expect(overlay.hasChanges()).to.eql(true);
    });

    it("reuses the granules of a file deleted in the same writer", () => {
        // Only lump 3 (HELLO's) and lumps 20-21 have room.
        const {trsdos, writer} = makeFixture([HELLO], {gatUsed: usedExcept([3, 20, 21])});
        const contents = makeContents(2560);

        // With HELLO in place, the file goes to the free lumps.
        const before = makeFixture([HELLO], {gatUsed: usedExcept([3, 20, 21])});
        before.writer.addFile(name("ONE/DAT"), contents);
        expect(getFile(before.writer.flush(), "ONE/DAT").extents[0].cylinderNumber).to.eql(20);

        // Delete HELLO first, and its two granules are the best fit.
        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        writer.addFile(name("TWO/DAT"), contents);
        const newTrsdos = writer.flush();
        const two = getFile(newTrsdos, "TWO/DAT");
        expect(two.extents.map(e => [e.cylinderNumber, e.granuleOffset, e.granuleCount])).to.eql([[3, 0, 2]]);
        expect(newTrsdos.readFile(two)).to.eql(contents);
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["TWO/DAT"]);
        expect(trsdos.version).to.eql(newTrsdos.version);
    });

    it("can delete and add the same name in one writer", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD]);
        const contents = makeContents(300);

        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        writer.addFile(name("HELLO/BAS"), contents);
        const newTrsdos = writer.flush();

        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(trsdos.readFile(getFile(trsdos, "WORLD/TXT")));
    });

    it("never takes a slot reserved for system files", () => {
        const {trsdos, writer} = makeFixture([]);
        const reserved = reservedDecs(trsdos, TrsdosRuleSet.TRSDOS_2);
        const names: string[] = [];
        for (let i = 0; i < 30; i++) {
            names.push("F" + i);
            writer.addFile(name("F" + i), makeContents(i));
        }
        const newTrsdos = writer.flush();

        const userSlots = newTrsdos.getDirectory().slots.filter(slot => names.includes(slot.dirEntry.getFilename("/")));
        expect(userSlots.length).to.eql(30);
        for (const slot of userSlots) {
            expect(reserved.has(slot.hitIndex), `DEC ${slot.hitIndex}`).to.eql(false);
        }
        // The first file takes the first user slot.
        expect(userSlots.find(slot => slot.dirEntry.getFilename("/") === "F0")?.hitIndex).to.eql(testUserSlotDec(0));
    });

    it("reports a full directory", () => {
        const {writer} = makeFixture([]);
        // Eight sectors of six user entries.
        for (let i = 0; i < 48; i++) {
            writer.addFile(name("F" + i), new Uint8Array(0));
        }
        expect(() => writer.addFile(name("ONEMORE"), new Uint8Array(0))).to.throw(TrsdosWriteError, "directory is full");
    });

    it("stores no date on TRSDOS 2.x and warns", () => {
        const {overlay, writer} = makeFixture([HELLO]);

        const result = writer.addFile(name("DATED"), makeContents(10), {date: new Date(1983, 4, 1)});
        expect(result.warning).to.eql("TRSDOS 2.x disks don't store file dates, so the date was ignored");
        const newTrsdos = writer.flush();

        const entry = entryBytes(overlay, newTrsdos, "DATED");
        expect(entry[1]).to.eql(0);
        expect(entry[2]).to.eql(0);
        const quiet = makeFixture([HELLO]).writer.addFile(name("UNDATED"), makeContents(10));
        expect(quiet.warning).to.be.undefined;
    });

    it("stores a date on LDOS 5", () => {
        const {overlay, writer} = makeFixture([HELLO], {}, TrsdosRuleSet.LDOS_5);

        const result = writer.addFile(name("DATED"), makeContents(10), {date: new Date(1983, 4, 1, 12, 30)});
        expect(result.warning).to.be.undefined;
        const newTrsdos = writer.flush();

        // Month 5 with the modified-since-backup bit, then day 1 and year 1983 - 1980.
        const entry = entryBytes(overlay, newTrsdos, "DATED");
        expect(entry[1]).to.eql(0x40 | 5);
        expect(entry[2]).to.eql((1 << 3) | 3);
        // No time stamp on this disk, so the access password is blank and the time is midnight.
        expect(entry[18]).to.eql(0x96);
        expect(entry[19]).to.eql(0x42);
        const dirEntry = getFile(newTrsdos, "DATED");
        expect(dirEntry.getDate()).to.eql(new Date(1983, 4, 1));
        expect(dirEntry.accessPassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
    });

    it("refuses a year that an LDOS 5 entry can't hold", () => {
        const {writer} = makeFixture([HELLO], {}, TrsdosRuleSet.LDOS_5);

        expect(() => writer.addFile(name("OLD"), makeContents(10), {date: new Date(2026, 0, 1)}))
            .to.throw(TrsdosWriteError, "LDOS 5 disks can't store the year 2026; give a date from 1980 to 1987");
        expect(() => writer.addFile(name("OLD"), makeContents(10), {date: new Date(1979, 11, 31)}))
            .to.throw(TrsdosWriteError, "year 1979");
        expect(writer.hasChanges()).to.eql(false);
        writer.addFile(name("OLD"), makeContents(10), {date: new Date(1987, 11, 31)});
        writer.flush();
    });

    it("marks the date as not set on LDOS 5 when there's none", () => {
        const {overlay, writer} = makeFixture([HELLO], {}, TrsdosRuleSet.TRSDOS_6);

        writer.addFile(name("NODATE"), makeContents(10));
        const newTrsdos = writer.flush();

        const entry = entryBytes(overlay, newTrsdos, "NODATE");
        expect(entry[1]).to.eql(0x40 | 0x10);
        expect(entry[2]).to.eql(0);
        expect(getFile(newTrsdos, "NODATE").month).to.eql(0);
    });

    it("stores a time stamp on an LDOS 5.3 disk", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO], {}, TrsdosRuleSet.LDOS_5, 0x53);
        expect(trsdos.hasTimeStamps).to.eql(true);

        writer.addFile(name("STAMPED"), makeContents(10), {date: new Date(2005, 10, 20, 14, 35)});
        expect(() => writer.addFile(name("TOOLATE"), makeContents(10), {date: new Date(2012, 0, 1)}))
            .to.throw(TrsdosWriteError, "year 2012; give a date from 1980 to 2011");
        const newTrsdos = writer.flush();

        const entry = entryBytes(overlay, newTrsdos, "STAMPED");
        expect(entry[1]).to.eql(0x40 | 11);
        expect(entry[2]).to.eql((20 << 3) | (2005 - 1980) & 7);
        const stamp = (14 << 11) | (35 << 5) | (2005 - 1980);
        expect([entry[18], entry[19]]).to.eql([stamp >> 8, stamp & 0xFF]);
        const dirEntry = getFile(newTrsdos, "STAMPED");
        expect(dirEntry.getDate()).to.eql(new Date(2005, 10, 20, 14, 35));
        expect(dirEntry.accessPassword).to.be.undefined;
    });

    it("keeps the blank access password on an LDOS 5.3 disk when there's no date", () => {
        const {overlay, writer} = makeFixture([HELLO], {}, TrsdosRuleSet.LDOS_5, 0x53);

        writer.addFile(name("NODATE"), makeContents(10));
        const newTrsdos = writer.flush();

        const entry = entryBytes(overlay, newTrsdos, "NODATE");
        expect([entry[18], entry[19]]).to.eql([0x96, 0x42]);
    });

    it("uses no extended entry for a file of four extents", () => {
        const {overlay, trsdos, writer} = makeFixture([], {gatUsed: scatteredUsed()});
        const used = trsdos.getHitInfo();
        if (typeof used === "string") {
            throw new Error(used);
        }
        const hitCountBefore = used.hit.filter(hash => hash !== 0).length;

        writer.addFile(name("FOUR/DAT"), makeContents(4*1280));
        const newTrsdos = writer.flush();

        const four = getFile(newTrsdos, "FOUR/DAT");
        expect([...newTrsdos.getFileExtents(four)].length).to.eql(4);
        expect(four.nextDec).to.be.undefined;
        expect(newTrsdos.readFile(four)).to.eql(makeContents(4*1280));
        const newHit = newTrsdos.getHitInfo();
        if (typeof newHit === "string") {
            throw new Error(newHit);
        }
        expect(newHit.hit.filter(hash => hash !== 0).length).to.eql(hitCountBefore + 1);
        expect(chainBytes(overlay, newTrsdos, "FOUR/DAT").length).to.eql(1);
    });

    it("adds a file of five extents with one extended entry", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO], {gatUsed: scatteredUsed()}, TrsdosRuleSet.LDOS_5);
        const checkBefore = checkTrsdos(trsdos).findings.map(finding => finding.message);
        const contents = makeContents(5*1280 - 100, 4);

        writer.addFile(name("FRAG/DAT"), contents);
        const newTrsdos = writer.flush();

        const frag = getFile(newTrsdos, "FRAG/DAT");
        expect(newTrsdos.readFile(frag)).to.eql(contents);
        const fragExtents = [...newTrsdos.getFileExtents(frag)];
        expect(fragExtents.length).to.eql(5);
        const lumps = fragExtents.map(extent => extent.cylinderNumber);
        expect(lumps).to.eql([...lumps].sort((x, y) => x - y));
        expect(checkTrsdos(newTrsdos).findings.map(finding => finding.message)).to.eql(checkBefore);

        // The primary entry holds four extents and links to the extended entry, which holds the fifth.
        const chain = chainBytes(overlay, newTrsdos, "FRAG/DAT");
        expect(chain.length).to.eql(2);
        const [primary, fxde] = chain;
        expect(primary.bytes[0] & 0x80).to.eql(0);
        expect(primary.bytes[30]).to.eql(0xFE);
        expect(primary.bytes[31]).to.eql(fxde.dec);
        expect(fxde.bytes[0]).to.eql(0x90);
        expect(fxde.bytes[1]).to.eql(primary.dec);
        expect(fxde.bytes.subarray(2, 22)).to.eql(new Uint8Array(20));
        expect(fxde.bytes[24]).to.eql(0xFF);
        expect([fxde.bytes[30], fxde.bytes[31]]).to.eql([0xFF, 0xFF]);

        // Both entries have the primary's hash in the HIT, and the entries are in the first free slots:
        // entry 2 of directory sectors 1 and 2, since HELLO has entry 2 of sector 0 and the DOS's search
        // takes entry 2 of every sector before entry 3 of any.
        const hit = readBytes(overlay, newTrsdos.getHitPosition());
        const hash = hashForFilename("FRAG    DAT");
        expect(hit[primary.dec]).to.eql(hash);
        expect(hit[fxde.dec]).to.eql(hash);
        expect([primary.dec, fxde.dec]).to.eql([(2 << 5) | 1, (2 << 5) | 2]);
    });

    it("adds a file of nine extents with a chain of two extended entries, and deletes it cleanly", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO], {gatUsed: scatteredUsed()}, TrsdosRuleSet.LDOS_5);
        const checkBefore = checkTrsdos(trsdos).findings.map(finding => finding.message);
        const oldGat = readBytes(disk, trsdos.getGatPosition()).slice();
        const oldHit = readBytes(disk, trsdos.getHitPosition()).slice();
        const contents = makeContents(9*1280, 5);

        writer.addFile(name("NINE/DAT"), contents);
        const newTrsdos = writer.flush();
        expect(newTrsdos.readFile(getFile(newTrsdos, "NINE/DAT"))).to.eql(contents);
        expect([...newTrsdos.getFileExtents(getFile(newTrsdos, "NINE/DAT"))].length).to.eql(9);
        expect(checkTrsdos(newTrsdos).findings.map(finding => finding.message)).to.eql(checkBefore);

        const chain = chainBytes(overlay, newTrsdos, "NINE/DAT");
        expect(chain.length).to.eql(3);
        const [primary, first, second] = chain;
        expect([primary.bytes[30], primary.bytes[31]]).to.eql([0xFE, first.dec]);
        // Each extended entry points back to the entry before it, whether the primary or an extended one.
        expect(first.bytes[1]).to.eql(primary.dec);
        expect([first.bytes[30], first.bytes[31]]).to.eql([0xFE, second.dec]);
        expect(second.bytes[1]).to.eql(first.dec);
        expect([second.bytes[30], second.bytes[31]]).to.eql([0xFF, 0xFF]);
        expect(first.bytes[0]).to.eql(0x90);
        expect(second.bytes[0]).to.eql(0x90);
        // The ninth extent is the only one in the last entry.
        expect(second.bytes[22]).to.not.eql(0xFF);
        expect(second.bytes[24]).to.eql(0xFF);

        // A new writer deletes the file, which frees every granule and clears every entry.
        const deleter = new TrsdosWriter(newTrsdos, TrsdosRuleSet.TRSDOS_2);
        deleter.deleteFile(writerFile(deleter, "NINE/DAT"));
        const afterDelete = deleter.flush();
        expect(afterDelete.findFile("NINE/DAT")).to.be.undefined;
        expect(readBytes(overlay, afterDelete.getGatPosition())).to.eql(oldGat);
        const hit = readBytes(overlay, afterDelete.getHitPosition());
        expect(hit).to.eql(oldHit);
        for (const entry of chain) {
            const {sectorPosition, offset} = afterDelete.getDirEntryLocation(entry.dec);
            expect(readBytes(overlay, sectorPosition)[offset] & 0x10).to.eql(0);
        }
        expect(checkTrsdos(afterDelete).findings.map(finding => finding.message)).to.eql(checkBefore);
    });

    it("reports a full directory when the data fits but the extended entries don't, and changes nothing", () => {
        const {overlay, writer} = makeFixture([], {gatUsed: scatteredUsed()}, TrsdosRuleSet.LDOS_5);
        // Leave only two free slots.
        for (let i = 0; i < 46; i++) {
            writer.addFile(name("F" + i), new Uint8Array(0));
        }
        const filled = writer.flush();

        const second = new TrsdosWriter(filled, TrsdosRuleSet.LDOS_5);
        expect(() => second.addFile(name("NINE/DAT"), makeContents(9*1280)))
            .to.throw(TrsdosWriteError, "the directory is full: the file needs 3 entries and there are 2 free");
        expect(second.hasChanges()).to.eql(false);

        // The same file fits in the free slots with fewer extents, so only the entries ran out.
        second.addFile(name("FIVE/DAT"), makeContents(5*1280));
        const newTrsdos = second.flush();
        expect(newTrsdos.readFile(getFile(newTrsdos, "FIVE/DAT"))).to.eql(makeContents(5*1280));
        expect(chainBytes(overlay, newTrsdos, "FIVE/DAT").length).to.eql(2);
    });

    it("refuses a file that would need an extended entry under TRSDOS 2.x's rules", () => {
        const {writer} = makeFixture([], {gatUsed: scatteredUsed()});
        expect(() => writer.addFile(name("FIVE/DAT"), makeContents(5*1280)))
            .to.throw(TrsdosWriteError, "writing TRSDOS 2.x's extended directory entries isn't supported yet");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("refuses to add after the writer has flushed", () => {
        const {writer} = makeFixture([HELLO]);
        writer.flush();
        expect(() => writer.addFile(name("LATE"), makeContents(1))).to.throw(TrsdosWriteError, "already been flushed");
    });
});

/**
 * The raw bytes of a directory entry on the overlay, by its DEC.
 */
function entryBytesAt(overlay: SectorOverlay, trsdos: Trsdos, dec: number): Uint8Array {
    const {sectorPosition, offset} = trsdos.getDirEntryLocation(dec);
    return readBytes(overlay, sectorPosition).slice(offset, offset + 32);
}

describe("TrsdosWriter.renameFile", () => {
    it("changes only the name bytes and the HIT byte, and the file reads the same", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);
        const helloBytes = trsdos.readFile(getFile(trsdos, "HELLO/BAS"));
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const helloSlot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (helloSlot === undefined) {
            throw new Error("No slot");
        }
        const location = trsdos.getDirEntryLocation(helloSlot.hitIndex);
        const oldDirSector = readBytes(disk, location.sectorPosition).slice();
        const oldHit = readBytes(disk, trsdos.getHitPosition()).slice();
        const oldGat = readBytes(disk, trsdos.getGatPosition()).slice();

        expect(writer.hasChanges()).to.eql(false);
        writer.renameFile(writerFile(writer, "hello/bas"), name("greet.txt"));
        expect(writer.hasChanges()).to.eql(true);
        expect(writer.findFile("HELLO/BAS")).to.be.undefined;
        expect(writer.findFile("greet/txt")).to.not.be.undefined;
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["GREET/TXT", "WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "GREET/TXT"))).to.eql(helloBytes);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);

        // The directory sector differs from before only in bytes 5-15 of the entry.
        const expectedDirSector = oldDirSector.slice();
        const raw = "GREET   TXT";
        for (let i = 0; i < 11; i++) {
            expectedDirSector[location.offset + 5 + i] = raw.charCodeAt(i);
        }
        expect(readBytes(overlay, location.sectorPosition)).to.eql(expectedDirSector);

        // The HIT differs only in that entry's byte, which is the new hash.
        const expectedHit = oldHit.slice();
        expectedHit[helloSlot.hitIndex] = hashForFilename(raw);
        expect(readBytes(overlay, trsdos.getHitPosition())).to.eql(expectedHit);

        // The GAT is untouched.
        expect(readBytes(overlay, trsdos.getGatPosition())).to.eql(oldGat);
    });

    it("refuses BOOT/SYS and DIR/SYS", () => {
        const {writer} = makeFixture([HELLO]);
        expect(() => writer.renameFile(writerFile(writer, "BOOT/SYS"), name("OTHER/SYS")))
            .to.throw(TrsdosWriteError, "BOOT/SYS can't be renamed: the DOS needs it where it is");
        expect(() => writer.renameFile(writerFile(writer, "DIR/SYS"), name("OTHER/SYS")))
            .to.throw(TrsdosWriteError, "DIR/SYS can't be renamed: the DOS needs it where it is");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("refuses a name in use, in any case, and changes nothing", () => {
        const {writer} = makeFixture([HELLO, WORLD]);
        const hello = writerFile(writer, "HELLO/BAS");
        expect(() => writer.renameFile(hello, name("WORLD/TXT"))).to.throw(TrsdosWriteError, "WORLD/TXT is already on the disk");
        expect(() => writer.renameFile(hello, name("world.txt"))).to.throw(TrsdosWriteError, "WORLD/TXT is already on the disk");
        // Also a name that addFile has taken.
        writer.addFile(name("NEW/DAT"), makeContents(10));
        expect(() => writer.renameFile(hello, name("new.dat"))).to.throw(TrsdosWriteError, "NEW/DAT is already on the disk");
        expect(writer.findFile("HELLO/BAS")).to.equal(hello);
    });

    it("changes nothing when renaming a file to its own name", () => {
        const {writer} = makeFixture([HELLO, WORLD]);
        writer.renameFile(writerFile(writer, "HELLO/BAS"), name("hello.bas"));
        expect(writer.hasChanges()).to.eql(false);
        const newTrsdos = writer.flush();
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["HELLO/BAS", "WORLD/TXT"]);
    });

    it("renames a file and then deletes it", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD]);
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const hello = writerFile(writer, "HELLO/BAS");
        writer.renameFile(hello, name("GREET/TXT"));
        writer.deleteFile(writerFile(writer, "GREET/TXT"));
        expect(writer.findFile("GREET/TXT")).to.be.undefined;
        const newTrsdos = writer.flush();
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);
    });

    it("deletes a file and then renames another to its name", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD]);
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        writer.renameFile(writerFile(writer, "WORLD/TXT"), name("HELLO/BAS"));
        const newTrsdos = writer.flush();
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["HELLO/BAS"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(worldBytes);
    });

    it("renames a file and then adds a new file with its old name", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD]);
        const helloBytes = trsdos.readFile(getFile(trsdos, "HELLO/BAS"));
        const contents = makeContents(300);
        writer.renameFile(writerFile(writer, "HELLO/BAS"), name("OLD/BAS"));
        writer.addFile(name("HELLO/BAS"), contents);
        // The old name is taken again, and the new one too.
        expect(() => writer.addFile(name("OLD/BAS"), contents)).to.throw(TrsdosWriteError, "OLD/BAS is already on the disk");
        const newTrsdos = writer.flush();
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["OLD/BAS", "HELLO/BAS", "WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "OLD/BAS"))).to.eql(helloBytes);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
    });

    it("renames twice, and handles a change of case", () => {
        const {writer} = makeFixture([HELLO]);
        writer.renameFile(writerFile(writer, "HELLO/BAS"), name("ONE/BAS"));
        writer.renameFile(writerFile(writer, "ONE/BAS"), name("TWO/BAS"));
        expect(writer.findFile("ONE/BAS")).to.be.undefined;
        expect(writer.findFile("TWO/BAS")).to.not.be.undefined;
        const newTrsdos = writer.flush();
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["TWO/BAS"]);
    });

    it("updates the HIT byte of every entry of a file with extended entries under LDOS 5 rules", () => {
        const lumps = [3, 4, 5, 6, 7, 9];
        const extents = lumps.map(lump => ({lump, granuleOffset: 0, granuleCount: 2}));
        const {overlay, trsdos, writer} = makeFixture([{name: "BIG/DAT", extents}, WORLD], {}, TrsdosRuleSet.LDOS_5);
        const bigBytes = trsdos.readFile(getFile(trsdos, "BIG/DAT"));
        const decs = [testUserSlotDec(0), testUserSlotDec(1)];
        const oldFxde = entryBytesAt(overlay, trsdos, decs[1]);

        writer.renameFile(writerFile(writer, "BIG/DAT"), name("HUGE/BIN"));
        const newTrsdos = writer.flush();

        const hit = readBytes(overlay, trsdos.getHitPosition());
        const hash = hashForFilename("HUGE    BIN");
        expect(hit[decs[0]]).to.eql(hash);
        expect(hit[decs[1]]).to.eql(hash);
        // The extended entry's own bytes are unchanged.
        expect(entryBytesAt(overlay, trsdos, decs[1])).to.eql(oldFxde);
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["HUGE/BIN", "WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HUGE/BIN"))).to.eql(bigBytes);
    });

    it("refuses a file with extended entries under TRSDOS 2.x's rules", () => {
        const lumps = [3, 4, 5, 6, 7, 9];
        const extents = lumps.map(lump => ({lump, granuleOffset: 0, granuleCount: 2}));
        const {writer} = makeFixture([{name: "BIG/DAT", extents}]);
        expect(() => writer.renameFile(writerFile(writer, "BIG/DAT"), name("HUGE/BIN")))
            .to.throw(TrsdosWriteError, "extended directory entries");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("refuses to rename after the writer has flushed", () => {
        const {writer} = makeFixture([HELLO]);
        const hello = writerFile(writer, "HELLO/BAS");
        writer.flush();
        expect(() => writer.renameFile(hello, name("LATE"))).to.throw(TrsdosWriteError, "already been flushed");
    });

    it("refuses a deleted file", () => {
        const {writer} = makeFixture([HELLO]);
        const hello = writerFile(writer, "HELLO/BAS");
        writer.deleteFile(hello);
        expect(() => writer.renameFile(hello, name("LATE"))).to.throw(TrsdosWriteError, "has been deleted");
    });
});

describe("TrsdosWriter.setAttributes", () => {
    /**
     * Make a fixture with HELLO/BAS and WORLD/TXT, and find the location of HELLO/BAS's entry.
     */
    function makeHelloFixture(ruleSet = TrsdosRuleSet.TRSDOS_2, osVersion: number | undefined = undefined) {
        const fixture = makeFixture([HELLO, WORLD], {}, ruleSet, osVersion);
        const slot = fixture.trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (slot === undefined) {
            throw new Error("No slot");
        }
        const location = fixture.trsdos.getDirEntryLocation(slot.hitIndex);
        const oldDirSector = readBytes(fixture.overlay, location.sectorPosition).slice();
        const oldHit = readBytes(fixture.overlay, fixture.trsdos.getHitPosition()).slice();
        const oldGat = readBytes(fixture.overlay, fixture.trsdos.getGatPosition()).slice();
        return {...fixture, location, oldDirSector, oldHit, oldGat};
    }

    it("makes a file invisible by changing only bit 3 of byte 0", () => {
        const {overlay, trsdos, writer, location, oldDirSector, oldHit, oldGat} = makeHelloFixture();
        const oldFlags = oldDirSector[location.offset];

        writer.setAttributes(writerFile(writer, "hello/bas"), {invisible: true});
        expect(writer.hasChanges()).to.eql(true);
        const newTrsdos = writer.flush();

        const expectedDirSector = oldDirSector.slice();
        expectedDirSector[location.offset] = oldFlags | 0x08;
        expect(readBytes(overlay, location.sectorPosition)).to.eql(expectedDirSector);
        expect(readBytes(overlay, trsdos.getHitPosition())).to.eql(oldHit);
        expect(readBytes(overlay, trsdos.getGatPosition())).to.eql(oldGat);
        expect(getFile(newTrsdos, "HELLO/BAS").isHidden()).to.eql(true);
        expect(getFile(newTrsdos, "WORLD/TXT").isHidden()).to.eql(false);

        // And back again.
        const writer2 = new TrsdosWriter(newTrsdos, TrsdosRuleSet.TRSDOS_2);
        writer2.setAttributes(writerFile(writer2, "HELLO/BAS"), {invisible: false});
        const newerTrsdos = writer2.flush();
        expect(readBytes(overlay, location.sectorPosition)).to.eql(oldDirSector);
        expect(getFile(newerTrsdos, "HELLO/BAS").isHidden()).to.eql(false);
    });

    it("sets and clears the system flag by changing only bit 6 of byte 0", () => {
        const {overlay, writer, location, oldDirSector} = makeHelloFixture();

        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {system: true});
        const newTrsdos = writer.flush();

        const expectedDirSector = oldDirSector.slice();
        expectedDirSector[location.offset] |= 0x40;
        expect(readBytes(overlay, location.sectorPosition)).to.eql(expectedDirSector);
        expect(getFile(newTrsdos, "HELLO/BAS").isSystemFile()).to.eql(true);
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["WORLD/TXT"]);
    });

    it("sets the protection level in the low three bits and leaves the other flags", () => {
        const {overlay, writer, location, oldDirSector} = makeHelloFixture();
        const oldFlags = oldDirSector[location.offset];

        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {protectionLevel: TrsdosProtectionLevel.READ});
        const newTrsdos = writer.flush();

        const expectedDirSector = oldDirSector.slice();
        expectedDirSector[location.offset] = (oldFlags & ~0x07) | 5;
        expect(readBytes(overlay, location.sectorPosition)).to.eql(expectedDirSector);
        expect(getFile(newTrsdos, "HELLO/BAS").getProtectionLevel()).to.eql(TrsdosProtectionLevel.READ);
    });

    it("writes the password hashes into bytes 16-19", () => {
        const {overlay, writer, location, oldDirSector} = makeHelloFixture();

        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {updatePassword: "secret", accessPassword: "Open1"});
        const newTrsdos = writer.flush();

        const update = hashTrsdosPassword("SECRET");
        const access = hashTrsdosPassword("OPEN1");
        const expectedDirSector = oldDirSector.slice();
        expectedDirSector.set([update & 0xFF, update >> 8, access & 0xFF, access >> 8], location.offset + 16);
        expect(readBytes(overlay, location.sectorPosition)).to.eql(expectedDirSector);
        const hello = getFile(newTrsdos, "HELLO/BAS");
        expect(hello.updatePassword).to.eql(update);
        expect(hello.accessPassword).to.eql(access);
        expect(getFile(newTrsdos, "WORLD/TXT").updatePassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);

        // An empty password removes it again.
        const writer2 = new TrsdosWriter(newTrsdos, TrsdosRuleSet.TRSDOS_2);
        writer2.setAttributes(writerFile(writer2, "HELLO/BAS"), {updatePassword: "", accessPassword: ""});
        const newerTrsdos = writer2.flush();
        expect(getFile(newerTrsdos, "HELLO/BAS").updatePassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(getFile(newerTrsdos, "HELLO/BAS").accessPassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(readBytes(overlay, location.sectorPosition)).to.eql(oldDirSector);
    });

    it("refuses a password the DOS wouldn't accept, and changes nothing", () => {
        const {writer} = makeHelloFixture();
        const hello = writerFile(writer, "HELLO/BAS");

        expect(() => writer.setAttributes(hello, {invisible: true, updatePassword: "1ABC"}))
            .to.throw(TrsdosWriteError, "Invalid password \"1ABC\"");
        expect(() => writer.setAttributes(hello, {accessPassword: "TOOLONGPW"})).to.throw(TrsdosWriteError, "up to 8 letters");
        expect(() => writer.setAttributes(hello, {updatePassword: "A B"})).to.throw(TrsdosWriteError, "Invalid password");
        expect(writer.hasChanges()).to.eql(false);
        writer.flush();
    });

    it("refuses a protection level that isn't 0 to 7", () => {
        const {writer} = makeHelloFixture();
        const hello = writerFile(writer, "HELLO/BAS");
        expect(() => writer.setAttributes(hello, {protectionLevel: 8 as TrsdosProtectionLevel}))
            .to.throw(TrsdosWriteError, "isn't a protection level");
        expect(() => writer.setAttributes(hello, {protectionLevel: 1.5 as TrsdosProtectionLevel}))
            .to.throw(TrsdosWriteError, "isn't a protection level");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("accumulates several calls on one file", () => {
        const {writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        const hello = writerFile(writer, "HELLO/BAS");

        writer.setAttributes(hello, {invisible: true});
        writer.setAttributes(hello, {protectionLevel: TrsdosProtectionLevel.EXEC, date: new Date(1984, 2, 9)});
        writer.setAttributes(hello, {updatePassword: "BOSS"});
        const newTrsdos = writer.flush();

        const newHello = getFile(newTrsdos, "HELLO/BAS");
        expect(newHello.isHidden()).to.eql(true);
        expect(newHello.getProtectionLevel()).to.eql(TrsdosProtectionLevel.EXEC);
        expect(newHello.getDate()).to.eql(new Date(1984, 2, 9));
        expect(newHello.updatePassword).to.eql(hashTrsdosPassword("BOSS"));
    });

    it("leaves the writer as it was when a later part of the call is refused", () => {
        const {writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        const hello = writerFile(writer, "HELLO/BAS");

        writer.setAttributes(hello, {invisible: true});
        expect(() => writer.setAttributes(hello, {protectionLevel: TrsdosProtectionLevel.READ, date: new Date(2026, 0, 1)}))
            .to.throw(TrsdosWriteError, "can't store the year 2026");
        const newTrsdos = writer.flush();

        // The first call took effect, and nothing from the refused one did.
        expect(getFile(newTrsdos, "HELLO/BAS").isHidden()).to.eql(true);
        expect(getFile(newTrsdos, "HELLO/BAS").getProtectionLevel()).to.eql(TrsdosProtectionLevel.FULL);
    });

    it("makes no change when nothing differs", () => {
        const {overlay, writer} = makeHelloFixture();
        const hello = writerFile(writer, "HELLO/BAS");

        writer.setAttributes(hello, {});
        writer.setAttributes(hello, {invisible: false, system: false, protectionLevel: TrsdosProtectionLevel.FULL,
            updatePassword: "", accessPassword: ""});
        expect(writer.hasChanges()).to.eql(false);
        writer.flush();
        expect(overlay.getChangedPositions()).to.eql([]);
    });

    it("stores a date on LDOS 5, keeping byte 1's other bits", () => {
        const {overlay, writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        const oldEntry = entryBytes(overlay, writer.trsdos, "HELLO/BAS");

        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {date: new Date(1983, 4, 1)});
        const newTrsdos = writer.flush();

        const entry = entryBytes(overlay, newTrsdos, "HELLO/BAS");
        // The test disk's byte 1 has no bits set, so the modified bit stays clear.
        expect(entry[1]).to.eql(5);
        expect(entry[2]).to.eql((1 << 3) | 3);
        // Nothing else in the entry changed.
        const expectedEntry = oldEntry.slice();
        expectedEntry[1] = entry[1];
        expectedEntry[2] = entry[2];
        expect(entry).to.eql(expectedEntry);
        expect(getFile(newTrsdos, "HELLO/BAS").getDate()).to.eql(new Date(1983, 4, 1));
    });

    it("keeps the modified, created and open bits of byte 1 when it changes the date", () => {
        const {overlay, trsdos} = makeHelloFixture(TrsdosRuleSet.TRSDOS_6);
        // Give the entry all three bits and a month by patching the overlay, then make a new writer.
        const slot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (slot === undefined) {
            throw new Error("No slot");
        }
        const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
        const sector = readBytes(overlay, sectorPosition).slice();
        sector[offset + 1] = 0xE0 | 0x03;
        overlay.writeSector(sectorPosition, sector);
        const patched = decodeTrsdos(overlay);
        if (patched === undefined) {
            throw new Error("Didn't decode");
        }
        const patchedWriter = new TrsdosWriter(patched, TrsdosRuleSet.TRSDOS_6);

        patchedWriter.setAttributes(writerFile(patchedWriter, "HELLO/BAS"), {date: new Date(1982, 10, 20)});
        const newTrsdos = patchedWriter.flush();

        expect(entryBytes(overlay, newTrsdos, "HELLO/BAS")[1]).to.eql(0xE0 | 11);

        // Clearing the date keeps them too, and marks the date as not set.
        const clearWriter = new TrsdosWriter(newTrsdos, TrsdosRuleSet.TRSDOS_6);
        clearWriter.setAttributes(writerFile(clearWriter, "HELLO/BAS"), {date: null});
        const clearedTrsdos = clearWriter.flush();
        expect(entryBytes(overlay, clearedTrsdos, "HELLO/BAS")[1]).to.eql(0xE0 | 0x10);
    });

    it("refuses a date on TRSDOS 2.x and DOSPLUS, even to clear it", () => {
        for (const ruleSet of [TrsdosRuleSet.TRSDOS_2, TrsdosRuleSet.DOSPLUS]) {
            const {writer} = makeHelloFixture(ruleSet);
            const hello = writerFile(writer, "HELLO/BAS");
            expect(() => writer.setAttributes(hello, {date: new Date(1983, 4, 1)}))
                .to.throw(TrsdosWriteError, "disks don't store file dates");
            expect(() => writer.setAttributes(hello, {date: null})).to.throw(TrsdosWriteError, "disks don't store file dates");
            expect(writer.hasChanges()).to.eql(false);
        }
    });

    it("clears the date on LDOS 5", () => {
        const {overlay, writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {date: new Date(1983, 4, 1)});
        const datedTrsdos = writer.flush();

        const writer2 = new TrsdosWriter(datedTrsdos, TrsdosRuleSet.LDOS_5);
        writer2.setAttributes(writerFile(writer2, "HELLO/BAS"), {date: null});
        const newTrsdos = writer2.flush();

        const entry = entryBytes(overlay, newTrsdos, "HELLO/BAS");
        expect(entry[1]).to.eql(0x10);
        expect(entry[2]).to.eql(0);
        expect(getFile(newTrsdos, "HELLO/BAS").month).to.eql(0);
    });

    it("refuses a year an LDOS 5 entry can't hold", () => {
        const {writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        expect(() => writer.setAttributes(writerFile(writer, "HELLO/BAS"), {date: new Date(1990, 0, 1)}))
            .to.throw(TrsdosWriteError, "can't store the year 1990");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("refuses an access password on a disk with time stamps", () => {
        const {trsdos, writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5, 0x53);
        expect(trsdos.hasTimeStamps).to.eql(true);
        const hello = writerFile(writer, "HELLO/BAS");

        expect(() => writer.setAttributes(hello, {accessPassword: "OPEN"}))
            .to.throw(TrsdosWriteError, "keep a time stamp where the access password would go");
        // The update password is fine.
        writer.setAttributes(hello, {updatePassword: "BOSS"});
        const newTrsdos = writer.flush();
        expect(getFile(newTrsdos, "HELLO/BAS").updatePassword).to.eql(hashTrsdosPassword("BOSS"));
    });

    it("sets and clears a time stamp on an LDOS 5.3 disk", () => {
        const {overlay, writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5, 0x53);
        writer.setAttributes(writerFile(writer, "HELLO/BAS"), {date: new Date(2005, 10, 20, 14, 35)});
        const stampedTrsdos = writer.flush();

        const entry = entryBytes(overlay, stampedTrsdos, "HELLO/BAS");
        const stamp = (14 << 11) | (35 << 5) | (2005 - 1980);
        expect([entry[18], entry[19]]).to.eql([stamp >> 8, stamp & 0xFF]);
        const stamped = getFile(stampedTrsdos, "HELLO/BAS");
        expect(stamped.getDate()).to.eql(new Date(2005, 10, 20, 14, 35));
        expect(stamped.accessPassword).to.be.undefined;

        // Changing another attribute leaves the stamp alone.
        const writer2 = new TrsdosWriter(stampedTrsdos, TrsdosRuleSet.LDOS_5);
        writer2.setAttributes(writerFile(writer2, "HELLO/BAS"), {protectionLevel: TrsdosProtectionLevel.READ});
        const readTrsdos = writer2.flush();
        expect(entryBytes(overlay, readTrsdos, "HELLO/BAS").slice(18, 20)).to.eql(entry.slice(18, 20));

        // Clearing the date puts back the blank access password.
        const writer3 = new TrsdosWriter(readTrsdos, TrsdosRuleSet.LDOS_5);
        writer3.setAttributes(writerFile(writer3, "HELLO/BAS"), {date: null});
        const clearedTrsdos = writer3.flush();
        const clearedEntry = entryBytes(overlay, clearedTrsdos, "HELLO/BAS");
        expect([clearedEntry[18], clearedEntry[19]]).to.eql([0x96, 0x42]);
        expect(getFile(clearedTrsdos, "HELLO/BAS").accessPassword).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
        expect(getFile(clearedTrsdos, "HELLO/BAS").month).to.eql(0);
    });

    it("refuses to date a system file on a disk with time stamps", () => {
        const {writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5, 0x53);
        const hello = writerFile(writer, "HELLO/BAS");
        const world = writerFile(writer, "WORLD/TXT");

        expect(() => writer.setAttributes(hello, {system: true, date: new Date(2005, 10, 20)}))
            .to.throw(TrsdosWriteError, "system files have no dates on this disk");
        expect(() => writer.setAttributes(writerFile(writer, "BOOT/SYS"), {date: new Date(2005, 10, 20)}))
            .to.throw(TrsdosWriteError, "system files have no dates on this disk");
        expect(writer.hasChanges()).to.eql(false);

        // Making a file a system file there is fine, and the writer's check allows for how the decoder then reads it.
        writer.setAttributes(world, {system: true});
        writer.flush();
    });

    it("refuses to change BOOT/SYS and DIR/SYS between system and user file, but changes their other attributes", () => {
        const {writer} = makeHelloFixture();
        const boot = writerFile(writer, "BOOT/SYS");
        const dir = writerFile(writer, "DIR/SYS");

        expect(() => writer.setAttributes(boot, {system: false})).to.throw(TrsdosWriteError, "BOOT/SYS can't become a user file");
        expect(() => writer.setAttributes(dir, {system: false})).to.throw(TrsdosWriteError, "DIR/SYS can't become a user file");
        expect(writer.hasChanges()).to.eql(false);

        // Saying it stays a system file is fine.
        writer.setAttributes(boot, {system: true});
        expect(writer.hasChanges()).to.eql(false);
        writer.setAttributes(boot, {updatePassword: "SECRET"});
        const newTrsdos = writer.flush();
        expect(getFile(newTrsdos, "BOOT/SYS").updatePassword).to.eql(hashTrsdosPassword("SECRET"));
    });

    it("works together with a rename and a delete in one writer", () => {
        const {writer} = makeHelloFixture(TrsdosRuleSet.LDOS_5);
        writer.addFile(name("EXTRA/DAT"), makeContents(100));

        writer.renameFile(writerFile(writer, "HELLO/BAS"), name("GREET/BAS"));
        writer.setAttributes(writerFile(writer, "GREET/BAS"), {invisible: true, updatePassword: "BOSS"});
        writer.setAttributes(writerFile(writer, "WORLD/TXT"), {protectionLevel: TrsdosProtectionLevel.EXEC});
        writer.deleteFile(writerFile(writer, "WORLD/TXT"));
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["GREET/BAS", "EXTRA/DAT"]);
        const greet = getFile(newTrsdos, "GREET/BAS");
        expect(greet.isHidden()).to.eql(true);
        expect(greet.updatePassword).to.eql(hashTrsdosPassword("BOSS"));
    });

    it("refuses a deleted file, a flushed writer, and a file from another directory", () => {
        const {trsdos, writer} = makeHelloFixture();
        const hello = writerFile(writer, "HELLO/BAS");
        const strangerEntry = getFile(trsdos, "WORLD/TXT");

        expect(() => writer.setAttributes(strangerEntry, {invisible: true})).to.throw(TrsdosWriteError, "isn't a file in this directory");
        writer.deleteFile(hello);
        expect(() => writer.setAttributes(hello, {invisible: true})).to.throw(TrsdosWriteError, "has been deleted");
        writer.flush();
        expect(() => writer.setAttributes(hello, {invisible: true})).to.throw(TrsdosWriteError, "already been flushed");
    });

    it("leaves the extended entries of a file alone", () => {
        const lumps = [3, 4, 5, 6, 7, 9];
        const extents = lumps.map(lump => ({lump, granuleOffset: 0, granuleCount: 2}));
        const {overlay, trsdos, writer} = makeFixture([{name: "BIG/DAT", extents}, WORLD], {}, TrsdosRuleSet.LDOS_5);
        const bigBytes = trsdos.readFile(getFile(trsdos, "BIG/DAT"));
        const oldFxde = entryBytesAt(overlay, trsdos, testUserSlotDec(1));

        writer.setAttributes(writerFile(writer, "BIG/DAT"), {invisible: true, protectionLevel: TrsdosProtectionLevel.READ});
        const newTrsdos = writer.flush();

        expect(entryBytesAt(overlay, trsdos, testUserSlotDec(1))).to.eql(oldFxde);
        expect(newTrsdos.readFile(getFile(newTrsdos, "BIG/DAT"))).to.eql(bigBytes);
        expect(getFile(newTrsdos, "BIG/DAT").isHidden()).to.eql(true);
    });
});

describe("TrsdosWriter.setDiskInfo", () => {
    /**
     * The position of the system information sector of the test disk.
     */
    const SYSINFO_POSITION = SectorPosition.make(0, 0, 2);

    /**
     * Make a system information sector as TRSDOS 6 writes it: the DOS version in the first byte, a banner
     * at 0x10, the AUTO command at 0x20, and a system disk type at 0xC0.
     *
     * @param auto the AUTO command, which is followed by its terminator and then the bytes of an older command.
     */
    function makeSysInfo(auto: string): Uint8Array {
        const bytes = new Uint8Array(256);
        bytes[0] = 0x62;
        bytes[1] = 0xC9;
        bytes.set(Array.from("TRSDOS62Level-AN", c => c.charCodeAt(0)), 0x10);
        const text = auto + "\r" + "OLDER";
        bytes.set(Array.from(text, c => c.charCodeAt(0)), 0x20);
        bytes[0xC0] = 0xFF;
        return bytes;
    }

    /**
     * Make a fixture with HELLO/BAS and WORLD/TXT, with the GAT's version byte and the system
     * information sector patched as given, and a writer with the given rules.
     *
     * @param ruleSet the rules the writer follows.
     * @param osVersion the DOS version to put in the GAT (byte 0xCB), or undefined to leave the test disk's.
     * @param sysInfo the bytes to put in cylinder 0, sector 2, or undefined to leave the test disk's.
     * @param gatPatch a function that changes the GAT's bytes, or undefined.
     */
    function makeInfoFixture(ruleSet: TrsdosRuleSet, osVersion: number | undefined = undefined,
                             sysInfo: Uint8Array | undefined = undefined,
                             gatPatch: ((gat: Uint8Array) => void) | undefined = undefined) {

        const disk = makeTrsdos23TestDisk([HELLO, WORLD]);
        const patch = new SectorOverlay(disk);
        const gatPosition = SectorPosition.make(17, 0, 0);
        const gat = readBytes(disk, gatPosition).slice();
        if (osVersion !== undefined) {
            gat[0xCB] = osVersion;
        }
        if (gatPatch !== undefined) {
            gatPatch(gat);
        }
        patch.writeSector(gatPosition, gat);
        if (sysInfo !== undefined) {
            patch.writeSector(SYSINFO_POSITION, sysInfo);
        }
        patch.commit();

        const overlay = new SectorOverlay(disk);
        const trsdos = decodeTrsdos(overlay);
        if (trsdos === undefined) {
            throw new Error("Test disk didn't decode as TRSDOS");
        }
        const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
        const oldSysInfo = readBytes(overlay, SYSINFO_POSITION).slice();
        return {overlay, trsdos, writer: new TrsdosWriter(trsdos, ruleSet), oldGat, oldSysInfo};
    }

    /**
     * The text of bytes, with 0x0D shown as "<CR>".
     */
    function asText(bytes: Uint8Array): string {
        return Array.from(bytes, b => b === 0x0D ? "<CR>" : String.fromCharCode(b)).join("");
    }

    /**
     * Read the disk information of a file system with the given rules, failing the test if it can't be read.
     */
    function diskInfo(trsdos: Trsdos, ruleSet: TrsdosRuleSet) {
        const info = readTrsdosDiskInfo(trsdos, ruleSet);
        if (typeof info === "string") {
            throw new Error(info);
        }
        return info;
    }

    it("reads the test disk's information", () => {
        const {trsdos} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        expect(diskInfo(trsdos, TrsdosRuleSet.LDOS_5))
            .to.eql({name: "TESTDISK", date: "10/25/26", passwordHash: 0x42E0, autoCommand: ""});
    });

    it("changes the name, date and password by changing only those GAT bytes", () => {
        const {overlay, writer, oldGat} = makeInfoFixture(TrsdosRuleSet.LDOS_5);

        expect(writer.hasChanges()).to.eql(false);
        writer.setDiskInfo({name: "Games", date: new Date(1983, 4, 9), masterPassword: "Secret"});
        expect(writer.hasChanges()).to.eql(true);
        const newTrsdos = writer.flush();

        const expectedGat = oldGat.slice();
        expectedGat.set(Array.from("GAMES   ", c => c.charCodeAt(0)), 0xD0);
        expectedGat.set(Array.from("05/09/83", c => c.charCodeAt(0)), 0xD8);
        const hash = hashTrsdosPassword("SECRET");
        expectedGat[0xCE] = hash & 0xFF;
        expectedGat[0xCF] = hash >> 8;
        expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(expectedGat);
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5))
            .to.eql({name: "GAMES", date: "05/09/83", passwordHash: hash, autoCommand: ""});

        // The files are as they were.
        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["HELLO/BAS", "WORLD/TXT"]);
    });

    it("changes one field and leaves the others as they were", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        writer.setDiskInfo({name: "ONLY"});
        const newTrsdos = writer.flush();
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5))
            .to.eql({name: "ONLY", date: "10/25/26", passwordHash: 0x42E0, autoCommand: ""});
    });

    it("blanks the master password", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        writer.setDiskInfo({masterPassword: ""});
        const newTrsdos = writer.flush();
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5).passwordHash).to.eql(TRSDOS_BLANK_PASSWORD_HASH);
    });

    it("writes an AUTO command in the GAT, ended by 0x0D and padded with spaces", () => {
        const {overlay, writer, oldGat} = makeInfoFixture(TrsdosRuleSet.LDOS_5);

        writer.setDiskInfo({autoCommand: '  BASIC RUN"MENU"  '});
        const newTrsdos = writer.flush();

        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(asText(gat.subarray(0xE0))).to.eql('BASIC RUN"MENU"<CR>' + " ".repeat(32 - 'BASIC RUN"MENU"'.length - 1));
        expect(gat.subarray(0, 0xE0)).to.eql(oldGat.subarray(0, 0xE0));
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5).autoCommand).to.eql('BASIC RUN"MENU"');

        // And remove it again.
        const writer2 = new TrsdosWriter(newTrsdos, TrsdosRuleSet.LDOS_5);
        writer2.setDiskInfo({autoCommand: ""});
        const clearedTrsdos = writer2.flush();
        expect(readBytes(overlay, clearedTrsdos.getGatPosition())).to.eql(oldGat);
    });

    it("fits an AUTO command of 31 characters in the GAT and refuses 32", () => {
        const {overlay, writer} = makeInfoFixture(TrsdosRuleSet.DOSPLUS);
        const thirtyOne = "A".repeat(31);

        expect(() => writer.setDiskInfo({autoCommand: "A".repeat(32)}))
            .to.throw(TrsdosWriteError, "at most 31 fit");
        expect(writer.hasChanges()).to.eql(false);
        writer.setDiskInfo({autoCommand: thirtyOne});
        const newTrsdos = writer.flush();
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(asText(gat.subarray(0xE0))).to.eql(thirtyOne + "<CR>");
        expect(diskInfo(newTrsdos, TrsdosRuleSet.DOSPLUS).autoCommand).to.eql(thirtyOne);
    });

    it("pads an AUTO command with 0xFF on TRSDOS 2.x, as its FORMAT leaves the field", () => {
        const {overlay, writer} = makeInfoFixture(TrsdosRuleSet.TRSDOS_2);
        writer.setDiskInfo({autoCommand: "BASIC"});
        const newTrsdos = writer.flush();
        const field = readBytes(overlay, newTrsdos.getGatPosition()).subarray(0xE0);
        expect(Array.from(field.subarray(0, 6))).to.eql([0x42, 0x41, 0x53, 0x49, 0x43, 0x0D]);
        expect(field.subarray(6).every(b => b === 0xFF)).to.eql(true);
        expect(diskInfo(newTrsdos, TrsdosRuleSet.TRSDOS_2).autoCommand).to.eql("BASIC");
    });

    it("stops the AUTO command before a media block at the end of the GAT", () => {
        const media = [0x03, 0x4C, 0x53, 0x49, 0x44, 0x42, 0x00, 0x27, 0x11, 0x45, 0x14];
        const {overlay, writer, oldGat} = makeInfoFixture(TrsdosRuleSet.LDOS_5, undefined, undefined,
            gat => gat.set(media, 0xF5));

        // 0xE0 to 0xF3 is 20 bytes, so 19 characters and the terminator.
        expect(() => writer.setDiskInfo({autoCommand: "A".repeat(20)})).to.throw(TrsdosWriteError, "at most 19 fit");
        writer.setDiskInfo({autoCommand: "A".repeat(19)});
        const newTrsdos = writer.flush();
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(gat.subarray(0xF4)).to.eql(oldGat.subarray(0xF4));
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5).autoCommand).to.eql("A".repeat(19));
    });

    it("uppercases the name except on DOSPLUS", () => {
        const dosplus = makeInfoFixture(TrsdosRuleSet.DOSPLUS);
        dosplus.writer.setDiskInfo({name: "DataDisk"});
        expect(diskInfo(dosplus.writer.flush(), TrsdosRuleSet.DOSPLUS).name).to.eql("DataDisk");

        const ldos = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        ldos.writer.setDiskInfo({name: "DataDisk"});
        expect(diskInfo(ldos.writer.flush(), TrsdosRuleSet.LDOS_5).name).to.eql("DATADISK");

        const trsdos2 = makeInfoFixture(TrsdosRuleSet.TRSDOS_2);
        trsdos2.writer.setDiskInfo({name: "* Data *"});
        expect(diskInfo(trsdos2.writer.flush(), TrsdosRuleSet.TRSDOS_2).name).to.eql("* DATA *");
    });

    it("refuses names that the DOS wouldn't take, leaving the writer as it was", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        expect(() => writer.setDiskInfo({name: "  "})).to.throw(TrsdosWriteError, "can't be empty");
        expect(() => writer.setDiskInfo({name: "NINECHARS"})).to.throw(TrsdosWriteError, "up to 8 characters");
        expect(() => writer.setDiskInfo({name: "CAF\u00C9"})).to.throw(TrsdosWriteError, "printable ASCII");
        expect(() => writer.setDiskInfo({name: "OK", masterPassword: "bad password"}))
            .to.throw(TrsdosWriteError, "Invalid password");
        expect(() => writer.setDiskInfo({name: "OK", autoCommand: "A\rB"})).to.throw(TrsdosWriteError, "printable ASCII");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("limits the date's year to what the DOS can enter", () => {
        const plain = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        expect(() => plain.writer.setDiskInfo({date: new Date(2005, 0, 1)}))
            .to.throw(TrsdosWriteError, "can't store the year 2005; give a date from 1980 to 1999");
        expect(() => plain.writer.setDiskInfo({date: new Date(1979, 0, 1)})).to.throw(TrsdosWriteError, "from 1980");
        expect(() => plain.writer.setDiskInfo({date: new Date(Number.NaN)})).to.throw(TrsdosWriteError, "of that date");
        plain.writer.setDiskInfo({date: new Date(1999, 11, 31)});
        expect(diskInfo(plain.writer.flush(), TrsdosRuleSet.LDOS_5).date).to.eql("12/31/99");

        // LDOS 5.3 has time stamps, and its years run through 2011.
        const stamped = makeInfoFixture(TrsdosRuleSet.LDOS_5, 0x53);
        stamped.writer.setDiskInfo({date: new Date(2005, 0, 2)});
        expect(diskInfo(stamped.writer.flush(), TrsdosRuleSet.LDOS_5).date).to.eql("01/02/05");
        const tooLate = makeInfoFixture(TrsdosRuleSet.LDOS_5, 0x53);
        expect(() => tooLate.writer.setDiskInfo({date: new Date(2012, 0, 1)})).to.throw(TrsdosWriteError, "to 2011");

        // TRSDOS 2.x disks go back to 1978.
        const old = makeInfoFixture(TrsdosRuleSet.TRSDOS_2);
        old.writer.setDiskInfo({date: new Date(1978, 7, 15)});
        expect(diskInfo(old.writer.flush(), TrsdosRuleSet.TRSDOS_2).date).to.eql("08/15/78");
    });

    it("writes the AUTO command of TRSDOS 6 in the system information sector, and nowhere else", () => {
        const {overlay, writer, oldGat, oldSysInfo} = makeInfoFixture(TrsdosRuleSet.TRSDOS_6, 0x62,
            makeSysInfo("do startup/jcl"));
        expect(asText(oldSysInfo.subarray(0x20, 0x34))).to.eql("do startup/jcl<CR>OLDER");

        writer.setDiskInfo({autoCommand: "BASIC"});
        const newTrsdos = writer.flush();

        // The command, its terminator, and zeros to the end of the area; the rest of the sector is as it was.
        const expectedSysInfo = oldSysInfo.slice();
        expectedSysInfo.fill(0, 0x20, 0x70);
        expectedSysInfo.set([0x42, 0x41, 0x53, 0x49, 0x43, 0x0D], 0x20);
        expect(readBytes(overlay, SYSINFO_POSITION)).to.eql(expectedSysInfo);
        expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(oldGat);
        expect(diskInfo(newTrsdos, TrsdosRuleSet.TRSDOS_6).autoCommand).to.eql("BASIC");

        // BOOT/SYS covers the sector, so it reads with the new one.
        const boot = newTrsdos.readFile(getFile(newTrsdos, "BOOT/SYS"));
        expect(boot.subarray(2*256, 3*256)).to.eql(expectedSysInfo);
    });

    it("keeps the system information sector's other fields when the name and date change", () => {
        const {overlay, writer, oldSysInfo} = makeInfoFixture(TrsdosRuleSet.TRSDOS_6, 0x62, makeSysInfo("RUN"));

        writer.setDiskInfo({name: "Work", date: new Date(1986, 5, 7), autoCommand: "KEEP"});
        const newTrsdos = writer.flush();

        const sysInfo = readBytes(overlay, SYSINFO_POSITION);
        // The banner at 0x10 is the DOS release's, not the disk's name, and isn't changed.
        expect(sysInfo.subarray(0, 0x20)).to.eql(oldSysInfo.subarray(0, 0x20));
        expect(sysInfo.subarray(0x70)).to.eql(oldSysInfo.subarray(0x70));
        expect(diskInfo(newTrsdos, TrsdosRuleSet.TRSDOS_6))
            .to.eql({name: "WORK", date: "06/07/86", passwordHash: 0x42E0, autoCommand: "KEEP"});
    });

    it("limits a TRSDOS 6 AUTO command to 79 characters", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.TRSDOS_6, 0x62, makeSysInfo(""));
        expect(() => writer.setDiskInfo({autoCommand: "A".repeat(80)})).to.throw(TrsdosWriteError, "at most 79 fit");
        writer.setDiskInfo({autoCommand: "A".repeat(79)});
        expect(diskInfo(writer.flush(), TrsdosRuleSet.TRSDOS_6).autoCommand).to.eql("A".repeat(79));
    });

    it("refuses a TRSDOS 6 AUTO command on a disk with no system information sector", () => {
        // The test disk's cylinder 0, sector 2 is zeros, which isn't a system information sector.
        const {oldSysInfo, trsdos, writer} = makeInfoFixture(TrsdosRuleSet.TRSDOS_6, 0x62);
        expect(oldSysInfo.every(b => b === 0)).to.eql(true);
        expect(diskInfo(trsdos, TrsdosRuleSet.TRSDOS_6).autoCommand).to.be.undefined;

        expect(() => writer.setDiskInfo({autoCommand: "BASIC"})).to.throw(TrsdosWriteError, "no system information sector");
        expect(writer.hasChanges()).to.eql(false);
        // Without an AUTO command, the other fields can still change.
        writer.setDiskInfo({name: "FILLER"});
        expect(diskInfo(writer.flush(), TrsdosRuleSet.TRSDOS_6).name).to.eql("FILLER");
    });

    it("refuses a writer that has flushed", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        writer.flush();
        expect(() => writer.setDiskInfo({name: "X"})).to.throw(TrsdosWriteError, "already been flushed");
    });

    it("combines with other changes, and with several calls", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        writer.deleteFile(writerFile(writer, "HELLO/BAS"));
        writer.setDiskInfo({name: "FIRST", date: new Date(1984, 0, 2)});
        writer.setDiskInfo({name: "SECOND", autoCommand: "DIR"});
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.eql(["WORLD/TXT"]);
        expect(diskInfo(newTrsdos, TrsdosRuleSet.LDOS_5))
            .to.eql({name: "SECOND", date: "01/02/84", passwordHash: 0x42E0, autoCommand: "DIR"});
    });

    it("does nothing when given no changes", () => {
        const {writer} = makeInfoFixture(TrsdosRuleSet.LDOS_5);
        writer.setDiskInfo({});
        expect(writer.hasChanges()).to.eql(false);
        writer.flush();
    });
});

describe("TrsdosWriter.replaceFile", () => {
    /**
     * Run a change on a disk with a writer, flush it, and return a new writer on the result.
     *
     * @param fixture the fixture to change.
     * @param ruleSet the rules for the new writer.
     * @param change makes the change with the fixture's writer.
     */
    function changeAndReopen(fixture: Fixture, ruleSet: TrsdosRuleSet, change: (writer: TrsdosWriter) => void): TrsdosWriter {
        change(fixture.writer);
        return new TrsdosWriter(fixture.writer.flush(), ruleSet);
    }

    /**
     * The DEC of a file's primary entry.
     */
    function primaryDec(trsdos: Trsdos, fileName: string): number {
        const slot = trsdos.getDirectory().slots.find(candidate => candidate.dirEntry.getFilename("/") === fileName);
        if (slot === undefined) {
            throw new Error("No slot for " + fileName);
        }
        return slot.hitIndex;
    }

    /**
     * The granules a file's extents cover, as "lump:granule" strings.
     */
    function granulesOf(trsdos: Trsdos, fileName: string): string[] {
        const granules: string[] = [];
        for (const extent of trsdos.getFileExtents(getFile(trsdos, fileName))) {
            for (let i = 0; i < extent.granuleCount; i++) {
                granules.push(`${extent.cylinderNumber}:${extent.granuleOffset + i}`);
            }
        }
        return granules;
    }

    it("replaces the contents, keeps the slot and the other files, and puts the new copy on new granules", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO, WORLD]);
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const checkBefore = checkTrsdos(trsdos).findings.map(finding => finding.message);
        const oldGranules = granulesOf(trsdos, "HELLO/BAS");
        const dec = primaryDec(trsdos, "HELLO/BAS");
        const contents = makeContents(3000, 9);

        const result = writer.replaceFile(writerFile(writer, "hello/bas"), contents);
        expect(result).to.eql({name: "HELLO/BAS", size: 3000, warning: undefined});
        expect(writer.findFile("HELLO/BAS")).to.be.undefined;
        expect(() => writer.addFile(name("HELLO/BAS"), contents)).to.throw(TrsdosWriteError, "already on the disk");
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["HELLO/BAS", "WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);
        expect(checkTrsdos(newTrsdos).findings.map(finding => finding.message)).to.eql(checkBefore);

        // The primary entry is in the same slot, and none of the new granules was the old copy's.
        expect(primaryDec(newTrsdos, "HELLO/BAS")).to.eql(dec);
        const newGranules = granulesOf(newTrsdos, "HELLO/BAS");
        expect(newGranules.length).to.eql(3);
        expect(newGranules.filter(granule => oldGranules.includes(granule))).to.eql([]);
        expect(readBytes(overlay, newTrsdos.getHitPosition())[dec]).to.eql(hashForFilename("HELLO   BAS"));

        // The old granules are free now, and the GAT has the new ones.
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(gat[3]).to.eql(0xFC);
        for (const granule of newGranules) {
            const [lump, bit] = granule.split(":").map(Number);
            expect(gat[lump] & (1 << bit)).to.not.eql(0);
        }
    });

    it("keeps the attributes, passwords and record length, and the date on the LDOS line", () => {
        const fixture = makeFixture([HELLO, WORLD], {}, TrsdosRuleSet.LDOS_5);
        const writer = changeAndReopen(fixture, TrsdosRuleSet.LDOS_5, first => {
            first.setAttributes(writerFile(first, "HELLO/BAS"), {
                invisible: true, protectionLevel: TrsdosProtectionLevel.READ, updatePassword: "OWNER",
                accessPassword: "USER", date: new Date(1984, 2, 15),
            });
        });
        // Give it a record length, which nothing sets.
        const trsdos = writer.trsdos;
        const location = trsdos.getDirEntryLocation(primaryDec(trsdos, "HELLO/BAS"));
        const patched = readBytes(fixture.overlay, location.sectorPosition).slice();
        patched[location.offset + 4] = 80;
        fixture.overlay.writeSector(location.sectorPosition, patched);
        const writer2 = new TrsdosWriter(decodeTrsdos(fixture.overlay) as Trsdos, TrsdosRuleSet.LDOS_5);
        const oldEntry = entryBytes(fixture.overlay, writer2.trsdos, "HELLO/BAS");

        const result = writer2.replaceFile(writerFile(writer2, "HELLO/BAS"), makeContents(700));
        expect(result.warning).to.be.undefined;
        const newTrsdos = writer2.flush();

        const entry = entryBytes(fixture.overlay, newTrsdos, "HELLO/BAS");
        expect(entry[0]).to.eql(oldEntry[0]);
        expect(entry[0] & 0x08).to.eql(0x08);
        expect(entry[0] & 0x07).to.eql(TrsdosProtectionLevel.READ);
        expect(entry[1]).to.eql(oldEntry[1] | 0x40);
        expect(entry[2]).to.eql(oldEntry[2]);
        expect(entry[3]).to.eql(700 % 256);
        expect(entry[4]).to.eql(80);
        expect(Array.from(entry.subarray(16, 20))).to.eql(Array.from(oldEntry.subarray(16, 20)));
        const dirEntry = getFile(newTrsdos, "HELLO/BAS");
        expect(dirEntry.getDate()).to.eql(new Date(1984, 2, 15));
        expect(dirEntry.lrl).to.eql(80);
        expect(dirEntry.updatePassword).to.eql(hashTrsdosPassword("OWNER"));
        expect(dirEntry.accessPassword).to.eql(hashTrsdosPassword("USER"));
        expect(dirEntry.sectorCount).to.eql(3);
    });

    it("replaces the date when one is given, and the flags the options give", () => {
        const fixture = makeFixture([HELLO, WORLD], {}, TrsdosRuleSet.LDOS_5);
        const writer = changeAndReopen(fixture, TrsdosRuleSet.LDOS_5, first => {
            first.setAttributes(writerFile(first, "HELLO/BAS"), {invisible: true, date: new Date(1984, 2, 15)});
        });

        writer.replaceFile(writerFile(writer, "HELLO/BAS"), makeContents(10),
            {date: new Date(1986, 11, 1), system: true, invisible: false});
        const newTrsdos = writer.flush();

        const dirEntry = getFile(newTrsdos, "HELLO/BAS");
        expect(dirEntry.getDate()).to.eql(new Date(1986, 11, 1));
        expect(dirEntry.isSystemFile()).to.eql(true);
        const entry = entryBytes(fixture.overlay, newTrsdos, "HELLO/BAS");
        expect(entry[0] & 0x08).to.eql(0);
        expect(entry[1]).to.eql(0x40 | 12);
    });

    it("ignores a date on TRSDOS 2.x with a warning, and keeps the zero date bytes", () => {
        const {overlay, writer} = makeFixture([HELLO]);

        const result = writer.replaceFile(writerFile(writer, "HELLO/BAS"), makeContents(10), {date: new Date(1984, 2, 15)});
        expect(result.warning).to.include("TRSDOS 2.x disks don't store file dates");
        const newTrsdos = writer.flush();
        const entry = entryBytes(overlay, newTrsdos, "HELLO/BAS");
        expect([entry[1], entry[2]]).to.eql([0, 0]);
    });

    it("keeps and replaces the time stamp on an LDOS 5.3 disk", () => {
        const fixture = makeFixture([HELLO, WORLD], {}, TrsdosRuleSet.LDOS_5, 0x53);
        const writer = changeAndReopen(fixture, TrsdosRuleSet.LDOS_5, first => {
            first.setAttributes(writerFile(first, "HELLO/BAS"), {date: new Date(2005, 10, 20, 14, 35)});
        });
        const oldEntry = entryBytes(fixture.overlay, writer.trsdos, "HELLO/BAS");

        writer.replaceFile(writerFile(writer, "HELLO/BAS"), makeContents(10));
        const writer2 = new TrsdosWriter(writer.flush(), TrsdosRuleSet.LDOS_5);
        const kept = entryBytes(fixture.overlay, writer2.trsdos, "HELLO/BAS");
        expect([kept[18], kept[19]]).to.eql([oldEntry[18], oldEntry[19]]);
        expect(getFile(writer2.trsdos, "HELLO/BAS").getDate()).to.eql(new Date(2005, 10, 20, 14, 35));

        writer2.replaceFile(writerFile(writer2, "HELLO/BAS"), makeContents(10), {date: new Date(2008, 0, 2, 3, 4)});
        const newTrsdos = writer2.flush();
        expect(getFile(newTrsdos, "HELLO/BAS").getDate()).to.eql(new Date(2008, 0, 2, 3, 4));
    });

    it("puts the new copy beside the old one when it fits, and frees the old copy", () => {
        // Lump 3 (HELLO's) and lumps 20-21 have room.
        const {overlay, writer} = makeFixture([HELLO], {gatUsed: usedExcept([3, 20, 21])});
        const contents = makeContents(2560);

        const result = writer.replaceFile(writerFile(writer, "HELLO/BAS"), contents);
        expect(result.warning).to.be.undefined;
        const newTrsdos = writer.flush();
        expect(granulesOf(newTrsdos, "HELLO/BAS")).to.eql(["20:0", "20:1"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        expect(readBytes(overlay, newTrsdos.getGatPosition())[3]).to.eql(0xFC);
    });

    /**
     * The number of free granules on a disk.
     */
    function freeGranuleCount(trsdos: Trsdos): number {
        const granuleMap = TrsdosGranuleMap.make(trsdos);
        if (typeof granuleMap === "string") {
            throw new Error(granuleMap);
        }
        return granuleMap.granules.filter(granule => granule.isFree()).length;
    }

    it("falls back to the old copy's space when the new copy doesn't fit beside it, and warns", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD], {gatUsed: usedExcept([3])});
        // One granule more than is free, which HELLO's two granules make room for.
        const granuleCount = freeGranuleCount(trsdos) + 2;
        const contents = makeContents(granuleCount*1280);

        const result = writer.replaceFile(writerFile(writer, "HELLO/BAS"), contents);
        expect(result.warning).to.include("HELLO/BAS didn't fit beside its old copy");
        const newTrsdos = writer.flush();
        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        expect(granulesOf(newTrsdos, "HELLO/BAS").length).to.eql(granuleCount);
        expect(granulesOf(newTrsdos, "HELLO/BAS")).to.include("3:0");
        expect(freeGranuleCount(newTrsdos)).to.eql(0);
    });

    it("refuses a file that doesn't fit even with the old copy's space, and changes nothing", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD], {gatUsed: usedExcept([3])});
        const granuleCount = freeGranuleCount(trsdos) + 2;

        expect(() => writer.replaceFile(writerFile(writer, "HELLO/BAS"), makeContents((granuleCount + 1)*1280)))
            .to.throw(TrsdosWriteError, "Can't replace HELLO/BAS: not enough room");
        expect(writer.hasChanges()).to.eql(false);
        expect(writer.findFile("HELLO/BAS")).to.not.be.undefined;
        // A file that does fit still works afterwards.
        writer.replaceFile(writerFile(writer, "HELLO/BAS"), makeContents(granuleCount*1280));
        writer.flush();
    });

    it("replaces a file that has an extended entry with a small one, and frees the extended entry", () => {
        const lumps = [3, 4, 5, 6, 7, 9];
        const extents = lumps.map(lump => ({lump, granuleOffset: 0, granuleCount: 2}));
        const {overlay, trsdos, writer} = makeFixture([{name: "BIG/DAT", extents}, WORLD]);
        const primary = testUserSlotDec(0);
        const extended = testUserSlotDec(1);
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const contents = makeContents(100);

        writer.replaceFile(writerFile(writer, "BIG/DAT"), contents);
        const newTrsdos = writer.flush();

        expect(newTrsdos.readFile(getFile(newTrsdos, "BIG/DAT"))).to.eql(contents);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);
        expect(primaryDec(newTrsdos, "BIG/DAT")).to.eql(primary);
        expect(getFile(newTrsdos, "BIG/DAT").nextDec).to.be.undefined;
        const hit = readBytes(overlay, newTrsdos.getHitPosition());
        expect(hit[extended]).to.eql(0);
        const location = newTrsdos.getDirEntryLocation(extended);
        expect(readBytes(overlay, location.sectorPosition)[location.offset] & 0x10).to.eql(0);
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        for (const lump of lumps) {
            expect(gat[lump]).to.eql(0xFC);
        }
    });

    it("gives a small file's replacement an extended entry in the lowest free slot when it is fragmented", () => {
        const {overlay, trsdos, writer} = makeFixture([HELLO], {gatUsed: scatteredUsed()}, TrsdosRuleSet.LDOS_5);
        const checkBefore = checkTrsdos(trsdos).findings.map(finding => finding.message);
        const dec = primaryDec(trsdos, "HELLO/BAS");
        const contents = makeContents(5*1280 - 100, 4);

        writer.replaceFile(writerFile(writer, "HELLO/BAS"), contents);
        const newTrsdos = writer.flush();

        expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        expect(checkTrsdos(newTrsdos).findings.map(finding => finding.message)).to.eql(checkBefore);
        const chain = chainBytes(overlay, newTrsdos, "HELLO/BAS");
        expect(chain.length).to.eql(2);
        expect(chain[0].dec).to.eql(dec);
        expect(chain[1].dec).to.eql((2 << 5) | 1);
        expect(chain[1].bytes[1]).to.eql(dec);
    });

    it("uses the replaced file's new name after a rename", () => {
        const {trsdos, writer} = makeFixture([HELLO, WORLD]);
        const worldBytes = trsdos.readFile(getFile(trsdos, "WORLD/TXT"));
        const hello = writerFile(writer, "HELLO/BAS");
        const contents = makeContents(50);

        writer.renameFile(hello, name("GREET/BAS"));
        const result = writer.replaceFile(hello, contents);
        expect(result.name).to.eql("GREET/BAS");
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(false).map(d => d.getFilename("/"))).to.have.members(["GREET/BAS", "WORLD/TXT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "GREET/BAS"))).to.eql(contents);
        expect(newTrsdos.readFile(getFile(newTrsdos, "WORLD/TXT"))).to.eql(worldBytes);
    });

    it("works after a change of attributes in the same writer, and with other changes", () => {
        const {writer} = makeFixture([HELLO, WORLD], {}, TrsdosRuleSet.LDOS_5);
        const hello = writerFile(writer, "HELLO/BAS");

        writer.setAttributes(hello, {invisible: true});
        writer.replaceFile(hello, makeContents(10));
        writer.deleteFile(writerFile(writer, "WORLD/TXT"));
        writer.addFile(name("NEW/DAT"), makeContents(20));
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(true).map(d => d.getFilename("/"))).to.have.members(["HELLO/BAS", "NEW/DAT", "BOOT/SYS", "DIR/SYS"]);
        expect(getFile(newTrsdos, "HELLO/BAS").isHidden()).to.eql(true);
    });

    it("refuses BOOT/SYS and DIR/SYS, a second replacement, and a flushed writer", () => {
        const {writer} = makeFixture([HELLO]);

        expect(() => writer.replaceFile(writerFile(writer, "BOOT/SYS"), makeContents(5)))
            .to.throw(TrsdosWriteError, "BOOT/SYS can't be replaced");
        expect(() => writer.replaceFile(writerFile(writer, "DIR/SYS"), makeContents(5)))
            .to.throw(TrsdosWriteError, "DIR/SYS can't be replaced");
        expect(writer.hasChanges()).to.eql(false);

        const hello = writerFile(writer, "HELLO/BAS");
        writer.replaceFile(hello, makeContents(5));
        expect(() => writer.replaceFile(hello, makeContents(5))).to.throw(TrsdosWriteError, "has been deleted");
        writer.flush();
        expect(() => writer.replaceFile(hello, makeContents(5))).to.throw(TrsdosWriteError, "already been flushed");
    });

    it("refuses a file that was deleted in the same writer", () => {
        const {writer} = makeFixture([HELLO]);
        const hello = writerFile(writer, "HELLO/BAS");

        writer.deleteFile(hello);
        expect(() => writer.replaceFile(hello, makeContents(5))).to.throw(TrsdosWriteError, "has been deleted");
    });

    it("refuses the rules of a layout the disk isn't in", () => {
        expect(() => makeFixture([HELLO], {}, TrsdosRuleSet.TRSDOS_1_3))
            .to.throw(TrsdosWriteError, "TRSDOS 1.3 rules don't fit a disk in the 2.3 family layout");
    });
});

/**
 * The date that the TRSDOS 1.3 test disks are formatted with.
 */
const FORMAT_DATE = new Date(1983, 4, 17);

/**
 * Format a blank TRSDOS 1.3 data disk (40 cylinders, as the DOS's FORMAT makes it), wrap it in an overlay, and make
 * a writer under TRSDOS 1.3's rules.
 *
 * @param patchSector changes a sector of the freshly formatted disk before the file system is decoded, by sector
 * (the GAT is sector 1 of cylinder 17 and the HIT sector 2), or undefined to leave the disk as it is.
 */
function make13Fixture(patchSector: ((sectorNumber: number, bytes: Uint8Array) => void) | undefined = undefined): Fixture {
    const disk = formatTrsdosDataDisk({dos: TrsdosFormatDos.TRSDOS_1_3, cylinders: 40, sides: 1, date: FORMAT_DATE});
    if (typeof disk === "string") {
        throw new Error(disk);
    }
    if (patchSector !== undefined) {
        const patch = new SectorOverlay(disk);
        for (const sectorNumber of [1, 2]) {
            const position = SectorPosition.make(17, 0, sectorNumber);
            const bytes = readBytes(disk, position).slice();
            patchSector(sectorNumber, bytes);
            patch.writeSector(position, bytes);
        }
        patch.commit();
    }
    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined || trsdos.version !== TrsdosVersion.V1_3) {
        throw new Error("Test disk didn't decode as TRSDOS 1.3");
    }
    return {disk, overlay, trsdos, writer: new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_1_3)};
}

/**
 * Make a new writer on the file system that a flush returned.
 */
function writerFor(trsdos: Trsdos): TrsdosWriter {
    return new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_1_3);
}

/**
 * The 48 bytes of a file's primary directory entry on a TRSDOS 1.3 disk.
 */
function entry13(trsdos: Trsdos, fileName: string): Uint8Array {
    const slot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === fileName);
    if (slot === undefined) {
        throw new Error("No slot for " + fileName);
    }
    const {sectorPosition, offset} = trsdos.getDirEntryLocation(slot.hitIndex);
    return readBytes(trsdos.disk, sectorPosition).slice(offset, offset + 48);
}

/**
 * The number of granules that a file's extents hold.
 */
function granuleCount(trsdos: Trsdos, dirEntry: TrsdosDirEntry): number {
    let count = 0;
    for (const extent of trsdos.getFileExtents(dirEntry)) {
        count += extent.granuleCount;
    }
    return count;
}

describe("TrsdosWriter on TRSDOS 1.3 disks", () => {
    it("adds files of every size around the sector and granule boundaries, and reads them back", () => {
        const {writer} = make13Fixture();
        const sizes = [0, 1, 255, 256, 257, 512, 767, 768, 769, 5000];
        const contents = sizes.map((size, i) => makeContents(size, i + 1));
        sizes.forEach((size, i) => {
            const result = writer.addFile(name(`F${size}/DAT`), contents[i]);
            expect(result.size).to.eql(size);
            expect(result.warning).to.be.undefined;
        });
        const newTrsdos = writer.flush();

        sizes.forEach((size, i) => {
            const dirEntry = getFile(newTrsdos, `F${size}/DAT`);
            expect(newTrsdos.readFile(dirEntry)).to.eql(contents[i]);
            expect(dirEntry.getSize()).to.eql(size);
            // TRSDOS 1.3 counts only the full sectors and adds the end-of-file offset to them.
            expect(dirEntry.sectorCount).to.eql(Math.floor(size/256));
            expect(dirEntry.lastSectorSize).to.eql(size % 256);
            expect(granuleCount(newTrsdos, dirEntry)).to.eql(Math.ceil(Math.ceil(size/256)/3));
        });
        expect(checkTrsdos(newTrsdos).findings.filter(finding =>
            [TrsdosFindingSeverity.LAYOUT, TrsdosFindingSeverity.DAMAGE].includes(trsdosFindingKindSeverity(finding.kind))))
            .to.eql([]);
    });

    it("writes the entry byte for byte as TRSDOS 1.3 creates one", () => {
        const {overlay, trsdos, writer} = make13Fixture();
        const dirPosition = trsdos.getDirEntryLocation(0).sectorPosition;
        const oldDirSector = readBytes(overlay, dirPosition).slice();
        const oldGat = readBytes(overlay, trsdos.getGatPosition()).slice();
        const oldHit = readBytes(overlay, trsdos.getHitPosition()).slice();

        const contents = makeContents(300);
        writer.addFile(name("HELLO/BAS"), contents, {date: new Date(1983, 4, 17)});
        const newTrsdos = writer.flush();

        const rawName = "HELLO   BAS";
        const expected = new Uint8Array(48).fill(0xFF);
        expected.set([0x10, 5, 83, 300 - 256, 0], 0);
        expected.set([...rawName].map(c => c.charCodeAt(0)), 5);
        // Both passwords are blank under 1.3's hash. The one full sector is counted, and the first free granule
        // is granule 1 of cylinder 0 (granule 0 is the boot granule).
        expected.set([0xEF, 0x5C, 0xEF, 0x5C, 1, 0, 0, (1 << 5) | 1], 16);
        expect(entry13(newTrsdos, "HELLO/BAS")).to.eql(expected);

        // The HIT byte is the hash of the name, in the first slot, and the GAT has the granule's bit.
        const hit = readBytes(overlay, newTrsdos.getHitPosition());
        expect(hit[0]).to.eql(hashForFilename(rawName));
        expect(hit.subarray(1)).to.eql(oldHit.subarray(1));
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(gat[0]).to.eql(0x03);
        expect(gat.subarray(1)).to.eql(oldGat.subarray(1));

        // The rest of the directory sector, including the filler that ends it, is as FORMAT left it.
        const dirSector = readBytes(overlay, dirPosition);
        expect(dirSector.subarray(48)).to.eql(oldDirSector.subarray(48));
        expect(new TextDecoder().decode(dirSector.subarray(240)).trim()).to.eql("(c) 1980 Tandy");
    });

    it("gives the new file's data granule 1 of the first free cylinder and reads it from the disk after a commit", () => {
        const {disk, overlay, writer} = make13Fixture();
        const contents = makeContents(2000);
        writer.addFile(name("DATA/BIN"), contents, {invisible: true, system: true});
        const newTrsdos = writer.flush();
        overlay.commit();

        const reread = decodeTrsdos(disk);
        if (reread === undefined) {
            throw new Error("Didn't decode");
        }
        const dirEntry = getFile(reread, "DATA/BIN");
        expect(reread.readFile(dirEntry)).to.eql(contents);
        expect(dirEntry.isHidden()).to.be.true;
        expect(dirEntry.isSystemFile()).to.be.true;
        expect(newTrsdos.getDirEntries(true).map(entry => entry.getFilename("/"))).to.eql(["DATA/BIN"]);
    });

    it("deletes a file the way 1.3's KILL does, zeroing the entry and freeing its granules", () => {
        const first = make13Fixture();
        first.writer.addFile(name("ONE/DAT"), makeContents(1000, 1));
        first.writer.addFile(name("TWO/DAT"), makeContents(2000, 2));
        const twoDat = first.writer.flush();
        const gatBefore = readBytes(first.overlay, twoDat.getGatPosition()).slice();

        const writer = writerFor(twoDat);
        writer.deleteFile(writerFile(writer, "ONE/DAT"));
        const newTrsdos = writer.flush();

        expect(newTrsdos.getDirEntries(true).map(entry => entry.getFilename("/"))).to.eql(["TWO/DAT"]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "TWO/DAT"))).to.eql(makeContents(2000, 2));
        const {sectorPosition, offset} = newTrsdos.getDirEntryLocation(0);
        expect(readBytes(first.overlay, sectorPosition).slice(offset, offset + 48)).to.eql(new Uint8Array(48));
        expect(readBytes(first.overlay, newTrsdos.getHitPosition())[0]).to.eql(0);
        // ONE/DAT held 2 granules (4 sectors), so exactly those bits are gone from the GAT.
        const gatAfter = readBytes(first.overlay, newTrsdos.getGatPosition());
        const bits = (gat: Uint8Array) => gat.slice(0, 40).reduce((sum, b) => sum + b.toString(2).replace(/0/g, "").length, 0);
        expect(bits(gatBefore) - bits(gatAfter)).to.eql(2);

        // The freed slot and granules are the first to be reused.
        const again = writerFor(newTrsdos);
        again.addFile(name("NEW/DAT"), makeContents(1000, 3));
        const afterAdd = again.flush();
        expect(entry13(afterAdd, "NEW/DAT").subarray(22, 24)).to.eql(new Uint8Array([0, (1 << 5) | 2]));
        expect(readBytes(first.overlay, afterAdd.getHitPosition())[0]).to.eql(hashForFilename("NEW     DAT"));
    });

    it("refuses to delete, rename, replace or change a system file that the HIT lists", () => {
        // SYS1 on cylinder 5, granules 0 and 1; the system file table is in the HIT at 0xE0.
        const {writer} = make13Fixture((sectorNumber, bytes) => {
            if (sectorNumber === 2) {
                bytes.set([0x02, 5], 0xE2);
            }
        });
        const sys1 = writerFile(writer, "SYS1/SYS");

        expect(() => writer.deleteFile(sys1)).to.throw(TrsdosWriteError, "doesn't list in its directory");
        expect(() => writer.renameFile(sys1, name("X/Y"))).to.throw(TrsdosWriteError, "doesn't list in its directory");
        expect(() => writer.replaceFile(sys1, makeContents(5))).to.throw(TrsdosWriteError, "doesn't list in its directory");
        expect(() => writer.setAttributes(sys1, {invisible: true})).to.throw(TrsdosWriteError, "doesn't list in its directory");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("keeps new files off the granules that the system file table lists", () => {
        const {writer} = make13Fixture((sectorNumber, bytes) => {
            if (sectorNumber === 2) {
                bytes.set([0x02, 5], 0xE2);
            }
        });
        // Every free granule but the two of SYS1: 233 - 2, with 40 cylinders of 6, the boot granule and the directory.
        const free = 40*6 - 1 - 6 - 2;
        const contents = makeContents(free*768, 5);
        writer.addFile(name("BIG/DAT"), contents);
        const newTrsdos = writer.flush();

        const dirEntry = getFile(newTrsdos, "BIG/DAT");
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
        for (const extent of newTrsdos.getFileExtents(dirEntry)) {
            const start = extent.cylinderNumber*6 + extent.granuleOffset;
            expect(start + extent.granuleCount <= 5*6 || start >= 5*6 + 2).to.be.true;
        }
        expect(getFile(newTrsdos, "SYS1/SYS")).not.to.be.undefined;
        // The disk is now full.
        expect(() => writerFor(newTrsdos).addFile(name("MORE/DAT"), makeContents(1))).to.throw(TrsdosWriteError, "not enough room");
    });

    it("renames a file, writing the name and its new hash", () => {
        const {overlay, writer} = make13Fixture();
        writer.addFile(name("OLD/TXT"), makeContents(700));
        writer.addFile(name("OTHER/TXT"), makeContents(10));
        const trsdos = writer.flush();
        const before = entry13(trsdos, "OLD/TXT");

        const second = writerFor(trsdos);
        expect(() => second.renameFile(writerFile(second, "OLD/TXT"), name("OTHER/TXT"))).to.throw(TrsdosWriteError, "already on the disk");
        second.renameFile(writerFile(second, "OLD/TXT"), name("NEWNAME/BAS"));
        const newTrsdos = second.flush();

        const after = entry13(newTrsdos, "NEWNAME/BAS");
        expect([...after.subarray(5, 16)].map(c => String.fromCharCode(c)).join("")).to.eql("NEWNAME BAS");
        // Everything but the name is as it was.
        expect(after.subarray(0, 5)).to.eql(before.subarray(0, 5));
        expect(after.subarray(16)).to.eql(before.subarray(16));
        expect(readBytes(overlay, newTrsdos.getHitPosition())[0]).to.eql(hashForFilename("NEWNAME BAS"));
        expect(newTrsdos.readFile(getFile(newTrsdos, "NEWNAME/BAS"))).to.eql(makeContents(700));
    });

    it("changes attributes, hashing passwords the 1.3 way and dating with a month and a year", () => {
        const {writer} = make13Fixture();
        writer.addFile(name("SECRET/DAT"), makeContents(100));
        const trsdos = writer.flush();
        const firstEntry = entry13(trsdos, "SECRET/DAT");
        // A new file has blank passwords and no date.
        expect(firstEntry.subarray(1, 3)).to.eql(new Uint8Array([0, 0]));
        expect(getFile(trsdos, "SECRET/DAT").updatePassword).to.eql(TRSDOS_13_BLANK_PASSWORD_HASH);

        const second = writerFor(trsdos);
        second.setAttributes(writerFile(second, "SECRET/DAT"), {
            invisible: true, protectionLevel: TrsdosProtectionLevel.READ, updatePassword: "boss", accessPassword: "Guest1",
            date: new Date(1984, 11, 25),
        });
        const newTrsdos = second.flush();

        const dirEntry = getFile(newTrsdos, "SECRET/DAT");
        expect(dirEntry.isHidden()).to.be.true;
        expect(dirEntry.getProtectionLevel()).to.eql(TrsdosProtectionLevel.READ);
        expect(dirEntry.updatePassword).to.eql(hashTrsdos13Password("BOSS"));
        expect(dirEntry.accessPassword).to.eql(hashTrsdos13Password("GUEST1"));
        expect(dirEntry.updatePassword).not.to.eql(hashTrsdosPassword("BOSS"));
        expect(dirEntry.month).to.eql(12);
        expect(dirEntry.year).to.eql(1984);
        expect(dirEntry.day).to.eql(0);
        const bytes = entry13(newTrsdos, "SECRET/DAT");
        expect(bytes[0]).to.eql(0x10 | 0x08 | TrsdosProtectionLevel.READ);
        expect(bytes[1]).to.eql(12);
        expect(bytes[2]).to.eql(84);
        expect(bytes[16]).to.eql(hashTrsdos13Password("BOSS") & 0xFF);
        expect(bytes[17]).to.eql(hashTrsdos13Password("BOSS") >> 8);

        // Removing a password and the date puts back the blank hash and zeros.
        const third = writerFor(newTrsdos);
        third.setAttributes(writerFile(third, "SECRET/DAT"), {updatePassword: "", accessPassword: "", date: null});
        const cleared = third.flush();
        expect(getFile(cleared, "SECRET/DAT").updatePassword).to.eql(TRSDOS_13_BLANK_PASSWORD_HASH);
        expect(getFile(cleared, "SECRET/DAT").accessPassword).to.eql(TRSDOS_13_BLANK_PASSWORD_HASH);
        expect(entry13(cleared, "SECRET/DAT").subarray(1, 3)).to.eql(new Uint8Array([0, 0]));

        // The DOS only accepts passwords it can store.
        const fourth = writerFor(cleared);
        expect(() => fourth.setAttributes(writerFile(fourth, "SECRET/DAT"), {updatePassword: "1BAD"})).to.throw(TrsdosWriteError, "Invalid password");
        expect(fourth.hasChanges()).to.eql(false);
    });

    it("refuses a date it can't store", () => {
        const {writer} = make13Fixture();
        expect(() => writer.addFile(name("A/B"), makeContents(5), {date: new Date(2026, 9, 5)}))
            .to.throw(TrsdosWriteError, "can't store the year 2026");
        expect(() => writer.addFile(name("A/B"), makeContents(5), {date: new Date(1975, 0, 1)}))
            .to.throw(TrsdosWriteError, "can't store the year 1975");
        expect(writer.hasChanges()).to.eql(false);
        const result = writer.addFile(name("A/B"), makeContents(5), {date: new Date(1999, 11, 31)});
        expect(result.warning).to.be.undefined;
        const dirEntry = getFile(writer.flush(), "A/B");
        expect([dirEntry.month, dirEntry.year]).to.eql([12, 1999]);
    });

    it("refuses a file that needs more than 13 extents, but takes one with 13", () => {
        // Cylinders 0 to 39 but 17 have granules 1, 3 and 5 free and 0, 2 and 4 used, so every free granule is alone.
        const alternating = (sectorNumber: number, bytes: Uint8Array) => {
            if (sectorNumber === 1) {
                for (let cylinder = 0; cylinder < 40; cylinder++) {
                    if (cylinder !== 17) {
                        bytes[cylinder] = 0x15;
                    }
                }
            }
        };
        const {writer} = make13Fixture(alternating);
        expect(() => writer.addFile(name("TOO/BIG"), makeContents(14*768)))
            .to.throw(TrsdosWriteError, "free space is too fragmented: the file would need 14 extents and can have at most 13");
        expect(writer.hasChanges()).to.eql(false);

        const contents = makeContents(13*768, 9);
        writer.addFile(name("JUST/FIT"), contents);
        const newTrsdos = writer.flush();
        const dirEntry = getFile(newTrsdos, "JUST/FIT");
        expect(dirEntry.extents.length).to.eql(13);
        expect(dirEntry.nextDirEntry).to.be.undefined;
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
    });

    it("fills the directory's 80 entries and then says it's full, and reuses a freed slot", () => {
        const {overlay, writer} = make13Fixture();
        const fileName = (i: number) => `F${i.toString().padStart(2, "0")}`;
        for (let i = 0; i < 80; i++) {
            writer.addFile(name(fileName(i)), new Uint8Array(0));
        }
        expect(() => writer.addFile(name("ONEMORE"), new Uint8Array(0))).to.throw(TrsdosWriteError, "the directory is full");
        const full = writer.flush();
        expect(full.getDirEntries(true).length).to.eql(80);
        // The last entry is in the last (16th) directory sector, and the directory sectors still end with the filler.
        const lastDirSector = full.getDirEntryLocation(79).sectorPosition;
        expect(new TextDecoder().decode(readBytes(overlay, lastDirSector).subarray(240)).trim()).to.eql("(c) 1980 Tandy");

        const second = writerFor(full);
        second.deleteFile(writerFile(second, fileName(37)));
        second.addFile(name("ONEMORE"), makeContents(3));
        const newTrsdos = second.flush();
        expect(newTrsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "ONEMORE")?.hitIndex).to.eql(37);
    });

    it("replaces a file, keeping its slot, attributes and date", () => {
        const {writer} = make13Fixture();
        writer.addFile(name("KEEP/BAS"), makeContents(300), {date: new Date(1982, 2, 4)});
        writer.addFile(name("AFTER/BAS"), makeContents(300));
        const first = writer.flush();
        const second = writerFor(first);
        second.setAttributes(writerFile(second, "KEEP/BAS"), {invisible: true, protectionLevel: TrsdosProtectionLevel.EXEC, updatePassword: "BOSS"});
        const withAttributes = second.flush();
        const slotBefore = withAttributes.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "KEEP/BAS")!.hitIndex;

        const third = writerFor(withAttributes);
        const contents = makeContents(5000, 4);
        const result = third.replaceFile(writerFile(third, "KEEP/BAS"), contents);
        expect(result.size).to.eql(5000);
        const newTrsdos = third.flush();

        const dirEntry = getFile(newTrsdos, "KEEP/BAS");
        expect(newTrsdos.readFile(dirEntry)).to.eql(contents);
        expect(newTrsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "KEEP/BAS")!.hitIndex).to.eql(slotBefore);
        expect(dirEntry.isHidden()).to.be.true;
        expect(dirEntry.getProtectionLevel()).to.eql(TrsdosProtectionLevel.EXEC);
        expect(dirEntry.updatePassword).to.eql(hashTrsdos13Password("BOSS"));
        expect([dirEntry.month, dirEntry.year]).to.eql([3, 1982]);
        expect(newTrsdos.readFile(getFile(newTrsdos, "AFTER/BAS"))).to.eql(makeContents(300));

        // A date in the options replaces the old one.
        const fourth = writerFor(newTrsdos);
        fourth.replaceFile(writerFile(fourth, "KEEP/BAS"), makeContents(10), {date: new Date(1990, 8, 9)});
        const dated = getFile(fourth.flush(), "KEEP/BAS");
        expect([dated.month, dated.year]).to.eql([9, 1990]);
    });

    it("changes the disk's name, date, master password and AUTO command", () => {
        const {overlay, trsdos, writer} = make13Fixture();
        const info = readTrsdosDiskInfo(trsdos, TrsdosRuleSet.TRSDOS_1_3);
        expect(info).to.eql({name: "DATADISK", date: "05/17/83", passwordHash: hashTrsdos13Password("PASSWORD"), autoCommand: ""});

        writer.setDiskInfo({
            name: "my disk", date: new Date(1984, 0, 2), masterPassword: "Secret", autoCommand: "BASIC MENU",
        });
        const newTrsdos = writer.flush();

        expect(readTrsdosDiskInfo(newTrsdos, TrsdosRuleSet.TRSDOS_1_3)).to.eql({
            name: "MY DISK", date: "01/02/84", passwordHash: hashTrsdos13Password("SECRET"), autoCommand: "BASIC MENU",
        });
        const gat = readBytes(overlay, newTrsdos.getGatPosition());
        expect(gat[0xCE]).to.eql(hashTrsdos13Password("SECRET") & 0xFF);
        expect(gat[0xCF]).to.eql(hashTrsdos13Password("SECRET") >> 8);
        // The command, its 0x0D, then spaces to the end of the sector, as 1.3's AUTO command leaves them.
        expect(new TextDecoder().decode(gat.subarray(0xE0, 0xE0 + 10))).to.eql("BASIC MENU");
        expect(gat[0xEA]).to.eql(0x0D);
        expect(gat.subarray(0xEB)).to.eql(new Uint8Array(256 - 0xEB).fill(0x20));

        // The command has to fit in the 32 bytes with its terminator.
        const second = writerFor(newTrsdos);
        expect(() => second.setDiskInfo({autoCommand: "X".repeat(32)})).to.throw(TrsdosWriteError, "at most 31");
        expect(() => second.setDiskInfo({date: new Date(2026, 0, 1)})).to.throw(TrsdosWriteError, "can't store the year 2026");
        second.setDiskInfo({autoCommand: ""});
        expect(readTrsdosDiskInfo(second.flush(), TrsdosRuleSet.TRSDOS_1_3)).to.have.property("autoCommand", "");
    });

    it("refuses the rules of the other layout, and the 2.3 rules on a 1.3 disk", () => {
        const {trsdos} = make13Fixture();
        expect(() => new TrsdosWriter(trsdos, TrsdosRuleSet.LDOS_5))
            .to.throw(TrsdosWriteError, "LDOS 5 rules don't fit a disk in the TRSDOS 1.3 layout");
    });
});

/**
 * The damage and layout problems that a file system has, as the kinds of their findings.
 */
function problemKinds(trsdos: Trsdos): TrsdosFindingKind[] {
    return checkTrsdos(trsdos).findings
        .filter(finding => trsdosFindingKindSeverity(finding.kind) !== TrsdosFindingSeverity.NOTE)
        .map(finding => finding.kind);
}

/**
 * A file with five extents, so that it needs an extended directory entry. Its granules are 20:0 to 24:0.
 */
const FRAGMENTED: TestFile = {
    name: "BIG/DAT",
    extents: [20, 21, 22, 23, 24].map(lump => ({lump, granuleOffset: 0, granuleCount: 1})),
};

describe("TrsdosWriter.repair", () => {
    it("marks the granules a file uses as used in the GAT, and changes nothing else", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([HELLO, WORLD],
            {gatFree: [{lump: 3, granule: 0}, {lump: 12, granule: 0}]});
        expect(problemKinds(trsdos)).to.eql([TrsdosFindingKind.CLAIMED_BUT_FREE, TrsdosFindingKind.CLAIMED_BUT_FREE]);
        const oldGat = readBytes(disk, trsdos.getGatPosition()).slice();
        const oldHit = readBytes(disk, trsdos.getHitPosition()).slice();
        const contents = new Map(trsdos.getDirEntries(true).map(dirEntry =>
            [dirEntry.getFilename("/"), trsdos.readFile(dirEntry)]));

        const result = writer.repair();
        expect(result.changes).to.eql([
            "Marked 1 granule used in the GAT for HELLO/BAS.",
            "Marked 1 granule used in the GAT for WORLD/TXT.",
        ]);
        expect(result.remaining).to.eql([]);
        const newTrsdos = writer.flush();

        expect(problemKinds(newTrsdos)).to.eql([]);
        const expectedGat = oldGat.slice();
        expectedGat[3] |= 1;
        expectedGat[12] |= 1;
        expect(readBytes(overlay, newTrsdos.getGatPosition())).to.eql(expectedGat);
        expect(readBytes(overlay, newTrsdos.getHitPosition())).to.eql(oldHit);
        for (const dirEntry of newTrsdos.getDirEntries(true).filter(dirEntry => dirEntry.getFilename("/") !== "DIR/SYS")) {
            expect(newTrsdos.readFile(dirEntry)).to.eql(contents.get(dirEntry.getFilename("/")));
        }
    });

    it("sets a wrong HIT byte to the hash of the name, but accepts the old DIR/SYS byte", () => {
        const {disk, overlay, trsdos, writer} = makeFixture([{...HELLO, hitByte: 0x55}, WORLD]);
        expect(problemKinds(trsdos)).to.eql([TrsdosFindingKind.HIT_MISMATCH]);
        const oldHit = readBytes(disk, trsdos.getHitPosition()).slice();
        const helloSlot = trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (helloSlot === undefined) {
            throw new Error("No slot");
        }

        const result = writer.repair();
        expect(result.changes).to.eql(["Fixed the HIT byte of HELLO/BAS."]);
        const newTrsdos = writer.flush();

        expect(problemKinds(newTrsdos)).to.eql([]);
        const expectedHit = oldHit.slice();
        expectedHit[helloSlot.hitIndex] = hashForFilename("HELLO   BAS");
        expect(readBytes(overlay, newTrsdos.getHitPosition())).to.eql(expectedHit);
    });

    it("fixes the HIT bytes of an extended entry unless the rules are TRSDOS 2.x's", () => {
        const damaged: TestFile = {...FRAGMENTED, hitByte: 0x11, extendedHitByte: 0x22};

        // Under LDOS rules, both bytes are the hash of the name.
        const ldos = makeFixture([damaged], {}, TrsdosRuleSet.LDOS_5);
        expect(problemKinds(ldos.trsdos)).to.eql([TrsdosFindingKind.HIT_MISMATCH, TrsdosFindingKind.HIT_MISMATCH]);
        expect(ldos.writer.repair().changes).to.eql(["Fixed 2 HIT bytes of BIG/DAT."]);
        expect(problemKinds(ldos.writer.flush())).to.eql([]);

        // Under TRSDOS 2.x's, the extended entry's byte is left alone and reported.
        const trsdos2 = makeFixture([damaged], {}, TrsdosRuleSet.TRSDOS_2);
        const result = trsdos2.writer.repair();
        expect(result.changes).to.eql(["Fixed the HIT byte of BIG/DAT."]);
        expect(result.remaining.map(remaining => remaining.finding.kind)).to.eql([TrsdosFindingKind.HIT_MISMATCH]);
        expect(result.remaining[0].advice).to.contain("aren't understood");
        expect(problemKinds(trsdos2.writer.flush())).to.eql([TrsdosFindingKind.HIT_MISMATCH]);
    });

    it("deletes an extended entry that no file reaches", () => {
        const stray = {prevDec: testUserSlotDec(0), hitByte: 0x99, extents: [{lump: 10, granuleOffset: 0, granuleCount: 1}]};
        const {overlay, trsdos, writer} = makeFixture([HELLO], {strayExtendedEntries: [stray]});
        expect(problemKinds(trsdos)).to.eql([TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY]);

        const result = writer.repair();
        const dec = testUserSlotDec(1).toString(16).toUpperCase();
        expect(result.changes).to.eql([`Deleted the extended directory entry at DEC ${dec}, which isn't part of any file.`]);
        const newTrsdos = writer.flush();

        expect(problemKinds(newTrsdos)).to.eql([]);
        expect(readBytes(overlay, newTrsdos.getHitPosition())[testUserSlotDec(1)]).to.eql(0);
        expect(newTrsdos.getDirectory().slots.filter(slot => slot.dirEntry.isExtendedEntry())).to.eql([]);
    });

    it("leaves alone an entry with the extended flag that has a name, since it may be a file", () => {
        // The decoder takes a named entry as a primary one if its HIT byte is the name's hash, so spoil that too.
        const base = makeFixture([HELLO, WORLD]);
        const slot = base.trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "HELLO/BAS");
        if (slot === undefined) {
            throw new Error("No slot");
        }
        const {sectorPosition, offset} = base.trsdos.getDirEntryLocation(slot.hitIndex);
        const sector = readBytes(base.disk, sectorPosition).slice();
        sector[offset] |= 0x80;
        const hit = readBytes(base.disk, base.trsdos.getHitPosition()).slice();
        hit[slot.hitIndex] = 0x55;
        const patch = new SectorOverlay(base.disk);
        patch.writeSector(sectorPosition, sector);
        patch.writeSector(base.trsdos.getHitPosition(), hit);
        patch.commit();

        const overlay = new SectorOverlay(base.disk);
        const trsdos = decodeTrsdos(overlay);
        if (trsdos === undefined) {
            throw new Error("Didn't decode");
        }
        expect(problemKinds(trsdos)).to.include(TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY);

        const writer = new TrsdosWriter(trsdos, TrsdosRuleSet.TRSDOS_2);
        const result = writer.repair();
        expect(result.changes).to.eql([]);
        expect(result.remaining.map(remaining => remaining.finding.kind)).to.eql([TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY]);
        expect(result.remaining[0].advice).to.contain("It has a name");
        expect(writer.hasChanges()).to.eql(false);
    });

    it("frees unclaimed granules only when asked, and never the boot cylinder's or a locked-out one's", () => {
        const options: TestDiskOptions = {
            gatUsed: [{lump: 8, granule: 0}, {lump: 8, granule: 1}, {lump: 0, granule: 1}],
            lockedOut: [30],
        };

        // By default they stay, and are reported as kept.
        const kept = makeFixture([HELLO], options);
        const keptResult = kept.writer.repair();
        expect(keptResult.changes).to.eql([]);
        expect(keptResult.keptUnclaimed.length).to.eql(3);
        expect(keptResult.freeableUnclaimed.length).to.eql(2);
        expect(kept.writer.hasChanges()).to.eql(false);

        const freed = makeFixture([HELLO], options);
        const freedResult = freed.writer.repair({freeUnclaimed: true});
        expect(freedResult.changes).to.eql(["Freed 2 granules that the GAT marked used and no file claims."]);
        expect(freedResult.keptUnclaimed.map(granule => `${granule.lump}:${granule.granule}`))
            .to.eql(["0:1", "30:0", "30:1"]);
        expect(freedResult.freeableUnclaimed).to.eql([]);
        const newTrsdos = freed.writer.flush();

        const gat = readBytes(freed.overlay, newTrsdos.getGatPosition());
        expect(gat[8] & 3).to.eql(0);
        expect(gat[0] & 2).to.eql(2);
        expect(gat[30] & 3).to.eql(3);
        expect(problemKinds(newTrsdos)).to.eql([]);
    });

    it("leaves shared granules as remaining, and still fixes the rest", () => {
        const first: TestFile = {name: "ONE/DAT", extents: [{lump: 6, granuleOffset: 0, granuleCount: 2}]};
        const second: TestFile = {
            name: "TWO/DAT", extents: [{lump: 6, granuleOffset: 1, granuleCount: 2}], hitByte: 0x77,
        };
        const {trsdos, writer} = makeFixture([first, second]);
        expect(problemKinds(trsdos)).to.eql([TrsdosFindingKind.SHARED_GRANULES, TrsdosFindingKind.HIT_MISMATCH]);

        const result = writer.repair();
        expect(result.changes).to.eql(["Fixed the HIT byte of TWO/DAT."]);
        expect(result.remaining.map(remaining => remaining.finding.kind)).to.eql([TrsdosFindingKind.SHARED_GRANULES]);
        expect(result.remaining[0].advice).to.contain("can't be repaired automatically");
        expect(problemKinds(writer.flush())).to.eql([TrsdosFindingKind.SHARED_GRANULES]);
    });

    it("changes nothing on a healthy disk", () => {
        const {writer} = makeFixture([HELLO, WORLD]);
        const result = writer.repair();
        expect(result).to.eql({changes: [], remaining: [], keptUnclaimed: [], freeableUnclaimed: []});
        expect(writer.hasChanges()).to.eql(false);
        expect(problemKinds(writer.flush())).to.eql([]);
    });

    it("must be the only change, and can only be made once", () => {
        const first = makeFixture([HELLO, WORLD]);
        first.writer.deleteFile(writerFile(first.writer, "WORLD/TXT"));
        expect(() => first.writer.repair()).to.throw(TrsdosWriteError, "only change");

        const second = makeFixture([HELLO, WORLD]);
        second.writer.repair();
        expect(() => second.writer.repair()).to.throw(TrsdosWriteError, "already repaired");
    });

    describe("on TRSDOS 1.3 disks", () => {
        /**
         * Make a TRSDOS 1.3 disk with three files, damaged by freeing the first file's granules in the GAT and changing
         * its HIT byte (unless told not to), and a writer on it.
         */
        function makeDamaged13(damageHit = true): Fixture {
            const formatted = make13Fixture();
            formatted.writer.addFile(name("HELLO/BAS"), makeContents(1000, 1));
            formatted.writer.addFile(name("WORLD/TXT"), makeContents(300, 2));
            formatted.writer.addFile(name("OTHER/TXT"), makeContents(300, 3));
            const added = formatted.writer.flush();
            formatted.overlay.commit();

            const patch = new SectorOverlay(formatted.disk);
            const gat = readBytes(formatted.disk, added.getGatPosition()).slice();
            const hit = readBytes(formatted.disk, added.getHitPosition()).slice();
            // The file is on cylinder 0, granules 1 and 2 (granule 0 is the boot granule).
            gat[0] = 0x01;
            if (damageHit) {
                hit[0] = 0x66;
            }
            patch.writeSector(added.getGatPosition(), gat);
            patch.writeSector(added.getHitPosition(), hit);
            patch.commit();

            const overlay = new SectorOverlay(formatted.disk);
            const trsdos = decodeTrsdos(overlay);
            if (trsdos === undefined) {
                throw new Error("Didn't decode");
            }
            return {disk: formatted.disk, overlay, trsdos, writer: writerFor(trsdos)};
        }

        it("leaves alone an entry with bit 7 set, which 1.3 doesn't use, since it may be a file", () => {
            const base = makeDamaged13(false);
            const slot = base.trsdos.getDirectory().slots.find(slot => slot.dirEntry.getFilename("/") === "WORLD/TXT");
            if (slot === undefined) {
                throw new Error("No slot");
            }
            const {sectorPosition, offset} = base.trsdos.getDirEntryLocation(slot.hitIndex);
            const sector = readBytes(base.disk, sectorPosition).slice();
            sector[offset] |= 0x80;
            const patch = new SectorOverlay(base.disk);
            patch.writeSector(sectorPosition, sector);
            patch.commit();

            const overlay = new SectorOverlay(base.disk);
            const trsdos = decodeTrsdos(overlay);
            if (trsdos === undefined) {
                throw new Error("Didn't decode");
            }
            expect(problemKinds(trsdos)).to.include(TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY);

            const writer = writerFor(trsdos);
            const result = writer.repair();
            expect(result.remaining.map(remaining => remaining.finding.kind)).to.eql([TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY]);
            expect(result.remaining[0].advice).to.contain("TRSDOS 1.3 has no extended entries");
            const entryBefore = readBytes(overlay, sectorPosition).slice(offset, offset + 48);
            const newTrsdos = writer.flush();
            expect(readBytes(overlay, sectorPosition).slice(offset, offset + 48)).to.eql(entryBefore);
            expect(problemKinds(newTrsdos)).to.eql([TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY]);
            expect(newTrsdos.getDirEntries(false).map(dirEntry => dirEntry.getFilename("/"))).to.eql(["HELLO/BAS", "OTHER/TXT"]);
        });

        it("fixes the GAT and the HIT byte, and the file reads as before", () => {
            const {trsdos, writer} = makeDamaged13();
            expect(problemKinds(trsdos)).to.eql([
                TrsdosFindingKind.CLAIMED_BUT_FREE, TrsdosFindingKind.CLAIMED_BUT_FREE,
                TrsdosFindingKind.CLAIMED_BUT_FREE, TrsdosFindingKind.HIT_MISMATCH,
            ]);
            const contents = trsdos.readFile(getFile(trsdos, "HELLO/BAS"));

            const result = writer.repair({freeUnclaimed: true});
            expect(result.changes).to.eql([
                "Marked 2 granules used in the GAT for HELLO/BAS.",
                "Marked 1 granule used in the GAT for WORLD/TXT.",
                "Marked 1 granule used in the GAT for OTHER/TXT.",
                "Fixed the HIT byte of HELLO/BAS.",
            ]);
            // The boot granule is unclaimed, but it's never freed.
            expect(result.keptUnclaimed.map(granule => `${granule.lump}:${granule.granule}`)).to.eql(["0:0"]);
            const newTrsdos = writer.flush();

            expect(problemKinds(newTrsdos)).to.eql([]);
            expect(newTrsdos.readFile(getFile(newTrsdos, "HELLO/BAS"))).to.eql(contents);
        });
    });
});
