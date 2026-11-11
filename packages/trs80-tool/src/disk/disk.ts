import {DISK_COMMANDS, DISK_GLOBAL_OPTIONS, runDiskCommands} from "./DiskCommands.js";
import {parseDiskCommandLine} from "./DiskCommandParser.js";
import {parseDosName} from "./DiskHelp.js";
import {runDiskShell} from "./DiskShell.js";
import {openDiskSession, saveAndReport} from "./DiskFiles.js";

/**
 * Handle the "disk" command: open one floppy or hard disk image and run commands on it, in order.
 * The first command to fail stops the rest, and so does a command that ends the session
 * (such as "quit"). Changes are saved once, after the last command, but only if every command
 * worked (and "abort" discards them). With no commands, open a shell: interactive on a terminal, otherwise
 * a script read from standard input.
 *
 * @param words the raw words after "disk": the image, then the global options, then the
 * commands separated by lone ":" words.
 * @throws ToolError for syntax errors or failing commands.
 */
export async function disk(words: string[]): Promise<void> {
    const pathname = words[0];

    // Parse before opening the disk, so that a typo doesn't cost a decode and syntax
    // errors don't depend on the file.
    const { globalOptions, commands } = parseDiskCommandLine(words.slice(1), DISK_GLOBAL_OPTIONS,
        DISK_COMMANDS.map(c => c.spec));

    const dosName = globalOptions.getString("--dos");
    const ruleSet = dosName === undefined ? undefined : parseDosName(dosName);

    const session = openDiskSession(pathname, {
        outputPathname: globalOptions.getString("--output"),
        dryRun: globalOptions.has("--dry-run"),
        partition: globalOptions.getString("--partition"),
        ruleSet,
        force: globalOptions.has("--force"),
    });

    if (commands.length === 0) {
        await runDiskShell(session, globalOptions);
    } else {
        // If a command fails then this throws and nothing is saved.
        await runDiskCommands(session, commands, globalOptions);
        saveAndReport(session, false);
    }
}
