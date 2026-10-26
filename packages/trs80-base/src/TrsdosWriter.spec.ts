import {describe, expect, it} from "vitest";
import {type FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {SectorOverlay} from "./SectorOverlay.js";
import {decodeTrsdos, type Trsdos} from "./Trsdos.js";
import {makeTrsdos23TestDisk, type TestDiskOptions, type TestFile, testUserSlotDec} from "./TrsdosTestDisk.js";
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
 */
function makeFixture(files: TestFile[], options: TestDiskOptions = {}): Fixture {
    const disk = makeTrsdos23TestDisk(files, options);
    const overlay = new SectorOverlay(disk);
    const trsdos = decodeTrsdos(overlay);
    if (trsdos === undefined) {
        throw new Error("Test disk didn't decode as TRSDOS");
    }
    return {disk, overlay, trsdos, writer: new TrsdosWriter(trsdos)};
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
        const writer2 = new TrsdosWriter(newTrsdos);
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
        expect(() => new TrsdosWriter(trsdos)).to.throw(TrsdosWriteError);
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
