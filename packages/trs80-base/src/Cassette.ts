import {decodeSystemProgram} from "./SystemProgram";
import {AbstractTrs80File} from "./Trs80File";
import {decodeTrs80File} from "./Trs80FileDecoder";
import {ProgramAnnotation} from "./ProgramAnnotation";
import {Trs80File} from "./Trs80FileDecoder";

// Low-speed header and sync constants.
const LOW_SPEED_HEADER_BYTE = 0x00;
const LOW_SPEED_SYNC_BYTE = 0xA5;
const LOW_SPEED_ACCEPTABLE_HEADER =
    (LOW_SPEED_HEADER_BYTE << 24) |
    (LOW_SPEED_HEADER_BYTE << 16) |
    (LOW_SPEED_HEADER_BYTE << 8) |
    (LOW_SPEED_HEADER_BYTE << 0);
const LOW_SPEED_DETECT =
    (LOW_SPEED_HEADER_BYTE << 24) |
    (LOW_SPEED_HEADER_BYTE << 16) |
    (LOW_SPEED_HEADER_BYTE << 8) |
    (LOW_SPEED_SYNC_BYTE << 0);

// High-speed header and sync constants.
const HIGH_SPEED_HEADER_BYTE = 0x55;
const HIGH_SPEED_SYNC_BYTE = 0x7F;
const HIGH_SPEED_ACCEPTABLE_HEADER1 =
    (HIGH_SPEED_HEADER_BYTE << 24) |
    (HIGH_SPEED_HEADER_BYTE << 16) |
    (HIGH_SPEED_HEADER_BYTE << 8) |
    (HIGH_SPEED_HEADER_BYTE << 0);
const HIGH_SPEED_ACCEPTABLE_HEADER2 = ~HIGH_SPEED_ACCEPTABLE_HEADER1;
const HIGH_SPEED_DETECT =
    (HIGH_SPEED_HEADER_BYTE << 24) |
    (HIGH_SPEED_HEADER_BYTE << 16) |
    (HIGH_SPEED_HEADER_BYTE << 8) |
    (HIGH_SPEED_SYNC_BYTE << 0);

export enum CassetteSpeed {
    LOW_SPEED,
    HIGH_SPEED,
}

/**
 * See if actual and reference are equal, modulo some bit offset.
 *
 * @param actual the last 32 bits of the stream.
 * @param reference the 32 bits we're looking for.
 * @return the number of extra bits (0 to 7 inclusive) in "actual" after the end of reference,
 * or undefined if not a match.
 */
function checkMatch(actual: number, reference: number): number | undefined {
    for (let offset = 0; offset < 8; offset++) {
        if ((actual & ~((1 << offset) - 1)) === reference << offset) {
            return offset;
        }
    }

    return undefined;
}

/**
 * Represents a file on a cassette. (Not the CAS file itself.)
 */
export class CassetteFile {
    // Offset into the cassette's binary.
    public readonly offset: number;
    public readonly speed: CassetteSpeed;
    public readonly file: Trs80File;

    constructor(offset: number, speed: CassetteSpeed, file: Trs80File) {
        this.offset = offset;
        this.speed = speed;
        this.file = file;
    }

    /**
     * Return the file's annotations adjusted by the offset into the cassette.
     */
    public adjustedAnnotations(): ProgramAnnotation[] {
        return this.file.annotations.map(annotation => annotation.adjusted(this.offset));
    }
}

/**
 * Represents a cassette (CAS file).
 */
export class Cassette extends AbstractTrs80File {
    public readonly className = "Cassette";
    public readonly files: CassetteFile[];

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                files: CassetteFile[]) {
        super(binary, error, annotations);
        this.files = files;
    }

    public getDescription(): string {
        if (this.files.length === 0) {
            return "Empty cassette";
        } else if (this.files.length === 1) {
            const cassetteFile = this.files[0];
            return cassetteFile.file.getDescription() + " on a " +
                (cassetteFile.speed === CassetteSpeed.LOW_SPEED ? "low" : "high") + " speed cassette";
        } else {
            return "Cassette with " + this.files.length + " files";
        }
    }
}

/**
 * High-speed CAS files have start bits built-in. Strip these out because
 * we re-insert them below when encoding. We could also remove the
 * writing of start bits below, but we don't really know how many bits
 * there are at the end that we shouldn't write.
 *
 * Update: We no longer insert start bits in encodeHighSpeed(), so this
 * routine is no longer necessary, but we keep it around anyway.
 */
function stripStartBits(inBytes: Uint8Array): Uint8Array {
    // Compute new size of array.
    const outBytes = new Uint8Array(Math.floor(inBytes.length*8/9));

    // Fill output buffer.
    for (let i = 0; i < outBytes.length; i++) {
        // Index of most-significant data bit.
        const bitIndex =  i*9 + 1;
        const byteIndex = Math.floor(bitIndex/8);
        const bitOffset = bitIndex%8;

        let value = inBytes[byteIndex] << bitOffset;
        if (bitOffset !== 0) {
            value |= inBytes[byteIndex + 1] >> (8 - bitOffset);
        }
        outBytes[i] = value;
    }

    return outBytes;
}

/**
 * Decodes a CAS from the binary. If the binary is not at all a cassette,
 * returns undefined. If it's a cassette with decoding errors, returns
 * partially-decoded object and sets the "error" field.
 */
export function decodeCassette(binary: Uint8Array): Cassette | undefined {
    const start = 0;
    const annotations: ProgramAnnotation[] = [];
    const cassetteFiles: CassetteFile[] = [];

    while (true) {
        let recentBits = 0xFFFFFFFF;
        let programBinary: Uint8Array | undefined;
        let speed: CassetteSpeed | undefined;
        let programStartIndex = 0;

        for (let i = start; i < binary.length; i++) {
            const byte = binary[i];
            recentBits = (recentBits << 8) | byte;

            const lowSpeedBitOffset = checkMatch(recentBits, LOW_SPEED_DETECT);
            if (lowSpeedBitOffset !== undefined) {
                if (lowSpeedBitOffset !== 0) {
                    // TODO
                    throw new Error("We don't yet handle low-speed cassettes with bit offsets of " + lowSpeedBitOffset);
                }

                annotations.push(new ProgramAnnotation("Low speed header", 0, i));
                annotations.push(new ProgramAnnotation("Low speed sync byte", i, i + 1));

                speed = CassetteSpeed.LOW_SPEED;
                programStartIndex = i + 1;
                programBinary = binary.subarray(programStartIndex);
                break;
            }

            const highSpeedBitOffset = checkMatch(recentBits, HIGH_SPEED_DETECT);
            if (highSpeedBitOffset !== undefined) {
                if (highSpeedBitOffset !== 0) {
                    // TODO
                    throw new Error("We don't yet handle high-speed cassettes with bit offsets of " +
                        highSpeedBitOffset);
                }

                annotations.push(new ProgramAnnotation("High speed header", 0, i));
                annotations.push(new ProgramAnnotation("High speed sync byte", i, i + 1));

                speed = CassetteSpeed.HIGH_SPEED;
                programStartIndex = i + 1;
                programBinary = stripStartBits(binary.subarray(programStartIndex));
                break;
            }

            if (i >= start + 4 &&
                recentBits !== LOW_SPEED_ACCEPTABLE_HEADER &&
                recentBits !== HIGH_SPEED_ACCEPTABLE_HEADER1 &&
                recentBits !== HIGH_SPEED_ACCEPTABLE_HEADER2) {

                // We should be seeing the header bits.
                break;
            }
        }

        if (programBinary === undefined || speed === undefined) {
            // Not a CAS file.
            return undefined;
        }

        // See what kind of file it is. System program aren't decoded by decodeTrs80File() because
        // these are always on cassettes or with a .3BN extension. So try that ourselves first.
        let file: Trs80File | undefined = decodeSystemProgram(programBinary);
        if (file === undefined) {
            file = decodeTrs80File(programBinary, undefined);
        }
        cassetteFiles.push(new CassetteFile(programStartIndex, speed, file));

        // TODO handle multiple files. See HAUNT.CAS.
        break;
    }

    // Merge the annotations of the files into ours.
    for (const file of cassetteFiles) {
        annotations.push(... file.adjustedAnnotations());
    }

    return new Cassette(binary, undefined, annotations, cassetteFiles);
}
