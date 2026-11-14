import {TrsdosFormatDos} from "trs80-base";
import {createHardDisk, DiskSession, killFiles} from "trs80-disk";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {undo} from "./Actions.js";
import {boot, bootBlocker, describeBoot} from "./Booting.js";
import type {EmulatorRequest} from "./EmulatorPanel.js";
import {getFileRows} from "./FileRows.js";
import {OpenDisk} from "./OpenDisk.js";
import {TEMPLATES} from "./Templates.js";
import {makeBlankDisk, makeDiskWithFiles} from "./TestHelpers.js";

/** What the mocked emulator does while its panel is "open", set by each test. */
let runMachine: (request: EmulatorRequest) => void = () => {};

// The real panel needs a browser; this one runs the test's machine and closes at once.
vi.mock("./EmulatorPanel.js", () => ({
    runEmulator: async (request: EmulatorRequest): Promise<void> => runMachine(request),
}));

/**
 * Make an open hard disk with one LDOS partition.
 */
function makeHardDisk(): OpenDisk {
    const session = DiskSession.fromBinary("hard.hdv", undefined, {templates: TEMPLATES});
    createHardDisk(session, {dos: TrsdosFormatDos.LDOS_5_3, heads: 2, cylinders: 200, partitions: 1, model: undefined,
        name: undefined, date: undefined, force: false});
    return new OpenDisk(session, "hard.hdv");
}

/**
 * The names of the files on the disk, as it shows them.
 */
function names(session: DiskSession): string[] {
    return getFileRows(session, false).map(row => row.fullName);
}

describe("boot", () => {
    beforeEach(() => {
        runMachine = () => {};
    });

    it("records the DOS's writes as one change, which undo takes back", async () => {
        const disk = await makeDiskWithFiles();
        const session = disk.session;
        const historyLength = session.getHistory().entries.length;
        runMachine = request => {
            expect(request.floppies).to.eql([session.floppy]);
            request.onSettings(request.choice.model, false);
            // The "DOS" deletes a file, writing to the floppy in place.
            killFiles(session, ["HELLO/BAS"]);
        };

        const {commandLine, result} = await boot(disk, []);
        expect(commandLine).to.equal("boot");
        expect(result.writeCount).to.be.greaterThan(0);
        expect(names(session)).to.eql(["PROG/CMD"]);
        expect(session.getHistory().entries).to.have.length(historyLength + 1);
        expect(session.getHistory().entries.at(-1)).to.equal("boot");
        expect(describeBoot(result).at(-1)).to.contain("which Undo takes back");

        undo(session);
        expect(names(session)).to.eql(["HELLO/BAS", "PROG/CMD"]);
    });

    it("records nothing if the DOS didn't write", async () => {
        const disk = await makeDiskWithFiles();
        const historyLength = disk.session.getHistory().entries.length;
        const {result} = await boot(disk, []);
        expect(result.writeCount).to.equal(0);
        expect(disk.session.getHistory().entries).to.have.length(historyLength);
        expect(describeBoot(result).at(-1)).to.equal("The DOS didn't change the disk.");
    });

    it("labels the change with the model and write protection that the panel was set to", async () => {
        const disk = await makeDiskWithFiles();
        const session = disk.session;
        runMachine = request => {
            request.onSettings(4, false);
            killFiles(session, ["HELLO/BAS"]);
        };
        expect((await boot(disk, [])).commandLine).to.equal("boot --model 4");
        expect(session.getHistory().entries.at(-1)).to.equal("boot --model 4");

        runMachine = request => request.onSettings(request.choice.model, true);
        expect((await boot(disk, [])).commandLine).to.equal("boot --write-protected");
    });

    it("puts the other open floppies in drives 1 to 3, write-protected while it runs", async () => {
        const disk = await makeDiskWithFiles();
        const others = [await makeBlankDisk(), await makeBlankDisk(), await makeBlankDisk(), await makeBlankDisk()];
        const hard = makeHardDisk();
        runMachine = request => {
            expect(request.floppies).to.have.length(4);
            expect(request.floppies[0]).to.equal(disk.session.floppy);
            expect(request.floppies.slice(1).every(floppy => floppy.isWriteProtected())).to.equal(true);
        };

        const {result} = await boot(disk, [disk, hard, ...others]);
        expect(result.otherDrives).to.have.length(3);
        expect(others.every(other => !other.session.floppy.isWriteProtected())).to.equal(true);
    });

    it("boots only floppies", async () => {
        const hard = makeHardDisk();
        expect(bootBlocker(hard)).to.equal("Only a floppy can be booted, not a hard disk.");
        await expect(boot(hard, [])).rejects.toThrow("Only a floppy");
    });
});
