import {printDirListing} from "../dir.js";
import {selectInputFiles} from "../InputFile.js";
import {ToolError} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, DiskOptionValues, ParsedDiskCommand} from "./DiskCommandParser.js";
import {DiskSession} from "./DiskSession.js";

/**
 * One command of the "disk" command: its syntax (for the parser and for help) and what it does.
 */
export interface DiskCommand {
    /** The syntax of the command. */
    spec: DiskCommandSpec;

    /**
     * Run the command.
     *
     * @param session the open disk.
     * @param command the parsed command, with its arguments and options.
     * @param globalOptions the options that apply to the whole run.
     * @throws ToolError if the command fails, which stops the chain of commands.
     */
    run(session: DiskSession, command: ParsedDiskCommand, globalOptions: DiskOptionValues): void;
}

/**
 * The options that apply to the whole run, given before the first command. None yet.
 */
export const DISK_GLOBAL_OPTIONS: DiskOptionSpec[] = [];

/**
 * The "dir" command: list the files on the disk, optionally only those matching patterns.
 */
const DIR_COMMAND: DiskCommand = {
    spec: {
        name: "dir",
        aliases: ["ls"],
        usage: "[PATTERN...] [--system]",
        summary: "list the files on the disk, optionally only those matching the TRS-80 name patterns",
        minArgs: 0,
        maxArgs: undefined,
        options: [
            {
                name: "--system",
                valueName: undefined,
                description: "include system files",
            },
        ],
    },

    /**
     * Print the listing, which is the same as the top-level "dir" command's.
     */
    run(session, command) {
        const allFiles = session.getInputFiles(command.options.getFlag("--system"));
        const { selected, unmatchedPattern } = selectInputFiles(allFiles, command.args);
        if (unmatchedPattern !== undefined) {
            throw new ToolError("No file on the disk matches \"" + unmatchedPattern + "\"");
        }
        printDirListing(selected);
    },
};

/**
 * All the commands of the "disk" command.
 */
export const DISK_COMMANDS: DiskCommand[] = [
    DIR_COMMAND,
];
