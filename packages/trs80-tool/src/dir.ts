import { withCommas } from "teamten-ts-utils";
import {expandFile} from "./InputFile.js";

/**
 * Handle the "dir" command.
 */
export function dir(inFilenames: string[], showSystemFiles: boolean): void {
    const multipleInputFiles = inFilenames.length > 1;
    let firstFile = true;

    for (const inFilename of inFilenames) {
        if (multipleInputFiles) {
            if (!firstFile) {
                console.log();
            }
            console.log(inFilename + ":");
        }
        dirFile(inFilename, showSystemFiles);
        firstFile = false;
    }
}

function dirFile(inFilename: string, showSystemFiles: boolean): void {
    const inFiles = expandFile(inFilename, showSystemFiles);
    if (inFiles.length === 0) {
        console.log("No files");
    } else {
        // Find max filename length.
        const maxFilenameLength = Math.max(... inFiles.map(inFile => inFile.filename.length));

        for (const inFile of inFiles) {
            const filename = inFile.filename;
            const size = inFile.binary.length;
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
