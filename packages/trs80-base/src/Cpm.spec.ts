import {describe, expect, it} from "vitest";
import {decodeCpm} from "./Cpm.js";
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

    it("rejects a blank disk", () => {
        expect(decodeCpm(new MemoryFloppyDisk())).to.be.undefined;
    });

    it("rejects a directory whose blocks don't match its record counts", () => {
        const disk = new MemoryFloppyDisk();
        writeBlocks(disk, 0, makeDirEntry(0, "WRONG.TXT", 0, 3, [2, 3]));
        expect(decodeCpm(disk)).to.be.undefined;
    });
});
