/**
 * The templates that ship inside the tool: the DOSes' own data-disk boot sectors, which make "create" and
 * "format" disks that match what each DOS's FORMAT makes, and six bootable system disks for "create --system".
 * The files are in templates/ (see its README.md), and tools/GenerateTemplates.ts embeds them in Templates.ts.
 */

import zlib from "zlib";
import {
    BYTES_PER_SECTOR, decodeTrs80File, Density, DmkFloppyDisk, TrsdosFormatDos, trsdosFormatDosToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import {ToolError} from "../utils.js";
import {DATA_DISK_BOOT_SECTORS_HEX, SYSTEM_DISK_TEMPLATES_BASE64} from "./Templates.js";

/**
 * A bootable system disk that "create --system" copies.
 */
export interface SystemDiskTemplate {
    /** The template's name, which is its file name in templates/ without ".dmk.gz". */
    name: string;
    /** The DOS on the disk. */
    dos: TrsdosFormatDos;
    /** The TRS-80 model that the disk boots on: 1, 3, or 4. */
    model: 1 | 3 | 4;
    /** The DOS's version, such as "5.3.1", which the disk's name shows and the format options don't. */
    version: string;
}

/**
 * Every system disk, in the order to list them.
 */
export const SYSTEM_DISK_TEMPLATES: readonly SystemDiskTemplate[] = [
    {name: "trsdos-2.3-model1", dos: TrsdosFormatDos.TRSDOS_2_3, model: 1, version: "2.3"},
    {name: "trsdos-1.3-model3", dos: TrsdosFormatDos.TRSDOS_1_3, model: 3, version: "1.3"},
    {name: "ldos-5.3.1-model1", dos: TrsdosFormatDos.LDOS_5_3, model: 1, version: "5.3.1"},
    {name: "ldos-5.3.1-model3", dos: TrsdosFormatDos.LDOS_5_3, model: 3, version: "5.3.1"},
    {name: "trsdos-6.2.1-model4", dos: TrsdosFormatDos.TRSDOS_6_2, model: 4, version: "6.2.1"},
    {name: "lsdos-6.3.1-model4", dos: TrsdosFormatDos.LSDOS_6_3, model: 4, version: "6.3.1"},
];

/**
 * Describe a template for the user, such as "LS-DOS 6.3.1 system disk for the Model 4".
 */
export function describeSystemDiskTemplate(template: SystemDiskTemplate): string {
    // The format name has the version of the DOS without the release, as in "LS-DOS 6.3".
    const dosName = trsdosFormatDosToString(template.dos).replace(/ [\d.]+$/, "");
    return dosName + " " + template.version + " system disk for the Model " + template.model;
}

/**
 * Find the system disk to use for a DOS.
 *
 * @param dos the DOS.
 * @param model the TRS-80 model the user asked for, or undefined if they didn't say. Only LDOS 5.3 has
 * disks for more than one model: the Model I's for model 1, and the Model III's for anything else (it
 * also runs on the Model 4 in Model III mode). The other DOSes have only one disk each.
 */
export function findSystemDiskTemplate(dos: TrsdosFormatDos, model: 1 | 3 | 4 | undefined): SystemDiskTemplate {
    let name: string;
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            name = "trsdos-2.3-model1";
            break;
        case TrsdosFormatDos.TRSDOS_1_3:
            name = "trsdos-1.3-model3";
            break;
        case TrsdosFormatDos.LDOS_5_3:
            name = model === 1 ? "ldos-5.3.1-model1" : "ldos-5.3.1-model3";
            break;
        case TrsdosFormatDos.TRSDOS_6_2:
            name = "trsdos-6.2.1-model4";
            break;
        case TrsdosFormatDos.LSDOS_6_3:
            name = "lsdos-6.3.1-model4";
            break;
        default:
            assertNever(dos);
    }

    const template = SYSTEM_DISK_TEMPLATES.find(t => t.name === name);
    if (template === undefined) {
        throw new Error("No system disk template named " + name);
    }
    return template;
}

/**
 * Make a new copy of a system disk, writable and not write-protected, ready to change. (The templates
 * are write-protected or not as the original disks were; the copy never is.)
 *
 * @throws ToolError if the embedded template is missing or isn't a DMK image, which means a bad build.
 */
export function loadSystemDiskTemplate(template: SystemDiskTemplate): DmkFloppyDisk {
    const base64 = SYSTEM_DISK_TEMPLATES_BASE64[template.name];
    if (base64 === undefined) {
        throw new ToolError("The system disk " + template.name + " isn't in this build of the tool");
    }

    const binary = new Uint8Array(zlib.gunzipSync(Buffer.from(base64, "base64")));
    // The first byte of a DMK image is its write-protect flag.
    binary[0] = 0;
    const floppy = decodeTrs80File(binary, {filename: template.name + ".dmk"});
    if (!(floppy instanceof DmkFloppyDisk)) {
        throw new ToolError("The system disk " + template.name + " doesn't decode as a DMK image");
    }
    return floppy;
}

/**
 * The key in the boot-sector table for a DOS and density, or undefined if we don't have the DOS's own
 * boot sectors for that combination (the DOS's FORMAT was only measured at one density for some).
 */
function bootSectorKey(dos: TrsdosFormatDos, density: Density): string | undefined {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return density === Density.SINGLE ? "trsdos-2.3" : undefined;
        case TrsdosFormatDos.TRSDOS_1_3:
            return density === Density.DOUBLE ? "trsdos-1.3" : undefined;
        case TrsdosFormatDos.LDOS_5_3:
            return density === Density.SINGLE ? "ldos-5.3-single" : "ldos-5.3-double";
        case TrsdosFormatDos.TRSDOS_6_2:
            return density === Density.DOUBLE ? "trsdos-6.2" : undefined;
        case TrsdosFormatDos.LSDOS_6_3:
            return density === Density.DOUBLE ? "lsdos-6.3" : undefined;
        default:
            assertNever(dos);
    }
}

/**
 * The boot sectors that a DOS's FORMAT writes on a data disk, copied from disks that it formatted.
 *
 * @param dos the DOS.
 * @param density the disk's density.
 * @return the sectors in the order that {@link TrsdosFormatOptions.bootSectors} takes them, or undefined
 * if we have none for that DOS and density, in which case the caller should leave that option out.
 */
export function getDataDiskBootSectors(dos: TrsdosFormatDos, density: Density): Uint8Array[] | undefined {
    const key = bootSectorKey(dos, density);
    if (key === undefined) {
        return undefined;
    }

    const hexStrings = DATA_DISK_BOOT_SECTORS_HEX[key];
    if (hexStrings === undefined) {
        return undefined;
    }

    return hexStrings.map(hex => {
        const bootSector = new Uint8Array(Buffer.from(hex, "hex"));
        if (bootSector.length !== BYTES_PER_SECTOR) {
            throw new Error("Boot sector " + key + " is " + bootSector.length + " bytes");
        }
        return bootSector;
    });
}

/**
 * Lines for "help create" that list the system disks, one per line.
 */
export function systemDiskHelpLines(): string[] {
    return SYSTEM_DISK_TEMPLATES.map(template => "  " + describeSystemDiskTemplate(template));
}
