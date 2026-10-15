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
    private readonly crcErrorKeys = new Set<string>();

    /**
     * @param cylinderCount the number of cylinders in the image.
     * @param sectorSizes the sizes of the sectors on every track, which are numbered from 1.
     */
    constructor(cylinderCount = CYLINDER_COUNT,
                sectorSizes: readonly number[] = new Array<number>(SECTORS_PER_TRACK).fill(SECTOR_SIZE)) {

        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < cylinderCount; cylinder++) {
            for (let i = 0; i < sectorSizes.length; i++) {
                const position = SectorPosition.make(cylinder, 0, i + 1);
                sectorInfos.push(new SectorInfo(position, Density.DOUBLE, sectorSizes[i]));
                this.sectors.set(position.key(), new Uint8Array(sectorSizes[i]).fill(0xE5));
            }
        }
        this.geometry = FloppyDiskGeometry.make(cylinderCount, 1, sectorInfos)!;
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
        if (data === undefined) {
            return undefined;
        }
        const sectorData = new SectorData(data, sectorPosition, Density.DOUBLE);
        sectorData.crcError = this.crcErrorKeys.has(sectorPosition.key());
        return sectorData;
    }

    /**
     * Remove a sector, so that it can't be read.
     */
    public removeSector(sectorPosition: SectorPosition): void {
        this.sectors.delete(sectorPosition.key());
    }

    /**
     * Make a sector read with a CRC error.
     */
    public setCrcError(sectorPosition: SectorPosition): void {
        this.crcErrorKeys.add(sectorPosition.key());
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

// Sizes of the sectors on a Montezuma Micro "Super Data" track, numbered from 1.
const SUPER_DATA_SECTOR_SIZES = [1024, 1024, 1024, 1024, 1024, 512];

// Sectors of a Super Data track in the order that the BIOS uses them (skew 2).
const SUPER_DATA_LOGICAL_SECTORS = [1, 3, 5, 2, 4, 6];

// Records (128 bytes) on a Super Data track: (5*1024 + 512)/128.
const SUPER_DATA_RECORDS_PER_TRACK = 44;

/**
 * Where a record of a Super Data disk is, written out independently of the decoder. There
 * are no reserved tracks and the disk is single-sided, so the track is the cylinder.
 */
function superDataLocation(record: number): {position: SectorPosition, offset: number} {
    const cylinder = Math.floor(record/SUPER_DATA_RECORDS_PER_TRACK);
    let remaining = record % SUPER_DATA_RECORDS_PER_TRACK;
    for (const sectorNumber of SUPER_DATA_LOGICAL_SECTORS) {
        const sectorRecords = SUPER_DATA_SECTOR_SIZES[sectorNumber - 1]/128;
        if (remaining < sectorRecords) {
            return {position: SectorPosition.make(cylinder, 0, sectorNumber), offset: remaining*128};
        }
        remaining -= sectorRecords;
    }
    throw new Error("record not on track");
}

/**
 * Write bytes to consecutive records of a Super Data disk, starting at the given one.
 */
function writeSuperDataRecords(disk: MemoryFloppyDisk, firstRecord: number, bytes: Uint8Array): void {
    for (let offset = 0; offset < bytes.length; offset += 128) {
        const {position, offset: sectorOffset} = superDataLocation(firstRecord + offset/128);
        disk.getSectorData(position).set(bytes.subarray(offset, offset + 128), sectorOffset);
    }
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
    it("reports damage to files", () => {
        const disk = new MemoryFloppyDisk();

        // A file of 4 sectors in block 2 (2K blocks, so 8 sectors each).
        const contents = makeContents(4*256, 5);
        writeBlocks(disk, 2, contents);
        const dir = new Uint8Array(32);
        dir.set(makeDirEntry(0, "DAMAGED.DAT", 0, 8, [2]), 0);
        writeBlocks(disk, 0, dir);

        // Damage the file's second and third sectors. The skew puts logical sector i of the
        // block at the position that dataSectorPosition() gives.
        const firstSector = 2*8;
        disk.removeSector(dataSectorPosition(firstSector + 1));
        disk.setCrcError(dataSectorPosition(firstSector + 2));

        const cpm = decodeCpm(disk)!;
        expect(cpm).to.not.be.undefined;
        const file = cpm.getDirEntries(true)[0];
        const {binary, damage} = cpm.readFileWithDamage(file);
        expect(damage.isDamaged()).to.be.true;
        expect(damage.missingSectors.map(position => position.key()))
            .to.eql([dataSectorPosition(firstSector + 1).key()]);
        expect(damage.crcErrorSectors.map(position => position.key()))
            .to.eql([dataSectorPosition(firstSector + 2).key()]);
        expect(damage.toString()).to.equal("1 missing sector, 1 sector with a CRC error");
        expect(binary.length).to.equal(4*256);
        expect(Array.from(binary.subarray(256, 512))).to.eql(new Array(256).fill(0));
        expect(Array.from(binary.subarray(0, 256))).to.eql(Array.from(contents.subarray(0, 256)));
    });

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

    it("reads blocks that don't start on sector boundaries from a Montezuma Micro Super Data disk", () => {
        const disk = new MemoryFloppyDisk(40, SUPER_DATA_SECTOR_SIZES);

        // Each track holds 44 records and a block is 16 records, so block b starts at record
        // 16*b, which is track floor(16*b/44), record (16*b) % 44. The logical sector order is
        // 1, 3, 5, 2, 4, 6 with 8, 8, 8, 8, 8, and 4 records.
        //
        // Block 2 is records 32-47: track 0 records 32-43 (all of sector 4, then all of sector
        // 6) and track 1 records 0-3 (the first half of sector 1).
        const across = makeContents(2048, 11);
        writeSuperDataRecords(disk, 2*16, across);

        // Block 3 is records 48-63: track 1 records 4-19, which are the second half of sector 1
        // (records 4-7), all of sector 3 (records 8-15) and the first half of sector 5
        // (records 16-19).
        const middle = makeContents(2048, 12);
        writeSuperDataRecords(disk, 3*16, middle);

        // Block 4 is records 64-79: track 1 records 20-35. A file of its first 4 records
        // (track 1 records 20-23) is the second half of sector 5, which it shares with block 3.
        const shared = makeContents(4*128, 13);
        writeSuperDataRecords(disk, 4*16, shared);

        // The directory is in blocks 0 and 1, which are track 0 and part of track 1.
        const dir = new Uint8Array(3*32);
        dir.set(makeDirEntry(0, "ACROSS.DAT", 0, 16, [2]), 0);
        dir.set(makeDirEntry(0, "MIDDLE.DAT", 0, 16, [3]), 32);
        dir.set(makeDirEntry(0, "SHARED.DAT", 0, 4, [4]), 64);
        writeSuperDataRecords(disk, 0, padToRecords(dir, 0xE5));

        const cpm = decodeCpm(disk);
        expect(cpm).to.not.be.undefined;
        expect(cpm!.nameAndVersion).to.equal("Montezuma Micro CP/M");
        expect(cpm!.reservedTrackCount).to.equal(0);
        expect(cpm!.cylinderCount).to.equal(40);
        expect(cpm!.recordsPerTrack).to.equal(44);
        expect(cpm!.recordsPerBlock).to.equal(16);
        // 40 tracks of 44 records of 128 bytes, in blocks of 2048 bytes.
        expect(cpm!.blockCount).to.equal(110);

        const files = cpm!.getDirEntries(true);
        expect(files.map(file => file.getFilename("."))).to.eql(["ACROSS.DAT", "MIDDLE.DAT", "SHARED.DAT"]);
        const [acrossFile, middleFile, sharedFile] = files;
        expect(cpm!.readFile(acrossFile)).to.eql(across);
        expect(cpm!.readFile(middleFile)).to.eql(middle);
        expect(cpm!.readFile(sharedFile)).to.eql(shared);

        // Block 2 starts in sector 4 of cylinder 0, then goes to sector 6, then sector 1 of cylinder 1.
        expect(cpm!.getFileSectorPositions(acrossFile).map(position => position.key())).to.eql([
            SectorPosition.make(0, 0, 4).key(),
            SectorPosition.make(0, 0, 6).key(),
            SectorPosition.make(1, 0, 1).key(),
        ]);
        // Block 3 uses sectors 1, 3, and 5 of cylinder 1.
        expect(cpm!.getFileSectorPositions(middleFile).map(position => position.key())).to.eql([
            SectorPosition.make(1, 0, 1).key(),
            SectorPosition.make(1, 0, 3).key(),
            SectorPosition.make(1, 0, 5).key(),
        ]);
        // The shared file is only in the second half of sector 5, which the block-3 file also uses.
        expect(cpm!.getFileSectorPositions(sharedFile).map(position => position.key())).to.eql([
            SectorPosition.make(1, 0, 5).key(),
        ]);
    });

    it("reads a truncated image as the drive size that its directory fits", () => {
        // The directory has a file in blocks 72 to 75, which are on cylinders 34 and 35 of a
        // disk of 40 cylinders: block b starts at sector 8*b, which is track 2 + floor(8*b/18).
        // The nominal size of 35 has 74 blocks and can't hold them.
        //
        // A second file in blocks 2 to 9 is on tracks 2 to 6. Without it, reading the 30
        // cylinders as double-sided would find the late file's first blocks on side 0 of
        // cylinder 17 and lose fewer sectors than the real reading does.
        const entry = concat(makeDirEntry(0, "LATE.DAT", 0, 64, range(72, 4)),
            makeDirEntry(0, "EARLY.DAT", 0, 128, range(2, 8)));
        const contents = makeContents(4*2048, 7);

        // A full image, which is not read as the next bigger size, 80.
        const full = new MemoryFloppyDisk();
        writeBlocks(full, 72, contents);
        writeBlocks(full, 0, entry);
        const fullCpm = decodeCpm(full)!;
        expect(fullCpm).to.not.be.undefined;
        expect(fullCpm.cylinderCount).to.equal(40);
        expect(fullCpm.blockCount).to.equal(85);
        const [fullFile] = fullCpm.getDirEntries(true);
        expect(fullFile.getFilename(".")).to.equal("LATE.DAT");
        expect(fullCpm.readFile(fullFile)).to.eql(contents);

        // The same disk with only 30 cylinders in the image. The file's blocks are all
        // missing, and only a size of 40 or more accepts them, of which 40 wins.
        const truncated = new MemoryFloppyDisk(30);
        writeBlocks(truncated, 0, entry);
        const truncatedCpm = decodeCpm(truncated)!;
        expect(truncatedCpm).to.not.be.undefined;
        expect(truncatedCpm.geometry.cylinderCount).to.equal(30);
        expect(truncatedCpm.cylinderCount).to.equal(40);
        expect(truncatedCpm.blockCount).to.equal(85);
        const files = truncatedCpm.getDirEntries(true);
        expect(files.map(file => file.getFilename("."))).to.eql(["LATE.DAT", "EARLY.DAT"]);
        const {binary, damage} = truncatedCpm.readFileWithDamage(files[0]);
        expect(damage.missingSectors.length).to.equal(4*8);
        expect(damage.crcErrorSectors.length).to.equal(0);
        expect(binary.length).to.equal(contents.length);
        expect(Array.from(binary)).to.eql(new Array(contents.length).fill(0));
        expect(truncatedCpm.evaluation.missingSectorCount).to.equal(4*8);
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
