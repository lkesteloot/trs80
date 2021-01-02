import {ProgramAnnotation} from "./ProgramAnnotation";
import {Trs80File} from "./Trs80File";

const BYTES_PER_SECTOR = 256;
const SECTORS_PER_TRACK = 10;
const BYTES_PER_TRACK = BYTES_PER_SECTOR * SECTORS_PER_TRACK;

/**
 * Floppy disk in the JV1 format.
 */
export class Jv1FloppyDisk extends Trs80File {
    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[]) {
        super(binary, error, annotations);
    }

    public getDescription(): string {
        return "Floppy disk (JV1)";
    }
}

/**
 * Decode a JV1 floppy disk file. These have no structure, so they always succeed.
 */
export function decodeJv1FloppyDisk(binary: Uint8Array): Jv1FloppyDisk {
    let error: string | undefined;
    const annotations: ProgramAnnotation[] = [];

    // Basic sanity check.
    const length = binary.length;
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
