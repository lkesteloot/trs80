import fs from "fs";
import path from "path";
import { withCommas } from "teamten-ts-utils";
import {
    ModelIITrsdosDirEntry, Trs80File, TrsdosIIFile, TrsdosIIFileType, TrsdosIIRecordType, XenixTarFile,
    decodeTrs80File } from "trs80-base";
import {assertNever} from "z80-base";
import { AudioFile, readWavFile } from "trs80-cassette";

/**
 * Error that ends the command. Its message is shown to the user without a stack trace,
 * and the tool exits with status 1.
 */
export class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ToolError";
    }
}

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

    // A Buffer is a Uint8Array view of (possibly pooled) memory; return it as-is.
    return buffer;
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

/**
 * Format a date as "DD/MM/YYYY", or "DD/MM/YYYY HH:MM" if the time is included, the way
 * TrsdosDirEntry.getFullDateString() shows TRSDOS dates, so that every file system's dates look alike.
 *
 * @param date the date to format.
 * @param utc whether to read the date's fields in UTC rather than the local time zone. Use true for
 * dates that are real points in time (such as Unix times), so that the output doesn't depend on where
 * the tool runs, and false for dates that were built from the fields of a calendar date.
 * @param includeTime whether to add the hours and minutes.
 */
export function formatDate(date: Date, utc: boolean, includeTime: boolean): string {
    const year = utc ? date.getUTCFullYear() : date.getFullYear();
    const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
    const day = utc ? date.getUTCDate() : date.getDate();
    let text = day.toString().padStart(2, "0") + "/" + month.toString().padStart(2, "0") + "/" +
        year.toString().padStart(4, "0");
    if (includeTime) {
        const hour = utc ? date.getUTCHours() : date.getHours();
        const minute = utc ? date.getUTCMinutes() : date.getMinutes();
        text += " " + hour.toString().padStart(2, "0") + ":" + minute.toString().padStart(2, "0");
    }
    return text;
}

/**
 * The flags of a Model II TRSDOS file: "S" if it's a system file and "P" if it's a program,
 * with "-" in place of the ones that aren't set.
 */
export function modelIITrsdosFlagsString(dirEntry: ModelIITrsdosDirEntry): string {
    return (dirEntry.isSystemFile() ? "S" : "-") + (dirEntry.isProgram() ? "P" : "-");
}

/**
 * The flags of a TRSDOS-II file, always three characters: "P" (program) or "D" (data), then "F"
 * (fixed-length records) or "V" (variable-length records), then "S" if the entry has the system
 * flag, or "-".
 */
export function trsdosIIFlagsString(file: TrsdosIIFile): string {
    let fileType: string;
    const fileTypeValue = file.getFileType();
    switch (fileTypeValue) {
        case TrsdosIIFileType.PROGRAM: fileType = "P"; break;
        case TrsdosIIFileType.DATA: fileType = "D"; break;
        default: assertNever(fileTypeValue);
    }

    let recordType: string;
    const recordTypeValue = file.getRecordType();
    switch (recordTypeValue) {
        case TrsdosIIRecordType.FIXED: recordType = "F"; break;
        case TrsdosIIRecordType.VARIABLE: recordType = "V"; break;
        default: assertNever(recordTypeValue);
    }

    return fileType + recordType + (file.hasSystemFlag() ? "S" : "-");
}

/**
 * The permission bits of a Xenix tar member in octal, always four digits, such as "0755".
 */
export function xenixTarModeString(file: XenixTarFile): string {
    return file.mode.toString(8).padStart(4, "0");
}

/**
 * The type flag of a Xenix tar member as a printable character: "0" for a regular file, which
 * can be stored as either "0" or NUL.
 */
export function xenixTarTypeLetter(file: XenixTarFile): string {
    return file.typeFlag === "\0" ? "0" : file.typeFlag;
}
