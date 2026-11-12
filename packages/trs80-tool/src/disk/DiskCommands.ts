import fs from "fs";
import path from "path";
import {
    type TrsdosDiskInfo, type TrsdosDiskInfoChanges, type TrsdosFindingSeverity, trsdosFindingKindSeverity,
    trsdosRuleSetCliName, trsdosRuleSetToString,
} from "trs80-base";
import {assertNever} from "z80-base";
import {dirListingLines} from "../dir.js";
import {type ExtractedFile, extractInputFiles, extractOneInputFile} from "../extract.js";
import {floppyDetailLines, floppyGeometryToJson, osToJson} from "../info.js";
import {selectInputFiles} from "../InputFile.js";
import {fileToJson} from "../json.js";
import {expandInputPatterns, pluralizeWithCount, systemWildcardHint, ToolError, ToolErrorKind} from "../utils.js";
import {DiskCommandSpec, DiskOptionSpec, DiskOptionValues, HostPathKind, parseAddDate, ParsedDiskCommand} from "./DiskCommandParser.js";
import {CREATE_COMMAND, FORMAT_COMMAND} from "./DiskCreate.js";
import {BOOT_COMMAND} from "./DiskBoot.js";
import {TRIM_COMMAND} from "./DiskTrim.js";
import {REPAIR_COMMAND} from "./DiskRepair.js";
import {REDO_COMMAND, REVERT_COMMAND, UNDO_COMMAND} from "./DiskUndo.js";
import {
    type AddFileSource, type AddOptions, addFiles, type AttributeRequest, changeAttributes, changeDiskInfo,
    checkDisk, describeAttributes, describeAutoCommand, describeChanges, describeMasterPassword, DiskSession,
    findingSeverityHeading, getWriteProtect, killFiles, listAttributes, planAdd, readDiskInfo, renameFile,
} from "trs80-disk";
import {LIST_COMMAND} from "./DiskList.js";
import {MAP_COMMAND} from "./DiskMap.js";
import {parseBasicName, printDiskHelp} from "./DiskHelp.js";
import {PARTITION_COMMAND} from "./DiskPartition.js";
import {PROTECT_COMMAND} from "./DiskProtect.js";
import {saveAndReport, sessionInputFiles} from "./DiskFiles.js";
import {
    type AttribChangesJson, attribFileToJson, type CheckResultJson, dateToJson, diskInfoToJson, findingToJson,
    freeSpaceToJson, type InfoResultJson, type LabelResultJson, partitionsToJson, protectionToJson,
    trsdosNameToJson,
} from "./DiskJson.js";
import {type DiskOutput, type DiskRunOutput, TEXT_RUN_OUTPUT} from "./DiskOutput.js";
import {makeLineHelpOutput} from "./DiskCommander.js";

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
     * Whether the command only works on floppy images (because it makes or reshapes a floppy, or runs
     * its sectors), and so is refused on a hard disk. Leave it out for the commands that work on a file system.
     */
    floppyOnly?: boolean;

    /**
     * Run the command.
     *
     * @param session the open disk.
     * @param command the parsed command, with its arguments and options.
     * @param globalOptions the options that apply to the whole run.
     * @param out where the command's output goes: every line it prints goes through this, not to the console
     * (so that it can go in JSON), and a command that has a result for --json gives it here.
     * @returns nothing, or a promise for a command that has to wait for something (such as the emulator
     * running until the user stops it), which the commands after it wait for too.
     * @throws ToolError if the command fails, which stops the chain of commands.
     */
    run(session: DiskSession, command: ParsedDiskCommand, globalOptions: DiskOptionValues,
        out: DiskOutput): void | Promise<void>;
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
        name: "--partition",
        valueName: "N|NAME",
        description: "work on this partition of a hard disk, by number (from 1) or disk name (see \"partition\")",
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
    {
        name: "--json",
        valueName: undefined,
        description: "print one JSON object describing the whole run, instead of text",
    },
];

/**
 * The "dir" command: list the files on the disk, optionally only those matching patterns.
 */
const DIR_COMMAND: DiskCommand = {
    spec: {
        name: "dir",
        aliases: ["ls"],
        args: "[PATTERN...]",
        summary: "list the files on the disk, optionally only those matching the TRS-80 name patterns",
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
    run(session, command, globalOptions, out) {
        const allFiles = sessionInputFiles(session, true);
        const { selected, unmatchedPattern, unmatchedOnlySystem } =
            selectInputFiles(allFiles, command.args, command.options.has("--system"));
        if (unmatchedPattern !== undefined) {
            throw new ToolError("No file on the disk matches \"" + unmatchedPattern + "\"" +
                systemWildcardHint(unmatchedOnlySystem), ToolErrorKind.NOT_FOUND);
        }
        for (const line of dirListingLines(selected)) {
            out.line(line);
        }
        const readOnlyReason = session.getReadOnlyReason();
        out.result({
            os: session.fileSystem?.nameAndVersion ?? "",
            files: selected.map(inFile => fileToJson(inFile, undefined)),
            writable: readOnlyReason === undefined,
            ...(readOnlyReason === undefined ? {} : {readOnlyReason}),
        });
    },
};

/**
 * The "extract" command: copy files from the disk to the host, like the top-level command of that name.
 */
const EXTRACT_COMMAND: DiskCommand = {
    spec: {
        name: "extract",
        aliases: ["get", "export"],
        args: "<NAME...>",
        summary: "copy files from the disk to the host (use \"*\" for all of them)",
        options: [
            {
                name: "--out-dir",
                valueName: "DIR",
                description: "directory to write the files to, created if needed (default: the current directory)",
                hostPath: HostPathKind.DIRECTORY,
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
    run(session, command, globalOptions, out) {
        const outDir = command.options.getString("--out-dir");
        const asPathname = command.options.getString("--as");
        if (asPathname !== undefined && outDir !== undefined) {
            throw new ToolError("Use either --as or --out-dir, not both");
        }

        const allFiles = sessionInputFiles(session, true);
        let written: ExtractedFile[];
        if (asPathname !== undefined) {
            written = [extractOneInputFile(allFiles, session.name, asPathname, command.args, false, false,
                text => out.line(text))];
        } else {
            written = extractInputFiles(allFiles, session.name, outDir ?? ".", command.args, false,
                command.options.has("--mark-damaged"), command.options.has("--lowercase"), false,
                text => out.line(text));
        }
        out.result({files: written.map(file => ({name: file.name, path: file.pathname}))});
    },
};

/**
 * The "kill" command (as TRSDOS calls it): remove files from the disk.
 */
const KILL_COMMAND: DiskCommand = {
    spec: {
        name: "kill",
        aliases: ["rm", "del", "delete", "remove"],
        args: "<NAME...>",
        summary: "remove files from the disk (BOOT/SYS and DIR/SYS can't be removed)",
        options: [],
        extraHelp: [
            "A wildcard never matches a system file; to remove one, give its name.",
        ],
    },

    endsSession: false,

    /**
     * Remove the files that the names and patterns select, freeing their space. Every pattern must
     * match a file or nothing is removed, and a file that several patterns match is removed once.
     * Then say which files were removed.
     */
    run(session, command, globalOptions, out) {
        const removedNames = killFiles(session, command.args);

        for (const name of removedNames) {
            out.line("Removed " + name + ".");
        }
        out.result({removed: removedNames.map(trsdosNameToJson)});
    },
};

/**
 * The "rename" command (as TRSDOS calls it): rename a file on the disk.
 */
const RENAME_COMMAND: DiskCommand = {
    spec: {
        name: "rename",
        aliases: ["mv", "ren", "move"],
        args: "<OLDNAME> <NEWNAME>",
        summary: "rename a file on the disk (BOOT/SYS and DIR/SYS can't be renamed)",
        options: [],
    },

    endsSession: false,

    /**
     * Rename the one file called OLDNAME to NEWNAME, with no wildcards. It's an error if there's no such
     * file or if the new name belongs to another file. The file can be a system file, since it's named.
     * Then say what was renamed.
     */
    run(session, command, globalOptions, out) {
        const [oldText, newText] = command.args;
        const { oldName, newName } = renameFile(session, oldText, newText);

        out.line("Renamed " + oldName + " to " + newName + ".");
        out.result({from: trsdosNameToJson(oldName), to: trsdosNameToJson(newName)});
    },
};

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
 * The "attrib" command (as LDOS and TRSDOS 6 call it): change or show the attributes of files on the disk.
 */
const ATTRIB_COMMAND: DiskCommand = {
    spec: {
        name: "attrib",
        aliases: ["attr"],
        args: "<PATTERN...>",
        summary: "change the attributes of files on the disk",
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
        extraHelp: [
            "A wildcard never matches a system file; to change one, give its name.",
        ],
    },

    endsSession: false,

    /**
     * Change the attributes that the options name on the files that the patterns select, in one change, so
     * that either every file changes or none does, and say what changed. Every pattern must match a file.
     * With no attribute options, show the selected files' attributes and change nothing.
     */
    run(session, command, globalOptions, out) {
        const options = command.options;
        requireNotBoth(options, "--invisible", "--visible");
        requireNotBoth(options, "--system", "--no-system");
        requireNotBoth(options, "--date", "--no-date");

        const request: AttributeRequest = {};
        if (options.has("--invisible") || options.has("--visible")) {
            request.invisible = options.has("--invisible");
        }
        if (options.has("--system") || options.has("--no-system")) {
            request.system = options.has("--system");
        }
        request.protect = options.getString("--protect");
        request.updatePassword = options.getString("--password");
        request.accessPassword = options.getString("--access-password");
        const dateText = options.getString("--date");
        if (dateText !== undefined) {
            request.date = parseAddDate(dateText);
        } else if (options.has("--no-date")) {
            request.date = null;
        }

        const changing = Object.values(request).some(value => value !== undefined);
        if (!changing) {
            // Just show the attributes.
            const { dirEntries, protectionNames } = listAttributes(session, command.args);
            for (const dirEntry of dirEntries) {
                out.line(describeAttributes(dirEntry, protectionNames));
            }
            out.result({files: dirEntries.map(dirEntry => attribFileToJson(dirEntry, protectionNames))});
            return;
        }

        const { files, changes, protectionNames } = changeAttributes(session, command.args, request);
        const changeText = describeChanges(changes, protectionNames);
        for (const file of files) {
            out.line("Changed " + file + ": " + changeText + ".");
        }

        const changesJson: AttribChangesJson = {};
        if (changes.invisible !== undefined) {
            changesJson.invisible = changes.invisible;
        }
        if (changes.system !== undefined) {
            changesJson.system = changes.system;
        }
        if (changes.protectionLevel !== undefined) {
            changesJson.protection = protectionToJson(changes.protectionLevel, protectionNames);
        }
        if (changes.updatePassword !== undefined) {
            changesJson.updatePassword = changes.updatePassword === "" ? "removed" : "set";
        }
        if (changes.accessPassword !== undefined) {
            changesJson.accessPassword = changes.accessPassword === "" ? "removed" : "set";
        }
        if (changes.date !== undefined) {
            changesJson.date = dateToJson(changes.date);
        }
        out.result({files: files.map(trsdosNameToJson), changes: changesJson});
    },
};

/**
 * The "add" command: copy files from the host onto the disk.
 */
const ADD_COMMAND: DiskCommand = {
    spec: {
        name: "add",
        aliases: ["import", "put"],
        args: "<HOSTFILE...>",
        hostPathArgs: HostPathKind.FILE,
        summary: "copy files from the host onto the disk, converting BASIC, system programs, and text",
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
                name: "--basic",
                valueName: "3|4",
                description: "tokenize BASIC for Model III or Model 4 BASIC (default: the disk's DOS's)",
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
    run(session, command, globalOptions, out) {
        const asText = command.options.getString("--as");
        const dateText = command.options.getString("--date");
        const date = dateText === undefined ? undefined : parseAddDate(dateText);

        const basicText = command.options.getString("--basic");
        const addOptions: AddOptions = {
            as: asText,
            ascii: command.options.has("--ascii"),
            binary: command.options.has("--binary"),
            basic: basicText === undefined ? session.getBasicDialect() : parseBasicName(basicText),
            system: command.options.has("--system"),
            invisible: command.options.has("--invisible"),
            overwrite: command.options.has("--overwrite"),
            date,
        };

        // Read every file before changing anything.
        const sources: AddFileSource[] = [];
        for (const pathname of expandInputPatterns(command.args)) {
            const stat = fs.statSync(pathname, {throwIfNoEntry: false});
            if (stat === undefined) {
                throw new ToolError("Can't read \"" + pathname + "\": no such file", ToolErrorKind.NOT_FOUND);
            }
            if (!stat.isFile()) {
                throw new ToolError("Can't add \"" + pathname + "\": it isn't a regular file");
            }
            let bytes: Uint8Array;
            try {
                bytes = fs.readFileSync(pathname);
            } catch (e: any) {
                throw new ToolError("Can't read \"" + pathname + "\": " + e.message);
            }
            sources.push({label: pathname, name: path.basename(pathname), bytes});
        }

        // Convert and choose the names, then stop at the first file that can't be added.
        const plan = planAdd(session, sources, addOptions);
        for (const item of plan) {
            if (item.nameChanged) {
                out.line(item.source.name + " will be " + item.name + ".");
            }
            if (item.problem !== undefined) {
                throw new ToolError(item.problem);
            }
        }

        const result = addFiles(session, plan, addOptions);
        for (const file of result.files) {
            for (const message of file.conversionMessages) {
                out.line(message);
            }
            out.line((file.replaced ? "Replaced " : "Added ") + file.name + " (" +
                pluralizeWithCount(file.size, "byte") + ").");
        }
        for (const warning of result.warnings) {
            out.warning(warning + ".");
        }
        // The files come back in the order of the plan.
        out.result({
            files: result.files.map((file, index) => ({
                host: plan[index].source.label,
                name: trsdosNameToJson(file.name),
                size: file.size,
                replaced: file.replaced,
                conversions: file.conversionMessages,
            })),
        });
    },
};

/**
 * The disk's name, date, master password and AUTO command as the "label" command's JSON result, with the
 * date's century taken from the disk's DOS.
 *
 * @param session the open disk.
 * @param info the disk's information.
 */
function labelResultToJson(session: DiskSession, info: TrsdosDiskInfo): LabelResultJson {
    return diskInfoToJson(info, session.getWriteGate()?.ruleSet);
}

/**
 * The "label" command: show or change the disk's name, date, master password and AUTO command.
 */
const LABEL_COMMAND: DiskCommand = {
    spec: {
        name: "label",
        aliases: [],
        args: "",
        summary: "show or change the disk's name, date, master password and AUTO command",
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
    run(session, command, globalOptions, out) {
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
            const info = readDiskInfo(session);
            out.line("Name: " + info.name);
            out.line("Date: " + (info.date === "" ? "none" : info.date));
            out.line("Master password: " + describeMasterPassword(info.passwordHash, info.version));
            out.line("AUTO command: " + describeAutoCommand(info.autoCommand));
            out.result(labelResultToJson(session, info));
            return;
        }

        // Say what the disk holds now, in the fields that changed, which may differ from what the user
        // typed (an uppercased name, for instance).
        const info = changeDiskInfo(session, changes);
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
        out.line(sentences.join(" "));
        out.result(labelResultToJson(session, info));
    },
};

/**
 * The detail lines of "info" for a hard disk, after its one-line description: the geometry, the partitions,
 * and, if one is selected, its layout and file system.
 *
 * @param session the open hard disk.
 * @returns the lines, without indentation.
 */
function hardDiskInfoLines(session: DiskSession): string[] {
    const lines: string[] = [];
    const geometry = session.hardDisk.getGeometry();
    lines.push("Geometry: " + pluralizeWithCount(geometry.cylinderCount, "cylinder") + ", " +
        pluralizeWithCount(geometry.headCount, "head") + ", " + geometry.sectorsPerTrack + " sectors per track, " +
        geometry.sectorSize + " bytes per sector");
    for (const line of session.describePartitionLines()) {
        lines.push("Partition " + line.trimStart());
    }

    const partitionNumber = session.selectedPartitionNumber;
    const partition = partitionNumber === undefined ? undefined : session.getPartitions()[partitionNumber - 1];
    if (partition === undefined) {
        if (session.getPartitions().length > 1) {
            lines.push("No partition is selected; use \"partition N|NAME\" to choose one.");
        }
        return lines;
    }

    const trsdos = partition.trsdos;
    lines.push("Selected partition: " + partitionNumber + " (" + session.selectedPartitionName + "), " +
        partition.partition.describeLocation());
    const gatInfo = trsdos.getGatInfo();
    if (typeof gatInfo === "string") {
        lines.push("Error: " + gatInfo);
    } else {
        lines.push("Disk name: " + gatInfo.name);
        if (gatInfo.date !== "") {
            lines.push("Disk date: " + gatInfo.date);
        }
        if (gatInfo.autoCommand !== "") {
            lines.push("Auto command: " + gatInfo.autoCommand);
        }
    }
    lines.push("Directory cylinder: " + trsdos.dirLumpNumber);
    lines.push("Granules per cylinder: " + trsdos.granulesPerLump);
    lines.push("Sectors per granule: " + trsdos.sectorsPerGranule);
    lines.push(...freeSpaceLines(session));
    lines.push(...rulesAndWritableLines(session));
    return lines;
}

/**
 * The line of "info" about the free space, if it's known (or why it isn't).
 *
 * @param session the open disk.
 * @returns no lines, or one.
 */
function freeSpaceLines(session: DiskSession): string[] {
    const granuleMap = session.getGranuleMap();
    if (typeof granuleMap === "string") {
        return ["Free space: unknown (" + granuleMap + ")"];
    } else if (granuleMap !== undefined) {
        return ["Free space: " + session.getFreeSpaceText()];
    }
    return [];
}

/**
 * The lines of "info" about which DOS's rules apply and whether the disk can be written.
 *
 * @param session the open disk.
 */
function rulesAndWritableLines(session: DiskSession): string[] {
    const lines: string[] = [];
    const gate = session.getWriteGate();
    if (gate !== undefined) {
        lines.push("Rules: " + (gate.ruleSet === undefined ? "unknown" : trsdosRuleSetToString(gate.ruleSet)));
    }
    const readOnlyReason = session.getReadOnlyReason();
    lines.push("Writable: " + (readOnlyReason === undefined ? "yes" : "no. " + readOnlyReason));
    return lines;
}

/**
 * The "info" command: describe the disk and its layout.
 */
const INFO_COMMAND: DiskCommand = {
    spec: {
        name: "info",
        aliases: [],
        args: "",
        summary: "describe the disk image, its layout, and its file system",
        options: [],
    },

    endsSession: false,

    /**
     * Print the one-line description, then the same details as the top-level "info --verbose", then the
     * free space if it's known.
     */
    run(session, command, globalOptions, out) {
        const description = session.describe();
        let details: string[];
        if (session.isHardDisk()) {
            details = hardDiskInfoLines(session);
        } else {
            details = [
                ...floppyDetailLines(session.floppy, session.fileSystem),
                ...freeSpaceLines(session),
                ...rulesAndWritableLines(session),
            ];
        }
        out.line(description);
        for (const line of details) {
            out.line("    " + line);
        }

        const readOnlyReason = session.getReadOnlyReason();
        const writeProtected = getWriteProtect(session);
        // A hard disk has no file system until a partition is chosen (and asking for it is an error).
        const hasFileSystemChoice = !session.isHardDisk() || session.selectedPartitionNumber !== undefined;
        const fileSystem = hasFileSystemChoice ? session.fileSystem : undefined;
        let layout: Pick<InfoResultJson, "geometry" | "hardDiskGeometry">;
        if (session.isHardDisk()) {
            const geometry = session.hardDisk.getGeometry();
            layout = {
                hardDiskGeometry: {
                    cylinderCount: geometry.cylinderCount,
                    headCount: geometry.headCount,
                    sectorsPerTrack: geometry.sectorsPerTrack,
                    sectorSize: geometry.sectorSize,
                },
            };
        } else {
            layout = {geometry: floppyGeometryToJson(session.floppy)};
        }
        const result: InfoResultJson = {
            description,
            os: fileSystem === undefined ? null : osToJson(fileSystem, true),
            ...layout,
            writable: readOnlyReason === undefined,
            writeProtected: typeof writeProtected === "string" ? null : writeProtected,
        };
        const gate = fileSystem === undefined ? undefined : session.getWriteGate();
        if (gate !== undefined) {
            result.rules = gate.ruleSet === undefined ? null : trsdosRuleSetCliName(gate.ruleSet);
        }
        if (readOnlyReason !== undefined) {
            result.readOnlyReason = readOnlyReason;
        }
        const granuleMap = hasFileSystemChoice ? session.getGranuleMap() : undefined;
        if (granuleMap !== undefined && typeof granuleMap !== "string") {
            result.free = freeSpaceToJson(session.getFreeSpace());
        }
        if (session.isHardDisk()) {
            result.partitions = partitionsToJson(session);
        }
        out.result(result);
    },
};

/**
 * The "free" command: show how much room is left for new files.
 */
const FREE_COMMAND: DiskCommand = {
    spec: {
        name: "free",
        aliases: [],
        args: "",
        summary: "show the space available for new files",
        options: [],
    },

    endsSession: false,

    /**
     * Print the free space, from the granule map.
     */
    run(session, command, globalOptions, out) {
        out.line(session.getFreeSpaceText());
        out.result(freeSpaceToJson(session.getFreeSpace()));
    },
};

/**
 * The "check" command: report what's inconsistent in the file system, changing nothing.
 */
const CHECK_COMMAND: DiskCommand = {
    spec: {
        name: "check",
        aliases: [],
        args: "",
        summary: "check the file system for problems and say whether it's safe to write, changing nothing",
        options: [],
    },

    endsSession: false,

    /**
     * Print the findings, grouped by severity, then whether the disk can be written and why not.
     */
    run(session, command, globalOptions, out) {
        const {findings, readOnlyReason} = checkDisk(session);
        if (findings.length === 0) {
            out.line("No problems found.");
        }
        let previousSeverity: TrsdosFindingSeverity | undefined = undefined;
        for (const finding of findings) {
            // The findings are in order of severity.
            const severity = trsdosFindingKindSeverity(finding.kind);
            if (severity !== previousSeverity) {
                out.line(findingSeverityHeading(severity));
                previousSeverity = severity;
            }
            out.line("  " + finding.message);
        }

        out.line(readOnlyReason === undefined ? "Safe to write." : "Read-only: " + readOnlyReason);

        const result: CheckResultJson = {
            findings: findings.map(findingToJson),
            writable: readOnlyReason === undefined,
        };
        if (readOnlyReason !== undefined) {
            result.readOnlyReason = readOnlyReason;
        }
        out.result(result);
    },
};

/**
 * The "quit" command: save the disk if it changed, and leave the shell.
 */
const QUIT_COMMAND: DiskCommand = {
    spec: {
        name: "quit",
        aliases: ["exit"],
        args: "",
        summary: "save the disk if it changed, and leave the shell",
        options: [],
    },

    endsSession: true,
    worksWithoutDisk: true,

    /**
     * Save the changes, if any (there are none if no disk was made). If that fails then the error is
     * reported as usual and the session doesn't end, so the shell is still there to try again or to abort.
     */
    run(session, command, globalOptions, out) {
        saveAndReport(session, false, out);
    },
};

/**
 * The "abort" command: leave the shell, throwing away any changes.
 */
const ABORT_COMMAND: DiskCommand = {
    spec: {
        name: "abort",
        aliases: [],
        args: "",
        summary: "leave the shell, discarding any changes",
        options: [],
    },

    endsSession: true,
    worksWithoutDisk: true,

    /**
     * Discard the changes, if any, so that nothing is saved at the end.
     */
    run(session, command, globalOptions, out) {
        const discardedPathname = session.abort();
        if (discardedPathname !== undefined) {
            out.line("Discarded the changes to " + discardedPathname + ".");
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
        args: "",
        summary: "save the changes and carry on",
        options: [],
    },

    endsSession: false,

    /**
     * Save the changes, saying so if there weren't any.
     */
    run(session, command, globalOptions, out) {
        const outcome = saveAndReport(session, true, out);
        out.result({saved: outcome.saved});
    },
};

/**
 * The "help" command: list the commands, or describe one.
 */
const HELP_COMMAND: DiskCommand = {
    spec: {
        name: "help",
        aliases: [],
        args: "[COMMAND]",
        summary: "list the commands, or describe one and name its aliases",
        options: [],
    },

    endsSession: false,
    worksWithoutDisk: true,

    /**
     * Print the list of commands, or the help for the named one, wrapped to the terminal's width.
     */
    run(session, command, globalOptions, out) {
        printDiskHelp(command.args[0], DISK_COMMANDS.map(c => c.spec), DISK_GLOBAL_OPTIONS,
            makeLineHelpOutput(line => out.line(line)));
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
    KILL_COMMAND,
    RENAME_COMMAND,
    ATTRIB_COMMAND,
    LABEL_COMMAND,
    PROTECT_COMMAND,
    INFO_COMMAND,
    PARTITION_COMMAND,
    FREE_COMMAND,
    MAP_COMMAND,
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
 * command "undo" undid, and for --json. Arguments with spaces in them are put in double quotes.
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
 * @param runOutput where the commands' output goes, which is the console unless the run is described as JSON.
 * If the run is JSON then a command that fails is recorded (see {@link DiskRunOutput.failCommand}) before its
 * error is thrown.
 *
 * @returns a promise for whether a command ended the session (such as "quit"), in which case the commands
 * after it did not run and the caller should stop reading more.
 * @throws ToolError (as a rejection) if a command fails.
 */
export async function runDiskCommands(session: DiskSession, commands: ParsedDiskCommand[],
                                      globalOptions: DiskOptionValues,
                                      runOutput: DiskRunOutput = TEXT_RUN_OUTPUT): Promise<boolean> {

    for (const command of commands) {
        const diskCommand = DISK_COMMANDS.find(c => c.spec === command.spec);
        if (diskCommand === undefined) {
            throw new Error("Parsed command has no implementation: " + command.spec.name);
        }
        const commandText = commandLineText(command);
        const out = runOutput.beginCommand(commandText, diskCommand.spec.name);
        try {
            if (diskCommand.worksWithoutDisk !== true) {
                session.requireDisk();
            }
            if (diskCommand.floppyOnly === true && session.isHardDisk()) {
                throw new ToolError(diskCommand.spec.name + " works on floppy images, not hard disks");
            }
            if (diskCommand.managesHistory === true) {
                await diskCommand.run(session, command, globalOptions, out);
            } else {
                // Any change the command makes to the disk can be undone. This is done here, around every command,
                // so that a new command can't forget to make its change undoable.
                await session.runUndoable(commandText, () => diskCommand.run(session, command, globalOptions, out));
            }
        } catch (e) {
            if (runOutput.json && e instanceof ToolError) {
                runOutput.failCommand(e);
            }
            throw e;
        }
        if (diskCommand.endsSession) {
            return true;
        }
    }

    return false;
}
