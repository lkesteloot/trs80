import {describe, expect, it} from "vitest";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {
    decodeTrsdosII,
    TrsdosIIFileType,
    trsdosIIFileTypeToString,
    TrsdosIIRecordType,
    trsdosIIRecordTypeToString,
    trsdosIIProtectionLevelToString,
} from "./TrsdosII.js";

// Single-density boot cylinder and double-density data cylinders, like a real disk.
const CYLINDER_COUNT = 77;
const BOOT_SECTOR_COUNT = 26;
const BOOT_SECTOR_SIZE = 128;
const DATA_SECTOR_COUNT = 16;
const DATA_SECTOR_SIZE = 512;
const GRANULE_SIZE = 256;
const GRANULES_PER_TRACK = 32;
const DIR_ENTRY_SIZE = 64;

// Granules of the file system's own structures.
const ROOT_TABLE = 100;
const ROOT_DATA = 101;
const ROOT_BACKUP_TABLE = 120;
const ROOT_BACKUP_DATA = 121;
const BITMAP_TABLE = 110;
const BITMAP_BACKUP_TABLE = 130;
const SYSTEM_DIR_TABLE = 102;
const SYSTEM_DIR_DATA = 103;
const USER_DIR_TABLE = 104;
const USER_DIR_DATA = 105;

// Where the test files' block tables and data are.
const SYSRES_TABLE = 200;
const SYSRES_DATA = 210;
const HELLO_TABLE = 220;
const HELLO_FIRST_RUN = 301;
const HELLO_SECOND_RUN = 400;
const BIG_TABLE = 221;
const BIG_DATA = 500;
const SOURCE_TABLE = 222;
const SOURCE_DATA = 600;

/**
 * A floppy whose sectors are kept in a map, all filled with 0xE5.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    public readonly sideCount: number;
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();
    private readonly crcErrorKeys = new Set<string>();

    /**
     * @param sideCount the number of sides, 1 or 2.
     * @param dataSectorSize the size of the sectors of the data tracks, which is 512 for TRSDOS-II.
     */
    constructor(sideCount = 1, dataSectorSize = DATA_SECTOR_SIZE) {
        super(new Uint8Array(0), undefined, []);
        this.sideCount = sideCount;

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            for (let side = 0; side < sideCount; side++) {
                const boot = cylinder === 0 && side === 0;
                const count = boot ? BOOT_SECTOR_COUNT : DATA_SECTOR_COUNT;
                const size = boot ? BOOT_SECTOR_SIZE : dataSectorSize;
                const density = boot ? Density.SINGLE : Density.DOUBLE;
                for (let sector = 1; sector <= count; sector++) {
                    const position = SectorPosition.make(cylinder, side, sector);
                    sectorInfos.push(new SectorInfo(position, density, size));
                    this.sectors.set(position.key(), new Uint8Array(size).fill(0xE5));
                }
            }
        }
        this.geometry = FloppyDiskGeometry.make(CYLINDER_COUNT, sideCount, sectorInfos)!;
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
        const sectorData = new SectorData(data, sectorPosition,
            sectorPosition.cylinderNumber === 0 && sectorPosition.side === 0 ? Density.SINGLE : Density.DOUBLE);
        sectorData.crcError = this.crcErrorKeys.has(sectorPosition.key());
        return sectorData;
    }

    /**
     * Whether the sector exists.
     */
    public hasSectorData(sectorPosition: SectorPosition): boolean {
        return this.sectors.has(sectorPosition.key());
    }

    /**
     * The data of a sector, to fill in.
     */
    public getSector(sectorPosition: SectorPosition): Uint8Array {
        return this.sectors.get(sectorPosition.key())!;
    }

    /**
     * Make the sector unreadable.
     */
    public removeSector(sectorPosition: SectorPosition): void {
        this.sectors.delete(sectorPosition.key());
    }

    /**
     * Make the sector read with a CRC error.
     */
    public setCrcError(sectorPosition: SectorPosition): void {
        this.crcErrorKeys.add(sectorPosition.key());
    }

    /**
     * Where a granule is, worked out here separately from the decoder: the sector, and the
     * offset in it.
     */
    public granuleLocation(granule: number): {position: SectorPosition, offset: number} {
        const track = Math.floor(granule/GRANULES_PER_TRACK);
        const cylinder = Math.floor(track/this.sideCount);
        const side = track % this.sideCount;
        const withinTrack = granule % GRANULES_PER_TRACK;
        return {
            position: SectorPosition.make(cylinder, side, Math.floor(withinTrack/2) + 1),
            offset: (withinTrack % 2)*GRANULE_SIZE,
        };
    }

    /**
     * Write bytes starting at the beginning of a granule. They must fit in the granule.
     */
    public writeGranule(granule: number, bytes: Uint8Array): void {
        const location = this.granuleLocation(granule);
        this.getSector(location.position).set(bytes, location.offset);
    }

    /**
     * Write bytes into consecutive granules.
     */
    public writeGranules(firstGranule: number, bytes: Uint8Array): void {
        for (let offset = 0; offset < bytes.length; offset += GRANULE_SIZE) {
            this.writeGranule(firstGranule + offset/GRANULE_SIZE, bytes.subarray(offset, offset + GRANULE_SIZE));
        }
    }
}

/**
 * Put a string in the bytes, as Latin-1.
 */
function putString(bytes: Uint8Array, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
        bytes[offset + i] = text.charCodeAt(i);
    }
}

/**
 * Write a big-endian 24-bit value.
 */
function putBe24(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = (value >> 16) & 0xFF;
    bytes[offset + 1] = (value >> 8) & 0xFF;
    bytes[offset + 2] = value & 0xFF;
}

/**
 * Write a big-endian 32-bit value.
 */
function putBe32(bytes: Uint8Array, offset: number, value: number): void {
    putBe24(bytes, offset + 1, value & 0xFFFFFF);
    bytes[offset] = Math.floor(value/0x1000000) & 0xFF;
}

/**
 * Write a date: minutes since the start of January 1 and the year minus 1900.
 */
function putDate(bytes: Uint8Array, offset: number, minutes: number, year: number): void {
    putBe24(bytes, offset, minutes);
    bytes[offset + 3] = year - 1900;
}

/**
 * Make a block table granule from runs of [count, start granule].
 */
function makeBlockTable(extents: number[][]): Uint8Array {
    const bytes = new Uint8Array(GRANULE_SIZE);
    extents.forEach(([count, start], i) => {
        bytes[i*4] = count;
        putBe24(bytes, i*4 + 1, start);
    });
    return bytes;
}

interface EntryOptions {
    flags: number;
    name: string;
    flags2?: number;
    // Minutes since January 1 and year, for the modified date.
    modified?: [number, number];
    privilege?: number;
    eof?: number;
    lrl?: number;
    primary?: number;
    secondary?: number;
}

/**
 * Make a 64-byte directory entry.
 */
function makeEntry(options: EntryOptions): Uint8Array {
    const entry = new Uint8Array(DIR_ENTRY_SIZE);
    entry[0] = options.flags;
    entry[1] = options.flags2 ?? 0x10;
    putString(entry, 2, options.name.padEnd(24));
    putDate(entry, 0x1A, 100, 1983);
    const modified = options.modified ?? [200, 1983];
    putDate(entry, 0x1E, modified[0], modified[1]);
    entry[0x27] = options.privilege ?? 2;
    putBe32(entry, 0x28, options.eof ?? 0xFFFFFFFF);
    entry[0x2C] = ((options.lrl ?? 256) >> 8) & 0xFF;
    entry[0x2D] = (options.lrl ?? 256) & 0xFF;
    putBe24(entry, 0x2F, options.primary ?? 0);
    putBe24(entry, 0x33, options.secondary ?? 0);
    entry[0x3C] = 0x96;
    entry[0x3D] = 0x42;
    entry[0x3E] = 0x96;
    entry[0x3F] = 0x42;
    return entry;
}

/**
 * Concatenate entries and pad to a number of granules.
 */
function makeDirectory(entries: Uint8Array[], granules: number): Uint8Array {
    const bytes = new Uint8Array(granules*GRANULE_SIZE);
    entries.forEach((entry, i) => bytes.set(entry, i*DIR_ENTRY_SIZE));
    return bytes;
}

// Contents of HELLO/TXT: 1100 bytes in two runs, the first starting in the second half of a sector.
const HELLO_DATA = Uint8Array.from({length: 1100}, (_, i) => (i*7 + 3) & 0xFF);

// Contents of BIG, which has three granules but only 300 bytes of data.
const BIG_BYTES = Uint8Array.from({length: 3*GRANULE_SIZE}, (_, i) => (i*5 + 1) & 0xFF);

// Contents of SOURCE/SRC: a variable-length-record file of three records, whose last is 5 bytes.
const SOURCE_DATA_BYTES = new Uint8Array([
    0x04, 0x41, 0x42, 0x43,
    0x03, 0x44, 0x45,
    0x05, 0x46, 0x47, 0x48, 0x49,
]);

// Contents of SYSTEM/SYS, which says the version of the DOS.
const SYSTEM_SYS_TEXT = "\0\0TRSDOS-II ver. 04.04.00 Domestic    August 11, 1983\0";

/**
 * Options for building the test disk.
 */
interface DiskOptions {
    // Number of sides.
    sideCount?: number;
    // Whether to write the banner on the boot sector.
    banner?: boolean;
    // Whether to write the version text in SYSTEM/SYS.
    systemText?: boolean;
}

/**
 * Build a disk with a parameter block, a root directory with two subdirectories, and some files.
 */
function makeDisk(options: DiskOptions = {}): MemoryFloppyDisk {
    const sideCount = options.sideCount ?? 1;
    const disk = new MemoryFloppyDisk(sideCount);

    // Banner.
    if (options.banner ?? true) {
        const sector = disk.getSector(SectorPosition.make(0, 0, 1));
        putString(sector, 0, "TRSDOS disk operating system  version 4.2.  Jan    1, 1983.  Copyright 1983 by Tandy Corporation.");
    }

    // Parameter block, in sector 3 of the boot track.
    const pb = disk.getSector(SectorPosition.make(0, 0, 3));
    pb.fill(0);
    putString(pb, 0, "TRSDOS  ");
    pb[0x08] = 0xE0;
    pb[0x09] = 0x42;
    putBe24(pb, 0x13, ROOT_TABLE);
    putBe24(pb, 0x17, ROOT_BACKUP_TABLE);
    putBe24(pb, 0x1B, BITMAP_TABLE);
    putBe24(pb, 0x1F, BITMAP_BACKUP_TABLE);
    putBe24(pb, 0x23, CYLINDER_COUNT*GRANULES_PER_TRACK*sideCount);
    pb[0x26] = sideCount === 2 ? 0x10 : 0x15;
    pb[0x30] = 0x41;
    pb[0x31] = 3;

    // Directories.
    const rootEntries = [
        makeEntry({flags: 0x98, flags2: 0, name: "SYSTEM/DIR", eof: 64, lrl: 64, primary: SYSTEM_DIR_TABLE}),
        makeEntry({flags: 0x18, flags2: 0, name: "USER001/DIR", eof: 5*64, lrl: 64, primary: USER_DIR_TABLE}),
    ];
    for (const [table, data] of [[ROOT_TABLE, ROOT_DATA], [ROOT_BACKUP_TABLE, ROOT_BACKUP_DATA]]) {
        disk.writeGranule(table, makeBlockTable([[1, data]]));
        disk.writeGranule(data, makeDirectory(rootEntries, 1));
    }
    disk.writeGranule(BITMAP_TABLE, makeBlockTable([[1, 111]]));
    disk.writeGranule(BITMAP_BACKUP_TABLE, makeBlockTable([[1, 131]]));

    disk.writeGranule(SYSTEM_DIR_TABLE, makeBlockTable([[1, SYSTEM_DIR_DATA]]));
    const systemText = new TextEncoder().encode(SYSTEM_SYS_TEXT);
    disk.writeGranule(SYSTEM_DIR_DATA, makeDirectory([
        makeEntry({flags: 0xC8, name: "SYSRES/SYS", privilege: 0, eof: 256, lrl: 256, primary: SYSRES_TABLE}),
        makeEntry({flags: 0xC8, name: "SYSTEM/SYS", privilege: 0, eof: 0, lrl: systemText.length,
            primary: 230}),
    ], 1));
    disk.writeGranule(SYSRES_TABLE, makeBlockTable([[2, SYSRES_DATA]]));
    disk.writeGranules(SYSRES_DATA, Uint8Array.from({length: 512}, (_, i) => i & 0xFF));
    disk.writeGranule(230, makeBlockTable([[1, 231]]));
    if (options.systemText ?? false) {
        disk.writeGranule(231, systemText);
    }

    disk.writeGranule(USER_DIR_TABLE, makeBlockTable([[2, USER_DIR_DATA]]));
    disk.writeGranules(USER_DIR_DATA, makeDirectory([
        // 1100 bytes, with records of one byte, spanning two runs, modified on February 15, 1984 at 13:45.
        makeEntry({flags: 0x20, flags2: 0, name: "HELLO/TXT", privilege: 0x1F, eof: 1099, lrl: 1,
            primary: HELLO_TABLE, modified: [(31 + 14)*1440 + 13*60 + 45, 1984]}),
        // Deleted: not in use.
        makeEntry({flags: 0, name: "DELETED/TXT", eof: 0, lrl: 1, primary: 223}),
        // Empty.
        makeEntry({flags: 0x20, flags2: 0, name: "EMPTY", privilege: 0x1F, lrl: 1}),
        // Three granules allocated, two records of 256 bytes.
        makeEntry({flags: 0x40, name: "BIG", privilege: 0x0A, eof: 256, lrl: 256, primary: BIG_TABLE,
            modified: [59*1440, 1983]}),
        // Variable-length records.
        makeEntry({flags: 0x24, flags2: 0, name: "SOURCE/SRC", privilege: 0x1F, eof: 7, lrl: 5,
            primary: SOURCE_TABLE, modified: [60*1440, 1984]}),
    ], 2));
    disk.writeGranule(HELLO_TABLE, makeBlockTable([[3, HELLO_FIRST_RUN], [2, HELLO_SECOND_RUN]]));
    disk.writeGranules(HELLO_FIRST_RUN, HELLO_DATA.subarray(0, 3*GRANULE_SIZE));
    disk.writeGranules(HELLO_SECOND_RUN, HELLO_DATA.subarray(3*GRANULE_SIZE));
    disk.writeGranule(BIG_TABLE, makeBlockTable([[3, BIG_DATA]]));
    disk.writeGranules(BIG_DATA, BIG_BYTES);
    disk.writeGranule(SOURCE_TABLE, makeBlockTable([[1, SOURCE_DATA]]));
    disk.writeGranule(SOURCE_DATA, SOURCE_DATA_BYTES);

    return disk;
}

describe("decodeTrsdosII", () => {
    it("decodes the directories", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        expect(trsdosII).to.not.be.undefined;
        expect(trsdosII.nameAndVersion).to.equal("TRSDOS-II 4.2");
        expect(trsdosII.diskName).to.equal("TRSDOS");
        expect(trsdosII.masterPasswordHash).to.equal(0x42E0);
        expect(trsdosII.sideCount).to.equal(1);
        expect(trsdosII.subdirectories).to.eql(["SYSTEM/DIR", "USER001/DIR"]);
        const files = trsdosII.getDirEntries(true);
        expect(files.map(file => file.name)).to.eql(["SYSRES/SYS", "SYSTEM/SYS", "HELLO/TXT", "EMPTY", "BIG", "SOURCE/SRC"]);
        expect(files.map(file => file.subdirectory)).to.eql(
            ["SYSTEM/DIR", "SYSTEM/DIR", "USER001/DIR", "USER001/DIR", "USER001/DIR", "USER001/DIR"]);
    });

    it("splits names at the slash", () => {
        const files = decodeTrsdosII(makeDisk())!.getDirEntries(true);
        expect(files[0].getFilename(".")).to.equal("SYSRES.SYS");
        expect(files[0].getFilename("/")).to.equal("SYSRES/SYS");
        expect(files[3].getFilename(".")).to.equal("EMPTY");
    });

    it("leaves out system files unless asked", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        expect(trsdosII.getDirEntries(false).map(file => file.name)).to.eql(["HELLO/TXT", "EMPTY", "BIG", "SOURCE/SRC"]);
        const systemFiles = trsdosII.getDirEntries(true).filter(file => file.isSystemFile());
        expect(systemFiles.map(file => file.name)).to.eql(["SYSRES/SYS", "SYSTEM/SYS"]);
        expect(systemFiles.every(file => file.hasSystemFlag())).to.be.true;
        expect(trsdosII.getDirEntries(true).some(file => file.isHidden())).to.be.false;
    });

    it("decodes the flags and the privilege", () => {
        const files = decodeTrsdosII(makeDisk())!.getDirEntries(true);
        const [sysres, , hello, , big, source] = files;
        expect(sysres.getFileType()).to.equal(TrsdosIIFileType.PROGRAM);
        expect(hello.getFileType()).to.equal(TrsdosIIFileType.DATA);
        expect(big.getFileType()).to.equal(TrsdosIIFileType.PROGRAM);
        expect(trsdosIIFileTypeToString(big.getFileType())).to.equal("Program");
        expect(trsdosIIFileTypeToString(hello.getFileType())).to.equal("Data");
        expect(hello.getRecordType()).to.equal(TrsdosIIRecordType.FIXED);
        expect(source.getRecordType()).to.equal(TrsdosIIRecordType.VARIABLE);
        expect(trsdosIIRecordTypeToString(source.getRecordType())).to.equal("Variable");
        expect(hello.getProtectionLevel()).to.equal(7);
        expect(trsdosIIProtectionLevelToString(hello.getProtectionLevel())).to.equal("NONE");
        expect(big.privilege).to.equal(0x0A);
        expect(big.getProtectionLevel()).to.equal(2);
        expect(trsdosIIProtectionLevelToString(big.getProtectionLevel())).to.equal("RENAME");
        expect(hello.updatePasswordHash).to.equal(0x4296);
        expect(hello.accessPasswordHash).to.equal(0x4296);
        expect(hello.lrl).to.equal(1);
        expect(hello.eof).to.equal(1099);
    });

    it("computes the size from the EOF and the record length", () => {
        const files = decodeTrsdosII(makeDisk())!.getDirEntries(true);
        const bySize = new Map(files.map(file => [file.name, file.getSize()]));
        // One-byte records: the last starts at 1099.
        expect(bySize.get("HELLO/TXT")).to.equal(1100);
        // Two records of 256 bytes, the last starting at 256, though three granules are allocated.
        expect(bySize.get("BIG")).to.equal(512);
        // The last record is the five bytes at offset 7.
        expect(bySize.get("SOURCE/SRC")).to.equal(12);
        // An EOF of -1 means empty.
        expect(bySize.get("EMPTY")).to.equal(0);
    });

    it("reads a file across runs and sector halves", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        const hello = trsdosII.getDirEntries(false)[0];
        expect(hello.extents.map(extent => [extent.count, extent.startGranule]))
            .to.eql([[3, HELLO_FIRST_RUN], [2, HELLO_SECOND_RUN]]);
        expect(Array.from(trsdosII.readFile(hello))).to.eql(Array.from(HELLO_DATA));
    });

    it("lists each sector of a file once, in order", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        const hello = trsdosII.getDirEntries(false)[0];
        // Granule 301 is the second half of sector 7 on cylinder 9, then 302 and 303 are the
        // halves of sector 8, and 400 and 401 are the halves of sector 9 on cylinder 12.
        expect(trsdosII.getFileSectorPositions(hello).map(position => position.key()))
            .to.eql(["9:0:7", "9:0:8", "12:0:9"]);
    });

    it("reads only the size of an over-allocated file", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        const big = trsdosII.getDirEntries(false)[2];
        expect(big.getAllocatedSize()).to.equal(3*GRANULE_SIZE);
        expect(Array.from(trsdosII.readFile(big))).to.eql(Array.from(BIG_BYTES.subarray(0, 512)));
        expect(trsdosII.getFileSectorPositions(big).length).to.equal(1);
        expect(trsdosII.readFileWithDamage(big).damage.isDamaged()).to.be.false;
    });

    it("reads an empty file", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        const empty = trsdosII.getDirEntries(false)[1];
        expect(trsdosII.readFile(empty).length).to.equal(0);
        expect(trsdosII.getFileSectorPositions(empty)).to.eql([]);
        expect(trsdosII.readFileWithDamage(empty).damage.isDamaged()).to.be.false;
    });

    it("reads variable-length records", () => {
        const trsdosII = decodeTrsdosII(makeDisk())!;
        const source = trsdosII.getDirEntries(false)[3];
        expect(Array.from(trsdosII.readFile(source))).to.eql(Array.from(SOURCE_DATA_BYTES));
    });

    it("decodes dates", () => {
        const files = decodeTrsdosII(makeDisk())!.getDirEntries(true);
        const byName = new Map(files.map(file => [file.name, file]));
        expect(byName.get("HELLO/TXT")!.getDate()).to.eql(new Date(1984, 1, 15, 13, 45));
        // Day 59 (counting from 0) is March 1 in 1983 but February 29 in the leap year 1984.
        expect(byName.get("BIG")!.getDate()).to.eql(new Date(1983, 2, 1, 0, 0));
        expect(byName.get("SOURCE/SRC")!.getDate()).to.eql(new Date(1984, 2, 1, 0, 0));
        expect(byName.get("HELLO/TXT")!.created).to.eql(new Date(1983, 0, 1, 1, 40));
    });

    it("finds the version in SYSTEM/SYS when there's no banner", () => {
        expect(decodeTrsdosII(makeDisk({banner: false, systemText: true}))!.nameAndVersion).to.equal("TRSDOS-II 4.4");
        expect(decodeTrsdosII(makeDisk({banner: false}))!.nameAndVersion).to.equal("TRSDOS-II");
    });

    it("prefers the banner", () => {
        expect(decodeTrsdosII(makeDisk({systemText: true}))!.nameAndVersion).to.equal("TRSDOS-II 4.2");
    });

    it("uses the backup root directory when the primary is unreadable", () => {
        const disk = makeDisk();
        disk.removeSector(disk.granuleLocation(ROOT_TABLE).position);
        const trsdosII = decodeTrsdosII(disk)!;
        expect(trsdosII).to.not.be.undefined;
        expect(trsdosII.getDirEntries(true).length).to.equal(6);
    });

    it("reports missing sectors and CRC errors", () => {
        const disk = makeDisk();
        // The file's sectors are 9:0:7, 9:0:8, and 12:0:9.
        disk.removeSector(SectorPosition.make(9, 0, 8));
        disk.setCrcError(SectorPosition.make(12, 0, 9));
        const trsdosII = decodeTrsdosII(disk)!;
        const hello = trsdosII.getDirEntries(false)[0];
        const {binary, damage} = trsdosII.readFileWithDamage(hello);
        expect(damage.missingSectors.map(position => position.key())).to.eql(["9:0:8"]);
        expect(damage.crcErrorSectors.map(position => position.key())).to.eql(["12:0:9"]);
        expect(damage.toString()).to.equal("1 missing sector, 1 sector with a CRC error");
        expect(binary.length).to.equal(1100);
        // Granules 302 and 303 are in the missing sector, so bytes 256 to 767 are zero.
        expect(Array.from(binary.subarray(0, 256))).to.eql(Array.from(HELLO_DATA.subarray(0, 256)));
        expect(Array.from(binary.subarray(256, 768))).to.eql(new Array(512).fill(0));
        expect(Array.from(binary.subarray(768))).to.eql(Array.from(HELLO_DATA.subarray(768)));
    });

    it("reports a file larger than its allocation", () => {
        const disk = makeDisk();
        // Make BIG's block table one granule long, for a file of two records that need two granules.
        disk.writeGranule(BIG_TABLE, makeBlockTable([[1, BIG_DATA]]));
        const trsdosII = decodeTrsdosII(disk)!;
        const big = trsdosII.getDirEntries(false)[2];
        const {binary, damage} = trsdosII.readFileWithDamage(big);
        expect(damage.toString()).to.equal("size exceeds allocation");
        expect(binary.length).to.equal(GRANULE_SIZE);
    });

    it("reports a file with no block table", () => {
        const disk = makeDisk();
        disk.writeGranule(BIG_TABLE, new Uint8Array(GRANULE_SIZE));
        const trsdosII = decodeTrsdosII(disk)!;
        const big = trsdosII.getDirEntries(false)[2];
        expect(big.extents).to.eql([]);
        expect(trsdosII.readFileWithDamage(big).damage.directoryErrors).to.eql(["size exceeds allocation"]);
    });

    it("decodes a double-sided disk, whose sides alternate", () => {
        const disk = makeDisk({sideCount: 2});
        // Put a file on the second side of cylinder 0, which holds granules 32 to 63, and on the first
        // side of cylinder 1.
        disk.writeGranule(HELLO_TABLE, makeBlockTable([[40, 33]]));
        disk.writeGranules(33, HELLO_DATA);
        const trsdosII = decodeTrsdosII(disk)!;
        expect(trsdosII.sideCount).to.equal(2);
        expect(trsdosII.granuleCount).to.equal(2*77*32);
        const hello = trsdosII.getDirEntries(false)[0];
        expect(Array.from(trsdosII.readFile(hello))).to.eql(Array.from(HELLO_DATA));
        expect(trsdosII.getFileSectorPositions(hello).map(position => position.key()))
            .to.eql(["0:1:1", "0:1:2", "0:1:3"]);
        // The granule layout puts granule 64 on cylinder 1 side 0.
        expect(disk.granuleLocation(64).position.key()).to.equal("1:0:1");
        expect(trsdosII.getFileSectorPositions(hello)).to.have.length(3);
    });

    it("rejects a blank disk", () => {
        expect(decodeTrsdosII(new MemoryFloppyDisk())).to.be.undefined;
    });

    it("rejects a disk with 256-byte data sectors", () => {
        expect(decodeTrsdosII(new MemoryFloppyDisk(1, 256))).to.be.undefined;
    });

    it("rejects the wrong directory type, version, or device type", () => {
        let disk = makeDisk();
        disk.getSector(SectorPosition.make(0, 0, 3))[0x31] = 2;
        expect(decodeTrsdosII(disk)).to.be.undefined;

        disk = makeDisk();
        disk.getSector(SectorPosition.make(0, 0, 3))[0x30] = 0x31;
        expect(decodeTrsdosII(disk)).to.be.undefined;

        disk = makeDisk();
        disk.getSector(SectorPosition.make(0, 0, 3))[0x26] = 0x01;
        expect(decodeTrsdosII(disk)).to.be.undefined;
    });

    it("rejects file numbers that are out of range", () => {
        // On the boot cylinder.
        let disk = makeDisk();
        putBe24(disk.getSector(SectorPosition.make(0, 0, 3)), 0x13, 5);
        putBe24(disk.getSector(SectorPosition.make(0, 0, 3)), 0x17, 5);
        expect(decodeTrsdosII(disk)).to.be.undefined;

        // Past the end of the disk.
        disk = makeDisk();
        putBe24(disk.getSector(SectorPosition.make(0, 0, 3)), 0x1B, 77*32);
        expect(decodeTrsdosII(disk)).to.be.undefined;
    });

    it("rejects a root directory without a subdirectory", () => {
        const disk = makeDisk();
        disk.writeGranule(ROOT_DATA, makeDirectory([makeEntry({flags: 0x20, name: "NOTADIR"})], 1));
        disk.writeGranule(ROOT_BACKUP_DATA, makeDirectory([makeEntry({flags: 0x20, name: "NOTADIR"})], 1));
        expect(decodeTrsdosII(disk)).to.be.undefined;
    });

    it("rejects a root directory whose block table is bad", () => {
        const disk = makeDisk();
        // Starts past the end of the disk.
        disk.writeGranule(ROOT_TABLE, makeBlockTable([[1, 99999]]));
        disk.writeGranule(ROOT_BACKUP_TABLE, makeBlockTable([[1, 99999]]));
        expect(decodeTrsdosII(disk)).to.be.undefined;
    });
});
