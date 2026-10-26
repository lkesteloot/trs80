import {
    parseTrsdosFormatDos, parseTrsdosRuleSet, TRSDOS_FORMAT_DOSES, TrsdosFormatDos, trsdosFormatDosCliName, TRSDOS_RULE_SETS,
    TrsdosRuleSet, trsdosRuleSetAliases, trsdosRuleSetCliName, trsdosRuleSetToString,
} from "trs80-base";
import {Command} from "commander";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {ToolError} from "../utils.js";
import {CONSOLE_HELP_OUTPUT, configureDiskCommand, type DiskHelpOutput, makeDiskCommand, diskOptionTerm} from "./DiskCommander.js";
import {
    type DiskCommandSpec, type DiskHelpItem, type DiskHelpSection, type DiskOptionSpec, DiskOptionValues,
    findDiskCommandSpec,
} from "./DiskCommandParser.js";

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
 * The DOSes that "create" and "format" can make disks for, as rows of a list in help: the name to type,
 * then what it makes.
 */
export function formatDosItems(): DiskHelpItem[] {
    return TRSDOS_FORMAT_DOSES.map(dos => ({
        term: trsdosFormatDosCliName(dos),
        description: formatDosDescription(dos),
    }));
}

/**
 * The list of the DOSes that "create" and "format" can make disks for as lines of text, for an error
 * message: the name to type, then what it makes.
 */
export function formatDosHelpLines(): string[] {
    const items = formatDosItems();
    const width = Math.max(... items.map(item => item.term.length));
    return items.map(item => "  " + item.term.padEnd(width + 2) + item.description);
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
export function dosHelpSections(): DiskHelpSection[] {
    return [
        "--dos NAME says which DOS's rules to write a TRSDOS-family disk by, for a disk that doesn't " +
        "say which DOS wrote it or to override what it says.",
        {
            title: "The names are:",
            style: "command",
            items: TRSDOS_RULE_SETS.map(ruleSet => {
                const aliases = trsdosRuleSetAliases(ruleSet);
                const alsoText = aliases.length === 0 ? "" : " (also " + aliases.join(", ") + ")";
                return { term: trsdosRuleSetCliName(ruleSet), description: trsdosRuleSetToString(ruleSet) + alsoText };
            }),
        },
    ];
}

/**
 * The parts of the help for the whole "disk" command: every command with its summary, the global options if
 * there are any, and how to get help on one command. Aliases are left out, so that each
 * command appears once; "help COMMAND" names them.
 *
 * @param commandSpecs the commands, in the order to list them.
 * @param globalOptionSpecs the options that apply to the whole run.
 */
export function diskOverviewSections(commandSpecs: DiskCommandSpec[], globalOptionSpecs: DiskOptionSpec[]):
    DiskHelpSection[] {

    const sections: DiskHelpSection[] = [];

    sections.push({
        title: "Commands (separate several with a lone \":\"):",
        style: "command",
        items: commandSpecs.map(spec => ({ term: spec.name, description: spec.summary })),
    });

    if (globalOptionSpecs.length > 0) {
        sections.push({
            title: "Options for the whole run, before the first command:",
            style: "option",
            items: globalOptionSpecs.map(spec => ({ term: diskOptionTerm(spec), description: spec.description })),
        });
    }

    sections.push("\"help COMMAND\" describes a command and its options; \"help dos\" lists the names for --dos.");

    return sections;
}

/**
 * The parts of one command's help that come after what Commander makes from the spec (the usage, summary
 * and options): the other names for the command, then the spec's extra help.
 *
 * @param spec the command.
 */
export function commandHelpSections(spec: DiskCommandSpec): DiskHelpSection[] {
    const sections: DiskHelpSection[] = [];
    if (spec.aliases.length > 0) {
        sections.push("Also called: " + spec.aliases.map(alias => colors.command(alias)).join(", "));
    }
    sections.push(... spec.extraHelp ?? []);

    return sections;
}

/**
 * Format parts of help text for a command's output: paragraphs wrapped to its width, and lists with a title
 * and their descriptions lined up and wrapped, all as Commander formats its own lists, in its colors.
 * The parts are separated by blank lines.
 *
 * @param command a command set up by {@link configureDiskCommand}, which says how wide and how colored the output is.
 * @param sections the parts.
 * @returns the text, with no newline at the end.
 */
export function renderHelpSections(command: Command, sections: DiskHelpSection[]): string {
    const helper = command.createHelp();
    const outputConfiguration = command.configureOutput();
    // Commander's default says undefined when the output isn't a terminal, though its type doesn't allow for that.
    const helpWidth: number | undefined = outputConfiguration.getOutHelpWidth?.();
    helper.prepareContext({
        error: false,
        outputHasColors: outputConfiguration.getOutHasColors?.() ?? false,
        ... (helpWidth === undefined ? {} : { helpWidth }),
    });
    const width = helper.helpWidth ?? 80;

    const blocks = sections.map(section => {
        if (typeof section === "string") {
            return helper.boxWrap(section, width);
        }

        const terms = section.items.map(item => section.style === "command" ?
            helper.styleSubcommandText(item.term) : helper.styleOptionTerm(item.term));
        const termWidth = Math.max(... terms.map(term => helper.displayWidth(term)));
        const rows = section.items.map((item, i) =>
            helper.formatItem(terms[i], termWidth, helper.styleDescriptionText(item.description), helper));
        return [helper.boxWrap(helper.styleTitle(section.title), width), ... rows].join("\n");
    });

    return blocks.join("\n\n");
}

/**
 * Show the help for the whole "disk" command, for one command, or for the topic "dos", wrapped to
 * the terminal's width and colored. The help for a command is its usage, summary, options, other
 * names and extra help. The topic "dos" is {@link dosHelpSections}, unless a command has that name.
 *
 * @param topic the command's name or one of its aliases, in any case, or "dos"; or undefined for
 * the list of commands.
 * @param commandSpecs all the commands.
 * @param globalOptionSpecs the options that apply to the whole run.
 * @param output where to show the help, the console by default.
 * @throws ToolError if there's no such command.
 */
export function printDiskHelp(topic: string | undefined, commandSpecs: DiskCommandSpec[],
                              globalOptionSpecs: DiskOptionSpec[], output: DiskHelpOutput = CONSOLE_HELP_OUTPUT): void {

    if (topic === undefined) {
        const carrier = configureDiskCommand(new Command(), output);
        output.write(renderHelpSections(carrier, diskOverviewSections(commandSpecs, globalOptionSpecs)) + "\n");
        return;
    }

    const spec = findDiskCommandSpec(topic, commandSpecs);
    if (spec === undefined && topic.toLowerCase() === DOS_HELP_TOPIC) {
        const carrier = configureDiskCommand(new Command(), output);
        output.write(renderHelpSections(carrier, dosHelpSections()) + "\n");
        return;
    }
    if (spec === undefined) {
        throw new ToolError("Unknown command \"" + topic + "\"");
    }

    const command = makeDiskCommand(spec, new DiskOptionValues(), output);
    const sections = commandHelpSections(spec);
    if (sections.length > 0) {
        command.addHelpText("after", ({ command }) => "\n" + renderHelpSections(command, sections));
    }
    command.outputHelp();
}
