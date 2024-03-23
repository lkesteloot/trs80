/**
 * Handles Intel Hex files.
 *
 * https://en.wikipedia.org/wiki/Intel_HEX
 */

import {hi, lo, toHexByte } from "z80-base";
import {ProgramBuilder} from "./ProgramBuilder.js";

export const INTEL_HEX_RECORD_TYPE_DATA = 0;
export const INTEL_HEX_RECORD_TYPE_END_OF_FILE = 1;
export const INTEL_HEX_RECORD_TYPE_EXTENDED_SEGMENT_ADDRESS = 2;
export const INTEL_HEX_RECORD_TYPE_START_SEGMENT_ADDRESS = 3;
export const INTEL_HEX_RECORD_TYPE_EXTENDED_LINEAR_ADDRESS = 4;
export const INTEL_HEX_RECORD_TYPE_START_LINEAR_ADDRESS = 5;

// In principle any value, but Wikipedia says that some tools don't handle
// records with more than 16 bytes.
const MAX_DATA_SIZE = 16;

export type IntelHexRecordType =
    typeof INTEL_HEX_RECORD_TYPE_DATA |
    typeof INTEL_HEX_RECORD_TYPE_END_OF_FILE |
    typeof INTEL_HEX_RECORD_TYPE_EXTENDED_SEGMENT_ADDRESS |
    typeof INTEL_HEX_RECORD_TYPE_START_SEGMENT_ADDRESS |
    typeof INTEL_HEX_RECORD_TYPE_EXTENDED_LINEAR_ADDRESS |
    typeof INTEL_HEX_RECORD_TYPE_START_LINEAR_ADDRESS;

/**
 * Compute the checksum for the bytes in a record.
 */
function computeChecksum(bytes: number[]): number {
    const sum = bytes.reduce((partial, byte) => partial + byte, 0);
    return lo(-sum);
}

/**
 * A single Intex Hex format record.
 */
export class IntelHexRecord {
    public readonly address: number;
    public readonly recordType: IntelHexRecordType;
    public readonly data: Uint8Array;

    private constructor(address: number, recordType: IntelHexRecordType, data: Uint8Array) {
        this.address = address;
        this.recordType = recordType;
        this.data = data;
    }

    /**
     * Make a new record for data.
     * @param address 16-bit address
     * @param data between 1 and 16 bytes of data (inclusive)
     */
    public static fromData(address: number, data: Uint8Array): IntelHexRecord {
        return new IntelHexRecord(address, INTEL_HEX_RECORD_TYPE_DATA, data);
    }

    public static endOfFile(): IntelHexRecord {
        return new IntelHexRecord(0, INTEL_HEX_RECORD_TYPE_END_OF_FILE, new Uint8Array(0));
    }

    /**
     * Make the one-line text record.
     */
    public generateRecord(): string {
        const bytes = [
            this.data.length,
            // Big endian address:
            hi(this.address),
            lo(this.address),
            this.recordType,
            ... this.data,
            ];
        bytes.push(computeChecksum(bytes));

        return ":" + bytes.map(b => toHexByte(b).toUpperCase()).join("");
    }
}

/**
 * Builds Intel Hex records from binary chunks.
 */
export class IntelHexFileBuilder extends ProgramBuilder {
    /**
     * Get data records for the bytes given so far. Does not include the end of file record.
     */
    public getChunks(): IntelHexRecord[] {
        // Sort blocks by address.
        this.blocks.sort((a, b) => a.address - b.address);

        return this.blocks
            .flatMap(block => block.breakInto(MAX_DATA_SIZE))
            .map(block => IntelHexRecord.fromData(block.address, new Uint8Array(block.bytes)));
    }
}
