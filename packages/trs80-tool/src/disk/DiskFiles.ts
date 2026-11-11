import fs from "fs";
import {BasicDialect} from "trs80-base";
import {DiskSession, type DiskSessionOptions} from "trs80-disk";
import {colors} from "../colors.js";
import {floppyInputFiles, type InputFile} from "../InputFile.js";
import {ToolError, writeFileAtomically} from "../utils.js";
import {NODE_TEMPLATES} from "./NodeTemplates.js";

/**
 * Open a disk image file as a session, the way the "disk" command does: read the file from the host, and
 * show the session's warnings in the warning color on the console. A file that doesn't exist gives a
 * session with no disk, for a command such as "create" to make one.
 *
 * @param pathname the host pathname of the image.
 * @param options where and whether to save changes. If it has no warn function then warnings are
 * printed to the console. If it has no templates then the ones embedded in the tool are used.
 * @throws ToolError if the file exists but can't be read, or for any reason that
 * {@link DiskSession.fromBinary} throws.
 */
export function openDiskSession(pathname: string, options: DiskSessionOptions = {}): DiskSession {
    let binary: Uint8Array | undefined;
    try {
        binary = fs.readFileSync(pathname);
    } catch (e: any) {
        if (e.code !== "ENOENT") {
            throw new ToolError("Can't open \"" + pathname + "\": " + e.message);
        }
        binary = undefined;
    }

    const warn = options.warn ?? ((message: string) => console.log(colors.warning(message)));
    return DiskSession.fromBinary(pathname, binary, {templates: NODE_TEMPLATES, ...options, warn});
}

/**
 * Save a session's changes to a host file, if there are any, replacing the whole file at once (see
 * {@link DiskSession.save}).
 *
 * @param session the session to save.
 * @returns the pathname written, or undefined if nothing was written because there were no changes
 * (or because of --dry-run).
 * @throws ToolError if the file can't be written.
 */
export function saveDiskSession(session: DiskSession): string | undefined {
    return session.save(writeFileAtomically);
}

/**
 * Save the changes and say so, or with --dry-run say what would have been saved (and forget the changes).
 * Does nothing after abort().
 *
 * @param session the session to save.
 * @param announceNoChanges whether to say so when there's nothing to save, as the "save" command does.
 * @throws ToolError if the file can't be written.
 */
export function saveAndReport(session: DiskSession, announceNoChanges: boolean): void {
    if (session.isAborted()) {
        return;
    }

    if (!session.hasChanges()) {
        if (announceNoChanges) {
            console.log("No changes to save.");
        }
    } else if (session.dryRun) {
        console.log("Not saved (--dry-run): " + session.saveName + " would have changed.");
        session.markSaved();
    } else {
        const savedPathname = saveDiskSession(session);
        console.log("Saved " + savedPathname + ".");
    }
}

/**
 * The files on the disk, as input files so that commands can reuse the listing and extraction code.
 *
 * @param session the session whose disk to list.
 * @param includeSystemFiles whether to include system files.
 * @param basic the BASIC that the user chose to read tokenized programs as, or undefined to use the DOS's
 * (see {@link DiskSession.getBasicDialect}), unless a program's bytes clearly say it's for the other.
 * @throws ToolError if the session has no disk, or the disk has no file system we recognize.
 */
export function sessionInputFiles(session: DiskSession, includeSystemFiles: boolean,
                                  basic?: BasicDialect): InputFile[] {

    session.requireDisk();
    const fileSystem = session.fileSystem;
    if (fileSystem === undefined) {
        throw new ToolError("Can't find a DOS directory on \"" + session.name + "\"");
    }

    const basicChoice = {dialect: basic ?? session.getBasicDialect(), forced: basic !== undefined};
    return floppyInputFiles(fileSystem, includeSystemFiles, basicChoice);
}
