import {AbstractTrs80File} from "./Trs80File.js";
import {
    CmdLoadModuleHeaderChunk,
    CmdProgram, CmdProgramBuilder,
    CmdTransferAddressChunk,
    encodeCmdProgram
} from "./CmdProgram.js";
import {encodeSystemProgram, SystemChunk, SystemProgram, SystemProgramBuilder} from "./SystemProgram.js";
import {ProgramBuilder} from "./ProgramBuilder.js";

/**
 * File when we don't recognize the type.
 */
export class RawBinaryFile extends AbstractTrs80File {
    public readonly className = "RawBinaryFile";

    constructor(binary: Uint8Array) {
        super(binary, undefined, []);
    }

    public getDescription(): string {
        return "Unknown file";
    }

    /**
     * Create the CMD version of this raw binary program.
     *
     * @param filename name to use.
     * @param org load and transfer address.
     */
    public toCmdProgram(filename: string, org: number): CmdProgram {
        const cmdChunks = [];

        if (filename !== "") {
            cmdChunks.push(CmdLoadModuleHeaderChunk.fromFilename(filename));
        }

        const builder = new CmdProgramBuilder();
        builder.addBytes(org, Array.from(this.binary));
        cmdChunks.push(... builder.getChunks());

        cmdChunks.push(CmdTransferAddressChunk.fromEntryPointAddress(org));

        const binary = encodeCmdProgram(cmdChunks);
        return new CmdProgram(binary, undefined, [], cmdChunks, filename, org);
    }

    /**
     * Create the system program version of this raw binary program.
     *
     * @param filename name to use.
     * @param org load and transfer address.
     */
    public toSystemProgram(filename: string, org: number): SystemProgram {
        const systemChunks: SystemChunk[] = [];

        const builder = new SystemProgramBuilder();
        builder.addBytes(org, Array.from(this.binary));
        systemChunks.push(... builder.getChunks());

        const binary = encodeSystemProgram(filename, systemChunks, org);
        return new SystemProgram(binary, undefined, filename, systemChunks, org, []);
    }
}

/**
 * Builds a raw binary (BIN or ROM) file from binary chunks.
 */
export class RawBinaryFileBuilder extends ProgramBuilder {
    /**
     * Get the binary, assuming that it loads at "org". Does not include anything before
     * org, and fills gaps with nuls.
     */
    public getBinary(org: number): Uint8Array {
        // Sort blocks by address.
        this.blocks.sort((a, b) => a.address - b.address);
        if (this.blocks.length === 0) {
            return new Uint8Array(0);
        }

        const lastBlock = this.blocks[this.blocks.length - 1];
        const size = lastBlock.address + lastBlock.bytes.length - org;
        const binary = new Uint8Array(size);

        for (const block of this.blocks) {
            const begin = block.address;
            const end = begin + block.bytes.length;

            if (end > org) {
                const offset = begin - org;
                if (offset >= 0) {
                    binary.set(block.bytes, offset);
                } else {
                    binary.set(block.bytes.slice(-offset), 0);
                }
            }
        }

        return binary;
    }
}
