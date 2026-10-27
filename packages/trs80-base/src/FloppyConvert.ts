/**
 * Converts a floppy image from one image format to another: DMK, JV1, JV3, HFE or IMD. Formats that keep
 * raw tracks (DMK and HFE) keep the bytes of the tracks, gaps and copy-protection included, when they
 * go to the other raw format, and the same format is a plain copy. Sector formats (JV1, JV3, IMD)
 * and anything going to a sector format are converted sector by sector, and a raw format made
 * from sectors gets tracks synthesized as a DOS's FORMAT would lay them out. What the new format can't
 * hold is reported by compareFloppies() in FloppyCompare.ts. See "Writing the image formats" in
 * FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {buildDmkImage, dmkTrackToStream} from "./DmkConvert.js";
import {decodeDmkFloppyDisk, DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {
    ConvertSector,
    ConvertTrack,
    DiskSize,
    guessDiskSize,
    isConvertSectorDeleted,
    readConvertTracks,
    sectorSizeToCode,
} from "./FloppyConvertModel.js";
import {Density, FloppyDisk, SectorPosition} from "./FloppyDisk.js";
import {buildHfeImage, hfeTrackToStream} from "./HfeConvert.js";
import {decodeHfeFloppyDisk, HfeFloppyDisk} from "./HfeFloppyDisk.js";
import {
    decodeImdFloppyDisk,
    ImdFloppyDisk,
    ImdMode,
    ImdSectorToWrite,
    ImdTrackToWrite,
    makeImdFloppyDisk,
} from "./ImdFloppyDisk.js";
import {
    decodeJv1FloppyDisk,
    Jv1FloppyDisk,
    Jv1SectorToWrite,
    makeJv1FloppyDisk,
} from "./Jv1FloppyDisk.js";
import {
    decodeJv3FloppyDisk,
    Jv3FloppyDisk,
    Jv3SectorToWrite,
    makeJv3FloppyDisk,
} from "./Jv3FloppyDisk.js";
import {ScpFloppyDisk} from "./ScpFloppyDisk.js";
import {synthesizeTrackStream, trackFitsDiskSize, TrackStream} from "./TrackStream.js";

/**
 * The floppy image formats that we can write.
 */
export enum FloppyImageFormat {
    DMK,
    JV1,
    JV3,
    HFE,
    IMD,
}

/**
 * Every format we can write, in the order of the enum.
 */
export const FLOPPY_IMAGE_FORMATS: readonly FloppyImageFormat[] = [
    FloppyImageFormat.DMK,
    FloppyImageFormat.JV1,
    FloppyImageFormat.JV3,
    FloppyImageFormat.HFE,
    FloppyImageFormat.IMD,
];

/**
 * The name of a format, such as "DMK".
 */
export function floppyImageFormatToString(format: FloppyImageFormat): string {
    switch (format) {
        case FloppyImageFormat.DMK: return "DMK";
        case FloppyImageFormat.JV1: return "JV1";
        case FloppyImageFormat.JV3: return "JV3";
        case FloppyImageFormat.HFE: return "HFE";
        case FloppyImageFormat.IMD: return "IMD";
        default: assertNever(format);
    }
}

/**
 * The file name extension of a format, with the dot and in lower case, such as ".dmk".
 */
export function floppyImageFormatExtension(format: FloppyImageFormat): string {
    return "." + floppyImageFormatToString(format).toLowerCase();
}

/**
 * Find the format that a file name extension names, or undefined if it names none. ".dsk" names none, because
 * it means JV1 to some programs and JV3 to others.
 *
 * @param extension the extension with its dot, in any case.
 */
export function floppyImageFormatFromExtension(extension: string): FloppyImageFormat | undefined {
    const lowerExtension = extension.toLowerCase();
    return FLOPPY_IMAGE_FORMATS.find(format => floppyImageFormatExtension(format) === lowerExtension);
}

/**
 * The format that a decoded floppy is stored in, or undefined for one that we can't write (SCP).
 */
export function floppyImageFormatOf(disk: FloppyDisk): FloppyImageFormat | undefined {
    if (disk instanceof DmkFloppyDisk) {
        return FloppyImageFormat.DMK;
    } else if (disk instanceof Jv1FloppyDisk) {
        return FloppyImageFormat.JV1;
    } else if (disk instanceof Jv3FloppyDisk) {
        return FloppyImageFormat.JV3;
    } else if (disk instanceof HfeFloppyDisk) {
        return FloppyImageFormat.HFE;
    } else if (disk instanceof ImdFloppyDisk) {
        return FloppyImageFormat.IMD;
    } else {
        return undefined;
    }
}

/**
 * Options for {@link convertFloppy}.
 */
export interface ConvertFloppyOptions {
    /**
     * The date to put in an IMD header, which defaults to now.
     */
    date?: Date | undefined;
}

/**
 * Decode an image of the given format, without requiring a boot track.
 */
function decodeImage(format: FloppyImageFormat, binary: Uint8Array): FloppyDisk | undefined {
    switch (format) {
        case FloppyImageFormat.DMK: return decodeDmkFloppyDisk(binary, {requireBootTrack: false});
        case FloppyImageFormat.JV1: return decodeJv1FloppyDisk(binary);
        case FloppyImageFormat.JV3: return decodeJv3FloppyDisk(binary, {requireBootTrack: false});
        case FloppyImageFormat.HFE: return decodeHfeFloppyDisk(binary, {requireBootTrack: false});
        case FloppyImageFormat.IMD: return decodeImdFloppyDisk(binary, {requireBootTrack: false});
        default: assertNever(format);
    }
}

/**
 * Whether the image's header says the disk is write-protected, for the formats that have such a flag.
 */
function isImageWriteProtected(disk: FloppyDisk): boolean {
    if (disk instanceof DmkFloppyDisk || disk instanceof Jv3FloppyDisk || disk instanceof HfeFloppyDisk) {
        return disk.writeProtected;
    }
    return false;
}

/**
 * Pick the size of disk to write: what the source says, or if it doesn't say, 5.25 inch unless some track
 * doesn't fit in a turn of one.
 */
function chooseDiskSize(source: FloppyDisk, tracks: ConvertTrack[]): DiskSize {
    const guess = guessDiskSize(source);
    if (guess !== undefined) {
        return guess;
    }

    const allFit = tracks.every(track => trackFitsDiskSize(track, DiskSize.FIVE_INCH));
    return allFit ? DiskSize.FIVE_INCH : DiskSize.EIGHT_INCH;
}

/**
 * The stream of every track, for the raw formats: a track of the other raw format keeps its bytes, and
 * a track from a sector format is synthesized from its sectors. A raw track with nothing but junk in its
 * ID table (noise on a track that was never formatted) has no stream and so isn't written.
 */
function makeStreams(source: FloppyDisk, tracks: ConvertTrack[], diskSize: DiskSize): Map<string,TrackStream> {
    const streams = new Map<string,TrackStream>();

    for (const track of tracks) {
        let stream: TrackStream | undefined;
        if (source instanceof DmkFloppyDisk) {
            stream = dmkTrackToStream(source, track.trackPosition);
        } else if (source instanceof HfeFloppyDisk) {
            stream = hfeTrackToStream(source, track.trackPosition);
        } else {
            stream = synthesizeTrackStream(track, diskSize).stream;
        }
        if (stream !== undefined && stream.values.length > 0) {
            streams.set(track.trackPosition.key(), stream);
        }
    }

    return streams;
}

/**
 * Whether a sector has the ID field and data that a format with no room for a missing data field or a bad ID
 * can store: its ID CRC is good and it has a data field of its full size.
 */
function hasStorableData(sector: ConvertSector): sector is ConvertSector & {data: Uint8Array} {
    return !sector.idCrcBad && sector.data !== undefined && sector.data.length === sector.size;
}

/**
 * The sectors that go in a JV1 image: single density, 256 bytes, numbered 0 to 9, on side 0, with the first
 * copy of each number kept. Returns the sectors and the number of cylinders needed.
 */
function chooseJv1Sectors(tracks: ConvertTrack[]): {sectors: Jv1SectorToWrite[], cylinderCount: number} {
    const sectors: Jv1SectorToWrite[] = [];
    const seen = new Set<string>();
    let cylinderCount = 0;

    for (const track of tracks) {
        if (track.trackPosition.side !== 0) {
            continue;
        }
        for (const sector of track.sectors) {
            const fits = hasStorableData(sector) && sector.density === Density.SINGLE && sector.size === 256 &&
                sector.sectorNumber >= 0 && sector.sectorNumber < 10;
            const position = new SectorPosition(track.trackPosition, sector.sectorNumber);
            if (fits && !seen.has(position.key())) {
                seen.add(position.key());
                sectors.push({cylinder: track.trackPosition.cylinderNumber, sectorNumber: sector.sectorNumber,
                    data: sector.data!});
                cylinderCount = Math.max(cylinderCount, track.trackPosition.cylinderNumber + 1);
            }
        }
    }

    return {sectors, cylinderCount};
}

/**
 * The sectors that go in a JV3 image, in track order: the ones with data and a good ID, in the sizes it has
 * codes for, with the first copy of each position kept.
 */
function chooseJv3Sectors(tracks: ConvertTrack[]): Jv3SectorToWrite[] {
    const sectors: Jv3SectorToWrite[] = [];
    const seen = new Set<string>();

    for (const track of tracks) {
        for (const sector of track.sectors) {
            const position = new SectorPosition(track.trackPosition, sector.sectorNumber);
            // JV3 records the track a sector is on, and has no room for IDs that say otherwise.
            const fits = hasStorableData(sector) && sectorSizeToCode(sector.size) !== undefined &&
                position.isPlausible() && !seen.has(position.key());
            if (fits) {
                seen.add(position.key());
                sectors.push({
                    cylinder: track.trackPosition.cylinderNumber,
                    side: track.trackPosition.side,
                    sectorNumber: sector.sectorNumber,
                    density: sector.density,
                    dataAddressMark: sector.dataAddressMark,
                    crcError: sector.dataCrcBad,
                    data: sector.data!,
                });
            }
        }
    }

    return sectors;
}

/**
 * The IMD mode for a density on a disk size: 5.25 inch uses the 250 kbit/s settings and 8 inch the 500.
 */
function imdModeFor(density: Density, diskSize: DiskSize): ImdMode {
    const eightInch = diskSize === DiskSize.EIGHT_INCH;
    switch (density) {
        case Density.SINGLE: return eightInch ? ImdMode.FM_500_KBPS : ImdMode.FM_250_KBPS;
        case Density.DOUBLE: return eightInch ? ImdMode.MFM_500_KBPS : ImdMode.MFM_250_KBPS;
        default: assertNever(density);
    }
}

/**
 * The tracks that go in an IMD image. A track's sectors must share a density, so a track with both keeps the
 * more common one (double density if tied). Sectors with a bad ID CRC and sizes that aren't a power of two
 * from 128 to 8192 are left out. A sector with an ID but no data stays, as a record with no data.
 */
function chooseImdTracks(tracks: ConvertTrack[], diskSize: DiskSize): ImdTrackToWrite[] {
    const imdTracks: ImdTrackToWrite[] = [];

    for (const track of tracks) {
        const position = track.trackPosition;
        const usable = track.sectors.filter(sector => !sector.idCrcBad && sector.size >= 128 &&
            sector.size <= 8192 && (sector.size & (sector.size - 1)) === 0 &&
            (sector.data === undefined || sector.data.length === sector.size)).slice(0, 255);
        const doubleCount = usable.filter(sector => sector.density === Density.DOUBLE).length;
        const density = doubleCount*2 >= usable.length ? Density.DOUBLE : Density.SINGLE;
        const kept = usable.filter(sector => sector.density === density);
        if (kept.length === 0 || position.side > 1 || position.cylinderNumber > 255) {
            continue;
        }

        imdTracks.push({
            trackPosition: position,
            mode: imdModeFor(density, diskSize),
            sectors: kept.map((sector): ImdSectorToWrite => ({
                sectorNumber: sector.sectorNumber,
                idCylinder: sector.idCylinder,
                idSide: sector.idSide,
                size: sector.size,
                data: sector.data,
                deleted: isConvertSectorDeleted(sector),
                dataError: sector.dataCrcBad,
            })),
        });
    }

    return imdTracks;
}

/**
 * The first line of an IMD header: the signature and the date, as "IMD 1.18: 26/10/2026 14:03:09".
 */
function imdSignatureLine(date: Date): string {
    // A number as at least two digits, for the date.
    const two = (value: number): string => String(value).padStart(2, "0");
    return `IMD 1.18: ${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ` +
        `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/**
 * Convert a floppy to another image format.
 *
 * @param source the floppy, in any format we can read.
 * @param format the format to write. If it's the source's own format, the result is a copy of the image.
 * @param options optional details.
 * @return the new floppy, decoded from the image that was built (so it has what a reader would find, not
 * what the writer meant), or a string saying why the format can't hold any of the disk.
 */
export function convertFloppy(source: FloppyDisk, format: FloppyImageFormat,
                              options: ConvertFloppyOptions = {}): FloppyDisk | string {

    const formatName = floppyImageFormatToString(format);
    const failure = `The new ${formatName} image couldn't be made`;

    // Nothing to convert.
    if (floppyImageFormatOf(source) === format) {
        return decodeImage(format, source.binary.slice()) ?? failure;
    }

    const tracks = readConvertTracks(source);
    const writeProtected = isImageWriteProtected(source);
    const diskSize = chooseDiskSize(source, tracks);
    const sourceFormat = floppyImageFormatOf(source);
    const sourceName = sourceFormat !== undefined ? floppyImageFormatToString(sourceFormat) :
        source instanceof ScpFloppyDisk ? "SCP" : "";
    let disk: FloppyDisk | undefined;

    switch (format) {
        case FloppyImageFormat.DMK:
            disk = buildDmkImage(makeStreams(source, tracks, diskSize), diskSize, writeProtected);
            break;

        case FloppyImageFormat.HFE:
            disk = buildHfeImage(makeStreams(source, tracks, diskSize), diskSize, writeProtected);
            break;

        case FloppyImageFormat.JV1: {
            const {sectors, cylinderCount} = chooseJv1Sectors(tracks);
            if (sectors.length === 0) {
                return "JV1 holds only single-density, single-sided tracks of ten 256-byte sectors numbered 0 to 9, " +
                    "and this disk has none";
            }
            disk = makeJv1FloppyDisk(sectors, cylinderCount);
            break;
        }

        case FloppyImageFormat.JV3: {
            const sectors = chooseJv3Sectors(tracks);
            if (sectors.length === 0) {
                return "JV3 can't hold any sector of this disk";
            }
            disk = makeJv3FloppyDisk(sectors, writeProtected);
            break;
        }

        case FloppyImageFormat.IMD: {
            const imdTracks = chooseImdTracks(tracks, diskSize);
            if (imdTracks.length === 0) {
                return "IMD can't hold any sector of this disk";
            }
            const comment = "Converted by trs80-tool" + (sourceName === "" ? "" : " from " + sourceName) + ".";
            disk = makeImdFloppyDisk(imdTracks, imdSignatureLine(options.date ?? new Date()) + "\r\n" + comment + "\r\n");
            break;
        }

        default:
            assertNever(format);
    }

    return disk ?? failure;
}
