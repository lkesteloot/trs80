import {assertNever} from "z80-base";
import {BasicDialect} from "./BasicDialect.js";
import {isUnknownDosName, type Trsdos, TRSDOS_6_DOS_NAME, TrsdosVersion} from "./Trsdos.js";

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
];

/**
 * Other names that parseTrsdosRuleSet() accepts for a rule set, besides its CLI name. LDOS 6 and
 * LS-DOS 6 are what some people call TRSDOS 6.
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
        default:
            assertNever(ruleSet);
    }
}

/**
 * One row of the table that maps a decoded DOS name to a rule set.
 */
interface DosNameRule {
    /**
     * Matches the names of the DOSes that follow the rule set (see {@link Trsdos.nameAndVersion}).
     */
    readonly pattern: RegExp;

    /**
     * The rules that those DOSes follow.
     */
    readonly ruleSet: TrsdosRuleSet;
}

/**
 * The DOS names that we have rules for. A name that no row matches is a DOS we don't write, which
 * includes these on purpose:
 *
 * - TRSDOS 2.3B, which differs from 2.3 (see "TRSDOS 2.3B" in FLOPPY_FORMATS.md).
 * - TRSDOS 2.7, 2.8 and 3.0, which are other layouts or later rewrites.
 * - SuperDOS and the other DOSes on the TRSDOS 1.3 layout, whose rules haven't been checked.
 * - DOSPLUS 4.0, DOSPLUS IV and DOSPLUS II, which are other machines or other rules.
 * - The DOS "DOSPLUS" with no version, which is DOSPLUS 4.0 or 3.4a.
 * - DOSPLUS's version ranges ("DOSPLUS 3.2.1-3.4"), which only BOOT/SYS's passwords name, on disks
 *   whose GAT byte 0xCB isn't DOSPLUS's, so something other than DOSPLUS wrote that GAT.
 *
 * The patterns are anchored, so that a longer name (such as "TRSDOS 2.3B") doesn't match a
 * shorter one's row.
 */
const DOS_NAME_RULES: readonly DosNameRule[] = [
    // 2.0 through 2.3 (2.1C is a variant of 2.1), the data disks that only know their GAT says 0x21,
    // and those whose boot sector says the 2.2 or 2.3 FORMAT wrote them.
    {pattern: /^TRSDOS 2\.(?:[0-3]C?|x|2-2\.3)$/, ruleSet: TrsdosRuleSet.TRSDOS_2},
    // Every 1.x, including the data disks that only know they're "TRSDOS 1.x".
    {pattern: /^TRSDOS 1\./, ruleSet: TrsdosRuleSet.TRSDOS_1_3},
    {pattern: /^LDOS 5\./, ruleSet: TrsdosRuleSet.LDOS_5},
    {pattern: TRSDOS_6_DOS_NAME, ruleSet: TrsdosRuleSet.TRSDOS_6},
    // A single version, not a range, which only passwords give (see above).
    {pattern: /^DOSPLUS 3\.[^-]+$/, ruleSet: TrsdosRuleSet.DOSPLUS},
];

/**
 * The rule set for a DOS name, as {@link Trsdos.nameAndVersion} builds it, on a layout. (Exported
 * for tests.)
 *
 * @param name the DOS's name and version, such as "LDOS 5.1.4".
 * @param layout the layout the disk was decoded with.
 * @returns the rule set, or undefined if we have none for that name, or the name matches a
 * rule set that the layout doesn't fit (an "LDOS" on the 1.3 layout is not one we know).
 */
export function ruleSetForDosName(name: string, layout: TrsdosVersion): TrsdosRuleSet | undefined {
    const rule = DOS_NAME_RULES.find(rule => rule.pattern.test(name));
    if (rule === undefined || trsdosRuleSetLayout(rule.ruleSet) !== layout) {
        return undefined;
    }
    return rule.ruleSet;
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
        ruleSet: ruleSetForDosName(trsdos.nameAndVersion, trsdos.version),
        recognized: !isUnknownDosName(trsdos.nameAndVersion),
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
