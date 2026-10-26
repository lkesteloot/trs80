import fs from "fs";
import path from "path";
import {
    parseTrsdosFilename, parseTrsdosProtectionLevel, readTrsdosDiskInfo, TRSDOS_BLANK_PASSWORD_HASH,
    TRSDOS_DEFAULT_PASSWORD_HASH, Trsdos, type TrsdosAttributeChanges, type TrsdosDirEntry, type TrsdosDiskInfo,
    type TrsdosAddResult, type TrsdosDiskInfoChanges, type TrsdosFilename, TrsdosFindingSeverity, trsdosFilenameFromHost, trsdosFilenameToString,
    trsdosFindingKindSeverity, type TrsdosProtectionLevel, trsdosProtectionLevels, trsdosProtectionLevelToString, type TrsdosProtectionNames,
    trsdosRuleSetToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {printDirListing} from "../dir.js";
import {extractInputFiles, extractOneInputFile} from "../extract.js";
import {floppyDetailLines} from "../info.js";
import {selectInputFiles} from "../InputFile.js";
import {expandInputPatterns, pluralizeWithCount, selectByPatterns, systemWildcardHint, ToolError} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, DiskOptionValues, parseAddDate, ParsedDiskCommand} from "./DiskCommandParser.js";
import {CREATE_COMMAND, FORMAT_COMMAND} from "./DiskCreate.js";
import {BOOT_COMMAND} from "./DiskBoot.js";
import {TRIM_COMMAND} from "./DiskTrim.js";
import {REPAIR_COMMAND} from "./DiskRepair.js";
import {REDO_COMMAND, REVERT_COMMAND, UNDO_COMMAND} from "./DiskUndo.js";
import {DiskSession, DiskWritePurpose} from "./DiskSession.js";
import {importHostFile} from "./DiskImport.js";
import {LIST_COMMAND} from "./DiskList.js";
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
     * Whether the command can run when the session has no disk, because the image doesn't exist yet.
     * Without this, running the command in that state fails, telling the user to make the disk. Leave
     * it out for the commands that work on a disk.
     */
    worksWithoutDisk?: boolean;

    /**
     * Whether the command works on the undo history itself (as "undo", "redo" and "revert" do), so that
     * it isn't itself something to undo. Leave it out for every other command: any change that they make
     * to the disk is recorded so that "undo" can take it back.
     */
    managesHistory?: boolean;

    /**
     * Run the command.
     *
     * @param session the open disk.
     * @param command the parsed command, with its arguments and options.
     * @param globalOptions the options that apply to the whole run.
     * @returns nothing, or a promise for a command that has to wait for something (such as the emulator
     * running until the user stops it), which the commands after it wait for too.
     * @throws ToolError if the command fails, which stops the chain of commands.
     */
    run(session: DiskSession, command: ParsedDiskCommand, globalOptions: DiskOptionValues): void | Promise<void>;
}

/**
 * The options that apply to the whole run, given before the first command.
 */
export const DISK_GLOBAL_OPTIONS: DiskOptionSpec[] = [
    {
        name: "--output",
        shortName: "-o",
        valueName: "FILE",
        description: "save changes to FILE instead of replacing the image",
    },
    {
        name: "--dry-run",
        valueName: undefined,
        description: "write nothing, and say whether the disk would have changed (overrides --output)",
    },
    {
        name: "--dos",
        valueName: "NAME",
        description: "write by the rules of this DOS, if the disk doesn't say or says otherwise (\"help dos\" lists them)",
    },
    {
        name: "--force",
        valueName: undefined,
        description: "write even where the disk looks doubtful, if the doubt can be overridden",
    },
];

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
                description: "let the listing and wildcards include system files (a system file's name always finds it)",
            },
        ],
    },

    endsSession: false,

    /**
     * Print the listing, which is the same as the top-level "dir" command's. System files are listed only
     * with --system, or when a pattern names one without wildcards.
     */
    run(session, command) {
        const allFiles = session.getInputFiles(true);
        const { selected, unmatchedPattern, unmatchedOnlySystem } =
            selectInputFiles(allFiles, command.args, command.options.has("--system"));
        if (unmatchedPattern !== undefined) {
            throw new ToolError("No file on the disk matches \"" + unmatchedPattern + "\"" +
                systemWildcardHint(unmatchedOnlySystem));
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
        usage: "NAME... [--out-dir DIR] [--as HOSTPATH] [--lowercase] [--mark-damaged]",
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
     * one selected file to the given path. Nothing is written if a name matches no file. A system file is
     * extracted only by naming it, never by a wildcard.
     */
    run(session, command) {
        const outDir = command.options.getString("--out-dir");
        const asPathname = command.options.getString("--as");
        if (asPathname !== undefined && outDir !== undefined) {
            throw new ToolError("Use either --as or --out-dir, not both");
        }

        const allFiles = session.getInputFiles(true);
        if (asPathname !== undefined) {
            extractOneInputFile(allFiles, session.pathname, asPathname, command.args, false, false);
        } else {
            extractInputFiles(allFiles, session.pathname, outDir ?? ".", command.args, false,
                command.options.has("--mark-damaged"), command.options.has("--lowercase"), false);
        }
    },
};

/**
 * Choose the files that the patterns select, for the commands that take TRS-80 name patterns. A name
 * without wildcards selects the file of that name even if it's a system file, but a wildcard never
 * selects a system file (see selectByPatterns()).
 *
 * @param allEntries the primary entries of the files on the disk, in directory order, including system files.
 * @param patterns the name patterns the user gave. Each must match a file.
 * @return the files that any pattern matches, once each, in directory order.
 * @throws ToolError if a pattern matches no file.
 */
function selectDirEntries(allEntries: TrsdosDirEntry[], patterns: string[]): TrsdosDirEntry[] {
    const { selected, unmatchedPattern, unmatchedOnlySystem } = selectByPatterns(allEntries, patterns, {
        name: dirEntry => dirEntry.getFilename("."),
        hasDirectories: () => false,
        isSystem: dirEntry => dirEntry.isSystemFile(),
    }, false);
    if (unmatchedPattern !== undefined) {
        throw new ToolError("No file on the disk matches \"" + unmatchedPattern + "\"" +
            systemWildcardHint(unmatchedOnlySystem));
    }

    return selected;
}

/**
 * The "rm" command: remove files from the disk.
 */
const RM_COMMAND: DiskCommand = {
    spec: {
        name: "rm",
        aliases: ["del", "delete", "kill", "remove"],
        usage: "NAME...",
        summary: "remove files from the disk (BOOT/SYS and DIR/SYS can't be removed)",
        minArgs: 1,
        maxArgs: Infinity,
        options: [],
        extraHelpLines: [
            "A wildcard never matches a system file; to remove one, give its name.",
        ],
    },

    endsSession: false,

    /**
     * Remove the files that the names and patterns select, freeing their space. Every pattern must
     * match a file or nothing is removed, and a file that several patterns match is removed once.
     * Then say which files were removed.
     */
    run(session, command) {
        const removedNames: string[] = [];

        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            // Check every pattern before removing anything. The files come in directory order, so the
            // report is stable.
            const toRemove = selectDirEntries(writer.getFiles(), command.args);
            for (const dirEntry of toRemove) {
                writer.deleteFile(dirEntry);
                removedNames.push(dirEntry.getFilename("/"));
            }
        });

        for (const name of removedNames) {
            console.log("Removed " + name + ".");
        }
    },
};

/**
 * The "mv" command: rename a file on the disk.
 */
const MV_COMMAND: DiskCommand = {
    spec: {
        name: "mv",
        aliases: ["ren", "rename", "move"],
        usage: "OLDNAME NEWNAME",
        summary: "rename a file on the disk (BOOT/SYS and DIR/SYS can't be renamed)",
        minArgs: 2,
        maxArgs: 2,
        options: [],
    },

    endsSession: false,

    /**
     * Rename the one file called OLDNAME to NEWNAME, with no wildcards. It's an error if there's no such
     * file or if the new name belongs to another file. The file can be a system file, since it's named.
     * Then say what was renamed.
     */
    run(session, command) {
        const [oldText, newText] = command.args;
        const oldFilename = parseTrsdosFilename(oldText);
        if (typeof oldFilename === "string") {
            throw new ToolError(oldFilename);
        }
        const newFilename = parseTrsdosFilename(newText);
        if (typeof newFilename === "string") {
            throw new ToolError(newFilename);
        }
        const oldName = trsdosFilenameToString(oldFilename);
        const newName = trsdosFilenameToString(newFilename);

        let shownOldName = oldName;
        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            const dirEntry = writer.findFile(oldName);
            if (dirEntry === undefined) {
                throw new ToolError("No file on the disk is called " + oldName);
            }
            // The name as it is on the disk.
            shownOldName = dirEntry.getFilename("/");
            writer.renameFile(dirEntry, newFilename);
        });

        console.log("Renamed " + shownOldName + " to " + newName + ".");
    },
};

/**
 * Format a date as YYYY-MM-DD, which is how the user gives one.
 */
function formatYmd(date: Date): string {
    return date.getFullYear().toString().padStart(4, "0") + "-" +
        (date.getMonth() + 1).toString().padStart(2, "0") + "-" + date.getDate().toString().padStart(2, "0");
}

/**
 * Check that at most one of two mutually exclusive options was given.
 *
 * @param options the command's options.
 * @param first the long name of one option, such as "--invisible".
 * @param second the long name of the other.
 * @throws ToolError if both were given.
 */
function requireNotBoth(options: DiskOptionValues, first: string, second: string): void {
    if (options.has(first) && options.has(second)) {
        throw new ToolError("Use either " + first + " or " + second + ", not both");
    }
}

/**
 * Find the protection level that the user named for a disk, by the names its DOS uses.
 *
 * @param text the value of --protect.
 * @param names which DOS's names the disk uses.
 * @throws ToolError if the text isn't a level, listing the ones that are.
 */
function parseProtectLevel(text: string, names: TrsdosProtectionNames): TrsdosProtectionLevel {
    const level = parseTrsdosProtectionLevel(text, names);
    if (level === undefined) {
        const valid = trsdosProtectionLevels(names).map(l => trsdosProtectionLevelToString(l, names) + " (" + l + ")");
        throw new ToolError("Invalid --protect \"" + text + "\": use one of " + valid.join(", ") + " (or a number 0 to 7)");
    }
    return level;
}

/**
 * Describe what an "attr" command asked for, such as "invisible, protection READ, update password set".
 */
function describeChanges(changes: TrsdosAttributeChanges, names: TrsdosProtectionNames): string {
    const parts: string[] = [];
    if (changes.invisible !== undefined) {
        parts.push(changes.invisible ? "invisible" : "visible");
    }
    if (changes.system !== undefined) {
        parts.push(changes.system ? "system" : "user file");
    }
    if (changes.protectionLevel !== undefined) {
        parts.push("protection " + trsdosProtectionLevelToString(changes.protectionLevel, names));
    }
    if (changes.updatePassword !== undefined) {
        parts.push(changes.updatePassword === "" ? "update password removed" : "update password set");
    }
    if (changes.accessPassword !== undefined) {
        parts.push(changes.accessPassword === "" ? "access password removed" : "access password set");
    }
    if (changes.date === null) {
        parts.push("no date");
    } else if (changes.date !== undefined) {
        parts.push("date " + formatYmd(changes.date));
    }
    return parts.join(", ");
}

/**
 * Describe a file's attributes for "attr" without changing anything, such as
 * "HELLO/BAS: protection READ, invisible, update password, date 01/05/1983".
 */
function describeAttributes(dirEntry: TrsdosDirEntry, names: TrsdosProtectionNames): string {
    const parts = ["protection " + trsdosProtectionLevelToString(dirEntry.getProtectionLevel(), names)];
    if (dirEntry.isHidden()) {
        parts.push("invisible");
    }
    if (dirEntry.isSystemFile()) {
        parts.push("system");
    }
    if (dirEntry.updatePassword !== undefined && dirEntry.updatePassword !== TRSDOS_BLANK_PASSWORD_HASH) {
        parts.push("update password");
    }
    if (dirEntry.accessPassword !== undefined && dirEntry.accessPassword !== TRSDOS_BLANK_PASSWORD_HASH) {
        parts.push("access password");
    }
    // A month of zero means the date was never set (or the DOS has no dates), whatever the year bits say.
    if (dirEntry.month !== 0) {
        parts.push("date " + dirEntry.getFullDateString().trim());
    }
    return dirEntry.getFilename("/") + ": " + parts.join(", ");
}

/**
 * The "attr" command: change or show the attributes of files on the disk.
 */
const ATTR_COMMAND: DiskCommand = {
    spec: {
        name: "attr",
        aliases: ["attrib"],
        usage: "PATTERN... [--invisible | --visible] [--system | --no-system] [--protect LEVEL] " +
            "[--password PW] [--access-password PW] [--date YYYY-MM-DD | --no-date]",
        summary: "change the attributes of files on the disk",
        minArgs: 1,
        maxArgs: Infinity,
        options: [
            {
                name: "--invisible",
                valueName: undefined,
                description: "hide the files from directory listings",
            },
            {
                name: "--visible",
                valueName: undefined,
                description: "show the files in directory listings",
            },
            {
                name: "--system",
                valueName: undefined,
                description: "make the files system files (BOOT/SYS and DIR/SYS can't change)",
            },
            {
                name: "--no-system",
                valueName: undefined,
                description: "make the files user files",
            },
            {
                name: "--protect",
                valueName: "LEVEL",
                description: "set the protection level, by the names the disk's DOS uses (such as READ or EXEC) or 0-7",
            },
            {
                name: "--password",
                valueName: "PW",
                description: "set the update (owner) password, up to 8 letters and digits; \"\" for none",
            },
            {
                name: "--access-password",
                valueName: "PW",
                description: "set the access (user) password; \"\" for none (not on LDOS 5.3 and LS-DOS 6.3 disks)",
            },
            {
                name: "--date",
                valueName: "YYYY-MM-DD",
                description: "set the date, on DOSes that store dates",
            },
            {
                name: "--no-date",
                valueName: undefined,
                description: "remove the date",
            },
        ],
        extraHelpLines: [
            "A wildcard never matches a system file; to change one, give its name.",
        ],
    },

    endsSession: false,

    /**
     * Change the attributes that the options name on the files that the patterns select, in one change, so
     * that either every file changes or none does, and say what changed. Every pattern must match a file.
     * With no attribute options, show the selected files' attributes and change nothing.
     */
    run(session, command) {
        const options = command.options;
        requireNotBoth(options, "--invisible", "--visible");
        requireNotBoth(options, "--system", "--no-system");
        requireNotBoth(options, "--date", "--no-date");

        const changes: TrsdosAttributeChanges = {};
        if (options.has("--invisible") || options.has("--visible")) {
            changes.invisible = options.has("--invisible");
        }
        if (options.has("--system") || options.has("--no-system")) {
            changes.system = options.has("--system");
        }
        const protectText = options.getString("--protect");
        changes.updatePassword = options.getString("--password");
        changes.accessPassword = options.getString("--access-password");
        const dateText = options.getString("--date");
        if (dateText !== undefined) {
            changes.date = parseAddDate(dateText);
        } else if (options.has("--no-date")) {
            changes.date = null;
        }

        const changing = protectText !== undefined || Object.values(changes).some(value => value !== undefined);
        if (!changing) {
            // Just show the attributes.
            const trsdos = session.fileSystem;
            if (!(trsdos instanceof Trsdos)) {
                throw new ToolError("Can't show attributes: " + (trsdos === undefined ?
                    "can't find a DOS directory on \"" + session.pathname + "\"" :
                    trsdos.nameAndVersion + " disks aren't TRSDOS-family"));
            }
            const selected = selectDirEntries(trsdos.getDirEntries(true), command.args);
            for (const dirEntry of selected) {
                console.log(describeAttributes(dirEntry, trsdos.protectionNames));
            }
            return;
        }

        const changedLines: string[] = [];
        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            // The level's name depends on the disk, so it's parsed here. Everything is checked before
            // the first file changes.
            const names = writer.trsdos.protectionNames;
            if (protectText !== undefined) {
                changes.protectionLevel = parseProtectLevel(protectText, names);
            }
            const changeText = describeChanges(changes, names);
            const selected = selectDirEntries(writer.getFiles(), command.args);
            for (const dirEntry of selected) {
                writer.setAttributes(dirEntry, changes);
                changedLines.push("Changed " + dirEntry.getFilename("/") + ": " + changeText + ".");
            }
        });

        for (const line of changedLines) {
            console.log(line);
        }
    },
};

/**
 * A host file that the "add" command will put on the disk.
 */
interface AddSource {
    /** The host pathname, as the user gave it (after wildcards). */
    pathname: string;
    /** The TRSDOS name it will have. */
    filename: TrsdosFilename;
    /** The bytes to store, after conversion. */
    contents: Uint8Array;
    /** What the conversion did, to report if the file is added. */
    messages: string[];
}

/**
 * The "add" command: copy files from the host onto the disk.
 */
const ADD_COMMAND: DiskCommand = {
    spec: {
        name: "add",
        aliases: ["import", "put"],
        usage: "HOSTFILE... [--as NAME] [--ascii | --binary] [--system] [--invisible] [--date YYYY-MM-DD] [--overwrite]",
        summary: "copy files from the host onto the disk, converting BASIC, system programs, and text",
        minArgs: 1,
        maxArgs: Infinity,
        options: [
            {
                name: "--as",
                valueName: "NAME",
                description: "the TRSDOS name for the one host file (default: made from the host name)",
            },
            {
                name: "--ascii",
                valueName: undefined,
                description: "keep BASIC programs as text with CR line endings, instead of tokenizing them",
            },
            {
                name: "--binary",
                valueName: undefined,
                description: "copy every file exactly as it is, with no conversion",
            },
            {
                name: "--system",
                valueName: undefined,
                description: "make the files system files",
            },
            {
                name: "--invisible",
                valueName: undefined,
                description: "hide the files from directory listings",
            },
            {
                name: "--date",
                valueName: "YYYY-MM-DD",
                description: "record this date on the files, on DOSes that store dates (default: none)",
            },
            {
                name: "--overwrite",
                valueName: undefined,
                description: "replace files that are already on the disk, keeping their attributes, passwords " +
                    "and date unless --system, --invisible or --date say otherwise",
            },
        ],
    },

    endsSession: false,

    /**
     * Read the host files, convert them for the disk (see importHostFile()), and choose their TRSDOS
     * names, then add them all in one change, so that either every file is added or none is.
     * A name that's already on the disk is an error, unless --overwrite says to replace that file
     * in which case the new copy keeps the old file's attributes (a system file included).
     * Then say what was converted and which files were added or replaced, and warn once if the DOS couldn't
     * store the date or a new copy had to be written over its old copy's space.
     */
    run(session, command) {
        const asText = command.options.getString("--as");
        const dateText = command.options.getString("--date");
        const date = dateText === undefined ? undefined : parseAddDate(dateText);

        const importOptions = {ascii: command.options.has("--ascii"), binary: command.options.has("--binary")};

        const hostPathnames = expandInputPatterns(command.args);
        if (asText !== undefined && hostPathnames.length !== 1) {
            throw new ToolError("--as names one file, but " + pluralizeWithCount(hostPathnames.length, "host file") +
                " " + (hostPathnames.length === 1 ? "was" : "were") + " given");
        }

        // Read everything and choose the names before changing anything.
        const sources: AddSource[] = [];
        for (const pathname of hostPathnames) {
            const stat = fs.statSync(pathname, {throwIfNoEntry: false});
            if (stat === undefined) {
                throw new ToolError("Can't read \"" + pathname + "\": no such file");
            }
            if (!stat.isFile()) {
                throw new ToolError("Can't add \"" + pathname + "\": it isn't a regular file");
            }
            let contents: Uint8Array;
            try {
                contents = fs.readFileSync(pathname);
            } catch (e: any) {
                throw new ToolError("Can't read \"" + pathname + "\": " + e.message);
            }

            // Convert before choosing the name, since the conversion can change the extension.
            const imported = importHostFile(pathname, contents, importOptions);

            let filename: TrsdosFilename;
            if (asText !== undefined) {
                const parsed = parseTrsdosFilename(asText);
                if (typeof parsed === "string") {
                    throw new ToolError(parsed);
                }
                filename = parsed;
            } else {
                const hostName = path.basename(pathname);
                const nameToConvert = imported.extension === undefined ? hostName :
                    path.parse(hostName).name + "." + imported.extension;
                const converted = trsdosFilenameFromHost(nameToConvert);
                if (typeof converted === "string") {
                    throw new ToolError(converted);
                }
                filename = converted.filename;
                if (converted.changed) {
                    console.log(hostName + " will be " + trsdosFilenameToString(filename) + ".");
                }
            }

            const duplicate = sources.find(source =>
                trsdosFilenameToString(source.filename) === trsdosFilenameToString(filename));
            if (duplicate !== undefined) {
                throw new ToolError("\"" + duplicate.pathname + "\" and \"" + pathname + "\" would both be " +
                    trsdosFilenameToString(filename) + " on the disk");
            }
            sources.push({pathname, filename, contents: imported.contents, messages: imported.messages});
        }

        const warnings = new Set<string>();
        const addedLines: string[] = [];
        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            for (const source of sources) {
                addedLines.push(...source.messages);
                const existing = writer.findFile(trsdosFilenameToString(source.filename));
                let result: TrsdosAddResult;
                let verb: string;
                if (existing === undefined) {
                    result = writer.addFile(source.filename, source.contents, {
                        system: command.options.has("--system"),
                        invisible: command.options.has("--invisible"),
                        date,
                    });
                    verb = "Added";
                } else {
                    // The name as it is on the disk.
                    const existingName = existing.getFilename("/");
                    if (!command.options.has("--overwrite")) {
                        throw new ToolError(existingName + " is already on the disk (use --overwrite to replace it)");
                    }
                    // Only the flags that were given change; the new copy keeps the rest of the old file's.
                    result = writer.replaceFile(existing, source.contents, {
                        system: command.options.has("--system") ? true : undefined,
                        invisible: command.options.has("--invisible") ? true : undefined,
                        date,
                    });
                    verb = "Replaced";
                }
                addedLines.push(verb + " " + result.name + " (" + pluralizeWithCount(result.size, "byte") + ").");
                if (result.warning !== undefined) {
                    warnings.add(result.warning);
                }
            }
        });

        for (const line of addedLines) {
            console.log(line);
        }
        for (const warning of warnings) {
            console.log(colors.warning(warning + "."));
        }
    },
};

/**
 * Describe a disk's master password for the user, without revealing more than the hash tells us: the
 * password is only known if it's one of the two common ones.
 */
function describeMasterPassword(passwordHash: number): string {
    if (passwordHash === TRSDOS_DEFAULT_PASSWORD_HASH) {
        return "PASSWORD";
    } else if (passwordHash === TRSDOS_BLANK_PASSWORD_HASH) {
        return "blank";
    } else {
        return "set (hash 0x" + passwordHash.toString(16).toUpperCase().padStart(4, "0") + ")";
    }
}

/**
 * Describe a disk's AUTO command for the user.
 *
 * @param autoCommand the command, empty for none, or undefined if the disk has no place to keep it.
 */
function describeAutoCommand(autoCommand: string | undefined): string {
    if (autoCommand === undefined) {
        return "unknown (the disk has no system information sector)";
    }
    return autoCommand === "" ? "none" : autoCommand;
}

/**
 * Read the name, date, master password and AUTO command of the session's disk.
 *
 * @param session the open disk.
 * @return the information. The disk's DOS decides where the AUTO command is read from.
 * @throws ToolError if the disk isn't TRSDOS-family or its information can't be read.
 */
function readSessionDiskInfo(session: DiskSession): TrsdosDiskInfo {
    const trsdos = session.fileSystem;
    if (!(trsdos instanceof Trsdos)) {
        throw new ToolError("Can't show the disk's information: " + (trsdos === undefined ?
            "can't find a DOS directory on \"" + session.pathname + "\"" :
            trsdos.nameAndVersion + " disks aren't TRSDOS-family"));
    }
    const info = readTrsdosDiskInfo(trsdos, session.getWriteGate()?.ruleSet);
    if (typeof info === "string") {
        throw new ToolError("Can't read the disk's information: " + info);
    }
    return info;
}

/**
 * The "label" command: show or change the disk's name, date, master password and AUTO command.
 */
const LABEL_COMMAND: DiskCommand = {
    spec: {
        name: "label",
        aliases: [],
        usage: "[--name NAME] [--date YYYY-MM-DD] [--password PW] [--auto COMMAND | --no-auto]",
        summary: "show or change the disk's name, date, master password and AUTO command",
        minArgs: 0,
        maxArgs: 0,
        options: [
            {
                name: "--name",
                valueName: "NAME",
                description: "set the disk's name, up to 8 characters",
            },
            {
                name: "--date",
                valueName: "YYYY-MM-DD",
                description: "set the disk's date, as the years of the disk's DOS allow",
            },
            {
                name: "--password",
                valueName: "PW",
                description: "set the master password, up to 8 letters and digits; \"\" for none",
            },
            {
                name: "--auto",
                valueName: "COMMAND",
                description: "set the command that the DOS runs at boot, such as 'BASIC RUN\"MENU\"'",
            },
            {
                name: "--no-auto",
                valueName: undefined,
                description: "remove the AUTO command",
            },
        ],
    },

    endsSession: false,

    /**
     * With no options, show the disk's name, date, master password (as "PASSWORD", "blank", or its hash) and
     * AUTO command, and change nothing. Otherwise make the changes in one write and say what the disk now
     * has in the fields that changed.
     */
    run(session, command) {
        const options = command.options;
        requireNotBoth(options, "--auto", "--no-auto");

        const changes: TrsdosDiskInfoChanges = {};
        changes.name = options.getString("--name");
        const dateText = options.getString("--date");
        if (dateText !== undefined) {
            changes.date = parseAddDate(dateText);
        }
        changes.masterPassword = options.getString("--password");
        if (options.has("--no-auto")) {
            changes.autoCommand = "";
        } else {
            changes.autoCommand = options.getString("--auto");
        }

        const changing = Object.values(changes).some(value => value !== undefined);
        if (!changing) {
            // Just show the information.
            const info = readSessionDiskInfo(session);
            console.log("Name: " + info.name);
            console.log("Date: " + (info.date === "" ? "none" : info.date));
            console.log("Master password: " + describeMasterPassword(info.passwordHash));
            console.log("AUTO command: " + describeAutoCommand(info.autoCommand));
            return;
        }

        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            writer.setDiskInfo(changes);
        });

        // Say what the disk holds now, in the fields that changed, which may differ from what the user
        // typed (an uppercased name, for instance).
        const info = readSessionDiskInfo(session);
        const sentences: string[] = [];
        if (changes.name !== undefined) {
            sentences.push("Name is now " + info.name + ".");
        }
        if (changes.date !== undefined) {
            sentences.push("Date is now " + info.date + ".");
        }
        if (changes.masterPassword !== undefined) {
            sentences.push(changes.masterPassword.trim() === "" ? "Master password is now blank." :
                "Master password is changed.");
        }
        if (changes.autoCommand !== undefined) {
            sentences.push(changes.autoCommand === "" ? "AUTO command is removed." :
                "AUTO command is now " + describeAutoCommand(info.autoCommand) + ".");
        }
        console.log(sentences.join(" "));
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
        const gate = session.getWriteGate();
        if (gate !== undefined) {
            console.log("    Rules: " + (gate.ruleSet === undefined ? "unknown" : trsdosRuleSetToString(gate.ruleSet)));
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
    worksWithoutDisk: true,

    /**
     * Save the changes, if any (there are none if no disk was made). If that fails then the error is
     * reported as usual and the session doesn't end, so the shell is still there to try again or to abort.
     */
    run(session) {
        session.saveAndReport(false);
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
    worksWithoutDisk: true,

    /**
     * Discard the changes, if any, so that nothing is saved at the end.
     */
    run(session) {
        const discardedPathname = session.abort();
        if (discardedPathname !== undefined) {
            console.log("Discarded the changes to " + discardedPathname + ".");
        }
    },
};

/**
 * The "save" command: write the changes to the disk image now, and carry on.
 */
const SAVE_COMMAND: DiskCommand = {
    spec: {
        name: "save",
        aliases: [],
        usage: "",
        summary: "save the changes and carry on",
        minArgs: 0,
        maxArgs: 0,
        options: [],
    },

    endsSession: false,

    /**
     * Save the changes, saying so if there weren't any.
     */
    run(session) {
        session.saveAndReport(true);
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
    worksWithoutDisk: true,

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
    LIST_COMMAND,
    ADD_COMMAND,
    RM_COMMAND,
    MV_COMMAND,
    ATTR_COMMAND,
    LABEL_COMMAND,
    INFO_COMMAND,
    FREE_COMMAND,
    CHECK_COMMAND,
    REPAIR_COMMAND,
    CREATE_COMMAND,
    FORMAT_COMMAND,
    TRIM_COMMAND,
    BOOT_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    REVERT_COMMAND,
    SAVE_COMMAND,
    QUIT_COMMAND,
    ABORT_COMMAND,
    HELP_COMMAND,
];

/**
 * The text of a command as the user typed it, such as "add hello.bas --binary", for saying which
 * command "undo" undid. Arguments with spaces in them are put in double quotes.
 */
function commandLineText(command: ParsedDiskCommand): string {
    const words = [command.name, ...command.args, ...command.options.toWords()];
    return words.map(word => word === "" || /\s/.test(word) ? JSON.stringify(word) : word).join(" ");
}

/**
 * Run parsed commands on the session, in order. The first command to fail stops the rest.
 * The chain on the command line, each line of the shell, and each line of a script all run this way.
 *
 * @param session the open disk.
 * @param commands the commands to run.
 * @param globalOptions the options that apply to the whole run.
 * Each command that changes the disk can be taken back with the "undo" command.
 *
 * @returns a promise for whether a command ended the session (such as "quit"), in which case the commands
 * after it did not run and the caller should stop reading more.
 * @throws ToolError (as a rejection) if a command fails.
 */
export async function runDiskCommands(session: DiskSession, commands: ParsedDiskCommand[],
                                      globalOptions: DiskOptionValues): Promise<boolean> {

    for (const command of commands) {
        const diskCommand = DISK_COMMANDS.find(c => c.spec === command.spec);
        if (diskCommand === undefined) {
            throw new Error("Parsed command has no implementation: " + command.spec.name);
        }
        if (diskCommand.worksWithoutDisk !== true) {
            session.requireDisk();
        }
        if (diskCommand.managesHistory === true) {
            await diskCommand.run(session, command, globalOptions);
        } else {
            // Any change the command makes to the disk can be undone. This is done here, around every command,
            // so that a new command can't forget to make its change undoable.
            await session.runUndoable(commandLineText(command), () => diskCommand.run(session, command, globalOptions));
        }
        if (diskCommand.endsSession) {
            return true;
        }
    }

    return false;
}
