import {BasicLevel, Config, ModelType} from "trs80-emulator";
import {
    Density, densityToString, DosFamily, type DosName, type FloppyDisk, isTrsdos6Line, type KnownFloppyFileSystem,
    Trsdos, TrsdosVersion,
} from "trs80-base";
import {assertNever} from "z80-base";
import {runInTerminal} from "../run.js";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";

/**
 * A TRS-80 model that "boot" can run, by its number.
 */
export type BootModel = 1 | 3 | 4;

/**
 * The model that "boot" runs, and why.
 */
export interface BootModelChoice {
    /** The model. */
    model: BootModel;
    /** A short reason, such as "TRSDOS 1.3 is a Model III DOS", for showing to the user. */
    reason: string;
}

/**
 * The models of the emulator, by number.
 */
function bootModelToModelType(model: BootModel): ModelType {
    switch (model) {
        case 1:
            return ModelType.MODEL1;
        case 3:
            return ModelType.MODEL3;
        case 4:
            return ModelType.MODEL4;
        default:
            assertNever(model);
    }
}

/**
 * Choose the model for a DOS that runs on more than one, by the density of its disk: single density is a
 * Model I's (a Model III can't boot one, and LDOS's single-density disks are its Model I ones), and double
 * density is a Model III's.
 *
 * @param name the DOS's name and version, for the reason.
 * @param density the density of the disk's data.
 */
function chooseModelByDensity(name: string, density: Density): BootModelChoice {
    switch (density) {
        case Density.SINGLE:
            return { model: 1, reason: name + " on a single-density disk is for a Model I" };
        case Density.DOUBLE:
            return { model: 3, reason: name + " on a double-density disk is for a Model III" };
        default:
            assertNever(density);
    }
}

/**
 * The model that a DOS is for, when its name alone says: 4 for TRSDOS 6, LS-DOS 6 and DOSPLUS IV, 1
 * for TRSDOS 2.x, and undefined for the others, whose disks say it only by their layout or density.
 */
function modelOfDos(dosName: DosName): BootModel | undefined {
    if (isTrsdos6Line(dosName)) {
        return 4;
    }

    switch (dosName.family) {
        case DosFamily.DOSPLUS_IV:
            return 4;

        case DosFamily.TRSDOS: {
            const isTrsdos2 = dosName.versions.length > 0 && dosName.versions.every(version => version.major() === 2);
            return isTrsdos2 ? 1 : undefined;
        }

        case DosFamily.UNKNOWN:
        case DosFamily.LDOS:
        case DosFamily.LS_DOS:
        case DosFamily.VTOS:
        case DosFamily.DOSPLUS:
        case DosFamily.DOSPLUS_II:
        case DosFamily.NEWDOS:
        case DosFamily.NEWDOS_PLUS:
        case DosFamily.NEWDOS_80:
        case DosFamily.NEWDOS_86:
        case DosFamily.NEWDOS_90:
        case DosFamily.G_DOS:
        case DosFamily.H_DOS:
        case DosFamily.DOUBLEDOS:
        case DosFamily.MULTIDOS:
        case DosFamily.MULTIDOS_II:
        case DosFamily.ESOTERIC:
        case DosFamily.Z_DOS:
        case DosFamily.ULTRADOS:
        case DosFamily.RAPIDOS:
        case DosFamily.SUPERDOS:
        case DosFamily.DOS500:
        case DosFamily.SUPER_UTILITY_PLUS:
        case DosFamily.BFLOADER:
            return undefined;

        default:
            assertNever(dosName.family);
    }
}

/**
 * Choose the TRS-80 model to boot a disk on, from the DOS that the disk has:
 *
 * - TRSDOS 6 and LS-DOS 6 (and DOSPLUS IV) are Model 4 DOSes.
 * - TRSDOS 1.3 is a Model III DOS.
 * - TRSDOS 2.x, including Tandy's 2.7 and 2.8, are Model I DOSes.
 * - Any other DOS of the TRSDOS family (LDOS 5, DOSPLUS, NEWDOS/80, and the ones we don't recognize) is a
 *   Model I's if its disk is single density, and a Model III's if double.
 * - A disk with another kind of file system, or none we recognize, gets a Model III, the most common.
 *
 * @param fileSystem the disk's file system, or undefined if none was recognized.
 * @param floppy the disk, for its density.
 */
export function chooseBootModel(fileSystem: KnownFloppyFileSystem | undefined, floppy: FloppyDisk): BootModelChoice {
    if (!(fileSystem instanceof Trsdos)) {
        const what = fileSystem === undefined ? "No DOS was recognized on the disk" :
            fileSystem.nameAndVersion + " isn't a TRSDOS-family disk";
        return { model: 3, reason: what + ", so the default is a Model III" };
    }

    const name = fileSystem.nameAndVersion;
    const dosModel = modelOfDos(fileSystem.dosName);
    if (dosModel === 4) {
        return { model: 4, reason: name + " is a Model 4 DOS" };
    }

    switch (fileSystem.version) {
        case TrsdosVersion.V1_3:
            return { model: 3, reason: name + " is a Model III DOS" };

        case TrsdosVersion.V2_7:
            return { model: 1, reason: name + " is a Model I DOS" };

        case TrsdosVersion.V2_3:
            if (dosModel === 1) {
                return { model: 1, reason: name + " is a Model I DOS" };
            }
            return chooseModelByDensity(name, floppy.getGeometry().modalDataDensity);

        default:
            assertNever(fileSystem.version);
    }
}

/**
 * What "boot" needs from the world outside the disk, which a test can replace.
 */
export interface BootEnvironment {
    /**
     * Whether there's a terminal to draw the machine on and read keys from: standard input and
     * standard output are both terminals.
     */
    isTerminal(): boolean;

    /**
     * Run a machine with the floppy in drive 0 until the user stops it.
     *
     * @param config the machine to run.
     * @param floppy the floppy to boot from, which the machine writes to in place if it isn't write-protected.
     * @returns a promise that resolves when the user has stopped the machine and the terminal is back.
     */
    runMachine(config: Config, floppy: FloppyDisk): Promise<void>;
}

/**
 * The real environment: the terminal that the tool is running in. (A test may replace its functions.)
 */
export const bootEnvironment: BootEnvironment = {
    /**
     * Whether stdin and stdout are terminals.
     */
    isTerminal(): boolean {
        return process.stdin.isTTY === true && process.stdout.isTTY === true;
    },

    /**
     * Run the machine in the terminal until the user presses Ctrl-C.
     */
    runMachine(config, floppy) {
        return runInTerminal(config, trs80 => trs80.loadFloppyDisk(floppy, 0));
    },
};

/**
 * The "boot" command: run the disk in the emulator.
 */
export const BOOT_COMMAND: DiskCommand = {
    spec: {
        name: "boot",
        aliases: ["run"],
        args: "",
        summary: "boot the disk in the emulator, in the terminal; Ctrl-C returns to the disk shell",
        options: [
            {
                name: "--model",
                valueName: "1|3|4",
                description: "the TRS-80 to boot on (default: the one the disk's DOS is for)",
            },
            {
                name: "--write-protected",
                valueName: undefined,
                description: "mount the disk write-protected, so that the DOS can't write to it",
            },
        ],
        extraHelp: [
            "The default model: 1 for TRSDOS 2.x and for other DOSes on single-density disks, 3 for TRSDOS 1.3 " +
            "and for other DOSes on double-density disks, and 4 for TRSDOS 6 and LS-DOS 6. A disk with no DOS we " +
            "recognize gets a 3.",
            "The DOS can write to the disk, but only in memory: it's one change that \"undo\" takes back, and " +
            "\"save\" or \"quit\" saves. A disk whose image is marked write-protected stays so.",
        ],
    },

    endsSession: false,
    floppyOnly: true,

    /**
     * Boot the session's disk, as it is in memory, in a machine drawn in the terminal, and wait until the
     * user presses Ctrl-C. Then the disk is decoded again, since the DOS may have changed anything, and the
     * writes are reported. The whole run is one step of the undo history.
     *
     * @throws ToolError if there's no terminal, an option is bad, or the machine can't be made.
     */
    async run(session, command, globalOptions, out) {
        const modelText = command.options.getString("--model");
        if (modelText !== undefined && modelText !== "1" && modelText !== "3" && modelText !== "4") {
            throw new ToolError("Invalid --model \"" + modelText + "\": use 1, 3, or 4");
        }
        const writeProtected = command.options.has("--write-protected");

        if (out.json) {
            throw new ToolError("boot needs a terminal, so it can't be used with --json");
        }
        if (!bootEnvironment.isTerminal()) {
            throw new ToolError("boot needs a terminal");
        }

        const floppy = session.floppy;
        const choice: BootModelChoice = modelText === undefined ?
            chooseBootModel(session.fileSystem, floppy) :
            { model: Number(modelText) as BootModel, reason: "--model says so" };
        const config = Config.makeDefault().edit()
            .withModelType(bootModelToModelType(choice.model))
            .withBasicLevel(BasicLevel.LEVEL2)
            .build();
        if (!config.isValid()) {
            throw new ToolError("Can't make a Model " + choice.model + " to boot on");
        }

        // The disk's own write-protect flag (or a format that can't be written) wins over our wanting to
        // write, so check what the mount came to.
        floppy.setMountedWriteProtected(writeProtected);
        const mountedWriteProtected = floppy.isWriteProtected();

        const shellTerminal = session.shellTerminal;
        // Short lines, since the reason can be long.
        out.line("Booting on a Model " + choice.model + " (" + choice.reason + ").");
        out.line("The disk is " + densityToString(floppy.getGeometry().modalDataDensity) + " density and " +
            (mountedWriteProtected ? "write-protected" : "writable") + ".");
        if (mountedWriteProtected && !writeProtected) {
            out.line("The image is marked write-protected, or its format can't be written.");
        }
        out.line(shellTerminal === undefined ? "Ctrl-C stops it." : "Ctrl-C returns to the disk shell.");

        let writeCount = 0;
        const unsubscribe = floppy.onWrite.subscribe(() => writeCount++);
        shellTerminal?.release();
        try {
            await bootEnvironment.runMachine(config, floppy);
        } finally {
            unsubscribe();
            floppy.setMountedWriteProtected(false);
            shellTerminal?.reacquire();
            // The DOS may have changed anything, even the layout of a track.
            session.refreshFileSystem();
        }

        out.line(shellTerminal === undefined ? "The emulator stopped." : "Back in the shell.");
        if (writeCount > 0) {
            out.line("The disk was changed (" + pluralizeWithCount(writeCount, "write") +
                "); \"undo\" takes it back.");
        }
    },
};
