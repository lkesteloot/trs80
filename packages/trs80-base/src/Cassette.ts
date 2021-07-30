import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {AbstractTrs80File} from "./Trs80File.js";
import {decodeTrs80CassetteFile, Trs80File} from "./Trs80FileDecoder.js";

// Low-speed header and sync constants.
const LOW_SPEED_HEADER_BYTE = 0x00;
const LOW_SPEED_SYNC_BYTE = 0xA5;
const LOW_SPEED_DETECT =
    (LOW_SPEED_HEADER_BYTE << 24) |
    (LOW_SPEED_HEADER_BYTE << 16) |
    (LOW_SPEED_HEADER_BYTE << 8) |
    (LOW_SPEED_SYNC_BYTE << 0);

// High-speed header and sync constants.
const HIGH_SPEED_HEADER_BYTE = 0x55;
const HIGH_SPEED_SYNC_BYTE = 0x7F;
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
 * Returns an array with the bits shifted left the given amount. Does not
 * modify the input array.
 */
function shiftLeft(inBytes: Uint8Array, shift: number): Uint8Array {
    if (shift === 0) {
        return inBytes;
    }

    const length = inBytes.length;
    const outBytes = new Uint8Array(length);

    const nextShift = 8 - shift;
    for (let i = 0; i < length; i++) {
        outBytes[i] = (inBytes[i] << shift) | (i === length - 1 ? 0x00 : inBytes[i + 1] >>> nextShift);
    }

    return outBytes;
}

/**
 * A cassette file header as detected by the findHeader() function.
 */
class Header {
    /**
     * The index into the binary where the program starts (after the sync byte).
     */
    public readonly position: number;
    /**
     * How many bits to shift the bytes left.
     */
    public readonly shift: number;
    /**
     * Detected speed of the file.
     */
    public readonly speed: CassetteSpeed;
    /**
     * Any annotations for this header.
     */
    public readonly annotations: ProgramAnnotation[];
    // TODO include where header started so that previous file can be stopped there.

    constructor(position: number, shift: number, speed: CassetteSpeed, annotations: ProgramAnnotation[]) {
        this.position = position;
        this.shift = shift;
        this.speed = speed;
        this.annotations = annotations;
    }
}

/**
 * Find a header starting at "start".
 */
function findHeader(binary: Uint8Array, start: number): Header | undefined {
    // Start with a pattern that doesn't match any header.
    let recentBits = 0xFFFFFFFF;

    for (let i = start; i < binary.length; i++) {
        recentBits = (recentBits << 8) | binary[i];

        const lowSpeedBitOffset = checkMatch(recentBits, LOW_SPEED_DETECT);
        if (lowSpeedBitOffset !== undefined) {
            if (lowSpeedBitOffset !== 0) {
                // TODO
                throw new Error("We don't yet handle low-speed cassettes with bit offsets of " + lowSpeedBitOffset);
            }

            return new Header(i + 1, 0, CassetteSpeed.LOW_SPEED, [
                new ProgramAnnotation("Low speed header", 0, i), // TODO wrong start.
                new ProgramAnnotation("Low speed sync byte", i, i + 1),
            ]);
        }

        const highSpeedBitOffset = checkMatch(recentBits, HIGH_SPEED_DETECT);
        if (highSpeedBitOffset !== undefined) {
            const shift = highSpeedBitOffset === 0 ? 0 : 8 - highSpeedBitOffset;
            const programStartIndex = i + (highSpeedBitOffset === 0 ? 1 : 0);
            return new Header(programStartIndex, shift, CassetteSpeed.HIGH_SPEED, [
                new ProgramAnnotation("High speed header", 0, i), // TODO wrong start.
                new ProgramAnnotation("High speed sync byte", i, i + 1),
            ]);
        }
    }

    return undefined;
}

/**
 * Decodes a CAS from the binary. If the binary is not at all a cassette,
 * returns undefined. If it's a cassette with decoding errors, returns
 * partially-decoded object and sets the "error" field.
 */
export function decodeCassette(binary: Uint8Array): Cassette | undefined {
    // Detect all the headers in the file.
    const headers: Header[] = [];
    let start = 0;
    while (true) {
        const header = findHeader(binary, start);
        if (header === undefined) {
            break;
        }

        headers.push(header);
        start = header.position;
    }

    if (headers.length === 0) {
        // No cassette files in binary.
        return undefined;
    }

    // Turn each header into a cassette file.
    const cassetteFiles: CassetteFile[] = [];
    const annotations: ProgramAnnotation[] = [];
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];

        // Pull out binary.
        const end = i === headers.length - 1 ? binary.length : headers[i + 1].position;
        let fileBinary = shiftLeft(binary.subarray(header.position, end), header.shift);
        if (header.speed === CassetteSpeed.HIGH_SPEED) {
            fileBinary = stripStartBits(fileBinary);
        }

        // See what kind of file it is.
        const file = decodeTrs80CassetteFile(fileBinary);
        const cassetteFile = new CassetteFile(header.position, header.speed, file);
        cassetteFiles.push(cassetteFile);

        // Merge annotations.
        annotations.push(... header.annotations);
        annotations.push(... cassetteFile.adjustedAnnotations());
    }

    return new Cassette(binary, undefined, annotations, cassetteFiles);
}
