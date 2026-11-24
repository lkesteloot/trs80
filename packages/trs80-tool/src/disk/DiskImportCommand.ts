import path from "path";
import {BasicDialect, Cpm, trsdosBasicDialect} from "trs80-base";
import {type AddFileSource, type AddOptions, type DiskSession, planAdd} from "trs80-disk";
import {CasInputFile, type InputFile, loadInputFile, selectInputFiles, TrsdosInputFile, WavInputFile} from "../InputFile.js";
import {pluralizeWithCount, systemWildcardHint, ToolError, ToolErrorKind} from "../utils.js";
import {addPlannedFiles, type PlannedEntry} from "./AddPlanned.js";
import type {DiskCommand} from "./DiskCommands.js";
import {HostPathKind, parseAddDate} from "./DiskCommandParser.js";
import type {ImportedFileJson, SkippedFileJson} from "./DiskJson.js";
import {trsdosNameToJson} from "./DiskJson.js";

/**
 * A file selected for import, and what became of it while planning.
 */
interface ImportEntry extends PlannedEntry {
    /** The file in the other image. */
    inFile: InputFile;
}

/**
 * The part of a file's name after its last "/", which is the name that its name on the disk is made from. (A hard
 * disk's partitions are directories, such as "HARDA/".)
 *
 * @param filename the name that the file has in the image.
 */
function nameWithoutDirectories(filename: string): string {
    return filename.substring(filename.lastIndexOf("/") + 1);
}

/**
 * Whether a file is a candidate for converting its BASIC: a ".bas" file from a disk, when the disks run
 * different BASICs.
 *
 * @param inFile the file in the other image.
 * @param targetBasic the BASIC of the open disk.
 * @returns the BASIC to read the file as if it's a candidate, or undefined.
 */
function basicToConvertFrom(inFile: InputFile, targetBasic: BasicDialect): BasicDialect | undefined {
    const isBas = path.posix.extname(inFile.filename).toUpperCase() === ".BAS";
    if (!isBas) {
        return undefined;
    }
    const sourceBasic = inFile instanceof TrsdosInputFile ? trsdosBasicDialect(inFile.trsdos) : BasicDialect.MODEL_III;
    return sourceBasic === targetBasic ? undefined : sourceBasic;
}

/**
 * Make the thing to add for a file in the other image.
 *
 * @param inFile the file in the other image.
 * @param session the open disk.
 * @param binary whether the user asked for every file to be copied byte for byte.
 * @param date the date that the user asked for, if any, so that the file's own date isn't wanted.
 */
function makeSource(inFile: InputFile, session: DiskSession, binary: boolean, date: Date | undefined): AddFileSource {
    const source: AddFileSource = {
        label: inFile.filename,
        name: nameWithoutDirectories(inFile.filename),
        bytes: inFile.binary,
        system: inFile.isSystemFile(),
        invisible: inFile instanceof TrsdosInputFile && inFile.dirEntry.isHidden(),
    };
    if (date === undefined) {
        source.date = inFile.getDate();
    }

    // A file from a cassette or a WAV file is converted as its name says, as it would be if it were on the host.
    // A file from a disk is copied as it is, except that BASIC is converted between the BASICs.
    const fromCassette = inFile instanceof CasInputFile || inFile instanceof WavInputFile;
    if (!fromCassette) {
        const targetIsCpm = session.fileSystem instanceof Cpm;
        const sourceBasic = targetIsCpm ? undefined : basicToConvertFrom(inFile, session.getBasicDialect());
        source.conversion = {binary: binary || sourceBasic === undefined, sourceBasic};
    }
    return source;
}

/**
 * The "import" command: copy files from another disk image (or a CAS or WAV file) onto the disk.
 */
export const IMPORT_COMMAND: DiskCommand = {
    spec: {
        name: "import",
        aliases: [],
        args: "<IMAGE> [PATTERN...]",
        hostPathArgs: HostPathKind.FILE,
        summary: "copy files from another disk image (or a CAS or WAV file) onto the disk",
        options: [
            {
                name: "--as",
                valueName: "NAME",
                description: "the TRSDOS (or CP/M) name for the one selected file (default: made from its name in the image)",
            },
            {
                name: "--binary",
                valueName: undefined,
                description: "copy every file byte for byte, even BASIC between Model III and Model 4 BASIC",
            },
            {
                name: "--system",
                valueName: undefined,
                description: "make the copies system files (a system file stays one either way)",
            },
            {
                name: "--invisible",
                valueName: undefined,
                description: "hide the copies from directory listings (a hidden file stays hidden either way)",
            },
            {
                name: "--date",
                valueName: "YYYY-MM-DD",
                description: "record this date on the copies, instead of the files' own dates",
            },
            {
                name: "--overwrite",
                valueName: undefined,
                description: "replace files that are already on the disk, keeping their attributes, passwords, " +
                    "and date unless --system, --invisible, or --date say otherwise",
            },
            {
                name: "--keep-going",
                valueName: undefined,
                description: "skip a file that can't be copied, with a warning, and copy the rest, instead " +
                    "of copying nothing",
            },
        ],
        extraHelp: [
            "With no PATTERN, every file but the system files is copied. A wildcard never matches a system file; " +
            "to copy one, give its name.",
            "Files are copied byte for byte, except that BASIC programs are converted between Model III and " +
            "Model 4 BASIC when the two disks differ, and the programs in a CAS or WAV file are converted as " +
            "\"add\" would convert them.",
        ],
    },

    endsSession: false,

    /**
     * Read the other image, select its files by the patterns (every file but the system files if there are none),
     * and plan and add them as "add" would, with each file's own bytes, dates, and system and invisible flags. A
     * pattern that matches nothing is an error. Without --keep-going, nothing is copied unless every file can be;
     * with it, a file that can't be copied is skipped with a warning and the rest are copied one at a time.
     * Then say what was converted, which files were added or replaced, and what the writer warned about.
     */
    run(session, command, globalOptions, out) {
        const [imageName, ...patterns] = command.args;
        const options = command.options;
        const binary = options.has("--binary");
        const keepGoing = options.has("--keep-going");
        const asText = options.getString("--as");
        const dateText = options.getString("--date");
        const date = dateText === undefined ? undefined : parseAddDate(dateText);

        const loaded = loadInputFile(imageName, true, false);
        if (!loaded.isContainer) {
            throw new ToolError("Can't import from \"" + imageName + "\": it's not a floppy image, hard disk " +
                "image, CAS file, or WAV file (to copy a host file onto the disk, use \"add\")");
        }
        const { selected, unmatchedPattern, unmatchedOnlySystem } = selectInputFiles(loaded.inFiles, patterns, false);
        if (unmatchedPattern !== undefined) {
            throw new ToolError("No file in \"" + imageName + "\" matches \"" + unmatchedPattern + "\"" +
                systemWildcardHint(unmatchedOnlySystem), ToolErrorKind.NOT_FOUND);
        }
        if (selected.length === 0) {
            out.line("No files to import from \"" + imageName + "\".");
            out.result({source: imageName, files: [], skipped: []});
            return;
        }
        if (asText !== undefined && selected.length !== 1) {
            throw new ToolError("--as names one file, but " + pluralizeWithCount(selected.length, "file") +
                " " + (selected.length === 1 ? "was" : "were") + " selected");
        }

        const addOptions: AddOptions = {
            as: asText,
            ascii: false,
            binary,
            text: false,
            basic: session.getBasicDialect(),
            system: options.has("--system"),
            invisible: options.has("--invisible"),
            overwrite: options.has("--overwrite"),
            date,
        };

        // Plan every file that isn't damaged. A damaged file is a problem that never gets to the plan.
        const entries: ImportEntry[] = selected.map(inFile => ({
            inFile,
            label: inFile.filename,
            problem: inFile.damage === undefined ? undefined :
                inFile.filename + " is damaged: " + inFile.damage.toString(),
            item: undefined,
        }));
        const undamaged = entries.filter(entry => entry.problem === undefined);
        const sources = undamaged.map(entry => makeSource(entry.inFile, session, binary, date));
        const plan = sources.length === 0 ? [] : planAdd(session, sources, addOptions);
        undamaged.forEach((entry, index) => {
            entry.item = plan[index];
            entry.problem = plan[index].problem;
        });

        const {added, skipped} = addPlannedFiles(session, entries, addOptions, keepGoing, "copy", out);
        const files: ImportedFileJson[] = added.map(file => ({
            from: file.label,
            name: trsdosNameToJson(file.name),
            size: file.size,
            replaced: file.replaced,
            conversions: file.item.conversionMessages,
        }));
        const skippedJson: SkippedFileJson[] = skipped.map(skip => ({from: skip.label, problem: skip.problem}));
        out.result({source: imageName, files, skipped: skippedJson});
    },
};
