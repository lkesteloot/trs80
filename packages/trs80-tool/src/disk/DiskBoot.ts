import {BasicLevel, Config, ModelType} from "trs80-emulator";
import {densityToString, type FloppyDisk} from "trs80-base";
import {type BootModel, type BootModelChoice, chooseBootModel} from "trs80-disk";
import {assertNever} from "z80-base";
import {runInTerminal} from "../run.js";
import {pluralizeWithCount, ToolError} from "../utils.js";
import type {DiskCommand} from "./DiskCommands.js";

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
