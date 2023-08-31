import { Archive } from "./Archive.js";

/**
 * Handle the "dir" command.
 */
export function dir(infile: string): void {
    const archive = new Archive(infile);
    if (archive.error !== undefined) {
        console.log(archive.error);
    } else {
        if (archive.files.length === 0) {
            console.log("No files");
        } else {
            for (const file of archive.files) {
                console.log(file.getDirString());
            }
        }
    }
}
