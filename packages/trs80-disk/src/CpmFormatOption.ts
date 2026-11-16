/**
 * Reading a disk with the CP/M layout that the user named (--cpm-format), for the session and for the
 * commands that read disks without one. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md for the layouts.
 */

import {
    Cpm, type CpmVerifiedLayout, decodeFloppyFileSystem, describeCpmWithPreset, findCpmVerifiedLayoutById,
    type FloppyDisk, formatCpmPresetTable, makeCpmLayout, sameBlockMapping,
} from "trs80-base";
import {DiskError, DiskErrorKind} from "./DiskError.js";

/**
 * A disk read with the layout that the user named.
 */
export interface NamedCpmDecoding {
    /** The file system, always CP/M. It has no files if the directory is empty. */
    cpm: Cpm;

    /**
     * A warning that the named layout overrides what the disk reads as without it, or undefined if it
     * reads as the same layout (or as nothing).
     */
    warning: string | undefined;
}

/**
 * The preset that the user named with --cpm-format.
 *
 * @param name what the user typed, in any case.
 * @throws DiskError if it isn't a preset, listing the presets.
 */
export function resolveCpmFormat(name: string): CpmVerifiedLayout {
    const layout = findCpmVerifiedLayoutById(name);
    if (layout === undefined) {
        throw new DiskError(`Unknown CP/M format "${name}" for --cpm-format.`, DiskErrorKind.GENERAL,
            describeCpmFormatChoices());
    }
    return layout;
}

/**
 * The error for --cpm-format given without a name. Users who type it bare are usually asking what the names are,
 * so the error lists them.
 *
 * @param prefix what to put before the message, such as "create: ", or an empty string.
 */
export function cpmFormatNameMissingError(prefix: string): DiskError {
    return new DiskError(`${prefix}--cpm-format needs the name of a CP/M format.`, DiskErrorKind.GENERAL,
        describeCpmFormatChoices());
}

/**
 * The names that --cpm-format takes, as an indented table with a line before it, for the details of an error.
 */
function describeCpmFormatChoices(): string {
    return "The names are:\n" + formatCpmPresetTable().map(line => line === "" ? line : "  " + line).join("\n");
}

/**
 * Describe what a disk reads as without --cpm-format, for the warning that the flag overrides it.
 *
 * @param detected what decodeFloppyFileSystem() found.
 */
function describeDetected(detected: NonNullable<ReturnType<typeof decodeFloppyFileSystem>>): string {
    if (!(detected instanceof Cpm)) {
        return detected.nameAndVersion;
    }
    const withPreset = describeCpmWithPreset(detected);
    // A verified layout has its description already; others get the layout's own.
    return withPreset !== detected.nameAndVersion ? withPreset : `${detected.nameAndVersion}, ${detected.summary()}`;
}

/**
 * Decode a floppy as CP/M with a named layout, as detection would not be asked to.
 *
 * @param floppy the floppy.
 * @param preset the layout that the user named.
 * @param wholeRecords whether files keep their whole 128-byte records (see decodeCpm()).
 * @throws DiskError if the image can't hold the layout (naming the preset and why).
 */
export function decodeWithCpmFormat(floppy: FloppyDisk, preset: CpmVerifiedLayout, wholeRecords: boolean):
    NamedCpmDecoding {

    const layout = makeCpmLayout(preset, floppy.getGeometry());
    if (typeof layout === "string") {
        throw new DiskError(`--cpm-format ${preset.id} doesn't fit this disk: ${layout}.`);
    }

    const cpm = decodeFloppyFileSystem(floppy, wholeRecords, {cpmLayout: layout});
    if (!(cpm instanceof Cpm)) {
        throw new Error("A named CP/M layout didn't decode as CP/M");
    }

    // Only now is it worth finding what the disk reads as without the flag.
    const detected = decodeFloppyFileSystem(floppy, wholeRecords);
    // Layouts that differ only in the cylinder count (as for an image with a spare cylinder) read the same.
    const sameReading = detected instanceof Cpm && sameBlockMapping(detected, cpm);
    const warning = detected === undefined || sameReading ? undefined :
        `--cpm-format ${preset.id} overrides what the disk reads as without it: ${describeDetected(detected)}.`;

    return {cpm, warning};
}
