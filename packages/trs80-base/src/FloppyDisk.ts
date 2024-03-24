import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {AbstractTrs80File} from "./Trs80File.js";

// Side of a floppy disk.
export enum Side {
    FRONT,
    BACK,
}

// Whether single density (FM) or double density (MFM).
export enum Density {
    SINGLE,
    DOUBLE,
}

/**
 * Convert a number to a side, where 0 maps to FRONT and 1 maps to BACK.
 * Other numbers throw an exception.
 */
export function numberToSide(n: number): Side {
    switch (n) {
        case 0:
            return Side.FRONT;

        case 1:
            return Side.BACK;

        default:
            throw new Error("Invalid side number " + n);
    }
}

/**
 * Byte for filling sector data when reading off the end.
 */
const FILL_BYTE = 0xE5;

/**
 * Info about the CRC of a particular chunk of bytes.
 */
export class CrcInfo {
    /**
     * CRC as written on the floppy.
     */
    public readonly written: number;

    /**
     * CRC as computed from the data.
     */
    public readonly computed: number;

    constructor(written: number, computed: number) {
        this.written = written;
        this.computed = computed;
    }

    public valid(): boolean {
        return this.written === this.computed;
    }
}

/**
 * Info about both sector CRCs (ID and data).
 */
export class SectorCrc {
    /**
     * CRC for the ID data (sector number, etc.).
     */
    public readonly idCrc: CrcInfo;

    /**
     * CRC for the sector data.
     */
    public readonly dataCrc: CrcInfo;

    constructor(idCrc: CrcInfo, dataCrc: CrcInfo) {
        this.idCrc = idCrc;
        this.dataCrc = dataCrc;
    }

    public valid(): boolean {
        return this.idCrc.valid() && this.dataCrc.valid();
    }
}

/**
 * Data from a sector that was read from a disk.
 */
export class SectorData {
    /**
     * The sector's data.
     */
    public data: Uint8Array;

    /**
     * Whether the sector data is invalid. This is indicated on the floppy by having a 0xF8 data
     * address mark (DAM) byte, instead of the normal 0xFB. For JV1 this is set to true for the directory track.
     */
    public deleted = false;

    /**
     * Whether there was a CRC error when reading the physical disk. Sometimes we only have this information
     * without having the actual CRCs.
     */
    public crcError = false;

    /**
     * If available, the written and computed CRCs for the ID and the data.
     */
    public crc: SectorCrc | undefined;

    /**
     * Single or double density.
     */
    public density: Density;

    constructor(data: Uint8Array, density: Density) {
        this.data = data;
        this.density = density;
    }
}

/**
 * Geometry of a particular track. This typically applies either to the first track of the floppy, or
 * to the rest of the tracks.
 */
export class TrackGeometry {
    public readonly trackNumber: number;
    public readonly firstSide: number;
    public readonly lastSide: number;
    public readonly firstSector: number;
    public readonly lastSector: number;
    public readonly sectorSize: number;
    public readonly density: Density;

    constructor(trackNumber: number, firstSide: number, lastSide: number, firstSector: number, lastSector: number,
                sectorSize: number, density: Density) {

        this.trackNumber = trackNumber;
        this.firstSide = firstSide;
        this.lastSide = lastSide;
        this.firstSector = firstSector;
        this.lastSector = lastSector;
        this.sectorSize = sectorSize;
        this.density = density;
    }

    /**
     * Compute the number of sides in this track.
     */
    public numSides(): number {
        return this.lastSide - this.firstSide + 1;
    }

    /**
     * Return an array of available sides, in order.
     */
    public sides(): Side[] {
        return this.numSides() === 1 ? [Side.FRONT] : [Side.FRONT, Side.BACK];
    }

    /**
     * Compute the number of sectors in this track.
     */
    public numSectors(): number {
        return this.lastSector - this.firstSector + 1;
    }

    /**
     * Whether this track geometry equals the other, ignoring the "trackNumber" field.
     */
    public equalsIgnoringTrack(other: TrackGeometry): boolean {
        return this.firstSide === other.firstSide &&
            this.lastSide === other.lastSide &&
            this.firstSector === other.firstSector &&
            this.lastSector === other.lastSector &&
            this.sectorSize === other.sectorSize &&
            this.density === other.density;
    }
}

/**
 * A builder to help construct track geometry by giving it sector information one at a time.
 */
export class TrackGeometryBuilder {
    private firstSide: number | undefined = undefined;
    private lastSide: number | undefined = undefined;
    private firstSector: number | undefined = undefined;
    private lastSector: number | undefined = undefined;
    private sectorSize: number | undefined = undefined;
    private density: Density | undefined = undefined;

    public updateSide(side: number): void {
        if (this.firstSide === undefined || side < this.firstSide) {
            this.firstSide = side;
        }
        if (this.lastSide === undefined || side > this.lastSide) {
            this.lastSide = side;
        }
    }

    public updateSector(sector: number): void {
        if (this.firstSector === undefined || sector < this.firstSector) {
            this.firstSector = sector;
        }
        if (this.lastSector === undefined || sector > this.lastSector) {
            this.lastSector = sector;
        }
    }

    public updateSectorSize(sectorSize: number): void {
        if (this.sectorSize === undefined) {
            this.sectorSize = sectorSize;
        } else if (this.sectorSize !== sectorSize) {
            throw new Error(`Inconsistent sector sizes: ${this.sectorSize} vs. ${sectorSize}`);
        }
    }

    public updateDensity(density: Density): void {
        if (this.density === undefined) {
            this.density = density;
        } else if (this.density !== density) {
            throw new Error(`Inconsistent densities: ${this.density} vs. ${density}`);
        }
    }

    public build(trackNumber: number): TrackGeometry {
        if (this.firstSide === undefined || this.lastSide === undefined ||
            this.firstSector === undefined || this.lastSector === undefined ||
            this.sectorSize === undefined || this.density === undefined) {

            throw new Error("Track geometry is not fully initialized (" +
                this.firstSide + ", " + this.lastSide + ", " + this.firstSector + ", " + this.lastSector + ", " +
                this.sectorSize + ", " + this.density + ")");
        }

        return new TrackGeometry(trackNumber,
            this.firstSide, this.lastSide,
            this.firstSector, this.lastSector,
            this.sectorSize, this.density);
    }
}

/**
 * Describes the geometry of the floppy disk. Sometimes the first track has different geometry than
 * the rest, so these are split out.
 */
export class FloppyDiskGeometry {
    public readonly firstTrack: TrackGeometry;
    // The track number is that of the last track, but the other parameters apply to all non-first tracks:
    public readonly lastTrack: TrackGeometry;

    constructor(firstTrack: TrackGeometry, lastTrack: TrackGeometry) {
        this.firstTrack = firstTrack;
        this.lastTrack = lastTrack;
    }

    /**
     * The number of tracks on this floppy.
     */
    public numTracks(): number {
        return this.lastTrack.trackNumber - this.firstTrack.trackNumber + 1;
    }

    /**
     * The number of sides on this floppy.
     */
    public numSides(): number {
        return Math.max(this.firstTrack.numSides(), this.lastTrack.numSides());
    }

    /**
     * Get the track geometry for the specified track.
     */
    public getTrackGeometry(trackNumber: number): TrackGeometry {
        return trackNumber === this.firstTrack.trackNumber ? this.firstTrack : this.lastTrack;
    }

    /**
     * Whether this track number is in a valid range for this floppy.
     */
    public isValidTrackNumber(trackNumber: number): boolean {
        return trackNumber >= this.firstTrack.trackNumber && trackNumber <= this.lastTrack.trackNumber;
    }

    /**
     * Whether the first and subsequent tracks have the same geometry.
     */
    public hasHomogenousGeometry(): boolean {
        return this.firstTrack.equalsIgnoringTrack(this.lastTrack);
    }
}

/**
 * Abstract class for virtual floppy disk file formats.
 */
export abstract class FloppyDisk extends AbstractTrs80File {
    public readonly supportsDoubleDensity: boolean;

    protected constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                          supportsDoubleDensity: boolean) {

        super(binary, error, annotations);
        this.supportsDoubleDensity = supportsDoubleDensity;
    }

    /**
     * Get the geometry of the floppy.
     */
    public abstract getGeometry(): FloppyDiskGeometry;

    /**
     * This can return true to mean that this file format does not
     * support writing at all (the writeSector() method is not implemented)
     * or that it's implemented but the file is virtually write-protected.
     */
    public isWriteProtected(): boolean {
        return true;
    }

    /**
     * Read a sector on the specified track, side, and sector.
     *
     * @param trackNumber the track the sector resides on.
     * @param side the side the sector resides on.
     * @param sectorNumber the sector on the track, or undefined to choose any sector on the track.
     * @return the sector, or undefined if an error occurs.
     */
    public abstract readSector(trackNumber: number, side: Side,
                               sectorNumber: number | undefined): SectorData | undefined;

    /**
     * Write a sector to the specified track, side, and sector. Throw an exception
     * if writing is not supported, so check first with isWriteProtected().
     */
    public writeSector(trackNumber: number, side: Side,
                       sectorNumber: number, data: SectorData): void {

        throw new Error(this.className + " does not support writing");
    }

    /**
     * Pad a sector to its full length.
     */
    protected padSector(data: Uint8Array, sectorSize: number): Uint8Array {
        if (data.length < sectorSize) {
            const newData = new Uint8Array(sectorSize);
            newData.set(data);
            newData.fill(FILL_BYTE, data.length);
            data = newData;
        }

        return data;
    }
}
