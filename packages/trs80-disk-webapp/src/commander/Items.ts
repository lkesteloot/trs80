import {TrsdosProtectionLevel} from "trs80-base";
import {assertNever} from "z80-base";
import type {FileRow} from "../core/FileRows.js";
import type {HostEntry} from "./HostFolder.js";

// What a panel lists: the rows of a disk, the entries of a folder, or the partitions of a hard disk, each as an
// item with a key that keeps its mark when the listing is rebuilt.

/**
 * The kinds of item a panel lists.
 */
export enum ItemKind {
    /** The first row of a folder below the chosen one, or of a disk: it goes back out. */
    UP,
    /** A subfolder of the folder on the user's computer. */
    FOLDER,
    /** A file on the user's computer, or in "Your files". */
    HOST_FILE,
    /** A file on a disk. */
    DISK_FILE,
    /** A partition of a hard disk image. */
    PARTITION,
}

/**
 * The first row, which goes back out.
 */
export interface UpItem {
    kind: ItemKind.UP;
    /** The key, which no other item has. */
    key: string;
    /** What the row says: "..". */
    name: string;
}

/**
 * A subfolder.
 */
export interface FolderItem {
    kind: ItemKind.FOLDER;
    key: string;
    /** The folder's name. */
    name: string;
    /** The folder. */
    handle: FileSystemDirectoryHandle;
}

/**
 * A file on the user's computer.
 */
export interface HostFileItem {
    kind: ItemKind.HOST_FILE;
    key: string;
    /** The file's name. */
    name: string;
    /** Its size in bytes. */
    size: number;
    /** When it was last modified. */
    date: Date | undefined;
    /** The file, as it was when the folder was listed. */
    file: File;
    /** Its handle, which lets a disk image opened from it be saved back, or undefined for a file in "Your files". */
    handle: FileSystemFileHandle | undefined;
}

/**
 * A file on a disk.
 */
export interface DiskFileItem {
    kind: ItemKind.DISK_FILE;
    key: string;
    /** The file's row. */
    row: FileRow;
}

/**
 * One partition of a hard disk image.
 */
export interface PartitionItem {
    kind: ItemKind.PARTITION;
    key: string;
    /** The partition's number, from 1. */
    number: number;
    /** Its name, such as "Partition 1". */
    name: string;
    /** What's in it: the DOS and the number of files. */
    description: string;
    /** Where it is on the image, such as "cylinders 0-169, heads 0-7". */
    location: string;
    /** Why it can't be written, or undefined if it can. */
    readOnlyReason: string | undefined;
}

/**
 * One row of a panel.
 */
export type Item = UpItem | FolderItem | HostFileItem | DiskFileItem | PartitionItem;

/**
 * The key of the item that goes back out.
 */
export const UP_KEY = "..";

/**
 * The item that goes back out of a folder or a disk.
 *
 * @param name what it says.
 */
export function makeUpItem(name: string): UpItem {
    return {kind: ItemKind.UP, key: UP_KEY, name};
}

/**
 * The items for a folder's entries.
 *
 * @param entries the entries from {@link listFolder}.
 */
export function folderItems(entries: readonly HostEntry[]): Item[] {
    const items: Item[] = [];
    for (const entry of entries) {
        if (entry.isFolder) {
            items.push({kind: ItemKind.FOLDER, key: "d:" + entry.name, name: entry.name,
                handle: entry.handle as FileSystemDirectoryHandle});
        } else if (entry.file !== undefined) {
            items.push({kind: ItemKind.HOST_FILE, key: "f:" + entry.name, name: entry.name, size: entry.size,
                date: entry.date, file: entry.file, handle: entry.handle as FileSystemFileHandle});
        }
    }
    return items;
}

/**
 * The items for the files in "Your files", in alphabetical order.
 *
 * @param files the files, by name.
 */
export function yourFilesItems(files: ReadonlyMap<string, File>): Item[] {
    return [...files.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(file => ({
        kind: ItemKind.HOST_FILE as const,
        key: "f:" + file.name,
        name: file.name,
        size: file.size,
        date: new Date(file.lastModified),
        file,
        handle: undefined,
    }));
}

/**
 * The items for the files of a ZIP that the panel shows as a folder, after the item that goes back out.
 *
 * @param files the files, by their path in the ZIP.
 */
export function archiveItems(files: ReadonlyMap<string, File>): Item[] {
    const items: Item[] = [...files.entries()].sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
        .map(([path, file]) => ({
            kind: ItemKind.HOST_FILE as const,
            key: "f:" + path,
            name: path,
            size: file.size,
            date: file.lastModified > 0 ? new Date(file.lastModified) : undefined,
            file,
            handle: undefined,
        }));
    return [makeUpItem(".."), ...items];
}

/**
 * The items for a disk's file rows, after the item that goes back out.
 *
 * @param rows the rows.
 */
export function diskItems(rows: readonly FileRow[]): Item[] {
    return [makeUpItem(".."), ...rows.map(row => ({kind: ItemKind.DISK_FILE as const, key: "r:" + row.fullName, row}))];
}

/**
 * The name that an item shows, for the message area.
 *
 * @param item the item.
 */
export function itemName(item: Item): string {
    switch (item.kind) {
        case ItemKind.UP:
            return item.name;
        case ItemKind.FOLDER:
        case ItemKind.HOST_FILE:
        case ItemKind.PARTITION:
            return item.name;
        case ItemKind.DISK_FILE:
            return item.row.fullName;
        default:
            assertNever(item);
    }
}

/**
 * Whether an item can be marked. The row that goes back out, and the folders, can't.
 *
 * @param item the item.
 */
export function isMarkable(item: Item): boolean {
    switch (item.kind) {
        case ItemKind.UP:
        case ItemKind.FOLDER:
        case ItemKind.PARTITION:
            return false;
        case ItemKind.HOST_FILE:
        case ItemKind.DISK_FILE:
            return true;
        default:
            assertNever(item);
    }
}

/**
 * The attributes that a disk file has, in the words that the listing and its tooltip use: "sys" (system file),
 * "hid" (hidden, which TRSDOS calls invisible) and "pw" (has passwords).
 *
 * @param row the file.
 */
function attributeWords(row: FileRow): {short: string, long: string}[] {
    const attributes = row.attributes;
    const system = attributes === undefined ? row.isSystem : attributes.system;
    const hidden = attributes === undefined ? row.isHidden : attributes.invisible;
    const passwords = attributes !== undefined && attributes.hasPasswords;

    const words: {short: string, long: string}[] = [];
    if (system) {
        words.push({short: "sys", long: "System file"});
    }
    if (hidden) {
        words.push({short: "hid", long: "hidden"});
    }
    if (passwords) {
        words.push({short: "pw", long: "password-protected"});
    }
    if (attributes !== undefined && attributes.protectionLevel !== TrsdosProtectionLevel.FULL) {
        words.push({short: attributes.protection, long: "protection level " + attributes.protection});
    }
    return words;
}

/**
 * A disk file's attributes as the listing shows them: "sys" for a system file, "hid" for a hidden (invisible) one,
 * and "pw" if it has passwords, separated by spaces, then the protection level's name if the file isn't fully
 * accessible. Empty for a plain file.
 *
 * @param row the file.
 */
export function attributeText(row: FileRow): string {
    return attributeWords(row).map(word => word.short).join(" ");
}

/**
 * The tooltip for a disk file's attributes, which spells them out, such as "System file, hidden,
 * password-protected". Empty for a plain file.
 *
 * @param row the file.
 */
export function attributeTitle(row: FileRow): string {
    const text = attributeWords(row).map(word => word.long).join(", ");
    return text === "" ? "" : text.charAt(0).toUpperCase() + text.substring(1);
}

/**
 * Turn a wildcard pattern into a test of names, the way the "dir" command reads patterns: "*" matches any run of
 * characters, "?" one character, case doesn't matter, and a "/" in the pattern stands for the ".".
 *
 * @param pattern the pattern. Several patterns separated by spaces match a name that any of them matches.
 * @returns a function that says whether a name matches.
 */
export function wildcardTest(pattern: string): (name: string) => boolean {
    const regularExpressions = pattern.split(/\s+/).filter(word => word !== "").map(word => {
        const escaped = word.replace(/[\^$+()[\]{}|\\.]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".").replace(/\//g, "\\.");
        return new RegExp("^" + escaped + "$", "i");
    });
    return name => regularExpressions.some(regularExpression => regularExpression.test(name));
}

/**
 * The columns that a panel's listing can be sorted by.
 */
export enum SortColumn {
    /** The file's name. */
    NAME,
    /** A disk file's extension. */
    EXTENSION,
    /** The size in bytes. */
    SIZE,
    /** The date. */
    DATE,
    /** A disk file's attributes. */
    ATTRIBUTES,
}

/**
 * The name of a sort column as its header shows it, which is also what the header's tooltip says.
 *
 * @param column the column.
 */
export function sortColumnToString(column: SortColumn): string {
    switch (column) {
        case SortColumn.NAME:
            return "Name";
        case SortColumn.EXTENSION:
            return "Ext";
        case SortColumn.SIZE:
            return "Size";
        case SortColumn.DATE:
            return "Date";
        case SortColumn.ATTRIBUTES:
            return "Attr";
        default:
            assertNever(column);
    }
}

/**
 * How a panel's listing is sorted.
 */
export interface SortState {
    /** The column that the rows are ordered by. */
    column: SortColumn;
    /** Whether the order is descending rather than ascending. */
    descending: boolean;
}

/**
 * The sort that a click on a column's header leads to: the first click sorts ascending, another click on the same
 * column toggles the direction, and a click on another column sorts that one ascending.
 *
 * @param current the current sort, or undefined if the listing is in its original order.
 * @param column the column that was clicked.
 */
export function nextSort(current: SortState | undefined, column: SortColumn): SortState {
    if (current !== undefined && current.column === column) {
        return {column, descending: !current.descending};
    }
    return {column, descending: false};
}

/**
 * Compare two names the way the listing sorts them: ignoring case.
 */
function compareText(a: string, b: string): number {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    return lowerA < lowerB ? -1 : lowerA > lowerB ? 1 : 0;
}

/**
 * Compare two numbers, where undefined (a missing value) is always last, whichever the direction.
 *
 * @param a the first value.
 * @param b the second value.
 * @param descending whether the order is descending.
 */
function compareNumbers(a: number | undefined, b: number | undefined, descending: boolean): number {
    if (a === undefined || b === undefined) {
        return a === b ? 0 : a === undefined ? 1 : -1;
    }
    return descending ? b - a : a - b;
}

/**
 * Compare two items of the same group by a column, in the given direction. Items that the column doesn't apply to
 * compare equal.
 */
function compareByColumn(a: Item, b: Item, sort: SortState): number {
    const sign = sort.descending ? -1 : 1;
    if (a.kind === ItemKind.DISK_FILE && b.kind === ItemKind.DISK_FILE) {
        switch (sort.column) {
            case SortColumn.NAME:
                return sign*(compareText(a.row.name, b.row.name) || compareText(a.row.extension, b.row.extension));
            case SortColumn.EXTENSION:
                return sign*compareText(a.row.extension, b.row.extension);
            case SortColumn.SIZE:
                return compareNumbers(a.row.size, b.row.size, sort.descending);
            case SortColumn.DATE:
                return compareNumbers(a.row.date?.getTime(), b.row.date?.getTime(), sort.descending);
            case SortColumn.ATTRIBUTES:
                return sign*compareText(attributeText(a.row), attributeText(b.row));
            default:
                assertNever(sort.column);
        }
    }
    if (a.kind === ItemKind.HOST_FILE && b.kind === ItemKind.HOST_FILE) {
        switch (sort.column) {
            case SortColumn.NAME:
                return sign*compareText(a.name, b.name);
            case SortColumn.SIZE:
                return compareNumbers(a.size, b.size, sort.descending);
            case SortColumn.DATE:
                return compareNumbers(a.date?.getTime(), b.date?.getTime(), sort.descending);
            case SortColumn.EXTENSION:
            case SortColumn.ATTRIBUTES:
                return 0;
            default:
                assertNever(sort.column);
        }
    }
    if (a.kind === ItemKind.FOLDER && b.kind === ItemKind.FOLDER && sort.column === SortColumn.NAME) {
        return sign*compareText(a.name, b.name);
    }
    return 0;
}

/**
 * Which group an item sorts in: the row that goes back out first, then folders, then everything else. Sorting
 * never mixes groups.
 */
function sortGroup(item: Item): number {
    switch (item.kind) {
        case ItemKind.UP:
            return 0;
        case ItemKind.FOLDER:
            return 1;
        case ItemKind.HOST_FILE:
        case ItemKind.DISK_FILE:
        case ItemKind.PARTITION:
            return 2;
        default:
            assertNever(item);
    }
}

/**
 * Sort a panel's items by a column. The ".." row stays first and folders stay before files, each group sorted
 * within itself; names compare ignoring case, sizes and dates numerically, and items with no date go last in either
 * direction. Items that tie keep their original order.
 *
 * @param items the items, in their original order.
 * @param sort how to sort them.
 * @returns a new array.
 */
export function sortItems(items: readonly Item[], sort: SortState): Item[] {
    return [...items].sort((a, b) => sortGroup(a) - sortGroup(b) || compareByColumn(a, b, sort));
}
