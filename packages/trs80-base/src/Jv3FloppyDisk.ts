import {toHexByte} from "z80-base";
import {
    Density,
    FloppyDisk,
    FloppyDiskGeometry, FloppyWrite,
    SectorData,
    Side,
    TrackGeometry,
    TrackGeometryBuilder
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import { TRS80_BASE_LOGGER } from "trs80-logger";

// The JV3 file consists of sectors of different sizes all bunched together. Before that
// comes a directory of these sectors, with three bytes per directory entry (track,
// sector, and flags), mapping in order to the subsequent sectors.
//
// https://www.tim-mann.org/trs80/dskspec.html

// The directory is in this header:
const HEADER_SIZE = 34*256;

// We can fit this many 3-byte records into it:
const RECORD_COUNT = Math.floor(HEADER_SIZE/3);

// Flags for SectorInfo.
enum Flags {
    SIZE_CODE_MASK = 0x03, // See calculation in constructor of SectorInfo.
    NON_IBM = 0x04, // 0 = normal, 1 = short.
    BAD_CRC = 0x08,
    SIDE = 0x10, // 0 = front, 1 = back.

    DAM_MASK = 0x60, // Data address mark mask.

    // Single-density.
    DAM_SD_FB = 0x00, // Normal sector.
    DAM_SD_FA = 0x20, // Unknown DAM.
    DAM_SD_F9 = 0x40, // Unknown DAM.
    DAM_SD_F8 = 0x60, // Deleted sector.

    // Double-density.
    DAM_DD_FB = 0x00, // Normal sector.
    DAM_DD_F8 = 0x20, // Deleted sector.

    DOUBLE_DENSITY = 0x80,
}

// Used in the track and sector bytes.
const FREE = 0xFF;

class SectorInfo {
    // Raw data from the directory entry.
    public readonly track: number;
    public readonly sector: number;
    public readonly flags: Flags;

    // Offset into the binary.
    public readonly offset: number;

    // Number of bytes in sector.
    public readonly size: number;

    constructor(track: number, sector: number, flags: Flags, offset: number) {
        // Make both FREE to avoid confusion.
        if (track === FREE || sector === FREE) {
            track = FREE;
            sector = FREE;
        }

        this.track = track;
        this.sector = sector;
        this.flags = flags;
        this.offset = offset;

        // In used sectors: 0=256,1=128,2=1024,3=512
        // In free sectors: 0=512,1=1024,2=128,3=256
        const sizeCode = (flags & Flags.SIZE_CODE_MASK) ^ (this.isFree() ? 0x02 : 0x01);
        this.size = 128 << sizeCode;
    }

    public getSide(): Side {
        return (this.flags & Flags.SIDE) === 0 ? Side.FRONT : Side.BACK;
    }

    /**
     * Return the flags as a string, for debugging.
     */
    public flagsToString(): string {
        const parts: string[] = [];

        parts.push(this.size + " bytes");
        if ((this.flags & Flags.NON_IBM) !== 0) {
            parts.push("non-IBM");
        }
        if ((this.flags & Flags.BAD_CRC) !== 0) {
            parts.push("bad CRC");
        }
        parts.push("side " + ((this.flags & Flags.SIDE) === 0 ? 0 : 1));
        if ((this.flags & Flags.DOUBLE_DENSITY) !== 0) {
            parts.push("double density");
        } else {
            parts.push("single density");
        }

        return parts.join(", ");
    }

    /**
     * Whether the sector entry is free (doesn't represent real space in the file).
     */
    public isFree(): boolean {
        return this.track === FREE || this.sector === FREE;
    }

    /**
     * Whether the sector is encoded with MFM (instead of FM).
     */
    public isDoubleDensity(): boolean {
        return (this.flags & Flags.DOUBLE_DENSITY) !== 0;
    }

    /**
     * Return the density of this sector.
     */
    public getDensity(): Density {
        return this.isDoubleDensity() ? Density.DOUBLE : Density.SINGLE;
    }

    /**
     * Whether the sector's data is invalid.
     *
     * Normally FB is normal and F8 is deleted, but the single-density version has
     * two other values (F9 and FA), which we also consider deleted, to match xtrs.
     */
    public isDeleted(): boolean {
        const dam = this.flags & Flags.DAM_MASK;
        return this.isDoubleDensity() ? dam === Flags.DAM_DD_F8 : dam !== Flags.DAM_SD_FB;
    }

    /**
     * Whether the floppy had a bar CRC when reading it.
     */
    public hasCrcError(): boolean {
        return (this.flags & Flags.BAD_CRC) !== 0;
    }
}

/**
 * Floppy disk in the JV3 format.
 */
export class Jv3FloppyDisk extends FloppyDisk {
    public readonly className = "Jv3FloppyDisk";
    public readonly writeProtected: boolean;
    private readonly sectorInfos: SectorInfo[];
    private readonly geometry: FloppyDiskGeometry;

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                sectorInfos: SectorInfo[], writeProtected: boolean) {

        super(binary, error, annotations, true);
        this.sectorInfos = sectorInfos;
        this.writeProtected = writeProtected;

        // Compute geometry.
        const firstTrackBuilder = new TrackGeometryBuilder();
        const lastTrackBuilder = new TrackGeometryBuilder();

        const firstTrack = 0;
        let lastTrack = 0;
        for (const sectorInfo of sectorInfos) {
            lastTrack = Math.max(lastTrack, sectorInfo.track);

            const builder = sectorInfo.track === firstTrack ? firstTrackBuilder : lastTrackBuilder;
            builder.updateSide(sectorInfo.getSide() === Side.FRONT ? 0 : 1);
            builder.updateSector(sectorInfo.sector);
            builder.updateSectorSize(sectorInfo.size);
            builder.updateDensity(sectorInfo.getDensity());
        }

        this.geometry = new FloppyDiskGeometry(
            firstTrackBuilder.build(firstTrack),
            lastTrackBuilder.build(lastTrack));
    }

    public getDescription(): string {
        return "Floppy disk (JV3)";
    }

    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    public isWriteProtected(): boolean {
        // Our file's state or the mounted state.
        return this.writeProtected || this.mountedWriteProtected;
    }

    public readSector(trackNumber: number, side: Side, sectorNumber: number | undefined): SectorData | undefined {
        const sectorInfo = this.findSectorInfo(trackNumber, side, sectorNumber);
        if (sectorInfo === undefined) {
            return undefined;
        }

        const data = this.padSector(this.binary.subarray(sectorInfo.offset, sectorInfo.offset + sectorInfo.size),
            sectorInfo.size);

        const sectorData = new SectorData(data, sectorInfo.getDensity());
        sectorData.deleted = sectorInfo.isDeleted();
        sectorData.crcError = sectorInfo.hasCrcError();
        return sectorData;
    }

    public writeSector(trackNumber: number, side: Side, sectorNumber: number, data: SectorData) {
        if (this.isWriteProtected()) {
            // Shouldn't happen, failure upstream.
            throw new Error("tried to write sector to Jv3 but it's write protected");
        }

        const sectorInfo = this.findSectorInfo(trackNumber, side, sectorNumber);
        if (sectorInfo === undefined) {
            // Not sure how to handle this.
            TRS80_BASE_LOGGER.warn(`JV3 write sector not found ${trackNumber}, ${side}, ${sectorNumber}`);
            return;
        }

        if (sectorInfo.size !== data.data.length) {
            throw new Error(`size mismatch when writing sector (${sectorInfo.size} vs. ${data.data.length}`);
        }

        this.write(new FloppyWrite(data.data, sectorInfo.offset));
    }

    /**
     * Find the sector for the specified track and side.
     */
    private findSectorInfo(track: number, side: Side, sector: number | undefined): SectorInfo | undefined {
        for (const sectorInfo of this.sectorInfos) {
            if (!sectorInfo.isFree() &&
                sectorInfo.track === track &&
                sectorInfo.getSide() === side &&
                (sector === undefined || sectorInfo.sector === sector)) {

                return sectorInfo;
            }
        }

        return undefined;
    }
}

/**
 * Decode a JV3 floppy disk file.
 */
export function decodeJv3FloppyDisk(binary: Uint8Array): Jv3FloppyDisk {
    let error: string | undefined;
    const annotations: ProgramAnnotation[] = [];
    const sectorInfos: SectorInfo[] = [];

    // Read the directory.
    let sectorOffset = HEADER_SIZE;
    // TODO handle double-sided disks. They have a whole other disk at the end of this one.
    for (let i = 0; i < RECORD_COUNT; i++) {
        const offset = i*3;
        if (offset + 2 >= binary.length) {
            error = "Directory truncated at entry " + i;
            break;
        }

        const track = binary[offset];
        const sector = binary[offset + 1] & 0x7F; // Clear high bit, TRSDOS protection scheme?
        const flags = binary[offset + 2] as Flags;

        const sectorInfo = new SectorInfo(track, sector, flags, sectorOffset);
        sectorOffset += sectorInfo.size;

        // End at the first free sector.
        if (sectorInfo.isFree()) {
            break;
        }

        if (sectorOffset > binary.length) {
            error = `Sector truncated at entry ${i} (${sectorOffset} > ${binary.length})`;
            break;
        }

        annotations.push(new ProgramAnnotation("Track " + sectorInfo.track + ", sector " +
            sectorInfo.sector + ", " + sectorInfo.flagsToString(), offset, offset + 3));

        sectorInfos.push(sectorInfo);
    }

    // Annotate the sectors themselves.
    for (const sectorInfo of sectorInfos) {
        annotations.push(new ProgramAnnotation("Track " + sectorInfo.track + ", sector " + sectorInfo.sector,
            sectorInfo.offset, sectorInfo.offset + sectorInfo.size));
    }

    const writableOffset = RECORD_COUNT*3;
    const writable = binary[writableOffset];
    if (writable !== 0 && writable !== 0xFF) {
        error = "Invalid \"writable\" byte: 0x" + toHexByte(writable);
    }
    const writeProtected = writable === 0;
    annotations.push(new ProgramAnnotation(writeProtected ? "Write protected" : "Writable",
        writableOffset, writableOffset + 1));

    return new Jv3FloppyDisk(binary, error, annotations, sectorInfos, writeProtected);
}
