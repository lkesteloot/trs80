import * as fs from "fs";
import * as path from "path";
import { expandContainer } from "./InputFile.js";
import { pluralizeWithCount, ToolError } from "./utils.js";

/**
 * Return a file or directory name that's safe to create in its directory. Names can come
 * from a disk image, which can hold anything, so replace the characters that would let a
 * name leave its directory (path separators, and the colon, which starts a drive on
 * Windows) and don't allow a name that's empty or only dots, such as "..". Normal TRS-80
 * names, like "FOO.CMD", are unchanged.
 */
function safeOutputName(name: string): string {
    return name.replace(/[\/\\:\0]/g, "_").replace(/^\.*$/, "_");
}

/**
 * Return the components of the path to create in the output directory for a file. On file
 * systems with directories, a "/" in the filename separates them (as in "usr/bin/vi" on a
 * Xenix tar disk), and we recreate them, dropping empty components (as in "a//b").
 * Elsewhere the whole filename is one name.
 */
function safeOutputPath(filename: string, hasDirectories: boolean): string[] {
    if (!hasDirectories) {
        return [safeOutputName(filename)];
    }

    const components = filename.split("/").filter(component => component !== "").map(safeOutputName);
    return components.length === 0 ? ["_"] : components;
}

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
 * Handle the "extract" command: write the files inside a container (a floppy image,
 * CAS file, or cassette WAV file) to an existing directory.
 *
 * @param inFilename the container to extract from.
 * @param outDirname existing directory to write the files to.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @param markDamaged whether to add " [DAMAGED]" to the name of each file that had unreadable
 * sectors, CRC errors, or directory problems. Damaged files are mentioned in the output either way.
 * @param lowercase whether to write the files with lowercase names, as in "foo.cmd" for "FOO.CMD".
 * @throws ToolError if the directory doesn't exist or the input isn't a readable container.
 */
export function extract(inFilename: string, outDirname: string, includeSystemFiles: boolean,
                        cpmWholeRecords: boolean, markDamaged: boolean, lowercase: boolean): void {

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
    const usedPaths = new Set<string>();
    for (const infile of inFiles) {
        const damage = infile.damage;
        const filename = lowercase ? infile.filename.toLowerCase() : infile.filename;
        const components = safeOutputPath(filename, infile.hasDirectories());
        components[components.length - 1] += damage !== undefined && markDamaged ? " [DAMAGED]" : "";
        makeUniquePath(components, usedPaths);
        const outpath = path.join(outDirname, ... components);
        const binary = infile.binary;
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
            pluralizeWithCount(binary.length, "byte") +
            (damage !== undefined ? ", damaged: " + damage.toString() : "") +
            (infile.trs80File.error !== undefined ? ", " + infile.trs80File.error : "") + ")");
    }

    console.log("Extracted " + pluralizeWithCount(writtenCount, "file"));
}
