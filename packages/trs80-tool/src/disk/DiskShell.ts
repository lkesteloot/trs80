import readline from "readline";
import {colors} from "../colors.js";
import {colorError} from "../lscolors.js";
import {ToolError, wrapMessage} from "../utils.js";
import {DISK_COMMANDS, runDiskCommands} from "./DiskCommands.js";
import {DiskOptionValues, parseDiskCommandLine, splitCommandLine} from "./DiskCommandParser.js";
import {DiskSession, type DiskShellTerminal} from "./DiskSession.js";

/**
 * The text of the prompt of the interactive shell, before it's colored.
 */
const PROMPT = ">";

/**
 * Complete the word at the end of a line typed into the shell. The first word of each command
 * (the start of the line, or after a lone ":") completes to command names; any other word
 * completes to file names on the disk. Matching ignores case, and the completions use the
 * spelling of the name list. Quoting is not understood: the word is whatever follows the last space.
 *
 * @param line the text before the cursor.
 * @param commandNames the names of the commands to offer.
 * @param fileNames the names of the files on the disk to offer.
 * @returns the format readline's completer wants: the possible completions of the last word
 * (each a whole word), and the last word that they would replace.
 */
export function completeDiskLine(line: string, commandNames: string[], fileNames: string[]): [string[], string] {
    const wordStart = Math.max(line.lastIndexOf(" "), line.lastIndexOf("\t")) + 1;
    const word = line.substring(wordStart);
    const before = line.substring(0, wordStart).trim();

    // A command name goes at the start of the line and after a ":" separator.
    const wantsCommand = before === "" || before.endsWith(" :") || before === ":";
    const candidates = wantsCommand ? commandNames : fileNames;
    const lowerWord = word.toLowerCase();
    const hits = candidates.filter(name => name.toLowerCase().startsWith(lowerWord));

    return [hits, word];
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
        return completeDiskLine(line, commandNames, fileNames);
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
                prompt: colors.prompt(PROMPT),
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
