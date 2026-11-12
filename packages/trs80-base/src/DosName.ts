import {assertNever} from "z80-base";

/**
 * The DOSes (and the few things that aren't DOSes, such as a game loader) that the TRSDOS-family
 * decoder can name a disk after. See {@link Trsdos.dosName}.
 */
export enum DosFamily {
    // The disk doesn't say which DOS wrote it.
    UNKNOWN,
    // Tandy's TRSDOS: Model I 2.x (including 2.7 and 2.8), Model III 1.x, 3.0, and Model 4 6.x.
    TRSDOS,
    LDOS,
    // Logical Systems' LS-DOS 6, which is TRSDOS 6 under another name.
    LS_DOS,
    VTOS,
    // Micro-Systems Software's DOSPLUS 3.x and 4.0 for the Model I and III.
    DOSPLUS,
    // MicroPower's DOSPLUS II for the Model II.
    DOSPLUS_II,
    // DOSPLUS IV for the Model 4.
    DOSPLUS_IV,
    // Apparat's NEWDOS 2.1 through 3.0.
    NEWDOS,
    NEWDOS_PLUS,
    NEWDOS_80,
    // W. S. and D. S. Sands's extensions of NEWDOS/80.
    NEWDOS_86,
    NEWDOS_90,
    // German builds of NEWDOS/80.
    G_DOS,
    H_DOS,
    DOUBLEDOS,
    MULTIDOS,
    // Cosmopolitan's MultiDOS II, a different DOS: its directory has mixed-case names and no
    // BOOT/SYS or DIR/SYS.
    MULTIDOS_II,
    ESOTERIC,
    Z_DOS,
    ULTRADOS,
    RAPIDOS,
    SUPERDOS,
    DOS500,
    // A data disk that Kim Watt's Super Utility+ formatted, which doesn't say which DOS used it.
    // Its versions are Super Utility+'s.
    SUPER_UTILITY_PLUS,
    // Big Five's BFLOADER, which boots a game with no DOS.
    BFLOADER,
}

/**
 * The family's name as part of a DOS name, such as "LS-DOS" or "NEWDOS/80".
 */
export function dosFamilyToString(family: DosFamily): string {
    switch (family) {
        case DosFamily.UNKNOWN:
            return "Unknown DOS";
        case DosFamily.TRSDOS:
            return "TRSDOS";
        case DosFamily.LDOS:
            return "LDOS";
        case DosFamily.LS_DOS:
            return "LS-DOS";
        case DosFamily.VTOS:
            return "VTOS";
        case DosFamily.DOSPLUS:
            return "DOSPLUS";
        case DosFamily.DOSPLUS_II:
            return "DOSPLUS II";
        case DosFamily.DOSPLUS_IV:
            return "DOSPLUS IV";
        case DosFamily.NEWDOS:
            return "NEWDOS";
        case DosFamily.NEWDOS_PLUS:
            return "NEWDOS+";
        case DosFamily.NEWDOS_80:
            return "NEWDOS/80";
        case DosFamily.NEWDOS_86:
            return "NEWDOS/86";
        case DosFamily.NEWDOS_90:
            return "NEWDOS/90";
        case DosFamily.G_DOS:
            return "G-DOS";
        case DosFamily.H_DOS:
            return "H-DOS";
        case DosFamily.DOUBLEDOS:
            return "DoubleDOS";
        case DosFamily.MULTIDOS:
            return "MultiDOS";
        case DosFamily.MULTIDOS_II:
            return "MultiDOS II";
        case DosFamily.ESOTERIC:
            return "Esoteric";
        case DosFamily.Z_DOS:
            return "Z'DOS";
        case DosFamily.ULTRADOS:
            return "UltraDOS";
        case DosFamily.RAPIDOS:
            return "RAPIDOS";
        case DosFamily.SUPERDOS:
            return "SuperDOS";
        case DosFamily.DOS500:
            return "DOS500";
        case DosFamily.SUPER_UTILITY_PLUS:
            return "Super Utility+";
        case DosFamily.BFLOADER:
            return "Big Five BFLOADER";
        default:
            assertNever(family);
    }
}

/**
 * One release of a DOS, as the text that the disk gives it, such as "5.1.4", "2.3B", "2.7DD",
 * "1.71", "2.x" or "A.00". The text is kept exactly, since it's what we show: MultiDOS 1.71 and
 * 1.7.1 are different releases, and some releases have suffixes or leading zeros.
 */
export class DosVersion {
    /**
     * The version as decoded.
     */
    public readonly text: string;

    /**
     * @param text the version as decoded.
     */
    constructor(text: string) {
        this.text = text;
    }

    /**
     * The major version, the number that the text starts with ("5" of "5.1.4", "2" of "2.x"), or
     * undefined if it doesn't start with a digit ("A.00").
     */
    public major(): number | undefined {
        const match = this.text.match(/^\d+/);
        return match === null ? undefined : parseInt(match[0], 10);
    }

    /**
     * Whether the version is exactly this text.
     */
    public is(text: string): boolean {
        return this.text === text;
    }

    /**
     * The version as decoded.
     */
    public toString(): string {
        return this.text;
    }
}

/**
 * The DOS that a disk says wrote it, and which of its releases that could be.
 */
export interface DosName {
    /**
     * The family of the first candidate.
     */
    readonly family: DosFamily;

    /**
     * The releases of the first candidate's family that the disk could be from, as alternatives. Empty
     * if the disk doesn't say which.
     */
    readonly versions: readonly DosVersion[];

    /**
     * Another family the bytes can't rule out, as in "MultiDOS 5.11 or Esoteric 2.12". {@link family}
     * and {@link versions} describe the first candidate only, so code that acts on the DOS must check
     * this one too.
     */
    readonly or?: DosName | undefined;

    /**
     * Whether the name comes only from the passwords that the DOS's FORMAT gives BOOT/SYS, on a disk
     * whose GAT another DOS wrote, so that we don't trust the disk to follow the DOS's rules.
     */
    readonly fromPasswordsOnly?: boolean | undefined;
}

/**
 * Make a DOS name of one family.
 *
 * @param family the DOS's family.
 * @param versions the releases that the disk could be from, as decoded. None if it doesn't say.
 */
export function makeDosName(family: DosFamily, ...versions: string[]): DosName {
    return {family, versions: versions.map(text => new DosVersion(text))};
}

/**
 * The name of a disk whose DOS we can't tell.
 */
export const UNKNOWN_DOS_NAME: DosName = makeDosName(DosFamily.UNKNOWN);

/**
 * Join alternatives as "a", "a or b", or "a, b or c".
 */
function joinAlternatives(items: readonly string[]): string {
    if (items.length <= 1) {
        return items.join("");
    }
    return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
}

/**
 * The DOS name as we show it, such as "LDOS 5.1.4", "NEWDOS/80 v2.0, v2.5 or v2.74", "Super Utility+
 * 3.1 data disk" or "MultiDOS 5.11 or Esoteric 2.12".
 */
export function dosNameToString(name: DosName): string {
    const familyText = dosFamilyToString(name.family);
    const versionTexts = name.versions.map(version => version.text);
    let text: string;
    switch (name.family) {
        case DosFamily.NEWDOS_80:
            text = joinWords(familyText, joinAlternatives(versionTexts.map(version => "v" + version)));
            break;

        case DosFamily.SUPER_UTILITY_PLUS:
            text = joinWords(familyText, joinAlternatives(versionTexts), "data disk");
            break;

        case DosFamily.UNKNOWN:
        case DosFamily.TRSDOS:
        case DosFamily.LDOS:
        case DosFamily.LS_DOS:
        case DosFamily.VTOS:
        case DosFamily.DOSPLUS:
        case DosFamily.DOSPLUS_II:
        case DosFamily.DOSPLUS_IV:
        case DosFamily.NEWDOS:
        case DosFamily.NEWDOS_PLUS:
        case DosFamily.NEWDOS_86:
        case DosFamily.NEWDOS_90:
        case DosFamily.G_DOS:
        case DosFamily.H_DOS:
        case DosFamily.DOUBLEDOS:
        case DosFamily.MULTIDOS:
        case DosFamily.MULTIDOS_II:
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.BFLOADER:
            text = joinWords(familyText, joinAlternatives(versionTexts));
            break;

        default:
            assertNever(name.family);
    }

    return name.or === undefined ? text : text + " or " + dosNameToString(name.or);
}

/**
 * Join the words that aren't empty with spaces.
 */
function joinWords(...words: string[]): string {
    return words.filter(word => word !== "").join(" ");
}

/**
 * Whether the name says nothing about the DOS: it's {@link UNKNOWN_DOS_NAME}, or it names only the
 * utility that formatted the disk. Such a disk can be written only under a DOS that the user names.
 * A name with {@link DosName.or} is unknown only if every candidate is.
 */
export function isUnknownDosName(name: DosName): boolean {
    let unknown: boolean;
    switch (name.family) {
        case DosFamily.UNKNOWN:
        case DosFamily.SUPER_UTILITY_PLUS:
            unknown = true;
            break;

        case DosFamily.TRSDOS:
        case DosFamily.LDOS:
        case DosFamily.LS_DOS:
        case DosFamily.VTOS:
        case DosFamily.DOSPLUS:
        case DosFamily.DOSPLUS_II:
        case DosFamily.DOSPLUS_IV:
        case DosFamily.NEWDOS:
        case DosFamily.NEWDOS_PLUS:
        case DosFamily.NEWDOS_80:
        case DosFamily.NEWDOS_86:
        case DosFamily.NEWDOS_90:
        case DosFamily.G_DOS:
        case DosFamily.H_DOS:
        case DosFamily.DOUBLEDOS:
        case DosFamily.MULTIDOS:
        case DosFamily.MULTIDOS_II:
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.BFLOADER:
            unknown = false;
            break;

        default:
            assertNever(name.family);
    }

    return unknown && (name.or === undefined || isUnknownDosName(name.or));
}

/**
 * Whether the DOS is TRSDOS 6 or LS-DOS 6 (which some call LDOS 6), every candidate of it, so that
 * its disks number the protection levels like TRSDOS 6 and it runs on the Model 4.
 */
export function isTrsdos6Line(name: DosName): boolean {
    let isTrsdos6: boolean;
    switch (name.family) {
        case DosFamily.TRSDOS:
        case DosFamily.LS_DOS:
            isTrsdos6 = name.versions.length > 0 && name.versions.every(version => version.major() === 6);
            break;

        case DosFamily.UNKNOWN:
        case DosFamily.LDOS:
        case DosFamily.VTOS:
        case DosFamily.DOSPLUS:
        case DosFamily.DOSPLUS_II:
        case DosFamily.DOSPLUS_IV:
        case DosFamily.NEWDOS:
        case DosFamily.NEWDOS_PLUS:
        case DosFamily.NEWDOS_80:
        case DosFamily.NEWDOS_86:
        case DosFamily.NEWDOS_90:
        case DosFamily.G_DOS:
        case DosFamily.H_DOS:
        case DosFamily.DOUBLEDOS:
        case DosFamily.MULTIDOS:
        case DosFamily.MULTIDOS_II:
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.SUPER_UTILITY_PLUS:
        case DosFamily.BFLOADER:
            isTrsdos6 = false;
            break;

        default:
            assertNever(name.family);
    }

    return isTrsdos6 && (name.or === undefined || isTrsdos6Line(name.or));
}

/**
 * Whether the DOS is NEWDOS/80 or one built from it, whose system disks carry a PDRIVE table (see
 * "PDRIVE" in FLOPPY_FORMATS.md), for any of the candidates.
 */
export function isNewdos80Line(name: DosName): boolean {
    let isNewdos80: boolean;
    switch (name.family) {
        case DosFamily.NEWDOS_80:
        case DosFamily.NEWDOS_86:
        case DosFamily.NEWDOS_90:
        case DosFamily.G_DOS:
        case DosFamily.H_DOS:
            isNewdos80 = true;
            break;

        case DosFamily.UNKNOWN:
        case DosFamily.TRSDOS:
        case DosFamily.LDOS:
        case DosFamily.LS_DOS:
        case DosFamily.VTOS:
        case DosFamily.DOSPLUS:
        case DosFamily.DOSPLUS_II:
        case DosFamily.DOSPLUS_IV:
        case DosFamily.NEWDOS:
        case DosFamily.NEWDOS_PLUS:
        case DosFamily.DOUBLEDOS:
        case DosFamily.MULTIDOS:
        case DosFamily.MULTIDOS_II:
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.SUPER_UTILITY_PLUS:
        case DosFamily.BFLOADER:
            isNewdos80 = false;
            break;

        default:
            assertNever(name.family);
    }

    return isNewdos80 || (name.or !== undefined && isNewdos80Line(name.or));
}
