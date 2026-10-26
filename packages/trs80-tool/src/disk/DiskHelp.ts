import {
    parseTrsdosFormatDos, parseTrsdosRuleSet, TRSDOS_FORMAT_DOSES, TrsdosFormatDos, trsdosFormatDosCliName, TRSDOS_RULE_SETS,
    TrsdosRuleSet, trsdosRuleSetAliases, trsdosRuleSetCliName, trsdosRuleSetToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import {ToolError} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, findDiskCommandSpec} from "./DiskCommandParser.js";

// The topic of "help" that lists the DOS names. A command of the same name takes precedence.
const DOS_HELP_TOPIC = "dos";

/**
 * The value of --dos as the rules it names.
 *
 * @param name what the user typed, in any case.
 * @throws ToolError if it's not a name of a rule set, listing the ones that are.
 */
export function parseDosName(name: string): TrsdosRuleSet {
    const ruleSet = parseTrsdosRuleSet(name);
    if (ruleSet === undefined) {
        const choices = TRSDOS_RULE_SETS.map(trsdosRuleSetCliName).join(", ");
        throw new ToolError("Unknown DOS \"" + name + "\" for --dos. The choices are " + choices +
            " (\"help dos\" has more).");
    }
    return ruleSet;
}

/**
 * Other names for the DOSes that "create" and "format" can make, besides the ones from
 * {@link trsdosFormatDosCliName}: the names that the global --dos option takes (see
 * {@link parseDosName}) when they mean one DOS that we can format, and a few more that are common.
 * Names that could mean several DOSes are left out. Keys are lowercase.
 */
const FORMAT_DOS_ALIASES = new Map<string, TrsdosFormatDos>([
    ["trsdos-2", TrsdosFormatDos.TRSDOS_2_3],
    ["ldos", TrsdosFormatDos.LDOS_5_3],
    ["ldos-5", TrsdosFormatDos.LDOS_5_3],
    ["trsdos-6", TrsdosFormatDos.TRSDOS_6_2],
    ["ldos-6", TrsdosFormatDos.LSDOS_6_3],
    ["lsdos", TrsdosFormatDos.LSDOS_6_3],
    ["ls-dos", TrsdosFormatDos.LSDOS_6_3],
    ["lsdos-6", TrsdosFormatDos.LSDOS_6_3],
    ["ls-dos-6", TrsdosFormatDos.LSDOS_6_3],
]);

/**
 * Describe a DOS that "create" and "format" can make, for the list of them: what it is and which TRS-80
 * it's for, such as "TRSDOS 2.3, Model I".
 */
function formatDosDescription(dos: TrsdosFormatDos): string {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return "TRSDOS 2.3, Model I";
        case TrsdosFormatDos.TRSDOS_1_3:
            return "TRSDOS 1.3, Model III";
        case TrsdosFormatDos.LDOS_5_3:
            return "LDOS 5.3, Model I (--model 1) or Model III (the default)";
        case TrsdosFormatDos.TRSDOS_6_2:
            return "TRSDOS 6.2, Model 4";
        case TrsdosFormatDos.LSDOS_6_3:
            return "LS-DOS 6.3, Model 4";
        default:
            assertNever(dos);
    }
}

/**
 * The list of the DOSes that "create" and "format" can make disks for, one per line: the name to type,
 * then what it makes.
 */
export function formatDosHelpLines(): string[] {
    const names = TRSDOS_FORMAT_DOSES.map(trsdosFormatDosCliName);
    const width = Math.max(... names.map(name => name.length));
    return TRSDOS_FORMAT_DOSES.map((dos, i) => "  " + names[i].padEnd(width + 2) + formatDosDescription(dos));
}

/**
 * The DOS that the user named for "create" or "format". It takes the names from
 * {@link trsdosFormatDosCliName}, such as "ldos-5.3", and the aliases that name one DOS, such as
 * "ldos-5", "trsdos-6" (TRSDOS 6.2) and "lsdos" (LS-DOS 6.3).
 *
 * @param name what the user typed, in any case.
 * @throws ToolError if it's not a name of a DOS we can format, listing the ones that are.
 */
export function parseFormatDosName(name: string): TrsdosFormatDos {
    const dos = parseTrsdosFormatDos(name) ?? FORMAT_DOS_ALIASES.get(name.trim().toLowerCase());
    if (dos === undefined) {
        throw new ToolError("Unknown DOS \"" + name + "\"" +
            (name.trim().toLowerCase() === "dosplus" ? " (DOSPLUS disks can't be made yet)" : "") +
            ". The DOSes are:\n" + formatDosHelpLines().join("\n"));
    }
    return dos;
}

/**
 * The help for the DOS names that --dos takes: what it does, then each name with the DOS it means
 * and its aliases.
 */
export function dosHelpLines(): string[] {
    const lines: string[] = [];
    lines.push("--dos NAME says which DOS's rules to write a TRSDOS-family disk by, for a disk that doesn't " +
        "say which DOS wrote it or to override what it says. The names are:");

    const names = TRSDOS_RULE_SETS.map(trsdosRuleSetCliName);
    const width = Math.max(... names.map(name => name.length));
    TRSDOS_RULE_SETS.forEach((ruleSet, i) => {
        const aliases = trsdosRuleSetAliases(ruleSet);
        const alsoText = aliases.length === 0 ? "" : " (also " + aliases.join(", ") + ")";
        lines.push("  " + names[i].padEnd(width + 2) + trsdosRuleSetToString(ruleSet) + alsoText);
    });

    return lines;
}

/**
 * How an option is written in help, such as "--out-dir DIR" or "-o, --output FILE".
 */
function optionSynopsis(option: DiskOptionSpec): string {
    const names = option.shortName === undefined ? option.name : option.shortName + ", " + option.name;
    return option.valueName === undefined ? names : names + " " + option.valueName;
}

/**
 * Lines that list options, one per line, with their descriptions lined up.
 *
 * @param options the options to list.
 * @param indent the text to put before each line.
 */
function optionLines(options: DiskOptionSpec[], indent: string): string[] {
    const synopses = options.map(optionSynopsis);
    const width = Math.max(... synopses.map(synopsis => synopsis.length));
    return options.map((option, i) => indent + synopses[i].padEnd(width + 2) + option.description);
}

/**
 * The help for the whole "disk" command: every command with its summary, the global options if
 * there are any, and how to get help on one command. Aliases are left out, so that each
 * command appears once; "help COMMAND" names them.
 *
 * @param commandSpecs the commands, in the order to list them.
 * @param globalOptionSpecs the options that apply to the whole run.
 */
export function diskHelpLines(commandSpecs: DiskCommandSpec[], globalOptionSpecs: DiskOptionSpec[]): string[] {
    const lines: string[] = [];

    lines.push("Commands (separate several with a lone \":\"):");
    const width = Math.max(... commandSpecs.map(spec => spec.name.length));
    for (const spec of commandSpecs) {
        lines.push("  " + spec.name.padEnd(width + 2) + spec.summary);
    }

    if (globalOptionSpecs.length > 0) {
        lines.push("");
        lines.push("Options for the whole run, before the first command:");
        lines.push(... optionLines(globalOptionSpecs, "  "));
    }

    lines.push("");
    lines.push("\"help COMMAND\" describes a command and its options; \"help dos\" lists the names for --dos.");

    return lines;
}

/**
 * The help for one command: its usage, summary, options, and other names. The topic "dos" (unless a
 * command has that name) gives {@link dosHelpLines}.
 *
 * @param name the command's name or one of its aliases, in any case.
 * @param commandSpecs all the commands.
 * @throws ToolError if there's no such command.
 */
export function diskCommandHelpLines(name: string, commandSpecs: DiskCommandSpec[]): string[] {
    const spec = findDiskCommandSpec(name, commandSpecs);
    if (spec === undefined && name.toLowerCase() === DOS_HELP_TOPIC) {
        return dosHelpLines();
    }
    if (spec === undefined) {
        throw new ToolError("Unknown command \"" + name + "\"");
    }

    const lines: string[] = [];
    lines.push((spec.name + " " + spec.usage).trimEnd());
    lines.push("  " + spec.summary);
    if (spec.options.length > 0) {
        lines.push("Options:");
        lines.push(... optionLines(spec.options, "  "));
    }
    if (spec.aliases.length > 0) {
        lines.push("Also called: " + spec.aliases.join(", "));
    }
    if (spec.extraHelpLines !== undefined) {
        lines.push(... spec.extraHelpLines);
    }

    return lines;
}
