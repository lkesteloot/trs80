import {convertFloppy, floppyImageFormatExtension, floppyImageFormatOf, floppyImageFormatToString,
    type FloppyImageFormat} from "trs80-base";
import {DiskError} from "trs80-disk";
import type {DiskStore} from "./DiskStore.js";
import {type OpenDisk, SaveKind} from "./OpenDisk.js";

/**
 * A file handle with the permission methods, which TypeScript's DOM types don't have yet.
 */
interface PermissionHandle {
    queryPermission?(descriptor: {mode: "readwrite"}): Promise<PermissionState>;
    requestPermission?(descriptor: {mode: "readwrite"}): Promise<PermissionState>;
}

/**
 * Where "Save as" can write with a file picker, which only Chromium has.
 */
interface SavePickerWindow {
    showSaveFilePicker?(options: {
        suggestedName: string,
        types: {description: string, accept: Record<string, string[]>}[],
    }): Promise<FileSystemFileHandle>;
}

/**
 * What a save did.
 */
export interface SaveResult {
    /** How the bytes left: written through a handle, or downloaded. */
    kind: SaveKind;
    /** The name of the file written or downloaded. */
    name: string;
}

/**
 * What a "Save as" did.
 */
export interface SaveAsResult extends SaveResult {
    /**
     * Whether the open disk now saves to the new file. That's so when the disk's image format is unchanged. A
     * copy in another format is only written, since the session's own image keeps its format.
     */
    adopted: boolean;
}

/**
 * Download bytes as a file, by clicking a temporary link to a Blob URL.
 *
 * @param bytes the file's contents.
 * @param name the name to save it under.
 */
export function downloadBytes(bytes: Uint8Array, name: string): void {
    downloadBlob(new Blob([bytes as BlobPart], {type: "application/octet-stream"}), name);
}

/**
 * Download a Blob as a file, by clicking a temporary link to a Blob URL.
 *
 * @param blob the file's contents.
 * @param name the name to save it under.
 */
export function downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Let the browser start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Write bytes to a file through its handle, replacing its contents, after making sure we may write it.
 *
 * @param handle the handle.
 * @param bytes the new contents.
 * @throws DiskError if the user doesn't allow writing, or the write fails.
 */
async function writeThroughHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
    const permissionHandle = handle as FileSystemFileHandle & PermissionHandle;
    let permission: PermissionState = "granted";
    if (permissionHandle.queryPermission !== undefined) {
        permission = await permissionHandle.queryPermission({mode: "readwrite"});
        if (permission !== "granted" && permissionHandle.requestPermission !== undefined) {
            permission = await permissionHandle.requestPermission({mode: "readwrite"});
        }
    }
    if (permission !== "granted") {
        throw new DiskError("Can't save \"" + handle.name + "\": the browser didn't allow writing to it");
    }

    try {
        const writable = await handle.createWritable();
        await writable.write(bytes as BlobPart);
        await writable.close();
    } catch (e: any) {
        throw new DiskError("Can't save \"" + handle.name + "\": " + (e.message ?? String(e)));
    }
}

/**
 * Save an open disk: write its current image back through its handle if it has one, and otherwise download it.
 * The session is marked saved only after the bytes have really been written (or the download has been
 * started), which is why this doesn't use DiskSession.save().
 *
 * @param openDisk the disk.
 * @throws DiskError if the file can't be written.
 */
export async function saveDisk(openDisk: OpenDisk): Promise<SaveResult> {
    const session = openDisk.session;
    const bytes = session.image.binary;
    const handle = openDisk.handle;

    if (handle === undefined) {
        downloadBytes(bytes, openDisk.name);
    } else {
        await writeThroughHandle(handle, bytes);
    }
    session.markSaved();

    return {kind: openDisk.saveKind, name: openDisk.name};
}

/**
 * Replace a file name's extension.
 *
 * @param name the file name.
 * @param extension the new extension, with its dot.
 */
function replaceExtension(name: string, extension: string): string {
    const dot = name.lastIndexOf(".");
    return (dot > 0 ? name.substring(0, dot) : name) + extension;
}

/**
 * Save an open floppy under a new name, in the format given. On Chromium the user picks the file, and a copy
 * in the disk's own format becomes the disk's file from then on (so later saves go there). Elsewhere the file is
 * downloaded, and the disk's name and handle don't change. A copy in another format is a copy only: it's
 * written or downloaded, and the open disk stays as it was, since the session keeps its image's own format.
 *
 * @param openDisk the disk, which must be a floppy.
 * @param format the format to write.
 * @returns what was done, or undefined if the user cancelled the file picker.
 * @throws DiskError if the disk isn't a floppy, can't be converted, or can't be written.
 */
export async function saveDiskAs(openDisk: OpenDisk, format: FloppyImageFormat): Promise<SaveAsResult | undefined> {
    const session = openDisk.session;
    if (session.isHardDisk()) {
        throw new DiskError("A hard disk image can only be saved as it is");
    }

    const floppy = session.floppy;
    const sameFormat = floppyImageFormatOf(floppy) === format;
    let bytes = floppy.binary;
    if (!sameFormat) {
        const converted = convertFloppy(floppy, format);
        if (typeof converted === "string") {
            throw new DiskError(converted);
        }
        bytes = converted.binary;
    }
    const name = replaceExtension(openDisk.name, floppyImageFormatExtension(format));

    const picker = (window as unknown as SavePickerWindow).showSaveFilePicker;
    if (picker === undefined) {
        downloadBytes(bytes, name);
        if (sameFormat) {
            session.markSaved();
        }
        return {kind: SaveKind.DOWNLOAD, name, adopted: false};
    }

    let handle: FileSystemFileHandle;
    try {
        handle = await picker.call(window, {
            suggestedName: name,
            types: [{
                description: floppyImageFormatToString(format) + " disk image",
                accept: {"application/octet-stream": [floppyImageFormatExtension(format)]},
            }],
        });
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return undefined;
        }
        throw e;
    }

    await writeThroughHandle(handle, bytes);
    if (sameFormat) {
        session.markSaved();
        openDisk.setFile(handle.name, handle);
    }
    return {kind: SaveKind.WRITE_BACK, name: handle.name, adopted: sameFormat};
}

/**
 * Warn before the page is closed or reloaded while any open disk has unsaved changes.
 *
 * @param store the page's disks.
 * @returns a function that removes the warning.
 */
export function installUnsavedChangesWarning(store: DiskStore): () => void {
    const handler = (event: BeforeUnloadEvent): void => {
        const hasChanges = store.list().some(disk => disk.session.hasChanges());
        if (hasChanges) {
            // The browser shows its own text, whatever we say.
            event.preventDefault();
            event.returnValue = "";
        }
    };
    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
}
