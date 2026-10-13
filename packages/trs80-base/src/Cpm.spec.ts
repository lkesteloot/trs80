import {describe, expect, it} from "vitest";
import {decodeCpm, findCpmTextEnd} from "./Cpm.js";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";

// Montezuma Micro's single-sided system format: 40 cylinders of 18 sectors of 256 bytes,
// numbered from 1, 2 reserved tracks, 2K blocks, 128 directory entries, skew 2.
const CYLINDER_COUNT = 40;
const SECTORS_PER_TRACK = 18;
const SECTOR_SIZE = 256;
const RESERVED_TRACKS = 2;
const SECTORS_PER_BLOCK = 2048/SECTOR_SIZE;

/**
 * A floppy whose sectors are kept in a map, all filled with 0xE5 as FORMAT leaves them.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();

    constructor() {
        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            for (let sector = 1; sector <= SECTORS_PER_TRACK; sector++) {
                const position = SectorPosition.make(cylinder, 0, sector);
                sectorInfos.push(new SectorInfo(position, Density.DOUBLE, SECTOR_SIZE));
                this.sectors.set(position.key(), new Uint8Array(SECTOR_SIZE).fill(0xE5));
            }
        }
        this.geometry = FloppyDiskGeometry.make(CYLINDER_COUNT, 1, sectorInfos)!;
    }

    /**
     * Describes the test disk.
     */
    public getDescription(): string {
        return "Test floppy";
    }

    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    /**
     * Read a sector from the map.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const data = this.sectors.get(sectorPosition.key());
        return data === undefined ? undefined : new SectorData(data, sectorPosition, Density.DOUBLE);
    }

    /**
     * Get the data of a sector to fill in.
     */
    public getSectorData(sectorPosition: SectorPosition): Uint8Array {
        return this.sectors.get(sectorPosition.key())!;
    }
}

/**
 * Position of a sector of the data area, written out independently of the decoder: with
 * a skew of 2, the 18 logical sectors are physical 0, 2, ..., 16, then 1, 3, ..., 17.
 */
function dataSectorPosition(sectorIndex: number): SectorPosition {
    const track = RESERVED_TRACKS + Math.floor(sectorIndex/SECTORS_PER_TRACK);
    const logical = sectorIndex % SECTORS_PER_TRACK;
    const physical = logical < SECTORS_PER_TRACK/2 ? logical*2 : (logical - SECTORS_PER_TRACK/2)*2 + 1;
    return SectorPosition.make(track, 0, physical + 1);
}

/**
 * Write bytes to consecutive blocks, starting at the given one.
 */
function writeBlocks(disk: MemoryFloppyDisk, firstBlock: number, bytes: Uint8Array): void {
    for (let offset = 0; offset < bytes.length; offset += SECTOR_SIZE) {
        const sectorIndex = firstBlock*SECTORS_PER_BLOCK + offset/SECTOR_SIZE;
        disk.getSectorData(dataSectorPosition(sectorIndex)).set(bytes.subarray(offset, offset + SECTOR_SIZE));
    }
}

/**
 * Make a directory entry with 8-bit block numbers.
 */
function makeDirEntry(user: number, filename: string, ex: number, rc: number, blocks: number[]): Uint8Array {
    const entry = new Uint8Array(32);
    entry[0] = user;
    const [name, extension] = filename.split(".");
    const padded = name.padEnd(8) + extension.padEnd(3);
    for (let i = 0; i < 11; i++) {
        entry[1 + i] = padded.charCodeAt(i);
    }
    entry[12] = ex;
    entry[15] = rc;
    entry.set(blocks, 16);
    return entry;
}

/**
 * Bytes that differ from file to file and from sector to sector.
 */
function makeContents(size: number, seed: number): Uint8Array {
    return Uint8Array.from({length: size}, (_, i) => (i*7 + Math.floor(i/SECTOR_SIZE) + seed) & 0xFF);
}

/**
 * Range of numbers from first to first + count - 1.
 */
function range(first: number, count: number): number[] {
    return Array.from({length: count}, (_, i) => first + i);
}

/**
 * Bytes of ASCII text, such as the start of a document.
 */
function makeText(length: number): Uint8Array {
    const line = "The quick brown fox jumps over the lazy dog.\r\n";
    return Uint8Array.from({length}, (_, i) => line.charCodeAt(i % line.length));
}

/**
 * Pad the bytes out to a whole number of 128-byte records, with Ctrl-Zs or, if a filler is
 * given, that byte.
 */
function padToRecords(bytes: Uint8Array, filler = 0x1A): Uint8Array {
    const size = Math.ceil(bytes.length/128)*128;
    const result = new Uint8Array(size).fill(filler);
    result.set(bytes);
    return result;
}

/**
 * Concatenate byte arrays.
 */
function concat(... arrays: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0;
    for (const array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }
    return result;
}

describe("findCpmTextEnd", () => {
    it("clips text padded with Ctrl-Zs", () => {
        const data = padToRecords(makeText(300));
        expect(findCpmTextEnd(data, "TXT")).to.equal(300);
    });

    it("clips at the first Ctrl-Z when there's leftover text after it", () => {
        // Like TRANS.HLP.
        const data = padToRecords(makeText(300));
        data.set(makeText(40), 340);
        expect(findCpmTextEnd(data, "HLP")).to.equal(300);
    });

    it("clips a file with a whole record of Ctrl-Zs and one of stale data", () => {
        // Like DUMP.ASM: the text ends in a record of Ctrl-Zs, then one more record of junk.
        const text = padToRecords(makeText(300));
        const junk = makeContents(128, 5).map(b => b === 0x1A ? 0x1B : b);
        expect(findCpmTextEnd(concat(text, junk), "ASM")).to.equal(300);
        // Two records of padding before the junk is too far from the end.
        const early = concat(padToRecords(makeText(100)), new Uint8Array(128).fill(0x1A), junk);
        expect(findCpmTextEnd(early, "ASM")).to.be.undefined;
    });

    it("keeps files with an early Ctrl-Z whole", () => {
        const data = padToRecords(makeText(600));
        data.set(makeText(50), 0);
        data[50] = 0x1A;
        expect(findCpmTextEnd(data, "TXT")).to.be.undefined;
    });

    it("keeps a second-to-last-record Ctrl-Z whole if it's followed by text", () => {
        const data = padToRecords(makeText(512));
        data[300] = 0x1A;
        expect(findCpmTextEnd(data, "TXT")).to.be.undefined;
    });

    it("keeps files with binary extensions whole", () => {
        const data = padToRecords(makeText(300));
        expect(findCpmTextEnd(data, "COM")).to.be.undefined;
        expect(findCpmTextEnd(data, "com")).to.be.undefined;
        expect(findCpmTextEnd(data, "AZM")).to.be.undefined;
        expect(findCpmTextEnd(data, "DQC")).to.be.undefined;
        expect(findCpmTextEnd(data, "")).to.equal(300);
        expect(findCpmTextEnd(data, "Q")).to.equal(300);
    });

    it("keeps binary data with a Ctrl-Z in the last record whole", () => {
        const data = makeContents(3*128, 9);
        data.fill(0x55, 2*128);
        data[2*128 + 40] = 0x1A;
        expect(findCpmTextEnd(data, "DAT")).to.be.undefined;
    });

    it("ignores bit 7, which WordStar sets", () => {
        const text = makeText(300).map((b, i) => i % 5 === 0 ? b | 0x80 : b);
        expect(findCpmTextEnd(padToRecords(text), "DOK")).to.equal(300);
    });

    it("keeps files without a Ctrl-Z whole", () => {
        expect(findCpmTextEnd(makeText(256), "TXT")).to.be.undefined;
    });

    it("clips a file of only Ctrl-Zs to nothing", () => {
        expect(findCpmTextEnd(new Uint8Array(128).fill(0x1A), "TXT")).to.equal(0);
    });
});

describe("cpm", () => {
    it("reads files from a Montezuma Micro disk", () => {
        const disk = new MemoryFloppyDisk();

        // A file of three records in block 2.
        const small = makeContents(3*128, 1);
        writeBlocks(disk, 2, small);

        // A 40K file in blocks 3 to 22. With 2K blocks and fewer than 256 of them, each entry
        // holds 32K, two logical extents: the first entry is extent 1, full, and the
        // second is extent 2, with 64 records.
        const big = makeContents(40*1024, 2);
        writeBlocks(disk, 3, big);

        // A read-only file for user 3.
        const other = makeContents(128, 3);
        writeBlocks(disk, 23, other);

        // The directory is in blocks 0 and 1. Leave the rest of it unused (0xE5).
        const dir = new Uint8Array(4*32);
        dir.set(makeDirEntry(0, "SMALL.TXT", 0, 3, [2]), 0);
        dir.set(makeDirEntry(0, "BIG.COM", 2, 64, range(19, 4)), 32);
        dir.set(makeDirEntry(0, "BIG.COM", 1, 128, range(3, 16)), 64);
        const otherEntry = makeDirEntry(3, "OTHER.DAT", 0, 1, [23]);
        otherEntry[9] |= 0x80;
        dir.set(otherEntry, 96);
        writeBlocks(disk, 0, dir);

        const cpm = decodeCpm(disk);
        expect(cpm).to.not.be.undefined;
        expect(cpm!.nameAndVersion).to.equal("Montezuma Micro CP/M");
        expect(cpm!.reservedTrackCount).to.equal(RESERVED_TRACKS);
        expect(cpm!.blockCount).to.equal(85);

        const files = cpm!.getDirEntries(true);
        expect(files.map(file => file.getFilename("."))).to.eql(["SMALL.TXT", "BIG.COM", "OTHER.DAT"]);
        const [smallFile, bigFile, otherFile] = files;

        expect(smallFile.getSize()).to.equal(small.length);
        expect(cpm!.readFile(smallFile)).to.eql(small);

        expect(bigFile.extents.map(extent => extent.extentNumber)).to.eql([1, 2]);
        expect(bigFile.getSize()).to.equal(big.length);
        expect(cpm!.readFile(bigFile)).to.eql(big);

        expect(otherFile.user).to.equal(3);
        expect(otherFile.getAttributesString()).to.equal("R/O");
        expect(cpm!.readFile(otherFile)).to.eql(other);
    });

    it("ends text files at the Ctrl-Z unless asked for whole records", () => {
        const disk = new MemoryFloppyDisk();

        // A text file of 300 bytes in 3 records, and a binary file of 2 records.
        const records = padToRecords(makeText(300));
        writeBlocks(disk, 2, records);
        const binary = makeContents(2*128, 4);
        writeBlocks(disk, 3, binary);
        const dir = new Uint8Array(2*32);
        dir.set(makeDirEntry(0, "NOTE.TXT", 0, 3, [2]), 0);
        dir.set(makeDirEntry(0, "DATA.COM", 0, 2, [3]), 32);
        writeBlocks(disk, 0, dir);

        // Clipped by default, but the file still owns all three records.
        const clipped = decodeCpm(disk)!;
        expect(clipped.wholeRecords).to.be.false;
        const [clippedNote, clippedData] = clipped.getDirEntries(true);
        expect(clippedNote.getSize()).to.equal(300);
        expect(clippedNote.getRecordSize()).to.equal(3*128);
        expect(clipped.readFile(clippedNote)).to.eql(records.subarray(0, 300));
        expect(clipped.getFileSectorPositions(clippedNote).length).to.equal(2);
        expect(clipped.getFileSectorPositions(clippedNote)).to.eql([
            dataSectorPosition(2*SECTORS_PER_BLOCK), dataSectorPosition(2*SECTORS_PER_BLOCK + 1)]);
        expect(clippedData.getSize()).to.equal(binary.length);
        expect(clipped.readFile(clippedData)).to.eql(binary);

        // Whole records on request.
        const whole = decodeCpm(disk, true)!;
        expect(whole.wholeRecords).to.be.true;
        const [wholeNote] = whole.getDirEntries(true);
        expect(wholeNote.getSize()).to.equal(records.length);
        expect(whole.readFile(wholeNote)).to.eql(records);
        expect(whole.getFileSectorPositions(wholeNote)).to.eql(clipped.getFileSectorPositions(clippedNote));
    });

    it("rejects a blank disk", () => {
        expect(decodeCpm(new MemoryFloppyDisk())).to.be.undefined;
    });

    it("rejects a directory whose blocks don't match its record counts", () => {
        const disk = new MemoryFloppyDisk();
        writeBlocks(disk, 0, makeDirEntry(0, "WRONG.TXT", 0, 3, [2, 3]));
        expect(decodeCpm(disk)).to.be.undefined;
    });
});
