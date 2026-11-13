// Dev-only test page for the file previews. Choose a disk image (or give ?disk=URL, to fetch one), pick a
// file, and see it in each view that it supports. Not part of the build.

import {BasicDialect, Trsdos, decodeTrs80File, guessBasicDialect, trsdosBasicDialect} from "trs80-base";
import type {FloppyDirEntry, KnownFloppyFileSystem} from "trs80-base";
import {DiskSession} from "trs80-disk";
import {PreviewKind, availablePreviews, previewKindToString, renderPreview} from "../src/core/preview/Previews.js";
import type {PreviewFile} from "../src/core/preview/Previews.js";
import "../src/core/preview/preview.css";

const statusElement = document.getElementById("status") as HTMLElement;
const filesElement = document.getElementById("files") as HTMLElement;
const tabsElement = document.getElementById("tabs") as HTMLElement;
const previewElement = document.getElementById("preview") as HTMLElement;
const dialectElement = document.getElementById("dialect") as HTMLSelectElement;

let session: DiskSession | undefined = undefined;
let currentFile: PreviewFile | undefined = undefined;
let currentKind: PreviewKind | undefined = undefined;

/**
 * Show the current file in the current view.
 */
function showPreview(): void {
    previewElement.replaceChildren();
    tabsElement.replaceChildren();
    if (currentFile === undefined) {
        return;
    }

    const kinds = availablePreviews(currentFile.trs80File, currentFile.binary);
    if (currentKind === undefined || !kinds.includes(currentKind)) {
        currentKind = kinds[0];
    }
    for (const kind of kinds) {
        const button = document.createElement("button");
        button.textContent = previewKindToString(kind);
        button.classList.toggle("selected", kind === currentKind);
        button.addEventListener("click", () => {
            currentKind = kind;
            showPreview();
        });
        tabsElement.append(button);
    }

    const dialect = dialectElement.value === "3" ? BasicDialect.MODEL_III :
        dialectElement.value === "4" ? BasicDialect.MODEL_4 : undefined;
    const info = document.createElement("span");
    info.id = "info";
    info.textContent = currentFile.trs80File.getDescription() + ", " + currentFile.binary.length + " bytes";
    tabsElement.append(info);

    const start = performance.now();
    previewElement.append(renderPreview(currentKind as PreviewKind, currentFile, {basicDialect: dialect}));
    info.textContent += ", rendered in " + Math.round(performance.now() - start) + " ms";
}

/**
 * Read a file out of a file system and decode it the way the tool does.
 */
function loadFile(fileSystem: KnownFloppyFileSystem, entry: FloppyDirEntry): PreviewFile {
    const name = entry.getFilename(".");
    // The file system types share this method but TypeScript can't see through the union.
    const binary = (fileSystem as {readFile(e: FloppyDirEntry): Uint8Array}).readFile(entry);
    const fallback = session !== undefined ? session.getBasicDialect() : BasicDialect.MODEL_III;
    const dialect = guessBasicDialect(binary) ??
        (fileSystem instanceof Trsdos ? trsdosBasicDialect(fileSystem) : fallback);
    return {name, binary, trs80File: decodeTrs80File(binary, {filename: name, basicDialect: dialect})};
}

/**
 * List the files of a newly opened disk.
 */
function listFiles(): void {
    filesElement.replaceChildren();
    currentFile = undefined;
    showPreview();
    const fileSystem = session?.fileSystem;
    if (fileSystem === undefined) {
        statusElement.textContent = "No file system found";
        return;
    }
    const entries = (fileSystem as {getDirEntries(s: boolean): FloppyDirEntry[]}).getDirEntries(true);
    statusElement.textContent = fileSystem.nameAndVersion + ", " + entries.length + " files";
    for (const entry of entries) {
        const li = document.createElement("li");
        li.textContent = entry.getFilename(".");
        li.addEventListener("click", () => {
            filesElement.querySelector(".selected")?.classList.remove("selected");
            li.classList.add("selected");
            try {
                currentFile = loadFile(fileSystem, entry);
                showPreview();
            } catch (e) {
                console.error(e);
                statusElement.textContent = "Error: " + e;
            }
        });
        filesElement.append(li);
    }
}

/**
 * Open a disk image from its bytes.
 */
function openDisk(name: string, binary: Uint8Array): void {
    try {
        session = DiskSession.fromBinary(name, binary);
        listFiles();
    } catch (e) {
        console.error(e);
        statusElement.textContent = "Error: " + e;
    }
}

(document.getElementById("disk-input") as HTMLInputElement).addEventListener("change", async event => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file !== undefined) {
        openDisk(file.name, new Uint8Array(await file.arrayBuffer()));
    }
});
dialectElement.addEventListener("change", showPreview);

// Dev-only shortcut: ?disk=URL fetches an image, and ?file=NAME selects a file in it, so that the page can be
// driven without a file chooser.
const params = new URLSearchParams(location.search);
const diskUrl = params.get("disk");
if (diskUrl !== null) {
    fetch(diskUrl).then(response => response.arrayBuffer()).then(buffer => {
        openDisk(diskUrl.substring(diskUrl.lastIndexOf("/") + 1), new Uint8Array(buffer));
        const fileName = params.get("file");
        if (fileName !== null) {
            const kind = params.get("kind");
            if (kind !== null) {
                currentKind = parseInt(kind, 10) as PreviewKind;
            }
            for (const li of Array.from(filesElement.children) as HTMLElement[]) {
                if (li.textContent === fileName) {
                    li.click();
                }
            }
        }
    }).catch(e => statusElement.textContent = "Error: " + e);
}
