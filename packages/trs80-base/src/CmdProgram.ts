/**
 * Tools for dealing with CMD (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/#cmdfile
 */

import {ByteReader, EOF} from "teamten-ts-utils";

// Chunk types.
export const CMD_LOAD_BLOCK = 0x01;
export const CMD_TRANSFER_ADDRESS = 0x02;
export const CMD_LOAD_MODULE_HEADER = 0x05;
export const CMD_MAX_TYPE = 0x1F;

/**
 * Represents a chunk of bytes from the file.
 */
export class CmdChunk {
    public readonly type: number;
    public readonly rawData: Uint8Array;

    constructor(type: number, data: Uint8Array) {
        this.type = type;
        this.rawData = data;
    }
}

/**
 * A chunk for loading data into memory.
 */
export class CmdLoadBlockChunk extends CmdChunk {
    public readonly address: number;
    public readonly loadData: Uint8Array;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.address = data[0] + data[1]*256;
        this.loadData = data.slice(2);
    }
}

/**
 * A chunk for jumping to the start of the program.
 */
export class CmdTransferAddressChunk extends CmdChunk {
    public readonly address: number;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.address = data.length === 2 ? (data[0] + data[1]*256) : 0;
    }
}

/**
 * A header chunk for the filename.
 */
export class CmdLoadModuleHeaderChunk extends CmdChunk {
    public readonly filename: string;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.filename = new TextDecoder("ascii").decode(data).trim().replace(/ +/g, " ");
    }
}

/**
 * Whether this is a CMD program.
 */
export function isCmdProgram(binary: Uint8Array): boolean {
    return binary != null &&
        binary.length >= 1 &&
        binary[0] <= CMD_MAX_TYPE;
}

/**
 * Class representing a CMD (machine language) program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class CmdProgram {
    public chunks: CmdChunk[] = [];
    public error: string | undefined;
    public filename = "";
    public entryPointAddress = 0;

    constructor(binary: Uint8Array) {
        const b = new ByteReader(binary);

        // Read each chunk.
        while (true) {
            // First byte is type.
            const type = b.read();
            if (type === EOF || type > CMD_MAX_TYPE) {
                return;
            }

            // Second byte is length, in bytes.
            let length = b.read();
            if (length === EOF) {
                this.error = "File is truncated at length";
                return;
            }

            // Adjust load block length.
            if (type === CMD_LOAD_BLOCK && length <= 2) {
                length += 256;
            }

            // Read the raw bytes.
            const data = b.readBytes(length);
            if (data.length < length) {
                this.error = "File is truncated at data";
            }

            // Create chunk type-specific objects.
            let chunk: CmdChunk;
            switch (type) {
                case CMD_LOAD_BLOCK:
                    chunk = new CmdLoadBlockChunk(type, data);
                    break;

                case CMD_TRANSFER_ADDRESS: {
                    const cmdTransferAddressChunk = new CmdTransferAddressChunk(type, data);
                    this.entryPointAddress = cmdTransferAddressChunk.address;
                    chunk = cmdTransferAddressChunk;
                    break;
                }

                case CMD_LOAD_MODULE_HEADER: {
                    const cmdLoadModuleHeaderChunk = new CmdLoadModuleHeaderChunk(type, data);
                    this.filename = cmdLoadModuleHeaderChunk.filename;
                    chunk = cmdLoadModuleHeaderChunk;
                    break;
                }

                default:
                    chunk = new CmdChunk(type, data);
                    break;
            }

            this.chunks.push(chunk);
        }
    }

    /**
     * Convert an address in memory to the original byte offset in the binary. Returns undefined if
     * not found in any chunk.
     */
    public addressToByteOffset(address: number): number | undefined {
        // Offset in the binary of first byte of chunk.
        let offset = 0;

        for (const chunk of this.chunks) {
            if (chunk instanceof CmdLoadBlockChunk) {
                if (address >= chunk.address && address < chunk.address + chunk.loadData.length) {
                    // Skip type, length, and address.
                    return offset + 4 + (address - chunk.address);
                }
            }

            // Skip type, length and data.
            offset += 2 + chunk.rawData.length;
        }

        return undefined;
    }
}
