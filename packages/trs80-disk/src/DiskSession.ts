import {
    BasicDialect, decodeFloppyFileSystem, decodeTrs80File, decodeTrsdosHardDiskPartition, decodeTrsdosOnOverlay,
    evaluateTrsdosWriteGate, findLdosPartitions, FloppyDisk, hardDiskWriteProtectionMessage, type HdvHardDisk,
    isFloppy, isHardDisk,
    type KnownFloppyFileSystem, type LdosPartition, SectorOverlay, Trsdos, trsdosBasicDialect, TrsdosGranuleMap,
    type TrsdosRuleSet, TrsdosWriteAccess, TrsdosWriteError, type TrsdosWriteGate, TrsdosWriter, type WritableDiskVolume,
} from "trs80-base";
import {assertNever} from "z80-base";
import {DiskError} from "./DiskError.js";
import type {DiskTemplateSource} from "./DiskTemplates.js";
import {pluralizeWithCount} from "./Plural.js";

/**
 * The free space on a TRSDOS-family disk in whole KB, rounded down, such as "23 KB free".
 */
function freeKilobytesText(granuleMap: TrsdosGranuleMap): string {
    return Math.floor(granuleMap.getFreeByteCount()/1024).toLocaleString() + " KB free";
}

/**
 * The space available for new files on a disk.
 */
export interface FreeSpace {
    /** How many granules are free. */
    freeGranules: number;
    /** How many bytes each granule holds. */
    granuleBytes: number;
    /** How many bytes are free in all. */
    freeBytes: number;
}

/**
 * Why a command wants to write to the disk, which decides whether a damaged file system blocks it.
 */
export enum DiskWritePurpose {
    /** An ordinary change, such as removing or adding a file. Damage blocks it. */
    CHANGE,

    /** A repair of damage, which may write to a file system that is damaged but otherwise sound. */
    REPAIR,
}

/**
 * The result of {@link decideWrite}.
 */
export type DiskWriteDecision =
    /** The write may go ahead. The warning, if any, should be shown first (the write was forced). */
    { allowed: true, warning: string | undefined } |
    /** The write may not go ahead, for the reason in the error message. */
    { allowed: false, error: string };

/**
 * Decide whether a command may write to a disk. (Exported for tests.)
 *
 * @param gate the write gate of the disk's TRSDOS-family file system, or undefined if the file
 * system is some other family.
 * @param fileSystemName the name and version of the disk's file system, for the message when the gate is
 * undefined.
 * @param purpose why the command wants to write.
 * @param force whether the user gave --force, which overrides every blocker that is forceable.
 */
export function decideWrite(gate: TrsdosWriteGate | undefined, fileSystemName: string, purpose: DiskWritePurpose,
                            force: boolean): DiskWriteDecision {

    if (gate === undefined) {
        return { allowed: false, error: "Writing " + fileSystemName + " disks isn't supported." };
    }

    switch (gate.access) {
        case TrsdosWriteAccess.WRITABLE:
            return { allowed: true, warning: undefined };
        case TrsdosWriteAccess.REPAIR_ONLY:
            switch (purpose) {
                case DiskWritePurpose.REPAIR:
                    return { allowed: true, warning: undefined };
                case DiskWritePurpose.CHANGE:
                    break;
                default:
                    assertNever(purpose);
            }
            break;
        case TrsdosWriteAccess.READ_ONLY:
            break;
        default:
            assertNever(gate.access);
    }

    // Something stands in the way. Only --force can get past it, and only if all of it can be forced.
    const messages = gate.blockers.map(blocker => blocker.message).join(" ");
    const allForceable = gate.blockers.every(blocker => blocker.forceable);
    if (force && allForceable) {
        return { allowed: true, warning: "Writing anyway (--force): " + messages };
    }

    return {
        allowed: false,
        error: "Can't write to this disk: " + messages + (allForceable ? " Use --force to write anyway." : ""),
    };
}

/**
 * How a session saves its changes. These come from the global options of the "disk" command.
 */
export interface DiskSessionOptions {
    /**
     * The hard disk partition to work on (--partition): its number from 1, or its disk name. Undefined
     * to choose automatically when there is only one.
     */
    partition?: string | undefined;
    /** Where to save changes instead of the image (--output), or undefined to replace the image. */
    outputPathname?: string | undefined;
    /** Whether to never write anything, which wins over outputPathname (--dry-run). */
    dryRun?: boolean | undefined;
    /** The DOS whose rules to write by (--dos), or undefined to go by what the disk says. */
    ruleSet?: TrsdosRuleSet | undefined;
    /** Whether to write despite blockers that can be overridden (--force). */
    force?: boolean | undefined;
    /**
     * Shows a warning to the user, such as that --force is overriding a blocker. Without it, warnings
     * aren't shown.
     */
    warn?: ((message: string) => void) | undefined;
    /**
     * Where the system disks and boot sectors come from, for the operations that make disks (see
     * {@link DiskSession.templates}). Without it those operations fail.
     */
    templates?: DiskTemplateSource | undefined;
}

/**
 * The most undo states to keep. Older ones are dropped.
 */
export const MAX_UNDO_STATES = 100;

/**
 * The most bytes of disk images to keep in the undo and redo stacks together (not counting the one most
 * recent state, which is always kept). Large images, such as HFE ones, would otherwise use a lot of memory.
 */
export const MAX_UNDO_BYTES = 64*1024*1024;

/**
 * The same limit for a hard disk, whose every undo state is a copy of the whole image, which can be
 * tens of megabytes. A 64 MB image leaves room for about three states.
 */
export const MAX_HARD_DISK_UNDO_BYTES = 256*1024*1024;

/**
 * The file name extension that makes decodeTrs80File() decode a hard disk image.
 */
const HARD_DISK_EXTENSION = ".hdv";

/**
 * Where a partition starts on its hard disk, which identifies it across changes to the disk.
 */
export interface PartitionLocation {
    /** The first physical cylinder. */
    cylinderOffset: number;
    /** The first physical head. */
    headOffset: number;
}

/**
 * The kinds of images that a session holds.
 */
type DiskImage = FloppyDisk | HdvHardDisk;

/**
 * The name of a partition as the user types it and as the prompt shows it: its disk name, or
 * "partition N" if the disk has no name.
 *
 * @param partition the partition.
 * @param number its number, from 1.
 */
export function partitionDisplayName(partition: LdosPartition, number: number): string {
    return partition.diskName !== "" ? partition.diskName : "partition " + number;
}

/**
 * The file name extension that makes decodeTrs80File() use the decoder that produced each kind of floppy,
 * keyed by the floppy's class name.
 */
const FLOPPY_CLASS_EXTENSIONS: { [className: string]: string } = {
    Jv1FloppyDisk: ".jv1",
    Jv3FloppyDisk: ".jv3",
    DmkFloppyDisk: ".dmk",
    ScpFloppyDisk: ".scp",
    HfeFloppyDisk: ".hfe",
    ImdFloppyDisk: ".imd",
};

/**
 * Everything needed to put a session back the way it was: the image (or the lack of one), and which
 * version of the disk it is, for working out whether the disk differs from what was last saved.
 */
interface DiskState {
    /** A private copy of the floppy's bytes, or undefined if the session had no disk. */
    binary: Uint8Array | undefined;
    /** The file name extension that selects the decoder for the binary, or undefined if there's no disk. */
    extension: string | undefined;
    /** The revision number of this version of the disk. */
    revision: number;
}

/**
 * A step in the undo or redo history: a state to go back to, and the command that changed the disk
 * between that state and the one on the other side of it.
 */
interface DiskHistoryEntry {
    /** The command line that made the change, such as "add hello.bas". */
    label: string;
    /** The state to restore. */
    state: DiskState;
}

/**
 * How the interactive shell lets a command have the terminal to itself, as the command that runs the
 * emulator needs: the shell is reading lines from the terminal, and the command must be the only reader.
 */
export interface DiskShellTerminal {
    /** Stop reading lines, and give the terminal back to how it was before the shell took it. */
    release(): void;
    /** Take the terminal again after {@link release}, and carry on reading lines. */
    reacquire(): void;
}

/**
 * The open disk that every "disk" command works on. Commands change the in-memory floppy, and the
 * session writes the result once at the end (or when the user says "save"), so a chain of commands
 * either all takes effect or none of it does.
 *
 * A session can start with no disk, when the image file doesn't exist yet. Then only the commands
 * that make a disk (or that don't need one) can run, and {@link setFloppy} gives it the new disk.
 */
export class DiskSession {
    /**
     * The image's name as the user knows it, for messages: its host pathname in trs80-tool, its file
     * name in a browser.
     */
    public readonly name: string;
    /**
     * The decoded floppy or hard disk, or undefined if the image doesn't exist yet and no command has made a disk.
     */
    private currentImage: DiskImage | undefined;
    /**
     * The LDOS-family partitions of the hard disk, in disk order. Empty for a floppy and for a hard disk with
     * none that we recognize. After a change, the changed partition's entry is decoded again.
     */
    private partitions: LdosPartition[] = [];
    /**
     * The index in {@link partitions} of the partition that the commands work on, or undefined if none is
     * chosen. The choice is part of the session and not of the undo states, so undo never changes it.
     */
    private selectedPartitionIndex: number | undefined = undefined;
    /**
     * The DOS on the floppy or the selected partition, or undefined if we didn't recognize one. Decoded again
     * after each change.
     */
    private currentFileSystem: KnownFloppyFileSystem | undefined;
    /** Cache for getGranuleMap(), null until the first call (undefined is a valid result). */
    private granuleMap: TrsdosGranuleMap | string | undefined | null = null;
    /** Cache for getWriteGate(), null until the first call (undefined is a valid result). */
    private writeGate: TrsdosWriteGate | undefined | null = null;
    /** Where the next save goes: the image, or the --output file (and then wherever the last save went). */
    private currentSaveName: string;
    /** Whether saving is pretended (--dry-run). */
    private readonly dryRunOption: boolean;
    /** Shows a warning to the user. Does nothing if the options gave none. */
    private readonly warn: (message: string) => void;
    /** Whether the floppy has been written since the last save. */
    private changed = false;
    /** Whether abort() was called, so that nothing is saved. */
    private aborted = false;
    /** The DOS rules the user named (--dos), or undefined. */
    private readonly ruleSet: TrsdosRuleSet | undefined;
    /** Whether the user allows overriding blockers (--force). */
    private readonly force: boolean;
    /** Where the templates for making disks come from, or undefined if this session has none. */
    private readonly templateSource: DiskTemplateSource | undefined;
    /** Whether requireWritable() has already shown the warning about forcing. */
    private forceWarningShown = false;
    /** Whether we've said that old undo states were dropped to save memory. */
    private undoDropWarningShown = false;
    /** How many times the floppy has been written or replaced, so that a command can tell if it changed anything. */
    private modificationCount = 0;
    /** The revision number of the current version of the disk. Every change makes a new number. */
    private currentRevision = 0;
    /** The highest revision number given out. */
    private lastRevision = 0;
    /** The revision that is on disk (or was when the session opened), so that hasChanges() survives undo. */
    private savedRevision = 0;
    /** The disk as last saved or as opened, which {@link revert} goes back to. */
    private savedState: DiskState;
    /** The states that {@link undo} goes back to, oldest first. */
    private undoStack: DiskHistoryEntry[] = [];
    /** The states that {@link redo} goes forward to, most recently undone last. */
    private redoStack: DiskHistoryEntry[] = [];
    /**
     * The interactive shell's hold on the terminal, or undefined when there's no shell (a chain of commands on
     * the command line, or a script), when the terminal is free for a command to use.
     */
    public shellTerminal: DiskShellTerminal | undefined = undefined;

    /**
     * Use DiskSession.fromBinary() instead.
     */
    private constructor(name: string, image: DiskImage | undefined, fileSystem: KnownFloppyFileSystem | undefined,
                        options: DiskSessionOptions) {

        this.name = name;
        this.currentImage = image;
        this.currentFileSystem = fileSystem;
        this.currentSaveName = options.outputPathname ?? name;
        this.dryRunOption = options.dryRun ?? false;
        this.warn = options.warn ?? (() => {});
        this.ruleSet = options.ruleSet;
        this.force = options.force ?? false;
        this.templateSource = options.templates;
        if (image !== undefined) {
            this.watchImage(image);
        }
        this.savedState = this.captureState();
    }

    /**
     * Note a change to the floppy or hard disk whenever it's written.
     */
    private watchImage(image: DiskImage): void {
        const noteWrite = (): void => {
            if (image === this.currentImage) {
                this.changed = true;
                this.modificationCount++;
            }
        };
        // The two kinds of disk have dispatchers of different types.
        if (image instanceof FloppyDisk) {
            image.onWrite.subscribe(noteWrite);
        } else {
            image.onWrite.subscribe(noteWrite);
        }
    }

    /**
     * Decode a floppy or hard disk image. A floppy whose file system we don't recognize still opens,
     * since commands that work on the image itself don't need one. If there are no bytes then the
     * session has no disk (see {@link hasDisk}), for a command such as "create" to make one.
     *
     * A hard disk opens with its LDOS-family partitions found. If options.partition names one then it's
     * selected, and otherwise it's selected if it's the only one. See {@link selectPartition}.
     *
     * @param name the image's name as the user knows it, for messages and for choosing the decoder by its
     * extension.
     * @param binary the image's bytes, or undefined if the image doesn't exist yet.
     * @param options where and whether to save changes.
     * @throws DiskError if the bytes aren't a TRS-80 file we can decode, aren't a
     * floppy or a hard disk, if options.ruleSet is given and the file system isn't TRSDOS-family, or if
     * options.partition is given and doesn't name a partition.
     */
    public static fromBinary(name: string, binary: Uint8Array | undefined,
                             options: DiskSessionOptions = {}): DiskSession {

        if (binary === undefined) {
            return new DiskSession(name, undefined, undefined, options);
        }

        const trs80File = decodeTrs80File(binary, { filename: name });
        if (trs80File.error !== undefined) {
            throw new DiskError("Can't open \"" + name + "\": " + trs80File.error);
        }
        if (isHardDisk(trs80File)) {
            const session = new DiskSession(name, trs80File, undefined, options);
            session.findPartitions(options.partition);
            if (options.ruleSet !== undefined && session.partitions.length === 0) {
                throw new DiskError("--dos only applies to TRSDOS-family disks");
            }
            return session;
        }
        if (!isFloppy(trs80File)) {
            throw new DiskError("Can't open \"" + name + "\": it's not a floppy or hard disk image");
        }
        if (options.partition !== undefined) {
            throw new DiskError("--partition only applies to hard disks");
        }

        const fileSystem = decodeFloppyFileSystem(trs80File);
        if (options.ruleSet !== undefined && !(fileSystem instanceof Trsdos)) {
            throw new DiskError("--dos only applies to TRSDOS-family disks");
        }

        return new DiskSession(name, trs80File, fileSystem, options);
    }

    /**
     * Find the partitions of the hard disk, and choose the one the commands work on: the one asked for, or
     * the only one. The selection starts over from whatever was asked for, so call this when the disk
     * is new or has been put back by an undo.
     *
     * @param wanted the number or disk name that the user gave, or undefined for none.
     * @throws DiskError if wanted doesn't name exactly one partition.
     */
    private findPartitions(wanted: string | undefined): void {
        const image = this.currentImage;
        this.partitions = image === undefined || image instanceof FloppyDisk ? [] : findLdosPartitions(image);
        this.selectedPartitionIndex = undefined;
        if (wanted !== undefined) {
            this.selectedPartitionIndex = this.resolvePartition(wanted);
        } else if (this.partitions.length === 1) {
            this.selectedPartitionIndex = 0;
        }
        this.currentFileSystem = this.selectedPartitionIndex === undefined ? undefined :
            this.partitions[this.selectedPartitionIndex].trsdos;
        this.granuleMap = null;
        this.writeGate = null;
        this.forceWarningShown = false;
    }

    /**
     * Whether the session's disk is a hard disk.
     */
    public isHardDisk(): boolean {
        return this.currentImage !== undefined && !(this.currentImage instanceof FloppyDisk);
    }

    /**
     * The LDOS-family partitions of the hard disk, in disk order (partition 1 first). Empty for a floppy.
     */
    public getPartitions(): readonly LdosPartition[] {
        return this.partitions;
    }

    /**
     * The number (from 1) of the partition that the commands work on, or undefined if none is chosen,
     * which is also the case for a floppy.
     */
    public get selectedPartitionNumber(): number | undefined {
        return this.selectedPartitionIndex === undefined ? undefined : this.selectedPartitionIndex + 1;
    }

    /**
     * The name of the selected partition, as the prompt shows it, or undefined if none is selected.
     */
    public get selectedPartitionName(): string | undefined {
        const index = this.selectedPartitionIndex;
        return index === undefined ? undefined : partitionDisplayName(this.partitions[index], index + 1);
    }

    /**
     * Find the partition that the user means.
     *
     * @param wanted a partition number from 1, or a disk name (ignoring case), or a partition's directory
     * name (which is its disk name made safe, and unique).
     * @return the partition's index.
     * @throws DiskError if there's no such partition or the name fits several.
     */
    private resolvePartition(wanted: string): number {
        const text = wanted.trim();
        if (this.partitions.length === 0) {
            throw new DiskError("The disk has no partitions that we recognize");
        }
        if (/^\d+$/.test(text)) {
            const number = Number(text);
            if (number >= 1 && number <= this.partitions.length) {
                return number - 1;
            }
            throw new DiskError("There is no partition " + text + ".\n" + this.describePartitionChoices());
        }

        const upperText = text.toUpperCase();
        const byDiskName = this.partitions.flatMap((p, i) => p.diskName.toUpperCase() === upperText ? [i] : []);
        if (byDiskName.length === 1) {
            return byDiskName[0];
        }
        if (byDiskName.length > 1) {
            throw new DiskError("Several partitions are named \"" + text + "\"; choose one by number.\n" +
                this.describePartitionChoices());
        }
        const byDirectoryName = this.partitions.flatMap((p, i) => p.directoryName.toUpperCase() === upperText ? [i] : []);
        if (byDirectoryName.length === 1) {
            return byDirectoryName[0];
        }
        throw new DiskError("No partition is named \"" + text + "\".\n" + this.describePartitionChoices());
    }

    /**
     * Choose the partition that the following commands work on.
     *
     * @param wanted a partition number from 1, or a disk name.
     * @throws DiskError if the disk isn't a hard disk, or wanted doesn't name exactly one partition.
     */
    public selectPartition(wanted: string): void {
        if (!this.isHardDisk()) {
            throw new DiskError("The disk is a floppy, which has no partitions");
        }
        this.selectedPartitionIndex = this.resolvePartition(wanted);
        this.currentFileSystem = this.partitions[this.selectedPartitionIndex].trsdos;
        this.granuleMap = null;
        this.writeGate = null;
        this.forceWarningShown = false;
    }

    /**
     * Find the partition that the user means, for a command that works on one (such as "partition --delete").
     *
     * @param wanted a partition number from 1, or a disk name (ignoring case).
     * @return the partition's number, from 1.
     * @throws DiskError if the disk isn't a hard disk, or wanted doesn't name exactly one partition.
     */
    public findPartitionNumber(wanted: string): number {
        if (!this.isHardDisk()) {
            throw new DiskError("The disk is a floppy, which has no partitions");
        }
        return this.resolvePartition(wanted) + 1;
    }

    /**
     * The partition that the commands work on.
     *
     * @throws DiskError if the disk isn't a hard disk, or no partition is selected (saying how to choose one).
     */
    public getSelectedPartition(): LdosPartition {
        if (!this.isHardDisk()) {
            throw new DiskError("The disk is a floppy, which has no partitions");
        }
        const index = this.selectedPartitionIndex;
        if (index === undefined) {
            if (this.partitions.length === 0) {
                throw new DiskError("The disk has no partitions that we recognize; \"partition --add\" makes one");
            }
            throw this.makeNoPartitionError();
        }
        return this.partitions[index];
    }

    /**
     * Whether a partition can be written, as the write gate sees it, or the reason it can't. Uses the
     * rules the user named with --dos, if any.
     *
     * @param partition the partition.
     * @return undefined if it can be written, or the blockers' messages.
     */
    public partitionReadOnlyReason(partition: LdosPartition): string | undefined {
        const gate = evaluateTrsdosWriteGate(partition.trsdos, this.ruleSet);
        switch (gate.access) {
            case TrsdosWriteAccess.WRITABLE:
                return undefined;
            case TrsdosWriteAccess.REPAIR_ONLY:
            case TrsdosWriteAccess.READ_ONLY:
                return gate.blockers.map(blocker => blocker.message).join(" ");
            default:
                assertNever(gate.access);
        }
    }

    /**
     * One line for each partition, for choosing among them: its number, where it is, its disk name, its DOS,
     * its number of files, and whether it can be written. The selected one is marked with "*".
     */
    public describePartitionLines(): string[] {
        return this.partitions.map((partition, index) => {
            const readOnlyReason = this.partitionReadOnlyReason(partition);
            const files = pluralizeWithCount(partition.trsdos.getDirEntries(false).length, "file");
            const mark = index === this.selectedPartitionIndex ? "*" : " ";
            return [
                mark + (index + 1).toString().padStart(2),
                "  " + partition.partition.describeLocation(),
                partition.diskName === "" ? "(no name)" : partition.diskName,
                partition.trsdos.nameAndVersion,
                files,
                readOnlyReason === undefined ? "writable" : "read-only",
            ].join("  ");
        });
    }

    /**
     * The partitions listed for the user to choose from, with how to choose, for an error message.
     */
    private describePartitionChoices(): string {
        return "Partitions:\n" + this.describePartitionLines().map(line => "  " + line).join("\n") +
            "\nChoose one with --partition N|NAME on the command line, or the \"partition\" command.";
    }

    /**
     * The error for a command that needs a file system on a hard disk where none is chosen: either there
     * are no partitions, or there are several and the user hasn't said which.
     */
    private makeNoPartitionError(): DiskError {
        if (this.partitions.length === 0) {
            return new DiskError("Can't find an LDOS, LS-DOS or DOSPLUS partition on \"" + this.name +
                "\" (NEWDOS/80 and CP/M hard disks aren't supported yet)");
        }
        return new DiskError("This hard disk has " + this.partitions.length + " partitions, and the command works " +
            "on one.\n" + this.describePartitionChoices());
    }

    /**
     * Whether the session has a disk: the image existed when it was opened, or a command has made one.
     */
    public hasDisk(): boolean {
        return this.currentImage !== undefined;
    }

    /**
     * Check that the session has a disk, for the commands that need one.
     *
     * @throws DiskError saying that the image doesn't exist and how to make it, if there's no disk.
     */
    public requireDisk(): void {
        if (this.currentImage === undefined) {
            throw this.makeNoDiskError();
        }
    }

    /**
     * The error for a command that needs a disk when the session has none.
     */
    private makeNoDiskError(): DiskError {
        return new DiskError(this.name + " doesn't exist; use \"create\" to make it");
    }

    /**
     * The decoded floppy, for the commands that only work on floppy images.
     *
     * @throws DiskError if the session has no disk, or the disk is a hard disk.
     */
    public get floppy(): FloppyDisk {
        const image = this.currentImage;
        if (image === undefined) {
            throw this.makeNoDiskError();
        }
        if (!(image instanceof FloppyDisk)) {
            throw new DiskError("This command works on floppy images, not hard disks");
        }
        return image;
    }

    /**
     * The decoded hard disk.
     *
     * @throws DiskError if the session has no disk, or the disk is a floppy.
     */
    public get hardDisk(): HdvHardDisk {
        const image = this.image;
        if (image instanceof FloppyDisk) {
            throw new DiskError("This command works on hard disks, not floppy images");
        }
        return image;
    }

    /**
     * The decoded floppy or hard disk.
     *
     * @throws DiskError if the session has no disk.
     */
    public get image(): FloppyDisk | HdvHardDisk {
        if (this.currentImage === undefined) {
            throw this.makeNoDiskError();
        }
        return this.currentImage;
    }

    /**
     * Where the system disks and boot sectors for making disks come from.
     *
     * @throws DiskError if the session was opened without templates.
     */
    public get templates(): DiskTemplateSource {
        if (this.templateSource === undefined) {
            throw new DiskError("This build has no disk templates");
        }
        return this.templateSource;
    }

    /**
     * Where the next save goes: the image, or the --output file.
     */
    public get saveName(): string {
        return this.currentSaveName;
    }

    /**
     * Put a new floppy in the session, replacing the one it has if any (the caller decides whether that's
     * allowed). The new disk counts as a change that hasn't been saved, even if it's identical to the
     * old one, since it replaces the whole image. The file system is decoded again, and the caches and
     * the warning about forcing start over.
     *
     * @param floppy the new floppy, with the contents to be saved.
     */
    public setFloppy(floppy: FloppyDisk): void {
        this.currentImage = floppy;
        this.partitions = [];
        this.selectedPartitionIndex = undefined;
        this.currentFileSystem = decodeFloppyFileSystem(floppy);
        this.granuleMap = null;
        this.writeGate = null;
        this.forceWarningShown = false;
        this.changed = true;
        this.modificationCount++;
        this.watchImage(floppy);
    }

    /**
     * Put a new hard disk in the session, replacing the disk it has if any (the caller decides whether that's
     * allowed). As with {@link setFloppy}, the new disk counts as a change that hasn't been saved. The
     * disk's partitions are found, so a disk that the caller has formatted partitions on already has them,
     * and the only one is selected.
     *
     * @param hardDisk the new disk, with the contents to be saved.
     */
    public setHardDisk(hardDisk: HdvHardDisk): void {
        this.currentImage = hardDisk;
        this.changed = true;
        this.modificationCount++;
        this.watchImage(hardDisk);
        this.findPartitions(undefined);
    }

    /**
     * Change the hard disk's partitions, as "partition --add" and "format" do: run the change on the disk,
     * then find its partitions again, since the change can add, remove or rewrite them. The change counts as
     * a change to be saved and undone. Unlike {@link changeTrsdos} this isn't all or nothing, but a change
     * should check its arguments before it writes anything.
     *
     * A write-protected image is refused unless the user said to write anyway (--force, either the global
     * one or the command's own, which the caller passes as commandForce), as for writes to files.
     *
     * @param change makes the changes to the disk. It can throw a DiskError.
     * @param select where the partition to select afterward starts, or undefined to select none. As when the
     * disk is opened, the only partition is selected anyway.
     * @param commandForce whether the command itself was given --force.
     * @throws DiskError if the disk is a floppy or is write-protected, or whatever change() throws.
     */
    public changeHardDisk(change: (hardDisk: HdvHardDisk) => void, select: PartitionLocation | undefined,
                          commandForce: boolean): void {

        const hardDisk = this.hardDisk;
        if (hardDisk.isWriteProtected()) {
            const message = hardDiskWriteProtectionMessage(hardDisk) ?? "The disk is write-protected.";
            if (!this.force && !commandForce) {
                throw new DiskError("Can't write to this disk: " + message + " Use --force to write anyway.");
            }
            if (!this.forceWarningShown) {
                this.warn("Writing anyway (--force): " + message);
                this.forceWarningShown = true;
            }
            this.clearWriteProtection();
        }

        try {
            change(hardDisk);
        } finally {
            // Even if the change failed partway, the disk may have changed.
            this.findPartitions(undefined);
            if (select !== undefined) {
                const index = this.partitions.findIndex(p => p.partition.cylinderOffset === select.cylinderOffset &&
                    p.partition.headOffset === select.headOffset);
                if (index >= 0) {
                    this.selectedPartitionIndex = index;
                    this.currentFileSystem = this.partitions[index].trsdos;
                }
            }
        }
    }

    /**
     * Decode the file system again, and start the caches over, after something other than a command
     * wrote to the floppy in place (such as a DOS running in the emulator, which can change anything,
     * even the layout of a track). The writes have already counted as changes to the disk.
     */
    public refreshFileSystem(): void {
        this.currentFileSystem = decodeFloppyFileSystem(this.floppy);
        this.granuleMap = null;
        this.writeGate = null;
        this.forceWarningShown = false;
    }

    /**
     * The DOS on the floppy, or on the selected partition of a hard disk, or undefined if we didn't recognize
     * one. After a change to the disk this is a new object, so don't hold on to the old one.
     *
     * @throws DiskError if the disk is a hard disk and no partition is selected: there are none that we
     * recognize, or several and the user hasn't chosen one.
     */
    public get fileSystem(): KnownFloppyFileSystem | undefined {
        if (this.isHardDisk() && this.selectedPartitionIndex === undefined) {
            throw this.makeNoPartitionError();
        }
        return this.currentFileSystem;
    }

    /**
     * Whether the floppy has been changed since it was opened or last saved.
     */
    public hasChanges(): boolean {
        return this.changed;
    }

    /**
     * Whether saving is pretended (--dry-run), so that nothing is written.
     */
    public get dryRun(): boolean {
        return this.dryRunOption;
    }

    /**
     * Whether {@link abort} was called, so that nothing is saved.
     */
    public isAborted(): boolean {
        return this.aborted;
    }

    /**
     * Write the floppy's bytes to where the changes go (the image, or the --output file), if there are changes.
     * The write replaces the whole file at once, so a failure leaves the old file. After this, later saves go
     * to the same file. With --dry-run this writes nothing and the changes stay pending.
     *
     * @param write writes the bytes to the named place. It must either write the whole file or throw, so that
     * a failure leaves the old file.
     * @returns the name written, or undefined if nothing was written because there were no changes
     * (or because of --dry-run).
     * @throws DiskError if the file can't be written.
     */
    public save(write: (saveName: string, binary: Uint8Array) => void): string | undefined {
        if (!this.changed || this.dryRunOption) {
            return undefined;
        }

        try {
            write(this.saveName, this.image.binary);
        } catch (e: any) {
            throw new DiskError("Can't save \"" + this.saveName + "\": " + (e.message ?? String(e)));
        }
        this.markSaved();

        return this.saveName;
    }

    /**
     * Note that the current disk is the one that is saved (or, with --dry-run, that would have been): there
     * are no changes now, and {@link revert} goes back to this disk. The undo and redo history is kept.
     * {@link save} calls this; call it directly after writing the image some other way, or after
     * reporting a dry run.
     */
    public markSaved(): void {
        this.changed = false;
        this.savedRevision = this.currentRevision;
        this.savedState = this.captureState();
    }

    /**
     * Give up on the changes: nothing is saved from now on, including at the end of the run.
     *
     * @returns the pathname whose changes were discarded, or undefined if there were none.
     */
    public abort(): string | undefined {
        const discardedPathname = this.changed ? this.currentSaveName : undefined;
        this.aborted = true;
        this.changed = false;

        return discardedPathname;
    }

    /**
     * Capture the current disk, with a private copy of its bytes.
     */
    private captureState(): DiskState {
        const image = this.currentImage;
        return {
            // Not binary.slice(): the binary can be a Node Buffer, whose slice() shares memory with the original.
            binary: image === undefined ? undefined : new Uint8Array(image.binary),
            extension: image === undefined ? undefined : DiskSession.extensionForImage(image),
            revision: this.currentRevision,
        };
    }

    /**
     * The file name extension that makes {@link decodeTrs80File} choose the decoder that makes this kind of
     * floppy or hard disk.
     *
     * @throws Error if the image is of a kind that the session doesn't know (a bug).
     */
    private static extensionForImage(image: DiskImage): string {
        if (!(image instanceof FloppyDisk)) {
            return HARD_DISK_EXTENSION;
        }
        const extension = FLOPPY_CLASS_EXTENSIONS[image.className];
        if (extension === undefined) {
            throw new Error("Unknown kind of floppy: " + image.className);
        }
        return extension;
    }

    /**
     * Decode image bytes as the session's disk, as {@link fromBinary} does for a file, keeping the user's choice of
     * partition on a hard disk when the partitions are where they were.
     *
     * @param binary the bytes, which the new image owns.
     * @param extension the file name extension that sends them to the right decoder.
     * @throws Error if the bytes don't decode as a floppy or a hard disk (a bug, since they came from one).
     */
    private loadImage(binary: Uint8Array, extension: string): void {
        // The extension sends the bytes to the decoder that made this kind of floppy in the first place.
        const trs80File = decodeTrs80File(binary, { filename: "state" + extension });
        if (trs80File.error !== undefined) {
            throw new Error("Can't decode the disk again: " + trs80File.error);
        }
        if (isHardDisk(trs80File)) {
            this.currentImage = trs80File;
            // The partitions are where they were, so keep the user's choice of one.
            const selected = this.selectedPartitionIndex;
            this.findPartitions(undefined);
            if (selected !== undefined && selected < this.partitions.length) {
                this.selectedPartitionIndex = selected;
                this.currentFileSystem = this.partitions[selected].trsdos;
            } else {
                this.selectedPartitionIndex = this.partitions.length === 1 ? 0 : undefined;
                this.currentFileSystem = this.selectedPartitionIndex === undefined ? undefined :
                    this.partitions[this.selectedPartitionIndex].trsdos;
            }
        } else if (isFloppy(trs80File)) {
            this.currentImage = trs80File;
            this.partitions = [];
            this.selectedPartitionIndex = undefined;
            this.currentFileSystem = decodeFloppyFileSystem(trs80File);
        } else {
            throw new Error("Can't decode the disk again: it didn't decode as a floppy or a hard disk");
        }
        this.watchImage(trs80File);
    }

    /**
     * Replace the disk with a copy of its image changed outside the file system (such as its write-protect
     * flag), which must decode as the same kind of image. It counts as a change to be saved and undone, and
     * the selected partition of a hard disk stays selected.
     *
     * @param binary the changed bytes, which the session owns from now on.
     */
    public replaceImageBinary(binary: Uint8Array): void {
        const image = this.currentImage;
        if (image === undefined) {
            throw this.makeNoDiskError();
        }
        this.loadImage(binary, DiskSession.extensionForImage(image));
        this.granuleMap = null;
        this.writeGate = null;
        this.forceWarningShown = false;
        this.changed = true;
        this.modificationCount++;
    }

    /**
     * Put the session back to a captured state: decode its image again (from a copy, since the floppy writes
     * into its own bytes), as {@link fromBinary} does for a file, and start the caches over. Whether the disk
     * counts as changed depends on whether it is the saved version.
     */
    private restoreState(state: DiskState): void {
        if (state.binary === undefined || state.extension === undefined) {
            this.currentImage = undefined;
            this.currentFileSystem = undefined;
            this.partitions = [];
            this.selectedPartitionIndex = undefined;
        } else {
            this.loadImage(new Uint8Array(state.binary), state.extension);
        }
        this.granuleMap = null;
        this.writeGate = null;
        this.currentRevision = state.revision;
        this.changed = state.revision !== this.savedRevision;
    }

    /**
     * Run a command that may change the disk, noting a way to undo it. If the command changes the disk (even
     * if it then fails, since the disk is left however it got to) then the state from before it is put on the
     * undo stack and the redo stack is cleared. If it changes nothing then nothing is recorded.
     *
     * @param label the command line, to say what {@link undo} undid, such as "add hello.bas".
     * @param run runs the command. If it returns a promise (as a command that runs the emulator does) then
     * the whole time until the promise settles is one step.
     * @returns a promise that resolves when the command is done.
     * @throws whatever run() throws, or rejects with.
     */
    public async runUndoable(label: string, run: () => void | Promise<void>): Promise<void> {
        const before = this.captureState();
        const modificationCountBefore = this.modificationCount;
        try {
            await run();
        } finally {
            const modified = this.modificationCount !== modificationCountBefore;
            if (modified) {
                this.pushUndoState(label, before);
            }
        }
    }

    /**
     * Record that the disk was just changed from the given state, giving the new disk a revision number.
     */
    private pushUndoState(label: string, before: DiskState): void {
        this.undoStack.push({ label, state: before });
        this.redoStack = [];
        this.currentRevision = ++this.lastRevision;
        this.trimUndoHistory();
    }

    /**
     * Drop the oldest undo states while there are too many, or while they hold too many bytes in total.
     * The newest state is always kept. The first time that states are dropped for their size, say so.
     */
    private trimUndoHistory(): void {
        const maxBytes = this.isHardDisk() ? MAX_HARD_DISK_UNDO_BYTES : MAX_UNDO_BYTES;
        for (;;) {
            const tooMany = this.undoStack.length > MAX_UNDO_STATES;
            const tooBig = this.undoStack.length > 1 && this.historyByteCount() > maxBytes;
            if (!tooMany && !tooBig) {
                break;
            }

            this.undoStack.shift();
            if (!tooMany && !this.undoDropWarningShown) {
                // Say so once, since losing the ability to undo is a surprise.
                this.undoDropWarningShown = true;
                this.warn("Each undo step holds a copy of the whole disk image, so the " +
                    "oldest changes can no longer be undone.");
            }
        }
    }

    /**
     * The number of bytes of disk images in the undo and redo stacks.
     */
    private historyByteCount(): number {
        let byteCount = 0;
        for (const entry of this.undoStack) {
            byteCount += entry.state.binary?.length ?? 0;
        }
        for (const entry of this.redoStack) {
            byteCount += entry.state.binary?.length ?? 0;
        }

        return byteCount;
    }

    /**
     * Undo the most recent change to the disk, restoring it as it was before. The change can be redone.
     *
     * @returns the command line of the change that was undone, or undefined if there is nothing to undo.
     */
    public undo(): string | undefined {
        const entry = this.undoStack.pop();
        if (entry === undefined) {
            return undefined;
        }

        this.redoStack.push({ label: entry.label, state: this.captureState() });
        this.restoreState(entry.state);

        return entry.label;
    }

    /**
     * Redo the change that was most recently undone.
     *
     * @returns the command line of the change that was redone, or undefined if there is nothing to redo.
     */
    public redo(): string | undefined {
        const entry = this.redoStack.pop();
        if (entry === undefined) {
            return undefined;
        }

        this.undoStack.push({ label: entry.label, state: this.captureState() });
        this.restoreState(entry.state);

        return entry.label;
    }

    /**
     * Put the disk back the way it was when it was last saved (or when the session opened, if it hasn't
     * been saved). This is a change like any other, so it can be undone, and it clears the redo stack.
     *
     * @returns whether anything was reverted: false if the disk is already as last saved.
     */
    public revert(): boolean {
        if (this.currentRevision === this.savedRevision) {
            return false;
        }

        this.pushUndoState("revert", this.captureState());
        this.restoreState(this.savedState);

        return true;
    }

    /**
     * The BASIC that the disk's programs are for, from its DOS (going by the rules the user named with --dos, if
     * any). The Model III's, unless the DOS is TRSDOS 6 or LS-DOS 6.
     */
    public getBasicDialect(): BasicDialect {
        return this.fileSystem instanceof Trsdos ? trsdosBasicDialect(this.fileSystem, this.ruleSet) :
            BasicDialect.MODEL_III;
    }

    /**
     * How every granule of a TRSDOS-family disk is used. It's computed on the first call and then kept.
     *
     * @returns the map, a string saying why one can't be made, or undefined if the disk has no
     * file system or its file system isn't TRSDOS-family.
     */
    public getGranuleMap(): TrsdosGranuleMap | string | undefined {
        if (this.granuleMap === null) {
            this.granuleMap = this.fileSystem instanceof Trsdos ? TrsdosGranuleMap.make(this.fileSystem) : undefined;
        }

        return this.granuleMap;
    }

    /**
     * Whether the TRSDOS-family file system on the disk is safe to write, and why not, going by the rules of
     * the DOS the user named (--dos) if any. It's computed on the first call and then kept.
     *
     * @returns the gate, or undefined if the disk has no file system or its file system isn't TRSDOS-family.
     */
    public getWriteGate(): TrsdosWriteGate | undefined {
        if (this.writeGate === null) {
            this.writeGate = this.fileSystem instanceof Trsdos ? evaluateTrsdosWriteGate(this.fileSystem, this.ruleSet) : undefined;
        }

        return this.writeGate;
    }

    /**
     * Why the disk's file system can't be written, in one or more sentences, or undefined if it can.
     */
    public getReadOnlyReason(): string | undefined {
        if (!this.hasDisk()) {
            return this.name + " doesn't exist yet.";
        }
        if (this.isHardDisk() && this.selectedPartitionIndex === undefined) {
            // Each partition has its own answer; "partition" lists them.
            return this.partitions.length === 0 ? "No file system was found on the disk." : undefined;
        }
        if (this.fileSystem === undefined) {
            return "No file system was found on the disk.";
        }
        const gate = this.getWriteGate();
        if (gate === undefined) {
            return "Writing " + this.fileSystem.nameAndVersion + " disks isn't supported.";
        }
        switch (gate.access) {
            case TrsdosWriteAccess.WRITABLE:
                return undefined;
            case TrsdosWriteAccess.REPAIR_ONLY:
            case TrsdosWriteAccess.READ_ONLY:
                return gate.blockers.map(blocker => blocker.message).join(" ");
            default:
                assertNever(gate.access);
        }
    }

    /**
     * Check that a command may write to the disk, before it changes anything. With --force, blockers that
     * can be overridden don't stop it, and a warning saying so is printed (the first time only).
     *
     * @param purpose why the command wants to write.
     * @throws DiskError if the session has no disk, the disk has no file system, or the write isn't allowed.
     */
    public requireWritable(purpose: DiskWritePurpose): void {
        this.requireDisk();
        if (this.fileSystem === undefined) {
            throw new DiskError("Can't find a DOS directory on \"" + this.name + "\"");
        }

        const decision = decideWrite(this.getWriteGate(), this.fileSystem.nameAndVersion, purpose, this.force);
        if (!decision.allowed) {
            throw new DiskError(decision.error);
        }
        if (decision.warning !== undefined && !this.forceWarningShown) {
            this.warn(decision.warning);
            this.forceWarningShown = true;
        }
    }

    /**
     * Change the disk's TRSDOS-family file system. The change is made through a {@link TrsdosWriter} on a
     * {@link SectorOverlay}, so it is all or nothing: the writer verifies the result, and only then are the
     * changed sectors written to the in-memory floppy, which counts as a change to be saved. Afterwards the
     * file system is decoded again, so {@link fileSystem} and the caches reflect the new disk.
     *
     * @param purpose why the command wants to write, which decides whether the disk's state allows it.
     * @param change makes the changes with the writer. If it makes none then nothing is written.
     * @throws DiskError if the disk can't be written, or the writer refuses or can't verify the change, in
     * which case the disk is unchanged.
     */
    public changeTrsdos(purpose: DiskWritePurpose, change: (writer: TrsdosWriter) => void): void {
        this.requireWritable(purpose);
        this.clearWriteProtection();

        const sessionTrsdos = this.currentFileSystem;
        if (!(sessionTrsdos instanceof Trsdos)) {
            // requireWritable() has already refused anything that isn't TRSDOS-family.
            throw new DiskError("Writing " + (sessionTrsdos?.nameAndVersion ?? "this") + " disks isn't supported.");
        }

        const overlay = new SectorOverlay(this.writableVolume());
        let committed = false;
        try {
            const trsdos = decodeTrsdosOnOverlay(overlay, sessionTrsdos);
            if (trsdos === undefined || !DiskSession.sameLayout(sessionTrsdos, trsdos)) {
                throw new DiskError("Can't change this disk: it doesn't decode the same way when it is prepared for writing.");
            }

            // requireWritable() has already refused a disk with no rule set.
            const ruleSet = this.getWriteGate()?.ruleSet;
            if (ruleSet === undefined) {
                throw new DiskError("Can't change this disk: no DOS rules apply to it.");
            }
            const writer = new TrsdosWriter(trsdos, ruleSet);
            change(writer);
            if (writer.hasChanges()) {
                writer.flush();
                overlay.commit();
                committed = true;
            }
        } catch (e) {
            overlay.discard();
            if (e instanceof TrsdosWriteError) {
                throw new DiskError(e.message);
            }
            throw e;
        }

        if (committed) {
            this.currentFileSystem = this.decodeFileSystemAfterChange(sessionTrsdos);
            this.granuleMap = null;
            this.writeGate = null;
            if (!(this.currentFileSystem instanceof Trsdos)) {
                // The writer verified the change, so this shouldn't happen. But the floppy in memory
                // has already changed, so make sure that nothing saves it.
                this.abort();
                throw new DiskError("After the change, the disk's file system isn't recognized, so nothing " +
                    "will be saved.");
            }
        }
    }

    /**
     * The volume that the file system is on, which changes are written to: the floppy, or the selected
     * partition of the hard disk.
     *
     * @throws DiskError if the session has no disk, or the disk is a hard disk with no partition selected.
     */
    private writableVolume(): WritableDiskVolume {
        const image = this.image;
        if (image instanceof FloppyDisk) {
            return image;
        }
        const index = this.selectedPartitionIndex;
        if (index === undefined) {
            throw this.makeNoPartitionError();
        }
        return this.partitions[index].partition;
    }

    /**
     * Decode the file system again after a change was committed to the disk. A floppy's layout is found
     * again, and a partition's is the one it had, since a partition's layout is given by its GAT and not
     * guessed. The partition's entry in the list gets the new file system, and its disk name, which a change
     * can make different.
     *
     * @param before the file system as it was decoded before the change.
     * @return the new file system, or undefined if it doesn't decode.
     */
    private decodeFileSystemAfterChange(before: Trsdos): KnownFloppyFileSystem | undefined {
        const image = this.image;
        if (image instanceof FloppyDisk) {
            return decodeFloppyFileSystem(image);
        }

        const index = this.selectedPartitionIndex;
        if (index === undefined) {
            return undefined;
        }
        const old = this.partitions[index];
        const trsdos = decodeTrsdosHardDiskPartition(old.partition, before.dirLumpNumber, before.granulesPerLump);
        if (trsdos !== undefined) {
            const gatInfo = trsdos.getGatInfo();
            this.partitions[index] = {
                ...old,
                trsdos,
                diskName: typeof gatInfo === "string" ? old.diskName : gatInfo.name,
            };
        }
        return trsdos;
    }

    /**
     * Let the disk be written. The gate lets a write-protected image through only with --force, and
     * then it's the user's call, so clear the write-protect state in memory. The image's own flag stays
     * in its header, so the saved image is still marked write-protected. Formats that can't be written at
     * all stay write-protected, and the write fails with that message.
     */
    private clearWriteProtection(): void {
        const image = this.image;
        if (image instanceof FloppyDisk) {
            image.setMountedWriteProtected(false);
        }
        image.clearImageWriteProtected();
    }

    /**
     * Whether two decodings of the same disk have the same layout, using the fields that
     * {@link TrsdosWriter} checks after a change.
     */
    private static sameLayout(a: Trsdos, b: Trsdos): boolean {
        return a.version === b.version &&
            a.allocationSides === b.allocationSides &&
            a.granulesPerLump === b.granulesPerLump &&
            a.sectorsPerGranule === b.sectorsPerGranule &&
            a.dirLumpNumber === b.dirLumpNumber &&
            a.granulesPerDir === b.granulesPerDir &&
            a.firstDataCylinder === b.firstDataCylinder &&
            a.hitIgnored === b.hitIgnored &&
            a.lumpCount === b.lumpCount;
    }

    /**
     * The space available for new files, as numbers.
     *
     * @throws DiskError if the disk has no file system, if its file system isn't TRSDOS-family, or
     * if the granule map can't be made.
     */
    public getFreeSpace(): FreeSpace {
        if (this.fileSystem === undefined) {
            throw new DiskError("Can't find a DOS directory on \"" + this.name + "\"");
        }
        const granuleMap = this.getGranuleMap();
        if (granuleMap === undefined) {
            throw new DiskError("Free space isn't known for " + this.fileSystem.nameAndVersion + " disks yet");
        }
        if (typeof granuleMap === "string") {
            throw new DiskError("Can't find the free space: " + granuleMap);
        }

        const trsdos = granuleMap.trsdos;
        return {
            freeGranules: granuleMap.getFreeGranuleCount(),
            granuleBytes: trsdos.sectorsPerGranule*trsdos.geometry.modalDataSectorSize,
            freeBytes: granuleMap.getFreeByteCount(),
        };
    }

    /**
     * The space available for new files, such as "112 KB free (90 granules of 1,280 bytes each)".
     *
     * @throws DiskError if the disk has no file system, if its file system isn't TRSDOS-family, or
     * if the granule map can't be made.
     */
    public getFreeSpaceText(): string {
        const {freeGranules, granuleBytes, freeBytes} = this.getFreeSpace();
        return Math.floor(freeBytes/1024).toLocaleString() + " KB free (" +
            pluralizeWithCount(freeGranules, "granule") + " of " + granuleBytes.toLocaleString() + " bytes" +
            (freeGranules === 1 ? "" : " each") + ")";
    }

    /**
     * The end of the one-line summary of a hard disk: how many partitions it has, or the selected one's DOS,
     * files and free space.
     */
    private describePartitionSummary(): string {
        const index = this.selectedPartitionIndex;
        if (this.partitions.length === 0) {
            return ", no LDOS, LS-DOS or DOSPLUS partitions found";
        }
        if (index === undefined) {
            return ", " + pluralizeWithCount(this.partitions.length, "partition") +
                " (use \"partition\" to choose one)";
        }

        const fileSystem = this.fileSystem;
        let description = ", partition " + (index + 1) + " (" + this.selectedPartitionName + ")";
        if (fileSystem !== undefined) {
            description += ": " + fileSystem.nameAndVersion + ", " +
                pluralizeWithCount(fileSystem.getDirEntries(false).length, "file");
            const granuleMap = this.getGranuleMap();
            if (granuleMap !== undefined && typeof granuleMap !== "string") {
                description += ", " + freeKilobytesText(granuleMap);
            }
        }
        return description;
    }

    /**
     * A one-line summary of the disk, such as "disk.dmk: Floppy disk (DMK), TRSDOS 2.3, 12 files, 23 KB free",
     * or a note that the image doesn't exist yet.
     */
    public describe(): string {
        if (!this.hasDisk()) {
            return this.name + " doesn't exist yet; use \"create\" to make it.";
        }

        let description = this.name + ": " + this.image.getDescription();
        if (this.isHardDisk()) {
            return description + this.describePartitionSummary();
        }
        if (this.fileSystem === undefined) {
            description += ", no file system found";
        } else {
            // Users don't care about system files.
            description += ", " + this.fileSystem.nameAndVersion + ", " +
                pluralizeWithCount(this.fileSystem.getDirEntries(false).length, "file");

            // The free space is only known for some file systems, and not if the GAT is unreadable.
            const granuleMap = this.getGranuleMap();
            if (granuleMap !== undefined && typeof granuleMap !== "string") {
                description += ", " + freeKilobytesText(granuleMap);
            }
        }

        return description;
    }
}
