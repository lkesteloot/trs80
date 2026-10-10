import {ChildProcess, spawn} from "child_process";

// Sends our output to a pager, the way git does. The pager runs as a child process
// that reads its stdin from a pipe and writes to our terminal. We replace the
// write() functions of process.stdout (and process.stderr) to send to that pipe, so
// stdout is still a terminal, and chalk keeps its color level. Writes to the pipe
// are asynchronous, so the commands, which are synchronous, should call pagerYield()
// now and then to let the output reach the pager.

/**
 * Thrown by pagerYield() when the user has quit the pager, to abandon the command.
 */
export class PagerClosedError extends Error {
    constructor() {
        super("Pager was closed");
        this.name = "PagerClosedError";
    }
}

// The running pager, if any.
let pager: ChildProcess | undefined = undefined;
// Whether the pager has stopped accepting output.
let pagerClosed = false;
// Resolves when the pager exits.
let pagerExited: Promise<void> | undefined = undefined;
// The original write() functions, to restore when the pager is done.
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

/**
 * Return the shell command for the pager, or undefined if we shouldn't page.
 */
function getPagerCommand(): string | undefined {
    let command = process.env.TRS80_TOOL_PAGER ?? process.env.PAGER;
    if (command === undefined) {
        // Windows usually doesn't have less, so only page there if asked.
        if (process.platform === "win32") {
            return undefined;
        }
        command = "less";
    }

    command = command.trim();
    if (command === "" || command === "cat") {
        return undefined;
    }

    return command;
}

/**
 * Make a replacement for a stream's write() function that sends to the pager.
 */
function makePagerWrite(stdin: NodeJS.WritableStream): typeof process.stdout.write {
    return ((chunk: any, encoding?: any, callback?: any): boolean => {
        if (pagerClosed) {
            // Drop the output, the user has quit the pager.
            const cb = typeof encoding === "function" ? encoding : callback;
            if (typeof cb === "function") {
                cb();
            }
            return true;
        }
        return stdin.write(chunk, encoding, callback);
    }) as typeof process.stdout.write;
}

/**
 * Called when the user hits Ctrl-C. The pager gets it too, and less uses it to
 * interrupt what it's doing, so we stop sending it output but wait for it to exit.
 * Otherwise we'd exit and leave the pager running without its parent.
 */
function handleSigint(): void {
    process.exitCode = 130;
    if (pager !== undefined && !pagerClosed) {
        pagerClosed = true;
        pager.stdin?.end();
    }
}

/**
 * Start sending our output to the pager, if stdout is a terminal and a pager is
 * configured. Call stopPager() before exiting.
 */
export function startPager(): void {
    if (pager !== undefined || !process.stdout.isTTY) {
        return;
    }
    const command = getPagerCommand();
    if (command === undefined) {
        return;
    }

    // Same defaults as git: quit if the output fits on one screen, pass color
    // escapes through, and don't clear the screen.
    const env = {
        ...process.env,
        LESS: process.env.LESS ?? "FRX",
        LV: process.env.LV ?? "-c",
    };

    pager = spawn(command, {
        shell: true,
        stdio: ["pipe", "inherit", "inherit"],
        env,
    });
    const stdin = pager.stdin;
    if (stdin === null) {
        // Can't happen with a "pipe" stdin.
        pager = undefined;
        return;
    }

    let resolveExited = () => {};
    pagerExited = new Promise(resolve => resolveExited = resolve);
    pager.on("close", () => {
        pagerClosed = true;
        resolveExited();
    });
    pager.on("error", e => {
        // Couldn't start the shell. Go back to writing to the terminal.
        pagerClosed = true;
        restoreWrites();
        console.log("Can't run pager \"" + command + "\": " + e.message);
        resolveExited();
    });
    stdin.on("error", (e: NodeJS.ErrnoException) => {
        // EPIPE means the user quit the pager.
        pagerClosed = true;
        if (e.code !== "EPIPE") {
            restoreWrites();
            console.log("Error writing to pager: " + e.message);
        }
    });

    process.stdout.write = makePagerWrite(stdin);
    if (process.stderr.isTTY) {
        process.stderr.write = makePagerWrite(stdin);
    }
    process.on("SIGINT", handleSigint);
}

/**
 * Restore the write() functions that startPager() replaced.
 */
function restoreWrites(): void {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
}

/**
 * Let queued output reach the pager. Call this between chunks of work, like files.
 * Throws PagerClosedError if the user has quit the pager, since there's no point
 * in continuing.
 */
export async function pagerYield(): Promise<void> {
    const stdin = pager?.stdin;
    if (stdin === undefined || stdin === null) {
        return;
    }

    if (!pagerClosed) {
        if (stdin.writableNeedDrain) {
            // The pager isn't keeping up (the user is reading). Wait for it.
            await new Promise<void>(resolve => {
                const done = () => {
                    stdin.off("drain", done);
                    stdin.off("close", done);
                    resolve();
                };
                stdin.on("drain", done);
                stdin.on("close", done);
            });
        } else {
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    if (pagerClosed) {
        throw new PagerClosedError();
    }
}

/**
 * Finish sending output to the pager and wait for the user to quit it.
 * Does nothing if there's no pager.
 */
export async function stopPager(): Promise<void> {
    if (pager === undefined) {
        return;
    }

    if (!pagerClosed) {
        pager.stdin?.end();
    }
    await pagerExited;
    restoreWrites();
    process.off("SIGINT", handleSigint);
    pager = undefined;
}
