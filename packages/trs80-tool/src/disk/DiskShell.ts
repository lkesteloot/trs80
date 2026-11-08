import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {colorError} from "../lscolors.js";
import {ToolError, wrapMessage} from "../utils.js";
import {DISK_COMMANDS, runDiskCommands} from "./DiskCommands.js";
import {
    type DiskCommandSpec, DiskOptionValues, HostPathKind, parseDiskCommandLine, splitCommandLine,
} from "./DiskCommandParser.js";
import {DiskSession, type DiskShellTerminal} from "./DiskSession.js";

/**
 * The text of the prompt of the interactive shell, before it's colored: ">", with the name of the
 * selected partition of a hard disk before it, such as "HARDA>".
 *
 * @param partitionName the name of the selected partition, or undefined if there is none (or the disk is a floppy).
 */
export function makeDiskPrompt(partitionName: string | undefined): string {
    return (partitionName ?? "") + ">";
}

/**
 * One entry of a directory on the host computer, for completing host paths.
 */
export interface HostDirectoryEntry {
    /** The entry's name, without its directory. */
    name: string;
    /** Whether it's a directory (or a link to one). */
    isDirectory: boolean;
}

/**
 * List a directory on the host computer, or return nothing if it can't be read.
 */
export function listHostDirectory(dir: string): HostDirectoryEntry[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch (e) {
        return [];
    }
    return entries.map(entry => {
        let isDirectory = entry.isDirectory();
        if (entry.isSymbolicLink()) {
            try {
                isDirectory = fs.statSync(path.join(dir, entry.name)).isDirectory();
            } catch (e) {
                // A dangling link: offer it as a file.
            }
        }
        return {name: entry.name, isDirectory};
    });
}

/**
 * Complete a path on the host computer, as a Unix shell does: the part up to the last "/" is the directory
 * to look in (the current directory if there is none, with a leading "~" meaning the home directory), and
 * the rest is the start of a name in it. Directories end with "/", so that completing can go on into them.
 * Names starting with "." are offered only when the word's name part does.
 *
 * @param word the word to complete.
 * @param kind whether files or only directories are wanted.
 * @param listDirectory lists a host directory.
 * @returns the possible completions, each the whole word.
 */
function completeHostPath(word: string, kind: HostPathKind,
                          listDirectory: (dir: string) => HostDirectoryEntry[]): string[] {

    const slash = word.lastIndexOf("/");
    const dirPart = word.substring(0, slash + 1);
    const namePart = word.substring(slash + 1);
    let dir = dirPart === "" ? "." : dirPart;
    if (dir === "~/" || dir.startsWith("~/")) {
        dir = path.join(os.homedir(), dir.substring(2));
    }

    return listDirectory(dir)
        .filter(entry => entry.name.startsWith(namePart))
        .filter(entry => namePart.startsWith(".") || !entry.name.startsWith("."))
        .filter(entry => {
            switch (kind) {
                case HostPathKind.FILE:
                    return true;
                case HostPathKind.DIRECTORY:
                    return entry.isDirectory;
                default:
                    assertNever(kind);
            }
        })
        .map(entry => dirPart + entry.name + (entry.isDirectory ? "/" : ""))
        .sort();
}

/**
 * Complete the word at the end of a line typed into the shell. The first word of each command
 * (the start of the line, or after a lone ":") completes to command names. After that, a word that starts
 * with "-" completes to the command's options, the arguments of a command that takes host files (such as
 * "add") and the values of options that name host paths (such as "extract --out-dir") complete to paths
 * on the host computer, and any other word completes to file names on the disk. Matching of command and
 * disk file names ignores case, and those completions use the spelling of the name list. Quoting is not
 * understood: the word is whatever follows the last space.
 *
 * @param line the text before the cursor.
 * @param commandNames the names of the commands to offer.
 * @param fileNames the names of the files on the disk to offer.
 * @param commandSpecs the commands' specs, which say which arguments and options name host paths.
 * @param listDirectory lists a host directory (a parameter for testing).
 * @returns the format readline's completer wants: the possible completions of the last word
 * (each a whole word), and the last word that they would replace.
 */
export function completeDiskLine(line: string, commandNames: string[], fileNames: string[],
                                 commandSpecs: DiskCommandSpec[] = [],
                                 listDirectory: (dir: string) => HostDirectoryEntry[] = listHostDirectory):
    [string[], string] {

    const wordStart = Math.max(line.lastIndexOf(" "), line.lastIndexOf("\t")) + 1;
    const word = line.substring(wordStart);
    const before = line.substring(0, wordStart).trim();

    // A command name goes at the start of the line and after a ":" separator.
    const wantsCommand = before === "" || before.endsWith(" :") || before === ":";
    const lowerWord = word.toLowerCase();
    const matching = (candidates: string[]): string[] =>
        candidates.filter(name => name.toLowerCase().startsWith(lowerWord));
    if (wantsCommand) {
        return [matching(commandNames), word];
    }

    // The words of the command being typed, after the last ":".
    const words = before.split(/\s+/);
    const commandStart = words.lastIndexOf(":") + 1;
    const commandWord = (words[commandStart] ?? "").toLowerCase();
    const spec = commandSpecs.find(spec =>
        spec.name === commandWord || spec.aliases.some(alias => alias === commandWord));
    if (spec !== undefined) {
        const previousWord = words.length - 1 > commandStart ? words[words.length - 1] : undefined;
        const previousOption = previousWord === undefined ? undefined : spec.options.find(option =>
            option.name === previousWord || option.shortName === previousWord);
        if (previousOption?.valueName !== undefined) {
            const hostPath = previousOption.hostPath;
            return [hostPath === undefined ? [] : completeHostPath(word, hostPath, listDirectory), word];
        }
        if (word.startsWith("-")) {
            return [matching(spec.options.map(option => option.name)), word];
        }
        if (spec.hostPathArgs !== undefined) {
            return [completeHostPath(word, spec.hostPathArgs, listDirectory), word];
        }
    }

    return [matching(fileNames), word];
}

/**
 * Parse and run one line of the shell or of a script. Blank and comment lines do nothing.
 *
 * @param session the open disk.
 * @param line the line of text, which can have several commands separated by ":".
 * @param globalOptions the options from the real command line, which apply to the whole session.
 * @returns a promise for whether a command ended the session.
 * @throws ToolError (as a rejection) for syntax errors or failing commands.
 */
export async function runDiskLine(session: DiskSession, line: string, globalOptions: DiskOptionValues): Promise<boolean> {
    const words = splitCommandLine(line);
    if (words.length === 0) {
        return false;
    }

    // Global options come from the real command line, so there are none inside the shell.
    const parsed = parseDiskCommandLine(words, [], DISK_COMMANDS.map(c => c.spec));
    return await runDiskCommands(session, parsed.commands, globalOptions);
}

/**
 * Run the lines of a script in order. The first error stops the script, and lines after a
 * command that ends the session are not run.
 *
 * @param lines the lines of the script.
 * @param runLine runs one line, as runDiskLine() does, returning whether the session ended.
 * @throws ToolError (as a rejection) for the first failing line, with the line number (from 1) put before
 * the message.
 */
export async function runDiskScript(lines: string[], runLine: (line: string) => boolean | Promise<boolean>): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
        let ended: boolean;
        try {
            ended = await runLine(lines[i]);
        } catch (e) {
            if (e instanceof ToolError) {
                throw new ToolError("Line " + (i + 1) + ": " + e.message);
            }
            throw e;
        }
        if (ended) {
            break;
        }
    }
}

/**
 * Read all of standard input as lines of text.
 */
async function readStdinLines(): Promise<string[]> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const lines = text.split(/\r?\n/);
    // A final newline doesn't start another line.
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

/**
 * Read commands from standard input, one line each, and run them with no prompt. The changes
 * are saved at the end, all or nothing.
 *
 * @param session the open disk.
 * @param globalOptions the options from the real command line.
 * @throws ToolError at the first failing line.
 */
async function runDiskScriptFromStdin(session: DiskSession, globalOptions: DiskOptionValues): Promise<void> {
    const lines = await readStdinLines();
    await runDiskScript(lines, line => runDiskLine(session, line, globalOptions));

    // Only reached if every line worked. A "quit" has already saved, and an "abort" saves nothing.
    session.saveAndReport(false);
}

/**
 * Run the interactive shell on a terminal until the user quits (or presses Ctrl-D), which saves
 * the changes, or aborts (or presses Ctrl-C at an empty prompt), which discards them. Ctrl-C with text on
 * the line instead throws the text away and shows a fresh prompt, as shells do. Errors are shown and the
 * shell carries on, including a failure to save with "save" or "quit".
 *
 * A command can take the terminal for itself (as "boot" does, to run the emulator) through
 * {@link DiskSession.shellTerminal}: the shell closes its readline interface for that time and makes a
 * new one afterward, with the same history, since readline and a program reading keys from stdin can't share it.
 * Lines are run one at a time, in order, even when several arrive together, since a command can take a while.
 *
 * @param session the open disk.
 * @param globalOptions the options from the real command line.
 * @returns a promise that resolves when the shell is over, or rejects with the ToolError if
 * the final save (after Ctrl-D) fails.
 */
function runInteractiveDiskShell(session: DiskSession, globalOptions: DiskOptionValues): Promise<void> {
    console.log(session.describe());
    // A missing image has no disk to be read-only, and describe() has said what to do.
    const readOnlyReason = session.hasDisk() ? session.getReadOnlyReason() : undefined;
    if (readOnlyReason !== undefined) {
        console.log(colors.warning("Read-only: " + readOnlyReason));
    }
    console.log("Type \"help\" for a list of commands, and \"quit\" to leave.");

    const commandNames = DISK_COMMANDS.map(c => c.spec.name);
    const completer = (line: string): [string[], string] => {
        let fileNames: string[] = [];
        try {
            fileNames = session.getInputFiles(true).map(f => f.filename);
        } catch (e) {
            // No file system, so no file names to offer.
        }
        return completeDiskLine(line, commandNames, fileNames, DISK_COMMANDS.map(c => c.spec));
    };

    return new Promise<void>((resolve, reject) => {
        // The lines typed so far, newest first, which each readline interface starts with.
        let history: string[] = [];
        // Whether the shell has let go of the terminal for a command, so that closing readline isn't the end.
        let released = false;
        // Whether a command has ended the session, so that lines waiting to run are dropped.
        let sessionEnded = false;
        // Whether a command is running, as opposed to the shell waiting for a line.
        let commandRunning = false;
        // Ends when every line received so far has been run.
        let lineQueue: Promise<void> = Promise.resolve();
        let rl!: readline.Interface;

        /**
         * Parse and run one line, and show the prompt again (or close if a command ended the session).
         */
        const handleLine = async (line: string): Promise<void> => {
            if (sessionEnded) {
                return;
            }

            let ended = false;
            commandRunning = true;
            try {
                ended = await runDiskLine(session, line, globalOptions);
            } catch (e) {
                if (e instanceof ToolError) {
                    console.log(colorError(wrapMessage(e.message)));
                } else {
                    // A bug, but losing the session would be worse.
                    console.log(colorError(e instanceof Error ? e.stack ?? e.message : String(e)));
                }
            } finally {
                commandRunning = false;
            }

            if (ended) {
                sessionEnded = true;
                rl.close();
            } else {
                // A command may have chosen a partition.
                rl.setPrompt(colors.prompt(makeDiskPrompt(session.selectedPartitionName)));
                rl.prompt();
            }
        };

        /**
         * Throw away the text typed at the prompt and show a fresh, empty prompt below it, after a "^C", as zsh
         * does. Readline has no call that does this without redrawing over the old line, so this closes the
         * interface and makes a new one, as a command that takes the terminal does.
         */
        const abandonLine = (): void => {
            // Move to the end of the line, so that the ^C goes after all of the text.
            rl.write(null, {ctrl: true, name: "e"});
            process.stdout.write("^C\n");
            released = true;
            rl.close();
            released = false;
            startReading();
            rl.prompt();
        };

        /**
         * Make a readline interface on the terminal, and start reading lines.
         */
        const startReading = (): void => {
            rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: colors.prompt(makeDiskPrompt(session.selectedPartitionName)),
                completer,
                history,
            });
            rl.on("history", newHistory => {
                history = newHistory.slice();
            });
            rl.on("SIGINT", () => {
                // Text on the line, and the shell waiting for it: only start the line over.
                const lineIsEmpty = rl.line.length === 0;
                if (!lineIsEmpty && !commandRunning) {
                    abandonLine();
                    return;
                }

                const discardedPathname = session.abort();
                if (discardedPathname !== undefined) {
                    console.log("Discarded the changes to " + discardedPathname + ".");
                }
                sessionEnded = true;
                rl.close();
            });
            rl.on("close", () => {
                if (released) {
                    return;
                }

                // The "quit" command has already saved, and "abort" and Ctrl-C make this do nothing. This
                // is for Ctrl-D, which quits. Wait for the lines that are still running.
                lineQueue = lineQueue.then(() => {
                    try {
                        session.saveAndReport(false);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            rl.on("line", line => {
                lineQueue = lineQueue.then(() => handleLine(line));
            });
        };

        const shellTerminal: DiskShellTerminal = {
            release: () => {
                released = true;
                rl.close();
            },
            reacquire: () => {
                released = false;
                startReading();
            },
        };
        session.shellTerminal = shellTerminal;

        startReading();
        rl.prompt();
    }).finally(() => {
        session.shellTerminal = undefined;
    });
}

/**
 * Run the shell for the "disk" command: an interactive prompt if standard input is a terminal,
 * and otherwise a script read from standard input.
 *
 * @param session the open disk.
 * @param globalOptions the options from the real command line, which apply to the whole session.
 * @throws ToolError if a line of a script fails (an interactive shell shows errors and carries on).
 */
export async function runDiskShell(session: DiskSession, globalOptions: DiskOptionValues): Promise<void> {
    if (process.stdin.isTTY) {
        await runInteractiveDiskShell(session, globalOptions);
    } else {
        await runDiskScriptFromStdin(session, globalOptions);
    }
}
