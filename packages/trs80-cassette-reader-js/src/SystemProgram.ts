/**
 * Tools for dealing with SYSTEM (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/
 */

import {ByteReader,EOF} from "./ByteReader";
import {toHexByte} from "z80-base";

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
}

/**
 * Whether this is a program that can be loaded with the SYSTEM command.
 */
export function isSystemProgram(binary: Uint8Array): boolean {
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

    constructor(binary: Uint8Array) {
        const b = new ByteReader(binary);

        const headerByte = b.read();
        if (headerByte === EOF) {
            this.error = "File is empty";
            return;
        }
        if (headerByte != FILE_HEADER) {
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

        while (true) {
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

            const loadAddress = b.readShort(false);
            if (loadAddress === EOF) {
                this.error = "File is truncated at load address";
                return;
            }

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

            this.chunks.push(new SystemChunk(loadAddress, data, checksum));
        }

        this.entryPointAddress = b.readShort(false);
        if (this.entryPointAddress === EOF) {
            this.error = "File is truncated at entry point address";
            this.entryPointAddress = 0;
            return;
        }
    }
}
