import {DISK_COMMANDS, DISK_GLOBAL_OPTIONS} from "./DiskCommands.js";
import {parseDiskCommandLine} from "./DiskCommandParser.js";
import {DiskSession} from "./DiskSession.js";
import {ToolError} from "../utils.js";

/**
 * Handle the "disk" command: open one floppy image and run commands on it, in order.
 * The first command to fail stops the rest.
 *
 * @param words the raw words after "disk": the image, then the global options, then the
 * commands separated by lone ":" words.
 * @throws ToolError for syntax errors or failing commands.
 */
export function disk(words: string[]): void {
    const pathname = words[0];

    // Parse before opening the disk, so that a typo doesn't cost a decode and syntax
    // errors don't depend on the file.
    const { globalOptions, commands } = parseDiskCommandLine(words.slice(1), DISK_GLOBAL_OPTIONS,
        DISK_COMMANDS.map(c => c.spec));

    const session = DiskSession.open(pathname);

    if (commands.length === 0) {
        // An interactive shell will replace this in a later step.
        throw new ToolError("No command given. Try \"dir\".");
    }

    for (const command of commands) {
        const diskCommand = DISK_COMMANDS.find(c => c.spec === command.spec);
        if (diskCommand === undefined) {
            throw new Error("Parsed command has no implementation: " + command.spec.name);
        }
        diskCommand.run(session, command, globalOptions);
    }
}
