import { TRS80_FLOPPY_LOGGER } from "trs80-logger";
import {Density, FloppyDisk, FloppyDiskGeometry, FloppyWrite, SectorData, Side, TrackGeometry} from "./FloppyDisk.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";

const BYTES_PER_SECTOR = 256;
const SECTORS_PER_TRACK = 10;
const BYTES_PER_TRACK = BYTES_PER_SECTOR * SECTORS_PER_TRACK;
const DIRECTORY_TRACK = 17;

/**
 * Floppy disk in the JV1 format.
 */
export class Jv1FloppyDisk extends FloppyDisk {
    public readonly className = "Jv1FloppyDisk";
    private readonly geometry: FloppyDiskGeometry;

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        super(binary, error, annotations, false);

        // Figure out geometry.
        const sectorCount = binary.length / BYTES_PER_SECTOR;
        let sideCount: number;
        let density: Density;
        if (sectorCount <= 40*10*1) {
            // Single sided, 40 tracks, 10 sectors per track.
            density = Density.SINGLE;
            sideCount = 1;
        } else if (sectorCount <= 40*18*1) {
            // Single sided, 40 tracks, 18 sectors per track.
            density = Density.DOUBLE;
            sideCount = 1;
        } else if (sectorCount <= 40*10*2) {
            // Double sided, 40 tracks, 10 sectors per track.
            density = Density.SINGLE;
            sideCount = 2;
        } else {
            // Double sided, 40 tracks, 18 sectors per track.
            density = Density.DOUBLE;
            sideCount = 2;
        }
        const sectorsPerTrack = density === Density.SINGLE ? 10 : 18;
        const trackCount = Math.floor(sectorCount / sideCount / sectorsPerTrack);

        this.geometry = new FloppyDiskGeometry(
            new TrackGeometry(
                0,
                0, sideCount - 1,
                0, sectorsPerTrack - 1,
                BYTES_PER_SECTOR, density),
            new TrackGeometry(
                trackCount - 1,
                0, sideCount - 1,
                0, sectorsPerTrack - 1,
                BYTES_PER_SECTOR, density));
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

    public readSector(trackNumber: number, side: Side, sectorNumber: number | undefined): SectorData | undefined {
        TRS80_FLOPPY_LOGGER.trace(`JV1: Reading sector ${trackNumber}:${side}:${sectorNumber}`);

        sectorNumber = sectorNumber ?? 0;

        // Check for errors.
        if (trackNumber < 0 ||
            side === Side.BACK ||
            sectorNumber >= SECTORS_PER_TRACK) {

            return undefined;
        }

        // Offset straight into data.
        const offset = (SECTORS_PER_TRACK*trackNumber + sectorNumber)*BYTES_PER_SECTOR;
        if (offset >= this.binary.length) {
            return undefined;
        }

        const data = this.padSector(this.binary.subarray(offset, offset + BYTES_PER_SECTOR), BYTES_PER_SECTOR);

        const sectorData = new SectorData(data, Density.SINGLE);
        if (trackNumber === DIRECTORY_TRACK) {
            // Directory sectors are marked as deleted in TRSDOS.
            sectorData.deleted = true;
        }

        return sectorData;
    }

    public writeSector(trackNumber: number, side: Side,
                       sectorNumber: number, data: SectorData): void {

        if (trackNumber < 0 ||
            side === Side.BACK ||
            sectorNumber >= SECTORS_PER_TRACK ||
            data.data.length !== BYTES_PER_SECTOR) {

            throw new Error("invalid write sector parameter");
        }

        // Offset straight into data.
        const offset = (SECTORS_PER_TRACK*trackNumber + sectorNumber)*BYTES_PER_SECTOR;
        if (offset > this.binary.length - BYTES_PER_SECTOR) {
            throw new Error("binary too short for sector write");
        }

        this.write(new FloppyWrite(data.data, offset));
    }
}

/**
 * Decode a JV1 floppy disk file.
 */
export function decodeJv1FloppyDisk(binary: Uint8Array): Jv1FloppyDisk | undefined {
    const annotations: ProgramAnnotation[] = [];
    const length = binary.length;

    // Magic number check. Length check.
    if (length < 2 || binary[0] !== 0x00 || binary[1] !== 0xFE || length % BYTES_PER_TRACK !== 0) {
        return undefined;
    }

    // Create annotations.
    for (let byteOffset = 0; byteOffset < length; byteOffset += BYTES_PER_SECTOR) {
        const track = Math.floor(byteOffset/BYTES_PER_TRACK);
        const sector = (byteOffset - track*BYTES_PER_TRACK)/BYTES_PER_SECTOR;
        annotations.push(new ProgramAnnotation("Track " + track + ", sector " + sector,
            byteOffset, Math.min(byteOffset + BYTES_PER_SECTOR, length)));
    }

    return new Jv1FloppyDisk(binary, undefined, annotations);
}
