import type {FloppyDisk} from "trs80-base";
import {bootCommandLine, type BootModel, chooseBootModel, DiskError, pluralizeWithCount} from "trs80-disk";
import {assertNever} from "z80-base";
import type {ActionResult} from "./Actions.js";
import type {OpenDisk} from "./OpenDisk.js";

// Booting a disk in the emulator, as trs80-tool's "boot" does: the disk goes in drive 0 of a machine whose model
// is chosen as chooseBootModel() chooses it, the DOS writes to the disk in memory, and the whole run is one
// change in the history. The emulator and its ROMs are big, so they're loaded only when a disk is booted.

/** How many drives the emulator has. Drive 0 holds the booted disk, and the others hold other open floppies. */
const DRIVE_COUNT = 4;

/**
 * What a boot came to.
 */
export interface BootResult {
    /** The model that the machine was when the panel was closed. */
    model: BootModel;
    /** How many times the DOS wrote to the booted disk. */
    writeCount: number;
    /** The names of the disks in drives 1 to 3, in drive order, which were mounted write-protected. */
    otherDrives: string[];
}

/**
 * Why a disk can't be booted, or undefined if it can. As in the CLI, only floppies can.
 *
 * @param disk the disk.
 */
export function bootBlocker(disk: OpenDisk): string | undefined {
    const session = disk.session;
    if (!session.hasDisk()) {
        return "There's no disk to boot.";
    }
    if (session.isHardDisk()) {
        return "Only a floppy can be booted, not a hard disk.";
    }
    return undefined;
}

/**
 * The floppies to put in drives 1 to 3: the other open disks that are floppies, in the order given, leaving
 * out the booted one.
 *
 * @param disk the disk to boot.
 * @param others the page's other open disks, in the order that they should go in the drives.
 */
function otherFloppies(disk: OpenDisk, others: readonly OpenDisk[]): {disk: OpenDisk, floppy: FloppyDisk}[] {
    const drives: {disk: OpenDisk, floppy: FloppyDisk}[] = [];
    for (const other of others) {
        if (drives.length >= DRIVE_COUNT - 1) {
            break;
        }
        if (other === disk || bootBlocker(other) !== undefined) {
            continue;
        }
        drives.push({disk: other, floppy: other.session.floppy});
    }
    return drives;
}

/**
 * Boot a floppy in the emulator, in a panel over the page, and wait until the user closes the panel. The DOS's
 * writes go to the disk in memory. Then the file system is read again, and the run is one change in the history
 * (if the DOS wrote anything), labeled with the "boot" command line that it equals. Other open floppies go in
 * drives 1 to 3, write-protected, so that they don't change outside the history.
 *
 * @param disk the floppy to boot.
 * @param others the page's other open disks, in the order that they should go in drives 1 to 3. Hard disks and
 * the booted disk are left out.
 * @throws DiskError if the disk can't be booted.
 */
export async function boot(disk: OpenDisk, others: readonly OpenDisk[]): Promise<ActionResult<BootResult>> {
    const blocker = bootBlocker(disk);
    if (blocker !== undefined) {
        throw new DiskError(blocker);
    }

    const session = disk.session;
    const floppy = session.floppy;
    const choice = chooseBootModel(session.fileSystem, floppy);
    const drives = otherFloppies(disk, others);
    const {runEmulator} = await import("./EmulatorPanel.js");

    // What the panel was set to, for the label, which is made once the panel is closed. The write-protected
    // option is on the label only if the disk was write-protected the whole time.
    let model = choice.model;
    let alwaysWriteProtected = true;
    const label = (): string => bootCommandLine(model === choice.model ? undefined : model, alwaysWriteProtected);

    let writeCount = 0;
    const unsubscribe = floppy.onWrite.subscribe(() => writeCount++);
    for (const drive of drives) {
        drive.floppy.setMountedWriteProtected(true);
    }
    await session.runUndoable(label, async () => {
        try {
            await runEmulator({
                name: disk.name,
                floppies: [floppy, ...drives.map(drive => drive.floppy)],
                driveNames: drives.map(drive => drive.disk.name),
                choice,
                onSettings: (newModel, writeProtected) => {
                    model = newModel;
                    alwaysWriteProtected &&= writeProtected;
                },
            });
        } finally {
            unsubscribe();
            floppy.setMountedWriteProtected(false);
            for (const drive of drives) {
                drive.floppy.setMountedWriteProtected(false);
            }
            // The DOS may have changed anything, even the layout of a track.
            session.refreshFileSystem();
        }
    });

    return {
        commandLine: label(),
        result: {model, writeCount, otherDrives: drives.map(drive => drive.disk.name)},
    };
}

/**
 * What a boot did, in lines for a page to show.
 *
 * @param result what {@link boot} returned.
 */
export function describeBoot(result: BootResult): string[] {
    const lines = ["Booted on a Model " + modelName(result.model) + "."];
    const otherCount = result.otherDrives.length;
    if (otherCount > 0) {
        lines.push((otherCount === 1 ? "Drive 1" : "Drives 1 to " + otherCount) + " held " +
            result.otherDrives.join(", ") + ", write-protected.");
    }
    lines.push(result.writeCount === 0 ? "The DOS didn't change the disk." :
        "The DOS changed the disk (" + pluralizeWithCount(result.writeCount, "write") + "), which Undo takes back.");
    return lines;
}

/**
 * The name of a model, as Tandy wrote it: I, III, or 4.
 *
 * @param model the model.
 */
export function modelName(model: BootModel): string {
    switch (model) {
        case 1:
            return "I";
        case 3:
            return "III";
        case 4:
            return "4";
        default:
            assertNever(model);
    }
}
