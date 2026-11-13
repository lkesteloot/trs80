import {gunzipSync, gzipSync} from "fflate";

/**
 * Gzip-compressed files. A file whose name ends in ".gz" (in any case) is gzipped, and any other isn't: the name
 * decides, both when reading and when writing, and the bytes are never sniffed, since a JV1 image has no header
 * and could start with the gzip signature. Reading a gzipped file decompresses it and drops the ".gz" from its
 * name, and the rest of the name decides how to decode it as usual. Writing to a name that ends in ".gz"
 * compresses. Writing a file back to the name it was read from compresses it again, so the image inside comes
 * back the same, though the compressed bytes may not.
 */

/**
 * The suffix that marks a gzipped file, in lower case.
 */
export const GZIP_SUFFIX = ".gz";

/**
 * Whether a file name (or path) says that the file is gzipped: it ends in ".gz", in any case.
 *
 * @param name the file's name or path.
 */
export function isGzipName(name: string): boolean {
    return name.toLowerCase().endsWith(GZIP_SUFFIX);
}

/**
 * A file's name without its ".gz", or the name unchanged if it doesn't end in ".gz". "foo.dmk.gz" becomes
 * "foo.dmk", and "foo.gz" becomes "foo", a name with no extension.
 *
 * @param name the file's name or path.
 */
export function withoutGzipSuffix(name: string): string {
    return isGzipName(name) ? name.substring(0, name.length - GZIP_SUFFIX.length) : name;
}

/**
 * Decompress gzip data.
 *
 * @param bytes the compressed bytes.
 * @throws Error if the bytes aren't valid gzip data.
 */
export function gunzipBytes(bytes: Uint8Array): Uint8Array {
    try {
        return gunzipSync(bytes);
    } catch (e: any) {
        throw new Error("not a valid gzip file (" + (e.message ?? String(e)) + ")");
    }
}

/**
 * Compress bytes with gzip.
 *
 * @param bytes the bytes to compress.
 */
export function gzipBytes(bytes: Uint8Array): Uint8Array {
    return gzipSync(bytes, {level: 9});
}

/**
 * A file's contents and name as the rest of the code sees them, after a ".gz" has been decompressed.
 */
export interface UncompressedFile {
    /** The name without its ".gz", which decides how to decode the bytes. */
    name: string;
    /** The decompressed bytes. */
    bytes: Uint8Array;
}

/**
 * Undo the file's gzip compression if its name says it has any: decompress the bytes and drop the ".gz" from
 * the name. Any other file comes back as it is.
 *
 * @param name the file's name or path.
 * @param bytes the file's contents.
 * @throws Error if the name ends in ".gz" but the bytes aren't valid gzip data.
 */
export function uncompressFile(name: string, bytes: Uint8Array): UncompressedFile {
    if (!isGzipName(name)) {
        return {name, bytes};
    }

    return {name: withoutGzipSuffix(name), bytes: gunzipBytes(bytes)};
}

/**
 * The bytes to write to a file of this name: compressed if the name ends in ".gz", and otherwise as they are.
 *
 * @param name the name or path of the file to be written.
 * @param bytes the uncompressed contents.
 */
export function compressForName(name: string, bytes: Uint8Array): Uint8Array {
    return isGzipName(name) ? gzipBytes(bytes) : bytes;
}
