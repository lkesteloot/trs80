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
     * Whether there was a CRC error when reading the physical disk.
     */
    public crcError = false;

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

            throw new Error("Track geometry is not fully initialized");
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
