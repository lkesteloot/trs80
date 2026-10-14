import * as fs from "fs";
import * as path from "path";
import { expandContainer } from "./InputFile.js";
import { pluralizeWithCount, ToolError } from "./utils.js";

/**
 * Return a filename that's safe to create in the output directory. Filenames can come
 * from a disk image, which can hold anything, so replace the characters that would let
 * a name leave the directory (path separators, and the colon, which starts a drive on
 * Windows) and don't allow a name that's empty or only dots. Normal TRS-80 names, like
 * "FOO.CMD", are unchanged.
 */
function safeOutputFilename(filename: string): string {
    return filename.replace(/[\/\\:\0]/g, "_").replace(/^\.*$/, "_");
}

/**
 * Handle the "extract" command: write the files inside a container (a floppy image,
 * CAS file, or cassette WAV file) to an existing directory.
 *
 * @param inFilename the container to extract from.
 * @param outDirname existing directory to write the files to.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @throws ToolError if the directory doesn't exist or the input isn't a readable container.
 */
export function extract(inFilename: string, outDirname: string, includeSystemFiles: boolean,
                        cpmWholeRecords: boolean): void {

    // Check the destination before reading the input.
    const outStat = fs.statSync(outDirname, { throwIfNoEntry: false });
    if (outStat === undefined) {
        throw new ToolError("Directory \"" + outDirname + "\" doesn't exist");
    }
    if (!outStat.isDirectory()) {
        throw new ToolError("\"" + outDirname + "\" is not a directory");
    }

    const inFiles = expandContainer(inFilename, includeSystemFiles, cpmWholeRecords);

    for (const infile of inFiles) {
        const outpath = path.join(outDirname, safeOutputFilename(infile.filename));
        const binary = infile.binary;
        fs.writeFileSync(outpath, binary);
        const date = infile.getDate();
        if (date !== undefined) {
            fs.utimesSync(outpath, date, date);
        }
        console.log("Wrote " + outpath + " (" +
            pluralizeWithCount(binary.length, "byte") +
            (infile.trs80File.error !== undefined ? ", " + infile.trs80File.error : "") + ")");
    }

    console.log("Extracted " + pluralizeWithCount(inFiles.length, "file"));
}
