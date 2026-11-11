import {colors} from "../colors.js";
import type {DiskCommandJson, DiskCommandResultJson, DiskRunJson} from "./DiskJson.js";

// Where the output of the "disk" command goes: printed as text, or collected for --json.

/**
 * What saving the session's changes came to, for a caller that wants more than the printed message.
 */
export interface SaveOutcome {
    /** The path the changes were written to, or null if nothing was written. */
    saved: string | null;
    /** Whether --dry-run kept changes from being written. */
    wouldHaveChanged: boolean;
}

/**
 * Where a command's output goes: printed as text, or collected for --json.
 */
export interface DiskOutput {
    /** A line of the command's report. */
    line(text: string): void;
    /** A warning (text mode prints it in the warning color). */
    warning(text: string): void;
    /** The command's result for --json. Text mode ignores it. Call it at most once. */
    result(value: DiskCommandResultJson): void;
    /** What saving came to, for --json's top level (see {@link saveAndReport}). Text mode ignores it. */
    saved(outcome: SaveOutcome): void;
    /** Whether output is going to JSON, for the few commands that act differently (list, boot). */
    readonly json: boolean;
}

/**
 * Where the commands of one run get their output from, and how failure is reported.
 */
export interface DiskRunOutput {
    /** Whether the run is described as JSON, in which case a failing command is recorded and not just thrown. */
    readonly json: boolean;
    /**
     * Start a command's output.
     *
     * @param commandText the command as typed.
     * @param name the command's name, without aliases.
     * @returns where the command's output goes, until the next command begins.
     */
    beginCommand(commandText: string, name: string): DiskOutput;
    /**
     * Record that the command that began last failed. Called before the error is thrown, in JSON mode only.
     */
    failCommand(message: string): void;
    /** Where output that belongs to no command goes, such as the report of the save at the end of the run. */
    readonly outside: DiskOutput;
    /** Say that the commands are over, so that what comes next belongs to no command. */
    endCommands(): void;
}

/**
 * The output that prints text, which is the usual one.
 */
export const TEXT_OUTPUT: DiskOutput = {
    json: false,
    line: text => console.log(text),
    warning: text => console.log(colors.warning(text)),
    result: () => {},
    saved: () => {},
};

/**
 * The run output that prints text. A failing command's error is thrown, for the caller to show.
 */
export const TEXT_RUN_OUTPUT: DiskRunOutput = {
    json: false,
    beginCommand: () => TEXT_OUTPUT,
    failCommand: () => {},
    outside: TEXT_OUTPUT,
    endCommands: () => {},
};

/**
 * Collects the output of a whole run into the document that "disk --json" prints. The commands' output goes
 * into one {@link DiskCommandJson} each, and what belongs to no command goes in the top level.
 */
export class JsonDiskRun implements DiskRunOutput {
    public readonly json = true;
    /** The commands begun so far. */
    private readonly commands: DiskCommandJson[] = [];
    /** Warnings that belong to no command. */
    private readonly warnings: string[] = [];
    /** The command that output goes to, or undefined between commands. */
    private current: DiskCommandJson | undefined = undefined;
    /** The path of the last save. */
    private savedPathname: string | null = null;
    /** Whether --dry-run has kept changes from being saved. */
    private dryRunWouldHaveChanged = false;
    /** Why the run stopped outside any command, or undefined. */
    private runError: string | undefined = undefined;
    /** Whether a command failed. */
    private commandFailed = false;

    public readonly outside: DiskOutput = {
        json: true,
        line: () => {},
        warning: text => this.warn(text),
        result: () => {},
        saved: outcome => this.recordSave(outcome),
    };

    /**
     * Start a new command, which ends the one before it.
     */
    public beginCommand(commandText: string, name: string): DiskOutput {
        const command: DiskCommandJson = {command: commandText, name, messages: [], warnings: []};
        this.commands.push(command);
        this.current = command;

        return {
            json: true,
            line: text => command.messages.push(text),
            warning: text => command.warnings.push(text),
            result: value => {
                command.result = value;
            },
            saved: outcome => this.recordSave(outcome),
        };
    }

    /**
     * Record that the current command failed, and so has no result.
     */
    public failCommand(message: string): void {
        const command = this.current;
        if (command === undefined) {
            throw new Error("No command to fail");
        }
        command.error = message;
        delete command.result;
        this.commandFailed = true;
    }

    /**
     * Stop sending output to the last command.
     */
    public endCommands(): void {
        this.current = undefined;
    }

    /**
     * Add a warning to the current command, or to the top level if there is none. This is what the
     * session's warnings go to.
     */
    public warn(text: string): void {
        if (this.current === undefined) {
            this.warnings.push(text);
        } else {
            this.current.warnings.push(text);
        }
    }

    /**
     * Record what a save did.
     */
    private recordSave(outcome: SaveOutcome): void {
        if (outcome.saved !== null) {
            this.savedPathname = outcome.saved;
        }
        if (outcome.wouldHaveChanged) {
            this.dryRunWouldHaveChanged = true;
        }
    }

    /**
     * Record that the run stopped for a reason that isn't a command's failure.
     */
    public setError(message: string): void {
        this.runError = message;
    }

    /**
     * Whether a command failed, in which case its error has been recorded.
     */
    public hasFailedCommand(): boolean {
        return this.commandFailed;
    }

    /**
     * Whether anything went wrong, which makes the exit code 1.
     */
    public hasError(): boolean {
        return this.commandFailed || this.runError !== undefined;
    }

    /**
     * The document for the whole run.
     *
     * @param image the image's path as given.
     * @param dryRun whether --dry-run was given.
     * @param logWarnings the warnings that the libraries logged during the run.
     */
    public toJson(image: string, dryRun: boolean, logWarnings: string[]): DiskRunJson {
        // The keys are in the order that DiskRunJson documents them.
        const json: DiskRunJson = {
            image,
            commands: this.commands,
            saved: this.savedPathname,
            ...(dryRun ? {wouldHaveChanged: this.dryRunWouldHaveChanged} : {}),
            warnings: [...logWarnings, ...this.warnings],
            ...(this.runError === undefined ? {} : {error: this.runError}),
        };
        return json;
    }
}
