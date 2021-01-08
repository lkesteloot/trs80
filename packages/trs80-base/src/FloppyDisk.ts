import {ProgramAnnotation} from "./ProgramAnnotation";
import {Trs80File} from "./Trs80File";

// Side of a floppy disk.
export enum Side {
    FRONT,
    BACK,
}

/**
 * Convert a number to a side, where 0 maps to FRONT and 1 maps to BACK.
 * Other numbers throw an exception.
 */
export function numberToSide(number: number): Side {
    if (number === 0) {
        return Side.FRONT;
    }
    if (number === 1) {
        return Side.BACK;
    }
    throw new Error("Invalid side number " + number);
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

    constructor(data: Uint8Array) {
        this.data = data;
    }
}

/**
 * Abstract class for virtual floppy disk file formats.
 */
export abstract class FloppyDisk extends Trs80File {
    public readonly supportsDoubleDensity: boolean;

    protected constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                          supportsDoubleDensity: boolean) {

        super(binary, error, annotations);
        this.supportsDoubleDensity = supportsDoubleDensity;
    }

    /**
     * Read a sector on the specified track and sector.
     *
     * @param track the track the sector resides on.
     * @param sector the sector on the track, or undefined to choose the first sector on the track.
     * @param side optional side to make sure the sector is on the side we expect.
     * @return the sector, or undefined if an error occurs.
     */
    public abstract readSector(track: number, sector: number | undefined,
                               side: Side | undefined): SectorData | undefined;

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
