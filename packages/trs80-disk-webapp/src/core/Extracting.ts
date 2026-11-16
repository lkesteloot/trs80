import JSZip from "jszip";
import {DiskError, extractCommandLine} from "trs80-disk";
import type {FileRow} from "./FileRows.js";
import {downloadBlob, downloadBytes} from "./Saving.js";
import {makeZip} from "./Zip.js";

/**
 * How extracted files are named. These are the options of the "extract" command that apply to a page.
 */
export interface ExtractOptions {
    /** Whether to write lowercase names, as in "foo.cmd" for "FOO.CMD" (--lowercase). */
    lowercase?: boolean | undefined;
    /** Whether to add " [DAMAGED]" to the name of a file that had damage (--mark-damaged). */
    markDamaged?: boolean | undefined;
}

/**
 * One file ready to be written: its bytes and the path it gets.
 */
export interface ExtractedFile {
    /** The file's row. */
    row: FileRow;
    /** The path's components, such as ["usr", "bin", "vi"]; a single one except on Xenix tar disks. */
    path: string[];
    /** The bytes to write. */
    bytes: Uint8Array;
    /** The file's date on the disk, or undefined. */
    date: Date | undefined;
}

/**
 * What an extraction did.
 */
export interface ExtractResult {
    /** The command line that the extraction equals. */
    commandLine: string;
    /** The paths written, joined with "/". */
    written: string[];
    /** The files that were skipped, with the reason. */
    skipped: {path: string, reason: string}[];
}

/** Added to the name of a file that had damage, if the user asked for that. Same as trs80-tool's. */
const DAMAGED_SUFFIX = " [DAMAGED]";

/**
 * Make a name that's safe to create in its folder. Names come from a disk image, which can hold anything, so the
 * characters that would let a name leave its folder (path separators, and the colon, which starts a drive on
 * Windows) are replaced, and a name that's empty or only dots (such as "..") isn't allowed.
 *
 * @param name one component of a name.
 */
function safeOutputName(name: string): string {
    return name.replace(/[\/\\:\0]/g, "_").replace(/^\.*$/, "_");
}

/**
 * The components of the path that "extract" creates for a file, before it's made unique. On a file system with
 * directories (Xenix tar) a "/" in the name separates them, and empty components are dropped. Elsewhere the
 * whole name is one component.
 *
 * @param row the file.
 * @param options how to name it.
 */
function outputPathComponents(row: FileRow, options: ExtractOptions): string[] {
    const filename = options.lowercase === true ? row.hostName.toLowerCase() : row.hostName;
    let components: string[];
    if (row.hasDirectories) {
        components = filename.split("/").filter(component => component !== "").map(safeOutputName);
        if (components.length === 0) {
            components = ["_"];
        }
    } else {
        components = [safeOutputName(filename)];
    }

    if (row.damage !== undefined && options.markDamaged === true) {
        components[components.length - 1] += DAMAGED_SUFFIX;
    }
    return components;
}

/**
 * Give the path a name that no earlier file of this extraction has. Names are compared ignoring case, as macOS
 * and Windows do: a disk can have both "PRINTER" and "Printer", and lowercase makes "FOO" and "foo" the
 * same. The first file keeps its name, and later ones get " (2)", " (3)", and so on.
 *
 * @param components the path's components, whose last one may be changed.
 * @param usedPaths the paths so far, joined with "/" and in lower case, which this adds to.
 */
function makeUniquePath(components: string[], usedPaths: Set<string>): void {
    const last = components.length - 1;
    const name = components[last];
    for (let copy = 2; usedPaths.has(components.join("/").toLowerCase()); copy++) {
        components[last] = name + " (" + copy + ")";
    }
    usedPaths.add(components.join("/").toLowerCase());
}

/**
 * Get ready to write files: name each, as trs80-tool's "extract" does (a lowercase option, a " [DAMAGED]"
 * mark, unsafe characters replaced, and " (2)" for a name that clashes), and take its bytes (UCSD Pascal
 * text as host text).
 *
 * @param rows the files to extract, in order.
 * @param options how to name them.
 */
export function planExtraction(rows: readonly FileRow[], options: ExtractOptions = {}): ExtractedFile[] {
    const usedPaths = new Set<string>();

    return rows.map(row => {
        const path = outputPathComponents(row, options);
        makeUniquePath(path, usedPaths);
        return {row, path, bytes: row.extractBytes, date: row.date};
    });
}

/**
 * The command line of an extraction.
 *
 * @param rows the files.
 * @param options how they're named.
 * @param outDir the folder they go to, or undefined for the current one.
 * @param as the exact host name for a single file, or undefined.
 */
function makeCommandLine(rows: readonly FileRow[], options: ExtractOptions, outDir?: string, as?: string): string {
    return extractCommandLine(rows.map(row => row.fullName), {
        outDir,
        as,
        lowercase: options.lowercase === true ? true : undefined,
        markDamaged: options.markDamaged === true ? true : undefined,
    });
}

/**
 * Download one file, named as extracting would name it (the last component, on a disk with directories).
 *
 * @param row the file.
 * @param options how to name it.
 * @returns the command line that this equals.
 */
export function downloadFile(row: FileRow, options: ExtractOptions = {}): ExtractResult {
    const [file] = planExtraction([row], options);
    const name = file.path[file.path.length - 1];
    downloadBytes(file.bytes, name);

    return {commandLine: makeCommandLine([row], options), written: [file.path.join("/")], skipped: []};
}

/**
 * Download several files as a ZIP, each with its date on the disk.
 *
 * @param rows the files.
 * @param zipName the name of the ZIP file, such as "mydisk.zip".
 * @param options how to name the files.
 * @returns the command line that this equals.
 */
export async function downloadZip(rows: readonly FileRow[], zipName: string,
                                  options: ExtractOptions = {}): Promise<ExtractResult> {

    const zip = new JSZip();
    const files = planExtraction(rows, options);
    for (const file of files) {
        // Some file systems don't record dates.
        const zipOptions = file.date === undefined ? {} : {date: file.date};
        zip.file(file.path.join("/"), file.bytes, zipOptions);
    }

    const blob = await zip.generateAsync({type: "blob"});
    downloadBlob(blob, zipName);

    return {commandLine: makeCommandLine(rows, options), written: files.map(file => file.path.join("/")), skipped: []};
}

/** How long a dragged file's URL stays valid, which must cover the drop and the browser's fetch of it. */
const DRAG_URL_LIFETIME_MS = 60_000;

/**
 * Whether the browser lets files be dragged out of the page, which only Chromium's browsers do. They're also the only
 * ones with navigator.userAgentData, which names the engine.
 */
export function canDragFilesOut(): boolean {
    const data = (navigator as {userAgentData?: {brands: readonly {brand: string}[]}}).userAgentData;
    return data?.brands.some(brand => brand.brand === "Chromium") ?? false;
}

/**
 * Let files be dragged out of the page to the desktop or a folder, as Chromium allows with its "DownloadURL" drag
 * data: one file as itself, named as extracting would name it, or several as one ZIP, since a drag can carry only
 * one. Call it from the dragstart handler, which this must finish in, so the ZIP is made synchronously. Other
 * browsers ignore the data.
 *
 * @param dataTransfer the drag's data.
 * @param rows the files.
 * @param zipName the name of the ZIP for several files, such as "mydisk.zip".
 * @param options how to name the files.
 */
export function putFilesOnDrag(dataTransfer: DataTransfer, rows: readonly FileRow[], zipName: string,
                               options: ExtractOptions = {}): void {

    const files = planExtraction(rows, options);
    let bytes: Uint8Array;
    let name: string;
    let type: string;
    if (files.length === 1) {
        bytes = files[0].bytes;
        name = files[0].path[files[0].path.length - 1];
        type = "application/octet-stream";
    } else {
        bytes = makeZip(files.map(file => ({path: file.path.join("/"), bytes: file.bytes, date: file.date})));
        name = zipName;
        type = "application/zip";
    }

    const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type}));
    // The value is "type:name:url", so the name can't have a colon.
    dataTransfer.setData("DownloadURL", type + ":" + name.replace(/:/g, "_") + ":" + url);
    setTimeout(() => URL.revokeObjectURL(url), DRAG_URL_LIFETIME_MS);
}

/**
 * The name of the ZIP that a disk's files are put in: the disk's name with ".zip" for its extension.
 *
 * @param diskName the disk's name, such as "games.dmk".
 */
export function zipNameForDisk(diskName: string): string {
    return diskName.replace(/\.[^.]*$/, "") + ".zip";
}

/**
 * Whether a file-system error is the one for a file in the way of a folder or a folder in the way of a file.
 */
function isPathClash(error: unknown): boolean {
    const name = (error as {name?: string} | undefined)?.name;
    return name === "TypeMismatchError" || name === "InvalidModificationError" || name === "NotFoundError";
}

/**
 * Write files into a folder that the user chose with Chromium's showDirectoryPicker(), creating subfolders
 * as needed and replacing files of the same name. A file that can't be written because a file and a folder
 * would have the same name is skipped, with a reason, rather than stopping the rest.
 *
 * @param dirHandle the folder.
 * @param rows the files.
 * @param options how to name them.
 * @returns what was written, and the command line that this equals (with the folder's name as its output folder).
 * @throws DiskError if the folder can't be written to.
 */
export async function extractToFolder(dirHandle: FileSystemDirectoryHandle, rows: readonly FileRow[],
                                      options: ExtractOptions = {}): Promise<ExtractResult> {

    const written: string[] = [];
    const skipped: {path: string, reason: string}[] = [];
    for (const file of planExtraction(rows, options)) {
        const pathText = file.path.join("/");
        try {
            let folder = dirHandle;
            for (const component of file.path.slice(0, -1)) {
                folder = await folder.getDirectoryHandle(component, {create: true});
            }
            const fileHandle = await folder.getFileHandle(file.path[file.path.length - 1], {create: true});
            const writable = await fileHandle.createWritable();
            await writable.write(file.bytes as BlobPart);
            await writable.close();
            written.push(pathText);
        } catch (e: any) {
            if (isPathClash(e)) {
                skipped.push({path: pathText, reason: "a file and a folder have the same name"});
            } else {
                throw new DiskError("Can't write \"" + pathText + "\" to \"" + dirHandle.name + "\": " +
                    (e.message ?? String(e)));
            }
        }
    }

    return {commandLine: makeCommandLine(rows, options, dirHandle.name), written, skipped};
}
