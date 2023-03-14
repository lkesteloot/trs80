import {AbstractTrs80File} from "./Trs80File.js";
import {
    CmdLoadModuleHeaderChunk,
    CmdProgram, CmdProgramBuilder,
    CmdTransferAddressChunk,
    encodeCmdProgram
} from "./CmdProgram.js";
import {encodeSystemProgram, SystemChunk, SystemProgram, SystemProgramBuilder} from "./SystemProgram.js";

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
