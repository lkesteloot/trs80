import {SectorPosition} from "./FloppyDisk.js";

/**
 * What we found wrong with a file while reading it from a floppy. This lives in its own file,
 * rather than in FloppyFileSystem.ts, so that the file system implementations can import it
 * without a cycle.
 */
export class FileDamage {
    /**
     * Sectors of the file that couldn't be read (absent, no data field, or truncated in the
     * image). They were zero-filled in the file's contents.
     */
    public readonly missingSectors: SectorPosition[] = [];

    /**
     * Sectors of the file that were read with a data CRC error, so their data may be wrong.
     */
    public readonly crcErrorSectors: SectorPosition[] = [];

    /**
     * Problems with the file's directory entries, as short lowercase phrases.
     */
    public readonly directoryErrors: string[] = [];

    /**
     * Whether anything at all is wrong with the file.
     */
    public isDamaged(): boolean {
        return this.missingSectors.length > 0 ||
            this.crcErrorSectors.length > 0 ||
            this.directoryErrors.length > 0;
    }

    /**
     * A comma-separated summary, such as "2 missing sectors, 1 sector with a CRC error",
     * or an empty string if the file isn't damaged.
     */
    public toString(): string {
        const parts: string[] = [];

        const missingCount = this.missingSectors.length;
        if (missingCount > 0) {
            parts.push(`${missingCount} missing ${missingCount === 1 ? "sector" : "sectors"}`);
        }

        const crcErrorCount = this.crcErrorSectors.length;
        if (crcErrorCount > 0) {
            parts.push(crcErrorCount === 1
                ? "1 sector with a CRC error"
                : `${crcErrorCount} sectors with CRC errors`);
        }

        parts.push(... this.directoryErrors);

        return parts.join(", ");
    }
}

/**
 * The contents of a file read from a floppy, along with any damage found while reading it.
 */
export interface FloppyFileContents {
    /**
     * The file's bytes. Sectors that couldn't be read are zero-filled.
     */
    binary: Uint8Array;

    /**
     * What was wrong with the file, if anything.
     */
    damage: FileDamage;
}
