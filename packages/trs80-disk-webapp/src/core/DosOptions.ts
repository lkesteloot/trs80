import {TrsdosFormatDos} from "trs80-base";
import {SYSTEM_DISK_TEMPLATES} from "trs80-disk";
import {assertNever} from "z80-base";

// What each DOS offers when a floppy is made or formatted, shared by the New Disk panel and the Format sheet.

/**
 * What a DOS offers when making a disk, which is what the engine's "create" accepts (see TrsdosFormat.ts in
 * trs80-base for the cylinder ranges).
 */
export interface DosOptions {
    /** The cylinder counts to offer for a data disk. The first is the DOS's default. */
    cylinders: number[];
    /** The side counts to offer for a data disk. */
    sides: number[];
    /** The models to offer, where the model decides the density, or empty. The first is the default. */
    models: (1 | 3)[];
    /** A phrase for the card, such as "Model I · single density". */
    summary: string;
}

/**
 * What a DOS offers.
 */
export function getDosOptions(dos: TrsdosFormatDos): DosOptions {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return {cylinders: [35, 40], sides: [1], models: [], summary: "Model I · single density"};
        case TrsdosFormatDos.TRSDOS_1_3:
            return {cylinders: [40, 35], sides: [1], models: [], summary: "Model III · double density"};
        case TrsdosFormatDos.LDOS_5_3:
            return {cylinders: [40, 35, 80], sides: [1, 2], models: [3, 1],
                summary: "Model I or III · single or double density"};
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return {cylinders: [40, 35, 80], sides: [1, 2], models: [], summary: "Model 4 · double density"};
        default:
            assertNever(dos);
    }
}

/**
 * Whether a DOS has a bootable system disk to copy.
 */
export function hasSystemDisk(dos: TrsdosFormatDos): boolean {
    return SYSTEM_DISK_TEMPLATES.some(template => template.dos === dos);
}
