import {ToolError} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, findDiskCommandSpec} from "./DiskCommandParser.js";

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
    lines.push("\"help COMMAND\" describes a command and its options.");

    return lines;
}

/**
 * The help for one command: its usage, summary, options, and other names.
 *
 * @param name the command's name or one of its aliases, in any case.
 * @param commandSpecs all the commands.
 * @throws ToolError if there's no such command.
 */
export function diskCommandHelpLines(name: string, commandSpecs: DiskCommandSpec[]): string[] {
    const spec = findDiskCommandSpec(name, commandSpecs);
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

    return lines;
}
