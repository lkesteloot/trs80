import { withCommas } from "teamten-ts-utils";
import {expandFile} from "./InputFile.js";
import {pagerYield} from "./pager.js";
import {colorError, colorFilename, colorSize} from "./lscolors.js";
import {ToolError} from "./utils.js";
import {filesInfileJson, printInfilesJson} from "./json.js";

/**
 * Handle the "dir" command.
 *
 * @param json whether to print one JSON object for all the input files instead of text.
 */
export async function dir(inFilenames: string[], showSystemFiles: boolean, cpmWholeRecords: boolean,
                          json: boolean): Promise<void> {

    if (json) {
        printInfilesJson(inFilenames.map(inFilename =>
            filesInfileJson(inFilename, showSystemFiles, cpmWholeRecords, undefined)));
        return;
    }

    const multipleInputFiles = inFilenames.length > 1;
    let firstFile = true;

    for (const inFilename of inFilenames) {
        if (multipleInputFiles) {
            if (!firstFile) {
                console.log();
            }
            console.log(inFilename + ":");
        }
        try {
            dirFile(inFilename, showSystemFiles, cpmWholeRecords);
        } catch (e) {
            // Report the error and go on to the next file, like ls does.
            if (!(e instanceof ToolError)) {
                throw e;
            }
            console.log(colorError(e.message));
            process.exitCode = 1;
        }
        firstFile = false;
        await pagerYield();
    }
}

/**
 * List the files in one input file.
 */
function dirFile(inFilename: string, showSystemFiles: boolean, cpmWholeRecords: boolean): void {
    const inFiles = expandFile(inFilename, showSystemFiles, cpmWholeRecords);
    if (inFiles.length === 0) {
        console.log("No files");
    } else {
        // Find max filename length.
        const maxFilenameLength = Math.max(... inFiles.map(inFile => inFile.filename.length));

        for (const inFile of inFiles) {
            const filename = inFile.filename;
            const size = inFile.binary.length;
            const parts = [
                // Pad separately, since the color codes would throw off padEnd().
                colorFilename(filename, inFile.trs80File) + " ".repeat(maxFilenameLength - filename.length),
                colorSize(withCommas(size).padStart(8), size) + " ",
                ... inFile.getDirExtras(),
            ];
            if (inFile.damage !== undefined) {
                parts.push(colorError("damaged: " + inFile.damage.toString()));
            }
            if (inFile.trs80File.error !== undefined) {
                parts.push(colorError(inFile.trs80File.error));
            }

            console.log(parts.join(" "));
        }
    }
}
