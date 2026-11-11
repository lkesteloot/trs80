import {
    type BasicDialect, parseTrsdosFilename, parseTrsdosProtectionLevel, readTrsdosDiskInfo, TRSDOS_BLANK_PASSWORD_HASH,
    TRSDOS_DEFAULT_PASSWORD_HASH, Trsdos, type TrsdosAttributeChanges, type TrsdosDirEntry, type TrsdosDiskInfo,
    type TrsdosAddResult, type TrsdosDiskInfoChanges, type TrsdosFilename, trsdosFilenameFromHost,
    trsdosFilenameToString, type TrsdosProtectionLevel, trsdosProtectionLevels, trsdosProtectionLevelToString,
    type TrsdosProtectionNames,
} from "trs80-base";
import {DiskError} from "./DiskError.js";
import {importHostFile, stemOf} from "./DiskImport.js";
import {DiskSession, DiskWritePurpose} from "./DiskSession.js";
import {selectByPatterns, systemWildcardHint} from "./Patterns.js";
import {pluralizeWithCount} from "./Plural.js";

// The operations behind the disk commands that change files and labels ("kill", "rename", "attrib", "add"
// and "label"). Each does its work on a DiskSession and returns what it did as data, without printing, so
// that the command line and a web page can each show the result their own way.

/**
 * Choose the files that the patterns select, for the commands that take TRS-80 name patterns. A name
 * without wildcards selects the file of that name even if it's a system file, but a wildcard never
 * selects a system file (see selectByPatterns()).
 *
 * @param allEntries the primary entries of the files on the disk, in directory order, including system files.
 * @param patterns the name patterns the user gave. Each must match a file.
 * @return the files that any pattern matches, once each, in directory order.
 * @throws DiskError if a pattern matches no file.
 */
export function selectDirEntries(allEntries: TrsdosDirEntry[], patterns: string[]): TrsdosDirEntry[] {
    const { selected, unmatchedPattern, unmatchedOnlySystem } = selectByPatterns(allEntries, patterns, {
        name: dirEntry => dirEntry.getFilename("."),
        hasDirectories: () => false,
        isSystem: dirEntry => dirEntry.isSystemFile(),
    }, false);
    if (unmatchedPattern !== undefined) {
        throw new DiskError("No file on the disk matches \"" + unmatchedPattern + "\"" +
            systemWildcardHint(unmatchedOnlySystem));
    }

    return selected;
}

/**
 * Remove files from the disk, freeing their space. Every pattern must match a file or nothing is removed,
 * and a file that several patterns match is removed once. All the files are removed in one change.
 *
 * @param session the open disk.
 * @param patterns the TRS-80 name patterns that select the files to remove.
 * @return the names of the removed files as the disk shows them (such as "HELLO/BAS"), in directory order.
 * @throws DiskError if a pattern matches no file or the disk can't be written.
 */
export function killFiles(session: DiskSession, patterns: string[]): string[] {
    const removedNames: string[] = [];

    session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
        // Check every pattern before removing anything. The files come in directory order, so the
        // report is stable.
        const toRemove = selectDirEntries(writer.getFiles(), patterns);
        for (const dirEntry of toRemove) {
            writer.deleteFile(dirEntry);
            removedNames.push(dirEntry.getFilename("/"));
        }
    });

    return removedNames;
}

/**
 * What renameFile() did.
 */
export interface RenameResult {
    /** The old name of the file as it is on the disk, such as "HELLO/BAS". */
    oldName: string;
    /** The new name, such as "HI/BAS". */
    newName: string;
}

/**
 * Rename the one file called oldText to newText, with no wildcards. It's an error if there's no such
 * file or if the new name belongs to another file. The file can be a system file, since it's named.
 *
 * @param session the open disk.
 * @param oldText the file's current name, in any form that parseTrsdosFilename() accepts.
 * @param newText the new name, in the same forms.
 * @throws DiskError if a name is invalid, the file doesn't exist, or the disk can't be written.
 */
export function renameFile(session: DiskSession, oldText: string, newText: string): RenameResult {
    const oldFilename = parseTrsdosFilename(oldText);
    if (typeof oldFilename === "string") {
        throw new DiskError(oldFilename);
    }
    const newFilename = parseTrsdosFilename(newText);
    if (typeof newFilename === "string") {
        throw new DiskError(newFilename);
    }
    const oldName = trsdosFilenameToString(oldFilename);
    const newName = trsdosFilenameToString(newFilename);

    let shownOldName = oldName;
    session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
        const dirEntry = writer.findFile(oldName);
        if (dirEntry === undefined) {
            throw new DiskError("No file on the disk is called " + oldName);
        }
        // The name as it is on the disk.
        shownOldName = dirEntry.getFilename("/");
        writer.renameFile(dirEntry, newFilename);
    });

    return { oldName: shownOldName, newName };
}

/**
 * Format a date as YYYY-MM-DD, which is how the user gives one.
 *
 * @param date the date, in local time.
 */
export function formatYmd(date: Date): string {
    return date.getFullYear().toString().padStart(4, "0") + "-" +
        (date.getMonth() + 1).toString().padStart(2, "0") + "-" + date.getDate().toString().padStart(2, "0");
}

/**
 * Find the protection level that the user named for a disk, by the names its DOS uses.
 *
 * @param text the value of --protect: a level's name or its number.
 * @param names which DOS's names the disk uses.
 * @throws DiskError if the text isn't a level, listing the ones that are.
 */
export function parseProtectLevel(text: string, names: TrsdosProtectionNames): TrsdosProtectionLevel {
    const level = parseTrsdosProtectionLevel(text, names);
    if (level === undefined) {
        const valid = trsdosProtectionLevels(names).map(l => trsdosProtectionLevelToString(l, names) + " (" + l + ")");
        throw new DiskError("Invalid --protect \"" + text + "\": use one of " + valid.join(", ") + " (or a number 0 to 7)");
    }
    return level;
}

/**
 * Describe what an "attrib" command asked for, such as "invisible, protection READ, update password set".
 *
 * @param changes the changes, with the protection level resolved.
 * @param names which DOS's protection names the disk uses.
 */
export function describeChanges(changes: TrsdosAttributeChanges, names: TrsdosProtectionNames): string {
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
 * Describe a file's attributes for "attrib" without changing anything, such as
 * "HELLO/BAS: protection READ, invisible, update password, date 01/05/1983".
 *
 * @param dirEntry the file's primary directory entry.
 * @param names which DOS's protection names the disk uses.
 */
export function describeAttributes(dirEntry: TrsdosDirEntry, names: TrsdosProtectionNames): string {
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
    if (dirEntry.hasDate()) {
        parts.push("date " + dirEntry.getFullDateString().trim());
    }
    return dirEntry.getFilename("/") + ": " + parts.join(", ");
}

/**
 * What the user asked changeAttributes() to change. Every field that is undefined is left alone.
 */
export interface AttributeRequest {
    /** Whether to hide the files from directory listings. */
    invisible?: boolean | undefined;
    /** Whether to make the files system files. */
    system?: boolean | undefined;
    /**
     * The protection level as the user typed it, a name or a number. It's parsed against the names that
     * the disk's own DOS uses, inside the change.
     */
    protect?: string | undefined;
    /** The update (owner) password, or "" for none. */
    updatePassword?: string | undefined;
    /** The access (user) password, or "" for none. */
    accessPassword?: string | undefined;
    /** The date, or null to remove it. */
    date?: Date | null | undefined;
}

/**
 * What changeAttributes() did.
 */
export interface AttributeChangeResult {
    /** The names of the files that changed as the disk shows them (such as "HELLO/BAS"), in directory order. */
    files: string[];
    /** The changes as applied, with the protection level resolved. */
    changes: TrsdosAttributeChanges;
    /** The disk's protection names, for describing the changes with describeChanges(). */
    protectionNames: TrsdosProtectionNames;
}

/**
 * Change attributes on the files that the patterns select, in one change, so that either every file
 * changes or none does. Every pattern must match a file.
 *
 * @param session the open disk.
 * @param patterns the TRS-80 name patterns that select the files.
 * @param request what to change.
 * @throws DiskError if the protection level is invalid, a pattern matches no file, or the disk can't be written.
 */
export function changeAttributes(session: DiskSession, patterns: string[],
                                 request: AttributeRequest): AttributeChangeResult {

    const changes: TrsdosAttributeChanges = {};
    changes.invisible = request.invisible;
    changes.system = request.system;
    changes.updatePassword = request.updatePassword;
    changes.accessPassword = request.accessPassword;
    changes.date = request.date;

    const files: string[] = [];
    let protectionNames: TrsdosProtectionNames | undefined;
    session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
        // The level's name depends on the disk, so it's parsed here. Everything is checked before
        // the first file changes.
        const names = writer.trsdos.protectionNames;
        protectionNames = names;
        if (request.protect !== undefined) {
            changes.protectionLevel = parseProtectLevel(request.protect, names);
        }
        const selected = selectDirEntries(writer.getFiles(), patterns);
        for (const dirEntry of selected) {
            writer.setAttributes(dirEntry, changes);
            files.push(dirEntry.getFilename("/"));
        }
    });

    // changeTrsdos() either runs the callback or throws.
    return { files, changes, protectionNames: protectionNames! };
}

/**
 * The attributes of some files, as listAttributes() returns them.
 */
export interface AttributeListing {
    /** The primary directory entries of the selected files, in directory order. */
    dirEntries: TrsdosDirEntry[];
    /** The disk's protection names, for describing the entries with describeAttributes(). */
    protectionNames: TrsdosProtectionNames;
}

/**
 * Read the attributes of the files that the patterns select, changing nothing.
 *
 * @param session the open disk.
 * @param patterns the TRS-80 name patterns that select the files. Each must match a file.
 * @throws DiskError if the disk isn't TRSDOS-family or a pattern matches no file.
 */
export function listAttributes(session: DiskSession, patterns: string[]): AttributeListing {
    const trsdos = session.fileSystem;
    if (!(trsdos instanceof Trsdos)) {
        throw new DiskError("Can't show attributes: " + (trsdos === undefined ?
            "can't find a DOS directory on \"" + session.name + "\"" :
            trsdos.nameAndVersion + " disks aren't TRSDOS-family"));
    }
    const dirEntries = selectDirEntries(trsdos.getDirEntries(true), patterns);
    return { dirEntries, protectionNames: trsdos.protectionNames };
}

/**
 * Describe a disk's master password for the user, without revealing more than the hash tells us: the
 * password is only known if it's one of the two common ones.
 *
 * @param passwordHash the hash of the password.
 */
export function describeMasterPassword(passwordHash: number): string {
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
export function describeAutoCommand(autoCommand: string | undefined): string {
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
 * @throws DiskError if the disk isn't TRSDOS-family or its information can't be read.
 */
export function readDiskInfo(session: DiskSession): TrsdosDiskInfo {
    const trsdos = session.fileSystem;
    if (!(trsdos instanceof Trsdos)) {
        throw new DiskError("Can't show the disk's information: " + (trsdos === undefined ?
            "can't find a DOS directory on \"" + session.name + "\"" :
            trsdos.nameAndVersion + " disks aren't TRSDOS-family"));
    }
    const info = readTrsdosDiskInfo(trsdos, session.getWriteGate()?.ruleSet);
    if (typeof info === "string") {
        throw new DiskError("Can't read the disk's information: " + info);
    }
    return info;
}

/**
 * Change the disk's name, date, master password or AUTO command in one write.
 *
 * @param session the open disk.
 * @param changes what to change.
 * @return the disk's information read back after the change, which may differ from what was asked for
 * (an uppercased name, for instance).
 * @throws DiskError if the disk can't be written or a value isn't accepted.
 */
export function changeDiskInfo(session: DiskSession, changes: TrsdosDiskInfoChanges): TrsdosDiskInfo {
    session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
        writer.setDiskInfo(changes);
    });
    return readDiskInfo(session);
}

/**
 * A host file to add: its bytes, and how to refer to it.
 */
export interface AddFileSource {
    /** How the user named it, for messages that name the file (the CLI's host pathname). */
    label: string;
    /** Its name without directories, which its TRSDOS name and conversion come from. */
    name: string;
    /** Its bytes, before any conversion. */
    bytes: Uint8Array;
}

/**
 * How to add files (the add command's options, parsed).
 */
export interface AddOptions {
    /** The TRSDOS name for the one file (--as), or undefined to make names from the host names. */
    as?: string | undefined;
    /** Keep BASIC programs as text instead of tokenizing them (--ascii). */
    ascii: boolean;
    /** Copy every file exactly as it is (--binary). */
    binary: boolean;
    /** The BASIC to tokenize for (--basic, or the disk's). */
    basic: BasicDialect;
    /** Make the files system files (--system). */
    system: boolean;
    /** Hide the files from directory listings (--invisible). */
    invisible: boolean;
    /** Replace files that are already on the disk (--overwrite). */
    overwrite: boolean;
    /** The date to record on the files (--date). */
    date?: Date | undefined;
}

/**
 * What will happen to one host file, as planAdd() works it out.
 */
export interface AddPlanItem {
    /** The host file. */
    source: AddFileSource;
    /**
     * Why this file can't be added (the message of the error that the add command throws for it), or
     * undefined if it can.
     */
    problem: string | undefined;
    /**
     * Its TRSDOS name, or undefined if no name could be made for it. It's set even when there's a
     * problem, if the problem comes after the name (a name that an earlier file has too).
     */
    filename: TrsdosFilename | undefined;
    /** Its TRSDOS name as text, such as "HELLO/BAS", or "" if filename is undefined. */
    name: string;
    /** Whether the TRSDOS name differs from the host name (so the CLI says "x will be Y."). */
    nameChanged: boolean;
    /** The bytes to store, after conversion, or undefined if the conversion failed. */
    contents: Uint8Array | undefined;
    /** What the conversion did, such as "Tokenized hello.bas.", to show when the file is added. */
    conversionMessages: string[];
    /** The name (as the disk shows it) of the file already on the disk that this would replace, or undefined. */
    existingName: string | undefined;
}

/**
 * Check that --as is used with exactly one host file.
 *
 * @param as the --as value, or undefined if it wasn't given.
 * @param fileCount how many host files were given.
 * @throws DiskError if --as was given and the count isn't one.
 */
function checkAddAsCount(as: string | undefined, fileCount: number): void {
    if (as !== undefined && fileCount !== 1) {
        throw new DiskError("--as names one file, but " + pluralizeWithCount(fileCount, "host file") +
            " " + (fileCount === 1 ? "was" : "were") + " given");
    }
}

/**
 * Work out what adding host files would do, without changing anything: convert each file for the disk,
 * choose its TRSDOS name, and find which files on the disk it would replace. A problem with one file
 * goes in that item's problem and planning carries on, so that every problem can be shown at once. A file
 * that's already on the disk isn't a problem here (see existingName); addFiles() decides about that.
 *
 * This doesn't check that the disk can be written, which addFiles() does.
 *
 * @param session the open disk.
 * @param sources the host files, in order.
 * @param options how to add them.
 * @throws DiskError for a problem with the whole request: --as with other than one file, or both
 * --ascii and --binary.
 */
export function planAdd(session: DiskSession, sources: AddFileSource[], options: AddOptions): AddPlanItem[] {
    checkAddAsCount(options.as, sources.length);
    if (options.ascii && options.binary) {
        throw new DiskError("Use either --ascii or --binary, not both");
    }

    const trsdos = session.fileSystem;
    const existingEntries = trsdos instanceof Trsdos ? trsdos.getDirEntries(true) : [];

    const items: AddPlanItem[] = [];
    for (const source of sources) {
        const item: AddPlanItem = {
            source,
            problem: undefined,
            filename: undefined,
            name: "",
            nameChanged: false,
            contents: undefined,
            conversionMessages: [],
            existingName: undefined,
        };
        items.push(item);

        // Convert before choosing the name, since the conversion can change the extension.
        let imported;
        try {
            imported = importHostFile(source.name, source.bytes, {
                ascii: options.ascii,
                binary: options.binary,
                basic: options.basic,
            });
        } catch (e) {
            if (e instanceof DiskError) {
                item.problem = e.message;
                continue;
            }
            throw e;
        }
        item.contents = imported.contents;
        item.conversionMessages = imported.messages;

        if (options.as !== undefined) {
            const parsed = parseTrsdosFilename(options.as);
            if (typeof parsed === "string") {
                item.problem = parsed;
                continue;
            }
            item.filename = parsed;
        } else {
            const nameToConvert = imported.extension === undefined ? source.name :
                stemOf(source.name) + "." + imported.extension;
            const converted = trsdosFilenameFromHost(nameToConvert);
            if (typeof converted === "string") {
                item.problem = converted;
                continue;
            }
            item.filename = converted.filename;
            item.nameChanged = converted.changed;
        }
        item.name = trsdosFilenameToString(item.filename);

        const duplicate = items.find(other => other !== item && other.filename !== undefined &&
            other.name === item.name);
        if (duplicate !== undefined) {
            item.problem = "\"" + duplicate.source.label + "\" and \"" + source.label + "\" would both be " +
                item.name + " on the disk";
            continue;
        }

        const upperName = item.name.toUpperCase();
        const existing = existingEntries.find(dirEntry => dirEntry.getFilename("/").toUpperCase() === upperName);
        if (existing !== undefined) {
            // The name as it is on the disk.
            item.existingName = existing.getFilename("/");
        }
    }

    return items;
}

/**
 * A file that addFiles() put on the disk.
 */
export interface AddedFile {
    /** The file's name as the disk shows it, such as "HELLO/BAS". */
    name: string;
    /** The file's size in bytes. */
    size: number;
    /** Whether the file replaced one that was already on the disk. */
    replaced: boolean;
    /** What the conversion did, such as "Tokenized hello.bas.". */
    conversionMessages: string[];
}

/**
 * What addFiles() did.
 */
export interface AddFilesResult {
    /** The files that were added or replaced, in order. */
    files: AddedFile[];
    /** The writer's distinct warnings, in order, without a trailing period. */
    warnings: string[];
}

/**
 * Add the planned files to the disk in one change, so that either every file is added or none is. A name
 * that's already on the disk is an error unless options.overwrite says to replace that file, in which case
 * the new copy keeps the old file's attributes (a system file included) except for the flags in the options.
 *
 * @param session the open disk.
 * @param plan the plan from planAdd(), in which no item may have a problem.
 * @param options the same options that the plan was made with.
 * @throws DiskError with the first item's problem if any item has one, if the disk can't be written, with
 * a message saying that a file is already on the disk if it is and options.overwrite is false, or if
 * the writer refuses.
 */
export function addFiles(session: DiskSession, plan: AddPlanItem[], options: AddOptions): AddFilesResult {
    for (const item of plan) {
        if (item.problem !== undefined) {
            throw new DiskError(item.problem);
        }
    }
    session.requireWritable(DiskWritePurpose.CHANGE);
    if (!options.overwrite) {
        for (const item of plan) {
            if (item.existingName !== undefined) {
                throw new DiskError(item.existingName + " is already on the disk (use --overwrite to replace it)");
            }
        }
    }

    const files: AddedFile[] = [];
    const warnings = new Set<string>();
    session.changeTrsdos(DiskWritePurpose.CHANGE, writer => {
        for (const item of plan) {
            // The plan has no problems, so these are set.
            const filename = item.filename!;
            const contents = item.contents!;

            const existing = writer.findFile(trsdosFilenameToString(filename));
            let result: TrsdosAddResult;
            let replaced: boolean;
            if (existing === undefined) {
                result = writer.addFile(filename, contents, {
                    system: options.system,
                    invisible: options.invisible,
                    date: options.date,
                });
                replaced = false;
            } else {
                if (!options.overwrite) {
                    // The name as it is on the disk.
                    throw new DiskError(existing.getFilename("/") +
                        " is already on the disk (use --overwrite to replace it)");
                }
                // Only the flags that were given change; the new copy keeps the rest of the old file's.
                result = writer.replaceFile(existing, contents, {
                    system: options.system ? true : undefined,
                    invisible: options.invisible ? true : undefined,
                    date: options.date,
                });
                replaced = true;
            }
            files.push({
                name: result.name,
                size: result.size,
                replaced,
                conversionMessages: item.conversionMessages,
            });
            if (result.warning !== undefined) {
                warnings.add(result.warning);
            }
        }
    });

    return { files, warnings: [...warnings] };
}
