import {describe, expect, it} from "vitest";
import {Density, type FloppyDecodeOptions, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {decodeImdFloppyDisk, ImdMode, imdModeToString} from "./ImdFloppyDisk.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

// Require a boot track, as when guessing the format.
const STRICT: FloppyDecodeOptions = {requireBootTrack: true};
// Allow a missing boot track, as when the extension names the format.
const LOOSE: FloppyDecodeOptions = {requireBootTrack: false};

const DEFAULT_HEADER = "IMD 1.18: 14/10/2026 12:00:00\r\nTest disk\r\n";

// Sector data record types.
const NO_DATA = 0;
const NORMAL = 1;
const COMPRESSED = 2;
const NORMAL_DELETED = 3;
const COMPRESSED_DELETED = 4;
const NORMAL_ERROR = 5;
const COMPRESSED_ERROR = 6;
const NORMAL_DELETED_ERROR = 7;
const COMPRESSED_DELETED_ERROR = 8;

/**
 * A sector data record to put in a test track: the type byte and the bytes after it.
 */
interface TestRecord {
    type: number;
    body: number[];
}

/**
 * A track to put in a test file. Everything that's written to the file's track header is here.
 */
interface TestTrack {
    // The raw mode byte.
    mode: number;
    cylinder: number;
    // The physical side (0 or 1).
    side: number;
    // The sector numbering map.
    numbers: number[];
    // Size code, or 0xFF to use "sizes".
    sizeCode: number;
    // Cylinder map and head map, if any.
    cylinderMap?: number[];
    headMap?: number[];
    // Table of sector sizes, if sizeCode is 0xFF.
    sizes?: number[];
    // One record per sector.
    records: TestRecord[];
}

/**
 * Make a normal-data record whose bytes are a simple function of the seed.
 */
function normal(size: number, seed: number, type: number = NORMAL): TestRecord {
    const body: number[] = [];
    for (let i = 0; i < size; i++) {
        body.push((seed*31 + i*7) & 0xFF);
    }
    return {type, body};
}

/**
 * Make a compressed record, where the whole sector is the given byte.
 */
function compressed(fill: number, type: number = COMPRESSED): TestRecord {
    return {type, body: [fill]};
}

/**
 * Make a track in which every sector has the same size, numbered from "firstSector" up.
 * The sector data depends on the cylinder, side, and sector number.
 */
function makeTrack(mode: ImdMode, cylinder: number, side: number, sectorCount: number, sizeCode: number,
                   firstSector: number = 1): TestTrack {

    const numbers: number[] = [];
    const records: TestRecord[] = [];
    for (let i = 0; i < sectorCount; i++) {
        numbers.push(firstSector + i);
        records.push(normal(128 << sizeCode, cylinder*100 + side*50 + firstSector + i));
    }

    return {mode, cylinder, side, numbers, sizeCode, records};
}

/**
 * Encode a track as it appears in an IMD file.
 */
function encodeTrack(track: TestTrack): number[] {
    let head = track.side;
    if (track.cylinderMap !== undefined) {
        head |= 0x80;
    }
    if (track.headMap !== undefined) {
        head |= 0x40;
    }

    const bytes = [track.mode, track.cylinder, head, track.numbers.length, track.sizeCode, ... track.numbers];
    if (track.cylinderMap !== undefined) {
        bytes.push(... track.cylinderMap);
    }
    if (track.headMap !== undefined) {
        bytes.push(... track.headMap);
    }
    if (track.sizes !== undefined) {
        for (const size of track.sizes) {
            bytes.push(size & 0xFF, size >> 8);
        }
    }
    for (const record of track.records) {
        bytes.push(record.type, ... record.body);
    }

    return bytes;
}

/**
 * Build an IMD file: the header text, the 0x1A byte, and the tracks, followed by any extra raw bytes.
 */
function buildImd(tracks: TestTrack[], header: string = DEFAULT_HEADER, trailer: number[] = []): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < header.length; i++) {
        bytes.push(header.charCodeAt(i));
    }
    bytes.push(0x1A);
    for (const track of tracks) {
        bytes.push(... encodeTrack(track));
    }
    bytes.push(... trailer);

    return new Uint8Array(bytes);
}

/**
 * Build a disk like a Model II 8-inch one: cylinder 0 is FM with 26 sectors of 128 bytes, and the
 * other cylinders are MFM with 26 sectors of 256 bytes.
 */
function buildModel2Tracks(cylinderCount: number): TestTrack[] {
    const tracks = [makeTrack(ImdMode.FM_500_KBPS, 0, 0, 26, 0)];
    for (let cylinder = 1; cylinder < cylinderCount; cylinder++) {
        tracks.push(makeTrack(ImdMode.MFM_500_KBPS, cylinder, 0, 26, 1));
    }
    return tracks;
}

/**
 * Convert to a plain array so that chai can compare it.
 */
function toArray(data: Uint8Array | undefined): number[] | undefined {
    return data === undefined ? undefined : Array.from(data);
}

describe("ImdFloppyDisk", () => {
    it("reads a Model II style disk", () => {
        const tracks = buildModel2Tracks(3);
        tracks[2].records[4] = compressed(0xE5);
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.className).to.equal("ImdFloppyDisk");
        expect(disk?.getDescription()).to.equal("Floppy disk (IMD)");
        expect(disk?.error).to.equal(undefined);
        const geometry = disk?.getGeometry();
        expect(geometry?.cylinderCount).to.equal(3);
        expect(geometry?.sideCount).to.equal(1);
        expect(geometry?.bootTrack!.modalDensity).to.equal(Density.SINGLE);
        expect(geometry?.bootTrack!.modalSectorSize).to.equal(128);
        expect(geometry?.bootTrack!.firstSectorNumber).to.equal(1);
        expect(geometry?.bootTrack!.lastSectorNumber).to.equal(26);
        expect(geometry?.modalDataDensity).to.equal(Density.DOUBLE);
        expect(geometry?.modalDataSectorSize).to.equal(256);
        expect(geometry?.cylinder0Differs).to.equal(true);

        // A normal sector on the boot track.
        const bootSector = disk?.readSector(SectorPosition.make(0, 0, 3));
        expect(toArray(bootSector?.data)).to.eql(tracks[0].records[2].body);
        expect(bootSector?.density).to.equal(Density.SINGLE);
        expect(bootSector?.deleted).to.equal(false);
        expect(bootSector?.crcError).to.equal(false);
        expect(bootSector?.crc).to.equal(undefined);
        expect(bootSector?.getDataAddressMark()).to.equal(0xFB);

        // A normal sector and a compressed one on a data track.
        const normalSector = disk?.readSector(SectorPosition.make(2, 0, 10));
        expect(toArray(normalSector?.data)).to.eql(tracks[2].records[9].body);
        expect(normalSector?.density).to.equal(Density.DOUBLE);
        const compressedSector = disk?.readSector(SectorPosition.make(2, 0, 5));
        expect(compressedSector?.data.length).to.equal(256);
        expect(compressedSector?.data.every(b => b === 0xE5)).to.equal(true);
        expect(compressedSector?.sectorPosition.key()).to.equal("2:0:5");

        // Not there.
        expect(disk?.readSector(SectorPosition.make(0, 0, 27))).to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(3, 0, 1))).to.equal(undefined);
        expect(disk?.hasSectorData(SectorPosition.make(2, 0, 26))).to.equal(true);
        expect(disk?.hasSectorData(SectorPosition.make(2, 0, 27))).to.equal(false);
        expect(disk?.isWriteProtected()).to.equal(true);
    });

    it("returns a copy of the sector data", () => {
        const binary = buildImd(buildModel2Tracks(1));
        const disk = decodeImdFloppyDisk(binary, STRICT);
        const sectorData = disk?.readSector(SectorPosition.make(0, 0, 1));
        const before = toArray(sectorData?.data);
        sectorData?.data.fill(0);

        expect(toArray(disk?.readSector(SectorPosition.make(0, 0, 1))?.data)).to.eql(before);
    });

    it("sets deleted and data error from each record type", () => {
        const track = makeTrack(ImdMode.MFM_250_KBPS, 0, 0, 8, 0);
        // Sector numbers 1 to 8 get record types 1 to 8.
        track.records = [
            normal(128, 1, NORMAL),
            compressed(0x11, COMPRESSED),
            normal(128, 3, NORMAL_DELETED),
            compressed(0x22, COMPRESSED_DELETED),
            normal(128, 5, NORMAL_ERROR),
            compressed(0x33, COMPRESSED_ERROR),
            normal(128, 7, NORMAL_DELETED_ERROR),
            compressed(0x44, COMPRESSED_DELETED_ERROR),
        ];
        const disk = decodeImdFloppyDisk(buildImd([track]), STRICT);

        expect(disk).not.to.equal(undefined);
        // Record type, expected deleted, expected data error.
        const expected = [
            [NORMAL, false, false],
            [COMPRESSED, false, false],
            [NORMAL_DELETED, true, false],
            [COMPRESSED_DELETED, true, false],
            [NORMAL_ERROR, false, true],
            [COMPRESSED_ERROR, false, true],
            [NORMAL_DELETED_ERROR, true, true],
            [COMPRESSED_DELETED_ERROR, true, true],
        ] as const;
        for (const [type, deleted, dataError] of expected) {
            const sectorData = disk?.readSector(SectorPosition.make(0, 0, type));
            expect(sectorData?.deleted, "deleted of type " + type).to.equal(deleted);
            expect(sectorData?.crcError, "data error of type " + type).to.equal(dataError);
            expect(sectorData?.getDataAddressMark(), "mark of type " + type).to.equal(deleted ? 0xF8 : 0xFB);
            expect(sectorData?.dataAddressMark).to.equal(undefined);
            expect(sectorData?.data.length).to.equal(128);
        }
        expect(toArray(disk?.readSector(SectorPosition.make(0, 0, 4))?.data)).to.eql(new Array(128).fill(0x22));
        expect(toArray(disk?.readSector(SectorPosition.make(0, 0, 7))?.data)).to.eql(track.records[6].body);
    });

    it("leaves sectors without data out of the geometry", () => {
        const tracks = buildModel2Tracks(2);
        tracks[0].records[0] = {type: NO_DATA, body: []};
        tracks[1].records[25] = {type: NO_DATA, body: []};
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.error).to.equal(undefined);
        const geometry = disk?.getGeometry();
        expect(geometry?.sectorMap.has("0:0:1")).to.equal(false);
        expect(geometry?.sectorMap.has("0:0:2")).to.equal(true);
        expect(geometry?.bootTrack!.firstSectorNumber).to.equal(2);
        expect(geometry?.sectorMap.has("1:0:26")).to.equal(false);
        expect(geometry?.getTrack(new TrackPosition(1, 0))?.lastSectorNumber).to.equal(25);
        expect(disk?.readSector(SectorPosition.make(0, 0, 1))).to.equal(undefined);
        expect(disk?.hasSectorData(SectorPosition.make(0, 0, 1))).to.equal(false);
        expect(disk?.readSector(SectorPosition.make(1, 0, 26))).to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(1, 0, 25))).not.to.equal(undefined);
    });

    it("finds sectors by number in an interleaved track", () => {
        const track = makeTrack(ImdMode.MFM_500_KBPS, 0, 0, 5, 1);
        // Physical order is 1, 4, 2, 5, 3. The records follow the numbering map.
        track.numbers = [1, 4, 2, 5, 3];
        track.records = track.numbers.map(n => normal(256, n));
        const disk = decodeImdFloppyDisk(buildImd([track]), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().bootTrack?.firstSectorNumber).to.equal(1);
        expect(disk?.getGeometry().bootTrack?.lastSectorNumber).to.equal(5);
        for (let n = 1; n <= 5; n++) {
            expect(toArray(disk?.readSector(SectorPosition.make(0, 0, n))?.data)).to.eql(normal(256, n).body);
        }
        expect(disk?.tracks[0].sectors.map(s => s.sectorNumber)).to.eql([1, 4, 2, 5, 3]);
    });

    it("lets the last of a repeated sector number win", () => {
        const track = makeTrack(ImdMode.MFM_500_KBPS, 0, 0, 3, 0);
        track.numbers = [1, 2, 1];
        track.records = [normal(128, 10), normal(128, 11), normal(128, 12)];
        const disk = decodeImdFloppyDisk(buildImd([track]), STRICT);

        expect(toArray(disk?.readSector(SectorPosition.make(0, 0, 1))?.data)).to.eql(track.records[2].body);
    });

    it("uses the physical position for the geometry and the maps for the sector", () => {
        const track = makeTrack(ImdMode.MFM_500_KBPS, 0, 0, 3, 0);
        track.cylinderMap = [5, 5, 5];
        track.headMap = [1, 1, 1];
        const tracks = [track, makeTrack(ImdMode.MFM_500_KBPS, 1, 0, 3, 0)];
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(2);
        expect(disk?.getGeometry().sideCount).to.equal(1);
        expect(disk?.getGeometry().sectorMap.has("0:0:2")).to.equal(true);
        const sectorData = disk?.readSector(SectorPosition.make(0, 0, 2));
        expect(toArray(sectorData?.data)).to.eql(track.records[1].body);
        expect(sectorData?.sectorPosition.key()).to.equal("5:1:2");
        // The other track has no maps, so the logical position is the physical one.
        expect(disk?.readSector(SectorPosition.make(1, 0, 2))?.sectorPosition.key()).to.equal("1:0:2");
        expect(disk?.readSector(SectorPosition.make(5, 1, 2))).to.equal(undefined);
    });

    it("supports a cylinder map without a head map, and the reverse", () => {
        const cylinderOnly = makeTrack(ImdMode.FM_250_KBPS, 0, 0, 2, 0);
        cylinderOnly.cylinderMap = [7, 8];
        const headOnly = makeTrack(ImdMode.FM_250_KBPS, 1, 0, 2, 0);
        headOnly.headMap = [1, 0];
        const disk = decodeImdFloppyDisk(buildImd([cylinderOnly, headOnly]), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(0, 0, 1))?.sectorPosition.key()).to.equal("7:0:1");
        expect(disk?.readSector(SectorPosition.make(0, 0, 2))?.sectorPosition.key()).to.equal("8:0:2");
        expect(disk?.readSector(SectorPosition.make(1, 0, 1))?.sectorPosition.key()).to.equal("1:1:1");
        expect(disk?.readSector(SectorPosition.make(1, 0, 2))?.sectorPosition.key()).to.equal("1:0:2");
    });

    it("reads a table of sector sizes", () => {
        const track = makeTrack(ImdMode.MFM_500_KBPS, 0, 0, 3, 0);
        track.sizeCode = 0xFF;
        track.sizes = [128, 512, 300];
        track.records = [normal(128, 1), normal(512, 2), compressed(0x99)];
        const disk = decodeImdFloppyDisk(buildImd([track]), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.error).to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(0, 0, 1))?.data.length).to.equal(128);
        expect(toArray(disk?.readSector(SectorPosition.make(0, 0, 2))?.data)).to.eql(track.records[1].body);
        const compressedSector = disk?.readSector(SectorPosition.make(0, 0, 3));
        expect(compressedSector?.data.length).to.equal(300);
        expect(compressedSector?.data.every(b => b === 0x99)).to.equal(true);
    });

    it("reads all the ordinary sector sizes", () => {
        const tracks = [0, 1, 2, 3, 4, 5, 6].map(sizeCode => makeTrack(ImdMode.MFM_300_KBPS, sizeCode, 0, 1, sizeCode));
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        for (let sizeCode = 0; sizeCode <= 6; sizeCode++) {
            expect(disk?.readSector(SectorPosition.make(sizeCode, 0, 1))?.data.length).to.equal(128 << sizeCode);
        }
    });

    it("reads a double-sided disk", () => {
        const tracks: TestTrack[] = [];
        for (let cylinder = 0; cylinder < 3; cylinder++) {
            for (let side = 0; side < 2; side++) {
                tracks.push(makeTrack(ImdMode.MFM_250_KBPS, cylinder, side, 9, 1, 0));
            }
        }
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(3);
        expect(disk?.getGeometry().sideCount).to.equal(2);
        expect(disk?.getGeometry().bootTrack?.firstSectorNumber).to.equal(0);
        expect(disk?.getGeometry().bootTrack?.lastSectorNumber).to.equal(8);
        const sectorData = disk?.readSector(SectorPosition.make(2, 1, 4));
        expect(toArray(sectorData?.data)).to.eql(normal(256, 2*100 + 50 + 4).body);
        expect(sectorData?.sectorPosition.key()).to.equal("2:1:4");
    });

    it("accepts a header without the IMD signature, and keeps the comment", () => {
        const disk = decodeImdFloppyDisk(buildImd(buildModel2Tracks(1), "Just a comment.\r\nTwo lines.\r\n"), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.comment).to.equal("Just a comment.\nTwo lines.\n");
        expect(disk?.error).to.equal(undefined);

        const normalDisk = decodeImdFloppyDisk(buildImd(buildModel2Tracks(1)), STRICT);
        expect(normalDisk?.comment).to.equal("IMD 1.18: 14/10/2026 12:00:00\nTest disk\n");
    });

    it("ignores an empty track with any mode", () => {
        const tracks = buildModel2Tracks(2);
        const emptyTrack: TestTrack = {mode: 0x82, cylinder: 1, side: 1, numbers: [], sizeCode: 0, records: []};
        tracks.splice(1, 0, emptyTrack);
        const disk = decodeImdFloppyDisk(buildImd(tracks), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.error).to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(2);
        expect(disk?.getGeometry().sideCount).to.equal(1);
        expect(disk?.tracks.length).to.equal(2);
        expect(disk?.readSector(SectorPosition.make(1, 0, 1))).not.to.equal(undefined);
    });

    it("keeps the good tracks when a stray byte follows them", () => {
        const binary = buildImd(buildModel2Tracks(3), DEFAULT_HEADER, [0x0A]);
        const disk = decodeImdFloppyDisk(binary, STRICT);

        expect(disk).not.to.equal(undefined);
        // Ignored data is a warning, not an error, so that the disk can still be opened.
        expect(disk?.error).to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(3);
        expect(disk?.ignoredData).to.contain(`offset ${binary.length - 1}`);
        expect(disk?.ignoredData).to.contain("ignored the last 1 byte");
        expect(disk?.ignoredData).not.to.contain("1 bytes");
        expect(disk?.readSector(SectorPosition.make(2, 0, 26))).not.to.equal(undefined);
    });

    it("keeps the good tracks when an invalid track header follows them", () => {
        // Empty tracks like HxC writes, then junk with an invalid size code.
        const empty = [0x82, 0, 0, 0, 0];
        const junk = [0x03, 0x4A, 0x00, 0x05, 0x27, 1, 2, 3];
        const goodTracks = buildModel2Tracks(3);
        const goodLength = buildImd(goodTracks).length;
        const trailer = [...empty, ...empty, ...junk];
        const binary = buildImd(goodTracks, DEFAULT_HEADER, trailer);
        const disk = decodeImdFloppyDisk(binary, STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(3);
        expect(disk?.ignoredData).to.contain(`offset ${goodLength + 2*empty.length}`);
        expect(disk?.ignoredData).to.contain(`ignored the last ${junk.length} bytes`);

        // An invalid mode on a track that has sectors.
        const badMode = buildImd(goodTracks, DEFAULT_HEADER, [0x07, 0, 0, 1, 0, 1, 1]);
        expect(decodeImdFloppyDisk(badMode, STRICT)?.ignoredData).to.contain(`offset ${goodLength}`);

        // An invalid head byte.
        const badHead = buildImd(goodTracks, DEFAULT_HEADER, [0x03, 0, 0x02, 1, 0, 1, 1]);
        expect(decodeImdFloppyDisk(badHead, STRICT)?.ignoredData).to.contain(`offset ${goodLength}`);

        // An invalid record type.
        const badType = buildImd(goodTracks, DEFAULT_HEADER, [0x03, 5, 0, 1, 0, 1, 9]);
        expect(decodeImdFloppyDisk(badType, STRICT)?.ignoredData).to.contain(`offset ${goodLength + 6}`);
        expect(decodeImdFloppyDisk(badType, STRICT)?.readSector(SectorPosition.make(5, 0, 1))).to.equal(undefined);
    });

    it("keeps the complete sectors before a record that runs off the end of the file", () => {
        const tracks = buildModel2Tracks(3);
        const full = buildImd(tracks);
        // Cut the last track in the middle of its 20th sector (each record is 257 bytes).
        const cut = full.length - 6*257 - 100;
        const disk = decodeImdFloppyDisk(full.subarray(0, cut), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.ignoredData).to.contain("Unreadable data at offset " + (full.length - 7*257));
        expect(disk?.ignoredData).to.contain("ignored the last " + (cut - (full.length - 7*257)) + " bytes");
        expect(disk?.getGeometry().cylinderCount).to.equal(3);
        expect(disk?.readSector(SectorPosition.make(2, 0, 19))).not.to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(2, 0, 20))).to.equal(undefined);
        expect(disk?.readSector(SectorPosition.make(2, 0, 26))).to.equal(undefined);
        expect(disk?.getGeometry().getTrack(new TrackPosition(2, 0))?.lastSectorNumber).to.equal(19);
    });

    it("keeps the earlier sectors when a track's maps are cut short", () => {
        const full = buildImd(buildModel2Tracks(2));
        // The second track's header is 5 bytes plus 26 numbers; cut inside the numbers.
        const secondTrackStart = full.length - (5 + 26 + 26*257);
        const disk = decodeImdFloppyDisk(full.subarray(0, secondTrackStart + 10), STRICT);

        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().cylinderCount).to.equal(1);
        expect(disk?.ignoredData).to.contain(`offset ${secondTrackStart}`);
    });

    it("rejects a file without the end of header byte", () => {
        const binary = buildImd(buildModel2Tracks(1));
        const noEnd = binary.map(b => b === 0x1A ? 0x20 : b);

        expect(decodeImdFloppyDisk(noEnd, STRICT)).to.equal(undefined);
        expect(decodeImdFloppyDisk(new Uint8Array(0), STRICT)).to.equal(undefined);
        expect(decodeImdFloppyDisk(new Uint8Array(100).fill(0x41), STRICT)).to.equal(undefined);
    });

    it("rejects a file with no tracks or no readable boot track", () => {
        // No tracks at all.
        expect(decodeImdFloppyDisk(buildImd([]), STRICT)).to.equal(undefined);

        // Only an empty track.
        const empty: TestTrack = {mode: 0x82, cylinder: 0, side: 0, numbers: [], sizeCode: 0, records: []};
        expect(decodeImdFloppyDisk(buildImd([empty]), STRICT)).to.equal(undefined);

        // Nothing on cylinder 0 side 0.
        const tracks = [makeTrack(ImdMode.MFM_500_KBPS, 1, 0, 5, 1), makeTrack(ImdMode.MFM_500_KBPS, 0, 1, 5, 1)];
        expect(decodeImdFloppyDisk(buildImd(tracks), STRICT)).to.equal(undefined);

        // The boot track has only sectors with no data.
        const noData = makeTrack(ImdMode.MFM_500_KBPS, 0, 0, 2, 1);
        noData.records = [{type: NO_DATA, body: []}, {type: NO_DATA, body: []}];
        expect(decodeImdFloppyDisk(buildImd([noData]), STRICT)).to.equal(undefined);

        // The first track is invalid.
        expect(decodeImdFloppyDisk(buildImd([], DEFAULT_HEADER, [0x07, 0, 0, 1, 0, 1, 1]), STRICT)).to.equal(undefined);
    });

    it("accepts a file with no boot track only if it isn't required", () => {
        // Nothing on cylinder 0 side 0, but other tracks.
        const tracks = [makeTrack(ImdMode.MFM_500_KBPS, 1, 0, 5, 1), makeTrack(ImdMode.MFM_500_KBPS, 0, 1, 5, 1)];
        const binary = buildImd(tracks);
        expect(decodeImdFloppyDisk(binary, STRICT)).to.equal(undefined);
        const disk = decodeImdFloppyDisk(binary, LOOSE);
        expect(disk).not.to.equal(undefined);
        expect(disk?.getGeometry().bootTrack).to.equal(undefined);
        expect(disk?.getGeometry().cylinder0Differs).to.equal(false);
        expect(disk?.getGeometry().modalDataSectorSpan).to.equal(5);
        expect(disk?.getBootTrackText()).to.equal("");

        // A file named .IMD gets the loose decoding, but a .DSK doesn't.
        expect(decodeTrs80File(binary, {filename: "X.IMD"}).className).to.equal("ImdFloppyDisk");
        expect(decodeTrs80File(binary, {filename: "X.DSK"}).className).to.equal("RawBinaryFile");

        // No tracks at all.
        expect(decodeImdFloppyDisk(buildImd([]), LOOSE)).to.equal(undefined);

        // Only an empty track.
        const empty: TestTrack = {mode: 0x82, cylinder: 0, side: 0, numbers: [], sizeCode: 0, records: []};
        expect(decodeImdFloppyDisk(buildImd([empty]), LOOSE)).to.equal(undefined);
    });

    it("describes the modes", () => {
        expect(imdModeToString(ImdMode.FM_500_KBPS)).to.equal("500 kbps FM");
        expect(imdModeToString(ImdMode.MFM_300_KBPS)).to.equal("300 kbps MFM");
    });

    it("annotates the file", () => {
        const tracks = buildModel2Tracks(2);
        tracks[1].records[6] = compressed(0xE5, COMPRESSED_DELETED);
        const binary = buildImd(tracks);
        const disk = decodeImdFloppyDisk(binary, STRICT);
        const texts = (disk?.annotations ?? []).map(annotation => annotation.text);

        expect(texts).to.include("Header comment");
        expect(texts).to.include("Cylinder 1, side 0: 500 kbps MFM, 26 sectors, sectors of 256 bytes");
        expect(texts).to.include("Cylinder 1, side 0, sector 7, compressed (fill 0xE5), deleted");
        expect(texts).to.include("Cylinder 0, side 0, sector 1");
        // Annotations stay inside the file and in order.
        let previousEnd = 0;
        for (const annotation of disk?.annotations ?? []) {
            expect(annotation.begin).to.be.at.least(previousEnd);
            expect(annotation.end).to.be.at.most(binary.length);
            previousEnd = annotation.end;
        }
        expect(previousEnd).to.equal(binary.length);
    });

    it("is decoded from a file named .IMD", () => {
        const binary = buildImd(buildModel2Tracks(2));
        const file = decodeTrs80File(binary, {filename: "X.IMD"});

        expect(file.className).to.equal("ImdFloppyDisk");
        expect(decodeTrs80File(new Uint8Array(50), {filename: "X.IMD"}).className).to.equal("RawBinaryFile");
    });
});
