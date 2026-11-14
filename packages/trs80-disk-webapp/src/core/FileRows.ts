import {
    decodeTrs80File, type FileDamage, type FloppyDirEntry, type FloppyFileSystem, guessBasicDialect,
    type KnownFloppyFileSystem, TrsdosDirEntry, type Trs80File, Trsdos, trsdosBasicDialect, TrsdosProtectionLevel,
    trsdosProtectionLevelToString, UcsdPascal, UcsdPascalFile, ucsdPascalTextToHost, XenixTar,
} from "trs80-base";
import {formatYmd, type DiskSession, selectByPatterns, trsdosPasswordIsSet} from "trs80-disk";
import {assertNever} from "z80-base";
import {looksLikeText} from "./preview/TextPreview.js";

/**
 * What a file on a disk is, going by its bytes (not by its name's extension alone).
 */
export enum FileKind {
    /** A tokenized BASIC program. */
    BASIC,
    /** A CMD program (a load module). */
    CMD,
    /** A system program, which is what the DOS loads from a "/CMD" or tape SYSTEM format. */
    SYSTEM_PROGRAM,
    /** Plain text, or BASIC saved as text. */
    TEXT,
    /** EDTASM assembly source. */
    EDTASM,
    /** A hi-res screen dump. */
    HI_RES_SCREEN,
    /** Anything else. */
    DATA,
    /** A file with unreadable sectors or directory problems, whatever else it is. */
    DAMAGED,
}

/**
 * The name of a file kind, for a page to show.
 */
export function fileKindToString(kind: FileKind): string {
    switch (kind) {
        case FileKind.BASIC:
            return "BASIC program";
        case FileKind.CMD:
            return "CMD program";
        case FileKind.SYSTEM_PROGRAM:
            return "System program";
        case FileKind.TEXT:
            return "Text";
        case FileKind.EDTASM:
            return "EDTASM source";
        case FileKind.HI_RES_SCREEN:
            return "Hi-res screen";
        case FileKind.DATA:
            return "Data";
        case FileKind.DAMAGED:
            return "Damaged";
        default:
            assertNever(kind);
    }
}

/**
 * The attributes of a TRSDOS-family file.
 */
export interface TrsdosFileAttributes {
    /** Whether the file is hidden from directory listings. */
    invisible: boolean;
    /** Whether it's a system file. */
    system: boolean;
    /** The protection level. */
    protectionLevel: TrsdosProtectionLevel;
    /** The level's name as this DOS calls it, such as "KILL" or "REMOVE". */
    protection: string;
    /** Whether the file has an update (owner) password. */
    hasUpdatePassword: boolean;
    /** Whether it has an access (user) password. */
    hasAccessPassword: boolean;
    /** Whether it has either password. */
    hasPasswords: boolean;
}

/**
 * One row of a file listing.
 */
export interface FileRow {
    /** The file's directory entry, as its file system gave it. */
    entry: FloppyDirEntry;
    /** The name without its extension, such as "HELLO". */
    name: string;
    /** The extension without its separator, such as "BAS", or "" if there's none. */
    extension: string;
    /** The full name as the DOS writes it, such as "HELLO/BAS" on TRSDOS. */
    fullName: string;
    /** The full name as a host would write it, with a ".", which is what patterns are matched against. */
    hostName: string;
    /** The file's size in bytes. */
    size: number;
    /** The file's date, or undefined if the DOS records none. */
    date: Date | undefined;
    /** The date as text: DD/MM/YYYY (and the time, if recorded) on TRSDOS, and YYYY-MM-DD elsewhere. Empty for none. */
    dateText: string;
    /** Whether the file system leaves the file out of directory listings. */
    isHidden: boolean;
    /** Whether it's a system file. */
    isSystem: boolean;
    /** The TRSDOS attributes, or undefined on any other file system. */
    attributes: TrsdosFileAttributes | undefined;
    /** What the file is. */
    kind: FileKind;
    /** What's wrong with the file, or undefined if nothing is. */
    damage: FileDamage | undefined;
    /** The file's bytes as the disk holds them. */
    bytes: Uint8Array;
    /** The bytes that extracting writes: the same, except for a UCSD Pascal text file, which becomes host text. */
    extractBytes: Uint8Array;
    /** The file's bytes decoded. */
    trs80File: Trs80File;
    /** Whether a "/" in the name separates directories (Xenix tar). */
    hasDirectories: boolean;
}

/**
 * The byte that starts a tokenized BASIC program saved to a disk. (The cassette header, 0xD3, is also accepted.)
 */
const BASIC_DISK_HEADER_BYTE = 0xFF;
const BASIC_TAPE_HEADER_BYTE = 0xD3;

/**
 * What kind of file a decoded file is.
 *
 * @param trs80File the decoded file.
 * @param binary its bytes on the disk.
 * @param damaged whether the file is damaged.
 */
function getFileKind(trs80File: Trs80File, binary: Uint8Array, damaged: boolean): FileKind {
    if (damaged) {
        return FileKind.DAMAGED;
    }

    // BASIC saved as text decodes as a program too, but it's more faithfully shown as the text it is.
    const firstByte = binary.length > 0 ? binary[0] : undefined;
    const isTokenized = firstByte === BASIC_DISK_HEADER_BYTE || firstByte === BASIC_TAPE_HEADER_BYTE;
    if (trs80File.className === "BasicProgram" && !isTokenized && looksLikeText(binary)) {
        return FileKind.TEXT;
    }

    switch (trs80File.className) {
        case "BasicProgram":
        case "Level1Program":
            return FileKind.BASIC;
        case "CmdProgram":
            return FileKind.CMD;
        case "SystemProgram":
            return FileKind.SYSTEM_PROGRAM;
        case "EdtasmFile":
            return FileKind.EDTASM;
        case "HiResScreen":
            return FileKind.HI_RES_SCREEN;
        case "RawBinaryFile":
            return looksLikeText(binary) ? FileKind.TEXT : FileKind.DATA;
        case "BootSector":
        case "Cassette":
        case "Jv1FloppyDisk":
        case "Jv3FloppyDisk":
        case "DmkFloppyDisk":
        case "HfeFloppyDisk":
        case "ImdFloppyDisk":
        case "ScpFloppyDisk":
        case "HdvHardDisk":
            return FileKind.DATA;
        default:
            assertNever(trs80File);
    }
}

/**
 * Split a host-style file name into its name and extension at the last dot of its last component.
 *
 * @param hostName the name with a "." before its extension.
 */
function splitHostName(hostName: string): {name: string, extension: string} {
    const slash = hostName.lastIndexOf("/");
    const dot = hostName.lastIndexOf(".");
    if (dot <= slash + 1) {
        return {name: hostName, extension: ""};
    }

    return {name: hostName.substring(0, dot), extension: hostName.substring(dot + 1)};
}

/**
 * The attributes of a TRSDOS directory entry.
 *
 * @param trsdos the file system.
 * @param entry the file's primary entry.
 */
function getTrsdosAttributes(trsdos: Trsdos, entry: TrsdosDirEntry): TrsdosFileAttributes {
    const level = entry.getProtectionLevel();
    const hasUpdatePassword = trsdosPasswordIsSet(entry.updatePassword, entry.version);
    const hasAccessPassword = trsdosPasswordIsSet(entry.accessPassword, entry.version);

    return {
        invisible: entry.isHidden(),
        system: entry.isSystemFile(),
        protectionLevel: level,
        protection: trsdosProtectionLevelToString(level, trsdos.protectionNames),
        hasUpdatePassword,
        hasAccessPassword,
        hasPasswords: hasUpdatePassword || hasAccessPassword,
    };
}

/**
 * The rows of a file listing, in directory order, as trs80-tool's "dir" lists them. This reads every file, to
 * decode it and find its kind and damage, so it's not cheap on a big disk; call it when the disk changes, not on
 * every redraw.
 *
 * @param session the disk's session.
 * @param includeSystemFiles whether to include system files.
 * @returns the rows, or an empty array if the disk has no file system that we recognize.
 */
export function getFileRows(session: DiskSession, includeSystemFiles: boolean): FileRow[] {
    const fileSystem: KnownFloppyFileSystem | undefined = session.fileSystem;
    if (fileSystem === undefined) {
        return [];
    }

    // Every file system's entries are its own kind, which the generic interface can read.
    const generic = fileSystem as FloppyFileSystem;
    const hasDirectories = fileSystem instanceof XenixTar;
    const dialect = session.getBasicDialect();

    return generic.getDirEntries(includeSystemFiles).map(entry => {
        const {binary, damage} = generic.readFileWithDamage(entry);
        const damaged = damage !== undefined && damage.isDamaged();
        const hostName = entry.getFilename(".");

        let trs80File: Trs80File;
        let attributes: TrsdosFileAttributes | undefined = undefined;
        let fullName = hostName;
        let name: string;
        let extension: string;
        let dateText: string;
        if (fileSystem instanceof Trsdos && entry instanceof TrsdosDirEntry) {
            // A program's bytes can say that it's for the other BASIC than the DOS's.
            const basicDialect = guessBasicDialect(binary) ?? trsdosBasicDialect(fileSystem);
            trs80File = decodeTrs80File(binary, {filename: hostName, basicDialect});
            attributes = getTrsdosAttributes(fileSystem, entry);
            fullName = entry.getFilename("/");
            name = entry.getBasename();
            extension = entry.getExtension();
            dateText = entry.getFullDateString().trim();
        } else {
            trs80File = decodeTrs80File(binary, {filename: hostName, basicDialect: dialect});
            ({name, extension} = splitHostName(hostName));
            const date = entry.getDate();
            dateText = date === undefined ? "" : formatYmd(date);
        }

        let extractBytes = binary;
        if (fileSystem instanceof UcsdPascal && entry instanceof UcsdPascalFile && entry.isText()) {
            extractBytes = ucsdPascalTextToHost(binary);
        }

        const row: FileRow = {
            entry,
            name,
            extension,
            fullName,
            hostName,
            size: entry.getSize(),
            date: entry.getDate(),
            dateText,
            isHidden: entry.isHidden(),
            isSystem: entry.isSystemFile(),
            attributes,
            kind: getFileKind(trs80File, binary, damaged),
            damage: damaged ? damage : undefined,
            bytes: binary,
            extractBytes,
            trs80File,
            hasDirectories,
        };
        return row;
    });
}

/**
 * Leave out the hidden (invisible) files, unless they're wanted. A hidden file that is also a system file stays,
 * since the rows are already the ones that the page chose to show: someone who asked for system files wants to
 * see them, and the DOS's own system files are usually invisible too.
 *
 * @param rows the rows.
 * @param showHidden whether hidden files are wanted, in which case all the rows are kept.
 */
export function omitHiddenRows(rows: FileRow[], showHidden: boolean): FileRow[] {
    return showHidden ? rows : rows.filter(row => !row.isHidden || row.isSystem);
}

/**
 * Keep the rows whose names match a filter, with the wildcards of the "dir" command: "*" matches any run of
 * characters, "?" one character, case doesn't matter, and a "/" in the pattern stands for the ".". Several
 * patterns separated by spaces match a row that any of them matches. A pattern without wildcards names one file
 * exactly. An empty filter keeps every row. System files match wildcards, since the rows are already the ones
 * that the page chose to show.
 *
 * @param rows the rows.
 * @param pattern the filter text.
 */
export function filterRows(rows: FileRow[], pattern: string): FileRow[] {
    const patterns = pattern.split(/\s+/).filter(word => word !== "");
    if (patterns.length === 0) {
        return rows;
    }

    // A pattern that matches nothing isn't an error for a filter, so the unmatched part is ignored.
    return selectByPatterns(rows, patterns, {
        name: row => row.hostName,
        hasDirectories: row => row.hasDirectories,
        isSystem: row => row.isSystem,
    }, true).selected;
}
