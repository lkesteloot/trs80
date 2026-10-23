import {Density, SectorData, SectorInfo, SectorPosition, TrackGeometry} from "./FloppyDisk.js";
import type {DiskVolume, VolumeGeometry} from "./DiskVolume.js";
import {HARD_DISK_SECTOR_SIZE, HARD_DISK_SECTORS_PER_TRACK, type HardDisk} from "./HardDisk.js";
import {bytesToText} from "./DiskUtils.js";

/**
 * A block of whole cylinders and whole heads of a hard disk, which holds a file system of its own.
 * To the file system, the partition is a disk with one side, whose tracks are as long as all the
 * partition's heads together: logical sector s of logical cylinder c is physical sector s % 32
 * of head (head offset + floor(s / 32)) of cylinder (cylinder offset + c). See "Hard disk images"
 * in FLOPPY_FORMATS.md.
 */
export class HardDiskPartition implements DiskVolume {
    public readonly disk: HardDisk;
    /**
     * The first physical cylinder of the partition.
     */
    public readonly cylinderOffset: number;
    /**
     * The first physical head of the partition.
     */
    public readonly headOffset: number;
    /**
     * The number of cylinders in the partition.
     */
    public readonly cylinderCount: number;
    /**
     * The number of heads in the partition.
     */
    public readonly headCount: number;

    private readonly geometry: VolumeGeometry;
    // Cache for getBootTrackText().
    private bootTrackText: string | undefined = undefined;

    /**
     * @param disk the disk that the partition is on.
     * @param cylinderOffset the first physical cylinder.
     * @param headOffset the first physical head.
     * @param cylinderCount the number of cylinders.
     * @param headCount the number of heads.
     */
    constructor(disk: HardDisk, cylinderOffset: number, headOffset: number, cylinderCount: number, headCount: number) {
        this.disk = disk;
        this.cylinderOffset = cylinderOffset;
        this.headOffset = headOffset;
        this.cylinderCount = cylinderCount;
        this.headCount = headCount;

        // The boot track is the partition's first cylinder, but only as much of it as the image holds.
        const sectorsPerTrack = this.getSectorsPerTrack();
        const bootSectorInfos: SectorInfo[] = [];
        for (let sectorNumber = 0; sectorNumber < sectorsPerTrack; sectorNumber++) {
            const sectorPosition = SectorPosition.make(0, 0, sectorNumber);
            if (this.hasSectorData(sectorPosition)) {
                bootSectorInfos.push(new SectorInfo(sectorPosition, Density.DOUBLE, HARD_DISK_SECTOR_SIZE));
            }
        }
        const bootTrack = bootSectorInfos.length === 0 ? undefined : TrackGeometry.make(bootSectorInfos);

        this.geometry = {
            cylinderCount,
            sideCount: 1,
            modalDataSectorSpan: sectorsPerTrack,
            modalDataSectorSize: HARD_DISK_SECTOR_SIZE,
            modalDataDensity: Density.DOUBLE,
            bootTrack,
            cylinder0Differs: false,
        };
    }

    /**
     * The number of sectors in a logical track: all the partition's heads together.
     */
    private getSectorsPerTrack(): number {
        return this.headCount*HARD_DISK_SECTORS_PER_TRACK;
    }

    /**
     * The geometry of the partition as a file system sees it: one side of long tracks.
     */
    public getGeometry(): VolumeGeometry {
        return this.geometry;
    }

    /**
     * Read a sector of the partition. The position's side must be 0 and its sector number is
     * counted across all the partition's heads. Returns undefined if the position is outside
     * the partition or if the disk image doesn't hold the sector.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        const data = this.readPhysicalSector(sectorPosition);
        if (data === undefined) {
            return undefined;
        }

        return new SectorData(data, sectorPosition, Density.DOUBLE);
    }

    /**
     * Whether readSector() would return the sector.
     */
    public hasSectorData(sectorPosition: SectorPosition): boolean {
        return this.readPhysicalSector(sectorPosition) !== undefined;
    }

    /**
     * Find the sector's bytes on the underlying disk, or undefined if there are none.
     */
    private readPhysicalSector(sectorPosition: SectorPosition): Uint8Array | undefined {
        const logicalCylinder = sectorPosition.cylinderNumber;
        const sectorNumber = sectorPosition.sectorNumber;
        if (sectorPosition.side !== 0 ||
            logicalCylinder < 0 || logicalCylinder >= this.cylinderCount ||
            sectorNumber < 0 || sectorNumber >= this.getSectorsPerTrack()) {

            return undefined;
        }

        const head = this.headOffset + Math.floor(sectorNumber / HARD_DISK_SECTORS_PER_TRACK);
        return this.disk.readSector(this.cylinderOffset + logicalCylinder, head,
            sectorNumber % HARD_DISK_SECTORS_PER_TRACK);
    }

    /**
     * The contents of the partition's first cylinder as Latin-1 text, one character per byte, for
     * finding strings that FORMAT wrote there. Sectors that the image doesn't hold are skipped.
     */
    public getBootTrackText(): string {
        if (this.bootTrackText === undefined) {
            let text = "";
            const bootTrack = this.geometry.bootTrack;
            const sectorPositions = bootTrack === undefined ? [] : bootTrack.sectorPositions();
            for (const sectorPosition of sectorPositions) {
                const data = this.readPhysicalSector(sectorPosition);
                if (data !== undefined) {
                    text += bytesToText(data);
                }
            }
            this.bootTrackText = text;
        }

        return this.bootTrackText;
    }

    /**
     * Whether this partition shares any cylinder and head with the other one.
     */
    public overlaps(other: HardDiskPartition): boolean {
        return this.cylinderOffset < other.cylinderOffset + other.cylinderCount &&
            other.cylinderOffset < this.cylinderOffset + this.cylinderCount &&
            this.headOffset < other.headOffset + other.headCount &&
            other.headOffset < this.headOffset + this.headCount;
    }

    /**
     * A short description of where the partition is, such as "cylinders 0-139, heads 0-5".
     */
    public describeLocation(): string {
        const lastCylinder = this.cylinderOffset + this.cylinderCount - 1;
        const lastHead = this.headOffset + this.headCount - 1;
        const cylinders = this.cylinderCount === 1 ? `cylinder ${this.cylinderOffset}` :
            `cylinders ${this.cylinderOffset}-${lastCylinder}`;
        const heads = this.headCount === 1 ? `head ${this.headOffset}` : `heads ${this.headOffset}-${lastHead}`;
        return `${cylinders}, ${heads}`;
    }
}
