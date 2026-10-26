import {TrsdosFindingSeverity, trsdosFindingKindSeverity} from "trs80-base";
import {assertNever} from "z80-base";
import {printDirListing} from "../dir.js";
import {extractInputFiles, extractOneInputFile} from "../extract.js";
import {floppyDetailLines} from "../info.js";
import {selectInputFiles} from "../InputFile.js";
import {ToolError} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, DiskOptionValues, ParsedDiskCommand} from "./DiskCommandParser.js";
import {DiskSession} from "./DiskSession.js";
import {diskCommandHelpLines, diskHelpLines} from "./DiskHelp.js";

/**
 * One command of the "disk" command: its syntax (for the parser and for help) and what it does.
 */
export interface DiskCommand {
    /** The syntax of the command. */
    spec: DiskCommandSpec;

    /** Whether running this command ends the session, so that no later command in the chain or script runs. */
    endsSession: boolean;

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
        maxArgs: Infinity,
        options: [
            {
                name: "--system",
                valueName: undefined,
                description: "include system files",
            },
        ],
    },

    endsSession: false,

    /**
     * Print the listing, which is the same as the top-level "dir" command's.
     */
    run(session, command) {
        const allFiles = session.getInputFiles(command.options.has("--system"));
        const { selected, unmatchedPattern } = selectInputFiles(allFiles, command.args);
        if (unmatchedPattern !== undefined) {
            throw new ToolError("No file on the disk matches \"" + unmatchedPattern + "\"");
        }
        printDirListing(selected);
    },
};

/**
 * The "extract" command: copy files from the disk to the host, like the top-level command of that name.
 */
const EXTRACT_COMMAND: DiskCommand = {
    spec: {
        name: "extract",
        aliases: ["get", "export"],
        usage: "NAME... [--out-dir DIR] [--as HOSTPATH] [--system] [--lowercase] [--mark-damaged]",
        summary: "copy files from the disk to the host (use \"*\" for all of them)",
        minArgs: 1,
        maxArgs: Infinity,
        options: [
            {
                name: "--out-dir",
                valueName: "DIR",
                description: "directory to write the files to, created if needed (default: the current directory)",
            },
            {
                name: "--as",
                valueName: "HOSTPATH",
                description: "write the one selected file to exactly this host path",
            },
            {
                name: "--system",
                valueName: undefined,
                description: "include system files",
            },
            {
                name: "--lowercase",
                valueName: undefined,
                description: "write the files with lowercase names",
            },
            {
                name: "--mark-damaged",
                valueName: undefined,
                description: "add \"[DAMAGED]\" to the name of files with unreadable sectors or other damage",
            },
        ],
    },

    endsSession: false,

    /**
     * Write the selected files to the host, as the top-level "extract" command does, or with --as write the
     * one selected file to the given path. Nothing is written if a name matches no file.
     */
    run(session, command) {
        const outDir = command.options.getString("--out-dir");
        const asPathname = command.options.getString("--as");
        if (asPathname !== undefined && outDir !== undefined) {
            throw new ToolError("Use either --as or --out-dir, not both");
        }

        const allFiles = session.getInputFiles(command.options.has("--system"));
        if (asPathname !== undefined) {
            extractOneInputFile(allFiles, session.pathname, asPathname, command.args, false);
        } else {
            extractInputFiles(allFiles, session.pathname, outDir ?? ".", command.args, false,
                command.options.has("--mark-damaged"), command.options.has("--lowercase"));
        }
    },
};

/**
 * The "info" command: describe the disk and its layout.
 */
const INFO_COMMAND: DiskCommand = {
    spec: {
        name: "info",
        aliases: [],
        usage: "",
        summary: "describe the disk image, its layout, and its file system",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: false,

    /**
     * Print the one-line description, then the same details as the top-level "info --verbose", then the
     * free space if it's known.
     */
    run(session) {
        console.log(session.describe());
        for (const line of floppyDetailLines(session.floppy, session.fileSystem)) {
            console.log("    " + line);
        }
        const granuleMap = session.getGranuleMap();
        if (typeof granuleMap === "string") {
            console.log("    Free space: unknown (" + granuleMap + ")");
        } else if (granuleMap !== undefined) {
            console.log("    Free space: " + session.getFreeSpaceText());
        }
        const readOnlyReason = session.getReadOnlyReason();
        console.log("    Writable: " + (readOnlyReason === undefined ? "yes" : "no. " + readOnlyReason));
    },
};

/**
 * The "free" command: show how much room is left for new files.
 */
const FREE_COMMAND: DiskCommand = {
    spec: {
        name: "free",
        aliases: [],
        usage: "",
        summary: "show the space available for new files",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: false,

    /**
     * Print the free space, from the granule map.
     */
    run(session) {
        console.log(session.getFreeSpaceText());
    },
};

/**
 * The heading for each severity of finding in the "check" command's report.
 */
function findingSeverityHeading(severity: TrsdosFindingSeverity): string {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "Doubts about the layout:";
        case TrsdosFindingSeverity.DAMAGE:
            return "Damage:";
        case TrsdosFindingSeverity.NOTE:
            return "Notes:";
        default:
            assertNever(severity);
    }
}

/**
 * The "check" command: report what's inconsistent in the file system, changing nothing.
 */
const CHECK_COMMAND: DiskCommand = {
    spec: {
        name: "check",
        aliases: [],
        usage: "",
        summary: "check the file system for problems and say whether it's safe to write, changing nothing",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: false,

    /**
     * Print the findings, grouped by severity, then whether the disk can be written and why not.
     */
    run(session) {
        const gate = session.getWriteGate();
        if (gate === undefined) {
            if (session.fileSystem === undefined) {
                throw new ToolError("Can't find a DOS directory on \"" + session.pathname + "\"");
            }
            throw new ToolError("Checking " + session.fileSystem.nameAndVersion + " disks isn't supported yet");
        }

        const findings = gate.check.findings;
        if (findings.length === 0) {
            console.log("No problems found.");
        }
        let previousSeverity: TrsdosFindingSeverity | undefined = undefined;
        for (const finding of findings) {
            // The findings are in order of severity.
            const severity = trsdosFindingKindSeverity(finding.kind);
            if (severity !== previousSeverity) {
                console.log(findingSeverityHeading(severity));
                previousSeverity = severity;
            }
            console.log("  " + finding.message);
        }

        const readOnlyReason = session.getReadOnlyReason();
        console.log(readOnlyReason === undefined ? "Safe to write." : "Read-only: " + readOnlyReason);
    },
};

/**
 * The "quit" command: save the disk if it changed, and leave the shell.
 */
const QUIT_COMMAND: DiskCommand = {
    spec: {
        name: "quit",
        aliases: ["exit"],
        usage: "",
        summary: "save the disk if it changed, and leave the shell",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: true,

    /**
     * Do nothing: the runner stops after a command that ends the session.
     */
    run() {
        // Nothing to save yet.
    },
};

/**
 * The "abort" command: leave the shell, throwing away any changes.
 */
const ABORT_COMMAND: DiskCommand = {
    spec: {
        name: "abort",
        aliases: [],
        usage: "",
        summary: "leave the shell, discarding any changes",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: true,

    /**
     * Do nothing: the runner stops after a command that ends the session.
     */
    run() {
        // Nothing to discard yet.
    },
};

/**
 * The "help" command: list the commands, or describe one.
 */
const HELP_COMMAND: DiskCommand = {
    spec: {
        name: "help",
        aliases: [],
        usage: "[COMMAND]",
        summary: "list the commands, or describe one and name its aliases",
        minArgs: 0,
        maxArgs: 1,
        options: [],
    },

    endsSession: false,

    /**
     * Print the list of commands, or the help for the named one.
     */
    run(session, command) {
        const specs = DISK_COMMANDS.map(c => c.spec);
        const lines = command.args.length === 0 ?
            diskHelpLines(specs, DISK_GLOBAL_OPTIONS) :
            diskCommandHelpLines(command.args[0], specs);
        for (const line of lines) {
            console.log(line);
        }
    },
};

/**
 * All the commands of the "disk" command, in the order that help lists them.
 */
export const DISK_COMMANDS: DiskCommand[] = [
    DIR_COMMAND,
    EXTRACT_COMMAND,
    INFO_COMMAND,
    FREE_COMMAND,
    CHECK_COMMAND,
    QUIT_COMMAND,
    ABORT_COMMAND,
    HELP_COMMAND,
];

/**
 * Run parsed commands on the session, in order. The first command to fail stops the rest.
 * The chain on the command line, each line of the shell, and each line of a script all run this way.
 *
 * @param session the open disk.
 * @param commands the commands to run.
 * @param globalOptions the options that apply to the whole run.
 * @returns whether a command ended the session (such as "quit"), in which case the commands after
 * it did not run and the caller should stop reading more.
 * @throws ToolError if a command fails.
 */
export function runDiskCommands(session: DiskSession, commands: ParsedDiskCommand[],
                                globalOptions: DiskOptionValues): boolean {

    for (const command of commands) {
        const diskCommand = DISK_COMMANDS.find(c => c.spec === command.spec);
        if (diskCommand === undefined) {
            throw new Error("Parsed command has no implementation: " + command.spec.name);
        }
        diskCommand.run(session, command, globalOptions);
        if (diskCommand.endsSession) {
            return true;
        }
    }

    return false;
}
