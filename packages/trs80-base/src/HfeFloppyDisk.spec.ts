import {describe, expect, it} from "vitest";
import {CRC_16_CCITT} from "./Crc16.js";
import {Density, type FloppyDecodeOptions, SectorPosition} from "./FloppyDisk.js";
import {decodeHfeFloppyDisk} from "./HfeFloppyDisk.js";
import {CRC_PRESET, DATA_ADDRESS_MARK, DELETED_DATA_ADDRESS_MARK, ID_ADDRESS_MARK} from "./TrackBytes.js";

// Bytes that go in the gaps of each density.
// Require a boot track, as when guessing the format.
const STRICT: FloppyDecodeOptions = {requireBootTrack: true};

const MFM_GAP_BYTE = 0x4E;
const FM_GAP_BYTE = 0xFF;

// The raw MFM sync byte, 0xA1 with a missing clock bit.
const MFM_SYNC_CELLS = 0x4489;

// The clock of an FM address mark.
const FM_MARK_CLOCK = 0xC7;

// The clock of an FM data byte, with every bit present.
const FM_DATA_CLOCK = 0xFF;

const BLOCK_SIZE = 512;
const SIDE_BLOCK_SIZE = 256;

/**
 * A sector to put on a test disk.
 */
interface TestSector {
    density: Density;
    // What the ID field says. The physical position is wherever the sector is put.
    cylinder: number;
    side: number;
    sector: number;
    sizeCode: number;
    data: Uint8Array;
    // Data address mark, defaults to the normal one.
    mark?: number;
    // Write the wrong data CRC.
    badDataCrc?: boolean;
}

/**
 * One side of one track on a test disk.
 */
interface TestSide {
    sectors: TestSector[];
    // Rotate the cell stream so that it starts in the middle of the data of the sector with this index.
    rotateIntoSector?: number;
}

/**
 * Writes encoded bytes as cells, the way an HFE file stores them, one cell per element.
 */
class CellWriter {
    public readonly cells: number[] = [];
    // The last data bit written, which determines whether the next MFM clock bit is present.
    private previousDataBit = 0;

    /**
     * Write a byte as MFM. A clock bit is present only between two zero data bits.
     */
    public mfmByte(byte: number): void {
        for (let bit = 7; bit >= 0; bit--) {
            const dataBit = (byte >> bit) & 1;
            const clockBit = this.previousDataBit === 0 && dataBit === 0 ? 1 : 0;
            this.cells.push(clockBit, dataBit);
            this.previousDataBit = dataBit;
        }
    }

    /**
     * Write an MFM sync byte, which is 0xA1 with a missing clock bit.
     */
    public mfmSync(): void {
        for (let bit = 15; bit >= 0; bit--) {
            this.cells.push((MFM_SYNC_CELLS >> bit) & 1);
        }
        this.previousDataBit = 1;
    }

    /**
     * Write a byte as FM, with the given clock bits. Each data bit is a clock cell, a zero, a data cell, and a zero.
     */
    public fmByte(byte: number, clock: number = FM_DATA_CLOCK): void {
        for (let bit = 7; bit >= 0; bit--) {
            this.cells.push((clock >> bit) & 1, 0, (byte >> bit) & 1, 0);
        }
    }

    /**
     * Write the same byte many times, in the given density.
     */
    public fill(density: Density, byte: number, count: number): void {
        for (let i = 0; i < count; i++) {
            if (density === Density.SINGLE) {
                this.fmByte(byte);
            } else {
                this.mfmByte(byte);
            }
        }
    }

    /**
     * Write a CRC (big-endian) of the given bytes, which must include everything the controller
     * includes, such as the sync bytes.
     */
    public crc(density: Density, crcBytes: number[], wrongCrc: boolean): void {
        let crc = CRC_PRESET;
        for (const byte of crcBytes) {
            crc = CRC_16_CCITT.update(crc, byte);
        }
        if (wrongCrc) {
            crc ^= 0x0101;
        }
        this.fill(density, crc >> 8, 1);
        this.fill(density, crc & 0xFF, 1);
    }

    /**
     * Write the bytes in the given density.
     */
    public bytes(density: Density, bytes: ArrayLike<number>): void {
        for (let i = 0; i < bytes.length; i++) {
            this.fill(density, bytes[i], 1);
        }
    }

    /**
     * Write an address mark in the given density, preceded by sync bytes for double density.
     */
    public mark(density: Density, mark: number): void {
        if (density === Density.SINGLE) {
            this.fmByte(mark, FM_MARK_CLOCK);
        } else {
            this.mfmSync();
            this.mfmSync();
            this.mfmSync();
            this.mfmByte(mark);
        }
    }
}

/**
 * Write a sector's ID field, gap, and data field in its density.
 *
 * @return the index of the cell where the sector's data begins.
 */
function writeSector(writer: CellWriter, sector: TestSector): number {
    const density = sector.density;
    const single = density === Density.SINGLE;
    const syncBytes = single ? [] : [0xA1, 0xA1, 0xA1];
    const mark = sector.mark ?? DATA_ADDRESS_MARK;

    // ID field.
    writer.fill(density, 0x00, single ? 6 : 12);
    writer.mark(density, ID_ADDRESS_MARK);
    const idBytes = [sector.cylinder, sector.side, sector.sector, sector.sizeCode];
    writer.bytes(density, idBytes);
    writer.crc(density, [... syncBytes, ID_ADDRESS_MARK, ... idBytes], false);

    // Gap 2.
    writer.fill(density, single ? FM_GAP_BYTE : MFM_GAP_BYTE, single ? 11 : 22);
    writer.fill(density, 0x00, single ? 6 : 12);

    // Data field.
    writer.mark(density, mark);
    const dataBegin = writer.cells.length;
    writer.bytes(density, sector.data);
    writer.crc(density, [... syncBytes, mark, ... sector.data], sector.badDataCrc === true);

    // Gap 3.
    writer.fill(density, single ? FM_GAP_BYTE : MFM_GAP_BYTE, single ? 16 : 24);

    return dataBegin;
}

/**
 * Make the cells of one side of one track, padded with zero cells to a multiple of 8, and the
 * index of the cell where each sector's data begins.
 */
function makeSideCells(side: TestSide): { cells: number[], dataBegins: number[] } {
    const writer = new CellWriter();
    const firstDensity = side.sectors.length > 0 ? side.sectors[0].density : Density.DOUBLE;
    writer.fill(firstDensity, firstDensity === Density.SINGLE ? FM_GAP_BYTE : MFM_GAP_BYTE, 32);
    const dataBegins = side.sectors.map(sector => writeSector(writer, sector));
    while (writer.cells.length % 8 !== 0) {
        writer.cells.push(0);
    }

    return {cells: writer.cells, dataBegins};
}

/**
 * Pack cells into bytes, least significant bit first.
 */
function packCells(cells: number[]): Uint8Array {
    const bytes = new Uint8Array(cells.length/8);
    for (let i = 0; i < cells.length; i++) {
        bytes[i >> 3] |= cells[i] << (i & 7);
    }

    return bytes;
}

/**
 * Build an HFE version 1 file. Each element of "tracks" is the list of sides on that track.
 * The header says there are "headerSideCount" sides, which can be more than the tracks have.
 */
function buildHfe(headerSideCount: number, tracks: TestSide[][], magic = "HXCPICFE"): Uint8Array {
    // Encode all the tracks, making all the sides of each track the same length.
    const trackStreams: Uint8Array[][] = tracks.map(sides => {
        const encoded = sides.map(makeSideCells);
        while (encoded.length < 2) {
            encoded.push({cells: [], dataBegins: []});
        }
        const length = Math.max(... encoded.map(e => e.cells.length));
        return encoded.map((e, sideIndex) => {
            const cells = e.cells.concat(new Array<number>(length - e.cells.length).fill(0));
            const rotateIntoSector = sides[sideIndex]?.rotateIntoSector;
            if (rotateIntoSector !== undefined) {
                // Start a little way into the sector's data, so that it straddles the end.
                const rotation = e.dataBegins[rotateIntoSector] + 400;
                return packCells(cells.slice(rotation).concat(cells.slice(0, rotation)));
            }
            return packCells(cells);
        });
    });

    // Lay out the file: header, track list, then the interleaved tracks.
    const trackListBlocks = Math.ceil(tracks.length*4/BLOCK_SIZE);
    let nextBlock = 1 + trackListBlocks;
    const trackBlocks = trackStreams.map(streams => Math.ceil(streams[0].length/SIDE_BLOCK_SIZE));
    const totalBlocks = nextBlock + trackBlocks.reduce((a, b) => a + b, 0);
    const binary = new Uint8Array(totalBlocks*BLOCK_SIZE);

    // Header.
    for (let i = 0; i < magic.length; i++) {
        binary[i] = magic.charCodeAt(i);
    }
    binary[8] = 0;
    binary[9] = tracks.length;
    binary[10] = headerSideCount;
    binary[11] = 0;
    binary[12] = 250 & 0xFF;
    binary[13] = 250 >> 8;
    binary[14] = 300 & 0xFF;
    binary[15] = 300 >> 8;
    binary[16] = 7;
    binary[17] = 1;
    binary[18] = 1;
    binary[19] = 0;
    binary[20] = 0xFF;
    binary[21] = 0xFF;
    binary.fill(0xFF, 22, 26);

    // Track list and tracks.
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const streams = trackStreams[trackIndex];
        const sideLength = streams[0].length;
        const entry = BLOCK_SIZE + trackIndex*4;
        binary[entry] = nextBlock & 0xFF;
        binary[entry + 1] = nextBlock >> 8;
        binary[entry + 2] = (sideLength*2) & 0xFF;
        binary[entry + 3] = (sideLength*2) >> 8;

        for (let side = 0; side < 2; side++) {
            for (let i = 0; i < sideLength; i++) {
                binary[nextBlock*BLOCK_SIZE + Math.floor(i/SIDE_BLOCK_SIZE)*BLOCK_SIZE + side*SIDE_BLOCK_SIZE +
                    i%SIDE_BLOCK_SIZE] = streams[side][i];
            }
        }

        nextBlock += trackBlocks[trackIndex];
    }

    return binary;
}

/**
 * Make sector data that is different for every sector, so that mix-ups are noticed.
 */
function makeData(size: number, seed: number): Uint8Array {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        data[i] = (seed*37 + i*11 + (i >> 3)) & 0xFF;
    }

    return data;
}

/**
 * Make a list of 256-byte sectors on a track, numbered from firstSector.
 */
function makeSectors(density: Density, cylinder: number, side: number, count: number,
                     firstSector: number = 0): TestSector[] {

    const sectors: TestSector[] = [];
    for (let i = 0; i < count; i++) {
        const sector = firstSector + i;
        sectors.push({
            density, cylinder, side, sector, sizeCode: 1,
            data: makeData(256, cylinder*64 + side*32 + sector),
        });
    }

    return sectors;
}

/**
 * Check that the sector reads back with the given data, density, and valid CRCs.
 */
function expectSector(disk: ReturnType<typeof decodeHfeFloppyDisk>, cylinder: number, side: number,
                      sector: TestSector): void {

    const sectorData = disk?.readSector(SectorPosition.make(cylinder, side, sector.sector));
    expect(sectorData).not.to.equal(undefined);
    expect(Array.from(sectorData?.data ?? [])).to.eql(Array.from(sector.data));
    expect(sectorData?.density).to.equal(sector.density);
    expect(sectorData?.crcError).to.equal(false);
    expect(sectorData?.crc?.valid()).to.equal(true);
    expect(sectorData?.sectorPosition.cylinderNumber).to.equal(sector.cylinder);
    expect(sectorData?.sectorPosition.side).to.equal(sector.side);
}

describe("HfeFloppyDisk", () => {
    it("reads an all-FM disk", () => {
        const tracks = [0, 1].map(cylinder => [0, 1].map(side =>
            ({sectors: makeSectors(Density.SINGLE, cylinder, side, 5)})));
        const disk = decodeHfeFloppyDisk(buildHfe(2, tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getDescription()).to.equal("Floppy disk (HFE)");
        expect(disk?.getGeometry().cylinderCount).to.equal(2);
        expect(disk?.getGeometry().sideCount).to.equal(2);
        for (let cylinder = 0; cylinder < 2; cylinder++) {
            for (let side = 0; side < 2; side++) {
                for (const sector of tracks[cylinder][side].sectors) {
                    expectSector(disk, cylinder, side, sector);
                }
            }
        }
        expect(disk?.readSector(SectorPosition.make(0, 0, 5))).to.equal(undefined);
    });

    it("reads an all-MFM disk, with a deleted sector", () => {
        const tracks = [0, 1, 2].map(cylinder => [0, 1].map(side =>
            ({sectors: makeSectors(Density.DOUBLE, cylinder, side, 8, 1)})));
        tracks[1][1].sectors[2].mark = DELETED_DATA_ADDRESS_MARK;
        const disk = decodeHfeFloppyDisk(buildHfe(2, tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(3);
        expect(disk?.getGeometry().sideCount).to.equal(2);
        for (let cylinder = 0; cylinder < 3; cylinder++) {
            for (let side = 0; side < 2; side++) {
                for (const sector of tracks[cylinder][side].sectors) {
                    expectSector(disk, cylinder, side, sector);
                }
            }
        }
        expect(disk?.readSector(SectorPosition.make(1, 1, 3))?.deleted).to.equal(true);
        expect(disk?.readSector(SectorPosition.make(1, 1, 3))?.dataAddressMark).to.equal(DELETED_DATA_ADDRESS_MARK);
        expect(disk?.readSector(SectorPosition.make(1, 1, 4))?.deleted).to.equal(false);
    });

    it("reads a single-density sector followed by double-density ones on one track", () => {
        const sectors = [
            ... makeSectors(Density.SINGLE, 0, 0, 1, 0),
            ... makeSectors(Density.DOUBLE, 0, 0, 4, 1),
        ];
        const disk = decodeHfeFloppyDisk(buildHfe(1, [[{sectors}]]), STRICT);

        expect(disk).not.to.equal(undefined);
        for (const sector of sectors) {
            expectSector(disk, 0, 0, sector);
        }
        expect(disk?.readSector(SectorPosition.make(0, 0, 0))?.density).to.equal(Density.SINGLE);
        expect(disk?.readSector(SectorPosition.make(0, 0, 3))?.density).to.equal(Density.DOUBLE);
    });

    it("reads sectors of other sizes", () => {
        const sectors: TestSector[] = [0, 1, 2, 3].map(sizeCode => ({
            density: Density.DOUBLE, cylinder: 0, side: 0, sector: sizeCode + 1, sizeCode,
            data: makeData(128 << sizeCode, sizeCode),
        }));
        const disk = decodeHfeFloppyDisk(buildHfe(1, [[{sectors}]]), STRICT);

        expect(disk).not.to.equal(undefined);
        for (const sector of sectors) {
            expectSector(disk, 0, 0, sector);
        }
    });

    for (const density of [Density.SINGLE, Density.DOUBLE]) {
        it(`reads a sector whose data straddles the end of the track (density ${density})`, () => {
            const sectors = makeSectors(density, 0, 0, 5, 1);
            const disk = decodeHfeFloppyDisk(buildHfe(1, [[{sectors, rotateIntoSector: 2}]]), STRICT);

            expect(disk).not.to.equal(undefined);
            for (const sector of sectors) {
                expectSector(disk, 0, 0, sector);
            }
            expect(disk?.tracks[0].sectors.length).to.equal(5);
        });
    }

    it("doesn't find sectors inside the data of another sector", () => {
        // In MFM, the bytes FF F5 7E FF look like an FM ID mark, and 00 01 EA DE look like
        // an FM data mark. Followed by whatever else, that's a plausible FM sector.
        const sectors = makeSectors(Density.DOUBLE, 0, 0, 4, 1);
        sectors[1].data.set([0xFF, 0xF5, 0x7E, 0xFF], 19);
        sectors[1].data.set([0x00, 0x01, 0xEA, 0xDE], 39);
        const disk = decodeHfeFloppyDisk(buildHfe(1, [[{sectors}]]), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.tracks[0].sectors.length).to.equal(4);
        for (const sector of sectors) {
            expectSector(disk, 0, 0, sector);
        }
    });

    it("returns sectors with bad CRCs, marked as errors", () => {
        const sectors = makeSectors(Density.DOUBLE, 0, 0, 3, 1);
        sectors[1].badDataCrc = true;
        const disk = decodeHfeFloppyDisk(buildHfe(1, [[{sectors}]]), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.tracks[0].sectors.length).to.equal(3);
        const sectorData = disk?.readSector(SectorPosition.make(0, 0, 2));
        expect(sectorData?.crcError).to.equal(true);
        expect(sectorData?.crc?.idCrc.valid()).to.equal(true);
        expect(sectorData?.crc?.dataCrc.valid()).to.equal(false);
        expect(Array.from(sectorData?.data ?? [])).to.eql(Array.from(sectors[1].data));
        expect(disk?.readSector(SectorPosition.make(0, 0, 1))?.crcError).to.equal(false);
    });

    it("computes the side count from the sectors, not the header", () => {
        const tracks = [0, 1].map(cylinder => [
            {sectors: makeSectors(Density.DOUBLE, cylinder, 0, 4, 1)},
            {sectors: []},
        ]);
        const disk = decodeHfeFloppyDisk(buildHfe(2, tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().sideCount).to.equal(1);
        expect(disk?.getGeometry().cylinderCount).to.equal(2);
    });

    it("skips a track that runs off the end of the file", () => {
        const tracks = [0, 1].map(cylinder => [{sectors: makeSectors(Density.DOUBLE, cylinder, 0, 4, 1)}]);
        const binary = buildHfe(1, tracks);
        const disk = decodeHfeFloppyDisk(binary.subarray(0, binary.length - 1500), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(1);
    });

    it("rejects version 3 files", () => {
        const sectors = makeSectors(Density.DOUBLE, 0, 0, 4, 1);
        expect(decodeHfeFloppyDisk(buildHfe(1, [[{sectors}]], "HXCHFEV3"), STRICT)).to.equal(undefined);
    });

    it("rejects other files", () => {
        expect(decodeHfeFloppyDisk(new Uint8Array(100), STRICT)).to.equal(undefined);
        expect(decodeHfeFloppyDisk(new Uint8Array(2048), STRICT)).to.equal(undefined);
    });
});
