/**
 * Raw flux format from SuperCard Pro.
 *
 * https://www.cbmstuff.com/downloads/scp/scp_image_specs.txt
 */

import {
    CrcInfo,
    Density,
    FloppyDisk,
    FloppyDiskGeometry,
    SectorCrc,
    SectorData,
    Side,
    TrackGeometryBuilder
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {CRC_16_CCITT} from "./Crc16.js";

// Print extra debug stuff.
const DEBUG = false;
const DEBUG_VERBOSE = false;

// Which REV to read.
const DEFAULT_REV_NUMBER = 0;

// Bit rate on floppy. I think this is a constant on all TRS-80 floppies.
const BITRATE = 250000;

/**
 * Data for a sector on a SCP floppy.
 */
export class ScpSector {
    public readonly binary: Uint8Array;
    public readonly idamIndex: number;
    public readonly damIndex: number;
    public readonly density: Density;
    private idCrcError: boolean | undefined = undefined;
    private dataCrcError: boolean | undefined = undefined;

    constructor(binary: Uint8Array, idamIndex: number, damIndex: number, density: Density) {
        this.binary = binary;
        this.idamIndex = idamIndex;
        this.damIndex = damIndex;
        this.density = density;
    }

    public getTrackNumber(): number {
        return this.binary[this.idamIndex + 1];
    }

    public getSideNumber(): number {
        return this.binary[this.idamIndex + 2];
    }

    public getSectorNumber(): number {
        return this.binary[this.idamIndex + 3];
    }

    public getLength(): number {
        return 128 << this.binary[this.idamIndex + 4];
    }

    public getDensity(): Density {
        return this.density;
    }

    public isDeleted(): boolean {
        return this.binary[this.damIndex] === 0xF8;
    }

    /**
     * Get the CRC for the IDAM.
     */
    public getIdamCrc(): number {
        // Big endian.
        return (this.binary[this.idamIndex + 5] << 8) | this.binary[this.idamIndex + 6];
    }

    /**
     * Compute the CRC for the IDAM.
     */
    public computeIdamCrc(): number {
        let crc = 0xFFFF;

        // For double density, include the three 0xA1 bytes preceding the IDAM.
        const begin = this.getDensity() === Density.DOUBLE ? -3 : 0;

        for (let i = begin; i < 5; i++) {
            crc = CRC_16_CCITT.update(crc, this.binary[this.idamIndex + i]);
        }

        return crc;
    }

    /**
     * Get the CRC for the data bytes.
     */
    public getDataCrc(): number {
        // Big endian.
        const index = this.damIndex + 1 + this.getLength();
        return (this.binary[index] << 8) + this.binary[index + 1];
    }

    /**
     * Compute the CRC for the data bytes.
     */
    public computeDataCrc(): number {
        let crc = 0xFFFF;

        const index = this.damIndex + 1;
        // For double density, include the preceding three 0xA1 bytes.
        const begin = this.getDensity() === Density.DOUBLE ? index - 4 : index - 1;
        const end = index + this.getLength();
        for (let i = begin; i < end; i++) {
            crc = CRC_16_CCITT.update(crc, this.binary[i]);
        }

        return crc;
    }

    /**
     * Whether this sector has a CRC error in the ID.
     */
    public hasIdCrcError(): boolean {
        if (this.idCrcError === undefined) {
            this.idCrcError = this.getIdamCrc() !== this.computeIdamCrc();
        }

        return this.idCrcError;
    }

    /**
     * Whether this sector has a CRC error in the data.
     */
    public hasDataCrcError(): boolean {
        if (this.dataCrcError === undefined) {
            this.dataCrcError = this.getDataCrc() !== this.computeDataCrc();
        }

        return this.dataCrcError;
    }

    /**
     * Whether this sector has a CRC error in either the ID or data.
     */
    public hasCrcError(): boolean {
        return this.hasIdCrcError() || this.hasDataCrcError();
    }

    public getData(): Uint8Array {
        return this.binary.subarray(this.damIndex + 1, this.damIndex + 1 + this.getLength());
    }
}

/**
 * Data for one revolution sample.
 */
export class ScpRev {
    public readonly bitcells: Uint16Array;
    public readonly binary: Uint8Array;
    public readonly bytes: ClockedData[];
    public readonly sectors: ScpSector[];

    constructor(bitcells: Uint16Array, binary: Uint8Array, bytes: ClockedData[], sectors: ScpSector[]) {
        this.bitcells = bitcells;
        this.binary = binary;
        this.bytes = bytes;
        this.sectors = sectors;
    }

    /**
     * Get the track number of this revolution from the sectors' data.
     */
    public getTrackNumber(): number | undefined {
        let trackNumber: number | undefined = undefined;

        for (const sector of this.sectors) {
            const sectorTrackNumber = sector.getTrackNumber();
            if (trackNumber === undefined) {
                trackNumber = sectorTrackNumber;
            } else if (trackNumber !== sectorTrackNumber) {
                if (DEBUG) console.log(`sector has inconsistent track number ${trackNumber} vs ${sectorTrackNumber}`);
                break;
            }
        }

        return trackNumber;
    }

    /**
     * Get a sector by sector number, or undefined if not found.
     */
    public getSector(sectorNumber: number): ScpSector | undefined {
        for (const sector of this.sectors) {
            if (sector.getSectorNumber() === sectorNumber) {
                return sector;
            }
        }

        return undefined;
    }
}

/**
 * Everything we know about a track on an SCP disk.
 */
export class ScpTrack {
    // Offset of start of track into binary.
    public readonly offset: number;
    public readonly trackNumber: number;
    public readonly side: Side;
    public readonly revs: ScpRev[];

    constructor(offset: number, trackNumber: number, side: Side, revs: ScpRev[]) {
        this.offset = offset;
        this.trackNumber = trackNumber;
        this.side = side;
        this.revs = revs;
    }
}

/**
 * Entire SCP floppy.
 */
export class ScpFloppyDisk extends FloppyDisk {
    readonly className = "ScpFloppyDisk";
    private geometry: FloppyDiskGeometry | undefined = undefined;
    public readonly tracks: ScpTrack[];
    public readonly resolutionTimeNs: number;

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                supportsDoubleDensity: boolean, tracks: ScpTrack[], resolutionTimeNs: number) {

        super(binary, error, annotations, supportsDoubleDensity);
        this.tracks = tracks;
        this.resolutionTimeNs = resolutionTimeNs;
    }

    getDescription(): string {
        return "Floppy disk (SCP)";
    }

    getGeometry(): FloppyDiskGeometry {
        if (this.geometry === undefined) {
            const firstTrackBuilder = new TrackGeometryBuilder();
            const lastTrackBuilder = new TrackGeometryBuilder();

            // First compute track span.
            let firstTrack = 999;
            let lastTrack = 0;
            for (const track of this.tracks) {
                firstTrack = Math.min(firstTrack, track.trackNumber);
                lastTrack = Math.max(lastTrack, track.trackNumber);
            }

            // Then other geometry.
            for (const track of this.tracks) {
                const builder = track.trackNumber === firstTrack ? firstTrackBuilder : lastTrackBuilder;
                builder.updateSide(track.side);
                for (const sector of track.revs[DEFAULT_REV_NUMBER].sectors) {
                    builder.updateSector(sector.getSectorNumber());
                    builder.updateSectorSize(sector.getLength());
                    builder.updateDensity(sector.getDensity());
                }
            }

            this.geometry = new FloppyDiskGeometry(
                firstTrackBuilder.build(firstTrack),
                lastTrackBuilder.build(lastTrack));
        }

        return this.geometry;
    }

    readSector(trackNumber: number, side: Side, sectorNumber: number | undefined): SectorData | undefined {
        for (const track of this.tracks) {
            if (track.trackNumber === trackNumber && track.side === side) {
                const rev = track.revs[DEFAULT_REV_NUMBER];

                for (const sector of rev.sectors) {
                    if (sectorNumber === undefined || sector.getSectorNumber() === sectorNumber) {
                        const sectorData = new SectorData(sector.getData(), sector.getDensity());
                        sectorData.crc = new SectorCrc(
                            new CrcInfo(sector.getIdamCrc(), sector.computeIdamCrc()),
                            new CrcInfo(sector.getDataCrc(), sector.computeDataCrc()));
                        sectorData.crcError = !sectorData.crc.valid();
                        sectorData.deleted = sector.isDeleted();
                        return sectorData;
                    }
                }

                break;
            }
        }

        return undefined;
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
 * Compute a simple 32-bit checksum of a range of an array.
 */
function computeChecksum32(binary: Uint8Array, begin: number, end: number): number {
    let checksum = 0;

    for (let i = begin; i < end; i++) {
        checksum = (checksum + binary[i]) & 0xFFFFFFFF;
    }

    return checksum;
}

/**
 * Parse a little-endian integer from a binary array.
 */
function parseInteger(binary: Uint8Array, begin: number, byteCount: number): number {
    let value = 0;

    if (byteCount > 4) {
        // JavaScript only handles bit operations on 32-bit numbers.
        throw new Error("Cannot parse numbers larger than 32 bits");
    }

    for (let i = 0; i < byteCount; i++) {
        value = (value << 8) | binary[begin + byteCount - 1 - i];
    }

    return value;
}

/**
 * Guess the density based on the histogram of bitcells, or undefined if it can't be determined.
 */
function guessDensity(bitcells: Uint16Array, resolutionTimeNs: number): Density | undefined {
    const interval = 1e9/BITRATE/resolutionTimeNs/2;

    // Single density will have spikes at interval*2 and interval*4.
    // Double density will have spikes at interval*2, 3, and 4.

    const counts = new Array<number>(6).fill(0);
    for (const bitcell of bitcells) {
        const count = Math.min(Math.round(bitcell/interval), counts.length - 1);
        counts[count] += 1;
    }

    // TODO this is really hard to guess. Arno's had values above 1000 for unwanted bins.
    const min = 100; // bitcells.length/100;
    const high = counts.map(count => count > min);

    if (high[0] || high[1] || !high[2] || !high[4] || high.slice(5).indexOf(true) >= 0) {
        if (DEBUG) console.log("SCP: Can't guess rev density", counts, high);
        return undefined;
    }

    return high[3] ? Density.DOUBLE : Density.SINGLE;
}

/**
 * A byte with its eight clock bits.
 */
type ClockedData = {
    clock: number,
    data: number,

    // Index of the last bit of the byte.
    bitcellIndex: number,
}

/**
 * Decode a sequence of flux transitions into byts with their clock bits.
 */
function decodeFlux(bitcells: Uint16Array, density: Density, resolutionTimeNs: number): ClockedData[] {
    let interval = 1e9/BITRATE/resolutionTimeNs;
    if (density === Density.DOUBLE) {
        // Double density is ... twice as dense.
        interval /= 2;
    }

    let data = 0;
    let clock = 0;
    let recent = 0;
    let nextBitIsClock = true;
    let bitCount: number | undefined = undefined;
    const bytes: ClockedData[] = [];

    /**
     * Update the clock bit for MFM. Essentially make it look like FM.
     */
    function updateClock() {
        const dataBit = data & 0x01;
        const clockBit = clock & 0x01;
        const previousDataBit = (data >> 1) & 0x01;

        if (clockBit === 0 && dataBit === 0) {
            clock = (clock & 0xFE) | previousDataBit;
            if (previousDataBit === 0) {
                if (DEBUG_VERBOSE) console.log("MISSING CLOCK BIT");
            }
        } else if (clockBit === 0 && dataBit === 1) {
            // Legit 1.
            clock |= 1;
        } else if (clockBit === 1 && dataBit === 0) {
            if (previousDataBit === 1) {
                if (DEBUG_VERBOSE) console.log("ERROR: 1/0 can't happen");
            }
        } else if (clockBit === 1 && dataBit === 1) {
            if (DEBUG_VERBOSE) console.log("ERROR: 1/1 can't happen");
        }
    }

    /**
     * Inject a clock or data bit into the stream.
     */
    function injectBit(value: number, bitcellIndex: number): void {
        recent = (recent << 1) | value;
        if (density === Density.DOUBLE && (recent & 0x7FFF) === 0x4489) {
            // This is the 0xA1 data with the 0xFB clock.
            if (DEBUG_VERBOSE) console.log("MATCH SYNC", nextBitIsClock);
            clock = 0xFB;
            data = 0xA1;
            nextBitIsClock = true;
        } else {
            if (nextBitIsClock) {
                clock = ((clock << 1) & 0xFF) | value;
            } else {
                data = ((data << 1) & 0xFF) | value;
                if (density === Density.DOUBLE) {
                    updateClock();
                }
            }
            nextBitIsClock = !nextBitIsClock;
        }

        // Re-sync clock and data on FM.
        if (density === Density.SINGLE && data === 0xFF && clock === 0x00 && value === 1) {
            nextBitIsClock = false;
        }

        // Look for sync bytes.
        if (density === Density.DOUBLE) {
            if (clock === 0xFB && data === 0xA1) {
                // bytes.push({clock, data});
                bitCount = 15;
                if (DEBUG_VERBOSE) console.log("Got address mark: " + data.toString(16).padStart(2, "0"));
            }
        } else {
            if (clock === 0xC7 && (data === 0xFE || (data >= 0xF8 && data <= 0xFB))) {
                // bytes.push({clock, data});
                bitCount = 15;
                if (DEBUG_VERBOSE) console.log("Got address mark: " + data.toString(16).padStart(2, "0"));
            }
        }

        // Catch new bytes.
        if (bitCount !== undefined) {
            bitCount += 1;
            if (bitCount === 16) {
                // console.log("Got byte: " + data.toString(16).padStart(2, "0"));
                bytes.push({clock, data, bitcellIndex});
                bitCount = 0;
            }
        }

        if (false) {
            const binClock = clock.toString(2).padStart(8, "0");
            const binData = data.toString(2).padStart(8, "0");
            console.log(
                binClock.substring(0, 4) + "." + binClock.substring(4),
                binData.substring(0, 4) + "." + binData.substring(4),
                clock.toString(16).padStart(2, "0").toUpperCase(),
                data.toString(16).padStart(2, "0").toUpperCase(),
                bitCount, nextBitIsClock ? "is data" : "is clock", value);
        }
    }

    // Keep track of how much we're over from where we'd expect. This simulates a PLL so that if one bitcell
    // is too long, we'll expect the next one a bit sooner.
    let over = 0;

    // Handle pulses.
    for (let bitcellIndex = 0; bitcellIndex < bitcells.length; bitcellIndex++) {
        const oldOver = over;
        const bitcell = over + bitcells[bitcellIndex];
        const len = Math.round(bitcell / interval);
        over = bitcell - len*interval;
        over = Math.round(over * 0.60);
        // console.log(oldOver + " + " + bitcells[bitcellIndex] + " = " + bitcell + ", len = " + len + ", over = " + over);

        // Skip too-short pulses.
        if (len > 0) {
            // Missing pulses are zeros.
            for (let i = 0; i < len - 1; i++) {
                injectBit(0, bitcellIndex);
            }
            injectBit(1, bitcellIndex);
        }
    }

    return bytes;
}

/**
 * Parse one revolution of a track.
 */
function parseRev(binary: Uint8Array, revOffset: number, numBitcells: number, resolutionTimeNs: number, rev: number, trackNumber: number): ScpRev | undefined {
    if (revOffset + numBitcells*2 > binary.length) {
        if (DEBUG) console.log("SCP: Rev runs off the end of the binary");
        return undefined;
    }

    // Decode the pulse lengths.
    const bitcells = new Uint16Array(numBitcells);
    for (let i = 0; i < numBitcells; i++) {
        // Big endian.
        bitcells[i] = (binary[revOffset + i * 2] << 8) | binary[revOffset + i * 2 + 1];
    }

    // See if we can guess the density from the distribution of pulse widths.
    const density = guessDensity(bitcells, resolutionTimeNs);
    if (density === undefined) {
        return undefined;
    }

    // Decode the whole track into bytes.
    const bytes = decodeFlux(bitcells, density, resolutionTimeNs);
    const trackBinary = new Uint8Array(bytes.map(e => e.data));

    // Decode the sectors.
    const sectors: ScpSector[] = [];
    let idamIndex: number | undefined = undefined;
    for (let i = 0; i < bytes.length; i++) {
        const {clock, data} = bytes[i];

        switch (density) {
            case Density.SINGLE:
                if (clock === 0xC7 && data === 0xFE) {
                    idamIndex = i;
                }
                if (clock === 0xC7 && (data >= 0xF8 && data <= 0xFB)) {
                    if (idamIndex !== undefined) {
                        sectors.push(new ScpSector(trackBinary, idamIndex, i, density));
                    }

                    idamIndex = undefined;
                }
                break;

            case Density.DOUBLE:
                if (clock === 0xFB && data === 0xA1) {
                    const nextData = bytes[i + 1].data;
                    if (nextData === 0xFE) {
                        idamIndex = i + 1;
                    }
                    if (nextData >= 0xF8 && nextData <= 0xFB) {
                        if (idamIndex !== undefined) {
                            sectors.push(new ScpSector(trackBinary, idamIndex, i + 1, density));

                            // TODO temporary code to detect bad clocks. Remove.
                            for (let j = 0; j < 256; j++) {
                                const clockedDatum = bytes[i + 1 + j];
                                if (clockedDatum.clock !== 0xFF) {
                                    console.log("Bad clock at index " + j + " of sector", rev, trackNumber);
                                    let interval = 1e9/BITRATE/resolutionTimeNs;
                                    if (density === Density.DOUBLE) {
                                        // Double density is ... twice as dense.
                                        interval /= 2;
                                    }
                                    for (let k = Math.max(0, clockedDatum.bitcellIndex - 20);
                                             k < clockedDatum.bitcellIndex + 20; k++) {

                                        const bitcell = bitcells[k];
                                        const len = Math.round(bitcell / interval);
                                        const delta = bitcell - len * interval;
                                        console.log("    " + bitcell + " " + len + " " + delta + (k === clockedDatum.bitcellIndex ? " *" : ""));
                                    }
                                    break;
                                }
                            }
                        }

                        idamIndex = undefined;
                    }
                }
                break;
        }
    }

    return new ScpRev(bitcells, trackBinary, bytes, sectors);
}

/**
 * Parse an SCP track at the given offset.
 */
function parseScpTrack(binary: Uint8Array, trackOffset: number, numRevolutions: number, resolutionTimeNs: number): ScpTrack | undefined {
    if (!matchesAscii(binary, trackOffset, "TRK")) {
        if (DEBUG) console.log("SCP: missing track magic number");
        return undefined;
    }

    // Number of the track.
    const scpTrackNumber = binary[trackOffset + 3];
    const trackNumber = Math.floor(scpTrackNumber / 2);
    const side = scpTrackNumber % 2 === 0 ? Side.FRONT : Side.BACK;

    let offset = trackOffset + 4;
    const revs: ScpRev[] = [];
    for (let rev = 0; rev < numRevolutions; rev++) {
        const revDurationNs = parseInteger(binary, offset, 4)*25; // Always 25, not resolutionTimeNs.
        offset += 4;
        const numBitcells = parseInteger(binary, offset, 4);
        offset += 4;
        const revOffset = parseInteger(binary, offset, 4) + trackOffset;
        offset += 4;

        // console.log(scpTrackNumber, revDurationNs, 60e9/revDurationNs, numBitcells, revOffset);

        const scpRev = parseRev(binary, revOffset, numBitcells, resolutionTimeNs, rev, trackNumber);
        if (scpRev === undefined) {
            if (DEBUG) console.log("SCP: Can't parse rev " + rev + " for track " + scpTrackNumber);
            return undefined;
        }
        revs.push(scpRev);
    }

    return new ScpTrack(trackOffset, trackNumber, side, revs);
}

/**
 * Decode a SuperCard Pro (.SCP) file.
 */
export function decodeScpFloppyDisk(binary: Uint8Array): ScpFloppyDisk | undefined {
    if (binary.length < 16) {
        // File too short, doesn't even have a header.
        if (DEBUG) console.log("SCP: file missing header");
        return undefined;
    }

    // Parse header.
    if (!matchesAscii(binary, 0, "SCP")) {
        // Missing magic number.
        if (DEBUG) console.log("SCP: missing file magic number");
        return undefined;
    }

    // Nibble major/minor version. We ignore this.
    const version = binary[3];

    // Nibble manufacturer/machine disk type. We ignore this.
    const diskType = binary[4];

    // Number of times each track was recorded.
    const numRevolutions = binary[5];

    // First and last track number.
    const firstTrack = binary[6];
    const lastTrack = binary[7];

    // Bitflags.
    const flags = binary[8];
    if (flags !== 0x03) {
        throw new Error("Don't handle SCP flags other than 0x03 currently");
    }

    // Number of bits used by each pulse. Zero means 16.
    const bitCellTimeWidth = binary[9];
    if (bitCellTimeWidth !== 0) {
        throw new Error("Don't handle SCP bit cell time width other than zero");
    }

    // Number of heads. 0 = both, 1 = bottom, 2 = top.
    const headNumbers = binary[10];

    // Timing resolution.
    const resolutionTimeNs = (binary[11] + 1)*25;

    // Checksum of rest of file.
    const expectedChecksum = parseInteger(binary, 12, 4);
    const actualChecksum = computeChecksum32(binary, 16, binary.length);
    if (expectedChecksum !== actualChecksum) {
        if (DEBUG) console.log(`SCP: checksum fail (${expectedChecksum} vs ${actualChecksum})`);
        return undefined;
    }

    // Parse tracks.
    const tracks: ScpTrack[] = [];
    for (let trackNumber = firstTrack, trackIndex = 0; trackNumber <= lastTrack; trackNumber++, trackIndex++) {
        const offset = parseInteger(binary, 16 + trackIndex*4, 4);
        if (offset !== 0) {
            const track = parseScpTrack(binary, offset, numRevolutions, resolutionTimeNs);
            if (track === undefined) {
                if (DEBUG) console.log("SCP: Cannot parse track " + trackNumber);
            } else {
                tracks.push(track);
            }
        }
    }

    return new ScpFloppyDisk(binary, undefined, [], true, tracks, resolutionTimeNs);
}
