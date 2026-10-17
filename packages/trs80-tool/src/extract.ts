import * as fs from "fs";
import * as path from "path";
import { withCommas } from "teamten-ts-utils";
import { type XenixTarExtent } from "trs80-base";
import { expandContainer, type InputFile, XenixTarInputFile } from "./InputFile.js";
import { filesInfileJson, printInfilesJson } from "./json.js";
import {
    DAMAGED_SUFFIX, outputPathComponents, pluralizeWithCount, safeOutputPath, ToolError,
} from "./utils.js";

/**
 * Give the path a name that no earlier file of this extraction has, so that it doesn't overwrite
 * one. Names are compared ignoring case, as macOS and Windows do: a disk can have both "PRINTER"
 * and "Printer", and --lowercase makes "FOO" and "foo" the same everywhere. The first file keeps
 * its name, and later ones get " (2)", " (3)", and so on. The result is added to usedPaths.
 *
 * @param components the path to create in the output directory, which may be changed.
 * @param usedPaths paths written so far, joined with "/" and in lower case.
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
 * Whether the error is the file system's complaint that a file is in the way of a directory or a
 * directory in the way of a file, as when a disk has both a file "a" and a file "a/b".
 */
function isPathClash(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR";
}

/**
 * The part of a "Wrote" or "Appended" line after the byte count that mentions damage to the file
 * and an error decoding it, or an empty string if there's neither. The result goes inside the parentheses.
 */
function damageNotes(infile: InputFile): string {
    return (infile.damage !== undefined ? ", damaged: " + infile.damage.toString() : "") +
        (infile.trs80File.error !== undefined ? ", " + infile.trs80File.error : "");
}

/**
 * Whether the path exists and is a regular file.
 */
function isRegularFile(pathname: string): boolean {
    return fs.statSync(pathname, { throwIfNoEntry: false })?.isFile() === true;
}

/**
 * Append a later part (extent 2 or higher) of a file that's split across the disks of a set to the
 * file that the earlier parts made in the output directory. The file has to be where the first part
 * would have put it, with or without the " [DAMAGED]" suffix. Nothing is written, and a message says
 * why, if the earlier parts aren't there, the file is already complete, or the part doesn't fit
 * after what's there.
 *
 * @param infile the input file holding this part.
 * @param extent which part it is.
 * @param filename the name of the file, as extract() would name it (already lowercased, if asked).
 * @param outDirname existing directory that the files are written to.
 * @param markDamaged whether to add " [DAMAGED]" to the name of a file that had damage.
 * @param usedPaths paths written so far, joined with "/" and in lower case, which this adds to.
 * @returns whether the part was appended.
 */
function appendExtent(infile: InputFile, extent: XenixTarExtent, filename: string, outDirname: string,
                      markDamaged: boolean, usedPaths: Set<string>): boolean {

    const components = safeOutputPath(filename, infile.hasDirectories());
    let outpath = path.join(outDirname, ... components);
    if (!isRegularFile(outpath)) {
        // The first part may have been marked as damaged.
        const damagedPath = outpath + DAMAGED_SUFFIX;
        if (isRegularFile(damagedPath)) {
            outpath = damagedPath;
            components[components.length - 1] += DAMAGED_SUFFIX;
        } else {
            console.log("Skipped " + outpath + ": part " + extent.number + " of " + extent.count +
                " of a " + withCommas(extent.fileSize) + "-byte file, and the earlier parts aren't in " +
                outDirname + ". Extract the disk with part 1 into this directory first.");
            return false;
        }
    }

    const existingSize = fs.statSync(outpath).size;
    if (existingSize === extent.fileSize) {
        console.log("Skipped " + outpath + ": already complete (" +
            pluralizeWithCount(extent.fileSize, "byte") + ")");
        return false;
    }

    const binary = infile.getExtractedBinary(true);
    const newSize = existingSize + binary.length;
    // The last part must finish the file exactly. We can't tell exactly where a middle part
    // belongs, only that it leaves room for the parts after it.
    const fits = extent.number === extent.count ? newSize === extent.fileSize : newSize < extent.fileSize;
    if (!fits) {
        console.log("Skipped " + outpath + ": part " + extent.number + " of " + extent.count +
            " doesn't follow the existing " + pluralizeWithCount(existingSize, "byte") +
            " file (the whole file is " + pluralizeWithCount(extent.fileSize, "byte") +
            "). Extract the parts in order, starting with part 1.");
        return false;
    }

    fs.appendFileSync(outpath, binary);

    // Mark the file as damaged if this part was, even though the earlier parts weren't.
    let renamed = false;
    if (infile.damage !== undefined && markDamaged && !outpath.endsWith(DAMAGED_SUFFIX)) {
        const damagedPath = outpath + DAMAGED_SUFFIX;
        if (fs.existsSync(damagedPath)) {
            console.log("Not renaming " + outpath + ": " + damagedPath + " already exists");
        } else {
            fs.renameSync(outpath, damagedPath);
            outpath = damagedPath;
            components[components.length - 1] += DAMAGED_SUFFIX;
            renamed = true;
        }
    }
    usedPaths.add(components.join("/").toLowerCase());

    const date = infile.getDate();
    if (date !== undefined) {
        fs.utimesSync(outpath, date, date);
    }
    console.log("Appended part " + extent.number + " of " + extent.count + " to " + outpath + " (" +
        pluralizeWithCount(binary.length, "byte") + ", now " + withCommas(newSize) + " of " +
        withCommas(extent.fileSize) + (newSize === extent.fileSize ? ", complete" : "") +
        damageNotes(infile) + (renamed ? ", renamed to mark the damage" : "") + ")");
    return true;
}

/**
 * Handle the "extract" command: write the files inside a container (a floppy image,
 * CAS file, or cassette WAV file) to an existing directory.
 *
 * A Xenix tar floppy can hold just a part (an extent) of a file that's split across the disks of
 * a set. The first part is written as a file, with a warning that it's incomplete. Extracting each
 * later disk into the same directory, in order, appends its part to that file, so that the file
 * is whole after the last disk. A later part is skipped, with a message, if the earlier parts aren't
 * in the directory, if the file is already complete, or if the part doesn't fit after what's there.
 *
 * @param inFilename the container to extract from.
 * @param outDirname existing directory to write the files to.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @param ucsdPascalRawText whether UCSD Pascal text files are written as they are on the disk,
 * instead of converted to host text.
 * @param markDamaged whether to add " [DAMAGED]" to the name of each file that had unreadable
 * sectors, CRC errors, or directory problems. Damaged files are mentioned in the output either way.
 * @param lowercase whether to write the files with lowercase names, as in "foo.cmd" for "FOO.CMD".
 * @throws ToolError if the directory doesn't exist or the input isn't a readable container.
 */
export function extract(inFilename: string, outDirname: string, includeSystemFiles: boolean,
                        cpmWholeRecords: boolean, ucsdPascalRawText: boolean, markDamaged: boolean,
                        lowercase: boolean): void {

    // Check the destination before reading the input.
    const outStat = fs.statSync(outDirname, { throwIfNoEntry: false });
    if (outStat === undefined) {
        throw new ToolError("Directory \"" + outDirname + "\" doesn't exist");
    }
    if (!outStat.isDirectory()) {
        throw new ToolError("\"" + outDirname + "\" is not a directory");
    }

    const inFiles = expandContainer(inFilename, includeSystemFiles, cpmWholeRecords);

    let writtenCount = 0;
    let appendedCount = 0;
    const usedPaths = new Set<string>();
    for (const infile of inFiles) {
        const damage = infile.damage;
        const filename = lowercase ? infile.filename.toLowerCase() : infile.filename;
        const extent = infile instanceof XenixTarInputFile ? infile.file.extent : undefined;
        if (extent !== undefined && extent.number > 1) {
            const appended = appendExtent(infile, extent, filename, outDirname, markDamaged, usedPaths);
            if (appended) {
                appendedCount++;
            }
            continue;
        }

        const components = outputPathComponents(infile.filename, infile.hasDirectories(), damage !== undefined,
            lowercase, markDamaged);
        makeUniquePath(components, usedPaths);
        const outpath = path.join(outDirname, ... components);
        const binary = infile.getExtractedBinary(!ucsdPascalRawText);
        try {
            fs.mkdirSync(path.dirname(outpath), { recursive: true });
            fs.writeFileSync(outpath, binary);
        } catch (error) {
            if (!isPathClash(error)) {
                throw error;
            }
            // Skip the file rather than stop, so that one odd name doesn't lose the rest.
            console.log("Skipped " + outpath + ": a file and a directory have the same name");
            continue;
        }
        writtenCount++;
        const date = infile.getDate();
        if (date !== undefined) {
            fs.utimesSync(outpath, date, date);
        }
        console.log("Wrote " + outpath + " (" +
            pluralizeWithCount(binary.length, "byte") + damageNotes(infile) + ")");
        if (extent !== undefined) {
            console.log("  Only part " + extent.number + " of " + extent.count + " of a " +
                withCommas(extent.fileSize) + "-byte file. Extract the disks with the other parts " +
                "into this directory, in order, to complete it.");
        }
    }

    console.log("Extracted " + pluralizeWithCount(writtenCount, "file") +
        (appendedCount > 0 ? ", appended " + pluralizeWithCount(appendedCount, "part") : ""));
}

/**
 * Handle the "extract" command with "--json": print the files inside a container (a floppy image,
 * CAS file, or cassette WAV file) as one JSON object, including their contents in base64, instead
 * of writing them to a directory. Nothing is written to disk. A part of a file that's split across
 * disks is reported as it is, with its extent, and isn't appended to the earlier parts.
 *
 * @param inFilename the container to extract from.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @param markDamaged whether the output name of each damaged file has " [DAMAGED]" added.
 * @param lowercase whether the output names are lowercase.
 */
export function extractJson(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean,
                            markDamaged: boolean, lowercase: boolean): void {

    printInfilesJson([filesInfileJson(inFilename, includeSystemFiles, cpmWholeRecords, { lowercase, markDamaged })]);
}
