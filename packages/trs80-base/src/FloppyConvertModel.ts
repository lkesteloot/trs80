/**
 * The common view of a floppy that the converter (FloppyConvert.ts) and the loss report
 * (FloppyCompare.ts) work from: every track's sectors in physical order, with the ID field's values, the
 * data, the exact data address mark, and the CRC state of each. Every image format can produce this
 * (see readConvertTracks()), and every format's writer takes it, so a conversion between any two
 * formats is "read the tracks, write the tracks". The formats that keep raw track bytes (DMK and HFE)
 * also have their own paths for keeping those bytes; see FloppyConvert.ts.
 */

import {assertNever} from "z80-base";
import {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {Density, FloppyDisk, SectorPosition, TrackPosition} from "./FloppyDisk.js";
import {HfeFloppyDisk} from "./HfeFloppyDisk.js";
import {ImdFloppyDisk, ImdMode} from "./ImdFloppyDisk.js";
import {Jv3FloppyDisk} from "./Jv3FloppyDisk.js";
import {DATA_ADDRESS_MARK, DELETED_DATA_ADDRESS_MARK, isDeletedDataAddressMark} from "./TrackBytes.js";

/**
 * One sector of a track, as the converter sees it.
 */
export interface ConvertSector {
    /**
     * The cylinder in the sector's ID field, which can differ from the track's.
     */
    idCylinder: number;

    /**
     * The side in the sector's ID field, which can differ from the track's.
     */
    idSide: number;

    /**
     * The sector number in the ID field.
     */
    sectorNumber: number;

    /**
     * The recording density of the sector's fields.
     */
    density: Density;

    /**
     * The sector's size in bytes: the size the ID field's code says, which is the length of the data
     * even if there is none.
     */
    size: number;

    /**
     * The sector's data, or undefined if the ID field has no data field after it.
     */
    data: Uint8Array | undefined;

    /**
     * The data address mark, 0xF8 to 0xFB. Formats that only record whether the sector is deleted
     * give 0xF8 or 0xFB.
     */
    dataAddressMark: number;

    /**
     * Whether the ID field's CRC is wrong. No controller finds such a sector.
     */
    idCrcBad: boolean;

    /**
     * Whether the data field's CRC is wrong.
     */
    dataCrcBad: boolean;
}

/**
 * One side of one cylinder, with the sectors in the order that they pass under the head.
 */
export interface ConvertTrack {
    /**
     * Where the track physically is.
     */
    trackPosition: TrackPosition;

    /**
     * The track's sectors in physical order.
     */
    sectors: ConvertSector[];

    /**
     * Whether the format really records the order of the sectors on the track. JV1 doesn't (its sectors
     * are in a file in numeric order), so a writer is free to interleave them and a comparison doesn't
     * count a different order as a difference.
     */
    orderKnown: boolean;
}

/**
 * Whether the sector's data address mark says it's deleted.
 */
export function isConvertSectorDeleted(sector: ConvertSector): boolean {
    return isDeletedDataAddressMark(sector.dataAddressMark);
}

/**
 * The size code that an ID field stores for a sector size (0 for 128 bytes up to 3 for 1024), or
 * undefined for a size that DMK, HFE and JV3 can't store.
 */
export function sectorSizeToCode(size: number): number | undefined {
    switch (size) {
        case 128: return 0;
        case 256: return 1;
        case 512: return 2;
        case 1024: return 3;
        default: return undefined;
    }
}

/**
 * The kind of drive and media a disk was recorded on, which decides how fast its track is read, and so
 * how many bytes a track holds. TRS-80 floppies are 5.25 inch, except the Model II's 8 inch ones.
 */
export enum DiskSize {
    /**
     * 5.25 inch: 250 kbit/s cells at 300 rpm, which is 6,250 double-density bytes per track.
     */
    FIVE_INCH,

    /**
     * 8 inch: 500 kbit/s cells at 360 rpm, which is 10,416 double-density bytes per track.
     */
    EIGHT_INCH,
}

/**
 * A short description of the disk size, such as "5.25 inch".
 */
export function diskSizeToString(diskSize: DiskSize): string {
    switch (diskSize) {
        case DiskSize.FIVE_INCH: return "5.25 inch";
        case DiskSize.EIGHT_INCH: return "8 inch";
        default: assertNever(diskSize);
    }
}

/**
 * The number of double-density byte times in one turn of a track, which is also the number of 16-cell
 * slots in an HFE track side. A single-density byte takes two.
 */
export function diskSizeSlotsPerTrack(diskSize: DiskSize): number {
    switch (diskSize) {
        case DiskSize.FIVE_INCH: return 6250;
        case DiskSize.EIGHT_INCH: return 10416;
        default: assertNever(diskSize);
    }
}

/**
 * Work out what size of disk an image came from, if the image says. A DMK's track length, an IMD's
 * data rate and an HFE's bit rate all do. Other formats don't.
 *
 * @return the size, or undefined if the format doesn't tell.
 */
export function guessDiskSize(disk: FloppyDisk): DiskSize | undefined {
    if (disk instanceof DmkFloppyDisk) {
        // 0x1900 and 0x1980 are 5.25 inch, 0x14E0 is 8 inch single density, and 0x2940 and up is 8 inch
        // double density.
        const eightInch = disk.trackLength === 0x14E0 || disk.trackLength >= 0x2800;
        return eightInch ? DiskSize.EIGHT_INCH : DiskSize.FIVE_INCH;
    } else if (disk instanceof ImdFloppyDisk) {
        const eightInch = disk.tracks.some(track => track.mode === ImdMode.FM_500_KBPS ||
            track.mode === ImdMode.MFM_500_KBPS);
        return eightInch ? DiskSize.EIGHT_INCH : DiskSize.FIVE_INCH;
    } else if (disk instanceof HfeFloppyDisk) {
        // The bit rate in kbit/s, little-endian.
        const bitRate = disk.binary[12] | (disk.binary[13] << 8);
        return bitRate >= 400 ? DiskSize.EIGHT_INCH : DiskSize.FIVE_INCH;
    } else {
        return undefined;
    }
}

/**
 * Collects tracks by position, in the order that they're first seen.
 */
class TrackCollector {
    private readonly tracks = new Map<string,ConvertTrack>();

    /**
     * The track at a position, made if it isn't there yet.
     */
    public getTrack(trackPosition: TrackPosition, orderKnown: boolean): ConvertTrack {
        let track = this.tracks.get(trackPosition.key());
        if (track === undefined) {
            track = {trackPosition, sectors: [], orderKnown};
            this.tracks.set(trackPosition.key(), track);
        }
        return track;
    }

    /**
     * The tracks that have at least one sector, sorted by cylinder and then side.
     */
    public getTracks(): ConvertTrack[] {
        return [... this.tracks.values()]
            .filter(track => track.sectors.length > 0)
            .sort((a, b) => a.trackPosition.cylinderNumber - b.trackPosition.cylinderNumber ||
                a.trackPosition.side - b.trackPosition.side);
    }
}

/**
 * The tracks of a DMK image, from its IDAM tables. Sectors whose ID field has a bad CRC stay in, so
 * that a writer that keeps raw bytes can keep them.
 */
function readDmkTracks(disk: DmkFloppyDisk): ConvertTrack[] {
    const collector = new TrackCollector();

    for (const dmkTrack of disk.tracks) {
        const track = collector.getTrack(dmkTrack.trackPosition, true);
        for (const dmkSector of dmkTrack.sectors) {
            const data = dmkSector.getData();
            const dataCrc = dmkSector.getDataCrc();
            track.sectors.push({
                idCylinder: dmkSector.getCylinderNumber(),
                idSide: dmkSector.getSide(),
                sectorNumber: dmkSector.getSectorNumber(),
                density: dmkSector.density,
                size: dmkSector.getSectorSize(),
                // The data can be a view into the file, so copy it.
                data: data === undefined ? undefined : data.slice(),
                dataAddressMark: dmkSector.getDam() ?? DATA_ADDRESS_MARK,
                idCrcBad: !dmkSector.hasValidIdCrc(),
                dataCrcBad: dataCrc !== undefined && dataCrc !== dmkSector.computeDataCrc(),
            });
        }
    }

    return collector.getTracks();
}

/**
 * The tracks of an HFE image, from the sectors that were found in its cell streams.
 */
function readHfeTracks(disk: HfeFloppyDisk): ConvertTrack[] {
    const collector = new TrackCollector();

    for (const hfeTrack of disk.tracks) {
        const track = collector.getTrack(hfeTrack.trackPosition, true);
        for (const hfeSector of hfeTrack.sectors) {
            track.sectors.push({
                idCylinder: hfeSector.cylinder,
                idSide: hfeSector.side,
                sectorNumber: hfeSector.sectorNumber,
                density: hfeSector.density,
                size: hfeSector.getLength(),
                data: hfeSector.data.slice(),
                dataAddressMark: hfeSector.dataMark,
                idCrcBad: !hfeSector.idCrc.valid(),
                dataCrcBad: !hfeSector.dataCrc.valid(),
            });
        }
    }

    return collector.getTracks();
}

/**
 * The tracks of a JV3 image. Its entries are in physical order within each track, and a sector's ID
 * is its position.
 */
function readJv3Tracks(disk: Jv3FloppyDisk): ConvertTrack[] {
    const collector = new TrackCollector();

    for (const info of disk.sectorInfos) {
        if (info.isFree()) {
            continue;
        }
        const position = info.sectorPosition;
        const track = collector.getTrack(position.trackPosition, true);
        const end = info.offset + info.size;
        // A truncated file leaves the sector without data.
        const data = end <= disk.binary.length ? disk.binary.slice(info.offset, end) : undefined;
        track.sectors.push({
            idCylinder: position.cylinderNumber,
            idSide: position.side,
            sectorNumber: position.sectorNumber,
            density: info.getDensity(),
            size: info.size,
            data,
            dataAddressMark: info.getDataAddressMark(),
            idCrcBad: false,
            dataCrcBad: info.hasCrcError(),
        });
    }

    return collector.getTracks();
}

/**
 * The tracks of an IMD image. Sectors with an ID but no data stay in.
 */
function readImdTracks(disk: ImdFloppyDisk): ConvertTrack[] {
    const collector = new TrackCollector();

    for (const imdTrack of disk.tracks) {
        const track = collector.getTrack(imdTrack.trackPosition, true);
        for (const imdSector of imdTrack.sectors) {
            let data: Uint8Array | undefined = undefined;
            if (imdSector.fillByte !== undefined) {
                data = new Uint8Array(imdSector.size).fill(imdSector.fillByte);
            } else if (imdSector.dataOffset !== undefined) {
                data = disk.binary.slice(imdSector.dataOffset, imdSector.dataOffset + imdSector.size);
            }
            track.sectors.push({
                idCylinder: imdSector.cylinder,
                idSide: imdSector.side,
                sectorNumber: imdSector.sectorNumber,
                density: imdSector.density,
                size: imdSector.size,
                data,
                // IMD only records whether the mark is deleted.
                dataAddressMark: imdSector.isDeleted() ? DELETED_DATA_ADDRESS_MARK : DATA_ADDRESS_MARK,
                idCrcBad: false,
                dataCrcBad: imdSector.hasDataError(),
            });
        }
    }

    return collector.getTracks();
}

/**
 * The tracks of any other floppy (JV1 and SCP), through the geometry and readSector(). A sector that
 * can't be read has no data. The track's order is the geometry's, which is the physical order for
 * formats that have one.
 */
function readGenericTracks(disk: FloppyDisk): ConvertTrack[] {
    const collector = new TrackCollector();

    // JV1 is just sectors in numeric order, with nothing saying how they sit on the track.
    const orderKnown = disk.className !== "Jv1FloppyDisk";
    for (const info of disk.getGeometry().sectorInfos) {
        const position: SectorPosition = info.sectorPosition;
        const track = collector.getTrack(position.trackPosition, orderKnown);
        const sectorData = disk.readSector(position);
        const crc = sectorData?.crc;
        track.sectors.push({
            idCylinder: sectorData?.sectorPosition.cylinderNumber ?? position.cylinderNumber,
            idSide: sectorData?.sectorPosition.side ?? position.side,
            sectorNumber: position.sectorNumber,
            density: info.density,
            size: info.sectorSize,
            data: sectorData?.data.slice(),
            dataAddressMark: sectorData?.getDataAddressMark() ?? DATA_ADDRESS_MARK,
            idCrcBad: crc !== undefined && !crc.idCrc.valid(),
            dataCrcBad: crc !== undefined ? !crc.dataCrc.valid() : sectorData?.crcError ?? false,
        });
    }

    return collector.getTracks();
}

/**
 * Read every track of a floppy as the converter sees it: sectors in physical order with their ID
 * values, data, marks, and CRC state. Tracks with no sectors aren't included.
 *
 * @param disk the floppy, in any format.
 * @return the tracks, sorted by cylinder and then side.
 */
export function readConvertTracks(disk: FloppyDisk): ConvertTrack[] {
    if (disk instanceof DmkFloppyDisk) {
        return readDmkTracks(disk);
    } else if (disk instanceof HfeFloppyDisk) {
        return readHfeTracks(disk);
    } else if (disk instanceof Jv3FloppyDisk) {
        return readJv3Tracks(disk);
    } else if (disk instanceof ImdFloppyDisk) {
        return readImdTracks(disk);
    } else {
        return readGenericTracks(disk);
    }
}
