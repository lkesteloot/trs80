import fs from "fs";
import os from "os";
import path from "path";
import {
    Density, DosFamily, type DosName, dosNameToString, type FloppyDisk, type KnownFloppyFileSystem, makeDosName,
    SectorData, SectorPosition, Trsdos, TrsdosVersion, UNKNOWN_DOS_NAME,
} from "trs80-base";
import {
    BasicLevel, CassettePlayer, Config, Keyboard, ModelType, model1ScreenCodeToModel3, SilentSoundPlayer, Trs80, Trs80Screen,
} from "trs80-emulator";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {pressTerminalKey} from "../run.js";
import {ToolError} from "../utils.js";
import {BOOT_COMMAND, type BootEnvironment, bootEnvironment, chooseBootModel} from "./DiskBoot.js";
import {disk} from "./disk.js";
import {DiskOptionValues} from "./DiskCommandParser.js";
import {DiskSession, type DiskShellTerminal} from "trs80-disk";
import {runDiskLine} from "./DiskShell.js";
import {openDiskSession, saveAndReport, sessionInputFiles} from "./DiskFiles.js";

/** The width and height of the TRS-80 screen in characters. */
const SCREEN_WIDTH = 64;
const SCREEN_HEIGHT = 16;
/** The first address of video memory. */
const SCREEN_BEGIN = 0x3C00;

/**
 * A screen that remembers the text written to it, so that a test can read it back.
 */
class TextScreen extends Trs80Screen {
    private readonly mem = new Uint8Array(SCREEN_WIDTH*SCREEN_HEIGHT).fill(32);
    private config: Config | undefined = undefined;

    /**
     * Remember the config, to know whether the codes are a Model I's.
     */
    setConfig(config: Config): void {
        this.config = config;
    }

    /**
     * Remember the character, as a Model III code (the Model I's are different for capitals).
     */
    writeChar(address: number, value: number): void {
        const offset = address - SCREEN_BEGIN;
        if (offset >= 0 && offset < this.mem.length) {
            this.mem[offset] = this.config?.modelType === ModelType.MODEL1 ? model1ScreenCodeToModel3(value) : value;
        }
    }

    /**
     * The screen as one string, a line per row, with graphics characters as "#".
     */
    text(): string {
        const lines: string[] = [];
        for (let row = 0; row < SCREEN_HEIGHT; row++) {
            let line = "";
            for (let col = 0; col < SCREEN_WIDTH; col++) {
                const ch = this.mem[row*SCREEN_WIDTH + col];
                line += ch >= 32 && ch < 128 ? String.fromCharCode(ch) : ch >= 128 ? "#" : " ";
            }
            lines.push(line.trimEnd());
        }
        return lines.join("\n");
    }
}

/**
 * A machine that a test drives by stepping it, instead of letting the timers run it.
 */
class TestMachine {
    public readonly trs80: Trs80;
    public readonly screen = new TextScreen();
    public readonly keyboard = new Keyboard();

    /**
     * Make the machine and boot the floppy in drive 0.
     */
    constructor(public readonly config: Config, floppy: FloppyDisk) {
        this.trs80 = new Trs80(config, this.screen, this.keyboard, new CassettePlayer(), new SilentSoundPlayer());
        this.trs80.loadFloppyDisk(floppy, 0);
        this.trs80.reset();
    }

    /**
     * Run for this many t-states.
     */
    runCycles(cycles: number): void {
        const limit = this.trs80.tStateCount + cycles;
        while (this.trs80.tStateCount < limit) {
            this.trs80.step();
        }
    }

    /**
     * Run until the text is on the screen, up to the given number of emulated seconds.
     *
     * @returns whether it appeared.
     */
    runUntilScreen(text: string, seconds: number): boolean {
        const limit = this.trs80.tStateCount + seconds*this.trs80.clockHz;
        while (this.trs80.tStateCount < limit) {
            for (let i = 0; i < 2000; i++) {
                this.trs80.step();
            }
            if (this.screen.text().includes(text)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Type each character of the text as the terminal's keyboard sends it, and run until the machine has
     * taken all of it.
     */
    typeAtTerminal(text: string): void {
        for (const ch of text) {
            pressTerminalKey(this.keyboard, ch === "\n" ? "Enter" : ch);
        }
        this.runUntilKeysTaken();
    }

    /**
     * Run until the keyboard's queue is empty, up to 30 emulated seconds.
     */
    runUntilKeysTaken(): void {
        const limit = this.trs80.tStateCount + 30*this.trs80.clockHz;
        while (this.keyboard.keyQueue.length > 0 && this.trs80.tStateCount < limit) {
            this.trs80.step();
        }
    }

    /**
     * Type the text and run until the machine has taken all of it.
     */
    type(text: string): void {
        this.keyboard.simulateKeyboardText(text);
        const limit = this.trs80.tStateCount + 30*this.trs80.clockHz;
        while (this.keyboard.keyQueue.length > 0 && this.trs80.tStateCount < limit) {
            this.trs80.step();
        }
    }
}

/**
 * Write different bytes to a sector, as a DOS writing to the disk would, so the floppy dispatches a write.
 */
function overwriteSector(floppy: FloppyDisk, cylinder: number, side: number, sectorNumber: number): void {
    const sectorPosition = SectorPosition.make(cylinder, side, sectorNumber);
    const sector = floppy.readSector(sectorPosition)!;
    floppy.writeSector(sectorPosition, new SectorData(new Uint8Array(sector.data.length).fill(0x55), sectorPosition,
        sector.density));
}

/**
 * Wait for the DOS of a TRSDOS 2.3 system disk to be ready and have it kill a file, which it does by writing
 * to the disk, the way a user would.
 */
function killTest1(machine: TestMachine): void {
    expect(machine.runUntilScreen("DOS READY", 20), machine.screen.text()).to.equal(true);
    machine.type("KILL TEST1/CMD\n");
    expect(machine.runUntilScreen("DOS READY\n", 5)).to.equal(true);
    machine.runCycles(machine.trs80.clockHz);
}

describe("chooseBootModel", () => {
    /**
     * Make a fake TRSDOS-family file system with this DOS and layout, and a fake floppy with this density, for
     * the DOSes that we have no disk image of.
     */
    function choose(dosName: DosName, version: TrsdosVersion, density: Density) {
        const fileSystem = Object.assign(Object.create(Trsdos.prototype), {dosName, version}) as Trsdos;
        const floppy = { getGeometry: () => ({ modalDataDensity: density }) } as unknown as FloppyDisk;
        return chooseBootModel(fileSystem, floppy);
    }

    it("picks the Model I for TRSDOS 2.x on any density", () => {
        expect(choose(makeDosName(DosFamily.TRSDOS, "2.3"), TrsdosVersion.V2_3, Density.SINGLE).model).to.equal(1);
        expect(choose(makeDosName(DosFamily.TRSDOS, "2.x"), TrsdosVersion.V2_3, Density.DOUBLE).model).to.equal(1);
        expect(choose(makeDosName(DosFamily.TRSDOS, "2.7DD"), TrsdosVersion.V2_7, Density.DOUBLE).model).to.equal(1);
    });

    it("picks the Model III for TRSDOS 1.3", () => {
        const choice = choose(makeDosName(DosFamily.TRSDOS, "1.3"), TrsdosVersion.V1_3, Density.DOUBLE);
        expect(choice.model).to.equal(3);
        expect(choice.reason).to.contain("TRSDOS 1.3");
    });

    it("picks the Model 4 for TRSDOS 6, LS-DOS 6 and DOSPLUS IV", () => {
        expect(choose(makeDosName(DosFamily.TRSDOS, "6.2"), TrsdosVersion.V2_3, Density.DOUBLE).model).to.equal(4);
        expect(choose(makeDosName(DosFamily.LS_DOS, "6.3"), TrsdosVersion.V2_3, Density.DOUBLE).model).to.equal(4);
        expect(choose(makeDosName(DosFamily.DOSPLUS_IV), TrsdosVersion.V2_3, Density.DOUBLE).model).to.equal(4);
    });

    it("picks by density for the other DOSes", () => {
        const names = [makeDosName(DosFamily.LDOS, "5.3"), makeDosName(DosFamily.DOSPLUS, "3.4"),
            makeDosName(DosFamily.NEWDOS_80, "2.0"), makeDosName(DosFamily.VTOS, "3.0"), UNKNOWN_DOS_NAME];
        for (const name of names) {
            const text = dosNameToString(name);
            expect(choose(name, TrsdosVersion.V2_3, Density.SINGLE).model, text + " single").to.equal(1);
            expect(choose(name, TrsdosVersion.V2_3, Density.DOUBLE).model, text + " double").to.equal(3);
        }
    });

    it("picks the Model III when there is no TRSDOS-family file system", () => {
        const floppy = { getGeometry: () => ({ modalDataDensity: Density.SINGLE }) } as unknown as FloppyDisk;
        expect(chooseBootModel(undefined, floppy).model).to.equal(3);
        const cpm = { nameAndVersion: "Montezuma CP/M" } as unknown as KnownFloppyFileSystem;
        expect(chooseBootModel(cpm, floppy).model).to.equal(3);
    });
});

describe("boot", () => {
    let dir = "";
    let imagePathname = "";

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "trs80-tool-boot-"));
        imagePathname = path.join(dir, "test.dmk");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    /**
     * Run the "disk" command on the image with these words after it, and return what it printed.
     */
    async function runDisk(...words: string[]): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await disk([imagePathname, ...words]);
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Run one line of the shell on the session and return what it printed.
     */
    async function run(session: DiskSession, line: string): Promise<string[]> {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
            await runDiskLine(session, line, new DiskOptionValues());
            return spy.mock.calls.map(args => args.join(" "));
        } finally {
            spy.mockRestore();
        }
    }

    /**
     * Pretend that there is a terminal, and replace the machine with a function that is given the config and
     * the floppy it would have run.
     */
    function fakeTerminal(runMachine: BootEnvironment["runMachine"]): void {
        vi.spyOn(bootEnvironment, "isTerminal").mockReturnValue(true);
        vi.spyOn(bootEnvironment, "runMachine").mockImplementation(runMachine);
    }

    /**
     * Make a session on a new disk of this kind, made by the "create" command (with whatever options).
     */
    async function makeSession(...createWords: string[]): Promise<DiskSession> {
        await runDisk("create", ...createWords);
        return openDiskSession(imagePathname);
    }

    /**
     * The names of the files on the session's disk, without system files, in directory order.
     */
    function fileNames(session: DiskSession): string[] {
        return sessionInputFiles(session, false).map(f => f.filename);
    }

    /**
     * The model of a config, as 1, 3, or 4.
     */
    function modelNumber(config: Config): number {
        return config.modelType === ModelType.MODEL1 ? 1 : config.modelType === ModelType.MODEL3 ? 3 : 4;
    }

    it("refuses without a terminal", async () => {
        const session = await makeSession("trsdos-2.3");
        vi.spyOn(bootEnvironment, "isTerminal").mockReturnValue(false);
        const runMachine = vi.spyOn(bootEnvironment, "runMachine");
        await expect(run(session, "boot")).rejects.toThrow("boot needs a terminal");
        expect(runMachine).not.toHaveBeenCalled();
    });

    it("refuses a bad model, and a disk that doesn't exist", async () => {
        const session = await makeSession("trsdos-2.3");
        fakeTerminal(async () => {});
        await expect(run(session, "boot --model 2")).rejects.toThrow("Invalid --model");
        await expect(runDisk("boot")).resolves.toBeDefined();

        fs.rmSync(imagePathname);
        await expect(runDisk("boot")).rejects.toThrow("doesn't exist");
    });

    it("has a --model option, a write-protected option and the alias run", () => {
        expect(BOOT_COMMAND.spec.aliases).to.eql(["run"]);
        expect(BOOT_COMMAND.spec.options.map(o => o.name)).to.eql(["--model", "--write-protected"]);
    });

    it("picks the model from the DOS of each system disk, and says why", async () => {
        const cases: { createWords: string[], model: number, density: Density }[] = [
            { createWords: ["trsdos-2.3", "--system"], model: 1, density: Density.SINGLE },
            { createWords: ["trsdos-1.3", "--system"], model: 3, density: Density.DOUBLE },
            { createWords: ["ldos-5.3", "--system", "--model", "1"], model: 1, density: Density.SINGLE },
            { createWords: ["ldos-5.3", "--system"], model: 3, density: Density.DOUBLE },
            { createWords: ["trsdos-6.2", "--system"], model: 4, density: Density.DOUBLE },
            { createWords: ["lsdos-6.3", "--system"], model: 4, density: Density.DOUBLE },
        ];
        for (const { createWords, model, density } of cases) {
            fs.rmSync(imagePathname, { force: true });
            const session = await makeSession(...createWords);
            expect(session.floppy.getGeometry().modalDataDensity, createWords.join(" ")).to.equal(density);

            let ranModel = 0;
            fakeTerminal(async config => { ranModel = modelNumber(config); });
            const lines = await run(session, "boot");
            expect(ranModel, createWords.join(" ")).to.equal(model);
            expect(lines[0], createWords.join(" ")).to.contain("Booting on a Model " + model);
            vi.restoreAllMocks();
        }
    });

    it("lets --model override the DOS", async () => {
        const session = await makeSession("trsdos-2.3");
        let ranModel = 0;
        fakeTerminal(async config => { ranModel = modelNumber(config); });
        const lines = await run(session, "boot --model 4");
        expect(ranModel).to.equal(4);
        expect(lines[0]).to.contain("--model");
    });

    it("mounts the session's disk, not the file, and a change to it isn't in the file", async () => {
        const session = await makeSession("trsdos-2.3");
        saveAndReport(session, false);
        const fileBefore = fs.readFileSync(imagePathname);
        let mounted: FloppyDisk | undefined = undefined;
        fakeTerminal(async (_config, floppy) => {
            mounted = floppy;
            overwriteSector(floppy, 2, 0, 3);
        });
        await run(session, "boot");
        expect(mounted).to.equal(session.floppy);
        expect(session.hasChanges()).to.equal(true);
        expect(Buffer.from(fs.readFileSync(imagePathname)).equals(Buffer.from(fileBefore))).to.equal(true);
    });

    it("marks the session changed when the DOS writes, and undo takes the whole session back", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        saveAndReport(session, false);
        expect(session.hasChanges()).to.equal(false);
        const before = new Uint8Array(session.floppy.binary);

        fakeTerminal(async (config, floppy) => {
            const machine = new TestMachine(config, floppy);
            killTest1(machine);
        });
        const lines = await run(session, "boot");
        expect(lines.some(line => /^The disk was changed \(\d+ writes?\); "undo" takes it back\.$/.test(line)),
            lines.join("\n")).to.equal(true);
        expect(lines).to.contain("The emulator stopped.");

        expect(session.hasChanges()).to.equal(true);
        expect(fileNames(session)).to.not.contain("TEST1.CMD");
        expect(new Uint8Array(session.floppy.binary)).to.not.eql(before);

        const undoLines = await run(session, "undo");
        expect(undoLines).to.eql(["Undid \"boot\"."]);
        expect(session.hasChanges()).to.equal(false);
        expect(fileNames(session)).to.contain("TEST1.CMD");
        expect(new Uint8Array(session.floppy.binary)).to.eql(before);

        await run(session, "redo");
        expect(fileNames(session)).to.not.contain("TEST1.CMD");
    }, 60_000);

    it("decodes the file system again after the DOS wrote", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        const fileSystemBefore = session.fileSystem;
        fakeTerminal(async (_config, floppy) => {
            // Any write will do; the session must decode again whatever happened.
            overwriteSector(floppy, 3, 0, 0);
        });
        await run(session, "boot");
        expect(session.fileSystem).to.not.equal(fileSystemBefore);
        expect(session.fileSystem).to.not.equal(undefined);
    });

    it("leaves the session unchanged when the DOS doesn't write", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        saveAndReport(session, false);
        fakeTerminal(async () => {});
        const lines = await run(session, "boot");
        expect(lines.join("\n")).to.not.contain("was changed");
        expect(session.hasChanges()).to.equal(false);
        // Nothing to undo: no step was recorded for a boot that changed nothing.
        expect(await run(session, "undo")).to.eql(["Nothing to undo."]);
    });

    it("mounts write-protected with --write-protected, so that the DOS can't write", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        saveAndReport(session, false);
        let protectedWhenRun: boolean | undefined = undefined;
        fakeTerminal(async (_config, floppy) => {
            protectedWhenRun = floppy.isWriteProtected();
            // The emulator's controller checks before it writes, so a write-protected disk isn't written.
            if (!floppy.isWriteProtected()) {
                overwriteSector(floppy, 3, 0, 0);
            }
        });
        const lines = await run(session, "boot --write-protected");
        expect(protectedWhenRun).to.equal(true);
        expect(lines[1]).to.contain("write-protected");
        expect(lines.join("\n")).not.to.contain("marked write-protected");
        expect(session.hasChanges()).to.equal(false);

        // The mount doesn't outlast the boot: the session's own commands can write again.
        expect(session.floppy.isWriteProtected()).to.equal(false);
    });

    it("stays write-protected when the image says so, and says why", async () => {
        await runDisk("create", "trsdos-2.3", "--system");
        // The first byte of a DMK file is its write-protect flag.
        const binary = fs.readFileSync(imagePathname);
        binary[0] = 0xFF;
        fs.writeFileSync(imagePathname, binary);
        const session = openDiskSession(imagePathname);

        let protectedWhenRun: boolean | undefined = undefined;
        fakeTerminal(async (_config, floppy) => {
            protectedWhenRun = floppy.isWriteProtected();
        });
        const lines = await run(session, "boot");
        expect(protectedWhenRun).to.equal(true);
        expect(lines[2]).to.contain("marked write-protected");
    });

    it("is writable by default", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        let protectedWhenRun: boolean | undefined = undefined;
        fakeTerminal(async (_config, floppy) => {
            protectedWhenRun = floppy.isWriteProtected();
        });
        const lines = await run(session, "boot");
        expect(protectedWhenRun).to.equal(false);
        expect(lines[1]).to.contain("writable");
    });

    it("says in short lines what Ctrl-C does, depending on whether the disk shell is running", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        fakeTerminal(async () => {});
        const outside = await run(session, "boot");
        expect(outside.slice(0, 3)).to.eql([
            outside[0],
            "The disk is single density and writable.",
            "Ctrl-C stops it.",
        ]);
        expect(outside[0]).to.match(/^Booting on a Model 1 \(TRSDOS 2\.\S* is a Model I DOS\)\.$/);

        const events: string[] = [];
        session.shellTerminal = { release: () => events.push("release"), reacquire: () => events.push("reacquire") };
        const inShell = await run(session, "boot");
        expect(inShell[2]).to.equal("Ctrl-C returns to the disk shell.");
        for (const line of [...outside, ...inShell]) {
            expect(line.length).to.be.lessThan(90);
        }
    });

    it("hands the shell's terminal back and forth around the machine, even when it fails", async () => {
        const session = await makeSession("trsdos-2.3");
        const events: string[] = [];
        const shellTerminal: DiskShellTerminal = {
            release: () => events.push("release"),
            reacquire: () => events.push("reacquire"),
        };
        session.shellTerminal = shellTerminal;
        fakeTerminal(async () => { events.push("machine"); });
        const lines = await run(session, "boot");
        expect(events).to.eql(["release", "machine", "reacquire"]);
        expect(lines).to.contain("Back in the shell.");

        events.length = 0;
        vi.restoreAllMocks();
        fakeTerminal(async () => { throw new ToolError("no machine"); });
        await expect(run(session, "boot")).rejects.toThrow("no machine");
        expect(events).to.eql(["release", "reacquire"]);
    });

    it("works in a chain, and the next command sees the disk the DOS left", async () => {
        await runDisk("create", "trsdos-2.3", "--system");
        fakeTerminal(async (config, floppy) => {
            const machine = new TestMachine(config, floppy);
            killTest1(machine);
        });
        const lines = await runDisk("boot", ":", "dir");
        expect(lines.some(line => line.includes("The emulator stopped."))).to.equal(true);
        expect(lines.join("\n")).to.not.match(/TEST1/);
        expect(lines.join("\n")).to.match(/TEST2/);
        // The chain saved the change.
        expect(sessionInputFiles(openDiskSession(imagePathname), false).map(f => f.filename)).to.not.contain("TEST1.CMD");
    }, 60_000);

    it("doesn't drop doubled letters typed at the terminal on a Model I", async () => {
        const session = await makeSession("trsdos-2.3", "--system");
        const config = Config.makeDefault().edit()
            .withModelType(ModelType.MODEL1)
            .withBasicLevel(BasicLevel.LEVEL2)
            .build();
        const machine = new TestMachine(config, session.floppy);
        expect(machine.runUntilScreen("DOS READY", 20), machine.screen.text()).to.equal(true);
        machine.typeAtTerminal("LLLLOOOO");
        machine.runCycles(machine.trs80.clockHz/2);
        expect(machine.screen.text()).to.contain("LLLLOOOO");
    }, 60_000);
});
