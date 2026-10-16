/**
 * Raw flux format from SuperCard Pro.
 *
 * https://www.cbmstuff.com/downloads/scp/scp_image_specs.txt
 */

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
import {CRC_16_CCITT} from "./Crc16.js";
import {
    CRC_PRESET,
    DELETED_DATA_ADDRESS_MARK,
    ID_ADDRESS_MARK,
    isDataAddressMark,
    MFM_SYNC,
    MFM_SYNC_COUNT,
} from "./TrackBytes.js";

// Print extra debug stuff.
const DEBUG = false;
const DEBUG_VERBOSE = false;

// Which REV to read.
const DEFAULT_REV_NUMBER = 0;

// Bit rate on floppy. I think this is a constant on all TRS-80 floppies.
const BITRATE = 250000;

// The MFM sync byte (0xA1 with a missing clock bit) as it appears in the raw bit stream.
const MFM_SYNC_BITS = 0x4489;

// The clock of an MFM sync byte, once updateClock() makes it look like FM.
const MFM_SYNC_CLOCK = 0xFB;

// The clock of an FM address mark, which is missing some bits.
const FM_MARK_CLOCK = 0xC7;

// The clock of ordinary data, with every bit present.
const DATA_CLOCK = 0xFF;

/**
 * Data for a sector on a SCP floppy.
 */
class ScpSector {
    public readonly binary: Uint8Array;
    public readonly idamIndex: number;
    public readonly damIndex: number;
    public readonly density: Density;

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
        return this.getDam() === DELETED_DATA_ADDRESS_MARK;
    }

    /**
     * The data address mark.
     */
    public getDam(): number {
        return this.binary[this.damIndex];
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
        let crc = CRC_PRESET;

        // For double density, include the sync bytes preceding the IDAM.
        const begin = this.getDensity() === Density.DOUBLE ? -MFM_SYNC_COUNT : 0;

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
        let crc = CRC_PRESET;

        const index = this.damIndex + 1;
        // Include the DAM and, for double density, the sync bytes preceding it.
        const begin = this.getDensity() === Density.DOUBLE ? index - 1 - MFM_SYNC_COUNT : index - 1;
        const end = index + this.getLength();
        for (let i = begin; i < end; i++) {
            crc = CRC_16_CCITT.update(crc, this.binary[i]);
        }

        return crc;
    }

    public getData(): Uint8Array {
        return this.binary.subarray(this.damIndex + 1, this.damIndex + 1 + this.getLength());
    }
}

/**
 * Data for one revolution sample.
 */
class ScpRev {
    public readonly bitcells: Uint16Array;
    public readonly binary: Uint8Array;
    public readonly sectors: ScpSector[];

    constructor(bitcells: Uint16Array, binary: Uint8Array, sectors: ScpSector[]) {
        this.bitcells = bitcells;
        this.binary = binary;
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
}

/**
 * Everything we know about a track on an SCP disk.
 */
class ScpTrack {
    // Offset of start of track into binary.
    public readonly offset: number;
    public readonly trackPosition: TrackPosition;
    public readonly revs: ScpRev[];

    constructor(offset: number, trackPosition: TrackPosition, revs: ScpRev[]) {
        this.offset = offset;
        this.trackPosition = trackPosition;
        this.revs = revs;
    }
}

/**
 * Entire SCP floppy.
 */
export class ScpFloppyDisk extends FloppyDisk {
    readonly className = "ScpFloppyDisk";
    // Set by computeGeometry(), which the decoder calls.
    private geometry: FloppyDiskGeometry | undefined = undefined;
    public readonly tracks: ScpTrack[];

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                tracks: ScpTrack[]) {

        super(binary, error, annotations);
        this.tracks = tracks;
    }

    getDescription(): string {
        return "Floppy disk (SCP)";
    }

    /**
     * Compute the geometry from the tracks.
     *
     * @return whether successful, which it isn't if no track has sectors. (A disk with no sectors on
     * cylinder 0 side 0 still succeeds; the decoder checks for that.)
     */
    public computeGeometry(): boolean {
        const cylinderCount = Math.max(-1, ... this.tracks.map(track => track.trackPosition.cylinderNumber)) + 1;
        const sideCount = Math.max(-1, ... this.tracks.map(track => track.trackPosition.side)) + 1;

        // Where each sector physically is, which is what the geometry describes.
        const sectorInfos = this.tracks.flatMap(track =>
            track.revs[DEFAULT_REV_NUMBER].sectors.map(sector =>
                new SectorInfo(new SectorPosition(track.trackPosition, sector.getSectorNumber()),
                    sector.getDensity(), sector.getLength())));

        this.geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos);

        return this.geometry !== undefined;
    }

    getGeometry(): FloppyDiskGeometry {
        if (this.geometry === undefined) {
            // The decoder rejects disks whose geometry can't be computed.
            throw new Error("SCP geometry was not computed");
        }

        return this.geometry;
    }

    readSector(sectorPosition: SectorPosition): SectorData | undefined {
        for (const track of this.tracks) {
            if (track.trackPosition.equals(sectorPosition.trackPosition)) {
                const rev = track.revs[DEFAULT_REV_NUMBER];

                for (const sector of rev.sectors) {
                    if (sector.getSectorNumber() === sectorPosition.sectorNumber) {
                        // What the sector says about itself, which can differ from where it physically is.
                        const logicalSectorPosition = SectorPosition.make(sector.getTrackNumber(),
                            sector.getSideNumber(), sector.getSectorNumber());
                        const sectorData = new SectorData(sector.getData(), logicalSectorPosition,
                            sector.getDensity());
                        sectorData.crc = new SectorCrc(
                            new CrcInfo(sector.getIdamCrc(), sector.computeIdamCrc()),
                            new CrcInfo(sector.getDataCrc(), sector.computeDataCrc()));
                        sectorData.crcError = !sectorData.crc.valid();
                        sectorData.deleted = sector.isDeleted();
                        sectorData.dataAddressMark = sector.getDam();
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
        if (density === Density.DOUBLE && (recent & 0x7FFF) === MFM_SYNC_BITS) {
            if (DEBUG_VERBOSE) console.log("MATCH SYNC", nextBitIsClock);
            clock = MFM_SYNC_CLOCK;
            data = MFM_SYNC;
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
            if (clock === MFM_SYNC_CLOCK && data === MFM_SYNC) {
                // bytes.push({clock, data});
                bitCount = 15;
                if (DEBUG_VERBOSE) console.log("Got address mark: " + data.toString(16).padStart(2, "0"));
            }
        } else {
            if (clock === FM_MARK_CLOCK && (data === ID_ADDRESS_MARK || isDataAddressMark(data))) {
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
                if (clock === FM_MARK_CLOCK && data === ID_ADDRESS_MARK) {
                    idamIndex = i;
                }
                if (clock === FM_MARK_CLOCK && isDataAddressMark(data)) {
                    if (idamIndex !== undefined) {
                        sectors.push(new ScpSector(trackBinary, idamIndex, i, density));
                    }

                    idamIndex = undefined;
                }
                break;

            case Density.DOUBLE:
                if (clock === MFM_SYNC_CLOCK && data === MFM_SYNC) {
                    const nextData = bytes[i + 1].data;
                    if (nextData === ID_ADDRESS_MARK) {
                        idamIndex = i + 1;
                    }
                    if (isDataAddressMark(nextData)) {
                        if (idamIndex !== undefined) {
                            sectors.push(new ScpSector(trackBinary, idamIndex, i + 1, density));

                            // TODO temporary code to detect bad clocks. Remove.
                            for (let j = 0; j < 256; j++) {
                                const clockedDatum = bytes[i + 1 + j];
                                if (clockedDatum.clock !== DATA_CLOCK) {
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

    return new ScpRev(bitcells, trackBinary, sectors);
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
    const trackNumber = binary[trackOffset + 3];
    const cylinderNumber = Math.floor(trackNumber / 2);
    const side = trackNumber % 2;
    const trackPosition = new TrackPosition(cylinderNumber, side);

    let offset = trackOffset + 4;
    const revs: ScpRev[] = [];
    for (let rev = 0; rev < numRevolutions; rev++) {
        const revDurationNs = parseInteger(binary, offset, 4)*25; // Always 25, not resolutionTimeNs.
        offset += 4;
        const numBitcells = parseInteger(binary, offset, 4);
        offset += 4;
        const revOffset = parseInteger(binary, offset, 4) + trackOffset;
        offset += 4;

        // console.log(trackNumber, revDurationNs, 60e9/revDurationNs, numBitcells, revOffset);

        const scpRev = parseRev(binary, revOffset, numBitcells, resolutionTimeNs, rev, cylinderNumber);
        if (scpRev === undefined) {
            if (DEBUG) console.log("SCP: Can't parse rev " + rev + " for track " + trackNumber);
            return undefined;
        }
        revs.push(scpRev);
    }

    return new ScpTrack(trackOffset, trackPosition, revs);
}

/**
 * Decode a SuperCard Pro (.SCP) file.
 *
 * @param options how strict to be; see FloppyDecodeOptions.
 */
export function decodeScpFloppyDisk(binary: Uint8Array, options: FloppyDecodeOptions): ScpFloppyDisk | undefined {
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

    const floppyDisk = new ScpFloppyDisk(binary, undefined, [], tracks);
    const geometryValid = floppyDisk.computeGeometry();
    if (!geometryValid) {
        if (DEBUG) console.log("SCP: No sectors");
        return undefined;
    }
    if (options.requireBootTrack && floppyDisk.getGeometry().bootTrack === undefined) {
        if (DEBUG) console.log("SCP: No sectors on cylinder 0 side 0");
        return undefined;
    }

    return floppyDisk;
}
