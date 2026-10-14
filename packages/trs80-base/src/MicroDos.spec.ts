import {describe, expect, it} from "vitest";
import {decodeBasicProgram} from "./Basic.js";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {decodeMicroDos} from "./MicroDos.js";

// Single-sided, single density, 10 sectors of 256 bytes numbered from 0.
const CYLINDER_COUNT = 40;
const SECTORS_PER_TRACK = 10;
const SECTOR_SIZE = 256;
const DIR_ENTRY_SIZE = 45;

/**
 * The physical position of an absolute sector number.
 */
function absolutePosition(sector: number): SectorPosition {
    return SectorPosition.make(Math.floor(sector/SECTORS_PER_TRACK), 0, sector % SECTORS_PER_TRACK);
}

/**
 * A floppy whose sectors are kept in a map, all filled with 0xE5.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();
    private readonly crcErrorKeys = new Set<string>();

    constructor() {
        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            for (let sector = 0; sector < SECTORS_PER_TRACK; sector++) {
                const position = SectorPosition.make(cylinder, 0, sector);
                sectorInfos.push(new SectorInfo(position, Density.SINGLE, SECTOR_SIZE));
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
        if (data === undefined) {
            return undefined;
        }
        const sectorData = new SectorData(data, sectorPosition, Density.SINGLE);
        sectorData.crcError = this.crcErrorKeys.has(sectorPosition.key());
        return sectorData;
    }

    /**
     * Remove an absolute sector, so that it can't be read.
     */
    public removeAbsoluteSector(sector: number): void {
        this.sectors.delete(absolutePosition(sector).key());
    }

    /**
     * Make an absolute sector read with a CRC error.
     */
    public setAbsoluteSectorCrcError(sector: number): void {
        this.crcErrorKeys.add(absolutePosition(sector).key());
    }

    /**
     * Get the data of an absolute sector number to fill in.
     */
    public getAbsoluteSector(sector: number): Uint8Array {
        return this.sectors.get(absolutePosition(sector).key())!;
    }
}

/**
 * Make a 45-byte directory entry.
 */
function makeEntry(name: string, first: number, last: number, type: string, remark: string): Uint8Array {
    const entry = new Uint8Array(DIR_ENTRY_SIZE);
    const text = name.padEnd(10) + "\0\0\0\0" + type + remark.padEnd(30);
    for (let i = 0; i < text.length; i++) {
        entry[i] = text.charCodeAt(i);
    }
    entry[10] = first & 0xFF;
    entry[11] = first >> 8;
    entry[12] = last & 0xFF;
    entry[13] = last >> 8;
    return entry;
}

/**
 * Write the entries into the directory sectors (20-29), followed by the sentinel, with the
 * count byte at the start of all ten sectors.
 */
function writeDirectory(disk: MemoryFloppyDisk, entries: Uint8Array[]): void {
    const all = [...entries, makeEntry("%%%%%%%%%%", 0, 0, "D", "")];
    for (let sector = 0; sector < 10; sector++) {
        const data = disk.getAbsoluteSector(20 + sector);
        data.fill(0);
        data[0] = 0xE1;
        for (let i = 0; i < 5; i++) {
            const entry = all[sector*5 + i];
            if (entry !== undefined) {
                data.set(entry, 1 + i*DIR_ENTRY_SIZE);
            }
        }
    }
}

/**
 * Write a sector's count byte and data.
 */
function writeSector(disk: MemoryFloppyDisk, sector: number, bytes: Uint8Array): void {
    const data = disk.getAbsoluteSector(sector);
    data[0] = bytes.length;
    data.set(bytes, 1);
}

// A tiny tokenized BASIC program in memory format (no 0xFF header): 10 PRINT "HI", then 20 END.
// Line pointers are arbitrary, since BASIC ignores them.
const PROGRAM = new Uint8Array([
    0x00, 0x40, 0x0A, 0x00, 0xB2, 0x20, 0x22, 0x48, 0x49, 0x22, 0x00,
    0x00, 0x40, 0x14, 0x00, 0x80, 0x00,
    0x00, 0x00,
]);

// Bytes of the data file: a full first sector and a short second one.
const DATA = Uint8Array.from({length: 255 + 7}, (_, i) => (i*3 + 1) & 0xFF);

/**
 * A disk with a DOS, a directory, a two-sector program, and a two-sector data file.
 */
function makeDisk(): MemoryFloppyDisk {
    const disk = new MemoryFloppyDisk();
    writeDirectory(disk, [
        makeEntry("MICRODOS", 0, 19, "D", ""),
        makeEntry("DIRECTORY", 20, 29, "D", ""),
        makeEntry("HELLO", 30, 31, "P", "Says hi"),
        makeEntry("STUFF", 40, 41, "D", "Some data"),
    ]);
    // Split the program across two sectors. The reader doesn't require the first to be full.
    writeSector(disk, 30, PROGRAM.subarray(0, 12));
    writeSector(disk, 31, PROGRAM.subarray(12));
    writeSector(disk, 40, DATA.subarray(0, 255));
    writeSector(disk, 41, DATA.subarray(255));
    return disk;
}

describe("decodeMicroDos", () => {
    it("decodes the directory", () => {
        const microDos = decodeMicroDos(makeDisk())!;
        expect(microDos).to.not.be.undefined;
        expect(microDos.nameAndVersion).to.equal("Percom MicroDOS");
        const files = microDos.getDirEntries(true);
        expect(files.map(file => file.getFilename("."))).to.eql(["MICRODOS", "DIRECTORY", "HELLO", "STUFF"]);
        expect(files[2].remark).to.equal("Says hi");
        expect(files[2].firstSector).to.equal(30);
        expect(files[2].lastSector).to.equal(31);
        expect(files[2].getDate()).to.be.undefined;
        // Program: the header byte plus the data. Data file: just the data.
        expect(files[2].getSize()).to.equal(1 + PROGRAM.length);
        expect(files[3].getSize()).to.equal(DATA.length);
    });

    it("is found by decodeFloppyFileSystem()", () => {
        const fileSystem = decodeFloppyFileSystem(makeDisk());
        expect(fileSystem?.nameAndVersion).to.equal("Percom MicroDOS");
    });

    it("leaves out the DOS and directory unless asked", () => {
        const microDos = decodeMicroDos(makeDisk())!;
        expect(microDos.getDirEntries(false).map(file => file.name)).to.eql(["HELLO", "STUFF"]);
        expect(microDos.getDirEntries(true).filter(file => file.isSystemFile()).map(file => file.name))
            .to.eql(["MICRODOS", "DIRECTORY"]);
    });

    it("reads programs as BASIC files", () => {
        const microDos = decodeMicroDos(makeDisk())!;
        const hello = microDos.getDirEntries(false)[0];
        const binary = microDos.readFile(hello);
        expect(binary[0]).to.equal(0xFF);
        expect(Array.from(binary.subarray(1))).to.eql(Array.from(PROGRAM));
        const program = decodeBasicProgram(binary)!;
        expect(program).to.not.be.undefined;
        expect(program.error).to.be.undefined;
    });

    it("concatenates the data bytes of data files", () => {
        const microDos = decodeMicroDos(makeDisk())!;
        const stuff = microDos.getDirEntries(false)[1];
        expect(Array.from(microDos.readFile(stuff))).to.eql(Array.from(DATA));
        expect(microDos.getFileSectorPositions(stuff).map(position => position.key()).length).to.equal(2);
    });

    it("reports no damage for a healthy file", () => {
        const microDos = decodeMicroDos(makeDisk())!;
        const hello = microDos.getDirEntries(false)[0];
        const {binary, damage} = microDos.readFileWithDamage(hello);
        expect(damage.isDamaged()).to.be.false;
        expect(damage.toString()).to.equal("");
        expect(Array.from(binary)).to.eql(Array.from(microDos.readFile(hello)));
    });

    it("reports a missing sector and a sector with a CRC error", () => {
        const disk = makeDisk();
        disk.removeAbsoluteSector(40);
        disk.setAbsoluteSectorCrcError(41);
        const microDos = decodeMicroDos(disk)!;
        const stuff = microDos.getDirEntries(false)[1];
        const {binary, damage} = microDos.readFileWithDamage(stuff);
        expect(damage.isDamaged()).to.be.true;
        expect(damage.missingSectors.map(position => position.key())).to.eql([absolutePosition(40).key()]);
        expect(damage.crcErrorSectors.map(position => position.key())).to.eql([absolutePosition(41).key()]);
        expect(damage.toString()).to.equal("1 missing sector, 1 sector with a CRC error");
        // The missing sector is zero-filled, and the one with the CRC error is read as is.
        expect(binary.length).to.equal(255 + 7);
        expect(Array.from(binary.subarray(0, 255))).to.eql(new Array(255).fill(0));
        expect(Array.from(binary.subarray(255))).to.eql(Array.from(DATA.subarray(255)));
    });

    it("decodes an empty directory", () => {
        const disk = new MemoryFloppyDisk();
        writeDirectory(disk, []);
        const microDos = decodeMicroDos(disk)!;
        expect(microDos).to.not.be.undefined;
        expect(microDos.getDirEntries(true)).to.eql([]);
    });

    it("rejects a directory sector that doesn't start with 0xE1", () => {
        const disk = makeDisk();
        disk.getAbsoluteSector(27)[0] = 0xE5;
        expect(decodeMicroDos(disk)).to.be.undefined;
    });

    it("rejects a blank disk", () => {
        expect(decodeMicroDos(new MemoryFloppyDisk())).to.be.undefined;
    });

    it("rejects a directory without an end", () => {
        const disk = makeDisk();
        // Overwrite the sentinel (the last entry of sector 20) with a real entry.
        disk.getAbsoluteSector(20 + 0).set(makeEntry("EXTRA", 50, 51, "D", ""), 1 + 4*DIR_ENTRY_SIZE);
        expect(decodeMicroDos(disk)).to.be.undefined;
    });

    it("rejects bad entries", () => {
        // Unknown type.
        let disk = makeDisk();
        disk.getAbsoluteSector(20)[1 + 2*DIR_ENTRY_SIZE + 14] = "X".charCodeAt(0);
        expect(decodeMicroDos(disk)).to.be.undefined;
        // Last sector before first.
        disk = makeDisk();
        disk.getAbsoluteSector(20)[1 + 2*DIR_ENTRY_SIZE + 12] = 5;
        expect(decodeMicroDos(disk)).to.be.undefined;
        // Last sector off the disk.
        disk = makeDisk();
        disk.getAbsoluteSector(20)[1 + 2*DIR_ENTRY_SIZE + 13] = 0x10;
        expect(decodeMicroDos(disk)).to.be.undefined;
        // Name that's not printable.
        disk = makeDisk();
        disk.getAbsoluteSector(20)[1 + 2*DIR_ENTRY_SIZE] = 0x01;
        expect(decodeMicroDos(disk)).to.be.undefined;
    });
});
