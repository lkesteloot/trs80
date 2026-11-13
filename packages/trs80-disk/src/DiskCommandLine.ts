import {BasicDialect, Density, trsdosFormatDosCliName, type TrsdosDiskInfoChanges, type TrsdosFormatDos} from "trs80-base";
import {assertNever} from "z80-base";
import type {CreateFloppyRequest, CreateHardDiskRequest, FormatFloppyRequest, FormatHardDiskRequest, FormatRequest} from "./DiskCreate.js";
import {type AddOptions, type AttributeRequest, formatYmd} from "./DiskFileOperations.js";
import type {AddPartitionRequest} from "./DiskPartition.js";
import type {TrimRequest} from "./DiskTrim.js";

/*
 * Builders for the command lines that the "disk" command would take for what a page does through the engine,
 * so that a page can show the command and use it as the undo label. Each line is the command's name, its
 * arguments, then its options in the order that the command's spec lists them. Options that hold their
 * defaults are left out. trs80-tool's DiskCommandLine.spec.ts checks that each line parses back to the same
 * command.
 */

/**
 * Quote one word of a command line so that the tool's splitCommandLine() reads it back exactly. A word is left
 * alone unless it's empty, or has whitespace, a quote, a backslash, or a "#" at the start. Otherwise it's
 * wrapped in double quotes, with each " and \ backslashed.
 *
 * @param word the word.
 */
export function quoteCommandWord(word: string): string {
    const needsQuotes = word === "" || /[\s"'\\]/.test(word) || word.startsWith("#");
    if (!needsQuotes) {
        return word;
    }

    return "\"" + word.replace(/["\\]/g, "\\$&") + "\"";
}

/**
 * Join words into one command line, quoting each as needed.
 *
 * @param words the command's name, arguments and options, unquoted.
 */
export function formatCommandLine(words: readonly string[]): string {
    return words.map(quoteCommandWord).join(" ");
}

/**
 * Collects the options of one command, in the order they're added.
 */
class OptionWords {
    /** The option words so far. */
    public readonly words: string[] = [];

    /**
     * Add a flag if it's on.
     *
     * @param name the option's long name, such as "--force".
     * @param on whether it's given.
     */
    public flag(name: string, on: boolean | undefined): void {
        if (on === true) {
            this.words.push(name);
        }
    }

    /**
     * Add an option with a value, unless the value is undefined.
     *
     * @param name the option's long name.
     * @param value the value, or undefined to leave the option out.
     */
    public value(name: string, value: string | number | undefined): void {
        if (value !== undefined) {
            this.words.push(name, String(value));
        }
    }

    /**
     * Add a date option, unless the date is undefined.
     *
     * @param name the option's long name.
     * @param date the date in local time, or undefined to leave the option out.
     */
    public date(name: string, date: Date | undefined): void {
        this.value(name, date === undefined ? undefined : formatYmd(date));
    }
}

/**
 * Make a command line from its parts.
 *
 * @param name the command's canonical name.
 * @param args the positional arguments.
 * @param options the options.
 */
function makeLine(name: string, args: readonly string[], options: OptionWords): string {
    return formatCommandLine([name, ...args, ...options.words]);
}

/**
 * The name that --basic takes for a dialect.
 */
function basicDialectOptionValue(dialect: BasicDialect): string {
    switch (dialect) {
        case BasicDialect.MODEL_III:
            return "3";
        case BasicDialect.MODEL_4:
            return "4";
        default:
            assertNever(dialect);
    }
}

/**
 * The name that --density takes for a density.
 */
function densityOptionValue(density: Density): string {
    switch (density) {
        case Density.SINGLE:
            return "single";
        case Density.DOUBLE:
            return "double";
        default:
            assertNever(density);
    }
}

/**
 * "dir": list files.
 *
 * @param patterns the TRS-80 name patterns, or none for all files.
 * @param includeSystem whether system files are listed (--system).
 */
export function dirCommandLine(patterns: readonly string[] = [], includeSystem = false): string {
    const options = new OptionWords();
    options.flag("--system", includeSystem);
    return makeLine("dir", patterns, options);
}

/**
 * The options of "add" that a page can set, which are {@link AddOptions} with the BASIC optional.
 */
export type AddCommandOptions = Omit<AddOptions, "basic"> & {
    /** The BASIC to tokenize for (--basic), or undefined for the disk's own, which the command's default is. */
    basic?: BasicDialect | undefined;
};

/**
 * "add": copy host files onto the disk.
 *
 * @param hostNames the host file names, as the user would type them (a page can use the files' names).
 * @param options how to add them. Options that hold their defaults are left out.
 */
export function addCommandLine(hostNames: readonly string[], options: AddCommandOptions): string {
    const words = new OptionWords();
    words.value("--as", options.as);
    words.flag("--ascii", options.ascii);
    words.flag("--binary", options.binary);
    words.flag("--text", options.text);
    words.value("--basic", options.basic === undefined ? undefined : basicDialectOptionValue(options.basic));
    words.flag("--system", options.system);
    words.flag("--invisible", options.invisible);
    words.date("--date", options.date);
    words.flag("--overwrite", options.overwrite);
    return makeLine("add", hostNames, words);
}

/**
 * What "extract" can be told, as the command's options.
 */
export interface ExtractCommandOptions {
    /** The host directory to write to (--out-dir). */
    outDir?: string | undefined;
    /** The exact host path for the one selected file (--as). */
    as?: string | undefined;
    /** Whether to write lowercase names (--lowercase). */
    lowercase?: boolean | undefined;
    /** Whether to mark damaged files in their names (--mark-damaged). */
    markDamaged?: boolean | undefined;
}

/**
 * "extract": copy files from the disk to the host.
 *
 * @param patterns the TRS-80 names or patterns, such as "*" for all.
 * @param options where and how to write them.
 */
export function extractCommandLine(patterns: readonly string[], options: ExtractCommandOptions = {}): string {
    const words = new OptionWords();
    words.value("--out-dir", options.outDir);
    words.value("--as", options.as);
    words.flag("--lowercase", options.lowercase);
    words.flag("--mark-damaged", options.markDamaged);
    return makeLine("extract", patterns, words);
}

/**
 * "kill": remove files from the disk.
 *
 * @param patterns the TRS-80 names or patterns.
 */
export function killCommandLine(patterns: readonly string[]): string {
    return makeLine("kill", patterns, new OptionWords());
}

/**
 * "rename": rename one file.
 *
 * @param oldName the file's name as the disk shows it.
 * @param newName the new name.
 */
export function renameCommandLine(oldName: string, newName: string): string {
    return makeLine("rename", [oldName, newName], new OptionWords());
}

/**
 * "attrib": change the attributes of files. With an empty request this shows them. An undefined field is
 * left out. The date is "--date" for a Date and "--no-date" for null.
 *
 * @param patterns the TRS-80 names or patterns.
 * @param request what to change.
 */
export function attribCommandLine(patterns: readonly string[], request: AttributeRequest): string {
    const words = new OptionWords();
    if (request.invisible !== undefined) {
        words.flag(request.invisible ? "--invisible" : "--visible", true);
    }
    if (request.system !== undefined) {
        words.flag(request.system ? "--system" : "--no-system", true);
    }
    words.value("--protect", request.protect);
    words.value("--password", request.updatePassword);
    words.value("--access-password", request.accessPassword);
    if (request.date === null) {
        words.flag("--no-date", true);
    } else {
        words.date("--date", request.date);
    }
    return makeLine("attrib", patterns, words);
}

/**
 * "label": change the disk's name, date, master password or AUTO command. With no changes this shows them.
 * An empty AUTO command is "--no-auto".
 *
 * @param changes what to change.
 */
export function labelCommandLine(changes: TrsdosDiskInfoChanges): string {
    const words = new OptionWords();
    words.value("--name", changes.name);
    words.date("--date", changes.date);
    words.value("--password", changes.masterPassword);
    if (changes.autoCommand === "") {
        words.flag("--no-auto", true);
    } else {
        words.value("--auto", changes.autoCommand);
    }
    return makeLine("label", [], words);
}

/**
 * "protect": show the image's write-protect flag, or set it.
 *
 * @param writeProtected true for "protect on", false for "protect off", or undefined to show it.
 */
export function protectCommandLine(writeProtected?: boolean | undefined): string {
    const args = writeProtected === undefined ? [] : [writeProtected ? "on" : "off"];
    return makeLine("protect", args, new OptionWords());
}

/**
 * "check": look for damage in the file system.
 */
export function checkCommandLine(): string {
    return makeLine("check", [], new OptionWords());
}

/**
 * "repair": fix the damage that "check" finds.
 *
 * @param request which extra repairs to make.
 */
export function repairCommandLine(request: {freeUnclaimed: boolean, fixProgramSizes: boolean,
                                            markMissingUsed: boolean}): string {
    const words = new OptionWords();
    words.flag("--free-unclaimed", request.freeUnclaimed);
    words.flag("--fix-program-sizes", request.fixProgramSizes);
    words.flag("--mark-missing-used", request.markMissingUsed);
    return makeLine("repair", [], words);
}

/**
 * "trim": drop the image's unused cylinders or side 1.
 *
 * @param request what to drop.
 */
export function trimCommandLine(request: TrimRequest): string {
    const words = new OptionWords();
    words.value("--cylinders", request.cylinders);
    words.value("--side", request.dropSide ? "0" : undefined);
    words.flag("--force", request.force);
    return makeLine("trim", [], words);
}

/**
 * Add the options that "create" and "format" share.
 *
 * @param words the collector.
 * @param request what the disk is like.
 * @param force whether --force was given.
 */
function addFormatOptions(words: OptionWords, request: Partial<FormatRequest>, force: boolean): void {
    words.value("--cylinders", request.cylinders);
    words.value("--sides", request.sides);
    words.value("--density", request.density === undefined ? undefined : densityOptionValue(request.density));
    words.value("--model", request.model);
    words.value("--name", request.name);
    words.date("--date", request.date);
    words.flag("--force", force);
}

/**
 * The DOS argument of "create", "format" and "partition --add".
 */
function dosArgs(dos: TrsdosFormatDos | undefined): string[] {
    return dos === undefined ? [] : [trsdosFormatDosCliName(dos)];
}

/**
 * "create" for a floppy: make a blank data disk or a system disk for a DOS.
 *
 * @param request what to make.
 */
export function createCommandLine(request: CreateFloppyRequest): string {
    const words = new OptionWords();
    addFormatOptions(words, request.format, request.force);
    words.flag("--system", request.system);
    words.flag("--minimal", request.minimal);
    return makeLine("create", dosArgs(request.format.dos), words);
}

/**
 * "create" for a hard disk image (the session's file is named .hdv): make a blank disk, with partitions if
 * there's a DOS.
 *
 * @param request what to make.
 */
export function createHardDiskCommandLine(request: CreateHardDiskRequest): string {
    const words = new OptionWords();
    addFormatOptions(words, {
        cylinders: request.cylinders, model: request.model, name: request.name, date: request.date,
    }, request.force);
    words.value("--heads", request.heads);
    words.value("--partitions", request.partitions);
    return makeLine("create", dosArgs(request.dos), words);
}

/**
 * "format" for a floppy: erase it and make an empty data disk.
 *
 * @param request what to make.
 */
export function formatFloppyCommandLine(request: FormatFloppyRequest): string {
    const words = new OptionWords();
    addFormatOptions(words, request.format, request.force);
    return makeLine("format", dosArgs(request.format.dos), words);
}

/**
 * "format" for a hard disk's chosen partition.
 *
 * @param request what to make.
 */
export function formatHardDiskCommandLine(request: FormatHardDiskRequest): string {
    const words = new OptionWords();
    addFormatOptions(words, {model: request.model, name: request.name, date: request.date}, request.force);
    return makeLine("format", dosArgs(request.dos), words);
}

/**
 * "partition" with no options: list the partitions, or choose one.
 *
 * @param wanted the partition's number (from 1) or disk name, or undefined to list them.
 */
export function partitionCommandLine(wanted?: string | number | undefined): string {
    return makeLine("partition", wanted === undefined ? [] : [String(wanted)], new OptionWords());
}

/**
 * "partition --add": make a partition.
 *
 * @param request what to make.
 */
export function partitionAddCommandLine(request: AddPartitionRequest): string {
    const words = new OptionWords();
    words.flag("--add", true);
    words.value("--cylinders", request.placement.cylinders);
    words.value("--heads", request.placement.heads);
    words.value("--start-cylinder", request.placement.startCylinder);
    words.value("--start-head", request.placement.startHead);
    words.value("--name", request.name);
    words.date("--date", request.date);
    words.value("--model", request.model);
    words.value("--granules", request.granulesPerCylinder);
    words.flag("--force", request.force);
    return makeLine("partition", dosArgs(request.dos), words);
}

/**
 * "partition --delete": erase a partition.
 *
 * @param wanted the partition's number (from 1) or disk name, or undefined for the chosen one.
 * @param force whether to delete a partition that has files (--force).
 */
export function partitionDeleteCommandLine(wanted: string | number | undefined, force: boolean): string {
    const words = new OptionWords();
    words.flag("--delete", true);
    words.flag("--force", force);
    return makeLine("partition", wanted === undefined ? [] : [String(wanted)], words);
}

/**
 * "free": show the free space.
 */
export function freeCommandLine(): string {
    return makeLine("free", [], new OptionWords());
}

/**
 * "info": describe the disk.
 */
export function infoCommandLine(): string {
    return makeLine("info", [], new OptionWords());
}

/**
 * "map": draw where the files are on the disk.
 *
 * @param patterns the TRS-80 name patterns to highlight, or none.
 */
export function mapCommandLine(patterns: readonly string[] = []): string {
    return makeLine("map", patterns, new OptionWords());
}

/**
 * "revert": put the disk back as it was when last saved.
 */
export function revertCommandLine(): string {
    return makeLine("revert", [], new OptionWords());
}
