/**
 * Tools for dealing with CMD (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/#cmdfile
 */

import {ByteReader, EOF} from "teamten-ts-utils";
import {toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation";
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

    /**
     * Add annotations about this chunk, assuming its data is at "addr".
     */
    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        // Nothing for unknown chunks.
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

    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        annotations.push(new ProgramAnnotation("Load address (0x" + toHexWord(this.address) + ")", addr, addr + 2));
        annotations.push(new ProgramAnnotation("Data (" + this.loadData.length + " byte" +
            (this.loadData.length === 1 ? "" : "s") + ")", addr + 2, addr + 2 + this.loadData.length));
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

    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        annotations.push(new ProgramAnnotation("Jump address (0x" + toHexWord(this.address) + ")", addr, addr + 2));
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

    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        annotations.push(new ProgramAnnotation("Name (" + this.filename + ")", addr, addr + this.rawData.length));
    }
}

/**
 * A friendly (not so technical) name for the block type.
 * See page 43 of The LDOS Quarterly, Volume 1, Number 4.
 * https://www.tim-mann.org/trs80/doc/ldosq1-4.pdf
 */
const CHUNK_NAME = new Map<number, string>([
    [0x01, "data"], // Originally "object code".
    [0x02, "jump address"], // Originally "transfer address".
    [0x04, "end of partitioned data set member"],
    [0x05, "header"], // Originally "load module header".
    [0x06, "partitioned data set header"],
    [0x07, "patch name header"],
    [0x08, "ISAM directory entry"],
    [0x0A, "end of ISAM directory"],
    [0x0C, "PDS directory entry"],
    [0x0E, "end of PDS directory"],
    [0x10, "yanked load block"],
    [0x1F, "copyright block"],
]);

/**
 * Class representing a CMD (machine language) program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 */
export class CmdProgram extends Trs80File {
    public chunks: CmdChunk[];
    public filename: string | undefined;
    public entryPointAddress: number | undefined;

    constructor(binary: Uint8Array, error: string | undefined, annotations: ProgramAnnotation[],
                chunks: CmdChunk[], filename: string | undefined, entryPointAddress: number | undefined) {

        super(binary, error, annotations);
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
    const annotations: ProgramAnnotation[] = [];
    const chunks: CmdChunk[] = [];
    let filename: string | undefined;
    let entryPointAddress = 0;
    const b = new ByteReader(binary);

    // Read each chunk.
    while (true) {
        // First byte is type of chunk.
        const type = b.read();
        if (type === EOF || type > CMD_MAX_TYPE || error !== undefined) {
            if (chunks.length === 0) {
                return undefined;
            }
            return new CmdProgram(binary.subarray(0, b.addr()), error, annotations,
                chunks, filename, entryPointAddress);
        }

        annotations.push(new ProgramAnnotation("Type of chunk (" +
            (CHUNK_NAME.get(type) ?? "unknown") + ")", b.addr() - 1, b.addr()));

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

        annotations.push(new ProgramAnnotation("Length of chunk (" + length +
            " byte" + (length === 1 ? "" : "s") + ")", b.addr() - 1, b.addr()));

        // Read the raw bytes.
        const dataAddr = b.addr();
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

        chunk.addAnnotations(annotations, dataAddr);
        chunks.push(chunk);
    }
}
