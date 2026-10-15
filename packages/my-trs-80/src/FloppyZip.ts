import {FloppyDirEntry, FloppyFileSystem, UcsdPascalFile, ucsdPascalTextToHost} from "trs80-base";
import JSZip from "jszip";
import {downloadBlob} from "trs80-emulator-web";
import {makeTextButton} from "./Utils";

/**
 * Make the "Export ZIP" button for a floppy's file panel tab. Clicking it downloads
 * a ZIP file with the given files from the floppy. UCSD Pascal text files are converted to
 * host text.
 *
 * @param diskFilename the filename of the floppy image, used to name the ZIP file.
 * @param fileSystem the file system that the directory entries came from.
 * @param dirEntries the files to put in the ZIP file.
 * @param fallbackName the name of the ZIP file (without extension) if the floppy has no usable filename.
 */
export function makeExportZipButton<T extends FloppyDirEntry>(diskFilename: string,
                                                              fileSystem: FloppyFileSystem<T>,
                                                              dirEntries: T[],
                                                              fallbackName: string): HTMLElement {

    return makeTextButton("Export ZIP", "get_app", "export-zip-button", () => {
        const zip = new JSZip();

        for (const dirEntry of dirEntries) {
            const date = dirEntry.getDate();
            // Some file systems don't record dates.
            const options = date === undefined ? {} : { date };
            let contents = fileSystem.readFile(dirEntry);
            if (dirEntry instanceof UcsdPascalFile && dirEntry.isText()) {
                contents = ucsdPascalTextToHost(contents);
            }
            zip.file(dirEntry.getFilename("."), contents, options);
        }

        zip.generateAsync({
            type: "blob",
        })
            .then(blob => {
                let filename = diskFilename;
                let i = filename.lastIndexOf("/");
                if (i >= 0) {
                    // Strip path.
                    filename = filename.substring(i + 1);
                }
                i = filename.lastIndexOf(".");
                if (i > 0) {
                    // Strip existing extension.
                    filename = filename.substring(0, i);
                }
                if (filename === "") {
                    filename = fallbackName;
                }
                filename += ".zip";

                downloadBlob(blob, filename);
            });
    });
}
