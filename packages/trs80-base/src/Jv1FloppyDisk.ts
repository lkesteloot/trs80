import {TRS80_FLOPPY_LOGGER} from "z80-logger";
import {
    BYTES_PER_SECTOR,
    Density,
    FloppyDisk,
    FloppyDiskGeometry,
    FloppyWrite,
    FormattedTrack,
    SectorData,
    SectorInfo, SectorPosition,
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {isDeletedDataAddressMark, USER_DATA_ADDRESS_MARK_FA} from "./TrackBytes.js";

const SECTORS_PER_TRACK = 10;
const BYTES_PER_TRACK = BYTES_PER_SECTOR * SECTORS_PER_TRACK;
/**
 * The cylinder whose sectors JV1 reads with a deleted data address mark, where TRSDOS 2.3 keeps its
 * directory. JV1 can't record marks, so this is the only place a directory's deleted marks survive.
 */
export const JV1_DIRECTORY_CYLINDER = 17;

/**
 * Floppy disk in the JV1 format.
 *
 * www.tim-mann.org/trs80/dskspec.html
 */
export class Jv1FloppyDisk extends FloppyDisk {
    public readonly className = "Jv1FloppyDisk";
    private readonly geometry: FloppyDiskGeometry;
    // Data address marks written since the disk was loaded, by sector offset in the file.
    // JV1 has nowhere to store them, so they last only as long as this object, but that's
    // enough for a DOS that writes its directory with deleted marks and reads it back.
    private readonly writtenDataAddressMarks = new Map<number, number>();

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        super(binary, error, annotations);

        // Figure out geometry.
        const sectorCount = binary.length / BYTES_PER_SECTOR;
        const sideCount = 1;
        const density = Density.SINGLE;
        const cylinderCount = Math.floor(sectorCount / sideCount / SECTORS_PER_TRACK);

        const sectorInfos: SectorInfo[] = [];
        for (let i = 0; i < sectorCount; i++) {
            const cylinderNumber = Math.floor(i / SECTORS_PER_TRACK);
            // 0-based on JV1.
            const sectorNumber = i % SECTORS_PER_TRACK;
            const sectorPosition = SectorPosition.make(cylinderNumber, 0, sectorNumber);
            const sectorInfo = new SectorInfo(sectorPosition, density, BYTES_PER_SECTOR);
            if (cylinderNumber === JV1_DIRECTORY_CYLINDER) {
                // Directory sectors are marked as deleted in TRSDOS 2.3.
                sectorInfo.deleted = true;
                sectorInfo.dataAddressMark = USER_DATA_ADDRESS_MARK_FA;
            }
            sectorInfos.push(sectorInfo);
        }

        const geometry = FloppyDiskGeometry.make(cylinderCount, sideCount, sectorInfos);
        if (geometry === undefined) {
            // The decoder rejects empty files.
            throw new Error("JV1 disk has no sectors on cylinder 0");
        }
        this.geometry = geometry;
    }

    public getDescription(): string {
        return "Floppy disk (JV1)";
    }

    public getGeometry(): FloppyDiskGeometry {
        return this.geometry;
    }

    public isWriteProtected(): boolean {
        // We support writing, but our file format doesn't have a bit for write protect, so
        // all we have is the mounted state.
        return this.mountedWriteProtected;
    }

    /**
     * Read a sector. JV1 stores only the data, so the ID field is assumed to match the position,
     * and the directory cylinder's sectors are marked deleted, as TRSDOS 2.3 writes them. A sector
     * written since the disk was loaded has the data address mark it was written with.
     */
    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        TRS80_FLOPPY_LOGGER.trace(`JV1: Reading sector ${sectorPosition.key()}`);

        // Check for errors.
        if (!this.isValidSectorPosition(sectorPosition)) {
            return undefined;
        }

        // Offset straight into data.
        const offset = this.getSectorPositionOffset(sectorPosition);
        if (offset + BYTES_PER_SECTOR > this.binary.length) {
            return undefined;
        }

        const data = this.padSector(this.binary.subarray(offset, offset + BYTES_PER_SECTOR), BYTES_PER_SECTOR);

        const sectorData = new SectorData(data, sectorPosition, Density.SINGLE);
        const writtenDataAddressMark = this.writtenDataAddressMarks.get(offset);
        if (writtenDataAddressMark !== undefined) {
            sectorData.deleted = isDeletedDataAddressMark(writtenDataAddressMark);
            sectorData.dataAddressMark = writtenDataAddressMark;
        } else if (sectorPosition.cylinderNumber === JV1_DIRECTORY_CYLINDER) {
            // Directory sectors are marked as deleted in TRSDOS 2.3, with the Model I's mark.
            sectorData.deleted = true;
            sectorData.dataAddressMark = USER_DATA_ADDRESS_MARK_FA;
        }

        return sectorData;
    }

    /**
     * Write a sector's data. JV1 has nowhere to store the data address mark, so we remember it
     * only until the disk is reloaded.
     *
     * @throws if the disk is mounted write-protected, has no such sector, or the data is the wrong size.
     */
    public writeSector(sectorPosition: SectorPosition, data: SectorData): void {
        if (this.isWriteProtected()) {
            throw new Error("tried to write sector to JV1 but it's write protected");
        }
        // Offset straight into data.
        const offset = this.getSectorPositionOffset(sectorPosition);
        if (!this.isValidSectorPosition(sectorPosition) || offset + BYTES_PER_SECTOR > this.binary.length) {
            throw new Error(`JV1 has no sector ${sectorPosition.key()} to write`);
        }
        if (data.data.length !== BYTES_PER_SECTOR) {
            throw new Error(`size mismatch when writing sector (${BYTES_PER_SECTOR} vs. ${data.data.length})`);
        }

        this.write(new FloppyWrite(data.data, offset));
        this.writtenDataAddressMarks.set(offset, data.getDataAddressMark());
    }

    /**
     * Format a track. JV1 can only hold its one layout, so anything else fails.
     *
     * @return whether successful.
     */
    public formatTrack(formattedTrack: FormattedTrack): boolean {
        const {cylinderNumber, side} = formattedTrack.trackPosition;

        // JV1 can only hold its one layout: a single-density track of ten 256-byte sectors
        // numbered 0 to 9 (in any order), whose ID fields match where they are. It also
        // can't grow.
        if (formattedTrack.doubleDensity ||
            side !== 0 ||
            cylinderNumber >= this.geometry.cylinderCount ||
            formattedTrack.sectors.length !== SECTORS_PER_TRACK) {

            return false;
        }
        const sectorNumbers = new Set<number>();
        for (const sector of formattedTrack.sectors) {
            if (!sector.sectorPosition.trackPosition.equals(formattedTrack.trackPosition) ||
                sector.data.length !== BYTES_PER_SECTOR ||
                !this.isValidSectorPosition(sector.sectorPosition)) {

                return false;
            }
            sectorNumbers.add(sector.sectorPosition.sectorNumber);
        }
        if (sectorNumbers.size !== SECTORS_PER_TRACK) {
            return false;
        }

        // Write the sectors' fill data, and remember their data address marks.
        for (const sector of formattedTrack.sectors) {
            const offset = this.getSectorPositionOffset(sector.sectorPosition);
            this.write(new FloppyWrite(sector.data, offset));
            this.writtenDataAddressMarks.set(offset, sector.getDataAddressMark());
        }

        return true;
    }

    /**
     * Whether the sector position is within range for this disk.
     */
    private isValidSectorPosition(sectorPosition: SectorPosition): boolean {
        return sectorPosition.cylinderNumber >= 0 &&
            sectorPosition.cylinderNumber < this.geometry.cylinderCount &&
            sectorPosition.side === 0 &&
            sectorPosition.sectorNumber >= 0 &&
            sectorPosition.sectorNumber < SECTORS_PER_TRACK;
    }

    /**
     * Get the offset within the file of this sector.
     */
    private getSectorPositionOffset(sectorPosition: SectorPosition): number {
        return (SECTORS_PER_TRACK*sectorPosition.cylinderNumber + sectorPosition.sectorNumber)*BYTES_PER_SECTOR;
    }
}

/**
 * Decode a JV1 floppy disk file.
 */
export function decodeJv1FloppyDisk(binary: Uint8Array): Jv1FloppyDisk | undefined {
    const annotations: ProgramAnnotation[] = [];
    const length = binary.length;

    // Length check. An empty file isn't a disk.
    if (length === 0 || length % BYTES_PER_TRACK !== 0) {
        return undefined;
    }

    // Create annotations.
    for (let byteOffset = 0; byteOffset < length; byteOffset += BYTES_PER_SECTOR) {
        const cylinderNumber = Math.floor(byteOffset/BYTES_PER_TRACK);
        const sectorNumber = (byteOffset - cylinderNumber*BYTES_PER_TRACK)/BYTES_PER_SECTOR;
        annotations.push(new ProgramAnnotation("Cylinder " + cylinderNumber + ", sector " + sectorNumber,
            byteOffset, Math.min(byteOffset + BYTES_PER_SECTOR, length)));
    }

    return new Jv1FloppyDisk(binary, undefined, annotations);
}

/**
 * Make a copy of a JV1 image that keeps only its first cylinders. JV1 is just the sectors in order, so
 * this is the start of the file. (JV1 has only one side, so there's no side to drop.)
 *
 * @param disk the image to copy. It isn't changed.
 * @param cylinderCount the cylinders to keep, from cylinder 0. Asking for more than the image has keeps
 * what it has.
 * @return the new image, or undefined if the count isn't a positive whole number.
 */
export function trimJv1FloppyDisk(disk: Jv1FloppyDisk, cylinderCount: number): Jv1FloppyDisk | undefined {
    if (!Number.isInteger(cylinderCount) || cylinderCount < 1) {
        return undefined;
    }

    const byteCount = Math.min(disk.binary.length, cylinderCount*BYTES_PER_TRACK);
    return decodeJv1FloppyDisk(disk.binary.slice(0, byteCount));
}

/**
 * One sector to put in a new JV1 image.
 */
export interface Jv1SectorToWrite {
    /**
     * The cylinder, which is also the track.
     */
    cylinder: number;

    /**
     * The sector number, 0 to 9.
     */
    sectorNumber: number;

    /**
     * The sector's 256 bytes.
     */
    data: Uint8Array;
}

/**
 * The byte that fills the sectors of a new JV1 image that nothing was written to.
 */
const JV1_FILL_BYTE = 0xE5;

/**
 * Make a JV1 image from sectors. JV1 has a sector at every position of every track up to the last, so a
 * sector that isn't given is filled with 0xE5. The image has no marks or CRCs: the reader makes the
 * directory cylinder's sectors deleted, and everything else normal.
 *
 * @param sectors the sectors to place. Their positions must be valid and distinct.
 * @param cylinderCount how many cylinders the image has.
 * @return the new image, or undefined if the count is out of range, a sector is outside the image or the wrong
 * size, or the image has no sectors.
 */
export function makeJv1FloppyDisk(sectors: Jv1SectorToWrite[], cylinderCount: number): Jv1FloppyDisk | undefined {
    if (!Number.isInteger(cylinderCount) || cylinderCount < 1 || cylinderCount > 254) {
        return undefined;
    }

    const binary = new Uint8Array(cylinderCount*BYTES_PER_TRACK).fill(JV1_FILL_BYTE);
    for (const sector of sectors) {
        const valid = sector.cylinder >= 0 && sector.cylinder < cylinderCount &&
            sector.sectorNumber >= 0 && sector.sectorNumber < SECTORS_PER_TRACK &&
            sector.data.length === BYTES_PER_SECTOR;
        if (!valid) {
            return undefined;
        }
        binary.set(sector.data, (sector.cylinder*SECTORS_PER_TRACK + sector.sectorNumber)*BYTES_PER_SECTOR);
    }

    return decodeJv1FloppyDisk(binary);
}
