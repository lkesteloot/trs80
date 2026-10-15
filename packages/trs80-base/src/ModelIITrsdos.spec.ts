import {describe, expect, it} from "vitest";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {decodeModelIITrsdos, ModelIITrsdosLayout} from "./ModelIITrsdos.js";
import {hashForFilename} from "./Trsdos.js";

const CYLINDER_COUNT = 77;
const SECTORS_PER_TRACK = 26;
const SECTOR_SIZE = 256;
const ENTRY_SIZE = 64;
const NO_PASSWORD = 0x4296;

/**
 * A single-sided Model II floppy whose sectors are kept in a map: cylinder 0 is FM with 128-byte
 * sectors and the rest are MFM with 256-byte sectors (or whatever the test asks for), all numbered
 * from 1 and filled with zeros.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();
    private readonly crcErrorKeys = new Set<string>();

    /**
     * @param dataSectorSize size of the sectors on cylinders 1 and up.
     */
    constructor(dataSectorSize = SECTOR_SIZE) {
        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            const density = cylinder === 0 ? Density.SINGLE : Density.DOUBLE;
            const size = cylinder === 0 ? 128 : dataSectorSize;
            for (let sector = 1; sector <= SECTORS_PER_TRACK; sector++) {
                const position = SectorPosition.make(cylinder, 0, sector);
                sectorInfos.push(new SectorInfo(position, density, size));
                this.sectors.set(position.key(), new Uint8Array(size));
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
        const density = sectorPosition.cylinderNumber === 0 ? Density.SINGLE : Density.DOUBLE;
        const sectorData = new SectorData(data, sectorPosition, density);
        sectorData.crcError = this.crcErrorKeys.has(sectorPosition.key());
        return sectorData;
    }

    /**
     * Get the data of a sector to fill in.
     */
    public getSector(cylinder: number, sector: number): Uint8Array {
        return this.sectors.get(SectorPosition.make(cylinder, 0, sector).key())!;
    }

    /**
     * Remove a sector, so that it can't be read.
     */
    public removeSector(cylinder: number, sector: number): void {
        this.sectors.delete(SectorPosition.make(cylinder, 0, sector).key());
    }

    /**
     * Make a sector read with a CRC error.
     */
    public setSectorCrcError(cylinder: number, sector: number): void {
        this.crcErrorKeys.add(SectorPosition.make(cylinder, 0, sector).key());
    }
}

/**
 * The parts of a directory entry that the tests care about.
 */
interface EntryOptions {
    name: string;
    extension?: string;
    attributes?: number;
    // Ending relative record number, 0xFFFF for an empty file.
    ern: number;
    eof?: number;
    // Logical record length, where 0 means 256.
    lrl?: number;
    // Each is [cylinder, granule, granule count].
    extents?: [number, number, number][];
    protection?: number;
    // [year - 1900, month, day].
    updated?: [number, number, number];
}

/**
 * Make a 64-byte directory entry.
 */
function makeEntry(options: EntryOptions): Uint8Array {
    const entry = new Uint8Array(ENTRY_SIZE);
    entry[0] = options.attributes ?? 0;
    entry[3] = options.eof ?? 0;
    entry[4] = options.lrl ?? 0;
    const name = options.name.padEnd(8) + (options.extension ?? "").padEnd(3);
    for (let i = 0; i < name.length; i++) {
        entry[5 + i] = name.charCodeAt(i);
    }
    entry[16] = NO_PASSWORD & 0xFF;
    entry[17] = NO_PASSWORD >> 8;
    entry[18] = NO_PASSWORD & 0xFF;
    entry[19] = NO_PASSWORD >> 8;
    entry[20] = options.ern & 0xFF;
    entry[21] = options.ern >> 8;
    entry.fill(0xFF, 22, 54);
    (options.extents ?? []).forEach(([cylinder, granule, count], i) => {
        entry[22 + i*2] = cylinder;
        entry[23 + i*2] = (granule << 5) | (count - 1);
    });
    entry[54] = 0x50;
    entry[55] = 1;
    entry[56] = 1;
    entry[57] = options.protection ?? 0;
    entry.set(options.updated ?? [0x50, 1, 1], 58);
    return entry;
}

/**
 * Fill the sector with the entries (four to a sector, starting at the given offset in the cylinder's sectors),
 * and return their HIT bytes in order.
 */
function writeEntries(disk: MemoryFloppyDisk, cylinder: number, firstSector: number, entries: Uint8Array[]): number[] {
    const hit: number[] = [];
    entries.forEach((entry, i) => {
        const sector = disk.getSector(cylinder, firstSector + Math.floor(i/4));
        sector.set(entry, (i % 4)*ENTRY_SIZE);
        hit.push(hashForFilename(String.fromCharCode(... entry.subarray(5, 16))));
    });
    return hit;
}

/**
 * Write a TRSDOS 2.0 directory (HIT and GAT in sector 1, entries from sector 2) to the cylinder, which is
 * 44 unless the test says otherwise.
 *
 * @param primaryCylinder what the GAT says the directory cylinder is, for a copy.
 */
function writeV2Directory(disk: MemoryFloppyDisk, entries: Uint8Array[], cylinder = 44, primaryCylinder = cylinder): void {
    const hit = writeEntries(disk, cylinder, 2, entries);
    const sector = disk.getSector(cylinder, 1);
    sector.set(hit, 0);
    sector[0x60 + primaryCylinder] = 0x5F;
    sector[0x60 + cylinder] |= 0x1F;
    sector[0x60 + 77] = primaryCylinder;
    sector[0x60 + 78] = 2;
}

/**
 * Write a TRSDOS 1.x directory (GAT in sector 1, HIT in sector 2, entries from sector 3) to cylinder 44.
 */
function writeV1Directory(disk: MemoryFloppyDisk, entries: Uint8Array[]): void {
    const hit = writeEntries(disk, 44, 3, entries);
    const gat = disk.getSector(44, 1);
    gat.fill(0xE0, 0, 77);
    gat[44] = 0xFF;
    gat.fill(0xE0, 0x4D, 0x4D + 77);
    gat[0x9A] = 44;
    gat[0x9B] = 1;
    disk.getSector(44, 2).set(hit, 0);
}

/**
 * Fill the ID sector and the sector after it, which says where the directory is.
 */
function writeBootInfo(disk: MemoryFloppyDisk, name: string, dirCylinder: number, layoutByte: number): void {
    const id = disk.getSector(0, 1);
    const paddedName = name.padEnd(8);
    for (let i = 0; i < paddedName.length; i++) {
        id[i] = paddedName.charCodeAt(i);
    }
    id[8] = 0xE0;
    id[9] = 0x42;
    const info = disk.getSector(0, 2);
    info[0] = dirCylinder;
    info[1] = layoutByte;
    info.set([... "TRSDOS  "].map(c => c.charCodeAt(0)), 2);
    info[10] = 0x20;
}

/**
 * Fill every sector of the cylinder range with a recognizable pattern: the byte is the cylinder
 * plus the sector, in each position, so that a misplaced read stands out.
 */
function fillPattern(disk: MemoryFloppyDisk, firstCylinder: number, lastCylinder: number): void {
    for (let cylinder = firstCylinder; cylinder <= lastCylinder; cylinder++) {
        for (let sector = 1; sector <= SECTORS_PER_TRACK; sector++) {
            disk.getSector(cylinder, sector).fill((cylinder*7 + sector) & 0xFF);
        }
    }
}

/**
 * A TRSDOS 2.0 disk with a system file, a text file, and a file that continues into another cylinder.
 */
function makeV2Disk(): MemoryFloppyDisk {
    const disk = new MemoryFloppyDisk();
    fillPattern(disk, 1, 43);
    writeBootInfo(disk, "TRSDOS", 44, 2);
    writeV2Directory(disk, [
        // 175 sectors, a system program.
        makeEntry({name: "SYSRES", extension: "SYS", attributes: 0xA0, ern: 174, protection: 7, extents: [[45, 0, 32], [51, 2, 3]]}),
        // 3 records of 80 bytes, the last starting at offset 160 of sector 0 and so ending at byte 240.
        makeEntry({name: "NOTES", extension: "TXT", ern: 0, eof: 160, lrl: 80, extents: [[1, 0, 1]], updated: [0x53, 6, 15]}),
        // Starts at the fourth granule of cylinder 10, so it continues into cylinder 11.
        makeEntry({name: "BIG", ern: 19, extents: [[10, 3, 4]]}),
        // Empty: no extents, and ERN and EOF are all ones.
        makeEntry({name: "EMPTY", extension: "DAT", ern: 0xFFFF, eof: 0xFF, lrl: 0}),
    ]);
    return disk;
}

describe("decodeModelIITrsdos", () => {
    it("decodes a TRSDOS 2.0 directory", () => {
        const fileSystem = decodeModelIITrsdos(makeV2Disk())!;
        expect(fileSystem).to.not.be.undefined;
        expect(fileSystem.layout).to.equal(ModelIITrsdosLayout.V2);
        expect(fileSystem.nameAndVersion).to.equal("Model II TRSDOS 2.0");
        expect(fileSystem.dirCylinder).to.equal(44);
        expect(fileSystem.diskName).to.equal("TRSDOS");
        expect(fileSystem.masterPasswordHash).to.equal(0x42E0);
        expect(fileSystem.formatVersion).to.equal(0x20);
        expect(fileSystem.rejectedEntryCount).to.equal(0);

        const entries = fileSystem.getDirEntries(true);
        expect(entries.map(entry => entry.getFilename("/"))).to.eql(["SYSRES/SYS", "NOTES/TXT", "BIG", "EMPTY/DAT"]);
        expect(entries.map(entry => entry.getFilename("."))[0]).to.equal("SYSRES.SYS");
        expect(entries[0].isSystemFile()).to.be.true;
        expect(entries[0].isProgram()).to.be.true;
        expect(entries[0].protectionLevel).to.equal(7);
        expect(entries[0].isHidden()).to.be.false;
        expect(entries[1].isSystemFile()).to.be.false;
        expect(entries[1].isProgram()).to.be.false;
        expect(entries[1].updatePasswordHash).to.equal(NO_PASSWORD);
        expect(entries[1].accessPasswordHash).to.equal(NO_PASSWORD);
        expect(entries[0].extents.map(e => [e.cylinder, e.granule, e.granuleCount])).to.eql([[45, 0, 32], [51, 2, 3]]);
        expect(entries[1].getDate()?.getFullYear()).to.equal(1983);
        expect(entries[1].getDate()?.getMonth()).to.equal(5);
        expect(entries[1].getDate()?.getDate()).to.equal(15);
        expect(entries[1].createdDate?.getFullYear()).to.equal(1980);
        expect(fileSystem.getDirEntries(false).map(entry => entry.name)).to.eql(["NOTES", "BIG", "EMPTY"]);
    });

    it("decodes a TRSDOS 1.x directory", () => {
        const disk = new MemoryFloppyDisk();
        writeBootInfo(disk, "TRSDOS", 44, 1);
        writeV1Directory(disk, [
            makeEntry({name: "SYS10", extension: "SYS", attributes: 0xA0, ern: 8, protection: 6, extents: [[46, 0, 2]]}),
            makeEntry({name: "HELLO", ern: 0, eof: 9, lrl: 1, extents: [[1, 0, 1]]}),
        ]);
        const fileSystem = decodeModelIITrsdos(disk)!;
        expect(fileSystem).to.not.be.undefined;
        expect(fileSystem.layout).to.equal(ModelIITrsdosLayout.V1);
        expect(fileSystem.nameAndVersion).to.equal("Model II TRSDOS 1.x");
        const entries = fileSystem.getDirEntries(true);
        expect(entries.map(entry => entry.getFilename("/"))).to.eql(["SYS10/SYS", "HELLO"]);
        expect(entries[0].isSystemFile()).to.be.true;
        expect(entries[1].getSize()).to.equal(10);
        expect(fileSystem.getDirEntries(false).length).to.equal(1);
    });

    it("sizes files by ERN, EOF, and record length", () => {
        const entries = decodeModelIITrsdos(makeV2Disk())!.getDirEntries(true);
        // 174 full sectors, then a record of 256 bytes at offset 0.
        expect(entries[0].getSize()).to.equal(175*256);
        // Nothing before sector 0, then the last record starts at 160 and has 80 bytes.
        expect(entries[1].getSize()).to.equal(240);
        // A record length of zero means 256.
        expect(entries[2].lrl).to.equal(256);
        expect(entries[2].getSize()).to.equal(20*256);
        // An empty file has no size even though its EOF byte is 0xFF.
        expect(entries[3].getSize()).to.equal(0);
        expect(entries[3].extents).to.eql([]);
    });

    it("reads a file and clips it to its size", () => {
        const fileSystem = decodeModelIITrsdos(makeV2Disk())!;
        const notes = fileSystem.getDirEntries(true)[1];
        const binary = fileSystem.readFile(notes);
        expect(binary.length).to.equal(240);
        // Pattern for cylinder 1, sector 1.
        expect(Array.from(binary)).to.eql(new Array(240).fill((7 + 1) & 0xFF));
        expect(fileSystem.getFileSectorPositions(notes).map(p => p.key())).to.eql([SectorPosition.make(1, 0, 1).key()]);
        expect(fileSystem.readFileWithDamage(notes).damage.isDamaged()).to.be.false;
    });

    it("reads an empty file", () => {
        const fileSystem = decodeModelIITrsdos(makeV2Disk())!;
        const empty = fileSystem.getDirEntries(true)[3];
        expect(fileSystem.getFileSectorPositions(empty)).to.eql([]);
        expect(fileSystem.readFile(empty).length).to.equal(0);
        expect(fileSystem.readFileWithDamage(empty).damage.isDamaged()).to.be.false;
    });

    it("continues an extent into the next cylinder", () => {
        const fileSystem = decodeModelIITrsdos(makeV2Disk())!;
        const big = fileSystem.getDirEntries(true)[2];
        const keys = fileSystem.getFileSectorPositions(big).map(p => p.key());
        const expected: SectorPosition[] = [];
        // Granule 3 and 4 of cylinder 10 (sectors 16-25), then granules 0 and 1 of cylinder 11 (sectors 1-10).
        for (let sector = 16; sector <= 25; sector++) {
            expected.push(SectorPosition.make(10, 0, sector));
        }
        for (let sector = 1; sector <= 10; sector++) {
            expected.push(SectorPosition.make(11, 0, sector));
        }
        expect(keys).to.eql(expected.map(p => p.key()));

        // The data comes from the cylinders in order.
        const binary = fileSystem.readFile(big);
        expect(binary.length).to.equal(20*256);
        expect(binary[0]).to.equal((10*7 + 16) & 0xFF);
        expect(binary[10*256]).to.equal((11*7 + 1) & 0xFF);
        expect(binary[20*256 - 1]).to.equal((11*7 + 10) & 0xFF);
    });

    it("lists the sectors of a file with two extents", () => {
        const fileSystem = decodeModelIITrsdos(makeV2Disk())!;
        const sysres = fileSystem.getDirEntries(true)[0];
        const positions = fileSystem.getFileSectorPositions(sysres);
        expect(positions.length).to.equal(175);
        // 32 granules from cylinder 45 reach cylinder 51 granule 1, so the second extent adds to that.
        expect(positions[0].key()).to.equal(SectorPosition.make(45, 0, 1).key());
        expect(positions[159].key()).to.equal(SectorPosition.make(51, 0, 10).key());
        expect(positions[160].key()).to.equal(SectorPosition.make(51, 0, 11).key());
        expect(positions[174].key()).to.equal(SectorPosition.make(51, 0, 25).key());
    });

    it("reports missing sectors, CRC errors, and extents that are too short", () => {
        const disk = makeV2Disk();
        disk.removeSector(10, 16);
        disk.setSectorCrcError(11, 2);
        const fileSystem = decodeModelIITrsdos(disk)!;
        const big = fileSystem.getDirEntries(true)[2];
        const {binary, damage} = fileSystem.readFileWithDamage(big);
        expect(damage.missingSectors.map(p => p.key())).to.eql([SectorPosition.make(10, 0, 16).key()]);
        expect(damage.crcErrorSectors.map(p => p.key())).to.eql([SectorPosition.make(11, 0, 2).key()]);
        expect(damage.toString()).to.equal("1 missing sector, 1 sector with a CRC error");
        // The missing sector is zero-filled and everything else is in place.
        expect(binary.length).to.equal(20*256);
        expect(Array.from(binary.subarray(0, 256))).to.eql(new Array(256).fill(0));
        expect(binary[256]).to.equal((10*7 + 17) & 0xFF);

        // An ERN that goes past the end of the extents is clipped, and reported.
        const shortDisk = new MemoryFloppyDisk();
        writeV2Directory(shortDisk, [makeEntry({name: "SHORT", ern: 9, extents: [[10, 0, 1]]})]);
        const shortFileSystem = decodeModelIITrsdos(shortDisk)!;
        const short = shortFileSystem.getDirEntries(true)[0];
        expect(short.getSize()).to.equal(10*256);
        const shortResult = shortFileSystem.readFileWithDamage(short);
        expect(shortResult.binary.length).to.equal(5*256);
        expect(shortResult.damage.directoryErrors).to.eql(["extents too short for the file's size"]);
    });

    it("accepts blank disks of either layout", () => {
        const v2 = new MemoryFloppyDisk();
        writeV2Directory(v2, []);
        const v2FileSystem = decodeModelIITrsdos(v2)!;
        expect(v2FileSystem.layout).to.equal(ModelIITrsdosLayout.V2);
        expect(v2FileSystem.getDirEntries(true)).to.eql([]);

        const v1 = new MemoryFloppyDisk();
        writeV1Directory(v1, []);
        const v1FileSystem = decodeModelIITrsdos(v1)!;
        expect(v1FileSystem.layout).to.equal(ModelIITrsdosLayout.V1);
        expect(v1FileSystem.getDirEntries(true)).to.eql([]);
    });

    it("rejects a disk that's all zeros or all 0xE5", () => {
        expect(decodeModelIITrsdos(new MemoryFloppyDisk())).to.be.undefined;

        const disk = new MemoryFloppyDisk();
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            for (let sector = 1; sector <= SECTORS_PER_TRACK; sector++) {
                disk.getSector(cylinder, sector).fill(0xE5);
            }
        }
        expect(decodeModelIITrsdos(disk)).to.be.undefined;
    });

    it("rejects a blank-looking directory whose GAT is wrong", () => {
        // V2 without the directory mark on the GAT.
        const disk = new MemoryFloppyDisk();
        writeV2Directory(disk, []);
        disk.getSector(44, 1)[0x60 + 44] = 0x1F;
        expect(decodeModelIITrsdos(disk)).to.be.undefined;

        // V1 with a free-looking directory cylinder.
        const v1 = new MemoryFloppyDisk();
        writeV1Directory(v1, []);
        v1.getSector(44, 1)[44] = 0xE0;
        expect(decodeModelIITrsdos(v1)).to.be.undefined;
    });

    it("rejects entries whose names don't match the HIT", () => {
        // The only entry has the wrong hash.
        const disk = makeV2Disk();
        const hit = disk.getSector(44, 1);
        hit.fill(0, 0, 96);
        hit[0] = hashForFilename("SOMETHINGELSE") ^ 0x55;
        expect(decodeModelIITrsdos(disk)).to.be.undefined;

        // One of four is wrong: the other three still vouch for the directory.
        const partial = makeV2Disk();
        partial.getSector(44, 1)[1] ^= 0x01;
        const fileSystem = decodeModelIITrsdos(partial)!;
        expect(fileSystem.getDirEntries(true).map(entry => entry.name)).to.eql(["SYSRES", "BIG", "EMPTY"]);
        expect(fileSystem.rejectedEntryCount).to.equal(1);
    });

    it("rejects an in-use entry whose name isn't printable", () => {
        const disk = new MemoryFloppyDisk();
        writeV2Directory(disk, [makeEntry({name: "FINE", ern: 0}), makeEntry({name: "BAD", ern: 0}),
            makeEntry({name: "ALSOFINE", ern: 0})]);
        // Corrupt the second name but keep its hash consistent with the corrupted name.
        const sector = disk.getSector(44, 2);
        sector[ENTRY_SIZE + 5] = 0x01;
        disk.getSector(44, 1)[1] = hashForFilename(String.fromCharCode(... sector.subarray(ENTRY_SIZE + 5, ENTRY_SIZE + 16)));
        const fileSystem = decodeModelIITrsdos(disk)!;
        expect(fileSystem.getDirEntries(true).map(entry => entry.name)).to.eql(["FINE", "ALSOFINE"]);
        expect(fileSystem.rejectedEntryCount).to.equal(1);
    });

    it("uses the directory's copy on cylinder 52 if cylinder 44's is unreadable", () => {
        const disk = new MemoryFloppyDisk();
        writeBootInfo(disk, "TRSDOS", 44, 2);
        writeV2Directory(disk, [makeEntry({name: "COPY", ern: 0, extents: [[1, 0, 1]]})], 52, 44);
        // The GAT of the copy marks the primary, which is where the copy's pointer leads.
        const fileSystem = decodeModelIITrsdos(disk)!;
        expect(fileSystem).to.not.be.undefined;
        expect(fileSystem.dirCylinder).to.equal(52);
        expect(fileSystem.getDirEntries(true).map(entry => entry.name)).to.eql(["COPY"]);

        // With the primary readable, it wins.
        writeV2Directory(disk, [makeEntry({name: "PRIMARY", ern: 0})], 44);
        const both = decodeModelIITrsdos(disk)!;
        expect(both.dirCylinder).to.equal(44);
        expect(both.getDirEntries(true).map(entry => entry.name)).to.eql(["PRIMARY"]);

        // A missing first sector on the primary falls back to the copy.
        disk.removeSector(44, 1);
        expect(decodeModelIITrsdos(disk)!.dirCylinder).to.equal(52);
    });

    it("finds a directory that FORMAT put on another cylinder", () => {
        const disk = new MemoryFloppyDisk();
        writeBootInfo(disk, "DATA", 1, 2);
        writeV2Directory(disk, [makeEntry({name: "ONLYFILE", ern: 3, extents: [[2, 0, 1]]})], 1);
        const fileSystem = decodeModelIITrsdos(disk)!;
        expect(fileSystem).to.not.be.undefined;
        expect(fileSystem.dirCylinder).to.equal(1);
        expect(fileSystem.diskName).to.equal("DATA");
        expect(fileSystem.getDirEntries(true).map(entry => entry.name)).to.eql(["ONLYFILE"]);
    });

    it("rejects a disk with the wrong sector size", () => {
        const disk = new MemoryFloppyDisk(128);
        expect(decodeModelIITrsdos(disk)).to.be.undefined;
    });

    it("treats an invalid date as no date", () => {
        const disk = new MemoryFloppyDisk();
        writeV2Directory(disk, [makeEntry({name: "NODATE", ern: 0, updated: [0, 0, 0]})]);
        const fileSystem = decodeModelIITrsdos(disk)!;
        expect(fileSystem.getDirEntries(true)[0].getDate()).to.be.undefined;
    });
});
