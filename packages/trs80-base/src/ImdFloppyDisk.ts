/**
 * ImageDisk (IMD) floppy images, by Dave Dunfield. Like JV3, IMD is sector-level: it keeps
 * each track's data rate and density, the order that the sectors are numbered in (the
 * interleave), which sectors have a deleted data mark or a data error, and the cylinder and
 * side numbers in each sector's ID field when they differ from where the sector physically is.
 * It doesn't keep gaps, the raw ID fields, or CRC bytes. Sectors whose data is one repeated
 * byte are stored compressed. Reading only; we don't write IMD.
 *
 * Damaged files are read up to the first thing that can't be read, and the rest is ignored
 * with a warning, not an error, because an error would stop the disk from being opened at
 * all. Junk is often appended after the last track, and when the file is cut short instead,
 * the missing sectors are reported as damage to the files that use them.
 *
 * http://dunfield.classiccmp.org/img/index.htm
 * MAME's implementation: src/lib/formats/imd_dsk.cpp
 */

import {assertNever, toHexByte} from "z80-base";
import {
    Density,
    FloppyDisk,
    FloppyDecodeOptions,
    FloppyDiskGeometry,
    SectorData,
    SectorInfo,
    SectorPosition,
    TrackPosition,
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {TRS80_BASE_LOGGER} from "z80-logger";

// Print extra debug stuff.
const DEBUG = false;

// The byte that ends the ASCII header (the signature line and the user's comment).
const HEADER_END_BYTE = 0x1A;

// The fixed part of a track header: mode, cylinder, head, sector count, and size code.
const TRACK_HEADER_SIZE = 5;

// In the head byte, the flag for a cylinder map and the flag for a head map. The physical side is bit 0.
const HEAD_FLAG_CYLINDER_MAP = 0x80;
const HEAD_FLAG_HEAD_MAP = 0x40;
const HEAD_SIDE_MASK = 0x01;

// The size code that means that a table of per-sector sizes follows the maps.
const SIZE_CODE_TABLE = 0xFF;

// The largest ordinary size code (128 << 6 is 8192 bytes).
const MAX_SIZE_CODE = 6;

// The highest valid record type.
const MAX_RECORD_TYPE = 8;

/**
 * The recording mode of a track: its data rate and encoding.
 */
export enum ImdMode {
    FM_500_KBPS = 0,
    FM_300_KBPS = 1,
    FM_250_KBPS = 2,
    MFM_500_KBPS = 3,
    MFM_300_KBPS = 4,
    MFM_250_KBPS = 5,
}

/**
 * A short description of the mode, such as "500 kbps MFM".
 */
export function imdModeToString(mode: ImdMode): string {
    switch (mode) {
        case ImdMode.FM_500_KBPS: return "500 kbps FM";
        case ImdMode.FM_300_KBPS: return "300 kbps FM";
        case ImdMode.FM_250_KBPS: return "250 kbps FM";
        case ImdMode.MFM_500_KBPS: return "500 kbps MFM";
        case ImdMode.MFM_300_KBPS: return "300 kbps MFM";
        case ImdMode.MFM_250_KBPS: return "250 kbps MFM";
        default: assertNever(mode);
    }
}

/**
 * The density (encoding) of a mode. The data rate doesn't matter to us.
 */
function imdModeToDensity(mode: ImdMode): Density {
    switch (mode) {
        case ImdMode.FM_500_KBPS:
        case ImdMode.FM_300_KBPS:
        case ImdMode.FM_250_KBPS:
            return Density.SINGLE;

        case ImdMode.MFM_500_KBPS:
        case ImdMode.MFM_300_KBPS:
        case ImdMode.MFM_250_KBPS:
            return Density.DOUBLE;

        default:
            assertNever(mode);
    }
}

/**
 * Validate a mode byte from the file.
 *
 * @return the mode, or undefined if the byte isn't a mode.
 */
function imdModeFromByte(byte: number): ImdMode | undefined {
    return byte >= ImdMode.FM_500_KBPS && byte <= ImdMode.MFM_250_KBPS ? byte as ImdMode : undefined;
}

/**
 * What a sector data record's type byte says about the sector.
 */
interface RecordTypeInfo {
    // Whether the sector's data was readable at all. If not, no bytes follow the type.
    hasData: boolean;
    // Whether the whole sector is one repeated byte, which is the only byte stored.
    compressed: boolean;
    // Whether the sector had a deleted data address mark.
    deleted: boolean;
    // Whether the sector's data had a CRC error.
    dataError: boolean;
}

/**
 * Information for each record type 0 through 8, indexed by the type. This is the one place
 * that maps a type to its flags.
 */
const RECORD_TYPE_INFOS: RecordTypeInfo[] = [
    {hasData: false, compressed: false, deleted: false, dataError: false},
    {hasData: true, compressed: false, deleted: false, dataError: false},
    {hasData: true, compressed: true, deleted: false, dataError: false},
    {hasData: true, compressed: false, deleted: true, dataError: false},
    {hasData: true, compressed: true, deleted: true, dataError: false},
    {hasData: true, compressed: false, deleted: false, dataError: true},
    {hasData: true, compressed: true, deleted: false, dataError: true},
    {hasData: true, compressed: false, deleted: true, dataError: true},
    {hasData: true, compressed: true, deleted: true, dataError: true},
];

/**
 * One sector of a track, as described by the track's maps and the sector's data record.
 */
export class ImdSector {
    // The sector number from the track's numbering map, which is what the geometry uses.
    public readonly sectorNumber: number;
    // The cylinder and side in the sector's ID field: from the cylinder and head maps if
    // the track has them, otherwise the track's physical ones.
    public readonly cylinder: number;
    public readonly side: number;
    public readonly density: Density;
    // Number of data bytes in the sector, even if we don't have them.
    public readonly size: number;
    // The record's type byte, 0 to 8.
    public readonly recordType: number;
    // For a normal (not compressed) sector, the offset in the binary of its data.
    public readonly dataOffset: number | undefined;
    // For a compressed sector, the byte that fills it.
    public readonly fillByte: number | undefined;

    constructor(sectorNumber: number, cylinder: number, side: number, density: Density, size: number,
                recordType: number, dataOffset: number | undefined, fillByte: number | undefined) {

        this.sectorNumber = sectorNumber;
        this.cylinder = cylinder;
        this.side = side;
        this.density = density;
        this.size = size;
        this.recordType = recordType;
        this.dataOffset = dataOffset;
        this.fillByte = fillByte;
    }

    /**
     * Whether we have the sector's data. A sector whose data couldn't be read has only its ID.
     */
    public hasData(): boolean {
        return RECORD_TYPE_INFOS[this.recordType].hasData;
    }

    /**
     * Whether the sector's data is stored as a single repeated byte.
     */
    public isCompressed(): boolean {
        return RECORD_TYPE_INFOS[this.recordType].compressed;
    }

    /**
     * Whether the sector had a deleted data address mark.
     */
    public isDeleted(): boolean {
        return RECORD_TYPE_INFOS[this.recordType].deleted;
    }

    /**
     * Whether the sector's data had a CRC error.
     */
    public hasDataError(): boolean {
        return RECORD_TYPE_INFOS[this.recordType].dataError;
    }
}

/**
 * One side of one cylinder, with the sectors in the order they are on the disk.
 */
export class ImdTrack {
    // The physical position.
    public readonly trackPosition: TrackPosition;
    public readonly mode: ImdMode;
    public readonly sectors: ImdSector[];

    constructor(trackPosition: TrackPosition, mode: ImdMode, sectors: ImdSector[]) {
        this.trackPosition = trackPosition;
        this.mode = mode;
        this.sectors = sectors;
    }
}

/**
 * Entire IMD floppy.
 */
export class ImdFloppyDisk extends FloppyDisk {
    readonly className = "ImdFloppyDisk";
    /**
     * The header's text before the 0x1A byte: normally the "IMD 1.18: date" line and then the
     * user's comment, as Latin-1, with line endings normalized to "\n".
     */
    public readonly comment: string;
    /**
     * Why and where we stopped reading the file before its end, if we did.
     */
    public readonly ignoredData: string | undefined;
    // Set by computeGeometry(), which the decoder calls.
    private geometry: FloppyDiskGeometry | undefined = undefined;
    // Only the tracks that have sectors.
    public readonly tracks: ImdTrack[];
    // Map from the key of a physical sector position to the sector. We only include sectors with
    // data, to match the geometry. If a sector number repeats on a track, the last one wins.
    private readonly sectorMap = new Map<string,ImdSector>();

    constructor(binary: Uint8Array, annotations: ProgramAnnotation[], comment: string,
                ignoredData: string | undefined, tracks: ImdTrack[]) {

        super(binary, undefined, annotations);
        this.comment = comment;
        this.ignoredData = ignoredData;
        this.tracks = tracks;

        for (const track of tracks) {
            for (const sector of track.sectors) {
                if (sector.hasData()) {
                    this.sectorMap.set(new SectorPosition(track.trackPosition, sector.sectorNumber).key(), sector);
                }
            }
        }
    }

    getDescription(): string {
        return "Floppy disk (IMD)";
    }

    /**
     * Compute the geometry from the sectors that have data, at their physical positions.
     *
     * @return whether successful, which it isn't if no track has sectors. (A disk with no sectors on
     * cylinder 0 side 0 still succeeds; the decoder checks for that.)
     */
    public computeGeometry(): boolean {
        // Tracks that have at least one sector with data. The others don't contribute to the geometry.
        const dataTracks = this.tracks.filter(track => track.sectors.some(sector => sector.hasData()));
        const cylinderCount = Math.max(-1, ... dataTracks.map(track => track.trackPosition.cylinderNumber)) + 1;
        const sideCount = Math.max(-1, ... dataTracks.map(track => track.trackPosition.side)) + 1;

        const sectorInfos = dataTracks.flatMap(track =>
            track.sectors
                .filter(sector => sector.hasData())
                .map(sector =>
                    new SectorInfo(new SectorPosition(track.trackPosition, sector.sectorNumber),
                        sector.density, sector.size)));

        this.geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos);

        return this.geometry !== undefined;
    }

    getGeometry(): FloppyDiskGeometry {
        if (this.geometry === undefined) {
            // The decoder rejects disks whose geometry can't be computed.
            throw new Error("IMD geometry was not computed");
        }

        return this.geometry;
    }

    readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const sector = this.sectorMap.get(sectorPosition.key());
        if (sector === undefined) {
            return undefined;
        }

        let data: Uint8Array;
        if (sector.fillByte !== undefined) {
            data = new Uint8Array(sector.size).fill(sector.fillByte);
        } else if (sector.dataOffset !== undefined) {
            // Copy, so that the caller can't modify the file.
            data = this.binary.slice(sector.dataOffset, sector.dataOffset + sector.size);
        } else {
            // Not possible, because sectors without data aren't in the map.
            return undefined;
        }

        // What the sector's ID field says, which can differ from where it physically is.
        const logicalSectorPosition = SectorPosition.make(sector.cylinder, sector.side, sector.sectorNumber);
        const sectorData = new SectorData(data, logicalSectorPosition, sector.density);
        sectorData.deleted = sector.isDeleted();
        sectorData.crcError = sector.hasDataError();
        // IMD doesn't record the exact data address mark nor the CRC bytes, so leave those undefined.
        return sectorData;
    }
}

/**
 * Why we stopped reading tracks, and where.
 */
interface ImdFailure {
    // Offset in the binary of the data we couldn't read.
    offset: number;
    reason: string;
}

/**
 * The result of reading one track.
 */
interface ImdTrackResult {
    // The track, if it has any sectors (even if we only got some of them). Tracks with a
    // sector count of zero are skipped.
    track: ImdTrack | undefined;
    // Whether the track header was valid, even if the track was later cut short.
    headerValid: boolean;
    // Offset just after the last complete thing that we read.
    end: number;
    // Set if the track couldn't be completely read.
    failure: ImdFailure | undefined;
}

/**
 * Describe a sector's position for an annotation: "Cylinder 3, side 0, sector 7".
 */
function sectorDescription(cylinder: number, side: number, sectorNumber: number): string {
    return `Cylinder ${cylinder}, side ${side}, sector ${sectorNumber}`;
}

/**
 * Read one track starting at the given offset, adding annotations as we go.
 */
function readTrack(binary: Uint8Array, start: number, annotations: ProgramAnnotation[]): ImdTrackResult {
    let offset = start;

    if (offset + TRACK_HEADER_SIZE > binary.length) {
        return {
            track: undefined, headerValid: false, end: start,
            failure: {offset: start, reason: "truncated track header"},
        };
    }

    const modeByte = binary[offset];
    const cylinder = binary[offset + 1];
    const head = binary[offset + 2];
    const sectorCount = binary[offset + 3];
    const sizeCode = binary[offset + 4];

    // Check the header. Any mode is allowed on an empty track, because HxC writes odd ones there.
    const hasCylinderMap = (head & HEAD_FLAG_CYLINDER_MAP) !== 0;
    const hasHeadMap = (head & HEAD_FLAG_HEAD_MAP) !== 0;
    const hasSizeTable = sizeCode === SIZE_CODE_TABLE;
    const mode = imdModeFromByte(modeByte);
    let reason: string | undefined = undefined;
    if ((head & ~(HEAD_FLAG_CYLINDER_MAP | HEAD_FLAG_HEAD_MAP | HEAD_SIDE_MASK)) !== 0) {
        reason = "invalid head byte 0x" + toHexByte(head);
    } else if (sectorCount > 0 && mode === undefined) {
        reason = "invalid mode 0x" + toHexByte(modeByte);
    } else if (!hasSizeTable && sizeCode > MAX_SIZE_CODE) {
        reason = "invalid sector size code 0x" + toHexByte(sizeCode);
    }
    if (reason !== undefined) {
        return {track: undefined, headerValid: false, end: start, failure: {offset: start, reason}};
    }

    // The maps and the size table.
    const side = head & HEAD_SIDE_MASK;
    const headerBytesPerSector = 1 + (hasCylinderMap ? 1 : 0) + (hasHeadMap ? 1 : 0) + (hasSizeTable ? 2 : 0);
    const headerEnd = offset + TRACK_HEADER_SIZE + sectorCount*headerBytesPerSector;
    if (headerEnd > binary.length) {
        return {
            track: undefined, headerValid: false, end: start,
            failure: {offset: start, reason: "truncated track header"},
        };
    }

    const modeDescription = mode === undefined ? "mode 0x" + toHexByte(modeByte) : imdModeToString(mode);
    const sizeDescription = hasSizeTable ? "sector sizes in a table" : `sectors of ${128 << sizeCode} bytes`;
    const trackAnnotation = new ProgramAnnotation(
        `Cylinder ${cylinder}, side ${side}: ${modeDescription}, ${sectorCount} ${sectorCount === 1 ? "sector" : "sectors"}, ` +
        sizeDescription, offset, offset + TRACK_HEADER_SIZE);
    trackAnnotation.nestedAnnotations.push(new ProgramAnnotation("Mode: " + modeDescription, offset, offset + 1));
    trackAnnotation.nestedAnnotations.push(new ProgramAnnotation("Cylinder " + cylinder, offset + 1, offset + 2));
    trackAnnotation.nestedAnnotations.push(new ProgramAnnotation(
        `Side ${side}` + (hasCylinderMap ? ", cylinder map" : "") + (hasHeadMap ? ", head map" : ""),
        offset + 2, offset + 3));
    trackAnnotation.nestedAnnotations.push(new ProgramAnnotation(
        sectorCount + " " + (sectorCount === 1 ? "sector" : "sectors"), offset + 3, offset + 4));
    trackAnnotation.nestedAnnotations.push(new ProgramAnnotation(
        hasSizeTable ? "Sector sizes are in a table" : `Sector size ${128 << sizeCode} bytes`,
        offset + 4, offset + 5));
    annotations.push(trackAnnotation);
    offset += TRACK_HEADER_SIZE;

    // Read the maps.
    const readMap = (name: string): number[] => {
        const map = Array.from(binary.subarray(offset, offset + sectorCount));
        if (sectorCount > 0) {
            annotations.push(new ProgramAnnotation(name + ": " + map.join(", "), offset, offset + sectorCount));
        }
        offset += sectorCount;
        return map;
    };
    const sectorNumbers = readMap("Sector numbering map");
    const cylinderMap = hasCylinderMap ? readMap("Cylinder map") : undefined;
    const headMap = hasHeadMap ? readMap("Head map") : undefined;
    let sizes: number[] | undefined = undefined;
    if (hasSizeTable) {
        sizes = [];
        for (let i = 0; i < sectorCount; i++) {
            sizes.push(binary[offset + i*2] | (binary[offset + i*2 + 1] << 8));
        }
        annotations.push(new ProgramAnnotation("Sector size table: " + sizes.join(", "),
            offset, offset + sectorCount*2));
        offset += sectorCount*2;
    }

    if (sectorCount === 0) {
        // An empty track. Don't bother with the mode.
        return {track: undefined, headerValid: true, end: offset, failure: undefined};
    }
    if (mode === undefined) {
        // Not possible, we checked above.
        throw new Error("Mode must be valid when there are sectors");
    }

    // Read the sector records.
    const density = imdModeToDensity(mode);
    const sectors: ImdSector[] = [];
    let failure: ImdFailure | undefined = undefined;
    for (let i = 0; i < sectorCount; i++) {
        const recordStart = offset;
        if (recordStart >= binary.length) {
            failure = {offset: recordStart, reason: "sector record runs past the end of the file"};
            break;
        }

        const recordType = binary[recordStart];
        if (recordType > MAX_RECORD_TYPE) {
            failure = {offset: recordStart, reason: "invalid sector record type " + recordType};
            break;
        }

        const typeInfo = RECORD_TYPE_INFOS[recordType];
        const size = sizes !== undefined ? sizes[i] : 128 << sizeCode;
        const bodyLength = !typeInfo.hasData ? 0 : typeInfo.compressed ? 1 : size;
        const recordEnd = recordStart + 1 + bodyLength;
        if (recordEnd > binary.length) {
            failure = {offset: recordStart, reason: "sector record runs past the end of the file"};
            break;
        }

        const sectorNumber = sectorNumbers[i];
        const sectorCylinder = cylinderMap !== undefined ? cylinderMap[i] : cylinder;
        const sectorSide = headMap !== undefined ? headMap[i] : side;
        const dataOffset = typeInfo.hasData && !typeInfo.compressed ? recordStart + 1 : undefined;
        const fillByte = typeInfo.hasData && typeInfo.compressed ? binary[recordStart + 1] : undefined;
        const sector = new ImdSector(sectorNumber, sectorCylinder, sectorSide, density, size, recordType,
            dataOffset, fillByte);
        sectors.push(sector);

        // Annotate the record.
        let text = sectorDescription(cylinder, side, sectorNumber);
        if (sectorCylinder !== cylinder || sectorSide !== side) {
            text += ` (ID says cylinder ${sectorCylinder}, side ${sectorSide})`;
        }
        if (!typeInfo.hasData) {
            text += ", no data";
        }
        if (typeInfo.compressed) {
            text += `, compressed (fill 0x${toHexByte(binary[recordStart + 1])})`;
        }
        if (typeInfo.deleted) {
            text += ", deleted";
        }
        if (typeInfo.dataError) {
            text += ", data error";
        }
        const recordAnnotation = new ProgramAnnotation(text, recordStart, recordEnd);
        recordAnnotation.nestedAnnotations.push(new ProgramAnnotation("Record type " + recordType,
            recordStart, recordStart + 1));
        if (bodyLength > 0) {
            recordAnnotation.nestedAnnotations.push(new ProgramAnnotation(
                typeInfo.compressed ? "Fill byte" : size + " bytes of data", recordStart + 1, recordEnd));
        }
        annotations.push(recordAnnotation);

        offset = recordEnd;
    }

    const track = sectors.length > 0 ? new ImdTrack(new TrackPosition(cylinder, side), mode, sectors) : undefined;
    return {track, headerValid: true, end: offset, failure};
}

/**
 * Decode an ImageDisk (IMD) file. Damaged files are accepted if their good part has a boot track
 * (or any track, if the boot track isn't required): we stop reading at the first thing we can't
 * read, keep what we have, and log a warning.
 *
 * @param options how strict to be; see FloppyDecodeOptions.
 */
export function decodeImdFloppyDisk(binary: Uint8Array, options: FloppyDecodeOptions): ImdFloppyDisk | undefined {
    // The header ends with a 0x1A byte. We don't look for the "IMD " signature because some
    // files have had that line edited out.
    const headerEnd = binary.indexOf(HEADER_END_BYTE);
    if (headerEnd < 0) {
        if (DEBUG) console.log("IMD: no end of header");
        return undefined;
    }

    let comment = "";
    for (let i = 0; i < headerEnd; i++) {
        comment += String.fromCharCode(binary[i]);
    }
    comment = comment.replace(/\r\n?/g, "\n");

    const annotations: ProgramAnnotation[] = [];
    annotations.push(new ProgramAnnotation("Header comment", 0, headerEnd));
    annotations.push(new ProgramAnnotation("End of header", headerEnd, headerEnd + 1));

    // Read the tracks.
    const tracks: ImdTrack[] = [];
    let validTrackCount = 0;
    let failure: ImdFailure | undefined = undefined;
    let offset = headerEnd + 1;
    while (offset < binary.length && failure === undefined) {
        const result = readTrack(binary, offset, annotations);
        if (result.headerValid) {
            validTrackCount++;
        }
        if (result.track !== undefined) {
            tracks.push(result.track);
        }
        offset = result.end;
        failure = result.failure;
    }

    if (validTrackCount === 0) {
        if (DEBUG) console.log("IMD: no valid tracks");
        return undefined;
    }

    let ignoredData: string | undefined = undefined;
    if (failure !== undefined) {
        const ignoredCount = binary.length - failure.offset;
        ignoredData = `Unreadable data at offset ${failure.offset} (${failure.reason}); ` +
            `ignored the last ${ignoredCount} ${ignoredCount === 1 ? "byte" : "bytes"}`;
        annotations.push(new ProgramAnnotation("Ignored data", failure.offset, binary.length));
    }

    const floppyDisk = new ImdFloppyDisk(binary, annotations, comment, ignoredData, tracks);
    const geometryValid = floppyDisk.computeGeometry();
    if (!geometryValid) {
        if (DEBUG) console.log("IMD: No sectors");
        return undefined;
    }
    if (options.requireBootTrack && floppyDisk.getGeometry().bootTrack === undefined) {
        if (DEBUG) console.log("IMD: No sectors on cylinder 0 side 0");
        return undefined;
    }

    if (ignoredData !== undefined) {
        TRS80_BASE_LOGGER.warn("IMD: " + ignoredData);
    }

    return floppyDisk;
}
