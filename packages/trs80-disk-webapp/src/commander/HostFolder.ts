import {DiskError} from "trs80-disk";

// The folder on the user's computer that a panel can show: Chromium's File System Access API, with the chosen
// folder's handle remembered in IndexedDB so that the next visit can offer to reopen it.

/**
 * The parts of the File System Access API that TypeScript's DOM types don't have yet.
 */
interface DirectoryAccessWindow {
    showDirectoryPicker?(options: {mode: "readwrite"}): Promise<FileSystemDirectoryHandle>;
}

/**
 * A directory handle's iteration and permission methods, which TypeScript's DOM types don't have yet.
 */
interface DirectoryHandleExtras {
    entries(): AsyncIterable<[string, FileSystemHandle]>;
    queryPermission?(descriptor: {mode: "readwrite"}): Promise<PermissionState>;
    requestPermission?(descriptor: {mode: "readwrite"}): Promise<PermissionState>;
}

/**
 * One entry of a folder listing.
 */
export interface HostEntry {
    /** The entry's name. */
    name: string;
    /** Whether it's a subfolder. */
    isFolder: boolean;
    /** The file's size in bytes, or 0 for a folder. */
    size: number;
    /** When the file was last modified, or undefined for a folder. */
    date: Date | undefined;
    /** The file itself, which is a snapshot taken when the folder was listed. Undefined for a folder. */
    file: File | undefined;
    /** The entry's handle. */
    handle: FileSystemFileHandle | FileSystemDirectoryHandle;
}

/** The name of the IndexedDB database that remembers the folder. */
const DATABASE_NAME = "disk-commander";
/** The name of its one object store. */
const STORE_NAME = "handles";
/** The key of the remembered folder in the store. */
const FOLDER_KEY = "folder";

/**
 * Whether the browser has showDirectoryPicker() (Chromium does).
 */
export function supportsDirectoryPicker(): boolean {
    return (window as unknown as DirectoryAccessWindow).showDirectoryPicker !== undefined;
}

/**
 * Let the user choose a folder, with write access.
 *
 * @returns the folder, or undefined if the user cancelled or the browser has no folder picker.
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | undefined> {
    const picker = (window as unknown as DirectoryAccessWindow).showDirectoryPicker;
    if (picker === undefined) {
        return undefined;
    }

    try {
        return await picker.call(window, {mode: "readwrite"});
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return undefined;
        }
        throw e;
    }
}

/**
 * Open the IndexedDB database that holds the remembered folder.
 */
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Run one request on the object store and wait for its answer.
 *
 * @param mode whether the transaction writes.
 * @param makeRequest starts the request on the store.
 */
async function withStore<T>(mode: IDBTransactionMode, makeRequest: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await openDatabase();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = makeRequest(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        database.close();
    }
}

/**
 * Remember a folder for the next visit. IndexedDB may be blocked (a private window, for one), in which case this
 * does nothing, and the page works without it.
 *
 * @param handle the folder.
 */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    try {
        await withStore("readwrite", store => store.put(handle, FOLDER_KEY));
    } catch (e) {
        console.warn("Can't remember the folder:", e);
    }
}

/**
 * The folder that an earlier visit remembered.
 *
 * @returns the folder, or undefined if there's none or IndexedDB isn't available.
 */
export async function recallFolder(): Promise<FileSystemDirectoryHandle | undefined> {
    try {
        const handle = await withStore("readonly", store => store.get(FOLDER_KEY));
        return handle?.kind === "directory" ? handle as FileSystemDirectoryHandle : undefined;
    } catch (e) {
        return undefined;
    }
}

/**
 * Make sure we may read and write a folder, asking the user if we haven't been allowed yet. Asking needs a
 * click or a key press, so call this from an event handler, before any await that comes before it.
 *
 * @param handle the folder.
 * @returns whether we may.
 */
export async function ensureFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const extras = handle as unknown as DirectoryHandleExtras;
    if (extras.queryPermission === undefined) {
        return true;
    }

    try {
        let permission = await extras.queryPermission({mode: "readwrite"});
        if (permission !== "granted" && extras.requestPermission !== undefined) {
            permission = await extras.requestPermission({mode: "readwrite"});
        }
        return permission === "granted";
    } catch (e) {
        return false;
    }
}

/**
 * List a folder: the subfolders first, then the files, each in alphabetical order ignoring case.
 *
 * @param folder the folder.
 * @throws DiskError if the folder can't be read.
 */
export async function listFolder(folder: FileSystemDirectoryHandle): Promise<HostEntry[]> {
    const entries: HostEntry[] = [];
    try {
        for await (const [name, handle] of (folder as unknown as DirectoryHandleExtras).entries()) {
            if (handle.kind === "directory") {
                entries.push({name, isFolder: true, size: 0, date: undefined, file: undefined,
                    handle: handle as FileSystemDirectoryHandle});
            } else {
                const file = await (handle as FileSystemFileHandle).getFile();
                entries.push({name, isFolder: false, size: file.size, date: new Date(file.lastModified), file,
                    handle: handle as FileSystemFileHandle});
            }
        }
    } catch (e: any) {
        throw new DiskError("Can't read the folder \"" + folder.name + "\": " + (e.message ?? String(e)));
    }

    entries.sort((a, b) => {
        if (a.isFolder !== b.isFolder) {
            return a.isFolder ? -1 : 1;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return entries;
}

/**
 * The extensions of files that Enter opens as disk images (or archives of them).
 */
const DISK_IMAGE_EXTENSIONS = ["dmk", "dsk", "jv1", "jv3", "hfe", "imd", "scp", "hdv", "img", "zip", "gz"];

/**
 * Whether a host file's name says it's probably a disk image, which Enter opens like a folder.
 *
 * @param name the file's name.
 */
export function looksLikeDiskImage(name: string): boolean {
    const dot = name.lastIndexOf(".");
    return dot > 0 && DISK_IMAGE_EXTENSIONS.includes(name.substring(dot + 1).toLowerCase());
}
