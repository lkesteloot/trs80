import path from "path";
import {
    Density, densityToString, type FloppyDisk, formatTrsdosDataDisk, TrsdosFormatDos, trsdosFormatDosToString,
    type TrsdosFormatOptions, TrsdosRuleSet,
} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {DiskOptionSpec, DiskOptionValues, parseAddDate, type ParsedDiskCommand} from "./DiskCommandParser.js";
import {formatDosHelpLines, formatDosItems, parseFormatDosName} from "./DiskHelp.js";
import {DiskSession, DiskWritePurpose} from "./DiskSession.js";
import {
    describeSystemDiskTemplate, findSystemDiskTemplate, getDataDiskBootSectors, loadSystemDiskTemplate,
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
            description: "the number of sides (TRSDOS 2.3 and 1.3 have only one)",
        },
        {
            name: "--density",
            valueName: "single|double",
            description: "the recording density (TRSDOS 2.3 is single and TRSDOS 1.3 is double only)",
        },
        {
            name: "--model",
            valueName: "1|3|4",
            description: "the TRS-80 the disk is for, which only decides LDOS 5.3's density: single for 1, else double",
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
 * Parse an option whose value is a whole number.
 *
 * @param options the command's options.
 * @param name the long name of the option, such as "--cylinders".
 * @return the number, or undefined if the option wasn't given.
 * @throws ToolError if the value isn't a whole number.
 */
export function parseCountOption(options: DiskOptionValues, name: string): number | undefined {
    const text = options.getString(name);
    if (text === undefined) {
        return undefined;
    }
    if (!/^\d{1,5}$/.test(text)) {
        throw new ToolError("Invalid " + name + " \"" + text + "\": use a number");
    }
    return Number(text);
}

/**
 * Read the DOS argument and the options that say what disk to make.
 *
 * @param command the parsed command, with at most one argument: the DOS.
 * @throws ToolError if the DOS or an option has a bad value.
 */
function parseFormatChoices(command: ParsedDiskCommand): FormatChoices {
    const options = command.options;
    const dos = command.args.length === 0 ? undefined : parseFormatDosName(command.args[0]);

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

    let model: 1 | 3 | 4 | undefined = undefined;
    const modelText = options.getString("--model");
    if (modelText !== undefined) {
        if (modelText !== "1" && modelText !== "3" && modelText !== "4") {
            throw new ToolError("Invalid --model \"" + modelText + "\": use 1, 3, or 4");
        }
        model = Number(modelText) as 1 | 3 | 4;
    }

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
    const extension = path.extname(session.savedPathname).toLowerCase();
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
 * The "create" command: make a new, blank, formatted data disk, or with --system a copy of a DOS's system disk.
 */
export const CREATE_COMMAND: DiskCommand = {
    spec: {
        name: "create",
        aliases: [],
        args: "[DOS]",
        summary: "make a new, blank, formatted data disk for a DOS, or a bootable system disk",
        // The DOS is required, but it's optional here so that run() can report a missing one by listing the choices.
        options: [
            ... makeFormatOptionSpecs("replace the disk that the image already has, in memory"),
            {
                name: "--system",
                valueName: undefined,
                description: "make a copy of the DOS's bootable system disk, not a blank one (--model 1 picks " +
                    "LDOS 5.3's Model I disk, else its Model III disk)",
            },
            {
                name: "--minimal",
                valueName: undefined,
                description: "with --system, remove the files that aren't system files, leaving the DOS's own",
            },
        ],
        extraHelp: [
            { title: "DOS is one of:", style: "command", items: formatDosItems() },
            "With --system the disk is a copy of the DOS's own (TRSDOS 2.3, TRSDOS 1.3, LDOS 5.3.1, TRSDOS 6.2.1, " +
            "or LS-DOS 6.3.1), which fixes its shape: --cylinders, --sides and --density must match it.",
        ],
    },

    endsSession: false,
    floppyOnly: true,

    worksWithoutDisk: true,

    /**
     * Make the disk with the DOS's usual layout, as its FORMAT would (with its boot sectors when we have them),
     * and put it in the session as if it had been opened, with changes pending. With --system the disk is
     * instead a copy of the DOS's system disk, optionally trimmed to its system files, and --name and
     * --date change that copy's name and date. This only works when the session has no disk, or with
     * --force, which replaces the session's disk in memory. The image is a DMK one, so a file name for another
     * kind is refused.
     */
    run(session, command) {
        const options = command.options;
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
            throw new ToolError(session.pathname + " already has a disk; use --force to replace it with a new blank one");
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
 * The "format" command: erase the disk and format it as an empty data disk.
 */
export const FORMAT_COMMAND: DiskCommand = {
    spec: {
        name: "format",
        aliases: [],
        args: "[DOS]",
        summary: "erase the disk and format it as an empty data disk",
        options: makeFormatOptionSpecs("erase a disk that has files"),
        extraHelp: [
            {
                title: "DOS is as for create (default: the disk's own DOS, if it's one of those):",
                style: "command",
                items: formatDosItems(),
            },
        ],
    },

    endsSession: false,
    floppyOnly: true,

    /**
     * Replace the disk in memory with a blank one, as "create" makes. The cylinders and sides default to the
     * current disk's, and the DOS to the current disk's (which must be given if the disk's isn't one that we can format).
     * The result is a DMK image, so a file name for another kind is refused. If the disk has files then
     * --force is required, and the files lost are counted in the message.
     */
    run(session, command) {
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
