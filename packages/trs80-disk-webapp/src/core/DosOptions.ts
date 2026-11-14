import {TrsdosFormatDos} from "trs80-base";
import {SYSTEM_DISK_TEMPLATES} from "trs80-disk";
import {assertNever} from "z80-base";

// What each DOS offers when a floppy is made or formatted, shared by the New Disk panel and the Format sheet.

/**
 * What a DOS offers when making a disk, which is what the engine's "create" accepts (see TrsdosFormat.ts in
 * trs80-base for the cylinder ranges).
 */
export interface DosOptions {
    /** The cylinder counts to offer for a data disk, in increasing order. */
    cylinders: number[];
    /** The engine's default cylinder count for this DOS, which needs no --cylinders flag. */
    defaultCylinders: number;
    /** The cylinder count to select at first: 40 where it's offered, which is what most drives had. */
    initialCylinders: number;
    /** The side counts to offer for a data disk, in increasing order. The first is the default. */
    sides: number[];
    /** The models to offer, in increasing order, where the model decides the density, or empty. */
    models: (1 | 3)[];
    /** The engine's default model, which needs no --model flag, and the one to select at first. */
    defaultModel: 1 | 3;
    /** A phrase for the card, such as "Model I · single density". */
    summary: string;
}

/**
 * What a DOS offers.
 */
export function getDosOptions(dos: TrsdosFormatDos): DosOptions {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return makeDosOptions([35, 40], 35, [1], [], 1, "Model I · single density");
        case TrsdosFormatDos.TRSDOS_1_3:
            return makeDosOptions([35, 40], 40, [1], [], 3, "Model III · double density");
        case TrsdosFormatDos.LDOS_5_3:
            return makeDosOptions([35, 40, 80], 40, [1, 2], [1, 3], 3, "Model I or III · single or double density");
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return makeDosOptions([35, 40, 80], 40, [1, 2], [], 3, "Model 4 · double density");
        default:
            assertNever(dos);
    }
}

/**
 * Fill in a DOS's options, choosing the cylinder count to select at first.
 */
function makeDosOptions(cylinders: number[], defaultCylinders: number, sides: number[], models: (1 | 3)[],
                        defaultModel: 1 | 3, summary: string): DosOptions {

    const initialCylinders = cylinders.includes(40) ? 40 : defaultCylinders;
    return {cylinders, defaultCylinders, initialCylinders, sides, models, defaultModel, summary};
}

/**
 * Whether a DOS has a bootable system disk to copy.
 */
export function hasSystemDisk(dos: TrsdosFormatDos): boolean {
    return SYSTEM_DISK_TEMPLATES.some(template => template.dos === dos);
}
