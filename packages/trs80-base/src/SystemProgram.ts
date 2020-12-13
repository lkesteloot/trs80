/**
 * Tools for dealing with SYSTEM (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/
 */

import {ByteReader, EOF} from "teamten-ts-utils";
import {toHexByte, toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation";

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
 * Whether this is a program that can be loaded with the SYSTEM command.
 */
export function isSystemProgram(binary: Uint8Array): boolean {
    // TODO perhaps be more strict here, like check if next 6 bytes are ASCII,
    // then next byte is either 3C or 78. The initial byte 55 is too similar to
    // high-speed cassette header.
    return binary != null &&
        binary.length >= 1 &&
        binary[0] === FILE_HEADER;
}

/**
 * Class representing a SYSTEM (machine language) program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class SystemProgram {
    public filename = "";
    public chunks: SystemChunk[] = [];
    public entryPointAddress = 0;
    public error: string | undefined;
    public annotations: ProgramAnnotation[] = [];

    constructor(binary: Uint8Array) {
        const b = new ByteReader(binary);

        this.annotations.push(new ProgramAnnotation("File\nHead", b.addr(), b.addr()));
        const headerByte = b.read();
        if (headerByte === EOF) {
            this.error = "File is empty";
            return;
        }
        if (headerByte !== FILE_HEADER) {
            this.error = "Not a SYSTEM file";
            return;
        }

        this.filename = b.readString(FILENAME_LENGTH);
        if (this.filename.length < FILENAME_LENGTH) {
            // Binary is truncated.
            this.error = "File is truncated at filename";
            return;
        }
        this.filename = this.filename.trim();
        this.annotations.push(new ProgramAnnotation("Filename\n\"" + this.filename + "\"",
            b.addr() - FILENAME_LENGTH, b.addr() - 1));

        while (true) {
            this.annotations.push(new ProgramAnnotation("Data\nHead", b.addr(), b.addr()));
            const marker = b.read();
            if (marker === EOF) {
                this.error = "File is truncated at start of block";
                return;
            }
            if (marker === END_OF_FILE_MARKER) {
                break;
            }
            if (marker !== DATA_HEADER) {
                this.error = "Unexpected byte " + toHexByte(marker) + " at start of block";
                return;
            }

            let length = b.read();
            if (length === EOF) {
                this.error = "File is truncated at block length";
                return;
            }
            // 0 means 256.
            if (length === 0) {
                length = 256;
            }
            this.annotations.push(new ProgramAnnotation("Len\n" + length, b.addr() - 1, b.addr() - 1));

            const loadAddress = b.readShort(false);
            if (loadAddress === EOF) {
                this.error = "File is truncated at load address";
                return;
            }
            this.annotations.push(new ProgramAnnotation("Addr\n" + toHexWord(loadAddress),
                b.addr() - 2, b.addr() - 1));

            const data = b.readBytes(length);
            if (data.length < length) {
                this.error = "File is truncated at data";
                return;
            }

            const checksum = b.read();
            if (loadAddress === EOF) {
                this.error = "File is truncated at checksum";
                return;
            }
            this.annotations.push(new ProgramAnnotation("XSum\n0x" + toHexByte(checksum), b.addr() - 1, b.addr() - 1));

            this.chunks.push(new SystemChunk(loadAddress, data, checksum));
        }

        this.entryPointAddress = b.readShort(false);
        if (this.entryPointAddress === EOF) {
            this.error = "File is truncated at entry point address";
            this.entryPointAddress = 0;
            return;
        }
        this.annotations.push(new ProgramAnnotation("Run\n" + toHexWord(this.entryPointAddress),
            b.addr() - 2, b.addr() - 1));
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
