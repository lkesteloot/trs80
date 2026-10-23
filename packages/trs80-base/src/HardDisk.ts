import {AbstractTrs80File} from "./Trs80File.js";

/**
 * The number of sectors on every hard disk track. TRS-80 hard disks (the Radio Shack drives and the
 * emulated ones) number them from 0. See "Hard disk images" in FLOPPY_FORMATS.md.
 */
export const HARD_DISK_SECTORS_PER_TRACK = 32;

/**
 * The number of bytes in every hard disk sector.
 */
export const HARD_DISK_SECTOR_SIZE = 256;

/**
 * The physical layout of a hard disk.
 */
export interface HardDiskGeometry {
    /**
     * The number of cylinders. The last one may be partial, with only the sectors that
     * the image holds.
     */
    readonly cylinderCount: number;

    /**
     * The number of heads, which is the number of tracks in each cylinder.
     */
    readonly headCount: number;

    /**
     * The number of sectors in each track.
     */
    readonly sectorsPerTrack: number;

    /**
     * The number of bytes in each sector.
     */
    readonly sectorSize: number;
}

/**
 * Abstract class for virtual hard disk file formats. A hard disk is a flat array of sectors
 * addressed by cylinder, head, and sector, and holds one or more partitions, each with a file system
 * of its own. It doesn't model the way the sectors are recorded, as FloppyDisk does for floppies.
 * See HardDiskPartition for the part of a disk that a file system sees.
 */
export abstract class HardDisk extends AbstractTrs80File {
    /**
     * @param binary the bytes of the whole image file.
     * @param error the error encountered while decoding, if any.
     */
    protected constructor(binary: Uint8Array, error: string | undefined) {
        super(binary, error, []);
    }

    /**
     * Get the geometry of the hard disk.
     */
    public abstract getGeometry(): HardDiskGeometry;

    /**
     * Read a sector.
     *
     * @param cylinder the cylinder number, from 0.
     * @param head the head number, from 0.
     * @param sector the sector number within the track, from 0.
     * @return the sector's bytes, or undefined if the position is outside the disk or the image
     * doesn't hold that sector.
     */
    public abstract readSector(cylinder: number, head: number, sector: number): Uint8Array | undefined;
}
