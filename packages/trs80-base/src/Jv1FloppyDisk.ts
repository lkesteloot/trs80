import {TRS80_FLOPPY_LOGGER} from "trs80-logger";
import {
    BYTES_PER_SECTOR,
    Density,
    FloppyDisk,
    FloppyDiskGeometry,
    FloppyWrite,
    SectorData,
    SectorInfo, SectorPosition,
    Side
} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";

const SECTORS_PER_TRACK = 10;
const BYTES_PER_TRACK = BYTES_PER_SECTOR * SECTORS_PER_TRACK;
const DIRECTORY_CYLINDER = 17;

/**
 * Floppy disk in the JV1 format.
 *
 * www.tim-mann.org/trs80/dskspec.html
 */
export class Jv1FloppyDisk extends FloppyDisk {
    public readonly className = "Jv1FloppyDisk";
    private readonly geometry: FloppyDiskGeometry;

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        super(binary, error, annotations, false);

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
            const sectorPosition = new SectorPosition(cylinderNumber, Side.FRONT, sectorNumber);
            const sectorInfo = new SectorInfo(sectorPosition, density, BYTES_PER_SECTOR);
            if (cylinderNumber === DIRECTORY_CYLINDER) {
                // Directory sectors are marked as deleted in TRSDOS 2.3.
                sectorInfo.deleted = true;
            }
            sectorInfos.push(sectorInfo);
        }

        this.geometry = new FloppyDiskGeometry(cylinderCount, sideCount, sectorInfos);
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

    public readSector(sectorPosition: SectorPosition): SectorData | undefined {
        TRS80_FLOPPY_LOGGER.trace(`JV1: Reading sector ${sectorPosition.toString()}`);

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
        if (sectorPosition.cylinderNumber === DIRECTORY_CYLINDER) {
            // Directory sectors are marked as deleted in TRSDOS 2.3.
            sectorData.deleted = true;
        }

        return sectorData;
    }

    public writeSector(sectorPosition: SectorPosition, data: SectorData): void {
        // Check for errors.
        if (!this.isValidSectorPosition(sectorPosition) || data.data.length !== BYTES_PER_SECTOR) {
            throw new Error("invalid write sector parameter");
        }

        // Offset straight into data.
        const offset = this.getSectorPositionOffset(sectorPosition);
        if (offset + BYTES_PER_SECTOR > this.binary.length) {
            throw new Error("binary too short for sector write");
        }

        this.write(new FloppyWrite(data.data, offset));
    }

    /**
     * Whether the sector position is within range for this disk.
     */
    private isValidSectorPosition(sectorPosition: SectorPosition): boolean {
        return sectorPosition.cylinderNumber >= 0 &&
            sectorPosition.cylinderNumber < this.geometry.cylinderCount &&
            sectorPosition.side === Side.FRONT &&
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

    // Length check.
    if (length > 0 && length % BYTES_PER_TRACK !== 0) {
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
