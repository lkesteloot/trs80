/**
 * HFE floppy images, from the HxC Floppy Emulator. Gotek drives running HxC or FlashFloppy
 * firmware use them too. Unlike JV1, JV3, and DMK, which store sectors or decoded bytes, HFE
 * stores each track as its raw cell stream, one bit per half-cell, already clocked, so no
 * flux timing is involved. We find the address marks in that stream and decode the sectors
 * from them. Only version 1 ("HXCPICFE") is supported, not version 3 ("HXCHFEV3"), which
 * adds opcodes to the stream. Reading only; we don't write HFE.
 *
 * https://hxc2001.com/download/floppy_drive_emulator/SDCard_HxC_Floppy_Emulator_HFE_file_format.pdf
 * MAME's implementation: src/lib/formats/hxchfe_dsk.cpp
 */

import {assertNever, word} from "z80-base";
import {CRC_16_CCITT} from "./Crc16.js";
import {
    CrcInfo,
    Density,
    FloppyDisk,
    FloppyDecodeOptions,
    FloppyDiskGeometry,
    SectorCrc,
    SectorData,
    SectorInfo,
    SectorPosition,
    TrackPosition,
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {
    CRC_PRESET,
    ID_ADDRESS_MARK,
    isDataAddressMark,
    isDeletedDataAddressMark,
    MFM_SYNC,
    MFM_SYNC_COUNT,
} from "./TrackBytes.js";

// Print extra debug stuff.
const DEBUG = false;

// The size of the header, and of the blocks that everything else is laid out in.
const BLOCK_SIZE = 512;

// Each side's half of an interleaved block.
const SIDE_BLOCK_SIZE = BLOCK_SIZE/2;

// The first eight bytes of a version 1 file.
const HFE_V1_MAGIC = "HXCPICFE";

// The first eight bytes of a version 3 file, which we don't support.
const HFE_V3_MAGIC = "HXCHFEV3";

// The MFM sync byte (0xA1 with a missing clock bit) as it appears in the raw cell stream.
const MFM_SYNC_CELLS = 0x4489;

// The clock bits of an FM address mark, which is missing some of them.
const FM_MARK_CLOCK = 0xC7;

// Number of cells in an encoded byte. FM has four per data bit and MFM has two.
const FM_CELLS_PER_BYTE = 32;
const MFM_CELLS_PER_BYTE = 16;

// Maximum gap between the end of an ID field and the start of its data address mark, in bytes,
// from the WD179x data sheet.
const FM_MAX_DATA_MARK_GAP = 30;
const MFM_MAX_DATA_MARK_GAP = 43;

// Don't try to find marks in streams shorter than the longest one we look for.
const MIN_STREAM_CELLS = 48;

// The size of an ID field after its mark: cylinder, side, sector, size code, CRC high, CRC low.
const ID_FIELD_SIZE = 6;

// The four data address marks and the ID address mark, for FM.
const FM_MARK_BYTES = [ID_ADDRESS_MARK, 0xF8, 0xF9, 0xFA, 0xFB];

/**
 * Generate the 32 raw cells of an FM address mark: the mark's data byte with clock 0xC7. Each
 * data bit is four cells: clock, zero, data, zero. The first cell is the most significant bit.
 */
function fmMarkCells(mark: number): number {
    let cells = 0;

    for (let bit = 7; bit >= 0; bit--) {
        const clockBit = (FM_MARK_CLOCK >> bit) & 1;
        const dataBit = (mark >> bit) & 1;
        cells = (cells << 4) | (clockBit << 3) | (dataBit << 1);
    }

    return cells >>> 0;
}

// Map from the raw cells of each FM mark to the mark's data byte.
const FM_MARK_CELLS_TO_BYTE = new Map<number,number>(FM_MARK_BYTES.map(mark => [fmMarkCells(mark), mark]));

/**
 * An address mark found in a side's cell stream.
 */
class HfeMark {
    // Cell index of the start of the mark, which for MFM is the first of the three sync bytes.
    public readonly start: number;
    // Cell index just after the mark byte.
    public readonly end: number;
    public readonly density: Density;
    // The mark's data byte: 0xFE or 0xF8 to 0xFB.
    public readonly mark: number;

    constructor(start: number, end: number, density: Density, mark: number) {
        this.start = start;
        this.end = end;
        this.density = density;
        this.mark = mark;
    }
}

/**
 * Data for a sector on an HFE floppy, decoded when the file was loaded.
 */
class HfeSector {
    // Cell index (in its side's stream) of the start of the ID mark.
    public readonly start: number;
    public readonly density: Density;
    // The bytes of the ID field: cylinder, side, sector, and size code.
    public readonly cylinder: number;
    public readonly side: number;
    public readonly sectorNumber: number;
    public readonly sizeCode: number;
    public readonly dataMark: number;
    public readonly data: Uint8Array;
    public readonly idCrc: CrcInfo;
    public readonly dataCrc: CrcInfo;

    constructor(start: number, density: Density, cylinder: number, side: number, sectorNumber: number,
                sizeCode: number, dataMark: number, data: Uint8Array, idCrc: CrcInfo, dataCrc: CrcInfo) {

        this.start = start;
        this.density = density;
        this.cylinder = cylinder;
        this.side = side;
        this.sectorNumber = sectorNumber;
        this.sizeCode = sizeCode;
        this.dataMark = dataMark;
        this.data = data;
        this.idCrc = idCrc;
        this.dataCrc = dataCrc;
    }

    /**
     * The number of data bytes in the sector.
     */
    public getLength(): number {
        return this.data.length;
    }
}

/**
 * Everything we know about one side of one track on an HFE disk.
 */
class HfeTrack {
    public readonly trackPosition: TrackPosition;
    // In the order they are on the disk.
    public readonly sectors: HfeSector[];

    constructor(trackPosition: TrackPosition, sectors: HfeSector[]) {
        this.trackPosition = trackPosition;
        this.sectors = sectors;
    }
}

/**
 * Entire HFE floppy.
 */
export class HfeFloppyDisk extends FloppyDisk {
    readonly className = "HfeFloppyDisk";
    // Set by computeGeometry(), which the decoder calls.
    private geometry: FloppyDiskGeometry | undefined = undefined;
    // Only the tracks that have sectors.
    public readonly tracks: HfeTrack[];
    private readonly tracksByPosition = new Map<string,HfeTrack>();

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                tracks: HfeTrack[]) {

        super(binary, error, annotations);
        this.tracks = tracks;
        for (const track of tracks) {
            this.tracksByPosition.set(track.trackPosition.key(), track);
        }
    }

    getDescription(): string {
        return "Floppy disk (HFE)";
    }

    /**
     * Compute the geometry from the decoded sectors. The header's track and side counts aren't
     * reliable (blank trailing tracks, blank second sides), so we use what's actually there.
     *
     * @return whether successful, which it isn't if no track has sectors. (A disk with no sectors on
     * cylinder 0 side 0 still succeeds; the decoder checks for that.)
     */
    public computeGeometry(): boolean {
        const cylinderCount = Math.max(-1, ... this.tracks.map(track => track.trackPosition.cylinderNumber)) + 1;
        const sideCount = Math.max(-1, ... this.tracks.map(track => track.trackPosition.side)) + 1;

        // Where each sector physically is, which is what the geometry describes.
        const sectorInfos = this.tracks.flatMap(track =>
            track.sectors.map(sector =>
                new SectorInfo(new SectorPosition(track.trackPosition, sector.sectorNumber),
                    sector.density, sector.getLength())));

        this.geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos);

        return this.geometry !== undefined;
    }

    getGeometry(): FloppyDiskGeometry {
        if (this.geometry === undefined) {
            // The decoder rejects disks whose geometry can't be computed.
            throw new Error("HFE geometry was not computed");
        }

        return this.geometry;
    }

    readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const track = this.tracksByPosition.get(sectorPosition.trackPosition.key());
        if (track === undefined) {
            return undefined;
        }

        // If a sector number repeats, we return the first one.
        const sector = track.sectors.find(sector => sector.sectorNumber === sectorPosition.sectorNumber);
        if (sector === undefined) {
            return undefined;
        }

        // What the sector says about itself, which can differ from where it physically is.
        const logicalSectorPosition = SectorPosition.make(sector.cylinder, sector.side, sector.sectorNumber);
        const sectorData = new SectorData(sector.data, logicalSectorPosition, sector.density);
        sectorData.crc = new SectorCrc(sector.idCrc, sector.dataCrc);
        sectorData.crcError = !sectorData.crc.valid();
        sectorData.deleted = isDeletedDataAddressMark(sector.dataMark);
        sectorData.dataAddressMark = sector.dataMark;
        return sectorData;
    }
}

/**
 * Whether the bytes at "begin" in the binary match the letters in "text".
 */
function matchesAscii(binary: Uint8Array, begin: number, text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        if (binary[begin + i] !== text.codePointAt(i)) {
            return false;
        }
    }

    return true;
}

/**
 * A side's cell stream, which is treated as circular: a sector whose data runs off the end
 * of the stream continues from the start. Cells are stored least significant bit first.
 */
class CellStream {
    public readonly bytes: Uint8Array;
    public readonly length: number;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
        this.length = bytes.length*8;
    }

    /**
     * Get the cell at the given index, which wraps around the end of the stream.
     */
    public getCell(index: number): number {
        const wrapped = index % this.length;
        return (this.bytes[wrapped >> 3] >> (wrapped & 7)) & 1;
    }

    /**
     * Read one encoded byte starting at the given cell.
     */
    public readByte(index: number, density: Density): number {
        let value = 0;

        switch (density) {
            case Density.SINGLE:
                // Clock, zero, data, zero for each bit, most significant first.
                for (let bit = 0; bit < 8; bit++) {
                    value = (value << 1) | this.getCell(index + bit*4 + 2);
                }
                break;

            case Density.DOUBLE:
                // Alternating clock and data, starting with clock.
                for (let bit = 0; bit < 8; bit++) {
                    value = (value << 1) | this.getCell(index + bit*2 + 1);
                }
                break;

            default:
                assertNever(density);
        }

        return value;
    }

    /**
     * Read the 16 cells starting at the given index as a number, with the first cell being
     * the most significant bit.
     */
    public readWord(index: number): number {
        let value = 0;

        for (let i = 0; i < 16; i++) {
            value = (value << 1) | this.getCell(index + i);
        }

        return value;
    }

    /**
     * Find all the address marks in the stream, in cell order. Both densities are searched
     * for at every cell offset, so that density is decided per sector, not per track.
     */
    public findMarks(): HfeMark[] {
        const length = this.length;
        const marks: HfeMark[] = [];
        if (length < MIN_STREAM_CELLS) {
            return marks;
        }

        // Slide a 32-cell window over the stream. Record where each position starts an MFM
        // sync byte and an FM mark.
        const isSync = new Uint8Array(length);
        const fmMark = new Uint8Array(length);
        let window = 0;
        for (let i = 0; i < 32; i++) {
            window = ((window << 1) | this.getCell(i)) >>> 0;
        }
        for (let start = 0; start < length; start++) {
            if (window >>> 16 === MFM_SYNC_CELLS) {
                isSync[start] = 1;
            }
            fmMark[start] = FM_MARK_CELLS_TO_BYTE.get(window) ?? 0;
            window = ((window << 1) | this.getCell(start + 32)) >>> 0;
        }

        for (let start = 0; start < length; start++) {
            const fmMarkByte = fmMark[start];
            if (fmMarkByte !== 0) {
                marks.push(new HfeMark(start, start + FM_CELLS_PER_BYTE, Density.SINGLE, fmMarkByte));
            }

            // Three sync bytes, then the mark.
            let syncCount = 0;
            while (syncCount < MFM_SYNC_COUNT && isSync[(start + syncCount*MFM_CELLS_PER_BYTE) % length] === 1) {
                syncCount++;
            }
            if (syncCount === MFM_SYNC_COUNT) {
                const markStart = start + MFM_SYNC_COUNT*MFM_CELLS_PER_BYTE;
                const mark = this.readByte(markStart, Density.DOUBLE);
                if (mark === ID_ADDRESS_MARK || isDataAddressMark(mark)) {
                    marks.push(new HfeMark(start, markStart + MFM_CELLS_PER_BYTE, Density.DOUBLE, mark));
                }
            }
        }

        return marks;
    }
}

/**
 * The number of cells in an encoded byte of the given density.
 */
function cellsPerByte(density: Density): number {
    switch (density) {
        case Density.SINGLE:
            return FM_CELLS_PER_BYTE;

        case Density.DOUBLE:
            return MFM_CELLS_PER_BYTE;

        default:
            assertNever(density);
    }
}

/**
 * The maximum number of bytes between an ID field and its data address mark.
 */
function maxDataMarkGap(density: Density): number {
    switch (density) {
        case Density.SINGLE:
            return FM_MAX_DATA_MARK_GAP;

        case Density.DOUBLE:
            return MFM_MAX_DATA_MARK_GAP;

        default:
            assertNever(density);
    }
}

/**
 * The number of data bytes for a sector's size code. Like DMK, we use 256 for codes we don't know.
 */
function sectorSizeFromCode(sizeCode: number): number {
    return sizeCode <= 3 ? 128 << sizeCode : 256;
}

/**
 * Compute the CRC of a sector's field: an optional prefix of sync bytes (for double density),
 * the mark, and then the field's bytes.
 */
function computeFieldCrc(density: Density, mark: number, bytes: ArrayLike<number>, length: number): number {
    let crc = CRC_PRESET;

    switch (density) {
        case Density.SINGLE:
            break;

        case Density.DOUBLE:
            for (let i = 0; i < MFM_SYNC_COUNT; i++) {
                crc = CRC_16_CCITT.update(crc, MFM_SYNC);
            }
            break;

        default:
            assertNever(density);
    }

    crc = CRC_16_CCITT.update(crc, mark);
    for (let i = 0; i < length; i++) {
        crc = CRC_16_CCITT.update(crc, bytes[i]);
    }

    return crc;
}

/**
 * Decode all the sectors on one side of one track, in the order they are on the disk.
 */
function decodeSide(stream: CellStream): HfeSector[] {
    const marks = stream.findMarks();
    const sectors: HfeSector[] = [];

    // Marks that start before this are inside the previous sector's data, and are not marks.
    let skipUntil = 0;

    // How far the last sector's data runs past the end of the stream, if it does.
    let wrapEnd = 0;
    let wrappedSector: HfeSector | undefined = undefined;

    for (let markIndex = 0; markIndex < marks.length; markIndex++) {
        const idMark = marks[markIndex];
        if (idMark.mark !== ID_ADDRESS_MARK || idMark.start < skipUntil) {
            continue;
        }

        const density = idMark.density;
        const byteCells = cellsPerByte(density);

        // The ID field.
        const idBytes: number[] = [];
        for (let i = 0; i < ID_FIELD_SIZE; i++) {
            idBytes.push(stream.readByte(idMark.end + i*byteCells, density));
        }
        const idEnd = idMark.end + ID_FIELD_SIZE*byteCells;

        // Find the data mark, which is the next one of the same density before the next ID mark,
        // within the allowed gap. The marks wrap around the end of the stream.
        let dataMark: HfeMark | undefined = undefined;
        let dataMarkOffset = 0;
        for (let i = 1; i < marks.length; i++) {
            const candidateIndex = (markIndex + i) % marks.length;
            const candidate = marks[candidateIndex];
            if (candidate.mark === ID_ADDRESS_MARK) {
                break;
            }
            const offset = candidateIndex < markIndex ? stream.length : 0;
            const candidateStart = candidate.start + offset;
            if (candidate.density !== density || candidateStart < idEnd) {
                continue;
            }
            if (candidateStart - idEnd > maxDataMarkGap(density)*byteCells) {
                break;
            }
            dataMark = candidate;
            dataMarkOffset = offset;
            break;
        }
        if (dataMark === undefined) {
            if (DEBUG) console.log(`HFE: ID at cell ${idMark.start} has no data mark`);
            continue;
        }

        // The data field, plus two bytes of CRC.
        const sizeCode = idBytes[3];
        const size = sectorSizeFromCode(sizeCode);
        const dataBegin = dataMark.end + dataMarkOffset;
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = stream.readByte(dataBegin + i*byteCells, density);
        }
        const dataCrcHigh = stream.readByte(dataBegin + size*byteCells, density);
        const dataCrcLow = stream.readByte(dataBegin + (size + 1)*byteCells, density);
        const dataEnd = dataBegin + (size + 2)*byteCells;

        const idCrc = new CrcInfo(word(idBytes[4], idBytes[5]),
            computeFieldCrc(density, ID_ADDRESS_MARK, idBytes, 4));
        const dataCrc = new CrcInfo(word(dataCrcHigh, dataCrcLow),
            computeFieldCrc(density, dataMark.mark, data, size));

        const sector = new HfeSector(idMark.start, density, idBytes[0], idBytes[1], idBytes[2], sizeCode,
            dataMark.mark, data, idCrc, dataCrc);
        sectors.push(sector);

        // Ignore anything that looks like a mark inside this sector's data. MFM data can
        // contain bytes that look exactly like an FM address mark.
        skipUntil = dataEnd;
        if (dataEnd > stream.length) {
            // All the remaining marks are inside this sector.
            wrapEnd = dataEnd - stream.length;
            wrappedSector = sector;
            break;
        }
    }

    if (wrapEnd > 0) {
        // The sector's data continued past the end of the stream, into the start, where we
        // already looked for sectors. Drop any that were actually inside the data.
        return sectors.filter(sector => sector === wrappedSector || sector.start >= wrapEnd);
    }

    return sectors;
}

/**
 * Add the annotations for the file header and the track list.
 */
function annotateHeader(binary: Uint8Array, annotations: ProgramAnnotation[], trackCount: number,
                        trackListOffset: number): void {

    const encodings = ["ISO MFM", "Amiga MFM", "ISO FM", "Emu FM"];
    const interfaceModes = ["IBM PC DD", "IBM PC HD", "Atari ST DD", "Atari ST HD", "Amiga DD", "Amiga HD",
        "CPC DD", "Generic Shugart DD", "IBM PC ED", "MSX2 DD", "C64 DD", "Emu Shugart", "S950 DD", "S950 HD"];

    annotations.push(new ProgramAnnotation("Signature", 0, 8));
    annotations.push(new ProgramAnnotation("Format revision " + binary[8], 8, 9));
    annotations.push(new ProgramAnnotation(trackCount + " tracks", 9, 10));
    annotations.push(new ProgramAnnotation(binary[10] + " sides", 10, 11));
    annotations.push(new ProgramAnnotation("Encoding: " + (encodings[binary[11]] ?? "unknown"), 11, 12));
    annotations.push(new ProgramAnnotation("Bit rate: " + word(binary[13], binary[12]) + " kbps", 12, 14));
    annotations.push(new ProgramAnnotation("RPM: " + word(binary[15], binary[14]), 14, 16));
    annotations.push(new ProgramAnnotation("Interface mode: " + (interfaceModes[binary[16]] ?? "unknown"), 16, 17));
    annotations.push(new ProgramAnnotation("Unused", 17, 18));
    annotations.push(new ProgramAnnotation("Track list at block " + trackListOffset, 18, 20));
    annotations.push(new ProgramAnnotation(binary[20] === 0xFF ? "Write allowed" : "Write protected", 20, 21));
    annotations.push(new ProgramAnnotation(binary[21] === 0xFF ? "Single step" : "Double step", 21, 22));
    annotations.push(new ProgramAnnotation("Alternate track 0 encoding, side 0", 22, 24));
    annotations.push(new ProgramAnnotation("Alternate track 0 encoding, side 1", 24, 26));

    const trackListBegin = trackListOffset*BLOCK_SIZE;
    for (let track = 0; track < trackCount; track++) {
        const begin = trackListBegin + track*4;
        const offset = word(binary[begin + 1], binary[begin]);
        const length = word(binary[begin + 3], binary[begin + 2]);
        const annotation = new ProgramAnnotation(`Track ${track}: block ${offset}, ${length} bytes`,
            begin, begin + 4);
        annotation.nestedAnnotations.push(new ProgramAnnotation("Block offset " + offset, begin, begin + 2));
        annotation.nestedAnnotations.push(new ProgramAnnotation("Length " + length + " bytes", begin + 2, begin + 4));
        annotations.push(annotation);
    }
}

/**
 * Extract one side's cell stream from a track, or undefined if the track runs off the end
 * of the file. Each side gets half of the track's length. The sides are interleaved in
 * 512-byte blocks, 256 bytes of side 0 and then 256 bytes of side 1.
 */
function extractSide(binary: Uint8Array, offsetBlocks: number, trackLength: number, side: number): Uint8Array | undefined {
    const sideLength = Math.floor(trackLength/2);
    const stream = new Uint8Array(sideLength);
    const begin = offsetBlocks*BLOCK_SIZE;

    if (sideLength > 0) {
        const lastIndex = begin + Math.floor((sideLength - 1)/SIDE_BLOCK_SIZE)*BLOCK_SIZE +
            side*SIDE_BLOCK_SIZE + (sideLength - 1)%SIDE_BLOCK_SIZE;
        if (lastIndex >= binary.length) {
            return undefined;
        }
    }

    for (let i = 0; i < sideLength; i++) {
        stream[i] = binary[begin + Math.floor(i/SIDE_BLOCK_SIZE)*BLOCK_SIZE + side*SIDE_BLOCK_SIZE +
            i%SIDE_BLOCK_SIZE];
    }

    return stream;
}

/**
 * Decode an HFE (HxC Floppy Emulator) version 1 file.
 *
 * @param options how strict to be; see FloppyDecodeOptions.
 */
export function decodeHfeFloppyDisk(binary: Uint8Array, options: FloppyDecodeOptions): HfeFloppyDisk | undefined {
    if (binary.length < BLOCK_SIZE) {
        // File too short, doesn't even have a header.
        if (DEBUG) console.log("HFE: file missing header");
        return undefined;
    }

    // Parse header. Version 3 has a different stream format.
    if (matchesAscii(binary, 0, HFE_V3_MAGIC)) {
        if (DEBUG) console.log("HFE: version 3 is not supported");
        return undefined;
    }
    if (!matchesAscii(binary, 0, HFE_V1_MAGIC)) {
        if (DEBUG) console.log("HFE: missing file magic number");
        return undefined;
    }

    const formatRevision = binary[8];
    if (formatRevision !== 0) {
        if (DEBUG) console.log("HFE: unknown format revision " + formatRevision);
        return undefined;
    }

    // The header's encoding, bit rate, and RPM are wrong on some files, and we don't need them.
    // We also don't believe the track and side counts beyond how much to read: the geometry
    // comes from the sectors we find.
    const trackCount = binary[9];
    const sideCount = binary[10];
    if (sideCount < 1 || sideCount > 2) {
        if (DEBUG) console.log("HFE: bad side count " + sideCount);
        return undefined;
    }
    const trackListOffset = word(binary[19], binary[18]);
    const trackListBegin = trackListOffset*BLOCK_SIZE;
    if (trackListBegin + trackCount*4 > binary.length) {
        if (DEBUG) console.log("HFE: track list runs off the end of the file");
        return undefined;
    }

    const annotations: ProgramAnnotation[] = [];
    annotateHeader(binary, annotations, trackCount, trackListOffset);

    // Read the tracks.
    const tracks: HfeTrack[] = [];
    for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
        const entry = trackListBegin + trackIndex*4;
        const offsetBlocks = word(binary[entry + 1], binary[entry]);
        const trackLength = word(binary[entry + 3], binary[entry + 2]);

        for (let side = 0; side < sideCount; side++) {
            const sideBytes = extractSide(binary, offsetBlocks, trackLength, side);
            if (sideBytes === undefined) {
                if (DEBUG) console.log(`HFE: track ${trackIndex} runs off the end of the file`);
                continue;
            }

            const sectors = decodeSide(new CellStream(sideBytes));
            if (sectors.length > 0) {
                tracks.push(new HfeTrack(new TrackPosition(trackIndex, side), sectors));
            }
        }
    }

    const floppyDisk = new HfeFloppyDisk(binary, undefined, annotations, tracks);
    const geometryValid = floppyDisk.computeGeometry();
    if (!geometryValid) {
        if (DEBUG) console.log("HFE: No sectors");
        return undefined;
    }
    if (options.requireBootTrack && floppyDisk.getGeometry().bootTrack === undefined) {
        if (DEBUG) console.log("HFE: No sectors on cylinder 0 side 0");
        return undefined;
    }

    return floppyDisk;
}
