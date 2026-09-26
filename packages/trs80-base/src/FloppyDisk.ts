import {SimpleEventDispatcher} from "strongly-typed-events";
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
 * A lowercase string for the density.
 */
export function densityToString(density: Density): string {
    switch (density) {
        case Density.SINGLE: return "single";
        case Density.DOUBLE: return "double";
    }
}

/**
 * Returns the most common value (and its count) of a list of values. If more than one value is tied for max count,
 * returns the one with the smallest value.
 */
function modeOf(values: number[]): { value: number, count: number } {
    // Map from value to count.
    const counts = new Map<number,number>();

    // Count how many of each.
    for (const value of values) {
        const count = counts.get(value) ?? 0;
        counts.set(value, count + 1);
    }

    // Find the most common one.
    let modalValue: number | undefined = undefined;
    let modalCount = 0;

    for (const [value, count] of counts.entries()) {
        if (modalValue === undefined || count > modalCount || (count === modalCount && value < modalValue)) {
            modalValue = value;
            modalCount = count;
        }
    }

    if (modalValue === undefined) {
        throw new Error("Must have at least one value for modeOf()");
    }

    return { value: modalValue, count: modalCount };
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

    public static make(sectorInfos: SectorInfo[]): TrackGeometry {
        if (sectorInfos.length === 0) {
            throw new Error("Must have at least one sector in a track");
        }

        const firstSectorNumber = Math.min(... sectorInfos.map(info => info.sectorPosition.sectorNumber));
        const lastSectorNumber = Math.max(... sectorInfos.map(info => info.sectorPosition.sectorNumber));
        const modalDensity = modeOf(sectorInfos.map(info => info.density)).value;
        const modalSectorSize = modeOf(sectorInfos.map(info => info.sectorSize)).value;

        return new TrackGeometry(firstSectorNumber, lastSectorNumber, modalDensity, modalSectorSize);
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
    public readonly sectorMap = new Map<string,SectorInfo>();
    // Map from TrackPosition key to TrackGeometry.
    public readonly trackMap = new Map<string,TrackGeometry>();
    // These include all tracks, and are useful when displaying a table of sectors.
    public readonly firstSectorNumber: number;
    public readonly lastSectorNumber: number;
    // Information about the boot track (cylinder 0 side 0).
    public readonly bootTrack: TrackGeometry;
    public readonly modalDataDensity: Density;
    public readonly modalDataSectorSize: number;
    public readonly modalDataSectorSpan: number;

    // hasCylinder(n), getTrack(cylinder, side), getSectorInfo(position)
    // isHomogeneous()           // every track matches dataTrack

    constructor(cylinderCount: number, sideCount: number, sectorInfos: SectorInfo[]) {
        this.cylinderCount = cylinderCount;
        this.sideCount = sideCount;
        this.sectorInfos = sectorInfos;

        // Track position key to list of sectors on that track.
        const trackSectorList = new Map<string,SectorInfo[]>();

        for (const sectorInfo of sectorInfos) {
            this.sectorMap.set(sectorInfo.sectorPosition.key(), sectorInfo);

            const trackKey = sectorInfo.sectorPosition.trackPosition.key();
            let sectorList = trackSectorList.get(trackKey);
            if (sectorList === undefined) {
                sectorList = [];
                trackSectorList.set(trackKey, sectorList);
            }
            sectorList.push(sectorInfo);
        }

        for (const [trackKey, sectors] of trackSectorList.entries()) {
            this.trackMap.set(trackKey, TrackGeometry.make(sectors));
        }

        const sectorNumbers = this.sectorInfos.map(sectorInfo => sectorInfo.sectorPosition.sectorNumber);
        this.firstSectorNumber = Math.min(0, ... sectorNumbers);
        this.lastSectorNumber = Math.max(0, ... sectorNumbers);

        const bootTrackPosition = new TrackPosition(0, Side.FRONT);
        const bootTrack = this.trackMap.get(bootTrackPosition.key());
        if (bootTrack === undefined) {
            throw new Error("Disk has no track 0 on side 0");
        }
        this.bootTrack = bootTrack;
        const dataTracks = [... this.trackMap.values()].filter(track => track !== bootTrack);
        this.modalDataDensity = modeOf(dataTracks.map(track => track.modalDensity)).value;
        this.modalDataSectorSize = modeOf(dataTracks.map(track => track.modalSectorSize)).value;
        this.modalDataSectorSpan = modeOf(dataTracks.map(track => track.sectorSpan())).value;
    }

    /**
     * Returns a track position that's been advanced "advanceCount" times by one track. Takes into account
     * disk geometry. The specified DOS side count can be less than the physical side count, which is useful for
     * operating systems that only support one side but happen to be on a double-sided floppy. Returns undefined
     * if it goes past the end of the disk.
     */
    public advanceTrackPosition(trackPosition: TrackPosition, dosSideCount: number, advanceCount: number): TrackPosition | undefined {
        const sideCount = Math.min(this.sideCount, dosSideCount);
        let cylinderNumber = trackPosition.cylinderNumber;
        let side = trackPosition.side;

        for (let i = 0; i < advanceCount; i++) {
            if (side < sideCount - 1) {
                // Move to the next side.
                side += 1;
            } else {
                // Else go to side 0 of the next cylinder.
                cylinderNumber += 1;
                side = Side.FRONT;
            }
        }

        return cylinderNumber >= this.cylinderCount ? undefined : new TrackPosition(cylinderNumber, side);
    }

    /**
     * Returns a sector position that's been advanced "advanceCount" times by one sector. Takes into account
     * disk geometry. The specified DOS side count can be less than the physical side count, which is useful for
     * operating systems that only support one side but happen to be on a double-sided floppy. Returns undefined
     * if it goes past the end of the disk.
     */
    public advanceSectorPosition(sectorPosition: SectorPosition, dosSideCount: number, advanceCount: number): SectorPosition | undefined {
        // Get track info.
        let trackPosition = sectorPosition.trackPosition;
        let trackGeometry = this.trackMap.get(trackPosition.key());
        if (trackGeometry === undefined) {
            return undefined;
        }

        let sectorNumber = sectorPosition.sectorNumber;

        for (let i = 0; i < advanceCount; i++) {
            // Advance sector number.
            sectorNumber += 1;

            // Check if past the end of the sectors on this track.
            if (sectorNumber > trackGeometry.lastSectorNumber) {
                const newTrackPosition = this.advanceTrackPosition(trackPosition, dosSideCount, 1);
                if (newTrackPosition === undefined) {
                    // Past the end of the disk.
                    return undefined;
                }

                // Fetch new track info.
                trackPosition = newTrackPosition;
                trackGeometry = this.trackMap.get(trackPosition.key());
                if (trackGeometry === undefined) {
                    // Past the end of the disk.
                    return undefined;
                }

                // First sector on the new track.
                sectorNumber = trackGeometry.firstSectorNumber;
            }
        }

        return new SectorPosition(trackPosition, sectorNumber);
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
