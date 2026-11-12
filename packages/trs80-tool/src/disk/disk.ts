import {setColorLevel} from "../colors.js";
import {captureLogsAsync, printJson} from "../json.js";
import {ToolError, ToolExitCode} from "../utils.js";
import {DISK_COMMANDS, DISK_GLOBAL_OPTIONS, runDiskCommands} from "./DiskCommands.js";
import {type ParsedDiskCommand, parseDiskCommandLine, type DiskOptionValues} from "./DiskCommandParser.js";
import {parseDosName} from "./DiskHelp.js";
import {JSON_NEEDS_COMMANDS_MESSAGE, runDiskShell} from "./DiskShell.js";
import {JsonDiskRun} from "./DiskOutput.js";
import type {DiskRunJson} from "./DiskJson.js";
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
    const { globalOptions, commands, ruleSet } = parseDiskWords(words.slice(1));

    if (globalOptions.has("--json")) {
        // A shell on a terminal has no end to describe.
        if (commands.length === 0 && process.stdin.isTTY) {
            throw new ToolError(JSON_NEEDS_COMMANDS_MESSAGE);
        }
        const { json, exitCode } = await runDiskJson(pathname, commands, globalOptions, ruleSet,
            globalOptions.has("--dry-run"));
        printJson(json);
        if (exitCode !== ToolExitCode.SUCCESS) {
            process.exitCode = exitCode;
        }
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
 * The words after the image, parsed: the global options, the commands, and the rules of the DOS named with
 * --dos, if any. This is done before opening the disk, so that a typo doesn't cost a decode and syntax errors
 * don't depend on the file.
 *
 * @throws ToolError for a syntax error or an unknown DOS.
 */
function parseDiskWords(words: string[]): {
    globalOptions: DiskOptionValues,
    commands: ParsedDiskCommand[],
    ruleSet: ReturnType<typeof parseDosName> | undefined,
} {
    const { globalOptions, commands } = parseDiskCommandLine(words, DISK_GLOBAL_OPTIONS,
        DISK_COMMANDS.map(c => c.spec));

    const dosName = globalOptions.getString("--dos");
    const ruleSet = dosName === undefined ? undefined : parseDosName(dosName);

    return { globalOptions, commands, ruleSet };
}

/**
 * What a "disk --json" run came to: the document it prints, and the exit status it gives.
 */
export interface DiskJsonOutcome {
    /** The document that describes the run. */
    json: DiskRunJson;
    /** The exit status: the failed command's, or the run's error's, or success. */
    exitCode: ToolExitCode;
}

/**
 * Do "disk --json" in this process without printing, for a caller such as the MCP server, which keeps
 * running between requests. Unlike the command line, there must be commands, because standard input isn't
 * ours to read a script from.
 *
 * @param pathname the image's path, with wildcards already expanded.
 * @param words the words after the image, as on the command line: the global options, then the commands
 * separated by lone ":" words. "--json" may be among them, but isn't needed.
 * @param readOnly whether to keep the run from changing anything outside this process: it runs as with
 * --dry-run, and commands that write host files (such as "extract") are refused before anything runs.
 * Otherwise the run saves its changes as the command line does.
 * @returns the document that "disk --json" would print, and the exit status it would give.
 * @throws ToolError for a syntax error, for no commands, or for a command refused by readOnly, all of which are
 * found before anything runs.
 */
export async function diskJsonRun(pathname: string, words: string[], readOnly: boolean): Promise<DiskJsonOutcome> {
    const { globalOptions, commands, ruleSet } = parseDiskWords(words);
    if (commands.length === 0) {
        throw new ToolError("Give at least one command, such as \"dir\"");
    }
    if (readOnly) {
        for (const command of commands) {
            const diskCommand = DISK_COMMANDS.find(c => c.spec === command.spec);
            if (diskCommand?.writesHostFiles === true) {
                throw new ToolError("\"" + command.spec.name + "\" writes host files, so it isn't allowed " +
                    "in a read-only run");
            }
        }
    }

    return runDiskJson(pathname, commands, globalOptions, ruleSet, readOnly || globalOptions.has("--dry-run"));
}

/**
 * Run the commands for "disk --json" (or the script on standard input if there are none), and describe the
 * run in one JSON document. A ToolError, from a command or from anything else after parsing, goes in the
 * document and decides the exit status. Colors are turned off, so the text in the document has no escape
 * codes.
 *
 * @param pathname the image's path.
 * @param commands the parsed commands, or none to read a script from standard input.
 * @param globalOptions the options that apply to the whole run.
 * @param ruleSet the rules of the DOS named with --dos, if any.
 * @param dryRun whether to keep changes from being saved, as --dry-run does.
 * @returns the document, and the exit status the run gives.
 */
async function runDiskJson(pathname: string, commands: ParsedDiskCommand[], globalOptions: DiskOptionValues,
                           ruleSet: ReturnType<typeof parseDosName> | undefined,
                           dryRun: boolean): Promise<DiskJsonOutcome> {

    setColorLevel("off");
    const run = new JsonDiskRun();

    const { warnings } = await captureLogsAsync(async () => {
        try {
            const session = openDiskSession(pathname, {
                outputPathname: globalOptions.getString("--output"),
                dryRun,
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

    return { json: run.toJson(pathname, dryRun, warnings), exitCode: run.exitCode() };
}
