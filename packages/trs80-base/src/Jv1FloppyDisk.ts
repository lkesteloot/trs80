import {FloppyDisk, SectorData, Side} from "./FloppyDisk";
import {ProgramAnnotation} from "./ProgramAnnotation";

const BYTES_PER_SECTOR = 256;
const SECTORS_PER_TRACK = 10;
const BYTES_PER_TRACK = BYTES_PER_SECTOR * SECTORS_PER_TRACK;
const DIRECTORY_TRACK = 17;

/**
 * Floppy disk in the JV1 format.
 */
export class Jv1FloppyDisk extends FloppyDisk {
    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        super(binary, error, annotations, false);
    }

    public getDescription(): string {
        return "Floppy disk (JV1)";
    }

    public readSector(trackNumber: number, side: Side, sectorNumber: number | undefined): SectorData | undefined {
        sectorNumber = sectorNumber ?? 0;

        // Check for errors.
        if (trackNumber < 0 ||
            side === Side.BACK ||
            sectorNumber >= SECTORS_PER_TRACK) {

            return undefined;
        }

        // Offset straight into data.
        const offset = (SECTORS_PER_TRACK*trackNumber + sectorNumber)*BYTES_PER_SECTOR;
        const data = this.padSector(this.binary.subarray(offset, offset + BYTES_PER_SECTOR), BYTES_PER_SECTOR);

        const sectorData = new SectorData(data);
        if (trackNumber === DIRECTORY_TRACK) {
            // I don't know why "deleted" is used for the directory track.
            sectorData.deleted = true;
        }

        return sectorData;
    }
}

/**
 * Decode a JV1 floppy disk file.
 */
export function decodeJv1FloppyDisk(binary: Uint8Array): Jv1FloppyDisk | undefined {
    let error: string | undefined;
    const annotations: ProgramAnnotation[] = [];
    const length = binary.length;

    // Magic number check.
    if (length < 2 || binary[0] !== 0x00 || binary[1] !== 0xFE) {
        return undefined;
    }

    // Basic sanity check.
    if (length % BYTES_PER_TRACK !== 0) {
        error = "Length is not a multiple of track size (" + BYTES_PER_TRACK + " bytes)";
    }

    // Create annotations.
    for (let byteOffset = 0; byteOffset < length; byteOffset += BYTES_PER_SECTOR) {
        const track = Math.floor(byteOffset/BYTES_PER_TRACK);
        const sector = (byteOffset - track*BYTES_PER_TRACK)/BYTES_PER_SECTOR;
        annotations.push(new ProgramAnnotation("Track " + track + ", sector " + sector,
            byteOffset, Math.min(byteOffset + BYTES_PER_SECTOR, length)));
    }

    return new Jv1FloppyDisk(binary, error, annotations);
}
