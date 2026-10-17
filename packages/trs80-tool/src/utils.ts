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
 * Format a date for JSON output as "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" if the time is included, with
 * a trailing "Z" if the date is in UTC. This is ISO 8601, but we read the fields directly instead of
 * using toISOString(), because TRS-80 dates have no time zone: unless utc is true, the date's local
 * fields are the ones that were recorded, and converting to UTC would shift them.
 *
 * @param date the date to format.
 * @param utc whether to read the date's fields in UTC rather than the local time zone. See formatDate().
 * @param includeTime whether to add the hours and minutes.
 */
export function jsonDate(date: Date, utc: boolean, includeTime: boolean): string {
    const year = utc ? date.getUTCFullYear() : date.getFullYear();
    const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
    const day = utc ? date.getUTCDate() : date.getDate();
    let text = year.toString().padStart(4, "0") + "-" + month.toString().padStart(2, "0") + "-" +
        day.toString().padStart(2, "0");
    if (includeTime) {
        const hour = utc ? date.getUTCHours() : date.getHours();
        const minute = utc ? date.getUTCMinutes() : date.getMinutes();
        text += "T" + hour.toString().padStart(2, "0") + ":" + minute.toString().padStart(2, "0");
        if (utc) {
            text += "Z";
        }
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

/**
 * Convert an exception to a string for an error message.
 */
export function exceptionToString(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

// Added to the name of a file that had damage, if the user asked for that.
export const DAMAGED_SUFFIX = " [DAMAGED]";

/**
 * Return a file or directory name that's safe to create in its directory. Names can come
 * from a disk image, which can hold anything, so replace the characters that would let a
 * name leave its directory (path separators, and the colon, which starts a drive on
 * Windows) and don't allow a name that's empty or only dots, such as "..". Normal TRS-80
 * names, like "FOO.CMD", are unchanged.
 */
function safeOutputName(name: string): string {
    return name.replace(/[\/\\:\0]/g, "_").replace(/^\.*$/, "_");
}

/**
 * Return the components of the path to create in the output directory for a file. On file
 * systems with directories, a "/" in the filename separates them (as in "usr/bin/vi" on a
 * Xenix tar disk), and we recreate them, dropping empty components (as in "a//b").
 * Elsewhere the whole filename is one name.
 */
export function safeOutputPath(filename: string, hasDirectories: boolean): string[] {
    if (!hasDirectories) {
        return [safeOutputName(filename)];
    }

    const components = filename.split("/").filter(component => component !== "").map(safeOutputName);
    return components.length === 0 ? ["_"] : components;
}

/**
 * Return the components of the path that "extract" creates in the output directory for a file, before
 * it makes the path unique.
 *
 * @param filename the name of the file as decoded.
 * @param hasDirectories whether a "/" in the name separates directories (see InputFile.hasDirectories()).
 * @param damaged whether the file had damage.
 * @param lowercase whether to lowercase the name, as in "foo.cmd" for "FOO.CMD".
 * @param markDamaged whether to add " [DAMAGED]" to the name of a file that had damage.
 */
export function outputPathComponents(filename: string, hasDirectories: boolean, damaged: boolean,
                                     lowercase: boolean, markDamaged: boolean): string[] {

    const components = safeOutputPath(lowercase ? filename.toLowerCase() : filename, hasDirectories);
    components[components.length - 1] += damaged && markDamaged ? DAMAGED_SUFFIX : "";
    return components;
}
