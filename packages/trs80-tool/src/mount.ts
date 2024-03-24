import fs from "fs";
import path from "path";
import { FloppyDisk, decodeTrsdos } from "trs80-base";
import {loadFile, pluralizeWithCount, readTrs80File} from "./utils.js";

const VERBOSE = true;

/**
 * Convert a Unix pathname to a TRSDOS filename.
 */
function toTrsdosFilename(filename: string): string {
    let {name, ext} = path.parse(filename.toUpperCase());

    // Clamp name to 8 characters.
    name = name.substring(0, 8);

    // Clamp extension to 3 characters.
    while (ext.startsWith(".")) {
        ext = ext.substring(1);
    }
    if (ext !== "") {
        ext = "/" + ext.substring(0, 3);
    }

    return name + ext;
}

/**
 * Handle the "mount" command.
 */
export function mount(diskfile: string, commands: string[]): void {
    // Read the disk.
    const disk = readTrs80File(diskfile);
    if (typeof disk === "string") {
        console.log(disk);
        return;
    }

    if (!(disk instanceof FloppyDisk)) {
        console.log("Input file is not a floppy image");
        return;
    }

    // Parse the file system.
    const trsdos = decodeTrsdos(disk);
    if (trsdos === undefined) {
        console.log("Operating system not recognized");
        return;
    }

    if (VERBOSE) {
        console.log("Mounted \"" + diskfile + "\", " +
            trsdos.getOperatingSystemName() + " " + trsdos.getVersion() +
            " with " + pluralizeWithCount(trsdos.getDirEntries().length, "file"));
    }

    // Process commands.
    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];

        switch (command) {
            case "import":
                i += 1;
                if (i >= commands.length) {
                    console.log("Must specify file to import");
                    return;
                }
                const inputFile = commands[i];
                const inputBinary = loadFile(inputFile);
                if (typeof inputBinary === "string") {
                    console.log(inputBinary);
                    return;
                }
                let outputFile = inputFile;
                if (i + 2 < commands.length && (commands[i + 1] === "as" || commands[i + 1] === "to")) {
                    i += 2;
                    outputFile = commands[i];
                }
                outputFile = toTrsdosFilename(outputFile);
                const error = trsdos.writeFile(inputBinary, outputFile);
                if (error !== undefined) {
                    console.log(error);
                    return;
                }
                console.log(`Imported "${inputFile}" to "${outputFile}"`);
                break;

            case "export":
                console.log("Export command is not yet implemented");
                return;

            case "rename":
            case "ren":
            case "move":
            case "mv":
                console.log("Rename command is not yet implemented");
                return;

            case "delete":
            case "del":
            case "kill":
            case "remove":
            case "rm":
                console.log("Delete command is not yet implemented");
                return;

            default:
                console.log("Unknown mount command \"" + command + "\"");
                return;
        }
    }

    // Write the disk back out.
    try {
        fs.writeFileSync(diskfile, disk.binary);
    } catch (e: any) {
        console.log(diskfile + ": Can't write file: " + e.message);
        return;
    }

    if (VERBOSE) {
        console.log("Wrote \"" + diskfile + "\"");
    }
}
