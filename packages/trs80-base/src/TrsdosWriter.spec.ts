import {describe, expect, it} from "vitest";
import {type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos, TRSDOS_BLANK_PASSWORD_HASH, hashForFilename, type Trsdos} from "./Trsdos.js";
import {checkTrsdos} from "./TrsdosCheck.js";
import {reservedDecs} from "./TrsdosDirSlots.js";
import {parseTrsdosFilename, type TrsdosFilename} from "./TrsdosFilename.js";
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

    it("refuses a file that needs more than four extents, and changes nothing", () => {
        // Granule 0 of every lump is free and granule 1 is used, so no two free granules touch.
        const used: TestGranule[] = [{lump: 0, granule: 1}];
        for (let lump = 1; lump < 35; lump++) {
            if (lump !== 17) {
                used.push({lump, granule: 1});
            }
        }
        const {overlay, writer} = makeFixture([], {gatUsed: used});

        expect(() => writer.addFile(name("FRAG/DAT"), makeContents(5*1280)))
            .to.throw(TrsdosWriteError, "extended directory entries aren't supported yet");
        expect(writer.hasChanges()).to.eql(false);
        expect(overlay.hasChanges()).to.eql(false);

        // Four extents fit.
        writer.addFile(name("FOUR/DAT"), makeContents(4*1280));
        const newTrsdos = writer.flush();
        expect(getFile(newTrsdos, "FOUR/DAT").extents.length).to.eql(4);
        expect(newTrsdos.readFile(getFile(newTrsdos, "FOUR/DAT"))).to.eql(makeContents(4*1280));
    });

    it("refuses to add after the writer has flushed", () => {
        const {writer} = makeFixture([HELLO]);
        writer.flush();
        expect(() => writer.addFile(name("LATE"), makeContents(1))).to.throw(TrsdosWriteError, "already been flushed");
    });
});
