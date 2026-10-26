import path from "path";
import {
    Density, type DmkFloppyDisk, formatTrsdosDataDisk, TrsdosFormatDos, trsdosFormatDosToString, type TrsdosFormatOptions,
    TrsdosRuleSet,
} from "trs80-base";
import {assertNever} from "z80-base";
import {colors} from "../colors.js";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";
import {DiskOptionSpec, DiskOptionValues, parseAddDate} from "./DiskCommandParser.js";
import {parseFormatDosName} from "./DiskHelp.js";
import {DiskSession} from "./DiskSession.js";

/**
 * The file name extensions of other kinds of disk image, which "create" and "format" refuse to save a
 * DMK image under, since the file would then be misnamed.
 */
const OTHER_IMAGE_EXTENSIONS = [".jv1", ".jv3", ".dsk", ".hfe", ".imd", ".scp", ".hdv"];

/**
 * What the user chose for the disk to make, with what they left out undefined.
 */
interface FormatChoices {
    /** The DOS to format for (--dos). */
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
 * The options of "create" and "format", which are the same except for what --dos says.
 *
 * @param dosDescription the description of --dos.
 * @param forceDescription the description of --force.
 */
function makeFormatOptionSpecs(dosDescription: string, forceDescription: string): DiskOptionSpec[] {
    return [
        {
            name: "--dos",
            valueName: "NAME",
            description: dosDescription,
        },
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
function parseCountOption(options: DiskOptionValues, name: string): number | undefined {
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
 * Read the options that say what disk to make.
 *
 * @param options the command's options.
 * @throws ToolError if an option has a bad value.
 */
function parseFormatChoices(options: DiskOptionValues): FormatChoices {
    const dosText = options.getString("--dos");
    const dos = dosText === undefined ? undefined : parseFormatDosName(dosText);

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
 * Make the blank disk, in memory.
 *
 * @param formatOptions what to make.
 * @return the disk.
 * @throws ToolError with the reason, if the DOS can't make a disk like that.
 */
function makeBlankDisk(formatOptions: TrsdosFormatOptions): DmkFloppyDisk {
    const floppy = formatTrsdosDataDisk(formatOptions);
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
 * The "create" command: make a new, blank, formatted data disk.
 */
export const CREATE_COMMAND: DiskCommand = {
    spec: {
        name: "create",
        aliases: [],
        usage: "--dos NAME [--cylinders N] [--sides 1|2] [--density single|double] [--model 1|3|4] " +
            "[--name NAME] [--date YYYY-MM-DD] [--force]",
        summary: "make a new, blank, formatted data disk",
        minArgs: 0,
        maxArgs: 0,
        options: makeFormatOptionSpecs("the DOS to format for: trsdos-2.3, trsdos-1.3, ldos-5.3, trsdos-6.2, or lsdos-6.3 " +
            "(required; some other spellings work)",
            "replace the disk that the image already has, in memory"),
    },

    endsSession: false,

    worksWithoutDisk: true,

    /**
     * Make the disk with the DOS's usual layout, as its FORMAT would (but with a boot sector of our own),
     * and put it in the session as if it had been opened, with changes pending. This only works when the
     * session has no disk, or with --force, which replaces the session's disk in memory. The image is
     * a DMK one, so a file name for another kind is refused.
     */
    run(session, command) {
        const options = command.options;
        const choices = parseFormatChoices(options);
        if (choices.dos === undefined) {
            throw new ToolError("create needs --dos NAME to say which DOS to format for");
        }
        const dos = choices.dos;

        requireDmkPathname(session, "create makes DMK images; name the file .dmk");
        if (session.hasDisk() && !options.has("--force")) {
            throw new ToolError(session.pathname + " already has a disk; use --force to replace it with a new blank one");
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
        usage: "[--dos NAME] [--cylinders N] [--sides 1|2] [--density single|double] [--model 1|3|4] " +
            "[--name NAME] [--date YYYY-MM-DD] [--force]",
        summary: "erase the disk and format it as an empty data disk",
        minArgs: 0,
        maxArgs: 0,
        options: makeFormatOptionSpecs("the DOS to format for, as for create (default: the disk's own DOS, if it's one of those)",
            "erase a disk that has files"),
    },

    endsSession: false,

    /**
     * Replace the disk in memory with a blank one, as "create" makes. The cylinders and sides default to the
     * current disk's, and the DOS to the current disk's (which is required if it isn't one that we can format).
     * The result is a DMK image, so a file name for another kind is refused. If the disk has files then
     * --force is required, and the files lost are counted in the message.
     */
    run(session, command) {
        const options = command.options;
        const choices = parseFormatChoices(options);

        const dos = choices.dos ?? sessionFormatDos(session);
        if (dos === undefined) {
            throw new ToolError("format needs --dos NAME to say which DOS to format for; the disk's DOS isn't one " +
                "that format can make");
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
