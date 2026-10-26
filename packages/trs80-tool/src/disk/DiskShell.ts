import readline from "readline";
import {colors} from "../colors.js";
import {colorError} from "../lscolors.js";
import {ToolError} from "../utils.js";
import {DISK_COMMANDS, runDiskCommands} from "./DiskCommands.js";
import {DiskOptionValues, parseDiskCommandLine, splitCommandLine} from "./DiskCommandParser.js";
import {DiskSession} from "./DiskSession.js";

/**
 * The prompt of the interactive shell.
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
 * @returns whether a command ended the session.
 * @throws ToolError for syntax errors or failing commands.
 */
export function runDiskLine(session: DiskSession, line: string, globalOptions: DiskOptionValues): boolean {
    const words = splitCommandLine(line);
    if (words.length === 0) {
        return false;
    }

    // Global options come from the real command line, so there are none inside the shell.
    const parsed = parseDiskCommandLine(words, [], DISK_COMMANDS.map(c => c.spec));
    return runDiskCommands(session, parsed.commands, globalOptions);
}

/**
 * Run the lines of a script in order. The first error stops the script, and lines after a
 * command that ends the session are not run.
 *
 * @param lines the lines of the script.
 * @param runLine runs one line, as runDiskLine() does, returning whether the session ended.
 * @throws ToolError for the first failing line, with the line number (from 1) put before the message.
 */
export function runDiskScript(lines: string[], runLine: (line: string) => boolean): void {
    for (let i = 0; i < lines.length; i++) {
        let ended: boolean;
        try {
            ended = runLine(lines[i]);
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
 * Read commands from standard input, one line each, and run them with no prompt.
 *
 * @param session the open disk.
 * @param globalOptions the options from the real command line.
 * @throws ToolError at the first failing line.
 */
async function runDiskScriptFromStdin(session: DiskSession, globalOptions: DiskOptionValues): Promise<void> {
    const lines = await readStdinLines();
    runDiskScript(lines, line => runDiskLine(session, line, globalOptions));
}

/**
 * Run the interactive shell on a terminal until the user quits (or presses Ctrl-D), or aborts
 * (or presses Ctrl-C). Errors are shown and the shell carries on.
 *
 * @param session the open disk.
 * @param globalOptions the options from the real command line.
 * @returns a promise that resolves when the shell is over.
 */
function runInteractiveDiskShell(session: DiskSession, globalOptions: DiskOptionValues): Promise<void> {
    console.log(session.describe());
    const readOnlyReason = session.getReadOnlyReason();
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

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: PROMPT,
        completer,
    });

    return new Promise<void>(resolve => {
        // Later, quitting will save changes and aborting (including Ctrl-C) will discard them.
        rl.on("SIGINT", () => {
            rl.close();
        });
        rl.on("close", () => {
            resolve();
        });
        rl.on("line", line => {
            let ended = false;
            try {
                ended = runDiskLine(session, line, globalOptions);
            } catch (e) {
                if (e instanceof ToolError) {
                    console.log(colorError(e.message));
                } else {
                    // A bug, but losing the session would be worse.
                    console.log(colorError(e instanceof Error ? e.stack ?? e.message : String(e)));
                }
            }

            if (ended) {
                rl.close();
            } else {
                rl.prompt();
            }
        });
        rl.prompt();
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
