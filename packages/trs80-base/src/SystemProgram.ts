/**
 * Tools for dealing with SYSTEM (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/
 */

import {ByteReader, EOF} from "teamten-ts-utils";
import {toHexByte, toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation";
import {AbstractTrs80File} from "./Trs80File";

const FILE_HEADER = 0x55;
const DATA_HEADER = 0x3C;
const END_OF_FILE_MARKER = 0x78;
const FILENAME_LENGTH = 6;

/**
 * Represents a chunk of bytes from the file, with a checksum.
 */
export class SystemChunk {
    public readonly loadAddress: number;
    public readonly data: Uint8Array;
    public readonly checksum: number;

    constructor(loadAddress: number, data: Uint8Array, checksum: number) {
        this.loadAddress = loadAddress;
        this.data = data;
        this.checksum = checksum;
    }

    /**
     * Whether the checksum supplied on tape matches what we compute.
     */
    public isChecksumValid(): boolean {
        let checksum = 0;

        // Include load address and data.
        checksum += (this.loadAddress >> 8) & 0xFF;
        checksum += this.loadAddress & 0xFF;
        for (const b of this.data) {
            checksum += b;
        }
        checksum &= 0xFF;

        return checksum === this.checksum;
    }
}

/**
 * Class representing a SYSTEM (machine language) program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class SystemProgram extends AbstractTrs80File {
    public readonly className = "SystemProgram";
    public readonly filename: string;
    public readonly chunks: SystemChunk[];
    public readonly entryPointAddress: number;
    public readonly annotations: ProgramAnnotation[];

    constructor(binary: Uint8Array, error: string | undefined, filename: string, chunks: SystemChunk[],
                entryPointAddress: number, annotations: ProgramAnnotation[]) {

        super(binary, error, annotations);
        this.filename = filename;
        this.chunks = chunks;
        this.entryPointAddress = entryPointAddress;
        this.annotations = annotations;
    }

    public getDescription(): string {
        return "System program (" + this.filename + ")";
    }

    /**
     * Convert an address in memory to the original byte offset in the binary. Returns undefined if
     * not found in any chunk.
     */
    public addressToByteOffset(address: number): number | undefined {
        // Skip file header and block header.
        let offset = 1 + FILENAME_LENGTH + 4;

        for (const chunk of this.chunks) {
            if (address >= chunk.loadAddress && address < chunk.loadAddress + chunk.data.length) {
                return offset + (address - chunk.loadAddress);
            }

            // Skip checksum and block header of the next block.
            offset += chunk.data.length + 5;
        }

        return undefined;
    }
}

/**
 * Decodes a system program from the binary. If the binary is not at all a system
 * program, returns undefined. If it's a system program with decoding errors, returns
 * partially-decoded binary and sets the "error" field.
 */
export function decodeSystemProgram(binary: Uint8Array): SystemProgram | undefined {
    const chunks: SystemChunk[] = [];
    const annotations: ProgramAnnotation[] = [];
    let entryPointAddress = 0;

    const b = new ByteReader(binary);

    const headerByte = b.read();
    if (headerByte === EOF) {
        return undefined;
    }
    if (headerByte !== FILE_HEADER) {
        return undefined;
    }
    annotations.push(new ProgramAnnotation("System file header", b.addr() - 1, b.addr()));

    let filename = b.readString(FILENAME_LENGTH);

    // Make a SystemProgram object with what we have so far.
    const makeSystemProgram = (error?: string) => {
        const programBinary = binary.subarray(0, b.addr());
        return new SystemProgram(programBinary, error, filename, chunks, entryPointAddress, annotations);
    };

    if (filename.length < FILENAME_LENGTH) {
        // Binary is truncated.
        return makeSystemProgram("File is truncated at filename");
    }
    filename = filename.trim();
    annotations.push(new ProgramAnnotation(`Filename "${filename}"`,
        b.addr() - FILENAME_LENGTH, b.addr()));

    while (true) {
        const marker = b.read();
        if (marker === EOF) {
            return makeSystemProgram("File is truncated at start of block");
        }
        if (marker === END_OF_FILE_MARKER) {
            annotations.push(new ProgramAnnotation("End of file marker", b.addr() - 1, b.addr()));
            break;
        }
        if (marker !== DATA_HEADER) {
            // Here if the marker is 0x55, we could guess that it's a high-speed cassette header.
            return makeSystemProgram("Unexpected byte " + toHexByte(marker) + " at start of block");
        }
        annotations.push(new ProgramAnnotation("Data chunk marker", b.addr() - 1, b.addr()));

        let length = b.read();
        if (length === EOF) {
            return makeSystemProgram("File is truncated at block length");
        }
        // 0 means 256.
        if (length === 0) {
            length = 256;
        }
        annotations.push(new ProgramAnnotation(`Length (${length} byte${length === 1 ? "" : "s"})`,
            b.addr() - 1, b.addr()));

        const loadAddress = b.readShort(false);
        if (loadAddress === EOF) {
            return makeSystemProgram("File is truncated at load address");
        }
        annotations.push(new ProgramAnnotation(`Address (0x${toHexWord(loadAddress)})`,
            b.addr() - 2, b.addr()));

        const dataStartAddr = b.addr();
        const data = b.readBytes(length);
        if (data.length < length) {
            return makeSystemProgram("File is truncated at data");
        }
        annotations.push(new ProgramAnnotation(`Chunk data`, dataStartAddr, b.addr()));

        const checksum = b.read();
        if (loadAddress === EOF) {
            return makeSystemProgram("File is truncated at checksum");
        }

        const systemChunk = new SystemChunk(loadAddress, data, checksum);
        chunks.push(systemChunk);

        annotations.push(new ProgramAnnotation(
            `Checksum (0x${toHexByte(checksum)}, ${systemChunk.isChecksumValid() ? "" : "in"}valid)`,
            b.addr() - 1, b.addr()));
    }

    entryPointAddress = b.readShort(false);
    if (entryPointAddress === EOF) {
        entryPointAddress = 0;
        return makeSystemProgram("File is truncated at entry point address");
    }
    annotations.push(new ProgramAnnotation(`Jump address (0x${toHexWord(entryPointAddress)})`,
        b.addr() - 2, b.addr()));

    return makeSystemProgram();
}
