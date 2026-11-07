import {assertNever} from "z80-base";

/**
 * Which BASIC interpreter a tokenized program is for. The programs have the same layout (a 0xFF header,
 * then for each line a next-line pointer, a line number, tokens and a NUL, and a zero pointer at the
 * end), but the tokens differ. See BASIC_FORMATS.md.
 */
export enum BasicDialect {
    /**
     * The Level II BASIC of the Model I and III, including the Disk BASIC of the DOSes that run on them
     * (TRSDOS 1.3 and 2.3, LDOS 5, NEWDOS/80, DOSPLUS). This is the default everywhere.
     */
    MODEL_III,

    /**
     * The BASIC that comes with TRSDOS 6 and LS-DOS 6 on the Model 4 (BASIC/CMD).
     */
    MODEL_4,
}

/**
 * Convert the enum to a string for the user, such as "Model III".
 */
export function basicDialectToString(dialect: BasicDialect): string {
    switch (dialect) {
        case BasicDialect.MODEL_III:
            return "Model III";
        case BasicDialect.MODEL_4:
            return "Model 4";
        default:
            assertNever(dialect);
    }
}

/**
 * The names that a user can type for a dialect, as "3" for the Model III's. Compared in lower case.
 */
const BASIC_DIALECT_NAMES = new Map<string, BasicDialect>([
    ["3", BasicDialect.MODEL_III],
    ["iii", BasicDialect.MODEL_III],
    ["model3", BasicDialect.MODEL_III],
    ["model-3", BasicDialect.MODEL_III],
    ["4", BasicDialect.MODEL_4],
    ["model4", BasicDialect.MODEL_4],
    ["model-4", BasicDialect.MODEL_4],
]);

/**
 * Find the dialect that a user's name stands for.
 *
 * @param name what the user typed, in any case: "3" or "4", or "model3" or "model-4".
 * @returns the dialect, or undefined if the name isn't one.
 */
export function parseBasicDialect(name: string): BasicDialect | undefined {
    return BASIC_DIALECT_NAMES.get(name.trim().toLowerCase());
}
