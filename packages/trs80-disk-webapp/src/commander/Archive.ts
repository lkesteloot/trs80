import JSZip from "jszip";

// ZIP files that held several files, which a panel shows as a folder named after the ZIP.

/**
 * What a ZIP held.
 */
export interface ArchiveListing {
    /** The ZIP's file name. */
    name: string;
    /** The files in it, by their paths in the ZIP, each with its date. */
    files: Map<string, File>;
}

/**
 * Whether the file is a ZIP, by its extension or by its first bytes.
 *
 * @param file the file.
 */
async function looksLikeZip(file: File): Promise<boolean> {
    if (file.name.toLowerCase().endsWith(".zip")) {
        return true;
    }

    const start = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return start.length === 4 && start[0] === 0x50 && start[1] === 0x4B && start[2] === 0x03 && start[3] === 0x04;
}

/**
 * Read a ZIP to show as a folder. A ZIP that holds one file or none, or that can't be read, isn't an archive
 * in this sense: opening it as a file works as it always did, and says what's wrong with it.
 *
 * @param file the file.
 * @returns the listing, or undefined if the file isn't a ZIP of at least two files.
 */
export async function readArchive(file: File): Promise<ArchiveListing | undefined> {
    try {
        const isZip = await looksLikeZip(file);
        if (!isZip) {
            return undefined;
        }

        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const files = new Map<string, File>();
        for (const entry of Object.values(zip.files)) {
            // Folders aren't listed, and neither is the resource-fork litter that a Mac adds.
            if (entry.dir || entry.name.startsWith("__MACOSX/")) {
                continue;
            }
            const bytes = await entry.async("uint8array");
            const baseName = entry.name.substring(entry.name.lastIndexOf("/") + 1);
            files.set(entry.name, new File([bytes as BlobPart], baseName, {lastModified: entry.date.getTime()}));
        }
        return files.size < 2 ? undefined : {name: file.name, files};
    } catch (e) {
        return undefined;
    }
}
