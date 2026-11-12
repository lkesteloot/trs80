import {setColorLevel} from "../colors.js";
import {captureLogsAsync, printJson} from "../json.js";
import {ToolError, ToolExitCode} from "../utils.js";
import {DISK_COMMANDS, DISK_GLOBAL_OPTIONS, runDiskCommands} from "./DiskCommands.js";
import {type ParsedDiskCommand, parseDiskCommandLine, type DiskOptionValues} from "./DiskCommandParser.js";
import {parseDosName} from "./DiskHelp.js";
import {JSON_NEEDS_COMMANDS_MESSAGE, runDiskShell} from "./DiskShell.js";
import {JsonDiskRun} from "./DiskOutput.js";
import {openDiskSession, saveAndReport} from "./DiskFiles.js";

/**
 * Handle the "disk" command: open one floppy or hard disk image and run commands on it, in order.
 * The first command to fail stops the rest, and so does a command that ends the session
 * (such as "quit"). Changes are saved once, after the last command, but only if every command
 * worked (and "abort" discards them). With no commands, open a shell: interactive on a terminal, otherwise
 * a script read from standard input.
 *
 * With --json, nothing but one JSON object describing the whole run is printed (see {@link DiskRunJson}),
 * including any failure, and the exit code is 1 if anything failed. Only a syntax error is reported as
 * text, since it's found before anything runs.
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

    if (globalOptions.has("--json")) {
        // A shell on a terminal has no end to describe.
        if (commands.length === 0 && process.stdin.isTTY) {
            throw new ToolError(JSON_NEEDS_COMMANDS_MESSAGE);
        }
        await diskJson(pathname, commands, globalOptions, ruleSet);
        return;
    }

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

/**
 * Do "disk --json": run the commands (or the script on standard input if there are none) and print one JSON
 * object that describes the run. A ToolError, from a command or from anything else after parsing, goes in
 * the document and sets the exit code to 1. Colors are off for the whole run, so the text in the document
 * has no escape codes.
 *
 * @param pathname the image's path.
 * @param commands the parsed commands, or none to read a script from standard input.
 * @param globalOptions the options that apply to the whole run.
 * @param ruleSet the rules of the DOS named with --dos, if any.
 */
async function diskJson(pathname: string, commands: ParsedDiskCommand[], globalOptions: DiskOptionValues,
                        ruleSet: ReturnType<typeof parseDosName> | undefined): Promise<void> {

    setColorLevel("off");
    const run = new JsonDiskRun();

    const { warnings } = await captureLogsAsync(async () => {
        try {
            const session = openDiskSession(pathname, {
                outputPathname: globalOptions.getString("--output"),
                dryRun: globalOptions.has("--dry-run"),
                partition: globalOptions.getString("--partition"),
                ruleSet,
                force: globalOptions.has("--force"),
                warn: message => run.warn(message),
            });

            if (commands.length === 0) {
                await runDiskShell(session, globalOptions, run);
            } else {
                await runDiskCommands(session, commands, globalOptions, run);
                run.endCommands();
                saveAndReport(session, false, run.outside);
            }
        } catch (e) {
            if (!(e instanceof ToolError)) {
                throw e;
            }
            // A failing command has recorded its own error.
            if (!run.hasFailedCommand()) {
                run.setError(e);
            }
        }
    });

    printJson(run.toJson(pathname, globalOptions.has("--dry-run"), warnings));
    const exitCode = run.exitCode();
    if (exitCode !== ToolExitCode.SUCCESS) {
        process.exitCode = exitCode;
    }
}
