import type {Density, SectorData, SectorPosition, TrackGeometry} from "./FloppyDisk.js";

/**
 * The shape of what a file system lives on: a whole floppy, or one partition of a hard disk. This is
 * the part of FloppyDiskGeometry that the DOS decoders need.
 */
export interface VolumeGeometry {
    /**
     * The number of cylinders. On a partition these are the partition's own (logical) cylinders.
     */
    readonly cylinderCount: number;

    /**
     * The number of sides (heads) that the image has. A hard disk partition is addressed as one
     * side with tracks as long as all its heads together, so this is 1.
     */
    readonly sideCount: number;

    /**
     * The most common number of sectors on a track (not counting the boot track, where that
     * differs).
     */
    readonly modalDataSectorSpan: number;

    /**
     * The most common sector size, in bytes.
     */
    readonly modalDataSectorSize: number;

    /**
     * The most common density.
     */
    readonly modalDataDensity: Density;

    /**
     * The first track (cylinder 0, side 0), or undefined if nothing there could be read.
     */
    readonly bootTrack: TrackGeometry | undefined;

    /**
     * Whether cylinder 0 has a different density or number of sectors than most other tracks.
     */
    readonly cylinder0Differs: boolean;
}

/**
 * What a file system lives on: a whole floppy, or one partition of a hard disk. File systems read
 * sectors from it by position, with no regard to how it's recorded.
 */
export interface DiskVolume {
    /**
     * The geometry of the volume. Implementations should cache this, it may be called often.
     */
    getGeometry(): VolumeGeometry;

    /**
     * Read a sector at the specified position.
     *
     * @return the sector, or undefined if it can't be read.
     */
    readSector(sectorPosition: SectorPosition): SectorData | undefined;

    /**
     * Whether readSector() would return the sector, without reading it or logging anything,
     * for checking guesses about where things are on the volume.
     */
    hasSectorData(sectorPosition: SectorPosition): boolean;

    /**
     * The contents of the boot track as Latin-1 text, one character per byte, for finding strings
     * that FORMAT wrote there. Returns an empty string if there's no boot track.
     */
    getBootTrackText(): string;
}
