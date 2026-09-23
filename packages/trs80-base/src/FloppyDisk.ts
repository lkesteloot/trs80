import { SimpleEventDispatcher } from "strongly-typed-events";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {AbstractTrs80File} from "./Trs80File.js";

// Determined by the floppy controller.
export const BYTES_PER_SECTOR = 256;

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
 * Other numbers return undefined.
 */
export function numberToSide(n: number): Side | undefined {
    switch (n) {
        case 0:
            return Side.FRONT;

        case 1:
            return Side.BACK;

        default:
            return undefined;
    }
}

/**
 * For side count (1 or 2), provide an array to iterate over for the sides.
 */
export const SIDE_COUNT_TO_SIDES: { [sideCount in 1|2]: Side[] } = {
    1: [Side.FRONT],
    2: [Side.FRONT, Side.BACK],
};

/**
 * Structure to keep track of a specific track on a disk.
 */
export class TrackPosition {
    /**
     * A cylinder is the set of all the tracks that are "on top" of one another. On a floppy, a cylinder
     * will have 1 or 2 tracks. Cylinder numbering is zero-based.
     */
    public readonly cylinderNumber: number;
    /**
     * Which side this track is on.
     */
    public readonly side: Side;

    constructor(cylinderNumber: number, side: Side) {
        this.cylinderNumber = cylinderNumber;
        this.side = side;
    }

    /**
     * Whether this position is plausible on a floppy.
     */
    public isPlausible(): boolean {
        return this.cylinderNumber < 100 && this.side <= 1;
    }

    /**
     * Generates a string of the form "cylinder:side", like "4:0", usable for error messages
     * or map keys.
     */
    public key(): string {
        return `${this.cylinderNumber}:${this.side}`;
    }

    /**
     * Whether the two track positions point to the same track.
     */
    public equals(other: TrackPosition): boolean {
        return this.cylinderNumber === other.cylinderNumber && this.side === other.side;
    }

}

/**
 * Structure to keep track of a specific sector position on a disk.
 */
export class SectorPosition {
    /**
     * Which track this sector is on.
     */
    public readonly trackPosition: TrackPosition;
    /**
     * The sector number within the track. This is numbered from 1 on TRSDOS 1.3-based systems, and from
     * 0 on the others. (Sectors mark their own numbers on the floppy, so they're labels not indices.)
     */
    public readonly sectorNumber: number;

    constructor(trackPosition: TrackPosition, sectorNumber: number) {
        this.trackPosition = trackPosition;
        this.sectorNumber = sectorNumber;
    }

    /**
     * Convenience factory that takes all three parameters.
     */
    public static make(cylinderNumber: number, side: Side, sectorNumber: number): SectorPosition {
        return new SectorPosition(new TrackPosition(cylinderNumber, side), sectorNumber);
    }

    /**
     * Convenient property to get the cylinder number from the track.
     */
    public get cylinderNumber(): number {
        return this.trackPosition.cylinderNumber;
    }

    /**
     * Convenient property to get the side from the track.
     */
    public get side(): number {
        return this.trackPosition.side;
    }

    /**
     * Whether this position is plausible on a floppy.
     */
    public isPlausible(): boolean {
        // Conservative numbers.
        return this.trackPosition.isPlausible() && this.sectorNumber < 40;
    }

    /**
     * Return the next sector in the cylinder, or the first sector on the next cylinder. Does not
     * check to see if it goes past the last track.
     *
     * TODO this uses geometry sides, but we must instead use DOS sides.
     */
    /*
    public next(geometry: FloppyDiskGeometry): SectorPosition {
        const trackGeometry = geometry.getTrackGeometry(this.cylinderNumber);
        if (this.sectorNumber >= trackGeometry.lastSector) {
            if (this.side >= trackGeometry.lastSide) {
                return geometry.getTrackGeometry(this.cylinderNumber + 1).firstSectorPosition;
            } else {
                return new SectorPosition(this.cylinderNumber, this.side + 1, trackGeometry.firstSector);
            }
        } else {
            return new SectorPosition(this.cylinderNumber, this.side, this.sectorNumber + 1);
        }
    }*/

    /**
     * Generates a string of the form "cylinder:side:sector", like "4:0:9", usable for error messages
     * or map keys.
     */
    public key(): string {
        return `${this.trackPosition.key()}:${this.sectorNumber}`;
    }

    /**
     * Whether the two sector positions point to the same sector.
     */
    public equals(other: SectorPosition): boolean {
        return this.trackPosition.equals(other.trackPosition) && this.sectorNumber === other.sectorNumber;
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
 * Data from a sector that was read from a disk, except the data.
 */
export class SectorInfo {
    /**
     * Cylinder number, side, and sector number stored in the IDAM.
     */
    public sectorPosition: SectorPosition;

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

    /**
     * Number of bytes in the sector.
     */
    public sectorSize: number;

    constructor(sectorPosition: SectorPosition, density: Density, sectorSize: number) {
        this.sectorPosition = sectorPosition;
        this.density = density;
        this.sectorSize = sectorSize;
    }
}

/**
 * Data from a sector that was read from a disk.
 */
export class SectorData extends SectorInfo {
    /**
     * The sector's data.
     */
    public data: Uint8Array;

    constructor(data: Uint8Array, sectorPosition: SectorPosition, density: Density) {
        super(sectorPosition, density, data.length);
        this.data = data;
    }
}

/**
 * Geometry of a particular track. This typically applies either to the first track of the floppy, or
 * to the rest of the tracks.
 */
export class OldTrackGeometry {
    public readonly trackNumber: number;
    public readonly firstSide: number;
    public readonly lastSide: number;
    public readonly firstSector: number;
    public readonly lastSector: number;
    public readonly sectorSize: number;
    public readonly density: Density;
    public readonly firstSectorPosition: SectorPosition;

    constructor(trackNumber: number, firstSide: number, lastSide: number, firstSector: number, lastSector: number,
                sectorSize: number, density: Density) {

        this.trackNumber = trackNumber;
        this.firstSide = firstSide;
        this.lastSide = lastSide;
        this.firstSector = firstSector;
        this.lastSector = lastSector;
        this.sectorSize = sectorSize;
        this.density = density;
        this.firstSectorPosition = SectorPosition.make(this.trackNumber, this.firstSide, this.firstSector);
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
     * Whether the sector number is valid for this track.
     */
    public isValidSectorNumber(sectorNumber: number): boolean {
        return sectorNumber >= this.firstSector && sectorNumber <= this.lastSector;
    }

    /**
     * Whether this track geometry equals the other, ignoring the "trackNumber" field.
     */
    public equalsIgnoringTrack(other: OldTrackGeometry): boolean {
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

    public build(trackNumber: number): OldTrackGeometry {
        if (this.firstSide === undefined || this.lastSide === undefined ||
            this.firstSector === undefined || this.lastSector === undefined ||
            this.sectorSize === undefined || this.density === undefined) {

            throw new Error("Track geometry is not fully initialized (" +
                this.firstSide + ", " + this.lastSide + ", " + this.firstSector + ", " + this.lastSector + ", " +
                this.sectorSize + ", " + this.density + ")");
        }

        return new OldTrackGeometry(trackNumber,
            this.firstSide, this.lastSide,
            this.firstSector, this.lastSector,
            this.sectorSize, this.density);
    }
}

/**
 * Describes the geometry of the floppy disk. Sometimes the first track has different geometry than
 * the rest, so these are split out.
 */
export class OldFloppyDiskGeometry {
    public readonly firstTrack: OldTrackGeometry;
    // The track number is that of the last track, but the other parameters apply to all non-first tracks:
    public readonly lastTrack: OldTrackGeometry;

    constructor(firstTrack: OldTrackGeometry, lastTrack: OldTrackGeometry) {
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
    public getTrackGeometry(trackNumber: number): OldTrackGeometry {
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
 * What we know about a track (cylinder/side pair) on a floppy.
 */
export class TrackGeometry {
    public readonly firstSectorNumber: number;
    public readonly lastSectorNumber: number;
    public readonly modalDensity: Density;
    public readonly modalSectorSize: number;

    constructor(firstSectorNumber: number, lastSectorNumber: number, modalDensity: Density, modalSectorSize: number) {
        this.firstSectorNumber = firstSectorNumber;
        this.lastSectorNumber = lastSectorNumber;
        this.modalDensity = modalDensity;
        this.modalSectorSize = modalSectorSize;
    }

    public sectorSpan(): number {
        return this.lastSectorNumber - this.firstSectorNumber + 1;
    }
    // cylinderNumber, side
    // firstSectorNumber, lastSectorNumber
    // sectorCount          // distinct sector numbers actually present
    // sectorSpan           // last - first + 1
    // density, sectorSize  // modal
    // mixedDensity, mixedSize: boolean
    // hasSector(n): boolean
}

/**
 * Information about the physical layout of tracks, sides, and sectors on a floppy.
 */
export class FloppyDiskGeometry {
    public readonly cylinderCount: number;
    public readonly sideCount: number;
    public readonly sectorInfos: SectorInfo[];
    // Map from SectorPosition key to SectorInfo.
    public readonly sectorInfoMap = new Map<string,SectorInfo>();
    // Map from TrackPosition key to TrackGeometry.
    public readonly track = new Map<string,TrackGeometry>();
    // Information about the boot track (cylinder 0 side 0).
    public readonly bootTrack: TrackGeometry;
    // Information about the modal data (non-boot) track.
    public readonly dataTrack: TrackGeometry;
    // These include all tracks, and are useful when displaying a table of sectors.
    public readonly firstSectorNumber: number;
    public readonly lastSectorNumber: number;

    // hasCylinder(n), getTrack(cylinder, side), getSectorInfo(position)
    // isHomogeneous()           // every track matches dataTrack

    constructor(cylinderCount: number, sideCount: number, sectorInfos: SectorInfo[]) {
        this.cylinderCount = cylinderCount;
        this.sideCount = sideCount;
        this.sectorInfos = sectorInfos;

        for (const sectorInfo of sectorInfos) {
            this.sectorInfoMap.set(sectorInfo.sectorPosition.key(), sectorInfo);

        }
    }

    public getTrackGeometry(trackPosition: TrackPosition): TrackGeometry {

    }
}

/**
 * Represents a write to an underlying disk file.
 */
export class FloppyWrite {
    // Data to be written to the underlying file.
    public readonly data: Uint8Array;

    // Offset into the underlying file.
    public readonly offset: number;

    constructor(data: Uint8Array, offset: number) {
        this.data = data;
        this.offset = offset;
    }
}

/**
 * Abstract class for virtual floppy disk file formats.
 */
export abstract class FloppyDisk extends AbstractTrs80File {
    public readonly supportsDoubleDensity: boolean;
    public readonly onWrite = new SimpleEventDispatcher<FloppyWrite>();
    protected mountedWriteProtected = false;

    protected constructor(binary: Uint8Array,
                          error: string | undefined,
                          annotations: ProgramAnnotation[],
                          supportsDoubleDensity: boolean) {

        super(binary, error, annotations);
        this.supportsDoubleDensity = supportsDoubleDensity;
    }

    /**
     * Get the geometry of the floppy.
     */
    public abstract getGeometry(): FloppyDiskGeometry;

    /**
     * Whether the file was mounted write-protected, at the request of the user.
     */
    public setMountedWriteProtected(mountedWriteProtected: boolean): void {
        this.mountedWriteProtected = mountedWriteProtected;
    }

    /**
     * This can return true to mean that this file format does not
     * support writing at all (the writeSector() method is not implemented),
     * that it's implemented but the file is virtually write-protected,
     * or that the file was mounted write-protected (the mountedWriteProtected field).
     */
    public isWriteProtected(): boolean {
        // The base class does not support writing.
        return true;
    }

    /**
     * Read a sector at the specified position.
     *
     * @return the sector, or undefined if an error occurs.
     */
    public abstract readSector(sectorPosition: SectorPosition): SectorData | undefined;

    /**
     * Write a sector to the specified position. Throw an exception
     * if writing is not supported, so check first with isWriteProtected().
     */
    public writeSector(sectorPosition: SectorPosition, data: SectorData): void {
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

    /**
     * Modify the underlying file and the in-memory binary.
     */
    protected write(floppyWrite: FloppyWrite): void {
        this.binary.set(floppyWrite.data, floppyWrite.offset);
        this.onWrite.dispatch(floppyWrite);
    }
}
