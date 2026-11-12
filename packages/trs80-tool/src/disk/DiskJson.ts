import {
    knownTrsdosPassword, parseTrsdosGatDate, type LdosPartition, type TrsdosFinding, TrsdosFindingKind,
    trsdosFindingKindSeverity, TrsdosFindingSeverity,
    type TrsdosDirEntry, type TrsdosDiskInfo, type TrsdosProtectionLevel, type TrsdosProtectionNames,
    trsdosProtectionLevelToString, type TrsdosRuleSet, type TrsdosVersion,
} from "trs80-base";
import {
    type DiskMapModel, type DiskSession, type FreeSpace, formatYmd, MapCellKind, trsdosPasswordIsSet,
    TrimCylindersReason, type TrimDoneResult, TrimNothingReason,
} from "trs80-disk";
import {assertNever} from "z80-base";
import type {GeometryInfoJson, OsInfoJson} from "../info.js";
import {trsdosDirEntryJsonDate} from "../InputFile.js";
import {type FileJson, type SectorPositionJson, sectorPositionToJson} from "../json.js";

// The types of the JSON that the "disk" command prints with --json, and the helpers that build it. The
// comments on the interfaces are the documentation of the format, which follows the conventions of json.ts:
// field names are explicit, raw values and their interpretations are in separate fields, nothing depends on
// the terminal, and optional fields are left out of the JSON when they don't apply. Where a field is an
// enum in the code, the JSON has a camelCase string (as in json.ts), which is part of the format; the
// functions that map them are here too, and they never use the names or numbers of the TypeScript enums,
// which can change. TRSDOS file names are written with a "." before the extension ("HELLO.BAS"), as in
// json.ts, though the text output shows "HELLO/BAS".
//
// Stability: the format will keep working for programs that read it. New fields may be added; existing
// fields keep their names, types and meanings. New values may appear in the lists of string values (such as
// finding kinds, map cell kinds and trim reasons), so a program should accept values it doesn't know. Fields
// meant for people can change wording: "messages", "message", "advice", "description", "label",
// "readOnlyReason", "reason" (of "protect"), "listing", "conversions", "changes" (of "repair"), "error" and
// "warnings". There's no version number, since the above makes one unnecessary.

/**
 * A TRSDOS file name as the JSON writes it: "HELLO.BAS", with a "." before the extension, as in json.ts,
 * from the "HELLO/BAS" form that the engine and the text output use. Where a directory entry is at hand,
 * use its getFilename(".") instead. TRSDOS names hold neither "." nor "/" otherwise, so nothing else changes.
 *
 * @param name the name with "/" before the extension, if it has one.
 */
export function trsdosNameToJson(name: string): string {
    return name.replace("/", ".");
}

/**
 * The whole of what "disk --json" prints: one object describing the run, whether the commands came from the
 * command line or from a script on standard input.
 */
export interface DiskRunJson {
    /** The image's path as given on the command line. */
    image: string;
    /** One entry per command that ran, in order. A command that failed is the last. */
    commands: DiskCommandJson[];
    /**
     * The path the changes were saved to (by the "save" or "quit" command, or at the end of the run), or null
     * if nothing was saved (no changes, --dry-run, abort, or an error).
     */
    saved: string | null;
    /** Whether the disk had unsaved changes at the end that --dry-run kept from being saved. Only with --dry-run. */
    wouldHaveChanged?: boolean;
    /** Warnings logged by the decoders while reading the disk, and any that didn't belong to a command. */
    warnings: string[];
    /**
     * Missing if everything worked. Otherwise why the run stopped before or between commands (the image
     * couldn't be opened, or a line of a script had a syntax error, say); a failing command's error is in its
     * entry instead. A script's error starts with "Line N: ".
     */
    error?: string;
    /** The exit status that the error gives, such as 3 for an image that isn't there. Only when error is. */
    errorCode?: number;
}

/**
 * One command that ran.
 */
export interface DiskCommandJson {
    /** The command as typed, such as "add hello.bas --overwrite". */
    command: string;
    /** The command's name, without aliases: "add" for "put". It says which of the results the command's is. */
    name: string;
    /** What the command would have printed as text, line by line, without colors. For people, not parsing. */
    messages: string[];
    /** Warnings the command printed (in text mode they're in yellow), such as --force overriding a blocker. */
    warnings: string[];
    /** Missing if the command worked. Otherwise its error, and it was the last command run. */
    error?: string;
    /**
     * The exit status that the error gives, such as 5 for a write-protected image (the list is in
     * "trs80-tool --help"). Only when error is.
     */
    errorCode?: number;
    /**
     * The command's own result, whose type is the one that {@link DiskCommandResultsJson} has under the
     * command's name. Missing if the command failed or has no result ("quit", "abort", "help").
     */
    result?: DiskCommandResultJson;
}

/**
 * The result of each command that has one, by the command's name.
 */
export interface DiskCommandResultsJson {
    dir: DirResultJson;
    extract: ExtractResultJson;
    list: ListResultJson;
    add: AddResultJson;
    kill: KillResultJson;
    rename: RenameResultJson;
    attrib: AttribChangeResultJson | AttribShowResultJson;
    label: LabelResultJson;
    protect: ProtectResultJson;
    info: InfoResultJson;
    partition: PartitionListResultJson | PartitionSelectResultJson | PartitionAddResultJson |
        PartitionDeleteResultJson;
    free: FreeResultJson;
    map: MapResultJson;
    check: CheckResultJson;
    repair: RepairResultJson;
    create: CreateResultJson;
    format: CreateResultJson;
    trim: TrimResultJson;
    undo: UndoResultJson;
    redo: UndoResultJson;
    revert: RevertResultJson;
    save: SaveResultJson;
}

/**
 * Any command's result. Which one it is depends on the command's name (see {@link DiskCommandResultsJson}).
 */
export type DiskCommandResultJson = DiskCommandResultsJson[keyof DiskCommandResultsJson];

/**
 * The result of "dir".
 */
export interface DirResultJson {
    /** The name and version of the disk's DOS, such as "TRSDOS 2.3". */
    os: string;
    /** The files listed, as "dir --json" gives them. */
    files: FileJson[];
    /** Whether the disk can be written to, as "info" says. */
    writable: boolean;
    /** Why it can't be. Only when it's not writable. */
    readOnlyReason?: string;
}

/**
 * A file that "extract" wrote.
 */
export interface ExtractedFileJson {
    /** The file's name on the disk, such as "HELLO.BAS" (for a Xenix disk, the path of the file's directory too). */
    name: string;
    /** The host path that the file was written to. */
    path: string;
}

/**
 * The result of "extract".
 */
export interface ExtractResultJson {
    /** The files written, in order. */
    files: ExtractedFileJson[];
}

/**
 * How "list" showed a file.
 */
export type ListKindJson =
    /** A tokenized BASIC program, as a source listing. */
    "basic" |
    /** Text. */
    "text" |
    /** An annotated hex dump. */
    "hex";

/**
 * A file that "list" showed.
 */
export interface ListedFileJson {
    /** The file's name on the disk, such as "HELLO.BAS". */
    name: string;
    /** How the file was shown. */
    kind: ListKindJson;
    /** The file's bytes as stored on the disk, in base64. */
    contents: string;
}

/**
 * The result of "list".
 */
export interface ListResultJson {
    /** The files shown, in order. */
    files: ListedFileJson[];
    /** The lines that "list" shows as text, with a header line for each file if there are several. */
    listing: string[];
}

/**
 * A file that "add" put on the disk.
 */
export interface AddedFileJson {
    /** The host path of the file that was read, as given. */
    host: string;
    /** The name on the disk, such as "HELLO.BAS". */
    name: string;
    /** The file's size on the disk in bytes, after conversion. */
    size: number;
    /** Whether the file replaced one that was already on the disk. */
    replaced: boolean;
    /** What the conversion did, as messages such as "Tokenized hello.bas.". Empty if there was no conversion. */
    conversions: string[];
}

/**
 * The result of "add".
 */
export interface AddResultJson {
    /** The files added or replaced, in order. */
    files: AddedFileJson[];
}

/**
 * The result of "kill".
 */
export interface KillResultJson {
    /** The names of the files removed, such as "HELLO.BAS", in directory order. */
    removed: string[];
}

/**
 * The result of "rename".
 */
export interface RenameResultJson {
    /** The file's old name as it was on the disk, such as "HELLO.BAS". */
    from: string;
    /** The new name. */
    to: string;
}

/**
 * A file's protection level.
 */
export interface ProtectionJson {
    /** The level as stored in the directory entry, from 0 (full access) to 7 (no access). */
    level: number;
    /** The level's name in the DOS of the disk, such as "READ" or "EXEC". Different DOSes name some levels differently. */
    name: string;
}

/**
 * What "attrib" changed.
 */
export interface AttribChangesJson {
    /** Whether the files became invisible (true) or visible (false). Missing if that wasn't changed. */
    invisible?: boolean;
    /** Whether the files became system files (true) or user files (false). Missing if that wasn't changed. */
    system?: boolean;
    /** The new protection level. Missing if it wasn't changed. */
    protection?: ProtectionJson;
    /** Whether the update (owner) password was set or removed. Missing if it wasn't changed. */
    updatePassword?: "set" | "removed";
    /** Whether the access (user) password was set or removed. Missing if it wasn't changed. */
    accessPassword?: "set" | "removed";
    /** The new date as "YYYY-MM-DD", or null if it was removed. Missing if it wasn't changed. */
    date?: string | null;
}

/**
 * The result of "attrib" with options that change attributes.
 */
export interface AttribChangeResultJson {
    /** The names of the files changed, such as "HELLO.BAS", in directory order. */
    files: string[];
    /** What was changed, the same on every file. */
    changes: AttribChangesJson;
}

/**
 * The attributes of one file, shown by "attrib" with no options that change them.
 */
export interface AttribFileJson {
    /** The file's name, such as "HELLO.BAS". */
    name: string;
    /** The file's protection level. */
    protection: ProtectionJson;
    /** Whether the file is left out of directory listings. */
    invisible: boolean;
    /** Whether the file is a system file. */
    system: boolean;
    /** Whether the file has an update (owner) password. The password isn't known, only its hash. */
    updatePassword: boolean;
    /** Whether the file has an access (user) password. */
    accessPassword: boolean;
    /**
     * The file's date, as "dir --json" gives it in the file's "date" field: "YYYY-MM-DD", with "THH:MM" on disks
     * with time stamps that have one, or only "YYYY-MM" where the DOS records no day. Null if it
     * has no date.
     */
    date: string | null;
}

/**
 * The result of "attrib" with no options that change attributes.
 */
export interface AttribShowResultJson {
    /** The selected files, in directory order. */
    files: AttribFileJson[];
}

/**
 * The result of "label", which is the disk's name, date, master password and AUTO command, as shown (with
 * no options) or as they are after the change.
 */
export interface LabelResultJson {
    /** The disk's name. */
    name: string;
    /**
     * The disk's date as "YYYY-MM-DD", or null if it has none or the stored text isn't a valid date. The disk
     * stores only two digits of the year, which are read as one of the hundred years from the first that the
     * disk's DOS takes: on LDOS, 80-99 are 1980-1999 and 00-79 are 2000-2079.
     */
    date: string | null;
    /** The disk's date as the disk stores it ("MM/DD/YY", such as "01/25/83"), or null if it has none. */
    storedDate: string | null;
    /**
     * What we know of the master password: "PASSWORD" if it's the common default, "blank" if there is none,
     * and "other" if it's set to something else, which only the hash can tell apart.
     */
    masterPassword: "PASSWORD" | "blank" | "other";
    /** The hash of the master password, as the disk stores it. */
    masterPasswordHash: number;
    /** The command the DOS runs at boot, "" for none, or null if the disk has no place to keep one. */
    autoCommand: string | null;
}

/**
 * The result of "protect".
 */
export interface ProtectResultJson {
    /** Whether the image is marked write-protected (after the command, if it set the flag), or null if its format has no such flag. */
    writeProtected: boolean | null;
    /** Why the image has no flag. Only when writeProtected is null. */
    reason?: string;
    /** Whether the command changed the flag (false if it already had the value asked for). Only when setting. */
    changed?: boolean;
}

/**
 * The free space on a disk.
 */
export interface FreeResultJson {
    /** The number of free granules. */
    freeGranules: number;
    /** The number of bytes in a granule. */
    granuleBytes: number;
    /** The number of free bytes, in all. */
    freeBytes: number;
}

/**
 * Where a partition is on a hard disk.
 */
export interface PartitionLocationJson {
    /** The first physical cylinder. */
    cylinderOffset: number;
    /** The first physical head. */
    headOffset: number;
    /** The number of cylinders. */
    cylinderCount: number;
    /** The number of heads. */
    headCount: number;
}

/**
 * One partition of a hard disk.
 */
export interface PartitionJson {
    /** The partition's number, from 1. */
    number: number;
    /** The disk name that FORMAT wrote, or "" if there is none. */
    diskName: string;
    /** Where the partition is. */
    location: PartitionLocationJson;
    /** The name and version of the partition's DOS, such as "LS-DOS 6.3.1". */
    os: string;
    /** The number of files, not counting system files. */
    fileCount: number;
    /** Whether the partition can be written to. */
    writable: boolean;
    /** Why it can't be written to. Only when it's not writable. */
    readOnlyReason?: string;
    /** Whether this is the partition that the commands work on. */
    selected: boolean;
}

/**
 * The layout of a hard disk.
 */
export interface HardDiskGeometryJson {
    /** The number of cylinders. */
    cylinderCount: number;
    /** The number of heads. */
    headCount: number;
    /** The number of sectors on each track. */
    sectorsPerTrack: number;
    /** The size of a sector in bytes. */
    sectorSize: number;
}

/**
 * The result of "info".
 */
export interface InfoResultJson {
    /** The one-line description of the disk, which "info" prints first. */
    description: string;
    /**
     * The file system that the commands work on (the selected partition's, for a hard disk): its name, its
     * number of files, and the details of its layout, as "info --json --verbose" gives them. Null if no DOS
     * was recognized, or a hard disk has no partition selected.
     */
    os: OsInfoJson | null;
    /** Floppies only: the layout of the disk, as "info --json --verbose" gives it. */
    geometry?: GeometryInfoJson;
    /** Hard disks only: the layout of the disk. */
    hardDiskGeometry?: HardDiskGeometryJson;
    /**
     * Which DOS's rules a change to the disk follows, by the name that --dos takes, such as "ldos-5", or null
     * if they couldn't be told. Missing if the file system isn't one that can be written.
     */
    rules?: string | null;
    /** Whether the disk can be written to. */
    writable: boolean;
    /** Why it can't be. Only when it's not writable. */
    readOnlyReason?: string;
    /** Whether the image is marked write-protected, or null if its format has no such flag. */
    writeProtected: boolean | null;
    /** The free space, if it's known (it isn't for a hard disk with no partition selected, or a damaged GAT). */
    free?: FreeResultJson;
    /** The partitions, for a hard disk. */
    partitions?: PartitionJson[];
}

/**
 * The result of "partition" with no arguments: the partitions.
 */
export interface PartitionListResultJson {
    /** The partitions, in disk order. */
    partitions: PartitionJson[];
}

/**
 * The result of "partition" with a partition to select.
 */
export interface PartitionSelectResultJson {
    /** The number (from 1) of the partition that the commands now work on. */
    selected: number;
}

/**
 * The result of "partition --add".
 */
export interface PartitionAddResultJson {
    /** The new partition, which is now selected. */
    added: {
        /** Its number, from 1. */
        number: number;
        /** Its disk name. */
        diskName: string;
        /** Where it is. */
        location: PartitionLocationJson;
    };
}

/**
 * The result of "partition --delete".
 */
export interface PartitionDeleteResultJson {
    /** The partition that was deleted. */
    deleted: {
        /** The number that it had, from 1. */
        number: number;
        /** What it was called in messages, such as "partition 2 (GAMES)". */
        label: string;
    };
    /** Whether there were partitions after it, which now have numbers one lower. */
    renumbered: boolean;
}

/**
 * What a granule in the map shows.
 */
export type MapCellKindJson =
    /** Nothing uses the granule. */
    "free" |
    /** One file uses it, and the file is one the user asked about (or the user asked about none in particular). */
    "file" |
    /** One file uses it, but the user asked about other files. */
    "otherFile" |
    /** The directory. */
    "directory" |
    /** The boot sector's granule, or BOOT/SYS's. */
    "boot" |
    /** The lockout table says the granule can't be used. */
    "lockedOut" |
    /** Two or more files claim the granule (damage). */
    "shared" |
    /** A file claims the granule, but the GAT says it's free (damage). */
    "claimedButFree" |
    /** The GAT says the granule is used, but no file claims it. */
    "unclaimed";

/**
 * One granule of the map.
 */
export interface MapCellJson {
    /** The granule's lump (the cylinder, on the DOSes where a lump is a cylinder). */
    lump: number;
    /** The granule's index within its lump. */
    granule: number;
    /** The physical positions of the granule's sectors, in order. */
    sectors: SectorPositionJson[];
    /** What the granule shows. */
    kind: MapCellKindJson;
    /** The index into the map's files of the file that uses the granule. Only when the kind is "file". */
    file?: number;
}

/**
 * A file that has granules in the map.
 */
export interface MapFileJson {
    /** The file's name on the disk, such as "HELLO.BAS". */
    name: string;
    /** The number of granules the file occupies. */
    granuleCount: number;
    /**
     * The file's position in the sequence of colored files (0, 1, 2, ...), for a drawing to choose a color
     * by. Missing for a file with no granules.
     */
    colorIndex?: number;
}

/**
 * The result of "map": where everything is on a TRSDOS-family floppy.
 */
export interface MapResultJson {
    /** One cell for each granule, ordered by lump and then granule. */
    cells: MapCellJson[];
    /** The files with names and colors in the map: user files in directory order, then system files. */
    files: MapFileJson[];
    /** The number of cells of each kind, by the kind's name. A kind with no cells is left out. */
    kindCounts: {[kind: string]: number};
    /** The counts behind the totals. */
    totals: {
        /** The number of granules on the disk. */
        granuleCount: number;
        /** The number of granules that the DOS could hand out. */
        freeGranuleCount: number;
        /** The number of granules that the lockout table marks as unusable. */
        lockedOutGranuleCount: number;
        /** The number of bytes in the free granules. */
        freeByteCount: number;
        /** The number of bytes in a granule. */
        granuleByteCount: number;
    };
    /** The shape of the disk's sectors. */
    layout: {
        /** The number of sectors per track that the file system uses. */
        sectorsPerTrack: number;
        /** The number of the first sector on a track (0 or 1). */
        firstSectorNumber: number;
        /** The number of sides that the file system allocates on (1 or 2). */
        allocationSides: number;
        /** The number of sides in the image, which can be more than the file system uses. */
        imageSideCount: number;
        /** The last cylinder to show: the image's last, or a later one that a granule is on. */
        lastCylinder: number;
    };
}

/**
 * How serious a finding of "check" is.
 */
export type FindingSeverityJson =
    /** We may have guessed the layout wrong, so nothing may write to the disk, not even a repair. */
    "layout" |
    /** The layout is fine but the file system is inconsistent. A repair may fix these. */
    "damage" |
    /** Normal and harmless, reported for information. */
    "note";

/**
 * What a finding of "check" is about.
 */
export type FindingKindJson =
    /** The GAT can't be read, so nothing about the granules can be checked. */
    "gatUnreadable" |
    /** The GAT's unused bits aren't what the DOS writes, so the granules per lump are a guess. */
    "gatNotStrict" |
    /** The directory was read without its HIT, because the HIT doesn't match it. */
    "hitIgnored" |
    /** Two or more files claim the same granules. */
    "sharedGranules" |
    /** A file uses granules that the GAT says are free. */
    "claimedButFree" |
    /** A file's extent runs past the end of the disk. */
    "extentOutOfRange" |
    /** A directory entry's HIT byte isn't the hash of its file's name. */
    "hitMismatch" |
    /** An extended directory entry that no file's chain reaches. */
    "orphanExtendedEntry" |
    /** A file with missing sectors, CRC errors, or a broken chain of directory entries. */
    "damagedFile" |
    /** The GAT marks granules used that no file claims. */
    "usedButUnclaimed" |
    /** BOOT/SYS shares granules of the boot cylinder with another file. */
    "bootSysOverlap" |
    /** A program whose directory size ends before its transfer record. */
    "programPastEof";

/**
 * One thing that "check" found.
 */
export interface FindingJson {
    /** What the finding is about. */
    kind: FindingKindJson;
    /** How serious it is. */
    severity: FindingSeverityJson;
    /** A complete sentence for a person. */
    message: string;
    /** The names of the files involved, such as "HELLO.BAS", in the order the finding gives them. Possibly empty. */
    files: string[];
    /** The granules involved, in order. Possibly empty. */
    granules: GranuleJson[];
}

/**
 * A granule of a TRSDOS-family file system.
 */
export interface GranuleJson {
    /** The granule's lump (the cylinder, on the DOSes where a lump is a cylinder). */
    lump: number;
    /** The granule's index within its lump. */
    granule: number;
}

/**
 * The result of "check".
 */
export interface CheckResultJson {
    /** What's inconsistent in the file system, in order of severity (layout, then damage, then notes). Empty if nothing is. */
    findings: FindingJson[];
    /** Whether the disk can be written to. */
    writable: boolean;
    /** Why it can't be. Only when it's not writable. */
    readOnlyReason?: string;
}

/**
 * Damage that "repair" couldn't fix: the finding as "check" gives it, and why it wasn't fixed.
 */
export interface RepairRemainingJson extends FindingJson {
    /** Why it isn't fixed, and what the user could do. */
    advice: string;
}

/**
 * The result of "repair".
 */
export interface RepairResultJson {
    /** What the repair changed, as sentences. Empty if there was nothing to fix. */
    changes: string[];
    /** The damage that is left. */
    remaining: RepairRemainingJson[];
    /** The number of granules that --free-unclaimed would free (0 if it was given, since they were freed). */
    freeableUnclaimedGranules: number;
    /**
     * The names of the programs that --fix-program-sizes would fix, such as "HELLO.BAS" (none if it was given,
     * since they were fixed).
     */
    fixablePrograms: string[];
    /** Whether the disk can be written to now. */
    writable: boolean;
    /** Why it can't be. Only when it's not writable. */
    readOnlyReason?: string;
}

/**
 * The result of "create" and "format".
 */
export interface CreateResultJson {
    /** The one-line description of the new disk, as "info" gives it. */
    description: string;
    /** Whether the command replaced a disk that was there (always true for "format", which erases). */
    replaced: boolean;
    /** Only for "create --system": where the disk was copied from. */
    systemDisk?: {
        /** What the system disk is, such as "LS-DOS 6.3.1 system disk for the Model 4". */
        description: string;
        /** The names of the files that --minimal removed from the copy, such as "HELLO.BAS". Empty if it wasn't given. */
        removed: string[];
    };
}

/**
 * Why "trim" had nothing to trim.
 */
export type TrimNothingReasonJson =
    /** Side 1 was to be dropped, but the image has only one side. */
    "oneSide" |
    /** A number of cylinders was asked for, but the image has no more than that. */
    "cylinders" |
    /** The image has no cylinders at the end that the disk doesn't use. */
    "unused";

/**
 * The result of "trim" when it had nothing to trim.
 */
export interface TrimNothingResultJson {
    /** Always false. */
    trimmed: false;
    /** Why there was nothing to trim. */
    reason: TrimNothingReasonJson;
}

/**
 * Why "trim" dropped cylinders.
 */
export type TrimCylindersReasonJson =
    /** --cylinders asked for fewer. */
    "requested" |
    /** The file system doesn't use them. */
    "fileSystemEnd" |
    /** They're at the end of the image and have no readable sectors. */
    "unreadable";

/**
 * A count before and after a change.
 */
export interface BeforeAfterJson {
    /** The count before. */
    before: number;
    /** The count after. */
    after: number;
}

/**
 * The result of "trim" when it trimmed the image.
 */
export interface TrimDoneResultJson {
    /** Always true. */
    trimmed: true;
    /** The image's cylinders, before and after. */
    cylinders: BeforeAfterJson;
    /** Why cylinders were dropped. Only when some were. */
    cylindersReason?: TrimCylindersReasonJson;
    /** The image's sides, before and after. */
    sides: BeforeAfterJson;
    /** The image's size in bytes, before and after. */
    size: BeforeAfterJson;
}

/**
 * The result of "trim".
 */
export type TrimResultJson = TrimNothingResultJson | TrimDoneResultJson;

/**
 * The result of "undo" and "redo".
 */
export interface UndoResultJson {
    /** The command that was undone or redone, as typed, or null if there was nothing to do. */
    command: string | null;
}

/**
 * The result of "revert".
 */
export interface RevertResultJson {
    /** Whether the disk changed (false if it was already as last saved). */
    reverted: boolean;
}

/**
 * The result of "save".
 */
export interface SaveResultJson {
    /** The path written, or null if nothing was written (no changes, or --dry-run). */
    saved: string | null;
}

/**
 * A string for a finding's severity.
 */
export function findingSeverityToJson(severity: TrsdosFindingSeverity): FindingSeverityJson {
    switch (severity) {
        case TrsdosFindingSeverity.LAYOUT:
            return "layout";
        case TrsdosFindingSeverity.DAMAGE:
            return "damage";
        case TrsdosFindingSeverity.NOTE:
            return "note";
        default:
            assertNever(severity);
    }
}

/**
 * A string for what a finding is about.
 */
export function findingKindToJson(kind: TrsdosFindingKind): FindingKindJson {
    switch (kind) {
        case TrsdosFindingKind.GAT_UNREADABLE:
            return "gatUnreadable";
        case TrsdosFindingKind.GAT_NOT_STRICT:
            return "gatNotStrict";
        case TrsdosFindingKind.HIT_IGNORED:
            return "hitIgnored";
        case TrsdosFindingKind.SHARED_GRANULES:
            return "sharedGranules";
        case TrsdosFindingKind.CLAIMED_BUT_FREE:
            return "claimedButFree";
        case TrsdosFindingKind.EXTENT_OUT_OF_RANGE:
            return "extentOutOfRange";
        case TrsdosFindingKind.HIT_MISMATCH:
            return "hitMismatch";
        case TrsdosFindingKind.ORPHAN_EXTENDED_ENTRY:
            return "orphanExtendedEntry";
        case TrsdosFindingKind.DAMAGED_FILE:
            return "damagedFile";
        case TrsdosFindingKind.USED_BUT_UNCLAIMED:
            return "usedButUnclaimed";
        case TrsdosFindingKind.BOOT_SYS_OVERLAP:
            return "bootSysOverlap";
        case TrsdosFindingKind.PROGRAM_PAST_EOF:
            return "programPastEof";
        default:
            assertNever(kind);
    }
}

/**
 * A string for what a map cell shows.
 */
export function mapCellKindToJson(kind: MapCellKind): MapCellKindJson {
    switch (kind) {
        case MapCellKind.FREE:
            return "free";
        case MapCellKind.FILE:
            return "file";
        case MapCellKind.OTHER_FILE:
            return "otherFile";
        case MapCellKind.DIRECTORY:
            return "directory";
        case MapCellKind.BOOT:
            return "boot";
        case MapCellKind.LOCKED_OUT:
            return "lockedOut";
        case MapCellKind.SHARED:
            return "shared";
        case MapCellKind.CLAIMED_BUT_FREE:
            return "claimedButFree";
        case MapCellKind.UNCLAIMED:
            return "unclaimed";
        default:
            assertNever(kind);
    }
}

/**
 * Convert one of "check"'s findings to JSON.
 */
export function findingToJson(finding: TrsdosFinding): FindingJson {
    return {
        kind: findingKindToJson(finding.kind),
        severity: findingSeverityToJson(trsdosFindingKindSeverity(finding.kind)),
        message: finding.message,
        files: finding.dirEntries.map(dirEntry => dirEntry.getFilename(".")),
        granules: finding.granules.map(granule => ({lump: granule.lump, granule: granule.granule})),
    };
}

/**
 * Convert what "trim" did to JSON.
 */
export function trimDoneToJson(result: TrimDoneResult): TrimDoneResultJson {
    const json: TrimDoneResultJson = {
        trimmed: true,
        cylinders: {before: result.oldCylinderCount, after: result.newCylinderCount},
        sides: {before: result.oldSideCount, after: result.newSideCount},
        size: {before: result.oldSize, after: result.newSize},
    };
    if (result.cylindersReason !== undefined) {
        json.cylindersReason = trimCylindersReasonToJson(result.cylindersReason);
    }
    return json;
}

/**
 * A string for why "trim" dropped cylinders.
 */
export function trimCylindersReasonToJson(reason: TrimCylindersReason): TrimCylindersReasonJson {
    switch (reason) {
        case TrimCylindersReason.REQUESTED:
            return "requested";
        case TrimCylindersReason.FILE_SYSTEM_END:
            return "fileSystemEnd";
        case TrimCylindersReason.UNREADABLE:
            return "unreadable";
        default:
            assertNever(reason);
    }
}

/**
 * A string for why "trim" had nothing to do.
 */
export function trimNothingReasonToJson(reason: TrimNothingReason): TrimNothingReasonJson {
    switch (reason) {
        case TrimNothingReason.ONE_SIDE:
            return "oneSide";
        case TrimNothingReason.CYLINDERS:
            return "cylinders";
        case TrimNothingReason.UNUSED:
            return "unused";
        default:
            assertNever(reason);
    }
}

/**
 * A file's protection level as JSON.
 *
 * @param level the level.
 * @param names which DOS's names the disk uses.
 */
export function protectionToJson(level: TrsdosProtectionLevel, names: TrsdosProtectionNames): ProtectionJson {
    return {level, name: trsdosProtectionLevelToString(level, names)};
}

/**
 * A date as "YYYY-MM-DD", or null for no date.
 */
export function dateToJson(date: Date | null): string | null {
    return date === null ? null : formatYmd(date);
}

/**
 * The attributes of one file, for "attrib" with nothing to change.
 *
 * @param dirEntry the file's primary directory entry.
 * @param names which DOS's protection names the disk uses.
 */
export function attribFileToJson(dirEntry: TrsdosDirEntry, names: TrsdosProtectionNames): AttribFileJson {
    return {
        name: dirEntry.getFilename("."),
        protection: protectionToJson(dirEntry.getProtectionLevel(), names),
        invisible: dirEntry.isHidden(),
        system: dirEntry.isSystemFile(),
        updatePassword: trsdosPasswordIsSet(dirEntry.updatePassword, dirEntry.version),
        accessPassword: trsdosPasswordIsSet(dirEntry.accessPassword, dirEntry.version),
        date: trsdosDirEntryJsonDate(dirEntry) ?? null,
    };
}

/**
 * What we know of a master password from its hash.
 *
 * @param passwordHash the hash.
 * @param version the disk's layout, whose hash it is (TRSDOS 1.3 has its own).
 */
export function masterPasswordToJson(passwordHash: number, version: TrsdosVersion): "PASSWORD" | "blank" | "other" {
    const password = knownTrsdosPassword(passwordHash, version);
    if (password === undefined) {
        return "other";
    }
    return password === "" ? "blank" : "PASSWORD";
}

/**
 * The disk's name, date, master password and AUTO command as JSON.
 *
 * @param info the disk's information.
 * @param ruleSet the DOS's rules, or undefined if unknown, which says which century the stored date is in.
 */
export function diskInfoToJson(info: TrsdosDiskInfo, ruleSet: TrsdosRuleSet | undefined): LabelResultJson {
    const parsed = parseTrsdosGatDate(info.date, ruleSet);
    const date = parsed === undefined ? null : formatYmd(new Date(parsed.year, parsed.month - 1, parsed.day));
    return {
        name: info.name,
        date,
        storedDate: info.date === "" ? null : info.date,
        masterPassword: masterPasswordToJson(info.passwordHash, info.version),
        masterPasswordHash: info.passwordHash,
        autoCommand: info.autoCommand ?? null,
    };
}

/**
 * The free space as JSON.
 */
export function freeSpaceToJson(freeSpace: FreeSpace): FreeResultJson {
    return {
        freeGranules: freeSpace.freeGranules,
        granuleBytes: freeSpace.granuleBytes,
        freeBytes: freeSpace.freeBytes,
    };
}

/**
 * Where a partition is, as JSON.
 */
export function partitionLocationToJson(partition: LdosPartition): PartitionLocationJson {
    const location = partition.partition;
    return {
        cylinderOffset: location.cylinderOffset,
        headOffset: location.headOffset,
        cylinderCount: location.cylinderCount,
        headCount: location.headCount,
    };
}

/**
 * The partitions of a hard disk as JSON.
 *
 * @param session the session, whose disk is a hard disk.
 */
export function partitionsToJson(session: DiskSession): PartitionJson[] {
    return session.getPartitions().map((partition, index): PartitionJson => {
        const readOnlyReason = session.partitionReadOnlyReason(partition);
        const json: PartitionJson = {
            number: index + 1,
            diskName: partition.diskName,
            location: partitionLocationToJson(partition),
            os: partition.trsdos.nameAndVersion,
            fileCount: partition.trsdos.getDirEntries(false).length,
            writable: readOnlyReason === undefined,
            selected: session.selectedPartitionNumber === index + 1,
        };
        if (readOnlyReason !== undefined) {
            json.readOnlyReason = readOnlyReason;
        }
        return json;
    });
}

/**
 * The map as JSON.
 *
 * @param model the map's data.
 */
export function mapToJson(model: DiskMapModel): MapResultJson {
    const fileIndexes = new Map(model.files.map((file, index) => [file, index]));
    const kindCounts: {[kind: string]: number} = {};
    for (const [kind, count] of model.kindCounts) {
        kindCounts[mapCellKindToJson(kind)] = count;
    }

    return {
        cells: model.cells.map(cell => {
            const json: MapCellJson = {
                lump: cell.lump,
                granule: cell.granule,
                sectors: cell.sectors.map(sectorPositionToJson),
                kind: mapCellKindToJson(cell.kind),
            };
            const fileIndex = cell.file === undefined ? undefined : fileIndexes.get(cell.file);
            if (fileIndex !== undefined) {
                json.file = fileIndex;
            }
            return json;
        }),
        files: model.files.map(file => {
            const json: MapFileJson = {name: file.dirEntry.getFilename("."), granuleCount: file.granuleCount};
            if (file.colorIndex !== undefined) {
                json.colorIndex = file.colorIndex;
            }
            return json;
        }),
        kindCounts,
        totals: {...model.totals},
        layout: {...model.layout},
    };
}
