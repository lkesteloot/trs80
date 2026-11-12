import {Argument, Command, Option} from "commander";
import {
    FLOPPY_IMAGE_FORMATS, floppyImageFormatToString, TRSDOS_FORMAT_DOSES, trsdosFormatDosCliName,
    trsdosFormatDosToString, TRSDOS_RULE_SETS, trsdosRuleSetAliases, trsdosRuleSetCliName, trsdosRuleSetToString,
} from "trs80-base";
import {describeSystemDiskTemplate, SYSTEM_DISK_TEMPLATES} from "trs80-disk";
import {BUILD_GIT_HASH} from "./build.js";
import {DiskOptionValues} from "./disk/DiskCommandParser.js";
import {makeDiskCommand, makeDiskOptionParser} from "./disk/DiskCommander.js";
import {DISK_COMMANDS, DISK_GLOBAL_OPTIONS} from "./disk/DiskCommands.js";
import {FLOPPY_FORMATS} from "./json.js";
import {EXIT_CODES, ToolError} from "./utils.js";
import {version} from "./version.js";

// The JSON that "help --json" prints: what this version of the tool can do, for programs that drive it,
// such as a front end that offers only the commands and options that the user's copy has. Everything is
// built from the tables that the program runs on (Commander's commands, the disk commands' specs, the DOS
// and format tables), so it can't fall out of step with them. The only hand-kept parts are the hard disk
// format (HDV, which has one reader and no table of its own) and the formats that "disk create" makes,
// which are checks in trs80-disk's DiskCreate.ts.
//
// The format follows json.ts: field names are explicit, optional fields are left out when they don't
// apply, and it's stable. New fields, commands, options and values may be added, so a program should
// accept ones it doesn't know; existing fields keep their names, types and meanings. The "description",
// "label" and "meaning" fields are for people and can change wording.

/**
 * The value that an option takes.
 */
export interface HelpOptionValueJson {
    /** The placeholder for the value in help, such as "dir" or "FILE". */
    name: string;
    /** Whether the value must be given when the option is (false if it may be left out). */
    required: boolean;
    /** Whether the option takes several values. */
    variadic: boolean;
    /** The values allowed, if only some are. */
    choices?: string[];
    /** The value used when the option isn't given, if there is one. */
    default?: string;
}

/**
 * One option of a command, or of the whole program.
 */
export interface HelpOptionJson {
    /** The long form with its dashes, such as "--out-dir" (or the short form, for an option that has only that). */
    name: string;
    /** The short form with its dash, such as "-o". Missing if there's none. */
    shortName?: string;
    /** The value that the option takes. Missing for a flag. */
    value?: HelpOptionValueJson;
    /** What the option does, as help says. */
    description: string;
}

/**
 * One positional argument of a command.
 */
export interface HelpArgumentJson {
    /** The argument's name in help, such as "infiles" or "PATTERN". */
    name: string;
    /** Whether it must be given. */
    required: boolean;
    /** Whether it takes the rest of the words. */
    variadic: boolean;
    /** What it is, as help says. Missing if help doesn't say. */
    description?: string;
}

/**
 * One command: a top-level command such as "dir", or a "disk" command such as "add".
 */
export interface HelpCommandJson {
    /** The command's name. */
    name: string;
    /** Other names that do the same thing, such as "ls" for "dir" in "disk". */
    aliases: string[];
    /** What the command does, as help says. */
    description: string;
    /** The positional arguments, in order. */
    arguments: HelpArgumentJson[];
    /** The options. */
    options: HelpOptionJson[];
}

/**
 * The commands of "disk".
 */
export interface DiskHelpJson {
    /** The options for the whole run, given after the image and before the first command, such as "--dos". */
    options: HelpOptionJson[];
    /** The commands, in the order that "disk IMAGE help" lists them. */
    commands: HelpCommandJson[];
}

/**
 * A DOS by the name that an option or argument takes.
 */
export interface HelpDosJson {
    /** The name to give, such as "ldos-5". */
    name: string;
    /** Other names that are accepted for it. */
    aliases: string[];
    /** The DOS's name for people, such as "LDOS 5". */
    label: string;
}

/**
 * A bootable system disk that "disk create --system" can make.
 */
export interface HelpSystemDiskJson {
    /** The template's name, such as "ldos-5.3.1-model3". */
    name: string;
    /** The DOS, by the name that "disk create" takes (one of formatDoses), such as "ldos-5.3". */
    dos: string;
    /** The TRS-80 model that it boots on: 1, 3, or 4. */
    model: number;
    /** The DOS's version, such as "5.3.1". */
    version: string;
    /** A description for people, such as "LDOS 5.3.1 system disk for the Model III". */
    label: string;
}

/**
 * The disk image formats, by what can be done with them. Format names are upper case, such as "DMK". A
 * ".dsk" file is a JV1 or JV3 image.
 */
export interface HelpImageFormatsJson {
    /** The floppy and hard disk formats that the commands read. */
    read: string[];
    /** The floppy formats that "convert" turns a floppy image into. */
    convert: string[];
    /** The formats whose images "disk" can change and save. */
    diskWrite: string[];
    /** The formats that "disk create" makes. */
    diskCreate: string[];
}

/**
 * An exit status.
 */
export interface HelpExitCodeJson {
    /** The status. */
    code: number;
    /** What it means, for people. */
    meaning: string;
}

/**
 * What "help --json" prints.
 */
export interface HelpJson {
    /** The tool's version, such as "5.1.0", which is also the start of what --version prints. */
    version: string;
    /** The git commit that the tool was built from, in full. */
    gitHash: string;
    /** The options for the whole program, given before the command, such as "--color". */
    options: HelpOptionJson[];
    /** The top-level commands, in the order that "--help" lists them. With a command named, only that one. */
    commands: HelpCommandJson[];
    /** The commands of "disk". Missing if a command other than "disk" was named. */
    disk?: DiskHelpJson;
    /** The DOSes whose rules "disk" can write by, by the names that its "--dos" takes. */
    writableDoses: HelpDosJson[];
    /** The DOSes that "disk create" and "disk format" can format a disk for, by the names they take. */
    formatDoses: HelpDosJson[];
    /** The system disks that "disk create --system" can make. */
    systemDisks: HelpSystemDiskJson[];
    /** The disk image formats, by what can be done with them. */
    imageFormats: HelpImageFormatsJson;
    /** The exit statuses that a script can rely on. Any failure not listed exits with 1. */
    exitCodes: HelpExitCodeJson[];
}

/**
 * The description of "help"'s --json option, which isn't a Commander option (see index.ts), for the JSON
 * and for "help help".
 */
export const HELP_JSON_OPTION: HelpOptionJson = {
    name: "--json",
    description: "print what this version can do as one JSON object, for programs: every command and option, " +
        "the disk commands, and the DOSes and image formats",
};

/**
 * The hard disk image format, which has one reader and so no table.
 */
const HARD_DISK_FORMAT = "HDV";

/**
 * The formats that "disk create" makes. DiskCreate.ts checks the image's extension for these.
 */
const DISK_CREATE_FORMATS = ["DMK", HARD_DISK_FORMAT];

/**
 * Describe the program as JSON: every command and option, and the values that options take.
 *
 * @param program the program's Commander command, with its commands.
 * @param commandName the one command to describe, or undefined for all of them.
 * @throws ToolError if there's no command by that name.
 */
export function makeHelpJson(program: Command, commandName: string | undefined): HelpJson {
    const help = program.createHelp();
    let commands = help.visibleCommands(program);
    if (commandName !== undefined) {
        const command = commands.find(c => c.name() === commandName || c.aliases().includes(commandName));
        if (command === undefined) {
            throw new ToolError("There is no command \"" + commandName + "\"; \"help --json\" lists them all");
        }
        commands = [command];
    }

    const writeFormats = FLOPPY_IMAGE_FORMATS.map(floppyImageFormatToString);
    const json: HelpJson = {
        version,
        gitHash: BUILD_GIT_HASH,
        options: help.visibleOptions(program).map(commanderOptionToJson),
        commands: commands.map(command => {
            const commandJson = commanderCommandToJson(command, command.name(), command.aliases());
            if (command.name() === "help") {
                commandJson.options.push(HELP_JSON_OPTION);
            }
            return commandJson;
        }),
        ...(commands.some(command => command.name() === "disk") ? {disk: makeDiskHelpJson()} : {}),
        writableDoses: TRSDOS_RULE_SETS.map(ruleSet => ({
            name: trsdosRuleSetCliName(ruleSet),
            aliases: trsdosRuleSetAliases(ruleSet),
            label: trsdosRuleSetToString(ruleSet),
        })),
        formatDoses: TRSDOS_FORMAT_DOSES.map(dos => ({
            name: trsdosFormatDosCliName(dos),
            aliases: [],
            label: trsdosFormatDosToString(dos),
        })),
        systemDisks: SYSTEM_DISK_TEMPLATES.map(template => ({
            name: template.name,
            dos: trsdosFormatDosCliName(template.dos),
            model: template.model,
            version: template.version,
            label: describeSystemDiskTemplate(template),
        })),
        imageFormats: {
            read: [...FLOPPY_FORMATS, HARD_DISK_FORMAT],
            convert: writeFormats,
            diskWrite: [...writeFormats, HARD_DISK_FORMAT],
            diskCreate: [...DISK_CREATE_FORMATS],
        },
        exitCodes: EXIT_CODES.map(({code, meaning}) => ({code, meaning})),
    };

    return json;
}

/**
 * Describe the disk command's options for the whole run and its commands.
 */
function makeDiskHelpJson(): DiskHelpJson {
    return {
        // The parser that "disk" reads these options with.
        options: makeDiskOptionParser(DISK_GLOBAL_OPTIONS, new DiskOptionValues()).options.map(commanderOptionToJson),
        commands: DISK_COMMANDS.map(({spec}) =>
            commanderCommandToJson(makeDiskCommand(spec, new DiskOptionValues()), spec.name, spec.aliases)),
    };
}

/**
 * Describe a Commander command, with its arguments and visible options.
 *
 * @param command the command.
 * @param name its name.
 * @param aliases its other names.
 */
function commanderCommandToJson(command: Command, name: string, aliases: readonly string[]): HelpCommandJson {
    const help = command.createHelp();
    // This applies the descriptions given with the command's description, as help does before it shows them.
    help.visibleArguments(command);
    return {
        name,
        aliases: [...aliases],
        description: command.description(),
        arguments: command.registeredArguments.map(commanderArgumentToJson),
        options: help.visibleOptions(command).map(commanderOptionToJson),
    };
}

/**
 * Describe a Commander argument.
 */
function commanderArgumentToJson(argument: Argument): HelpArgumentJson {
    const json: HelpArgumentJson = {
        name: argument.name(),
        required: argument.required,
        variadic: argument.variadic,
    };
    if (argument.description !== "") {
        json.description = argument.description;
    }
    return json;
}

/**
 * Describe a Commander option: its names from its flags, such as "-o, --output <FILE>", and its value.
 */
function commanderOptionToJson(option: Option): HelpOptionJson {
    const longName = option.long;
    const shortName = option.short;
    const json: HelpOptionJson = {
        name: longName ?? shortName ?? option.flags,
        description: option.description,
    };
    if (longName !== undefined && shortName !== undefined) {
        json.shortName = shortName;
    }

    const valueName = /[<[]([^>\]]+)[>\]]/.exec(option.flags)?.[1]?.replace(/\.\.\.$/, "");
    const takesValue = option.required || option.optional;
    if (takesValue && valueName !== undefined) {
        const value: HelpOptionValueJson = {name: valueName, required: option.required, variadic: option.variadic};
        if (option.argChoices !== undefined) {
            value.choices = [...option.argChoices];
        }
        if (typeof option.defaultValue === "string") {
            value.default = option.defaultValue;
        }
        json.value = value;
    }
    return json;
}
