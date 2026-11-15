import fs from "fs";
import {Cpm, decodeTrs80File, type FloppyDisk, HARD_DISK_FORMAT_DOSES, isFloppy} from "trs80-base";
import {
    type CpmDiskRequest, type CpmSystemTracks, cpmSystemTracksToString, createCpmFloppy, type DiskSession,
    formatCpmFloppy, resolveCpmFormat,
} from "trs80-disk";
import {ToolError} from "../utils.js";
import type {DiskOutput} from "./DiskOutput.js";
import {
    type DiskOptionSpec, type DiskOptionValues, HostPathKind, parseCountOption, parseDensityOption,
    type ParsedDiskCommand, parseSidesOption,
} from "./DiskCommandParser.js";
import type {CreateResultJson} from "./DiskJson.js";
import {formatDosHelpLines} from "./DiskHelp.js";

// The part of "create" and "format" for Montezuma Micro CP/M disks (the DOS argument "cpm"), which makes no
// TRSDOS-family disk and so doesn't share their option handling. The engine is trs80-disk's CpmCreate.ts.

/**
 * The options of "create" and "format" that only apply to CP/M, which both commands take.
 */
export const CPM_FORMAT_OPTION_SPECS: DiskOptionSpec[] = [
    {
        name: "--cpm-format",
        valueName: "NAME",
        description: "for cpm, the layout to make (default: the data format with --sides and --cylinders; " +
            "\"help cpm-format\" lists them)",
    },
    {
        name: "--system-from",
        valueName: "IMAGE",
        description: "for cpm, copy the system tracks of this disk image onto the new disk, in place of the " +
            "layout's usual ones (it must read as the same layout)",
        hostPath: HostPathKind.FILE,
    },
];

/**
 * The option of "format" that only applies to CP/M.
 */
export const CPM_KEEP_SYSTEM_OPTION_SPEC: DiskOptionSpec = {
    name: "--keep-system",
    valueName: undefined,
    description: "for cpm, keep the disk's own system tracks, if the new layout has the same ones",
};

/**
 * The options that only mean something for CP/M disks.
 */
const CPM_ONLY_OPTIONS = ["--cpm-format", "--system-from", "--keep-system"];

/**
 * The options of "create" and "format" that TRSDOS-family disks have and CP/M disks don't, with why.
 */
const NOT_FOR_CPM_OPTIONS: {name: string, reason: string}[] = [
    {name: "--name", reason: "CP/M disks have no disk name"},
    {name: "--date", reason: "CP/M disks have no date"},
    {name: "--model", reason: "a Montezuma disk is the same for every model"},
    {name: "--minimal", reason: "--system copies the whole system disk"},
];

/**
 * Refuse the options that only apply to CP/M, for a command that isn't making a CP/M disk.
 *
 * @param command the parsed "create" or "format".
 * @param what what the command makes, for the message, such as "a hard disk image".
 * @throws ToolError if one is given.
 */
export function rejectCpmOnlyOptions(command: ParsedDiskCommand, what: string): void {
    for (const name of CPM_ONLY_OPTIONS) {
        if (command.options.has(name)) {
            throw new ToolError(name + " only applies to cpm disks, not " + what);
        }
    }
}

/**
 * Read a disk image from the host, for --system-from.
 *
 * @param pathname the host pathname.
 * @throws ToolError if it can't be read or isn't a floppy image.
 */
function readSystemSourceImage(pathname: string): FloppyDisk {
    let binary: Uint8Array;
    try {
        binary = fs.readFileSync(pathname);
    } catch (e: any) {
        throw new ToolError("Can't read --system-from \"" + pathname + "\": " + e.message);
    }
    const trs80File = decodeTrs80File(binary, {filename: pathname});
    if (!isFloppy(trs80File)) {
        throw new ToolError("--system-from \"" + pathname + "\" isn't a floppy image" +
            (trs80File.error === undefined ? "" : ": " + trs80File.error));
    }
    return trs80File;
}

/**
 * Read the options that say what CP/M disk to make. The preset comes from the command's --cpm-format, or else the
 * global one.
 *
 * @param command the parsed "create" or "format" with the DOS argument "cpm".
 * @param globalOptions the options for the whole run.
 * @throws ToolError if an option has a bad value or one that doesn't apply to CP/M is given.
 */
function parseCpmChoices(command: ParsedDiskCommand, globalOptions: DiskOptionValues): CpmDiskRequest {
    const options = command.options;
    for (const {name, reason} of NOT_FOR_CPM_OPTIONS) {
        if (options.has(name)) {
            throw new ToolError(name + " doesn't apply to cpm disks: " + reason);
        }
    }
    if (command.args.length > 1) {
        throw new ToolError("Too many arguments: the DOS is the only one");
    }

    const presetName = options.getString("--cpm-format") ?? globalOptions.getString("--cpm-format");
    const systemFromPathname = options.getString("--system-from");
    return {
        preset: presetName === undefined ? undefined : resolveCpmFormat(presetName),
        sides: parseSidesOption(options),
        cylinders: parseCountOption(options, "--cylinders"),
        density: parseDensityOption(options),
        systemFrom: systemFromPathname === undefined ? undefined : readSystemSourceImage(systemFromPathname),
    };
}

/**
 * Print what a new CP/M disk's reserved tracks got, if it has any.
 *
 * @param reservedTracks how many reserved tracks the new disk's preset has.
 * @param systemTracks what they got.
 * @param out where the command's output goes.
 */
function printSystemTracks(reservedTracks: number, systemTracks: CpmSystemTracks, out: DiskOutput): void {
    if (reservedTracks > 0) {
        out.line("System tracks: " + cpmSystemTracksToString(systemTracks) + ".");
    }
}

/**
 * Do "create cpm": make a blank Montezuma Micro CP/M disk, or with --system a copy of its system disk (see
 * {@link createCpmFloppy}).
 *
 * @param session the session.
 * @param command the parsed command.
 * @param globalOptions the options for the whole run.
 * @param out where the command's output goes.
 * @param printReplaced says that a disk in memory was replaced, as "create" does for the other DOSes.
 * @param printSummary prints the new disk's description, as "create" does for the other DOSes.
 * @throws ToolError if the options don't make a disk, or there's a disk already and no --force.
 */
export function createCpmFromCommand(session: DiskSession, command: ParsedDiskCommand, globalOptions: DiskOptionValues,
                                     out: DiskOutput, printReplaced: (replaced: boolean) => void,
                                     printSummary: () => void): void {

    const options = command.options;
    const choices = parseCpmChoices(command, globalOptions);
    const result = createCpmFloppy(session, {
        ...choices,
        system: options.has("--system"),
        force: options.has("--force"),
    });

    printReplaced(result.replaced);
    printSummary();
    const systemCopy = result.systemCopy;
    if (systemCopy !== undefined) {
        out.line("Copied from the " + systemCopy.description + " (" + systemCopy.shape + ").");
    } else {
        printSystemTracks(result.preset.reservedTracks, result.systemTracks, out);
    }

    const createResult: CreateResultJson = {
        description: session.describe(),
        replaced: result.replaced,
        cpmFormat: result.preset.id,
    };
    if (systemCopy !== undefined) {
        createResult.systemDisk = {description: systemCopy.description, removed: []};
    }
    out.result(createResult);
}

/**
 * Whether "format" with no DOS means CP/M: the session's disk is a CP/M one, which "format" can make again.
 */
export function sessionDiskIsCpm(session: DiskSession): boolean {
    return session.hasDisk() && !session.isHardDisk() && session.fileSystem instanceof Cpm;
}

/**
 * Do "format cpm": replace the disk in memory with a blank Montezuma Micro CP/M disk (see {@link formatCpmFloppy}).
 *
 * @param session the session, whose disk is a floppy (or there's none).
 * @param command the parsed command.
 * @param globalOptions the options for the whole run.
 * @param out where the command's output goes.
 * @param printSummary prints the new disk's description, as "format" does for the other DOSes.
 * @throws ToolError if the options don't make a disk, or the disk has files and there's no --force.
 */
export function formatCpmFromCommand(session: DiskSession, command: ParsedDiskCommand, globalOptions: DiskOptionValues,
                                     out: DiskOutput, printSummary: () => void): void {

    const options = command.options;
    const choices = parseCpmChoices(command, globalOptions);
    const result = formatCpmFloppy(session, {
        ...choices,
        keepSystem: options.has("--keep-system"),
        force: options.has("--force"),
    });

    out.line("Replaced the disk in memory with a blank Montezuma Micro CP/M disk (" + result.preset.id +
        "); nothing is saved until quit.");
    printSummary();
    printSystemTracks(result.preset.reservedTracks, result.systemTracks, out);
    out.result({description: session.describe(), replaced: true, cpmFormat: result.preset.id});
}

/**
 * The error for "create" or "format" on a hard disk with the DOS cpm.
 */
export function cpmHardDiskError(): ToolError {
    return new ToolError("CP/M hard disks aren't supported yet; cpm makes floppy images. The DOSes for hard " +
        "disks are:\n" + formatDosHelpLines(HARD_DISK_FORMAT_DOSES).join("\n"));
}
