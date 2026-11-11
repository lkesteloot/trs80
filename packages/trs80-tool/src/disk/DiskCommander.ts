import {Command, CommanderError, Option} from "commander";
import {HELP_OUTPUT_COLORS, HELP_STYLE} from "../helpStyle.js";
import {ToolError} from "../utils.js";
import type {DiskCommandSpec, DiskOptionSpec, DiskOptionValues} from "./DiskCommandParser.js";

// The disk command's parsing and help are done by Commander, as the rest of the tool's are. Commander
// can't exit the process here (an error in the shell must not end the shell) and writes nothing of its
// own except help text that we ask for, so every Command we make is set up to throw instead and to
// write where we say. The specs (see DiskCommandSpec) are the only description of the commands: these
// functions turn a spec into a Commander Command, for parsing and for printing help.

/**
 * Where help text goes, and how wide it may be. Tests use it to capture help and to try other widths.
 */
export interface DiskHelpOutput {
    /** Show text that ends with a newline (or doesn't, for the last piece). */
    write(text: string): void;
    /** The width to wrap to, or undefined for the terminal's (80 if it isn't one). */
    width?: number | undefined;
}

/**
 * Help output that gives each line of the help text to a function, without the newline that ends the text.
 *
 * @param emit shows one line.
 */
export function makeLineHelpOutput(emit: (line: string) => void): DiskHelpOutput {
    return {
        write: text => {
            for (const line of (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")) {
                emit(line);
            }
        },
    };
}

/**
 * The usual destination of help: the console, a line at a time.
 */
export const CONSOLE_HELP_OUTPUT: DiskHelpOutput = makeLineHelpOutput(line => console.log(line));

/**
 * Set up a Command to be used inside our shell, whose commands must not exit the process or print
 * errors themselves. Commander throws a CommanderError instead, which {@link commanderErrorToToolError}
 * converts. Help is colored as the top-level help is, and its usage line shows just the command's name
 * and arguments (and not its aliases). There is no --help option, since "help" is a command.
 *
 * @param command the command to set up.
 * @param output where help goes.
 * @returns the same command.
 */
export function configureDiskCommand(command: Command, output: DiskHelpOutput): Command {
    command.exitOverride();
    command.helpOption(false);
    command.configureHelp({
        ... HELP_STYLE,
        commandUsage: cmd => (cmd.name() + " " + cmd.usage()).trim(),
    });
    command.configureOutput({
        ... HELP_OUTPUT_COLORS,
        writeOut: text => output.write(text),
        writeErr: () => {},
        outputError: () => {},
        ... (output.width === undefined ? {} : { getOutHelpWidth: () => output.width as number }),
    });
    return command;
}

/**
 * How an option is written in help, in Commander's style: "-o, --output <FILE>" or "--force".
 *
 * @param spec the option.
 */
export function diskOptionTerm(spec: DiskOptionSpec): string {
    const names = spec.shortName === undefined ? spec.name : spec.shortName + ", " + spec.name;
    return spec.valueName === undefined ? names : names + " <" + spec.valueName + ">";
}

/**
 * Add options to a command, and record each one given in a parse in a {@link DiskOptionValues}. (Commander
 * keeps its own values too, but those are keyed by camel-cased names, lose the order the options came in,
 * and merge "--no-date" into "--date".) Each option has an event named for it, which is emitted when it's seen.
 *
 * @param command the command to add the options to.
 * @param specs the options.
 * @param values where to record them. Each parse adds to it, so it should be fresh.
 */
function addDiskOptions(command: Command, specs: DiskOptionSpec[], values: DiskOptionValues): void {
    for (const spec of specs) {
        const option = new Option(diskOptionTerm(spec), spec.description);
        command.addOption(option);
        command.on("option:" + option.name(), (value: string | undefined) => {
            values.set(spec.name, spec.valueName === undefined ? true : value ?? "");
        });
    }
}

/**
 * Make the Commander command for a spec, to parse one command's words or to print its help. After
 * calling parse() on it with the words after the command's name, the positional arguments are in
 * {@link Command.args} and the options in the given values.
 *
 * @param spec the command's spec.
 * @param values where the options given are recorded.
 * @param output where its help goes.
 * @returns the command, whose help has just the standard parts. The aliases and the spec's extra help are
 * for the caller to add.
 */
export function makeDiskCommand(spec: DiskCommandSpec, values: DiskOptionValues,
                                output: DiskHelpOutput = CONSOLE_HELP_OUTPUT): Command {

    const command = configureDiskCommand(new Command(spec.name), output);
    command.description(spec.summary);
    if (spec.args !== "") {
        command.arguments(spec.args);
    }
    addDiskOptions(command, spec.options, values);

    // There's no work for Commander to do after parsing, but a command with no action doesn't
    // report unknown options.
    command.action(() => {});

    return command;
}

/**
 * Make a Commander command that takes the options for the whole run off the front of a list of words
 * and leaves the rest, which are the commands, in {@link Command.args}. It stops at the first word that
 * isn't an option or an option's value.
 *
 * @param specs the options accepted.
 * @param values where the options given are recorded.
 * @returns the command.
 */
export function makeDiskOptionParser(specs: DiskOptionSpec[], values: DiskOptionValues): Command {
    const command = configureDiskCommand(new Command(), CONSOLE_HELP_OUTPUT);
    command.passThroughOptions();
    command.argument("[words...]");
    addDiskOptions(command, specs, values);
    command.action(() => {});

    return command;
}

/**
 * Convert an error thrown by Commander's parsing into the ToolError that the shell and the tool show.
 * Anything else is a bug and is returned unchanged. Commander's messages begin with "error: ", which is
 * dropped, and say things like "unknown option '--foo'" with a suggestion on the next line, if it has one.
 *
 * @param error whatever was caught.
 * @param commandName the command being parsed, to put before the message, or undefined for the global options.
 * @returns the error to throw.
 */
export function commanderErrorToToolError(error: unknown, commandName: string | undefined): unknown {
    if (!(error instanceof CommanderError)) {
        return error;
    }

    const message = error.message.replace(/^error: /, "");
    return new ToolError(commandName === undefined ?
        message.charAt(0).toUpperCase() + message.substring(1) :
        commandName + ": " + message);
}
