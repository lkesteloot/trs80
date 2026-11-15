import {
    HARD_DISK_FORMAT_DOSES, TRSDOS_FORMAT_DOSES, type TrsdosFormatDos, trsdosFormatDosToString,
} from "trs80-base";
import {
    createFloppy, createHardDisk, describeDriverSettings, DiskSession, type FormatRequest, formatFloppy,
    formatHardDiskPartition, getSessionFormatDos, isHardDiskPathname,
} from "trs80-disk";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {type CreateResultJson, trsdosNameToJson} from "./DiskJson.js";
import type {DiskOutput} from "./DiskOutput.js";
import {
    DiskOptionSpec, parseAddDate, parseCountOption, parseDensityOption, parseModelOption, type ParsedDiskCommand,
    parseSidesOption,
} from "./DiskCommandParser.js";
import {
    createCpmFromCommand, CPM_FORMAT_OPTION_SPECS, CPM_KEEP_SYSTEM_OPTION_SPEC, cpmHardDiskError, formatCpmFromCommand,
    rejectCpmOnlyOptions, sessionDiskIsCpm,
} from "./DiskCpmCreate.js";
import {formatDosHelpLines, formatDosItems, isCpmDosName, parseFormatDosName} from "./DiskHelp.js";

/**
 * The options of "create" and "format", which are the same except for what --force says.
 *
 * @param forceDescription the description of --force.
 */
function makeFormatOptionSpecs(forceDescription: string): DiskOptionSpec[] {
    return [
        {
            name: "--cylinders",
            valueName: "N",
            description: "the number of cylinders (the DOS's limits apply; cpm has 40 or 80, and its default is 40)",
        },
        {
            name: "--sides",
            valueName: "1|2",
            description: "the number of sides (trsdos-2.3 and trsdos-1.3 have only one; cpm's default is 1)",
        },
        {
            name: "--density",
            valueName: "single|double",
            description: "the recording density (trsdos-2.3 is single, and trsdos-1.3 and cpm are double only)",
        },
        {
            name: "--model",
            valueName: "1|3|4",
            description: "the TRS-80 the disk is for, which only decides ldos-5.3's density: single for 1, else double",
        },
        {
            name: "--name",
            valueName: "NAME",
            description: "the disk's name, up to 8 letters and digits starting with a letter (default: DATADISK)",
        },
        {
            name: "--date",
            valueName: "YYYY-MM-DD",
            description: "the date to put on the disk (default: today, as the DOS's FORMAT does)",
        },
        {
            name: "--force",
            valueName: undefined,
            description: forceDescription,
        },
    ];
}

/**
 * Read the DOS argument and the options that say what disk to make.
 *
 * @param command the parsed command, with at most one argument: the DOS.
 * @param doses the DOSes to list if the DOS isn't known (default: all of them).
 * @param includeCpm whether the list also names CP/M, which the caller deals with before this, for a floppy.
 * @throws ToolError if the DOS or an option has a bad value.
 */
function parseFormatChoices(command: ParsedDiskCommand, doses: readonly TrsdosFormatDos[] = TRSDOS_FORMAT_DOSES,
                            includeCpm = false): FormatRequest {
    const options = command.options;
    const dos = command.args.length === 0 ? undefined : parseFormatDosName(command.args[0], doses, includeCpm);
    const sides = parseSidesOption(options);
    const density = parseDensityOption(options);
    const model = parseModelOption(options);

    const dateText = options.getString("--date");

    return {
        dos,
        cylinders: parseCountOption(options, "--cylinders"),
        sides,
        density,
        model,
        name: options.getString("--name"),
        date: dateText === undefined ? undefined : parseAddDate(dateText),
    };
}

/**
 * Describe a new disk's state for the user after "create" or "format", saying so if the disk
 * can't be written to, which would stop later commands.
 */
function printNewDiskSummary(verb: string, session: DiskSession, out: DiskOutput): void {
    out.line(verb + " " + session.describe());
    const readOnlyReason = session.getReadOnlyReason();
    if (readOnlyReason !== undefined) {
        out.warning("Read-only: " + readOnlyReason);
    }
}

/**
 * Print what "create" did to the disk it made, if it replaced one in memory.
 */
function printReplaced(replaced: boolean, out: DiskOutput): void {
    if (replaced) {
        out.line("Replaced the disk in memory; nothing is saved until quit.");
    }
}

/**
 * Do "create" on a hard disk image: make a blank HDV disk of the heads and cylinders given, and with a DOS also
 * format equal partitions, split by cylinder, in it.
 *
 * @param session the session, which has had no checks yet.
 * @param command the parsed command.
 * @param out where the command's output goes.
 * @throws ToolError if the options don't make a disk, or there's a disk already and no --force.
 */
function createHardDiskFromCommand(session: DiskSession, command: ParsedDiskCommand, out: DiskOutput): void {
    const options = command.options;
    for (const name of ["--sides", "--density", "--system", "--minimal"]) {
        if (options.has(name)) {
            throw new ToolError(name + " only applies to floppy images, not hard disks");
        }
    }
    if (isCpmDosName(command.args[0])) {
        throw cpmHardDiskError();
    }
    rejectCpmOnlyOptions(command, "hard disks");

    const choices = parseFormatChoices(command, HARD_DISK_FORMAT_DOSES);
    const dos = choices.dos;
    const heads = parseCountOption(options, "--heads");
    const requestedPartitions = parseCountOption(options, "--partitions");
    if (dos === undefined) {
        for (const name of ["--partitions", "--model", "--name"]) {
            if (options.has(name)) {
                throw new ToolError(name + " needs a DOS to format the partitions for. The DOSes are:\n" +
                    formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
            }
        }
    }

    const result = createHardDisk(session, {
        dos,
        heads,
        cylinders: choices.cylinders,
        partitions: requestedPartitions,
        model: choices.model,
        name: choices.name,
        date: choices.date,
        force: options.has("--force"),
    });
    printReplaced(result.replaced, out);

    out.line("Created " + session.name + ": a blank HDV hard disk, " +
        pluralizeWithCount(result.cylinders, "cylinder") + ", " + pluralizeWithCount(result.heads, "head") + ", " +
        result.size + ", " +
        (result.partitionCount === 0 ? "no partitions; \"partition --add DOS\" makes one." :
            pluralizeWithCount(result.partitionCount, "partition") + " (" + trsdosFormatDosToString(dos!) + ")."));
    if (result.partitionCount > 0) {
        const partitions = session.getPartitions().map((partition, index) => ({number: index + 1, partition}));
        for (const line of describeDriverSettings(session.hardDisk.getGeometry(), partitions)) {
            out.line(line);
        }
    }
    out.result({description: session.describe(), replaced: result.replaced});
}

/**
 * The "create" command: make a new, blank, formatted data disk, or with --system a copy of a DOS's system disk.
 */
export const CREATE_COMMAND: DiskCommand = {
    spec: {
        name: "create",
        aliases: [],
        args: "[DOS]",
        summary: "make a new, blank, formatted data disk for a DOS, or a bootable system disk, or a hard disk image",
        // The DOS is required, but it's optional here so that run() can report a missing one by listing the choices.
        options: [
            ... makeFormatOptionSpecs("replace the disk that the image already has, in memory"),
            {
                name: "--system",
                valueName: undefined,
                description: "make a copy of the DOS's bootable system disk, not a blank one (--model 1 picks " +
                    "ldos-5.3's Model I disk, else its Model III disk)",
            },
            {
                name: "--minimal",
                valueName: undefined,
                description: "with --system, remove the files that aren't system files, leaving the DOS's own",
            },
            {
                name: "--heads",
                valueName: "N",
                description: "for a hard disk image (.hdv), the number of heads, 1 to 8 (default: 6)",
            },
            {
                name: "--partitions",
                valueName: "N",
                description: "for a hard disk image, how many equal partitions to make (default: as few as keep " +
                    "each at 203 cylinders or fewer)",
            },
            ... CPM_FORMAT_OPTION_SPECS,
        ],
        extraHelp: [
            { title: "DOS is one of:", style: "command", items: formatDosItems(TRSDOS_FORMAT_DOSES, true) },
            "With --system the disk is a copy of the DOS's own (TRSDOS 2.3, TRSDOS 1.3, LDOS 5.3.1, TRSDOS 6.2.1, " +
            "LS-DOS 6.3.1, or Montezuma Micro CP/M BIOS 2.32), which fixes its shape: --cylinders, --sides and " +
            "--density must match it.",
            "With cpm the disk is a Montezuma Micro CP/M 2.2 floppy in one of the layouts that \"help cpm-format\" " +
            "lists, a data format (mm-data, 10 x 512, 40 tracks, one side) unless --sides 2, --cylinders 80, or " +
            "--cpm-format says otherwise. --cpm-format may also be given before the command, as it is for the rest " +
            "of the disk command. A system layout gets its system tracks: the BIOS 2.32 system, configured by " +
            "Montezuma's CONFIG for a drive of that shape (with no startup command), for mm-system, mm-ds-system, " +
            "mm-80-system, and mm-80-ds-system, so the disk boots, and the boot sector that Montezuma's FORMAT " +
            "leaves (which says there's no CP/M on the disk) for the others. --system-from IMAGE copies another " +
            "disk's system tracks instead, which must read as the same layout, because the system tracks hold the " +
            "drive configuration. --name, --date, --model, and --minimal don't apply to cpm.",
            "A file named .hdv makes a hard disk image instead of a floppy: --cylinders (1 to 1023; default 840) and " +
            "--heads (1 to 8; default 6) give its shape, and the defaults are what FreHD makes. Without a DOS the " +
            "disk is blank, with no partitions (\"partition --add\" makes them). With ldos-5.3 or lsdos-6.3 (the " +
            "only DOSes with hard disk support here) it also gets --partitions equal partitions split by cylinder, " +
            "each of 35 to 203 cylinders, named HARDA, HARDB, and so on, with any leftover cylinders free. --model " +
            "and --date apply to all of them, and --name only when there's one. --sides, --density and --system " +
            "don't apply. An HDV file has no partition table, so this prints the settings that the DOS's hard disk " +
            "driver must be configured with to find the partitions.",
        ],
    },

    endsSession: false,

    worksWithoutDisk: true,

    /**
     * On a file named .hdv, make a hard disk image instead (see {@link createHardDisk}). With the DOS cpm, make a
     * Montezuma Micro CP/M disk (see {@link createCpmFromCommand}). Otherwise make the disk
     * with the DOS's usual layout, as its FORMAT would (with its boot sectors when we have them),
     * and put it in the session as if it had been opened, with changes pending. With --system the disk is
     * instead a copy of the DOS's system disk, optionally trimmed to its system files, and --name and
     * --date change that copy's name and date. This only works when the session has no disk, or with
     * --force, which replaces the session's disk in memory. The image is a DMK one, so a file name for another
     * kind is refused.
     */
    run(session, command, globalOptions, out) {
        const options = command.options;
        if (isHardDiskPathname(session)) {
            createHardDiskFromCommand(session, command, out);
            return;
        }
        for (const name of ["--heads", "--partitions"]) {
            if (options.has(name)) {
                throw new ToolError(name + " only applies to hard disk images; name the file .hdv");
            }
        }

        if (isCpmDosName(command.args[0])) {
            createCpmFromCommand(session, command, globalOptions, out, replaced => printReplaced(replaced, out),
                () => printNewDiskSummary("Created", session, out));
            return;
        }
        rejectCpmOnlyOptions(command, "this DOS");

        const choices = parseFormatChoices(command, TRSDOS_FORMAT_DOSES, true);
        if (choices.dos === undefined) {
            throw new ToolError("create needs a DOS to make the disk for. The DOSes are:\n" +
                formatDosHelpLines(TRSDOS_FORMAT_DOSES, true).join("\n"));
        }
        const dos = choices.dos;

        const result = createFloppy(session, {
            format: {...choices, dos},
            system: options.has("--system"),
            minimal: options.has("--minimal"),
            force: options.has("--force"),
        });

        printReplaced(result.replaced, out);
        printNewDiskSummary("Created", session, out);
        const systemCopy = result.systemCopy;
        if (systemCopy !== undefined) {
            out.line("Copied from the " + systemCopy.description + " (" + systemCopy.shape + ").");
            if (options.has("--minimal")) {
                const removedNames = systemCopy.removedNames;
                out.line(removedNames.length === 0 ? "No files to remove for --minimal." :
                    "Removed " + pluralizeWithCount(removedNames.length, "file") + " for --minimal: " +
                    removedNames.join(", ") + ".");
            }
        }

        const createResult: CreateResultJson = {description: session.describe(), replaced: result.replaced};
        if (systemCopy !== undefined) {
            createResult.systemDisk = {description: systemCopy.description, removed: systemCopy.removedNames.map(trsdosNameToJson)};
        }
        out.result(createResult);
    },
};

/**
 * Do "format" on a hard disk: format the chosen partition again, in the same place with the same size and
 * granules, so that it's an empty data partition.
 *
 * @param session the session, whose disk is a hard disk.
 * @param command the parsed command.
 * @param out where the command's output goes.
 * @throws ToolError if the options don't apply to a hard disk, no partition is chosen, the DOS isn't one that
 * hard disks can have, the partition has files and there's no --force, or the disk can't be written.
 */
function formatHardDiskFromCommand(session: DiskSession, command: ParsedDiskCommand, out: DiskOutput): void {
    const options = command.options;
    for (const name of ["--cylinders", "--sides", "--density"]) {
        if (options.has(name)) {
            throw new ToolError(name + " doesn't apply to a hard disk: format keeps the chosen partition's size");
        }
    }
    if (isCpmDosName(command.args[0])) {
        throw cpmHardDiskError();
    }
    rejectCpmOnlyOptions(command, "hard disks");
    const choices = parseFormatChoices(command, HARD_DISK_FORMAT_DOSES);

    // The default DOS is the chosen partition's, so there must be one. This says how to make one if there are none.
    session.getSelectedPartition();
    // Before asking for a DOS, which a NEWDOS/80 partition doesn't have that format can make.
    session.checkPartitionsCanChange();
    const dos = choices.dos ?? getSessionFormatDos(session);
    if (dos === undefined) {
        throw new ToolError("format needs a DOS to format for, since the partition's DOS isn't one that format can " +
            "make. The DOSes are:\n" + formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
    }

    const result = formatHardDiskPartition(session, {
        dos,
        model: choices.model,
        name: choices.name,
        date: choices.date,
        force: options.has("--force"),
    });
    out.line("Formatted " + result.label + " as an empty " + trsdosFormatDosToString(dos) + " partition (" +
        result.location + "); nothing is saved until quit.");
    out.result({description: session.describe(), replaced: true});
}

/**
 * The "format" command: erase the disk and format it as an empty data disk.
 */
export const FORMAT_COMMAND: DiskCommand = {
    spec: {
        name: "format",
        aliases: [],
        args: "[DOS]",
        summary: "erase the disk (or a hard disk's chosen partition) and format it as an empty data disk",
        options: [
            ... makeFormatOptionSpecs("erase a disk that has files"),
            ... CPM_FORMAT_OPTION_SPECS,
            CPM_KEEP_SYSTEM_OPTION_SPEC,
        ],
        extraHelp: [
            {
                title: "DOS is as for create (default: the disk's own DOS, if it's one of those):",
                style: "command",
                items: formatDosItems(TRSDOS_FORMAT_DOSES, true),
            },
            "With cpm the disk is formatted as a Montezuma Micro CP/M 2.2 floppy: with --cpm-format, in that layout; " +
            "otherwise, with --sides or --cylinders, as the data format with them; otherwise in the layout the disk " +
            "has now, if it's one of the presets, and else as the data format of its own sides and cylinders. " +
            "Montezuma's FORMAT erases the system tracks, so this does too, and gives them what create would; " +
            "--keep-system keeps the disk's own instead, when the new layout is the disk's own, and --system-from " +
            "IMAGE copies another disk's, which must read as the new layout. --name, --date, and --model don't apply to cpm.",
            "On a hard disk this formats the chosen partition (see \"partition\") again in the same place, with " +
            "the same cylinders, heads and granules. It keeps the partition's name unless --name is given, and " +
            "takes today's date unless --date is. The DOS must be ldos-5.3 or lsdos-6.3, and --force is needed if " +
            "the partition has files. --cylinders, --sides and --density don't apply.",
        ],
    },

    endsSession: false,

    /**
     * On a hard disk, format the chosen partition again (see {@link formatHardDiskPartition}). With the DOS cpm
     * (or no DOS, on a CP/M disk), format a Montezuma Micro CP/M disk (see {@link formatCpmFromCommand}). Otherwise
     * replace the disk in memory with a blank one, as "create" makes. The cylinders and sides default to the
     * current disk's, and the DOS to the current disk's (which must be given if the disk's isn't one that we can format).
     * The result is a DMK image, so a file name for another kind is refused. If the disk has files then
     * --force is required, and the files lost are counted in the message.
     */
    run(session, command, globalOptions, out) {
        if (session.isHardDisk()) {
            formatHardDiskFromCommand(session, command, out);
            return;
        }

        const options = command.options;
        // A CP/M disk has no DOS of the TRSDOS family, so "format" alone on one means to format it as CP/M again.
        const formatsCpm = isCpmDosName(command.args[0]) || (command.args.length === 0 && sessionDiskIsCpm(session));
        if (formatsCpm) {
            formatCpmFromCommand(session, command, globalOptions, out,
                () => printNewDiskSummary("Formatted", session, out));
            return;
        }
        rejectCpmOnlyOptions(command, "this DOS");
        const choices = parseFormatChoices(command, TRSDOS_FORMAT_DOSES, true);

        const dos = choices.dos ?? getSessionFormatDos(session);
        if (dos === undefined) {
            throw new ToolError("format needs a DOS to format for, since the disk's DOS isn't one that format can " +
                "make. The DOSes are:\n" + formatDosHelpLines(TRSDOS_FORMAT_DOSES, true).join("\n"));
        }

        formatFloppy(session, {format: {...choices, dos}, force: options.has("--force")});
        out.line("Replaced the disk in memory with a blank " + trsdosFormatDosToString(dos) +
            " disk; nothing is saved until quit.");
        printNewDiskSummary("Formatted", session, out);
        out.result({description: session.describe(), replaced: true});
    },
};
