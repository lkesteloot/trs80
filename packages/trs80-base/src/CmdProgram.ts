/**
 * Tools for dealing with CMD (machine language) programs.
 *
 * http://www.trs-80.com/wordpress/zaps-patches-pokes-tips/tape-and-file-formats-structures/#cmdfile
 */

import {ByteReader, concatByteArrays, EOF} from "teamten-ts-utils";
import {hi, lo, toHexWord} from "z80-base";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {AbstractTrs80File} from "./Trs80File.js";
import {
    encodeSystemProgram,
    MAX_SYSTEM_CHUNK_DATA_SIZE,
    SystemChunk,
    SystemProgram
} from "./SystemProgram.js";

// Chunk types.
export const CMD_LOAD_BLOCK = 0x01;
export const CMD_TRANSFER_ADDRESS = 0x02;
export const CMD_LOAD_MODULE_HEADER = 0x05;
export const CMD_MAX_TYPE = 0x1F;

/**
 * Represents a chunk of bytes from the file.
 */
abstract class CmdAbstractChunk {
    public abstract readonly className: string;
    public readonly type: number;
    public readonly rawData: Uint8Array;

    protected constructor(type: number, data: Uint8Array) {
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
export class CmdLoadBlockChunk extends CmdAbstractChunk {
    public readonly className = "CmdLoadBlockChunk";
    public readonly address: number;
    public readonly loadData: Uint8Array;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.address = data[0] + data[1]*256;
        this.loadData = data.slice(2);
    }

    /**
     * Make a chunk from the data to load into memory.
     */
    public static fromData(address: number, chunkData: Uint8Array): CmdLoadBlockChunk {
        const data = new Uint8Array([lo(address), hi(address), ... chunkData]);
        return new CmdLoadBlockChunk(CMD_LOAD_BLOCK, data);
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
export class CmdTransferAddressChunk extends CmdAbstractChunk {
    public readonly className = "CmdTransferAddressChunk";
    public readonly address: number;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.address = data.length === 2 ? (data[0] + data[1]*256) : 0;
    }

    /**
     * Make a chunk from an entry point address.
     */
    public static fromEntryPointAddress(entryPointAddress: number): CmdTransferAddressChunk {
        const data = new Uint8Array([lo(entryPointAddress), hi(entryPointAddress)]);
        return new CmdTransferAddressChunk(CMD_TRANSFER_ADDRESS, data);
    }

    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        annotations.push(new ProgramAnnotation("Jump address (0x" + toHexWord(this.address) + ")", addr, addr + 2));
    }
}

/**
 * A header chunk for the filename.
 */
export class CmdLoadModuleHeaderChunk extends CmdAbstractChunk {
    public readonly className = "CmdLoadModuleHeaderChunk";
    public readonly filename: string;

    constructor(type: number, data: Uint8Array) {
        super(type, data);
        this.filename = new TextDecoder().decode(data).trim().replace(/ +/g, " ");
    }

    /**
     * Make a chunk from the filename.
     */
    public static fromFilename(filename: string): CmdLoadModuleHeaderChunk {
        const data = new TextEncoder().encode(filename);
        return new CmdLoadModuleHeaderChunk(CMD_LOAD_MODULE_HEADER, data);
    }

    public addAnnotations(annotations: ProgramAnnotation[], addr: number): void {
        annotations.push(new ProgramAnnotation("Name (" + this.filename + ")", addr, addr + this.rawData.length));
    }
}

/**
 * A chunk of unknown meaning.
 */
export class CmdUnknownChunk extends CmdAbstractChunk {
    public readonly className = "CmdUnknownChunk";

    constructor(type: number, data: Uint8Array) {
        super(type, data);
    }
}

/**
 * One of the four possible kinds of blocks.
 */
export type CmdChunk = CmdLoadBlockChunk |
    CmdTransferAddressChunk |
    CmdLoadModuleHeaderChunk |
    CmdUnknownChunk;

/**
 * A friendly (not so technical) name for the block type.
 * See page 43 of The LDOS Quarterly, Volume 1, Number 4.
 * https://www.tim-mann.org/trs80/doc/ldosq1-4.pdf
 * http://www.vintagecomputer.net/fjkraan/comp/trs80/doc/Trscmdff.txt
 * https://tim-mann.org/trs80/doc/gocmd.pdf
 * http://www.manmrk.net/tutorials/TRS80/Software/ldos/trs80/doc/ldosq1-4.txt
 */
export const CMD_CHUNK_TYPE_NAME = new Map<number, string>([
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
export class CmdProgram extends AbstractTrs80File {
    public readonly className = "CmdProgram";
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
            if (chunk.className === "CmdLoadBlockChunk") {
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

    /**
     * Convert the Command program to an equivalent system program, dropping any
     * chunks that can't be encoded in system programs.
     *
     * @param filename optional filename to use for system program, in case the
     * command program doesn't have one.
     */
    public toSystemProgram(filename?: string): SystemProgram {
        // Prefer the filename in the command program.
        if (this.filename !== undefined && this.filename !== "") {
            filename = this.filename;
        } else if (filename === undefined || filename === "") {
            filename = "CMD";
        }

        const systemChunks: SystemChunk[] = [];
        let firstChunkAddress = 0;
        for (const chunk of this.chunks) {
            switch (chunk.className) {
                case "CmdLoadBlockChunk":
                    if (firstChunkAddress === 0) {
                        firstChunkAddress = chunk.address;
                    }
                    // CMD chunks can hold more than system program chunks can (by two bytes!) so
                    // we have to split them up.
                    let begin = 0;
                    while (begin < chunk.loadData.length) {
                        const length = Math.min(chunk.loadData.length - begin, MAX_SYSTEM_CHUNK_DATA_SIZE);
                        systemChunks.push(new SystemChunk(chunk.address + begin,
                            chunk.loadData.subarray(begin, begin + length)));
                        begin += length;
                    }
                    break;

                case "CmdTransferAddressChunk":
                case "CmdLoadModuleHeaderChunk":
                case "CmdUnknownChunk":
                    // Drop it.
                    break;
            }
        }

        const entryPointAddress = this.entryPointAddress ?? firstChunkAddress;
        const binary = encodeSystemProgram(filename, systemChunks, entryPointAddress);
        return new SystemProgram(binary, undefined, filename, systemChunks, entryPointAddress, []);
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

        // End of file?
        if (type === EOF ||
            // Invalid type byte?
            type > CMD_MAX_TYPE ||
            // Error earlier?
            error !== undefined ||
            // Just saw jump? There's typically junk after this and it can make it seem like there's an error.
            (chunks.length > 0 && chunks[chunks.length - 1].className === "CmdTransferAddressChunk")) {

            if (chunks.length === 0) {
                return undefined;
            }
            return new CmdProgram(binary.subarray(0, b.addr()), error, annotations,
                chunks, filename, entryPointAddress);
        }

        annotations.push(new ProgramAnnotation("Type of chunk (" +
            (CMD_CHUNK_TYPE_NAME.get(type) ?? "unknown") + ")", b.addr() - 1, b.addr()));

        // Second byte is length, in bytes.
        let length = b.read();
        if (length === EOF) {
            error = "File is truncated at length";
            continue;
        }

        // Adjust load block length.
        if (type === CMD_LOAD_BLOCK && length <= 2) {
            length += 256;
        } else if (type === CMD_LOAD_MODULE_HEADER && length === 0) {
            length = 256;
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
                chunk = new CmdUnknownChunk(type, data);
                break;
        }

        chunk.addAnnotations(annotations, dataAddr);
        chunks.push(chunk);
    }
}

/**
 * Create the binary version of a Cmd program from a list of chunks.
 */
export function encodeCmdProgram(chunks: CmdChunk[]): Uint8Array {
    const binaryParts: Uint8Array[] = [];

    for (const chunk of chunks) {
        binaryParts.push(new Uint8Array([chunk.type, chunk.rawData.length % 256]));
        binaryParts.push(chunk.rawData);
    }

    return concatByteArrays(binaryParts);
}
