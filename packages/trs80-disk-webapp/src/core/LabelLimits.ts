import {
    parseTrsdosGatDate, SYSINFO_AUTO_LENGTH, type Trsdos, type TrsdosDiskInfo, TrsdosRuleSet, trsdosGatDateYearRange,
    trsdosKeepsAutoInSystemInformation,
} from "trs80-base";
import {assertNever} from "z80-base";

// What a DOS lets a disk's label hold, shared by the workbench's Disk info view and the commander's Label dialog.

/**
 * What a DOS lets a disk's label hold, which the fields apply as the user types.
 */
export interface LabelLimits {
    /** The most characters in the name, which every DOS gives eight. */
    nameLength: number;
    /** Whether the DOS keeps the name in upper case, which every DOS but DOSPLUS and MultiDOS does. */
    upperCaseName: boolean;
    /** The first and last year of a date that the DOS can store. */
    firstYear: number;
    lastYear: number;
    /** The most characters in the AUTO command, or undefined if the disk can't hold one that we can change. */
    autoLength: number | undefined;
    /** The most characters in the master password. */
    passwordLength: number;
}

/**
 * The limits of a disk's label.
 *
 * @param trsdos the disk's file system.
 * @param ruleSet the rules that the disk is written by.
 * @param info the disk's information, whose AUTO command is undefined if the disk has no place to keep one.
 */
export function getLabelLimits(trsdos: Trsdos, ruleSet: TrsdosRuleSet, info: TrsdosDiskInfo): LabelLimits {
    const years = trsdosGatDateYearRange(ruleSet, trsdos.hasTimeStamps);

    // Where the AUTO command is kept decides its length: 79 in TRSDOS 6's system information sector, and about 31
    // in the GAT, less if the GAT has a media block (the engine says if a command doesn't fit).
    let autoLength: number | undefined;
    switch (ruleSet) {
        case TrsdosRuleSet.MULTIDOS:
            // Its AUTO commands start with a flag character that we haven't worked out.
            autoLength = undefined;
            break;
        case TrsdosRuleSet.TRSDOS_2_7:
            autoLength = 30;
            break;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.NEWDOS_80:
            autoLength = trsdosKeepsAutoInSystemInformation(ruleSet) ? SYSINFO_AUTO_LENGTH - 1 : 31;
            break;
        default:
            assertNever(ruleSet);
    }
    if (info.autoCommand === undefined) {
        autoLength = undefined;
    }

    let upperCaseName: boolean;
    switch (ruleSet) {
        case TrsdosRuleSet.DOSPLUS:
        case TrsdosRuleSet.MULTIDOS:
            upperCaseName = false;
            break;
        case TrsdosRuleSet.TRSDOS_2:
        case TrsdosRuleSet.TRSDOS_1_3:
        case TrsdosRuleSet.LDOS_5:
        case TrsdosRuleSet.TRSDOS_6:
        case TrsdosRuleSet.TRSDOS_2_7:
        case TrsdosRuleSet.NEWDOS_80:
            upperCaseName = true;
            break;
        default:
            assertNever(ruleSet);
    }

    return {
        nameLength: 8, upperCaseName, firstYear: years.first, lastYear: years.last, autoLength, passwordLength: 8,
    };
}

/**
 * Convert the date that the GAT holds ("MM/DD/YY") to the value of a date input ("YYYY-MM-DD").
 *
 * @param text the GAT's date.
 * @param ruleSet the DOS's rules, which say which century the two digits are in.
 * @returns the value, or "" if the GAT holds no date.
 */
export function gatDateToInputValue(text: string, ruleSet: TrsdosRuleSet): string {
    const date = parseTrsdosGatDate(text, ruleSet);
    if (date === undefined) {
        return "";
    }
    return String(date.year).padStart(4, "0") + "-" + String(date.month).padStart(2, "0") + "-" + String(date.day).padStart(2, "0");
}

/**
 * Convert the value of a date input to a date, in local time.
 *
 * @param value the input's value, "YYYY-MM-DD".
 * @returns the date, or undefined if the value isn't a date.
 */
export function inputValueToDate(value: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) {
        return undefined;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
