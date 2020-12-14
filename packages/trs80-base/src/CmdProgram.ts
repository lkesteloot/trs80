/**
 * Tools for dealing with CMD (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/#cmdfile
 */

import {ByteReader, EOF} from "teamten-ts-utils";
import {Trs80File} from "./Trs80File";

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
 * Class representing a CMD (machine language) program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class CmdProgram implements Trs80File {
    public binary: Uint8Array;
    public error: string | undefined;
    public chunks: CmdChunk[];
    public filename: string | undefined;
    public entryPointAddress: number | undefined;

    constructor(binary: Uint8Array, error: string | undefined, chunks: CmdChunk[],
                filename: string | undefined, entryPointAddress: number | undefined) {

        this.binary = binary;
        this.error = error;
        this.chunks = chunks;
        this.filename = filename;
        this.entryPointAddress = entryPointAddress;
    }

    public getDescription(): string {
        return "CMD program" + (this.filename !== undefined ? " (" + this.filename + ")" : "");
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

/**
 * Decodes a CMD program from the binary. If the binary is not at all a CMD
 * program, returns undefined. If it's a CMD program with decoding errors, returns
 * partially-decoded binary and sets the "error" field.
 */
export function decodeCmdProgram(binary: Uint8Array): CmdProgram | undefined {
    let error: string | undefined;
    const chunks: CmdChunk[] = [];
    let filename: string | undefined;
    let entryPointAddress = 0;
    const b = new ByteReader(binary);

    // Read each chunk.
    while (true) {
        // First byte is type of chunk.
        const type = b.read();
        if (type === EOF || type > CMD_MAX_TYPE || error !== undefined) {
            return new CmdProgram(binary.subarray(0, b.addr()), error, chunks, filename, entryPointAddress);
        }

        // Second byte is length, in bytes.
        let length = b.read();
        if (length === EOF) {
            error = "File is truncated at length";
            continue;
        }

        // Adjust load block length.
        if (type === CMD_LOAD_BLOCK && length <= 2) {
            length += 256;
        }

        // Read the raw bytes.
        const data = b.readBytes(length);
        if (data.length < length) {
            error = "File is truncated at data";
            // We continue so we can create a partial chunk. The loop will stop at the top of the next
            // iteration. Not sure this is the right thing to do.
        }

        // Create type-specific chunk objects.
        let chunk: CmdChunk;
        switch (type) {
            case CMD_LOAD_BLOCK:
                chunk = new CmdLoadBlockChunk(type, data);
                break;

            case CMD_TRANSFER_ADDRESS: {
                const cmdTransferAddressChunk = new CmdTransferAddressChunk(type, data);
                entryPointAddress = cmdTransferAddressChunk.address;
                chunk = cmdTransferAddressChunk;
                break;
            }

            case CMD_LOAD_MODULE_HEADER: {
                const cmdLoadModuleHeaderChunk = new CmdLoadModuleHeaderChunk(type, data);
                filename = cmdLoadModuleHeaderChunk.filename;
                if (filename === "") {
                    filename = undefined;
                }
                chunk = cmdLoadModuleHeaderChunk;
                break;
            }

            default:
                chunk = new CmdChunk(type, data);
                break;
        }

        chunks.push(chunk);
    }
}
