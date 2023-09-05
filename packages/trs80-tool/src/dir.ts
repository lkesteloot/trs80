import { withCommas } from "teamten-ts-utils";
import {expandFile} from "./InputFile.js";

/**
 * Handle the "dir" command.
 */
export function dir(inFilenames: string[]): void {
    const multipleInputFiles = inFilenames.length > 1;
    let firstFile = true;

    for (const inFilename of inFilenames) {
        if (multipleInputFiles) {
            if (!firstFile) {
                console.log();
            }
            console.log(inFilename + ":");
        }
        dirFile(inFilename);
        firstFile = false;
    }
}

function dirFile(inFilename: string): void {
    const inFiles = expandFile(inFilename);
    if (inFiles.length === 0) {
        console.log("No files");
    } else {
        // Find max filename length.
        const maxFilenameLength = Math.max(... inFiles.map(inFile => inFile.filename.length));

        for (const inFile of inFiles) {
            const filename = inFile.filename;
            // We show the decoded size, but we could instead show the binary size. Not sure
            // which is most useful. Let's default to the decoded size, and add a flag if someone
            // wants to see the binary size.
            const size = inFile.trs80File.binary.length;
            const parts = [
                filename.padEnd(maxFilenameLength),
                withCommas(size).padStart(8) + " ",
                ... inFile.getDirExtras(),
            ];
            if (inFile.trs80File.error !== undefined) {
                parts.push(inFile.trs80File.error);
            }

            console.log(parts.join(" "));
        }
    }
}
