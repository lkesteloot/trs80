import JSZip from "jszip";
import type {TrsdosFormatDos} from "trs80-base";
import {
    createCommandLine, createFloppy, type CreateFloppyRequest, type CreateFloppyResult, DiskSession,
} from "trs80-disk";
import {OpenDisk} from "./OpenDisk.js";
import {ensureSystemDiskFor, TEMPLATES} from "./Templates.js";

/**
 * A file that the user gave us, with its handle if the browser gave one (a drop on Chromium, or its file
 * picker), which lets us write the file back.
 */
export interface OpenInput {
    /** The file. */
    file: File;
    /** Its handle, or undefined if the browser gave none. */
    handle?: FileSystemFileHandle | undefined;
}

/**
 * A file that couldn't be opened as a disk, so that a page can offer to add it to a disk instead.
 */
export interface UnopenedFile {
    /** The file's name (for one inside a ZIP, the name inside it). */
    name: string;
    /** The file itself, with its contents, for adding to a disk. */
    file: File;
    /** Why it isn't a disk, in the engine's words. */
    message: string;
}

/**
 * What {@link openFiles} made of its inputs.
 */
export interface OpenResult {
    /** The disks that were opened, in order. Not yet in any store. */
    disks: OpenDisk[];
    /** The files that weren't disks. */
    unopened: UnopenedFile[];
}

/**
 * How deep archives are opened: a ZIP of GZ files of images is as far as we go.
 */
const MAX_ARCHIVE_DEPTH = 2;

/**
 * Whether the bytes start with the signature of a ZIP file.
 */
function hasZipSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Whether the bytes start with the signature of a gzip file.
 */
function hasGzipSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B;
}

/**
 * The part of a path after its last slash.
 */
function baseName(path: string): string {
    return path.substring(path.lastIndexOf("/") + 1);
}

/**
 * Whether the file is a ZIP, by its extension or by its signature.
 */
function isZip(name: string, bytes: Uint8Array): boolean {
    return name.toLowerCase().endsWith(".zip") || hasZipSignature(bytes);
}

/**
 * Whether the file is gzipped, by its extension or by its signature.
 */
function isGzip(name: string, bytes: Uint8Array): boolean {
    return name.toLowerCase().endsWith(".gz") || hasGzipSignature(bytes);
}

/**
 * Unzip gzip data.
 *
 * @param bytes the gzip file's contents.
 * @throws Error if they aren't gzip data.
 */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Open one file's bytes: a ZIP opens each file inside it, a gzip file is unzipped and its contents opened, and
 * anything else is tried as a disk image.
 *
 * @param name the file's name.
 * @param bytes its contents.
 * @param lastModified its modification time, for a file that goes in the unopened list.
 * @param handle its handle, if it's a plain file that we may write back to.
 * @param depth how many archives we're inside.
 * @param result where the results go.
 */
async function openBytes(name: string, bytes: Uint8Array, lastModified: number, handle: FileSystemFileHandle | undefined,
                         depth: number, result: OpenResult): Promise<void> {

    const unopened = (message: string): void => {
        result.unopened.push({
            name,
            file: new File([bytes as BlobPart], baseName(name), {lastModified}),
            message,
        });
    };

    if (depth < MAX_ARCHIVE_DEPTH && isZip(name, bytes)) {
        let zip: JSZip;
        try {
            zip = await JSZip.loadAsync(bytes);
        } catch (e: any) {
            unopened("Can't read the ZIP file: " + (e.message ?? String(e)));
            return;
        }

        for (const entry of Object.values(zip.files)) {
            if (entry.dir) {
                continue;
            }
            const entryBytes = await entry.async("uint8array");
            await openBytes(entry.name, entryBytes, entry.date.getTime(), undefined, depth + 1, result);
        }
        return;
    }

    if (depth < MAX_ARCHIVE_DEPTH && isGzip(name, bytes)) {
        let unzipped: Uint8Array;
        try {
            unzipped = await gunzip(bytes);
        } catch (e: any) {
            unopened("Can't unzip the file: " + (e.message ?? String(e)));
            return;
        }

        const lowerName = name.toLowerCase();
        const innerName = lowerName.endsWith(".gz") ? name.substring(0, name.length - 3) : name;
        // The handle is of the .gz file, so saving can't write through it.
        await openBytes(innerName, unzipped, lastModified, undefined, depth + 1, result);
        return;
    }

    const displayName = baseName(name);
    try {
        const session = DiskSession.fromBinary(displayName, bytes, {templates: TEMPLATES});
        result.disks.push(new OpenDisk(session, displayName, handle));
    } catch (e: any) {
        unopened(e.message ?? String(e));
    }
}

/**
 * Open files as disks. A ZIP opens each image inside it, a .gz file is unzipped (and its name loses the ".gz"),
 * and the rest are read as disk images. Files that can't be opened come back separately with the engine's
 * message, so that a page can offer to add them to a disk. A disk from a ZIP or a .gz file has no handle, so
 * saving it downloads.
 *
 * @param inputs the files, each with its handle if the browser gave one.
 */
export async function openFiles(inputs: readonly OpenInput[]): Promise<OpenResult> {
    const result: OpenResult = {disks: [], unopened: []};
    for (const input of inputs) {
        const bytes = new Uint8Array(await input.file.arrayBuffer());
        await openBytes(input.file.name, bytes, input.file.lastModified, input.handle, 0, result);
    }

    return result;
}

/**
 * Open files that the user chose with Chromium's showOpenFilePicker().
 *
 * @param handles the handles that the picker returned.
 */
export async function openFromHandles(handles: readonly FileSystemFileHandle[]): Promise<OpenResult> {
    const inputs: OpenInput[] = [];
    for (const handle of handles) {
        inputs.push({file: await handle.getFile(), handle});
    }

    return openFiles(inputs);
}

/**
 * The parts of the File System Access API that TypeScript's DOM types don't have yet.
 */
interface FileSystemAccessWindow {
    showOpenFilePicker?(options: {multiple: boolean}): Promise<FileSystemFileHandle[]>;
}

/**
 * Whether the browser has showOpenFilePicker() (Chromium does), so that opened files come with handles.
 */
export function supportsFilePicker(): boolean {
    return (window as unknown as FileSystemAccessWindow).showOpenFilePicker !== undefined;
}

/**
 * Let the user choose files with the browser's file picker, if it has one.
 *
 * @returns the handles chosen, or an empty array if the user cancelled or there's no picker.
 */
export async function pickFiles(): Promise<FileSystemFileHandle[]> {
    const picker = (window as unknown as FileSystemAccessWindow).showOpenFilePicker;
    if (picker === undefined) {
        return [];
    }

    try {
        return await picker.call(window, {multiple: true});
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return [];
        }
        throw e;
    }
}

/**
 * A drag item with the File System Access API's method for getting a handle.
 */
interface HandleDataTransferItem extends DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

/**
 * The files of a drop, each with its handle where the browser has one (Chromium's getAsFileSystemHandle()).
 * Folders are left out. Call this from the drop event's handler without waiting first, since the browser
 * clears the data after the handler returns.
 *
 * @param dataTransfer the drop event's data.
 */
export async function getDroppedInputs(dataTransfer: DataTransfer): Promise<OpenInput[]> {
    // Ask for everything now, since the items can't be used after an await.
    const pending: {file: File | null, handlePromise: Promise<FileSystemHandle | null> | undefined}[] = [];
    for (const item of Array.from(dataTransfer.items) as HandleDataTransferItem[]) {
        if (item.kind !== "file") {
            continue;
        }
        const handlePromise = item.getAsFileSystemHandle === undefined ? undefined : item.getAsFileSystemHandle();
        pending.push({file: item.getAsFile(), handlePromise});
    }
    if (pending.length === 0) {
        // Some browsers fill only the file list.
        for (const file of Array.from(dataTransfer.files)) {
            pending.push({file, handlePromise: undefined});
        }
    }

    const inputs: OpenInput[] = [];
    for (const {file, handlePromise} of pending) {
        let handle: FileSystemHandle | null = null;
        try {
            // Some drags (a script's DataTransfer, for one) resolve to undefined rather than null.
            handle = handlePromise === undefined ? null : (await handlePromise) ?? null;
        } catch {
            // Fall back to the plain file.
        }
        if (handle !== null && handle.kind === "directory") {
            continue;
        }

        let theFile = file;
        if (handle !== null && handle.kind === "file") {
            theFile = await (handle as FileSystemFileHandle).getFile();
        }
        if (theFile === null) {
            continue;
        }
        inputs.push({file: theFile, handle: handle === null ? undefined : handle as FileSystemFileHandle});
    }

    return inputs;
}

/**
 * What {@link newDisk} made.
 */
export interface NewDiskResult {
    /** The new disk, not yet in any store. Its changes are unsaved. */
    disk: OpenDisk;
    /** What the engine did. */
    result: CreateFloppyResult;
    /** The command line that the request equals. */
    commandLine: string;
}

/**
 * Make a new floppy: an empty session, with "create" run in it. If the request wants a system disk, it's fetched
 * first. The new disk isn't undoable (there's nothing before it to go back to), and counts as unsaved.
 *
 * @param request what to make.
 * @param name the disk's name, which must end in ".dmk", since that's what "create" makes.
 * @throws DiskError if the request doesn't make a disk.
 * @throws Error if a system disk can't be loaded.
 */
export async function newDisk(request: CreateFloppyRequest, name = "untitled.dmk"): Promise<NewDiskResult> {
    if (request.system) {
        const dos: TrsdosFormatDos = request.format.dos;
        await ensureSystemDiskFor(dos, request.format.model);
    }

    const session = DiskSession.fromBinary(name, undefined, {templates: TEMPLATES});
    const result = createFloppy(session, request);
    return {disk: new OpenDisk(session, name), result, commandLine: createCommandLine(request)};
}
