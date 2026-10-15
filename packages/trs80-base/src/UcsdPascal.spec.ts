import {describe, expect, it} from "vitest";
import {Density, FloppyDisk, FloppyDiskGeometry, SectorData, SectorInfo, SectorPosition} from "./FloppyDisk.js";
import {decodeFloppyFileSystem} from "./FloppyFileSystem.js";
import {
    decodeUcsdPascal, UcsdPascal, UcsdPascalFileKind, ucsdPascalFileKindToString, ucsdPascalTextToHost,
} from "./UcsdPascal.js";

const CYLINDER_COUNT = 35;
const SECTOR_SIZE = 256;
const BLOCK_SIZE = 512;
const DIR_ENTRY_SIZE = 26;

// The order of the ten physical sectors of volume track 0, by logical sector. Written out here
// instead of computed, so that the tests don't just repeat the decoder's formula.
const TRACK_ORDER = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];

// How far each volume track's order is rotated from the one before.
const TRACK_SKEW = 6;

/**
 * A floppy whose sectors are kept in a map, all filled with 0xE5.
 */
class MemoryFloppyDisk extends FloppyDisk {
    public readonly className = "MemoryFloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    private readonly sectors = new Map<string, Uint8Array>();

    /**
     * @param sectorsPerTrack number of sectors on each track, numbered from 0.
     */
    constructor(sectorsPerTrack: number) {
        super(new Uint8Array(0), undefined, []);

        const sectorInfos: SectorInfo[] = [];
        for (let cylinder = 0; cylinder < CYLINDER_COUNT; cylinder++) {
            for (let sector = 0; sector < sectorsPerTrack; sector++) {
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
        return new SectorData(data, sectorPosition, Density.SINGLE);
    }

    /**
     * Remove a sector, so that it can't be read.
     */
    public removeSector(position: SectorPosition): void {
        this.sectors.delete(position.key());
    }

    /**
     * Get the data of a sector to fill in.
     */
    public getSector(position: SectorPosition): Uint8Array {
        return this.sectors.get(position.key())!;
    }
}

/**
 * The physical position of one of the two sectors of a block, computed from the literal order above.
 */
function expectedPosition(block: number, half: number): SectorPosition {
    const sector = block*2 + half;
    const track = Math.floor(sector/10);
    const physical = (TRACK_ORDER[sector % 10] + TRACK_SKEW*track) % 10;
    return SectorPosition.make(1 + track, 0, physical);
}

/**
 * Write bytes (up to 512) at the start of a block.
 */
function writeBlock(disk: MemoryFloppyDisk, block: number, bytes: Uint8Array): void {
    for (let half = 0; half < 2; half++) {
        disk.getSector(expectedPosition(block, half)).set(bytes.subarray(half*SECTOR_SIZE, (half + 1)*SECTOR_SIZE));
    }
}

/**
 * Write one byte of the directory, which starts at block 2.
 */
function writeDirectoryByte(disk: MemoryFloppyDisk, offset: number, value: number): void {
    const sector = expectedPosition(2 + Math.floor(offset/BLOCK_SIZE), Math.floor((offset % BLOCK_SIZE)/SECTOR_SIZE));
    disk.getSector(sector)[offset % SECTOR_SIZE] = value;
}

/**
 * Store a Pascal string: a length byte, then the characters, in a field of the given size.
 */
function putName(bytes: Uint8Array, offset: number, name: string, fieldSize: number): void {
    bytes[offset] = name.length;
    for (let i = 0; i < fieldSize; i++) {
        bytes[offset + 1 + i] = i < name.length ? name.charCodeAt(i) : 0;
    }
}

/**
 * Store a little-endian word.
 */
function putWord(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = value & 0xFF;
    bytes[offset + 1] = value >> 8;
}

/**
 * Description of a file for the test directory.
 */
interface TestFile {
    name: string;
    firstBlock: number;
    nextBlock: number;
    kind: UcsdPascalFileKind;
    lastByte: number;
    // The date word, with zero meaning no date.
    date: number;
}

/**
 * The date word for a date.
 */
function dateWord(year: number, month: number, day: number): number {
    return ((year - 1900) << 9) | (day << 4) | month;
}

/**
 * Make the directory bytes: the volume header followed by the files' entries.
 */
function makeDirectory(volumeName: string, blockCount: number, files: TestFile[]): Uint8Array {
    const bytes = new Uint8Array((files.length + 1)*DIR_ENTRY_SIZE);
    putWord(bytes, 2, 6);
    putName(bytes, 6, volumeName, 7);
    putWord(bytes, 14, blockCount);
    putWord(bytes, 16, files.length);
    putWord(bytes, 20, dateWord(1979, 6, 9));
    files.forEach((file, i) => {
        const offset = (i + 1)*DIR_ENTRY_SIZE;
        putWord(bytes, offset, file.firstBlock);
        putWord(bytes, offset + 2, file.nextBlock);
        putWord(bytes, offset + 4, file.kind | 0x1230);
        putName(bytes, offset + 6, file.name, 15);
        putWord(bytes, offset + 22, file.lastByte);
        putWord(bytes, offset + 24, file.date);
    });
    return bytes;
}

/**
 * Write the directory into blocks 2 and on, leaving the rest of its blocks untouched.
 */
function writeDirectory(disk: MemoryFloppyDisk, directory: Uint8Array): void {
    for (let i = 0; i < directory.length; i += SECTOR_SIZE) {
        const sector = expectedPosition(2 + Math.floor(i/BLOCK_SIZE), Math.floor((i % BLOCK_SIZE)/SECTOR_SIZE));
        disk.getSector(sector).set(directory.subarray(i, i + SECTOR_SIZE));
    }
}

/**
 * Contents for a file of the given length, starting with a different value for each seed.
 */
function makeContents(length: number, seed: number): Uint8Array {
    return Uint8Array.from({length}, (_, i) => (i*7 + seed) & 0xFF);
}

// Files of the test disk. The first crosses from track 1 to track 2 (block 9 is sectors 18 and 19
// of the volume, and block 10 starts the next track). The second is short in its last block. The
// rest are there to make the directory more than a sector long.
const FILES: TestFile[] = [
    {name: "BIG.CODE", firstBlock: 6, nextBlock: 12, kind: UcsdPascalFileKind.CODE, lastByte: 512, date: dateWord(1979, 6, 9)},
    {name: "NOTES.TEXT", firstBlock: 12, nextBlock: 15, kind: UcsdPascalFileKind.TEXT, lastByte: 100, date: 0},
    ...Array.from({length: 11}, (_, i): TestFile => ({
        name: "F" + i + ".DATA",
        firstBlock: 15 + i,
        nextBlock: 16 + i,
        kind: UcsdPascalFileKind.DATA,
        lastByte: 10 + i,
        date: dateWord(1980, 12, 31),
    })),
];

/**
 * A disk with a volume of the files above. The first two have contents.
 */
function makeDisk(sectorsPerTrack = 10): MemoryFloppyDisk {
    const disk = new MemoryFloppyDisk(sectorsPerTrack);
    writeDirectory(disk, makeDirectory("TESTVOL", 170, FILES));
    const big = makeContents(5*BLOCK_SIZE + 512, 1);
    for (let i = 0; i < 6; i++) {
        writeBlock(disk, 6 + i, big.subarray(i*BLOCK_SIZE, (i + 1)*BLOCK_SIZE));
    }
    const notes = makeContents(2*BLOCK_SIZE + 100, 2);
    for (let i = 0; i < 3; i++) {
        writeBlock(disk, 12 + i, notes.subarray(i*BLOCK_SIZE, (i + 1)*BLOCK_SIZE));
    }
    return disk;
}

describe("decodeUcsdPascal", () => {
    it("decodes a volume", () => {
        const ucsdPascal = decodeUcsdPascal(makeDisk())!;
        expect(ucsdPascal).to.not.be.undefined;
        expect(ucsdPascal.nameAndVersion).to.equal("FMG UCSD Pascal");
        expect(ucsdPascal.volumeName).to.equal("TESTVOL");
        expect(ucsdPascal.blockCount).to.equal(170);
        const files = ucsdPascal.getDirEntries(true);
        expect(files.length).to.equal(13);
        expect(files.map(file => file.getFilename(".")).slice(0, 3)).to.eql(["BIG.CODE", "NOTES.TEXT", "F0.DATA"]);
        expect(files[12].getFilename("/")).to.equal("F10.DATA");
        expect(files.map(file => ucsdPascalFileKindToString(file.kind)).slice(0, 3)).to.eql(["Code", "Text", "Data"]);
        expect(files[0].getSize()).to.equal(6*BLOCK_SIZE - BLOCK_SIZE + 512);
        expect(files[1].getSize()).to.equal(2*BLOCK_SIZE + 100);
        expect(files[2].getSize()).to.equal(10);
        expect(files[12].getSize()).to.equal(20);
        expect(files[0].getDate()).to.eql(new Date(1979, 5, 9));
        expect(files[1].getDate()).to.be.undefined;
        expect(files[2].getDate()).to.eql(new Date(1980, 11, 31));
        expect(files.every(file => !file.isSystemFile() && !file.isHidden())).to.be.true;
    });

    it("reads files across a track boundary and trims the last block", () => {
        const ucsdPascal = decodeUcsdPascal(makeDisk())!;
        const files = ucsdPascal.getDirEntries(true);
        expect(Array.from(ucsdPascal.readFile(files[0])))
            .to.eql(Array.from(makeContents(6*BLOCK_SIZE - BLOCK_SIZE + 512, 1)));
        const notes = ucsdPascal.readFileWithDamage(files[1]);
        expect(Array.from(notes.binary)).to.eql(Array.from(makeContents(2*BLOCK_SIZE + 100, 2)));
        expect(notes.damage.isDamaged()).to.be.false;
    });

    it("maps blocks to the known sectors", () => {
        const ucsdPascal = decodeUcsdPascal(makeDisk())!;
        const examples: [number, [number, number][]][] = [
            [0, [[1, 0], [1, 2]]],
            [2, [[1, 8], [1, 1]]],
            [3, [[1, 3], [1, 5]]],
            [4, [[1, 7], [1, 9]]],
            [5, [[2, 6], [2, 8]]],
            [6, [[2, 0], [2, 2]]],
        ];
        for (const [block, expected] of examples) {
            const actual = ucsdPascal.blockSectorPositions(block).map(position =>
                [position.cylinderNumber, position.sectorNumber]);
            expect(actual).to.eql(expected);
            expect(ucsdPascal.blockSectorPositions(block).every(position => position.side === 0)).to.be.true;
        }
    });

    it("is found by decodeFloppyFileSystem()", () => {
        const fileSystem = decodeFloppyFileSystem(makeDisk());
        expect(fileSystem).to.be.instanceOf(UcsdPascal);
    });

    it("decodes an empty volume", () => {
        const disk = new MemoryFloppyDisk(10);
        writeDirectory(disk, makeDirectory("EMPTY", 170, []));
        const ucsdPascal = decodeUcsdPascal(disk)!;
        expect(ucsdPascal.volumeName).to.equal("EMPTY");
        expect(ucsdPascal.files.length).to.equal(0);
    });

    it("reports missing sectors", () => {
        const disk = makeDisk();
        // The second half of block 13, in the middle of NOTES.TEXT.
        const missing = expectedPosition(13, 1);
        disk.removeSector(missing);
        const ucsdPascal = decodeUcsdPascal(disk)!;
        const contents = ucsdPascal.readFileWithDamage(ucsdPascal.files[1]);
        expect(contents.damage.missingSectors.map(position => position.key())).to.eql([missing.key()]);
        expect(contents.binary.length).to.equal(2*BLOCK_SIZE + 100);
        expect(contents.binary[BLOCK_SIZE + SECTOR_SIZE]).to.equal(0);
    });

    it("rejects a blank disk", () => {
        expect(decodeUcsdPascal(new MemoryFloppyDisk(10))).to.be.undefined;
    });

    it("rejects a disk with the wrong number of sectors per track", () => {
        expect(decodeUcsdPascal(makeDisk(18))).to.be.undefined;
    });

    it("rejects a header whose next block is not 6", () => {
        const disk = makeDisk();
        writeDirectoryByte(disk, 2, 7);
        expect(decodeUcsdPascal(disk)).to.be.undefined;
    });

    it("rejects a bad volume name", () => {
        const spaceDisk = makeDisk();
        writeDirectoryByte(spaceDisk, 8, 0x20);
        expect(decodeUcsdPascal(spaceDisk)).to.be.undefined;

        const controlDisk = makeDisk();
        writeDirectoryByte(controlDisk, 7, 0x05);
        expect(decodeUcsdPascal(controlDisk)).to.be.undefined;

        const longDisk = makeDisk();
        writeDirectoryByte(longDisk, 6, 8);
        expect(decodeUcsdPascal(longDisk)).to.be.undefined;
    });

    it("rejects overlapping entries", () => {
        const disk = makeDisk();
        // Make the second file start at block 11, inside the first.
        writeDirectoryByte(disk, 2*DIR_ENTRY_SIZE, 11);
        expect(decodeUcsdPascal(disk)).to.be.undefined;
    });

    it("rejects a last byte of zero", () => {
        const disk = makeDisk();
        writeDirectoryByte(disk, DIR_ENTRY_SIZE + 22, 0);
        writeDirectoryByte(disk, DIR_ENTRY_SIZE + 23, 0);
        expect(decodeUcsdPascal(disk)).to.be.undefined;
    });

    it("rejects an unknown kind", () => {
        const disk = makeDisk();
        writeDirectoryByte(disk, DIR_ENTRY_SIZE + 4, 0x0F);
        expect(decodeUcsdPascal(disk)).to.be.undefined;
    });
});

/**
 * Build a text file's bytes: a 1,024-byte header of the given fill, then the pages.
 */
function makeTextFile(pages: number[][], headerFill = 0): Uint8Array {
    const bytes = new Uint8Array(1024*(1 + pages.length));
    bytes.fill(headerFill, 0, 1024);
    pages.forEach((page, i) => bytes.set(page, 1024*(1 + i)));
    return bytes;
}

/**
 * The character codes of an ASCII string, with "\r" for CR, "\x10" for DLE, and so on.
 */
function codes(text: string): number[] {
    return Array.from(text, c => c.charCodeAt(0));
}

/**
 * Convert and return the result as a string.
 */
function convertToString(data: Uint8Array): string {
    return String.fromCharCode(... ucsdPascalTextToHost(data));
}

describe("ucsdPascalTextToHost", () => {
    it("drops the header, expands DLE, turns CR into newline, and drops the padding", () => {
        const page = codes("FMG:\r\x10 IN ORDER\r\x10$INDENT\r");
        expect(convertToString(makeTextFile([page]))).to.equal("FMG:\nIN ORDER\n    INDENT\n");
    });

    it("keeps a space after a DLE that is not the count", () => {
        // DLE with 0 spaces (32), then four literal spaces.
        expect(convertToString(makeTextFile([codes("\x10     IN\r")]))).to.equal("    IN\n");
    });

    it("converts every page", () => {
        const first = codes("ONE\r");
        const second = codes("\x10\"TWO\r");
        expect(convertToString(makeTextFile([first, second]))).to.equal("ONE\n  TWO\n");
    });

    it("handles a header filled with something other than zeros", () => {
        expect(convertToString(makeTextFile([codes("A\r")], 0x55))).to.equal("A\n");
    });

    it("handles a short last page and a line with no CR", () => {
        const data = makeTextFile([codes("AB\rCD")]).subarray(0, 1024 + 5);
        expect(convertToString(data)).to.equal("AB\nCD");
    });

    it("expands DLE in the middle of a line, and drops a final DLE", () => {
        expect(convertToString(makeTextFile([codes("A\x10#B\r\x10")]))).to.equal("A   B\n");
    });

    it("treats a count below 32 as no spaces", () => {
        expect(convertToString(makeTextFile([codes("\x10\x05X\r")]))).to.equal("X\n");
    });

    it("gives nothing for a file that is only a header, or shorter", () => {
        expect(ucsdPascalTextToHost(makeTextFile([])).length).to.equal(0);
        expect(ucsdPascalTextToHost(new Uint8Array(300)).length).to.equal(0);
        expect(ucsdPascalTextToHost(new Uint8Array(0)).length).to.equal(0);
    });

    it("passes through bytes with the high bit set", () => {
        expect(Array.from(ucsdPascalTextToHost(makeTextFile([[0xE9, 0x0D]])))).to.eql([0xE9, 0x0A]);
    });
});

describe("UcsdPascalFile.isText", () => {
    it("is true only for text files", () => {
        const files = decodeUcsdPascal(makeDisk())!.getDirEntries(true);
        expect(files.map(file => file.isText()).slice(0, 3)).to.eql([false, true, false]);
    });
});
