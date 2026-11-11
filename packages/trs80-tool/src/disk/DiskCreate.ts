import path from "path";
import {
    Density, densityToString, type FloppyDisk, formatLdosPartition, formatTrsdosDataDisk, HARD_DISK_FORMAT_DOSES,
    hardDiskDosProblem, HARD_DISK_SECTOR_SIZE, HARD_DISK_SECTORS_PER_TRACK, makeBlankHdvHardDisk,
    PARTITION_MAX_CYLINDERS, PARTITION_MIN_CYLINDERS, TRSDOS_FORMAT_DOSES, TrsdosFormatDos, trsdosFormatDosToString,
    type TrsdosFormatOptions, TrsdosRuleSet,
} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {
    DiskOptionSpec, parseAddDate, parseCountOption, parseModelOption, type ParsedDiskCommand,
} from "./DiskCommandParser.js";
import {describeDriverSettings, DiskSession, DiskWritePurpose} from "trs80-disk";
import {formatDosHelpLines, formatDosItems, parseFormatDosName} from "./DiskHelp.js";
import {
    describeSystemDiskTemplate, findSystemDiskTemplate, getDataDiskBootSectors, getHardDiskBootSectors,
    loadSystemDiskTemplate,
} from "./DiskTemplates.js";

/**
 * The file name extensions of other kinds of disk image, which "create" and "format" refuse to save a
 * DMK image under, since the file would then be misnamed.
 */
const OTHER_IMAGE_EXTENSIONS = [".jv1", ".jv3", ".dsk", ".hfe", ".imd", ".scp", ".hdv"];

/**
 * What the user chose for the disk to make, with what they left out undefined.
 */
interface FormatChoices {
    /** The DOS to format for (the command's argument). */
    dos: TrsdosFormatDos | undefined;
    /** The number of cylinders (--cylinders). */
    cylinders: number | undefined;
    /** The number of sides, 1 or 2 (--sides). */
    sides: number | undefined;
    /** The density (--density). */
    density: Density | undefined;
    /** The TRS-80 model, which chooses LDOS's default density (--model). */
    model: 1 | 3 | 4 | undefined;
    /** The disk's name (--name). */
    name: string | undefined;
    /** The date to put on the disk (--date). */
    date: Date | undefined;
}

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
            description: "the number of cylinders (the DOS's limits apply)",
        },
        {
            name: "--sides",
            valueName: "1|2",
            description: "the number of sides (trsdos-2.3 and trsdos-1.3 have only one)",
        },
        {
            name: "--density",
            valueName: "single|double",
            description: "the recording density (trsdos-2.3 is single and trsdos-1.3 is double only)",
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
 * @throws ToolError if the DOS or an option has a bad value.
 */
function parseFormatChoices(command: ParsedDiskCommand,
                            doses: readonly TrsdosFormatDos[] = TRSDOS_FORMAT_DOSES): FormatChoices {
    const options = command.options;
    const dos = command.args.length === 0 ? undefined : parseFormatDosName(command.args[0], doses);

    const sides = parseCountOption(options, "--sides");
    if (sides !== undefined && sides !== 1 && sides !== 2) {
        throw new ToolError("Invalid --sides \"" + sides + "\": use 1 or 2");
    }

    let density: Density | undefined = undefined;
    const densityText = options.getString("--density");
    if (densityText !== undefined) {
        switch (densityText.toLowerCase()) {
            case "single":
            case "sd":
                density = Density.SINGLE;
                break;
            case "double":
            case "dd":
                density = Density.DOUBLE;
                break;
            default:
                throw new ToolError("Invalid --density \"" + densityText + "\": use single or double");
        }
    }

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
 * The density that a disk gets when the options don't say, following {@link formatTrsdosDataDisk}.
 */
function effectiveDensity(formatOptions: TrsdosFormatOptions): Density {
    if (formatOptions.density !== undefined) {
        return formatOptions.density;
    }

    switch (formatOptions.dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return Density.SINGLE;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return Density.DOUBLE;
        case TrsdosFormatDos.LDOS_5_3:
            return formatOptions.model === 1 ? Density.SINGLE : Density.DOUBLE;
        default:
            assertNever(formatOptions.dos);
    }
}

/**
 * Make the blank disk, in memory, with the DOS's own boot sectors when we have them for that DOS and
 * density, so that it matches what the DOS's FORMAT makes. Otherwise the disk gets a boot sector of ours.
 *
 * @param formatOptions what to make.
 * @return the disk.
 * @throws ToolError with the reason, if the DOS can't make a disk like that.
 */
function makeBlankDisk(formatOptions: TrsdosFormatOptions): FloppyDisk {
    const bootSectors = getDataDiskBootSectors(formatOptions.dos, effectiveDensity(formatOptions));
    const floppy = formatTrsdosDataDisk({... formatOptions, bootSectors});
    if (typeof floppy === "string") {
        throw new ToolError(floppy);
    }
    return floppy;
}

/**
 * The number of cylinders a new disk gets when the user doesn't say: 40, except 35 for TRSDOS 2.3.
 */
function defaultCylinders(dos: TrsdosFormatDos): number {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return 35;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return 40;
        default:
            assertNever(dos);
    }
}

/**
 * Whether a DOS lets the user choose the density, so that a disk being formatted can keep its own.
 */
function choosesDensity(dos: TrsdosFormatDos): boolean {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.TRSDOS_1_3:
            return false;
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return true;
        default:
            assertNever(dos);
    }
}

/**
 * Check that the file that the session will save to can hold a DMK image, which is what these commands
 * make. A name with no extension, or with an unfamiliar one, is allowed.
 *
 * @param session the session.
 * @param message what to say if the name is that of another kind of image.
 * @throws ToolError with the message if the name has the extension of another kind of image.
 */
function requireDmkPathname(session: DiskSession, message: string): void {
    const extension = path.extname(session.saveName).toLowerCase();
    if (OTHER_IMAGE_EXTENSIONS.includes(extension)) {
        throw new ToolError(message);
    }
}

/**
 * Describe a new disk's state for the user after "create" or "format", saying so if the disk
 * can't be written to, which would stop later commands.
 */
function printNewDiskSummary(verb: string, session: DiskSession): void {
    console.log(verb + " " + session.describe());
    const readOnlyReason = session.getReadOnlyReason();
    if (readOnlyReason !== undefined) {
        console.log(colors.warning("Read-only: " + readOnlyReason));
    }
}

/**
 * Describe a floppy's shape for the user, such as "40 cylinders, double-sided, double density".
 */
function describeShape(floppy: FloppyDisk): string {
    const geometry = floppy.getGeometry();
    const density = geometry.modalDataDensity === undefined ? "unknown" : densityToString(geometry.modalDataDensity);
    return pluralizeWithCount(geometry.cylinderCount, "cylinder") + ", " +
        (geometry.sideCount === 1 ? "single" : "double") + "-sided, " + density + " density";
}

/**
 * Check that the options don't ask for a shape that differs from the system disk's, since the files on it
 * fix its shape.
 *
 * @param choices what the user chose.
 * @param floppy the system disk.
 * @param description what the system disk is, such as "LS-DOS 6.3.1 system disk for the Model 4".
 * @throws ToolError if --cylinders, --sides or --density names something other than what the disk has.
 */
function checkSystemDiskShape(choices: FormatChoices, floppy: FloppyDisk, description: string): void {
    const geometry = floppy.getGeometry();
    const conflicts: string[] = [];
    if (choices.cylinders !== undefined && choices.cylinders !== geometry.cylinderCount) {
        conflicts.push("--cylinders " + choices.cylinders);
    }
    if (choices.sides !== undefined && choices.sides !== geometry.sideCount) {
        conflicts.push("--sides " + choices.sides);
    }
    if (choices.density !== undefined && choices.density !== geometry.modalDataDensity) {
        conflicts.push("--density " + densityToString(choices.density));
    }

    if (conflicts.length > 0) {
        throw new ToolError("The " + description + " is " + describeShape(floppy) + ", so create --system can't " +
            "use " + conflicts.join(" or "));
    }
}

/**
 * Make the session's disk a copy of a DOS's system disk, for "create --system".
 *
 * @param session the session, which has had its checks for replacing a disk.
 * @param choices what the user chose, including the DOS.
 * @param minimal whether to remove the files that aren't system files.
 * @throws ToolError if the options don't fit the system disk or the changes can't be made.
 */
function createSystemDisk(session: DiskSession, choices: FormatChoices, dos: TrsdosFormatDos, minimal: boolean): void {
    const template = findSystemDiskTemplate(dos, choices.model);
    const description = describeSystemDiskTemplate(template);
    const floppy = loadSystemDiskTemplate(template);
    checkSystemDiskShape(choices, floppy, description);

    const replacing = session.hasDisk();
    session.setFloppy(floppy);
    if (replacing) {
        console.log("Replaced the disk in memory; nothing is saved until quit.");
    }

    const removedNames: string[] = [];
    if (choices.name !== undefined || choices.date !== undefined || minimal) {
        session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
            if (choices.name !== undefined || choices.date !== undefined) {
                writer.setDiskInfo({name: choices.name, date: choices.date});
            }
            if (minimal) {
                // Keep the system files, which are the ones the DOS needs to boot.
                for (const dirEntry of writer.getFiles().filter(dirEntry => !dirEntry.isSystemFile())) {
                    writer.deleteFile(dirEntry);
                    removedNames.push(dirEntry.getFilename("/"));
                }
            }
        });
    }

    printNewDiskSummary("Created", session);
    console.log("Copied from the " + description + " (" + describeShape(floppy) + ").");
    if (minimal) {
        console.log(removedNames.length === 0 ? "No files to remove for --minimal." :
            "Removed " + pluralizeWithCount(removedNames.length, "file") + " for --minimal: " + removedNames.join(", ") + ".");
    }
}

/**
 * The file name extension of the hard disk images that "create" makes, which decides that it makes one.
 */
const HARD_DISK_EXTENSION = ".hdv";

/**
 * Whether the file that the session will save to is named as a hard disk image, so that "create" makes a hard
 * disk and not a floppy.
 */
function isHardDiskPathname(session: DiskSession): boolean {
    return path.extname(session.saveName).toLowerCase() === HARD_DISK_EXTENSION;
}

/**
 * What a new hard disk has when the user doesn't say, which is what FreHD makes for a new image.
 */
const DEFAULT_HARD_DISK_HEADS = 6;
const DEFAULT_HARD_DISK_CYLINDERS = 840;

/**
 * The most partitions that "create" names with the letters A to Z.
 */
const MAX_CREATED_PARTITIONS = 26;

/**
 * The name of the nth partition (from 0) that "create" makes: HARDA, HARDB, and so on.
 */
function createdPartitionName(index: number): string {
    return "HARD" + String.fromCharCode(65 + index);
}

/**
 * The size of a hard disk's sectors for the user, such as "39 MB".
 */
function describeHardDiskSize(heads: number, cylinders: number): string {
    const bytes = heads*cylinders*HARD_DISK_SECTORS_PER_TRACK*HARD_DISK_SECTOR_SIZE;
    return bytes >= 1024*1024 ? Math.round(bytes/(1024*1024)).toLocaleString() + " MB" :
        Math.round(bytes/1024).toLocaleString() + " KB";
}

/**
 * Do "create" on a hard disk image: make a blank HDV disk of the heads and cylinders given, and with a DOS also
 * format equal partitions, split by cylinder, in it.
 *
 * @param session the session, which has had no checks yet.
 * @param command the parsed command.
 * @throws ToolError if the options don't make a disk, or there's a disk already and no --force.
 */
function createHardDisk(session: DiskSession, command: ParsedDiskCommand): void {
    const options = command.options;
    for (const name of ["--sides", "--density", "--system", "--minimal"]) {
        if (options.has(name)) {
            throw new ToolError(name + " only applies to floppy images, not hard disks");
        }
    }

    const choices = parseFormatChoices(command, HARD_DISK_FORMAT_DOSES);
    const dos = choices.dos;
    const heads = parseCountOption(options, "--heads") ?? DEFAULT_HARD_DISK_HEADS;
    const cylinders = choices.cylinders ?? DEFAULT_HARD_DISK_CYLINDERS;
    const requestedPartitions = parseCountOption(options, "--partitions");
    if (dos === undefined) {
        for (const name of ["--partitions", "--model", "--name"]) {
            if (options.has(name)) {
                throw new ToolError(name + " needs a DOS to format the partitions for. The DOSes are:\n" +
                    formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
            }
        }
    } else {
        const dosProblem = hardDiskDosProblem(dos);
        if (dosProblem !== undefined) {
            throw new ToolError(dosProblem);
        }
    }
    if (session.hasDisk() && !options.has("--force")) {
        throw new ToolError(session.name + " already has a disk; use --force to replace it with a new blank one");
    }

    let hardDisk;
    try {
        hardDisk = makeBlankHdvHardDisk({heads, cylinders, date: choices.date});
    } catch (e) {
        throw new ToolError(e instanceof Error ? e.message : String(e));
    }

    let partitionCount = 0;
    if (dos !== undefined) {
        // Equal partitions from cylinder 0, with any leftover cylinders free.
        partitionCount = requestedPartitions ?? Math.ceil(cylinders/PARTITION_MAX_CYLINDERS);
        if (partitionCount < 1 || partitionCount > MAX_CREATED_PARTITIONS) {
            throw new ToolError("--partitions is from 1 to " + MAX_CREATED_PARTITIONS + ", not " + partitionCount);
        }
        const partitionCylinders = Math.floor(cylinders/partitionCount);
        if (partitionCylinders > PARTITION_MAX_CYLINDERS) {
            throw new ToolError(pluralizeWithCount(partitionCount, "partition") + " of " + cylinders + " cylinders " +
                "would be " + partitionCylinders + " cylinders each, and a partition has at most " +
                PARTITION_MAX_CYLINDERS + "; use --partitions " + Math.ceil(cylinders/PARTITION_MAX_CYLINDERS) +
                " or more");
        }
        if (partitionCylinders < PARTITION_MIN_CYLINDERS) {
            throw new ToolError(pluralizeWithCount(partitionCount, "partition") + " of " + cylinders + " cylinders " +
                "would be " + partitionCylinders + " cylinders each, and a partition has at least " +
                PARTITION_MIN_CYLINDERS + (requestedPartitions === undefined ?
                    "; the disk is too small to format" : "; use fewer partitions"));
        }
        if (partitionCount > 1 && choices.name !== undefined) {
            throw new ToolError("--name names one partition, but this makes " + partitionCount +
                " (HARDA, HARDB, ...); leave it out, and use \"label\" to rename them afterward");
        }

        const bootSectors = getHardDiskBootSectors(dos, choices.model);
        for (let i = 0; i < partitionCount; i++) {
            const message = formatLdosPartition(hardDisk, {
                dos,
                startCylinder: i*partitionCylinders,
                startHead: 0,
                cylinders: partitionCylinders,
                heads,
                name: choices.name ?? createdPartitionName(i),
                date: choices.date,
                bootSectors,
            });
            if (message !== undefined) {
                throw new ToolError(message);
            }
        }
    }

    const replacing = session.hasDisk();
    session.setHardDisk(hardDisk);
    if (replacing) {
        console.log("Replaced the disk in memory; nothing is saved until quit.");
    }

    console.log("Created " + session.name + ": a blank HDV hard disk, " +
        pluralizeWithCount(cylinders, "cylinder") + ", " + pluralizeWithCount(heads, "head") + ", " +
        describeHardDiskSize(heads, cylinders) + ", " +
        (partitionCount === 0 ? "no partitions; \"partition --add DOS\" makes one." :
            pluralizeWithCount(partitionCount, "partition") + " (" + trsdosFormatDosToString(dos!) + ")."));
    if (partitionCount > 0) {
        const partitions = session.getPartitions().map((partition, index) => ({number: index + 1, partition}));
        for (const line of describeDriverSettings(hardDisk.getGeometry(), partitions)) {
            console.log(line);
        }
    }
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
        ],
        extraHelp: [
            { title: "DOS is one of:", style: "command", items: formatDosItems() },
            "With --system the disk is a copy of the DOS's own (TRSDOS 2.3, TRSDOS 1.3, LDOS 5.3.1, TRSDOS 6.2.1, " +
            "or LS-DOS 6.3.1), which fixes its shape: --cylinders, --sides and --density must match it.",
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
     * On a file named .hdv, make a hard disk image instead (see {@link createHardDisk}). Otherwise make the disk
     * with the DOS's usual layout, as its FORMAT would (with its boot sectors when we have them),
     * and put it in the session as if it had been opened, with changes pending. With --system the disk is
     * instead a copy of the DOS's system disk, optionally trimmed to its system files, and --name and
     * --date change that copy's name and date. This only works when the session has no disk, or with
     * --force, which replaces the session's disk in memory. The image is a DMK one, so a file name for another
     * kind is refused.
     */
    run(session, command) {
        const options = command.options;
        if (isHardDiskPathname(session)) {
            createHardDisk(session, command);
            return;
        }
        for (const name of ["--heads", "--partitions"]) {
            if (options.has(name)) {
                throw new ToolError(name + " only applies to hard disk images; name the file .hdv");
            }
        }

        const choices = parseFormatChoices(command);
        if (choices.dos === undefined) {
            throw new ToolError("create needs a DOS to make the disk for. The DOSes are:\n" + formatDosHelpLines().join("\n"));
        }
        const dos = choices.dos;
        const system = options.has("--system");
        const minimal = options.has("--minimal");
        if (minimal && !system) {
            throw new ToolError("--minimal only applies with --system");
        }

        requireDmkPathname(session, "create makes DMK images; name the file .dmk");
        if (session.hasDisk() && !options.has("--force")) {
            throw new ToolError(session.name + " already has a disk; use --force to replace it with a new blank one");
        }

        if (system) {
            createSystemDisk(session, choices, dos, minimal);
            return;
        }

        const floppy = makeBlankDisk({
            dos,
            model: choices.model,
            density: choices.density,
            cylinders: choices.cylinders ?? defaultCylinders(dos),
            sides: choices.sides ?? 1,
            name: choices.name,
            date: choices.date,
        });

        const replacing = session.hasDisk();
        session.setFloppy(floppy);
        if (replacing) {
            console.log("Replaced the disk in memory; nothing is saved until quit.");
        }
        printNewDiskSummary("Created", session);
    },
};

/**
 * The DOS of the session's disk, if it's one that "format" can make, going by the rules that the session
 * would write the disk by (so the global --dos counts).
 *
 * @return the DOS, or undefined if the disk has no TRSDOS-family file system or a DOS we can't format.
 */
function sessionFormatDos(session: DiskSession): TrsdosFormatDos | undefined {
    const ruleSet = session.getWriteGate()?.ruleSet;
    if (ruleSet === undefined) {
        return undefined;
    }

    switch (ruleSet) {
        case TrsdosRuleSet.TRSDOS_2:
            return TrsdosFormatDos.TRSDOS_2_3;
        case TrsdosRuleSet.TRSDOS_1_3:
            return TrsdosFormatDos.TRSDOS_1_3;
        case TrsdosRuleSet.LDOS_5:
            return TrsdosFormatDos.LDOS_5_3;
        case TrsdosRuleSet.TRSDOS_6:
            // TRSDOS 6 and LS-DOS 6 share their rules, so go by the name.
            return session.fileSystem?.nameAndVersion.startsWith("LS-DOS") ? TrsdosFormatDos.LSDOS_6_3 : TrsdosFormatDos.TRSDOS_6_2;
        case TrsdosRuleSet.DOSPLUS:
            return undefined;
        default:
            assertNever(ruleSet);
    }
}

/**
 * How many files "format" would erase from the session's disk: the user files, plus the system files
 * other than the DOS's own BOOT/SYS and DIR/SYS (which every disk has).
 *
 * @return the number of files, or undefined if the disk has no file system we recognize, so that we
 * can't say.
 */
function countFilesToErase(session: DiskSession): number | undefined {
    const fileSystem = session.fileSystem;
    if (fileSystem === undefined) {
        return undefined;
    }

    const userFiles = fileSystem.getDirEntries(false).length;
    const allFiles = fileSystem.getDirEntries(true);
    const otherSystemFiles = allFiles.filter(dirEntry => {
        const name = dirEntry.getFilename("/");
        return dirEntry.isSystemFile() && name !== "BOOT/SYS" && name !== "DIR/SYS";
    }).length;

    return userFiles + otherSystemFiles;
}

/**
 * Do "format" on a hard disk: format the chosen partition again, in the same place with the same size and
 * granules, so that it's an empty data partition.
 *
 * @param session the session, whose disk is a hard disk.
 * @param command the parsed command.
 * @throws ToolError if the options don't apply to a hard disk, no partition is chosen, the DOS isn't one that
 * hard disks can have, the partition has files and there's no --force, or the disk can't be written.
 */
function formatHardDiskPartition(session: DiskSession, command: ParsedDiskCommand): void {
    const options = command.options;
    for (const name of ["--cylinders", "--sides", "--density"]) {
        if (options.has(name)) {
            throw new ToolError(name + " doesn't apply to a hard disk: format keeps the chosen partition's size");
        }
    }
    const choices = parseFormatChoices(command, HARD_DISK_FORMAT_DOSES);

    const selected = session.getSelectedPartition();
    const number = session.selectedPartitionNumber;
    const dos = choices.dos ?? sessionFormatDos(session);
    if (dos === undefined) {
        throw new ToolError("format needs a DOS to format for, since the partition's DOS isn't one that format can " +
            "make. The DOSes are:\n" + formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
    }
    const dosProblem = hardDiskDosProblem(dos);
    if (dosProblem !== undefined) {
        throw new ToolError(dosProblem);
    }

    const label = "partition " + number + " (" + (selected.diskName === "" ? "no name" : selected.diskName) + ")";
    const fileCount = countFilesToErase(session);
    if (!options.has("--force")) {
        if (fileCount === undefined) {
            throw new ToolError("The " + label + " has no file system that we recognize, so we can't say what format " +
                "would erase; use --force to format it anyway");
        }
        if (fileCount > 0) {
            throw new ToolError("format would erase " + pluralizeWithCount(fileCount, "file") + " from " + label +
                "; use --force to go ahead");
        }
    }

    const partition = selected.partition;
    const location = {cylinderOffset: partition.cylinderOffset, headOffset: partition.headOffset};
    session.changeHardDisk(hardDisk => {
        const message = formatLdosPartition(hardDisk, {
            dos,
            startCylinder: partition.cylinderOffset,
            startHead: partition.headOffset,
            cylinders: partition.cylinderCount,
            heads: partition.headCount,
            granulesPerCylinder: selected.trsdos.granulesPerLump,
            name: choices.name ?? (selected.diskName === "" ? undefined : selected.diskName),
            date: choices.date,
            bootSectors: getHardDiskBootSectors(dos, choices.model),
        });
        if (message !== undefined) {
            throw new ToolError(message);
        }
    }, location, options.has("--force"));

    console.log("Formatted " + label + " as an empty " + trsdosFormatDosToString(dos) + " partition (" +
        partition.describeLocation() + "); nothing is saved until quit.");
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
        options: makeFormatOptionSpecs("erase a disk that has files"),
        extraHelp: [
            {
                title: "DOS is as for create (default: the disk's own DOS, if it's one of those):",
                style: "command",
                items: formatDosItems(),
            },
            "On a hard disk this formats the chosen partition (see \"partition\") again in the same place, with " +
            "the same cylinders, heads and granules. It keeps the partition's name unless --name is given, and " +
            "takes today's date unless --date is. The DOS must be ldos-5.3 or lsdos-6.3, and --force is needed if " +
            "the partition has files. --cylinders, --sides and --density don't apply.",
        ],
    },

    endsSession: false,

    /**
     * On a hard disk, format the chosen partition again (see {@link formatHardDiskPartition}). Otherwise
     * replace the disk in memory with a blank one, as "create" makes. The cylinders and sides default to the
     * current disk's, and the DOS to the current disk's (which must be given if the disk's isn't one that we can format).
     * The result is a DMK image, so a file name for another kind is refused. If the disk has files then
     * --force is required, and the files lost are counted in the message.
     */
    run(session, command) {
        if (session.isHardDisk()) {
            formatHardDiskPartition(session, command);
            return;
        }

        const options = command.options;
        const choices = parseFormatChoices(command);

        const dos = choices.dos ?? sessionFormatDos(session);
        if (dos === undefined) {
            throw new ToolError("format needs a DOS to format for, since the disk's DOS isn't one that format can " +
                "make. The DOSes are:\n" + formatDosHelpLines().join("\n"));
        }

        requireDmkPathname(session, "format makes the image a DMK image; give -o NEW.dmk to save to a .dmk file instead");

        const fileCount = countFilesToErase(session);
        if (!options.has("--force")) {
            if (fileCount === undefined) {
                throw new ToolError("The disk has no file system that we recognize, so we can't say what format " +
                    "would erase; use --force to format it anyway");
            }
            if (fileCount > 0) {
                throw new ToolError("format would erase " + pluralizeWithCount(fileCount, "file") +
                    " from the disk; use --force to go ahead");
            }
        }

        const geometry = session.floppy.getGeometry();
        // The LDOS line takes either density, so keep the disk's own unless told otherwise.
        const keepsDensity = choices.density === undefined && choices.model === undefined && choosesDensity(dos);
        const floppy = makeBlankDisk({
            dos,
            model: choices.model,
            density: keepsDensity ? geometry.modalDataDensity : choices.density,
            cylinders: choices.cylinders ?? geometry.cylinderCount,
            sides: choices.sides ?? geometry.sideCount,
            name: choices.name,
            date: choices.date,
        });

        session.setFloppy(floppy);
        console.log("Replaced the disk in memory with a blank " + trsdosFormatDosToString(dos) +
            " disk; nothing is saved until quit.");
        printNewDiskSummary("Formatted", session);
    },
};
