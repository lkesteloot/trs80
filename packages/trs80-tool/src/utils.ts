import fs from "fs";
import path from "path";
import { withCommas } from "teamten-ts-utils";
import { Trs80File, decodeTrs80File } from "trs80-base";
import { AudioFile, readWavFile } from "trs80-cassette";

/**
 * Return the singular or plural version of a string depending on the count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : plural ?? (singular + "s");
}

/**
 * Return the count and the singular or plural version of a string depending on the count.
 */
export function pluralizeWithCount(count: number, singular: string, plural?: string): string {
    return `${withCommas(count)} ${pluralize(count, singular, plural)}`;
}

/**
 * Return the input pathname with the extension replaced.
 * @param pathname input pathname
 * @param extension extension with period.
 */
export function replaceExtension(pathname: string, extension: string): string {
    const { dir, name } = path.parse(pathname);
    return path.join(dir, name + extension);
}

/**
 * Load a file and return its bytes, or an error.
 */
export function loadFile(filename: string): Uint8Array | string {
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        return `Can't open file "${filename}" (${e.message})`;
    }

    return new Uint8Array(buffer.buffer);
}

/**
 * Synchronously read a TRS-80 file, or return an error string.
 *
 * TODO: This pattern appears several times in this file.
 */
export function readTrs80File(filename: string): Trs80File | AudioFile | string {
    const binary = loadFile(filename);
    if (typeof binary === "string") {
        return binary;
    }

    const extension = path.parse(filename).ext.toUpperCase();
    if (extension === ".WAV") {
        try {
            return readWavFile(binary);
        } catch (e: any) {
            if (e.message) {
                return filename + ": " + e.message;
            } else {
                return "Can't read " + filename;
            }
        }
    }

    const trs80File = decodeTrs80File(binary, { filename });
    if (trs80File.error !== undefined) {
        return filename + ": " + trs80File.error;
    }

    return trs80File;
}
