import {assertNever} from "z80-base";
import {BasicDialect} from "./BasicDialect.js";
import {type Trsdos, TrsdosVersion} from "./Trsdos.js";
import {DosFamily, type DosName, type DosVersion, isUnknownDosName} from "./DosName.js";

/**
 * The rules of the DOS that a disk is written under. The TRSDOS 2.3 family's DOSes share a layout
 * but disagree on details that a writer must get right, such as file dates (only the LDOS line
 * has them), the flags in the first byte of a directory entry, the reserved directory slots, and
 * the protection levels. See "Which DOSes share a layout" in FLOPPY_FORMATS.md.
 *
 * This is separate from the layout ({@link Trsdos.version}), which says where things are, not how
 * they're filled in. One layout serves several rule sets.
 */
export enum TrsdosRuleSet {
    /**
     * TRSDOS 2.0 through 2.3, and the disks that say only "TRSDOS 2.x".
     */
    TRSDOS_2,

    /**
     * Model III TRSDOS 1.x, on its own incompatible layout.
     */
    TRSDOS_1_3,

    /**
     * LDOS 5.x.
     */
    LDOS_5,

    /**
     * TRSDOS 6.x and LS-DOS 6.x, which are LDOS's descendants and share its rules.
     */
    TRSDOS_6,

    /**
     * DOSPLUS 3.x, the Model I and III one.
     */
    DOSPLUS,

    /**
     * Tandy's Model I TRSDOS 2.7DD, 2.7SD and 2.8, on their own layout.
     */
    TRSDOS_2_7,
}

/**
 * Convert the enum to a string for the user, such as "LDOS 5".
 */
export function trsdosRuleSetToString(ruleSet: TrsdosRuleSet): string {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
            return "TRSDOS 2.x";
        case TrsdosRuleSet.TRSDOS_1_3:
            return "TRSDOS 1.3";
        case TrsdosRuleSet.LDOS_5:
            return "LDOS 5";
        case TrsdosRuleSet.TRSDOS_6:
            return "TRSDOS 6 and LS-DOS 6";
        case TrsdosRuleSet.DOSPLUS:
            return "DOSPLUS 3";
        case TrsdosRuleSet.TRSDOS_2_7:
            return "TRSDOS 2.7 and 2.8";
        default:
            assertNever(ruleSet);
    }
}

/**
 * The name that the user types for a rule set (as the value of --dos), such as "ldos-5".
 * {@link parseTrsdosRuleSet} accepts it back.
 */
export function trsdosRuleSetCliName(ruleSet: TrsdosRuleSet): string {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
            return "trsdos-2";
        case TrsdosRuleSet.TRSDOS_1_3:
            return "trsdos-1.3";
        case TrsdosRuleSet.LDOS_5:
            return "ldos-5";
        case TrsdosRuleSet.TRSDOS_6:
            return "trsdos-6";
        case TrsdosRuleSet.DOSPLUS:
            return "dosplus";
        case TrsdosRuleSet.TRSDOS_2_7:
            return "trsdos-2.7";
        default:
            assertNever(ruleSet);
    }
}

/**
 * Every rule set, in the order of the enum, for listing the choices.
 */
export const TRSDOS_RULE_SETS: readonly TrsdosRuleSet[] = [
    TrsdosRuleSet.TRSDOS_2,
    TrsdosRuleSet.TRSDOS_1_3,
    TrsdosRuleSet.LDOS_5,
    TrsdosRuleSet.TRSDOS_6,
    TrsdosRuleSet.DOSPLUS,
    TrsdosRuleSet.TRSDOS_2_7,
];

/**
 * Other names that parseTrsdosRuleSet() accepts for a rule set, besides its CLI name. LDOS 6 and
 * LS-DOS 6 are what some people call TRSDOS 6, and TRSDOS 2.8 follows 2.7's rules.
 */
export function trsdosRuleSetAliases(ruleSet: TrsdosRuleSet): string[] {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.DOSPLUS:
            return [];
        case TrsdosRuleSet.TRSDOS_6:
            return ["ldos-6", "ls-dos-6"];
        case TrsdosRuleSet.TRSDOS_2_7:
            return ["trsdos-2.8"];
        default:
            assertNever(ruleSet);
    }
}

/**
 * Find the rule set that the user named, ignoring case. This accepts the names from
 * {@link trsdosRuleSetCliName} and those from {@link trsdosRuleSetAliases}.
 *
 * @param name what the user typed, such as the value of --dos.
 * @returns the rule set, or undefined if the name isn't one.
 */
export function parseTrsdosRuleSet(name: string): TrsdosRuleSet | undefined {
    const lowerName = name.trim().toLowerCase();
    for (const ruleSet of TRSDOS_RULE_SETS) {
        if (trsdosRuleSetCliName(ruleSet) === lowerName) {
            return ruleSet;
        }
    }
    return TRSDOS_RULE_SETS.find(ruleSet => trsdosRuleSetAliases(ruleSet).includes(lowerName));
}

/**
 * The layout that a rule set's DOS uses for its disks.
 */
export function trsdosRuleSetLayout(ruleSet: TrsdosRuleSet): TrsdosVersion {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_1_3:
            return TrsdosVersion.V1_3;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.DOSPLUS:
            return TrsdosVersion.V2_3;
        case TrsdosRuleSet.TRSDOS_2_7:
            return TrsdosVersion.V2_7;
        default:
            assertNever(ruleSet);
    }
}

// The TRSDOS 2.x releases that follow TRSDOS 2.3's rules (2.1C is a variant of 2.1), including the
// data disks that only know their GAT says 0x21. Not 2.3B, which differs from 2.3 (see "TRSDOS 2.3B"
// in FLOPPY_FORMATS.md).
const TRSDOS_2_VERSIONS = ["2.0", "2.1", "2.2", "2.3", "2.0C", "2.1C", "2.2C", "2.3C", "2.x"];

// Tandy's 2.7DD, 2.7SD and 2.8.0 as their banners name them, and the data disks that only know
// their layout.
const TRSDOS_2_7_VERSIONS = ["2.7", "2.7DD", "2.7SD", "2.8", "2.8.0"];

/**
 * The rule set that one release of a family follows, or undefined if we have none. Among the
 * releases that have none on purpose:
 *
 * - TRSDOS 2.3B, which differs from 2.3, and TRSDOS 3.0, a later rewrite.
 * - DOSPLUS 4.0, which is another machine's, and DOSPLUS with no version, which is 4.0 or 3.4a.
 *
 * @param family the DOS's family.
 * @param version one of its releases.
 */
function ruleSetForVersion(family: DosFamily, version: DosVersion): TrsdosRuleSet | undefined {
    const isOneOf = (texts: readonly string[]) => texts.some(text => version.is(text));
    switch (family) {
        case DosFamily.TRSDOS:
            switch (version.major()) {
                case 1:
                    // Every 1.x, including the data disks that only know they're "TRSDOS 1.x".
                    return TrsdosRuleSet.TRSDOS_1_3;
                case 2:
                    return isOneOf(TRSDOS_2_VERSIONS) ? TrsdosRuleSet.TRSDOS_2 :
                        isOneOf(TRSDOS_2_7_VERSIONS) ? TrsdosRuleSet.TRSDOS_2_7 : undefined;
                case 6:
                    return TrsdosRuleSet.TRSDOS_6;
                default:
                    return undefined;
            }

        case DosFamily.LDOS:
            return version.major() === 5 ? TrsdosRuleSet.LDOS_5 : undefined;

        case DosFamily.LS_DOS:
            // TRSDOS 6 under another name.
            return version.major() === 6 ? TrsdosRuleSet.TRSDOS_6 : undefined;

        case DosFamily.DOSPLUS:
            return version.major() === 3 ? TrsdosRuleSet.DOSPLUS : undefined;

        case DosFamily.UNKNOWN:
        case DosFamily.VTOS:
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
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.SUPER_UTILITY_PLUS:
        case DosFamily.BFLOADER:
            // DOSPLUS IV and II are other machines; SuperDOS, DOS500 and RAPIDOS, on the TRSDOS 1.3
            // layout, have rules that haven't been checked; the rest we haven't written rules for.
            return undefined;

        default:
            assertNever(family);
    }
}

/**
 * The rule set of a name's first candidate (ignoring {@link DosName.or}), or undefined if we have
 * none, or its releases don't all have the same one, or it doesn't fit the layout.
 */
function ruleSetForFirstCandidate(name: DosName, layout: TrsdosVersion): TrsdosRuleSet | undefined {
    // DOSPLUS's passwords on a GAT that another DOS wrote don't make the disk DOSPLUS's to write.
    if (name.fromPasswordsOnly === true || name.versions.length === 0) {
        return undefined;
    }

    const ruleSets = name.versions.map(version => ruleSetForVersion(name.family, version));
    const ruleSet = ruleSets[0];
    if (ruleSet === undefined || ruleSets.some(other => other !== ruleSet) ||
        trsdosRuleSetLayout(ruleSet) !== layout) {

        return undefined;
    }
    return ruleSet;
}

/**
 * The rule set for a DOS, as {@link Trsdos.dosName} gives it, on a layout. This is the only place
 * that maps a DOS to its rules. (Exported for tests.)
 *
 * @param name the DOS, such as LDOS 5.1.4.
 * @param layout the layout the disk was decoded with.
 * @returns the rule set, or undefined if we have none for that DOS, or its rule set doesn't fit the
 * layout (an "LDOS" on the 1.3 layout is not one we know), or the name has candidates
 * ({@link DosName.or}) that don't all have the same one.
 */
export function ruleSetForDosName(name: DosName, layout: TrsdosVersion): TrsdosRuleSet | undefined {
    const ruleSet = ruleSetForFirstCandidate(name, layout);
    if (name.or === undefined) {
        return ruleSet;
    }
    return ruleSetForDosName(name.or, layout) === ruleSet ? ruleSet : undefined;
}

/**
 * Which DOS a disk says it belongs to.
 */
export interface TrsdosDosIdentity {
    /**
     * The rule set that the disk's DOS follows, or undefined if it's none that we have.
     */
    ruleSet: TrsdosRuleSet | undefined;

    /**
     * Whether the disk names a DOS at all. If this is true and the rule set is undefined, the
     * disk is from a DOS that we don't write. If false, we can't tell which DOS it is.
     */
    recognized: boolean;
}

/**
 * Work out which rules apply to a decoded disk, from the DOS it names.
 */
export function identifyTrsdosRuleSet(trsdos: Trsdos): TrsdosDosIdentity {
    return {
        ruleSet: ruleSetForDosName(trsdos.dosName, trsdos.version),
        recognized: !isUnknownDosName(trsdos.dosName),
    };
}

/**
 * The Basic that a DOS's disks run, which decides what its tokenized programs look like. Only TRSDOS 6
 * and LS-DOS 6, on the Model 4, have their own.
 */
export function trsdosRuleSetBasicDialect(ruleSet: TrsdosRuleSet): BasicDialect {
    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.TRSDOS_2_7:
            return BasicDialect.MODEL_III;
        case TrsdosRuleSet.TRSDOS_6:
            return BasicDialect.MODEL_4;
        default:
            assertNever(ruleSet);
    }
}

/**
 * The Basic that a decoded disk's own DOS runs. A disk whose DOS we don't know gets the Model III's, as
 * everything does by default.
 *
 * @param trsdos the decoded file system.
 * @param givenRuleSet the rule set the user chose (with --dos), which overrides what the disk says.
 */
export function trsdosBasicDialect(trsdos: Trsdos, givenRuleSet?: TrsdosRuleSet): BasicDialect {
    const ruleSet = givenRuleSet ?? identifyTrsdosRuleSet(trsdos).ruleSet;
    return ruleSet === undefined ? BasicDialect.MODEL_III : trsdosRuleSetBasicDialect(ruleSet);
}
